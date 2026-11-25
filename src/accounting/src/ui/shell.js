/**
 * The application frame: icon rail, top bar with global search, the
 * section panel, the page outlet, and a bottom tab bar on phones.
 */
import { el, clear, announce, swap } from './dom.js';
import { icon, appMark } from './icons.js';
import { openMenu, openPopover, closeMenus } from './menu.js';
import { navigate, href, currentRoute } from './router.js';
import { applyTheme, currentTheme } from './theme.js';
import { initials } from './format.js';
import { mountSearch } from './search-box.js';
import { store } from '../lib/store.js';
import { isPuterApp } from '../lib/puter.js';
import { reportMeta } from '../lib/reports.js';
import { shortcutLabel } from './shortcuts.js';

export const NAV = [
  {
    id: 'accounting', label: '财务会计', icon: 'bank',
    links: [['银行流水', 'banking'], ['账目对账', 'reconcile'], ['对账规则', 'rules'], ['会计科目表', 'accounts'], ['周期交易', 'recurring'], ['审计日志', 'audit']],
  },
  {
    id: 'expenses', label: '采购支出', icon: 'wallet',
    links: [['所有支出', 'expenses'], ['账单应付', 'bills'], ['供应商', 'vendors']],
  },
  {
    id: 'sales', label: '销售应收', icon: 'invoice',
    links: [['所有销售', 'sales'], ['销售发票', 'invoices'], ['业务报价单', 'estimates'], ['客户管理', 'customers'], ['商品与服务', 'items']],
  },
  {
    id: 'tax', label: '税费管理', icon: 'percent',
    links: [['税费核算', 'sales-tax']],
  },
];

const ROUTE_GROUP = {
  banking: 'accounting', reconcile: 'accounting', rules: 'accounting', accounts: 'accounting', register: 'accounting', recurring: 'accounting', audit: 'accounting',
  expenses: 'expenses', bills: 'expenses', vendors: 'expenses', vendor: 'expenses',
  sales: 'sales', invoices: 'sales', estimates: 'sales', customers: 'sales', customer: 'sales', items: 'sales',
  'sales-tax': 'tax',
  reports: 'reports', report: 'reports',
};

const ROUTE_LINK = { register: 'accounts', customer: 'customers', vendor: 'vendors', report: 'reports' };

const LS_PANEL = 'bookkeeping:panel';

export const CREATE_MENU = [
  { title: '销售相关', items: [['新建发票', 'invoice', 'newInvoice'], ['登记收款', 'payment', 'newPayment'], ['新建报价', 'estimate', 'newEstimate'], ['销售收据', 'sales-receipt'], ['贷记凭证', 'credit-memo'], ['退款收据', 'refund-receipt'], ['添加客户', '@customer']] },
  { title: '采购支出', items: [['登记费用', 'expense', 'newExpense'], ['开支票', 'check', 'newCheck'], ['录入账单', 'bill', 'newBill'], ['支付账单', 'pay-bills'], ['采购订单', 'purchase-order'], ['供应商抵免', 'vendor-credit'], ['信用卡退款', 'cc-credit'], ['添加供应商', '@vendor']] },
  { title: '总账会计', items: [['存入款项', 'deposit'], ['账户转账', 'transfer'], ['记账凭证 (分录)', 'journal'], ['信用卡还款', 'cc-payment'], ['添加商品服务', '@item'], ['添加科目', '@account']] },
  { title: '批量导入', items: [['银行对账单', '@import'], ['客户列表', '@importCustomers'], ['供应商列表', '@importVendors'], ['商品服务列表', '@importItems']] },
];

let createHandler = () => {};
export function onCreate(fn) {
  createHandler = fn;
}

export function openCreateMenu(anchor) {
  const content = el('div.create-menu', {}, CREATE_MENU.map((col) => el('div.col', {},
    el('h3', {}, col.title),
    col.items.map(([label, target, sc]) => el('button.menu-item', { type: 'button', title: sc ? `${label} (${shortcutLabel(sc)})` : null, 'aria-keyshortcuts': sc ? shortcutLabel(sc).replace('Option', 'Alt') : null, onclick: () => createHandler(target) },
      el('span.grow', {}, label))))));
  openPopover(anchor, content, { label: 'Create', className: 'create-pop' });
}

export function mountShell(root, { user, picture, onSignOut }) {
  let collapsed = false;
  try { collapsed = localStorage.getItem(LS_PANEL) === 'collapsed'; } catch {}
  if (window.matchMedia('(max-width: 1100px)').matches) collapsed = true;

  const app = el('div.app', { class: collapsed ? 'panel-collapsed' : '' });
  const live = el('div.sr-only', { id: 'sr-live', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const skip = el('a.skip-link', { href: '#main' }, '跳转到主要内容');
  skip.addEventListener('click', (e) => { e.preventDefault(); main.focus(); });

  // ------------------------------------------------------------- rail
  const railItem = (label, ico, target, opts = {}) => {
    const b = el(opts.button ? 'button.rail-btn' : 'a.rail-btn', {
      type: opts.button ? 'button' : null,
      href: opts.button ? null : href(target),
      class: opts.className || '',
      'aria-haspopup': opts.popup ? 'dialog' : null,
      'aria-expanded': opts.popup || opts.toggle ? 'false' : null,
      dataset: { route: target || '' },
    }, el('span.rail-ico', { html: icon(ico, 20) }), el('span', {}, label));
    return b;
  };
  const createBtn = railItem('Create', 'plus', null, { button: true, popup: true, className: 'rail-create' });
  createBtn.addEventListener('click', () => openCreateMenu(createBtn));
  const appsBtn = railItem('Menu', 'apps', null, { button: true, toggle: true });
  appsBtn.addEventListener('click', () => togglePanel());
  const rail = el('nav.rail', { 'aria-label': 'Primary' },
    el('a.rail-logo', { href: href('home'), 'aria-label': '首页', html: appMark(34) }),
    createBtn,
    railItem('首页', 'home', 'home'),
    railItem('银行', 'bank', 'banking'),
    railItem('Sales', 'invoice', 'sales'),
    railItem('Purchases', 'wallet', 'expenses'),
    railItem('报表', 'reports', 'reports'),
    el('div.rail-sep'),
    appsBtn,
    el('div.rail-bottom', {},
      railItem('设置', 'settings', 'settings')));

  // ------------------------------------------------------------ topbar
  const menuBtn = el('button.icon-btn.topbar-menu', { type: 'button', 'aria-label': 'Open navigation', 'aria-expanded': 'false', html: icon('menu', 22) });
  menuBtn.addEventListener('click', () => togglePanel());
  const companyName = el('span.truncate', {}, store.settings.company?.name || 'My Company');
  const search = mountSearch();
  const searchToggle = el('button.icon-btn.show-mobile-only', { type: 'button', 'aria-label': 'Search', html: icon('search', 20) });
  searchToggle.addEventListener('click', () => {
    app.classList.add('search-open');
    search.focus();
  });
  search.onClose(() => app.classList.remove('search-open'));
  const sync = el('span.sync-pill', { role: 'status', 'aria-live': 'polite' });
  const helpBtn = el('button.icon-btn.hide-mobile', { type: 'button', 'aria-label': 'Keyboard shortcuts', title: 'Keyboard shortcuts', html: icon('keyboard', 20) });
  helpBtn.addEventListener('click', () => document.dispatchEvent(new CustomEvent('shortcuts:help')));
  const settingsBtn = el('a.icon-btn.hide-mobile', { href: href('settings'), 'aria-label': '设置', title: '设置', html: icon('settings', 20) });
  const avatar = el('span.avatar', { 'aria-hidden': 'true' }, initials(user?.username || ''));
  if (picture) avatar.replaceChildren(el('img', { src: picture, alt: '' }));
  const userBtn = el('button.icon-btn', { type: 'button', 'aria-label': `Account menu for ${user?.username || 'you'}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, avatar);
  userBtn.addEventListener('click', () => {
    const theme = currentTheme();
    openMenu(userBtn, [
      { header: user?.username ? `Signed in as ${user.username}` : 'Account' },
      { header: 'Theme' },
      { label: 'System', icon: 'monitor', checked: theme === 'system', onClick: () => setTheme('system') },
      { label: 'Light', icon: 'sun', checked: theme === 'light', onClick: () => setTheme('light') },
      { label: 'Dark', icon: 'moon', checked: theme === 'dark', onClick: () => setTheme('dark') },
      'sep',
      { label: 'Company settings', icon: 'settings', onClick: () => navigate('settings') },
      { label: 'Keyboard shortcuts', icon: 'keyboard', onClick: () => document.dispatchEvent(new CustomEvent('shortcuts:help')) },
      ...(isPuterApp() ? [] : ['sep', { label: '退出登录', icon: 'logout', onClick: onSignOut }]),
    ], { align: 'end', label: 'Account' });
  });
  const topbar = el('header.topbar', {},
    menuBtn,
    el('div.topbar-company', {}, companyName),
    search.root,
    el('div.topbar-actions', {}, sync, searchToggle, helpBtn, settingsBtn, userBtn));

  // ------------------------------------------------------------- panel
  const panel = el('nav.panel', { id: 'section-panel', 'aria-label': 'Sections' });
  const panelScrim = el('div.panel-scrim', { hidden: true });
  panelScrim.addEventListener('click', () => togglePanel(false));
  const expanded = new Set();

  function renderPanel() {
    const r = currentRoute();
    const group = ROUTE_GROUP[r?.name] || null;
    if (group) expanded.add(group);
    const active = ROUTE_LINK[r?.name] || r?.name;
    // The panel is rebuilt on every page render; swap() keeps keyboard focus
    // on the same control and the scroll position stays put.
    const scroll = panel.scrollTop;
    const nodes = [];
    const collapseBtn = el('button.icon-btn', { type: 'button', 'aria-label': 'Collapse panel', title: 'Collapse panel', html: icon('panelClose', 18) });
    collapseBtn.addEventListener('click', () => togglePanel(false));
    nodes.push(el('div.panel-head', {}, el('span', {}, 'Sections'), collapseBtn));
    const favs = (store.settings.favoriteReports || []).map((id) => reportMeta(id)).filter(Boolean);
    const groups = [...NAV, { id: 'reports', label: '报表', icon: 'reports', links: [['Standard reports', 'reports'], ...favs.map((m) => [m.title, `report/${m.id}`])] }];
    const exact = r ? `${r.name}/${r.params[0] || ''}` : '';
    const hasExact = groups.some((g) => g.links.some(([, t]) => t === exact));
    const isCurrent = (target) => (hasExact ? target === exact : target === active);
    for (const g of groups) {
      const open = expanded.has(g.id);
      const listId = `panel-${g.id}`;
      const btn = el('button.panel-group-btn', { type: 'button', 'aria-expanded': String(open), 'aria-controls': listId },
        el('span.panel-dot', { html: icon(g.icon, 13) }),
        el('span', {}, g.label),
        el('span.chev', { html: icon('chevDown', 16) }));
      const links = el('div.panel-links', { id: listId, hidden: !open },
        g.links.map(([label, target]) => el('a.panel-link', {
          href: href(target),
          'aria-current': isCurrent(target) ? 'page' : null,
        }, label)));
      // Expand and collapse in place, so the button keeps keyboard focus.
      btn.addEventListener('click', () => {
        const now = !expanded.has(g.id);
        if (now) expanded.add(g.id); else expanded.delete(g.id);
        btn.setAttribute('aria-expanded', String(now));
        links.hidden = !now;
      });
      nodes.push(el('div.panel-group', {}, btn, links));
    }
    nodes.push(el('div.panel-foot', {},
      'Your books are stored in your own ',
      el('a', { href: 'https://developer.puter.com', target: '_blank', rel: 'noopener' }, 'Puter'),
      ' account. .'));
    swap(panel, ...nodes);
    panel.scrollTop = scroll;
  }

  function togglePanel(force) {
    const open = force ?? app.classList.contains('panel-collapsed');
    app.classList.toggle('panel-collapsed', !open);
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const narrow = window.matchMedia('(max-width: 1100px)').matches;
    panelScrim.hidden = !(open && mobile);
    menuBtn.setAttribute('aria-expanded', String(open));
    appsBtn.setAttribute('aria-expanded', String(open));
    if (!narrow) {
      try { localStorage.setItem(LS_PANEL, open ? 'open' : 'collapsed'); } catch {}
    }
    if (open && (mobile || narrow)) panel.querySelector('a, button')?.focus();
  }

  // -------------------------------------------------------------- main
  const main = el('main.main', { id: 'main', tabIndex: -1 });
  const frame = el('div.frame', {}, topbar, panel, main);

  // ------------------------------------------------------------ tabbar
  const tab = (label, ico, target) => el('a.tab-btn', { href: href(target), dataset: { route: target } }, el('span.tab-ico', { html: icon(ico, 21) }), el('span', {}, label));
  const tabCreate = el('button.tab-btn.tab-create', { type: 'button', 'aria-label': 'Create', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, el('span.tab-ico', { html: icon('plus', 22) }));
  tabCreate.addEventListener('click', () => openCreateMenu(tabCreate));
  const tabbar = el('nav.tabbar', { 'aria-label': 'Primary' },
    tab('首页', 'home', 'home'), tab('银行', 'bank', 'banking'), tabCreate, tab('Sales', 'invoice', 'sales'), tab('报表', 'reports', 'reports'));

  app.append(skip, rail, frame, tabbar, panelScrim, live);
  clear(root).append(app);

  // ----------------------------------------------------------- updates
  function highlight() {
    const r = currentRoute();
    const name = r?.name;
    const group = ROUTE_GROUP[name];
    const railRoute = { banking: 'banking', reconcile: 'banking', rules: 'banking', register: 'banking', accounts: 'banking', recurring: 'banking', audit: 'banking', sales: 'sales', invoices: 'sales', estimates: 'sales', customers: 'sales', customer: 'sales', items: 'sales', 'sales-tax': 'sales', expenses: 'expenses', bills: 'expenses', vendors: 'expenses', vendor: 'expenses', reports: 'reports', report: 'reports', home: 'home', settings: 'settings' }[name] || (group ? null : name);
    for (const a of app.querySelectorAll('.rail-btn[data-route], .tab-btn[data-route]')) {
      const on = a.dataset.route && a.dataset.route === railRoute;
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    renderPanel();
  }

  function setSync({ status, pending }) {
    sync.dataset.state = status;
    const text = status === 'saving' ? 'Saving' : status === 'offline' ? `Offline${pending ? `, ${pending} unsaved` : ''}` : status === 'error' ? 'Not saved' : store.readOnly ? 'Read only' : 'Saved';
    const ico = status === 'offline' || status === 'error' ? 'offline' : status === 'saving' ? 'refresh' : 'cloud';
    sync.replaceChildren(el('span', { html: icon(ico, 15) }), el('span.sync-text', {}, text));
    sync.title = status === 'error' ? 'Changes could not be saved to your local account. They are kept on this device and will be retried.' : text;
  }
  setSync({ status: 'idle', pending: 0 });

  function setTheme(mode) {
    applyTheme(mode);
    if (!store.readOnly) store.saveSettings({ theme: mode });
    announce(`Theme set to ${mode}`);
  }

  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 767px)').matches) { panelScrim.hidden = true; app.classList.remove('search-open'); }
  });

  return {
    main,
    highlight,
    setSync,
    togglePanel,
    closeMobilePanel() {
      if (window.matchMedia('(max-width: 1100px)').matches) {
        app.classList.add('panel-collapsed');
        panelScrim.hidden = true;
      }
      closeMenus();
    },
    setCompany(name) { companyName.textContent = name || 'My Company'; },
    focusSearch() { app.classList.add('search-open'); search.focus(); },
  };
}
