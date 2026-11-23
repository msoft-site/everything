import './styles/index.css';
import { el } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { store } from './lib/store.js';
import { offline } from './lib/offline.js';
import { applyTheme } from './ui/theme.js';
import { mountShell } from './ui/shell.js';
import { toast } from './ui/toast.js';
import { shouldOnboard, openOnboarding } from './ui/onboarding.js';
import { initUrlActions } from './ui/actions.js';
import { withoutAction } from './lib/urlaction.js';
import { authView } from './views/auth.js';

const appRoot = document.getElementById('app');

// The splash lives above the app for its whole life: mounting a view must
// not remove it mid-frame (that reads as a flicker). It fades out instead.
const splash = document.getElementById('boot-splash');
if (splash) document.body.append(splash);

function dismissSplash() {
  const s = document.getElementById('boot-splash');
  if (!s) return;
  s.classList.add('done');
  setTimeout(() => s.remove(), 350);
}

function showError(title, message, onRetry) {
  appRoot.replaceChildren(el('div.auth-view', {},
    el('div.empty-icon', { html: icon('wifiOff', 30) }),
    el('h1.auth-title', { style: { fontSize: '22px' } }, title),
    el('p.auth-sub', {}, message),
    el('button.btn.btn-primary.auth-cta', { onclick: onRetry }, '重试')
  ));
  dismissSplash();
}

async function start() {
  if (typeof puter === 'undefined') {
    // The SDK could not load. If this device holds a signed-in user's
    // local mirror, boot from it: reads come from the cache, writes queue,
    // and the real SDK is picked up with a reload once the network returns.
    if (offline.hasCache() && !navigator.onLine) {
      offline.installStub();
      window.addEventListener('online', () => location.reload(), { once: true });
      await boot();
      return;
    }
    showError('无法连接到 Puter', 'Puter SDK 加载失败，请检查网络连接后重试。', () => location.reload());
    return;
  }

  let signedIn = false;
  try {
    signedIn = await Promise.resolve(puter.auth.isSignedIn());
  } catch {
    signedIn = false;
  }

  // Offline, the auth check can fail even though this device has a
  // signed-in user's data; their local mirror is the session.
  if (!signedIn && !navigator.onLine && offline.hasCache()) signedIn = true;

  if (!signedIn) {
    appRoot.replaceChildren(authView({ onSignedIn: boot }));
    dismissSplash();
    return;
  }
  await boot();
}

async function boot() {
  try {
    await store.init();
  } catch (err) {
    console.error(err);
    if (!navigator.onLine) {
      showError('当前处于离线状态', '此设备尚未缓存您的数据副本。请先连接一次网络，之后即可离线使用。', () => location.reload());
    } else {
      showError('无法加载您的数据', '与您的 Puter 云端通信时出现问题。', () => location.reload());
    }
    return;
  }

  // Settings win over the pre-paint localStorage value (they sync across
  // devices), and they keep winning: a theme picked on the laptop reaches
  // this tab through the same refresh every other setting does, so it is
  // applied whenever the settings change rather than only at boot. Picking
  // one here re-applies the value already on screen, which changes nothing.
  const syncTheme = () => applyTheme(store.settings.theme || 'system');
  syncTheme();
  store.addEventListener('change', syncTheme);
  mountShell(appRoot);
  dismissSplash();
  // First run on an empty dataset: guided start (or sample data).
  if (shouldOnboard(store)) {
    openOnboarding();
    // A brand-new account has no project to track and no timer to stop, so
    // an action arriving with the very first open is dropped rather than
    // stacked on the wizard that owns the screen.
    history.replaceState(null, '', withoutAction(location.hash));
  }
  // Actions addressed to the app from outside it (an icon shortcut, a
  // link): handled once the shell is up, so they can raise a sheet or a
  // toast.
  initUrlActions();
  setupOfflineBanner();
  // Automatic safety snapshot (weekly by default), silent on any failure:
  // offline or a flaky write just means the next open tries again.
  store.maybeAutoBackup().catch(() => {});
  syncPending();
  window.addEventListener('online', syncBoth);
  // 'online' only fires on an offline-to-online flip. Writes also queue
  // when the OS still reports online but the server is unreachable (DNS
  // or VPN blips), and nothing would ever flip; retry on a slow beat.
  // syncPending exits immediately when nothing is pending.
  setInterval(syncPending, 30 * 1000);
  /* Coming back to the tab is the moment a stale month matters most, so
     that is when it is re-read; a slow beat covers a tab that is simply
     left open and watched. */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pullRemote();
  });
  setInterval(pullRemote, 60 * 1000);
}

/** Push writes queued while offline; quiet when there's nothing to do. */
let syncing = false;
async function syncPending() {
  if (syncing || !navigator.onLine || !store.pendingWrites()) return;
  syncing = true;
  try {
    const n = await store.flushPending();
    if (n) toast(`已恢复在线，已同步 ${n} 项更改`, { icon: 'cloud' });
  } catch (err) {
    console.error(err);
  } finally {
    syncing = false;
    // A flush empties the queue without a store change event.
    updateOfflineBanner();
  }
}

/**
 * Pull in what another device did. One Puter account holds the data, so
 * the intended user tracks on a phone and reviews on a laptop; a tab left
 * open used to show a stale month forever. Quiet by design: nothing is
 * said unless something actually changed, and a hidden tab does not bother
 * asking (it refreshes the moment it comes back).
 */
let pulling = false;
async function pullRemote() {
  if (pulling || !navigator.onLine || document.hidden) return;
  pulling = true;
  try {
    const n = await store.refresh();
    if (n) {
      toast(`已从其他设备获取 ${n} 项更改`, { icon: 'cloud' });
    }
  } catch (err) {
    console.error(err);
  } finally {
    pulling = false;
  }
}

/** Local writes first, then whatever the other device left behind. */
async function syncBoth() {
  await syncPending();
  await pullRemote();
}

/* Set by setupOfflineBanner() once the shell is up; a no-op before then. */
let updateOfflineBanner = () => {};

/**
 * Bottom banner for work that has not reached Puter yet. Two signals, not
 * one: the OS reporting offline, and the write queue itself. A server that
 * is unreachable while the OS still reports online (a DNS or VPN blip)
 * never flips `navigator.onLine`, and without the queue check those
 * writes would look saved to the cloud while living only on this device.
 */
function setupOfflineBanner() {
  let banner = null;
  let shown = null; // the message on screen, so a no-op update stays quiet
  const update = () => {
    const isOffline = !navigator.onLine;
    const pending = store.pendingWrites();
    if (!isOffline && !pending) {
      banner?.remove();
      banner = null;
      shown = null;
      return;
    }
    const text = isOffline
      ? '离线状态，更改已保存在本地，恢复连接后将自动同步'
      : `已在本地保存 ${pending} 项更改，尚未同步`;
    if (text === shown) return;
    shown = text;
    // role=status announces the state once; rebuilding only on a real
    // change keeps it from re-announcing on every unrelated edit. The
    // message is its own element so it can ellipsize on a narrow phone
    // instead of being clipped mid-word.
    const next = el('div.offline-banner', {
      role: 'status',
      title: text,
      html: icon(isOffline ? 'wifiOff' : 'cloud', 15, 2),
    }, el('span', {}, text));
    if (banner) banner.replaceWith(next);
    else document.body.append(next);
    banner = next;
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  // Every write that queues, and every rollback, emits a change.
  store.addEventListener('change', update);
  updateOfflineBanner = update;
  update();
}

/* PWA service worker, skipped on local dev hosts where a registered
   worker would serve stale caches over the dev server. */
const isDevHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname)
  || location.hostname.endsWith('.localhost');
if ('serviceWorker' in navigator && !isDevHost) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Dev-only handle for console debugging.
if (import.meta.env?.DEV) window.__hourly = { store, offline };

start();
