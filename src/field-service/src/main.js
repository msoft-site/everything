import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/views.css';
import './styles/print.css';

import { h, mount } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { initTheme } from './ui/theme.js';
import { toast } from './ui/toast.js';
import { confirmDialog } from './ui/dialog.js';
import { app } from './app.js';
import { createStore } from './core/store.js';
import { createMemoryBackend, createPuterBackend } from './core/backend.js';
import { createIdbCache } from './core/cache.js';
import { setMoneyDefaults } from './core/money.js';
import { today } from './core/dates.js';
import * as platform from './platform.js';
import * as team from './team.js';
import { buildShell } from './ui/shell.js';
import { startViews } from './ui/viewhost.js';
import { showAlphaNotice } from './ui/alpha.js';
import { maybeOnboard } from './views/onboarding.js';

const REPO_URL = 'https://github.com/heyputer/everything';
const root = document.getElementById('app');

initTheme();
boot();

// Offline app shell (production builds only; dev reloads must stay fresh).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

async function boot() {
  mount(root, h('div.boot', { role: 'status', 'aria-label': '加载中' }, h('img', { src: './icons/icon-192.png', alt: '' })));
  app.env = platform.puterEnv();
  if (await platform.isSignedIn()) {
    await startSignedIn();
  } else if (new URLSearchParams(location.search).has('demo')) {
    await startDemo();
  } else {
    showWelcome();
  }
  showAlphaNotice();
}

async function handleSignIn() {
  try {
    await platform.signIn();
    // Keep an invitation link so it is accepted right after signing in.
    if (!location.hash.startsWith('#/join')) location.hash = '';
    location.reload();
  } catch (err) {
    const code = err?.error || err?.code || err?.message;
    if (code === 'auth_window_closed') return;
    toast(code === 'popup_blocked' ? '请允许本站弹出窗口以完成登录。' : '登录未完成，请重试。', { type: 'error' });
  }
}

async function startSignedIn() {
  let user;
  try {
    user = await platform.getUser();
  } catch (err) {
    console.error(err);
    showWelcome('无法连接到您的 本地账户。请检查网络连接后重试。');
    return;
  }
  app.user = { username: user.username, uuid: user.uuid };
  app.avatarUrl = platform.cachedProfilePicture(user.username);

  // Which business: the person's own, or one they joined as a team member.
  const kv = globalThis.puter.kv;
  let ws;
  try {
    ws = await team.loadWorkspaces(kv);
  } catch (err) {
    // Guessing "your own business" here could open the wrong one.
    console.error('[field-service] could not read workspaces', err);
    showWelcome('无法加载您的企业信息。请检查网络连接后重试。');
    return;
  }
  const join = location.hash.startsWith('#/join') ? team.parseJoin(Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''))) : null;
  if (join) ws = await acceptInvite(kv, ws, join);
  app.workspaces = ws;

  const workerUrl = team.activeWorker(ws);
  const joined = ws.joined.find((j) => j.url === workerUrl);
  app.team = workerUrl ? { url: workerUrl, role: joined ? joined.role : 'owner', business: joined?.business || '' } : null;
  const store = createStore({
    backend: workerUrl ? team.createWorkerBackend(workerUrl) : createPuterBackend(globalThis.puter),
    cache: createIdbCache(`user:${user.uuid}${workerUrl ? `:team:${workerUrl}` : ''}`),
  });
  app.store = store;
  await store.init();
  setMoneyDefaults({ currency: store.state.settings.currency });
  store.subscribe((c) => c.has('settings') && setMoneyDefaults({ currency: store.state.settings.currency }));
  startApp();
  platform.fetchProfilePicture(user.username).then((url) => {
    if (url && url !== app.avatarUrl) {
      app.avatarUrl = url;
      shell?.updateAccount();
    }
  });
  // Pick up changes from other devices and teammates when coming back to the tab.
  // In their own storage, an owner may have turned on team sign-in from
  // another device meanwhile: check along with every sync.
  const sync = () => (store.sync(), app.team || checkTeamTurnedOn(kv, store));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync());
  window.addEventListener('online', sync);
  setInterval(() => document.visibilityState === 'visible' && sync(), app.team ? 45000 : 120000);
  if (app.team?.role === 'owner') team.updateWorkerIfNeeded(ws.own);
  // Roles change (the owner makes someone an admin): pick up the current one.
  if (joined) refreshMembership(kv, workerUrl);
  let removed = false;
  window.addEventListener('fieldservice:removed', () => {
    // Every request refused from here on reports it again; act once.
    if (!app.team || app.team.role === 'owner' || removed) return;
    removed = true;
    toast('您已不再拥有该企业的访问权限，正在切回您自己的企业。', { type: 'error', duration: 8000 });
    setTimeout(() => team.leaveWorkspace(app.team.url), 2500);
  });
  if (!app.team || app.team.role === 'owner') maybeOnboard();
}

let switchingToTeam = false;
async function checkTeamTurnedOn(kv, store) {
  if (switchingToTeam) return;
  let ws;
  try {
    ws = await team.loadWorkspaces(kv);
  } catch {
    return;
  }
  if (!ws.own?.url || app.workspaces.own?.url) return;
  switchingToTeam = true;
  // Changes made here since then went to storage the team no longer reads.
  try {
    await team.carryOverToTeam(store, team.createWorkerBackend(ws.own.url), ws.own.enabledAt);
  } catch (err) {
    // Switching now would strand them in storage nobody reads; keep
    // working here and try again with the next sync.
    console.warn('[field-service] could not bring changes over to the team server', err);
    switchingToTeam = false;
    return;
  }
  toast('已在其他设备上开启团队登录，正在切换...', { type: 'info' });
  setTimeout(() => location.reload(), 1500);
}

async function refreshMembership(kv, url) {
  try {
    const me = await team.call(url, 'whoami');
    const cur = app.workspaces.joined.find((j) => j.url === url);
    if (!cur || !me?.role || (me.role === cur.role && (!me.business || me.business === cur.business))) return;
    const entry = { ...cur, role: me.role, business: me.business || cur.business };
    app.workspaces = { ...app.workspaces, joined: app.workspaces.joined.map((j) => (j.url === url ? entry : j)) };
    app.team = { ...app.team, role: entry.role, business: entry.business };
    await team.saveWorkspaces(kv, app.workspaces);
  } catch {
    // Offline, or removed (handled by the fieldservice:removed event).
  }
}

/** Join a business from an invitation link, then continue booting into it. */
async function acceptInvite(kv, ws, { url, token }) {
  history.replaceState(null, '', location.pathname + location.search + '#/');
  if (ws.own?.url === url) return { ...ws, current: 'own' };
  const known = ws.joined.find((j) => j.url === url);
  if (known) {
    // Already in the list: join anyway (no need to ask again). A current
    // member just gets their role back; someone removed since is let back
    // in by this new link instead of being bounced out.
    try {
      const res = await team.call(url, 'join', { token });
      const next = { ...ws, joined: ws.joined.map((j) => (j.url === url ? { ...j, role: res.role || j.role, business: res.business || j.business } : j)), current: url };
      await team.saveWorkspaces(kv, next);
      return next;
    } catch {
      return { ...ws, current: url };
    }
  }
  // Joining sends your local session to that business's server, so ask first.
  const host = new URL(url).hostname;
  const ok = await confirmDialog({
    title: '加入企业？',
    message: `您打开了一份企业邀请，其团队服务器为 ${host}。在该企业工作期间，您的每次请求都会将 Puter 登录凭证发送至该服务器，且您添加的内容将保存在该企业所有者的账户中。请仅接受您认识且信任的人发出的邀请。`,
    confirmLabel: '加入企业',
  });
  if (!ok) return ws;
  try {
    const res = await team.call(url, 'join', { token });
    const entry = { url, business: res.business || '团队企业', role: res.role };
    const joined = [...ws.joined.filter((j) => j.url !== url), entry];
    const next = { ...ws, joined, current: url };
    await team.saveWorkspaces(kv, next);
    setTimeout(() => toast(res.already ? `您已经是 ${entry.business} 的成员。` : `欢迎加入 ${entry.business}。您已作为${res.role === 'admin' ? '管理员' : '团队成员'}加入。`), 600);
    return next;
  } catch (err) {
    setTimeout(() => toast(err.message || '此邀请无法使用。', { type: 'error' }), 600);
    return ws;
  }
}

async function startDemo() {
  app.demo = true;
  const { buildSampleData } = await import('./core/sample.js');
  const store = createStore({ backend: createMemoryBackend(buildSampleData(today())) });
  app.store = store;
  await store.init();
  startApp();
}

let shell = null;
function startApp() {
  if (import.meta.env.DEV) globalThis.__fieldService = app; // debugging and browser tests
  shell = buildShell({ onSignIn: handleSignIn });
  mount(root, shell.root);
  startViews(shell.main);
}

function showWelcome(error) {
  const available = platform.puterAvailable();
  const signInBtn = h(
    'button.btn.primary.lg',
    { type: 'button', disabled: !available || null, onClick: handleSignIn },
    icon('log-in', 18),
    '登录',
  );
  const demoBtn = h(
    'button.btn.lg',
    {
      type: 'button',
      onClick: async () => {
        mount(root, h('div.boot', { role: 'status', 'aria-label': '正在加载演示' }, h('img', { src: './icons/icon-192.png', alt: '' })));
        await startDemo();
      },
    },
    '体验演示版',
  );
  mount(
    root,
    h(
      'div.welcome',
      h(
        'main.welcome-main',
        h('div.brand', h('img', { src: './icons/icon-192.png', alt: '' }), '现场服务'),
        h('h1', '一站式管理您的现场服务业务。'),
        h(
          'p.lead',
          '用清晰的报价单赢得业务、排班调度团队、跟踪每次上门服务并更快收款。免费且开源。',
        ),
        error ? h('div.notice.danger', { role: 'alert' }, icon('alert'), h('span', error)) : null,
        location.hash.startsWith('#/join') ? h('div.notice.accent', icon('users'), h('span', '您受邀加入一家企业。请登录账户以接受邀请。')) : null,
        !available ? h('div.notice.warning', { role: 'alert' }, icon('warning'), h('span', '无法加载 Puter，暂时无法登录。您仍然可以体验演示版。')) : null,
        h('div.cta', signInBtn, demoBtn),
        h(
          'ul.welcome-points',
          [
            ['users', '在一个档案中集中管理客户、物业地址及完整历史工单'],
            ['file-pen', '支持可选项与定金的报价单，一键转换为工单'],
            ['calendar-days', '支持单次与定期上门服务的拖拽式日程排班'],
            ['receipt-text', '账单、收款记录与财务报表，让应收账款一目了然'],
          ].map(([ic, text]) => h('li', icon(ic), h('span', text))),
        ),
        h(
          'div.welcome-foot',
          h('a', { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' }, icon('github', 16), 'GitHub 源码'),
          h('span', '您的数据存储在您自己的 本地账户中。'),
        ),
      ),
      h('div.welcome-art', { 'aria-hidden': 'true', html: WELCOME_ART }),
    ),
  );
  document.title = '现场服务';
}

// Illustration: a simplified week schedule with visit blocks. Uses theme
// tokens so it adapts to light and dark mode.
const WELCOME_ART = `
<svg viewBox="0 0 520 420" xmlns="http://www.w3.org/2000/svg" role="presentation">
  <rect x="1" y="1" width="518" height="418" rx="18" fill="var(--surface)" stroke="var(--border-strong)"/>
  <rect x="24" y="24" width="140" height="14" rx="7" fill="var(--text)" opacity=".85"/>
  <rect x="24" y="48" width="90" height="10" rx="5" fill="var(--text-3)" opacity=".5"/>
  <rect x="396" y="22" width="100" height="32" rx="8" fill="var(--accent)"/>
  <rect x="414" y="34" width="64" height="8" rx="4" fill="var(--on-accent)"/>
  <g fill="var(--text-3)" opacity=".55">
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${70 + i * 88}" y="84" width="40" height="8" rx="4"/>`).join('')}
  </g>
  <g stroke="var(--border)">
    ${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="${60 + i * 88}" y1="104" x2="${60 + i * 88}" y2="396"/>`).join('')}
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<line x1="24" y1="${104 + i * 48}" x2="496" y2="${104 + i * 48}"/>`).join('')}
  </g>
  <g>
    <rect x="66" y="112" width="76" height="62" rx="8" fill="var(--accent-soft)" stroke="var(--accent)"/>
    <rect x="74" y="122" width="46" height="7" rx="3.5" fill="var(--accent-text)"/>
    <rect x="74" y="136" width="56" height="6" rx="3" fill="var(--accent-text)" opacity=".5"/>
    <rect x="154" y="160" width="76" height="86" rx="8" fill="var(--success-soft)" stroke="var(--success)"/>
    <rect x="162" y="170" width="50" height="7" rx="3.5" fill="var(--success)"/>
    <rect x="162" y="184" width="40" height="6" rx="3" fill="var(--success)" opacity=".5"/>
    <rect x="242" y="112" width="76" height="110" rx="8" fill="var(--warning-soft)" stroke="var(--warning)"/>
    <rect x="250" y="122" width="44" height="7" rx="3.5" fill="var(--warning)"/>
    <rect x="250" y="136" width="56" height="6" rx="3" fill="var(--warning)" opacity=".5"/>
    <rect x="330" y="208" width="76" height="62" rx="8" fill="var(--accent-soft)" stroke="var(--accent)"/>
    <rect x="338" y="218" width="52" height="7" rx="3.5" fill="var(--accent-text)"/>
    <rect x="418" y="136" width="72" height="62" rx="8" fill="var(--info-soft)" stroke="var(--info)"/>
    <rect x="426" y="146" width="40" height="7" rx="3.5" fill="var(--info)"/>
    <rect x="66" y="256" width="76" height="86" rx="8" fill="var(--info-soft)" stroke="var(--info)"/>
    <rect x="74" y="266" width="50" height="7" rx="3.5" fill="var(--info)"/>
    <rect x="242" y="280" width="76" height="62" rx="8" fill="var(--success-soft)" stroke="var(--success)"/>
    <rect x="250" y="290" width="44" height="7" rx="3.5" fill="var(--success)"/>
    <rect x="418" y="300" width="72" height="62" rx="8" fill="var(--warning-soft)" stroke="var(--warning)"/>
    <rect x="426" y="310" width="48" height="7" rx="3.5" fill="var(--warning)"/>
  </g>
  <line x1="24" y1="232" x2="496" y2="232" stroke="var(--danger)" stroke-width="2"/>
  <circle cx="24" cy="232" r="5" fill="var(--danger)"/>
</svg>`;
