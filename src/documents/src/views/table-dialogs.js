// Dialogs of the table commands: Insert Table, Convert Text to Table, Convert
// Table to Text, Split Cells, Insert/Delete Cells, Sort, Formula and the style
// editor. Each one collects choices, previews where it helps, and hands them to
// `apply`; a thrown error stays in the dialog so the choice can be corrected.
import { el, fieldId, amountInRange } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';

const field = (label, control, hint) => {
  const id = control.id || (control.id = fieldId('table'));
  return el('div.field', {}, el('label.field-label', { for: id }, label), control, hint && el('span.field-hint', {}, hint));
};
const number = (label, value, { min = 1, max = 32, step = 1 } = {}) => el('input.input', { type: 'number', min, max, step, value, required: true, 'aria-label': label });
const select = (label, options, value) => el('select.input', { 'aria-label': label }, ...options.map(([v, text]) => el('option', { value: v, selected: v === value }, text)));
function radios(name, label, options, value, onChange) {
  const group = el('fieldset.table-radios', { 'aria-label': label }, el('legend.field-label', {}, label));
  for (const [v, text, extra] of options) {
    const input = el('input', { type: 'radio', name, value: v, checked: v === value, onchange: () => onChange?.(v) });
    group.append(el('label.table-radio', {}, input, el('span', {}, text), extra || null));
  }
  group.value = () => group.querySelector('input:checked')?.value;
  return group;
}

/** A form dialog: `submit` returns false or throws to keep it open with a message. */
export function formDialog({ title, body, submit, onClose, wide = false, ok = '确定', className = '' }) {
  const error = el('p.field-error', { role: 'alert', hidden: true });
  let modal;
  const form = el('form.table-dialog', { onsubmit: e => {
    e.preventDefault();
    try {
      if (submit() === false) throw new Error('无法以该方式修改表格。');
      modal.close();
    } catch (err) { error.textContent = err.message; error.hidden = false; }
  } }, ...body, error,
  el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, ok)));
  modal = openModal({ title, content: form, wide, onClose: () => {
    const root = modal.panel.closest('.modal-root'); root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true'); onClose?.();
  } });
  if (className) modal.panel.classList.add(className);
  queueMicrotask(() => form.querySelector('input:not([type=radio]):not([type=checkbox]), select, input:checked')?.focus());
  return { modal, form, error };
}

/* ---- Insert Table ---- */

const REMEMBER_KEY = 'documents.insertTable';
export function rememberedTableSize() {
  try { const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null'); if (saved && saved.rows >= 1 && saved.columns >= 1) return saved; } catch { /* storage may be unavailable */ }
  return null;
}

/** Insert Table: size, AutoFit behavior, and whether to remember them for next time. */
export function openInsertTableDialog(apply, { onClose } = {}) {
  const saved = rememberedTableSize() || { rows: 2, columns: 5, autofit: 'fixed', width: '' };
  const columns = number('列数', saved.columns), rows = number('行数', saved.rows, { max: 500 });
  const width = el('input.input', { type: 'number', min: 0.1, max: 22, step: 0.01, value: saved.width || '', placeholder: '自动', 'aria-label': '固定列宽 (英寸)' });
  const autofit = radios('table-autofit', '“自动调整”操作', [['fixed', '固定列宽', width], ['contents', '根据内容调整表格'], ['window', '根据窗口调整表格']], saved.autofit || 'fixed', v => { width.disabled = v !== 'fixed'; preview(); });
  width.disabled = (saved.autofit || 'fixed') !== 'fixed';
  const remember = el('input', { type: 'checkbox', checked: !!rememberedTableSize() });
  const sketch = el('div.table-dialog-preview', { 'aria-hidden': 'true' });
  function preview() {
    const c = Math.max(1, Math.min(12, Number(columns.value) || 1)), r = Math.max(1, Math.min(8, Number(rows.value) || 1));
    sketch.style.gridTemplateColumns = `repeat(${c}, 1fr)`;
    sketch.dataset.autofit = autofit.value();
    sketch.replaceChildren(...Array.from({ length: c * r }, () => el('span')));
  }
  columns.addEventListener('input', preview); rows.addEventListener('input', preview); preview();
  // The fields are checked on OK, with the message in words: the width's arrows step by hundredths, but any width
  // in range is taken, as Word takes 1.125 in.
  const dialog = formDialog({ title: '插入表格', onClose, className: 'table-insert-dialog', body: [
    el('div.table-dialog-grid', {}, field('列数', columns), field('行数', rows)),
    autofit, sketch,
    el('label.table-check', {}, remember, '为新表格记忆此尺寸'),
  ], submit: () => {
    const choice = { rows: Number(rows.value), columns: Number(columns.value), autofit: autofit.value(), width: autofit.value() === 'fixed' && width.value ? Number(width.value) : null };
    if (!Number.isInteger(choice.rows) || !Number.isInteger(choice.columns) || choice.rows < 1 || choice.columns < 1 || choice.columns > 32 || choice.rows > 500) throw new Error('请选择 1–32 列和 1–500 行。');
    if (choice.width !== null && !amountInRange(width)) throw new Error('请输入 0.1 到 22 英寸之间的列宽，或留空表示“自动”。');
    try { if (remember.checked) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ ...choice, width: choice.width ?? '' })); else localStorage.removeItem(REMEMBER_KEY); } catch { /* storage may be unavailable */ }
    return apply(choice);
  } });
  dialog.form.noValidate = true;
  return dialog;
}

/* ---- Converting ---- */

function separatorChoice(name, label, value, onChange, paragraphLabel = '段落标记') {
  const other = el('input.input.table-other', { type: 'text', maxLength: 1, value: '-', 'aria-label': '其他字符', oninput: () => onChange?.() });
  const group = radios(name, label, [['paragraph', paragraphLabel], ['tab', '制表符'], ['comma', '逗号'], ['other', '其他字符', other]], value, () => onChange?.());
  return { group, other };
}

/** Convert Text to Table: separator, columns (counted from the text), AutoFit. */
export function openConvertTextDialog({ shape, separator = 'tab' }, apply, { onClose } = {}) {
  const columns = number('列数', 1), rowsText = el('output.table-dialog-count', {});
  let touched = false;
  const update = () => {
    try {
      const s = shape(choice.group.value(), choice.other.value);
      if (!touched) columns.value = s.columns;
      columns.min = choice.group.value() === 'paragraph' ? 1 : s.columns;
      const rows = choice.group.value() === 'paragraph' ? Math.ceil(s.rows / Math.max(1, Number(columns.value) || 1)) : s.rows;
      rowsText.textContent = `${rows} 行`;
    } catch (e) { rowsText.textContent = e.message; }
  };
  const choice = separatorChoice('table-separator', '文字分隔位置', separator, () => { touched = false; update(); });
  columns.addEventListener('input', () => { touched = true; update(); });
  const autofit = radios('convert-autofit', '“自动调整”操作', [['fixed', '固定列宽'], ['contents', '根据内容调整表格'], ['window', '根据窗口调整表格']], 'fixed');
  update();
  return formDialog({ title: '将文字转换成表格', onClose, body: [
    el('div.table-dialog-grid', {}, field('列数', columns), el('div.field', {}, el('span.field-label', {}, '行数'), rowsText)), choice.group, autofit,
  ], submit: () => apply({ separator: choice.group.value(), other: choice.other.value, columns: Number(columns.value), autofit: autofit.value() }) });
}

/** Convert Table to Text: what separates the cells' text. */
export function openConvertTableDialog(apply, { onClose } = {}) {
  const choice = separatorChoice('table-to-text', '文字分隔符', 'tab', null, '段落标记');
  return formDialog({ title: '表格转换成文本', onClose, body: [choice.group, el('p.field-hint', {}, '每一行将成为一个段落；选择段落标记时，每个单元格将作为独立段落保留。')],
    submit: () => apply({ separator: choice.group.value(), other: choice.other.value }) });
}

/* ---- Cells ---- */

export function openSplitCellsDialog({ several = false } = {}, apply, { onClose } = {}) {
  const columns = number('列数', 2), rows = number('行数', 1);
  const merge = el('input', { type: 'checkbox', checked: true });
  return formDialog({ title: '拆分单元格', onClose, body: [
    el('div.table-dialog-grid', {}, field('列数', columns), field('行数', rows)),
    several && el('label.table-check', {}, merge, '拆分前合并单元格'),
  ], submit: () => apply({ rows: Number(rows.value), columns: Number(columns.value), merge: !several || merge.checked }) });
}

export function openCellsDialog(kind, apply, { onClose } = {}) {
  const options = kind === 'delete'
    ? [['left', '单元格左移'], ['up', '单元格上移'], ['row', '删除整行'], ['column', '删除整列']]
    : [['right', '活动单元格右移'], ['down', '活动单元格下移'], ['row', '插入整行'], ['column', '插入整列']];
  const group = radios(`cells-${kind}`, kind === 'delete' ? '删除后操作' : '插入后操作', options, options[kind === 'delete' ? 0 : 1][0]);
  return formDialog({ title: kind === 'delete' ? '删除单元格' : '插入单元格', onClose, body: [group], submit: () => apply(group.value()) });
}

/* ---- Sort ---- */

/** Sort: up to three keys over the table's columns. `columns`: [{ label, column }]. */
export function openSortDialog({ columns, header }, apply, { onClose } = {}) {
  const keyRow = (index, value) => {
    const by = select(`${index === 0 ? '主要关键字' : '次要关键字'}`, [...(index ? [['', '(无)']] : []), ...columns.map(c => [String(c.column), c.label])], value);
    const type = select('类型', [['text', '拼音/笔画/文本'], ['number', '数字'], ['date', '日期']], 'text');
    const order = select('排序方式', [['asc', '升序'], ['desc', '降序']], 'asc');
    return { by, type, order, node: el('div.table-sort-key', {}, el('span.field-label', {}, index === 0 ? '主要关键字' : '次要关键字'), by, type, order) };
  };
  const keys = [keyRow(0, String(columns[0]?.column ?? 0)), keyRow(1, ''), keyRow(2, '')];
  const hasHeader = radios('sort-header', '我的列表', [['yes', '有标题行'], ['no', '无标题行']], header ? 'yes' : 'no', v => relabel(v === 'yes'));
  const caseSensitive = el('input', { type: 'checkbox' });
  function relabel(on) {
    for (const key of keys) for (const option of key.by.options) {
      const c = columns.find(c => String(c.column) === option.value);
      if (c) option.textContent = on && c.header ? c.header : c.label;
    }
  }
  relabel(header);
  return formDialog({ title: '排序', onClose, wide: true, className: 'table-sort-dialog', body: [...keys.map(k => k.node), hasHeader, el('label.table-check', {}, caseSensitive, '区分大小写')],
    submit: () => apply({ header: hasHeader.value() === 'yes', caseSensitive: caseSensitive.checked,
      keys: keys.filter(k => k.by.value !== '').map(k => ({ column: Number(k.by.value), type: k.type.value, descending: k.order.value === 'desc' })) }) });
}

/* ---- Formula ---- */

/** Formula: the expression, a number format and a function to paste, with the result previewed as you type. */
export function openFormulaDialog({ suggested, formats, functions, preview }, apply, { onClose } = {}) {
  const formula = el('input.input.table-formula', { type: 'text', value: suggested, required: true, spellcheck: false, 'aria-label': '公式', autocomplete: 'off' });
  const listId = fieldId('formats');
  const format = el('input.input', { type: 'text', 'aria-label': '数字格式', placeholder: '常规', list: listId, spellcheck: false });
  const datalist = el('datalist', { id: listId }, ...formats.map(f => el('option', { value: f })));
  const paste = select('粘贴函数', [['', '粘贴函数…'], ...functions.map(f => [f, f])], '');
  paste.addEventListener('change', () => {
    if (!paste.value) return;
    const at = formula.selectionStart ?? formula.value.length, insert = `${paste.value}()`;
    formula.value = formula.value.slice(0, at) + insert + formula.value.slice(formula.selectionEnd ?? at);
    formula.focus(); formula.setSelectionRange(at + insert.length - 1, at + insert.length - 1);
    paste.value = ''; show();
  });
  const result = el('output.table-formula-result', { 'aria-live': 'polite' });
  function show() {
    try { result.textContent = `计算结果: ${preview(formula.value, format.value)}`; result.classList.remove('is-error'); }
    catch (e) { result.textContent = e.message; result.classList.add('is-error'); }
  }
  formula.addEventListener('input', show); format.addEventListener('input', show); show();
  return formDialog({ title: '公式', onClose, className: 'table-formula-dialog', body: [
    field('公式', formula, '方位: ABOVE, BELOW, LEFT, RIGHT。单元格: A1, B2:C4。'), result,
    el('div.table-dialog-grid', {}, field('数字格式', format), field('粘贴函数', paste)), datalist,
  ], submit: () => apply(formula.value, format.value.trim() || null) });
}
