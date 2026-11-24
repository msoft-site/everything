import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';

export const rowHeightLabel = height => !height ? '多种' : height.rule === 'auto' ? '自动' : `${height.rule === 'exact' ? '固定值' : '最小值'} ${height.value / 20} 磅`;

export function openRowHeight(height, apply, onClose) {
  const mode = el('select.input', { 'aria-label': '行高设置' }, ...[['mixed', '多种 — 保持'], ['auto', '自动'], ['atLeast', '最小值'], ['exact', '固定值'], ['inherit', '继承自表格样式']].map(([value, label]) => el('option', { value, disabled: value === 'mixed' }, label)));
  mode.value = height?.rule || 'mixed';
  const size = el('input.input', { type: 'number', min: 0, max: 1584, step: .05, value: height ? height.value / 20 : '', placeholder: '多种', 'aria-label': '最小行高 (磅)' });
  const label = el('span.field-label');
  const refresh = () => {
    size.disabled = !['atLeast', 'exact', 'mixed'].includes(mode.value); size.required = ['atLeast', 'exact'].includes(mode.value);
    size.min = mode.value === 'exact' ? .05 : 0;
    size.setAttribute('aria-label', mode.value === 'exact' ? '固定行高 (磅)' : '最小行高 (磅)');
    label.textContent = mode.value === 'exact' ? '固定值 (磅)' : '最小值 (磅)';
  };
  mode.addEventListener('change', refresh); size.addEventListener('input', () => { if (mode.value !== 'exact') mode.value = 'atLeast'; refresh(); }); refresh();
  const fields = () => JSON.stringify([mode.value, size.value]), original = fields(), error = el('p.field-error', { role: 'alert', hidden: true });
  const content = el('form', { onsubmit: e => {
    e.preventDefault();
    try {
      if (fields() !== original && mode.value !== 'mixed') {
        const twips = ['atLeast', 'exact'].includes(mode.value) ? Number(size.value) * 20 : 0;
        if (!Number.isFinite(twips) || Math.abs(twips - Math.round(twips)) > 1e-6) throw new Error('行高步长需为 1/20 磅。');
        if (apply(mode.value === 'inherit' ? null : { rule: mode.value, value: Math.round(twips) }) === false) throw new Error('此行高无法适应文档。请减小高度，特别是对于重复标题行。');
      }
      modal.close();
    } catch (e) { error.textContent = e.message; error.hidden = false; }
  } }, el('label.field', {}, el('span.field-label', {}, '行高设置'), mode),
  el('label.field', {}, label, size),
  el('p.field-hint', {}, '应用于每个选定的行（包括合并单元格）。“最小值”会随内容自动增大。“固定值”会隐藏溢出内容而不会将其删除；使用文本模式可编辑隐藏的文本。'), error,
  el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '应用')));
  const modal = openModal({ title: '行高', content, onClose: () => { const root = modal.panel.closest('.modal-root'); root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true'); onClose?.(); } });
  return modal;
}
