import './styles/index.css';
import { el } from './lib/dom.js';
import { icon } from './ui/icons.js';
import { store } from './lib/store.js';
import { applyTheme } from './ui/theme.js';
import { mountShell } from './ui/shell.js';
import { shouldOnboard, openOnboarding } from './ui/onboarding.js';
import { initReminders } from './ui/reminders.js';
import { authView } from './views/auth.js';

const appRoot = document.getElementById('app');

function showError(title, message, onRetry) {
  appRoot.replaceChildren(el('div.auth-view', {},
    el('div.empty-icon', { html: icon('cloudOff', 30) }),
    el('h1.auth-title', {}, title),
    el('p.auth-sub', {}, message),
    el('button.btn.btn-primary.auth-cta', { onclick: onRetry }, '重试')
  ));
}

async function start() {
  if (typeof puter === 'undefined') {
    showError('无法连接到本地存储服务', 'Puter SDK 加载失败。请检查网络连接后重试。', () => location.reload());
    return;
  }

  let signedIn = false;
  try {
    signedIn = await Promise.resolve(puter.auth.isSignedIn());
  } catch {
    signedIn = false;
  }

  if (!signedIn) {
    appRoot.replaceChildren(authView({ onSignedIn: boot }));
    return;
  }
  await boot();
}

async function boot() {
  try {
    await store.init();
  } catch (err) {
    console.error(err);
    showError('无法加载您的数据', '与您的 本地存储通信时出现问题。请检查网络连接后重试。', () => location.reload());
    return;
  }

  // Settings win over the pre-paint localStorage value (they sync across devices).
  applyTheme(store.settings.theme || 'system');
  mountShell(appRoot);

  // Trash is a grace period: sweep expired projects once per boot, in the
  // background — the UI must not wait on it, and a failure is not fatal.
  store.purgeOldDeletedProjects().catch((err) => console.error(err));
  // Reminders run off the critical path: the first pass waits for idle.
  initReminders();
  if (shouldOnboard(store)) openOnboarding();

  // Saves are debounced, so a close inside that window still has to land —
  // but it no longer needs to interrupt anyone: flushAll() writes the local
  // mirror first, and whatever does not reach Puter goes out from there on
  // the next visit.
  window.addEventListener('beforeunload', () => {
    if (store.dirty) store.flushAll();
  });
}

/**
 * The shell — this app's HTML, JS, CSS and the Puter SDK — is cached so the
 * app can start with no connection. Data never is (see public/sw.js).
 * Registered after load so it never competes with the first paint, and only
 * in a real build: in dev it would sit between Vite and the browser.
 */
function registerServiceWorker() {
  if (!import.meta.env?.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.error(err));
  });
}
registerServiceWorker();

// Dev-only handle for console debugging.
if (import.meta.env?.DEV) window.__pm = { store };

start();
