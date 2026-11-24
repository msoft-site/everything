import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { CELL_MARGIN_SIDES } from '../engine/cell-margins.js';

const SIDE_NAMES = { top: '上', bottom: '下', left: '左', right: '右' };

export function cellMarginLabel(cells) {
  return CELL_MARGIN_SIDES.every(side => cells.every(cell => cell.margins[side] === cells[0]?.margins[side])) ? '自定义' : '多种';
}

export function openCellMargins(cells, apply, onClose) {
  const rows = CELL_MARGIN_SIDES.map(side => {
    const sideName = SIDE_NAMES[side] || side;
    const label = sideName, common = cells.every(cell => cell.margins[side] === cells[0].margins[side]);
    const mode = el('select.input', { 'aria-label': `${label}单元格边距设置` }, el('option', { value: 'mixed', disabled: true }, '多种 — 保持'), el('option', { value: 'custom' }, '自定义'), el('option', { value: 'inherit' }, '继承'));
    mode.value = common ? 'custom' : 'mixed';
    const width = el('input.input', { type: 'number', min: 0, max: 1584, step: .05, value: common ? cells[0].margins[side] / 20 : '', placeholder: '多种', 'aria-label': `${label}单元格边距 (磅)` });
    const refresh = () => { width.disabled = mode.value === 'inherit'; };
    mode.addEventListener('change', refresh); width.addEventListener('input', () => { mode.value = 'custom'; });
    const fields = () => JSON.stringify([mode.value, width.value]); return { side, label, mode, width, refresh, fields, original: fields() };
  });
  let presetChanged = false;
  const preset = (label, inherit) => el('button.btn.btn-ghost', { type: 'button', onclick: () => {
    presetChanged = true;
    for (const row of rows) { row.mode.value = inherit ? 'inherit' : 'custom'; if (!inherit) row.width.value = '0'; row.refresh(); }
  } }, label);
  const error = el('p.field-error', { role: 'alert', hidden: true });
  const content = el('form.canvas-border-form', { onsubmit: e => {
    e.preventDefault();
    try {
      const patch = {};
      for (const row of rows) {
        if (!presetChanged && row.fields() === row.original) continue;
        if (row.mode.value === 'inherit') { patch[row.side] = null; continue; }
        if (row.mode.value === 'mixed' || row.width.value === '') throw new Error(`请输入${row.label}边距或选择“继承”。`);
        const twips = Number(row.width.value) * 20;
        if (!Number.isFinite(twips) || Math.abs(twips - Math.round(twips)) > 1e-6) throw new Error('单元格边距步长需为 1/20 磅。');
        patch[row.side] = Math.round(twips);
      }
      if (Object.keys(patch).length && apply(patch) === false) throw new Error('这些边距为单元格内容留出的空间太小。请缩小边距或加宽表格。');
      modal.close();
    } catch (e) { error.textContent = e.message; error.hidden = false; }
  } }, el('div.canvas-style-scroll', { style: { padding: '4px' } },
    el('div.row', {}, preset('无内边距', false), preset('全部继承', true)),
    el('div.canvas-border-scroll', {}, el('table.canvas-border-fields', {}, el('thead', {}, el('tr', {}, ...['边', '设置', '边距 (磅)'].map(label => el('th', { scope: 'col' }, label)))),
      el('tbody', {}, ...rows.map(row => el('tr', {}, el('th', { scope: 'row' }, row.label), el('td', {}, row.mode), el('td', {}, row.width)))))),
    el('p.field-hint', {}, '应用于每个选定的单元格。选择“继承”可恢复表格或样式边距。多种数值在编辑前保持不变。较大的边距可能会导致文字折行并增加页数。')), error,
    el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '应用')));
  const modal = openModal({ title: '单元格边距', content, onClose: () => { const root = modal.panel.closest('.modal-root'); root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true'); onClose?.(); } });
  return modal;
}
