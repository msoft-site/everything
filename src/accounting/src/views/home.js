/** Home: what needs attention, and the business at a glance. */
import { el, swap } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { selectInput } from '../ui/fields.js';
import { columnChart, donutChart } from '../ui/chart.js';
import { navigate } from '../ui/router.js';
import { viewState } from './page.js';
import { store } from '../lib/store.js';
import { openNew } from '../forms/lazy.js';
import { formatMoney } from '../lib/money.js';
import { periodRange, today, monthBuckets, addMonths, startOfMonth, formatRange, addDays } from '../lib/dates.js';
import { isBalanceSheet, typeInfo } from '../lib/accounts.js';
import { profitAndLoss } from '../lib/reports.js';
import { dueDates } from '../lib/recurring.js';

const LS_PRIVACY = 'bookkeeping:privacy';

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好';
  return name ? `${part}，${name}` : part;
}

function card(title, body, { action = null, wide = false, className = '' } = {}) {
  return el(`section.card.home-card${wide ? '.wide' : ''}${className ? `.${className}` : ''}`, { 'aria-label': title },
    el('div.card-head', {}, el('h2.card-title', {}, title), action ? el('div.spacer') : null, action),
    el('div.card-body', {}, body));
}

function periodSelect(st, key, onChange) {
  return selectInput({
    options: [['thisMonth', '本月'], ['lastMonth', '上月'], ['thisQuarter', '本季度'], ['lastQuarter', '上季度'], ['thisYearToDate', '今年以来'], ['last365', '过去12个月']],
    value: st[key], ariaLabel: '统计周期', onChange: (v) => { st[key] = v; onChange(); },
  });
}

export function renderHome(main, _route, { user } = {}) {
  const st = viewState('home', { pnl: 'thisMonth', exp: 'thisMonth' });
  let privacy = false;
  try { privacy = localStorage.getItem(LS_PRIVACY) === 'on'; } catch {}
  const rerender = () => renderHome(main, _route, { user });
  const now = today();
  const fy = store.settings.fiscalStartMonth;
  const sm = store.summary();

  // ------------------------------------------------------ needs attention
  const review = [...store.bankLines.values()].filter((l) => l.status === 'review').length;
  const pendingEstimates = store.txnList((t) => t.type === 'estimate' && (t.status || 'pending') === 'pending').length;
  const reminders = [...store.recurring.values()].filter((r) => r.mode === 'reminder' && dueDates(r, now, 1).length);
  const tasks = [
    sm.overdueCount && { icon: 'alert', tone: 'negative', text: `${sm.overdueCount} 笔逾期发票`, amount: sm.overdueInvoices, to: 'invoices?status=overdue' },
    review && { icon: 'bank', tone: 'info', text: `${review} 笔银行交易待核对`, to: 'banking' },
    sm.overdueBillCount && { icon: 'receipt', tone: 'warning', text: `${sm.overdueBillCount} 笔逾期账单`, amount: sm.overdueBills, to: 'bills?status=overdue' },
    sm.notDepositedCount && { icon: 'piggy', tone: 'info', text: `${sm.notDepositedCount} 笔付款待存入`, amount: sm.notDeposited, action: () => openNew('deposit') },
    reminders.length && { icon: 'repeat', tone: 'info', text: `${reminders.length} 笔定期交易待审核`, to: 'recurring' },
    pendingEstimates && { icon: 'estimate', tone: 'info', text: `${pendingEstimates} 笔待处理报价单`, to: 'estimates?status=pending' },
  ].filter(Boolean);
  const attention = tasks.length
    ? el('ul.task-list', {}, tasks.map((t) => el('li', {},
      el(t.to ? 'a.task' : 'button.task', { href: t.to ? `#/${t.to}` : null, type: t.to ? null : 'button', onclick: t.action || null },
        el(`span.task-ico.tone-${t.tone}`, { html: icon(t.icon, 16) }),
        el('span.grow', {}, t.text),
        t.amount !== undefined ? el('span.money.priv', {}, formatMoney(t.amount)) : null,
        el('span', { html: icon('chevR', 16) })))))
    : el('div.empty', { style: { padding: '24px 8px' } }, el('div.empty-icon', { html: icon('ok', 24) }), el('h2', {}, "所有事项已处理完毕"), el('p', {}, '逾期发票、账单以及待审核的银行交易将在此处显示。'));

  // ------------------------------------------------------------- P&L
  const pr = periodRange(st.pnl, { now, fiscalStartMonth: fy });
  const pnl = profitAndLoss(store, { from: pr.from, to: pr.to, basis: store.settings.accountingMethod });
  const val = (label) => pnl.rows.find((r) => r.label === label)?.values[0] || 0;
  const income = val('Total for Income') + val('Total for Other Income');
  const expenses = val('Total for Expenses') + val('Total for Cost of Goods Sold') + val('Total for Other Expenses');
  const net = income - expenses;
  const maxBar = Math.max(income, expenses, 1);
  const bar = (label, value, color) => el('div.pl-bar', {},
    el('div.pl-bar-head', {}, el('span.kpi-label', {}, label), el('span.money.priv', {}, formatMoney(value))),
    el('div.progress', { role: 'img', 'aria-label': `${label} ${formatMoney(value)}` }, el('span', { style: { width: `${Math.max(0, (value / maxBar) * 100)}%`, background: `var(${color})` } })));
  const pnlCard = card('利润表 (损益概览)', el('div.stack', {},
    el('div', {}, el('div.kpi-label', {}, `净利润 (${formatRange(pr.from, pr.to)})`), el(`div.kpi-value.priv${net < 0 ? '.neg' : ''}`, {}, formatMoney(net))),
    bar('营业收入', income, '--chart-1'),
    bar('支出费用', expenses, '--chart-2'),
    el('a.link-btn', { href: `#/report/pnl` }, '查看报表')), { action: periodSelect(st, 'pnl', rerender) });

  // ---------------------------------------------------------- expenses
  const er = periodRange(st.exp, { now, fiscalStartMonth: fy });
  const L = store.ledger(store.settings.accountingMethod);
  const act = L.activity(er.from, er.to);
  const slices = [];
  for (let i = 0; i < L.accountIds.length; i++) {
    const a = store.account(L.accountIds[i]);
    if (!a || !['expense', 'cogs', 'otherExpense'].includes(a.type) || act[i] <= 0) continue;
    slices.push({ label: a.name, value: act[i] });
  }
  slices.sort((a, b) => b.value - a.value);
  const expCard = card('支出费用', slices.length
    ? donutChart({ title: `支出分类占比 (${formatRange(er.from, er.to)})`, slices, centerLabel: '总支出', onSelect: () => navigate('report/pnl') })
    : el('p.muted', {}, '该周期内暂无支出记录。'), { action: periodSelect(st, 'exp', rerender) });

  // ---------------------------------------------------------- invoices
  let paid30 = 0;
  for (const t of store.txns.values()) if (!t.voided && (t.type === 'payment' || t.type === 'salesReceipt') && t.date >= addDays(now, -30)) paid30 += store.total(t);
  const invTotal = Math.max(sm.openInvoices + paid30, 1);
  const invCard = card('发票概览', el('div.stack', {},
    el('div.inv-split', {},
      el('div', {}, el('div.kpi-label', {}, `未收款 (${sm.openCount})`), el('div.kpi-value.priv', {}, formatMoney(sm.openInvoices))),
      el('div', {}, el('div.kpi-label', {}, '近30天已收款'), el('div.kpi-value.priv', {}, formatMoney(paid30)))),
    el('div.progress.progress-lg', { role: 'img', 'aria-label': `逾期 ${formatMoney(sm.overdueInvoices)}, 未到期 ${formatMoney(sm.openInvoices - sm.overdueInvoices)}, 已收 ${formatMoney(paid30)}` },
      el('span', { style: { width: `${(sm.overdueInvoices / invTotal) * 100}%`, background: 'var(--negative)' } }),
      el('span', { style: { width: `${((sm.openInvoices - sm.overdueInvoices) / invTotal) * 100}%`, background: 'var(--chart-other)' } }),
      el('span', { style: { width: `${(paid30 / invTotal) * 100}%`, background: 'var(--positive)' } })),
    el('ul.legend-list', {},
      el('li', {}, el('span.chart-swatch', { style: { background: 'var(--negative)' } }), el('a', { href: '#/invoices?status=overdue' }, '已逾期'), el('span.money.priv', {}, formatMoney(sm.overdueInvoices))),
      el('li', {}, el('span.chart-swatch', { style: { background: 'var(--chart-other)' } }), el('a', { href: '#/invoices?status=notDue' }, '未到期'), el('span.money.priv', {}, formatMoney(sm.openInvoices - sm.overdueInvoices))),
      el('li', {}, el('span.chart-swatch', { style: { background: 'var(--positive)' } }), el('a', { href: '#/invoices?status=paid' }, '已付清'), el('span.money.priv', {}, formatMoney(paid30))))));

  // ------------------------------------------------------------ banks
  const banks = store.accountsOfType('bank', 'creditCard');
  const bankCard = card('银行账户', banks.length ? el('ul.bank-list', {}, banks.map((a) => {
    const n = [...store.bankLines.values()].filter((l) => l.accountId === a.id && l.status === 'review').length;
    return el('li', {}, el('a.bank-row', { href: `#/banking?account=${a.id}` },
      el('span.task-ico.tone-info', { html: icon(a.type === 'creditCard' ? 'card' : 'bank', 15) }),
      el('span.grow', {}, el('div.truncate', {}, a.name), el('div.cell-sub', {}, n ? `${n} 笔待对账` : '已最新')),
      el('span', { style: { textAlign: 'right' } },
        el('div.money.priv', {}, formatMoney(store.accountBalance(a.id))),
        el('div.cell-sub', {}, '账面余额'))));
  })) : el('p.muted', {}, '暂无银行账户。'), { action: el('a.link-btn', { href: '#/banking' }, '前往银行账户') });

  // ------------------------------------------------- income vs expenses
  const months = monthBuckets(startOfMonth(addMonths(now, -11)), now);
  const inc = []; const exp = [];
  for (const m of months) {
    const a = L.activity(m.from, m.to);
    let i = 0; let e = 0;
    for (let k = 0; k < L.accountIds.length; k++) {
      const acct = store.account(L.accountIds[k]);
      if (!acct || isBalanceSheet(acct.type)) continue;
      const v = a[k] * typeInfo(acct.type).sign;
      if (typeInfo(acct.type).cls === 'income') i += v; else e += v;
    }
    inc.push(i); exp.push(e);
  }
  const trendCard = card('收支趋势', columnChart({
    title: '近 12 个月收支对比趋势',
    categories: months.map((m) => m.label.slice(0, 3)),
    series: [{ name: '收入', values: inc }, { name: '支出', values: exp }],
    onSelect: (i) => navigate(`report/pnl?from=${months[i].from}&to=${months[i].to}`),
  }), { wide: true });

  const privacyBtn = el('button.btn.btn-ghost', { type: 'button', 'aria-pressed': String(privacy) },
    el('span', { html: icon(privacy ? 'eyeOff' : 'eye', 18) }), privacy ? '显示金额' : '隐私模式');
  privacyBtn.addEventListener('click', () => {
    try { localStorage.setItem(LS_PRIVACY, privacy ? 'off' : 'on'); } catch {}
    rerender();
  });

  const quick = [
    ['创建发票', () => openNew('invoice')],
    ['记录收款', () => openNew('payment')],
    ['记录支出', () => openNew('expense')],
    ['录入账单', () => openNew('bill')],
    ['支付账单', () => openNew('pay-bills')],
    ['记录存入', () => openNew('deposit')],
    ['开具支票', () => openNew('check')],
    ['导入对账单', () => import('./banking.js').then((m) => m.openBankImport())],
  ];

  swap(main, el('div.page.home', { class: privacy ? 'privacy-on' : '' },
    el('div.home-hero', {},
      el('h1.page-title.home-title', { tabIndex: -1 }, greeting(user?.username)),
      el('div.spacer'),
      privacyBtn),
    el('div.home-actions', {},
      el('h2.home-actions-title', { id: 'home-actions-title' }, '快捷操作'),
      el('div.chip-row', { role: 'group', 'aria-labelledby': 'home-actions-title' }, quick.map(([label, fn]) => el('button.chip', { type: 'button', onclick: fn }, el('span', { html: icon('plus', 15) }), label)))),
    el('h2.home-section', {}, '业务概览'),
    el('div.home-grid', {},
      card('待办事项', attention),
      pnlCard,
      invCard,
      expCard,
      bankCard,
      trendCard)));
}
