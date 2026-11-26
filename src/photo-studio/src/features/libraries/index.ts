// Libraries: named collections of colors, gradients, patterns, text and
// layer styles, brushes and graphics, shared by every document and synced
// through Puter when signed in. Registration only; the panel, storage and
// capture code load on first use.
import type { Editor } from '../../editor';
import { registerCommand, registerPanel, type Command } from '../../app/registry';
import { lazy, lazyPanel } from '../../app/lazy';
import { formDialog } from '../../ui/dialog';
import { askChoice } from '../preferences/warnings';
import { linkReaders } from '../embedded/link-state';
import { ADD_SOURCES, canAdd } from './context';
import { hasLibraryLinks, ITEM_MIME, libState, loadViewState, saveViewState } from './state';
import { TYPE_SINGULAR } from './model';

const service = lazy(() => import('./service'));
// Loading the panel loads the service through this loader too, so commands
// see it (`service.loaded`) once the panel is shown.
const panel = lazy(async () => (await service(), import('./panel')));
const apply = lazy(() => import('./apply'));
const lib = () => service.loaded?.libraries();
const shownLibrary = () => lib()?.library(libState.libraryId);
const currentItem = () => lib()?.item(libState.itemId)?.item;

async function loaded() {
  const l = (await service()).libraries();
  await l.load();
  return l;
}
function refreshPanel(e: Editor) {
  panel.loaded?.bump();
  e.dock.update();
}
/** The library new items go to: the one shown, else the first, else a new one. */
async function targetLibrary(e: Editor) {
  const l = await loaded();
  const id = l.library(libState.libraryId)?.id ?? l.index.libraries[0]?.id;
  if (id) return id;
  const created = await l.createLibrary('My Library');
  libState.libraryId = created.id;
  saveViewState();
  refreshPanel(e);
  return created.id;
}
const shownItems = () => [...document.querySelectorAll<HTMLElement>('.libraries-panel .lib-item')];
/** After an item command (its menu and dialog are gone), put the keyboard
 * focus back on the item, or on the one that took its place, instead of
 * leaving it on the page. */
function keepItemFocus(at: number) {
  if (at < 0) return;
  requestAnimationFrame(() => {
    const a = document.activeElement;
    if (a && a !== document.body) return;
    const items = shownItems();
    (items.find((x) => x.dataset.item === libState.itemId) ?? items[Math.min(at, items.length - 1)])?.focus();
  });
}
const showPanel = (e: Editor) => {
  if (!e.dock.isVisible('libraries')) e.dock.show('libraries');
};

export function installLibraries(e: Editor) {
  loadViewState();
  registerPanel(
    lazyPanel(
      {
        id: 'libraries',
        title: '资源库',
        icon: 'libraries',
        location: 'strip',
        hidden: true,
        menu: () => [{ label: '添加到资源库', id: 'libraries.add', items: ADD_SOURCES.map(([src]) => `libraries.add-${src}`) }, '-', 'libraries.new', 'libraries.rename', 'libraries.duplicate', 'libraries.delete', '-', 'libraries.import', 'libraries.export', '-', 'libraries.sync', '-', 'libraries.view-grid', 'libraries.view-list', 'libraries.group'],
      },
      panel,
    ),
  );
  const cmd = (c: Omit<Command, 'recordable'>) => registerCommand({ recordable: false, ...c });
  // Directly in the Window menu (not under Panels).
  cmd({ id: 'window.panel.libraries', label: '资源库', checked: (e) => e.dock.isVisible('libraries'), run: (e) => e.dock.show('libraries', true) });
  cmd({
    id: 'libraries.new',
    label: '新建资源库…',
    description: '创建用于存放常用颜色、样式、画笔和图形的资源库',
    run: async (e) => {
      const l = await loaded();
      const v = await formDialog('新建资源库', [{ name: 'name', label: '名称', value: `资源库 ${l.index.libraries.length + 1}` }], '创建');
      if (!v?.name.trim()) return;
      const created = await l.createLibrary(v.name.trim());
      libState.libraryId = created.id;
      saveViewState();
      showPanel(e);
      refreshPanel(e);
    },
  });
  cmd({
    id: 'libraries.rename',
    label: '重命名资源库…',
    enabled: () => !!shownLibrary(),
    run: async (e) => {
      const l = shownLibrary();
      if (!l) return;
      const v = await formDialog('重命名资源库', [{ name: 'name', label: '名称', value: l.name }], '重命名');
      if (v?.name.trim() && v.name.trim() !== l.name) await lib()!.renameLibrary(l.id, v.name);
      refreshPanel(e);
    },
  });
  cmd({
    id: 'libraries.duplicate',
    label: '复制资源库',
    enabled: () => !!shownLibrary(),
    run: async (e) => {
      const copy = await lib()!.duplicateLibrary(libState.libraryId);
      if (copy) libState.libraryId = copy.id;
      saveViewState();
      refreshPanel(e);
    },
  });
  cmd({
    id: 'libraries.delete',
    label: '删除资源库…',
    enabled: () => !!shownLibrary(),
    run: async (e) => {
      const l = shownLibrary();
      if (!l) return;
      const ok = await askChoice('删除资源库', `确定删除“${l.name}”及其 ${l.items.length} 个项目吗？已置入的图形仍会保留在文档中。`, [['delete', '删除']]);
      if (ok !== 'delete') return;
      await lib()!.deleteLibrary(l.id);
      libState.libraryId = '';
      saveViewState();
      refreshPanel(e);
    },
  });
  cmd({
    id: 'libraries.export',
    label: '导出资源库…',
    description: '将资源库及其内容保存为单个文件以供共享或备份',
    enabled: () => !!shownLibrary(),
    run: async (e) => {
      const l = shownLibrary();
      if (!l) return;
      const { exportLibraryFile, LIBRARY_FILE_EXTENSION } = await import('./model');
      const { download } = await import('../../persistence/puter');
      const text = await exportLibraryFile(l, (h) => lib()!.readAsset(h));
      download(new Blob([text], { type: 'application/json' }), `${l.name.replace(/[\\/:*?"<>|]+/g, '_') || 'Library'}${LIBRARY_FILE_EXTENSION}`);
      e.message(`已导出 ${l.name}。`);
    },
  });
  cmd({
    id: 'libraries.import',
    label: '导入资源库…',
    description: '从资源库文件添加资源库',
    run: async (e) => {
      const { LIBRARY_FILE_EXTENSION, importLibraryFile, uniqueName } = await import('./model');
      const file = await new Promise<File | null>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = `${LIBRARY_FILE_EXTENSION},application/json`;
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.oncancel = () => resolve(null);
        input.click();
      });
      if (!file) return;
      if (file.size > 256 * 1024 * 1024) throw new Error('资源库文件大小超过 256 MB。');
      const { sha256Hex } = await import('../../model/provenance');
      const got = await importLibraryFile(await file.text(), sha256Hex);
      const l = await loaded();
      // Assets were checked against their hashes when the file was read.
      for (const blob of got.assets.values()) await l.addAsset(blob);
      got.library.name = uniqueName(got.library.name, l.index.libraries.map((x) => x.name));
      await l.apply({ op: 'create-library', library: got.library });
      libState.libraryId = got.library.id;
      saveViewState();
      showPanel(e);
      refreshPanel(e);
      e.message(`已导入 ${got.library.name}（包含 ${got.library.items.length} 个项目）${got.skipped ? `；已跳过 ${got.skipped} 个受损项目` : ''}。`);
    },
  });
  cmd({
    id: 'libraries.sync',
    label: '立即同步资源库',
    description: '同步资源库更改',
    run: async (e) => {
      const l = await loaded();
      void l.sync().then(() => e.message(l.status.message));
    },
  });
  const view = (id: string, label: string, v: 'grid' | 'list') =>
    cmd({
      id,
      label,
      checked: () => libState.view === v,
      run: (e) => {
        libState.view = v;
        saveViewState();
        refreshPanel(e);
      },
    });
  view('libraries.view-grid', '网格视图', 'grid');
  view('libraries.view-list', '列表视图', 'list');
  cmd({
    id: 'libraries.group',
    label: '按类型分组',
    checked: () => libState.grouped,
    run: (e) => {
      libState.grouped = !libState.grouped;
      saveViewState();
      refreshPanel(e);
    },
  });
  // "+" menu: add from the current context.
  for (const [src, label, type] of ADD_SOURCES)
    cmd({
      id: `libraries.add-${src}`,
      label: `添加${label}`,
      description: `将${label}添加到“资源库”面板中显示的资源库`,
      enabled: (e) => canAdd(e, src),
      run: async (e) => {
        const id = await targetLibrary(e);
        const item = await (await apply()).addFromContext(e, src, id);
        if (!item) return;
        libState.itemId = item.id;
        libState.itemType = type;
        showPanel(e);
        refreshPanel(e);
        e.message(`已将${TYPE_SINGULAR[type]}“${item.name}”添加到 ${lib()?.library(id)?.name ?? '资源库'}。`);
      },
    });
  // Item commands act on the item last clicked in the panel.
  const itemCmd = (id: string, label: string, run: (e: Editor) => Promise<unknown>, when: (t: string) => boolean = () => true, description?: string) =>
    cmd({
      id,
      label,
      description,
      enabled: () => !!currentItem() && when(currentItem()!.type),
      run: async (e) => {
        const at = shownItems().findIndex((x) => x.dataset.item === libState.itemId);
        await run(e);
        refreshPanel(e);
        keepItemFocus(at);
      },
    });
  itemCmd('libraries.item-apply', '应用', async (e) => (await apply()).applyItem(e, currentItem()!), (t) => t !== 'graphic', '使用该项：设置颜色、应用样式、将画笔或图案设为当前');
  itemCmd('libraries.item-place', '置入', async (e) => (await apply()).placeGraphic(e, currentItem()!), (t) => t === 'graphic', '将图形作为嵌入对象置入');
  itemCmd('libraries.item-place-linked', '置入链接', async (e) => (await apply()).placeGraphic(e, currentItem()!, { linked: true }), (t) => t === 'graphic', '置入图形，以便在资源库项目更新时同步更新');
  itemCmd('libraries.item-redefine', '根据当前内容重新定义', async (e) => {
    const item = currentItem()!;
    const m = await apply();
    if (!(await m.redefineItem(e, item))) return;
    // Linked placements in this document follow as part of this command.
    const n = e.hasDocument ? await m.updateLibraryLinks(e) : 0;
    if (!n) e.message(`已更新 ${item.name}。`);
  }, () => true, '用当前颜色、样式、画笔、选定图层或选区替换该项');
  itemCmd('libraries.item-rename', '重命名…', async () => {
    const item = currentItem()!;
    const v = await formDialog(`重命名${TYPE_SINGULAR[item.type]}`, [{ name: 'name', label: '名称', value: item.name }], '确定');
    if (v?.name.trim() && v.name.trim() !== item.name) await lib()!.renameItem(item.id, v.name);
  });
  itemCmd('libraries.item-duplicate', '复制', async () => {
    const copy = await lib()!.duplicateItem(libState.itemId);
    if (copy) libState.itemId = copy.id;
  });
  itemCmd('libraries.item-delete', '删除…', async () => {
    const item = currentItem()!;
    const ok = await askChoice(`删除${TYPE_SINGULAR[item.type]}`, `确定从资源库中删除“${item.name}”吗？已链接的置入对象将保留当前内容。`, [['delete', '删除']]);
    if (ok === 'delete') await lib()!.deleteItem(item.id);
  });

  bindCanvasDrop(e);
  watchLinkedPlacements(e);
  linkReaders.library = async (c) => (await apply()).readLibraryLink(c);
}

// Dropping an item on the canvas uses it there: graphics are placed at the
// drop point, other items apply as on a click.
function bindCanvasDrop(e: Editor) {
  const viewport = e.root.querySelector<HTMLElement>('#viewport');
  if (!viewport) return;
  viewport.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer?.types.includes(ITEM_MIME) || !e.hasDocument) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
  });
  viewport.addEventListener('drop', (ev) => {
    const id = ev.dataTransfer?.getData(ITEM_MIME);
    if (!id) return;
    ev.preventDefault();
    const at = e.docPoint(ev.clientX, ev.clientY);
    void e.run(async () => {
      const item = (await loaded()).item(id)?.item;
      if (item) await (await apply()).applyItem(e, item, { at });
    });
  });
}

// Placements linked to library items follow the item: once a document with
// such placements is shown, library changes update them (one history step).
function watchLinkedPlacements(e: Editor) {
  let started = false;
  e.onUpdate((e) => {
    if (started || !hasLibraryLinks(e.doc)) return;
    started = true;
    void Promise.all([loaded(), apply()]).then(([l, m]) => {
      let timer = 0;
      const check = () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (!hasLibraryLinks(e.doc) || !m.staleLibraryLinks(e)) return;
          if (e.busy || e.toolBusy) return check();
          void e.run(async () => void (await m.updateLibraryLinks(e)));
        }, 400);
      };
      l.subscribe(check);
      let shown = e.session;
      e.onUpdate((e) => {
        if (e.session === shown) return;
        shown = e.session;
        check();
      });
      check();
    });
  });
}
