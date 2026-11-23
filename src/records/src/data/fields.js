/**
 * Field types. Each type knows how to show a stored value as text, how to
 * read typed or pasted text back into a value, how values compare, and
 * which filters and summaries apply.
 *
 * Stored values by type:
 *   text, longText, email, url, phone, barcode  string
 *   number, currency, percent (fraction), duration (seconds), rating  number
 *   checkbox  boolean
 *   singleSelect  choice id;  multipleSelect  choice id[]
 *   date  'YYYY-MM-DD' or an ISO date-time in UTC (with includeTime)
 *   attachment  [{ id, name, size, type, path, thumb?, width?, height? }]
 *   link  record id[] in the linked table
 *   autonumber  number (assigned on create)
 *   formula, lookup, rollup, count, createdTime, lastModifiedTime,
 *   createdBy, lastModifiedBy, button  computed, never stored
 */
import {
  formatNumber, formatCurrency, formatPercent, formatDuration, parseNumber, parsePercent, parseDuration,
  formatDate, parseDate, isNum, formatBytes, shownDate, dateKey, toDate, isDateOnly,
} from '../lib/format.js';

export const TYPES = {
  text: { label: '单行文本', icon: 'fText', group: 'basic' },
  longText: { label: '长文本', icon: 'fLongText', group: 'basic' },
  attachment: { label: '附件', icon: 'fAttachment', group: 'basic' },
  checkbox: { label: '复选框', icon: 'fCheckbox', group: 'basic' },
  multipleSelect: { label: '多选', icon: 'fMulti', group: 'basic' },
  singleSelect: { label: '单选', icon: 'fSingle', group: 'basic' },
  date: { label: '日期', icon: 'fDate', group: 'basic' },
  phone: { label: '电话号码', icon: 'fPhone', group: 'basic' },
  email: { label: '电子邮箱', icon: 'fEmail', group: 'basic' },
  url: { label: '网址', icon: 'fUrl', group: 'basic' },
  number: { label: '数字', icon: 'fNumber', group: 'basic' },
  currency: { label: '货币', icon: 'fCurrency', group: 'basic' },
  percent: { label: '百分比', icon: 'fPercent', group: 'basic' },
  duration: { label: '时长', icon: 'fDuration', group: 'basic' },
  rating: { label: '评分', icon: 'fRating', group: 'basic' },
  barcode: { label: '条形码', icon: 'fBarcode', group: 'basic' },
  link: { label: '关联其他记录', icon: 'fLink', group: 'relational' },
  lookup: { label: '查找引用', icon: 'fLookup', group: 'relational', computed: true },
  rollup: { label: '汇总', icon: 'fRollup', group: 'relational', computed: true },
  count: { label: '计数', icon: 'fCount', group: 'relational', computed: true },
  formula: { label: '公式', icon: 'fFormula', group: 'computed', computed: true },
  autonumber: { label: '自动编号', icon: 'fAutonumber', group: 'computed', readOnly: true },
  createdTime: { label: '创建时间', icon: 'fCreatedTime', group: 'computed', computed: true },
  lastModifiedTime: { label: '最后修改时间', icon: 'fModifiedTime', group: 'computed', computed: true },
  createdBy: { label: '创建人', icon: 'fCreatedBy', group: 'computed', computed: true },
  lastModifiedBy: { label: '最后修改人', icon: 'fModifiedBy', group: 'computed', computed: true },
  button: { label: '按钮', icon: 'fButton', group: 'computed', computed: true },
};

/** Order in the "add field" menu. */
export const TYPE_ORDER = [
  'link', 'text', 'longText', 'attachment', 'checkbox', 'multipleSelect', 'singleSelect', 'date', 'phone', 'email', 'url',
  'number', 'currency', 'percent', 'duration', 'rating', 'formula', 'rollup', 'count', 'lookup', 'createdTime',
  'lastModifiedTime', 'createdBy', 'lastModifiedBy', 'autonumber', 'barcode', 'button',
];

/** Types that can be the primary field of a table. */
export const PRIMARY_TYPES = new Set([
  'text', 'longText', 'number', 'currency', 'percent', 'duration', 'date', 'phone', 'email', 'url', 'formula',
  'autonumber', 'barcode', 'createdTime',
]);

export function isComputed(field) {
  return !!TYPES[field?.type]?.computed;
}

export function isReadOnly(field) {
  return isComputed(field) || field?.type === 'autonumber';
}

export const DESCRIPTIONS = {
  text: '单行简短文本。',
  longText: '可跨多行的长文本。',
  attachment: '图片、文档、电子表格等文件。',
  checkbox: '可勾选或取消勾选的复选框。',
  multipleSelect: '从列表中选择任意数量的选项。',
  singleSelect: '从列表中选择一个选项。',
  date: '日历日期，可包含时间。',
  phone: '电话号码。',
  email: '电子邮箱地址。',
  url: '网页链接地址。',
  number: '整数或小数。',
  currency: '货币金额。',
  percent: '百分比数值。',
  duration: '以小时、分钟和秒表示的时间长度。',
  rating: '以图标显示的等级评分。',
  barcode: '条形码或商品编码。',
  link: '关联到另一张表中的记录。',
  lookup: '显示关联记录中某个字段的值。',
  rollup: '对关联记录中的值进行汇总计算。',
  count: '统计关联记录的数量。',
  formula: '根据其他字段计算得出结果。',
  autonumber: '按顺序为每条记录分配唯一编号。',
  createdTime: '每条记录创建的日期和时间。',
  lastModifiedTime: '每条记录最后修改的日期和时间。',
  createdBy: '创建每条记录的用户。',
  lastModifiedBy: '最后修改每条记录的用户。',
  button: '点击可打开由记录生成的链接按钮。',
};

/** Default options for a new field of a type. */
export function defaultOptions(type) {
  switch (type) {
    case 'number':
      return { precision: 0 };
    case 'currency':
      return { symbol: '$', precision: 2 };
    case 'percent':
      return { precision: 0 };
    case 'duration':
      return { format: 'h:mm' };
    case 'rating':
      return { max: 5, icon: 'star', color: 'yellow' };
    case 'checkbox':
      return { color: 'green' };
    case 'singleSelect':
    case 'multipleSelect':
      return { choices: [] };
    case 'date':
      return { dateFormat: 'local', includeTime: false, timeFormat: '12h', gmt: false };
    case 'createdTime':
    case 'lastModifiedTime':
      return { dateFormat: 'local', includeTime: true, timeFormat: '12h', gmt: false };
    case 'link':
      return { tableId: null, inverseId: null, single: false };
    case 'lookup':
      return { linkFieldId: null, targetFieldId: null };
    case 'rollup':
      return { linkFieldId: null, targetFieldId: null, fn: 'sum', precision: 0 };
    case 'count':
      return { linkFieldId: null };
    case 'formula':
      return { formula: '', format: 'auto', precision: 2 };
    case 'button':
      return { label: '打开', url: '' };
    default:
      return {};
  }
}

export const ROLLUP_FUNCTIONS = {
  sum: '求和',
  avg: '平均值',
  min: '最小值',
  max: '最大值',
  count: '有效值计数',
  countAll: '总数',
  countUnique: '唯一值计数',
  concat: '拼接为文本',
  unique: '唯一值列表',
  and: '全部为真',
  or: '任一为真',
  earliest: '最早日期',
  latest: '最晚日期',
};

/* ---------------------------------------------------------- empty checks */

export function isEmpty(v) {
  if (v === null || v === undefined || v === '' || v === false) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'number') return Number.isNaN(v);
  return false;
}

/* ----------------------------------------------------- category helpers */

/**
 * The kind of value a field produces, for filtering, sorting and summaries.
 * Computed fields report the kind of their result.
 */
export function valueKind(field, ctx) {
  switch (field.type) {
    case 'text':
    case 'longText':
    case 'email':
    case 'url':
    case 'phone':
    case 'barcode':
    case 'createdBy':
    case 'lastModifiedBy':
    case 'button':
      return 'text';
    case 'number':
    case 'currency':
    case 'percent':
    case 'duration':
    case 'rating':
    case 'autonumber':
    case 'count':
      return 'number';
    case 'checkbox':
      return 'checkbox';
    case 'singleSelect':
      return 'select';
    case 'multipleSelect':
      return 'multi';
    case 'date':
    case 'createdTime':
    case 'lastModifiedTime':
      return 'date';
    case 'attachment':
      return 'attachment';
    case 'link':
      return 'link';
    case 'formula':
      return ctx?.formulaKind?.(field) || 'text';
    case 'rollup': {
      const fn = field.options?.fn;
      if (fn === 'concat') return 'text';
      if (fn === 'unique') return 'list';
      if (fn === 'and' || fn === 'or') return 'checkbox';
      if (fn === 'earliest' || fn === 'latest') return 'date';
      return 'number';
    }
    case 'lookup':
      return 'list';
    default:
      return 'text';
  }
}

/* -------------------------------------------------------------- display */

function choiceName(field, id) {
  const c = field.options?.choices?.find((x) => x.id === id);
  return c ? c.name : '';
}

/**
 * Text for a stored (or computed) value, as shown in cells, exports and
 * search. ctx supplies names of linked records and computed-field metadata.
 */
export function toText(field, v, ctx) {
  if (v === null || v === undefined) return '';
  const o = field.options || {};
  switch (field.type) {
    case 'text':
    case 'longText':
    case 'email':
    case 'url':
    case 'phone':
    case 'barcode':
    case 'createdBy':
    case 'lastModifiedBy':
      return String(v);
    case 'number':
      return formatNumber(v, o.precision ?? 0);
    case 'autonumber':
    case 'count':
      return isNum(v) ? String(v) : '';
    case 'currency':
      return formatCurrency(v, o.symbol ?? '$', o.precision ?? 2);
    case 'percent':
      return formatPercent(v, o.precision ?? 0);
    case 'duration':
      return formatDuration(v, o.format);
    case 'rating':
      return isNum(v) && v > 0 ? String(v) : '';
    case 'checkbox':
      return v ? 'checked' : '';
    case 'singleSelect':
      return choiceName(field, v);
    case 'multipleSelect':
      return Array.isArray(v) ? v.map((id) => choiceName(field, id)).filter(Boolean).join(', ') : '';
    case 'date':
    case 'createdTime':
    case 'lastModifiedTime':
      return formatDate(v, o);
    case 'attachment':
      return Array.isArray(v) ? v.map((a) => a.name).join(', ') : '';
    case 'link':
      return Array.isArray(v) ? v.map((id) => ctx?.recordName?.(o.tableId, id) ?? '').join(', ') : '';
    case 'button':
      return o.label || '打开';
    case 'formula':
      return formatComputed(v, ctx?.formulaKind?.(field) || 'text', o);
    case 'rollup': {
      const kind = valueKind(field);
      if (typeof v === 'object' && v?.error) return v.error;
      if (kind === 'number') {
        if (!isNum(v)) return '';
        // Totals show like the summarized field ("$1,203.50", "50%", "1:30"); counts are plain.
        const total = ['sum', 'avg', 'min', 'max'].includes(o.fn ?? 'sum');
        return formatRollup(v, total ? ctx?.lookupTarget?.(field) : null, o.precision);
      }
      if (kind === 'checkbox') return v ? 'true' : 'false';
      if (kind === 'date') return v ? formatDate(v, { dateFormat: 'local' }) : '';
      if (Array.isArray(v)) return v.map((x) => formatAny(x)).join(', ');
      return formatAny(v);
    }
    case 'lookup': {
      const target = ctx?.lookupTarget?.(field);
      if (!Array.isArray(v)) return formatAny(v);
      if (!target) return v.map(formatAny).join(', ');
      return v.map((x) => (Array.isArray(x) ? toText(target, x, ctx) : toText(target, x, ctx))).filter((s) => s !== '').join(', ');
    }
    default:
      return formatAny(v);
  }
}

/**
 * Text for a cell that splitList reads back: like toText, but select
 * options and linked record names containing commas or quotes are quoted.
 */
export function listText(field, v, ctx) {
  if (!Array.isArray(v) || (field.type !== 'multipleSelect' && field.type !== 'link')) return toText(field, v, ctx);
  const names = field.type === 'link'
    ? v.map((id) => ctx?.recordName?.(field.options.tableId, id) ?? '')
    : v.map((id) => choiceName(field, id)).filter(Boolean);
  return names.map(quoteItem).join(', ');
}

/**
 * A list item as splitList reads it: quoted, with quotes doubled, only when
 * it would split or starts with a quote ('27" monitor' stays as it is).
 */
function quoteItem(name) {
  return /[,\n]|^\s*"/.test(name) ? `"${name.replace(/"/g, '""')}"` : name;
}

/** Format a formula result by its kind and the field's format options. */
export function formatComputed(v, kind, o = {}) {
  if (v === null || v === undefined) return '';
  if (v instanceof Error || (typeof v === 'object' && v?.error)) return v.error || '#ERROR';
  if (Array.isArray(v)) return v.map((x) => formatComputed(x, typeof x === 'number' ? 'number' : 'text', o)).join(', ');
  if (kind === 'number' && isNum(v)) {
    switch (o.format) {
      case 'integer':
        return formatNumber(v, 0);
      case 'decimal':
        return formatNumber(v, o.precision ?? 2);
      case 'currency':
        return formatCurrency(v, o.symbol ?? '$', o.precision ?? 2);
      case 'percent':
        return formatPercent(v, o.precision ?? 0);
      case 'duration':
        return formatDuration(v, o.durationFormat || 'h:mm');
      default:
        return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e9) / 1e9);
    }
  }
  if (kind === 'date') return formatDate(v, { dateFormat: o.dateFormat || 'local', includeTime: o.includeTime ?? !String(v).match(/^\d{4}-\d{2}-\d{2}$/), timeFormat: o.timeFormat || '12h' });
  if (kind === 'checkbox' || typeof v === 'boolean') return v ? 'true' : 'false';
  return formatAny(v);
}

/** A rollup total in the format of the field it summarizes. */
function formatRollup(v, target, precision) {
  const t = target?.options || {};
  switch (target?.type) {
    case 'currency':
      return formatCurrency(v, t.symbol ?? '$', precision ?? t.precision ?? 2);
    case 'percent':
      return formatPercent(v, precision ?? t.precision ?? 0);
    case 'duration':
      return formatDuration(v, t.format);
    case 'formula':
      if (['currency', 'percent', 'duration'].includes(t.format)) return formatComputed(v, 'number', { ...t, precision: precision ?? t.precision });
  }
  return formatNumber(v, precision ?? 0);
}

function formatAny(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e9) / 1e9);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(formatAny).join(', ');
  if (typeof v === 'object') return v.name ?? v.error ?? JSON.stringify(v);
  return String(v);
}

/* -------------------------------------------------------------- parsing */

const TRUE_WORDS = new Set(['true', 'yes', 'y', 'checked', 'x', '1', 'on', 'done', 'v']);

/**
 * Read typed or pasted text into a value for a field. Select fields return
 * { value, newChoices } so unknown option names can be added on paste.
 * ctx.findRecords(tableId, names) resolves link names; ctx.findChoice(name)
 * can stand in for a scan of the options (imports make thousands).
 */
export function parseText(field, text, ctx = {}) {
  const o = field.options || {};
  const s = text === null || text === undefined ? '' : String(text);
  const t = s.trim();
  switch (field.type) {
    case 'text':
    case 'barcode':
      return s.replace(/[\r\n]+/g, ' ');
    case 'longText':
      return s;
    case 'email':
    case 'url':
    case 'phone':
      return t;
    case 'number': {
      const n = parseNumber(t);
      return n === null ? null : roundTo(n, o.precision ?? 0);
    }
    case 'currency': {
      const n = parseNumber(t.replace(o.symbol || '$', ''));
      return n === null ? null : roundTo(n, o.precision ?? 2);
    }
    case 'percent':
      return parsePercent(t);
    case 'duration':
      return parseDuration(t, o.format);
    case 'rating': {
      const n = parseNumber(t);
      if (n === null) {
        const stars = (t.match(/[*★]/g) || []).length;
        return stars ? Math.min(stars, o.max || 5) : null;
      }
      return Math.max(0, Math.min(o.max || 5, Math.round(n))) || null;
    }
    case 'checkbox':
      return TRUE_WORDS.has(t.toLowerCase());
    case 'singleSelect': {
      if (!t) return { value: null, newChoices: [] };
      const found = ctx.findChoice ? ctx.findChoice(t) : findChoice(field, t);
      if (found) return { value: found.id, newChoices: [] };
      const c = ctx.makeChoice ? ctx.makeChoice(t) : null;
      return c ? { value: c.id, newChoices: [c] } : { value: null, newChoices: [] };
    }
    case 'multipleSelect': {
      const names = splitList(t);
      const ids = [];
      const newChoices = [];
      for (const name of names) {
        const found = (ctx.findChoice ? ctx.findChoice(name) : findChoice(field, name)) || newChoices.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (found) {
          if (!ids.includes(found.id)) ids.push(found.id);
        } else if (ctx.makeChoice) {
          const c = ctx.makeChoice(name);
          newChoices.push(c);
          ids.push(c.id);
        }
      }
      return { value: ids.length ? ids : null, newChoices };
    }
    case 'date':
      return parseDate(t, o);
    case 'link': {
      if (!t) return [];
      const names = splitList(t);
      return ctx.findRecords ? ctx.findRecords(o.tableId, names) : [];
    }
    case 'attachment':
      return null;
    default:
      return null;
  }
}

/**
 * Round half away from zero, as numbers are shown and ROUND() does. The
 * scaled value is trimmed to 15 digits first: 1.005 * 100 is 100.49999...
 */
function roundTo(n, p) {
  const f = 10 ** Math.max(0, Math.min(8, p));
  return Math.sign(n) * Math.round(Number((Math.abs(n) * f).toPrecision(15))) / f || 0;
}

export function findChoice(field, name) {
  const lower = String(name).trim().toLowerCase();
  return field.options?.choices?.find((c) => c.name.toLowerCase() === lower) || null;
}

/**
 * Split "a, b, \"c, d\"" into items, honoring quotes. A quote opens only at
 * the start of an item and "" inside it is a quote, so 27" monitor stays whole.
 */
export function splitList(text) {
  const s = String(text);
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch !== '"') cur += ch;
      else if (s[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = false;
    } else if (ch === '"' && !cur.trim()) {
      q = true;
      cur = '';
    } else if (ch === ',' || ch === '\n') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ------------------------------------------------------------ summaries */

export const SUMMARIES = {
  none: '无',
  empty: '未填写',
  filled: '已填写',
  unique: '唯一值',
  percentEmpty: '未填写占比',
  percentFilled: '已填写占比',
  percentUnique: '唯一值占比',
  sum: '求和',
  avg: '平均值',
  median: '中位数',
  min: '最小值',
  max: '最大值',
  range: '极差',
  stdev: '标准差',
  checked: '已勾选',
  unchecked: '未勾选',
  percentChecked: '已勾选占比',
  percentUnchecked: '未勾选占比',
  earliest: '最早日期',
  latest: '最晚日期',
  dateRange: '日期跨度（天）',
  totalSize: '附件总大小',
};

export function summariesFor(kind) {
  const base = ['none', 'empty', 'filled', 'unique', 'percentEmpty', 'percentFilled', 'percentUnique'];
  switch (kind) {
    case 'number':
      return [...base, 'sum', 'avg', 'median', 'min', 'max', 'range', 'stdev'];
    case 'checkbox':
      return ['none', 'checked', 'unchecked', 'percentChecked', 'percentUnchecked'];
    case 'date':
      return [...base, 'earliest', 'latest', 'dateRange'];
    case 'attachment':
      return ['none', 'empty', 'filled', 'percentEmpty', 'percentFilled', 'totalSize'];
    default:
      return base;
  }
}

/**
 * Compute a summary over values. fmt formats a number in the field's style
 * (sum and averages of currency stay currency).
 */
export function summarize(kind, values, fn, fmt = (n) => formatNumber(n, 2)) {
  const n = values.length;
  if (!n && fn !== 'none') return fn === 'sum' ? fmt(0) : '';
  let empty = 0;
  for (const v of values) if (isEmpty(v)) empty++;
  const filled = n - empty;
  const pct = (x) => `${n ? Math.round((x / n) * 1000) / 10 : 0}%`;
  const uniqueCount = () => {
    const set = new Set();
    for (const v of values) if (!isEmpty(v)) set.add(Array.isArray(v) ? JSON.stringify(v) : v);
    return set.size;
  };
  const nums = () => values.filter(isNum);
  switch (fn) {
    case 'empty':
      return String(empty);
    case 'filled':
      return String(filled);
    case 'unique':
      return String(uniqueCount());
    case 'percentEmpty':
      return pct(empty);
    case 'percentFilled':
      return pct(filled);
    case 'percentUnique':
      return pct(uniqueCount());
    case 'sum':
      return fmt(nums().reduce((a, b) => a + b, 0));
    case 'avg': {
      const xs = nums();
      return xs.length ? fmt(xs.reduce((a, b) => a + b, 0) / xs.length) : '';
    }
    case 'median': {
      const xs = nums().sort((a, b) => a - b);
      if (!xs.length) return '';
      const mid = xs.length >> 1;
      return fmt(xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2);
    }
    case 'min': {
      const xs = nums();
      // Loops, not Math.min(...xs): spreading 100k values overflows the stack.
      return xs.length ? fmt(xs.reduce((m, x) => (x < m ? x : m))) : '';
    }
    case 'max': {
      const xs = nums();
      return xs.length ? fmt(xs.reduce((m, x) => (x > m ? x : m))) : '';
    }
    case 'range': {
      const xs = nums();
      return xs.length ? fmt(xs.reduce((m, x) => (x > m ? x : m)) - xs.reduce((m, x) => (x < m ? x : m))) : '';
    }
    case 'stdev': {
      const xs = nums();
      if (xs.length < 2) return '';
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
      return fmt(Math.sqrt(variance));
    }
    case 'checked':
      return String(values.filter(Boolean).length);
    case 'unchecked':
      return String(values.filter((v) => !v).length);
    case 'percentChecked':
      return pct(values.filter(Boolean).length);
    case 'percentUnchecked':
      return pct(values.filter((v) => !v).length);
    case 'earliest':
    case 'latest':
    case 'dateRange': {
      const ds = values.filter((v) => typeof v === 'string' && v).sort();
      if (!ds.length) return '';
      if (fn === 'earliest') return formatDate(ds[0], { dateFormat: 'local' });
      if (fn === 'latest') return formatDate(ds[ds.length - 1], { dateFormat: 'local' });
      const days = Math.round((new Date(ds[ds.length - 1]) - new Date(ds[0])) / 86400000);
      return `${days} 天`;
    }
    case 'totalSize': {
      let bytes = 0;
      for (const v of values) if (Array.isArray(v)) for (const a of v) bytes += a.size || 0;
      return formatBytes(bytes);
    }
    default:
      return '';
  }
}

/* ----------------------------------------------------------- conversion */

/**
 * Convert a value when a field changes type. Text is the common ground:
 * the old value is shown as text, then read as the new type.
 */
export function convertValue(fromField, toField, v, ctx) {
  if (v === null || v === undefined) return null;
  const from = fromField.type;
  const to = toField.type;
  if (to === 'date' && typeof v === 'string' && valueKind(fromField, ctx) === 'date') return convertDate(fromField, toField, v);
  if (from === to && to !== 'singleSelect' && to !== 'multipleSelect' && to !== 'link') return v;
  // Numbers keep their magnitude between numeric types.
  const numeric = new Set(['number', 'currency', 'percent', 'duration', 'rating', 'autonumber']);
  // Computed numbers (formulas, rollups, counts) keep their full value, not
  // the rounded text they show. Number fields keep it too: 25% or $19.99
  // stay 0.25 and 19.99 whatever the precision shown.
  if (numeric.has(to) && (numeric.has(from) || isNum(v))) {
    if (to === 'rating') return Math.max(0, Math.min(toField.options?.max || 5, Math.round(v))) || null;
    return v;
  }
  // Any number but zero checks the box, whatever its precision shows.
  if (to === 'checkbox' && isNum(v)) return v !== 0;
  if (from === 'checkbox') {
    // A checked box is 1 ($1, 100%, one star) and an unchecked one 0 as a
    // number; a duration of 1 second means nothing.
    if (to === 'number') return v ? 1 : 0;
    if (numeric.has(to)) return v && to !== 'duration' ? 1 : null;
    return parseText(toField, v ? 'checked' : '', ctx);
  }
  // Names with commas stay whole when read back as a list.
  const toList = to === 'multipleSelect' || to === 'link';
  let text = toList ? listText(fromField, v, ctx) : toText(fromField, v, ctx);
  if (toList && from === 'singleSelect') text = quoteItem(text);
  if (to === 'attachment') return null;
  return parseText(toField, text, ctx);
}

/**
 * A date for another date field, from the stored value rather than the text
 * it shows: "10/12/2026" reads differently in US and European fields, and
 * a time shown in GMT would move. Times keep their moment; a field without
 * times gets the day the source shows.
 */
function convertDate(fromField, toField, v) {
  const o = toField.options || {};
  const shown = shownDate(v, !!fromField.options?.gmt);
  if (!shown) return null;
  if (!o.includeTime) return dateKey(shown);
  if (isDateOnly(v)) return parseDate(v, o);
  return toDate(v).toISOString();
}
