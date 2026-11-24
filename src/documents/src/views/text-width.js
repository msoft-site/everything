import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';

export function openTextWidth(value, apply) {
  const input = el('input.input', { type: 'number', min: 1, max: 600, step: 1, required: true, value: value ?? '', placeholder: value === null ? '多种' : '100', 'aria-label': '字符缩放 (%)' });
  const content = el('form', { onsubmit: e => { e.preventDefault(); const chosen = Number(input.value); modal.close(); apply(chosen); } },
    el('label.field', {}, el('span.field-label', {}, '字符缩放 (%)'), input),
    el('p.field-hint', {}, '100% 恢复正常字符宽度。较低的数值会压缩字符；较高的数值会伸展字符。字体高度和字符间距保持不变。'),
    value === null ? el('p.field-hint', {}, '选定内容包含多种字符缩放比例。请为整个选定内容选择一个百分比。') : null,
    el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '应用')));
  const modal = openModal({ title: '字符缩放', content }); return modal;
}
