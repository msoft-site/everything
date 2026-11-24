import { el, isComposing, amountInRange } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { commandIconEl } from '../ui/ribbon.js';
import { drawingParts } from '../engine/drawing-format.js';
import { writeFrame, setTransform, child, make, A, WP } from '../engine/drawing-xml.js';
import { EMU_PER_PX } from '../engine/images.js';

/**
 * The Layout dialog (Size and Position): Position (horizontal and vertical alignment or offsets and
 * their reference frames, move with text, lock anchor, allow overlap, layout in table cell), Text
 * Wrapping (style, sides, distances from text) and Size (height, width, rotation, scale, aspect lock).
 * Everything applies as one edit of the drawing; a combination the document cannot hold is reported
 * in the dialog and nothing changes.
 */
const IN = 914400;
const inches = emu => Math.round(emu / IN * 100) / 100;
const WRAPS = [['inline', '嵌入型', 'wrapInline'], ['square', '四周型环绕', 'wrapSquare'], ['tight', '紧密型环绕', 'wrapTight'], ['through', '穿越型环绕', 'wrapThrough'], ['topAndBottom', '上下型环绕', 'wrapTopBottom'], ['behind', '衬于文字下方', 'behindText'], ['front', '浮于文字上方', 'inFront']];
let ids = 0;

export function openLayoutDialog({ engine, image, describe, tab = 'position', kind, inTableCell = false, apply, frameOf, offsetsFor, place, onClose }) {
  const info = describe(image) || {};
  const frame = info.frame || { inline: !image.anchor };
  const laidOut = image.anchor ? frameOf() : null;
  const formattable = ['picture', 'shape', 'textBox', 'group'].includes(kind);
  const error = el('p.field-error', { role: 'alert', hidden: true });
  const id = () => `pic-layout-${++ids}`;
  const labelled = (text, control) => { control.id ||= id(); return el('label.pic-field', { htmlFor: control.id }, el('span', {}, text), control); };
  const num = (value, attrs = {}) => el('input.input.pic-number', { type: 'number', step: 0.01, value, ...attrs });
  const choice = (options, value, attrs = {}) => el('select.input', attrs, ...options.map(([v, label]) => el('option', { value: v, selected: v === value }, label)));
  const radio = (name, value, checked, text) => { const input = el('input', { type: 'radio', name, value, checked, id: id() }); return { input, node: el('label.pic-radio', { htmlFor: input.id }, input, text) }; };

  /* ---- Text Wrapping ---- */
  const currentWrap = frame.inline ? 'inline' : frame.wrap?.type === 'none' ? (frame.behind ? 'behind' : 'front') : frame.wrap?.type || 'front';
  const wrapGroup = `pic-wrap-${++ids}`;
  const wrapRadios = WRAPS.map(([value, label, icon]) => {
    // Drawings in table cells do not wrap text yet.
    const unavailable = inTableCell && ['square', 'tight', 'through', 'topAndBottom'].includes(value) && value !== currentWrap;
    const input = el('input', { type: 'radio', name: wrapGroup, value, checked: value === currentWrap, id: id(), disabled: !formattable && ['tight', 'through'].includes(value) || unavailable });
    return { value, input, node: el('label.pic-wrap-choice', { htmlFor: input.id, ...(unavailable ? { title: '暂不支持表格单元格' } : {}) }, input, commandIconEl(icon, 32), el('span', {}, label)) };
  });
  const wrapValue = () => wrapRadios.find(r => r.input.checked)?.value || currentWrap;
  const sideGroup = `pic-side-${++ids}`;
  const sides = [['bothSides', '两边'], ['left', '仅左侧'], ['right', '仅右侧'], ['largest', '仅最大一侧']].map(([value, label]) => radio(sideGroup, value, (frame.wrap?.side || 'bothSides') === value, label));
  const d = frame.wrap?.distances || { T: 0, B: 0, L: 114300, R: 114300 };
  const distance = Object.fromEntries(['T', 'B', 'L', 'R'].map(side => [side, num(inches(d[side] ?? 0), { min: 0, max: 22, 'aria-label': `距正文${{ T: '上', B: '下', L: '左', R: '右' }[side]} (英寸)` })]));
  const wrapping = el('div.pic-layout-tab', { role: 'tabpanel', 'aria-label': '文字环绕' },
    el('fieldset.pic-fieldset', {}, el('legend', {}, '环绕方式'), el('div.pic-wrap-grid', {}, ...wrapRadios.map(r => r.node))),
    el('fieldset.pic-fieldset', {}, el('legend', {}, '换行文字'), el('div.pic-radios.is-row', {}, ...sides.map(s => s.node))),
    el('fieldset.pic-fieldset', {}, el('legend', {}, '距正文 (英寸)'), el('div.pic-grid-2', {},
      labelled('上', distance.T), labelled('左', distance.L), labelled('下', distance.B), labelled('右', distance.R))));

  /* ---- Position ---- */
  const h = frame.horizontal || { relativeFrom: 'column', offset: 0 }, v = frame.vertical || { relativeFrom: 'paragraph', offset: 0 };
  const hGroup = `pic-h-${++ids}`, vGroup = `pic-v-${++ids}`;
  // Aligned axes show their current place as an offset too, so switching keeps the object where it is.
  const offsetOf = axis => {
    const value = axis === 'x' ? h : v;
    if (value.offset !== undefined) return value.offset;
    if (!laidOut) return 0;
    const at = offsetsFor(laidOut, laidOut.x, laidOut.y);
    return axis === 'x' ? at.x : at.y;
  };
  const inlinePlace = frame.inline ? place?.() || { x: 0, y: 0 } : null;
  const hAlignRadio = radio(hGroup, 'align', !h.align, '对齐方式'), hAbsRadio = radio(hGroup, 'offset', !h.align, '绝对位置');
  const hAlign = choice([['left', '左对齐'], ['center', '居中'], ['right', '右对齐']], h.align || 'left', { 'aria-label': '水平对齐方式' });
  const hAlignFrom = choice([['margin', '页边距'], ['page', '页面'], ['column', '栏']], h.align ? h.relativeFrom : 'column', { 'aria-label': '水平对齐基准' });
  const hOffset = num(inches(inlinePlace ? inlinePlace.x : offsetOf('x')), { min: -22, max: 22, 'aria-label': '水平绝对位置 (英寸)' });
  const hOffsetFrom = choice([['column', '栏'], ['margin', '页边距'], ['page', '页面']], h.align ? 'column' : h.relativeFrom, { 'aria-label': '水平位置基准' });
  const vAlignRadio = radio(vGroup, 'align', !v.align, '对齐方式'), vAbsRadio = radio(vGroup, 'offset', !v.align, '绝对位置');
  const vAlign = choice([['top', '顶端对齐'], ['center', '居中'], ['bottom', '底端对齐']], v.align || 'top', { 'aria-label': '垂直对齐方式' });
  const vAlignFrom = choice([['margin', '页边距'], ['page', '页面'], ['topMargin', '顶端边距'], ['bottomMargin', '底端边距']], v.align ? v.relativeFrom : 'margin', { 'aria-label': '垂直对齐基准' });
  const vOffset = num(inches(inlinePlace ? inlinePlace.y : offsetOf('y')), { min: -22, max: 22, 'aria-label': '垂直绝对位置 (英寸)' });
  const vOffsetFrom = choice([['paragraph', '段落'], ['line', '行'], ['margin', '页边距'], ['page', '页面']], v.align ? 'paragraph' : v.relativeFrom, { 'aria-label': '垂直位置基准' });
  // An offset left as shown (rounded to 0.01 in) keeps its exact value, so OK does not nudge the object.
  const shownOffsets = inlinePlace ? null : { h: hOffset.value, hFrom: hOffsetFrom.value, x: offsetOf('x'), v: vOffset.value, vFrom: vOffsetFrom.value, y: offsetOf('y') };
  const offsetValue = axis => {
    const [input, from] = axis === 'x' ? [hOffset, hOffsetFrom] : [vOffset, vOffsetFrom];
    const kept = shownOffsets && input.value === shownOffsets[axis === 'x' ? 'h' : 'v'] && from.value === shownOffsets[axis === 'x' ? 'hFrom' : 'vFrom'];
    return kept ? shownOffsets[axis] : emu(input);
  };
  const optionBox = (label, checked) => { const input = el('input', { type: 'checkbox', checked, id: id() }); return { input, node: el('label.pic-check', { htmlFor: input.id }, input, label) }; };
  const moveWithText = optionBox('对象随文字移动', !frame.inline ? ['paragraph', 'line'].includes(v.relativeFrom) : true);
  const lockAnchor = optionBox('锁定标记', !frame.locked);
  const allowOverlap = optionBox('允许重叠', frame.allowOverlap !== false);
  const layoutInCell = optionBox('在表格单元格中版式', frame.layoutInCell !== false);
  moveWithText.input.addEventListener('change', () => {
    // Fixed on the page: measure from the page instead of the paragraph.
    if (!moveWithText.input.checked && ['paragraph', 'line'].includes(vOffsetFrom.value)) vOffsetFrom.value = 'page';
    if (moveWithText.input.checked && !['paragraph', 'line'].includes(vOffsetFrom.value)) vOffsetFrom.value = 'paragraph';
    convertVertical();
  });
  // Changing what an offset measures from keeps the object where it is on the page.
  let lastVerticalFrom = vOffsetFrom.value, lastHorizontalFrom = hOffsetFrom.value;
  function convertVertical() {
    if (!laidOut || vOffsetFrom.value === lastVerticalFrom) return;
    const at = offsetsFor({ ...laidOut, image: { ...laidOut.image, anchor: { ...laidOut.image.anchor, vertical: vOffsetFrom.value } } }, laidOut.x, laidOut.y);
    vOffset.value = String(inches(at.y)); lastVerticalFrom = vOffsetFrom.value;
  }
  vOffsetFrom.addEventListener('change', () => { moveWithText.input.checked = ['paragraph', 'line'].includes(vOffsetFrom.value); convertVertical(); });
  function convertHorizontal() {
    if (!laidOut || hOffsetFrom.value === lastHorizontalFrom) return;
    const at = offsetsFor({ ...laidOut, image: { ...laidOut.image, anchor: { ...laidOut.image.anchor, horizontal: hOffsetFrom.value } } }, laidOut.x, laidOut.y);
    hOffset.value = String(inches(at.x)); lastHorizontalFrom = hOffsetFrom.value;
  }
  hOffsetFrom.addEventListener('change', convertHorizontal);
  const position = el('div.pic-layout-tab', { role: 'tabpanel', 'aria-label': '位置' },
    el('fieldset.pic-fieldset', {}, el('legend', {}, '水平'),
      el('div.pic-position-row', {}, hAlignRadio.node, hAlign, el('span.pic-hint', {}, '相对于'), hAlignFrom),
      el('div.pic-position-row', {}, hAbsRadio.node, el('span.pic-number-wrap', {}, hOffset, el('span.pic-unit', {}, '英寸')), el('span.pic-hint', {}, '相对于'), hOffsetFrom)),
    el('fieldset.pic-fieldset', {}, el('legend', {}, '垂直'),
      el('div.pic-position-row', {}, vAlignRadio.node, vAlign, el('span.pic-hint', {}, '相对于'), vAlignFrom),
      el('div.pic-position-row', {}, vAbsRadio.node, el('span.pic-number-wrap', {}, vOffset, el('span.pic-unit', {}, '英寸')), el('span.pic-hint', {}, '相对于'), vOffsetFrom)),
    el('fieldset.pic-fieldset', {}, el('legend', {}, '选项'), el('div.pic-grid-2', {}, moveWithText.node, allowOverlap.node, lockAnchor.node, layoutInCell.node)),
    el('p.pic-hint.pic-position-note', {}));
  const positionNote = position.querySelector('.pic-position-note');

  /* ---- Size ---- */
  const width = num(inches(image.width), { min: 0.01, max: 22, 'aria-label': '宽度 (英寸)' }), height = num(inches(image.height), { min: 0.01, max: 22, 'aria-label': '高度 (英寸)' });
  const rotation = num(Math.round((info.transform?.rotation ?? (image.rotation || 0) / 60000) * 10) / 10, { min: -3600, max: 3600, step: 'any', 'aria-label': '旋转 (度)' });
  // The fields show rounded values; an untouched field keeps the exact size and rotation behind it.
  const shown = { width: width.value, height: height.value, rotation: rotation.value };
  const scaleW = num(100, { min: 1, max: 1000, step: 1, 'aria-label': '缩放宽度 (%)' }), scaleH = num(100, { min: 1, max: 1000, step: 1, 'aria-label': '缩放高度 (%)' });
  const lock = optionBox('锁定纵横比', image.aspectLocked !== false && (kind === 'picture' || !image.aspectLocked));
  const ratio = image.width / image.height;
  width.addEventListener('input', () => { if (lock.input.checked && Number(width.value) > 0) height.value = String(Math.round(Number(width.value) / ratio * 100) / 100); scaleW.value = String(Math.round(Number(width.value) * IN / image.width * 100)); if (lock.input.checked) scaleH.value = scaleW.value; });
  height.addEventListener('input', () => { if (lock.input.checked && Number(height.value) > 0) width.value = String(Math.round(Number(height.value) * ratio * 100) / 100); scaleH.value = String(Math.round(Number(height.value) * IN / image.height * 100)); if (lock.input.checked) scaleW.value = scaleH.value; });
  scaleW.addEventListener('input', () => { width.value = String(inches(image.width * Number(scaleW.value) / 100)); if (lock.input.checked) { scaleH.value = scaleW.value; height.value = String(inches(image.height * Number(scaleW.value) / 100)); } });
  scaleH.addEventListener('input', () => { height.value = String(inches(image.height * Number(scaleH.value) / 100)); if (lock.input.checked) { scaleW.value = scaleH.value; width.value = String(inches(image.width * Number(scaleH.value) / 100)); } });
  // A picture with a style (outline, shadow, 3D frame) is a drawing whose scene holds the picture itself.
  const scenePicture = node => !node ? null : node.image?.assetId && ['picture', 'picture3d'].includes(node.type) ? node.image.assetId : (node.children || []).map(scenePicture).find(Boolean) || null;
  const pictureAsset = image.retainedDrawing && scenePicture(engine.model?.assets?.[image.assetId]?.scene) || image.assetId;
  const source = engine.images?.get(pictureAsset), pixels = source?.bitmap || source;
  const original = kind === 'picture' && pixels?.width ? { width: pixels.width * EMU_PER_PX, height: pixels.height * EMU_PER_PX } : null;
  const resetSize = el('button.btn.btn-outline.btn-sm', { type: 'button', disabled: !original, onclick: () => { width.value = String(inches(original.width)); height.value = String(inches(original.height)); scaleW.value = scaleH.value = '100'; rotation.value = '0'; } }, '重置');
  const size = el('div.pic-layout-tab', { role: 'tabpanel', 'aria-label': '大小' },
    el('fieldset.pic-fieldset', {}, el('legend', {}, '大小'), el('div.pic-grid-2', {}, labelled('高度 (英寸)', height), labelled('宽度 (英寸)', width))),
    el('fieldset.pic-fieldset', {}, el('legend', {}, '旋转'), labelled('旋转 (°)', rotation)),
    el('fieldset.pic-fieldset', {}, el('legend', {}, '缩放'), el('div.pic-grid-2', {}, labelled('高度 (%)', scaleH), labelled('宽度 (%)', scaleW)), lock.node),
    original ? el('fieldset.pic-fieldset', {}, el('legend', {}, '原始尺寸'), el('div.pic-position-row', {}, el('span', {}, `高度: ${inches(original.height)}″   宽度: ${inches(original.width)}″`), resetSize)) : null);

  /* ---- Tabs ---- */
  const panels = { position, wrapping, size };
  const tabList = el('div.pic-dialog-tabs', { role: 'tablist', 'aria-label': '版式' });
  const tabButtons = [['position', '位置'], ['wrapping', '文字环绕'], ['size', '大小']].map(([key, label]) => {
    const button = el('button.pic-dialog-tab', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { tab: key }, onclick: () => select(key) }, label);
    tabList.append(button); return button;
  });
  tabList.addEventListener('keydown', e => {
    const at = tabButtons.indexOf(document.activeElement); if (at < 0 || isComposing(e)) return;
    const next = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : null;
    if (next !== null) { e.preventDefault(); const b = tabButtons[(next + 3) % 3]; b.focus(); select(b.dataset.tab); }
  });
  function select(key) {
    for (const b of tabButtons) { const on = b.dataset.tab === key; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
    for (const [name, panel] of Object.entries(panels)) panel.hidden = name !== key;
  }
  function sync() {
    const mode = wrapValue(), floating = mode !== 'inline', wrapped = ['square', 'tight', 'through', 'topAndBottom'].includes(mode), sided = ['square', 'tight', 'through'].includes(mode);
    for (const control of position.querySelectorAll('input, select')) control.disabled = !floating || !formattable;
    // Wrapped objects are measured from the column and paragraph; only floating ones can align or fix to the page.
    if (wrapped) {
      hAbsRadio.input.checked = vAbsRadio.input.checked = true;
      for (const control of [hAlignRadio.input, vAlignRadio.input, hAlign, hAlignFrom, vAlign, vAlignFrom, moveWithText.input]) control.disabled = true;
      if (sided || mode === 'topAndBottom') {
        hOffsetFrom.value = 'column'; vOffsetFrom.value = 'paragraph'; hOffsetFrom.disabled = vOffsetFrom.disabled = true;
        // Measured from the column and paragraph now, the offsets change so the object stays where it is.
        convertHorizontal(); convertVertical();
      }
      moveWithText.input.checked = true;
      allowOverlap.input.disabled = layoutInCell.input.disabled = true;
    }
    positionNote.textContent = !floating ? '嵌入型对象会随文字移动。选择其他环绕方式以调整其位置。'
      : wrapped ? '采用文字环绕的对象按所属的栏和段落进行定位。' : '';
    for (const r of sides) r.input.disabled = !sided;
    distance.T.disabled = distance.B.disabled = !(sided || mode === 'front' || mode === 'behind');
    distance.L.disabled = distance.R.disabled = !floating;
  }
  for (const r of wrapRadios) r.input.addEventListener('change', sync);
  for (const r of [hAlignRadio, hAbsRadio, vAlignRadio, vAbsRadio]) r.input.addEventListener('change', sync);

  /* ---- Apply ---- */
  const emu = input => Math.round(Number(input.value) * IN);
  async function submit(e) {
    e.preventDefault();
    error.hidden = true;
    const form = e.target;
    // The arrows step by hundredths, but any amount in range is taken, as Page Setup takes it (1.125 in).
    for (const input of form.querySelectorAll('input[type=number]:not(:disabled)')) if (!amountInRange(input)) {
      // Show the tab holding the field, so the browser can point at it.
      const tab = Object.entries(panels).find(([, panel]) => panel.contains(input))?.[0];
      if (tab) select(tab);
      input.reportValidity(); return;
    }
    const mode = wrapValue();
    const spec = mode === 'inline' ? { inline: true } : {
      horizontal: hAlignRadio.input.checked && !hAlignRadio.input.disabled ? { relativeFrom: hAlignFrom.value, align: hAlign.value } : { relativeFrom: hOffsetFrom.value, offset: offsetValue('x') },
      vertical: vAlignRadio.input.checked && !vAlignRadio.input.disabled ? { relativeFrom: vAlignFrom.value, align: vAlign.value } : { relativeFrom: vOffsetFrom.value, offset: offsetValue('y') },
      wrap: { type: mode === 'behind' || mode === 'front' ? 'none' : mode, side: sides.find(s => s.input.checked)?.input.value || 'bothSides',
        distances: { T: mode === 'topAndBottom' ? 0 : emu(distance.T), B: mode === 'topAndBottom' ? 0 : emu(distance.B), L: emu(distance.L), R: emu(distance.R) } },
      behind: mode === 'behind', locked: lockAnchor.input.checked,
      ...(mode === 'front' || mode === 'behind' ? { allowOverlap: allowOverlap.input.checked, layoutInCell: layoutInCell.input.checked } : { allowOverlap: true, layoutInCell: true }),
      ...(frame.inline ? { order: Math.max(0, ...engine.model.paragraphs.flatMap(p => p.runs).filter(r => r.image?.anchor).map(r => r.image.anchor.order || 0)) + 1 } : {}),
    };
    const nextWidth = width.value === shown.width ? image.width : emu(width), nextHeight = height.value === shown.height ? image.height : emu(height), turn = Number(rotation.value);
    try {
    await apply(async drawing => {
      writeFrame(drawing, spec);
      const after = drawingParts(drawing);
      if (nextWidth !== image.width || nextHeight !== image.height) {
        const extent = child(after.frame, WP, 'extent');
        extent.setAttribute('cx', String(nextWidth)); extent.setAttribute('cy', String(nextHeight));
        const ext = child(child(after.properties, A, 'xfrm'), A, 'ext');
        if (ext) { ext.setAttribute('cx', String(nextWidth)); ext.setAttribute('cy', String(nextHeight)); }
      }
      if (after.properties && rotation.value !== shown.rotation && Math.abs(turn - (info.transform?.rotation || 0)) > 0.001) setTransform(after.properties, { rotation: turn });
      // Aspect lock (§20.1.2.2.19 graphicFrameLocks noChangeAspect).
      let locks = child(after.frame, WP, 'cNvGraphicFramePr');
      if (!locks) { locks = make(drawing.ownerDocument, WP, 'cNvGraphicFramePr'); after.frame.insertBefore(locks, child(after.frame, A, 'graphic')); }
      let frameLocks = child(locks, A, 'graphicFrameLocks');
      if (lock.input.checked) { if (!frameLocks) { frameLocks = make(drawing.ownerDocument, A, 'graphicFrameLocks'); frameLocks.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:a', A); locks.append(frameLocks); } frameLocks.setAttribute('noChangeAspect', '1'); }
      else if (frameLocks) { frameLocks.removeAttribute('noChangeAspect'); if (!frameLocks.attributes.length || [...frameLocks.attributes].every(a => a.name.startsWith('xmlns'))) frameLocks.remove(); }
      // A picture's own lock follows the frame's.
      const picLocks = after.picture?.getElementsByTagNameNS(A, 'picLocks')[0];
      if (picLocks) { if (lock.input.checked) picLocks.setAttribute('noChangeAspect', '1'); else picLocks.removeAttribute('noChangeAspect'); }
    }, 'Layout');
      modal.close();
    } catch (failure) {
      error.textContent = /pictures with|drawing|floating|unsupported|could not be created/i.test(failure.message) && !/Select|changed/.test(failure.message)
        ? '该对象不支持此位置和环绕方式组合。请尝试其他环绕方式或位置。' : failure.message;
      error.hidden = false;
    }
  }
  const content = el('form.pic-layout-dialog', { noValidate: true, onsubmit: submit }, tabList, position, wrapping, size, error,
    !formattable ? el('p.pic-hint', {}, '此对象保留自身的版式设置；仅可在“自动换行”菜单中更改其环绕方式。') : null,
    el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit', disabled: !formattable }, '确定')));
  const modal = openModal({ title: '版式', content, wide: true, onClose });
  select(tab === 'wrapping' ? 'wrapping' : tab === 'size' ? 'size' : 'position');
  sync();
  queueMicrotask(() => tabButtons.find(b => b.getAttribute('aria-selected') === 'true')?.focus());
  return modal;
}
