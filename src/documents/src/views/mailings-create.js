/**
 * Create group: the Envelopes and Labels dialogs, with live previews, and their option dialogs for
 * envelope and label main documents.
 */
import { el } from '../ui/dom.js';
import { dialog, field, select, input, textarea, checkbox, radios, button, printHtml, html } from './mailings-ui.js';
import { ENVELOPE_SIZES, LABEL_LAYOUTS, SHEETS, layoutProblems } from '../engine/mail-documents.js';

const IN = 1440, MM = 1440 / 25.4;
const RETURN_KEY = 'documents.mailings.returnAddress';
const LAYOUT_KEY = 'documents.mailings.labelLayout';
const ENVELOPE_KEY = 'documents.mailings.envelope';
const stored = key => { try { return localStorage.getItem(key); } catch { return null; } };
const store = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Private windows keep nothing. */ } };
const round = (n, d = 2) => String(Math.round(n * 10 ** d) / 10 ** d);
const SVG = 'http://www.w3.org/2000/svg';
const svg = (name, attrs = {}, ...children) => { const node = document.createElementNS(SVG, name); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v)); node.append(...children); return node; };

/** Default delivery-address position on an envelope (twips from the top-left corner). */
export const deliveryPosition = (width, height) => ({ left: Math.round(width * 0.42), top: Math.round(height * 0.46) });

/** A measurement input in inches. */
const inches = (twips, label, attrs = {}) => input(round(twips / IN, 3), { type: 'number', step: 'any', min: 0, max: 22, 'aria-label': `${label} (英寸)`, ...attrs });
const readInches = node => { const n = Number(node.value); if (!Number.isFinite(n) || n < 0) throw new Error('请输入正数作为度量值。'); return Math.round(n * IN); };

/**
 * Envelopes. mode 'create' offers Print, New Document and Add to Document; mode 'merge' (envelope
 * main documents) asks only for size and return address and calls onSubmit with the options.
 */
export function openEnvelopes({ mode = 'create', delivery: initialDelivery = '', onAdd, onNew, onSubmit }) {
  const saved = (() => { try { return JSON.parse(stored(ENVELOPE_KEY) || '{}'); } catch { return {}; } })();
  const size = select([...ENVELOPE_SIZES.map(s => [s.id, s.name]), ['custom', '自定义大小']], saved.size || 'us10', { 'aria-label': '信封大小' });
  const width = inches(ENVELOPE_SIZES[0].width, '宽度'), height = inches(ENVELOPE_SIZES[0].height, '高度');
  const delivery = textarea(initialDelivery, { 'aria-label': '收件人地址', rows: 5 });
  const returnAddress = textarea(stored(RETURN_KEY) || '', { 'aria-label': '寄件人地址', rows: 4 });
  const omit = checkbox('省略寄件人地址', !!saved.omit);
  const left = inches(0, '收件人地址距左'), top = inches(0, '收件人地址距顶');
  const fontSize = select([['10', '10 磅'], ['11', '11 磅'], ['12', '12 磅'], ['14', '14 磅']], saved.fontSize || '12', { 'aria-label': '字号' });
  const preview = svg('svg', { class: 'mm-envelope-preview', role: 'img', 'aria-label': '信封预览' });
  const dims = () => {
    const preset = ENVELOPE_SIZES.find(s => s.id === size.value);
    return preset ? { width: preset.width, height: preset.height } : { width: readInches(width), height: readInches(height) };
  };
  const resetPosition = () => { const d = dims(), p = deliveryPosition(d.width, d.height); left.value = round(p.left / IN, 3); top.value = round(p.top / IN, 3); };
  const onSize = () => {
    const preset = ENVELOPE_SIZES.find(s => s.id === size.value);
    width.disabled = height.disabled = !!preset;
    if (preset) { width.value = round(preset.width / IN, 3); height.value = round(preset.height / IN, 3); }
    resetPosition(); draw();
  };
  function draw() {
    let d; try { d = dims(); } catch { return; }
    const w = d.width / IN, h = d.height / IN, pt = Number(fontSize.value) / 72;
    const lines = (text, x, y, scale = 1) => String(text).split('\n').map((line, i) => svg('text', { x, y: y + (i + 1) * pt * 1.2 * scale, 'font-size': pt * scale }, line));
    const deliveryText = mode === 'merge' ? '«AddressBlock»' : delivery.value;
    let l = 0, t = 0; try { l = readInches(left) / IN; t = readInches(top) / IN; } catch { /* drawn when valid */ }
    preview.setAttribute('viewBox', `-0.1 -0.1 ${w + 0.2} ${h + 0.2}`);
    preview.replaceChildren(
      svg('rect', { x: 0, y: 0, width: w, height: h, rx: 0.05, class: 'mm-paper' }),
      svg('rect', { x: w - 0.95, y: 0.25, width: 0.7, height: 0.85, class: 'mm-stamp' }),
      ...(omit.input.checked ? [] : lines(returnAddress.value, 0.4, 0.3, 0.85)),
      ...lines(deliveryText, l, t));
  }
  for (const c of [delivery, returnAddress, left, top, width, height]) c.addEventListener('input', draw);
  for (const c of [fontSize]) c.addEventListener('change', draw);
  omit.input.addEventListener('change', () => { returnAddress.disabled = omit.input.checked; draw(); });
  size.addEventListener('change', onSize);
  for (const c of [width, height]) c.addEventListener('change', () => { resetPosition(); draw(); });
  returnAddress.disabled = omit.input.checked;
  onSize();
  const options = () => {
    const d = dims();
    if (d.width < 3 * IN || d.height < 2.5 * IN || d.width > 22 * IN || d.height > 22 * IN) throw new Error('信封尺寸必须介于 3 × 2½ 英寸与 22 × 22 英寸之间。');
    // The delivery address has to fit on the envelope's one page: placed too far right it wraps letter by
    // letter, too low it runs onto more pages (and an address past the bottom cannot be added at all).
    // One line more for the return address paragraph, which stays even when it is empty.
    const lines = (mode === 'merge' ? 4 : Math.max(1, delivery.value.trim().split('\n').length)) + 1;
    const maxLeft = d.width - 2.4 * IN, maxTop = d.height - 0.6 * IN - lines * Number(fontSize.value) * 1.3 / 72 * IN;
    if (readInches(left) > maxLeft || readInches(top) > maxTop) throw new Error(`请将收件人地址置于信封内：距左最多 ${round(Math.max(0, maxLeft) / IN)} 英寸，距顶最多 ${round(Math.max(0, maxTop) / IN)} 英寸。`);
    store(RETURN_KEY, returnAddress.value); store(ENVELOPE_KEY, JSON.stringify({ size: size.value, omit: omit.input.checked, fontSize: fontSize.value }));
    return { width: d.width, height: d.height, delivery: delivery.value, returnAddress: returnAddress.value, omitReturn: omit.input.checked, deliveryLeft: readInches(left), deliveryTop: readInches(top), fontSize: Number(fontSize.value) };
  };
  const requireDelivery = o => { if (mode === 'create' && !o.delivery.trim()) throw new Error('请输入收件人地址。'); return o; };
  const printEnvelope = () => {
    const o = requireDelivery(options()), w = o.width / IN, h = o.height / IN;
    const block = (text, x, y, size) => `<div class="block" style="left:${x}in;top:${y}in;font-size:${size}pt">${html(text)}</div>`;
    printHtml(`<div class="sheet">${o.omitReturn ? '' : block(o.returnAddress, 0.4, 0.3, o.fontSize - 2)}${block(o.delivery, o.deliveryLeft / IN, o.deliveryTop / IN, o.fontSize)}</div>`, { width: w, height: h, title: '信封' });
  };
  const body = [
    el('div.mm-two', {},
      el('div', {},
        mode === 'create' ? field('收件人地址', delivery) : el('p.field-hint', {}, '每个信封将从“地址块”字段获取收件人地址。'),
        field('寄件人地址', returnAddress), omit),
      el('div', {}, el('p.field-label', {}, '预览'), preview,
        el('div.mm-inline', {}, field('信封大小', size), field('字号', fontSize)),
        el('div.mm-inline', {}, field('宽度 (英寸)', width), field('高度 (英寸)', height)),
        el('div.mm-inline', {}, field('距左 (英寸)', left), field('距顶 (英寸)', top)),
        el('p.field-hint', {}, '打印将使用与信封尺寸相同的页面。请按照打印机手册说明放置信封，并在打印对话框提示时选择匹配的纸张大小。'))),
  ];
  if (mode === 'merge') return dialog({ title: '信封选项', size: 'xwide', submit: '确定', body, onSubmit: () => onSubmit(options()) });
  const modal = dialog({ title: '信封', size: 'xwide', submit: '添加到文档', body,
    actions: [button('打印…', () => { try { printEnvelope(); } catch (e) { modal.error(e.message); } }), button('新建文档', async () => { try { const o = requireDelivery(options()); modal.close(); await onNew(o); } catch (e) { modal.error(e.message); } })],
    onSubmit: () => onAdd(requireDelivery(options())) });
  return modal;
}

/** The label layout chooser with measurement details and a sheet preview. Returns { node, layout() }. */
function layoutPicker(onChange = () => {}, text = () => '') {
  const groups = Object.entries(SHEETS).map(([id, sheet]) => el('optgroup', { label: sheet.name }, ...LABEL_LAYOUTS.filter(l => l.sheet === id).map(l => el('option', { value: l.id }, l.name))));
  const choice = el('select.input', { 'aria-label': '标签纸' }, ...groups, el('option', { value: 'custom' }, '自定义尺寸'));
  choice.value = LABEL_LAYOUTS.some(l => l.id === stored(LAYOUT_KEY)) ? stored(LAYOUT_KEY) : 'letter-30';
  const sheet = select(Object.entries(SHEETS).map(([id, s]) => [id, s.name]), 'letter', { 'aria-label': '纸张大小' });
  const num = (label, attrs = {}) => input('', { type: 'number', step: 'any', min: 0, 'aria-label': label, ...attrs });
  const inputs = { width: num('标签宽度'), height: num('标签高度'), top: num('上边距'), left: num('侧边距'), pitchX: num('水平跨度'), pitchY: num('垂直跨度'), columns: num('横向数量', { step: 1, min: 1, max: 10 }), rows: num('纵向数量', { step: 1, min: 1, max: 40 }) };
  const unit = el('span.mm-unit');
  const preview = svg('svg', { class: 'mm-sheet-preview', role: 'img', 'aria-label': '标签纸预览' });
  let current = null, highlight = null;
  const scale = u => u === 'mm' ? MM : IN;
  const show = layout => {
    current = layout;
    const s = scale(layout.unit);
    for (const key of ['width', 'height', 'top', 'left', 'pitchX', 'pitchY']) inputs[key].value = round(layout[key] / s, layout.unit === 'mm' ? 2 : 4);
    inputs.columns.value = layout.columns; inputs.rows.value = layout.rows;
    sheet.value = layout.sheet; unit.textContent = layout.unit === 'mm' ? '度量单位为毫米' : '度量单位为英寸';
    draw();
  };
  const read = () => {
    const base = LABEL_LAYOUTS.find(l => l.id === choice.value) || current || LABEL_LAYOUTS[0];
    if (choice.value !== 'custom') return base;
    const s = scale(current?.unit || 'in');
    const layout = { id: 'custom', name: '自定义', unit: current?.unit || 'in', sheet: sheet.value, columns: Math.round(Number(inputs.columns.value)), rows: Math.round(Number(inputs.rows.value)) };
    for (const key of ['width', 'height', 'top', 'left', 'pitchX', 'pitchY']) layout[key] = Number(inputs[key].value) * s;
    return layout;
  };
  function draw() {
    let layout; try { layout = read(); } catch { return; }
    const page = SHEETS[layout.sheet] || SHEETS.letter, w = page.width / IN, h = page.height / IN;
    preview.setAttribute('viewBox', `-0.1 -0.1 ${w + 0.2} ${h + 0.2}`);
    const rects = [];
    for (let r = 0; r < Math.min(layout.rows, 40); r++) for (let c = 0; c < Math.min(layout.columns, 10); c++) {
      const on = highlight && highlight.row === r + 1 && highlight.column === c + 1;
      const x = (layout.left + c * layout.pitchX) / IN, y = (layout.top + r * layout.pitchY) / IN, lw = layout.width / IN, lh = layout.height / IN;
      rects.push(svg('rect', { x, y, width: lw, height: lh, rx: Math.min(0.08, lh / 6), class: on ? 'mm-label is-on' : 'mm-label' }));
      // The label's text, to scale, where it will print.
      const lines = (highlight && !on) ? [] : String(text() || '').split('\n').filter(Boolean).slice(0, 6);
      const size = Math.min(10 / 72, lh / Math.max(lines.length, 1) / 1.3);
      lines.forEach((line, i) => rects.push(svg('text', { x: x + 0.06, y: y + (lh - lines.length * size * 1.2) / 2 + (i + 0.85) * size * 1.2, 'font-size': size, class: 'mm-label-text' }, line.slice(0, 60))));
    }
    preview.replaceChildren(svg('rect', { x: 0, y: 0, width: w, height: h, class: 'mm-paper' }), ...rects);
    onChange(layout);
  }
  choice.addEventListener('change', () => { if (choice.value !== 'custom') show(LABEL_LAYOUTS.find(l => l.id === choice.value)); else draw(); });
  for (const node of [...Object.values(inputs), sheet]) node.addEventListener('input', () => { choice.value = 'custom'; draw(); });
  sheet.addEventListener('change', () => { choice.value = 'custom'; draw(); });
  show(LABEL_LAYOUTS.find(l => l.id === choice.value) || LABEL_LAYOUTS[0]);
  const details = el('details.mm-details', {}, el('summary', {}, '度量值'), unit,
    el('div.mm-measure-grid', {}, field('纸张大小', sheet), field('标签宽度', inputs.width), field('标签高度', inputs.height), field('上边距', inputs.top), field('侧边距', inputs.left),
      field('水平跨度', inputs.pitchX), field('垂直跨度', inputs.pitchY), field('横向数量', inputs.columns), field('纵向数量', inputs.rows)),
    el('p.field-hint', {}, '跨度是从一个标签的起始位置到下一个标签起始位置的距离。'));
  return {
    node: el('div.mm-layout', {}, field('标签纸', choice), details), preview,
    layout() { const layout = read(); const problems = layoutProblems(layout); if (problems.length) throw new Error(problems[0]); if (choice.value !== 'custom') store(LAYOUT_KEY, choice.value); return layout; },
    highlight(spot) { highlight = spot; draw(); },
  };
}

/**
 * Labels. mode 'create': address text, full page or one label, Print and New Document.
 * mode 'merge': layout only (Label Options), then onSubmit(layout).
 */
export function openLabels({ mode = 'create', address: initial = '', onNew, onSubmit }) {
  const address = textarea(initial, { 'aria-label': '地址', rows: 5 });
  const useReturn = checkbox('使用寄件人地址');
  const which = radios('打印', [['full', '整页相同标签'], ['single', '单个标签']], 'full', () => sync());
  const row = input('1', { type: 'number', min: 1, max: 40, 'aria-label': '行' }), column = input('1', { type: 'number', min: 1, max: 10, 'aria-label': '列' });
  const picker = layoutPicker(layout => { row.max = layout.rows; column.max = layout.columns; }, () => address.value);
  address.addEventListener('input', () => sync());
  const fontSize = select([['8', '8 磅'], ['9', '9 磅'], ['10', '10 磅'], ['11', '11 磅'], ['12', '12 磅'], ['14', '14 磅']], '10', { 'aria-label': '字号' });
  function sync() {
    row.disabled = column.disabled = which.value !== 'single';
    picker.highlight(which.value === 'single' ? { row: Number(row.value), column: Number(column.value) } : null);
  }
  for (const c of [row, column]) c.addEventListener('input', sync);
  useReturn.input.addEventListener('change', () => { if (useReturn.input.checked) address.value = stored(RETURN_KEY) || ''; sync(); });
  sync();
  if (mode === 'merge') return dialog({ title: '标签选项', size: 'xwide', body: [el('div.mm-two', {}, el('div', {}, picker.node, field('字号', fontSize)), el('div', {}, el('p.field-label', {}, '预览'), picker.preview))],
    onSubmit: () => onSubmit(picker.layout(), { fontSize: Number(fontSize.value) }) });
  const options = () => {
    const layout = picker.layout();
    if (!address.value.trim()) throw new Error('请输入标签文本。');
    const single = which.value === 'single' ? { row: Number(row.value), column: Number(column.value) } : null;
    if (single && (single.row < 1 || single.row > layout.rows || single.column < 1 || single.column > layout.columns)) throw new Error(`请选择 1 到 ${layout.rows} 行以及 1 到 ${layout.columns} 列。`);
    return { layout, text: address.value, single, fontSize: Number(fontSize.value) };
  };
  const print = () => {
    const o = options(), page = SHEETS[o.layout.sheet] || SHEETS.letter, blocks = [];
    for (let r = 0; r < o.layout.rows; r++) for (let c = 0; c < o.layout.columns; c++) {
      if (o.single && (o.single.row !== r + 1 || o.single.column !== c + 1)) continue;
      const x = (o.layout.left + c * o.layout.pitchX) / IN, y = (o.layout.top + r * o.layout.pitchY) / IN;
      blocks.push(`<div class="block" style="left:${x + 0.06}in;top:${y}in;width:${o.layout.width / IN - 0.12}in;height:${o.layout.height / IN}in;display:flex;align-items:center;font-size:${o.fontSize}pt"><div>${html(o.text)}</div></div>`);
    }
    printHtml(`<div class="sheet">${blocks.join('')}</div>`, { width: page.width / IN, height: page.height / IN, title: '标签' });
  };
  const modal = dialog({ title: '标签', size: 'xwide', submit: '新建文档', body: [
    el('div.mm-two', {},
      el('div', {}, field('地址', address), useReturn, el('p.field-label', {}, '打印'), which, el('div.mm-inline', {}, field('行', row), field('列', column)), field('字号', fontSize)),
      el('div', {}, picker.node, el('p.field-label', {}, '预览'), picker.preview)),
  ], actions: [button('打印…', () => { try { print(); } catch (e) { modal.error(e.message); } })], onSubmit: () => onNew(options()) });
  return modal;
}
