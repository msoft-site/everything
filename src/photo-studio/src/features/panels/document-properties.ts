// Properties for the document (no layer, or the Background layer, selected):
// an editable canvas (size with units, link and anchor, orientation,
// resolution, mode, depth and background fill), rulers and grid, guides, and
// quick actions that run the existing Image commands.
import type { Editor } from '../../editor';
import { svg } from '../../app/icons';
import { escapeXML } from '../../model/assets';
import type { Layer } from '../../model/document';
import { coerceSetting, settingFor } from '../../model/preferences';
import { makeBackground } from '../../model/housekeeping';
import { layerLock } from '../../model/locks';
import { newPixelLayer } from '../../model/pixel-layer';
import { setDocumentResolution } from '../../model/text-layer';
import { emptyGrid, TILE, writeRect, type TileGrid, type TileStore } from '../../model/tiles';
import { hexRgb } from '../pixels';
import { docPpi, resolutionInfo } from '../transform/dialog';
import { type LengthUnit } from '../transform/math';
import {
  commandButton,
  commandEnabled,
  commandToggle,
  field,
  fieldHandlers,
  section,
  select,
} from './property-fields';
import {
  canvasSizeProblem,
  clamp,
  formatLength,
  formatNumber,
  isLengthUnit,
  orientedSize,
  parseLength,
  parseNumber,
  plannedCanvasSize,
  UNIT_NAMES,
  UNIT_SUFFIX,
} from './property-values';

const MODES: [string, string][] = [
  ['rgb', 'RGB Color'],
  ['cmyk', 'CMYK Color'],
  ['lab', 'Lab Color'],
  ['grayscale', 'Grayscale'],
  ['indexed', 'Indexed Color…'],
  ['duotone', 'Duotone…'],
  ['bitmap', 'Bitmap…'],
  ['multichannel', 'Multichannel'],
];
const ANCHORS: [number, number, string][] = [
  [0, 0, 'top left'],
  [0.5, 0, 'top'],
  [1, 0, 'top right'],
  [0, 0.5, 'left'],
  [0.5, 0.5, 'center'],
  [1, 0.5, 'right'],
  [0, 1, 'bottom left'],
  [0.5, 1, 'bottom'],
  [1, 1, 'bottom right'],
];

// Panel state kept for the session: the canvas unit, link and anchor.
type CanvasState = { unit?: LengthUnit; linked?: boolean; anchor?: [number, number] };
const state = (e: Editor) => (e.settings.propertiesCanvas ??= {}) as CanvasState;
export const canvasUnit = (e: Editor): LengthUnit => {
  const u = state(e).unit ?? e.preferences.rulerUnits;
  return isLengthUnit(u) ? u : 'px';
};
export const canvasAnchor = (e: Editor): [number, number] => {
  const a = state(e).anchor;
  return a && [0, 0.5, 1].includes(a[0]) && [0, 0.5, 1].includes(a[1]) ? a : [0.5, 0.5];
};
const ctx = (e: Editor, key: 'width' | 'height') => ({
  unit: canvasUnit(e),
  ppi: docPpi(e.doc),
  base: e.doc[key],
});

// ----- Background fill -----

const uniform = new Map<string, string | null>();
/** The single opaque color of a pixel grid covering the canvas, or null when
 * it has transparency or more than one color. Cached by tile identity. */
export function uniformColor(
  store: TileStore,
  grid: TileGrid,
  width: number,
  height: number,
): string | null {
  const key = `${width}x${height}|${grid.x},${grid.y}|${Object.entries(grid.tiles)
    .map(([k, id]) => `${k}=${id}:${store.version(id)}`)
    .join(';')}`;
  const hit = uniform.get(key);
  if (hit !== undefined) return hit;
  const result = scanUniform(store, grid, width, height);
  if (uniform.size > 16) uniform.delete(uniform.keys().next().value!);
  uniform.set(key, result);
  return result;
}
function scanUniform(
  store: TileStore,
  grid: TileGrid,
  width: number,
  height: number,
): string | null {
  // Every tile overlapping the canvas must exist (absent tiles are transparent).
  const tx0 = Math.floor((0 - grid.x) / TILE),
    ty0 = Math.floor((0 - grid.y) / TILE),
    tx1 = Math.floor((width - 1 - grid.x) / TILE),
    ty1 = Math.floor((height - 1 - grid.y) / TILE);
  let color = -1;
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const id = grid.tiles[`${tx},${ty}`];
      if (!id || !store.has(id)) return null;
      const d = store.get(id);
      const ox = grid.x + tx * TILE,
        oy = grid.y + ty * TILE;
      const x0 = Math.max(0, -ox),
        y0 = Math.max(0, -oy),
        x1 = Math.min(TILE, width - ox),
        y1 = Math.min(TILE, height - oy);
      for (let y = y0; y < y1; y++)
        for (let x = x0, i = (y * TILE + x0) * 4; x < x1; x++, i += 4) {
          if (d[i + 3] !== 255) return null;
          const c = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
          if (color < 0) color = c;
          else if (c !== color) return null;
        }
    }
  return color < 0 ? null : `#${color.toString(16).padStart(6, '0')}`;
}
/** A canvas-sized pixel grid of one color, written in bands to bound memory. */
export function solidGrid(store: TileStore, width: number, height: number, hex: string): TileGrid {
  const [r, g, b] = hexRgb(hex);
  let grid = emptyGrid(4);
  for (let y = 0; y < height; y += TILE) {
    const h = Math.min(TILE, height - y);
    const data = new Uint8ClampedArray(width * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
    grid = writeRect(store, grid, 0, y, { width, height: h, data });
  }
  return grid;
}

type Background = { layer?: Layer; color: string | null };
function background(e: Editor): Background {
  const l = e.doc.layers[0];
  if (!l?.background || l.kind !== 'pixel' || !l.pixels) return { color: null };
  return { layer: l, color: uniformColor(e.assets.tiles, l.pixels, e.doc.width, e.doc.height) };
}
const FILL_CHOICES = (e: Editor): [string, string, string][] => [
  ['white', 'White', '#ffffff'],
  ['black', 'Black', '#000000'],
  ['background', 'Background Color', e.background],
  ['foreground', 'Foreground Color', e.color],
];
function fillMarkup(e: Editor) {
  if (e.doc.layers.some((l) => l.artboard))
    return '<p class="pf-note">Each artboard sets its own background.</p>';
  const bg = background(e);
  const choices = FILL_CHOICES(e);
  if (bg.layer && !bg.color)
    return `<div class="pf-fill">${select('fill', 'Background fill', [['image', 'Background layer']], 'image', { disabled: true, title: 'The Background layer has image content; paint on it or convert it to a layer to change it.' })}</div>`;
  const current = !bg.layer
    ? 'transparent'
    : (choices.find(([, , hex]) => hex.toLowerCase() === bg.color)?.[0] ?? 'custom');
  const locked = !!bg.layer && backgroundLocked(e, bg.layer);
  const title = locked ? 'Unlock the Background layer to change its fill.' : undefined;
  return `<div class="pf-fill">${select(
    'fill',
    'Background fill',
    [
      ['transparent', 'Transparent'],
      ...choices.map(([v, label]): [string, string] => [v, label]),
      ['custom', 'Custom Color'],
    ],
    current,
    { disabled: locked, title },
  )}<input type="color" class="pf-swatch" data-pf="fill-color" aria-label="Background fill color" title="${title ?? 'Background fill color'}" value="${bg.color ?? '#ffffff'}"${locked ? ' disabled' : ''}></div>`;
}
/** Paint the Background layer one color, add one, or remove a plain one. */
// Lock All and Lock Image Pixels keep the Background's fill (and the layer).
const backgroundLocked = (e: Editor, l: Layer) => layerLock(e.doc.layers, l.id, 'pixels');
export function setBackgroundFill(e: Editor, hex: string | null) {
  const bg = background(e);
  if (bg.layer && !bg.color) return;
  if (bg.layer && backgroundLocked(e, bg.layer)) {
    e.message('Unlock the Background layer to change its fill.');
    return;
  }
  if (!hex) {
    if (bg.layer) e.command('Transparent Background', (d) => void d.layers.splice(0, 1));
    return;
  }
  if (bg.color === hex.toLowerCase()) return;
  const grid = solidGrid(e.assets.tiles, e.doc.width, e.doc.height, hex);
  e.command(bg.layer ? 'Background Fill' : 'New Background', (d) => {
    if (bg.layer) {
      const l = d.layers[0];
      l.pixels = grid;
      return;
    }
    const l = newPixelLayer('Background', d, grid);
    makeBackground(l);
    d.layers.unshift(l);
  });
}

// ----- Markup -----

function canvasSection(e: Editor, locked: boolean) {
  const doc = e.doc;
  const unit = canvasUnit(e);
  const linked = !!state(e).linked;
  const [ax, ay] = canvasAnchor(e);
  const ppi = docPpi(doc);
  const ppcm = doc.resolution?.horizontalResolutionUnit === 'PPCM';
  const mode = doc.mode ?? 'rgb';
  const depth = String(doc.bitsPerChannel ?? 8);
  const cmdOn = (id: string) => commandEnabled(e, id);
  const size = (key: 'width' | 'height', label: string, name: string) =>
    field({
      key: `doc.${key}`,
      label,
      name,
      value: formatLength(doc[key], ctx(e, key)),
      suffix: UNIT_SUFFIX[unit],
      disabled: locked,
      step: unit === 'px' || unit === 'percent' ? 1 : 0.1,
    });
  const portrait = doc.height > doc.width;
  const body = `<div class="pf-canvas">
<button type="button" class="icon-button toggle pf-link" data-pf-link="doc" aria-pressed="${linked}" title="${linked ? '保持宽高比 (点击取消链接)' : '链接宽高以保持比例'}" aria-label="链接画布宽度和高度" ${locked ? 'disabled' : ''}>${svg(linked ? 'link' : 'unlink', 14)}</button>
${size('width', '宽', '画布宽度')}${select(
    'unit',
    '画布单位',
    UNIT_NAMES.map(([u, n]) => [u, n]),
    unit,
    { hideLabel: true },
  )}
${size('height', '高', '画布高度')}<div class="pf-orient" role="group" aria-label="方向"><button type="button" class="icon-button" data-pf-orient="portrait" aria-pressed="${portrait}" title="纵向：画布高度大于宽度" aria-label="纵向" ${locked || doc.width === doc.height ? 'disabled' : ''}>${svg('orientation-portrait', 15)}</button><button type="button" class="icon-button" data-pf-orient="landscape" aria-pressed="${doc.width > doc.height}" title="横向：画布宽度大于高度" aria-label="横向" ${locked || doc.width === doc.height ? 'disabled' : ''}>${svg('orientation-landscape', 15)}</button></div>
</div>
<div class="pf-anchor-row"><span id="pf-anchor-label">定位点</span><div class="pf-anchor" role="radiogroup" aria-labelledby="pf-anchor-label">${ANCHORS.map(([x, y, name]) => `<button type="button" role="radio" data-pf-anchor="${x},${y}" aria-checked="${x === ax && y === ay}" tabindex="${x === ax && y === ay ? 0 : -1}" title="从${name}延展或收缩" aria-label="${name}"></button>`).join('')}</div><span class="pf-note">画布尺寸调整时将从定位点向外延展或收缩。</span></div>
<div class="pf-res">${field({ key: 'doc.resolution', label: '分辨率', value: formatNumber(ppcm ? ppi / 2.54 : ppi, 2), name: '分辨率', disabled: locked, title: '修改打印尺寸；像素数保持不变' })}${select(
    'resolution-unit',
    '分辨率单位',
    [
      ['PPI', '像素/英寸'],
      ['PPCM', '像素/厘米'],
    ],
    ppcm ? 'PPCM' : 'PPI',
    { hideLabel: true, disabled: locked },
  )}</div>
${select(
  'mode',
  '颜色模式',
  MODES.map(([m, label]) => [m, label, m !== mode && !cmdOn(`image.mode-${m}`)]),
  mode,
  { disabled: locked },
)}
${select(
  'depth',
  '位深度',
  [
    ['8', '8 位/通道', !cmdOn('image.depth-8')],
    ['16', '16 位/通道', !cmdOn('image.depth-16')],
    ['32', '32 位/通道', !cmdOn('image.depth-32')],
  ],
  depth,
  { disabled: locked },
)}
${fillMarkup(e)}`;
  return section('doc-canvas', '画布', body);
}
function prefSelect(e: Editor, key: string, label: string, hideLabel = false) {
  const def = settingFor(key);
  if (!def || def.type !== 'choice') return '';
  return select(
    `pref.${key}`,
    label,
    def.options.map(([v, n]) => [String(v), n]),
    String((e.preferences as Record<string, unknown>)[key]),
    { hideLabel },
  );
}
const prefColor = (e: Editor, key: string, label: string) =>
  `<label class="pf-color"><span>${label}</span><input type="color" class="pf-swatch" data-pf="pref.${key}" aria-label="${label}" value="${escapeXML(String((e.preferences as Record<string, unknown>)[key]))}"></label>`;
function rulersSection(e: Editor) {
  const p = e.preferences;
  const body = `<div class="pf-checks">${commandToggle(e, 'view.rulers', '标尺')}${commandToggle(e, 'view.show-grid', '网格')}${commandToggle(e, 'view.snap-grid', '对齐到网格')}</div>
${prefSelect(e, 'rulerUnits', '单位')}
<div class="pf-pair">${prefColor(e, 'gridColor', '网格颜色')}${prefSelect(e, 'gridStyle', '网格样式', true)}</div>
<div class="pf-pair">${field({ key: 'pref.gridEvery', label: '间隔', name: '网格线间隔', value: formatNumber(p.gridEvery, 2), step: 1 })}${prefSelect(e, 'gridUnit', '网格线单位', true)}</div>
${field({ key: 'pref.gridSubdivisions', label: '细分', value: String(p.gridSubdivisions), step: 1 })}`;
  return section('doc-rulers', '标尺与网格', body);
}
function guidesSection(e: Editor) {
  const doc = e.doc;
  const artboards = doc.layers.filter((l) => l.artboard);
  const canvasCount = doc.guides?.length ?? 0;
  const artboardCount = artboards.reduce((n, l) => n + (l.artboard?.guides?.length ?? 0), 0);
  const count = canvasCount + artboardCount;
  const body = `<div class="pf-checks">${commandToggle(e, 'view.show-guides', '参考线')}${commandToggle(e, 'view.guides-lock', '锁定参考线')}${commandToggle(e, 'view.snap-guides', '对齐到参考线')}${artboards.length ? `${commandToggle(e, 'view.show-canvas-guides', '画布参考线')}${commandToggle(e, 'view.show-artboard-guides', '画板参考线')}` : ''}</div>
<div class="pf-pair">${prefColor(e, 'guideColor', '参考线颜色')}${prefSelect(e, 'guideStyle', '参考线样式', true)}</div>
<p class="pf-note" aria-live="polite">${count ? `${count} 条参考线${artboardCount ? ` (画板上有 ${artboardCount} 条)` : ''}` : '暂无参考线。从标尺拖出或在此新建。'}</p>
<div class="pf-actions">${commandButton(e, 'view.guides-new', '新建参考线…', 'plus')}${commandButton(e, 'view.guides-layout', '新建参考线版面…', 'layout-grid')}${commandButton(e, 'view.guides-from-shape', '根据形状创建参考线', 'shapes')}${commandButton(e, 'view.guides-clear', '清除参考线', 'trash-2')}</div>`;
  return section('doc-guides', '参考线', body);
}
/** The layer Remove Background works on from the document view. */
function backgroundTarget(e: Editor): Layer | undefined {
  const pixel = e.doc.layers.filter((l) => l.kind === 'pixel' || l.kind === 'image');
  return e.doc.layers[0]?.background ? e.doc.layers[0] : pixel.length === 1 ? pixel[0] : undefined;
}
function quickActions(e: Editor) {
  const target = backgroundTarget(e);
  const body = `<div class="pf-actions">
<button type="button" class="pf-action" data-pf-action="remove-background" title="移除 ${target ? escapeXML(target.name) : '图像'} 的背景" ${target && commandEnabled(e, 'select.subject') ? '' : 'disabled'}>${svg('eraser-background', 14)}<span>移除背景</span></button>
${commandButton(e, 'image.trim', '裁切', 'scissors', { title: '从边缘裁切透明像素' })}
${commandButton(e, 'image.image-size', '图像大小…', 'scaling')}
${commandButton(e, 'image.canvas-size', '画布大小…', 'expand')}
${commandButton(e, 'image.crop', '裁切到选区', 'crop', { title: e.doc.selection ? '按选区裁切画布' : '建立选区以进行裁切' })}
${commandButton(e, 'image.reveal-all', '显示全部', 'fullscreen', { title: '放大画布以显示所有图层' })}
${commandButton(e, 'image.rotate-ccw', '逆时针旋转', 'rotate-ccw', { title: '逆时针旋转画布 90°' })}
${commandButton(e, 'image.rotate-cw', '顺时针旋转', 'rotate-cw', { title: '顺时针旋转画布 90°' })}
${commandButton(e, 'image.flip-horizontal', '水平翻转', 'flip-horizontal-2', { title: '水平翻转画布' })}
${commandButton(e, 'image.flip-vertical', '垂直翻转', 'flip-vertical-2', { title: '垂直翻转画布' })}
</div>`;
  return section('doc-actions', '快速操作', body);
}

/** Properties markup for the document; `background` is the selected
 * Background layer, shown as a short layer section on top. */
export function documentProperties(e: Editor, backgroundLayer?: Layer): string {
  const doc = e.displayDoc;
  const busy = !!e.transform.document || !!e.modal;
  const layerPart = backgroundLayer
    ? section(
        'doc-background-layer',
        '背景图层',
        `<p class="pf-note">背景图层已被锁定。将其转换为普通图层以进行移动、蒙版或设置透明。</p><div class="pf-actions">${commandButton(e, 'layer.from-background', '转换为图层', 'layers')}${commandButton(e, 'select.subject', '选择主体', 'scan-face')}</div>`,
      )
    : '';
  return `<div class="property-body document-properties"><div class="pf-title">${svg('file-image', 14)}<span class="eyebrow">文档</span></div><h3 class="pf-docname" title="${escapeXML(doc.name)}">${escapeXML(doc.name)}</h3>
${layerPart}${canvasSection(e, busy)}${rulersSection(e)}${guidesSection(e)}${quickActions(e)}</div>`;
}

// ----- Behavior -----

async function resizeTo(e: Editor, size: { width: number; height: number }) {
  const problem = canvasSizeProblem(size.width, size.height);
  if (problem) return problem;
  await e.runCommand('image.canvas-size', {
    params: {
      width: size.width,
      height: size.height,
      anchor: canvasAnchor(e),
      color: 'background',
    },
  });
}
fieldHandlers.set('doc', {
  commit: async (e, key, text) => {
    const doc = e.doc;
    if (key === 'doc.width' || key === 'doc.height') {
      const k = key === 'doc.width' ? 'width' : 'height';
      const px = parseLength(text, ctx(e, k));
      if (px === undefined) return `Enter a ${k} such as 1200, 4 in or 50%.`;
      const size = plannedCanvasSize(doc, k, px, !!state(e).linked);
      if (!size) return void e.update();
      return resizeTo(e, size);
    }
    if (key === 'doc.resolution') {
      const ppcm = doc.resolution?.horizontalResolutionUnit === 'PPCM';
      const v = parseNumber(text, ['ppi', 'ppcm']);
      if (v === undefined || v <= 0) return 'Enter a resolution greater than 0.';
      const ppi = clamp(ppcm ? v * 2.54 : v, 1, 10000);
      if (Math.abs(ppi - docPpi(doc)) < 1e-9) return;
      e.command('Resolution', (d) =>
        setDocumentResolution(d, resolutionInfo(d, ppi, ppcm ? 'PPCM' : 'PPI')),
      );
    }
  },
});
fieldHandlers.set('pref', {
  commit: (e, key, text) => {
    const k = key.slice(5);
    const def = settingFor(k);
    if (!def) return;
    const n = parseNumber(text);
    const v = n === undefined ? undefined : coerceSetting(def, n);
    if (v === undefined) return 'Enter a number.';
    (e.preferences as Record<string, unknown>)[k] = v;
    e.preferencesChanged();
  },
});

/** Handle a change of a document control; true when it was one. */
export async function documentChange(
  e: Editor,
  t: HTMLInputElement | HTMLSelectElement,
): Promise<boolean> {
  const key = t.dataset.pf;
  if (!key) return false;
  const doc = e.doc;
  if (key === 'unit') {
    if (isLengthUnit(t.value)) state(e).unit = t.value;
    e.update();
  } else if (key === 'resolution-unit') {
    const unit = t.value === 'PPCM' ? 'PPCM' : 'PPI';
    if ((doc.resolution?.horizontalResolutionUnit ?? 'PPI') !== unit)
      e.command('Resolution Unit', (d) =>
        setDocumentResolution(d, resolutionInfo(d, docPpi(d), unit)),
      );
  } else if (key === 'mode') {
    if (t.value !== (doc.mode ?? 'rgb')) await e.runCommand(`image.mode-${t.value}`);
    e.update();
  } else if (key === 'depth') {
    if (Number(t.value) !== (doc.bitsPerChannel ?? 8)) await e.runCommand(`image.depth-${t.value}`);
    e.update();
  } else if (key === 'fill') {
    const choice = FILL_CHOICES(e).find(([v]) => v === t.value);
    if (t.value === 'transparent') setBackgroundFill(e, null);
    else if (choice) setBackgroundFill(e, choice[2]);
    else if (t.value === 'custom')
      t.parentElement?.parentElement
        ?.querySelector<HTMLInputElement>('[data-pf="fill-color"]')
        ?.click();
  } else if (key === 'fill-color') setBackgroundFill(e, t.value);
  else if (key.startsWith('pref.')) {
    const k = key.slice(5);
    const def = settingFor(k);
    const v = def && coerceSetting(def, t.value);
    if (v === undefined) return true;
    (e.preferences as Record<string, unknown>)[k] = v;
    e.preferencesChanged();
  } else return false;
  return true;
}

/** Handle a click on a document control; true when it was one. */
export function documentClick(e: Editor, target: HTMLElement): boolean {
  const link = target.closest<HTMLElement>('[data-pf-link="doc"]');
  if (link) {
    state(e).linked = !state(e).linked;
    e.update();
    return true;
  }
  const orient = target.closest<HTMLElement>('[data-pf-orient]')?.dataset.pfOrient as
    'portrait' | 'landscape' | undefined;
  if (orient) {
    const size = orientedSize(e.doc.width, e.doc.height, orient);
    if (size)
      void resizeTo(e, size).then((p) => {
        if (p) e.message(p);
      });
    return true;
  }
  const anchor = target.closest<HTMLElement>('[data-pf-anchor]');
  if (anchor) {
    const [x, y] = anchor.dataset.pfAnchor!.split(',').map(Number);
    state(e).anchor = [x, y];
    e.update();
    return true;
  }
  if (target.closest('[data-pf-action="remove-background"]')) {
    const l = backgroundTarget(e);
    if (!l) return true;
    void (async () => {
      // Remove Background works on a normal layer.
      if (l.background) {
        e.selectLayers([l.id]);
        await e.runCommand('layer.from-background');
      }
      e.selectLayers([l.id]);
      await e.runCommand('layer.remove-background');
    })();
    return true;
  }
  return false;
}

/** Arrow keys move the anchor like a radio group. */
export function documentKey(e: Editor, ev: KeyboardEvent): boolean {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-pf-anchor]');
  if (!b || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return false;
  ev.preventDefault();
  ev.stopPropagation();
  const [x, y] = canvasAnchor(e);
  const step = (v: number, d: number) => clamp(v + d * 0.5, 0, 1);
  const next: [number, number] =
    ev.key === 'ArrowLeft'
      ? [step(x, -1), y]
      : ev.key === 'ArrowRight'
        ? [step(x, 1), y]
        : ev.key === 'ArrowUp'
          ? [x, step(y, -1)]
          : [x, step(y, 1)];
  state(e).anchor = next;
  e.update();
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>(`#properties [data-pf-anchor="${next[0]},${next[1]}"]`)
      ?.focus(),
  );
  return true;
}
