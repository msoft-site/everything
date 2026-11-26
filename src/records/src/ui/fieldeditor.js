/**
 * Creating and editing fields: name, type, type options, description. Also
 * the column menu shared by the grid header and the hide-fields list.
 */
import { h, append, keepFocus } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { chipColors, accentColor, HUES, nextColor } from '../lib/colors.js';
import { DURATION_FORMATS, DATE_FORMATS } from '../lib/format.js';
import { TYPES, TYPE_ORDER, DESCRIPTIONS, ROLLUP_FUNCTIONS, PRIMARY_TYPES, defaultOptions, valueKind, isComputed, toText, splitList } from '../data/fields.js';
import { makeChoice } from '../data/base.js';
import { prepare, toDisplay, fromDisplay, fieldRef, FUNCTION_HELP } from '../data/formula.js';
import { openPopover } from './popover.js';
import { openMenu } from './menu.js';
import { confirmDialog } from './dialog.js';
import { toast } from './toast.js';
import { newConditionId } from '../data/views.js';
import { defaultOp } from '../data/query.js';

const sel = (options, value, onchange, label) => {
  const s = h('select.select', { 'aria-label': label, onchange: () => onchange(s.value) }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
  return s;
};

let rowSeq = 0;
/** A labeled row; the label is tied to its control (or names the group). */
const row = (label, control, hint) => {
  const isControl = control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement;
  const id = isControl ? control.id || (control.id = `fe-${++rowSeq}`) : null;
  const labelId = `fe-l-${++rowSeq}`;
  if (!isControl && control instanceof Element) {
    control.setAttribute('role', control.getAttribute('role') || 'group');
    control.setAttribute('aria-labelledby', labelId);
  }
  return h('div.form-row', h('label.field-label', { for: id, id: labelId }, label), control, hint ? h('p.field-hint', hint) : null);
};

const toggle = (label, checked, onchange) => {
  const cb = h('input.switch', { type: 'checkbox', role: 'switch', checked: !!checked, onchange: () => onchange(cb.checked) });
  return h('label.switch-row', cb, h('span.grow', label));
};

const PRECISIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => [p, p === 0 ? '1' : `1.${'0'.repeat(p)}`]);

/**
 * Open the field editor next to an anchor. With opts.field it edits that
 * field; otherwise it creates one (onCreated(fieldId) afterwards).
 */
export function openFieldEditor(anchor, page, table, { field = null, onCreated, type: presetType } = {}) {
  const base = page.base;
  const editing = !!field;
  const isPrimary = editing && field.id === table.schema.primaryFieldId;
  let state = {
    name: field?.name || '',
    type: field?.type || presetType || 'text',
    options: structuredClone(field?.options || defaultOptions(presetType || 'text')),
    description: field?.description || '',
  };
  if (state.type === 'formula') state.options.formula = toDisplay(state.options.formula, table.fields);
  if (state.type === 'button') state.options.url = toDisplay(state.options.url || '', table.fields);
  let showDesc = !!state.description;
  const nameInput = h('input.input', { type: 'text', placeholder: '字段名称（可选）', 'aria-label': '字段名称', value: state.name, oninput: () => (state.name = nameInput.value) });
  const typeBtn = h('button.type-btn', { type: 'button', 'aria-haspopup': 'menu', 'aria-label': '字段类型' });
  const optionsHost = h('div.field-options');
  const descHost = h('div');
  const error = h('p.field-error', { role: 'alert' });
  const saveBtn = h('button.btn.primary', { type: 'button' }, editing ? '保存' : '创建字段');
  const panel = h('div.field-editor', nameInput, typeBtn, h('p.type-desc'), optionsHost, descHost, error, h('div.popover-footer',
    h('button.link-btn.muted', { type: 'button', onclick: () => {
      showDesc = !showDesc;
      renderDesc();
    } }, icon(showDesc ? 'minus' : 'plus', 14), showDesc ? '移除描述' : '添加描述'),
    h('div', { style: { display: 'flex', gap: '8px' } }, h('button.btn', { type: 'button', onclick: () => pop.close() }, '取消'), saveBtn)));

  function renderType() {
    typeBtn.replaceChildren(icon(TYPES[state.type].icon, 16), h('span.grow', TYPES[state.type].label), icon('chevronDown', 14));
    panel.querySelector('.type-desc').textContent = DESCRIPTIONS[state.type] || '';
  }

  typeBtn.addEventListener('click', () => {
    const items = [];
    let lastGroup = null;
    for (const t of TYPE_ORDER) {
      if (isPrimary && !PRIMARY_TYPES.has(t)) continue;
      const g = TYPES[t].group;
      if (g !== lastGroup && lastGroup) items.push({ type: 'sep' });
      lastGroup = g;
      items.push({ label: TYPES[t].label, icon: TYPES[t].icon, checked: state.type === t, radio: true, keywords: DESCRIPTIONS[t], onSelect: () => setType(t) });
    }
    openMenu(typeBtn, items, { search: true, searchPlaceholder: '查找字段类型', label: '字段类型', width: 300 });
  });

  function setType(t) {
    if (t === state.type) return;
    const prevChoices = state.options.choices;
    state.type = t;
    state.options = defaultOptions(t);
    // Keep options between the two select types.
    if ((t === 'singleSelect' || t === 'multipleSelect') && prevChoices) state.options.choices = prevChoices;
    // Turning existing values into options: show them so they can be renamed or recolored first.
    else if ((t === 'singleSelect' || t === 'multipleSelect') && editing && !isComputed(field) && field.type !== 'link' && field.type !== 'attachment') {
      const names = [];
      for (const r of table.ordered()) {
        const text = toText(field, base.compute.value(table, r, field), base.compute.ctx);
        for (const n of t === 'multipleSelect' ? splitList(text) : [text.trim()]) {
          if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n);
        }
        if (names.length >= 100) break;
      }
      const choices = [];
      for (const n of names) choices.push(makeChoice(n, choices));
      state.options.choices = choices;
    }
    if (editing && t === field.type) state.options = structuredClone(field.options);
    if (t === 'formula' && editing && field.type === 'formula') state.options.formula = toDisplay(field.options.formula, table.fields);
    if (t === 'button' && editing && field.type === 'button') state.options.url = toDisplay(field.options.url || '', table.fields);
    renderType();
    renderOptions();
  }

  function renderDesc() {
    descHost.replaceChildren();
    if (!showDesc) return;
    const ta = h('textarea.textarea', { rows: 2, placeholder: '描述此字段', 'aria-label': '描述', oninput: () => (state.description = ta.value) });
    ta.value = state.description;
    descHost.append(row('描述', ta));
    panel.querySelector('.popover-footer .link-btn').replaceChildren(icon('minus', 14), '移除描述');
  }

  const linkFields = () => table.fields.filter((f) => f.type === 'link' && f.id !== field?.id);

  // Options redraw as choices change them (Include time, the linked field):
  // focus stays on the control that was used.
  function renderOptions() {
    keepFocus(optionsHost, drawOptions);
  }

  function drawOptions() {
    const o = state.options;
    const parts = [];
    switch (state.type) {
      case 'text':
        parts.push(row('默认值', h('input.input', { type: 'text', value: o.default || '', placeholder: '无', oninput: (e) => (o.default = e.target.value || undefined) })));
        break;
      case 'number':
        parts.push(row('小数位数', sel(PRECISIONS, o.precision ?? 0, (v) => (o.precision = Number(v)), '小数位数')));
        break;
      case 'currency':
        parts.push(h('div.form-pair', row('货币符号', h('input.input', { type: 'text', value: o.symbol ?? '$', maxLength: 4, oninput: (e) => (o.symbol = e.target.value) })), row('小数位数', sel(PRECISIONS, o.precision ?? 2, (v) => (o.precision = Number(v)), '小数位数'))));
        break;
      case 'percent':
        parts.push(row('小数位数', sel(PRECISIONS, o.precision ?? 0, (v) => (o.precision = Number(v)), '小数位数')));
        break;
      case 'duration':
        parts.push(row('格式', sel(DURATION_FORMATS.map((f) => [f, f]), o.format || 'h:mm', (v) => (o.format = v), '时长格式')));
        break;
      case 'rating':
        parts.push(h('div.form-pair',
          row('最大值', sel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [n, String(n)]), o.max || 5, (v) => (o.max = Number(v)), '最大值')),
          row('图标', sel([['star', '星星'], ['heart', '爱心'], ['thumbsUp', '点赞'], ['flag', '旗帜']], o.icon || 'star', (v) => (o.icon = v), '图标'))));
        parts.push(row('颜色', colorRow(o.color || 'yellow', (c) => (o.color = c))));
        break;
      case 'checkbox':
        parts.push(row('颜色', colorRow(o.color || 'green', (c) => (o.color = c))));
        parts.push(toggle('默认勾选', o.default === true, (v) => (o.default = v || undefined)));
        break;
      case 'singleSelect':
      case 'multipleSelect':
        parts.push(choicesEditor(o));
        break;
      case 'date':
      case 'createdTime':
      case 'lastModifiedTime':
        parts.push(row('日期格式', sel(Object.entries(DATE_FORMATS).map(([k, l]) => [k, `${l} (${exampleDate(k)})`]), o.dateFormat || 'local', (v) => (o.dateFormat = v), '日期格式')));
        parts.push(toggle('包含时间', o.includeTime, (v) => {
          o.includeTime = v;
          renderOptions();
        }));
        if (o.includeTime) {
          parts.push(row('时间格式', sel([['12h', '12 小时制'], ['24h', '24 小时制']], o.timeFormat || '12h', (v) => (o.timeFormat = v), '时间格式')));
          parts.push(toggle('所有人均以 GMT 格式显示时间', o.gmt, (v) => (o.gmt = v)));
        }
        if (state.type === 'date') parts.push(toggle('默认为当天日期', o.default === 'today', (v) => (o.default = v ? 'today' : undefined)));
        break;
      case 'link': {
        const tables = base.tableList();
        if (editing && field.type === 'link') {
          parts.push(row('关联数据表', h('div.ro-value', base.table(o.tableId)?.name || '缺失数据表')));
        } else {
          if (!o.tableId) o.tableId = tables.find((t) => t.id !== table.id)?.id || table.id;
          parts.push(row('关联至', sel(tables.map((t) => [t.id, t.id === table.id ? `${t.name} (当前表)` : t.name]), o.tableId, (v) => (o.tableId = v), '关联数据表')));
        }
        parts.push(toggle('允许关联多条记录', !o.single, (v) => (o.single = !v)));
        break;
      }
      case 'lookup':
      case 'rollup':
      case 'count': {
        const links = linkFields();
        if (!links.length) {
          parts.push(h('p.field-hint', '请先添加“关联其他记录”字段，然后再进行设置。'));
          break;
        }
        if (!o.linkFieldId || !table.field(o.linkFieldId)) o.linkFieldId = links[0].id;
        parts.push(row('关联字段', sel(links.map((f) => [f.id, `${f.name} (${base.table(f.options.tableId)?.name || '?'})`]), o.linkFieldId, (v) => {
          o.linkFieldId = v;
          o.targetFieldId = null;
          renderOptions();
        }, '关联字段')));
        if (state.type !== 'count') {
          const target = base.table(table.field(o.linkFieldId).options.tableId);
          const tfields = target ? target.fields : [];
          if (!o.targetFieldId || !target?.field(o.targetFieldId)) o.targetFieldId = tfields[0]?.id || null;
          parts.push(row(state.type === 'lookup' ? '查找引用的字段' : '汇总字段', sel(tfields.map((f) => [f.id, f.name]), o.targetFieldId, (v) => (o.targetFieldId = v), '目标字段')));
        }
        if (state.type === 'rollup') {
          parts.push(h('div.form-pair', row('汇总方式', sel(Object.entries(ROLLUP_FUNCTIONS), o.fn || 'sum', (v) => (o.fn = v), '汇总方式')), row('小数位数', sel(PRECISIONS, o.precision ?? 0, (v) => (o.precision = Number(v)), '小数位数'))));
        }
        break;
      }
      case 'formula':
        parts.push(formulaEditor(o));
        break;
      case 'button':
        parts.push(row('标签', h('input.input', { type: 'text', value: o.label || '打开', oninput: (e) => (o.label = e.target.value) })));
        parts.push(row('链接', h('input.input', { type: 'text', value: o.url || '', placeholder: '"https://example.com/search?q=" & {Name}', oninput: (e) => (o.url = e.target.value) }), '网页链接，或者从记录字段构建链接的公式。'));
        break;
      default:
    }
    optionsHost.replaceChildren(...parts);
  }

  function colorRow(value, onPick) {
    const swatches = HUES.map((c) => h('button.swatch', { type: 'button', role: 'radio', 'aria-label': c, style: { background: accentColor(c), color: '#fff' }, onclick: () => {
      onPick(c);
      paint(c);
    } }));
    // Marked in place, so the swatch just chosen keeps focus.
    const paint = (cur) => swatches.forEach((btn, i) => {
      btn.setAttribute('aria-checked', String(cur === HUES[i]));
      btn.replaceChildren(...(cur === HUES[i] ? [icon('check', 12)] : []));
    });
    paint(value);
    return h('div.swatches', { role: 'radiogroup', 'aria-label': '颜色' }, swatches);
  }

  function choicesEditor(o) {
    o.choices ||= [];
    const list = h('ul.choice-editor');
    const wrap = h('div');
    let dragIndex = -1;
    // The default option list follows the options as they change.
    const defaultSel = state.type === 'singleSelect' ? h('select.select', { 'aria-label': '默认选项', onchange: () => (o.default = defaultSel.value || undefined) }) : null;
    const paintDefault = () => {
      if (!defaultSel) return;
      if (o.default && !o.choices.some((c) => c.id === o.default)) o.default = undefined;
      defaultSel.replaceChildren(h('option', { value: '' }, '无'), ...o.choices.map((c) => h('option', { value: c.id, selected: o.default === c.id }, c.name || '未命名')));
    };
    // Removing or recoloring an option keeps focus in the same place.
    const paint = () => keepFocus(wrap, () => {
      paintDefault();
      list.replaceChildren(
        ...o.choices.map((c, i) => {
          const [bg, fg] = chipColors(c.color);
          const colorBtn = h('button.choice-color', { type: 'button', 'aria-label': c.name ? `${c.name} 的颜色` : '选项颜色', style: { background: bg, color: fg, borderColor: fg } });
          colorBtn.addEventListener('click', () => {
            const grid = h('div.swatches', { role: 'radiogroup', 'aria-label': '颜色' });
            const names = [...HUES, ...HUES.map((x) => `${x}Strong`)];
            grid.style.gridTemplateColumns = 'repeat(10, 22px)';
            const pick = openPopover(colorBtn, grid, { className: 'padded', label: '选项颜色' });
            grid.append(...names.map((n) => {
              const [b, f] = chipColors(n);
              return h('button.swatch', { type: 'button', role: 'radio', 'aria-checked': String(c.color === n), 'aria-label': n.replace('Strong', ' (加重)'), style: { background: b, color: f, borderColor: f }, onclick: () => {
                c.color = n;
                pick.close();
                paint();
              } }, c.color === n ? icon('check', 12) : null);
            }));
          });
          const input = h('input.input', { type: 'text', value: c.name, 'aria-label': `选项 ${i + 1}`, placeholder: '选项名称', oninput: () => {
            c.name = input.value;
            paintDefault();
          } });
          input.addEventListener('keydown', (e) => {
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              addChoice(i + 1);
            } else if (e.key === 'Backspace' && !input.value && o.choices.length > 0) {
              e.preventDefault();
              o.choices.splice(i, 1);
              paint();
              list.querySelectorAll('input.input')[Math.max(0, i - 1)]?.focus();
            }
          });
          const li = h('li.choice-row', { draggable: 'true' }, h('span.choice-grip', { 'aria-hidden': 'true' }, icon('grip', 14)), colorBtn, input,
            h('button.icon-btn', { type: 'button', 'aria-label': `删除 ${c.name || '选项'}`, onclick: () => {
              o.choices.splice(i, 1);
              paint();
            } }, icon('x', 14)));
          li.addEventListener('dragstart', (e) => {
            dragIndex = i;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', c.name);
          });
          li.addEventListener('dragover', (e) => e.preventDefault());
          li.addEventListener('drop', (e) => {
            e.preventDefault();
            if (dragIndex < 0 || dragIndex === i) return;
            const [m] = o.choices.splice(dragIndex, 1);
            o.choices.splice(i, 0, m);
            dragIndex = -1;
            paint();
          });
          return li;
        }),
      );
    });
    const addChoice = (at = o.choices.length) => {
      const c = makeChoice('', o.choices);
      c.color = nextColor(o.choices.map((x) => x.color));
      o.choices.splice(at, 0, c);
      paint();
      list.querySelectorAll('input.input')[at]?.focus();
    };
    paint();
    const defaultSelect = defaultSel ? row('默认选项', defaultSel) : null;
    return append(wrap, [
      h('div.choice-head', h('span.field-label', '选项'), h('button.link-btn.muted', { type: 'button', onclick: () => {
        o.choices.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        paint();
      } }, icon('sortAsc', 14), '按字母排序')),
      list,
      h('button.link-btn', { type: 'button', onclick: () => addChoice() }, icon('plus', 14), '添加选项'),
      defaultSelect]);
  }

  function formulaEditor(o) {
    const ta = h('textarea.textarea.formula-input', { rows: 4, spellcheck: false, 'aria-label': '公式', placeholder: '例如：{单价} * {数量}', autocomplete: 'off' });
    ta.value = o.formula || '';
    const status = h('p.formula-status', { 'aria-live': 'polite' });
    const check = () => {
      o.formula = ta.value;
      if (!ta.value.trim()) {
        status.textContent = '';
        status.className = 'formula-status';
        return;
      }
      try {
        const stored = fromDisplay(ta.value, table.fields.filter((f) => f.id !== field?.id));
        const p = prepare(stored);
        if (p.error) throw new Error(p.error);
        status.textContent = '公式有效';
        status.className = 'formula-status ok';
      } catch (err) {
        status.textContent = err.message;
        status.className = 'formula-status bad';
      }
    };
    ta.addEventListener('input', check);
    const insert = (text) => {
      const s = ta.selectionStart ?? ta.value.length;
      const e = ta.selectionEnd ?? s;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
      const pos = s + text.length - (text.endsWith('()') ? 1 : 0);
      ta.focus();
      ta.setSelectionRange(pos, pos);
      check();
    };
    const fieldsList = h('div.formula-ref', h('div.menu-header', '字段'), table.fields.filter((f) => f.id !== field?.id).map((f) => h('button.formula-item', { type: 'button', onclick: () => insert(fieldRef(f.name)) }, icon(TYPES[f.type].icon, 14), h('span', f.name))));
    const funcs = h('div.formula-ref');
    for (const [group, fns] of Object.entries(FUNCTION_HELP)) {
      funcs.append(h('div.menu-header', group));
      for (const [name, sig] of Object.entries(fns)) funcs.append(h('button.formula-item', { type: 'button', title: sig, onclick: () => insert(`${name}()`) }, h('code', name), h('span.muted', sig.slice(name.length))));
    }
    check();
    const fmt = row('格式', h('div.form-pair',
      sel([['auto', '自动'], ['integer', '整数'], ['decimal', '小数'], ['currency', '货币'], ['percent', '百分比'], ['duration', '时长']], o.format || 'auto', (v) => (o.format = v), '数字格式'),
      sel(PRECISIONS, o.precision ?? 2, (v) => (o.precision = Number(v)), '小数位数')), '当公式计算结果为数字时生效。');
    return h('div', row('公式', ta), status, fmt, h('details.formula-help', h('summary', '字段与函数'), h('div.formula-cols', fieldsList, funcs)));
  }

  async function save() {
    error.textContent = '';
    const opts = structuredClone(state.options);
    if (state.type === 'formula') {
      try {
        opts.formula = fromDisplay(opts.formula || '', table.fields.filter((f) => f.id !== field?.id));
      } catch (err) {
        error.textContent = err.message;
        return;
      }
      if (!opts.formula.trim()) {
        error.textContent = '请输入公式。';
        return;
      }
      // A formula that does not parse is not saved.
      const check = prepare(opts.formula);
      if (check.error) {
        error.textContent = check.error;
        return;
      }
    }
    if (state.type === 'button' && opts.url) {
      try {
        opts.url = /^https?:\/\/\S+$/i.test(opts.url) ? opts.url : fromDisplay(opts.url, table.fields);
      } catch (err) {
        error.textContent = err.message;
        return;
      }
      const check = /^https?:\/\/\S+$/i.test(opts.url) ? {} : prepare(opts.url);
      if (check.error) {
        error.textContent = check.error;
        return;
      }
    }
    if ((state.type === 'singleSelect' || state.type === 'multipleSelect')) {
      opts.choices = (opts.choices || []).filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim() }));
      // A default that is no longer an option is dropped.
      if (opts.default && !opts.choices.some((c) => c.id === opts.default)) delete opts.default;
      const seen = new Set();
      for (const c of opts.choices) {
        if (seen.has(c.name.toLowerCase())) {
          error.textContent = `存在两个同名为“${c.name}”的选项。`;
          return;
        }
        seen.add(c.name.toLowerCase());
      }
    }
    if (['lookup', 'rollup', 'count'].includes(state.type) && !opts.linkFieldId) {
      error.textContent = '请先添加关联记录字段。';
      return;
    }
    const name = state.name.trim();
    try {
      if (editing) {
        const typeChanged = state.type !== field.type;
        const withData = typeChanged && [...table.records.values()].some((r) => r.c[field.id] !== undefined);
        const numbered = state.type === 'autonumber';
        if (withData && (isComputed({ type: state.type }) || numbered)) {
          const message = numbered ? '此字段中的值将被替换为按记录创建顺序排列的编号。此操作可以撤销。' : '此字段中的值将被替换为计算结果值。此操作可以撤销。';
          const ok = await confirmDialog({ title: `将 ${field.name} 更改为 ${TYPES[state.type].label}？`, message, confirmLabel: '更改类型' });
          if (!ok) return;
        }
        const patch = { options: opts, description: state.description.trim() || undefined };
        if (name && name !== field.name) patch.name = name;
        if (typeChanged) patch.type = state.type;
        base.updateField(table.id, field.id, patch);
        if (typeChanged && withData) page.toastUndo(`已将 ${field.name} 转换为 ${TYPES[state.type].label}`);
      } else {
        const id = base.addField(table.id, { name: name || TYPES[state.type].label, type: state.type, options: opts, description: state.description.trim() || undefined });
        onCreated?.(id);
      }
      pop.close();
    } catch (err) {
      error.textContent = err.message || String(err);
    }
  }

  saveBtn.addEventListener('click', save);
  nameInput.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  });
  renderType();
  renderOptions();
  renderDesc();
  const pop = openPopover(anchor, panel, { className: 'padded', label: editing ? `编辑 ${field.name}` : '新建字段', focus: nameInput, width: 380 });
  return pop;
}

function exampleDate(fmt) {
  const d = new Date(2026, 8, 7);
  const p = { y: 2026, m: 8, d: 7 };
  void d;
  switch (fmt) {
    case 'friendly':
      return '2026年9月7日';
    case 'us':
      return '9/7/2026';
    case 'european':
      return '7/9/2026';
    case 'iso':
      return '2026-09-07';
    default:
      return `${p.y}/${p.m + 1}/${p.d}`;
  }
}

/** Sort labels that read naturally for a field's kind. */
export function sortLabels(field, ctx) {
  const kind = valueKind(field, ctx);
  if (kind === 'number') return ['1 → 9', '9 → 1'];
  if (kind === 'checkbox') return ['未勾选 → 已勾选', '已勾选 → 未勾选'];
  if (kind === 'date') return ['最早 → 最新', '最新 → 最早'];
  if (field.type === 'singleSelect') return ['排前 → 排后', '排后 → 排前'];
  return ['A → Z', 'Z → A'];
}

/** The menu for a field (grid header, record and settings). */
export function fieldMenuItems(page, table, field, { onEdit, onInsert, onFreeze, frozen, index, view } = {}) {
  const base = page.base;
  const isPrimary = field.id === table.schema.primaryFieldId;
  const [asc, desc] = sortLabels(field, base.compute.ctx);
  const v = view || page.view;
  return [
    { label: '编辑字段', icon: 'pencil', onSelect: onEdit },
    { label: '复制字段', icon: 'copy', onSelect: () => base.duplicateField(table.id, field.id) },
    onInsert ? { label: '在左侧插入', icon: 'insertLeft', disabled: index === 0, onSelect: () => onInsert('left') } : null,
    onInsert ? { label: '在右侧插入', icon: 'insertRight', onSelect: () => onInsert('right') } : null,
    { type: 'sep' },
    { label: `按 ${asc} 排序`, icon: 'sortAsc', onSelect: () => base.updateView(table.id, v.id, { sorts: [{ fieldId: field.id, dir: 'asc' }] }, { label: '排序' }) },
    { label: `按 ${desc} 排序`, icon: 'sortDesc', onSelect: () => base.updateView(table.id, v.id, { sorts: [{ fieldId: field.id, dir: 'desc' }] }, { label: '排序' }) },
    { label: '按此字段筛选', icon: 'filter', onSelect: () => {
      const cond = { id: newConditionId(), fieldId: field.id, op: defaultOp(field, base.compute.ctx), value: null };
      base.updateView(table.id, v.id, { filters: { conjunction: v.filters?.conjunction || 'and', conditions: [...(v.filters?.conditions || []), cond] } }, { label: '筛选' });
      requestAnimationFrame(() => page.viewbarEl?.querySelector('.tool-btn.t-filter')?.click());
    } },
    v?.type === 'grid' || v?.type === 'list' ? { label: '按此字段分组', icon: 'group', onSelect: () => base.updateView(table.id, v.id, { groups: [...(v.groups || []).filter((g) => g.fieldId !== field.id), { fieldId: field.id, dir: 'asc' }] }, { label: '分组' }) } : null,
    onFreeze ? { label: index + 1 === frozen ? '取消冻结字段' : '冻结至此字段', icon: 'freeze', onSelect: index + 1 === frozen ? () => base.updateView(table.id, v.id, { frozen: 1 }, { label: '取消冻结' }) : onFreeze } : null,
    { type: 'sep' },
    { label: '编辑字段描述', icon: 'info', onSelect: onEdit },
    !isPrimary ? { label: '隐藏字段', icon: 'eyeOff', onSelect: () => base.updateView(table.id, v.id, { hidden: [...new Set([...(v.hidden || []), field.id])] }, { label: '隐藏字段' }) } : null,
    !isPrimary ? { label: '删除字段', icon: 'trash', danger: true, onSelect: async () => {
      const ok = await confirmDialog({ title: `确定删除 ${field.name}？`, message: field.type === 'link' && field.options.inverseId ? '此字段及其数据将被删除，另一张表中对应的关联字段也会一并删除。此操作可以撤销。' : '此字段及其数据将被删除。此操作可以撤销。', confirmLabel: '删除字段', danger: true });
      if (!ok) return;
      base.deleteField(table.id, field.id);
      page.toastUndo(`已删除 ${field.name}`);
    } } : null,
  ];
}
