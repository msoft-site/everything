import { el, clear } from './dom.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { closeAllModals, confirmDialog, openModal } from './modal.js';
import { openCapture } from './capture.js';
import { store } from '../lib/store.js';
import { wipeSampleData } from '../lib/sample.js';
import { openOnboarding } from './onboarding.js';
import { dashboardView } from '../views/dashboard.js';
import { expensesView } from '../views/expenses.js';
import { reportsView } from '../views/reports.js';
import { reconcileView } from '../views/reconcile.js';
import { settingsView, confirmSignOut, canSignOut } from '../views/settings.js';

/* Four destinations on the mobile tab bar plus More; routes marked tab: false
   live in the More sheet there. The desktop sidebar shows everything. */
export const ROUTES = [
  { hash: '#/', label: '首页', icon: 'home', view: dashboardView, key: 'h' },
  { hash: '#/expenses', label: '费用', icon: 'receipt', view: expensesView, key: 'e' },
  { hash: '#/reports', label: '报销单', icon: 'folder', view: reportsView, key: 'r' },
  { hash: '#/reconcile', label: '对账', icon: 'scale', view: reconcileView, key: 'c' },
  { hash: '#/settings', label: '设置', icon: 'gear', view: settingsView, tab: false, key: 's' },
];

const MORE_SUBS = {
  '#/settings': '账户、外观、分类与您的数据',
};

/** Match "#/reports/abc" to the reports route and expose the id as a param. */
export function routeFor(hash) {
  const clean = (hash || '#/').split('?')[0].replace(/\/+$/, '') || '#/';
  const exact = ROUTES.find((r) => r.hash === clean);
  if (exact) return { route: exact, params: {} };
  const parts = clean.split('/');
  const base = `${parts[0]}/${parts[1] || ''}`;
  const route = ROUTES.find((r) => r.hash === base);
  return route ? { route, params: { id: decodeURIComponent(parts[2] || '') } } : { route: ROUTES[0], params: {} };
}

export function mountShell(appRoot) {
  const sampleBanner = el('div');
  const viewWrap = el('div');
  const main = el('main.main', { id: 'main' }, sampleBanner, viewWrap);
  let currentView = null;

  function renderSampleBanner() {
    clear(sampleBanner);
    if (!store.settings.sampleData) return;
    sampleBanner.append(el('div.banner', {},
      el('span', { html: icon('sparkle', 15, 2.2) }),
      el('span.grow', {}, '示例数据：欢迎随意体验，此处并非您的真实数据'),
      el('button', {
        type: 'button',
        onclick: async () => {
          const ok = await confirmDialog({
            title: '重新开始？',
            message: '所有示例数据将被清除，您可以从头开始设置自己的费用数据。',
            confirmLabel: '清除示例数据',
          });
          if (!ok) return;
          try {
            await wipeSampleData(store);
          } catch (err) {
            console.error(err);
            toast('无法清除，请检查网络连接', { icon: 'wifiOff' });
            return;
          }
          location.hash = '#/';
          openOnboarding({ onCapture: () => openCapture() });
        },
      }, '重新开始')
    ));
  }
  store.addEventListener('change', renderSampleBanner);
  renderSampleBanner();

  const navigate = (hash) => { location.hash = hash; };

  /* Attention counts: expenses not yet in any report, statement lines still open. */
  const badges = { expenses: 0, reconcile: 0 };
  async function refreshBadges() {
    try {
      const [all, lines] = await Promise.all([store.loadAll(), store.loadStatements()]);
      const unreported = all.filter((e) => !e.reportId).length;
      const open = lines.filter((l) => !l.matchedExpenseId).length;
      if (badges.expenses !== unreported || badges.reconcile !== open) {
        badges.expenses = unreported;
        badges.reconcile = open;
        renderNav();
      }
    } catch { /* keep the last counts */ }
  }

  function navBadge(route) {
    const n = route.hash === '#/expenses' ? badges.expenses : route.hash === '#/reconcile' ? badges.reconcile : 0;
    if (!n) return null;
    const label = route.hash === '#/expenses' ? `${n} 笔未加入报销单` : `${n} 条账单记录待匹配`;
    return el('span.nav-badge', { role: 'img', 'aria-label': label, title: label }, n > 99 ? '99+' : String(n));
  }

  /* Sidebar (desktop) */
  const username = store.user?.username || 'Puter 用户';
  const sidebarNav = el('div', { style: { display: 'contents' } });
  const sidebar = el('nav.sidebar', { 'aria-label': '主导航' },
    el('div.brand', {}, el('img', { src: './icons/icon-192.png', width: 28, height: 28, alt: '' }), '费用报销'),
    sidebarNav,
    el('div.sidebar-spacer'),
    el('button.btn.btn-primary.sidebar-add', {
      type: 'button', html: icon('camera', 17, 2.2), 'aria-keyshortcuts': 'n',
      onclick: () => openCapture(),
    }, ' 采集票据'),
    el('div.sidebar-user', {},
      el('span.user-avatar', { 'aria-hidden': 'true' }, username.charAt(0).toUpperCase()),
      el('span.name', { title: username }, username),
      canSignOut() && el('button.icon-btn', {
        type: 'button', html: icon('logout', 18, 2), 'aria-label': '退出登录', title: '退出登录', onclick: confirmSignOut,
      })
    )
  );

  /* Tab bar (mobile) */
  const tabbar = el('nav.tabbar', { 'aria-label': '主导航' });

  function openMoreSheet() {
    const modal = openModal({
      title: '更多',
      content: el('div.settings-list', {},
        ROUTES.filter((r) => r.tab === false).map((r) =>
          el('a.settings-row.clickable', { href: r.hash, onclick: () => modal.close() },
            el('span', { html: icon(r.icon, 20, 1.8), style: { color: 'var(--ink-2)' } }),
            el('div.grow', {}, el('div.title', {}, r.label), el('div.sub', {}, MORE_SUBS[r.hash] || '')),
            el('span', { html: icon('chevR', 18), style: { color: 'var(--ink-3)' } })
          ))
      ),
    });
  }

  function renderNav() {
    const { route: active } = routeFor(location.hash);
    clear(sidebarNav);
    clear(tabbar);
    for (const r of ROUTES) {
      sidebarNav.append(el('a', {
        href: r.hash,
        className: `nav-item${r === active ? ' active' : ''}`,
        html: icon(r.icon, 21, 1.8),
        'aria-current': r === active ? 'page' : null,
      }, el('span', {}, r.label), navBadge(r)));
      if (r.tab === false) continue;
      tabbar.append(el('a', {
        href: r.hash,
        className: `tab-item${r === active ? ' active' : ''}`,
        html: icon(r.icon, 23, 1.8),
        'aria-current': r === active ? 'page' : null,
      }, el('span', {}, r.label), navBadge(r)));
    }
    const moreActive = active.tab === false;
    tabbar.append(el('button', {
      type: 'button',
      className: `tab-item${moreActive ? ' active' : ''}`,
      html: icon('more', 23, 1.8),
      'aria-haspopup': 'dialog',
      onclick: openMoreSheet,
    }, el('span', {}, '更多')));
  }

  function renderRoute() {
    closeAllModals();
    const { route, params } = routeFor(location.hash);
    renderNav();
    currentView?.destroy?.();
    clear(viewWrap);
    currentView = route.view({ navigate, params });
    viewWrap.append(currentView);
    window.scrollTo({ top: 0 });
    document.title = route === ROUTES[0] ? '费用报销' : `${route.label} · 费用报销`;
    if ((location.hash || '').includes('capture=1')) {
      history.replaceState(null, '', route.hash);
      setTimeout(() => openCapture(), 150);
    }
  }

  const fab = el('button.fab', {
    type: 'button', html: icon('camera', 26, 2), 'aria-label': '采集票据', 'aria-keyshortcuts': 'n',
    onclick: () => openCapture(),
  });

  const skipLink = el('a.skip-link', { href: '#main' }, '跳至主要内容');
  skipLink.addEventListener('click', (e) => {
    e.preventDefault();
    main.setAttribute('tabindex', '-1');
    main.focus();
    main.scrollIntoView();
  });

  clear(appRoot);
  appRoot.append(skipLink, el('div.shell', {}, sidebar, main), tabbar, fab);
  window.addEventListener('hashchange', renderRoute);
  renderRoute();

  /* Keyboard: n captures, g then a letter jumps to a section. */
  let pendingG = false;
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.matches('input, textarea, select, [contenteditable]') || t.isContentEditable)) return;
    if (document.querySelector('.modal-root:not(.closing)')) return;
    if (pendingG) {
      pendingG = false;
      const r = ROUTES.find((x) => x.key === e.key);
      if (r) { e.preventDefault(); navigate(r.hash); }
      return;
    }
    if (e.key === 'g') { pendingG = true; setTimeout(() => { pendingG = false; }, 1200); return; }
    if (e.key === 'n') { e.preventDefault(); openCapture(); }
  });

  let badgeTimer;
  store.addEventListener('change', () => {
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => refreshBadges().catch(() => {}), 400);
  });
  refreshBadges().catch(() => {});
}
