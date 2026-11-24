// The table commands of the editor: the Insert → Table drop-down, the Table Design
// and Table Layout tabs, the Table menu and the table items of the document's
// context menu. Commands run the engine's table operations (table-editing.js,
// table-styles.js, table-formula.js) as one undoable transaction each.
import '../styles/tables.css';
import { clipText } from '../core/text.js';
import { el, MOD_KEY, isComposing, amountInRange } from '../ui/dom.js';
import { openMenu } from '../ui/menu.js';
import { openColorPalette } from '../ui/color-palette.js';
import { TEXT_COLORS } from './text-color.js';
import * as T from '../engine/table-editing.js';
import { blockFor, cellBlockPlacements, wholeRows, wholeColumns } from '../engine/table-selection.js';
import { applyTableStyle, setTableLook, clearTableStyle, saveTableStyle, tableLook, availableTableStyles, tableStyleSpec, newTableStyleId, specFromTable, DEFAULT_LOOK } from '../engine/table-styles.js';
import { insertFormula, evaluateFormula, suggestedFormula, FORMULA_FUNCTIONS, NUMBER_FORMATS, buildInstruction, keptText } from '../engine/table-formula.js';
import { QUICK_TABLES, insertQuickTable } from '../engine/quick-tables.js';
import { headerRowCount, rowGrid, verticalMerges } from '../engine/tables.js';
import { locate } from '../engine/model.js';
import { createTableStyleGallery } from '../ui/table-design-gallery.js';
import { openInsertTableDialog, openConvertTextDialog, openConvertTableDialog, openSplitCellsDialog, openCellsDialog, openSortDialog, openFormulaDialog } from './table-dialogs.js';
import { openTableStyleDialog } from './table-style-dialog.js';
import { openTableProperties } from './table-properties.js';
import { attachTablePointer } from './table-pointer.js';

export const LINE_STYLES = Object.freeze([['single', '单实线'], ['double', '双实线'], ['dotted', '点线'], ['dashed', '虚线'], ['dashSmallGap', '短划线'], ['dotDash', '点划线'], ['triple', '三实线'], ['thinThickSmallGap', '细粗线'], ['thickThinSmallGap', '粗细线']]);
export const LINE_WEIGHTS = Object.freeze([[2, '¼ 磅'], [4, '½ 磅'], [6, '¾ 磅'], [8, '1 磅'], [12, '1½ 磅'], [18, '2¼ 磅'], [24, '3 磅'], [36, '4½ 磅'], [48, '6 磅']]);
// Border Styles: ready pens, each a style, weight and color.
export const BORDER_STYLE_PRESETS = Object.freeze([
  ['细黑线', 'single', 4, '000000'], ['1 磅黑色', 'single', 8, '000000'], ['粗黑线', 'single', 18, '000000'], ['双细黑线', 'double', 6, '000000'],
  ['细灰线', 'single', 4, '808080'], ['点状灰线', 'dotted', 6, '808080'], ['虚线灰线', 'dashed', 6, '808080'], ['细蓝线', 'single', 4, '2E5E8C'],
  ['1½ 磅蓝色', 'single', 12, '2E5E8C'], ['双细蓝线', 'double', 6, '2E5E8C'], ['细绿线', 'single', 4, '4A7A35'], ['1½ 磅橙色', 'single', 12, 'B85C1E'],
].map(([name, style, size, color]) => ({ name, style, size, color })));
const BORDER_ITEMS = [
  ['bottom', '下框线', 'borderBottom'], ['top', '上框线', 'borderTop'], ['left', '左框线', 'borderLeft'], ['right', '右框线', 'borderRight'],
  null, ['none', '无框线', 'borderNone'], ['all', '所有框线', 'borderAll'], ['outside', '外侧框线', 'borderOuter'], ['inside', '内部框线', 'borderInside'],
  null, ['insideH', '内部横框线', 'borderInsideH'], ['insideV', '内部竖框线', 'borderInsideV'],
  null, ['diagonalDown', '斜下框线', 'borderDiagonalDown'], ['diagonalUp', '斜上框线', 'borderDiagonalUp'],
];
const ALIGNMENTS = [['top', 'left'], ['top', 'center'], ['top', 'right'], ['center', 'left'], ['center', 'center'], ['center', 'right'], ['bottom', 'left'], ['bottom', 'center'], ['bottom', 'right']];
const ALIGN_NAMES = { 'top-left': '靠上两端对齐', 'top-center': '靠上居中对齐', 'top-right': '靠上右对齐', 'center-left': '垂直居中左对齐', 'center-center': '垂直居中', 'center-right': '垂直居中右对齐', 'bottom-left': '靠下两端对齐', 'bottom-center': '靠下居中对齐', 'bottom-right': '靠下右对齐' };
const DIRECTION_LABELS = { lrTb: '水平', tbRl: '文字旋转 90°', btLr: '文字旋转 270°' };
let viewGridlines = true;

export function createTableTools({ editor, pkg, error = () => {}, onChange = () => {}, controls = {} }) {
  const ready = () => { const engine = editor(); return engine && !pkg()?.readOnly ? engine : null; };
  const model = () => ready()?.model || null;
  // Every table control asks for the selection's block (and the alignment grid for its state) on each
  // refresh, over a hundred times a keystroke; each answer walks the whole table. Work them out once
  // per document state and selection.
  let memo = null;
  const current = m => !!memo && memo.model === m && memo.revision === m.revision && memo.tables === m.tables && memo.paragraphs === m.paragraphs
    && memo.anchor === m.selection.anchor && memo.focus === m.selection.focus && memo.cellBlock === m.cellBlock;
  const block = () => {
    const m = model(); if (!m) return null;
    if (current(m)) return memo.block;
    let value = null; try { value = T.selectionBlock(m); } catch { value = null; }
    memo = { model: m, revision: m.revision, tables: m.tables, paragraphs: m.paragraphs, anchor: m.selection.anchor, focus: m.selection.focus, cellBlock: m.cellBlock, block: value };
    return value;
  };
  const inTable = () => !!block();
  const pen = { style: 'single', size: 4, color: '000000' };
  let lastPreset = 'all', lastShading = null;
  let pointer = null;
  const modes = { draw: false, erase: false, paint: false };

  const widthsOf = (engine, table) => ((engine.selectionLayout?.tableWidths || engine.layout?.tableWidths)?.[table.id] || []).map(w => Math.round(w * 15));
  function rowHeightsOf(engine, table) {
    const heights = table.rows.map(() => 0), byRow = new Map(table.rows.map((row, i) => [row.id, i]));
    const perPage = new Map();
    const owners = verticalMerges(table);
    for (const cell of engine.selectionLayout?.cells || []) {
      // A heading row repeated at the top of later pages is one row: only its own place counts.
      if (cell.tableId !== table.id || cell.repeatedHeader || (owners.get(cell.id)?.cells.length ?? 2) !== 1) continue;
      const key = `${cell.rowId}:${cell.page}`;
      perPage.set(key, Math.max(perPage.get(key) || 0, cell.height));
    }
    for (const [key, height] of perPage) { const index = byRow.get(key.split(':')[0]); if (index !== undefined) heights[index] += Math.round(height * 15); }
    return heights;
  }

  /** Run one table command as an undoable step; errors are shown, not thrown. */
  function run(action, { focus = true } = {}) {
    const engine = ready(); if (!engine) return false;
    engine.finishComposition();
    let failure = null;
    const ok = engine.execute(() => action(engine.model, engine), e => { failure = e; });
    if (focus) engine.focus();
    onChange();
    return ok && !failure;
  }
  const withTable = (fn, options) => run((m, engine) => { const b = T.selectionBlock(m); if (!b) throw new Error('请先将光标置于表格中。'); return fn(m, b, engine); }, options);
  const closeFocus = () => queueMicrotask(() => editor()?.focus());

  /* ---- Insert ---- */
  function insertTableOf({ rows, columns, autofit = 'fixed', width = null }) {
    return run((m, engine) => {
      const [start, end] = m.range;
      if (start !== end) m.select(end);
      const parent = m.tableContext;
      const box = parent && engine.selectionLayout.cells.find(cell => cell.id === parent.cell.id);
      const available = box ? box.width * 15 - parent.cell.margins.left - parent.cell.margins.right : undefined;
      m.insertTable(rows, columns, available);
      const table = m.tableContext.table;
      if (width) T.setColumnWidths(m, table, Array(columns).fill(Math.round(width * 1440)), { layout: 'fixed' });
      if (autofit !== 'fixed') T.autofitTable(m, autofit);
      return true;
    });
  }
  const insertTableDialog = () => openInsertTableDialog(choice => insertTableOf(choice), { onClose: closeFocus });
  function convertTextToTable() {
    const engine = ready(); if (!engine) return;
    engine.finishComposition();
    const m = engine.model;
    openConvertTextDialog({ shape: (separator, other) => T.textTableShape(m, { separator, other }), separator: m.text.slice(...m.range).includes('\t') ? 'tab' : m.text.slice(...m.range).includes(',') ? 'comma' : 'paragraph' },
      choice => {
        const parent = m.tableContext, box = parent && engine.selectionLayout.cells.find(cell => cell.id === parent.cell.id);
        const availableWidth = box ? box.width * 15 - parent.cell.margins.left - parent.cell.margins.right : undefined;
        let failure; const ok = engine.execute(() => T.convertTextToTable(engine.model, { ...choice, availableWidth }), e => { failure = e; }, undefined, true); if (failure) throw failure; onChange(); return ok;
      }, { onClose: closeFocus });
  }
  const quickTableItems = () => QUICK_TABLES.map(t => ({ label: t.name, hint: t.description, icon: 'quickTable', disabled: !ready(), onSelect: () => run((m, engine) => insertQuickTable(m, t.id, (rows, columns) => {
    const [start, end] = m.range; if (start !== end) m.select(end);
    const parent = m.tableContext, box = parent && engine.selectionLayout.cells.find(cell => cell.id === parent.cell.id);
    return m.insertTable(rows, columns, box ? box.width * 15 - parent.cell.margins.left - parent.cell.margins.right : undefined);
  })) }));
  /** Items below the size grid of Insert → Table. */
  const insertMenuItems = () => [
    { label: '插入表格…', icon: 'table', disabled: !ready() || !!ready()?.model.selectedImage, onSelect: insertTableDialog },
    { label: modes.draw ? '停止绘制' : '绘制表格', icon: 'drawTable', disabled: !ready(), onSelect: () => setMode('draw', !modes.draw) },
    { label: '文本转换成表格…', icon: 'convertToTable', disabled: !ready() || !canConvertText(), onSelect: convertTextToTable },
    { label: '快速表格', icon: 'quickTable', disabled: !ready(), items: quickTableItems() },
  ];
  const canConvertText = () => { const m = model(); if (!m || m.range[0] === m.range[1]) return false; const cells = new Set(m.selectedParagraphs.map(p => p.cellId || null)); return cells.size === 1; };

  /* ---- Modes: Draw Table, Eraser, Border Painter ---- */
  function setMode(name, on) {
    for (const key of Object.keys(modes)) modes[key] = key === name ? on : false;
    pointer?.setMode(on ? name : null, pen);
    onChange();
    editor()?.focus();
  }

  /* ---- Select ---- */
  function selectKind(kind) {
    const engine = ready(); if (!engine) return;
    const b = block(); if (!b) return;
    engine.finishComposition();
    engine.model.setCellBlock(blockFor(b.table, b, kind));
    engine.syncInput(); engine.paint(); engine.onSelection(); engine.focus();
  }

  /* ---- Table Style gallery ---- */
  const gallery = createTableStyleGallery({
    styles: () => availableTableStyles(model()?.styles || { definitions: {} }),
    current: () => block()?.table.styleId || null,
    look: () => { const b = block(); return b ? tableLook(b.table) : { ...DEFAULT_LOOK }; },
    setLook: patch => withTable(m => setTableLook(m, patch)),
    apply: (id, options) => withTable(m => applyTableStyle(m, id, options)),
    enabled: inTable,
  });
  function styleDialog(mode) {
    const b = block(); if (!b) return;
    const styles = model().styles, current = tableStyleSpec(styles, b.table.styleId);
    // A new style starts from the table's current look, including a style that came with the document.
    const imported = b.table.styleId && styles.definitions[b.table.styleId] && !styles.definitions[b.table.styleId].generated;
    const base = current || (imported ? specFromTable(styles, b.table) : tableStyleSpec(styles, 'DocsTablePlainGrid'));
    const names = new Set(Object.values(styles.definitions).filter(s => s.type === 'table').map(s => s.name.toLowerCase()));
    let name = current || imported ? `${base.name} 副本` : '表格样式 1';
    for (let n = 2; names.has(name.toLowerCase()); n++) name = current || imported ? `${base.name} 副本 ${n}` : `表格样式 ${n}`;
    const spec = mode === 'new' ? { ...structuredClone(base), id: '', name: clipText(name, 100), family: 'custom' } : structuredClone(current);
    if (mode === 'modify' && !current) { error(new Error('此表格的样式随文档提供。使用“新建表格样式”可制作可编辑的副本。')); return; }
    openTableStyleDialog({ title: mode === 'new' ? '新建表格样式' : '修改表格样式', spec, look: tableLook(b.table),
      nameTaken: name => Object.values(model().styles.definitions).some(s => s.type === 'table' && s.name.toLowerCase() === name.toLowerCase() && s.id !== (mode === 'modify' ? spec.id : null)) },
    edited => {
      const engine = ready(); if (!engine) return false;
      const value = mode === 'new' ? { ...edited, id: newTableStyleId(engine.model.styles, edited.name), family: 'custom' } : edited;
      let failure; const ok = engine.execute(() => saveTableStyle(engine.model, value), e => { failure = e; }, undefined, true);
      if (failure) throw failure; onChange(); return ok;
    }, { onClose: closeFocus });
  }
  const styleMenuItems = () => [...gallery.panelItems(), { separator: true },
    { label: '修改表格样式…', icon: 'editStyle', disabled: !inTable() || !tableStyleSpec(model().styles, block()?.table.styleId), onSelect: () => styleDialog('modify') },
    { label: '清除', icon: 'clearFormat', disabled: !inTable(), onSelect: () => withTable(m => clearTableStyle(m)) },
    { label: '新建表格样式…', icon: 'newStyle', disabled: !inTable(), onSelect: () => styleDialog('new') }];

  /* ---- Shading and borders ---- */
  const shadingChoices = TEXT_COLORS;
  function shadingPalette(anchor, e) {
    const m = model();
    openColorPalette({ anchor, label: '底纹', value: m?.cellShading ?? null, choices: shadingChoices, reset: { value: 'auto', label: '无颜色' }, custom: true, customLabel: '底纹颜色', pointer: !!e?.detail,
      onPick: color => { lastShading = color; withTable(model => model.setCellShading(color === 'auto' ? 'auto' : color)); } });
  }
  function penColorPalette(anchor) {
    openColorPalette({ anchor, label: '笔颜色', value: pen.color, choices: TEXT_COLORS, reset: { value: 'auto', label: '自动', indicator: 'A' }, custom: true, customLabel: '笔颜色',
      onPick: color => { pen.color = color; pointer?.setMode(currentMode(), pen); onChange(); } });
  }
  const currentMode = () => Object.keys(modes).find(key => modes[key]) || null;
  const applyBorders = preset => { lastPreset = preset; return withTable(m => T.applyBorderPreset(m, preset, pen)); };
  const borderItems = () => [...BORDER_ITEMS.map(item => item ? { label: item[1], icon: item[2], disabled: !inTable(), onSelect: () => applyBorders(item[0]) } : { separator: true }),
    { separator: true }, { label: '查看网格线', icon: 'gridlines', checked: viewGridlines, onSelect: toggleGridlines },
    { label: '边框和底纹…', icon: 'cellBorders', disabled: !inTable() || controls.cellBorders?.disabled, onSelect: () => controls.cellBorders?.click() }];
  function toggleGridlines() {
    viewGridlines = !viewGridlines;
    const engine = editor(); if (engine) { engine.showTableGridlines = viewGridlines; engine.paint(); }
    onChange();
  }
  const penSwatch = (style, size, color) => {
    const svg = `<svg viewBox="0 0 60 10" width="60" height="10" aria-hidden="true"><line x1="2" x2="58" y1="5" y2="5" stroke="${color === 'auto' ? 'currentColor' : '#' + color}" stroke-width="${Math.max(0.75, size / 6)}" ${style === 'dotted' ? 'stroke-dasharray="1 2"' : style === 'dashed' || style === 'dashSmallGap' ? 'stroke-dasharray="5 3"' : style === 'dotDash' ? 'stroke-dasharray="6 2 1 2"' : ''}/>${style === 'double' || style === 'triple' ? `<line x1="2" x2="58" y1="8.5" y2="8.5" stroke="${color === 'auto' ? 'currentColor' : '#' + color}" stroke-width="1"/>` : ''}</svg>`;
    return el('span.table-pen-sample', { html: svg });
  };

  /* ---- Properties ---- */
  function openProperties() {
    const engine = ready(); if (!engine) return;
    const b = block(); if (!b) return;
    engine.finishComposition();
    const m = engine.model, table = b.table;
    const measured = widthsOf(engine, table), widths = measured.length === table.grid.length ? measured : table.grid;
    const rowsSelected = table.rows.slice(b.top, b.bottom + 1);
    const same = (list, fn) => list.length && list.every(item => JSON.stringify(fn(item)) === JSON.stringify(fn(list[0]))) ? fn(list[0]) : null;
    const cells = cellBlockPlacements(table, b).map(p => p.cell);
    const headerCount = headerRowCount(table);
    openTableProperties(table, widths.map(w => w), b.left, changes => {
      let failure;
      const ok = engine.execute(() => {
        const model = engine.model;
        // The dialog shows the selection's table, which can be an outer table of the caret's.
        if (changes.table && Object.keys(changes.table).length) model.setTableProperties(changes.table, T.selectionBlock(model)?.table);
        if (changes.wrap) T.setTableWrapping(model, changes.wrap);
        if (changes.positioning) T.setTablePositioning(model, changes.positioning);
        if (changes.margins) T.setTableCellMargins(model, changes.margins);
        if (changes.altText) T.setTableAltText(model, changes.altText);
        if (changes.rowHeight) T.setSelectedRowHeight(model, changes.rowHeight.value, changes.rowHeight.rule);
        if (changes.allowBreak !== undefined || changes.header !== undefined) T.setRowOptions(model, { allowBreak: changes.allowBreak, header: changes.header });
        if (changes.cellWidth) T.setCellPreferredWidth(model, changes.cellWidth);
        if (changes.vertical) model.setCellVerticalAlignment(changes.vertical);
        if (changes.cellWrap !== undefined) T.setCellWrap(model, changes.cellWrap);
        return true;
      }, e => { failure = e; }, undefined, true);
      if (failure) throw failure;
      queueMicrotask(() => editor()?.focus()); onChange();
      return ok;
    }, {
      wrap: table.parentCellId ? undefined : table.floating ? 'around' : 'none', margins: table.margins,
      altText: { title: table.caption || '', description: table.description || '' },
      rows: { height: same(rowsSelected, row => row.heightExplicit ? { rule: row.heightRule || 'atLeast', value: row.minHeight || 0 } : { rule: 'auto', value: 0 }), allowBreak: same(rowsSelected, row => !row.cantSplit), header: same(rowsSelected, row => !!row.header), headerAvailable: !table.parentCellId && b.top <= headerCount },
      cells: { width: same(cells, cell => cell.width?.type === 'auto' || !cell.width ? { type: 'auto', value: 0 } : cell.width), vertical: same(cells, cell => cell.vertical || 'top'), wrap: same(cells, cell => !cell.noWrap) },
      onBorders: () => controls.cellBorders?.click(),
    });
  }

  /* ---- Sort, formula, conversion ---- */
  function sortDialog() {
    const engine = ready(); const b = block(); if (!engine || !b) return;
    engine.finishComposition();
    const table = b.table, text = cell => engine.model.paragraphs.filter(p => p.cellId === cell.id).map(keptText).join(' ').replace(/￼/g, '').trim();
    // Every column a cell starts at in some row, so a title merged across the first row hides none; each is
    // named from the first row with a cell just that wide there.
    const grids = table.rows.map(rowGrid), starts = [...new Set(grids.flat().map(entry => entry.column))].sort((x, y) => x - y);
    const columns = starts.map((column, i) => {
      const end = starts[i + 1] ?? table.grid.length, entry = grids.flat().find(e => e.column === column && e.end === end) || grids.flat().find(e => e.column === column);
      return { column, label: `第 ${i + 1} 列`, header: text(entry.cell) || `第 ${i + 1} 列` };
    });
    openSortDialog({ columns, header: headerRowCount(table) > 0 || !!table.conditionalStyle?.settings.look.firstRow && !!table.styleId },
      choice => { let failure; engine.execute(() => T.sortTable(engine.model, choice), e => { failure = e; }, undefined, true); if (failure) throw failure; onChange(); return true; }, { onClose: closeFocus });
  }
  function formulaDialog() {
    const engine = ready(); if (!engine) return;
    engine.finishComposition();
    const m = engine.model, cellId = m.paragraphs[locate(m.paragraphs, m.range[0]).index]?.cellId || null;
    openFormulaDialog({ suggested: suggestedFormula(m), formats: NUMBER_FORMATS, functions: FORMULA_FUNCTIONS, preview: (formula, format) => evaluateFormula(engine.model, buildInstruction(formula, format || null), cellId) },
      (formula, format) => { let failure; engine.execute(() => insertFormula(engine.model, formula, format), e => { failure = e; }, undefined, true); if (failure) throw failure; onChange(); return true; }, { onClose: closeFocus });
  }
  const convertToText = () => { if (!inTable()) return; openConvertTableDialog(choice => { const engine = ready(); let failure; engine.execute(() => T.convertTableToText(engine.model, choice), e => { failure = e; }, undefined, true); if (failure) throw failure; onChange(); return true; }, { onClose: closeFocus }); };
  const splitCellsDialog = () => { const b = block(); if (!b) return; openSplitCellsDialog({ several: cellBlockPlacements(b.table, b).length > 1 }, choice => {
    const engine = ready(); let failure;
    engine.execute(() => { const m = engine.model, t = T.selectionBlock(m).table, options = { ...choice, widths: widthsOf(engine, t) }; return choice.merge ? T.splitCells(m, options) : T.splitEachCell(m, options); }, e => { failure = e; }, undefined, true);
    if (failure) throw failure; onChange(); return true; }, { onClose: closeFocus }); };
  const cellsDialog = kind => openCellsDialog(kind, shift => {
    const engine = ready(); let failure;
    engine.execute(() => { const m = engine.model, t = T.selectionBlock(m).table, widths = widthsOf(engine, t); return kind === 'delete' ? T.deleteCells(m, { shift }) : T.insertCells(m, { shift, widths }); }, e => { failure = e; }, undefined, true);
    if (failure) throw failure; onChange(); return true;
  }, { onClose: closeFocus });

  /* ---- Commands shared by the ribbon, the Table menu and the context menu ---- */
  const cmd = {
    insertAbove: () => withTable(m => T.insertRows(m, { above: true })),
    insertBelow: () => withTable(m => T.insertRows(m, {})),
    insertLeft: () => withTable((m, b, engine) => T.insertColumns(m, { left: true, widths: widthsOf(engine, b.table) })),
    insertRight: () => withTable((m, b, engine) => T.insertColumns(m, { widths: widthsOf(engine, b.table) })),
    deleteRows: () => withTable(m => T.deleteRows(m)),
    deleteColumns: () => withTable((m, b, engine) => T.deleteColumns(m, { widths: widthsOf(engine, b.table) })),
    deleteTable: () => withTable(m => T.deleteTable(m)),
    deleteCells: () => cellsDialog('delete'),
    insertCells: () => cellsDialog('insert'),
    mergeCells: () => withTable(m => T.mergeBlock(m)),
    splitCells: splitCellsDialog,
    splitTable: () => withTable(m => T.splitTable(m)),
    autofit: mode => withTable((m, b, engine) => mode === 'fixed' ? T.fixColumnWidths(m, { widths: widthsOf(engine, b.table) }) : T.autofitTable(m, mode)),
    distributeRows: () => withTable((m, b, engine) => T.distributeRows(m, { heights: rowHeightsOf(engine, b.table) })),
    distributeColumns: () => withTable((m, b, engine) => T.distributeColumns(m, { widths: widthsOf(engine, b.table) })),
    align: (vertical, horizontal) => withTable(m => T.setCellAlignment(m, { vertical, horizontal })),
    textDirection: () => withTable(m => T.setTextDirection(m, T.nextTextDirection(m))),
    repeatHeader: () => withTable(m => { const b = T.selectionBlock(m); const on = headerRowCount(b.table) > b.bottom && b.table.rows[0].header; return m.setTableHeaderRows(on ? 0 : b.bottom + 1, b.table); }),
    sort: sortDialog, formula: formulaDialog, convertToText, convertTextToTable, insertTableDialog,
    select: selectKind, properties: openProperties,
  };
  const headerOn = () => { const b = block(); return !!b && !!b.table.rows[0]?.header && headerRowCount(b.table) > b.bottom; };
  const canMerge = () => { const b = block(); if (!b) return false; try { return cellBlockPlacements(b.table, b).length > 1; } catch { return false; } };

  /* ---- Ribbon ---- */
  function tableRibbon(kit) {
    const { command, menuButton, split, rows, divider, large, small, when, spin, commandIconEl, controls: c, inDocument, focusEditor } = kit;
    const noSteal = (...buttons) => { for (const b of buttons) b.addEventListener('mousedown', e => e.preventDefault()); return buttons[0]; };
    const enabled = control => when(control, inTable);
    const button = (label, icon, onclick, options = {}) => { const b = noSteal(command(label, icon, onclick, options)); enabled(b); return b; };

    /* Table Design */
    const more = command('其他表格样式', 'more', e => openMenu({ anchor: more, label: '表格样式', minWidth: 300, pointer: !!e?.detail, onClose: e?.detail ? focusEditor : null, className: 'table-style-menu', items: inDocument(styleMenuItems()) }));
    more.classList.add('ribbon-gallery-more'); more.setAttribute('aria-haspopup', 'menu'); noSteal(more); enabled(more);
    large(c.cellShading, { label: '底纹', icon: 'cellShading' });
    const shading = split(c.cellShading, { label: '底纹颜色', size: 'large', open: (anchor, e) => shadingPalette(anchor, e) });
    enabled(shading.arrow);
    const borderStyles = menuButton('边框样式', 'borderStyles', () => BORDER_STYLE_PRESETS.map(p => ({ custom: el('button.menu-item.table-pen-item', { type: 'button', role: 'menuitemradio', 'aria-checked': String(pen.style === p.style && pen.size === p.size && pen.color === p.color), 'aria-label': p.name, onclick: () => { Object.assign(pen, { style: p.style, size: p.size, color: p.color }); setMode('paint', true); } }, penSwatch(p.style, p.size, p.color), el('span.menu-label', {}, p.name)) })), { text: '边框样式' });
    const lineStyle = menuButton('线型', 'lineStyle', () => LINE_STYLES.map(([style, name]) => ({ custom: el('button.menu-item.table-pen-item', { type: 'button', role: 'menuitemradio', 'aria-checked': String(pen.style === style), 'aria-label': name, onclick: () => { pen.style = style; pointer?.setMode(currentMode(), pen); onChange(); } }, penSwatch(style, Math.max(pen.size, 6), pen.color), el('span.menu-label', {}, name)) })), { size: 'small', text: '线型' });
    const lineWeight = menuButton('笔划粗细', 'lineWeight', () => LINE_WEIGHTS.map(([size, name]) => ({ label: name, radio: true, checked: pen.size === size, onSelect: () => { pen.size = size; pointer?.setMode(currentMode(), pen); onChange(); } })), { size: 'small', text: '笔划粗细' });
    const penColor = noSteal(command('笔颜色', 'penColor', () => penColorPalette(penColor), { caret: true, text: '笔颜色', attrs: { 'aria-haspopup': 'menu' } }));
    const bordersMain = button('边框', 'borderAll', () => applyBorders(lastPreset), { size: 'large' });
    const borders = split(bordersMain, { label: '边框选项', size: 'large', open: (anchor, e) => openMenu({ anchor, label: '边框', minWidth: 240, pointer: !!e?.detail, onClose: e?.detail ? focusEditor : null, items: inDocument(borderItems()) }) });
    enabled(borders.arrow);
    const painter = noSteal(command('边框刷', 'borderPainter', () => setMode('paint', !modes.paint), { size: 'large', attrs: { 'aria-pressed': 'false' } }));
    when(painter, () => !!ready(), () => String(modes.paint));
    for (const control of [borderStyles, lineStyle, lineWeight, penColor]) when(control, () => !!ready());
    small(c.cellBorders, { icon: 'cellBorders' });
    const design = [
      { id: 'styleOptions', label: '表格样式选项', icon: 'headerRow', priority: 5, items: [gallery.optionsGrid] },
      { id: 'tableStyles', label: '表格样式', icon: 'table', priority: 7, items: [el('div.ribbon-gallery-frame', {}, gallery.gallery, more)] },
      { id: 'shading', label: '底纹', icon: 'cellShading', priority: 4, items: [shading] },
      { id: 'borders', label: '边框', icon: 'cellBorders', priority: 6, items: [borderStyles, rows([lineStyle], [lineWeight], [penColor]), borders, painter, el('div.ribbon-launcher', {}, c.cellBorders)] },
    ];

    /* Table Layout */
    const select = menuButton('选择', 'selectTable', () => [['cell', '选择单元格', 'selectCell'], ['column', '选择列', 'selectColumn'], ['row', '选择行', 'selectRow'], ['table', '选择表格', 'selectTable']].map(([kind, label, icon]) => ({ label, icon, disabled: !inTable(), onSelect: () => selectKind(kind) })), { size: 'small', text: '选择' });
    enabled(select);
    const gridlines = noSteal(command('查看网格线', 'gridlines', toggleGridlines, { text: '查看网格线', attrs: { 'aria-pressed': 'true' } }));
    when(gridlines, () => !!editor(), () => String(viewGridlines));
    small(c.tableProperties, { icon: 'tableProperties', label: '属性' });
    const draw = noSteal(command('绘制表格', 'drawTable', () => setMode('draw', !modes.draw), { text: '绘制表格', attrs: { 'aria-pressed': 'false' } }));
    const eraser = noSteal(command('擦除', 'tableEraser', () => setMode('erase', !modes.erase), { text: '擦除', attrs: { 'aria-pressed': 'false' } }));
    when(draw, () => !!ready(), () => String(modes.draw)); when(eraser, () => !!ready(), () => String(modes.erase));
    const deleteMenu = menuButton('删除', 'deleteTable', () => [
      { label: '删除单元格…', icon: 'deleteCells', disabled: !inTable(), onSelect: cmd.deleteCells },
      { label: '删除列', icon: 'deleteColumn', disabled: !inTable(), onSelect: cmd.deleteColumns },
      { label: '删除行', icon: 'deleteRow', disabled: !inTable(), onSelect: cmd.deleteRows },
      { label: '删除表格', icon: 'deleteTable', disabled: !inTable(), onSelect: cmd.deleteTable }]);
    enabled(deleteMenu);
    const insertAbove = button('在上方插入', 'insertAbove', cmd.insertAbove, { size: 'large' });
    const insertBelow = button('在下方插入', 'insertBelow', cmd.insertBelow, { text: '在下方插入' });
    const insertLeft = button('在左侧插入', 'insertLeft', cmd.insertLeft, { text: '在左侧插入' });
    const insertRight = button('在右侧插入', 'insertRight', cmd.insertRight, { text: '在右侧插入' });
    const insertCells = button('插入单元格…', 'insertCells', cmd.insertCells);
    const tableAction = value => () => { c.tableActions.value = value; c.tableActions.dispatchEvent(new Event('change', { bubbles: true })); };
    const paragraphBefore = button('前面添加段落', 'paragraphBefore', tableAction('before'));
    const paragraphAfter = button('后面添加段落', 'paragraphAfter', tableAction('after'));
    const merge = button('合并单元格', 'mergeCells', cmd.mergeCells, { text: '合并单元格' }); when(merge, canMerge);
    const splitCells = button('拆分单元格…', 'splitCells', cmd.splitCells, { text: '拆分单元格' });
    const splitTable = button('拆分表格', 'splitTable', cmd.splitTable, { text: '拆分表格' });
    const autofit = menuButton('自动调整', 'autofit', () => [
      { label: '根据内容自动调整表格', icon: 'autofit', disabled: !inTable(), onSelect: () => cmd.autofit('contents') },
      { label: '根据窗口自动调整表格', icon: 'fitWindow', disabled: !inTable(), onSelect: () => cmd.autofit('window') },
      { label: '固定列宽', icon: 'columnWidth', disabled: !inTable(), onSelect: () => cmd.autofit('fixed') }]);
    enabled(autofit);
    const sizeInput = (key, label) => {
      const input = el('input.canvas-spacing.ribbon-number', { type: 'number', step: 0.01, min: 0.1, max: 22, 'aria-label': `${label} (英寸)`, placeholder: '',
        onchange: () => {
          if (!amountInRange(input)) { input.reportValidity(); return; }
          const twips = Math.round(Number(input.value) * 1440);
          withTable((m, b, engine) => key === 'height' ? T.setSelectedRowHeight(m, twips, null) : T.setSelectedColumnWidth(m, twips, { widths: widthsOf(engine, b.table) }));
        },
        onkeydown: e => { if (e.key === 'Enter' && !isComposing(e)) { e.preventDefault(); input.dispatchEvent(new Event('change')); } } });
      when(input, inTable);
      sizeInputs.push({ input, key });
      return spin(label, key === 'height' ? 'rowHeight' : 'columnWidth', input, '英寸');
    };
    const distributeRows = button('平均分布各行', 'distributeRows', cmd.distributeRows);
    const distributeColumns = button('平均分布各列', 'distributeColumns', cmd.distributeColumns);
    small(c.rowHeight, { icon: 'rowHeight' });
    small(c.keepRow, { icon: 'keepRow' });
    const alignGrid = el('div.table-align-grid', { role: 'group', 'aria-label': '单元格对齐方式' }, ...ALIGNMENTS.map(([v, h]) => {
      const b = button(ALIGN_NAMES[`${v}-${h}`], `cellAlign${v[0].toUpperCase() + v.slice(1)}${h[0].toUpperCase() + h.slice(1)}`, () => cmd.align(v, h));
      when(b, inTable, () => String(alignmentState() === `${v}-${h}`));
      return b;
    }));
    const direction = button('文字方向', 'textDirection', cmd.textDirection, { size: 'large' });
    large(c.cellMargins, { label: '单元格边距', icon: 'cellMargins' });
    small(c.cellAlignment, { icon: 'cellAlignment' });
    const sort = button('排序', 'sortTable', cmd.sort, { size: 'large', text: '排序' });
    const repeatHeader = button('重复标题行', 'repeatHeader', cmd.repeatHeader, { text: '重复标题行', attrs: { 'aria-pressed': 'false' } });
    when(repeatHeader, () => inTable() && !block()?.table.parentCellId, () => String(headerOn()));
    const toText = button('转换为文本', 'convertToText', cmd.convertToText, { text: '转换为文本' });
    const formula = button('公式', 'formula', cmd.formula, { text: '公式' });
    const layout = [
      { id: 'table', label: '表格', icon: 'tableProperties', priority: 7, items: [rows([select], [gridlines], [c.tableProperties])] },
      { id: 'draw', label: '绘制', icon: 'drawTable', priority: 2, items: [rows([draw], [eraser])] },
      { id: 'rowsColumns', label: '行和列', icon: 'insertBelow', priority: 8, items: [deleteMenu, insertAbove, rows([insertBelow], [insertLeft], [insertRight]), rows([paragraphBefore], [paragraphAfter]), el('div.ribbon-launcher', {}, insertCells)] },
      { id: 'merge', label: '合并', icon: 'mergeCells', priority: 6, items: [rows([merge], [splitCells], [splitTable])] },
      { id: 'cellSize', label: '单元格大小', icon: 'rowHeight', priority: 7, items: [autofit, el('div.ribbon-spin-group', {}, sizeInput('height', '高度'), sizeInput('width', '宽度')), rows([distributeRows, c.keepRow], [distributeColumns, c.rowHeight])] },
      { id: 'alignment', label: '对齐方式', icon: 'cellAlignment', priority: 5, items: [alignGrid, direction, c.cellMargins, el('div.ribbon-launcher', {}, c.cellAlignment)] },
      { id: 'data', label: '数据', icon: 'repeatHeader', priority: 3, items: [sort, rows([repeatHeader], [toText], [formula])] },
    ];
    return {
      design, layout,
      refresh() {
        gallery.refresh();
        const engine = editor(), b = block();
        for (const { input, key } of sizeInputs) {
          if (document.activeElement === input) continue;
          if (!b || !engine) { input.value = ''; continue; }
          // Width: each selected cell of the top row, which is what the spinner sets.
          const value = key === 'height' ? rowHeightsOf(engine, b.table).slice(b.top, b.bottom + 1) : (() => {
            const w = widthsOf(engine, b.table);
            return w.length ? rowGrid(b.table.rows[b.top]).filter(c => c.column >= b.left && c.end <= b.right).map(c => w.slice(c.column, c.end).reduce((x, y) => x + y, 0)) : [];
          })();
          const v = value.length && value.every(x => Math.abs(x - value[0]) < 8) ? String(Number((value[0] / 1440).toFixed(2))) : '';
          if (input.value !== v) input.value = v;
        }
        direction.title = `文字方向: ${DIRECTION_LABELS[b && cellBlockPlacements(b.table, b)[0]?.cell.textDirection || 'lrTb']}`;
        penColor.querySelector('.ribbon-pen-indicator')?.remove();
        penColor.prepend(el('span.ribbon-pen-indicator', { style: { background: pen.color === 'auto' ? 'currentColor' : `#${pen.color}` }, 'aria-hidden': 'true' }));
      },
    };
  }
  const sizeInputs = [];
  function alignmentState() {
    const m = model(), b = block(); if (!m || !b) return null;
    if (!('alignment' in memo)) memo.alignment = measureAlignment(m, b);
    return memo.alignment;
  }
  function measureAlignment(m, b) {
    const cells = cellBlockPlacements(b.table, b).map(p => p.cell);
    const vertical = cells.every(cell => (cell.vertical || 'top') === (cells[0].vertical || 'top')) ? cells[0].vertical || 'top' : null;
    const ids = new Set(cells.map(c => c.id)), aligns = new Set(m.paragraphs.filter(p => ids.has(p.cellId)).map(p => p.format?.alignment || 'left'));
    const horizontal = aligns.size === 1 ? [...aligns][0] : null;
    return vertical && horizontal ? `${vertical}-${horizontal === 'both' ? 'left' : horizontal}` : null;
  }

  /* ---- Menus ---- */
  function tableMenu() {
    const on = !!inTable(), editable = !!ready();
    return [
      { label: '绘制表格', icon: 'drawTable', checked: modes.draw, disabled: !editable, onSelect: () => setMode('draw', !modes.draw) },
      { separator: true },
      { label: '插入', icon: 'insertBelow', items: [
        { label: '表格…', icon: 'table', disabled: !editable, onSelect: insertTableDialog }, { separator: true },
        { label: '在左侧插入列', icon: 'insertLeft', disabled: !on, onSelect: cmd.insertLeft }, { label: '在右侧插入列', icon: 'insertRight', disabled: !on, onSelect: cmd.insertRight }, { separator: true },
        { label: '在上方插入行', icon: 'insertAbove', disabled: !on, onSelect: cmd.insertAbove }, { label: '在下方插入行', icon: 'insertBelow', disabled: !on, onSelect: cmd.insertBelow }, { separator: true },
        { label: '插入单元格…', icon: 'insertCells', disabled: !on, onSelect: cmd.insertCells }] },
      { label: '删除', icon: 'deleteTable', items: [
        { label: '表格', icon: 'deleteTable', disabled: !on, onSelect: cmd.deleteTable }, { label: '列', icon: 'deleteColumn', disabled: !on, onSelect: cmd.deleteColumns },
        { label: '行', icon: 'deleteRow', shortcut: MOD_KEY === 'Cmd' ? 'Cmd+Ctrl+X' : null, disabled: !on, onSelect: cmd.deleteRows }, { label: '单元格…', icon: 'deleteCells', disabled: !on, onSelect: cmd.deleteCells }] },
      { label: '选择', icon: 'selectTable', items: [['table', '表格'], ['column', '列'], ['row', '行'], ['cell', '单元格']].map(([kind, label]) => ({ label, disabled: !on, onSelect: () => selectKind(kind) })) },
      { label: '合并单元格', icon: 'mergeCells', disabled: !on || !canMerge(), onSelect: cmd.mergeCells },
      { label: '拆分单元格…', icon: 'splitCells', disabled: !on, onSelect: cmd.splitCells },
      { label: '拆分表格', icon: 'splitTable', disabled: !on, onSelect: cmd.splitTable },
      { separator: true },
      { label: '自动调整和分布', icon: 'autofit', items: [
        { label: '根据内容自动调整', disabled: !on, onSelect: () => cmd.autofit('contents') }, { label: '根据窗口自动调整', disabled: !on, onSelect: () => cmd.autofit('window') },
        { label: '固定列宽', disabled: !on, onSelect: () => cmd.autofit('fixed') }, { separator: true },
        { label: '平均分布各行', icon: 'distributeRows', disabled: !on, onSelect: cmd.distributeRows }, { label: '平均分布各列', icon: 'distributeColumns', disabled: !on, onSelect: cmd.distributeColumns }] },
      { label: '重复标题行', icon: 'repeatHeader', checked: headerOn(), disabled: !on || !!block()?.table.parentCellId, onSelect: cmd.repeatHeader },
      { separator: true },
      { label: '转换', icon: 'convertToTable', items: [
        { label: '文本转换成表格…', icon: 'convertToTable', disabled: !editable || !canConvertText(), onSelect: convertTextToTable },
        { label: '表格转换成文本…', icon: 'convertToText', disabled: !on, onSelect: convertToText }] },
      { label: '排序…', icon: 'sortTable', disabled: !on, onSelect: sortDialog },
      { label: '公式…', icon: 'formula', disabled: !editable, onSelect: formulaDialog },
      { label: '查看网格线', icon: 'gridlines', checked: viewGridlines, onSelect: toggleGridlines },
      { separator: true },
      { label: '表格属性…', icon: 'tableProperties', disabled: !on, onSelect: openProperties },
    ];
  }
  function extendMenu(id) {
    if (id === 'table') return tableMenu();
    if (id === 'insert') return [{ label: '表格…', icon: 'table', disabled: !ready(), onSelect: insertTableDialog }];
    return [];
  }
  function contextMenuItems(context) {
    if (context !== 'table' || !ready() || !inTable()) return [];
    return [
      { separator: true },
      { label: '插入', icon: 'insertBelow', items: [
        { label: '在左侧插入列', icon: 'insertLeft', onSelect: cmd.insertLeft }, { label: '在右侧插入列', icon: 'insertRight', onSelect: cmd.insertRight },
        { label: '在上方插入行', icon: 'insertAbove', onSelect: cmd.insertAbove }, { label: '在下方插入行', icon: 'insertBelow', onSelect: cmd.insertBelow },
        { label: '插入单元格…', icon: 'insertCells', onSelect: cmd.insertCells }] },
      { label: '删除', icon: 'deleteTable', items: [
        { label: '删除单元格…', icon: 'deleteCells', onSelect: cmd.deleteCells }, { label: '删除列', icon: 'deleteColumn', onSelect: cmd.deleteColumns },
        { label: '删除行', icon: 'deleteRow', onSelect: cmd.deleteRows }, { label: '删除表格', icon: 'deleteTable', onSelect: cmd.deleteTable }] },
      { label: '合并单元格', icon: 'mergeCells', disabled: !canMerge(), onSelect: cmd.mergeCells },
      { label: '拆分单元格…', icon: 'splitCells', onSelect: cmd.splitCells },
      { label: '边框', icon: 'cellBorders', items: borderItems() },
      { label: '单元格对齐方式', icon: 'cellAlignment', items: ALIGNMENTS.map(([v, h]) => ({ label: ALIGN_NAMES[`${v}-${h}`], icon: `cellAlign${v[0].toUpperCase() + v.slice(1)}${h[0].toUpperCase() + h.slice(1)}`, checked: alignmentState() === `${v}-${h}`, onSelect: () => cmd.align(v, h) })) },
      { label: '自动调整', icon: 'autofit', items: [{ label: '根据内容自动调整', onSelect: () => cmd.autofit('contents') }, { label: '根据窗口自动调整', onSelect: () => cmd.autofit('window') }, { label: '固定列宽', onSelect: () => cmd.autofit('fixed') }] },
      { label: '文字方向', icon: 'textDirection', items: Object.entries(DIRECTION_LABELS).map(([value, label]) => ({ label, radio: true, checked: (cellBlockPlacements(block().table, block())[0]?.cell.textDirection || 'lrTb') === value, onSelect: () => withTable(m => T.setTextDirection(m, value)) })) },
      { label: '表格属性…', icon: 'tableProperties', onSelect: openProperties },
    ];
  }

  /* ---- Engine attachment: pointer tools, gridlines and keys ---- */
  function attach(engine) {
    pointer?.detach();
    engine.showTableGridlines = viewGridlines;
    pointer = attachTablePointer(engine, {
      readOnly: () => !!pkg()?.readOnly, widths: table => widthsOf(engine, table), heights: table => rowHeightsOf(engine, table), error, onChange,
      onModeEnd: () => { for (const key of Object.keys(modes)) modes[key] = false; onChange(); },
      deleteCellsDialog: () => cellsDialog('delete'),
    });
    pointer.setMode(currentMode(), pen);
  }

  return {
    commands: {
      tableRibbon, tableInsertMenuItems: insertMenuItems, openTableProperties: openProperties, insertTableDialog, convertTextToTable, tableCommands: cmd,
    },
    extendMenu, contextMenuItems, attach,
    refresh() { pointer?.refresh(); },
    destroy() { pointer?.detach(); pointer = null; },
  };
}
