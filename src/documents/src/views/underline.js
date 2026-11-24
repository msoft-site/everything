import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { UNDERLINE_STYLES } from '../engine/underlines.js';

export function openUnderline(format, apply) {
  const pattern = el('select.input', { 'aria-label': '下划线线型', required: true }, format.underlineStyle === null ? el('option', { value: '', disabled: true }, '多种') : null,
    ...Object.entries(UNDERLINE_STYLES).map(([value, label]) => el('option', { value }, label)));
  pattern.value = format.underlineStyle ?? '';
  const automatic = el('input', { type: 'checkbox', checked: format.underlineColor === 'auto', 'aria-label': '自动下划线颜色' });
  const color = el('input.input', { type: 'color', value: format.underlineColor && format.underlineColor !== 'auto' ? '#' + format.underlineColor : '#000000', disabled: automatic.checked, 'aria-label': 'RGB 下划线颜色' });
  automatic.addEventListener('change', () => { color.disabled = automatic.checked; });
  const content = el('form', { onsubmit: e => { e.preventDefault(); const chosen = automatic.checked ? 'auto' : color.value.slice(1).toUpperCase(); modal.close(); apply({ underlineStyle: pattern.value, ...(chosen !== format.underlineColor ? { underlineColor: chosen } : {}) }); } },
    el('label.field', {}, el('span.field-label', {}, '线型'), pattern), el('label.field', {}, el('span.field-label', {}, '颜色'), color), el('label.row', {}, automatic, '自动'),
    el('p.field-hint', {}, '“字下加线”不包含空格和制表符。“自动”跟随文本颜色。'),
    format.underlineStyle === null || format.underlineColor === null ? el('p.field-hint', {}, '选定内容包含多种下划线样式。请为整个选定内容选择线型和颜色。') : null,
    el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '应用')));
  const modal = openModal({ title: '下划线', content }); return modal;
}
