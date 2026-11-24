/**
 * Write & Insert Fields and Preview dialogs: Address Block, Greeting Line, Insert Merge Field,
 * Rules, Match Fields, Find Recipient, Check for Errors, prompts for Ask/Fill-in, and the
 * Finish & Merge options.
 *
 * Each dialog works through `mm`, the Mailings controller: mm.state(), mm.setState(patch),
 * mm.records(), mm.insertField(instruction), mm.goToRecord(n), mm.mapping().
 */
import { el } from '../ui/dom.js';
import { dialog, field, select, input, checkbox, radios, button } from './mailings-ui.js';
import {
  ADDRESS_FIELDS, NAME_FORMATS, GREETING_NAMES, SAMPLE_RECIPIENT, addressBlockInstruction, greetingInstruction,
  renderAddressBlock, renderGreetingLine, fieldName, quoteArgument, autoMatchFields,
} from '../engine/merge-fields.js';

/** A small record navigator for previews inside dialogs: ◀ n of N ▶, calling update(record|null). */
function previewNavigator(mm, update) {
  const records = mm.records();
  let at = Math.min(Math.max(0, (mm.state().activeRecord || 1) - 1), Math.max(0, records.length - 1));
  const label = el('span.mm-nav-label', { role: 'status' });
  const prev = button('◀', () => { at = Math.max(0, at - 1); sync(); }, 'btn-ghost', { 'aria-label': '上一位收件人', title: '上一位收件人' });
  const next = button('▶', () => { at = Math.min(records.length - 1, at + 1); sync(); }, 'btn-ghost', { 'aria-label': '下一位收件人', title: '下一位收件人' });
  function sync() {
    prev.disabled = at <= 0; next.disabled = at >= records.length - 1;
    label.textContent = records.length ? `收件人 ${at + 1} / ${records.length}` : '示例收件人';
    update(records[at] || null);
  }
  const node = el('div.mm-nav', {}, records.length > 1 ? prev : null, label, records.length > 1 ? next : null);
  node.sync = sync;
  return node;
}
/** Look up an address concept for a record (or the sample when there are no recipients). */
const conceptLookup = (mm, record) => id => {
  if (!record) return SAMPLE_RECIPIENT[id] || '';
  const column = mm.mapping()[id];
  return column ? record.values[column] ?? '' : '';
};

/* ---- Address Block ---- */
export function openAddressBlock(mm) {
  const format = el('div.mm-format-list', { role: 'listbox', 'aria-label': '收件人姓名格式', tabindex: 0 });
  let chosen = 'titleFirstLast';
  const renderFormats = () => format.replaceChildren(...NAME_FORMATS.map(([id, sample]) => el('div.mm-format-item', { role: 'option', id: `mm-name-${id}`, 'aria-selected': String(id === chosen), onclick: () => { chosen = id; renderFormats(); update(); } }, sample)));
  format.addEventListener('keydown', e => {
    const i = NAME_FORMATS.findIndex(f => f[0] === chosen);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); chosen = NAME_FORMATS[Math.max(0, Math.min(NAME_FORMATS.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))][0]; renderFormats(); update(); }
  });
  const company = checkbox('包含公司名称', true);
  const postal = checkbox('包含邮政地址', true);
  const excluded = input('中国', { 'aria-label': '排除此国家/地区' });
  const country = radios('国家/地区', [['always', '始终包含国家/地区'], ['never', '从不包含国家/地区'], ['unlessExcluded', '仅当不同于以下内容时包含：']], 'unlessExcluded', () => update());
  const preview = el('pre.mm-preview', { 'aria-live': 'polite', 'aria-label': '预览' });
  let record = null;
  const options = () => ({ name: chosen, company: company.input.checked, postal: postal.input.checked, country: country.value, excluded: excluded.value.trim() });
  function update() {
    excluded.disabled = country.value !== 'unlessExcluded';
    preview.textContent = renderAddressBlock(addressBlockInstruction(options()), conceptLookup(mm, record)) || '(此收件人在已匹配的列中没有地址详细信息。)';
  }
  const nav = previewNavigator(mm, r => { record = r; update(); });
  for (const box of [company, postal]) box.input.addEventListener('change', update);
  excluded.addEventListener('input', update);
  renderFormats();
  const unmatched = () => ['first', 'last', 'address1', 'city'].filter(id => !mm.mapping()[id]);
  const hint = el('p.field-hint');
  const refreshHint = () => { const missing = unmatched(); hint.textContent = mm.records().length && missing.length ? `尚未匹配：${missing.map(id => ADDRESS_FIELDS.find(f => f.id === id).label).join('、')}。使用“匹配字段”为其选择列。` : ''; };
  refreshHint();
  dialog({ title: '插入地址块', size: 'wide', submit: '插入', focus: format, body: [
    el('div.mm-two', {},
      el('div', {}, el('p.field-label', {}, '收件人姓名'), format, company, postal, country, excluded),
      el('div', {}, el('p.field-label', {}, '预览'), preview, nav, hint, button('匹配字段…', () => openMatchFields(mm, () => { refreshHint(); update(); })))),
  ], onSubmit: () => mm.insertField(addressBlockInstruction(options())) });
  nav.sync();
}

/* ---- Greeting Line ---- */
export function openGreetingLine(mm) {
  const salutation = select([['尊敬的', '尊敬的'], ['致', '致'], ['您好', '您好'], ['Dear', 'Dear'], ['To', 'To'], ['', '(无)']], '尊敬的', { 'aria-label': '问候语' });
  const name = select(GREETING_NAMES.map(([id, sample]) => [id, sample]), 'titleLast', { 'aria-label': '姓名格式' });
  const punctuation = select([[',', '，'], [':', '：'], ['!', '！'], ['.', '。'], ['', '(无)']], '，', { 'aria-label': '标点符号' });
  const fallback = input('尊敬的朋友：', { 'aria-label': '姓名缺失时的问候语' });
  const preview = el('p.mm-preview.mm-preview-line', { 'aria-live': 'polite' });
  let record = null;
  const options = () => ({ salutation: salutation.value, name: name.value, punctuation: punctuation.value, fallback: fallback.value });
  const update = () => { preview.textContent = renderGreetingLine(greetingInstruction(options()), conceptLookup(mm, record)) || '(空)'; };
  for (const c of [salutation, name, punctuation]) c.addEventListener('change', update);
  fallback.addEventListener('input', update);
  const nav = previewNavigator(mm, r => { record = r; update(); });
  dialog({ title: '插入问候语', size: 'wide', submit: '插入', body: [
    el('div.mm-inline.mm-greeting', {}, field('问候语', salutation), field('姓名格式', name), field('后缀标点', punctuation)),
    field('姓名缺失时', fallback, '用于在已匹配列中没有姓名的收件人。'),
    el('p.field-label', {}, '预览'), preview, nav,
    el('div.row', {}, button('匹配字段…', () => openMatchFields(mm, update))),
  ], onSubmit: () => mm.insertField(greetingInstruction(options())) });
  nav.sync();
}

/* ---- Merge fields ---- */
const CASES = [['', '保持原样'], ['Upper', '全部大写'], ['Lower', '全部小写'], ['FirstCap', '句首字母大写'], ['Caps', '词首字母大写']];
/** A MERGEFIELD instruction for a column with optional text before/after and capitalization. */
export function mergeFieldInstruction(column, { before = '', after = '', format = '' } = {}) {
  return ` MERGEFIELD ${fieldName(column)}${before ? ` \\b ${quoteArgument(before)}` : ''}${after ? ` \\f ${quoteArgument(after)}` : ''}${format ? ` \\* ${format}` : ''} `;
}

export function openInsertField(mm) {
  const columns = mm.state().list?.columns || [];
  const kind = radios('插入', [['database', '数据库字段'], ['address', '地址字段']], 'database', () => fill());
  const list = el('select.input.mm-field-list', { size: 9, 'aria-label': '字段' });
  const before = input('', { 'aria-label': '前缀文本' }), after = input('', { 'aria-label': '后缀文本' });
  const format = select(CASES, '', { 'aria-label': '大小写格式' });
  const note = el('p.field-hint');
  function fill() {
    const items = kind.value === 'address' ? ADDRESS_FIELDS.map(f => [f.id, `${f.label}${mm.mapping()[f.id] ? ` → ${mm.mapping()[f.id]}` : ' (未匹配)'}`]) : columns.map(c => [c, c]);
    list.replaceChildren(...items.map(([v, l]) => el('option', { value: v }, l)));
    if (items.length) list.value = items[0][0];
    note.textContent = kind.value === 'database' && !columns.length ? '请先选择收件人以列出其字段列，或在下方键入列名。' : '';
  }
  const custom = input('', { 'aria-label': '或键入字段名称', placeholder: '字段名称' });
  fill();
  const insert = async () => {
    let column = custom.value.trim() || list.value;
    if (kind.value === 'address' && !custom.value.trim()) {
      column = mm.mapping()[list.value];
      if (!column) throw new Error(`请先将“${ADDRESS_FIELDS.find(f => f.id === list.value)?.label}”与某一列进行匹配（匹配字段）。`);
    }
    if (!column) throw new Error('请选择要插入的字段。');
    await mm.insertField(mergeFieldInstruction(column, { before: before.value, after: after.value, format: format.value }));
    custom.value = '';
  };
  list.addEventListener('dblclick', () => insert().catch(e => modal.error(e.message)));
  const modal = dialog({ title: '插入合并字段', size: 'wide', submit: '插入', cancel: '关闭', body: [
    kind, el('div.mm-two', {}, el('div', {}, list, note, field('或键入字段名称', custom)),
      el('div', {}, field('前缀文本（仅当字段非空时）', before), field('后缀文本（仅当字段非空时）', after), field('大小写格式', format),
        button('匹配字段…', () => openMatchFields(mm, fill)))),
  ], onSubmit: async () => { await insert(); return false; } });
  return modal;
}

/* ---- Rules ---- */
export const RULES = [
  ['ask', '提示…'], ['fillin', '填写…'], ['if', '如果…那么…否则…'], ['mergerec', '合并记录号'], ['mergeseq', '合并序号'],
  ['next', '下一记录'], ['nextif', '如果则下一记录…'], ['set', '设置书签…'], ['skipif', '如果则跳过记录…'],
];
const COMPARISONS = [['=', '等于'], ['<>', '不等于'], ['<', '小于'], ['>', '大于'], ['<=', '小于或等于'], ['>=', '大于或等于'], ['blank', '为空'], ['notBlank', '不为空']];
/** The "{ MERGEFIELD x }" = "value" part of a rule. */
export function comparison(column, operator, value) {
  const operand = `"{ MERGEFIELD ${fieldName(column)} }"`;
  if (operator === 'blank') return `${operand} = ""`;
  if (operator === 'notBlank') return `${operand} <> ""`;
  return `${operand} ${operator} ${quoteArgument(value)}`;
}
const BOOKMARK = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

export function openRule(kind, mm) {
  const simple = { mergerec: ' MERGEREC ', mergeseq: ' MERGESEQ ', next: ' NEXT ' }[kind];
  if (simple) return mm.insertField(simple);
  const columns = mm.state().list?.columns || [];
  const columnSelect = () => columns.length ? select(columns.map(c => [c, c]), columns[0], { 'aria-label': '字段名称' }) : input('', { 'aria-label': '字段名称', placeholder: '列名' });
  const condition = () => {
    const column = columnSelect(), operator = select(COMPARISONS, '=', { 'aria-label': '比较' }), value = input('', { 'aria-label': '比对值' });
    operator.addEventListener('change', () => { value.disabled = ['blank', 'notBlank'].includes(operator.value); });
    return { column, operator, value, node: el('div.mm-inline.mm-rule-condition', {}, field('字段名称', column), field('比较', operator), field('比对值', value)), code: () => {
      if (!column.value.trim()) throw new Error('请选择要比较的字段。');
      return comparison(column.value.trim(), operator.value, value.value);
    } };
  };
  const bookmarkName = (value = '') => input(value, { 'aria-label': '书签名称', placeholder: '例如 DueDate' });
  const checkName = name => { if (!BOOKMARK.test(name)) throw new Error('书签名称必须以字母开头，且仅包含字母、数字和下划线（最多 40 个字符）。'); };
  let body, build, title;
  if (kind === 'ask' || kind === 'fillin') {
    const name = bookmarkName(), prompt = input('', { 'aria-label': '提示信息' }), answer = input('', { 'aria-label': '默认答案' });
    const once = checkbox('只提示一次，不要每条记录都提示');
    const show = checkbox('在此处同时显示答案', kind === 'ask');
    title = kind === 'ask' ? '“提示”规则' : '“填写”规则';
    body = [kind === 'ask' ? field('书签', name, '答案将以此名称存储，以供文档中其他地方引用。') : null, field('提示信息', prompt), field('默认答案', answer), once, kind === 'ask' ? show : null];
    build = () => {
      if (!prompt.value.trim()) throw new Error('请输入要提示的问题。');
      const tail = `${answer.value ? ` \\d ${quoteArgument(answer.value)}` : ''}${once.input.checked ? ' \\o' : ''}`;
      if (kind === 'fillin') return [` FILLIN ${quoteArgument(prompt.value.trim())}${tail} `];
      checkName(name.value.trim());
      return [` ASK ${name.value.trim()} ${quoteArgument(prompt.value.trim())}${tail} `, ...(show.input.checked ? [` REF ${name.value.trim()} `] : [])];
    };
  } else if (kind === 'set') {
    const name = bookmarkName(), value = input('', { 'aria-label': '值' });
    title = '“设置书签”规则';
    body = [field('书签', name), field('值', value, '通过引用该书签可在其他位置显示。')];
    build = () => { checkName(name.value.trim()); return [` SET ${name.value.trim()} ${quoteArgument(value.value)} `]; };
  } else if (kind === 'if') {
    const c = condition(), then = el('textarea.input.mm-textarea', { rows: 2, 'aria-label': '插入此文本' }), otherwise = el('textarea.input.mm-textarea', { rows: 2, 'aria-label': '否则插入此文本' });
    title = '“如果…那么…否则…”规则';
    body = [el('p.field-label', {}, '如果'), c.node, field('插入此文本', then), field('否则插入此文本', otherwise)];
    build = () => [` IF ${c.code()} ${quoteArgument(then.value)} ${quoteArgument(otherwise.value)} `];
  } else {
    const c = condition();
    title = kind === 'nextif' ? '“如果则下一记录”规则' : '“如果则跳过记录”规则';
    body = [el('p.field-hint', {}, kind === 'nextif' ? '当比较条件为真时，后续字段将使用下一位收件人，而无需开始新文档。' : '当比较条件为真时，此收件人将从合并中排除。'), c.node];
    build = () => [` ${kind === 'nextif' ? 'NEXTIF' : 'SKIPIF'} ${c.code()} `];
  }
  if (!columns.length && ['if', 'nextif', 'skipif'].includes(kind)) body.unshift(el('p.field-hint', {}, '请先选择收件人以从其列中选择。'));
  return dialog({ title, size: 'wide', submit: '插入', body, onSubmit: async () => { for (const code of build()) await mm.insertField(code); } });
}

/* ---- Match Fields ---- */
export function openMatchFields(mm, done = () => {}) {
  const columns = mm.state().list?.columns || [];
  if (!columns.length) { dialog({ title: '匹配字段', submit: null, cancel: '关闭', body: el('p.modal-text', {}, '请先选择收件人。然后您可以选择哪些列包含姓名和地址。') }); return; }
  const current = { ...autoMatchFields(columns), ...mm.mapping() };
  const selects = ADDRESS_FIELDS.map(f => [f.id, select([['', '(未匹配)'], ...columns.map(c => [c, c])], current[f.id] || '', { 'aria-label': f.label })]);
  dialog({ title: '匹配字段', size: 'wide', body: [
    el('p.field-hint', {}, '地址块和问候语将读取这些列。与列名匹配的字段已自动为您匹配。'),
    el('div.mm-match-grid', {}, ...selects.map(([id, s]) => field(ADDRESS_FIELDS.find(f => f.id === id).label, s))),
  ], onSubmit: () => { mm.setState({ mapping: Object.fromEntries(selects.filter(([, s]) => s.value).map(([id, s]) => [id, s.value])) }); done(); } });
}

/* ---- Find Recipient ---- */
export function openFindRecipient(mm) {
  const columns = mm.state().list?.columns || [];
  const text = input('', { type: 'search', 'aria-label': '查找内容' });
  const where = select([['', '所有字段'], ...columns.map(c => [c, c])], '', { 'aria-label': '查找范围' });
  const result = el('p.field-hint', { role: 'status' });
  const modal = dialog({ title: '查找条目', submit: '查找下一个', cancel: '关闭', body: [field('查找内容', text), field('查找范围', where), result], onSubmit: () => {
    const query = text.value.trim().toLowerCase(); if (!query) throw new Error('请输入要查找的内容。');
    const records = mm.records(), start = mm.state().activeRecord || 1;
    for (let k = 1; k <= records.length; k++) {
      const index = (start - 1 + k) % records.length, record = records[index];
      const values = where.value ? [record.values[where.value]] : Object.values(record.values);
      if (values.some(v => String(v ?? '').toLowerCase().includes(query))) {
        mm.goToRecord(index + 1);
        result.textContent = `显示第 ${index + 1} / ${records.length} 位收件人。`;
        return false;
      }
    }
    result.textContent = '没有匹配的收件人。';
    return false;
  } });
  return modal;
}

/* ---- Check for Errors ---- */
export function openCheckErrors(mm) {
  const report = mm.errorReport();
  const items = [];
  if (report.missing.length) items.push(el('li', {}, el('strong', {}, '没有匹配列的字段：'), report.missing.join(', '), '。这些在合并文档中将显示为 «字段»。'));
  if (report.noRecipients) items.push(el('li', {}, '未选择任何收件人，因此不会合并任何内容。'));
  if (report.emptyAddress.length) items.push(el('li', {}, el('strong', {}, `空白地址块：`), `收件人 ${report.emptyAddress.slice(0, 20).join('、')}${report.emptyAddress.length > 20 ? '…' : ''}。`));
  if (report.noEmail.length) items.push(el('li', {}, el('strong', {}, '无电子邮件地址：'), `收件人 ${report.noEmail.slice(0, 20).join('、')}${report.noEmail.length > 20 ? '…' : ''}。`));
  if (report.skipped) items.push(el('li', {}, `有 ${report.skipped} 位收件人被“如果则跳过记录”规则跳过。`));
  if (report.noFields) items.push(el('li', {}, '文档中尚无合并字段，因此每份副本都将相同。'));
  dialog({ title: '检查错误', submit: null, cancel: '关闭', size: 'wide', body: [
    el('p.modal-text', {}, items.length ? `模拟合并 ${report.copies} 份文档发现：` : `模拟合并 ${report.copies} 份文档未发现任何错误。`),
    items.length ? el('ul.mm-report', {}, ...items) : null,
  ] });
}

/* ---- Ask / Fill-in prompts before merging ---- */
export function askPrompts(prompts, answers = {}) {
  if (!prompts.length) return Promise.resolve(answers);
  return new Promise(resolve => {
    let result = null;
    const inputs = prompts.map(p => [p, input(answers[p.id] ?? p.defaultValue, { 'aria-label': p.prompt })]);
    dialog({ title: '合并应答', submit: '继续', body: [
      el('p.field-hint', {}, '这些问题来自“提示”和“填写”字段。每个答案都将用于每份合并文档。'),
      ...inputs.map(([p, i]) => field(p.prompt, i)),
    ], onSubmit: () => { result = { ...answers, ...Object.fromEntries(inputs.map(([p, i]) => [p.id, i.value])) }; }, onClose: () => resolve(result) });
  });
}

/* ---- Finish & Merge ---- */
/** Choose records (and email options); resolves { from, to, email? } or null. */
export function openFinish(kind, mm) {
  const total = mm.records().length, current = Math.min(mm.state().activeRecord || 1, total);
  const range = radios('合并记录', [['all', `全部 (${total})`], ['current', `当前记录 (${current})`], ['range', '范围']], 'all', () => sync());
  const from = input('1', { type: 'number', min: 1, max: total, 'aria-label': '起始记录' }), to = input(String(total), { type: 'number', min: 1, max: total, 'aria-label': '终止记录' });
  const sync = () => { from.disabled = to.disabled = range.value !== 'range'; };
  sync();
  const titles = { document: '合并到新文档', print: '合并到打印机', email: '合并到电子邮件' };
  const columns = mm.state().list?.columns || [];
  const emailColumn = select(columns.map(c => [c, c]), mm.state().email?.to || mm.mapping().email || columns.find(c => /e-?mail/i.test(c)) || columns[0], { 'aria-label': '收件人' });
  const subject = input(mm.state().subject || '', { 'aria-label': '主题行' });
  const format = select([['html', 'HTML'], ['text', '纯文本']], mm.state().email?.format || 'html', { 'aria-label': '邮件格式' });
  return new Promise(resolve => {
    let result = null;
    dialog({ title: titles[kind], size: kind === 'email' ? 'wide' : '', submit: kind === 'email' ? '继续' : '确定', body: [
      ...(kind === 'email' ? [field('收件人', emailColumn), field('主题行', subject), field('邮件格式', format)] : []),
      el('p.field-label', {}, '合并记录'), range, el('div.mm-inline', {}, field('起始记录', from), field('终止记录', to)),
    ], onSubmit: () => {
      let a = 1, b = total;
      if (range.value === 'current') a = b = current;
      if (range.value === 'range') {
        a = Number(from.value); b = Number(to.value);
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b > total || a > b) throw new Error(`请选择介于 1 和 ${total} 之间的记录。`);
      }
      if (kind === 'email') {
        if (!emailColumn.value) throw new Error('请选择包含电子邮件地址的列。');
        mm.setState({ subject: subject.value, email: { ...mm.state().email, to: emailColumn.value, format: format.value } });
      }
      result = { from: a, to: b };
    }, onClose: () => resolve(result) });
  });
}
