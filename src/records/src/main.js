import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/views.css';
import { h } from './lib/dom.js';
import { icon } from './lib/icons.js';
import { applyTheme } from './ui/prefs.js';
import { Store } from './data/store.js';
import { puterBackend, puterKv, indexedDbBackend, localKv } from './data/backend.js';
import { indexedDbJournal, journalName } from './data/journal.js';
import { App } from './ui/app.js';

const root = document.getElementById('app');
applyTheme();

const logo = () => h('img.splash-logo', { src: './icon-192.png', alt: '', width: 56, height: 56 });

function screen(...children) {
  root.removeAttribute('aria-busy');
  root.replaceChildren(h('main.splash', { id: 'main' }, ...children));
}

function loading(text = '正在打开 Records...') {
  root.setAttribute('aria-busy', 'true');
  root.replaceChildren(h('div.splash', { role: 'status' }, logo(), h('div.spinner', { 'aria-hidden': 'true' }), h('p.splash-sub', text)));
}

function errorScreen(title, message, retry) {
  screen(h('div.splash-icon', icon('cloudOff', 28)), h('h1.splash-title', title), h('p.splash-sub', message), retry ? h('button.btn.primary.splash-cta', { type: 'button', onclick: retry }, '重试') : null);
}

function signInScreen(onSignedIn) {
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
      if (err?.error === 'popup_blocked') error.textContent = '您的浏览器拦截了登录窗口。请允许本网站的弹窗后重试。';
      else if (err?.error !== 'auth_window_closed') error.textContent = '无法登录，请重试。';
    }
  });
  const feature = (ic, text) => h('li', icon(ic, 18), h('span', text));
  screen(
    logo(),
    h('h1.splash-title', 'Records 数据表'),
    h('p.splash-sub', '用关联数据表管理一切，并以表格、看板、日历、画廊或表单形式呈现。'),
    h(
      'ul.splash-features',
      feature('vGrid', '拥有丰富字段类型的高速电子表格视图'),
      feature('fLink', '跨表关联记录，支持查找与汇总计算'),
      feature('fFormula', '支持公式、筛选、排序、分组与汇总统计'),
      feature('cloud', '以文件形式安全存储在您的专属 本地存储'),
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

async function start({ backend, kv, journal, user, env, onSignOut, picture }) {
  loading();
  const store = new Store({ backend, kv, journal, user: user?.username || '' });
  try {
    await store.init();
  } catch (err) {
    console.error(err);
    errorScreen('无法打开 Records', '请检查您的网络连接后重试。', () => location.reload());
    return;
  }
  const app = new App(root, { store, user, env, onSignOut });
  window.recordsApp = app;
  app.start();
  Promise.resolve(picture).then((p) => p && app.setPicture(p));
  // Opened from the Puter desktop with CSV files ("Open with Records").
  if (env === 'app' && typeof puter !== 'undefined' && puter.ui?.onLaunchedWithItems) {
    puter.ui.onLaunchedWithItems(async (items) => {
      for (const item of items || []) {
        if (!/\.(csv|tsv|txt)$/i.test(item.name || '')) continue;
        try {
          const blob = await (item.read ? item.read() : puter.fs.read(item.path));
          app.importFile(new File([blob], item.name, { type: blob.type || 'text/csv' }));
        } catch (err) {
          console.error(err);
        }
      }
    });
  }
}

async function boot() {
  const params = new URLSearchParams(location.search);
  if (import.meta.env.DEV && params.has('local')) {
    // Development sandbox: everything stays in this browser, no account.
    const backend = await indexedDbBackend('records-local');
    start({ backend, kv: localKv('records-local:'), journal: await indexedDbJournal('records-local-journal'), user: { username: 'you' }, env: 'web', onSignOut: null, picture: null });
    return;
  }
  if (typeof puter === 'undefined') {
    errorScreen('无法连接本地环境', 'Records 将您的数据库保存在您的 本地存储。请检查您的网络连接后重试。', () => location.reload());
    return;
  }
  const env = puter.env;
  const begin = async () => {
    loading();
    let user = null;
    try {
      user = await puter.auth.getUser();
    } catch {
      /* the avatar falls back to initials */
    }
    start({
      backend: puterBackend(puter),
      kv: puterKv(puter),
      journal: await indexedDbJournal(journalName(user)),
      user,
      env,
      // Inside the Puter desktop the session belongs to Puter, so there is no sign-out.
      onSignOut: env === 'app' ? null : async () => {
        await puter.auth.signOut();
        location.hash = '';
        location.reload();
      },
      picture: profilePicture(),
    });
  };
  if (env === 'app' || puter.auth.isSignedIn()) begin();
  else signInScreen(begin);
}

boot();
