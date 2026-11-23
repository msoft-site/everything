/**
 * Business rules shared by the worker and the app: the condition language
 * used by views and triggers, macro and trigger actions, text placeholders,
 * and service level targets. All pure functions over plain records.
 */
import { STATUSES, PRIORITY_RANK, isUnsolved, normTags, firstName, oneOf, PRIORITIES, TYPES } from './model.js';

const HOUR = 3600 * 1000;
const STATUS_RANK = Object.fromEntries(STATUSES.map((s, i) => [s, i]));

/** Fields a condition can test, with the operators each supports. */
export const CONDITION_FIELDS = {
  status: { label: '状态', ops: ['is', 'is_not', 'less_than', 'greater_than', 'changed_to'] },
  priority: { label: '优先级', ops: ['is', 'is_not', 'less_than', 'greater_than'] },
  type: { label: '类型', ops: ['is', 'is_not'] },
  assignee: { label: '负责人', ops: ['is', 'is_not', 'changed'] },
  group: { label: '分组', ops: ['is', 'is_not'] },
  requester: { label: '请求人', ops: ['is', 'is_not'] },
  organization: { label: '组织', ops: ['is', 'is_not'] },
  channel: { label: '渠道', ops: ['is', 'is_not'] },
  tags: { label: '标签', ops: ['includes', 'excludes'] },
  subject: { label: '主题', ops: ['contains', 'not_contains'] },
  followers: { label: '关注者', ops: ['includes_me'] },
  created: { label: '创建后经过小时数', ops: ['less_than', 'greater_than'] },
  updated: { label: '更新后经过小时数', ops: ['less_than', 'greater_than'] },
  solved: { label: '解决后经过小时数', ops: ['less_than', 'greater_than'] },
  satisfaction: { label: '满意度', ops: ['is'] },
  actor: { label: '更新人', ops: ['is'] },
  comment: { label: '回复', ops: ['is'] },
};

export const OP_LABEL = {
  is: '等于',
  is_not: '不等于',
  less_than: '小于',
  greater_than: '大于',
  changed_to: '变更为',
  changed: '已变更',
  includes: '包含以下至少一项',
  excludes: '不包含以下任何一项',
  contains: '包含',
  not_contains: '不包含',
  includes_me: '包含我',
};

function hoursSince(ts, now) {
  return ts ? (now - ts) / HOUR : Infinity;
}

function compareRank(rank, a, b, op) {
  const x = rank[a];
  const y = rank[b];
  if (x === undefined || y === undefined) return false;
  return op === 'less_than' ? x < y : x > y;
}

/**
 * Test one condition. `ctx` carries `me` (the viewing agent's uuid), `now`,
 * and for triggers `before` (the ticket before the update), `actor`
 * ('agent' | 'customer' | 'system') and `comment` (null | { public }).
 */
export function testCondition(cond, t, ctx = {}) {
  const now = ctx.now ?? Date.now();
  const { field, op } = cond;
  let value = cond.value;
  switch (field) {
    case 'status':
      if (op === 'changed_to') return !!ctx.before && ctx.before.status !== t.status && t.status === value;
      if (op === 'less_than' || op === 'greater_than') return compareRank(STATUS_RANK, t.status, value, op);
      return op === 'is' ? t.status === value : t.status !== value;
    case 'priority':
      if (op === 'less_than' || op === 'greater_than') return compareRank(PRIORITY_RANK, t.priority, value, op);
      return op === 'is' ? (t.priority || '') === (value || '') : (t.priority || '') !== (value || '');
    case 'type':
      return op === 'is' ? (t.type || '') === (value || '') : (t.type || '') !== (value || '');
    case 'assignee': {
      if (op === 'changed') return !!ctx.before && (ctx.before.assignee || '') !== (t.assignee || '');
      if (value === 'me') value = ctx.me || '';
      const eq = (t.assignee || '') === (value || '');
      return op === 'is' ? eq : !eq;
    }
    case 'group': {
      const eq = (t.group || '') === (value || '');
      return op === 'is' ? eq : !eq;
    }
    case 'requester': {
      const eq = String(t.requester || '') === String(value || '');
      return op === 'is' ? eq : !eq;
    }
    case 'organization': {
      const eq = String(t.org || '') === String(value || '');
      return op === 'is' ? eq : !eq;
    }
    case 'channel': {
      const eq = t.via === value;
      return op === 'is' ? eq : !eq;
    }
    case 'tags': {
      const want = normTags(value);
      const has = want.some((tag) => (t.tags || []).includes(tag));
      return op === 'includes' ? has : !has;
    }
    case 'subject': {
      const has = String(t.subject || '').toLowerCase().includes(String(value || '').toLowerCase());
      return op === 'contains' ? has : !has;
    }
    case 'followers':
      return !!ctx.me && (t.followers || []).includes(ctx.me);
    case 'created':
    case 'updated':
    case 'solved': {
      const ts = field === 'created' ? t.createdAt : field === 'updated' ? t.updatedAt : t.solvedAt;
      const h = hoursSince(ts, now);
      const n = Number(value);
      if (String(value ?? '').trim() === '' || !Number.isFinite(n)) return false;
      if (op === 'less_than') return h < n;
      return h > n && h !== Infinity;
    }
    case 'satisfaction':
      if (value === 'unrated') return !t.csat;
      return t.csat?.score === value;
    case 'actor':
      return ctx.actor === value;
    case 'comment':
      if (value === 'public') return !!ctx.comment && ctx.comment.public;
      if (value === 'private') return !!ctx.comment && !ctx.comment.public;
      if (value === 'present') return !!ctx.comment;
      return !ctx.comment;
    default:
      if (field && field.startsWith('field:')) {
        const v = t.fields?.[field.slice(6)];
        if (op === 'present') return v !== undefined && v !== null && v !== '';
        if (op === 'absent') return v === undefined || v === null || v === '';
        const eq = String(v ?? '') === String(value ?? '');
        return op === 'is_not' ? !eq : eq;
      }
      return false;
  }
}

/** All of `all` must hold and, when `any` is non-empty, at least one of it. */
export function matches(conditions, ticket, ctx) {
  const all = conditions?.all || [];
  const any = conditions?.any || [];
  for (const c of all) if (!testCondition(c, ticket, ctx)) return false;
  if (any.length && !any.some((c) => testCondition(c, ticket, ctx))) return false;
  return true;
}

/** Built-in views every desk starts with. Their ids start with `sys-`. */
export const SYSTEM_VIEWS = [
  {
    id: 'sys-mine',
    title: '您未解决的工单',
    conditions: { all: [{ field: 'assignee', op: 'is', value: 'me' }, { field: 'status', op: 'less_than', value: 'solved' }] },
    sort: { field: 'updatedAt', dir: 'desc' },
  },
  {
    id: 'sys-unassigned',
    title: '未分配的工单',
    conditions: { all: [{ field: 'assignee', op: 'is', value: '' }, { field: 'status', op: 'less_than', value: 'solved' }] },
    sort: { field: 'createdAt', dir: 'asc' },
  },
  {
    id: 'sys-unsolved',
    title: '所有未解决的工单',
    conditions: { all: [{ field: 'status', op: 'less_than', value: 'solved' }] },
    sort: { field: 'updatedAt', dir: 'desc' },
  },
  {
    id: 'sys-recent',
    title: '最近更新的工单',
    conditions: { all: [{ field: 'updated', op: 'less_than', value: 168 }] },
    sort: { field: 'updatedAt', dir: 'desc' },
  },
  {
    id: 'sys-pending',
    title: '待回复的工单',
    conditions: { all: [{ field: 'status', op: 'is', value: 'pending' }] },
    sort: { field: 'updatedAt', dir: 'desc' },
  },
  {
    id: 'sys-solved',
    title: '最近解决的工单',
    conditions: { all: [{ field: 'status', op: 'greater_than', value: 'hold' }, { field: 'solved', op: 'less_than', value: 168 }] },
    sort: { field: 'solvedAt', dir: 'desc' },
  },
];

/** Hidden views reached from the bottom of the views list. */
export const SPECIAL_VIEWS = [
  { id: 'sys-spam', title: '已拦截工单', special: 'spam' },
  { id: 'sys-deleted', title: '已删除工单', special: 'deleted' },
];

export const DEFAULT_COLUMNS = ['status', 'subject', 'requester', 'updatedAt', 'priority', 'assignee'];

/** Whether a ticket belongs in a view (special views look at flags only). */
export function inView(view, t, ctx) {
  if (view.special === 'spam') return !!t.spam && !t.deleted;
  if (view.special === 'deleted') return !!t.deleted;
  if (t.spam || t.deleted || t.mergedInto) return false;
  return matches(view.conditions, t, ctx);
}

/** Apply field actions (from a macro or trigger) to a ticket copy. */
export function applyActions(ticket, actions, ctx = {}) {
  const t = { ...ticket, tags: [...(ticket.tags || [])], followers: [...(ticket.followers || [])], fields: { ...(ticket.fields || {}) } };
  const notifications = [];
  for (const a of actions || []) {
    switch (a.field) {
      case 'status':
        if (STATUSES.includes(a.value) && a.value !== 'closed') t.status = a.value;
        break;
      case 'priority':
        t.priority = oneOf(a.value, PRIORITIES, null);
        break;
      case 'type':
        t.type = oneOf(a.value, TYPES, null);
        break;
      case 'assignee':
        t.assignee = a.value === 'me' ? ctx.me || null : a.value || null;
        break;
      case 'group':
        t.group = a.value || null;
        break;
      case 'add_tags':
        for (const tag of normTags(a.value)) if (!t.tags.includes(tag)) t.tags.push(tag);
        break;
      case 'remove_tags': {
        const drop = new Set(normTags(a.value));
        t.tags = t.tags.filter((tag) => !drop.has(tag));
        break;
      }
      case 'set_tags':
        t.tags = normTags(a.value);
        break;
      case 'add_follower': {
        const who = a.value === 'me' ? ctx.me : a.value;
        if (who && !t.followers.includes(who)) t.followers.push(who);
        break;
      }
      case 'notify_requester':
      case 'notify_email':
        notifications.push({ kind: a.field, to: a.to || null, subject: a.subject || '', body: a.body || '' });
        break;
      default:
        if (a.field && a.field.startsWith('field:')) {
          const id = a.field.slice(6);
          if (a.value === '' || a.value === null || a.value === undefined) delete t.fields[id];
          else t.fields[id] = a.value;
        }
    }
  }
  return { ticket: t, notifications };
}

/**
 * Fill {{placeholders}} in macro and notification text. Unknown names are
 * left as typed so a mistake is visible rather than silently blank.
 */
export function renderPlaceholders(text, data, { escape = (v) => v } = {}) {
  const map = {
    'ticket.id': data.ticket?.id,
    'ticket.subject': data.ticket?.subject,
    'ticket.status': data.ticket?.status,
    'ticket.priority': data.ticket?.priority,
    'ticket.link': data.link,
    'requester.name': data.requester?.name,
    'requester.first_name': firstName(data.requester?.name),
    'requester.email': data.requester?.email,
    'agent.name': data.agent?.name,
    'agent.first_name': firstName(data.agent?.name),
    'desk.name': data.desk?.name,
    'comment.text': data.commentText,
  };
  return String(text ?? '').replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (all, name) => {
    if (!Object.hasOwn(map, name)) return all;
    const v = map[name];
    return v === undefined || v === null ? '' : escape(String(v));
  });
}

export const PLACEHOLDERS = [
  ['{{requester.first_name}}', '请求人的名字'],
  ['{{requester.name}}', '请求人的全名'],
  ['{{agent.first_name}}', '您的名字'],
  ['{{agent.name}}', '您的全名'],
  ['{{ticket.id}}', '工单编号'],
  ['{{ticket.subject}}', '工单主题'],
  ['{{ticket.link}}', '帮助中心里的请求链接'],
  ['{{desk.name}}', '服务台名称'],
];

/** Default service level targets, in minutes, per priority. */
export const DEFAULT_SLA = {
  enabled: true,
  targets: {
    urgent: { first: 60, next: 120, resolve: 8 * 60 },
    high: { first: 4 * 60, next: 8 * 60, resolve: 24 * 60 },
    normal: { first: 8 * 60, next: 24 * 60, resolve: 3 * 24 * 60 },
    low: { first: 24 * 60, next: 48 * 60, resolve: 7 * 24 * 60 },
  },
};

export const SLA_METRIC_LABEL = { first: '首次回复', next: '后续回复', resolve: '解决耗时' };

/**
 * The service level target that is due soonest for a ticket, or null when
 * none applies. Reply targets pause while the ticket waits on the customer
 * (pending) or a third party (on hold).
 */
export function slaStatus(t, sla, now = Date.now()) {
  if (!sla?.enabled || !isUnsolved(t.status) || t.spam || t.deleted) return null;
  const target = sla.targets?.[t.priority || 'normal'];
  if (!target) return null;
  const active = [];
  const waiting = t.status === 'pending' || t.status === 'hold';
  const min = 60 * 1000;
  if (!waiting && !t.firstReplyAt && target.first) {
    // A ticket an agent opened with a public message waits for the customer
    // first; the first reply target starts once they write back.
    const from = !t.lastAgentReplyAt ? t.createdAt : t.lastCustomerAt > t.lastAgentReplyAt ? t.lastCustomerAt : null;
    if (from) active.push({ metric: 'first', dueAt: from + target.first * min });
  }
  if (!waiting && t.firstReplyAt && t.lastCustomerAt && t.lastCustomerAt > (t.lastAgentReplyAt || 0) && target.next) {
    active.push({ metric: 'next', dueAt: t.lastCustomerAt + target.next * min });
  }
  if (target.resolve) active.push({ metric: 'resolve', dueAt: t.createdAt + target.resolve * min });
  if (!active.length) return null;
  active.sort((a, b) => a.dueAt - b.dueAt);
  const next = active[0];
  return { ...next, remaining: next.dueAt - now, breached: next.dueAt <= now };
}

/** Compact duration: 45s, 12m, 3h, 2d, 5w. Negative values keep their sign. */
export function shortDuration(ms) {
  const sign = ms < 0 ? '-' : '';
  const s = Math.abs(ms) / 1000;
  if (s < 60) return `${sign}${Math.max(1, Math.round(s))}s`;
  const m = s / 60;
  if (m < 60) return `${sign}${Math.round(m)}m`;
  const h = m / 60;
  if (h < 48) return `${sign}${Math.round(h)}h`;
  const d = h / 24;
  if (d < 14) return `${sign}${Math.round(d)}d`;
  return `${sign}${Math.round(d / 7)}w`;
}
