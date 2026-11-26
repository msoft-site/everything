/**
 * Home: every base, starred ones first, with quick ways to start (blank,
 * template, import) and a trash for deleted bases.
 */
import { h } from '../lib/dom.js';
import { icon, BASE_ICONS, REPO_URL } from '../lib/icons.js';
import { accentColor, BASE_COLORS } from '../lib/colors.js';
import { timeAgo } from '../lib/format.js';
import { openMenu } from './menu.js';
import { openPopover, popoversAnchoredIn } from './popover.js';
import { openDialog, confirmDialog, promptDialog } from './dialog.js';
import { toast } from './toast.js';
import { prefs, setPref } from './prefs.js';
import { TEMPLATES, buildTemplate } from '../data/templates.js';
import { importFileDialog, pickFile } from './importer.js';
import { readBaseJson } from './exporter.js';

/** An element's classes without state ones: a starred star is still the star. */
function kind(el) {
  return String(el.className).replace(/\b(on|active)\b/g, '').trim();
}

export class HomePage {
  constructor(app, mode = 'home') {
    this.app = app;
    this.store = app.store;
    this.mode = mode;
    this.query = '';
    this.query = '';
    document.title = mode === 'trash' ? '回收站 – 多维表格' : '多维表格';
    this.el = h('div.home');
    this.off = this.store.on('index', () => this.renderList());
    this.render();
  }

  destroy() {
    this.off?.();
  }

  focus() {
    this.main?.focus({ preventScroll: true });
  }

  render() {
    const nav = (label, ic, hash, current) =>
      h('a.home-nav-item', { href: `#/${hash}`, 'aria-current': current ? 'page' : null }, icon(ic, 16), h('span', label));
    const create = h('button.btn.primary.block', { type: 'button', onclick: () => this.createBlank() }, icon('plus', 16), '新建数据表');
    this.navEl = h(
      'nav.home-nav',
      { 'aria-label': '主导航' },
      h('div.brand', h('img', { src: './icon-192.png', alt: '', width: 24, height: 24 }), h('span', '多维表格')),
      h('div.home-nav-list', nav('主页', 'home', '', this.mode === 'home'), nav('回收站', 'trash', 'trash', this.mode === 'trash')),
      (this.starredNav = h('div.home-nav-starred')),
      h('div.grow'),
      create,
      h('a.repo-link', { href: REPO_URL, target: '_blank', rel: 'noopener', 'aria-label': 'GitHub 上的源代码（在新标签页中打开）' }, icon('github', 14), h('span', 'GitHub 开源代码')),
    );
    this.search = h('input.input.home-search', {
      type: 'search',
      placeholder: '搜索数据表',
      'aria-label': '搜索数据表',
      value: this.query,
      oninput: () => {
        this.query = this.search.value;
        this.renderList();
      },
    });
    const menuBtn = h('button.icon-btn.home-menu-btn', { type: 'button', 'aria-label': '菜单', onclick: (e) => this.openPhoneMenu(e.currentTarget) }, icon('menu', 18));
    const top = h('header.home-top', menuBtn, h('div.home-search-wrap', icon('search', 16), this.search), h('div.grow'), this.app.accountButton());
    this.listHost = h('div.home-list-host');
    this.main = h('main.home-content', { id: 'main', tabindex: '-1' });
    if (this.mode === 'trash') {
      this.main.append(h('div.home-head', h('h1.home-title', '回收站'), h('div.grow'), h('button.btn', { type: 'button', onclick: () => this.emptyTrash() }, icon('trash', 16), '清空回收站')), h('p.home-sub', '回收站中的数据表可以恢复。清空回收站将永久删除它们及其关联文件。'), this.listHost);
    } else {
      const card = (ic, title, text, onclick, color) =>
        h('button.quick-card', { type: 'button', onclick }, h('span.quick-icon', { style: { background: color } }, icon(ic, 18)), h('span.quick-title', title), h('span.quick-text', text));
      this.main.append(
        h('h1.home-title', '主页'),
        h(
          'div.quick-grid',
          card('plus', '从零开始', '包含一张数据表的空白数据库。', () => this.createBlank(), accentColor('blue')),
          card('template', '从模板创建', '涵盖项目管理、内容规划、销售跟进、库存等模板。', () => this.openTemplates(), accentColor('purple')),
          card('fileUp', '导入电子表格', '从 CSV 文件创建数据表。', () => this.importCsv(), accentColor('green')),
          card('restore', '恢复备份', '打开之前下载保存为 JSON 的数据表。', () => this.importBackup(), accentColor('orange')),
        ),
        this.listHost,
      );
    }
    this.el.replaceChildren(this.navEl, h('div.home-main', top, this.main));
    this.renderList();
  }

  openPhoneMenu(anchor) {
    openMenu(anchor, [
      { label: '主页', icon: 'home', onSelect: () => this.app.navigate('') },
      { label: '回收站', icon: 'trash', onSelect: () => this.app.navigate('trash') },
      { type: 'sep' },
      { label: '新建数据表', icon: 'plus', onSelect: () => this.createBlank() },
      { label: '从模板创建', icon: 'template', onSelect: () => this.openTemplates() },
      { label: '导入电子表格', icon: 'fileUp', onSelect: () => this.importCsv() },
      { label: '恢复备份', icon: 'restore', onSelect: () => this.importBackup() },
      { type: 'sep' },
      { label: 'GitHub 开源代码', icon: 'github', onSelect: () => window.open(REPO_URL, '_blank', 'noopener') },
    ]);
  }

  bases() {
    const q = this.query.trim().toLowerCase();
    let list = this.mode === 'trash' ? this.store.trashed() : this.store.bases();
    if (q) list = list.filter((b) => b.name.toLowerCase().includes(q));
    const sort = prefs().homeSort;
    if (this.mode !== 'trash') {
      list = list.slice().sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true });
        if (sort === 'created') return (b.createdAt || 0) - (a.createdAt || 0);
        return (b.openedAt || b.updatedAt || 0) - (a.openedAt || a.updatedAt || 0);
      });
    }
    return list;
  }

  renderStarredNav() {
    if (!this.starredNav) return;
    const starred = this.store.bases().filter((b) => b.starred);
    this.starredNav.replaceChildren(...(starred.length ? [h('div.home-nav-title', '已加星标'), ...starred.map((b) => h('a.home-nav-item.base-link', { href: `#/${b.id}` }, h('span.base-icon', { style: { background: accentColor(b.color), width: '20px', height: '20px', borderRadius: '5px' }, 'aria-hidden': 'true' }, icon(b.icon || 'table', 12)), h('span', b.name)))] : []));
  }

  renderList() {
    this.renderStarredNav();
    if (!this.listHost) return;
    const focus = this.focusedControl();
    // A picker opened from a base's button follows the button redrawn.
    const anchored = popoversAnchoredIn(this.listHost).map((p) => [p, this.controlKey(p.anchor)]);
    this.renderListContent();
    this.restoreFocus(focus);
    for (const [p, k] of anchored) {
      const el = this.findControl(k, { exact: true });
      if (el) p.reanchor(el);
    }
  }

  /** What tells a control in the list apart (re-rendering replaces it). */
  controlKey(el) {
    return { base: el.closest('[data-base]')?.dataset.base, section: el.closest('.home-section')?.getAttribute('aria-labelledby'), cls: kind(el), label: el.getAttribute('aria-label') };
  }

  /** Which control in the list has focus. */
  focusedControl() {
    const a = document.activeElement;
    if (!a || !this.listHost.contains(a)) return null;
    return this.controlKey(a);
  }

  /** The same control after re-rendering, or (unless exact) the nearest one left. */
  findControl(f, { exact = false } = {}) {
    const focusable = 'a[href], button:not([disabled])';
    // Controls outside a base's row (layout, sort) are found by their label.
    if (!f.base) return [...this.listHost.querySelectorAll(focusable)].find((x) => f.label && x.getAttribute('aria-label') === f.label) || null;
    const section = this.listHost.querySelector(`[aria-labelledby="${f.section}"]`) || this.listHost;
    const row = section.querySelector(`[data-base="${f.base}"]`) || this.listHost.querySelector(`[data-base="${f.base}"]`);
    const same = row && [...row.querySelectorAll(focusable)].find((x) => kind(x) === f.cls);
    if (exact) return same || null;
    return same || row?.querySelector(focusable) || this.listHost.querySelector(focusable);
  }

  /** Focus the same control after re-rendering, or the nearest one left. */
  restoreFocus(f) {
    if (f) this.findControl(f)?.focus();
  }

  renderListContent() {
    const list = this.bases();
    if (this.mode === 'trash') {
      this.listHost.replaceChildren(
        list.length
          ? h('ul.base-rows', { 'aria-label': '回收站中的数据表' }, list.map((b) => this.trashRow(b)))
          : h('div.empty', h('div.empty-icon', icon('trash', 22)), h('h2', '回收站为空'), h('p', '您删除的数据表会显示在此处。')),
      );
      return;
    }
    const layout = prefs().homeLayout;
    const sortLabels = { opened: '最近打开', name: '名称', created: '创建时间' };
    const sortBtn = h('button.btn.ghost.small', { type: 'button', 'aria-haspopup': 'menu' }, `排序方式：${sortLabels[prefs().homeSort] || '最近打开'}`, icon('chevronDown', 14));
    sortBtn.addEventListener('click', () =>
      openMenu(sortBtn, Object.entries(sortLabels).map(([k, label]) => ({ label, checked: prefs().homeSort === k, radio: true, onSelect: () => {
        setPref('homeSort', k);
        this.renderList();
      } }))),
    );
    const layoutToggle = h(
      'div.segmented',
      { role: 'group', 'aria-label': '布局' },
      h('button', { type: 'button', 'aria-pressed': String(layout === 'grid'), 'aria-label': '网格视图', 'data-tip': '网格', onclick: () => this.setLayout('grid') }, icon('vGallery', 14)),
      h('button', { type: 'button', 'aria-pressed': String(layout === 'list'), 'aria-label': '列表视图', 'data-tip': '列表', onclick: () => this.setLayout('list') }, icon('vList', 14)),
    );
    const starred = list.filter((b) => b.starred);
    const sections = [];
    if (starred.length && !this.query) sections.push(this.section('已加星标', starred, layout, 'starred'));
    sections.push(this.section(this.query ? '搜索结果' : '所有数据表', list, layout, 'all', h('div.section-tools', sortBtn, layoutToggle)));
    if (!list.length) {
      sections.pop();
      sections.push(
        this.query
          ? h('div.empty', h('div.empty-icon', icon('search', 22)), h('h2', '未找到匹配的数据表'), h('p', '请尝试其他关键词。'))
          : h('div.empty', h('div.empty-icon', icon('database', 22)), h('h2', '尚无数据表'), h('p', '从零创建、使用模板，或导入现有电子表格。'), h('button.btn.primary', { type: 'button', onclick: () => this.createBlank() }, icon('plus', 16), '新建数据表')),
      );
    }
    this.listHost.replaceChildren(...sections);
  }

  setLayout(layout) {
    setPref('homeLayout', layout);
    this.renderList();
  }

  section(title, list, layout, key, tools) {
    const headId = `home-sec-${key}`;
    return h(
      'section.home-section',
      { 'aria-labelledby': headId },
      h('div.home-section-head', h('h2.home-section-title', { id: headId }, title), tools || null),
      layout === 'list' ? h('ul.base-rows', list.map((b) => this.baseRow(b))) : h('ul.base-grid', list.map((b) => this.baseCard(b))),
    );
  }

  baseIcon(b, size = 40) {
    return h('span.base-icon', { style: { background: accentColor(b.color), width: `${size}px`, height: `${size}px` }, 'aria-hidden': 'true' }, icon(b.icon || 'table', Math.round(size * 0.5)));
  }

  baseActions(b) {
    const star = h('button.icon-btn', {
      type: 'button',
      'aria-label': b.starred ? `取消星标 ${b.name}` : `加为星标 ${b.name}`,
      'aria-pressed': String(!!b.starred),
      'data-tip': b.starred ? '取消星标' : '星标',
      class: `icon-btn star-btn${b.starred ? ' on' : ''}`,
      onclick: (e) => {
        e.preventDefault();
        this.store.setStarred(b.id, !b.starred);
      },
    }, icon('star', 16, { fill: b.starred ? 'currentColor' : 'none' }));
    const more = h('button.icon-btn', { type: 'button', 'aria-label': `${b.name} 的更多操作`, 'aria-haspopup': 'menu', 'data-tip': '更多' }, icon('more', 16));
    more.addEventListener('click', (e) => {
      e.preventDefault();
      this.openBaseMenu(more, b);
    });
    return h('div.base-actions', star, more);
  }

  baseCard(b) {
    const opened = b.openedAt ? `${timeAgo(b.openedAt)}打开` : `${timeAgo(b.createdAt || Date.now())}创建`;
    const when = b.tables ? `${b.tables} 张表 · ${opened}` : opened;
    const link = h('a.base-card-link', { href: `#/${b.id}` }, this.baseIcon(b), h('span.base-card-text', h('span.base-name', b.name), h('span.base-meta', when)));
    const li = h('li.base-card', { dataset: { base: b.id } }, link, this.baseActions(b));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.openBaseMenu({ x: e.clientX, y: e.clientY }, b);
    });
    return li;
  }

  baseRow(b) {
    const when = b.openedAt ? `${timeAgo(b.openedAt)}打开` : '';
    const li = h('li.base-row', { dataset: { base: b.id } }, h('a.base-row-link', { href: `#/${b.id}` }, this.baseIcon(b, 28), h('span.base-name', b.name), h('span.base-meta', when)), this.baseActions(b));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.openBaseMenu({ x: e.clientX, y: e.clientY }, b);
    });
    return li;
  }

  trashRow(b) {
    return h(
      'li.base-row',
      { dataset: { base: b.id } },
      h('div.base-row-link', this.baseIcon(b, 28), h('span.base-name', b.name), h('span.base-meta', `${timeAgo(b.trashedAt)}删除`)),
      h(
        'div.base-actions.visible',
        h('button.btn.small', { type: 'button', onclick: () => {
          this.store.restoreBase(b.id);
          toast(`已恢复 ${b.name}`);
        } }, icon('restore', 14), '恢复'),
        h('button.btn.small.ghost', { type: 'button', onclick: () => this.purge(b) }, '永久删除'),
      ),
    );
  }

  openBaseMenu(anchor, b) {
    openMenu(anchor, [
      { label: '打开', icon: 'arrowUpRight', onSelect: () => this.app.navigate(b.id) },
      { label: '重命名', icon: 'pencil', onSelect: () => this.rename(b) },
      { label: '更改颜色和图标', icon: 'palette', onSelect: () => this.appearance(anchor instanceof Element ? anchor : null, b) },
      { label: b.starred ? '取消星标' : '加为星标', icon: 'star', onSelect: () => this.store.setStarred(b.id, !b.starred) },
      { label: '创建副本', icon: 'copy', onSelect: () => this.duplicate(b) },
      { type: 'sep' },
      { label: '移至回收站', icon: 'trash', danger: true, onSelect: () => this.trash(b) },
    ], { label: b.name });
  }

  async rename(b) {
    const name = await promptDialog({ title: '重命名数据表', label: '名称', value: b.name, validate: (v) => (v ? null : '请输入名称。') });
    if (name && name !== b.name) await this.store.updateBase(b.id, { name });
  }

  appearance(anchor, b) {
    const panel = appearancePicker(b, (patch) => this.store.updateBase(b.id, patch));
    openPopover(anchor || document.body, panel, { className: 'padded', label: '颜色和图标' });
  }

  async duplicate(b) {
    const t = toast(`正在复制 ${b.name}...`, { timeout: 0 });
    try {
      await this.store.duplicateBase(b.id);
      t.close();
      toast(`已复制 ${b.name}`);
    } catch {
      t.close();
      toast('无法复制该数据表。', { error: true });
    }
  }

  trash(b) {
    this.store.trashBase(b.id);
    toast(`已将 ${b.name} 移至回收站`, { action: { label: '撤销', onClick: () => this.store.restoreBase(b.id) } });
  }

  async purge(b) {
    const ok = await confirmDialog({ title: `永久删除 ${b.name}？`, message: '该数据表、记录及附件将从本地存储中彻底删除。此操作无法撤销。', confirmLabel: '永久删除', danger: true });
    if (ok) await this.store.purgeBase(b.id);
  }

  async emptyTrash() {
    const list = this.store.trashed();
    if (!list.length) return;
    const ok = await confirmDialog({ title: '清空回收站？', message: `${list.length} 个数据表及其文件将被彻底删除。此操作无法撤销。`, confirmLabel: '清空回收站', danger: true });
    if (!ok) return;
    for (const b of list) await this.store.purgeBase(b.id);
  }

  /** Create a base and open it; a second click while it is created does nothing. */
  async create(opts) {
    if (this.creating) return;
    this.creating = true;
    try {
      const id = await this.store.createBase(opts);
      this.app.navigate(id);
    } catch (err) {
      console.error(err);
      toast('无法创建数据表。请检查网络连接后重试。', { error: true });
    } finally {
      this.creating = false;
    }
  }

  createBlank() {
    const colors = BASE_COLORS;
    const color = colors[this.store.bases().length % colors.length];
    return this.create({ name: '未命名数据表', color, icon: 'table' });
  }

  openTemplates() {
    let dlg;
    const pick = (tpl) => {
      dlg.close();
      const built = buildTemplate(tpl, { user: this.store.user });
      return this.create({ name: tpl.name, color: tpl.color, icon: tpl.icon, doc: built.doc, records: built.records });
    };
    dlg = openDialog({
      title: '从模板创建',
      className: 'wide',
      body: h(
        'ul.template-grid',
        TEMPLATES.map((tpl) =>
          h('li', h('button.template-card', { type: 'button', onclick: () => pick(tpl) }, h('span.base-icon', { style: { background: accentColor(tpl.color) }, 'aria-hidden': 'true' }, icon(tpl.icon, 20)), h('span.template-name', tpl.name), h('span.template-desc', tpl.description))),
        ),
      ),
    });
  }

  async importBackup() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const data = readBaseJson(await file.text());
      const id = await this.store.createBase({ name: data.doc.name, color: data.doc.color, icon: data.doc.icon, doc: data.doc, records: data.records });
      toast(`已恢复 ${data.doc.name}`);
      this.app.navigate(id);
    } catch (err) {
      toast(err.message || '无法恢复该文件。', { error: true });
    }
  }

  importCsv() {
    importFileDialog({
      app: this.app,
      onDone: async ({ name, doc, records }) => {
        const id = await this.store.createBase({ name, color: 'green', icon: 'table', doc, records });
        this.app.navigate(id);
      },
    });
  }
}

/** Color and icon pickers for a base. onChange gets { color } or { icon }. */
export function appearancePicker(b, onChange) {
  let current = { color: b.color, icon: b.icon || 'table' };
  const swatches = BASE_COLORS.map((c) => h('button.swatch', { type: 'button', role: 'radio', 'aria-label': c, style: { background: accentColor(c), color: '#fff' }, onclick: () => {
    current = { ...current, color: c };
    onChange({ color: c });
    paint();
  } }));
  const choices = BASE_ICONS.map((name) => h('button.icon-choice', { type: 'button', role: 'radio', 'aria-label': name, onclick: () => {
    current = { ...current, icon: name };
    onChange({ icon: name });
    paint();
  } }, icon(name, 16)));
  const colors = h('div.swatches', { role: 'radiogroup', 'aria-label': '颜色' }, swatches);
  const icons = h('div.icon-grid', { role: 'radiogroup', 'aria-label': '图标' }, choices);
  // Marked in place, so the button just chosen keeps focus.
  const paint = () => {
    swatches.forEach((btn, i) => {
      const on = current.color === BASE_COLORS[i];
      btn.setAttribute('aria-checked', String(on));
      btn.replaceChildren(...(on ? [icon('check', 14)] : []));
    });
    choices.forEach((btn, i) => {
      const on = current.icon === BASE_ICONS[i];
      btn.setAttribute('aria-checked', String(on));
      btn.style.background = on ? accentColor(current.color) : '';
      btn.style.color = on ? '#fff' : '';
    });
  };
  paint();
  return h('div.appearance', h('div.popover-title', '颜色'), colors, h('div.popover-title', { style: { marginTop: '12px' } }, '图标'), icons);
}
