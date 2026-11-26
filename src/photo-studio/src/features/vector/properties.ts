import type { Editor } from '../../editor';
import { findLayer, type Layer } from '../../model/document';
import { layerProperties, layerUnit, lengthCtx, linked, type Axis } from '../panels/layer-properties';
import { commandButton, field as pfField, fieldHandlers, section } from '../panels/property-fields';
import { formatLength, formatNumber, linkedSize, parseLength, UNIT_SUFFIX } from '../panels/property-values';
import { layerLocked } from '../../model/transform';
import { layerLock } from '../../model/locks';
import { svg } from '../../app/icons';
import { propertiesEditors } from '../panels/properties';
import type { LiveShape } from '../../model/live-shape';
import { componentGroups, fitRadii, type PathOp } from './geometry';
import { docLive, reshape, setLive, shapeBounds } from './edit';
import { applyFill, applyStroke, openPaintPopover, specsOf, swatchButton, type FillSpec, type StrokeSpec } from './paint';
import { shapeDocMask, vstate } from './state';

// Properties for shape layers: live shape parameters and geometry in document
// space, fill and stroke paint, and path operations. The generic layer
// properties (locks, gradient/pattern details, stroke options, adjustments and
// masks) follow below, without the generic transform box.
const liveNames: Record<LiveShape['kind'], string> = { rect: '矩形', ellipse: '椭圆', triangle: '三角形', polygon: '多边形', line: '直线' };
let mounted: { el: HTMLElement; layer: Layer } | undefined;
// Layers whose corner radii are shown separately even while equal (after "unlink").
const unlinked = new Set<string>();

const field = (k: string, label: string, value: number, attrs = '') =>
  `<label class="number-field"><span>${label}</span><input data-vec="${k}" type="number" aria-label="${label}" value="${Math.round(value * 100) / 100}" ${attrs}></label>`;
function liveSection(l: Layer, live: LiveShape | undefined) {
  if (!live) return '';
  if (live.kind === 'rect') {
    const linked = !unlinked.has(l.id) && live.radii.every((r) => r === live.radii[0]);
    return `<h3>圆角半径 <button class="icon-button toggle" data-vec-action="link-radii" aria-pressed="${linked}" title="${linked ? '单独编辑每个角' : '所有角使用相同半径'}" aria-label="链接圆角半径">${svg('link-2', 14)}</button></h3><div class="transform-grid vec-radii-grid">${linked ? field('radius', '所有角', live.radii[0], 'min="0"') : ['左上', '右上', '右下', '左下'].map((c, i) => field(`r${i}`, c, live.radii[i], 'min="0"')).join('')}</div>`;
  }
  if (live.kind === 'triangle') return `<div class="transform-grid">${field('triRadius', '圆角半径', live.radius, 'min="0"')}</div>`;
  if (live.kind === 'polygon')
    return `<div class="transform-grid">${field('sides', '边数', live.sides, 'min="3" max="100" step="1"')}${field('star', '星形缩进 (%)', live.star * 100, 'min="0" max="99"')}${field('polyRadius', '圆角半径', live.radius, 'min="0"')}</div><label class="lock-label"><input type="checkbox" data-vec="smoothIndents" ${live.smoothIndents ? 'checked' : ''}> 平滑星形缩进</label>`;
  if (live.kind === 'line')
    return `<div class="transform-grid">${field('weight', '粗细', live.weight, 'min="0.1"')}${field('arrowWidth', '箭头宽度 (%)', live.arrowWidth * 100, 'min="100"')}${field('arrowLength', '箭头长度 (%)', live.arrowLength * 100, 'min="10"')}${field('concavity', '凹度 (%)', live.concavity * 100, 'min="-50" max="50"')}</div><label class="lock-label"><input type="checkbox" data-vec="arrowStart" ${live.arrowStart ? 'checked' : ''}> 起点箭头</label><label class="lock-label"><input type="checkbox" data-vec="arrowEnd" ${live.arrowEnd ? 'checked' : ''}> 终点箭头</label>`;
  void l;
  return '';
}
/** Shape bounds in document space with the shared fields (units, arithmetic,
 * scrubbing, one commit), the angle and flips. */
function shapeTransform(e: Editor, l: Layer, b: ReturnType<typeof shapeBounds>, disabled: boolean) {
  const unit = layerUnit(e);
  const step = unit === 'px' || unit === 'percent' ? 1 : 0.1;
  const r = b ?? { x: 0, y: 0, width: 0, height: 0 };
  const len = (key: Axis, label: string, title: string) =>
    pfField({ key: `shape.${key}`, label, title, value: formatLength(r[key], lengthCtx(e, key)), suffix: UNIT_SUFFIX[unit], disabled, step });
  const on = linked(e);
  return section(
    'layer-transform',
    '变换',
    `<div class="pf-transform"><button type="button" class="icon-button toggle pf-link" data-pf-link="layer" aria-pressed="${on}" title="${on ? '保持宽高比（单击取消链接）' : '链接宽高以保持比例'}" aria-label="链接图层宽高" ${disabled ? 'disabled' : ''}>${svg(on ? 'link' : 'unlink', 14)}</button>
${len('width', '宽', '形状宽度')}${len('x', 'X', '形状左边缘')}${len('height', '高', '形状高度')}${len('y', 'Y', '形状顶边缘')}</div>
<div class="pf-angle">${pfField({ key: 'layer.rotation', label: '角度', title: '旋转角度（度）', value: formatNumber(l.transform.rotation, 2), suffix: '°', disabled, step: 1 })}<div class="pf-flips">${commandButton(e, 'edit.flip-horizontal', '水平翻转', 'flip-horizontal-2', { iconOnly: true })}${commandButton(e, 'edit.flip-vertical', '垂直翻转', 'flip-vertical-2', { iconOnly: true })}</div></div>`,
  );
}
fieldHandlers.set('shape', {
  commit: (e, key, text) => {
    const k = key.slice(6) as Axis;
    const l = e.layer;
    if (!l?.vector || e.selectedIds.size !== 1) return;
    const px = parseLength(text, lengthCtx(e, k));
    if (px === undefined) return '请输入有效值，例如 120、2 in 或 50%。';
    const b = shapeBounds(l);
    if (k === 'x' || k === 'y') return void e.editLayer('移动形状', (x) => reshape(x, { [k]: px }), 'position');
    const size = b ? linkedSize(b.width, b.height, k, Math.max(0, px), linked(e)) : { [k]: Math.max(0, px) };
    e.editLayer('调整形状大小', (x) => reshape(x, size), 'position');
  },
});
function render(e: Editor, el: HTMLElement, l: Layer) {
  const display = e.displayDoc;
  const live = docLive(l);
  const b = shapeBounds(l);
  const { fill, stroke } = specsOf(e, l.vector!);
  const locked = layerLocked(e.doc.layers, l.id);
  const posLocked = !!layerLock(e.doc.layers, l.id, 'position');
  const groups = componentGroups(shapeDocMask(l));
  const st = vstate(e);
  const ops: [PathOp, string, string][] = [['combine', '合并形状', 'path-op-combine'], ['subtract', '减去顶层形状', 'path-op-subtract'], ['intersect', '与形状区域相交', 'path-op-intersect'], ['exclude', '排除重叠形状', 'path-op-exclude']];
  const generic = layerProperties(e, display, l, locked, { transform: false, color: false, header: false });
  el.innerHTML = `<div class="property-body vec-props"><span class="eyebrow">形状图层</span><h3>${live ? `实时${liveNames[live.kind]}` : '形状'}${l.vector!.live && !live ? ' <small class="muted">(已变换)</small>' : ''}</h3>
<fieldset ${locked || posLocked ? 'disabled' : ''}>${shapeTransform(e, l, b, locked || posLocked)}</fieldset>
<fieldset ${locked ? 'disabled' : ''}>${liveSection(l, live)}
${section('shape-appearance', '外观', `<div class="vec-appearance"><span>填充</span>${swatchButton('vec-prop-fill', '填充', fill, e.color)}<span>描边</span>${swatchButton('vec-prop-stroke', '描边', stroke, e.color, true)}</div>`)}
${section('shape-paths', '路径操作', `<p class="muted vec-hint">${groups.length} 个组件${st.paths.size && e.tool === 'path-select' ? '，应用于所选组件' : '，应用于最后一个组件'}</p><div class="vec-ops">${ops.map(([op, label, icon]) => `<button class="icon-button" data-vec-op="${op}" title="${label}" aria-label="${label}">${svg(icon, 16)}</button>`).join('')}<button data-command="path.merge-components" title="将重叠组件合并为单一轮廓">合并</button></div>`)}</fieldset></div>${generic.replace('<div class="property-body">', '<div class="property-body vec-generic">')}`;
  bind(e, el, l.id, fill, stroke);
}
function bind(e: Editor, el: HTMLElement, id: string, fill: FillSpec, stroke: StrokeSpec) {
  const edit = (label: string, f: (l: Layer) => void, op: 'all' | 'position' = 'all') => {
    if (e.selected !== id) return;
    e.editLayer(label, f, op);
  };
  el.querySelectorAll<HTMLInputElement>('[data-vec]').forEach((input) =>
    input.addEventListener('change', () => {
      const k = input.dataset.vec!;
      const v = input.type === 'checkbox' ? Number(input.checked) : input.valueAsNumber;
      if (!Number.isFinite(v)) return;
      edit('更改实时形状', (l) => {
        const live = docLive(l);
        if (!live) return;
        const next = structuredClone(live) as LiveShape & Record<string, unknown>;
        if (next.kind === 'rect') {
          if (k === 'radius') next.radii = [v, v, v, v].map((r) => Math.max(0, r)) as [number, number, number, number];
          else if (/^r[0-3]$/.test(k)) next.radii[Number(k[1])] = Math.max(0, v);
          // Keep the radii the shape can draw, so the fields show the real corners.
          next.radii = fitRadii(next.width, next.height, next.radii);
        } else if (next.kind === 'triangle' && k === 'triRadius') next.radius = Math.max(0, v);
        else if (next.kind === 'polygon') {
          if (k === 'sides') next.sides = Math.round(Math.max(3, Math.min(100, v)));
          if (k === 'star') next.star = Math.max(0, Math.min(0.99, v / 100));
          if (k === 'polyRadius') next.radius = Math.max(0, v);
          if (k === 'smoothIndents') next.smoothIndents = !!v;
        } else if (next.kind === 'line') {
          if (k === 'weight') next.weight = Math.max(0.1, v);
          if (k === 'arrowWidth') next.arrowWidth = Math.max(1, v / 100);
          if (k === 'arrowLength') next.arrowLength = Math.max(0.1, v / 100);
          if (k === 'concavity') next.concavity = Math.max(-0.5, Math.min(0.5, v / 100));
          if (k === 'arrowStart') next.arrowStart = !!v;
          if (k === 'arrowEnd') next.arrowEnd = !!v;
        }
        setLive(l, next);
      });
    }),
  );
  el.querySelector('[data-vec-action="link-radii"]')?.addEventListener('click', (ev) => {
    const l = findLayer(e.doc.layers, id);
    const live = l && docLive(l);
    if (live?.kind !== 'rect') return;
    // Unlinking shows each corner; linking applies the first corner to all.
    if ((ev.currentTarget as HTMLElement).getAttribute('aria-pressed') === 'true') {
      unlinked.add(id);
      render(e, el, l!);
      return;
    }
    unlinked.delete(id);
    const r = live.radii[0];
    if (live.radii.every((v) => v === r)) render(e, el, l!);
    else edit('更改实时形状', (x) => setLive(x, { ...live, radii: [r, r, r, r] }));
  });
  el.querySelector<HTMLElement>('#vec-prop-fill')?.addEventListener('click', (ev) => {
    let spec = fill;
    openPaintPopover(e, ev.currentTarget as HTMLElement, spec, (s) => {
      spec = s as FillSpec;
      edit('更改形状填充', (l) => {
        applyFill(e, l.vector!, spec, shapeBounds(l));
        if (spec.type === 'color') l.color = spec.color || e.color;
      });
    });
  });
  el.querySelector<HTMLElement>('#vec-prop-stroke')?.addEventListener('click', (ev) => {
    let spec = stroke;
    openPaintPopover(e, ev.currentTarget as HTMLElement, spec, (s) => {
      spec = s as StrokeSpec;
      edit('更改形状描边', (l) => applyStroke(l.vector!, spec));
    });
  });
  el.querySelectorAll<HTMLButtonElement>('[data-vec-op]').forEach((b) =>
    b.addEventListener('click', async () => {
      const op = b.dataset.vecOp as PathOp;
      const st = vstate(e);
      if (!(st.paths.size && e.tool === 'path-select')) {
        const l = findLayer(e.doc.layers, id);
        if (!l?.vector) return;
        const groups = componentGroups(shapeDocMask(l));
        st.paths = new Set(groups[groups.length - 1] ?? []);
        st.selectionKey = `layer:${id}`;
      }
      // The path selection tools load on first use.
      await (await import('./select-tools')).setComponentOperation(e, op);
      e.update();
    }),
  );
}

export function installVectorProperties(e: Editor) {
  propertiesEditors.set('vector', {
    mount: (e, el, l) => {
      mounted = { el, layer: l };
      render(e, el, l);
    },
  });
  // The Properties panel remounts editors only on identity changes; refresh
  // whenever the shape layer itself changes (geometry, paint, undo).
  e.onUpdate((e) => {
    const m = mounted;
    if (!m || !m.el.isConnected) return;
    const l = findLayer(e.displayDoc.layers, m.layer.id);
    if (!l || l === m.layer || l.kind !== 'vector' || e.selected !== l.id) return;
    // Always re-render so Undo and committed edits show the stored values, then
    // put focus back on the field the user was in.
    const focused = m.el.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    const key = focused ? (focused.getAttribute('aria-label') ?? focused.getAttribute('name') ?? focused.id) : null;
    mounted = { el: m.el, layer: l };
    render(e, m.el, l);
    if (key) {
      const again = [...m.el.querySelectorAll<HTMLElement>('input,select,button')].find(
        (x) => (x.getAttribute('aria-label') ?? x.getAttribute('name') ?? x.id) === key,
      );
      again?.focus({ preventScroll: true });
      if (again instanceof HTMLInputElement && again.type === 'text') again.select();
    }
  });
}
