/**
 * The view toolbar and its panels: hide fields, filter, group, sort, row
 * colors, row height, view settings for cards, calendars and timelines,
 * and sharing (download, print, copy link).
 */
import { h, debounce, fill, keepFocus } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { chipColors, accentColor, HUES } from '../lib/colors.js';
import { TYPES, valueKind, isComputed } from '../data/fields.js';
import { orderedFields, ROW_HEIGHTS, countConditions, newConditionId, emptyFilter, canStack } from '../data/views.js';
import { operatorsFor, defaultOp, NO_VALUE_OPS, DATE_MODES, WITHIN_MODES, FILE_TYPES, isActive } from '../data/query.js';
import { openPopover } from './popover.js';
import { openMenu } from './menu.js';
import { exportCsv, printView } from './exporter.js';
import { sortLabels } from './fieldeditor.js';
import { calendar } from './datepicker.js';
import { formatDate } from '../lib/format.js';
import { toast } from './toast.js';

// The label is the button's name, and its tooltip on narrow screens, where
// only the icon shows.
function toolButton(cls, ic, label, { on = false } = {}) {
  return h(`button.tool-btn.t-${cls}${on ? '.on' : ''}`, { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'data-tip': label, 'aria-label': label }, icon(ic, 16), h('span.tool-label', label));
}

/**
 * Options to choose a field. When the chosen one is not among them (none
 * chosen yet, or deleted), a placeholder shows, so picking the first field
 * is a change.
 */
function fieldOptions(fields, current) {
  const options = fields.map((f) => h('option', { value: f.id, selected: f.id === current }, f.name));
  if (!fields.some((f) => f.id === current)) options.unshift(h('option', { value: '', disabled: true, selected: true }, '选择字段'));
  return options;
}

/** Toggle a panel from a toolbar button. */
function panelFrom(btn, build, opts = {}) {
  btn.addEventListener('click', () => {
    if (btn._pop && !btn._pop.closed) {
      btn._pop.close();
      return;
    }
    const content = build();
    btn._pop = openPopover(btn, content, { className: `padded tool-panel${opts.wide ? ' wide' : ''}`, label: opts.label, placement: 'bottom-start', beforeClose: () => content.flush?.() });
  });
  return btn;
}

export function renderToolbar(host, page, table, view) {
  const base = page.base;
  const update = (patch, label) => base.updateView(table.id, view.id, patch, { label });
  const items = [];
  const hiddenCount = (view.hidden || []).filter((id) => table.field(id) && id !== table.schema.primaryFieldId).length;
  const cards = view.type === 'kanban' || view.type === 'gallery' || view.type === 'calendar' || view.type === 'timeline';
  if (view.type === 'form') {
    host.replaceChildren(h('span.muted', { style: { padding: '0 8px' } }, '在左侧构建表单，然后打开进行填写。'));
    return;
  }
  if (view.type === 'kanban') {
    // Only a field the board can stack by (as the board itself shows).
    const f = table.field(view.stackFieldId);
    items.push(panelFrom(toolButton('stack', 'vKanban', canStack(f) ? `按 ${f.name} 堆叠` : '选择堆叠字段', { on: false }), () => kanbanPanel(page, table, view, update), { label: '堆叠设置' }));
  }
  if (view.type === 'calendar' || view.type === 'timeline') {
    const f = table.field(view.dateFieldId);
    items.push(panelFrom(toolButton('dates', 'fDate', f ? (view.endFieldId && table.field(view.endFieldId) ? `${f.name} 至 ${table.field(view.endFieldId).name}` : f.name) : '选择日期字段'), () => datesPanel(page, table, view, update), { label: '日期设置' }));
  }
  if (view.type === 'gallery') {
    items.push(panelFrom(toolButton('cover', 'image', '封面'), () => coverPanel(table, view, update), { label: '卡片封面' }));
  }
  items.push(panelFrom(toolButton('hide', cards ? 'layers' : 'eyeOff', cards ? '自定义卡片' : hiddenCount ? `已隐藏 ${hiddenCount} 个字段` : '隐藏字段', { on: !cards && !!hiddenCount }), () => hidePanel(page, table, view, update, cards), { label: cards ? '卡片显示的字段' : '隐藏字段' }));
  const nFilter = countConditions(view.filters, isActive);
  items.push(panelFrom(toolButton('filter', 'filter', nFilter ? `按 ${filterSummary(table, view)} 筛选` : '筛选', { on: !!nFilter }), () => filterPanel(page, table, view, update), { label: '筛选', wide: true }));
  if (view.type === 'grid' || view.type === 'list') {
    const nGroup = view.groups?.length || 0;
    items.push(panelFrom(toolButton('group', 'group', nGroup ? `按 ${nGroup} 个字段分组` : '分组', { on: !!nGroup }), () => levelsPanel(page, table, view, update, 'groups'), { label: '分组' }));
  }
  if (view.type !== 'calendar') {
    const nSort = view.sorts?.length || 0;
    items.push(panelFrom(toolButton('sort', 'arrowUpDown', nSort ? `按 ${nSort} 个字段排序` : '排序', { on: !!nSort }), () => levelsPanel(page, table, view, update, 'sorts'), { label: '排序' }));
  }
  if (view.type === 'grid' || view.type === 'list' || view.type === 'kanban' || view.type === 'calendar' || view.type === 'timeline' || view.type === 'gallery') {
    const on = view.color && view.color.type !== 'none';
    items.push(panelFrom(toolButton('color', 'color', '颜色', { on }), () => colorPanel(page, table, view, update), { label: '记录颜色', wide: true }));
  }
  if (view.type === 'grid') {
    const rh = h('button.tool-btn', { type: 'button', 'aria-label': `行高：${ROW_HEIGHTS[view.rowHeight || 'short'].label}`, 'data-tip': '行高', 'aria-haspopup': 'menu' }, icon('rowHeight', 16));
    rh.addEventListener('click', () => openMenu(rh, Object.entries(ROW_HEIGHTS).map(([k, v]) => ({ label: v.label, checked: (view.rowHeight || 'short') === k, radio: true, onSelect: () => update({ rowHeight: k }, '调整行高') })), { label: '行高' }));
    items.push(rh);
  }
  const share = h('button.tool-btn', { type: 'button', 'aria-haspopup': 'menu', 'aria-label': '分享', 'data-tip': '分享' }, icon('share', 16), h('span.tool-label', '分享'));
  share.addEventListener('click', () => openMenu(share, [
    { label: '下载 CSV', icon: 'download', description: '包含此视图展示的记录与字段。', onSelect: () => exportCsv(base, table, view) },
    { label: '打印视图', icon: 'printer', onSelect: () => printView(base, table, view) },
    { label: '复制此视图链接', icon: 'link', description: '可在任意设备上直接打开此视图。', onSelect: () => navigator.clipboard.writeText(location.href.split('#')[0] + `#/${page.baseId}/${table.id}/${view.id}`).then(() => toast('链接已复制'), () => toast('无法复制链接。', { error: true })) },
  ], { label: '分享与导出', width: 300 }));
  items.push(share);
  // An edit in an open panel redraws the toolbar: the panel stays with its button.
  for (const btn of items) {
    const kind = [...btn.classList].find((c) => c.startsWith('t-'));
    const old = kind && host.querySelector(`.tool-btn.${kind}`);
    if (old?._pop && !old._pop.closed) {
      btn._pop = old._pop;
      btn._pop.reanchor(btn);
    }
  }
  host.replaceChildren(...items);
}

function filterSummary(table, view) {
  const names = [];
  const walk = (g) => {
    for (const c of g?.conditions || []) {
      if (c.conditions) walk(c);
      else if (isActive(c)) {
        const f = table.field(c.fieldId);
        if (f && !names.includes(f.name)) names.push(f.name);
      }
    }
  };
  walk(view.filters);
  if (names.length === 1) return names[0];
  return `${names.length} 个字段`;
}

/* ------------------------------------------------------------ hide fields */

function hidePanel(page, table, view, update, cards) {
  const primary = table.schema.primaryFieldId;
  const search = h('input.input', { type: 'search', placeholder: '查找字段', 'aria-label': '查找字段' });
  const list = h('ul.hide-list');
  let dragId = null;
  const paint = () => {
    const q = search.value.trim().toLowerCase();
    const hidden = new Set(view.hidden || []);
    list.replaceChildren();
    for (const f of orderedFields(table, view)) {
      if (f.id === primary && !cards) continue;
      if (q && !f.name.toLowerCase().includes(q)) continue;
      const cb = h('input.switch', { type: 'checkbox', role: 'switch', checked: !hidden.has(f.id), 'aria-label': `显示 ${f.name}`, disabled: f.id === primary, onchange: () => {
        const set = new Set(view.hidden || []);
        if (cb.checked) set.delete(f.id);
        else set.add(f.id);
        // The switch already shows the change: redrawing would take its focus.
        update({ hidden: [...set] }, cb.checked ? '显示字段' : '隐藏字段');
      } });
      const li = h('li.hide-item', { draggable: 'true' }, h('span.choice-grip', { 'aria-hidden': 'true' }, icon('grip', 14)), h('label.switch-row.grow', cb, icon(TYPES[f.type].icon, 14), h('span.grow', f.name)));
      li.addEventListener('dragstart', (e) => {
        dragId = f.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', f.name);
      });
      li.addEventListener('dragover', (e) => e.preventDefault());
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragId || dragId === f.id || f.id === primary) return;
        const ids = orderedFields(table, view).map((x) => x.id).filter((x) => x !== dragId);
        ids.splice(ids.indexOf(f.id), 0, dragId);
        update({ order: ids }, '调整字段顺序');
        dragId = null;
        paint();
      });
      list.append(li);
    }
  };
  search.addEventListener('input', paint);
  paint();
  const all = (show) => update({ hidden: show ? [] : table.fields.filter((f) => f.id !== primary).map((f) => f.id) }, show ? '显示所有字段' : '隐藏所有字段');
  return h('div.hide-panel', search, list, h('div.popover-footer', h('button.btn.small', { type: 'button', onclick: () => {
    all(false);
    paint();
  } }, '全部隐藏'), h('button.btn.small', { type: 'button', onclick: () => {
    all(true);
    paint();
  } }, '全部显示')));
}

/* ----------------------------------------------------------------- filter */

function filterPanel(page, table, view, update) {
  const base = page.base;
  const host = h('div.filter-panel');
  // Edits happen on a working copy and are saved with a short delay, so
  // typing in a value does not create an undo step per keystroke.
  let filters = structuredClone(view.filters || emptyFilter());
  const commit = () => {
    // The view can go (deleted, or undone) while the panel is open.
    if (base.table(table.id)?.view(view.id)) update({ filters: structuredClone(filters) }, '筛选');
  };
  const save = debounce(commit, 350);
  const saveNow = () => {
    save.cancel();
    commit();
  };
  // Closing the panel saves a value typed just before.
  host.flush = () => save.flush();

  const fieldSelect = (cond, onChange) => {
    const s = h('select.select', { 'aria-label': '字段', onchange: () => onChange(s.value) }, fieldOptions(table.fields, cond.fieldId));
    return s;
  };

  const valueEditor = (cond) => {
    const field = table.field(cond.fieldId);
    if (!field || NO_VALUE_OPS.has(cond.op)) return h('span.filter-value-empty');
    const kind = valueKind(field, base.compute.ctx);
    const set = (v, now = false) => {
      cond.value = v;
      if (now) saveNow();
      else save();
    };
    if (kind === 'checkbox') {
      const cb = h('input', { type: 'checkbox', checked: !!cond.value, 'aria-label': '已勾选', onchange: () => set(cb.checked, true) });
      if (cond.value === null || cond.value === undefined) cond.value = false;
      return h('label.check.filter-value', cb, h('span', '已勾选'));
    }
    if (kind === 'select' && field.type === 'singleSelect' && (cond.op === 'is' || cond.op === 'isNot')) {
      const s = h('select.select.filter-value', { 'aria-label': '值', onchange: () => set(s.value || null, true) }, h('option', { value: '' }, '选择一个选项'), field.options.choices.map((c) => h('option', { value: c.id, selected: cond.value === c.id }, c.name)));
      return s;
    }
    if ((kind === 'select' && field.type === 'singleSelect') || (kind === 'multi' && field.type === 'multipleSelect')) {
      const ids = Array.isArray(cond.value) ? cond.value : cond.value ? [cond.value] : [];
      const btn = h('button.select.filter-value.multi-btn', { type: 'button', 'aria-haspopup': 'menu' });
      const paint = () => {
        const cur = Array.isArray(cond.value) ? cond.value : [];
        btn.replaceChildren(...(cur.length ? cur.map((id) => {
          const c = field.options.choices.find((x) => x.id === id);
          if (!c) return null;
          const [bg, fg] = chipColors(c.color);
          return h('span.chip', { style: { background: bg, color: fg } }, c.name);
        }).filter(Boolean) : [h('span.muted', '选择选项')]));
      };
      cond.value = ids;
      paint();
      btn.addEventListener('click', () => openMenu(btn, () => field.options.choices.map((c) => ({
        label: c.name,
        checked: (cond.value || []).includes(c.id),
        keepOpen: true,
        onSelect: () => {
          const cur = cond.value || [];
          set(cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id], true);
          paint();
        },
      })), { search: field.options.choices.length > 8, label: field.name }));
      return btn;
    }
    if (kind === 'date') {
      const wrap = h('div.filter-value.date-filter');
      const modes = cond.op === 'isWithin' ? WITHIN_MODES : DATE_MODES;
      if (!cond.value || typeof cond.value !== 'object' || !(cond.value.mode in modes)) cond.value = { mode: cond.op === 'isWithin' ? 'pastWeek' : 'today' };
      const modeSel = h('select.select', { 'aria-label': '日期', onchange: () => {
        cond.value = { mode: modeSel.value };
        saveNow();
        render();
      } }, Object.entries(modes).map(([k, l]) => h('option', { value: k, selected: cond.value.mode === k }, l)));
      wrap.append(modeSel);
      const m = cond.value.mode;
      if (m === 'daysAgo' || m === 'daysFromNow' || m === 'pastDays' || m === 'nextDays') {
        const n = h('input.input.small-num', { type: 'number', min: '0', value: cond.value.n ?? '', 'aria-label': '天数', oninput: () => set({ ...cond.value, n: n.value === '' ? null : Number(n.value) }) });
        wrap.append(n);
      }
      if (m === 'exactDate') {
        const btn = h('button.select', { type: 'button' }, cond.value.date ? formatDate(cond.value.date, { dateFormat: 'local' }) : '选择日期');
        btn.addEventListener('click', () => {
          const cal = calendar({ value: cond.value.date, onPick: (d) => {
            set({ mode: 'exactDate', date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }, true);
            pop.close();
            render();
          } });
          const pop = openPopover(btn, cal.el, { className: 'padded', label: '选择日期', focus: false });
          requestAnimationFrame(() => cal.focus());
        });
        wrap.append(btn);
      }
      return wrap;
    }
    if (field.type === 'attachment' && cond.op === 'hasFileType') {
      const s = h('select.select.filter-value', { 'aria-label': '文件类型', onchange: () => set(s.value, true) }, h('option', { value: '' }, '选择类型'), Object.entries(FILE_TYPES).map(([k, l]) => h('option', { value: k, selected: cond.value === k }, l)));
      return s;
    }
    const input = h('input.input.filter-value', { type: kind === 'number' ? 'text' : 'text', inputMode: kind === 'number' ? 'decimal' : 'text', placeholder: '输入值', 'aria-label': '值', value: cond.value ?? '' });
    input.addEventListener('input', () => set(input.value));
    return input;
  };

  const conditionRow = (cond, group, i, depth) => {
    const field = table.field(cond.fieldId);
    const ops = field ? operatorsFor(field, base.compute.ctx) : [];
    const opSel = h('select.select', { 'aria-label': '运算符', onchange: () => {
      const wasNoValue = NO_VALUE_OPS.has(cond.op);
      const prevOp = cond.op;
      cond.op = opSel.value;
      const multiOps = ['isAnyOf', 'isNoneOf'];
      if (wasNoValue || NO_VALUE_OPS.has(cond.op) || multiOps.includes(prevOp) !== multiOps.includes(cond.op) || prevOp === 'isWithin' || cond.op === 'isWithin' || prevOp === 'hasFileType' || cond.op === 'hasFileType') cond.value = null;
      saveNow();
      render();
    } }, ops.map(([k, l]) => h('option', { value: k, selected: cond.op === k }, l)));
    const lead = i === 0 ? h('span.filter-lead', '当满足') : i === 1 ? conjSelect(group) : h('span.filter-lead', group.conjunction === 'or' ? '或' : '且');
    return h('div.filter-row', lead, fieldSelect(cond, (fid) => {
      cond.fieldId = fid;
      cond.op = defaultOp(table.field(fid), base.compute.ctx);
      cond.value = null;
      saveNow();
      render();
    }), opSel, valueEditor(cond), h('button.icon-btn', { type: 'button', 'aria-label': '删除条件', onclick: () => {
      group.conditions.splice(i, 1);
      saveNow();
      render();
    } }, icon('trash', 14)));
    void depth;
  };

  const conjSelect = (group) => {
    const s = h('select.select.conj', { 'aria-label': '匹配规则', onchange: () => {
      group.conjunction = s.value;
      saveNow();
      render();
    } }, h('option', { value: 'and', selected: group.conjunction !== 'or' }, '且'), h('option', { value: 'or', selected: group.conjunction === 'or' }, '或'));
    return s;
  };

  const newCondition = () => {
    const f = table.primary;
    return { id: newConditionId(), fieldId: f.id, op: defaultOp(f, base.compute.ctx), value: null };
  };

  const groupBlock = (group, depth) => {
    const rows = h('div.filter-rows');
    group.conditions.forEach((c, i) => {
      if (c.conditions) {
        const lead = i === 0 ? h('span.filter-lead', '当满足') : i === 1 ? conjSelect(group) : h('span.filter-lead', group.conjunction === 'or' ? '或' : '且');
        rows.append(h('div.filter-row.nested', lead, h('div.filter-group', groupBlock(c, depth + 1), h('button.icon-btn.group-remove', { type: 'button', 'aria-label': '删除条件组', onclick: () => {
          group.conditions.splice(i, 1);
          saveNow();
          render();
        } }, icon('trash', 14)))));
      } else rows.append(conditionRow(c, group, i, depth));
    });
    const add = h('div.filter-add',
      h('button.link-btn', { type: 'button', onclick: () => {
        group.conditions.push(newCondition());
        saveNow();
        render();
      } }, icon('plus', 14), '添加条件'),
      depth === 0 ? h('button.link-btn.muted', { type: 'button', onclick: () => {
        group.conditions.push({ id: newConditionId(), conjunction: 'and', conditions: [newCondition()] });
        saveNow();
        render();
      } }, icon('plus', 14), '添加条件组') : null);
    return h('div', rows, add);
  };

  function render() {
    keepFocus(host, () => host.replaceChildren(
      filters.conditions.length ? h('p.panel-intro', '在此视图中，显示符合以下条件的记录：') : h('p.panel-intro.muted', '此视图未应用任何筛选条件。'),
      groupBlock(filters, 0),
    ));
  }

  render();
  return host;
}

/* ----------------------------------------------------------- sort, group */

function levelsPanel(page, table, view, update, key) {
  const base = page.base;
  const host = h('div.levels-panel');
  const usable = (f) => key === 'sorts' || !['attachment', 'button', 'longText'].includes(f.type);
  const render = () => keepFocus(host, () => {
    const levels = view[key] || [];
    fill(host,
      levels.length ? null : h('p.panel-intro.muted', key === 'sorts' ? '选择用于排序的字段。' : '选择用于分组的字段。'),
      h('div.level-rows', levels.map((lv, i) => {
        const field = table.field(lv.fieldId);
        const s = h('select.select', { 'aria-label': key === 'sorts' ? `排序字段 ${i + 1}` : `分组字段 ${i + 1}`, onchange: () => {
          const next = levels.map((x) => ({ ...x }));
          next[i].fieldId = s.value;
          update({ [key]: next }, key === 'sorts' ? '排序' : '分组');
          render();
        } }, table.fields.filter(usable).map((f) => h('option', { value: f.id, selected: f.id === lv.fieldId }, f.name)));
        const [asc, desc] = field ? sortLabels(field, base.compute.ctx) : ['升序', '降序'];
        const dir = h('div.segmented', { role: 'radiogroup', 'aria-label': '顺序' },
          ...[['asc', asc], ['desc', desc]].map(([d, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String((lv.dir || 'asc') === d), onclick: () => {
            const next = levels.map((x) => ({ ...x }));
            next[i].dir = d;
            update({ [key]: next }, key === 'sorts' ? '排序' : '分组');
            render();
          } }, l)));
        return h('div.level-row', h('span.filter-lead', i === 0 ? (key === 'sorts' ? '按' : '按') : '然后按'), s, dir, h('button.icon-btn', { type: 'button', 'aria-label': '删除', onclick: () => {
          update({ [key]: levels.filter((_, k) => k !== i) }, key === 'sorts' ? '排序' : '分组');
          render();
        } }, icon('x', 14)));
      })),
      (key === 'groups' && levels.length >= 3) ? null : (() => {
        const add = h('button.link-btn', { type: 'button', 'aria-haspopup': 'menu' }, icon('plus', 14), key === 'sorts' ? '添加排序' : '添加分组');
        add.addEventListener('click', () => openMenu(add, table.fields.filter(usable).filter((f) => !levels.some((l) => l.fieldId === f.id)).map((f) => ({ label: f.name, icon: TYPES[f.type].icon, onSelect: () => {
          update({ [key]: [...levels, { fieldId: f.id, dir: 'asc' }] }, key === 'sorts' ? '排序' : '分组');
          render();
        } })), { search: true, searchPlaceholder: '查找字段', label: '字段' }));
        return h('div.filter-add', add);
      })(),
      key === 'groups' && levels.length ? h('div.popover-footer', h('button.btn.small', { type: 'button', onclick: () => update({ collapsed: collectPaths(page, view) }, '折叠分组') }, '全部折叠'), h('button.btn.small', { type: 'button', onclick: () => update({ collapsed: [] }, '展开分组') }, '全部展开')) : null,
    );
  });
  render();
  return host;
}

function collectPaths(page) {
  const tree = page.viewInst?.result?.tree;
  const out = [];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      out.push(n.path);
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}

/* ------------------------------------------------------------------ color */

function colorPanel(page, table, view, update) {
  const host = h('div.color-panel');
  const selects = table.fields.filter((f) => f.type === 'singleSelect');
  const render = () => keepFocus(host, () => {
    const c = view.color || { type: 'none' };
    const mode = h('div.segmented', { role: 'radiogroup', 'aria-label': '记录着色' },
      ...[['none', '无'], ['select', '按选项'], ['conditions', '按条件']].map(([k, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(c.type === k), onclick: () => {
        if (k === 'select') update({ color: { type: 'select', fieldId: selects[0]?.id || null } }, '颜色');
        else if (k === 'conditions') update({ color: { type: 'conditions', rules: c.rules || [] } }, '颜色');
        else update({ color: { type: 'none' } }, '颜色');
        render();
      } }, l)));
    const body = [];
    if (c.type === 'select') {
      if (!selects.length) body.push(h('p.field-hint', '添加单选字段以按其选项为记录着色。'));
      else body.push(h('div.form-row', h('label.field-label', '字段'), (() => {
        const s = h('select.select', { 'aria-label': '着色字段', onchange: () => update({ color: { type: 'select', fieldId: s.value } }, '颜色') }, fieldOptions(selects, c.fieldId));
        return s;
      })()), h('p.field-hint', '记录将采用对应选项的颜色。'));
    }
    if (c.type === 'conditions') {
      const rules = c.rules || [];
      body.push(h('div.color-rules', rules.map((r, i) => {
        const sw = h('button.swatch', { type: 'button', 'aria-label': `颜色：${r.color}`, style: { background: accentColor(r.color) } });
        sw.addEventListener('click', () => {
          const grid = h('div.swatches', { role: 'radiogroup', 'aria-label': '颜色' }, HUES.map((hue) => h('button.swatch', { type: 'button', role: 'radio', 'aria-checked': String(r.color === hue), 'aria-label': hue, style: { background: accentColor(hue) }, onclick: () => {
            const next = structuredClone(rules);
            next[i].color = hue;
            update({ color: { type: 'conditions', rules: next } }, '颜色');
            pop.close();
            render();
          } })));
          const pop = openPopover(sw, grid, { className: 'padded', label: '规则颜色' });
        });
        const cond = r.filter?.conditions?.[0];
        const f = cond && table.field(cond.fieldId);
        const desc = f ? `${f.name} ${operatorsFor(f, page.base.compute.ctx).find(([k]) => k === cond.op)?.[1] || ''} ${describeValue(f, cond)}` : '任何记录';
        const edit = h('button.btn.small.ghost.rule-edit', { type: 'button' }, desc.trim(), icon('chevronDown', 12));
        edit.addEventListener('click', () => {
          // A rule's conditions use the same builder as filters.
          const fake = { ...view, filters: structuredClone(r.filter || emptyFilter()) };
          const panel = filterPanel(page, table, fake, (patch) => {
            const next = structuredClone(view.color.rules);
            next[i].filter = patch.filters;
            update({ color: { type: 'conditions', rules: next } }, '颜色');
          });
          const pop = openPopover(edit, panel, { className: 'padded tool-panel wide', label: '规则条件', beforeClose: () => {
            panel.flush();
            // Redrawn with the new conditions; focus returns to the rule's new button.
            render();
            const again = host.querySelectorAll('.color-rule')[i]?.querySelector('.rule-edit');
            if (again) pop.reanchor(again);
          } });
        });
        return h('div.color-rule', sw, edit, h('button.icon-btn', { type: 'button', 'aria-label': '删除规则', onclick: () => {
          update({ color: { type: 'conditions', rules: rules.filter((_, k) => k !== i) } }, '颜色');
          render();
        } }, icon('x', 14)));
      })), h('div.filter-add', h('button.link-btn', { type: 'button', onclick: () => {
        const used = rules.map((r) => r.color);
        const color = HUES.find((x) => !used.includes(x)) || 'blue';
        const f = table.primary;
        update({ color: { type: 'conditions', rules: [...rules, { id: newConditionId(), color, filter: { conjunction: 'and', conditions: [{ id: newConditionId(), fieldId: f.id, op: defaultOp(f, page.base.compute.ctx), value: null }] } }] } }, '颜色');
        render();
      } }, icon('plus', 14), '添加颜色规则')), h('p.field-hint', '第一条匹配的规则将决定记录的颜色。'));
    }
    host.replaceChildren(mode, ...body);
  });
  render();
  return host;
}

function describeValue(field, cond) {
  if (NO_VALUE_OPS.has(cond.op)) return '';
  const v = cond.value;
  if (v === null || v === undefined || v === '') return '...';
  if (field.type === 'singleSelect' || field.type === 'multipleSelect') {
    const ids = Array.isArray(v) ? v : [v];
    return ids.map((id) => field.options.choices.find((c) => c.id === id)?.name).filter(Boolean).join(', ');
  }
  if (typeof v === 'object' && v.mode) return v.mode === 'exactDate' ? v.date : (DATE_MODES[v.mode] || WITHIN_MODES[v.mode] || '');
  if (typeof v === 'boolean') return v ? '已勾选' : '未勾选';
  return String(v);
}

/* ---------------------------------------------------- card view settings */

function kanbanPanel(page, table, view, update) {
  const stackable = table.fields.filter(canStack);
  const s = h('select.select', { 'aria-label': '分组堆叠依据', onchange: () => update({ stackFieldId: s.value }, '分组堆叠') }, fieldOptions(stackable, view.stackFieldId));
  const empty = h('input.switch', { type: 'checkbox', role: 'switch', checked: !!view.hideEmptyStacks, onchange: () => update({ hideEmptyStacks: empty.checked }, '隐藏空分组') });
  const attachments = table.fields.filter((f) => f.type === 'attachment');
  const cover = h('select.select', { 'aria-label': '卡片封面', onchange: () => update({ coverFieldId: cover.value || null }, '卡片封面') }, h('option', { value: '' }, '无封面'), attachments.map((f) => h('option', { value: f.id, selected: f.id === view.coverFieldId }, f.name)));
  return h('div',
    stackable.length ? h('div.form-row', h('label.field-label', '记录分组堆叠依据'), s) : h('p.field-hint', '添加单选或复选框字段以进行分组堆叠。'),
    h('label.switch-row', empty, h('span.grow', '隐藏空分组')),
    h('div.form-row', { style: { marginTop: '10px' } }, h('label.field-label', '卡片封面'), cover));
}

function datesPanel(page, table, view, update) {
  // Formulas count when they give dates (a number would read as a 1970 date).
  const dates = table.fields.filter((f) => ['date', 'createdTime', 'lastModifiedTime'].includes(f.type) || (f.type === 'formula' && page.base.compute.formulaKind(f) === 'date'));
  const start = h('select.select', { 'aria-label': '开始日期', onchange: () => update({ dateFieldId: start.value }, '日期字段') }, fieldOptions(dates, view.dateFieldId));
  const end = h('select.select', { 'aria-label': '结束日期', onchange: () => update({ endFieldId: end.value || null }, '结束日期字段') }, h('option', { value: '' }, '无（单日）'), dates.filter((f) => !isComputed(f) || f.type === 'formula').map((f) => h('option', { value: f.id, selected: f.id === view.endFieldId }, f.name)));
  const parts = [
    dates.length ? h('div.form-row', h('label.field-label', '开始日期'), start) : h('p.field-hint', '添加日期字段以在日历上展示记录。'),
    dates.length ? h('div.form-row', h('label.field-label', '结束日期'), end) : null,
  ];
  if (view.type === 'timeline') {
    const scale = h('select.select', { 'aria-label': '时间粒度', onchange: () => update({ scale: scale.value }, '时间线刻度') }, [['day', '天'], ['week', '周'], ['month', '月'], ['quarter', '季度']].map(([k, l]) => h('option', { value: k, selected: (view.scale || 'week') === k }, l)));
    parts.push(h('div.form-row', h('label.field-label', '时间粒度'), scale));
  }
  return h('div', ...parts);
}

function coverPanel(table, view, update) {
  const attachments = table.fields.filter((f) => f.type === 'attachment');
  const cover = h('select.select', { 'aria-label': '封面字段', onchange: () => update({ coverFieldId: cover.value || null }, '卡片封面') }, h('option', { value: '' }, '无封面'), attachments.map((f) => h('option', { value: f.id, selected: f.id === view.coverFieldId }, f.name)));
  const fit = h('div.segmented', { role: 'radiogroup', 'aria-label': '图片适应方式' }, ...[['cover', '裁剪填满'], ['contain', '完整显示']].map(([k, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String((view.coverFit || 'cover') === k), onclick: (e) => {
    update({ coverFit: k }, '封面适应方式');
    e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
  } }, l)));
  return h('div', h('div.form-row', h('label.field-label', '封面图片'), cover), attachments.length ? h('div.form-row', h('label.field-label', '图片'), fit) : h('p.field-hint', '添加附件字段以在卡片上显示图片。'));
}
