// Info panel: two color readouts under the pointer (each in a chosen color
// model), pointer position and selection / transform / ruler sizes in ruler
// units, one readout per color sampler (before/after values while a change
// is previewed), and document status lines chosen in Info Panel Options.
import type { Editor } from '../../editor';
import { registerCommand, type Panel } from '../../app/registry';
import { escapeXML } from '../../model/assets';
import { svg } from '../../app/icons';
import { selectedRoots } from '../../model/layers';
import { selectionFrame } from '../../model/transform';
import { documentTileIds } from '../../model/pixel-layer';
import { documentPpi } from '../../model/text-layer';
import type { PhotoDocument } from '../../model/document';
import { formatUnit, isDefaultScale, round, RULER_UNITS, sampleAverage, short } from '../../imaging/measure/geometry';
import { formatBytes, imageBytes } from '../transform/math';
import { annotationsOf, baseImage, lengthText, onSnapshot, previewImage, rulerUnit } from './state';
import { channels, compareChannels, isModel, onEngineReady, profileText, READOUT_MODELS, type Channel, type Color, type ReadoutModel } from './readout';
import { deleteSampler, sampleSize, samplerColors, samplers } from './samplers';
import { rulerReadout } from './ruler';
import { formDialog } from '../../ui/dialog';

// ----- Options (remembered per browser) -----
export type StatusItem = 'dimensions' | 'profile' | 'size' | 'memory' | 'scale' | 'tool';
const STATUS_ITEMS: [StatusItem, string][] = [
  ['dimensions', '尺寸和分辨率'],
  ['profile', '颜色配置文件和模式'],
  ['size', '文档大小（拼合 / 图层）'],
  ['memory', '像素图块占用的内存'],
  ['scale', '测量比例'],
  ['tool', '当前工具提示'],
];
type InfoOptions = { first: ReadoutModel; second: ReadoutModel; samplers: ReadoutModel[]; status: StatusItem[] };
const defaults: InfoOptions = { first: 'actual', second: 'cmyk', samplers: [], status: ['dimensions', 'profile', 'size'] };
let options: InfoOptions = load();
function load(): InfoOptions {
  try {
    const v = JSON.parse(localStorage.getItem('photo-studio-info') ?? 'null');
    if (v && typeof v === 'object')
      return {
        first: isModel(v.first) ? v.first : defaults.first,
        second: isModel(v.second) ? v.second : defaults.second,
        samplers: Array.isArray(v.samplers) ? v.samplers.map((m: unknown) => (isModel(m) ? m : 'actual')).slice(0, 10) : [],
        status: Array.isArray(v.status) ? v.status.filter((s: unknown) => STATUS_ITEMS.some(([id]) => id === s)) : defaults.status,
      };
  } catch {
    /* Optional. */
  }
  return structuredClone(defaults);
}
function save() {
  try {
    localStorage.setItem('photo-studio-info', JSON.stringify(options));
  } catch {
    /* Optional. */
  }
}
const samplerModel = (i: number): ReadoutModel => options.samplers[i] ?? 'actual';

// ----- Values -----
function pointerColors(e: Editor): { before: Color | null; after?: Color | null } {
  const p = e.pointerInfo;
  if (!p || p.x < 0 || p.y < 0 || p.x >= e.doc.width || p.y >= e.doc.height) return { before: null };
  const base = baseImage(e),
    pre = previewImage(e),
    n = sampleSize(e);
  return {
    before: base ? sampleAverage(base, p.x, p.y, n) : null,
    ...(pre && pre.width === e.doc.width ? { after: sampleAverage(pre, p.x, p.y, n) } : {}),
  };
}
/** Width and height shown beside the position: the transform frame, the
 * selection bounds, or nothing. */
function sizeReadout(e: Editor): { label: string; w: string; h: string; extra?: [string, string][] } | null {
  const r = e.tool === 'ruler' ? rulerReadout(e) : undefined;
  if (r) return { label: '标尺', w: r.w, h: r.h, extra: [['A', r.angle], ['L', r.metrics.l2 !== undefined ? `${r.l1} / ${r.l2}` : r.l1]] };
  if (e.transform.active && e.transform.document) {
    const f = selectionFrame(selectedRoots(e.transform.document.layers, e.selectedIds));
    if (f) return { label: '变换', w: lengthText(e, f.width, 'x'), h: lengthText(e, f.height, 'y'), extra: [['∠', `${round(f.rotation, 1)}°`]] };
  }
  const b = e.doc.selection;
  if (b) return { label: '选区', w: lengthText(e, b.width, 'x'), h: lengthText(e, b.height, 'y') };
  return null;
}
let tileCache: { doc: PhotoDocument; bytes: number } | undefined;
function layerBytes(e: Editor) {
  if (tileCache?.doc !== e.doc) {
    let bytes = 0;
    for (const id of documentTileIds(e.doc)) if (e.assets.tiles.has(id)) bytes += e.assets.tiles.get(id).byteLength;
    tileCache = { doc: e.doc, bytes };
  }
  return tileCache.bytes;
}
/** One document status line (label, text); also shown in the status bar. */
export function statusLine(e: Editor, item: StatusItem): [string, string] {
  const d = e.doc;
  const ppi = documentPpi(d);
  if (item === 'dimensions')
    return ['尺寸', `${d.width} × ${d.height} 像素 (${formatUnit(d.width, 'in', ppi, d.width)} × ${formatUnit(d.height, 'in', ppi, d.height)} 英寸，${round(ppi, ppi % 1 ? 1 : 0)} ppi)`];
  if (item === 'profile') return ['配置文件', `${profileText(e)} · ${e.colorModeLabel}/${d.bitsPerChannel ?? 8}`];
  if (item === 'size') {
    const channels = d.mode === 'cmyk' ? 4 : d.mode === 'grayscale' || d.mode === 'bitmap' || d.mode === 'duotone' ? 1 : 3;
    return ['大小', `${formatBytes(imageBytes(d.width, d.height, d.bitsPerChannel ?? 8, channels))} 拼合 / ${formatBytes(layerBytes(e))} 图层`];
  }
  if (item === 'memory') return ['内存', `${formatBytes(e.assets.tiles.bytes)}（${e.assets.tiles.size.toLocaleString()} 个图块，含历史记录）`];
  if (item === 'scale') {
    const s = annotationsOf(d).scale;
    return ['比例', isDefaultScale(s) ? '1 像素 = 1 像素' : `${short(s!.pixels, 2)} 像素 = ${short(s!.length, 4)} ${s!.units}`];
  }
  return ['工具', toolHint(e)];
}
const statusLines = (e: Editor) => options.status.map((item) => statusLine(e, item));
function toolHint(e: Editor) {
  const hints: Record<string, string> = {
    'color-sampler': '单击以添加取样器，拖动以移动，Alt+单击以删除。',
    ruler: '拖动以测量；按住 Alt 拖动端点可引出第二条测量线。',
    count: '单击以计数；按住 Alt 单击标记以移除。',
    note: '单击以固定注释；拖动注释以移动。',
    eyedropper: '单击以吸取前景色；按住 Alt 单击吸取背景色。',
  };
  return hints[e.tool] ?? e.activeTool?.label ?? '';
}

// ----- Markup -----
const modelSelect = (attr: string, value: ReadoutModel, label: string) =>
  `<select ${attr} aria-label="${escapeXML(label)}" class="info-model">${READOUT_MODELS.map(([id, l]) => `<option value="${id}" ${id === value ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const rows = (list: Channel[], key: string) =>
  `<dl class="info-values">${list.map(([l], i) => `<dt>${escapeXML(l)}</dt><dd data-v="${key}-${i}"></dd>`).join('')}</dl>`;

function structureKey(e: Editor) {
  const size = sizeReadout(e);
  return JSON.stringify([options, samplers(e).length, e.doc.mode, rulerUnit(e), size?.label, size?.extra?.length, e.hasDocument]);
}
function build(e: Editor, el: HTMLElement) {
  const unit = rulerUnit(e);
  const size = sizeReadout(e);
  const blank = (m: ReadoutModel) => channels(e, null, m);
  const list = samplers(e);
  el.innerHTML = `<div class="info-readouts"><section class="info-block"><header>${svg('pipette', 13)}${modelSelect('data-info-model="first"', options.first, '第一读数')}</header>${rows(blank(options.first), 'p1')}</section><section class="info-block"><header>${svg('pipette', 13)}${modelSelect('data-info-model="second"', options.second, '第二读数')}</header>${rows(blank(options.second), 'p2')}</section></div><div class="info-readouts info-geometry"><section class="info-block"><header>${svg('crosshair', 13)}<select data-info-unit aria-label="标尺单位" class="info-model">${RULER_UNITS.map(([id, l]) => `<option value="${id}" ${id === unit ? 'selected' : ''}>${l}</option>`).join('')}</select></header><dl class="info-values"><dt>X</dt><dd data-v="x"></dd><dt>Y</dt><dd data-v="y"></dd></dl></section><section class="info-block"><header>${svg('scan', 13)}<span>${size ? escapeXML(size.label) : '大小'}</span></header><dl class="info-values"><dt>W</dt><dd data-v="w"></dd><dt>H</dt><dd data-v="h"></dd>${(size?.extra ?? []).map(([l], i) => `<dt>${escapeXML(l)}</dt><dd data-v="extra-${i}"></dd>`).join('')}</dl></section></div>${
    list.length
      ? `<div class="info-readouts info-samplers">${list.map((_, i) => `<section class="info-block sampler"><header><b class="sampler-number">#${i + 1}</b>${modelSelect(`data-sampler-model="${i}"`, samplerModel(i), `取样器 ${i + 1} 读数`)}<button class="icon-button" data-delete-sampler="${i}" aria-label="删除取样器 ${i + 1}" title="删除取样器">${svg('x', 12)}</button></header>${rows(blank(samplerModel(i)), `s${i}`)}</section>`).join('')}</div>`
      : ''
  }<div class="info-status" data-v="status"></div>`;
}
function fill(e: Editor, el: HTMLElement) {
  const set = (key: string, v: string) => {
    const n = el.querySelector(`[data-v="${key}"]`);
    if (n && n.textContent !== v) n.textContent = v;
  };
  const p = pointerColors(e);
  const put = (key: string, list: Channel[]) => list.forEach(([, v], i) => set(`${key}-${i}`, v));
  put('p1', compareChannels(e, p.before, p.after, options.first));
  put('p2', compareChannels(e, p.before, p.after, options.second));
  const pt = e.pointerInfo;
  set('x', pt ? lengthText(e, pt.x, 'x') : '–');
  set('y', pt ? lengthText(e, pt.y, 'y') : '–');
  const size = sizeReadout(e);
  set('w', size?.w ?? '–');
  set('h', size?.h ?? '–');
  size?.extra?.forEach(([, v], i) => set(`extra-${i}`, v));
  samplers(e).forEach((s, i) => {
    const c = samplerColors(e, s);
    put(`s${i}`, compareChannels(e, c.before, c.after, samplerModel(i)));
  });
  const status = el.querySelector<HTMLElement>('[data-v="status"]');
  if (status) {
    const html = e.hasDocument ? statusLines(e).map(([k, v]) => `<div><span>${escapeXML(k)}</span><span>${escapeXML(v)}</span></div>`).join('') : '';
    if (status.innerHTML !== html) status.innerHTML = html;
  }
}
function render(e: Editor, el: HTMLElement) {
  const key = structureKey(e);
  if (el.dataset.key !== key) {
    el.dataset.key = key;
    build(e, el);
  }
  fill(e, el);
}

async function optionsDialog(e: Editor) {
  const models = READOUT_MODELS.map(([id, l]) => [id, l] as [string, string]);
  const v = await formDialog(
    '信息面板选项',
    [
      { name: 'first', label: '第一读数', value: options.first, type: 'select', options: models },
      { name: 'second', label: '第二读数', value: options.second, type: 'select', options: models },
      { name: 'units', label: '标尺单位', value: rulerUnit(e), type: 'select', options: RULER_UNITS.map(([id, l]) => [id, l]) },
      ...STATUS_ITEMS.map(([id, l]) => ({ name: `status-${id}`, label: l, value: options.status.includes(id) ? 'yes' : 'no', type: 'checkbox' })),
    ],
    '确定',
  );
  if (!v) return;
  options = { ...options, first: isModel(v.first) ? v.first : options.first, second: isModel(v.second) ? v.second : options.second, status: STATUS_ITEMS.map(([id]) => id).filter((id) => v[`status-${id}`] === 'yes') };
  save();
  setUnits(e, v.units);
}
export function setUnits(e: Editor, unit: string) {
  if (!RULER_UNITS.some(([id]) => id === unit)) return;
  e.preferences.rulerUnits = unit;
  e.savePreferences();
  e.update();
}

let panelEl: HTMLElement | undefined;
let editor: Editor | undefined;
function refresh() {
  if (editor && panelEl?.isConnected && editor.dock.isVisible('info')) render(editor, panelEl);
}
onSnapshot(refresh);
onEngineReady(refresh);

export const infoPanel: Panel = {
  id: 'info',
  title: '信息',
  icon: 'info',
  location: 'strip',
  shortcut: 'F8',
  mount: (e, el) => {
    panelEl = el;
    editor = e;
    el.classList.add('info-panel');
    e.pointerHooks.push(() => refresh());
    el.addEventListener('change', (ev) => {
      const t = ev.target as HTMLSelectElement;
      if (t.dataset.infoModel && isModel(t.value)) {
        options[t.dataset.infoModel as 'first' | 'second'] = t.value;
        save();
        render(e, el);
      } else if (t.dataset.samplerModel !== undefined && isModel(t.value)) {
        const i = Number(t.dataset.samplerModel);
        while (options.samplers.length <= i) options.samplers.push('actual');
        options.samplers[i] = t.value;
        save();
        render(e, el);
      } else if (t.matches('[data-info-unit]')) setUnits(e, t.value);
    });
    el.addEventListener('click', (ev) => {
      const del = (ev.target as HTMLElement).closest<HTMLElement>('[data-delete-sampler]');
      if (del) deleteSampler(e, Number(del.dataset.deleteSampler));
    });
  },
  update: (e, el) => render(e, el),
  menu: () => ['info.options', '-', 'samplers.clear'],
};

export function installInfo(_e: Editor) {
  registerCommand({ id: 'info.options', label: '信息面板选项…', run: (e) => optionsDialog(e), recordable: false });
}
