/**
 * Recipient lists: typing a new list in a grid, customizing its columns, and the Edit Recipient List
 * dialog (include or exclude rows, sort, filter, find duplicates, check addresses).
 */
import { el, fieldId, isComposing } from '../ui/dom.js';
import { dialog, field, select, input, checkbox, button } from './mailings-ui.js';
import { visibleRows, duplicateRows, validateAddresses, FILTER_OPERATORS, DEFAULT_COLUMNS, autoMatchFields } from '../engine/merge-fields.js';

/** Enter in a list's search field only searches: it must not submit, and close, the dialog around it. */
const stayOnEnter = e => { if (e.key === 'Enter' && !isComposing(e)) e.preventDefault(); };

const PAGE = 200;
const clone = list => structuredClone(list);

/**
 * The grid editor for a list's entries (Type a New List, Edit entries). onSave(list, renamed) receives the
 * edited copy and, for each of the list's original column names, its name now (null when it was removed).
 */
export function openRecipientGrid({ list, title = '新建地址列表', onSave }) {
  const draft = clone(list || { columns: [...DEFAULT_COLUMNS], rows: [], sort: [], filters: [] });
  const renamed = new Map(draft.columns.map(column => [column, column]));
  if (!draft.rows.length) draft.rows.push({ values: draft.columns.map(() => ''), included: true });
  let page = 0, query = '';
  const table = el('table.mm-grid', { role: 'grid', 'aria-label': '收件人条目' });
  const status = el('span.mm-grid-status', { role: 'status' });
  const pager = el('div.mm-pager');
  const matches = () => draft.rows.map((row, i) => i).filter(i => !query || draft.rows[i].values.some(v => String(v).toLowerCase().includes(query)));
  let focusCell = null;
  function render() {
    const rows = matches(), pages = Math.max(1, Math.ceil(rows.length / PAGE));
    page = Math.min(page, pages - 1);
    const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
    table.replaceChildren(
      el('thead', {}, el('tr', {}, el('th.mm-grid-num', { scope: 'col' }, '#'), ...draft.columns.map(c => el('th', { scope: 'col' }, c)))),
      el('tbody', {}, ...shown.map(index => el('tr', { 'data-row': index },
        el('th.mm-grid-num', { scope: 'row' }, String(index + 1)),
        ...draft.columns.map((column, c) => el('td', {}, el('input.mm-cell', { type: 'text', value: draft.rows[index].values[c] ?? '', 'aria-label': `${column}，条目 ${index + 1}`, autocomplete: 'off', spellcheck: 'false',
          oninput: e => { draft.rows[index].values[c] = e.target.value; }, onfocus: () => { focusCell = { index, c }; } })))))));
    status.textContent = `共 ${draft.rows.length} 条条目${query ? ` · 显示 ${rows.length} 条` : ''}`;
    pager.replaceChildren(...(pages > 1 ? [button('上一页', () => { page--; render(); }, 'btn-ghost', { disabled: page === 0 }), el('span', {}, `第 ${page + 1} / ${pages} 页`), button('下一页', () => { page++; render(); }, 'btn-ghost', { disabled: page >= pages - 1 })] : []));
  }
  const focus = (index, c = 0) => queueMicrotask(() => table.querySelector(`tr[data-row="${index}"] td:nth-of-type(${c + 1}) input`)?.focus());
  const addEntry = () => {
    draft.rows.push({ values: draft.columns.map(() => ''), included: true });
    query = ''; search.value = ''; page = Math.floor((draft.rows.length - 1) / PAGE); render(); focus(draft.rows.length - 1);
  };
  const deleteEntry = () => {
    // The entry being edited, or else the last one shown; never one the search hides, which the person cannot see.
    const shown = matches(), visible = shown.slice(page * PAGE, page * PAGE + PAGE);
    const index = focusCell && visible.includes(focusCell.index) ? focusCell.index : visible.at(-1);
    if (index === undefined) return;
    if (index < 0 || !draft.rows[index]) return;
    draft.rows.splice(index, 1);
    if (!draft.rows.length) draft.rows.push({ values: draft.columns.map(() => ''), included: true });
    // The entries after it moved up: the focused cell is known again when the next one takes the focus.
    const column = focusCell?.c ?? 0; focusCell = null;
    render(); focus(Math.min(index, draft.rows.length - 1), column);
  };
  // Enter moves down a column; on the last entry it starts a new one.
  table.addEventListener('keydown', e => {
    // Enter that confirms an input method's conversion (a name typed in Japanese) belongs to the composition.
    if (e.key !== 'Enter' || isComposing(e) || !e.target.matches('.mm-cell')) return;
    e.preventDefault();
    const { index, c } = focusCell || {};
    if (index === undefined) return;
    if (index === draft.rows.length - 1) addEntry(); else focus(index + 1, c);
  });
  const search = input('', { type: 'search', placeholder: '在列表中查找', 'aria-label': '在列表中查找', oninput: () => { query = search.value.trim().toLowerCase(); page = 0; render(); }, onkeydown: stayOnEnter });
  const customize = button('自定义列…', () => openColumns(draft.columns, (columns, mapping) => {
    draft.rows = draft.rows.map(row => ({ ...row, values: mapping.map(from => from === null ? '' : row.values[from] ?? '') }));
    for (const [original, current] of renamed) {
      const at = mapping.indexOf(draft.columns.indexOf(current));
      renamed.set(original, current !== null && at >= 0 ? columns[at] : null);
    }
    draft.columns = columns;
    draft.sort = (draft.sort || []).filter(s => columns.includes(s.column));
    draft.filters = (draft.filters || []).filter(f => columns.includes(f.column));
    render();
  }));
  render();
  const modal = dialog({ title, size: 'xwide', submit: '确定', body: [
    el('div.mm-toolbar', {}, button('新建条目', addEntry), button('删除条目', deleteEntry), customize, el('span.grow'), search),
    el('div.mm-grid-wrap', {}, table), el('div.mm-grid-foot', {}, status, pager),
  ], onSubmit: () => {
    const rows = draft.rows.filter(row => row.values.some(v => String(v).trim()));
    if (!rows.length) throw new Error('请至少键入一个条目，或按“取消”。');
    onSave({ ...draft, rows: rows.map(row => ({ ...row, values: row.values.map(v => String(v ?? '').trim()) })) }, renamed);
  }, focus: table.querySelector('input') });
  return modal;
}

/** Rename, add, remove and reorder columns. onDone(columns, mapping) where mapping[i] is the old index of new column i, or null. */
export function openColumns(columns, onDone) {
  let entries = columns.map((name, i) => ({ name, from: i }));
  let selected = 0;
  const listbox = el('div.mm-columns', { role: 'listbox', 'aria-label': '列', tabindex: 0 });
  const optionId = fieldId('mm-column');
  const render = () => {
    listbox.replaceChildren(...entries.map((entry, i) => el('div.mm-column-item', { role: 'option', id: `${optionId}-${i}`, 'aria-selected': String(i === selected), onclick: () => { selected = i; render(); } }, entry.name)));
    // Focus stays on the list; the chosen column is its active option for assistive technology.
    if (entries[selected]) listbox.setAttribute('aria-activedescendant', `${optionId}-${selected}`); else listbox.removeAttribute('aria-activedescendant');
  };
  listbox.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(entries.length - 1, selected + 1); render(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(0, selected - 1); render(); }
  });
  const name = input('', { 'aria-label': '列名', placeholder: '列名' });
  const unique = (value, except = -1) => !entries.some((e, i) => i !== except && e.name.toLowerCase() === value.toLowerCase());
  const add = () => {
    const value = name.value.trim(); if (!value) { name.focus(); return; }
    if (!unique(value)) { modal.error('已存在同名的列。'); return; }
    entries.splice(selected + 1, 0, { name: value, from: null }); selected++; name.value = ''; modal.error(''); render();
  };
  const rename = () => {
    const value = name.value.trim(); if (!value || !entries[selected]) return;
    if (!unique(value, selected)) { modal.error('已存在同名的列。'); return; }
    entries[selected].name = value; name.value = ''; modal.error(''); render();
  };
  const remove = () => { if (entries.length <= 1) { modal.error('列表至少需要一列。'); return; } entries.splice(selected, 1); selected = Math.min(selected, entries.length - 1); render(); };
  const move = d => { const to = selected + d; if (to < 0 || to >= entries.length) return; [entries[selected], entries[to]] = [entries[to], entries[selected]]; selected = to; render(); };
  render();
  const modal = dialog({ title: '自定义列', body: [
    el('div.mm-columns-layout', {}, listbox, el('div.mm-column-buttons', {},
      button('上移', () => move(-1)), button('下移', () => move(1)), button('删除', remove))),
    el('div.mm-inline', {}, field('名称', name), button('添加', add), button('重命名', rename)),
    el('p.field-hint', {}, '删除列将同时从每个条目中删除其对应值。'),
  ], onSubmit: () => onDone(entries.map(e => e.name), entries.map(e => e.from)) });
  return modal;
}

/** Choose a worksheet from a workbook with several. Resolves the index, or null. */
export function chooseSheet(names) {
  return new Promise(resolve => {
    let chosen = null;
    const choice = select(names.map((n, i) => [String(i), n]), '0', { 'aria-label': '工作表' });
    dialog({ title: '选择工作表', body: [el('p.modal-text', {}, '此工作簿包含多个工作表。请选择包含收件人的工作表；其首行应为列名。'), field('工作表', choice)],
      onSubmit: () => { chosen = Number(choice.value); }, onClose: () => resolve(chosen) });
  });
}

/**
 * The Edit Recipient List dialog. `state` is the mail merge state; onApply(list, mapping) saves.
 * Includes sorting by column, filters, duplicates, address checks and editing entries.
 */
export function openRecipientList({ state, onApply, onEditEntries }) {
  const draft = clone(state.list);
  const mapping = { ...(state.mapping && Object.keys(state.mapping).length ? state.mapping : autoMatchFields(draft.columns)) };
  let query = '', page = 0;
  const table = el('table.mm-grid.mm-recipients', { 'aria-label': '收件人' });
  const summary = el('span.mm-grid-status', { role: 'status' });
  const pager = el('div.mm-pager');
  const sortState = column => { const key = draft.sort?.[0]; return key?.column === column ? (key.descending ? 'descending' : 'ascending') : 'none'; };
  const sortBy = column => {
    const current = sortState(column);
    draft.sort = current === 'none' ? [{ column, descending: false }] : current === 'ascending' ? [{ column, descending: true }] : [];
    render();
  };
  function rows() {
    const visible = visibleRows(draft);
    return query ? visible.filter(({ row }) => row.values.some(v => String(v).toLowerCase().includes(query))) : visible;
  }
  function render() {
    const list = rows(), pages = Math.max(1, Math.ceil(list.length / PAGE));
    page = Math.min(page, pages - 1);
    // Sorting or including every row redraws the table: keyboard focus returns to the same control.
    const focusKey = table.contains(document.activeElement) || pager.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') || document.activeElement.title || document.activeElement.textContent : null;
    const all = list.length && list.every(({ row }) => row.included !== false);
    const allBox = el('input', { type: 'checkbox', 'aria-label': '包含所有显示的收件人', onchange: e => { for (const { row } of list) row.included = e.target.checked; render(); } });
    allBox.checked = !!all; allBox.indeterminate = !all && list.some(({ row }) => row.included !== false);
    table.replaceChildren(
      el('thead', {}, el('tr', {}, el('th.mm-grid-check', { scope: 'col' }, allBox), ...draft.columns.map(column => el('th', { scope: 'col', 'aria-sort': sortState(column) },
        el('button.mm-sort', { type: 'button', onclick: () => sortBy(column), title: `按 ${column} 排序` }, column, el('span.mm-sort-mark', { 'aria-hidden': 'true' }, { ascending: ' ▲', descending: ' ▼', none: '' }[sortState(column)])))))),
      el('tbody', {}, ...list.slice(page * PAGE, page * PAGE + PAGE).map(({ row, number }) => {
        const box = el('input', { type: 'checkbox', 'aria-label': `包含收件人 ${number}`, onchange: e => { row.included = e.target.checked; renderSummary(); } });
        box.checked = row.included !== false;
        return el('tr', { class: row.included === false ? 'is-excluded' : '' }, el('td.mm-grid-check', {}, box), ...draft.columns.map((_, i) => el('td', {}, row.values[i] ?? '')));
      })));
    pager.replaceChildren(...(pages > 1 ? [button('上一页', () => { page--; render(); }, 'btn-ghost', { disabled: page === 0 }), el('span', {}, `第 ${page + 1} / ${pages} 页`), button('下一页', () => { page++; render(); }, 'btn-ghost', { disabled: page >= pages - 1 })] : []));
    renderSummary();
    if (focusKey) [...table.querySelectorAll('button, input'), ...pager.querySelectorAll('button')].find(control => !control.disabled && (control.getAttribute('aria-label') || control.title || control.textContent) === focusKey)?.focus();
  }
  function renderSummary() {
    const included = visibleRows(draft).filter(({ row }) => row.included !== false).length;
    const filtered = (draft.filters || []).length ? ' · 已筛选' : '';
    summary.textContent = `将在合并中包含 ${draft.rows.length} 位收件人中的 ${included} 位${filtered}`;
  }
  const search = input('', { type: 'search', placeholder: '查找收件人', 'aria-label': '查找收件人', oninput: () => { query = search.value.trim().toLowerCase(); page = 0; render(); }, onkeydown: stayOnEnter });
  const source = state.source?.name ? `数据源：${state.source.name}` : state.source?.kind === 'typed' ? '数据源：在此文档中键入' : '数据源：存储在此文档中';
  render();
  const modal = dialog({ title: '邮件合并收件人', size: 'xwide', submit: '确定', body: [
    el('p.field-hint', {}, `${source}。取消选中复选框可将该收件人排除在外；单击列名可进行排序。`),
    el('div.mm-toolbar', {},
      button('排序和筛选…', () => openFilter(draft, render)),
      button('查找重复项…', () => openDuplicates(draft, render)),
      button('检查地址…', () => openValidation(draft, mapping)),
      button('编辑条目…', () => onEditEntries(draft, (edited, renamed) => {
        Object.assign(draft, edited);
        // Field matching follows renamed columns, and forgets removed ones, rather than naming columns that are gone.
        for (const [key, column] of Object.entries(mapping)) {
          const now = renamed?.has(column) ? renamed.get(column) : column;
          if (now && draft.columns.includes(now)) mapping[key] = now; else delete mapping[key];
        }
        render();
      })),
      el('span.grow'), search),
    el('div.mm-grid-wrap', {}, table), el('div.mm-grid-foot', {}, summary, pager),
  ], onSubmit: () => onApply(draft, mapping) });
  return modal;
}

/** Sort keys and filter conditions for a list (edited in place). */
export function openFilter(list, done) {
  const columns = [['', '(无)'], ...list.columns.map(c => [c, c])];
  const conditions = el('div.mm-conditions');
  const rows = [];
  const addRow = (filter = {}) => {
    const join = select([['and', '并且'], ['or', '或者']], filter.join || 'and', { 'aria-label': '关系' });
    const column = select(columns, filter.column || '', { 'aria-label': '字段' });
    const operator = select(FILTER_OPERATORS, filter.operator || 'equals', { 'aria-label': '比较' });
    const value = input(filter.value || '', { 'aria-label': '比对值' });
    const sync = () => { value.disabled = ['empty', 'notEmpty'].includes(operator.value); };
    operator.addEventListener('change', sync); sync();
    const row = el('div.mm-condition', {}, join, column, operator, value);
    rows.push({ join, column, operator, value });
    if (rows.length === 1) join.style.visibility = 'hidden';
    conditions.append(row);
  };
  for (const filter of list.filters || []) addRow(filter);
  while (rows.length < 3) addRow();
  const keys = [0, 1, 2].map(i => {
    const key = list.sort?.[i] || {};
    return { column: select(columns, key.column || '', { 'aria-label': `主要关键字 ${i + 1}` }), order: select([['asc', '升序'], ['desc', '降序']], key.descending ? 'desc' : 'asc', { 'aria-label': `次序 ${i + 1}` }) };
  });
  return dialog({ title: '排序和筛选', size: 'wide', body: [
    el('h3.mm-subhead', {}, '筛选记录'), conditions, el('div.row', {}, button('添加条件', () => addRow())),
    el('h3.mm-subhead', {}, '排序记录'), el('div.mm-sort-keys', {}, ...keys.map((k, i) => el('div.mm-condition', {}, el('span.mm-key-label', {}, i ? '然后按' : '主要关键字'), k.column, k.order))),
  ], actions: [button('全部清除', () => { for (const r of rows) { r.column.value = ''; r.value.value = ''; } for (const k of keys) k.column.value = ''; })],
  onSubmit: () => {
    list.filters = rows.filter(r => r.column.value).map(r => ({ column: r.column.value, operator: r.operator.value, value: r.value.value, join: r.join.value }));
    list.sort = keys.filter(k => k.column.value).map(k => ({ column: k.column.value, descending: k.order.value === 'desc' }));
    done();
  } });
}

/** Groups of matching entries; clearing a check box leaves that duplicate out of the merge. */
export function openDuplicates(list, done) {
  const columns = el('div.mm-chips', { role: 'group', 'aria-label': '比较列' });
  const boxes = list.columns.map(c => { const box = checkbox(c, /name|address|street|city|zip|postal|email/i.test(c)); columns.append(box); return box; });
  const result = el('div.mm-duplicates');
  const choices = new Map();
  const find = () => {
    const chosen = list.columns.filter((_, i) => boxes[i].input.checked);
    const groups = chosen.length ? duplicateRows(list, chosen) : [];
    choices.clear();
    result.replaceChildren(groups.length ? el('p.field-hint', {}, `找到 ${groups.length} 组匹配条目。请保留您想要合并的条目。`) : el('p.field-hint', {}, '没有重复条目。'),
      ...groups.map((group, g) => el('fieldset.mm-dup-group', {}, el('legend', {}, `第 ${g + 1} 组`), ...group.map((number, i) => {
        const row = list.rows[number - 1];
        const box = checkbox(`${number}. ${row.values.filter(Boolean).slice(0, 4).join(', ')}`, i === 0);
        choices.set(number, box.input);
        return box;
      }))));
  };
  for (const b of boxes) b.input.addEventListener('change', find);
  find();
  return dialog({ title: '查找重复项', size: 'wide', body: [el('p.field-hint', {}, '当这些列具有相同值时条目匹配（忽略大小写和多余空格）。'), columns, result], onSubmit: () => {
    for (const [number, box] of choices) list.rows[number - 1].included = box.checked;
    done();
  } });
}

/** A report of entries whose addresses look incomplete. */
export function openValidation(list, mapping) {
  const report = validateAddresses(list, mapping);
  return dialog({ title: '检查地址', submit: null, cancel: '关闭', size: 'wide', body: report.length
    ? [el('p.field-hint', {}, `包含的条目中有 ${report.length} 个可能需要注意。这些是针对缺失部分和常见格式的简单检查，不会联网查询地址。`),
      el('ul.mm-report', {}, ...report.slice(0, 300).map(r => el('li', {}, el('strong', {}, `条目 ${r.number}：`), list.rows[r.number - 1].values.filter(Boolean).slice(0, 3).join(', '), el('br'), el('span.muted', {}, r.problems.join(' · ')))))]
    : [el('p.modal-text', {}, '在已匹配的列中，每个包含的条目都具有姓名、街道、城市和邮政编码。')] });
}
