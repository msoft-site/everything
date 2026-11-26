import type { Editor } from '../../editor';
import type { Tool } from '../../app/registry';
import type { LiveShape } from '../../model/live-shape';
import { findLayer, type Layer } from '../../model/document';
import { vectorBounds, type VectorMask } from '../../model/vector';
import { layerLock } from '../../model/locks';
import { escapeXML } from '../../model/assets';
import { formDialog } from '../../ui/dialog';
import { svg } from '../../app/icons';
import { insertAboveSelection } from '../layers/insert';
import { commitTarget, hexRgb, pixelTarget } from '../pixels';
import { closedPath, liveKnots, maskToSvg, snap45, type PathOp, type Pt, type SubPath } from './geometry';
import { allShapes, customShapePaths, shapeAspect } from './custom-shapes';
import { applyFill, applyStroke, buildPaint, openPaintPopover, swatchButton, type FillSpec, type StrokeSpec } from './paint';
import { drawingTarget, nextName, setActive, setShapeMask, shapeDocMask, shapeLayer, singleSelected, vstate } from './state';
import { commitPathEdit, commitsSettled } from './masks';
import { maskCoverage } from './raster';
import { reshape, shapeBounds } from './edit';
import { spaceHeld } from './keys';

import { shapeOpts, type ShapeKind, type ShapeMode } from './shape-options';
export { shapeOpts, type ShapeKind, type ShapeMode } from './shape-options';

const names: Record<ShapeKind, string> = { rect: '矩形', ellipse: '椭圆', triangle: '三角形', polygon: '多边形', line: '直线', custom: '形状' };

type Drag = { kind: ShapeKind; start: Pt; end: Pt; last: Pt; shift: boolean; alt: boolean; moved: boolean; spaceLast?: Pt };
let drag: Drag | undefined;
let previewPaths: SubPath[] | undefined;

function box(d: Drag): { x: number; y: number; width: number; height: number } {
  let [x0, y0] = d.start;
  let w = d.end[0] - x0, h = d.end[1] - y0;
  if (d.shift) {
    const aspect = d.kind === 'custom' ? customAspect() : 1;
    const s = Math.max(Math.abs(w), Math.abs(h) * aspect);
    w = Math.sign(w || 1) * s;
    h = (Math.sign(h || 1) * s) / aspect;
  }
  if (d.alt) {
    x0 -= w;
    y0 -= h;
    w *= 2;
    h *= 2;
  }
  let r = { x: Math.min(x0, x0 + w), y: Math.min(y0, y0 + h), width: Math.abs(w), height: Math.abs(h) };
  if (shapeOpts.alignEdges) {
    const x = Math.round(r.x), y = Math.round(r.y);
    r = { x, y, width: Math.round(r.x + r.width) - x, height: Math.round(r.y + r.height) - y };
  }
  return r;
}
function customAspect() {
  const s = allShapes().find((c) => c.id === shapeOpts.custom);
  return s ? shapeAspect(s) : 1;
}
function linePoints(d: Drag): [Pt, Pt] {
  let b = d.shift ? snap45(d.start, d.end) : d.end;
  let a = d.start;
  if (d.alt) a = [2 * d.start[0] - b[0], 2 * d.start[1] - b[1]];
  if (shapeOpts.alignEdges) {
    a = [Math.round(a[0]), Math.round(a[1])];
    b = [Math.round(b[0]), Math.round(b[1])];
  }
  return [a, b];
}
/** Live parameters for the dragged geometry (custom shapes have none). */
export function liveFor(kind: ShapeKind, r: { x: number; y: number; width: number; height: number }, line?: [Pt, Pt]): LiveShape | undefined {
  const o = shapeOpts;
  switch (kind) {
    case 'rect':
      return { kind: 'rect', ...r, radii: o.perCorner ? [...o.radii] : [o.radius, o.radius, o.radius, o.radius] };
    case 'ellipse':
      return { kind: 'ellipse', ...r };
    case 'triangle':
      return { kind: 'triangle', ...r, radius: o.triRadius };
    case 'polygon':
      return { kind: 'polygon', ...r, sides: Math.max(3, Math.min(100, Math.round(o.sides))), star: Math.max(0, Math.min(0.99, o.star / 100)), radius: o.polyRadius, smoothIndents: o.smoothIndents };
    case 'line': {
      const [a, b] = line!;
      return { kind: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], weight: Math.max(0.1, o.weight), arrowStart: o.arrowStart, arrowEnd: o.arrowEnd, arrowWidth: Math.max(1, o.arrowWidth), arrowLength: Math.max(0.1, o.arrowLength), concavity: Math.max(-50, Math.min(50, o.concavity)) / 100 };
    }
    default:
      return;
  }
}
function shapePaths(r: { x: number; y: number; width: number; height: number }, live: LiveShape | undefined, op: PathOp): SubPath[] {
  if (live) return [closedPath(liveKnots(live), op)];
  const s = allShapes().find((c) => c.id === shapeOpts.custom) ?? allShapes()[0];
  return customShapePaths(s, r.x, r.y, r.width, r.height, op);
}
function dragGeometry(d: Drag) {
  const line = d.kind === 'line' ? linePoints(d) : undefined;
  const r = line ? { x: Math.min(line[0][0], line[1][0]), y: Math.min(line[0][1], line[1][1]), width: Math.abs(line[1][0] - line[0][0]), height: Math.abs(line[1][1] - line[0][1]) } : box(d);
  const live = liveFor(d.kind, r, line);
  const op: PathOp = shapeOpts.op === 'new' ? 'combine' : shapeOpts.op;
  return { r, live, paths: shapePaths(r, live, op), degenerate: line ? Math.hypot(line[1][0] - line[0][0], line[1][1] - line[0][1]) < 0.5 : r.width < 0.5 || r.height < 0.5 };
}
/** True when drawing combines into the selected shape layer instead of creating one. */
function combining(e: Editor) {
  const l = singleSelected(e);
  return shapeOpts.op !== 'new' && l?.kind === 'vector';
}

function showPreview(e: Editor, d: Drag) {
  const g = dragGeometry(d);
  previewPaths = g.paths;
  if (shapeOpts.mode !== 'shape' || g.degenerate) {
    e.preview(e.doc);
    e.overlay();
    return;
  }
  try {
    if (combining(e)) {
      const l = singleSelected(e)!;
      const copy = { ...l, vector: { ...l.vector!, fill: structuredClone(l.vector!.fill), stroke: l.vector!.stroke && { ...l.vector!.stroke } } };
      setShapeMask(copy, { paths: [...shapeDocMask(l).paths, ...g.paths] });
      e.preview({ ...e.doc, layers: replaceLayer(e.doc.layers, copy) });
    } else {
      const temp = makeLayer(e, d.kind, g.paths, g.live, g.r);
      const anchor = e.selected;
      const insert = (layers: Layer[]): Layer[] => {
        const i = layers.findIndex((x) => x.id === anchor);
        if (i >= 0) return [...layers.slice(0, i + 1), temp, ...layers.slice(i + 1)];
        return layers.map((x) => (x.children.length ? { ...x, children: insert(x.children) } : x));
      };
      const layers = anchor && findLayer(e.doc.layers, anchor) ? insert(e.doc.layers) : [...e.doc.layers, temp];
      e.preview({ ...e.doc, layers });
    }
  } catch (error) {
    e.message(String((error as Error).message ?? error));
  }
  e.overlay();
}
function replaceLayer(layers: Layer[], l: Layer): Layer[] {
  return layers.map((x) => (x.id === l.id ? l : x.children.length ? { ...x, children: replaceLayer(x.children, l) } : x));
}
/** Add a custom shape as a new shape layer filling `r` (Shapes panel). */
export function addCustomShapeLayer(e: Editor, shapeId: string, r: { x: number; y: number; width: number; height: number }) {
  const shape = allShapes().find((c) => c.id === shapeId);
  if (!shape) return;
  const layer = makeLayer(e, 'custom', customShapePaths(shape, r.x, r.y, r.width, r.height), undefined, r);
  layer.name = nextName(e.doc, shape.name);
  insertAboveSelection(e, layer, 'Add Shape');
  setActive(e, undefined);
}
function makeLayer(e: Editor, kind: ShapeKind, paths: SubPath[], live: LiveShape | undefined, r: { x: number; y: number; width: number; height: number }) {
  const open = paths.some((p) => p.open);
  const paint = buildPaint(e, shapeOpts.fill, shapeOpts.stroke, r, open);
  return shapeLayer(e.doc, nextName(e.doc, names[kind]), { paths: structuredClone(paths) }, paint.fill, paint.stroke, live, paint.color);
}
/** Create the shape in the current mode: a shape layer, a path, or pixels. */
export async function commitShape(e: Editor, kind: ShapeKind, paths: SubPath[], live: LiveShape | undefined, r: { x: number; y: number; width: number; height: number }) {
  const mode = shapeOpts.mode;
  if (mode === 'pixels') {
    const target = await pixelTarget(e);
    if (!target) return;
    const cov = await maskCoverage(e, { paths: paths.map((p, i) => (i === 0 ? { ...p, operation: 'combine' as const } : p)) });
    const { paintCoverage } = await import('./raster');
    const grid = paintCoverage(e, target, cov, hexRgb(e.color), 1);
    commitTarget(e, target, grid, `${names[kind]} Tool`);
    return;
  }
  if (mode === 'path') {
    await commitsSettled();
    const t = drawingTarget(e);
    const mask: VectorMask = { ...t.mask, paths: [...structuredClone(t.mask.paths), ...structuredClone(paths)] };
    if (t.kind === 'work' && !e.doc.workPath?.paths.length) mask.paths[0].operation = 'combine';
    if (!(await commitPathEdit(e, t, mask, t.kind === 'work' && t.mask.paths.length === 0 ? 'Work Path' : `${names[kind]} Tool`))) return;
    const st = vstate(e);
    st.paths = new Set(mask.paths.map((_, i) => i).slice(t.mask.paths.length));
    return;
  }
  if (combining(e)) {
    const l = singleSelected(e)!;
    if (layerLock(e.doc.layers, l.id, 'all')) {
      e.message('Unlock this layer to edit its shape.');
      return;
    }
    e.command(`${names[kind]} Tool`, (d) => {
      const x = findLayer(d.layers, l.id)!;
      setShapeMask(x, { paths: [...shapeDocMask(x).paths, ...structuredClone(paths)] });
    });
    return;
  }
  const layer = makeLayer(e, kind, paths, live, r);
  insertAboveSelection(e, layer, `${names[kind]} Tool`);
  setActive(e, undefined);
}

// ----- Options bar -----
const num = (id: string, label: string, value: number, attrs = '', unit = '') =>
  `<label class="vec-num">${label} <input id="${id}" type="number" value="${Math.round(value * 100) / 100}" ${attrs}>${unit}</label>`;
/** Fill, stroke and stroke options for new shapes (and the selected shape
 * layer), shared by the shape tools and the Pen tools in Shape mode. */
export function shapePaintControls(e: Editor) {
  const o = shapeOpts;
  const dashLabels: Record<string, string> = { solid: '实线', dashed: '虚线', dotted: '点线' };
  const alignLabels: Record<string, string> = { inside: '内部', center: '居中', outside: '外部' };
  return `<span class="vec-paint-row">填充 ${swatchButton('vec-fill', '形状填充', o.fill, e.color)} 描边 ${swatchButton('vec-stroke', '形状描边', o.stroke, e.color, true)}${num('vec-stroke-width', '', o.stroke.width, 'min="0" max="1000" step="0.5" aria-label="描边粗细 (像素)" title="描边粗细"', '像素')}<select id="vec-stroke-dash" aria-label="描边样式" title="描边样式">${(['solid', 'dashed', 'dotted'] as const).map((s) => `<option value="${s}" ${o.stroke.dash === s ? 'selected' : ''}>${dashLabels[s]}</option>`).join('')}</select><select id="vec-stroke-align" aria-label="描边对齐" title="描边对齐">${(['inside', 'center', 'outside'] as const).map((s) => `<option value="${s}" ${o.stroke.align === s ? 'selected' : ''}>${alignLabels[s]}</option>`).join('')}</select></span>`;
}
function shapeOptions(e: Editor, kind: ShapeKind) {
  const o = shapeOpts;
  const l = singleSelected(e);
  const b = l?.kind === 'vector' ? shapeBounds(l) : null;
  const modeSel = `<label>模式 <select id="vec-mode" aria-label="工具模式">${(['shape', 'path', 'pixels'] as const).map((m) => `<option value="${m}" ${o.mode === m ? 'selected' : ''}>${m === 'shape' ? '形状' : m === 'path' ? '路径' : '像素'}</option>`).join('')}</select></label>`;
  const paint = o.mode === 'shape' ? shapePaintControls(e) : '';
  const wh = o.mode === 'shape' ? `${num('vec-w', '宽', b?.width ?? 0, `min="0" max="16384" ${b ? '' : 'disabled'} aria-label="所选形状的宽度"`)}${num('vec-h', '高', b?.height ?? 0, `min="0" max="16384" ${b ? '' : 'disabled'} aria-label="所选形状的高度"`)}` : '';
  const ops = o.mode === 'pixels' ? '' : `<label>路径操作 <select id="vec-op" aria-label="路径操作">${([['new', o.mode === 'shape' ? '新建图层' : '新建路径区域'], ['combine', '合并形状'], ['subtract', '减去顶层形状'], ['intersect', '与形状区域相交'], ['exclude', '排除重叠形状']] as const).map(([v, label]) => `<option value="${v}" ${o.op === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  let extra = '';
  if (kind === 'rect')
    extra = o.perCorner
      ? `<span class="vec-radii">${['左上', '右上', '右下', '左下'].map((c, i) => num(`vec-r${i}`, c, o.radii[i], `min="0" max="8192" aria-label="${c} 圆角半径"`)).join('')}</span><button class="icon-button toggle" id="vec-per-corner" aria-pressed="true" title="链接圆角半径">${svg('link-2', 15)}</button>`
      : `${num('vec-radius', '圆角半径', o.radius, 'min="0" max="8192"', '像素')}<button class="icon-button toggle" id="vec-per-corner" aria-pressed="false" title="分别设置每个圆角半径">${svg('link-2', 15)}</button>`;
  if (kind === 'triangle') extra = num('vec-tri-radius', '圆角半径', o.triRadius, 'min="0" max="8192"', '像素');
  if (kind === 'polygon')
    extra = `${num('vec-sides', '边数', o.sides, 'min="3" max="100" step="1"')}${num('vec-star', '星形', o.star, 'min="0" max="99" title="缩进比例 (%)"', '%')}${num('vec-poly-radius', '圆角半径', o.polyRadius, 'min="0" max="8192"', '像素')}<label class="transform-setting"><input id="vec-smooth-indents" type="checkbox" ${o.smoothIndents ? 'checked' : ''}>平滑缩进</label>`;
  if (kind === 'line')
    extra = `${num('vec-weight', '粗细', o.weight, 'min="0.1" max="1000" step="0.5"', '像素')}<label class="transform-setting"><input id="vec-arrow-start" type="checkbox" ${o.arrowStart ? 'checked' : ''}>起点</label><label class="transform-setting"><input id="vec-arrow-end" type="checkbox" ${o.arrowEnd ? 'checked' : ''}>终点箭头</label>${o.arrowStart || o.arrowEnd ? `${num('vec-arrow-width', '宽度', o.arrowWidth * 100, 'min="100" max="5000" step="10" title="箭头宽度 (粗细的百分比)"', '%')}${num('vec-arrow-length', '长度', o.arrowLength * 100, 'min="10" max="5000" step="10" title="箭头长度 (粗细的百分比)"', '%')}${num('vec-concavity', '凹度', o.concavity, 'min="-50" max="50"', '%')}` : ''}`;
  if (kind === 'custom') {
    const s = allShapes().find((c) => c.id === o.custom) ?? allShapes()[0];
    extra = `<button id="vec-custom" class="vec-custom-button" aria-haspopup="dialog" title="选择自定形状"><svg viewBox="-4 -4 108 108" width="20" height="20" aria-hidden="true"><path d="${s.d}" fill="currentColor" fill-rule="evenodd"/></svg><span>${escapeXML(s.name)}</span></button>`;
  }
  return `${modeSel}${paint}${wh}${ops}${extra}<label class="transform-setting" title="将形状边缘对齐到像素网格"><input id="vec-align-edges" type="checkbox" ${o.alignEdges ? 'checked' : ''}>对齐边缘</label>`;
}
/** Change listener for a number field; a cleared field is not zero: it goes
 * back to the value in use (`restore` redraws the options). */
function numberField(el: HTMLElement, id: string, restore: () => void, f: (v: number) => void) {
  el.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('change', (event) => {
    const t = event.target as HTMLInputElement;
    if (t.value.trim() === '' || !Number.isFinite(t.valueAsNumber)) restore();
    else f(t.valueAsNumber);
  });
}
export function bindShapePaint(e: Editor, el: HTMLElement, rerender = () => e.options()) {
  const o = shapeOpts;
  const on = (id: string, f: (t: HTMLInputElement) => void, ev = 'change') => el.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener(ev, (event) => f(event.target as HTMLInputElement));
  const applyStrokeToLayer = () => {
    const l = singleSelected(e);
    if (l?.kind !== 'vector') return;
    e.editLayer('更改形状描边', (x) => applyStroke(x.vector!, o.stroke));
  };
  numberField(el, 'vec-stroke-width', rerender, (v) => {
    o.stroke.width = Math.max(0, v);
    if (o.stroke.width > 0 && o.stroke.type === 'none') o.stroke.type = 'color';
    applyStrokeToLayer();
    rerender();
  });
  on('vec-stroke-dash', (t) => {
    o.stroke.dash = t.value as StrokeSpec['dash'];
    applyStrokeToLayer();
  });
  on('vec-stroke-align', (t) => {
    o.stroke.align = t.value as StrokeSpec['align'];
    applyStrokeToLayer();
  });
  const popover = (id: string, stroke: boolean) =>
    el.querySelector<HTMLElement>(`#${id}`)?.addEventListener('click', (ev) => {
      const anchor = ev.currentTarget as HTMLElement;
      openPaintPopover(e, anchor, stroke ? o.stroke : o.fill, (spec) => {
        if (stroke) o.stroke = spec as StrokeSpec;
        else o.fill = spec as FillSpec;
        const span = anchor.querySelector('span');
        if (span) span.setAttribute('style', (stroke ? 'background:' + (o.stroke.type === 'none' ? 'repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 0 0/8px 8px' : o.stroke.color) : swatchFill()) as string);
        const l = singleSelected(e);
        if (l?.kind !== 'vector') return;
        if (stroke) e.editLayer('更改形状描边', (x) => applyStroke(x.vector!, o.stroke));
        else e.editLayer('更改形状填充', (x) => {
          applyFill(e, x.vector!, o.fill, vectorBounds(shapeDocMask(x)));
          if (o.fill.type === 'color') x.color = o.fill.color || e.color;
        });
      });
    });
  const swatchFill = () => {
    const f = o.fill;
    return f.type === 'none' ? 'background:repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 0 0/8px 8px' : f.type === 'color' ? `background:${f.color || e.color}` : f.type === 'gradient' ? `background:linear-gradient(90deg,${f.from},${f.to})` : 'background:repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 0 0/8px 8px';
  };
  popover('vec-fill', false);
  popover('vec-stroke', true);
}
function bindShapeOptions(e: Editor, el: HTMLElement) {
  const o = shapeOpts;
  const on = (id: string, f: (t: HTMLInputElement) => void, ev = 'change') => el.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener(ev, (event) => f(event.target as HTMLInputElement));
  const rerender = () => e.options();
  const field = (id: string, f: (v: number) => void) => numberField(el, id, rerender, f);
  on('vec-mode', (t) => {
    o.mode = t.value as ShapeMode;
    rerender();
  });
  on('vec-op', (t) => (o.op = t.value as typeof o.op));
  on('vec-align-edges', (t) => (o.alignEdges = t.checked));
  bindShapePaint(e, el, rerender);
  const resize = (key: 'width' | 'height') => (v: number) => {
    const l = singleSelected(e);
    if (l?.kind !== 'vector') return;
    e.editLayer('调整形状大小', (x) => reshape(x, { [key]: Math.max(0, v) }));
  };
  field('vec-w', resize('width'));
  field('vec-h', resize('height'));
  field('vec-radius', (v) => (o.radius = Math.max(0, v)));
  for (let i = 0; i < 4; i++) field(`vec-r${i}`, (v) => (o.radii[i] = Math.max(0, v)));
  el.querySelector('#vec-per-corner')?.addEventListener('click', () => {
    o.perCorner = !o.perCorner;
    if (o.perCorner) o.radii = [o.radius, o.radius, o.radius, o.radius];
    else o.radius = o.radii[0];
    rerender();
  });
  field('vec-tri-radius', (v) => (o.triRadius = Math.max(0, v)));
  field('vec-sides', (v) => (o.sides = Math.round(Math.max(3, Math.min(100, v)))));
  field('vec-star', (v) => (o.star = Math.max(0, Math.min(99, v))));
  field('vec-poly-radius', (v) => (o.polyRadius = Math.max(0, v)));
  on('vec-smooth-indents', (t) => (o.smoothIndents = t.checked));
  field('vec-weight', (v) => (o.weight = Math.max(0.1, v)));
  on('vec-arrow-start', (t) => {
    o.arrowStart = t.checked;
    rerender();
  });
  on('vec-arrow-end', (t) => {
    o.arrowEnd = t.checked;
    rerender();
  });
  field('vec-arrow-width', (v) => (o.arrowWidth = Math.max(100, v) / 100));
  field('vec-arrow-length', (v) => (o.arrowLength = Math.max(10, v) / 100));
  field('vec-concavity', (v) => (o.concavity = Math.max(-50, Math.min(50, v))));
  el.querySelector<HTMLElement>('#vec-custom')?.addEventListener('click', (ev) => openShapePicker(e, ev.currentTarget as HTMLElement));
}
export function openShapePicker(e: Editor, anchor: HTMLElement) {
  document.querySelector('.vec-shape-picker')?.remove();
  const pop = document.createElement('div');
  pop.className = 'vec-shape-picker popover';
  pop.setAttribute('role', 'listbox');
  pop.setAttribute('aria-label', '自定形状');
  pop.innerHTML = allShapes()
    .map((s) => `<button role="option" aria-selected="${s.id === shapeOpts.custom}" data-shape="${escapeXML(s.id)}" title="${escapeXML(s.name)}" aria-label="${escapeXML(s.name)}"><svg viewBox="-4 -4 108 108" aria-hidden="true"><path d="${escapeXML(s.d)}" fill="currentColor" fill-rule="evenodd"/></svg></button>`)
    .join('');
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.max(4, Math.min(window.innerWidth - pop.offsetWidth - 4, r.left))}px`;
  pop.style.top = `${r.bottom + 4}px`;
  const close = () => {
    pop.remove();
    document.removeEventListener('pointerdown', outside, true);
  };
  const outside = (ev: Event) => {
    if (!pop.contains(ev.target as Node) && !anchor.contains(ev.target as Node)) close();
  };
  pop.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-shape]');
    if (!b) return;
    shapeOpts.custom = b.dataset.shape!;
    close();
    e.options();
  });
  pop.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      close();
      anchor.focus();
    }
  });
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  pop.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
}

// ----- Click-to-create dialog -----
async function createDialog(e: Editor, kind: ShapeKind, at: Pt) {
  const o = shapeOpts;
  const fields: Parameters<typeof formDialog>[1] = kind === 'line'
    ? [{ name: 'length', label: '长度 (像素)', value: 200, type: 'number', min: 1, max: 16384 }, { name: 'angle', label: '角度 (°)', value: 0, type: 'number', min: -360, max: 360 }, { name: 'weight', label: '粗细 (像素)', value: o.weight, type: 'number', min: 0.1, max: 1000 }]
    : [{ name: 'width', label: '宽度 (像素)', value: 200, type: 'number', min: 1, max: 16384 }, { name: 'height', label: '高度 (像素)', value: 200, type: 'number', min: 1, max: 16384 }];
  if (kind === 'rect') fields.push({ name: 'radius', label: '圆角半径 (像素)', value: o.perCorner ? o.radii[0] : o.radius, type: 'number', min: 0, max: 8192 });
  if (kind === 'polygon') fields.push({ name: 'sides', label: '边数', value: o.sides, type: 'number', min: 3, max: 100, step: 1 }, { name: 'star', label: '星形缩进 (%)', value: o.star, type: 'number', min: 0, max: 99 });
  fields.push({ name: 'center', label: '从中心', value: 'no', type: 'checkbox' });
  const v = await formDialog(`创建${names[kind]}`, fields, '确定');
  if (!v) return;
  const center = v.center === 'yes';
  if (kind === 'rect') {
    o.perCorner = false;
    o.radius = Number(v.radius) || 0;
  }
  if (kind === 'polygon') {
    o.sides = Math.round(Number(v.sides) || 5);
    o.star = Number(v.star) || 0;
  }
  let d: Drag;
  if (kind === 'line') {
    o.weight = Number(v.weight) || o.weight;
    const a = (Number(v.angle) * Math.PI) / 180, len = Number(v.length);
    const end: Pt = [at[0] + Math.cos(a) * len, at[1] - Math.sin(a) * len];
    d = { kind, start: at, end, last: end, shift: false, alt: center, moved: true };
    if (center) d.end = [at[0] + (end[0] - at[0]) / 2, at[1] + (end[1] - at[1]) / 2];
  } else {
    const w = Number(v.width), h = Number(v.height);
    d = { kind, start: at, end: center ? [at[0] + w / 2, at[1] + h / 2] : [at[0] + w, at[1] + h], last: at, shift: false, alt: center, moved: true };
  }
  const g = dragGeometry(d);
  await commitShape(e, kind, g.paths, g.live, g.r);
}

export function shapeTool(id: string, label: string, icon: string, kind: ShapeKind): Tool {
  return {
    id,
    label,
    key: 'U',
    icon,
    group: 'shape',
    cursor: () => 'crosshair',
    options: (e) => shapeOptions(e, kind),
    bindOptions: ({ e, el }) => bindShapeOptions(e, el),
    deactivate: (e) => {
      drag = undefined;
      previewPaths = undefined;
      e.preview(e.doc);
    },
    pointerDown: (_e, p) => {
      drag = { kind, start: [p.x, p.y], end: [p.x, p.y], last: [p.x, p.y], shift: p.shift, alt: p.alt, moved: false };
    },
    pointerMove: (e, p) => {
      const d = drag;
      if (!d) return;
      if (spaceHeld()) {
        // Space repositions the shape while drawing.
        const last = d.spaceLast ?? [p.x, p.y];
        const dx = p.x - last[0], dy = p.y - last[1];
        d.start = [d.start[0] + dx, d.start[1] + dy];
        d.end = [d.end[0] + dx, d.end[1] + dy];
        d.spaceLast = [p.x, p.y];
      } else {
        d.spaceLast = undefined;
        d.end = [p.x, p.y];
      }
      d.shift = p.shift;
      d.alt = p.alt;
      if (Math.hypot(p.clientX - e.clientPoint(d.start[0], d.start[1])[0], p.clientY - e.clientPoint(d.start[0], d.start[1])[1]) > 3) d.moved = true;
      if (d.moved) showPreview(e, d);
    },
    pointerUp: async (e) => {
      const d = drag;
      drag = undefined;
      previewPaths = undefined;
      if (!d) return;
      if (!d.moved) {
        e.preview(e.doc);
        e.overlay();
        await createDialog(e, kind, d.start);
        return;
      }
      const g = dragGeometry(d);
      if (g.degenerate) {
        e.preview(e.doc);
        e.overlay();
        return;
      }
      await commitShape(e, kind, g.paths, g.live, g.r);
      e.overlay();
    },
    keyDown: (e, ev) => {
      if (ev.key === 'Escape' && drag) {
        drag = undefined;
        previewPaths = undefined;
        e.preview(e.doc);
        e.overlay();
        return true;
      }
      return false;
    },
    overlay: (e) => {
      if (!drag || !previewPaths || !drag.moved) return '';
      const z = e.zoom;
      const d = maskToSvg({ paths: previewPaths });
      return `<path d="${d}" class="vec-preview" fill="none" stroke-width="${1 / z}"/>`;
    },
  };
}
