import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { CELL_BORDER_SIDES, CELL_BORDER_STYLES, checkedCellBorder } from '../engine/cell-borders.js';
import { borderWidth } from '../engine/paragraph-borders.js';

export function cellBorderLabel(values) {
  const data = values.map(value => CELL_BORDER_SIDES.map(side => value[side] && [value[side].style, value[side].size, value[side].color]));
  if (!data.every(value => JSON.stringify(value) === JSON.stringify(data[0]))) return '多种';
  return values.some(value => CELL_BORDER_SIDES.some(side => borderWidth(value[side]))) ? '自定义' : '无';
}

const SIDE_NAMES = { top: '上', left: '左', bottom: '下', right: '右' };

export function openCellBorders(values, apply, onClose) {
  const rows = CELL_BORDER_SIDES.map(side => {
    const label = SIDE_NAMES[side] || side, borders = values.map(value => value[side]);
    const common = (key, fallback) => {
      const all = borders.map(border => border?.[key] ?? fallback);
      return all.every(value => value === all[0]) ? all[0] : '';
    };
    const style = el('select.input', { 'aria-label': `${label}边框样式` }, el('option', { value: '', disabled: true }, '多种边框 — 保持不变'), el('option', { value: 'inherit' }, '继承'),
      ...Object.entries(CELL_BORDER_STYLES).map(([value, label]) => el('option', { value }, label)));
    const pattern = common('style', 'nil'); style.value = pattern === 'none' ? 'nil' : pattern;
    const size = common('size', 8), width = el('input.input', { type: 'number', min: 0, max: 12, step: .125, value: size === '' ? '' : size / 8, placeholder: '多种', 'aria-label': `${label}边框宽度 (磅)` });
    const color = el('input.input', { type: 'text', pattern: 'auto|#?[0-9a-fA-F]{6}', value: common('color', 'auto'), placeholder: '多种', 'aria-label': `${label}边框颜色`, title: 'auto 或 6 位十六进制 RGB 颜色' });
    const row = { side, label, style, width, color, fields: () => JSON.stringify([style.value, width.value, color.value]) };
    row.refresh = () => { width.disabled = color.disabled = !style.value || ['nil', 'inherit'].includes(style.value); };
    row.original = row.fields(); style.addEventListener('change', row.refresh); row.refresh(); return row;
  });
  let presetChanged = false;
  const preset = (label, styleFor) => el('button.btn.btn-ghost', { type: 'button', onclick: () => {
    presetChanged = true;
    for (const row of rows) { row.style.value = styleFor(row.side); row.width.value = '1'; row.color.value = 'auto'; row.refresh(); }
  } }, label);
  const error = el('p.field-error', { role: 'alert', hidden: true });
  const content = el('form.canvas-border-form', { onsubmit: e => {
    e.preventDefault();
    try {
      const patch = {};
      for (const row of rows) {
        if (!presetChanged && row.fields() === row.original) continue;
        if (row.style.value === 'inherit') { patch[row.side] = null; continue; }
        if (row.style.value === 'nil') { patch[row.side] = checkedCellBorder({ style: 'nil' }); continue; }
        if (!row.style.value || !row.width.value || !row.color.value) throw new Error(`请为${row.label}边框选择样式、宽度和颜色。`);
        patch[row.side] = checkedCellBorder({ style: row.style.value, size: Number(row.width.value) * 8, color: row.color.value });
      }
      if (Object.keys(patch).length && apply(patch) === false) throw new Error('无法应用单元格边框。');
      modal.close();
    } catch (e) { error.textContent = e.message; error.hidden = false; }
  } }, el('div.canvas-style-scroll', { style: { padding: '4px' } },
    el('div.row', { style: { flexWrap: 'wrap' } }, preset('单元格方框', () => 'single'), preset('仅底端边框', side => side === 'bottom' ? 'single' : 'nil'), preset('无边框', () => 'nil'), preset('全部继承', () => 'inherit')),
    el('div.canvas-border-scroll', {}, el('table.canvas-border-fields', {}, el('thead', {}, el('tr', {}, ...['边框', '样式', '宽度 (磅)', '颜色'].map(label => el('th', { scope: 'col' }, label)))),
      el('tbody', {}, ...rows.map(row => el('tr', {}, el('th', { scope: 'row' }, row.label), ...[row.style, row.width, row.color].map(input => el('td', {}, input))))))),
    el('p.field-hint', {}, '应用于选定的每个单元格。“无边框”清除共享边缘；“继承”恢复样式或表格设置。颜色填写 auto 或 6 位十六进制 RGB 颜色。多种格式保持不变，除非您编辑该侧边框。')), error,
    el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '确定')));
  const modal = openModal({ title: '单元格边框', content, wide: true, onClose: () => {
    const root = modal.panel.closest('.modal-root'); root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true'); onClose?.();
  } });
  modal.panel.classList.add('canvas-border-dialog', 'canvas-cell-border-dialog'); return modal;
}
