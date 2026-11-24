import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { KERNING_LIMIT } from '../engine/kerning.js';

export function openKerning(value, apply) {
  const input = el('input.input', { type: 'number', min: 0, max: KERNING_LIMIT, step: .5, required: true, value: value ?? '', placeholder: value === null ? '多种' : '0', 'aria-label': '字距微调磅值起 (磅)' });
  const content = el('form', { onsubmit: e => { e.preventDefault(); const chosen = Number(input.value); modal.close(); apply(chosen); } },
    el('label.field', {}, el('span.field-label', {}, '字距微调磅值起 (磅)'), input),
    el('p.field-hint', {}, '字距微调可调整字母对（如 AV）之间的间距。请输入应用字距微调的最小字号，或输入 0 将其关闭。文本将保持当前字号。'),
    value === null ? el('p.field-hint', {}, '选定内容包含多种字距微调阈值。请为整个选定内容选择一个数值。') : null,
    el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '应用')));
  const modal = openModal({ title: '字距微调', content }); return modal;
}
