/**
 * Home screen: a sidebar (Home, Templates, Trash, account and storage) and
 * three views. Home starts projects (blank by aspect ratio, from media, from
 * a template, from a project file or from a script with AI) and lists recent
 * projects with search, sort, grid or list view, rename, duplicate, export
 * and delete. Deleting
 * moves a project to the Trash, where it can be restored or deleted for good
 * (and is purged automatically after TRASH_DAYS).
 */
import { createElement, LayoutTemplate, ArchiveRestore, PackageOpen } from 'lucide';
import { h, announce } from '../lib/dom.js';
import { icon, appIcon } from '../lib/icons.js';
import { clock } from '../lib/time.js';
import { RATIOS } from '../model/project.js';
import { TEMPLATES } from '../model/templates.js';
import { TRASH_DAYS } from '../storage/library.js';
import { exportProjectBundle, importProjectBundle, downloadBlob, BUNDLE_ACCEPT } from '../storage/bundle.js';
import { createProjectFromTemplate } from '../storage/template-project.js';
import { MEDIA_ACCEPT } from '../media/media-types.js';
import { showMenu, menuButton } from './menu.js';
import { confirmDialog, promptDialog, toast, installTooltips, openDialog } from './dialog.js';
import { accountButton, themeMenuItems } from './topbar.js';
import { settingsButton, userMenu } from './user-menu.js';
import { prefs, setPref } from './prefs.js';
import { templateCard, templatesView, openTemplateDialog } from './home-templates.js';
import { TemplatePreview } from './template-preview.js';

const DAY = 24 * 60 * 60 * 1000;
/** "a, b, c and 2 more" for toasts. */
const fewNames = (list) => `${list.slice(0, 3).join(', ')}${list.length > 3 ? ` 等 ${list.length - 3} 个` : ''}`;
const QUICK_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '4:5', '21:9'];
const VIEWS = [
  { id: 'home', label: '主页', icon: () => icon('home', 18) },
  { id: 'templates', label: '模板', icon: () => lucide(LayoutTemplate, 18) },
  { id: 'trash', label: '废纸篓', icon: () => icon('trash', 18) },
];

function lucide(node, size = 16) {
  const el = createElement(node);
  el.setAttribute('width', size);
  el.setAttribute('height', size);
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  el.classList.add('icon');
  return el;
}

function relTime(ts, now = Date.now()) {
  const d = now - ts;
  const m = Math.round(d / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} 小时前`;
  return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatSize(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 KB';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Days left before a trashed project is deleted for good. */
export function daysLeft(deletedAt, now = Date.now()) {
  return Math.max(0, Math.ceil((deletedAt + TRASH_DAYS * DAY - now) / DAY));
}

function ratioGlyph(id, max = 18) {
  const r = RATIOS.find((x) => x.id === id);
  const w = r ? r.w : 16;
  const hh = r ? r.h : 9;
  const k = max / Math.max(w, hh);
  return h('span.ratio-glyph', { style: { width: `${Math.round(w * k)}px`, height: `${Math.round(hh * k)}px` } });
}

function viewFromHash() {
  const m = /^#(templates|trash)$/.exec(location.hash);
  return m ? m[1] : 'home';
}

export class Home {
  constructor(root, { library, account, onOpen, onCreate, onImportFiles }) {
    this.root = root;
    this.library = library;
    this.account = account;
    this.onOpen = onOpen;
    this.onCreate = onCreate;
    this.onImportFiles = onImportFiles;
    this.query = '';
    this.projects = [];
    this.trash = [];
    this.loaded = false;
    this.disposed = false;
    this.listRequest = 0;
    this.usageRequest = 0;
    this.coverUrls = new Map();
    this.coverLoads = new Map();
    this.noCover = new Set(); // projects without a cover, so redraws (search) don't ask again
    this.view = viewFromHash();
    this.onHash = () => {
      const v = viewFromHash();
      if (v !== this.view) this.show(v, { push: false });
    };
    window.addEventListener('hashchange', this.onHash);
    this.render();
    this.load();
  }

  async load() {
    if (this.disposed) return;
    const request = ++this.listRequest;
    this.loaded = false;
    this.renderView();
    try {
      // Projects past their time in the Trash go for good when the home screen opens.
      const purged = await this.library.purgeTrash().catch(() => []);
      if (this.disposed || request !== this.listRequest) return;
      if (purged.length) announce(`${purged.length} project${purged.length === 1 ? '' : 's'} removed from the Trash after ${TRASH_DAYS} days`);
      const projects = await this.library.listProjects();
      if (this.disposed || request !== this.listRequest) return;
      const trash = await this.library.listTrash();
      if (this.disposed || request !== this.listRequest) return;
      this.projects = projects;
      this.trash = trash;
    } catch (err) {
      if (this.disposed || request !== this.listRequest) return;
      console.error(err);
      this.loadError = true;
      this.loaded = true;
      this.renderView();
      return;
    }
    this.loadError = false;
    this.loaded = true;
    this.renderView();
    this.refreshUsage();
  }

  async refreshLists() {
    if (this.disposed) return;
    const request = ++this.listRequest;
    const projects = await this.library.listProjects();
    if (this.disposed || request !== this.listRequest) return;
    const trash = await this.library.listTrash();
    if (this.disposed || request !== this.listRequest) return;
    this.projects = projects;
    const wasLoaded = this.loaded && !this.loadError;
    this.trash = trash;
    this.loaded = true;
    this.loadError = false;
    if (wasLoaded && this.view === 'home' && this.grid?.isConnected) this.refreshGrid();
    else this.renderView();
    this.refreshUsage();
  }

  /**
   * The project list changed (a rename, a copy, a move to the Trash): only the list and the
   * counts are drawn again. Rebuilding the whole page took the search box from under the
   * person typing in it, and left keyboard focus on nothing after every project action.
   */
  refreshGrid() {
    const cards = [...this.grid.children];
    const card = this.grid.contains(document.activeElement) ? document.activeElement.closest('.project-grid > *') : null;
    const at = card ? cards.indexOf(card) : -1;
    const more = at >= 0 && document.activeElement.classList.contains('project-more');
    this.renderNav();
    this.renderGrid();
    if (at < 0 || this.grid.contains(document.activeElement)) return;
    // The card in the same place (the next project, after one went to the Trash), else the search box.
    const next = this.grid.children[Math.min(at, this.grid.children.length - 1)];
    const target = next?.querySelector(more ? '.project-more' : '.project-open') || next?.querySelector('button') || this.content.querySelector('.home-search');
    target?.focus({ preventScroll: true });
  }

  /* Shell ---------------------------------------------------------------------- */

  render() {
    this.importInput = h('input', { type: 'file', multiple: true, accept: MEDIA_ACCEPT, hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
    this.importInput.addEventListener('change', () => {
      const files = [...this.importInput.files];
      this.importInput.value = '';
      if (files.length) this.onImportFiles(files);
    });
    this.bundleInput = h('input', { type: 'file', accept: BUNDLE_ACCEPT, multiple: true, hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
    this.bundleInput.addEventListener('change', () => {
      const files = [...this.bundleInput.files];
      this.bundleInput.value = '';
      this.importBundles(files);
    });

    this.nav = h('nav.home-nav', { 'aria-label': '主页分区' });
    this.usageEl = h('p.storage-usage');
    const backend = this.library.backend.kind;
    const where = backend === 'puter'
      ? [icon('cloudCheck', 16), '已保存至本地存储']
      : backend === 'local'
        ? [icon('drive', 16), '仅保存在此浏览器']
        : [icon('alert', 16), '未保存：临时存储'];
    const user = this.account?.user;
    const signIn = !user && this.account?.onSignIn
      ? h('button.btn.small.primary.block', { type: 'button', onclick: () => this.account.onSignIn() }, icon('cloud', 14), '登录以保存')
      : null;
    // Where puter.js has <puter-user-menu>, it holds the account at the top of the page, after Settings
    // for the theme; the sidebar's account row stands down.
    const sdkMenu = userMenu(this.account || {});
    const accountBar = sdkMenu ? h('div.home-account', settingsButton(themeMenuItems), sdkMenu) : null;
    const accountRow = sdkMenu ? null : h('div.side-account', accountButton(this.account || {}), h('span.side-user', user?.username || '访客'));
    const storage = h('div.side-storage', h('p.storage-where', ...where), this.usageEl, signIn);
    this.side = h('aside.home-side',
      h('div.side-brand', appIcon(26), h('span.brand-name', '视频剪辑工作室')),
      this.nav,
      h('div.side-spacer'),
      storage,
      accountRow,
    );
    // On phones the storage note moves under the content.
    this.mobileStorage = h('div.home-mobile-storage', h('p.storage-where', ...where.map((n) => (typeof n === 'string' ? n : n.cloneNode(true)))), h('p.storage-usage'));
    this.content = h('div.home-content');
    this.mainEl = h('main#main.home-main', { tabindex: '-1' }, this.content, this.mobileStorage,
      h('footer.home-footer', h('a', { href: 'https://developer.puter.com', target: '_blank', rel: 'noopener' }, '')),
      this.importInput, this.bundleInput);
    this.dropHint = h('div.home-drop', { 'aria-hidden': 'true' }, h('div.home-drop-box', icon('import', 28), h('strong', '拖放以开始'), h('span', '媒体将在新项目中打开。工程文件将加入您的项目。')));
    const page = h('div.home', this.side, accountBar, this.mainEl, this.dropHint);
    page.classList.toggle('has-user-menu', Boolean(accountBar));
    this.installDrop(page);
    this.root.replaceChildren(page);
    this.root.removeAttribute('aria-busy');
    installTooltips();
    this.renderNav();
  }

  renderNav() {
    this.nav.replaceChildren(...VIEWS.map((v) => {
      const count = v.id === 'trash' && this.trash.length ? h('span.nav-count', { 'aria-label': `${this.trash.length} in the Trash` }, String(this.trash.length)) : null;
      const a = h('a.nav-item', { href: v.id === 'home' ? '#' : `#${v.id}`, 'aria-current': v.id === this.view ? 'page' : null }, v.icon(), h('span.nav-label', v.label), count);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.show(v.id);
      });
      return a;
    }));
  }

  show(view, { push = true } = {}) {
    if (this.disposed) return;
    this.view = view;
    if (push) history.replaceState(null, '', view === 'home' ? `${location.pathname}${location.search}` : `#${view}`);
    this.query = '';
    this.renderNav();
    this.renderView();
    this.mainEl.scrollTop = 0;
    this.mainEl.focus({ preventScroll: true });
  }

  renderView() {
    if (this.disposed) return;
    // Cards drawn before are gone: stop waiting to load their covers.
    this.coverObserver?.disconnect();
    this.renderNav();
    const titles = { home: '视频剪辑工作室', templates: '模板', trash: '废纸篓' };
    document.title = this.view === 'home' ? '视频剪辑工作室' : `${titles[this.view]} - 视频剪辑工作室`;
    this.grid = null;
    if (this.view === 'templates') {
      this.content.replaceChildren(templatesView({ onChoose: (t) => this.chooseTemplate(t) }));
      return;
    }
    if (this.view === 'trash') {
      this.content.replaceChildren(this.trashView());
      return;
    }
    this.content.replaceChildren(this.homeView());
  }

  /* Home view ------------------------------------------------------------------- */

  homeView() {
    const banner = h('button.new-banner', { type: 'button' },
      h('span.new-banner-icon', icon('plus', 26)),
      h('span.new-banner-text', h('strong', '新建项目'), h('span', '从空白时间轴开始。其画幅比例将跟随您添加的第一个片段。')));
    banner.addEventListener('click', () => this.onCreate({ ratio: 'original' }));

    const importCard = h('button.quick-card.wide', { type: 'button' },
      h('span.quick-icon', icon('import', 20)),
      h('span.quick-text', h('strong', '导入并编辑'), h('span', '在新项目中打开媒体文件')));
    importCard.addEventListener('click', () => this.importInput.click());
    const fileCard = h('button.quick-card.wide', { type: 'button' },
      h('span.quick-icon', lucide(PackageOpen, 20)),
      h('span.quick-text', h('strong', '打开工程文件'), h('span', '恢复从视频剪辑导出的项目包')));
    fileCard.addEventListener('click', () => this.bundleInput.click());
    const tplCard = h('button.quick-card.wide', { type: 'button' },
      h('span.quick-icon', lucide(LayoutTemplate, 20)),
      h('span.quick-text', h('strong', '浏览模板'), h('span', `${TEMPLATES.length} 个成熟预置工程任您使用`)));
    tplCard.addEventListener('click', () => this.show('templates'));
    const scriptCard = h('button.quick-card.wide', { type: 'button' },
      h('span.quick-icon', icon('script', 20)),
      h('span.quick-text', h('strong', '文案生成视频'), h('span', '利用 AI 将文案或主题转化为带旁白的视频')));
    scriptCard.addEventListener('click', () => this.scriptToVideo());
    const ratios = QUICK_RATIOS.map((id) => {
      const r = RATIOS.find((x) => x.id === id);
      const b = h('button.quick-card.ratio', { type: 'button', 'aria-label': `${r.label} ${r.hint}，新建项目` },
        h('span.quick-glyph', ratioGlyph(r.id, 22)),
        // The space keeps "16:9 YouTube" apart in the text the accessible name must start with.
        h('span.quick-text', h('strong', r.label), ' ', h('span', r.hint)));
      b.addEventListener('click', () => this.onCreate({ ratio: r.id }));
      return b;
    });

    const strip = h('div.tpl-strip', { role: 'list', 'aria-label': '精选模板' },
      TEMPLATES.slice(0, 6).map((t) => h('div.tpl-item', { role: 'listitem' }, templateCard(t, { onChoose: (x) => this.chooseTemplate(x) }))));
    const allTemplates = h('a.section-link', { href: '#templates' }, '查看全部', icon('chevronRight', 14));
    allTemplates.addEventListener('click', (e) => {
      e.preventDefault();
      this.show('templates');
    });

    const search = h('input.input.home-search', { type: 'search', placeholder: '搜索项目', 'aria-label': '搜索项目', value: this.query });
    search.addEventListener('input', () => {
      this.query = search.value.trim().toLowerCase();
      this.renderGrid();
    });
    const sortBtn = h('button.btn.small.ghost', { type: 'button' }, icon('list', 14), h('span.sort-label', '排序'));
    menuButton(sortBtn, () => {
      const s = prefs().homeSort;
      return [
        { label: '最近修改', checked: s === 'modified', radio: true, onSelect: () => this.setSort('modified') },
        { label: '创建日期', checked: s === 'created', radio: true, onSelect: () => this.setSort('created') },
        { label: '项目名称', checked: s === 'name', radio: true, onSelect: () => this.setSort('name') },
      ];
    }, { align: 'end', label: '排序项目' });
    const viewBtn = h('button.icon-btn', { type: 'button' });
    const syncView = () => {
      const grid = prefs().homeView !== 'list';
      viewBtn.replaceChildren(icon(grid ? 'list' : 'grid', 16));
      viewBtn.setAttribute('aria-label', grid ? '以列表显示' : '以网格显示');
      viewBtn.setAttribute('data-tip', grid ? '列表视图' : '网格视图');
    };
    viewBtn.addEventListener('click', () => {
      setPref('homeView', prefs().homeView === 'list' ? 'grid' : 'list');
      syncView();
      this.renderGrid();
    });
    syncView();
    const moreBtn = h('button.icon-btn', { type: 'button', 'aria-label': '更多项目操作', 'data-tip': '更多' }, icon('more', 16));
    menuButton(moreBtn, () => [
      { label: '打开工程文件...', icon: 'folderOpen', onSelect: () => this.bundleInput.click() },
      { label: '导入媒体...', icon: 'import', onSelect: () => this.importInput.click() },
      'separator',
      { label: `废纸篓${this.trash.length ? ` (${this.trash.length})` : ''}`, icon: 'trash', onSelect: () => this.show('trash') },
    ], { align: 'end', label: '更多项目操作' });

    this.grid = h('div.project-grid', { role: 'list', 'aria-label': '项目列表' });
    this.count = h('span.home-count');
    const section = h('div.home-view',
      h('h1.sr-only', '视频剪辑工作室'),
      h('section.home-start', { 'aria-label': '开始项目' },
        banner,
        h('div.quick-row', { role: 'group', 'aria-label': '快速开始' }, importCard, fileCard, tplCard, scriptCard),
        h('div.ratio-group', { role: 'group', 'aria-labelledby': 'ratio-h' }, h('h2#ratio-h.group-label', '按画幅比例新建空白项目'), h('div.ratio-grid', ratios))),
      h('section.home-section', { 'aria-labelledby': 'tpl-strip-h' },
        h('div.section-head', h('h2#tpl-strip-h', '从模板开始'), allTemplates),
        strip),
      h('section.home-section', { 'aria-labelledby': 'projects-h' },
        h('div.section-head', h('h2#projects-h', '最近项目 ', this.count), h('div.section-tools', h('div.search-wrap', icon('search', 14), search), sortBtn, viewBtn, moreBtn)),
        this.grid));
    this.renderGrid();
    return section;
  }

  setSort(s) {
    setPref('homeSort', s);
    this.renderGrid();
  }

  sorted() {
    const s = prefs().homeSort;
    const list = this.projects.filter((p) => !this.query || p.name.toLowerCase().includes(this.query));
    // Natural order: Project 2 before Project 10, case and accents aside.
    if (s === 'name') return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (s === 'created') return list.sort((a, b) => (b.created || 0) - (a.created || 0));
    return list.sort((a, b) => b.modified - a.modified);
  }

  renderGrid() {
    if (this.disposed) return;
    if (!this.grid) return;
    this.coverObserver?.disconnect();
    if (!this.loaded) {
      this.grid.replaceChildren(h('div.home-loading', { role: 'status' }, h('div.spinner'), '正在加载项目...'));
      return;
    }
    if (this.loadError) {
      this.grid.replaceChildren(h('div.home-empty', icon('cloudOff', 28), h('p', "无法加载您的项目。"), h('button.btn', { type: 'button', onclick: () => this.load() }, '重试')));
      return;
    }
    const list = this.sorted();
    const asList = prefs().homeView === 'list';
    this.grid.classList.toggle('as-list', asList);
    this.count.textContent = this.projects.length ? `(${this.projects.length})` : '';
    if (!list.length) {
      this.grid.replaceChildren(h('div.home-empty', { role: 'listitem' }, icon('clapper', 28), h('p', this.query ? '未找到符合搜索条件的项目。' : '暂无项目。在上方新建一个，或选择一个模板。')));
      return;
    }
    this.grid.replaceChildren(...list.map((p) => this.card(p)));
  }

  cover(p) {
    const cover = h('div.project-cover', h('span.cover-fallback', icon('film', 22)));
    this.watchCover(p.id, cover);
    return cover;
  }

  /**
   * Load a cover once its card is close to being scrolled into view: with
   * many projects, reading every cover at once (a download each from the
   * cloud) would hold up the ones on screen.
   */
  watchCover(id, el) {
    if (this.coverUrls.has(id) || this.noCover.has(id) || typeof IntersectionObserver !== 'function') {
      this.loadCover(id, el);
      return;
    }
    this.coverIds ||= new WeakMap();
    this.coverIds.set(el, id);
    this.coverObserver ||= new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        this.coverObserver.unobserve(e.target);
        this.loadCover(this.coverIds.get(e.target), e.target);
      }
    }, { root: this.mainEl, rootMargin: '400px 0px' });
    this.coverObserver.observe(el);
  }

  card(p) {
    const cover = this.cover(p);
    const open = h('button.project-open', { type: 'button', 'aria-label': `打开 ${p.name}，时长 ${clock(p.duration || 0)}，编辑于 ${relTime(p.modified)}` }, cover,
      h('span.project-meta', h('span.project-title', p.name), h('span.project-sub', `${clock(p.duration || 0)}  ·  ${relTime(p.modified)}`)));
    open.addEventListener('click', () => this.onOpen(p.id));
    const more = h('button.icon-btn.project-more', { type: 'button', 'aria-label': `${p.name} 的更多操作` }, icon('more', 16));
    const items = () => [
      { label: '打开', icon: 'folderOpen', onSelect: () => this.onOpen(p.id) },
      { label: '重命名', icon: 'pencil', onSelect: () => this.rename(p) },
      { label: '创建副本', icon: 'copy', onSelect: () => this.duplicate(p) },
      { label: '导出工程文件', icon: 'download', onSelect: () => this.exportBundle(p) },
      'separator',
      { label: '移至废纸篓', icon: 'trash', danger: true, onSelect: () => this.remove(p) },
    ];
    menuButton(more, items, { align: 'end', label: p.name });
    const li = h('div.project-card', { role: 'listitem' }, open, more);
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu({ x: e.clientX, y: e.clientY }, items(), { label: p.name });
    });
    return li;
  }

  async loadCover(id, el) {
    if (this.disposed) return;
    let url = this.coverUrls.get(id);
    if (!url) {
      if (this.noCover.has(id)) return;
      let pending = this.coverLoads.get(id);
      if (!pending) {
        pending = (async () => {
          const blob = await this.library.coverBlob(id);
          if (this.disposed) return null;
          if (!blob) {
            this.noCover.add(id);
            return null;
          }
          const loaded = URL.createObjectURL(blob);
          this.coverUrls.set(id, loaded);
          return loaded;
        })();
        this.coverLoads.set(id, pending);
      }
      try {
        url = await pending;
      } finally {
        if (this.coverLoads.get(id) === pending) this.coverLoads.delete(id);
      }
      if (!url || this.disposed) return;
    }
    el.replaceChildren(h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' }));
  }

  /**
   * A project open in another tab saves over whatever is done to it here (a
   * rename, the Trash, even Delete forever brings it back): say so instead.
   */
  async openElsewhere(p, what) {
    if (!(await this.library.isProjectOpen(p.id))) return false;
    toast(`${p.name} 已在另一个标签页或窗口中打开。请在对应页面关闭后再${what}。`, { kind: 'error' });
    return true;
  }

  async rename(p) {
    if (await this.openElsewhere(p, '重命名')) return;
    const name = await promptDialog({ title: '重命名项目', label: '项目名称', value: p.name, confirm: '重命名' });
    if (!name || name === p.name) return;
    try {
      await this.library.renameProject(p.id, name);
      await this.refreshLists();
      announce(`已重命名为 ${name}`);
    } catch {
      toast("无法重命名该项目。", { kind: 'error' });
    }
  }

  async duplicate(p) {
    try {
      await this.library.duplicateProject(p.id);
      await this.refreshLists();
      toast(`已创建副本 ${p.name}`, { kind: 'success' });
    } catch {
      toast("无法复制该项目。", { kind: 'error' });
    }
  }

  async remove(p) {
    if (await this.openElsewhere(p, '移至废纸篓')) return;
    try {
      await this.library.trashProject(p.id);
      await this.refreshLists();
      toast(`${p.name} 已移至废纸篓`, {
        kind: 'success',
        duration: 6000,
        action: { label: '撤消', onClick: () => this.restore(p, { quiet: true }) },
      });
    } catch {
      toast("无法将项目移至废纸篓。", { kind: 'error' });
    }
  }

  /* Templates ------------------------------------------------------------------- */

  chooseTemplate(tpl) {
    openTemplateDialog(tpl, {
      onUse: async (t, { onProgress }) => {
        const project = await createProjectFromTemplate(this.library, t, { onProgress });
        await this.saveTemplateCover(t, project.id).catch(() => {});
        const slots = Object.values(project.assets).some((a) => a.kind === 'image' && /placeholder/i.test(a.name));
        // Home was left meanwhile (another project opened): the new project waits in the list.
        if (this.disposed) return;
        if (slots) toast('提示：选中占位片段并使用“替换片段”换成您自己的媒体文件。', { duration: 9000 });
        this.onOpen(project.id);
      },
    });
  }

  /** Script to video: the new project opens when it is ready. */
  scriptToVideo() {
    if (this.disposed) return Promise.resolve(null);
    if (this._scriptOpening) return this._scriptOpening;
    this._scriptOpening = import('./script-video.js')
      .then(m => m.openScriptVideo(this, { onProject: (id) => this.onOpen(id) }))
      .catch(err => {
        if (!this.disposed) {
          console.error(err);
          toast("无法打开文案生成视频，请检查网络连接后重试。", { kind: 'error' });
        }
        return null;
      })
      .finally(() => { this._scriptOpening = null; });
    return this._scriptOpening;
  }

  /** A first cover from the template preview (the editor replaces it after editing). */
  async saveTemplateCover(tpl, id) {
    const pv = new TemplatePreview(tpl, { width: 480 });
    await pv.ready();
    const blob = await new Promise((r) => (pv.canvas.toBlob ? pv.canvas.toBlob(r, 'image/jpeg', 0.85) : r(null)));
    if (blob) await this.library.saveCover(id, blob);
  }

  /* Trash view ------------------------------------------------------------------ */

  trashView() {
    const empty = h('button.btn.small', { type: 'button', disabled: !this.trash.length }, icon('trash', 14), '清空废纸篓');
    empty.addEventListener('click', () => this.emptyTrash());
    const list = h('div.project-grid.trash-grid', { role: 'list', 'aria-label': '废纸篓中的项目' });
    if (!this.loaded) list.append(h('div.home-loading', { role: 'status' }, h('div.spinner'), '正在加载...'));
    else if (this.loadError) list.append(h('div.home-empty', { role: 'listitem' }, icon('cloudOff', 28), h('p', "无法加载废纸篓。"), h('button.btn', { type: 'button', onclick: () => this.load() }, '重试')));
    else if (!this.trash.length) list.append(h('div.home-empty', { role: 'listitem' }, icon('trash', 28), h('p', '废纸篓为空。')));
    else list.append(...this.trash.map((p) => this.trashCard(p)));
    return h('section.home-section', { 'aria-labelledby': 'trash-h' },
      h('div.section-head',
        h('div', h('h1#trash-h.view-title', '废纸篓'), h('p.view-sub', `废纸篓中的项目在 ${TRASH_DAYS} 天后将永久删除。媒体文件仍将保留在您的存储中。`)),
        h('div.section-tools', empty)),
      list);
  }

  trashCard(p) {
    const left = daysLeft(p.deletedAt);
    const restore = h('button.btn.small', { type: 'button', 'aria-label': `恢复 ${p.name}` }, lucide(ArchiveRestore, 14), '恢复');
    restore.addEventListener('click', () => this.restore(p));
    const del = h('button.btn.small.ghost.danger-text', { type: 'button', 'aria-label': `永久删除 ${p.name}` }, '永久删除');
    del.addEventListener('click', () => this.deleteForever(p));
    const items = () => [
      { label: '恢复', icon: 'undo', onSelect: () => this.restore(p) },
      { label: '导出工程文件', icon: 'download', onSelect: () => this.exportBundle(p) },
      'separator',
      { label: '永久删除', icon: 'trash', danger: true, onSelect: () => this.deleteForever(p) },
    ];
    const li = h('div.project-card.trashed', { role: 'listitem' },
      h('div.project-open.static', this.cover(p),
        h('span.project-meta', h('span.project-title', p.name), h('span.project-sub', `已删除 ${relTime(p.deletedAt)}  ·  剩余 ${left} 天`))),
      h('div.trash-actions', restore, del));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu({ x: e.clientX, y: e.clientY }, items(), { label: p.name });
    });
    return li;
  }

  async restore(p, { quiet = false } = {}) {
    try {
      await this.library.restoreProject(p.id);
      await this.refreshLists();
      if (quiet) announce(`已恢复 ${p.name}`);
      else toast(`已恢复 ${p.name}`, { kind: 'success', action: { label: '打开', onClick: () => this.onOpen(p.id) } });
    } catch {
      toast("无法恢复该项目。", { kind: 'error' });
    }
  }

  async deleteForever(p) {
    if (await this.openElsewhere(p, '永久删除')) return;
    const ok = await confirmDialog({ title: '永久删除？', message: `${p.name} 将被永久删除且无法撤消。`, confirm: '永久删除', danger: true });
    if (!ok) return;
    try {
      await this.library.deleteProject(p.id);
      await this.refreshLists();
      announce(`已删除 ${p.name}`);
    } catch {
      toast("无法删除该项目。", { kind: 'error' });
    }
  }

  async emptyTrash() {
    const n = this.trash.length;
    if (!n) return;
    const ok = await confirmDialog({ title: '清空废纸篓？', message: `${n} 个项目将被永久删除且无法撤消。`, confirm: '清空废纸篓', danger: true });
    if (!ok) return;
    let emptied = true;
    try {
      await this.library.emptyTrash();
    } catch {
      emptied = false;
      toast("无法清空废纸篓。", { kind: 'error' });
    }
    await this.refreshLists().catch(() => {});
    if (emptied) announce('废纸篓已清空');
  }

  /* Project files ------------------------------------------------------------------ */

  progress(title, text) {
    const bar = h('progress.home-progress', { max: 1, value: 0, 'aria-label': title });
    const label = h('p.dialog-text', { role: 'status' }, text);
    const d = openDialog({ title, body: h('div', label, bar), className: 'small', closeOnBackdrop: false });
    return {
      set(done, total, msg) {
        bar.max = Math.max(1, total);
        bar.value = done;
        if (msg) label.textContent = msg;
      },
      close: () => d.close(),
    };
  }

  async exportBundle(p) {
    const pr = this.progress('导出工程文件', `正在打包 ${p.name}...`);
    let res;
    try {
      res = await exportProjectBundle(this.library, p.id, {
        onProgress: ({ done, total, name }) => pr.set(done, total, name ? `正在打包 ${name}...` : '即将完成...'),
      });
    } catch (err) {
      console.error(err);
      pr.close();
      toast(err?.message || "无法导出工程。", { kind: 'error' });
      return;
    }
    pr.close();
    if (res.missing.length) toast(`缺少 ${res.missing.length} 个文件，已跳过：${fewNames(res.missing)}`, { kind: 'error' });
    this.deliver(res);
  }

  /** Download the file, or offer to save it to Puter when signed in. */
  deliver({ blob, fileName }) {
    const canSave = this.library.backend.kind === 'puter' && typeof puter !== 'undefined';
    if (!canSave) {
      downloadBlob(blob, fileName);
      toast(`已下载 ${fileName}`, { kind: 'success' });
      return;
    }
    const status = h('p.dialog-text', { role: 'status' }, `${fileName} (${formatSize(blob.size)})`);
    const dl = h('button.btn', { type: 'button' }, icon('download', 16), '下载');
    const save = h('button.btn.primary', { type: 'button' }, icon('cloud', 16), '保存至本地');
    const d = openDialog({ title: '工程文件已就绪', body: status, actions: [dl, save], className: 'small' });
    dl.addEventListener('click', () => {
      downloadBlob(blob, fileName);
      d.close();
    });
    save.addEventListener('click', async () => {
      save.disabled = true;
      // Puter's file picker never answers when it is dismissed: the button comes back when
      // this window has focus again, so the file can still be saved.
      const back = () => (save.disabled = false);
      if (puter.ui?.showSaveFilePicker) window.addEventListener('focus', back, { once: true });
      try {
        let item;
        if (puter.ui?.showSaveFilePicker) item = await puter.ui.showSaveFilePicker(blob, fileName);
        else {
          const user = this.account?.user || (await puter.auth.getUser());
          item = await puter.fs.write(`/${user.username}/Documents/${fileName}`, blob, { dedupeName: true, createMissingParents: true, overwrite: false });
        }
        toast(`已保存至 ${item?.path || item?.name || '本地存储'}`, { kind: 'success' });
        d.close();
      } catch (err) {
        toast(`无法保存至本地存储: ${err?.message || err}`, { kind: 'error' });
        save.disabled = false;
      } finally {
        window.removeEventListener('focus', back);
      }
    });
  }

  async importBundles(files) {
    let last = null;
    for (const file of files) {
      const pr = this.progress('打开工程文件', `正在读取 ${file.name}...`);
      try {
        const { project, missing } = await importProjectBundle(this.library, file, {
          onProgress: ({ done, total, name }) => pr.set(done, total, name ? `正在添加 ${name}...` : '正在保存...'),
        });
        last = project;
        pr.close();
        if (missing.length) toast(`${project.name}: 有 ${missing.length} 个文件不在工程包中：${fewNames(missing)}`, { kind: 'error' });
      } catch (err) {
        pr.close();
        toast(`${file.name}: ${err?.message || "无法打开此工程文件。"}`, { kind: 'error' });
      }
    }
    if (!last) return;
    if (this.view !== 'home') this.show('home');
    await this.refreshLists();
    const p = last;
    toast(`已添加 ${p.name}`, { kind: 'success', action: { label: '打开', onClick: () => this.onOpen(p.id) } });
  }

  /* Drag and drop ------------------------------------------------------------------ */

  installDrop(page) {
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    page.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      page.classList.add('dropping');
    });
    page.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    page.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) page.classList.remove('dropping');
    });
    page.addEventListener('drop', async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      page.classList.remove('dropping');
      const files = [...e.dataTransfer.files];
      const bundles = files.filter((f) => /\.zip$/i.test(f.name));
      const media = files.filter((f) => !bundles.includes(f));
      // Both at once: the project files are added, then the media opens in a new project.
      if (bundles.length) await this.importBundles(bundles);
      if (media.length) this.onImportFiles(media);
    });
  }

  /* Storage readout ---------------------------------------------------------------- */

  async refreshUsage() {
    if (this.disposed) return;
    const request = ++this.usageRequest;
    let text = '';
    try {
      const u = await this.library.storageUsage();
      if (this.disposed || request !== this.usageRequest) return;
      const parts = [`${u.projects} 个项目`];
      let bytes = u.mediaBytes;
      if (bytes === null && this.library.backend.kind === 'local' && navigator.storage?.estimate) {
        bytes = (await navigator.storage.estimate().catch(() => null))?.usage ?? null;
      }
      if (u.mediaBytes !== null) parts.push(`${formatSize(bytes)} 媒体`);
      else if (bytes !== null) parts.push(`${formatSize(bytes)} 已使用`);
      if (u.trashed) parts.push(`废纸篓中 ${u.trashed} 个`);
      text = parts.join('  ·  ');
    } catch {
      text = '';
    }
    if (this.disposed || request !== this.usageRequest) return;
    for (const el of [this.usageEl, this.mobileStorage.querySelector('.storage-usage')]) el.textContent = text;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._scriptLifetime?.abort();
    window.removeEventListener('hashchange', this.onHash);
    this.coverObserver?.disconnect();
    for (const u of this.coverUrls.values()) URL.revokeObjectURL(u);
    this.coverUrls.clear();
    this.coverLoads.clear();
    this.noCover.clear();
  }
}
