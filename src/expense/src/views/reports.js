import { el, clear, field } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../lib/store.js';
import { formatTotals, formatMoney } from '../lib/money.js';
import { formatDate, monthKey } from '../lib/dates.js';
import { REPORT_STATUSES, STATUS_LABEL, nextStatus, transitionLabel, isEditable, reportTotals, reportExpenses, suggestReportTitle } from '../lib/reports.js';
import { statusBadge, expenseListByDay, emptyState, skeletonList, sectionHead, expenseRow } from '../ui/common.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { openExpenseForm } from '../ui/expenseform.js';
import { downloadBlob, expensesToCSV } from '../lib/export.js';

export function reportsView({ navigate, params }) {
  return params?.id ? reportDetail({ navigate, id: params.id }) : reportsList({ navigate });
}

/* ------------------------------------------------------------ list */

function reportsList({ navigate }) {
  const root = el('section.view', { 'aria-labelledby': 'rep-title' });
  let filter = 'open';
  const listWrap = el('div', { 'aria-busy': 'true' }, skeletonList(3));
  const seg = el('div.segmented', { role: 'group', 'aria-label': '筛选报销单' },
    ['open', 'reimbursed', 'all'].map((f) => el('button', {
      type: 'button', 'aria-pressed': f === filter,
      onclick: (e) => { filter = f; for (const b of seg.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); render(); },
    }, f === 'open' ? '进行中' : f === 'reimbursed' ? '已报销' : '全部')));

  root.append(
    el('div.page-head', {},
      el('div', {}, el('h1.page-title', { id: 'rep-title' }, '报销单'), el('p.page-sub', {}, '汇总多笔费用并全程跟踪报销进度')),
      el('div.page-actions', {}, el('button.btn.btn-primary', { type: 'button', html: icon('plus', 16, 2.2), onclick: () => openReportForm({ onSaved: (r) => navigate(`#/reports/${r.id}`) }) }, '新建报销单'))),
    el('div.filter-bar', {}, seg),
    listWrap
  );

  let all = [];
  let alive = true;
  async function render() {
    try { all = await store.loadAll(); } catch (err) { console.error(err); }
    if (!alive) return;
    const reports = store.reports.filter((r) => filter === 'all' || (filter === 'reimbursed' ? r.status === 'reimbursed' : r.status !== 'reimbursed'));
    clear(listWrap);
    listWrap.setAttribute('aria-busy', 'false');
    if (!store.reports.length) {
      listWrap.append(emptyState({ icon: 'folder', title: '暂无报销单', text: '报销单可将一次出差、某个月或某个项目的费用归集在一起，并依次推进草稿、已提交、已批准到已报销流程。', action: { label: '创建报销单', icon: 'plus', onClick: () => openReportForm({ onSaved: (r) => navigate(`#/reports/${r.id}`) }) } }));
      return;
    }
    if (!reports.length) {
      listWrap.append(emptyState({ icon: 'folder', title: filter === 'open' ? '暂无进行中的报销单' : '暂无已报销的报销单', text: filter === 'open' ? '所有报销单均已完成报销。' : '报销打款完成后会显示在这里。' }));
      return;
    }
    listWrap.append(el('div.report-grid', {}, reports.map((r) => reportCard(r, all))));
  }

  function reportCard(r, expenses) {
    const t = reportTotals(r, expenses);
    const step = REPORT_STATUSES.indexOf(r.status);
    return el('a.report-card', { href: `#/reports/${r.id}` },
      el('div.row.between', {}, el('h3.report-card-title.truncate', {}, r.title), statusBadge(r.status)),
      el('div.report-card-total', {}, formatTotals(t.byCurrency, store.settings.baseCurrency)),
      el('div.report-card-meta', {},
        `${t.count} 笔费用`,
        t.count ? `，${t.withReceipt}/${t.count} 含票据` : '',
        r.status === 'reimbursed' && r.reimbursedAt ? `，已于 ${formatDate(new Date(r.reimbursedAt).toISOString().slice(0, 10))} 报销` : ''),
      el('ol.steps', { 'aria-label': `状态：${STATUS_LABEL[r.status]}` }, REPORT_STATUSES.map((s, i) => el('li', { className: `step${i <= step ? ' done' : ''}`, 'aria-current': s === r.status ? 'step' : null }, el('span.visually-hidden', {}, STATUS_LABEL[s]))))
    );
  }

  const onChange = () => render();
  store.addEventListener('change', onChange);
  root.destroy = () => { alive = false; store.removeEventListener('change', onChange); };
  render();
  return root;
}

/* ------------------------------------------------------------ detail */

function reportDetail({ navigate, id }) {
  const root = el('section.view.report-detail', { 'aria-labelledby': 'rep-title' });
  let alive = true;

  async function render() {
    const report = store.report(id);
    clear(root);
    if (!report) {
      root.append(el('a.back-link', { href: '#/reports', html: icon('chevL', 16, 2.2) }, '报销单'),
        emptyState({ icon: 'folder', title: '未找到报销单', text: '该报销单可能已被删除。' }));
      return;
    }
    let all = [];
    try { all = await store.loadAll(); } catch (err) { console.error(err); }
    if (!alive) return;
    const expenses = reportExpenses(report, all);
    const t = reportTotals(report, expenses);
    const editable = isEditable(report);
    const next = nextStatus(report.status);
    const missingReceipts = expenses.filter((e) => !e.receiptPath).length;

    const primary = next && el('button.btn.btn-primary', {
      type: 'button', html: icon(next === 'submitted' ? 'send' : next === 'approved' ? 'badge' : 'banknote', 16, 2.2),
      onclick: async () => {
        if (next === 'submitted' && !expenses.length) { toast('提交前请至少添加一笔费用', { icon: 'info' }); return; }
        if (next === 'submitted' && missingReceipts) {
          const ok = await confirmDialog({ title: '部分费用缺少票据，确认提交？', message: `有 ${missingReceipts} 笔费用尚未附上票据。您仍可提交，但提交后费用将被锁定，撤回报销单后才能修改。`, confirmLabel: '仍然提交', danger: false });
          if (!ok) return;
        }
        try { await store.transitionReport(id, next); toast(`报销单${STATUS_LABEL[next]}`); } catch (err) { console.error(err); toast('无法更新报销单', { icon: 'wifiOff' }); }
      },
    }, transitionLabel(report.status));

    const more = el('div.page-actions', {},
      report.status === 'submitted' && el('button.btn.btn-ghost', { type: 'button', html: icon('undo', 16, 2.2), onclick: async () => { await store.transitionReport(id, 'draft').catch(() => toast('无法撤回', { icon: 'wifiOff' })); toast('报销单已退回草稿状态'); } }, '撤回'),
      el('button.btn.btn-outline', { type: 'button', html: icon('sheet', 16, 2.2), onclick: () => {
        if (!expenses.length) { toast('没有可导出的数据', { icon: 'info' }); return; }
        downloadBlob(new Blob([expensesToCSV(expenses, { categories: store.categories, reports: store.reports })], { type: 'text/csv;charset=utf-8' }), `${report.title.replace(/[^\w-]+/g, '-')}.csv`);
      } }, 'CSV'),
      el('button.btn.btn-outline', { type: 'button', html: icon('printer', 16, 2.2), onclick: () => window.print() }, '打印'),
      el('button.icon-btn', { type: 'button', html: icon('pencil', 18, 2), 'aria-label': '编辑报销单', title: '编辑', onclick: () => openReportForm({ report }) }),
      el('button.icon-btn.danger', { type: 'button', html: icon('trash', 18, 2), 'aria-label': '删除报销单', title: '删除', onclick: async () => {
        const ok = await confirmDialog({ title: '删除此报销单？', message: '报销单内的费用将被保留，并恢复为“未加入报销单”状态。', confirmLabel: '删除报销单' });
        if (!ok) return;
        try { await store.deleteReport(id); toast('报销单已删除', { icon: 'trash' }); navigate('#/reports'); } catch (err) { console.error(err); toast('无法删除', { icon: 'wifiOff' }); }
      } }),
      primary
    );

    const step = REPORT_STATUSES.indexOf(report.status);
    const timeline = el('ol.timeline', { 'aria-label': '报销进度' }, REPORT_STATUSES.map((s, i) => {
      const at = { submitted: report.submittedAt, approved: report.approvedAt, reimbursed: report.reimbursedAt, draft: report.createdAt }[s];
      return el('li', { className: `tl-step${i <= step ? ' done' : ''}${s === report.status ? ' current' : ''}`, 'aria-current': s === report.status ? 'step' : null },
        el('span.tl-dot', { 'aria-hidden': 'true' }),
        el('span.tl-label', {}, STATUS_LABEL[s]),
        el('span.tl-date', {}, i <= step && at ? formatDate(new Date(at).toISOString().slice(0, 10)) : ''));
    }));

    root.append(
      el('a.back-link', { href: '#/reports', html: icon('chevL', 16, 2.2) }, '报销单'),
      el('div.page-head', {},
        el('div', {},
          el('div.row', {}, el('h1.page-title', { id: 'rep-title' }, report.title), statusBadge(report.status)),
          el('p.page-sub', {}, report.notes || `创建于 ${formatDate(new Date(report.createdAt).toISOString().slice(0, 10))}`)),
        more),
      el('div.report-summary.card', {},
        el('div.report-total', {}, el('span.label', {}, '合计'), el('span.value', {}, formatTotals(t.byCurrency, store.settings.baseCurrency))),
        el('div.report-facts', {},
          fact('receipt', `${t.withReceipt}/${t.count}`, '含票据'),
          fact('circleCheck', `${t.reconciled}/${t.count}`, '已对账'),
          fact('layers', String(t.count), '笔费用')),
        timeline),
      !editable && el('div.banner', {}, el('span', { html: icon('info', 15, 2.2) }), el('span.grow', {}, '此报销单已提交。如需添加或移除费用，请先将其撤回。')),
      el('div.card', {},
        sectionHead('费用明细', editable && el('button.btn.btn-outline.btn-sm', { type: 'button', html: icon('plus', 14, 2.2), onclick: () => openAddExpenses(report, all) }, '添加费用')),
        expenses.length
          ? expenseListByDay(expenses, (e) => ({
            onClick: () => openExpenseForm({ expense: e }), showDate: false,
            trail: el('div.trail', {}, el('div.amount', {}, formatMoney(e.amount, e.currency)),
              editable && el('button.icon-btn', { type: 'button', html: icon('x', 16, 2.2), 'aria-label': `从报销单移除 ${e.merchant}`, title: '从报销单移除',
                onclick: (ev) => { ev.stopPropagation(); store.setReport([e.id], null).then(() => toast('已从报销单移除')).catch(() => toast('无法移除', { icon: 'wifiOff' })); } })),
          }))
          : emptyState({ icon: 'receipt', title: '此报销单暂无费用', text: editable ? '添加已录入的费用，或在采集新票据保存时选择此报销单。' : '', action: editable ? { label: '添加费用', icon: 'plus', onClick: () => openAddExpenses(report, all) } : null }))
    );
  }

  function fact(ic, value, label) {
    return el('div.fact', { html: icon(ic, 16, 2) }, el('span.fact-value', {}, value), el('span.fact-label', {}, label));
  }

  function openAddExpenses(report, all) {
    const candidates = all.filter((e) => !e.reportId);
    const picked = new Set();
    const list = el('div');
    const addBtn = el('button.btn.btn-primary', { type: 'button', disabled: true }, '添加');
    const renderList = () => {
      clear(list);
      if (!candidates.length) { list.append(el('p.muted', {}, '所有费用均已加入报销单。请采集新费用并在保存时选择此报销单。')); return; }
      list.append(expenseListByDay(candidates, (e) => ({
        onClick: () => { if (picked.has(e.id)) picked.delete(e.id); else picked.add(e.id); addBtn.disabled = !picked.size; addBtn.textContent = picked.size ? `添加 ${picked.size} 笔` : '添加'; renderList(); },
        showDate: false, selected: picked.has(e.id), onToggle: (on) => { if (on) picked.add(e.id); else picked.delete(e.id); addBtn.disabled = !picked.size; addBtn.textContent = picked.size ? `添加 ${picked.size} 笔` : '添加'; renderList(); },
      }), { totals: false }));
    };
    renderList();
    addBtn.onclick = async () => {
      addBtn.disabled = true;
      try { await store.setReport([...picked], report.id); modal.close(); toast(`已添加 ${picked.size} 笔费用至 ${report.title}`); } catch (err) { console.error(err); addBtn.disabled = false; toast('无法添加', { icon: 'wifiOff' }); }
    };
    const modal = openModal({ title: '添加费用', content: el('div', {}, list, el('div.row.end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), addBtn)) });
  }

  const onChange = () => render();
  store.addEventListener('change', onChange);
  root.destroy = () => { alive = false; store.removeEventListener('change', onChange); };
  render();
  return root;
}

/* ------------------------------------------------------------ create / edit */

export function openReportForm({ report = null, onSaved = null } = {}) {
  const title = el('input.input', { type: 'text', value: report?.title || '', placeholder: suggestReportTitle(monthKey()), maxlength: 80 });
  const notes = el('textarea.textarea', { rows: 2, placeholder: '报销事由、成本中心、出差行程' }, report?.notes || '');
  const save = el('button.btn.btn-primary', { type: 'submit' }, report ? '保存' : '创建报销单');
  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        const data = { title: title.value.trim() || title.placeholder, notes: notes.value.trim() };
        const saved = report ? await store.updateReport(report.id, data) : await store.createReport(data);
        modal.close();
        toast(report ? '报销单已更新' : '报销单已创建');
        onSaved?.(saved);
      } catch (err) { console.error(err); save.disabled = false; toast('无法保存', { icon: 'wifiOff' }); }
    },
  },
    field('标题', title),
    field('备注', notes, { hint: '（选填）' }),
    el('div.row.end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), save));
  const modal = openModal({ title: report ? '编辑报销单' : '新建报销单', content: form });
  return modal;
}
