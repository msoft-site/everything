/**
 * The Generate panel: Generate Vectors, Generative Shape Fill and Generate
 * Patterns. Describe what you want, pick a content type, style, colors and
 * detail (optionally matching the selected artwork's style), and Generate:
 * pictures from 本地智能引擎 are traced into vector art and offered as
 * variations. The first one is placed (fitted to the selection or the
 * artboard, or clipped into the selected shape); choosing another swaps it
 * in place. Pattern variations become pattern swatches when chosen.
 */
import { h, announce } from '../../lib/dom.js';
import { Panel } from '../../ui/panels/panel.js';
import { icon } from '../../ui/icons.js';
import { colorTargets, collectColors } from '../paint/edit-colors.js';
import { CONTENT_TYPES, STYLES, COLOR_MODES, DETAIL_LABELS, PROMPT_IDEAS, STYLE_DESCRIBE_PROMPT, cleanPrompt } from './prompts.js';
import { requireAI, askChat, plainReply, isAbort, aiErrorMessage } from './ai.js';
import { generateVariations, ratioFor, resultSvg, svgDataUrl } from './vectorize.js';
import { placementTarget, placeArt, swapArt, placementAlive, shapeFill, selectedShape, applyGeneratedPattern, patternTargets } from './place.js';
import { progressBlock, availabilityNotice, segmented, selectField, nextId } from './ui.js';

export const MODES = [
  { id: 'vectors', label: '矢量图', icon: 'gen-vectors', title: '生成矢量图' },
  { id: 'shapeFill', label: '形状填充', icon: 'gen-shape-fill', title: '生成形状填充' },
  { id: 'pattern', label: '图案', icon: 'gen-pattern', title: '生成图案' },
];

const VECTOR_TYPES = CONTENT_TYPES.filter((c) => c.id !== 'pattern');

export const SETTINGS_DEFAULTS = Object.freeze({ contentType: 'subject', style: 'flat', color: 'full', detail: 2, count: 3, reference: false });

/** Saved panel settings (the prompt itself is not saved). */
export function loadSettings(prefs) {
  const s = prefs?.get('generativeSettings');
  const out = { ...SETTINGS_DEFAULTS, ...(s && typeof s === 'object' ? s : {}) };
  if (!VECTOR_TYPES.some((c) => c.id === out.contentType)) out.contentType = SETTINGS_DEFAULTS.contentType;
  if (!STYLES.some((c) => c.id === out.style)) out.style = SETTINGS_DEFAULTS.style;
  if (!COLOR_MODES.some((c) => c.id === out.color)) out.color = SETTINGS_DEFAULTS.color;
  out.detail = Math.max(1, Math.min(3, Math.round(Number(out.detail) || 2)));
  out.count = Math.max(1, Math.min(4, Math.round(Number(out.count) || 3)));
  out.reference = Boolean(out.reference);
  return out;
}

/**
 * A style reference from the selection: its main colors, and for a placed
 * image a one-sentence description of its look (asked from the chat model).
 */
export async function styleReference(editor, client, { signal } = {}) {
  const doc = editor.doc;
  const top = editor.topSelection().map((id) => doc.get(id)).filter(Boolean);
  if (!top.length) return null;
  const leaves = colorTargets(doc, top.map((n) => n.id));
  const colors = collectColors(leaves).slice(0, 6).map((c) => c.color);
  let description = '';
  const img = top.find((n) => n.type === 'image');
  const asset = img ? doc.assets.get(img.asset) : null;
  if (asset?.data && !asset.external) {
    try {
      description = plainReply(await askChat(client, STYLE_DESCRIBE_PROMPT, { signal, image: asset.data })).slice(0, 400);
    } catch (err) {
      if (isAbort(err)) throw err;
    }
  }
  if (!description && leaves.length) {
    const strokes = leaves.filter((n) => n.stroke && !n.fill).length;
    if (strokes > leaves.length / 2) description = 'line art drawn with strokes, no fills';
  }
  return colors.length || description ? { colors, description } : null;
}

export class GeneratePanel extends Panel {
  static id = 'generate';
  static title = 'AI 生成';
  static icon = 'sparkles';

  constructor(app) {
    super(app);
    this.mode = 'vectors';
    this.settings = loadSettings(app.prefs);
    this.prompt = '';
    this.variations = [];
    this.variationMode = null;
    this.variationSet = '';
    this.variationPrompt = '';
    this.active = -1;
    this.placement = null;
    this.controller = null;
  }

  get busy() {
    return Boolean(this.controller);
  }

  #save(patch) {
    Object.assign(this.settings, patch);
    this.app.prefs?.set('generativeSettings', { ...this.settings });
  }

  build() {
    const app = this.app;
    this.modeSeg = segmented('生成类型', MODES, this.mode, (v) => this.setMode(v), { className: 'gen-modes' });
    this.notice = availabilityNotice(app);
    const pid = nextId('gen-prompt');
    this.promptBox = h('textarea.gen-prompt', { id: pid, rows: 3, maxlength: 600, placeholder: '描述要生成的内容', oninput: () => (this.prompt = this.promptBox.value) });
    this.promptBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.generate();
      }
    });
    const ideaBtn = h('button.icon-btn.small.gen-idea-btn', { type: 'button', 'aria-label': '推荐提示词', 'data-tip': '推荐提示词', onclick: () => this.suggest() }, icon('gen-idea', 14));
    this.typeSeg = segmented('内容类型', VECTOR_TYPES, this.settings.contentType, (v) => this.#save({ contentType: v }));
    this.styleSel = selectField('风格', STYLES, this.settings.style, (v) => this.#save({ style: v }));
    this.colorSel = selectField('色彩', COLOR_MODES, this.settings.color, (v) => this.#save({ color: v }));
    const did = nextId('gen-detail');
    this.detailOut = h('output.gen-detail-out', { for: did });
    this.detail = h('input.gen-detail', { type: 'range', id: did, min: 1, max: 3, step: 1, value: this.settings.detail });
    this.detail.addEventListener('input', () => {
      this.#save({ detail: Number(this.detail.value) });
      this.#detailText();
    });
    const rid = nextId('gen-ref');
    this.refBox = h('input', { type: 'checkbox', id: rid, checked: this.settings.reference, onchange: () => this.#save({ reference: this.refBox.checked }) });
    this.refRow = h('div.gen-check', this.refBox, h('label', { for: rid }, '参考选中对象的风格'));
    this.countSel = selectField('变体数量', [1, 2, 3, 4].map((n) => ({ id: String(n), label: String(n) })), String(this.settings.count), (v) => this.#save({ count: Number(v) }));
    this.target = h('p.gen-target');
    this.goBtn = h('button.btn.primary.block.gen-go', { type: 'button', onclick: () => this.generate() }, icon('sparkles', 14), h('span', '生成'));
    this.progress = progressBlock({ label: '正在生成', onCancel: () => this.cancel() });
    this.status = h('p.gen-status', { role: 'status' });
    this.tiles = h('div.gen-tiles', { role: 'group', 'aria-label': '变体' });
    this.placeCopyBtn = h('button.btn.small', { type: 'button', onclick: () => this.placeCopy() }, icon('plus', 14), h('span', '放置副本'));
    this.actions = h('div.gen-actions', this.placeCopyBtn);
    this.el.append(
      this.modeSeg.el,
      this.notice.el,
      h('div.gen-field', h('div.gen-label-row', h('label.gen-label', { for: pid }, '提示词'), ideaBtn), this.promptBox),
      this.typeSeg.el,
      this.styleSel.el,
      this.colorSel.el,
      h('div.gen-field', h('label.gen-label', { for: did }, '细节程度'), h('div.gen-detail-row', this.detail, this.detailOut)),
      this.refRow,
      this.countSel.el,
      this.target,
      this.goBtn,
      this.progress.el,
      this.status,
      this.tiles,
      this.actions,
    );
    this.#detailText();
    this.app.on('user', () => this.visible && this.update());
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.visible && this.update());
      window.addEventListener('offline', () => this.visible && this.update());
    }
    this.setMode(this.mode);
  }

  #detailText() {
    const d = Number(this.detail.value);
    this.detailOut.textContent = DETAIL_LABELS[d - 1];
    this.detail.setAttribute('aria-valuetext', DETAIL_LABELS[d - 1]);
  }

  menu() {
    return [
      { label: '推荐提示词', run: () => (this.ensureBuilt(), this.suggest()) },
      { label: '清除变体', enabled: this.variations.length > 0, run: () => this.clearVariations() },
      '-',
      'panel.generationHistory',
    ];
  }

  setMode(mode) {
    if (!MODES.some((m) => m.id === mode)) return;
    this.mode = mode;
    if (!this.built) return;
    this.modeSeg.set(mode);
    this.typeSeg.el.hidden = mode !== 'vectors';
    this.promptBox.placeholder = {
      vectors: '描述要生成的内容，如“蜷缩睡着的狐狸”',
      shapeFill: '描述填充形状的内容，如“秋季落叶”',
      pattern: '描述图案，如“小草莓和叶子”',
    }[mode];
    this.update();
  }

  /** Fill the form from a history entry or settings object. */
  use({ mode, prompt, settings } = {}) {
    this.ensureBuilt();
    if (settings) {
      const s = loadSettings({ get: () => ({ ...this.settings, ...settings }) });
      this.#save(s);
      this.typeSeg.set(s.contentType);
      this.styleSel.sel.value = s.style;
      this.colorSel.sel.value = s.color;
      this.detail.value = String(s.detail);
      this.refBox.checked = s.reference;
      this.countSel.sel.value = String(s.count);
      this.#detailText();
    }
    if (prompt != null) {
      this.prompt = prompt;
      this.promptBox.value = prompt;
    }
    if (mode) this.setMode(mode);
  }

  focusPrompt() {
    this.ensureBuilt();
    this.promptBox.focus();
  }

  suggest() {
    const ct = this.mode === 'pattern' ? 'pattern' : this.mode === 'shapeFill' ? 'pattern' : this.settings.contentType;
    const list = PROMPT_IDEAS[ct] || PROMPT_IDEAS.subject;
    const others = list.filter((p) => p !== this.promptBox.value);
    this.promptBox.value = this.prompt = others[Math.floor(Math.random() * others.length)] || list[0];
    this.promptBox.focus();
  }

  /** The content type a generation in the current mode uses. */
  contentType() {
    return this.mode === 'pattern' ? 'pattern' : this.mode === 'shapeFill' ? 'scene' : this.settings.contentType;
  }

  #targetText(ed) {
    if (!ed) return { text: '打开文档以在其中生成。', ok: false };
    if (this.mode === 'shapeFill') {
      return selectedShape(ed) ? { text: '填充所选形状。', ok: true } : { text: '请选择一个闭合形状进行填充。', ok: false };
    }
    if (this.mode === 'pattern') {
      const n = patternTargets(ed).length;
      return { text: n ? `添加图案色板并填充${n === 1 ? '所选对象' : `${n} 个所选对象`}。` : '添加图案色板。', ok: true };
    }
    return { text: ed.selection.size ? '适应所选内容。' : `适应${ed.artboard()?.name || '画板'}。`, ok: true };
  }

  update() {
    if (!this.built) return;
    const ed = this.editor;
    const ready = this.notice.refresh();
    const t = this.#targetText(ed);
    this.target.textContent = t.text;
    this.target.classList.toggle('warn', !t.ok);
    this.goBtn.disabled = this.busy || !t.ok || !ready;
    const hasSel = Boolean(ed?.selection.size) && this.mode !== 'shapeFill';
    this.refBox.disabled = !hasSel;
    this.refRow.classList.toggle('disabled', !hasSel);
    this.refRow.title = hasSel ? '' : '选择图形以参考其风格';
    this.#renderTiles();
  }

  clearVariations() {
    this.variations = [];
    this.active = -1;
    this.placement = null;
    this.status.textContent = '';
    this.#renderTiles();
  }

  cancel() {
    this.controller?.abort();
  }

  #renderTiles() {
    const vs = this.variations;
    this.tiles.hidden = !vs.length;
    this.actions.hidden = !vs.length || this.variationMode === 'pattern';
    this.placeCopyBtn.disabled = this.active < 0 || (this.variationMode === 'shapeFill' && !selectedShape(this.editor));
    if (this.tiles.childElementCount !== vs.length || this.tiles.dataset.set !== this.variationSet) {
      this.tiles.dataset.set = this.variationSet || '';
      this.tiles.replaceChildren(
        ...vs.map((v, i) => {
          v.url ||= svgDataUrl(resultSvg(v.result, { background: this.variationMode === 'scene' ? null : '#ffffff' }));
          const label = this.variationMode === 'pattern' ? `将变体 ${i + 1} 添加到色板` : `使用变体 ${i + 1}`;
          return h('button.gen-tile', { type: 'button', 'aria-label': label, 'data-tip': label, onclick: () => this.choose(i) }, h('img', { src: v.url, alt: '', draggable: false }));
        }),
      );
    }
    [...this.tiles.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === this.active)));
  }

  /** Generate variations with the current form. */
  async generate() {
    if (this.busy) return;
    const app = this.app;
    const ed = this.editor;
    if (!ed) return;
    const prompt = cleanPrompt(this.promptBox.value);
    if (!prompt && this.mode !== 'pattern') {
      this.status.textContent = '请先输入要生成的描述。';
      this.promptBox.focus();
      return;
    }
    const mode = this.mode;
    const shape = mode === 'shapeFill' ? selectedShape(ed) : null;
    if (mode === 'shapeFill' && !shape) {
      this.status.textContent = '请选择一个闭合形状进行填充。';
      return;
    }
    let client;
    try {
      client = await requireAI(app);
    } catch (err) {
      this.status.textContent = aiErrorMessage(err);
      this.update();
      return;
    }
    if (!client) return;
    const contentType = this.contentType();
    let target = null;
    let ratio = { w: 1, h: 1 };
    try {
      if (mode === 'vectors') {
        target = placementTarget(ed, contentType);
        ratio = ratioFor(target.rect.w, target.rect.h);
      } else if (mode === 'shapeFill') {
        const b = ed.selectionBounds(false);
        ratio = ratioFor(b.w, b.h);
      }
    } catch (err) {
      this.status.textContent = err.message;
      return;
    }
    const settings = { ...this.settings, contentType, prompt };
    const controller = (this.controller = new AbortController());
    this.goBtn.disabled = true;
    this.progress.start(0);
    this.progress.setLabel('正在生成');
    this.status.textContent = '';
    let out = null;
    try {
      let reference = null;
      if (settings.reference && mode !== 'shapeFill' && ed.selection.size) {
        this.progress.setLabel('正在读取所选风格');
        reference = await styleReference(ed, client, { signal: controller.signal });
        this.progress.setLabel('正在生成');
      }
      out = await generateVariations(app, client, { ...settings, reference, ratio }, {
        count: settings.count,
        signal: controller.signal,
        onProgress: (v) => this.progress.set(v),
      });
    } catch (err) {
      this.status.textContent = isAbort(err) ? '已取消。' : aiErrorMessage(err);
      if (!isAbort(err)) announce(this.status.textContent);
    } finally {
      this.controller = null;
      this.progress.stop();
      this.update();
    }
    if (!out) return;
    this.variations = out.variations;
    this.variationMode = mode === 'vectors' && contentType === 'scene' ? 'scene' : mode;
    this.variationSet = `${Date.now()}`;
    this.variationPrompt = prompt;
    this.active = -1;
    this.placement = null;
    const histSettings = { ...settings };
    delete histSettings.prompt;
    app.generativeHistory?.add({ kind: mode, prompt, settings: histSettings, items: out.variations.map((v) => ({ result: v.result })) });
    const n = out.variations.length;
    const failed = out.failed ? ` ${out.failed} 个无法生成。` : '';
    // Place the first variation where the generation was asked for (unless that document closed).
    if (mode !== 'pattern' && app.editors.includes(ed) && app.editor === ed) {
      try {
        if (mode === 'vectors') this.placement = placeArt(ed, out.variations[0].result, target, { prompt });
        else if (ed.doc.get(shape.id)) this.placement = shapeFill(ed, shape.id, out.variations[0].result, { prompt });
        if (this.placement) this.active = 0;
      } catch (err) {
        this.status.textContent = err.message;
      }
    }
    if (!this.status.textContent) {
      this.status.textContent = mode === 'pattern'
        ? `已生成 ${n} 个图案变体。点击可添加到色板。${failed}`
        : `已生成 ${n} 个变体。${n > 1 ? '点击可在画板中替换。' : ''}${failed}`;
    }
    announce(this.status.textContent);
    this.#renderTiles();
  }

  /** Use variation i: swap it in, place it, or (patterns) add it to Swatches. */
  choose(i) {
    const v = this.variations[i];
    const ed = this.editor;
    if (!v || !ed) return;
    const prompt = this.variationPrompt;
    try {
      if (this.variationMode === 'pattern') {
        const r = applyGeneratedPattern(ed, v.result, { prompt });
        this.status.textContent = `已添加“${r.name}”到色板${r.applied ? `并填充了 ${r.applied === 1 ? '所选对象' : `${r.applied} 个对象`}` : ''}。`;
      } else if (placementAlive(this.placement) && this.placement.doc === ed.doc) {
        this.placement = swapArt(ed, this.placement, v.result);
      } else {
        this.placement = this.#placeNew(ed, v.result);
        if (!this.placement) return;
      }
    } catch (err) {
      this.app.notify(err.message, { error: true });
      return;
    }
    this.active = i;
    this.#renderTiles();
    announce(this.variationMode === 'pattern' ? this.status.textContent : `已放置变体 ${i + 1}`);
  }

  #placeNew(ed, result) {
    const prompt = this.variationPrompt;
    if (this.variationMode === 'shapeFill') {
      const shape = selectedShape(ed);
      if (!shape) {
        this.app.notify('请选择一个闭合形状进行填充。');
        return null;
      }
      return shapeFill(ed, shape.id, result, { prompt });
    }
    return placeArt(ed, result, placementTarget(ed, this.variationMode === 'scene' ? 'scene' : 'subject'), { prompt });
  }

  /** Place the active variation again as new art (fitted to the current selection or artboard). */
  placeCopy() {
    const v = this.variations[this.active];
    const ed = this.editor;
    if (!v || !ed) return;
    try {
      const rec = this.#placeNew(ed, v.result);
      if (rec) this.placement = rec;
    } catch (err) {
      this.app.notify(err.message, { error: true });
    }
  }
}

/** Open the Generate panel in a mode and focus its prompt. */
export function openGenerate(app, mode = 'vectors', opts = {}) {
  app.openPanel('generate');
  const p = app.dock?.panels.get('generate');
  if (!p) return null;
  p.use({ mode, ...opts });
  p.focusPrompt();
  return p;
}
