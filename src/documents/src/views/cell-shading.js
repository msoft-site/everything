import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';

export const cellShadingLabel = value => value === null ? '多种' : value === 'auto' ? '无填充' : value === 'foreground' ? '自动前景色' : '#' + value;

export function openCellShading(value, apply, onClose) {
  const kind = el('select.input', { 'aria-label': '单元格填充' },
    ...[['mixed', '多种 — 保持'], ['color', '颜色'], ['auto', '无填充'], ['foreground', '自动前景色'], ['inherit', '继承自表格']].map(([value, label]) => el('option', { value, disabled: value === 'mixed' }, label)));
  kind.value = value === null ? 'mixed' : ['auto', 'foreground'].includes(value) ? value : 'color';
  const color = el('input.input', { type: 'color', value: kind.value === 'color' ? '#' + value : '#DDEEFF', 'aria-label': 'RGB 单元格填充' });
  const initialKind = kind.value, initialColor = color.value;
  const refresh = () => { color.disabled = kind.value !== 'color'; }; kind.addEventListener('change', refresh); refresh();
  const error = el('p.field-error', { role: 'alert', hidden: true });
  const content = el('form', { onsubmit: e => {
    e.preventDefault();
    try {
      if (kind.value !== 'mixed' && (kind.value !== initialKind || kind.value === 'color' && color.value !== initialColor)) {
        const chosen = kind.value === 'inherit' ? null : kind.value === 'color' ? color.value.slice(1).toUpperCase() : kind.value;
        if (apply(chosen) === false) throw new Error('无法应用单元格底纹。');
      }
      modal.close();
    } catch (e) { error.textContent = e.message; error.hidden = false; }
  } }, el('label.field', {}, el('span.field-label', {}, '单元格填充'), kind),
  el('label.field', {}, el('span.field-label', {}, '颜色'), color),
  el('p.field-hint', {}, '应用于选定的单元格（包括其边距）。“无填充”会清除继承的底纹；“继承自表格”会移除直接覆盖的设置。'), error,
  el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '应用')));
  const modal = openModal({ title: '单元格底纹', content, onClose: () => {
    const root = modal.panel.closest('.modal-root'); root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true'); onClose?.();
  } });
  return modal;
}
