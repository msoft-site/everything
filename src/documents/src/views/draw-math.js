/**
 * Ink to Math: write an equation by hand (or start from ink selected with the lasso), have local AI
 * read the picture as an equation in linear format, check and correct it against a live preview, and
 * insert it through the Insert tab's equation path.
 */
import { el } from '../ui/dom.js';
import { formDialog } from './insert-dialogs.js';
import { filterPoints, unionBounds, strokeBounds, PX_PER_MM } from '../engine/ink-geometry.js';
import { paintStroke } from './draw-surface.js';
import { linearToOmml } from '../engine/math-linear.js';
import { ommlToMathml } from '../engine/omml-mathml.js';

const PAD_WIDTH = 520, PAD_HEIGHT = 200;

/** Scale strokes to fit a box with a margin, keeping their proportions. */
function fitStrokes(strokes, width, height, margin = 16) {
  if (!strokes.length) return [];
  const b = unionBounds(strokes.map(strokeBounds));
  const scale = Math.min((width - 2 * margin) / Math.max(1, b.width), (height - 2 * margin) / Math.max(1, b.height), 3);
  const ox = (width - b.width * scale) / 2 - b.left * scale, oy = (height - b.height * scale) / 2 - b.top * scale;
  return strokes.map(s => ({ ...s, tool: 'pen', color: '000000', width: Math.max(1.5, s.width * scale), points: s.points.map(p => ({ x: p.x * scale + ox, y: p.y * scale + oy, p: p.p })) }));
}

export function openInkMath({ strokes: initial = [], recognize, onInsert, onClose }) {
  let strokes = fitStrokes(initial, PAD_WIDTH, PAD_HEIGHT), current = null, busy = false;
  const pad = el('canvas.draw-math-pad', { width: PAD_WIDTH, height: PAD_HEIGHT, 'aria-label': '书写区域：使用触控笔、手指或鼠标在此书写公式', role: 'img' });
  const ratio = window.devicePixelRatio || 1;
  pad.width = PAD_WIDTH * ratio; pad.height = PAD_HEIGHT * ratio;
  const paint = () => {
    const ctx = pad.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, pad.width, pad.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    for (const s of strokes) paintStroke(ctx, s);
    if (current) paintStroke(ctx, current);
  };
  const point = e => { const r = pad.getBoundingClientRect(); return { x: (e.clientX - r.left) * PAD_WIDTH / r.width, y: (e.clientY - r.top) * PAD_HEIGHT / r.height, p: e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5 }; };
  let raw = [];
  pad.addEventListener('pointerdown', e => { e.preventDefault(); pad.setPointerCapture(e.pointerId); raw = [point(e)]; current = { tool: 'pen', color: '000000', width: 0.6 * PX_PER_MM * 2, points: raw.slice() }; paint(); });
  pad.addEventListener('pointermove', e => { if (!current) return; for (const s of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]) raw.push(point(s)); current.points = filterPoints(raw); paint(); });
  const end = () => { if (!current) return; strokes.push(current); current = null; paint(); };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);

  const input = el('textarea.input.draw-math-input', { rows: 2, 'aria-label': '识别的公式', spellcheck: false, placeholder: '公式将显示在此处；插入前可进行修改。' });
  const preview = el('div.insert-equation-preview.draw-math-preview', { 'aria-live': 'polite' });
  const status = el('span.field-hint', { 'aria-live': 'polite' });
  const render = () => {
    const text = input.value.trim();
    if (!text) { preview.replaceChildren(el('span.field-hint', {}, '在上方书写公式，然后点击“识别”。')); return; }
    try { preview.innerHTML = ommlToMathml(linearToOmml(text, { display: true })); } catch { preview.textContent = text; }
  };
  input.addEventListener('input', render);
  const clear = el('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { strokes = []; paint(); } }, '清除');
  const undo = el('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { strokes.pop(); paint(); } }, '撤消笔划');
  const read = el('button.btn.btn-outline.btn-sm', { type: 'button', onclick: async () => {
    if (busy) return;
    if (!strokes.length) { status.textContent = '请先书写公式。'; return; }
    busy = true; read.disabled = true; status.textContent = '正在识别手写公式…';
    try { input.value = await recognize(pad.toDataURL('image/png')); render(); status.textContent = '请检查公式，然后插入。'; input.focus(); }
    catch (e) { status.textContent = e.message || String(e); }
    finally { busy = false; read.disabled = false; }
  } }, '识别');
  const dialog = formDialog({ title: '将墨迹转换为数学公式', submit: '插入', wide: true, className: 'draw-math', onClose, content: [
    el('div.draw-math-pad-wrap', {}, pad),
    el('div.row.draw-math-tools', {}, read, undo, clear, status),
    el('label.field-label', {}, '公式'), input,
    el('div', {}, el('span.field-label', {}, '预览'), preview)],
  onSubmit: () => {
    const text = input.value.trim();
    if (!text) throw new Error('请先识别手写内容或输入公式。');
    onInsert(text);
  } });
  paint(); render();
  if (strokes.length) read.click();
  return dialog.modal;
}
