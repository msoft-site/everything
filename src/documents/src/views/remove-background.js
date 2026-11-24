import '../styles/remove-background.css';
import { el, isComposing } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { removeBackground, downsample } from '../engine/picture-processing.js';

/**
 * Picture Format → Remove Background. The picture is shown with the part that will be removed tinted;
 * the subject area box, brush marks (keep / remove) and the sensitivity refine it live on a reduced
 * preview, and Keep Changes computes the full-resolution mask.
 *
 * openRemoveBackground({ image: { data, width, height }, initial: { keep, remove, sensitivity, region },
 *   onApply({ mask, marks: { keep, remove, sensitivity, region } }), onCancel }) → { close }
 */
const PREVIEW_PIXELS = 400000;
const DEFAULT_REGION = { left: 0.08, top: 0.08, right: 0.92, bottom: 0.92 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function openRemoveBackground({ image, initial = {}, onApply, onCancel }) {
  const pixels = image.width * image.height;
  const preview = pixels > PREVIEW_PIXELS ? downsample(image, Math.sqrt(PREVIEW_PIXELS / pixels)) : image;
  const { width, height } = preview, side = Math.min(width, height);
  // Every mark in drawing order; keep and remove lists are derived from it.
  const marks = [...(initial.keep || []).map(m => ({ ...m, kind: 'keep' })), ...(initial.remove || []).map(m => ({ ...m, kind: 'remove' }))];
  let region = { ...DEFAULT_REGION, ...(initial.region || {}) };
  let sensitivity = clamp(initial.sensitivity ?? 0.5, 0, 1);
  let tool = 'keep', brush = 0.025, mask = null, timer = 0, finished = false, stroke = null;

  /* ---- Canvas layers ---- */
  const base = new OffscreenCanvas(width, height);
  base.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(preview.data), width, height), 0, 0);
  const tint = new OffscreenCanvas(width, height);
  const canvas = el('canvas.rb-canvas', { width, height, role: 'img', 'aria-label': '图片预览。着色区域将被删除。' });
  const ctx = canvas.getContext('2d');
  // Small pictures are shown larger, so marks can be drawn precisely; CSS still keeps them within the dialog.
  const enlarge = Math.max(1, Math.min(4, 360 / Math.max(width, height)));
  if (enlarge > 1) canvas.style.width = `${Math.round(width * enlarge)}px`;

  const status = el('p.rb-status', { 'aria-live': 'polite' }, '正在寻找背景…');
  const corner = name => el('button.rb-handle', { type: 'button', dataset: { corner: name }, 'aria-label': `从${{ nw: '左上', ne: '右上', sw: '左下', se: '右下' }[name]}角调整主体区域大小`,
    onpointerdown: e => dragRegion(e, name), onkeydown: e => nudgeRegion(e, name) });
  const mover = el('button.rb-move', { type: 'button', 'aria-label': '移动主体区域', title: '主体区域：拖动以移动', onpointerdown: e => dragRegion(e, 'move'), onkeydown: e => nudgeRegion(e, 'move') }, '主体区域');
  const regionBox = el('div.rb-region', {}, mover, ...['nw', 'ne', 'sw', 'se'].map(corner));
  const stage = el('div.rb-stage', {}, el('div.rb-stage-inner', {}, canvas, regionBox));

  const toolButton = (id, label, hint) => el('button.btn.btn-outline.rb-tool', { type: 'button', 'aria-pressed': String(tool === id), dataset: { tool: id, swatch: id }, title: hint,
    onclick: () => { tool = id; for (const b of tools.querySelectorAll('.rb-tool')) b.setAttribute('aria-pressed', String(b.dataset.tool === id)); canvas.dataset.tool = id; } }, el('span.rb-swatch', { 'aria-hidden': 'true' }), label);
  const undoMark = el('button.btn.btn-ghost', { type: 'button', disabled: !marks.length, onclick: () => { marks.pop(); changed(); } }, '撤销标记');
  const tools = el('div.rb-tools', { role: 'group', 'aria-label': '优化' },
    toolButton('keep', '标记要保留的区域', '在图片上涂抹以保留相应部分'),
    toolButton('remove', '标记要删除的区域', '在图片上涂抹以删除相应部分'),
    toolButton('erase', '删除标记', '在标记上拖动以将其删除'),
    undoMark);
  canvas.dataset.tool = tool;
  const sensitivityInput = el('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(sensitivity * 100), 'aria-label': '灵敏度',
    oninput: () => { sensitivity = Number(sensitivityInput.value) / 100; schedule(); } });
  const brushInput = el('input', { type: 'range', min: 5, max: 80, step: 1, value: Math.round(brush * 1000), 'aria-label': '画笔大小',
    oninput: () => { brush = Number(brushInput.value) / 1000; } });
  const settings = el('div.rb-settings', {},
    el('label.rb-slider', {}, el('span', {}, '灵敏度'), sensitivityInput),
    el('label.rb-slider', {}, el('span', {}, '画笔大小'), brushInput));
  const keepButton = el('button.btn.btn-primary', { type: 'button', onclick: apply }, '保留更改');
  const discardButton = el('button.btn.btn-outline', { type: 'button', onclick: () => modal.close() }, '放弃所有更改');
  const content = el('div.ed-dialog-body.rb-body', {},
    el('p.field-hint', {}, '将主体区域框移至要保留的内容周围，然后标记遗漏的任何部分。'),
    tools, stage, settings, status,
    el('div.modal-actions', {}, discardButton, keepButton));

  const modal = openModal({ title: '删除背景', content, wide: true, onClose: () => { clearTimeout(timer); if (!finished) { finished = true; onCancel?.(); } } });
  modal.panel.classList.add('rb-dialog');

  /* ---- Drawing ---- */
  function paint() {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(base, 0, 0);
    if (mask) ctx.drawImage(tint, 0, 0);
    ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
    for (const mark of [...marks, ...(stroke && stroke.kind !== 'erase' ? [stroke] : [])]) {
      ctx.strokeStyle = mark.kind === 'keep' ? 'rgba(0, 160, 70, 0.75)' : 'rgba(215, 30, 40, 0.75)';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = Math.max(1, mark.radius * side * 2);
      const points = mark.points.map(([x, y]) => [x * width, y * height]);
      if (points.length === 1) { ctx.beginPath(); ctx.arc(points[0][0], points[0][1], ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    }
    ctx.restore();
    Object.assign(regionBox.style, { left: `${region.left * 100}%`, top: `${region.top * 100}%`, width: `${(region.right - region.left) * 100}%`, height: `${(region.bottom - region.top) * 100}%` });
  }
  function compute() {
    const keep = marks.filter(m => m.kind === 'keep'), remove = marks.filter(m => m.kind === 'remove');
    const result = removeBackground(preview, { keep, remove, sensitivity, region });
    mask = result.mask;
    const layer = new ImageData(width, height);
    let removed = 0;
    for (let i = 0; i < mask.length; i++) {
      const away = 255 - mask[i]; removed += away;
      // Removed pixels are tinted magenta; kept ones are left clear.
      layer.data[i * 4] = 205; layer.data[i * 4 + 1] = 0; layer.data[i * 4 + 2] = 160; layer.data[i * 4 + 3] = Math.round(away * 0.62);
    }
    tint.getContext('2d').putImageData(layer, 0, 0);
    status.textContent = `将删除图片中约 ${Math.round(removed / 255 / mask.length * 100)}% 的区域。`;
    paint();
  }
  function schedule(delay = 120) {
    clearTimeout(timer);
    timer = setTimeout(() => { try { compute(); } catch (e) { status.textContent = e.message; } }, delay);
  }
  function changed() { undoMark.disabled = !marks.length; paint(); schedule(); }

  /* ---- Marks ---- */
  const toImage = e => { const r = canvas.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
  const eraseAt = ([x, y]) => {
    const before = marks.length;
    for (let i = marks.length - 1; i >= 0; i--) {
      const reach = marks[i].radius + brush;
      if (marks[i].points.some(([px, py]) => Math.hypot((px - x) * width, (py - y) * height) / side <= reach)) marks.splice(i, 1);
    }
    return marks.length !== before;
  };
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    if (tool === 'erase') { if (eraseAt(toImage(e))) changed(); stroke = { kind: 'erase' }; return; }
    stroke = { kind: tool, radius: brush, points: [toImage(e)] }; paint();
  });
  canvas.addEventListener('pointermove', e => {
    if (!stroke) return;
    if (stroke.kind === 'erase') { if (eraseAt(toImage(e))) changed(); return; }
    const point = toImage(e), last = stroke.points.at(-1);
    if (Math.hypot((point[0] - last[0]) * width, (point[1] - last[1]) * height) >= 2) { stroke.points.push(point); paint(); }
  });
  const finishStroke = () => {
    if (!stroke) return;
    const done = stroke; stroke = null;
    if (done.kind !== 'erase') { marks.push(done); changed(); }
  };
  canvas.addEventListener('pointerup', finishStroke);
  canvas.addEventListener('pointercancel', () => { stroke = null; paint(); });

  /* ---- Subject area ---- */
  function setRegion(next) {
    const minimum = 0.05;
    next.left = clamp(next.left, 0, 1 - minimum); next.top = clamp(next.top, 0, 1 - minimum);
    next.right = clamp(next.right, next.left + minimum, 1); next.bottom = clamp(next.bottom, next.top + minimum, 1);
    region = next; paint(); schedule();
  }
  function move(start, mode, dx, dy) {
    const next = { ...start };
    if (mode === 'move') {
      const w = start.right - start.left, h = start.bottom - start.top;
      next.left = clamp(start.left + dx, 0, 1 - w); next.top = clamp(start.top + dy, 0, 1 - h);
      next.right = next.left + w; next.bottom = next.top + h;
    } else {
      if (mode.includes('w')) next.left = start.left + dx; else next.right = start.right + dx;
      if (mode.includes('n')) next.top = start.top + dy; else next.bottom = start.bottom + dy;
    }
    setRegion(next);
  }
  function dragRegion(e, mode) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const target = e.currentTarget, rect = canvas.getBoundingClientRect(), start = { ...region }, x0 = e.clientX, y0 = e.clientY;
    target.setPointerCapture(e.pointerId);
    const onMove = m => move(start, mode, (m.clientX - x0) / rect.width, (m.clientY - y0) / rect.height);
    const onUp = () => { target.removeEventListener('pointermove', onMove); target.removeEventListener('pointerup', onUp); target.removeEventListener('pointercancel', onUp); };
    target.addEventListener('pointermove', onMove); target.addEventListener('pointerup', onUp); target.addEventListener('pointercancel', onUp);
  }
  function nudgeRegion(e, mode) {
    if (isComposing(e)) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!delta) return;
    e.preventDefault();
    move({ ...region }, mode, ...delta);
  }

  /* ---- Finish ---- */
  function apply() {
    if (finished) return;
    keepButton.disabled = discardButton.disabled = true;
    keepButton.textContent = '正在处理…';
    clearTimeout(timer);
    // Let the button repaint before the full-resolution pass.
    setTimeout(() => {
      try {
        const keep = marks.filter(m => m.kind === 'keep').map(({ kind, ...m }) => m), remove = marks.filter(m => m.kind === 'remove').map(({ kind, ...m }) => m);
        const full = removeBackground(image, { keep, remove, sensitivity, region }).mask;
        finished = true;
        modal.close();
        onApply?.({ mask: full, marks: { keep, remove, sensitivity, region: { ...region } } });
      } catch (error) {
        keepButton.disabled = discardButton.disabled = false; keepButton.textContent = '保留更改';
        status.textContent = error.message;
      }
    }, 30);
  }

  paint();
  schedule(0);
  return { close: () => modal.close() };
}
