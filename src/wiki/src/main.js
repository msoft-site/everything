import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/page.css';
import './styles/editor.css';
import './styles/database.css';
import { h } from './lib/dom.js';
import { icon } from './lib/icons.js';
import { applyTheme } from './ui/prefs.js';
import { Workspace } from './data/workspace.js';
import { puterBackend, puterKv, indexedDbBackend, localKv } from './data/backend.js';
import { indexedDbCache, memoryCache } from './data/cache.js';
import { App } from './ui/app.js';
import { call, deploy, refreshDeployment } from './collab/api.js';
import { parseLink } from './collab/protocol.js';
import { grantEvents } from './collab/consent.js';

const root = document.getElementById('app');
applyTheme();

const logo = () => h('img.splash-logo', { src: './icon-192.png', alt: '', width: 48, height: 48 });

function screen(...children) {
  root.removeAttribute('aria-busy');
  root.replaceChildren(h('main.splash', { id: 'main' }, ...children));
}

function loading(text = '正在打开您的知识库...') {
  root.setAttribute('aria-busy', 'true');
  root.replaceChildren(h('div.splash', { role: 'status' }, logo(), h('div.spinner', { 'aria-hidden': 'true' }), h('p.splash-sub', text)));
}

function errorScreen(title, message, retry) {
  screen(h('div.splash-icon', icon('cloudOff', 28)), h('h1.splash-title', title), h('p.splash-sub', message), retry ? h('button.btn.primary.splash-cta', { type: 'button', onclick: retry }, '重试') : null);
}

function signInScreen(onSignedIn, inviting) {
  const btn = h('button.btn.primary.splash-cta', { type: 'button' }, '登录');
  const error = h('p.field-error', { role: 'alert' });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = '正在加载本地工作区…...';
    error.textContent = '';
    try {
      await puter.auth.signIn();
      onSignedIn();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '登录';
      if (err?.error === 'popup_blocked') error.textContent = '您的浏览器拦截了登录窗口。请允许此站点的弹出窗口后重试。';
      else if (err?.error !== 'auth_window_closed') error.textContent = '无法登录，请重试。';
    }
  });
  const feature = (ic, text) => h('li', icon(ic, 18), h('span', text));
  screen(
    logo(),
    h('h1.splash-title', inviting ? '您受邀加入一个共享空间' : '知识库'),
    h('p.splash-sub', inviting ? '打开本地空间。' : '面向个人与团队的文档、笔记和数据库。'),
    inviting
      ? null
      : h(
          'ul.splash-features',
          feature('pencil', '使用块编辑器写作：标题、列表、待办、表格、代码与图片'),
          feature('database', '通过表格、看板、列表和日历追踪一切'),
          feature('users', '分享页面并与他人实时协同编辑'),
          feature('cloud', '以文件形式存储在您自己的 本地存储'),
        ),
    btn,
    error,
  );
  btn.focus();
}

async function profilePicture() {
  try {
    return (await puter.auth.getProfilePicture?.()) || null;
  } catch {
    return null;
  }
}

async function start({ backend, kv, cache, user, env, collab, onSignOut, picture, link }) {
  loading();
  const ws = new Workspace({ backend, kv, cache, user, collab });
  try {
    await ws.start();
  } catch (err) {
    console.error(err);
    errorScreen('无法打开您的知识库', '请检查您的网络连接后重试。', () => location.reload());
    return;
  }
  const app = new App(root, { ws, user, env, onSignOut, picture: null, puter: typeof puter === 'undefined' ? null : puter });
  window.wikiApp = app;
  await app.start();
  Promise.resolve(picture).then((p) => p && app.setPicture(p));
  if (link) {
    history.replaceState(null, '', location.pathname + location.search);
    app.join(link);
  }
}

function inviteFromHash() {
  if (!/(^|[#&])space=/.test(location.hash)) return null;
  try {
    return parseLink(location.href);
  } catch {
    return null;
  }
}

async function boot() {
  const link = inviteFromHash();
  const params = new URLSearchParams(location.search);
  if (import.meta.env.DEV && params.has('local')) {
    // Development sandbox: everything stays in this browser, no account.
    // Sharing runs on a local copy of the collaboration service; add &as=<name>
    // in another tab to be someone else.
    const { localCollab, devUser } = await import('./dev/local-collab.js');
    const user = { ...devUser(params.get('as')), sandbox: true };
    const ns = user.username === 'you' ? '' : `-${user.username}`;
    const backend = await indexedDbBackend(`wiki-local${ns}`);
    start({ backend, kv: localKv(`wiki-local${ns}:`), cache: memoryCache(), user, env: 'web', collab: localCollab(user), onSignOut: null, picture: null, link });
    return;
  }
  if (typeof puter === 'undefined') {
    errorScreen('无法连接到本地存储服务', '知识库将您的页面保存在 本地存储。请检查网络连接后重试。', () => location.reload());
    return;
  }
  const env = puter.env;
  const begin = async () => {
    loading();
    let user = null;
    try {
      user = await puter.auth.getUser();
    } catch {
      /* pages still load; the avatar falls back to initials */
    }
    const collab = {
      request: (server, op, data) => call(puter, server, { op, ...data }),
      deploy: (progress) => deploy(puter, progress),
      refresh: (server) => refreshDeployment(puter, server),
      events: puter.events || null,
      grantEvents: (space) => grantEvents(puter, space),
    };
    start({
      backend: puterBackend(puter),
      kv: puterKv(puter),
      cache: await indexedDbCache(),
      user,
      env,
      collab,
      // Inside the Puter desktop the session is Puter's, so no sign-out is offered.
      onSignOut:
        env === 'app'
          ? null
          : async () => {
              await puter.auth.signOut();
              location.hash = '';
              location.reload();
            },
      picture: profilePicture(),
      link,
    });
  };
  if (env === 'app' || puter.auth.isSignedIn()) begin();
  else signInScreen(begin, !!link);
}

boot();
