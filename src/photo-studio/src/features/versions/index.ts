// Version History: automatic versions of each document on save and at the
// autosave interval, named versions saved on demand, all kept in this
// browser (IndexedDB). Versions can be previewed on the canvas, restored as a
// new history step, opened as a copy or deleted. Puter.js has no file
// version API, so local files list the versions kept here too.
import './versions.css';
import type { Editor } from '../../editor';
import type { DocumentSession } from '../../app/session';
import { registerCommand, registerPanel, type Panel } from '../../app/registry';
import { svg } from '../../app/icons';
import { escapeXML } from '../../model/assets';
import { replaceDocument, type PhotoDocument } from '../../model/document';
import { deserialize, serialize } from '../../model/serialization';
import { formDialog } from '../../ui/dialog';
import { relativeTime, VersionStore, versionFileKey, type VersionEntry, type VersionKind } from '../../persistence/versions';
import { openedFiles } from '../../app/app-events';
import { documentThumbnail } from './thumbs';
import { installRecovery, recoveryTick } from './recovery';
import { warnOnce } from '../preferences/warnings';

const store = new VersionStore();
const kindLabel: Record<VersionKind, string> = { auto: '自动保存', save: '已保存', named: '命名版本' };
// Per panel: the document listed and its versions.
let listed: { docId: string; file?: string; list: VersionEntry[]; urls: string[] } | undefined;
/** The file a session's versions are also found by. */
const fileOf = (s: DocumentSession) => versionFileKey(s.storage.path, openedFiles.get(s));
let revision = 0;
let previewing: { id: string; name: string; docId: string } | undefined;

/** Store a version of a session's current document. */
export async function addVersion(e: Editor, s: DocumentSession, name: string, kind: VersionKind, project?: Blob) {
  // Save pickers release the editor: their project can predate the current edits.
  const doc = project ? s.saved ?? s.doc : s.doc;
  const extrasRevision = project ? s.savedExtrasRevision : s.extrasRevision;
  const blob = project ?? (await serialize(doc, s.assets));
  const thumb = await documentThumbnail(e, s, 192, doc).catch(() => undefined);
  const file = fileOf(s);
  const v = await store.add({ docId: doc.id, ...(file ? { file } : {}), docName: doc.name, name, kind, width: doc.width, height: doc.height, thumb }, blob, e.preferences.versionsPerDocument);
  lastVersioned.set(s, { doc, extrasRevision });
  revision++;
  refresh(e);
  return v;
}
// The document state each session last stored as a version.
const lastVersioned = new WeakMap<DocumentSession, { doc: PhotoDocument; extrasRevision: number }>();
/** Autosave interval: a version of every document changed since its last one. */
export async function autosaveVersions(e: Editor) {
  if (!e.preferences.versionsOnSave) return;
  for (const s of e.sessions) {
    const previous = lastVersioned.get(s);
    if (!s.hasDocument || !s.dirty || (previous?.doc === s.doc && previous.extrasRevision === s.extrasRevision) || s.saveHandler) continue;
    // One document that cannot be stored does not stop the others.
    await addVersion(e, s, '自动保存', 'auto').catch((error) => console.error(error));
  }
}

function refresh(e: Editor) {
  for (const u of listed?.urls ?? []) if (u) URL.revokeObjectURL(u);
  listed = undefined;
  e.dock?.update();
}

async function loadDocument(id: string, into?: Editor['assets']) {
  const blob = await store.project(id);
  if (!blob) throw new Error('此版本已不在本浏览器中存储。');
  return deserialize(blob, into);
}
async function preview(e: Editor, v: VersionEntry) {
  if (previewing?.id === v.id) return exitPreview(e);
  const { document } = await loadDocument(v.id, e.assets);
  e.modal?.cancel();
  previewing = { id: v.id, name: v.name, docId: e.doc.id };
  // Any other edit or command ends the preview without changing the document.
  e.modal = { document: { ...document, name: e.doc.name }, apply: () => exitPreview(e), cancel: () => exitPreview(e) };
  e.message(`正在预览“${v.name}” (${relativeTime(v.time)})。可从版本历史记录中恢复，或按 Esc 退出预览。`);
  e.fit();
  e.update();
}
function exitPreview(e: Editor) {
  if (!previewing) return;
  previewing = undefined;
  e.modal = undefined;
  e.update();
}
async function restore(e: Editor, v: VersionEntry) {
  const { document } = await loadDocument(v.id, e.assets);
  exitPreview(e);
  e.command(`恢复版本“${v.name}”`, (d) => replaceDocument(d, document, { id: d.id, name: d.name }));
  e.fit();
  e.message(`已恢复“${v.name}”。撤销可返回之前的状态。`);
}
async function openCopy(e: Editor, v: VersionEntry) {
  const loaded = await loadDocument(v.id);
  exitPreview(e);
  const s = e.sessionForOpen();
  s.assets = loaded.assets;
  s.history.reset({ ...loaded.document, id: crypto.randomUUID(), name: `${loaded.document.name} (${v.name})` });
  s.hasDocument = true;
  e.session = s;
  e.fit();
  e.update();
}
async function remove(e: Editor, v: VersionEntry) {
  if (!(await warnOnce(e, 'delete-version', '删除版本', `确定要删除 ${new Date(v.time).toLocaleString()} 的“${v.name}”吗？此操作无法撤销。`, '删除'))) return;
  if (previewing?.id === v.id) exitPreview(e);
  await store.remove(v.id);
  revision++;
  refresh(e);
}
async function saveNamedVersion(e: Editor) {
  const v = await formDialog('保存版本', [{ name: 'name', label: '版本名称', value: `版本 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` }], '保存版本', '当前文档状态的副本，保存在本浏览器中。');
  if (!v?.name.trim()) return;
  await addVersion(e, e.session, v.name.trim().slice(0, 80), 'named');
  e.dock.show('versions');
  e.message(`已保存版本“${v.name.trim()}”。`);
}

const sizeText = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
function rowHTML(v: VersionEntry, url: string | undefined) {
  const active = previewing?.id === v.id;
  return `<div class="version-row ${active ? 'previewing' : ''}" data-version="${v.id}" role="listitem">
<button type="button" class="version-thumb" data-version-act="preview" title="${active ? '停止预览' : '在画布上预览'}" aria-label="${active ? '停止预览' : '预览'} ${escapeXML(v.name)}">${url ? `<img src="${url}" alt="">` : svg('image', 18)}</button>
<div class="version-meta"><strong>${escapeXML(v.name)}</strong><small title="${escapeXML(new Date(v.time).toLocaleString())}">${relativeTime(v.time)} · ${kindLabel[v.kind]} · ${v.width} × ${v.height} · ${sizeText(v.size)}</small></div>
<div class="version-actions"><button type="button" class="icon-button" data-version-act="restore" title="作为新历史记录步骤恢复" aria-label="恢复 ${escapeXML(v.name)}">${svg('rotate-ccw', 14)}</button><button type="button" class="icon-button" data-version-act="copy" title="作为副本打开" aria-label="作为副本打开 ${escapeXML(v.name)}">${svg('copy-plus', 14)}</button><button type="button" class="icon-button" data-version-act="delete" title="删除版本" aria-label="删除 ${escapeXML(v.name)}">${svg('trash-2', 14)}</button></div></div>`;
}

const versionsPanel: Panel = {
  id: 'versions',
  title: '版本历史记录',
  icon: 'file-clock',
  location: 'strip',
  mount: (e, el) => {
    el.classList.add('versions-panel');
    el.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest('[data-versions-save]')) return void e.runCommand('file.save-version');
      if (t.closest('[data-versions-exit]')) return exitPreview(e);
      const act = t.closest<HTMLElement>('[data-version-act]')?.dataset.versionAct;
      const id = t.closest<HTMLElement>('[data-version]')?.dataset.version;
      const v = listed?.list.find((x) => x.id === id);
      if (!act || !v) return;
      const run = act === 'preview' ? preview : act === 'restore' ? restore : act === 'copy' ? openCopy : remove;
      void e.run(() => run(e, v));
    });
  },
  update: (e, el) => {
    const docId = e.doc.id;
    const file = fileOf(e.session);
    const key = `${docId}:${file ?? ''}:${revision}:${previewing?.id ?? ''}:${e.hasDocument}`;
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    const draw = () => {
      if (el.dataset.key !== key || !listed) return;
      const head = `<div class="versions-head"><button type="button" class="secondary" data-versions-save ${e.hasDocument ? '' : 'disabled'}>${svg('bookmark', 14)}保存版本…</button><span class="muted">保留在本浏览器本地</span></div>`;
      const banner = previewing ? `<div class="versions-banner">${svg('eye', 14)}<span>正在预览“${escapeXML(previewing.name)}”</span><button type="button" data-versions-exit>退出预览</button></div>` : '';
      const body = !e.hasDocument
        ? '<p class="versions-empty">打开文档以查看其版本历史。</p>'
        : listed.list.length
          ? `<div class="versions-list" role="list">${listed.list.map((v, i) => rowHTML(v, listed!.urls[i])).join('')}</div>`
          : '<p class="versions-empty">暂无版本记录。在您保存文档、自动保存周期到达或点击“保存版本”时将记录版本。</p>';
      el.innerHTML = head + banner + body;
    };
    if (listed?.docId === docId && listed.file === file) return draw();
    void store.list(docId, file).then((list) => {
      // A tab switch or refresh can supersede this request before it resolves.
      if (el.dataset.key !== key) return;
      for (const u of listed?.urls ?? []) URL.revokeObjectURL(u);
      listed = { docId, file, list, urls: list.map((v) => (v.thumb ? URL.createObjectURL(v.thumb) : '')) };
      draw();
    });
  },
  menu: () => ['file.save-version', '-', 'file.version-history'],
};

export function installVersions(e: Editor) {
  registerPanel(versionsPanel);
  registerCommand(
    {
      id: 'file.version-history',
      label: '版本历史记录',
      recordable: false,
      description: '本浏览器保留的文档版本：预览、恢复或作为副本打开',
      run: (e) => e.dock.show('versions'),
    },
    {
      id: 'file.save-version',
      label: '保存版本…',
      recordable: false,
      enabled: (e) => e.hasDocument,
      description: '保留当前文档状态的命名副本',
      run: (e) => saveNamedVersion(e),
    },
  );
  // A version on every save.
  e.saveHooks.push((s, project) => {
    if (!e.preferences.versionsOnSave) return;
    // Versions are native projects: a save that wrote a PSD gets one of what it saved.
    const saved = s.saved ?? s.doc;
    void (async () => addVersion(e, s, '已保存', 'save', project ?? (await serialize(saved, s.assets))))().catch((err) => console.error(err));
  });
  e.closeHooks.push((s) => {
    if (s === e.session) exitPreview(e);
  });
  // Previews end when another document becomes active, or with Esc.
  e.onUpdate((e) => {
    if (previewing && (e.doc.id !== previewing.docId || !e.modal)) exitPreview(e);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && previewing && !(ev.target as HTMLElement).closest('dialog')) {
      ev.preventDefault();
      exitPreview(e);
    }
  });
  const tick = async () => {
    await recoveryTick(e);
    await autosaveVersions(e);
  };
  installRecovery(e, tick);
  // Runs the autosave pass at once (used by tests and automation).
  registerCommand({ id: 'file.autosave-now', label: '立即自动保存', hidden: true, recordable: false, run: tick });
}
