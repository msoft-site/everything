/**
 * The Version History pane: the document's saved versions (lib/versions.js)
 * newest first, grouped by day, with who saved each and the name given to it.
 * A version opens read-only beside the document; it can be compared with the
 * current document (the Review tab's Compare), named, or restored.
 *
 * Restoring keeps the current document recoverable: a document edited
 * together restores as one undoable change everyone receives (body, tables,
 * styles, lists, page setup and comments); otherwise the saved file is
 * replaced exactly, after a recovery version of the current one is kept.
 */
import { el } from '../ui/dom.js';
import { confirmDialog, promptDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import * as P from '../lib/puter.js';
import { engineApi } from '../lib/engine-api.js';
import { listVersions, readVersionMeta, writeVersionMeta } from '../lib/versions.js';
import { sidePane, hint } from './review-ui.js';

const DAY = 86_400_000;
const dayLabel = (time, now = Date.now()) => {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (time >= start.getTime()) return '今天';
  if (time >= start.getTime() - DAY) return '昨天';
  return new Date(time).toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric', year: new Date(time).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
};
const timeLabel = time => new Date(time).toLocaleTimeString('zh-CN', { hour: 'numeric', minute: '2-digit' });

export function createVersionHistory({ editor, pkg, doc, error, author, live = () => null, restoreFile, compare, onChange = () => {}, onPreview = () => {} }) {
  let versions = [], preview = null, loading = null;
  const pane = sidePane({ title: '版本历史记录', label: '版本历史记录窗格', className: 'vh-pane', onOpen: () => load(), onClose: () => { closePreview(); editor()?.focus(); } });
  const list = el('div.vh-list', { role: 'list', 'aria-label': '已保存的版本' });
  const saveNow = el('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => saveVersion() }, '立即保存版本');
  const status = el('p.vh-status', { role: 'status', 'aria-live': 'polite' });
  pane.body.append(el('div.vh-actions', {}, saveNow), status, list, hint('版本将在编辑时自动保存：每编辑十分钟保存一次，并在手动保存时记录。最多保留最新的 30 个版本，命名版本将永久保留。'));

  /* ---- The read-only preview beside the document ---- */
  const previewHost = el('div.vh-preview-host', { 'aria-label': '版本页面' });
  const previewTitle = el('h2.vh-preview-title', {}, '版本');
  // The note is filled only while a version is shown, so a hidden pane never reads as the document's own "Read only" state.
  const previewNote = el('p.vh-preview-note');
  const previewNode = el('aside.vh-preview', { hidden: true, 'aria-label': '早期版本（只读）' },
    el('div.vh-preview-head', {}, el('div', {}, previewTitle, previewNote),
      el('div.vh-preview-actions', {},
        el('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => preview && compareWith(preview.version) }, '比较'),
        el('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => preview && restore(preview.version) }, '还原'),
        el('button.icon-btn', { type: 'button', 'aria-label': '关闭版本', title: '关闭', onclick: () => closePreview() }, '×'))),
    previewHost);
  previewNode.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closePreview(); } });

  // The document's first save, a rename or a copy gives it another file, with that file's history.
  const onPath = () => { if (pane.isOpen) load(); };
  doc.addEventListener?.('path', onPath);

  async function load() {
    status.textContent = '';
    if (!doc.path) { list.replaceChildren(el('p.rv-empty', {}, '文档保存到本地存储后将记录版本历史。')); saveNow.disabled = true; return; }
    saveNow.disabled = !!pkg()?.readOnly;
    list.replaceChildren(el('p.rv-status', {}, '正在加载版本…'));
    const request = loading = listVersions(doc.path, { uid: doc.uid }).then(async found => Promise.all(found.map(async v => ({ ...v, ...await readVersionMeta(v) }))));
    try {
      const found = await request;
      if (loading !== request) return;
      versions = found;
      render();
    } catch { if (loading === request) list.replaceChildren(el('p.rv-status', {}, '无法加载版本历史记录。')); }
  }

  function render() {
    if (!versions.length) { list.replaceChildren(el('p.rv-empty', {}, '暂无早期版本。')); return; }
    const groups = new Map();
    for (const v of versions) { const label = dayLabel(v.time); if (!groups.has(label)) groups.set(label, []); groups.get(label).push(v); }
    list.replaceChildren(...[...groups].map(([label, items]) => el('section.vh-day', {}, el('h3.vh-day-label', {}, label), ...items.map(item))));
  }
  function item(v) {
    const shown = preview?.version.path === v.path;
    return el(`div.vh-item${shown ? '.is-open' : ''}`, { role: 'listitem' },
      el('button.vh-item-main', { type: 'button', 'aria-label': `${v.label || timeLabel(v.time)}${v.author ? `，保存者: ${v.author}` : ''}。只读打开。`, onclick: () => open(v) },
        el('span.vh-item-title', {}, v.label || timeLabel(v.time)),
        el('span.vh-item-meta', {}, [v.label ? timeLabel(v.time) : null, v.author ? `保存者: ${v.author}` : null].filter(Boolean).join(' · ') || ' ')),
      el('div.vh-item-actions', {},
        el('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => compareWith(v) }, '比较'),
        el('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => nameVersion(v) }, v.label ? '重命名' : '命名'),
        el('button.btn.btn-ghost.btn-sm', { type: 'button', disabled: !!pkg()?.readOnly, onclick: () => restore(v) }, '还原')));
  }

  async function saveVersion() {
    saveNow.disabled = true;
    try {
      const label = await promptDialog({ title: '保存版本', label: '名称（可选）', placeholder: '例如：审阅草稿', confirmLabel: '保存版本' });
      if (label === null) return;
      const v = await doc.saveVersionNow({ author: author(), label: label.trim() });
      if (!v) throw new Error('无法保存版本。');
      toast(label.trim() ? `已保存“${label.trim()}”` : '版本已保存');
      await load();
    } catch (e) { error(e); }
    finally { saveNow.disabled = !doc.path || !!pkg()?.readOnly; }
  }

  async function nameVersion(v) {
    const label = await promptDialog({ title: v.label ? '重命名版本' : '命名版本', label: '名称', value: v.label || '', confirmLabel: '保存' });
    if (label === null) return;
    try { const meta = await writeVersionMeta(v, { author: v.author, label: label.trim() }); Object.assign(v, meta); render(); }
    catch (e) { error(e); }
  }

  const readBytes = async v => new Uint8Array(await (await P.readFile(v.path)).arrayBuffer());
  const versionName = v => v.label || `${dayLabel(v.time)} ${timeLabel(v.time)}`;

  async function open(v) {
    const api = engineApi(); if (!api) return;
    closePreview();
    previewTitle.textContent = versionName(v);
    previewNote.textContent = '只读';
    previewNode.hidden = false;
    previewHost.replaceChildren(el('p.rv-status', {}, '正在打开…'));
    const token = preview = { version: v, engine: null };
    onPreview(true);
    render(); onChange();
    try {
      const opened = await api.openCanvasDocument(await readBytes(v));
      if (preview !== token) { for (const image of opened.images.values()) image.close?.(); return; }
      const p = opened.pkg;
      previewHost.replaceChildren();
      token.engine = new api.CanvasEditor(previewHost, { paragraphs: p.paragraphs, pageSettings: p.pageSettings, numbering: p.numbering, styles: p.styles, tables: p.tables, pageStories: p.pageStories, comments: p.comments, assets: p.assets, drawingLayouts: p.drawingLayouts, images: opened.images, readOnly: true, inputLabel: `版本 ${versionName(v)}` });
      fit(token.engine);
    } catch (e) {
      if (preview === token) previewHost.replaceChildren(el('p.rv-status', {}, `无法打开此版本: ${e.message}`));
    }
  }
  function fit(engine) {
    const page = engine.layout?.pages?.[0] || engine.layout?.page;
    if (!page?.width) return;
    const width = Math.max(200, previewHost.clientWidth - 32);
    engine.setZoom(Math.min(1, width / page.width));
  }
  function closePreview() {
    if (!preview) return;
    preview.engine?.destroy();
    preview = null;
    previewNode.hidden = true;
    previewNote.textContent = '';
    previewHost.replaceChildren();
    onPreview(false);
    render(); onChange();
  }

  function compareWith(v) {
    compare?.({ name: `版本: ${versionName(v)}`, read: () => readBytes(v) });
  }

  async function restore(v) {
    const engine = editor(); if (!engine || pkg()?.readOnly) return;
    const shared = !!live();
    const ok = await confirmDialog({ title: '还原此版本？', danger: false, confirmLabel: '还原',
      message: shared ? `正在协同编辑的所有人文档都将返回到“${versionName(v)}”。您可以撤消此操作。` : `文档将返回到“${versionName(v)}”。当前版本将保存在历史记录中。` });
    if (!ok) return false;
    try {
      if (!shared) { closePreview(); pane.close({ quiet: true }); await restoreFile(v); return; }
      const api = engineApi();
      // Opened afresh even when it is the version shown: the preview's pictures close with it, and the restored
      // document needs its own decoded ones (a picture or drawing only the version has would otherwise not draw).
      const opened = await api.openCanvasDocument(await readBytes(v));
      const p = opened.pkg;
      if (p.readOnly) throw new Error('此版本使用了仅支持查看的功能，因此无法在多人共同编辑时还原。');
      // Its pictures, charts and notes are those of its own file: ones the document no longer has, or has changed,
      // would come back broken or as the document's current ones.
      if (api.unportableContent?.(p, pkg())) throw new Error('此版本包含当前文档不再具有的图片、图表或批注，因此无法在多人共同编辑时还原。建议与文档进行比较，然后复制所需内容。');
      engine.finishComposition();
      if (engine.session.path !== null) engine.editStory(null);
      let renames = new Map();
      // One undoable change: the version's body, tables, styles, lists, page setup and comments.
      engine.execute(() => {
        const model = engine.model;
        renames = api.adoptVersionAssets ? api.adoptVersionAssets(p, model.assets) : (Object.assign(model.assets, p.assets), new Map());
        const state = new (model.constructor)(p.paragraphs, p.pageSettings, p.numbering, p.styles, p.tables, model.assets, { comments: p.comments ?? model.comments, trackChanges: model.trackChanges });
        model.checkpoint?.();
        model.restore({ ...state.snapshot(), selection: { anchor: 0, focus: 0 } });
      });
      for (const [source, image] of opened.images || []) { const id = renames.get(source) || source; if (!engine.images.has(id)) engine.images.set(id, image); else image.close?.(); }
      engine.relayout(); engine.paint();
      // The toast's Undo takes back the restore only while it is this person's latest change: after another edit it
      // would undo that edit and keep the version. (A shared document's own steps are counted, not others'.)
      const history = engine.session.history, steps = history.length, step = history.at(-1);
      const latest = () => editor() === engine && engine.session.history.length === steps && engine.session.history.at(-1) === step;
      toast(`已还原“${versionName(v)}”`, { action: { label: '撤消', onClick: () => { if (latest()) engine.undo(); else toast('此后已产生其他更改。请先通过“撤消”逐步回退这些更改。', { icon: 'info' }); } } });
      closePreview();
      return true;
    } catch (e) { error(e); }
    return false;
  }

  return {
    pane, previewNode,
    open() { pane.open(); },
    toggle() { pane.toggle(); },
    /** Restore a version: through the room while the document is shared, else by replacing the file. */
    restore,
    get isOpen() { return pane.isOpen; },
    refresh() { if (preview?.engine) fit(preview.engine); },
    destroy() { doc.removeEventListener?.('path', onPath); closePreview(); pane.destroy(); },
  };
}
