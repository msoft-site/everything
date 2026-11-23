/**
 * View → New Window: a second browser window showing the same document. The window that opened it
 * sends the document over a BroadcastChannel when this one is ready and again after each change, so
 * this copy follows the edits there. It is read-only: editing happens in the original window, which
 * keeps the one save handler. This page needs no account and stores nothing.
 */
import './styles/index.css';
import { el } from './ui/dom.js';
import { loadEngine } from './lib/engine.js';

const id = location.hash.slice(1);
const status = el('span.mirror-status', { role: 'status', 'aria-live': 'polite' }, '正在等待文档…');
const title = el('strong.mirror-title', {}, '文档');
const zoom = el('select', { 'aria-label': '缩放' }, ...[0.5, 0.75, 1, 1.25, 1.5].map(n => el('option', { value: n, selected: n === 1 }, `${n * 100}%`)));
const host = el('div.canvas-host', { 'aria-label': '文档页面' });
const shell = el('main.canvas-workspace.ed-workspace.mirror-shell', {},
  el('header.mirror-bar', {}, title, el('span.mirror-note', {}, '副窗口 · 只读 · 原窗口中的编辑将实时显示在此处'), el('span.mirror-spacer'), status, el('label.mirror-zoom', {}, '缩放 ', zoom)),
  el('div.canvas-document-surface', {}, host));
const style = el('style', {}, `
  .mirror-shell { display: flex; flex-direction: column; height: 100dvh; }
  .mirror-bar { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 0 14px; border-bottom: 1px solid var(--ed-line, #e0e0e0); background: var(--ed-frame, #f3f3f3); font-size: 13px; flex-wrap: wrap; }
  .mirror-note { color: var(--ed-ink-3, #616161); }
  .mirror-spacer { flex: 1; }
  .mirror-status { color: var(--ed-ink-3, #616161); }
  .mirror-shell .canvas-document-surface { flex: 1; }
`);
document.head.append(style);
document.getElementById('app').replaceChildren(shell);

let editor = null, modules = null, version = 0;
zoom.addEventListener('change', () => editor?.setZoom(Number(zoom.value)));

async function show({ name, bytes }) {
  const mine = ++version;
  try { await render(mine, name, bytes); }
  // An update that a newer one has replaced says nothing about the document shown.
  catch (error) { if (mine === version) status.textContent = error?.message || '无法显示该文档。'; }
}

async function render(mine, name, bytes) {
  modules ||= await loadEngine();
  const { CanvasEditor, openCanvasDocument, loadCanvasFonts } = modules;
  const { pkg, images, measure } = await openCanvasDocument(new Blob([bytes]));
  await loadCanvasFonts();
  if (mine !== version) { for (const image of images.values()) image.close?.(); return; }
  // Keep the reader's place across updates.
  const top = host.scrollTop, left = host.scrollLeft;
  editor?.destroy();
  editor = new CanvasEditor(host, { paragraphs: pkg.paragraphs, pageSettings: pkg.pageSettings, numbering: pkg.numbering, styles: pkg.styles, tables: pkg.tables, pageStories: pkg.pageStories,
    comments: pkg.comments, assets: pkg.assets, drawingLayouts: pkg.drawingLayouts, images, measure, readOnly: true, inputLabel: '文档文本（只读）' });
  editor.setZoom(Number(zoom.value));
  host.scrollTop = top; host.scrollLeft = left;
  title.textContent = name || '文档';
  document.title = `${name || '文档'} — 副窗口`;
  status.textContent = `更新于 ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
}

if (!id || typeof BroadcastChannel === 'undefined') status.textContent = '请通过“视图 → 新建窗口”打开此窗口。';
else {
  const channel = new BroadcastChannel(`documents-window:${id}`);
  channel.onmessage = e => {
    const message = e.data || {};
    if (message.type === 'document') show(message);
    else if (message.type === 'error') status.textContent = message.message;
    else if (message.type === 'closed') status.textContent = '原窗口已关闭。此副本不再更新。';
  };
  channel.postMessage({ type: 'ready' });
  addEventListener('pagehide', () => channel.postMessage({ type: 'closed' }));
}
