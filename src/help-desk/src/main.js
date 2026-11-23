/**
 * Boot: theme, the help center (public, no sign-in), or the agent workspace
 * (sign in, choose or create a help desk, then the shell).
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import { initTheme } from './ui/theme.js';
import { installShortcuts } from './ui/shortcuts.js';
import { parse, go } from './ui/router.js';
import { toast, toastError } from './ui/toast.js';
import { h } from './ui/dom.js';
import { app } from './app.js';
import { sdk, isSignedIn, signIn, currentUser } from './client/puter.js';
import { serverApi, LOCAL } from './client/api.js';
import { rememberDesk } from './client/userdoc.js';
import { signInScreen, createDeskScreen, joinScreen, errorScreen, loadingScreen } from './views/start.js';
import { mountShell } from './views/shell.js';

const root = document.getElementById('app');
let unmountShell = null;
let portalMode = false;
// Which help center is mounted: `server/desk`.
let portalAt = null;

initTheme();
installShortcuts();

function waitForSdk(limit = 15000) {
  if (sdk()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let waited = 0;
    const t = setInterval(() => {
      waited += 50;
      if (sdk()) {
        clearInterval(t);
        resolve();
      } else if (waited > limit) {
        clearInterval(t);
        reject(new Error('无法加载 Puter。请检查网络连接并重新加载。'));
      }
    }, 50);
  });
}

/** First visit only: a calm note that this is an early release. */
function alphaNotice() {
  const KEY = 'help-desk:alpha-notice';
  try {
    if (localStorage.getItem(KEY)) return;
  } catch {
    return;
  }
  toast(
    h('span', '客服工单系统目前处于早期预览阶段。功能可能会发生变化且数据可能会丢失，请勿将其用于正式的客户支持。'),
    {
      title: '早期预览',
      kind: 'info',
      persistent: true,
      onClose: () => {
        try {
          localStorage.setItem(KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
      },
    },
  );
}

async function start() {
  const route = parse();
  if (route.path[0] === 'help') {
    portalMode = true;
    portalAt = `${route.path[1]}/${route.path[2]}`;
    // The app manifest installs the agent workspace (it starts at ./); a
    // customer installing the help center would land on the agent sign-in.
    document.querySelector('link[rel="manifest"]')?.remove();
    const { mountPortal } = await import('./portal/portal.js');
    // Customers who are not signed in never need Puter: when it cannot be
    // loaded, show the help center after a moment rather than a blank page.
    await waitForSdk(1500).catch(() => {});
    mountPortal(root, route);
    return;
  }
  loadingScreen(root, '正在启动');
  try {
    await waitForSdk();
  } catch (e) {
    errorScreen(root, { title: '无法启动', message: e.message });
    return;
  }
  if (!isSignedIn()) {
    signInScreen(root, {
      onSignIn: async () => {
        await signIn();
        await boot();
      },
    });
    return;
  }
  await boot();
}

async function boot() {
  loadingScreen(root);
  try {
    app.user = await currentUser();
    await app.loadDoc();
  } catch (e) {
    errorScreen(root, { title: '无法加载您的账户', message: e?.message || '请尝试重新加载页面。' });
    return;
  }
  alphaNotice();
  const route = parse();
  if (route.path[0] === 'join' && route.path.length >= 4) {
    joinFlow(route.path[1], route.path[2], route.path[3]);
    return;
  }
  const desks = app.desks();
  const pick = (app.doc.last && app.doc.desks[app.doc.last]) || desks[0];
  if (!pick) {
    createFlow();
    return;
  }
  await enterDesk(pick.server, pick.desk);
}

async function enterDesk(server, desk) {
  if (unmountShell) {
    unmountShell();
    unmountShell = null;
  }
  loadingScreen(root);
  try {
    await app.openDesk(server, desk);
  } catch (e) {
    const others = app.desks().filter((d) => !(d.server === server && d.desk === desk));
    errorScreen(root, {
      title: e?.status === 403 ? '您已无权访问' : '无法打开服务台',
      message: e?.message || '请稍后再试。',
      action: h('div.stack',
        h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => enterDesk(server, desk) }, '重试'),
        others.length ? h('button.btn.btn-block', { type: 'button', onclick: () => enterDesk(others[0].server, others[0].desk) }, `打开 ${others[0].name || '其他服务台'}`) : null,
        h('button.btn.btn-ghost.btn-block', { type: 'button', onclick: createFlow }, '创建新服务台')),
    });
    return;
  }
  if (parse().path[0] === 'join') history.replaceState(null, '', '#/home');
  unmountShell = mountShell(root);
}

function createFlow() {
  if (unmountShell) {
    unmountShell();
    unmountShell = null;
  }
  const hasDesks = app.desks().length > 0;
  // Cancel goes back to the desk this was started from.
  const from = app.ref;
  createDeskScreen(root, {
    user: app.user,
    onCancel: hasDesks ? () => { const d = app.doc.desks[from] || app.desks()[0]; enterDesk(d.server, d.desk); } : null,
    onCreate: async ({ name, agentName }) => {
      const desk = await app.createDesk({ name, agentName });
      history.replaceState(null, '', '#/home');
      await enterDesk(LOCAL, desk);
      toast('您的服务台已就绪。您可以创建工单，或在“管理”中邀请您的团队。', { kind: 'success', title: name });
    },
  });
}

function joinFlow(server, desk, code) {
  if (!/^[a-z0-9_-]{3,63}$/.test(server)) {
    errorScreen(root, { title: '此邀请链接无效', message: '请向管理员索取新链接。' });
    return;
  }
  loadingScreen(root, '正在打开您的邀请');
  serverApi.invite(server, desk, code).then(
    (invite) => showJoin(server, desk, code, invite),
    (e) => {
      if (e?.status === 404) {
        errorScreen(root, {
          title: '此邀请链接已失效',
          message: e.message,
          action: h('button.btn.btn-block', { type: 'button', onclick: () => { history.replaceState(null, '', '#/home'); boot(); } }, '继续'),
        });
      } else showJoin(server, desk, code, null);
    },
  );
}

function showJoin(server, desk, code, invite) {
  joinScreen(root, {
    user: app.user,
    server,
    desk,
    invite,
    onCancel: () => {
      history.replaceState(null, '', '#/home');
      boot();
    },
    onJoin: async ({ name }) => {
      const res = await serverApi.join(server, desk, { code, name });
      await rememberDesk({ server, desk, name: res.meta?.name, role: res.me?.role });
      app.doc.desks[`${server}/${desk}`] = { server, desk, name: res.meta?.name, role: res.me?.role, at: Date.now() };
      history.replaceState(null, '', '#/home');
      await enterDesk(server, desk);
      toast(res.already ? '您已在该服务台中。' : `欢迎加入 ${res.meta?.name || '团队'}。`, { kind: 'success' });
    },
  });
}

app.addEventListener('switch', (e) => {
  go('/home', { replace: true });
  enterDesk(e.detail.server, e.detail.desk);
});
app.addEventListener('create', createFlow);
app.addEventListener('removed', () => {
  toastError({ message: '您已无权访问此服务台。' });
  const others = app.desks().filter((d) => `${d.server}/${d.desk}` !== app.ref);
  if (others.length) enterDesk(others[0].server, others[0].desk);
  else createFlow();
});
window.addEventListener('hashchange', () => {
  const r = parse();
  if (r.path[0] === 'join' && r.path.length >= 4 && app.user) joinFlow(r.path[1], r.path[2], r.path[3]);
  // The help center and the agent workspace are separate apps; moving
  // between them starts the right one. Navigation inside either stays put.
  if ((r.path[0] === 'help') !== portalMode) location.reload();
  // So does another help center: the one shown belongs to its own desk.
  else if (portalMode && `${r.path[1]}/${r.path[2]}` !== portalAt) location.reload();
});

start();
