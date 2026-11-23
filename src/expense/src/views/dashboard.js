import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../lib/store.js';
import { formatMoney, totalsByCurrency, formatTotals } from '../lib/money.js';
import { monthKey, monthLabel, shiftMonth } from '../lib/dates.js';
import { expenseListByDay, emptyState, skeletonList, catColor, statusBadge, sectionHead } from '../ui/common.js';
import { openExpenseForm } from '../ui/expenseform.js';
import { openCapture } from '../ui/capture.js';
import { reportTotals } from '../lib/reports.js';

export function dashboardView({ navigate }) {
  const root = el('section.view.dashboard', { 'aria-labelledby': 'dash-title' });
  const base = store.settings.baseCurrency;
  const thisMonth = monthKey();

  const head = el('div.page-head', {},
    el('div', {},
      el('h1.page-title', { id: 'dash-title' }, greeting()),
      el('p.page-sub', {}, monthLabel(thisMonth))),
    el('div.page-actions', {},
      el('button.btn.btn-outline', { type: 'button', html: icon('plus', 16, 2.2), onclick: () => openExpenseForm() }, '手动录入'),
      el('button.btn.btn-primary', { type: 'button', html: icon('camera', 16, 2.2), onclick: () => openCapture() }, '采集票据'))
  );
  const stats = el('div.stats', {}, skeletonTiles());
  const grid = el('div.dash-grid');
  root.append(head, stats, grid);

  let alive = true;
  async function render() {
    let all;
    let lines;
    try {
      [all, lines] = await Promise.all([store.loadAll(), store.loadStatements()]);
    } catch (err) {
      console.error(err);
      if (!alive) return;
      clear(grid);
      grid.append(emptyState({ icon: 'wifiOff', title: '无法加载您的费用数据', text: '请检查网络连接后重试。', action: { label: '重试', onClick: render } }));
      return;
    }
    if (!alive) return;

    const inMonth = all.filter((e) => e.date.startsWith(thisMonth));
    const lastMonth = all.filter((e) => e.date.startsWith(shiftMonth(thisMonth, -1)));
    const unreported = all.filter((e) => !e.reportId);
    const awaiting = all.filter((e) => { const r = e.reportId && store.report(e.reportId); return r && (r.status === 'submitted' || r.status === 'approved'); });
    const openLines = lines.filter((l) => !l.matchedExpenseId);
    const monthTotal = sumBase(inMonth);
    const lastTotal = sumBase(lastMonth);

    clear(stats);
    stats.append(
      tile('本月支出', formatMoney(monthTotal, base), deltaText(monthTotal, lastTotal), () => navigate('#/expenses')),
      tile('未加入报销单', formatTotals(totalsByCurrency(unreported), base), `${unreported.length} 笔费用`, () => navigate('#/expenses?filter=unreported')),
      tile('待报销入账', formatTotals(totalsByCurrency(awaiting), base), `${awaiting.length} 笔费用处理中`, () => navigate('#/reports')),
      tile('待对账', String(openLines.length), '条账单记录待处理', () => navigate('#/reconcile'))
    );

    clear(grid);
    if (!all.length) {
      grid.append(el('div.card.span-2', {}, emptyState({
        icon: 'scan', title: '暂无费用记录',
        text: '采集您的第一张票据，AI 将自动为您识别商家、日期与总金额。',
        action: { label: '采集票据', icon: 'camera', onClick: () => openCapture() },
      })));
      return;
    }

    /* Recent activity */
    const recent = all.slice(0, 6);
    grid.append(el('div.card.span-2', {},
      sectionHead('最近费用', el('a.card-link', { href: '#/expenses' }, '查看全部', el('span', { html: icon('chevR', 14, 2.2) }))),
      recent.length ? expenseListByDay(recent, (e) => ({ onClick: () => openExpenseForm({ expense: e }), showDate: false }), { totals: false })
        : el('p.muted.small', {}, '暂无记录')
    ));

    /* By category, this month */
    grid.append(categoryCard(inMonth, base));

    /* Reports in flight */
    const active = store.reports.filter((r) => r.status !== 'reimbursed').slice(0, 4);
    grid.append(el('div.card', {},
      sectionHead('报销单', el('a.card-link', { href: '#/reports' }, '全部报销单', el('span', { html: icon('chevR', 14, 2.2) }))),
      active.length ? el('div.mini-list', {}, active.map((r) => {
        const t = reportTotals(r, all);
        return el('a.mini-row', { href: `#/reports/${r.id}` },
          el('div.grow', {}, el('div.title.truncate', {}, r.title), el('div.sub', {}, `${t.count} 笔费用，${formatTotals(t.byCurrency, base)}`)),
          statusBadge(r.status));
      })) : el('p.muted.small', {}, '暂无进行中的报销单。您可以在“报销单”标签页将未报销的费用打包汇总。')
    ));

    /* Six-month trend */
    grid.append(trendCard(all, base, thisMonth));
  }

  function sumBase(list) {
    // Only base-currency amounts are summed; other currencies are listed separately elsewhere.
    return list.filter((e) => e.currency === base).reduce((a, e) => a + e.amount, 0);
  }

  const onChange = () => render();
  store.addEventListener('change', onChange);
  root.destroy = () => { alive = false; store.removeEventListener('change', onChange); };
  render();
  return root;
}

function greeting() {
  const h = new Date().getHours();
  const who = store.user?.username ? `，${store.user.username}` : '';
  return h < 12 ? `早上好${who}` : h < 18 ? `下午好${who}` : `晚上好${who}`;
}

function tile(label, value, delta, onClick) {
  return el('button.stat', { type: 'button', onclick: onClick },
    el('span.label', {}, label),
    el('span.value', {}, value),
    delta && el('span.delta', {}, delta));
}

function skeletonTiles() {
  return Array.from({ length: 4 }, () => el('div.stat', {},
    el('span.skeleton', { style: { width: '50%', height: '11px' } }),
    el('span.skeleton', { style: { width: '70%', height: '22px' } })));
}

function deltaText(now, prev) {
  if (!prev) return '上月无支出';
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return '与上月持平';
  return `较上月 ${pct > 0 ? '+' : ''}${pct}%`;
}

/** Horizontal bars, one per category, in base currency. Labels carry the values so color is never the only signal. */
function categoryCard(list, base) {
  const byCat = new Map();
  for (const e of list) {
    if (e.currency !== base) continue;
    byCat.set(e.categoryId || 'none', (byCat.get(e.categoryId || 'none') || 0) + e.amount);
  }
  const rows = [...byCat].map(([id, amt]) => ({ cat: store.category(id), amt })).sort((a, b) => b.amt - a.amt);
  const max = rows[0]?.amt || 1;
  const total = rows.reduce((a, r) => a + r.amt, 0);
  return el('div.card', {},
    sectionHead('本月分类支出'),
    rows.length ? el('ul.bars', { 'aria-label': '按分类统计支出' }, rows.slice(0, 8).map(({ cat, amt }) =>
      el('li.bar-row', {},
        el('div.bar-meta', {},
          el('span.bar-swatch', { style: { background: catColor(cat) }, 'aria-hidden': 'true' }),
          el('span.grow.truncate', {}, cat?.name || '未分类'),
          el('span.num', {}, formatMoney(amt, base)),
          el('span.muted.small.num', {}, `${Math.round((amt / total) * 100)}%`)),
        el('div.bar-track', { role: 'img', 'aria-label': `${cat?.name || '未分类'}：${formatMoney(amt, base)}` },
          el('span.bar-fill', { style: { width: `${Math.max(2, (amt / max) * 100)}%`, background: catColor(cat) } }))
      ))) : el('p.muted.small', {}, `本月暂无 ${base} 支出记录`)
  );
}

/** Single-series column chart of the last six months (base currency). */
function trendCard(all, base, thisMonth) {
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(thisMonth, i - 5));
  const totals = months.map((m) => all.filter((e) => e.currency === base && e.date.startsWith(m)).reduce((a, e) => a + e.amount, 0));
  const max = Math.max(...totals, 1);
  return el('div.card', {},
    sectionHead('近六个月趋势'),
    el('div.columns', { role: 'img', 'aria-label': `月度支出：${months.map((m, i) => `${monthLabel(m, { short: true })} ${formatMoney(totals[i], base)}`).join('、')}` },
      months.map((m, i) => el('div.col', { title: `${monthLabel(m, { short: true })}：${formatMoney(totals[i], base)}` },
        el('span.col-value', {}, totals[i] ? formatMoney(totals[i], base, { compact: true }) : ''),
        el('div.col-track', {}, el('span.col-fill', { className: `col-fill${m === thisMonth ? ' current' : ''}`, style: { height: `${Math.max(totals[i] ? 3 : 0, (totals[i] / max) * 100)}%` } })),
        el('span.col-label', {}, `${Number(m.split('-')[1])}月`))))
  );
}
