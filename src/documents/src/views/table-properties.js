import { el, scrollBehavior } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';

/**
 * Table Properties: one dialog with sections for the table, the selected rows, columns and cells,
 * and the table's alternative text. A section list jumps between them; everything stays on one page,
 * so nothing set in one section hides behind another. Apply sends only what changed, in one step.
 *
 * `context` (optional): { rows: { height, allowBreak, header, headerAvailable }, cells: { width, vertical, wrap },
 * wrap: 'none' | 'around', margins, altText: { title, description }, nested, onBorders }.
 */
export function openTableProperties(table, displayedWidths, selectedColumn, apply, context = {}) {
  // A rejected edit restores the model; retain the original baseline for a retry.
  table = structuredClone(table);
  const decimal = n => String(Number(n.toFixed(5)));
  const field = (label, input) => el('label.field', {}, el('span.field-label', {}, label), input);
  const select = (label, values, value) => el('select.input', { 'aria-label': label }, ...values.map(([id, text]) => el('option', { value: id, selected: id === value }, text)));
  const check = (label, checked, extra = {}) => { const input = el('input', { type: 'checkbox', checked: !!checked, ...extra }); input.indeterminate = checked === null; return { input, node: el('label.table-check', {}, input, label) }; };

  /* Table */
  const layout = select('表格版式', [['autofit', '根据内容自动调整'], ['fixed', '固定列宽']], table.layout);
  const originalType = ['dxa', 'pct'].includes(table.width?.type) ? table.width.type : 'auto';
  const type = select('表格宽度度量单位', [['auto', '自动'], ['dxa', '英寸'], ['pct', '百分比']], originalType);
  const originalWidth = decimal(originalType === 'pct' ? table.width.value / 50 : originalType === 'dxa' ? table.width.value / 1440 : displayedWidths.reduce((a,b) => a+b, 0) / 1440);
  const width = el('input.input', { type: 'number', step: 'any', min: .01, required: true, 'aria-label': '指定表格宽度', value: originalWidth, disabled: originalType === 'auto' });
  type.addEventListener('change', () => { width.disabled = type.value === 'auto'; width.value = type.value === 'pct' ? '100' : decimal(displayedWidths.reduce((a,b) => a+b, 0) / 1440); });
  const rowAlignments = new Set(table.rows.map(row => row.alignment ?? table.alignment));
  const originalAlignment = rowAlignments.size === 1 ? [...rowAlignments][0] : 'mixed';
  const alignment = select('对齐方式', [...(originalAlignment === 'mixed' ? [['mixed', '多种']] : []), ['left', '左对齐'], ['center', '居中'], ['right', '右对齐']], originalAlignment);
  if (originalAlignment === 'mixed') alignment.querySelector('option[value="mixed"]').disabled = true;
  const originalIndent = decimal(table.indent / 1440), indent = el('input.input', { type: 'number', step: 'any', min: -22, max: 22, required: true, 'aria-label': '左段缩进 (英寸)', value: originalIndent, disabled: originalAlignment !== 'left' });
  alignment.addEventListener('change', () => { indent.disabled = alignment.value !== 'left'; });
  const wrap = select('文字环绕', [['none', '无'], ['around', '环绕']], context.wrap || (table.floating ? 'around' : 'none'));
  if (table.parentCellId || context.wrap === undefined) wrap.disabled = true;
  wrap.addEventListener('change', () => syncPositioning());
  // Positioning, for a table that text wraps around.
  // A table that does not float yet starts where Text wrapping: Around puts it: at its alignment or indent.
  const floating = table.floating || { horzAnchor: 'text', vertAnchor: 'text', ...(['center', 'right'].includes(table.alignment) ? { tblpXSpec: table.alignment, tblpX: 0 } : { tblpX: table.indent || 0 }), tblpY: 0, leftFromText: 180, rightFromText: 180, topFromText: 0, bottomFromText: 0 };
  const xChoice = select('水平对齐', [['at', '偏移量'], ['left', '左侧'], ['center', '居中'], ['right', '右侧'], ['inside', '内部'], ['outside', '外部']], floating.tblpXSpec || 'at');
  const xAt = el('input.input', { type: 'number', step: 'any', min: -22, max: 22, value: decimal((floating.tblpX || 0) / 1440), 'aria-label': '水平偏移量 (英寸)' });
  const xRelative = select('水平相对位置', [['margin', '页边距'], ['page', '页面'], ['text', '栏']], floating.horzAnchor || 'margin');
  const yChoice = select('垂直对齐', [['at', '偏移量'], ['top', '靠上'], ['center', '居中'], ['bottom', '靠下'], ['inside', '内部'], ['outside', '外部']], floating.tblpYSpec && floating.tblpYSpec !== 'inline' ? floating.tblpYSpec : 'at');
  const yAt = el('input.input', { type: 'number', step: 'any', min: -22, max: 22, value: decimal((floating.tblpY || 0) / 1440), 'aria-label': '垂直偏移量 (英寸)' });
  const yRelative = select('垂直相对位置', [['text', '段落'], ['margin', '页边距'], ['page', '页面']], floating.vertAnchor || 'margin');
  const sideLabels = { top: '上', bottom: '下', left: '左', right: '右' };
  const fromText = Object.fromEntries(['top', 'bottom', 'left', 'right'].map(side => [side, el('input.input', { type: 'number', step: 'any', min: 0, max: 22, value: decimal((floating[`${side}FromText`] || 0) / 1440), 'aria-label': `距正文距离: ${sideLabels[side]} (英寸)` })]));
  const overlap = check('允许与其他浮动表格重叠', table.overlap !== 'never');
  const positionFields = () => JSON.stringify([xChoice.value, xAt.value, xRelative.value, yChoice.value, yAt.value, yRelative.value, ...Object.values(fromText).map(i => i.value), overlap.input.checked]);
  const positionOriginal = positionFields();
  const positioning = el('div.table-positioning', {}, el('div.table-properties-subhead', {}, '定位'),
    el('div.canvas-page-fields', {}, field('水平', xChoice), field('偏移量 (英寸)', xAt), field('相对于', xRelative), el('span'),
      field('垂直', yChoice), field('偏移量 (英寸)', yAt), field('相对于', yRelative), el('span')),
    el('div.table-properties-subhead', {}, '距正文距离 (英寸)'),
    el('div.canvas-page-fields.table-margin-fields', {}, field('上', fromText.top), field('下', fromText.bottom), field('左', fromText.left), field('右', fromText.right)), overlap.node);
  const syncPositioning = () => { positioning.hidden = wrap.value !== 'around'; xAt.disabled = xChoice.value !== 'at'; yAt.disabled = yChoice.value !== 'at'; };
  for (const control of [xChoice, yChoice]) control.addEventListener('change', syncPositioning);
  syncPositioning();
  const margins = context.margins || table.margins || {};
  const margin = side => el('input.input', { type: 'number', step: 'any', min: 0, max: 22, required: true, value: decimal((margins[side] || 0) / 1440), 'aria-label': `默认${sideLabels[side]}边距 (英寸)` });
  const marginInputs = Object.fromEntries(['top', 'bottom', 'left', 'right'].map(side => [side, margin(side)]));
  const marginOriginal = JSON.stringify(Object.values(marginInputs).map(i => i.value));

  /* Column */
  const initialColumns = table.grid.map((w, i) => decimal((w || displayedWidths[i]) / 1440)), values = [...initialColumns];
  const column = select('表格列', table.grid.map((_, i) => [String(i), `第 ${i + 1} 列`]), String(selectedColumn));
  const columnWidth = el('input.input', { type: 'number', min: 0, max: 22, step: 'any', required: true, 'aria-label': '列宽 (英寸)', value: values[selectedColumn] });
  columnWidth.addEventListener('input', () => { values[Number(column.value)] = columnWidth.value; });
  column.addEventListener('change', () => { columnWidth.value = values[Number(column.value)]; });
  const step = delta => el('button.btn.btn-ghost.btn-sm', { type: 'button', 'aria-label': delta < 0 ? '上一列' : '下一列', onclick: () => {
    const next = Math.max(0, Math.min(table.grid.length - 1, Number(column.value) + delta)); column.value = String(next); columnWidth.value = values[next];
  } }, delta < 0 ? '‹ 上一列' : '下一列 ›');

  /* Row */
  const rows = context.rows || {};
  const heightRule = select('行高行距规则', [...(rows.height === null ? [['mixed', '多种 — 保留']] : []), ['auto', '自动'], ['atLeast', '最小值'], ['exact', '固定值']], rows.height === null ? 'mixed' : rows.height?.rule || 'auto');
  const heightValue = el('input.input', { type: 'number', min: 0, max: 1584, step: 0.05, value: rows.height?.value ? rows.height.value / 20 : '', placeholder: rows.height === null ? '多种' : '', 'aria-label': '行高 (磅)' });
  const syncHeight = () => { heightValue.disabled = !['atLeast', 'exact'].includes(heightRule.value); heightValue.required = !heightValue.disabled; };
  heightRule.addEventListener('change', syncHeight); syncHeight();
  const allowBreak = check('允许跨页断行', rows.allowBreak ?? true);
  const header = check('在各页顶端以标题行形式重复出现', rows.header ?? false, { disabled: !rows.headerAvailable });

  /* Cell */
  const cells = context.cells || {};
  const cellType = select('单元格宽度单位', [...(cells.width === null ? [['mixed', '多种 — 保留']] : []), ['auto', '自动'], ['dxa', '英寸'], ['pct', '百分比']], cells.width === null ? 'mixed' : cells.width?.type || 'auto');
  const cellWidth = el('input.input', { type: 'number', min: 0.01, step: 'any', 'aria-label': '指定单元格宽度', value: cells.width?.type === 'dxa' ? decimal(cells.width.value / 1440) : cells.width?.type === 'pct' ? decimal(cells.width.value / 50) : '' });
  const syncCell = () => { cellWidth.disabled = !['dxa', 'pct'].includes(cellType.value); cellWidth.required = !cellWidth.disabled; };
  cellType.addEventListener('change', syncCell); syncCell();
  const vertical = select('垂直对齐方式', [...(cells.vertical === null ? [['mixed', '多种 — 保留']] : []), ['top', '靠上'], ['center', '居中'], ['bottom', '靠下']], cells.vertical === null ? 'mixed' : cells.vertical || 'top');
  const cellWrap = check('文字换行', cells.wrap ?? true);

  /* Alt text */
  const altTitle = el('input.input', { type: 'text', maxLength: 255, value: context.altText?.title || '', 'aria-label': '表格标题' });
  const altDescription = el('textarea.input', { rows: 3, maxLength: 4000, 'aria-label': '表格说明' });
  altDescription.value = context.altText?.description || '';

  const sections = [
    ['table', '表格', [el('div.canvas-page-fields', {}, field('宽度单位', type), field('指定宽度', width), field('对齐方式', alignment), field('缩进 (英寸)', indent), field('版式', layout), field('文字环绕', wrap)),
      positioning,
      el('div.table-properties-subhead', {}, '默认单元格边距 (英寸)'),
      el('div.canvas-page-fields.table-margin-fields', {}, field('上', marginInputs.top), field('下', marginInputs.bottom), field('左', marginInputs.left), field('右', marginInputs.right)),
      context.onBorders && el('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => context.onBorders() }, '边框和底纹…')]],
    ['row', '行', [el('div.canvas-page-fields', {}, field('行高规格', heightRule), field('行高 (磅)', heightValue)), allowBreak.node, header.node]],
    ['column', '列', [el('div.canvas-page-fields', {}, field('列', column), field('列宽 (英寸)', columnWidth)), el('div.row', {}, step(-1), step(1))]],
    ['cell', '单元格', [el('div.canvas-page-fields', {}, field('宽度单位', cellType), field('指定宽度', cellWidth), field('垂直对齐方式', vertical)), cellWrap.node]],
    ['alt', '可选文字', [field('标题', altTitle), field('说明', altDescription), el('p.field-hint', {}, '屏幕阅读器会朗读标题和说明。请描述表格显示的内容。')]],
  ];
  const panels = sections.map(([id, label, body]) => el('section.table-properties-section', { id: `table-properties-${id}`, 'aria-label': label }, el('h3', {}, label), ...body));
  const scroller = el('div.table-properties-scroll', {}, ...panels);
  const nav = el('nav.table-properties-nav', { 'aria-label': '导航' }, ...sections.map(([id, label], i) => el('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => {
    panels[i].scrollIntoView({ block: 'start', behavior: scrollBehavior() }); panels[i].querySelector('input, select, textarea')?.focus({ preventScroll: true });
  } }, label)));

  const error = el('p.field-error', { role: 'alert', hidden: true });
  const content = el('form.table-properties', { onsubmit: e => {
    e.preventDefault();
    const patch = {};
    if (layout.value !== table.layout) patch.layout = layout.value;
    if (alignment.value !== originalAlignment) patch.alignment = alignment.value;
    if (indent.value !== originalIndent) patch.indent = Math.round(Number(indent.value) * 1440);
    if (type.value !== originalType || type.value !== 'auto' && width.value !== originalWidth) patch.width = { type: type.value, value: type.value === 'auto' ? 0 : type.value === 'pct' ? Number(width.value) * 50 : Math.round(Number(width.value) * 1440) };
    if (values.some((v, i) => v !== initialColumns[i]) || patch.layout === 'fixed' && table.grid.some(w => !w)) {
      // Round measured fallback widths up so a single grapheme still fits after fixing the grid.
      patch.columns = values.map((v, i) => v === initialColumns[i] ? table.grid[i] || Math.ceil(displayedWidths[i]) : Math.round(Number(v) * 1440));
      // A table sized as a share of the window would stretch the columns back to fill it: unless its width was
      // changed too, it becomes as wide as its columns, as the ribbon's Width box makes it.
      patch.width ||= table.width?.type === 'pct' ? { type: 'dxa', value: patch.columns.reduce((a, b) => a + b, 0) } : table.width || { type: 'auto', value: 0 };
    }
    const changes = { table: patch };
    if (!wrap.disabled && wrap.value !== (context.wrap || 'none')) changes.wrap = wrap.value;
    if (!wrap.disabled && wrap.value === 'around' && (positionFields() !== positionOriginal || changes.wrap)) {
      const twips = input => Math.round(Number(input.value) * 1440);
      changes.positioning = { x: xChoice.value === 'at' ? twips(xAt) : xChoice.value, horzAnchor: xRelative.value, y: yChoice.value === 'at' ? twips(yAt) : yChoice.value, vertAnchor: yRelative.value,
        ...Object.fromEntries(Object.entries(fromText).map(([side, input]) => [`${side}FromText`, twips(input)])), overlap: overlap.input.checked };
    }
    if (JSON.stringify(Object.values(marginInputs).map(i => i.value)) !== marginOriginal) changes.margins = Object.fromEntries(Object.entries(marginInputs).map(([side, input]) => [side, Math.round(Number(input.value) * 1440)]));
    if (context.rows) {
      const original = rows.height === null ? 'mixed' : rows.height?.rule || 'auto';
      const value = Math.round(Number(heightValue.value) * 20);
      if (heightRule.value !== 'mixed' && (heightRule.value !== original || ['atLeast', 'exact'].includes(heightRule.value) && value !== rows.height?.value)) changes.rowHeight = { rule: heightRule.value, value: heightRule.value === 'auto' ? 0 : value };
      if (!allowBreak.input.indeterminate && allowBreak.input.checked !== (rows.allowBreak ?? true)) changes.allowBreak = allowBreak.input.checked;
      if (!header.input.disabled && !header.input.indeterminate && header.input.checked !== (rows.header ?? false)) changes.header = header.input.checked;
    }
    if (context.cells) {
      const original = cells.width === null ? 'mixed' : cells.width?.type || 'auto';
      const value = cellType.value === 'pct' ? Number(cellWidth.value) * 50 : Math.round(Number(cellWidth.value) * 1440);
      if (cellType.value !== 'mixed' && (cellType.value !== original || cellType.value !== 'auto' && value !== cells.width?.value)) changes.cellWidth = { type: cellType.value, value: cellType.value === 'auto' ? 0 : value };
      if (vertical.value !== 'mixed' && vertical.value !== (cells.vertical || 'top')) changes.vertical = vertical.value;
      if (!cellWrap.input.indeterminate && cellWrap.input.checked !== (cells.wrap ?? true)) changes.cellWrap = cellWrap.input.checked;
    }
    if (altTitle.value !== (context.altText?.title || '') || altDescription.value !== (context.altText?.description || '')) changes.altText = { title: altTitle.value.trim(), description: altDescription.value.trim() };
    let ok;
    try { ok = apply(context.rows || context.cells || context.altText ? changes : patch); } catch (err) { error.textContent = err.message; error.hidden = false; return; }
    if (ok !== false) modal.close();
    else { error.textContent = '这些设置无法适应表格。请调整其宽度、列或缩进。'; error.hidden = false; }
  } }, nav, scroller,
  el('p.field-hint', {}, '宽度为首选设置。“自动调整”可根据单元格文字调整宽度。' + (table.parentCellId ? ' 百分比宽度使用所在单元格的书写宽度。嵌套表格不会重复自身的标题行；导入的标题行标记在移除前保持保留。' : '')), error,
  el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '应用')));
  const modal = openModal({ title: '表格属性', content, wide: true }); modal.panel.classList.add('table-properties-dialog'); return modal;
}
