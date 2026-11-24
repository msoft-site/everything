import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { CELL_ALIGNMENTS } from '../engine/cell-alignment.js';

export function openCellAlignment(value, apply, onClose) {
  const choices = [['mixed', '多种对齐方式 — 保持不变'], ['inherit', '继承自表格样式'], ...Object.entries(CELL_ALIGNMENTS)];
  const select = el('select.input', { 'aria-label': '单元格垂直对齐方式' }, ...choices.map(([id, label]) => el('option', { value: id, selected: id === (value ?? 'mixed'), disabled: id === 'mixed' }, label)));
  const original = select.value, error = el('p.field-error', { role: 'alert', hidden: true });
  const content = el('form', { onsubmit: e => {
    e.preventDefault();
    try {
      if (select.value !== original && apply(select.value === 'inherit' ? null : select.value) === false) throw new Error('无法应用单元格对齐方式。');
      modal.close();
    } catch (e) { error.textContent = e.message; error.hidden = false; }
  } }, el('label.field', {}, el('span.field-label', {}, '垂直对齐方式'), select),
  el('p.field-hint', {}, '应用于选定的单元格。段落对齐方式和间距保持不变。'), error,
  el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '确定')));
  const modal = openModal({ title: '单元格对齐方式', content, onClose: () => { const root = modal.panel.closest('.modal-root'); root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true'); onClose?.(); } });
  return modal;
}
