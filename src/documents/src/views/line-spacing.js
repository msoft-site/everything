import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { checkedLineSpacing } from '../engine/line-spacing.js';

export function openLineSpacing(format, apply, onClose) {
  const mode = el('select.input', { 'aria-label': '行距规则' }, ...[['mixed', '多种 — 保持'], ['auto', '多倍行距'], ['exact', '固定值'], ['atLeast', '最小值'], ['inherit', '继承自样式']].map(([value, label]) => el('option', { value, disabled: value === 'mixed' }, label)));
  mode.value = format.lineRule || 'mixed';
  const size = el('input.input', { type: 'number', value: format.lineSpacing ?? '', placeholder: '多种', 'aria-label': '设置值' });
  const label = el('span.field-label'), error = el('p.field-error', { role: 'alert', hidden: true });
  const refresh = () => {
    const multiple = mode.value === 'auto';
    size.disabled = ['mixed', 'inherit'].includes(mode.value);
    // An unchanged mixed amount is a no-op, including when the rule is common.
    size.required = !size.disabled && (format.lineSpacing != null || mode.value !== format.lineRule);
    size.min = 0; size.max = multiple ? 5 : 600; size.step = multiple ? 'any' : .05;
    label.textContent = multiple ? '设置值 (倍)' : '设置值 (磅)';
  };
  let previousMode = mode.value;
  mode.addEventListener('change', () => {
    if (!['mixed', 'inherit'].includes(mode.value) && (mode.value === 'auto') !== (previousMode === 'auto')) size.value = mode.value === 'auto' ? 1 : 18;
    if (size.value === '' && !['mixed', 'inherit'].includes(mode.value)) size.value = mode.value === 'auto' ? 1 : 18;
    previousMode = mode.value; refresh();
  }); refresh();
  const fields = () => JSON.stringify([mode.value, size.value]), original = fields();
  const content = el('form', { onsubmit: e => {
    e.preventDefault();
    try {
      if (fields() !== original && mode.value !== 'mixed') {
        const value = mode.value === 'inherit' ? null : checkedLineSpacing({ lineRule: mode.value, lineSpacing: Number(size.value) });
        if (apply(value) === false) throw new Error('此行距无法适应文档。请减小设置值。');
      }
      modal.close();
    } catch (e) { error.textContent = e.message; error.hidden = false; }
  } }, el('label.field', {}, el('span.field-label', {}, '行距'), mode), el('label.field', {}, label, size),
  el('p.field-hint', {}, '“最小值”会随文字和图片自动增大。“固定值”可能会裁剪超出部分。0 磅使用默认行高。更改将应用于选定的段落。'), error,
  el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '应用')));
  const modal = openModal({ title: '行距', content, onClose: () => { const root = modal.panel.closest('.modal-root'); root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true'); onClose?.(); } });
  return modal;
}
