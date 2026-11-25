/** App shell: desktop sidebar, mobile tab bar, FAB, sample-data banner. */

import { el, clear } from './dom.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { confirmDialog } from './modal.js';
import { openEntryForm } from './entryform.js';
import { openOnboarding } from './onboarding.js';
import { initSafeguards } from './safeguards.js';
import { initShortcuts } from './shortcuts.js';
import { store } from '../lib/store.js';
import { wipeSampleData } from '../lib/sample.js';
import { fmtTimer, todayISO } from '../lib/time.js';
import { isPuterApp } from '../lib/env.js';
import { timerView } from '../views/timer.js';
import { timesheetView } from '../views/timesheet.js';
import { reportsView } from '../views/reports.js';
import { projectsView } from '../views/projects.js';
import { settingsView, confirmSignOut } from '../views/settings.js';

const ROUTES = [
  { hash: '#/', label: '计时器', icon: 'timer', view: timerView },
  { hash: '#/timesheet', label: '工时表', icon: 'calendar', view: timesheetView },
  { hash: '#/reports', label: '报表', icon: 'chart', view: reportsView },
  { hash: '#/projects', label: '项目', icon: 'folders', view: projectsView },
  { hash: '#/settings', label: '设置', icon: 'gear', view: settingsView },
];

const BASE_TITLE = 'Hourly · 工时追踪';

/* Budget crossings warn once per session per threshold: the map holds the
   highest bucket seen (0 under 80%, 1 at 80%+, 2 at 100%+), and only an
   increase toasts. The first pass after boot seeds silently so opening
   the app is never a wall of old warnings. */
const budgetBuckets = new Map();
let budgetsSeeded = false;

async function checkBudgets() {
  const seed = !budgetsSeeded;
  for (const p of store.activeProjects()) {
    if (!p.budget) continue;
    const prog = await store.budgetProgress(p).catch(() => null);
    if (!prog) continue;
    const bucket = prog.ratio >= 1 ? 2 : prog.ratio >= 0.8 ? 1 : 0;
    const prev = budgetBuckets.get(p.id) ?? 0;
    if (!seed && bucket > prev) {
      toast(bucket === 2
        ? `${p.name} 已超出预算`
        : `${p.name} 已达到预算的 ${Math.round(prog.ratio * 100)}%`,
      { icon: 'alert', duration: 5000 });
    }
    // Only ever raised: dropping back under a threshold (a deleted entry,
    // an edit) and returning over it (its Undo) is not a new crossing.
    if (bucket > prev) budgetBuckets.set(p.id, bucket);
  }
  budgetsSeeded = true;
}

/* The tab title belongs to the shell, not a view: a running timer keeps
   ticking in the title no matter which screen is open. */
function tickTitle() {
  if (store.running) {
    const project = store.project(store.timer.projectId);
    document.title = `${fmtTimer(store.elapsedSeconds())} · ${project?.name || '追踪中'}`;
  } else if (document.title !== BASE_TITLE) {
    document.title = BASE_TITLE;
  }
}

/* A time tracker lives in a pinned tab for days, so the calendar day turns
   under an open app. Nothing recorded goes wrong (every write reads the
   date when it runs), but the screens keep saying "Today" about yesterday
   until the next edit happens to refresh them. Nudge every view to re-read
   the date the same way a write does; each one already re-renders from
   this and keeps whatever the user had in progress. */
let shownDay = todayISO();
function tickDay() {
  const day = todayISO();
  if (day === shownDay) return;
  shownDay = day;
  store.dispatchEvent(new Event('change'));
}

export function mountShell(appRoot) {
  const sampleBanner = el('div');
  const viewWrap = el('div');
  const main = el('main.main', { id: 'main', tabindex: -1 }, sampleBanner, viewWrap);
  let currentView = null;

  /* First in tab order; a button rather than a #main anchor because the
     hash router would treat the fragment as a route. */
  const skipLink = el('button.skip-link', {
    type: 'button',
    onclick: () => main.focus(),
  }, '跳转到主内容');

  /* Sample-data banner: always visible while exploring, one-tap wipe. */
  function renderSampleBanner() {
    clear(sampleBanner);
    if (!store.settings.sampleData) return;
    sampleBanner.append(el('div.sample-banner', {},
      el('span.sample-banner-ic', { html: icon('sparkle', 14, 2.2) }),
      el('span.grow', {}, '当前为示例数据，可随意探索，此处内容并非您的真实数据'),
      el('button', {
        onclick: async () => {
          const ok = await confirmDialog({
            title: '全新开始？',
            message: '所有示例数据将被移除，您可以从头开始设置自己的客户。',
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
          openOnboarding();
        },
      }, '全新开始')
    ));
  }
  store.addEventListener('change', renderSampleBanner);
  renderSampleBanner();

  function routeFor(hash) {
    const clean = (hash || '#/').split('?')[0];
    return ROUTES.find((r) => r.hash === clean) || ROUTES[0];
  }

  /* Sidebar (desktop) */
  const username = store.user?.username || '本地用户';
  const sidebarNav = el('div', { style: { display: 'contents' } });
  const sidebar = el('nav.sidebar', { 'aria-label': '主导航' },
    el('div.brand', {},
      el('img', { src: './icons/icon-192.png', width: 30, height: 30, alt: '' }),
      'Hourly'
    ),
    sidebarNav,
    el('div.sidebar-spacer'),
    el('button.btn.btn-primary.sidebar-add', {
      html: icon('plus', 17, 2.2),
      onclick: () => openEntryForm(),
    }, ' 记录工时'),
    el('div.sidebar-user', {},
      el('span.user-avatar', {}, username.charAt(0).toUpperCase()),
      el('span.name', { title: username }, username),
      // Inside Puter, the platform owns the session; no sign-out here.
      !isPuterApp() && el('button.icon-btn', {
        html: icon('logout', 18, 2),
        'aria-label': '退出登录',
        title: '退出登录',
        onclick: confirmSignOut,
      })
    )
  );

  /* Tab bar (mobile) */
  const tabbar = el('nav.tabbar', { 'aria-label': '主导航' });

  function renderNav() {
    const active = routeFor(location.hash);
    clear(sidebarNav);
    clear(tabbar);
    for (const r of ROUTES) {
      sidebarNav.append(el('a.nav-item', {
        href: r.hash,
        className: `nav-item${r === active ? ' active' : ''}`,
        html: icon(r.icon, 21, 1.8),
        'aria-current': r === active ? 'page' : null,
      }, el('span', {}, r.label)));
      tabbar.append(el('a.tab-item', {
        href: r.hash,
        className: `tab-item${r === active ? ' active' : ''}`,
        html: icon(r.icon, 23, 1.8),
        'aria-current': r === active ? 'page' : null,
      }, el('span', {}, r.label)));
    }
  }

  function renderRoute() {
    const route = routeFor(location.hash);
    renderNav();
    currentView?.destroy?.();
    clear(viewWrap);
    currentView = route.view();
    viewWrap.append(currentView);
    main.scrollTop = 0;
    window.scrollTo({ top: 0 });
  }

  const fab = el('button.fab', {
    html: icon('plus', 26, 2.2),
    'aria-label': '记录工时',
    onclick: () => openEntryForm(),
  });

  clear(appRoot);
  appRoot.append(skipLink, el('div.shell', {}, sidebar, main), tabbar, fab);

  window.addEventListener('hashchange', renderRoute);
  renderRoute();

  // The shell lives for the whole session, so no cleanup is needed.
  setInterval(tickTitle, 1000);
  setInterval(tickDay, 30 * 1000);
  store.addEventListener('change', tickTitle);
  tickTitle();

  // Budget thresholds re-check after data settles; the seed pass is silent.
  let budgetTimer;
  store.addEventListener('change', () => {
    clearTimeout(budgetTimer);
    budgetTimer = setTimeout(() => checkBudgets().catch(() => {}), 1200);
  });
  checkBudgets().catch(() => {});

  initSafeguards();
  initShortcuts();
}
