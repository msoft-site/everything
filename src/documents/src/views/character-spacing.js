import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { CHARACTER_SPACING_LIMIT } from '../engine/character-spacing.js';

export function openCharacterSpacing(value, apply) {
  const input = el('input.input', { type: 'number', min: -CHARACTER_SPACING_LIMIT, max: CHARACTER_SPACING_LIMIT, step: .05, required: true, value: value ?? '', placeholder: value === null ? '多种' : '0', 'aria-label': '字符间距 (磅)' });
  const content = el('form', { onsubmit: e => { e.preventDefault(); const chosen = Number(input.value); modal.close(); apply(chosen); } },
    el('label.field', {}, el('span.field-label', {}, '字符间距 (磅)'), input),
    el('p.field-hint', {}, '正数加宽文本间距，负数紧缩文本间距。0 恢复正常间距。字号保持不变。'),
    value === null ? el('p.field-hint', {}, '选定内容包含多种字符间距。请为整个选定内容选择一个数值。') : null,
    el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '应用')));
  const modal = openModal({ title: '字符间距', content }); return modal;
}
