import './styles/index.css';
import { el } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { announce, toast } from './ui/toast.js';
import { closeAllModals, confirmDialog, openModal } from './ui/modal.js';
import { closeMenu } from './ui/menu.js';
import { session } from './lib/session.js';
import * as P from './lib/puter.js';
import { Doc, needsUnloadWarning, autosaveEnabled } from './lib/doc.js';
import { errorView, signInView } from './views/gate.js';
import { homeView } from './views/home.js';
import { editorView } from './views/editor.js';
import { loadEngine } from './lib/engine.js';
import { templateById } from './lib/templates.js';
import { importFiles, nothingImportable } from './lib/importfiles.js';
import { imageFilesFrom } from './lib/images.js';
import { customTemplatePath } from './lib/customtemplates.js';
import { parseLink } from './collab/protocol.js';
import { CLOSE_TITLE, SAVE_CHANGES_TITLE, asksToSave, createCloseWindow, saveChangesDialog } from './views/window-close.js';

const appRoot = document.getElementById('app');
let current = null; // { kind: 'home' | 'editor' | 'gate', view }
let launchedPath = null;
let droppedFiles = null;
let importRequest = 0;

/* ---------- Routing ---------- */

/** The document list. Opening the app lands in a new document instead. */
export const HOME = '#/home';

export function parseHash(hash = location.hash) {
  const h = hash.replace(/^#\/?/, '');
  try {
    if (h === '' || h === 'new') return { route: 'new', template: null };
    if (h.startsWith('edit/')) return { route: 'edit', path: decodeURIComponent(h.slice(5)) };
    if (h.startsWith('new/')) return { route: 'new', template: decodeURIComponent(h.slice(4)) || null };
  } catch { /* A malformed percent escape should fall back to the home screen. */ }
  return { route: 'home' };
}

/**
 * A New action that has to change the URL is answered by the hash listener,
 * which knows nothing of the press behind it. The intent waits here so the
 * document it lands on is created rather than the open one reused: a template
 * document stops naming its template once it has been laid out, so "New
 * document" from one would otherwise look like the document already open.
 */
let requestedNewDocument = false;

function go(hash, { newDocument = false } = {}) {
  if (location.hash === hash) route({ newDocument });
  else {
    requestedNewDocument ||= newDocument;
    location.hash = hash;
  }
}

/** Why a document could not be opened, in the user's terms. */
const openFailureMessage = (e) => (P.isNotFound(e) ? '该文件已不存在' : e?.name === 'HwpError' ? e.message : '无法打开文件');

/** The URL that shows a document: its file, the invitation to the shared document it is, or the template it is being written from. */
const docHash = (doc) => (doc.path ? `#/edit/${encodeURIComponent(doc.path)}` : doc.collab?.hash ? doc.collab.hash : doc.template ? `#/new/${encodeURIComponent(doc.template)}` : '#/new');

async function unmount(stillWanted = () => true) {
  const leaving = current;
  const destination = location.hash;
  if (leaving?.kind === 'editor') {
    const doc = leaving.view.doc;
    const ownHash = () => docHash(doc);
    // With AutoSave off, leaving asks whether to save: Don't Save leaves the file as it was.
    leaving.view.engine?.finishComposition?.();
    let discard = false;
    if (asksToSave(doc)) {
      history.replaceState(null, '', ownHash());
      const choice = await saveChangesDialog(doc);
      if (!stillWanted() || current !== leaving) return false;
      const moved = location.hash !== ownHash();
      if (choice === 'stay') { if (moved) history.replaceState(null, '', ownHash()); return false; }
      if (!moved) history.replaceState(null, '', destination);
      discard = choice === 'discard';
    }
    for (;;) {
      if (discard) break;
      const saved = await leaving.view.flush();
      if (!stillWanted() || current !== leaving) return false;
      if (saved) break;
      // The URL shows the document while the user decides.
      history.replaceState(null, '', ownHash());
      const choice = await leaveDialog(doc, { unsaveable: !!leaving.view.unsaveable, undelivered: !!leaving.view.undelivered });
      if (!stillWanted() || current !== leaving) return false;
      // A place chosen while the dialog was open (a link, the back button) is where to go; staying shows the document again.
      const moved = location.hash !== ownHash();
      if (choice === 'stay') { if (moved) history.replaceState(null, '', ownHash()); return false; }
      if (!moved) history.replaceState(null, '', destination);
      if (choice === 'leave') break;
      // 'sign-in': with a session the save can go through; then try again.
      const signedIn = await session.signIn();
      if (!stillWanted() || current !== leaving) return false;
      if (!signedIn) { history.replaceState(null, '', ownHash()); return false; }
    }
  }
  closeMenu();
  closeAllModals();
  current?.view.destroy?.();
  current = null;
  return true;
}

const LEAVE_TITLES = ['不保存并离开？', '离开前是否保存？', CLOSE_TITLE, SAVE_CHANGES_TITLE];
/** Whether the question about leaving an unsaved document is on screen, whichever navigation or import asked it. */
const leaveQuestionOpen = () => [...document.querySelectorAll('.modal-root:not(.closing) [role="dialog"]')].some((dialog) => LEAVE_TITLES.includes(dialog.getAttribute('aria-label')));

/**
 * What to do with edits that could not be written: 'stay', 'leave' (and lose
 * them), or, without a session, 'sign-in' so they can be saved after all.
 */
function leaveDialog(doc, { unsaveable = false, undelivered = false } = {}) {
  // Changes to a shared document someone else saves: the room has not received them (offline, say).
  if (undelivered) {
    return confirmDialog({
      title: LEAVE_TITLES[0],
      message: '您的最新更改尚未同步到共享文档，其他人暂时看不到。您可以继续编辑直到恢复连接，或者直接离开：当前浏览器会保留这些更改，并在您下次在此打开该文档时发送。',
      confirmLabel: '离开', cancelLabel: '继续编辑',
    }).then((leave) => (leave ? 'leave' : 'stay'));
  }
  // A preview, or a file that could not be opened, has no save to try again: say what staying is for.
  if (unsaveable) {
    return confirmDialog({
      title: LEAVE_TITLES[0],
      message: `此文档无法打开进行编辑，因此尚未保存到本地。${doc.blob ? '留下以下载副本，或直接离开。' : '确定直接离开吗？'}`,
      confirmLabel: '不保存并离开', cancelLabel: '留下',
    }).then((leave) => (leave ? 'leave' : 'stay'));
  }
  // Signing in helps only a document that can be saved at all; one that never opened cannot be.
  if (!session.signedOut || !doc.dirty || !doc.exporter) {
    return confirmDialog({
      title: LEAVE_TITLES[0],
      // A document that never reached a file has no "latest changes" to speak of; the whole of it is at stake.
      message: doc.waitsForPlace && doc.path
        // Inside the Puter desktop a template or other file's edits wait for a Save to put them in a new .docx; the file stays as it is.
        ? `您对“${P.displayName(doc.path)}”所做的更改尚未保存。继续编辑以将其另存为新文档，或离开并放弃更改。`
        : doc.path || doc.lastSaved
        ? '您的最新更改无法保存。继续编辑以重试，或离开并放弃这些更改。'
        : '此文档尚未保存。继续编辑以重试，或离开并放弃该文档。',
      confirmLabel: '不保存并离开', cancelLabel: '继续编辑',
    }).then((leave) => (leave ? 'leave' : 'stay'));
  }
  return new Promise((resolve) => {
    const content = el('div', {},
      el('p.modal-text', {}, '此文档尚未保存在任何位置。将其保存到本地设备，或离开并放弃该文档。'),
      el('div.row.row-end', { style: { flexWrap: 'wrap' } },
        el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '继续编辑'),
        el('button.btn.btn-danger', { type: 'button', onclick: () => { resolve('leave'); modal.close(); } }, '不保存并离开'),
        el('button.btn.btn-primary', { type: 'button', onclick: () => { resolve('sign-in'); modal.close(); } }, '登录并保存')));
    const modal = openModal({ title: LEAVE_TITLES[1], content, onClose: () => resolve('stay') });
  });
}

function mount(kind, view) {
  current = { kind, view };
  appRoot.replaceChildren(view.el);
  // A change of screen would otherwise leave the keyboard on the page body, wherever the last screen had it. The
  // editor places it itself once the engine is up; the list and the gate start at their heading.
  if (kind !== 'editor') {
    const heading = view.el.querySelector('h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
}

/** A cloud document was asked for without a session: offer the sign-in, or a new document. */
function mountSignInGate(requestedHash, what) {
  const whatZh = what === 'template' ? '模板' : what === 'shared document' ? '共享文档' : '文档';
  document.title = '文档';
  mount('gate', { el: signInView({
    title: `登录以打开此${whatZh}`,
    message: `文档保存在本地设备。请登录以打开此${whatZh}，或在不登录的情况下新建空白文档。`,
    onSignIn: async () => { if (await session.signIn() && location.hash === requestedHash) route(); },
    onSkip: () => go('#/'),
  }) });
}

/**
 * The screen while something opens. `cancel`: what leaving does, offered once the wait is noticeable (a large file
 * on a slow connection, a request that hangs), since inside the Puter desktop there is no browser Back button.
 */
function showLoading(label = '正在打开', { cancel = null } = {}) {
  const leave = cancel && el('button.btn.btn-outline', { type: 'button', hidden: true, style: { marginTop: '6px' }, onclick: cancel }, '取消');
  appRoot.replaceChildren(el('div.auth-view', {},
    el('div.auth-card', {},
      el('span.spin', { html: icon('spinner', 28), style: { color: 'var(--ink-3)' } }),
      el('p.auth-sub', { style: { marginTop: '14px' } }, label),
      leave)));
  if (leave) setTimeout(() => { leave.hidden = false; }, LOADING_CANCEL_MS);
}
const LOADING_CANCEL_MS = 1500;

/**
 * `work` (a document being read, a room being joined), or LEFT as soon as the address moves away from `hash`: going
 * back or elsewhere does not wait for a slow or hanging request. What `work` comes to after that is nobody's.
 */
const LEFT = Symbol('left');
async function unlessLeft(hash, work) {
  let stop = () => {};
  const left = new Promise((resolve) => {
    const check = () => { if (location.hash !== hash) resolve(LEFT); };
    window.addEventListener('hashchange', check);
    stop = () => window.removeEventListener('hashchange', check);
  });
  work.catch(() => {});
  try { return await Promise.race([work, left]); } finally { stop(); }
}

const nav = {
  goHome: () => go(HOME),
  openPath: (path) => go(`#/edit/${encodeURIComponent(path)}`),
  newDoc: () => go('#/new', { newDocument: true }),
  newFromTemplate: (id) => go(`#/new/${encodeURIComponent(id)}`, { newDocument: true }),
  /** Load a document from disk again (after its file was replaced), without a save on the way out. */
  reopen: async (path) => {
    const request = ++importRequest, requestedHash = location.hash;
    const stillWanted = () => request === importRequest && location.hash === requestedHash;
    current?.view?.doc?.destroy?.();
    current?.view?.doc?.discardEdits?.();
    if (!await unmount(stillWanted)) return;
    showLoading();
    try {
      const doc = await Doc.fromPath(path);
      if (!stillWanted()) return;
      openEditor(doc);
    } catch (e) {
      if (!stillWanted()) return;
      console.error(e);
      toast(openFailureMessage(e), { icon: 'alert', duration: 5000 });
      go(HOME);
    }
  },
  /**
   * Files dropped on the app, or picked from the device: one opens here, and
   * a batch is written into the documents folder behind it.
   */
  importFiles: (files, { picked = false } = {}) => {
    const source = current;
    const stillHere = () => current === source;
    return importFiles(files, {
      openFile: nav.importFile,
      stillHere,
      onImported: () => { if (stillHere() && current?.kind === 'home') current.view.reload(); },
      // In the editor a picture is a likelier drop than a document, and it has a place to go.
      nothingMessage: !picked && current?.kind === 'editor' && imageFilesFrom({ files }).length
        ? '将图片拖放到页面上即可插入'
        : nothingImportable(files, { picked }),
    });
  },
  importFile: async (file) => {
    const request = ++importRequest, source = current;
    const stillWanted = () => request === importRequest && current === source;
    let doc;
    try { doc = await Doc.fromImportFile(file); }
    catch (e) { if (stillWanted()) { console.error(e); toast(e?.message || '无法导入该文件', { icon: 'alert', duration: 8000 }); } return; }
    // File reads and converter loading can finish after another navigation.
    // Only the newest request may close the current editor and install its copy.
    if (!stillWanted()) return;
    // The question about leaving the open document unsaved is already up: a second file must not ask it again on top.
    if (leaveQuestionOpen()) { toast('请先回答关于当前打开文档的提示', { icon: 'info' }); return; }
    // Closing the editor can ask about unsaved edits. A hash change meanwhile
    // (a link, the back button) waits for the answer instead of asking again on top.
    importing++;
    const requestedHash = location.hash, leaving = source?.kind === 'editor' ? source.view.doc : null;
    // The URL follows the leaving document while it saves, or stays where it was (a new document
    // reached without a hash never wrote one); anywhere else is a place the user chose.
    const moved = () => location.hash !== requestedHash && location.hash !== (leaving ? docHash(leaving) : requestedHash);
    let opened = false;
    try {
      if (!await unmount(stillWanted)) return;
      // A place chosen while the question was up is where to go, not the import.
      if (moved()) return;
      history.replaceState(null, '', '#/new');
      openEditor(doc);
      opened = true;
    } finally {
      importing--;
      if (!opened && !importing && !routing && moved()) route();
    }
  },

};

function openEditor(doc) {
  const view = editorView({ doc, ...nav });
  mount('editor', view);
  // Once an unsaved document gets a file, the URL follows so a reload reopens it.
  doc.addEventListener('path', () => {
    if (doc.path && current?.view === view && !routing) {
      history.replaceState(null, '', `#/edit/${encodeURIComponent(doc.path)}`);
    }
  });
  if (doc.path) history.replaceState(null, '', `#/edit/${encodeURIComponent(doc.path)}`);
  else if (doc.importInfo) history.replaceState(null, '', '#/new');
}

let routing = false;
// Imports closing the editor. Their leave question decides; the hash is followed after it.
let importing = 0;
async function route({ newDocument = false } = {}) {
  if (importing) return;
  importRequest++;
  if (routing) return;
  routing = true;
  const explicitNew = newDocument || requestedNewDocument;
  requestedNewDocument = false;
  const requestedHash = location.hash;
  // An open abandoned when the address moved away: wherever it is now (back here too) is routed afresh.
  let abandoned = false;
  try {
    // An invitation to a shared document (#collab-…): join its room, then open what it holds.
    let invitation = null;
    try { invitation = parseLink(location.href); } catch (e) { toast(e.message, { icon: 'alert' }); }
    if (invitation) {
      if (current?.kind === 'editor' && current.view.doc.collab?.link?.room === invitation.room) return;
      if (!await unmount()) return;
      if (location.hash !== requestedHash) return;
      abandoned = await openInvitation(invitation, requestedHash) === LEFT;
      return;
    }
    const { route: r, path, template } = parseHash(requestedHash);
    if (current?.kind === 'editor' && r === 'edit' && current.view.doc.path === path) return;
    // Going home from a failed open changes the hash and re-routes when it settles: the list is mounted once.
    if (r === 'home' && current?.kind === 'home') return;
    // An explicit New action must save and leave an unsaved document even
    // when both documents use the same URL. Ordinary route events can reuse it.
    if (!explicitNew && current?.kind === 'editor' && r === 'new' && !current.view.doc.path && (current.view.doc.template || null) === template) return;
    if (!await unmount()) return;
    if (location.hash !== requestedHash) return;
    if (r === 'home') {
      mount('home', homeView(nav));
      document.title = '文档';
      P.setWindowTitle('文档');
      return;
    }
    if (r === 'new') {
      const customPath = customTemplatePath(template);
      if (customPath) {
        if (session.signedOut) { mountSignInGate(requestedHash, 'template'); return; }
        showLoading('正在打开', { cancel: () => go(HOME) });
        try {
          const doc = await unlessLeft(requestedHash, Doc.fromTemplateFile(customPath));
          if (doc === LEFT) { abandoned = true; return; }
          if (location.hash !== requestedHash) return;
          openEditor(doc);
        } catch (e) {
          if (location.hash !== requestedHash) return;
          console.error(e);
          toast(P.isNotFound(e) ? '该模板已不存在' : '无法打开模板', { icon: 'alert', duration: 5000 });
          go(HOME);
        }
        return;
      }
      const t = template ? templateById(template) : null;
      if (template && !t) toast('该模板不存在', { icon: 'alert' });
      openEditor(Doc.blank(t ? { template: t.id, name: t.name } : {}));
      return;
    }
    if (session.signedOut) { mountSignInGate(requestedHash, 'document'); return; }
    showLoading('正在打开', { cancel: () => go(HOME) });
    try {
      const doc = await unlessLeft(requestedHash, Doc.fromPath(path));
      if (doc === LEFT) { abandoned = true; return; }
      if (location.hash !== requestedHash) return;
      openEditor(doc);
    } catch (e) {
      if (location.hash !== requestedHash) return;
      console.error(e);
      toast(openFailureMessage(e), { icon: 'alert', duration: 8000 });
      go(HOME);
    }
  } finally {
    routing = false;
    // Hash changes during an awaited save/read must be processed after it settles.
    if (abandoned || location.hash !== requestedHash) route();
  }
}

/** Join a shared document from its link and open the editor on the room's state. */
async function openInvitation(link, requestedHash) {
  if (!link.local && session.signedOut) { mountSignInGate(requestedHash, 'shared document'); return; }
  showLoading('正在加入共享文档', { cancel: () => go(HOME) });
  try {
    // The owner's own invitation (from their mail, say) opens the file the room belongs to: that is the document they
    // own, saved as they edit. Joined from the link, it would be a copy of the room that nothing saves.
    if (!link.local) {
      const { fileOfRoom } = await import('./collab/room-memory.js');
      const path = await unlessLeft(requestedHash, fileOfRoom(link));
      if (path === LEFT) return LEFT;
      if (location.hash !== requestedHash) return;
      if (path) { history.replaceState(null, '', `#/edit/${encodeURIComponent(path)}`); return; }
    }
    const { joinRoom } = await import('./collab/live.js');
    const user = { id: session.user?.uuid || session.username, name: session.username };
    const joining = joinRoom(link, user);
    const joined = await unlessLeft(requestedHash, joining);
    // Left while joining: the room is left too, whenever the join comes to an end.
    if (joined === LEFT || location.hash !== requestedHash) { joining.then((j) => j.client.close().catch(() => {}), () => {}); return joined === LEFT ? LEFT : undefined; }
    // The room holds the document; this tab never writes a file of its own unless sharing ends.
    const doc = new Doc({ name: joined.name, blob: new Blob([joined.base], { type: P.DOCX_MIME }) });
    doc.setSaving(false);
    doc.collab = { client: joined.client, link, hash: requestedHash };
    openEditor(doc);
    document.title = `${doc.name} — 文档`;
  } catch (e) {
    if (location.hash !== requestedHash) return;
    console.error(e);
    toast(e?.status === 403 ? e.message : `无法打开共享文档：${e?.message || e}`, { icon: 'alert', duration: 8000 });
    go(HOME);
  }
}

/* ---------- Boot ---------- */

/**
 * Nobody has to sign in to write: the app opens straight into the editor.
 * Puter is asked for a sign-in at the first action that needs the cloud.
 */
async function start() {
  if (!P.hasSDK()) {
    appRoot.replaceChildren(errorView('无法连接到存储服务', '本地存储加载失败。请重试。', () => location.reload()));
    return;
  }
  P.onLaunchedWithItems((items) => {
    const first = items.find((it) => it?.path);
    if (!first) return;
    if (booted) nav.openPath(first.path);
    else launchedPath = first.path;
  });
  // The Puter desktop window's close button waits for the document's edits, and asks about a never-saved one.
  P.onWindowClose(createCloseWindow({ open: () => current, leaveDialog, exit: P.exitApp, asking: leaveQuestionOpen }));
  await boot();
}

let booted = false;
async function boot() {
  showLoading('正在加载');
  // Before anything else: a file dropped on the loading screen is meant for
  // the app, and the browser would otherwise leave the app to open it.
  setupFileDrop();
  // Start loading the canvas editor alongside session initialization.
  if (parseHash().route !== 'home') loadEngine().catch(() => {});
  await session.init();
  // The SDK signs the user in on its own before an AI request; the views follow.
  P.onAuth((user) => session.signedInAs(user));
  booted = true;
  window.addEventListener('hashchange', route);
  if (launchedPath) {
    const p = launchedPath;
    launchedPath = null;
    location.hash = `#/edit/${encodeURIComponent(p)}`;
  }
  await route();
  setupOfflineBanner();
  setupUnloadGuard();
  if (droppedFiles) {
    const files = droppedFiles;
    droppedFiles = null;
    nav.importFiles(files);
  }
  window.addEventListener('app:before-signout', (event) => event.detail.waitUntil(current?.view?.flush?.()));
}

/**
 * A file dropped anywhere on the app opens, wherever the drop lands: the
 * screens that make something of their own out of a drop (the document list
 * imports a batch, the page takes pictures) handle it first and this is what
 * catches the rest. Without it the browser would leave the app for the file.
 */
function setupFileDrop() {
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  let hint = null;
  let hideTimer = 0;
  const hide = () => { clearTimeout(hideTimer); hideTimer = 0; hint?.remove(); hint = null; };
  const show = () => {
    if (!hint) {
      hint = el('div.drop-hint.dragging-over', { 'aria-hidden': 'true' },
        el('div.drop-hint-card', {}, el('span', { html: icon('upload', 26) }), el('span', {}, '松开以打开')));
      document.body.append(hint);
    }
    // Nothing reports a file leaving the window for good, and dragleave fires
    // between elements on the way across. The drag repeats dragover while it
    // is over the app, so the hint goes when the repeats do.
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 500);
  };
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e) || e.defaultPrevented) return;
    // Accepting the drag is what allows the drop that follows.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    show();
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    hide();
    if (e.defaultPrevented) return;
    e.preventDefault();
    // A drop during the boot waits for it: the sign-in state a batch import
    // asks about, and the view it opens in front of, are not settled yet.
    if (!booted) { droppedFiles = e.dataTransfer.files; return; }
    nav.importFiles(e.dataTransfer.files);
  });
  window.addEventListener('dragend', hide);
}

/**
 * Closing the tab with edits pending: ask first, and use the moment the page
 * goes to the background to push a save so a quick close loses nothing.
 */
function setupUnloadGuard() {
  const doc = () => (current?.kind === 'editor' ? current.view.doc : null);
  window.addEventListener('beforeunload', (e) => {
    // A shared document's changes that have not reached the others yet are at stake as much as unsaved ones.
    if (!needsUnloadWarning(doc()) && !(current?.kind === 'editor' && current.view.undelivered)) return;
    e.preventDefault();
    e.returnValue = '';
  });
  const saveInBackground = () => { const d = doc(); if (d?.dirty) d.save({ auto: true, now: true }).catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveInBackground(); });
  window.addEventListener('pagehide', saveInBackground);
}

function setupOfflineBanner() {
  let banner = null;
  const update = () => {
    if (!navigator.onLine && !banner) {
      // With AutoSave off only Save writes, the reconnection included: the banner must not promise otherwise.
      const text = autosaveEnabled() ? '已离线。重新连接后将自动保存更改' : '已离线。重新连接后请保存您的更改';
      banner = el('div.offline-banner', { html: icon('wifiOff', 15, 2) }, ` ${text}`);
      document.body.append(banner);
      announce(text);
    } else if (navigator.onLine && banner) {
      banner.remove();
      banner = null;
      announce('已恢复在线');
      // Only pending edits go out; an untouched new document has no file to write yet.
      const doc = current?.view?.doc;
      if (doc?.dirty) doc.save({ auto: true, fresh: true }).catch(() => {});
    }
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

if (import.meta.env?.DEV) window.__docs = { session, get current() { return current; } };

start();
