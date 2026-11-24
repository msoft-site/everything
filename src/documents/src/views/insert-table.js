import { el } from '../ui/dom.js';
import { openMenu, closeMenu } from '../ui/menu.js';

const COLUMNS = 10, ROWS = 8;

/**
 * Insert → Table: a grid to sweep out a size (the label follows the pointer or the arrow keys), a
 * quick rows-and-columns form, and the table commands below it (`items`: Insert Table…, Draw Table,
 * Convert Text to Table…, Quick Tables).
 */
export function openInsertTable(apply, { anchor = document.activeElement, focusFirst = true, items = [] } = {}) {
  let popup;
  const error = el('p.field-error', { role: 'alert', hidden: true });
  const insert = (rows, columns) => {
    if (!popup?.menu?.isConnected) return;
    if (apply(rows, columns) !== false) closeMenu();
    else { error.textContent = '表格无法容纳。请尝试减少列数。'; error.hidden = false; }
  };
  const dimensions = el('span', { 'aria-live': 'polite' }, '选择表格大小');
  const grid = el('div.menu-custom-grid.table-size-grid', { role: 'group', 'aria-label': '表格大小', dataset: { columns: String(COLUMNS) } });
  const preview = (rows, columns) => {
    dimensions.textContent = `${columns} × ${rows} 表格`;
    [...grid.children].forEach((cell, i) => cell.classList.toggle('is-preview', Math.floor(i / COLUMNS) < rows && i % COLUMNS < columns));
  };
  for (let rows = 1; rows <= ROWS; rows++) for (let columns = 1; columns <= COLUMNS; columns++) grid.append(el('button.swatch.table-size-cell', {
    type: 'button', role: 'menuitem', tabindex: -1, 'aria-label': `${columns} 列，${rows} 行`,
    onfocus: () => preview(rows, columns), onpointerenter: () => preview(rows, columns), onclick: () => insert(rows, columns),
  }));
  grid.addEventListener('pointerleave', () => { dimensions.textContent = '选择表格大小'; for (const cell of grid.children) cell.classList.remove('is-preview'); });
  const rows = el('input.input', { type: 'number', min: 1, max: 500, value: 2, required: true, 'aria-label': '表格行数' });
  const columns = el('input.input', { type: 'number', min: 1, max: 32, value: 2, required: true, 'aria-label': '表格列数' });
  const custom = el('form.table-size-custom', { onsubmit: e => { e.preventDefault(); insert(Number(rows.value), Number(columns.value)); } },
    el('label', {}, '行数', rows), el('label', {}, '列数', columns), el('button.btn.btn-outline', { type: 'submit' }, '插入'));
  popup = openMenu({ anchor, label: '插入表格', className: 'table-size-palette', focusFirst,
    items: [{ custom: el('div.palette-heading', {}, dimensions) }, { custom: grid }, { separator: true }, { custom }, { custom: error },
      ...(items.length ? [{ separator: true }, ...items] : [])] });
  return popup;
}
