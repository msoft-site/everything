// Art History Brush: repaints from the History Brush's source state with
// stylized strokes (engine/art-history.ts). One drag is one undo step.
import type { Editor } from '../../editor';
import type { Tool } from '../../app/registry';
import { artStrokes, artStyles, type ArtStyle } from '../../engine/art-history';
import { StrokeSession } from '../../engine/paint';
import { escapeXML } from '../../model/assets';
import { findLayer } from '../../model/document';
import { canvasRect, selectionGrid } from '../../model/selection';
import { layerLock } from '../../model/locks';
import { TILE, tileKey, type TileGrid } from '../../model/tiles';
import { bindBrushOptions, brushFor, cursor } from '../paint';
import { commitTarget, pixelTarget, previewTarget, retireTiles, type PixelTarget } from '../pixels';
import { historySourceDoc } from '../history-tools';
import { blendModes } from '../../imaging/blend/modes';
import type { PaintMode } from '../../engine/paint';
import { bindNumberField } from './fields';

const ID = 'art-history';
type Drag = { session?: StrokeSession; target?: Extract<PixelTarget, { kind: 'pixels' }>; color: [number, number, number]; last?: [number, number]; travelled: number; seed: number; queue: [number, number][]; done: boolean; source?: TileGrid };
let drag: Drag | undefined;

function gridReader(e: Editor, grid: TileGrid) {
  const store = e.assets.tiles;
  return (x: number, y: number, out: Uint8ClampedArray) => {
    const lx = Math.floor(x) - grid.x,
      ly = Math.floor(y) - grid.y;
    const id = grid.tiles[tileKey(Math.floor(lx / TILE), Math.floor(ly / TILE))];
    if (!id) {
      out[0] = out[1] = out[2] = out[3] = 0;
      return false;
    }
    const d = store.get(id),
      i = ((((ly % TILE) + TILE) % TILE) * TILE + (((lx % TILE) + TILE) % TILE)) * 4;
    out[0] = d[i];
    out[1] = d[i + 1];
    out[2] = d[i + 2];
    out[3] = d[i + 3];
    return true;
  };
}
const style = (e: Editor) => ((e.settings.artStyle as ArtStyle) in artStyles ? (e.settings.artStyle as ArtStyle) : 'tight-short');
const area = (e: Editor) => Math.max(0, Math.min(500, Number(e.settings.artArea ?? 50)));
const tolerance = (e: Editor) => Math.max(0, Math.min(100, Number(e.settings.artTolerance ?? 0)));

/** Scatter strokes for one dab position into the session. */
function paintAt(e: Editor, d: Drag, x: number, y: number) {
  const s = brushFor(ID);
  const strokes = artStrokes(gridReader(e, d.source!), gridReader(e, d.target!.grid), x, y, { style: style(e), area: area(e), size: s.size, tolerance: tolerance(e), seed: d.seed++ });
  for (const st of strokes) {
    d.color = st.color;
    d.session!.lift();
    for (const [px, py] of st.points) d.session!.addPoint(px, py, 1);
  }
}
function feed(e: Editor, d: Drag) {
  const spacing = Math.max(4, area(e) * 0.5, brushFor(ID).size);
  for (const [x, y] of d.queue) {
    if (d.last && Math.hypot(x - d.last[0], y - d.last[1]) + d.travelled < spacing) {
      d.travelled += Math.hypot(x - d.last[0], y - d.last[1]);
      d.last = [x, y];
      continue;
    }
    d.travelled = 0;
    d.last = [x, y];
    paintAt(e, d, x, y);
  }
  d.queue = [];
  e.preview(previewTarget(e, d.target!, d.session!.grid));
}
function finish(e: Editor, d: Drag) {
  drag = undefined;
  const grid = d.session!.commit();
  commitTarget(e, d.target!, grid, '历史记录艺术画笔');
}

export function artHistoryTool(): Tool {
  return {
    id: ID,
    label: '历史记录艺术画笔工具',
    key: 'Y',
    icon: 'art-history',
    group: 'history-brush',
    cursor: () => 'none',
    options: (e) => {
      const s = brushFor(ID);
      const modes: PaintMode[] = ['normal', 'darken', 'lighten', 'multiply', 'screen', 'overlay', 'color', 'luminosity'];
      const label = (m: PaintMode) => blendModes.find((b) => b.id === m)?.label ?? m;
      return `<button class="brush-preview" data-brush-popover="${ID}" title="画笔设置" aria-label="画笔预设和大小"><span class="brush-dot" style="--size:${Math.min(22, 4 + Math.sqrt(s.size) * 1.6)}px;--hard:${s.hardness}"></span><span>${Math.round(s.size)}</span></button>
<label>大小 <input id="brush-size" type="number" min="1" max="500" value="${Math.round(s.size)}" aria-label="画笔大小 (px)"> 像素</label>
<label>模式 <select id="brush-mode" aria-label="画笔混合模式">${modes.map((m) => `<option value="${m}" ${s.mode === m ? 'selected' : ''}>${label(m)}</option>`).join('')}</select></label>
<label>不透明度 <input id="brush-opacity" type="number" min="1" max="100" value="${Math.round(s.opacity * 100)}" aria-label="画笔不透明度 (%)">%</label>
<label>样式 <select id="art-style" aria-label="描边样式">${(Object.keys(artStyles) as ArtStyle[]).map((k) => `<option value="${k}" ${style(e) === k ? 'selected' : ''}>${escapeXML(artStyles[k].label)}</option>`).join('')}</select></label>
<label title="绘制描边的半径范围">区域 <input id="art-area" type="number" min="0" max="500" value="${area(e)}" aria-label="区域 (px)"> 像素</label>
<label title="仅在图像与源状态差异至少达到此值时绘制">容差 <input id="art-tolerance" type="number" min="0" max="100" value="${tolerance(e)}" aria-label="容差 (%)">%</label>`;
    },
    bindOptions: ({ e, el }) => {
      bindBrushOptions(e, el, ID);
      el.querySelector<HTMLSelectElement>('#art-style')?.addEventListener('change', (ev) => (e.settings.artStyle = (ev.target as HTMLSelectElement).value));
      bindNumberField(el, '#art-area', () => area(e), (v) => (e.settings.artArea = Math.max(0, Math.min(500, v))));
      bindNumberField(el, '#art-tolerance', () => tolerance(e), (v) => (e.settings.artTolerance = Math.max(0, Math.min(100, v))));
    },
    hover: (e, p) => cursor(e, ID, p),
    // [ and ] size, Alt+right-drag size and hardness, number keys opacity.
    brush: {
      get: () => brushFor(ID),
      set: (e, v) => {
        Object.assign(brushFor(ID), v);
        e.options();
      },
    },
    activate: (e) => {
      e.settings.numberKey = (value: number) => {
        brushFor(ID).opacity = value;
        e.options();
        return true;
      };
    },
    deactivate: (e) => {
      e.screenOverlayContent = '';
      e.screenOverlay();
      delete e.settings.numberKey;
      // A stroke in progress is stored in its own document first.
      const d = drag;
      if (d?.session) finish(e, d);
      else drag = undefined;
    },
    pointerDown: async (e, p) => {
      const d: Drag = { color: [0, 0, 0], travelled: 0, seed: (Math.random() * 2 ** 31) | 0, queue: [[p.x, p.y]], done: false };
      drag = d;
      const target = await pixelTarget(e, { allowMask: false });
      if (drag !== d) return;
      if (!target || target.kind !== 'pixels') {
        if (target) e.message('历史记录艺术画笔只能在像素图层上绘制。');
        drag = undefined;
        return;
      }
      const src = findLayer(historySourceDoc(e).layers, target.layer.id)?.pixels;
      if (!src) {
        e.message('历史记录状态中不包含此图层。请在“历史记录”面板中选择其他源状态。');
        drag = undefined;
        return;
      }
      const s = brushFor(ID);
      d.target = target;
      d.source = src;
      d.session = new StrokeSession(e.assets.tiles, target.grid, {
        tip: { size: s.size, hardness: s.hardness, spacing: 0.15, roundness: s.roundness, angle: s.angle, sample: s.sample },
        opacity: s.opacity,
        flow: 1,
        target: {
          kind: 'color',
          rgb: [0, 0, 0],
          mode: s.mode,
          preserveAlpha: layerLock(e.doc.layers, target.layer.id, 'transparency'),
          source: (_x, _y, out) => {
            out[0] = d.color[0];
            out[1] = d.color[1];
            out[2] = d.color[2];
            out[3] = 255;
            return true;
          },
        },
        selection: selectionGrid(e.doc, e.assets.tiles),
        clip: canvasRect(e.doc),
        seed: d.seed,
        release: (ids) => retireTiles(e, ids),
      });
      feed(e, d);
      if (d.done) finish(e, d);
    },
    pointerMove: (e, p) => {
      cursor(e, ID, p);
      const d = drag;
      if (!d) return;
      for (const q of p.coalesced ?? [p]) d.queue.push([q.x, q.y]);
      if (d.session) feed(e, d);
    },
    pointerUp: (e) => {
      const d = drag;
      if (!d) return;
      d.done = true;
      if (d.session) finish(e, d);
    },
    keyDown: (e, ev) => {
      if (ev.key === 'Escape' && drag?.session) {
        drag.session.cancel();
        drag = undefined;
        e.preview(e.doc);
        return true;
      }
      return false;
    },
  };
}
