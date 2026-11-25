/**
 * Home: the list of documents in the app folder (and, inside the Puter
 * desktop, those saved elsewhere from here: made.js), with new / import / open
 * actions. Rows open the editor; a per-row menu renames, duplicates,
 * downloads, or deletes. The list lives in the local storage, so without a
 * session the screen offers the sign-in instead of the list.
 */

import { el, clear, formatBytes, relativeTime } from '../ui/dom.js';
import { icon, iconEl } from '../ui/icons.js';
import { openMenu, clickClosedMenu, menuAnchor, closeMenu } from '../ui/menu.js';
import { confirmDialog, promptDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { accountControls } from '../ui/appmenu.js';
import { openShortcuts } from '../ui/shortcuts.js';
import { session } from '../lib/session.js';
import * as P from '../lib/puter.js';
import { TEMPLATES } from '../lib/templates.js';
import { deleteVersions, renameVersions } from '../lib/versions.js';
import { movePublication, unpublishAt } from '../lib/publish.js';
import { moveGoal, rememberGoal } from '../lib/goal.js';
import { movePosition, forgetPosition } from '../lib/position.js';
import { listCustomTemplates, customTemplateItems, deleteTemplate } from '../lib/customtemplates.js';
import { isStarred, toggleStar, moveStar, forgetStar, pruneStars, starredFirst, starredPaths } from '../lib/starred.js';
import { openModal } from '../ui/modal.js';
import { HANWORD_IMPORTABLE } from '../lib/importers.js';
import { importFiles, nothingImportable } from '../lib/importfiles.js';
import { documentPathKey } from '../lib/document-paths.js';
import { endRoom, forgetRoom, moveRoom } from '../collab/room-memory.js';
import { madeFiles, forgetMade, withMade, madeLocation, inAppFolder } from '../lib/made.js';

export const SORTS = [
  { id: 'modified', label: '最近修改' },
  { id: 'name', label: '名称' },
  { id: 'size', label: '大小' },
];
/** Lists longer than this filter after a pause in the typing rather than on every keystroke. */
const SEARCH_AT_ONCE = 400;
const SEARCH_PAUSE_MS = 120;
const SORT_KEY = 'documents:sort';
const dirOf = (path) => path.slice(0, path.lastIndexOf('/') + 1);

/** Files ordered by the chosen key: newest, A to Z, or largest first. Names compare as shown, without their extension. */
export function sortFiles(files, sort) {
  const list = [...files];
  const byName = (a, b) => P.stripExtension(a.name).localeCompare(P.stripExtension(b.name), undefined, { numeric: true, sensitivity: 'base' }) || a.name.localeCompare(b.name);
  if (sort === 'name') return list.sort(byName);
  if (sort === 'size') return list.sort((a, b) => (b.size || 0) - (a.size || 0) || a.name.localeCompare(b.name));
  return list.sort((a, b) => (b.modified || 0) - (a.modified || 0) || a.name.localeCompare(b.name));
}

export function rememberedSort() {
  try { const v = localStorage.getItem(SORT_KEY); return SORTS.some((s) => s.id === v) ? v : 'modified'; } catch { return 'modified'; }
}

export function homeView({ openPath, newDoc, newFromTemplate, importFile }) {
  let files = [];
  let query = '';
  let sort = rememberedSort();
  let loading = true;
  let error = null;
  let destroyed = false;
  let loadRequest = 0;

  const fileInput = el('input', {
    type: 'file', multiple: true, accept: P.IMPORT_ACCEPT, hidden: true, 'aria-hidden': 'true', tabindex: -1,
    onchange: () => { importMany(fileInput.files, { picked: true }); fileInput.value = ''; },
  });

  /**
   * One file opens in the editor (and is saved from there); several are
   * written straight into the folder so nothing is lost while one is open.
   */
  const importMany = (files, { picked = false } = {}) => importFiles(files, { openFile: importFile, stillHere: () => !destroyed, onImported: load, nothingMessage: nothingImportable(files, { picked }) });
  const pickDevice = () => fileInput.click();

  // A short list filters as the user types; a long one (thousands of rows to rebuild) waits for a pause in the typing.
  let searchTimer = 0;
  const search = el('input.input.home-search', {
    type: 'search', placeholder: '搜索文档', 'aria-label': '搜索文档',
    oninput: () => {
      query = search.value.trim().toLowerCase();
      clearTimeout(searchTimer); searchTimer = 0;
      if (files.length <= SEARCH_AT_ONCE) renderList();
      else searchTimer = setTimeout(() => { searchTimer = 0; if (!destroyed) renderList(); }, SEARCH_PAUSE_MS);
    },
  });

  const list = el('div.file-list', { role: 'region', 'aria-label': '文档列表' });
  // A name cut short by a narrow list shows in full under the pointer; one that fits needs no tooltip repeating it.
  // (A document saved elsewhere always has one, saying where.)
  list.addEventListener('pointerover', (e) => {
    const main = e.target.closest?.('.file-main');
    const name = main?.querySelector('.file-name');
    if (!name || main.dataset.where) return;
    if (name.scrollWidth > name.clientWidth + 1) main.title = name.textContent;
    else main.removeAttribute('title');
  });
  // One live region, on the page from the start, carries what the list is doing: loading, failed, or filtered down to
  // so many documents. A region that arrives already filled is missed by many screen readers; changes to it are read.
  const listStatus = el('span.visually-hidden', { role: 'status' });

  const sortBtn = el('button.btn.btn-ghost.btn-sm.sort-btn', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': '排序文档', onclick: (e) => openSortMenu(e.currentTarget) });
  const renderSortBtn = () => {
    const label = SORTS.find((s) => s.id === sort)?.label || '排序';
    sortBtn.replaceChildren(el('span', { html: icon('sort', 15, 2) }), el('span.sort-label', {}, label));
    // The visible text is the current order; the name says what the button does with it.
    sortBtn.setAttribute('aria-label', `排序文档: ${label}`);
  };
  renderSortBtn();

  function openSortMenu(anchor) {
    openMenu({
      anchor, align: 'end', label: '排序方式', minWidth: 190,
      items: [{ header: '排序方式' }, ...SORTS.map((s) => ({ label: s.label, radio: true, checked: sort === s.id, onSelect: () => setSort(s.id) }))],
    });
  }

  function setSort(next) {
    if (next === sort) return;
    sort = next;
    try { localStorage.setItem(SORT_KEY, sort); } catch { /* storage unavailable */ }
    renderSortBtn();
    renderList();
  }

  const account = accountControls();

  // Sorting and searching work on the listed documents: signed out, there is no list for them to work on.
  const listTools = el('div.home-list-tools', {}, sortBtn, search);

  const root = el('div.home.view', {},
    fileInput,
    el('header.home-head', {},
      el('h1.brand', {}, el('img.brand-mark', { src: `${import.meta.env.BASE_URL}icons/icon-64.png`, width: 30, height: 30, alt: '' }), el('span', {}, '文档')),
      el('div.grow'),
      ...account.nodes),
    el('main.home-main', {},
      el('div.home-actions', {},
        el('button.btn.btn-primary.btn-lg', { type: 'button', html: icon('plus', 18, 2.2), onclick: newDoc }, el('span', {}, '新建文档')),
        el('button.btn.btn-outline.btn-lg', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: icon('gridView', 18), onclick: (e) => openTemplateMenu(e.currentTarget) }, el('span', {}, '模板')),
        el('button.btn.btn-outline.btn-lg', { type: 'button', html: icon('upload', 18), onclick: pickDevice, title: '导入 DOCX、Hanword (.hwp, .hwpx)、Markdown、HTML 或文本文件' }, el('span', {}, '导入')),
        P.canPickFiles() && el('button.btn.btn-outline.btn-lg', { type: 'button', html: icon('folderOpen', 18), onclick: openFromPuter }, el('span', {}, '从本地打开'))),
      el('div.home-list-head', {},
        el('h2.home-h2', {}, '您的文档'),
        listTools),
      list, listStatus),
    // Inside the Puter desktop a new document is saved where the user chooses; the list shows those with the app folder's own.
    el('footer.home-foot', {}, ...(P.asksWhereToSave()
      ? ['在此列出：应用自带的 ', el('code', {}, `${P.FOLDER}/`), ' 文件夹以及从此设备保存在云端其他位置的文档。新建文档保存时会询问存储位置。']
      : ['作为 .docx 文件保存在您的云端 ', el('code', {}, `${P.FOLDER}/`)])));

  /* Drag and drop anywhere on the home screen imports documents. */
  let dragDepth = 0;
  const dropHint = el('div.drop-hint', { 'aria-hidden': 'true' }, el('div.drop-hint-card', {}, el('span', { html: icon('upload', 26) }), el('span', {}, '拖放 DOCX、Hanword、Markdown、HTML 或文本文件即可导入')));
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  root.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth += 1; root.classList.add('dragging'); });
  root.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  root.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) root.classList.remove('dragging'); });
  root.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    root.classList.remove('dragging');
    importMany(e.dataTransfer.files);
  });
  root.append(dropHint);

  let templateRequest = 0;
  async function openTemplateMenu(anchor) {
    // A click on the button while its menu is open closes it; the templates are listed only for an opening click.
    if (clickClosedMenu(anchor)) return;
    const request = ++templateRequest;
    const builtIn = TEMPLATES.map((t) => ({ label: t.name, icon: t.icon, hint: t.description, onSelect: () => newFromTemplate?.(t.id) }));
    // The menu opens at once with the built-in templates; the user's own are a cloud read that fills in below them.
    const pending = openMenu({ anchor, label: '模板', minWidth: 260, items: [{ header: '基于模板新建' }, ...builtIn, { separator: true }, { note: '正在加载您的模板…' }] });
    pending.menu?.setAttribute('aria-busy', 'true');
    let mine = [], failed = false;
    try { mine = await listCustomTemplates(); } catch (e) { console.error(e); failed = true; }
    // By the time the listing returns, the user may have closed the menu, pressed the button again, opened
    // another menu or a dialog (which closes this menu): none of those may be covered by the full menu.
    if (destroyed || request !== templateRequest || !pending.menu?.isConnected) return;
    if (menuAnchor() && menuAnchor() !== anchor) return;
    // A dialog opened meanwhile has the keyboard; the menu neither covers it nor stays under it.
    if (document.querySelector('.modal-root:not(.closing)')) { pending.close(); return; }
    // The keyboard may have moved down the built-in templates meanwhile: the rebuilt menu keeps its place.
    const focusedLabel = pending.menu.contains(document.activeElement) ? document.activeElement.querySelector?.('.menu-label')?.firstChild?.textContent : null;
    const full = openMenu({
      anchor, label: '模板', minWidth: 260, focusFirst: !focusedLabel,
      items: [
        { header: '基于模板新建' },
        ...builtIn,
        ...customTemplateItems(mine, { onPick: (id) => newFromTemplate?.(id), onManage: () => manageTemplates(mine) }),
        (failed || !mine.length) && { separator: true },
        failed && { note: '无法加载您的模板。请检查网络连接并重试。' },
        !failed && !mine.length && { note: '可从任何打开文档的“文件”菜单中将其另存为模板' },
      ],
    });
    if (focusedLabel && full.menu) {
      const items = [...full.menu.querySelectorAll('.menu-item')];
      (items.find((item) => item.querySelector('.menu-label')?.firstChild?.textContent === focusedLabel) || items[0])?.focus({ preventScroll: true });
    }
  }

  /** The templates of your own, each with a delete button. */
  function manageTemplates(templates) {
    const pending = new Set();
    const list = el('div.version-list', { role: 'list', 'aria-label': '我的模板' });
    const modal = openModal({ title: '我的模板', content: el('div', {}, el('p.modal-text', {}, `保存在云端驱动器的 ${P.FOLDER}/Templates 中。打开文档并在“文件”菜单中选择“另存为模板”即可添加。`), list) });
    const render = (items) => {
      list.replaceChildren(...(items.length ? items.map((t) => el('div.file-row', { role: 'listitem' },
        el('span.file-main', {}, el('span.file-icon', { html: icon('brand', 20, 1.7) }), el('span.file-text', {}, el('span.file-name', {}, t.name), el('span.file-meta', {}, relativeTime(t.modified)))),
        el('button.btn.btn-ghost.btn-sm', { type: 'button', disabled: pending.has(t.path), 'aria-label': `删除模板 ${t.name}`, onclick: async (e) => {
          if (pending.has(t.path)) return;
          pending.add(t.path);
          const button = e.currentTarget;
          const ok = await confirmDialog({ title: '删除模板？', message: `将从您的模板中移除“${t.name}”。基于此模板创建的文档不受影响。`, confirmLabel: '删除' });
          if (!ok) { pending.delete(t.path); return; }
          button.disabled = true;
          button.textContent = '正在删除…';
          try {
            await deleteTemplate(t.path);
            // Remove only this completed row. Rebuilding from the handler's
            // original list would resurrect another concurrently deleted row.
            const row = button.closest('.file-row');
            const neighbor = row.nextElementSibling || row.previousElementSibling;
            // The keyboard is on the row's button, on nothing, or still in the closing confirmation whose opener is about to go.
            const active = document.activeElement;
            const hadFocus = row.contains(active) || active === document.body || !!active?.closest('.modal-root.closing');
            row.remove();
            if (!list.childElementCount) render([]);
            // The pressed button is gone with its row: the keyboard moves to the next template, or to the dialog's Close.
            if (hadFocus) (neighbor?.querySelector('button') || modal.panel.querySelector('[aria-label="关闭"], [aria-label="Close"]'))?.focus({ preventScroll: true });
            toast('已删除模板', { icon: 'trash' });
          } catch (e) { toast(e?.message || '无法删除模板', { icon: 'alert' }); }
          finally { pending.delete(t.path); button.disabled = false; button.textContent = '删除'; }
        } }, pending.has(t.path) ? '正在删除…' : '删除'))) : [el('div.list-state', {}, el('span', {}, '暂无自定义模板。'))]));
    };
    render(templates);
    return modal;
  }

  async function openFromPuter() {
    if (session.signedOut && (!await session.signIn() || destroyed)) return;
    const picked = await P.pickFile();
    if (!destroyed && picked) openPath(picked.path);
  }

  async function load() {
    if (destroyed) return;
    const request = ++loadRequest;
    loading = true;
    error = null;
    if (session.signedOut) {
      // Nothing to list without a session; the list area offers the sign-in.
      files = [];
      loading = false;
      renderList();
      return;
    }
    renderList();
    try {
      // With the app folder's files, the documents Puter's Save dialog put elsewhere on the drive.
      const [folder, made] = await Promise.all([P.listFiles(), madeFiles().catch(() => Object.assign([], { unreachable: [] }))]);
      if (destroyed || request !== loadRequest) return;
      files = withMade(folder, made);
      // A document whose folder could not be read just now keeps its star.
      pruneStars([...files, ...made.unreachable.map((path) => ({ path }))]);
    } catch (e) {
      if (destroyed || request !== loadRequest) return;
      console.error(e);
      error = navigator.onLine ? '无法从云端加载您的文件。' : '您处于脱机状态。连接网络以查看文件。';
    }
    loading = false;
    renderList();
  }

  /** The row's actions, under the menu button or, from a right-click, at the pointer. */
  function fileMenu(file, anchor, point = null) {
    openMenu({
      anchor, ...(point || {}), align: 'end', label: `${file.name} 选项`,
      items: [
        { label: '打开', icon: 'brand', onSelect: () => openPath(file.path) },
        { label: isStarred(file.path) ? '取消星标' : '添加星标', icon: 'star', onSelect: () => star(file) },
        { label: '重命名', icon: 'pencil', onSelect: () => rename(file) },
        { label: '创建副本', icon: 'duplicate', onSelect: () => duplicate(file) },
        { label: '下载', icon: 'download', onSelect: () => download(file) },
        { separator: true },
        { label: '删除', icon: 'trash', danger: true, onSelect: () => remove(file) },
      ],
    });
  }

  async function rename(file) {
    if (destroyed) return;
    const ext = file.name.slice(file.name.lastIndexOf('.'));
    // Typing the extension along with the name does not give the file a second one.
    const stem = (value) => { const clean = P.sanitizeName(value); return ext && clean.toLowerCase().endsWith(ext.toLowerCase()) ? clean.slice(0, -ext.length).trim() : clean; };
    let renamed = false;
    const name = await promptDialog({
      title: '重命名', label: '名称', value: P.stripExtension(file.name), confirmLabel: '重命名',
      validate: (v) => {
        const clean = stem(v);
        // Dots alone name no file: "..docx" would show as "." and lose its version history.
        if (!clean || /^\.+$/.test(clean)) return '请输入名称';
        // Only a file in the same folder takes the name: the list holds documents saved elsewhere on the drive too.
        if (files.some((f) => f.name.toLowerCase() === `${clean}${ext}`.toLowerCase() && f.path !== file.path && dirOf(f.path) === dirOf(file.path))) return '已存在同名文件';
        return null;
      },
      pendingLabel: '正在重命名…', prepare: async (name, { signal }) => {
        await Promise.resolve();
        if (signal.aborted || destroyed) return;
        const newName = `${stem(name)}${ext}`;
        // Confirming the current name is not a rename; the file is left alone.
        if (newName === file.name) return;
        const target = `${file.path.slice(0, file.path.lastIndexOf('/') + 1)}${newName}`;
        try { await P.renameFile(file.path, newName); }
        catch (cause) { throw new Error(cause?.message || '无法重命名', { cause }); }
        renamed = true;
        keepFocus = { path: target, control: 'file-menu-btn' };
        // The file already has its new path. Transfer local state now so a
        // listing during the history move cannot prune its old-path star.
        // Listings begun before the rename no longer describe that state.
        loadRequest += 1;
        moveStar(file.path, target);
        forgetMade(file.path, target);
        moveGoal(file.path, target);
        movePosition(file.path, target);
        await moveRoom(file.path, target);
        await renameVersions(file.path, target);
        // Best effort, like the version history: a published page follows the file.
        movePublication(file.path, target).catch((e) => console.warn('[documents] the published page could not follow the rename', e));
        // An accepted rename still needs its metadata and list updated if
        // the prompt was cancelled while the request was in flight.
        load();
      },
    });
    if (name != null && renamed && !destroyed) toast('已重命名');
  }

  async function duplicate(file) {
    try {
      const blob = await P.readFile(file.path);
      const stem = P.stripExtension(file.name);
      const ext = file.name.slice(file.name.lastIndexOf('.'));
      // The copy goes in the app folder: only names there are taken.
      const names = new Set(files.filter((f) => inAppFolder(f.path)).map((f) => f.name.toLowerCase()));
      let name = `${stem} 副本${ext}`;
      let n = 2;
      while (names.has(name.toLowerCase())) name = `${stem} 副本 ${n++}${ext}`;
      const path = await P.createFile(`${P.FOLDER}/${name}`, blob);
      // A copy is a document of its own, not one that was shared and deleted under its name: it must not join that room.
      await forgetRoom(path);
      keepFocus = { path, control: 'file-menu-btn' };
      toast('已创建副本');
      load();
    } catch (e) {
      if (gone(e)) return;
      toast(e?.message || '无法创建副本', { icon: 'alert' });
    }
  }

  /** A file another window deleted or renamed: say so, and show the list as it is now. */
  function gone(e) {
    if (!P.isNotFound(e)) return false;
    toast('该文件已不存在', { icon: 'alert' });
    load();
    return true;
  }

  async function download(file) {
    try {
      // A download comes to this device, as Import takes from it, in the Puter desktop too.
      P.downloadBlob(await P.readFile(file.path), file.name);
    } catch (e) {
      if (gone(e)) return;
      toast(e?.message || '无法下载', { icon: 'alert' });
    }
  }

  async function remove(file) {
    const ok = await confirmDialog({
      title: '删除文档？',
      message: inAppFolder(file.path)
        ? `“${P.stripExtension(file.name)}”将从您的“文档”文件夹中移除并删除。此操作无法撤消。`
        : `“${P.stripExtension(file.name)}”将从云端 ${madeLocation(file.path)} 中删除。此操作无法撤消。`,
      confirmLabel: '删除',
    });
    if (!ok) return;
    try {
      const index = [...list.querySelectorAll('.file-row')].findIndex((row) => row.dataset.path === file.path);
      // Already gone (another window deleted or renamed it): the deletion is done, and so is the tidying up.
      try { await P.deleteFile(file.path); } catch (e) { if (!P.isNotFound(e)) throw e; }
      keepFocus = { index: Math.max(0, index) };
      deleteVersions(file.path, { uid: file.uid });
      unpublishAt(file.path).catch((e) => console.warn('[documents] the published page could not be taken down', e));
      forgetStar(file.path);
      rememberGoal(file.path, null);
      forgetPosition(file.path);
      // A shared document's guests are told it is gone, rather than go on editing what nobody saves.
      endRoom(file.path);
      forgetMade(file.path);
      files = files.filter((f) => f.path !== file.path);
      // A listing started before deletion can still contain this file. Fetch
      // a fresh snapshot and invalidate that request (or its stale error).
      if (loading || error) load();
      else renderList();
      toast('已删除', { icon: 'trash' });
    } catch (e) {
      toast(e?.message || '无法删除', { icon: 'alert' });
    }
  }

  /** Keep a document at the top of the list, or let it go. */
  function star(file) {
    const on = toggleStar(file.path);
    toast(on ? '已加星标并置于列表顶部' : '已取消星标', { icon: 'star' });
    renderList();
  }

  // Where keyboard focus should land after the next render: an action from a
  // row's menu re-renders the list while a dialog or menu still holds focus,
  // so the row cannot be read from the active element then.
  let keepFocus = null;
  function renderList() {
    const active = document.activeElement;
    // A place remembered for the focus (the row a duplicate made, the Retry button's row) is honored only if the
    // user has not moved on meanwhile: typing in the search field must not be interrupted by a row taking the focus.
    const claimed = active && active !== document.body && !list.contains(active) && !active.closest('.modal-root, .menu');
    if (claimed) keepFocus = null;
    // Consumed only once rows are drawn: the spinner shown while the list reloads must not use it up.
    const pending = keepFocus;
    const focusedPath = pending?.path ?? (list.contains(active) ? active.closest('.file-row')?.dataset.path : null);
    const focusedControl = pending?.control ?? ['file-main', 'file-star-btn', 'file-menu-btn'].find((name) => active?.classList.contains(name));
    const focusedIndex = pending?.index ?? null;
    clear(list);
    listTools.hidden = session.signedOut;
    // Loading, errors, and empty states are messages, not document list items.
    list.setAttribute('role', 'region');
    if (session.signedOut) {
      listStatus.textContent = '';
      list.append(el('div.empty', {},
        el('div.empty-icon', { html: icon('cloud', 28) }),
        el('h3.empty-title', {}, '登录以查看您的文档'),
        el('p.empty-sub', {}, '文档将作为 .docx 文件保存在您的云端。登录后可在此打开它们，也可以直接开始编写。'),
        el('div.row', { style: { justifyContent: 'center', marginTop: '6px' } },
          el('button.btn.btn-primary', { type: 'button', html: icon('login', 16, 2.2), onclick: () => session.signIn() }, el('span', {}, '登录到云端')),
          el('button.btn.btn-outline', { type: 'button', html: icon('plus', 16, 2.2), onclick: newDoc }, el('span', {}, '新建文档')))));
      return;
    }
    if (loading) {
      // Announced: the list emptied and nothing has taken its place yet.
      listStatus.textContent = '正在加载您的文档';
      list.append(el('div.list-state', {}, el('span.spin', { html: icon('spinner', 22) }), el('span', {}, '正在加载您的文档')));
      return;
    }
    if (error) {
      // Retried from the keyboard, the list's first row takes the focus once it loads; a failure again keeps it on the button.
      const retry = el('button.btn.btn-sm', { type: 'button', onclick: () => { keepFocus = { index: 0 }; load(); } }, '重试');
      listStatus.textContent = error;
      list.append(el('div.list-state', {}, el('span', { html: icon('wifiOff', 22) }), el('span', {}, error), retry));
      if (pending) { retry.focus({ preventScroll: true }); keepFocus = null; }
      return;
    }
    const stars = new Set(starredPaths());
    // Match the name as shown, without the extension: "docx" is not a search for every document.
    const shown = starredFirst(sortFiles(query ? files.filter((f) => P.stripExtension(f.name).toLowerCase().includes(query)) : files, sort), stars);
    listStatus.textContent = query ? (shown.length ? `显示 ${shown.length} 个文档` : '无匹配结果') : '';
    if (!shown.length) {
      // No row is left to take the focus (the last document deleted, or the last match of a search): it goes to
      // the search field or the New document button rather than falling to the page body.
      if (keepFocus) (query ? search : list.closest('.home')?.querySelector('.home-actions .btn-primary, .btn-primary'))?.focus({ preventScroll: true });
      // The request must not wait for the next search that shows some.
      keepFocus = null;
      list.append(el('div.empty', {},
        el('div.empty-icon', { html: icon(query ? 'search' : 'brand', 28) }),
        el('h3.empty-title', {}, query ? '无匹配结果' : '暂无文档'),
        el('p.empty-sub', {}, query ? '请尝试不同的搜索词。' : '新建文档或导入 DOCX、Hanword (.hwp, .hwpx)、Markdown、HTML 或文本文件以开始。'),
        !query && el('div.row', { style: { justifyContent: 'center', marginTop: '6px' } },
          el('button.btn.btn-primary', { type: 'button', html: icon('plus', 16, 2.2), onclick: newDoc }, el('span', {}, '新建文档')),
          el('button.btn.btn-outline', { type: 'button', html: icon('upload', 16), onclick: pickDevice }, el('span', {}, '导入')))));
      return;
    }
    list.setAttribute('role', 'list');
    keepFocus = null;
    // The three icons every row carries are parsed once and copied, not rebuilt from markup per row.
    const icons = { menu: iconEl('moreV', 18), star: iconEl('star', 17, 2), brand: iconEl('brand', 20, 1.7) };
    for (const file of shown) {
      const menuBtn = el('button.icon-btn.file-menu-btn', {
        type: 'button', 'aria-label': `${file.name} 的选项`, 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: '选项',
        onclick: (e) => { e.stopPropagation(); fileMenu(file, e.currentTarget); },
      }, icons.menu.cloneNode(true));
      const starred = stars.has(documentPathKey(file.path));
      const starBtn = el('button.icon-btn.file-star-btn', {
        type: 'button', 'aria-label': starred ? `取消星标 ${file.name}` : `加星标 ${file.name}`, 'aria-pressed': String(starred), title: starred ? '取消星标' : '加星标：置于顶部',
        onclick: (e) => { e.stopPropagation(); star(file); },
      }, icons.star.cloneNode(true));
      const where = madeLocation(file.path);
      const row = el('div.file-row', { role: 'listitem', dataset: { path: file.path }, className: starred ? 'file-row is-starred' : 'file-row' },
        // A document saved elsewhere on the drive says where, so two of the same name can be told apart.
        el('button.file-main', { type: 'button', title: where ? `${file.name} 在 ${where}` : null, dataset: where ? { where } : {}, onclick: () => openPath(file.path) },
          el('span.file-icon', {}, icons.brand.cloneNode(true)),
          el('span.file-text', {},
            el('span.file-name', {}, P.stripExtension(file.name)),
            el('span.file-meta', {}, [starred ? '已加星标' : null, where || null, HANWORD_IMPORTABLE.test(file.name) ? `Hanword ${file.name.split('.').pop().toUpperCase()}` : null, relativeTime(file.modified), formatBytes(file.size)].filter(Boolean).join(' · ')))),
        starBtn, menuBtn);
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // A keyboard-invoked context menu carries no pointer position; it opens under the menu button.
        fileMenu(file, menuBtn, e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : null);
      });
      list.append(row);
      // A path the app wrote is spelled from its folder; the listing spells the same file from the root.
      if (documentPathKey(file.path) === documentPathKey(focusedPath) && focusedControl) row.querySelector(`.${focusedControl}`)?.focus({ preventScroll: true });
    }
    if (focusedIndex != null && !shown.some((file) => documentPathKey(file.path) === documentPathKey(focusedPath))) {
      // The row is gone (deleted): the one now in its place, or the last one.
      const rows = list.querySelectorAll('.file-row');
      rows[Math.min(focusedIndex, rows.length - 1)]?.querySelector('.file-main')?.focus({ preventScroll: true });
    }
  }

  const onKey = (e) => {
    if (e.key !== '?' || e.altKey || e.metaKey || e.ctrlKey) return;
    if (/^(input|textarea|select|puter-user-menu)$/i.test(e.target?.tagName || '')) return;
    // A dialog or menu on top has the keyboard; the shortcut list must not open over it.
    if (document.querySelector('.modal-root:not(.closing), .menu') || !root.contains(e.target)) return;
    e.preventDefault();
    openShortcuts();
  };
  document.addEventListener('keydown', onKey);

  load();
  let hadSession = !session.signedOut;
  let wasSignedIn = session.signedIn;
  const onSession = () => {
    account.refresh();
    // Signing in brings the list; the sign-in state is replaced by the files. Signing out takes them away.
    if ((!hadSession && !session.signedOut) || (wasSignedIn && session.signedOut)) load();
    hadSession = !session.signedOut;
    wasSignedIn = session.signedIn;
  };
  session.addEventListener('change', onSession);
  // A list that could not load (offline, say) loads by itself once the connection is back; Retry is for the rest.
  const onOnline = () => {
    if (!error || destroyed) return;
    // The keyboard on Retry goes to the first document, as a press of Retry would take it.
    if (list.contains(document.activeElement)) keepFocus = { index: 0 };
    load();
  };
  window.addEventListener('online', onOnline);

  return {
    el: root,
    destroy() {
      destroyed = true;
      clearTimeout(searchTimer);
      // A menu opened from this view (the templates list, a row's options) goes with it.
      if (menuAnchor() && root.contains(menuAnchor())) closeMenu();
      session.removeEventListener('change', onSession); document.removeEventListener('keydown', onKey);
      window.removeEventListener('online', onOnline);
    },
    reload: load,
  };
}
