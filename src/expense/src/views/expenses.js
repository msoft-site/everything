import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../lib/store.js';
import { formatTotals, totalsByCurrency } from '../lib/money.js';
import { monthKey, monthLabel } from '../lib/dates.js';
import { normalizeText, debounce } from '../lib/util.js';
import { expenseListByDay, emptyState, skeletonList } from '../ui/common.js';
import { openExpenseForm } from '../ui/expenseform.js';
import { openCapture } from '../ui/capture.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { isEditable } from '../lib/reports.js';
import { downloadBlob, expensesToCSV } from '../lib/export.js';

const STATUS_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'unreported', label: '未加入报销单' },
  { id: 'reported', label: '已加入报销单' },
  { id: 'unreconciled', label: '未对账' },
  { id: 'reconciled', label: '已对账' },
  { id: 'noreceipt', label: '缺少票据' },
];

export function expensesView({ navigate }) {
  const root = el('section.view', { 'aria-labelledby': 'exp-title' });
  const query = new URLSearchParams((location.hash.split('?')[1] || ''));
  const state = { q: '', status: STATUS_FILTERS.some((f) => f.id === query.get('filter')) ? query.get('filter') : 'all', category: '', month: '', selecting: false, selected: new Set() };
  let all = [];
  let loaded = false;

  const search = el('input.input', { type: 'search', placeholder: '搜索商家、备注、金额', 'aria-label': '搜索费用', autocomplete: 'off',
    oninput: debounce((e) => { state.q = e.target.value; renderList(); }, 120) });
  const statusSel = pillSelect('状态', STATUS_FILTERS.map((f) => [f.id, f.label]), state.status, (v) => { state.status = v; renderList(); });
  const catSel = pillSelect('分类', [['', '全部分类'], ...store.categories.map((c) => [c.id, c.name])], '', (v) => { state.category = v; renderList(); });
  const monthSel = el('div.select-wrap');
  const selectBtn = el('button.btn.btn-ghost.btn-sm', { type: 'button', html: icon('squareCheck', 15, 2.2), onclick: () => toggleSelecting() }, '选择');
  const exportBtn = el('button.btn.btn-ghost.btn-sm', { type: 'button', html: icon('sheet', 15, 2.2), 'aria-label': '导出 CSV', title: '将当前显示的费用导出为 CSV', onclick: exportCSV }, 'CSV');

  const summary = el('p.page-sub', { id: 'exp-summary' });
  const listWrap = el('div', { 'aria-live': 'polite', 'aria-busy': 'true' }, skeletonList(6));
  const bulkBar = el('div.bulk-bar', { hidden: true });

  root.append(
    el('div.page-head', {},
      el('div', {}, el('h1.page-title', { id: 'exp-title' }, '费用'), summary),
      el('div.page-actions', {},
        el('button.btn.btn-outline', { type: 'button', html: icon('plus', 16, 2.2), onclick: () => openExpenseForm() }, '手动录入'),
        el('button.btn.btn-primary', { type: 'button', html: icon('camera', 16, 2.2), onclick: () => openCapture() }, '采集'))),
    el('div.filter-bar', {},
      el('div.search-wrap', { html: icon('search', 17, 2) }, search),
      statusSel, catSel, monthSel, el('span.grow'), selectBtn, exportBtn),
    listWrap,
    bulkBar
  );

  function pillSelect(label, options, value, onChange) {
    return el('div.select-wrap', {}, el('select.select.select-pill', { 'aria-label': label, onchange: (e) => onChange(e.target.value) },
      options.map(([v, l]) => el('option', { value: v, selected: v === value }, l))));
  }

  function renderMonthSelect() {
    clear(monthSel);
    monthSel.append(el('select.select.select-pill', { 'aria-label': '月份', onchange: (e) => { state.month = e.target.value; renderList(); } },
      el('option', { value: '', selected: !state.month }, '全部时间'),
      store.months.map((m) => el('option', { value: m, selected: m === state.month }, monthLabel(m)))));
  }

  function filtered() {
    const q = normalizeText(state.q);
    return all.filter((e) => {
      if (state.month && !e.date.startsWith(state.month)) return false;
      if (state.category && e.categoryId !== state.category) return false;
      switch (state.status) {
        case 'unreported': if (e.reportId) return false; break;
        case 'reported': if (!e.reportId) return false; break;
        case 'unreconciled': if (e.reconciled) return false; break;
        case 'reconciled': if (!e.reconciled) return false; break;
        case 'noreceipt': if (e.receiptPath) return false; break;
        default: break;
      }
      if (q) {
        const hay = normalizeText(`${e.merchant} ${e.notes} ${e.amount} ${store.category(e.categoryId)?.name || ''} ${e.date}`);
        if (!q.split(' ').every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }

  function renderList() {
    if (!loaded) return;
    const list = filtered();
    clear(listWrap);
    listWrap.setAttribute('aria-busy', 'false');
    summary.textContent = `显示 ${list.length} / 共 ${all.length} 笔费用，${formatTotals(totalsByCurrency(list), store.settings.baseCurrency)}`;
    if (!all.length) {
      listWrap.append(emptyState({ icon: 'scan', title: '暂无费用记录', text: '采集一张票据或手动录入一笔费用即可开始。', action: { label: '采集票据', icon: 'camera', onClick: () => openCapture() } }));
      return;
    }
    if (!list.length) {
      listWrap.append(emptyState({ icon: 'filter', title: '没有匹配的记录', text: '请尝试其他搜索词或清除筛选条件。', action: { label: '清除筛选', onClick: clearFilters } }));
      return;
    }
    listWrap.append(expenseListByDay(list, (e) => ({
      onClick: state.selecting ? () => toggle(e.id, !state.selected.has(e.id)) : () => openExpenseForm({ expense: e }),
      showDate: false, showReport: true,
      selected: state.selecting ? state.selected.has(e.id) : null,
      onToggle: state.selecting ? (on) => toggle(e.id, on) : null,
    })));
    renderBulk();
  }

  function clearFilters() {
    state.q = ''; state.status = 'all'; state.category = ''; state.month = '';
    search.value = '';
    statusSel.querySelector('select').value = 'all';
    catSel.querySelector('select').value = '';
    renderMonthSelect();
    renderList();
  }

  function toggleSelecting(on = !state.selecting) {
    state.selecting = on;
    state.selected.clear();
    selectBtn.textContent = on ? '完成' : '选择';
    selectBtn.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('selecting', on);
    renderList();
  }
  function toggle(id, on) {
    if (on) state.selected.add(id); else state.selected.delete(id);
    renderList();
  }

  function renderBulk() {
    const n = state.selected.size;
    bulkBar.hidden = !state.selecting;
    clear(bulkBar);
    if (!state.selecting) return;
    const visible = filtered();
    const drafts = store.reports.filter((r) => isEditable(r));
    bulkBar.append(
      el('span.grow', {}, n ? `已选 ${n} 项` : '请选择费用'),
      el('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { for (const e of visible) state.selected.add(e.id); renderList(); } }, '全选'),
      el('button.btn.btn-primary.btn-sm', { type: 'button', disabled: !n, html: icon('folder', 14, 2.2), onclick: () => addToReport([...state.selected], drafts) }, '添加到报销单')
    );
  }

  function addToReport(ids, drafts) {
    const body = el('div.stack');
    const modal = openModal({ title: '添加到报销单', content: body });
    const pick = async (reportId) => {
      try {
        await store.setReport(ids, reportId);
        modal.close();
        toggleSelecting(false);
        toast(`已将 ${ids.length} 笔费用添加到报销单`, { action: { label: '打开', onClick: () => navigate(`#/reports/${reportId}`) } });
      } catch (err) { console.error(err); toast('无法更新，请检查网络连接', { icon: 'wifiOff' }); }
    };
    const titleInput = el('input.input', { type: 'text', placeholder: `${monthLabel(monthKey())}费用报销`, 'aria-label': '新报销单标题' });
    body.append(
      drafts.length ? el('div.list', {}, drafts.map((r) => el('button.list-row', { type: 'button', onclick: () => pick(r.id) },
        el('div.grow', {}, el('div.title', {}, r.title), el('div.sub', {}, '草稿')), el('span', { html: icon('chevR', 18), style: { color: 'var(--ink-3)' } }))))
        : el('p.muted.small', {}, '暂无草稿报销单，请新建一个：'),
      el('div.row', {}, titleInput, el('button.btn.btn-primary', { type: 'button', onclick: async () => {
        const r = await store.createReport({ title: titleInput.value.trim() || titleInput.placeholder }).catch(() => null);
        if (r) pick(r.id);
      } }, '新建'))
    );
  }

  function exportCSV() {
    const list = filtered();
    if (!list.length) { toast('没有可导出的数据', { icon: 'info' }); return; }
    const csv = expensesToCSV(list, { categories: store.categories, reports: store.reports });
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `expenses-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  let alive = true;
  async function load() {
    try {
      all = await store.loadAll();
    } catch (err) {
      console.error(err);
      if (!alive) return;
      clear(listWrap);
      listWrap.append(emptyState({ icon: 'wifiOff', title: '无法加载费用记录', text: '请检查网络连接后重试。', action: { label: '重试', onClick: load } }));
      return;
    }
    if (!alive) return;
    loaded = true;
    renderMonthSelect();
    renderList();
  }
  const onChange = () => load();
  store.addEventListener('change', onChange);
  root.destroy = () => { alive = false; store.removeEventListener('change', onChange); document.body.classList.remove('selecting'); };
  load();
  return root;
}
