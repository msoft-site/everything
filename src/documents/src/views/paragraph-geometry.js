import { el } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { normalizeTabStops, validateIndent, sameValue } from '../engine/paragraph-geometry.js';
import { TAB_LEADERS } from '../engine/tab-leaders.js';

/** Exact imported twips survive an untouched display value. Blank mixed fields remain unchanged. */
export function openParagraphGeometry(format, defaultTabStop, apply) {
  const originals = new WeakMap();
  const distance = (label, value, { required = false, min = -22 } = {}) => {
    const text = value == null ? '' : String(Number((value / 1440).toFixed(5)));
    const input = el('input.input', { type: 'number', step: 'any', min, max: 22, required, value: text, placeholder: value == null ? '多种' : '', 'aria-label': `${label} (英寸)` });
    originals.set(input, { text, value });
    return input;
  };
  const read = input => input.value === originals.get(input).text ? originals.get(input).value : input.value === '' ? null : Math.round(Number(input.value) * 1440);
  const field = (label, input) => el('label.field', {}, el('span.field-label', {}, label), input);
  const left = distance('左侧缩进', format.indentLeft), right = distance('右侧缩进', format.indentRight);
  const by = distance('缩进值', format.firstLine == null ? null : Math.abs(format.firstLine), { min: 0 });
  const special = el('select.input', { 'aria-label': '特殊格式', onchange: () => {
    by.disabled = !special.value || special.value === 'none';
    by.required = !by.disabled;
    if (by.required && by.value === '') by.value = '0.5';
  } }, ...[['', '多种 — 保持不变'], ['none', '(无)'], ['firstLine', '首行缩进'], ['hanging', '悬挂缩进']].map(([value, label]) => el('option', { value }, label)));
  special.value = format.firstLine == null ? '' : format.firstLine < 0 ? 'hanging' : format.firstLine > 0 ? 'firstLine' : 'none';
  by.disabled = !special.value || special.value === 'none';
  by.required = !by.disabled;
  const interval = distance('默认制表位间隔', defaultTabStop, { required: true, min: 1 / 1440 });
  const error = el('p.field-error', { role: 'alert', hidden: true });
  const rows = [], list = el('div.canvas-tab-list');
  let tabsChanged = false;
  const empty = el('p.field-hint', {}, format.tabs === null ? '选定内容中的制表位不一致。添加或清除制表位将应用于每个选定的段落。' : '无自定义制表位。制表位将使用默认间距和悬挂缩进。');
  const refresh = () => {
    list.replaceChildren(...rows.map((row, i) => {
      row.position.setAttribute('aria-label', `制表位 ${i + 1} 位置 (英寸)`);
      row.alignment.setAttribute('aria-label', `制表位 ${i + 1} 对齐方式`);
      row.leader.setAttribute('aria-label', `制表位 ${i + 1} 前导符`);
      row.remove.setAttribute('aria-label', `删除制表位 ${i + 1}`);
      return row.el;
    }));
    empty.hidden = rows.length > 0;
  };
  const TAB_ALIGN_NAMES = { left: '左对齐', center: '居中', right: '右对齐', decimal: '小数点对齐' };
  const add = stop => {
    const position = distance('制表位位置', stop.position, { required: true });
    const alignment = el('select.input', {}, ...['left', 'center', 'right', 'decimal'].map(value => el('option', { value, selected: value === stop.alignment }, TAB_ALIGN_NAMES[value])));
    const leader = el('select.input', {}, ...Object.entries(TAB_LEADERS).map(([value, label]) => el('option', { value, selected: value === (stop.leader || 'none') }, label)));
    const row = { position, alignment, leader, numberingOnly: stop.numberingOnly };
    row.remove = el('button.icon-btn', { type: 'button', title: '删除制表位', onclick: () => {
      tabsChanged = true; rows.splice(rows.indexOf(row), 1); refresh();
      (rows[0]?.position || addButton).focus();
    } }, iconEl('trash', 18));
    row.el = el('div.canvas-tab-row', {}, position, alignment, leader, row.remove);
    position.addEventListener('input', () => { tabsChanged = true; });
    alignment.addEventListener('change', () => { tabsChanged = true; row.numberingOnly = false; });
    leader.addEventListener('change', () => { tabsChanged = true; });
    rows.push(row); refresh();
    return position;
  };
  const addButton = el('button.btn.btn-ghost', { type: 'button', onclick: () => {
    tabsChanged = true;
    const last = Math.max(0, ...rows.map(row => read(row.position) || 0));
    add({ position: Math.min(31680, last + 720), alignment: 'left' }).focus();
  } }, iconEl('plus', 16), '添加制表位');
  for (const tab of format.tabs || []) add(tab);
  const content = el('form.canvas-geometry-form', { onsubmit: e => {
    e.preventDefault();
    try {
      const patch = {};
      for (const [key, input] of [['indentLeft', left], ['indentRight', right]]) {
        const value = read(input);
        if (value !== null && value !== format[key]) patch[key] = validateIndent(value);
      }
      if (special.value) {
        const value = special.value === 'none' ? 0 : read(by) * (special.value === 'hanging' ? -1 : 1);
        if (value !== format.firstLine) patch.firstLine = validateIndent(value);
      }
      if (tabsChanged) {
        const tabs = normalizeTabStops(rows.map(row => ({ position: read(row.position), alignment: row.alignment.value, leader: row.leader.value, ...(row.numberingOnly ? { numberingOnly: true } : {}) })));
        if (!sameValue(tabs, format.tabs)) patch.tabs = tabs;
      }
      if (apply(patch, read(interval)) === false) throw new Error('这些设置无法适应当前文本。请调整缩进或制表位。');
      modal.close();
    } catch (e) { error.textContent = e.message; error.hidden = false; }
  } },
  el('section', {}, el('h3.canvas-dialog-heading', {}, '缩进'),
    el('div.canvas-page-fields', {}, field('左侧缩进 (英寸)', left), field('右侧缩进 (英寸)', right), field('特殊格式', special), field('磅值/距离 (英寸)', by)),
    field('默认制表位间隔 (英寸) · 整个文档', interval)),
  el('section', {}, el('h3.canvas-dialog-heading', {}, '制表位'),
  el('div.canvas-tab-head', { 'aria-hidden': 'true' }, el('span', {}, '位置 (英寸)'), el('span', {}, '对齐方式'), el('span', {}, '前导符')),
  list, empty,
  el('div.row', {}, addButton, el('button.btn.btn-ghost', { type: 'button', onclick: () => {
    tabsChanged = true; rows.length = 0; empty.textContent = '自定义制表位将被清除。默认间距和悬挂缩进仍将适用。'; refresh();
  } }, '全部清除'))),
  el('p.field-hint', {}, '缩进和自定义制表位应用于选定的段落。制表位位置从文本边距开始计算。小数点对齐使用英文句点。'),
  error, el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '应用')));
  const modal = openModal({ title: '缩进和制表位', content, wide: true, onClose: () => {
    const root = modal.panel.closest('.modal-root');
    root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true');
  } });
  modal.panel.classList.add('canvas-geometry-dialog');
  return modal;
}
