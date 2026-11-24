import { el } from '../ui/dom.js';
import { checkedLineSpacing } from '../engine/line-spacing.js';

// Read local declarations, not the resolved paragraph format. A rule-only
// imported style must keep its inherited amount until explicitly replaced.
export function styleLineSpacingFields(spacing = {}) {
  const partial = spacing.line === undefined && spacing.lineRule !== undefined;
  const mode = el('select.input', { 'aria-label': '样式行距规则' },
    ...(partial ? [el('option', { value: 'keep', disabled: true }, `${{ auto: '多倍行距', exact: '固定值', atLeast: '最小值' }[spacing.lineRule]} — 保持继承的数值`)] : []),
    ...[['inherit', '继承'], ['auto', '多倍行距'], ['exact', '固定值'], ['atLeast', '最小值']].map(([value, label]) => el('option', { value }, label)));
  mode.value = partial ? 'keep' : spacing.line === undefined ? 'inherit' : spacing.lineRule ?? 'auto';
  const size = el('input.input', { type: 'number', 'aria-label': '样式行距数值', placeholder: '继承' });
  size.value = spacing.line === undefined ? '' : String(Number(spacing.line) / (mode.value === 'auto' ? 240 : 20));
  const label = el('span.field-label');
  const refresh = () => {
    const multiple = mode.value === 'auto';
    size.disabled = ['inherit', 'keep'].includes(mode.value); size.required = !size.disabled;
    size.min = 0; size.max = multiple ? 5 : 600; size.step = multiple ? 'any' : .05;
    label.textContent = multiple ? '行距 (倍)' : '行高 (磅)';
  };
  let previous = mode.value;
  mode.addEventListener('change', () => {
    if (!['inherit', 'keep'].includes(mode.value) && (size.value === '' || (mode.value === 'auto') !== (previous === 'auto'))) size.value = mode.value === 'auto' ? 1 : 18;
    previous = mode.value; refresh();
  }); refresh();
  const state = () => JSON.stringify([mode.value, size.value]), original = state();
  return {
    nodes: [el('label.field', {}, el('span.field-label', {}, '行距'), mode), el('label.field', {}, label, size)],
    read() {
      if (state() === original || mode.value === 'keep') return {};
      return mode.value === 'inherit' ? { lineRule: null, lineSpacing: null } : checkedLineSpacing({ lineRule: mode.value, lineSpacing: Number(size.value) });
    },
  };
}
