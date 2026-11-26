/**
 * Templates on the home screen: cards with live previews (hover or focus to
 * play), a filterable gallery, and a preview dialog that creates a project
 * from the chosen template.
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { clock } from '../lib/time.js';
import { TEMPLATES, TEMPLATE_CATEGORIES, templateDraft } from '../model/templates.js';
import { openDialog, toast } from './dialog.js';
import { TemplatePreview } from './template-preview.js';

const CATEGORY = new Map(TEMPLATE_CATEGORIES.map((c) => [c.id, c.label]));

function slotCount(tpl) {
  return templateDraft(tpl).media.filter((m) => m.spec?.slot).length;
}

/** Shared previews per template and size (drawing the art is the costly part). */
const previews = new Map();
const activeCards = new WeakMap(); // shared preview -> cards currently playing it
function previewFor(tpl, width) {
  const key = `${tpl.id}:${width}`;
  let p = previews.get(key);
  if (!p) {
    p = new TemplatePreview(tpl, { width });
    p.ready().catch(() => {});
    previews.set(key, p);
  }
  return p;
}

/** A canvas mirroring a shared preview (cards can appear twice: home strip and gallery). */
function mirror(p) {
  const c = h('canvas.tpl-canvas', { width: p.canvas.width, height: p.canvas.height, 'aria-hidden': 'true' });
  const g = c.getContext('2d');
  const copy = () => g?.drawImage(p.canvas, 0, 0);
  p.ready().then(copy, () => {});
  copy();
  return { el: c, copy };
}

/** A template card; onChoose(tpl) opens it. */
export function templateCard(tpl, { onChoose }) {
  const p = previewFor(tpl, 360);
  const users = activeCards.get(p) || new Set();
  activeCards.set(p, users);
  const view = mirror(p);
  const slots = slotCount(tpl);
  const shape = tpl.ratio === '9:16' || tpl.ratio === '4:5' || tpl.ratio === '3:4' ? 'tall' : tpl.ratio === '1:1' ? 'square' : 'wide';
  const facts = [CATEGORY.get(tpl.category), clock(p.duration), slots ? `${slots} 个插槽` : null].filter(Boolean);
  // The name starts with the visible text in reading order (ratio badge, name, details), then the description.
  const btn = h('button.tpl-card', {
    type: 'button',
    'aria-label': `${tpl.ratio} ${tpl.name}, ${facts.join(', ')}. ${tpl.description}`,
    dataset: { shape },
  },
  h('span.tpl-thumb', view.el, h('span.tpl-badge', tpl.ratio), ' ', h('span.tpl-play', icon('play', 14))),
  ' ',
  h('span.tpl-meta', h('span.tpl-name', tpl.name), ' ', h('span.tpl-sub', facts.join('  ·  '))));
  let raf = 0;
  const start = () => {
    if (raf || !btn.isConnected) return;
    users.add(btn);
    p.play();
    const loop = () => {
      if (!btn.isConnected) {
        stop();
        return;
      }
      view.copy();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
    users.delete(btn);
    if (!users.size) p.stop();
    if (btn.isConnected) view.copy();
  };
  btn.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && start());
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('focus', () => btn.matches(':focus-visible') && start());
  btn.addEventListener('blur', stop);
  btn.addEventListener('click', () => {
    stop();
    onChoose(tpl);
  });
  return btn;
}

/** The Templates view: search, category chips and the gallery. */
export function templatesView({ onChoose, initialCategory = 'all' }) {
  let cat = initialCategory;
  let q = '';
  const grid = h('div.tpl-grid', { role: 'list', 'aria-label': '模板' });
  const chips = h('div.home-chips', { role: 'group', 'aria-label': '模板分类' });
  const cats = [{ id: 'all', label: '全部' }, ...TEMPLATE_CATEGORIES];
  const renderChips = () => chips.replaceChildren(...cats.map((c) => h('button.home-chip', {
    type: 'button',
    'aria-pressed': String(c.id === cat),
    onclick: () => {
      cat = c.id;
      renderChips();
      renderGrid();
    },
  }, c.label)));
  const renderGrid = () => {
    const list = TEMPLATES.filter((t) => (cat === 'all' || t.category === cat) && (!q || `${t.name} ${t.description} ${CATEGORY.get(t.category)}`.toLowerCase().includes(q)));
    grid.replaceChildren(...(list.length
      ? list.map((t) => h('div.tpl-item', { role: 'listitem' }, templateCard(t, { onChoose }), h('p.tpl-desc', t.description)))
      : [h('div.home-empty', { role: 'listitem' }, icon('search', 28), h('p', '没有匹配搜索的模板。'))]));
  };
  const search = h('input.input.home-search', { type: 'search', placeholder: '搜索模板', 'aria-label': '搜索模板' });
  search.addEventListener('input', () => {
    q = search.value.trim().toLowerCase();
    renderGrid();
  });
  renderChips();
  renderGrid();
  return h('section.home-section', { 'aria-labelledby': 'templates-h' },
    h('div.section-head',
      h('div', h('h1#templates-h.view-title', '模板'), h('p.view-sub', '预置丰富文字、动效与音效的成熟工程，直接替换您自己的照片与视频片段。')),
      h('div.section-tools', h('div.search-wrap', icon('search', 14), search))),
    chips,
    grid,
  );
}

/** Preview a template larger and create a project from it. */
export function openTemplateDialog(tpl, { onUse, actionLabel = '使用模板', busyLabel = '正在创建项目' }) {
  const p = new TemplatePreview(tpl, { width: tpl.ratio === '9:16' ? 300 : tpl.ratio === '16:9' || tpl.ratio === '21:9' ? 640 : 420 });
  p.canvas.classList.add('tpl-dialog-canvas');
  p.ready().then(() => {
    if (p.canvas.isConnected) p.play();
  }, () => {});
  const slots = slotCount(tpl);
  const use = h('button.btn.primary', { type: 'button' }, icon('plus', 16), actionLabel);
  const cancel = h('button.btn', { type: 'button' }, '取消');
  const status = h('p.tpl-status', { role: 'status' });
  const body = h('div.tpl-dialog',
    h('div.tpl-dialog-stage', p.canvas),
    h('div.tpl-dialog-info',
      h('p.dialog-text', tpl.description),
      h('ul.tpl-facts',
        h('li', icon('ratio', 14), `${tpl.ratio} 宽高比`),
        h('li', icon('clock', 14), `${clock(p.duration)} 时长`),
        slots ? h('li', icon('image', 14), `${slots} 个可替换媒体占位`) : null,
        h('li', icon('pencil', 14), '时间轴上的所有内容均可自由编辑')),
      status));
  // While the template is being made the dialog stays: closing it (Escape, the X, a click
  // outside) did not stop the work, and the project then opened, or the clips landed, unasked.
  let busy = false;
  const d = openDialog({ title: tpl.name, body, actions: [cancel, use], className: 'tpl-dialog-wrap', wide: true, beforeClose: () => !busy, onClose: () => p.stop({ poster: false }) });
  const closeBtn = d.el.querySelector('.dialog-close');
  cancel.addEventListener('click', () => d.close());
  use.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    use.disabled = true;
    cancel.disabled = true;
    if (closeBtn) closeBtn.disabled = true;
    status.textContent = `${busyLabel}...`;
    try {
      await onUse(tpl, { onProgress: ({ done, total }) => (status.textContent = `${busyLabel}... ${Math.round((done / Math.max(1, total)) * 100)}%`) });
      busy = false;
      d.close();
    } catch (err) {
      console.error(err);
      busy = false;
      status.textContent = '';
      toast(err?.message || "无法创建项目。", { kind: 'error' });
      use.disabled = false;
      cancel.disabled = false;
      if (closeBtn) closeBtn.disabled = false;
    }
  });
  return d;
}
