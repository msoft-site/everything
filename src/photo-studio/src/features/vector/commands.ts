import type { Editor } from '../../editor';
import { registerCommand, type Command } from '../../app/registry';
import { allLayers, findLayer, type Layer } from '../../model/document';
import { identityVectorMatrix, vectorBounds, type VectorMask } from '../../model/vector';
import { insertAboveSelection } from '../layers/insert';
import { buildPaint } from './paint';
import { shapeOpts } from './shape-options';
import { canvasRect } from '../../model/selection';
import { formDialog } from '../../ui/dialog';
import { layerLock } from '../../model/locks';
import type { VectorStroke } from '../../model/vector-stroke';
import { vectorHexColor } from '../../color/vector';
import { commitTarget, hexRgb, pixelTarget } from '../pixels';
import { commitSelectionMask, featherMask } from '../selection';
import { cloneMask, commandsToPaths, componentGroups, parseSvgPath, transformMask, type Cmd, type PathOp } from './geometry';
import { maskCoverage, paintCoverage, selectionToPath, strokeWithBrush } from './raster';
import { activeKey, clearSelection, nextName, nextPathName, setActive, setShapeMask, shapeDocMask, shapeLayer, targetLocked, targetPath, vstate, type PathTarget } from './state';
import { addVectorMask, canAddVectorMask, commitPathEdit, currentPathForMask, deleteVectorMask, rasterizeVectorMask, toggleVectorMask } from './masks';
import { savePathDialog } from './panel';
import { saveUserShape, shapeFromMask } from './custom-shapes';
import { documentPpi, textMatrix } from '../../model/text-layer';

/** The path that Paths-panel actions apply to: the target, else the work path. */
export function actionPath(e: Editor): PathTarget | undefined {
  const t = targetPath(e);
  if (t) return t;
  const w = e.doc.workPath;
  return w ? { kind: 'work', id: 'work', name: 'Work Path', mask: w } : undefined;
}
const hasPath = (e: Editor) => !!actionPath(e)?.mask.paths.length;
// Painting a shape layer's own path onto pixels would rasterize the shape first.
const paintablePath = (e: Editor) => hasPath(e) && actionPath(e)!.kind !== 'shape';

const sources: [string, string][] = [['foreground', '前景色'], ['background', '背景色'], ['black', '黑色'], ['gray', '50% 灰色'], ['white', '白色']];
function sourceRgb(e: Editor, source: string): [number, number, number] {
  if (source === 'background') return hexRgb(e.background);
  if (source === 'black') return [0, 0, 0];
  if (source === 'white') return [255, 255, 255];
  if (source === 'gray') return [128, 128, 128];
  return hexRgb(e.color);
}
/** Combine-first copy of a path for rasterizing it as an area. */
function areaMask(mask: VectorMask): VectorMask {
  const m = cloneMask(mask);
  if (m.paths[0]?.operation && m.paths[0].operation !== 'combine') m.paths[0].operation = 'combine';
  return m;
}
export async function fillPath(e: Editor, source = 'foreground', opacity = 1, feather = 0) {
  const t = actionPath(e);
  if (!t?.mask.paths.length) return;
  const target = await pixelTarget(e);
  if (!target) return;
  let cov = await maskCoverage(e, areaMask(t.mask));
  if (feather > 0) cov = featherMask(cov, feather);
  commitTarget(e, target, paintCoverage(e, target, cov, sourceRgb(e, source), opacity), '填充路径');
}
export async function strokePath(e: Editor, tool: 'brush' | 'pencil' | 'eraser' = 'brush', pressure = false) {
  const t = actionPath(e);
  if (!t?.mask.paths.length) return;
  const target = await pixelTarget(e);
  if (!target) return;
  commitTarget(e, target, strokeWithBrush(e, target, t.mask, tool, pressure), '描边路径');
}
export async function pathToSelection(e: Editor, op: 'replace' | 'add' | 'subtract' | 'intersect' = 'replace', feather = 0, antiAlias = true) {
  const t = actionPath(e);
  if (!t?.mask.paths.length) return;
  let cov = await maskCoverage(e, areaMask(t.mask));
  if (!antiAlias) for (let i = 0; i < cov.data.length; i++) cov.data[i] = cov.data[i] >= 128 ? 255 : 0;
  if (feather > 0) cov = featherMask(cov, feather);
  commitSelectionMask(e, cov, op, '建立选区');
}
export function selectionToWorkPath(e: Editor, tolerance = 2) {
  const mask = selectionToPath(e, tolerance);
  if (!mask) {
    e.message('选区为空。');
    return;
  }
  e.command('建立工作路径', (d) => {
    d.workPath = mask;
  });
  setActive(e, 'work');
  e.update();
}
/** Merge selected (or all) components into one outline through the geometry engine. */
export async function mergeComponents(e: Editor) {
  const t = targetPath(e);
  if (!t || !t.mask.paths.length || targetLocked(e, t)) return;
  const st = vstate(e);
  const groups = componentGroups(t.mask);
  const chosen = st.paths.size && st.selectionKey === activeKey(t) ? groups.filter((g) => g.some((i) => st.paths.has(i))) : groups;
  if (chosen.length < 1) return;
  const idx = chosen.flat().sort((a, b) => a - b);
  const sub: VectorMask = { paths: idx.map((i) => structuredClone(t.mask.paths[i])) };
  sub.paths[0].operation = 'combine';
  const r = await e.engine.vectorMask(sub, canvasRect(e.doc));
  const merged = commandsToPaths(parseSvgPath(r.path), r.fillRule === 'evenodd' ? 'even-odd' : 'non-zero', 'combine', true);
  const first = t.mask.paths[idx[0]].operation ?? 'combine';
  if (merged[0]) merged[0].operation = first;
  const drop = new Set(idx);
  const paths = [...t.mask.paths.slice(0, idx[0]).filter((_, i) => !drop.has(i)), ...merged, ...t.mask.paths.slice(idx[0]).filter((_, i) => !drop.has(i + idx[0]))];
  await commitPathEdit(e, t, { ...t.mask, paths }, 'Merge Shape Components');
  clearSelection(e);
  e.update();
}
/** A shape layer from the current path, painted like a new shape. The work
 * path becomes the layer's path; a saved path stays in the Paths panel. */
export function makeShapeFromPath(e: Editor) {
  const t = actionPath(e);
  if (!t?.mask.paths.length || t.kind === 'shape') return;
  const mask = areaMask(t.mask);
  const bounds = vectorBounds(mask);
  const open = mask.paths.some((p) => p.open);
  const paint = buildPaint(e, shapeOpts.fill, shapeOpts.stroke, bounds, open);
  const layer = shapeLayer(e.doc, nextName(e.doc, 'Shape'), mask, paint.fill, paint.stroke, undefined, paint.color);
  insertAboveSelection(e, layer, 'Make Shape', (d) => {
    if (t.kind === 'work') delete d.workPath;
  });
  setActive(e, undefined);
  e.update();
}
/** Layer > Combine Shapes: merges the selected shape layers into the backmost
 * one, keeping each layer's outline as an editable component. The layers in
 * front take the chosen path operation (unite, subtract, intersect, exclude);
 * the result keeps the backmost layer's fill, stroke and name. */
export async function combineShapes(e: Editor, op: PathOp = 'combine') {
  const ids = new Set(e.selectedLayers.filter((l) => l.kind === 'vector').map((l) => l.id));
  const ordered = allLayers(e.doc.layers).filter((l) => ids.has(l.id));
  if (ordered.length < 2) return;
  if (ordered.some((l) => layerLock(e.doc.layers, l.id, 'all'))) {
    e.message('请先解锁形状图层以进行合并。');
    return;
  }
  const back = ordered[0];
  const doc = e.doc;
  const masks = await Promise.all(
    ordered.map(async (l, i) => {
      const m = shapeDocMask(l).paths;
      if (i === 0 || !m.length) return m;
      // Path operations apply one component after another, so a front layer
      // made of several components only keeps its own area when they all
      // add up and the operation adds or cuts them one by one. Otherwise the
      // layer is first resolved into one outline: intersecting with two
      // separate shapes must keep the overlap with either of them.
      const groups = componentGroups({ paths: m });
      const plain = groups.every((g, k) => !k || !m[g[0]].operation || m[g[0]].operation === 'combine');
      if (groups.length > 1 && !(plain && (op === 'combine' || op === 'subtract'))) {
        const sub: VectorMask = { paths: m };
        sub.paths[0].operation = 'combine';
        const r = await e.engine.vectorMask(sub, canvasRect(doc));
        const merged = commandsToPaths(parseSvgPath(r.path), r.fillRule === 'evenodd' ? 'even-odd' : 'non-zero', op, true);
        if (merged[0]) merged[0].operation = op;
        return merged;
      }
      for (const g of groups) m[g[0]].operation = op;
      return m;
    }),
  );
  if (e.doc !== doc) return;
  const paths = masks.flat();
  const label = COMBINE_OPS.find(([o]) => o === op)?.[1] ?? '合并形状';
  e.command(label, (d) => {
    const keep = findLayer(d.layers, back.id)!;
    setShapeMask(keep, { paths });
    const drop = new Set(ordered.slice(1).map((l) => l.id));
    const prune = (layers: Layer[]): Layer[] => layers.filter((l) => !drop.has(l.id)).map((l) => ((l.children = prune(l.children)), l));
    d.layers = prune(d.layers);
  });
  e.selectLayers([back.id]);
  e.update();
}
export const COMBINE_OPS: [PathOp, string, string][] = [
  ['combine', '合并形状', '将所选形状图层合并为一个包含所有区域的图层。'],
  ['subtract', '减去顶层形状', '从底层形状图层中剪切掉顶层的形状。'],
  ['intersect', '与形状区域相交', '仅保留所选形状图层相互重叠的区域。'],
  ['exclude', '排除重叠形状', '保留奇数个所选形状覆盖的区域，移除重叠部分。'],
];
async function strokeSelection(e: Editor) {
  const v = await formDialog('描边', [
    { name: 'width', label: '宽度 (像素)', value: 2, type: 'number', min: 1, max: 250 },
    { name: 'color', label: '颜色', value: e.color, type: 'color' },
    { name: 'location', label: '位置', value: 'center', type: 'select', options: [['inside', '内部'], ['center', '居中'], ['outside', '外部']] },
    { name: 'opacity', label: '不透明度 (%)', value: 100, type: 'number', min: 1, max: 100 },
  ], '确定');
  if (!v) return;
  const mask = selectionToPath(e, 0.6);
  if (!mask) return;
  // Outline contours form one non-zero component, so holes stay holes.
  const target = await pixelTarget(e);
  if (!target) return;
  const stroke: VectorStroke = {
    enabled: true,
    fillEnabled: false,
    lineWidth: { value: Math.max(1, Number(v.width) || 1), units: 'Pixels' },
    lineDashOffset: { value: 0, units: 'Pixels' },
    resolution: 72,
    cap: 'butt',
    join: 'miter',
    alignment: v.location as VectorStroke['alignment'],
    miterLimit: 4,
    opacity: 1,
    color: vectorHexColor(v.color),
  };
  const rect = canvasRect(e.doc);
  const r = await e.engine.vectorStroke(mask, rect, identityVectorMatrix, stroke);
  const cov = { width: rect.width, height: rect.height, data: new Uint8Array(r.strokeCoverage.length) };
  for (let i = 0; i < cov.data.length; i++) cov.data[i] = Math.round(Math.max(0, Math.min(1, r.strokeCoverage[i])) * 255);
  commitTarget(e, target, paintCoverage(e, target, cov, hexRgb(v.color), Math.max(0.01, Math.min(1, Number(v.opacity) / 100))), '描边');
}
async function textWorkPath(e: Editor) {
  const l = e.layer;
  if (l?.kind !== 'text') return;
  const text = await import('../../imaging/text');
  // Prefer rich text data when the layer carries it; otherwise lay out its plain text.
  const rich = (l as Layer & { textData?: import('../../imaging/text').TextLayerData }).textData;
  const [r, g, b] = hexRgb(/^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#000000');
  // Plain text layers draw at weight 600 from the top of the em box in layer
  // space; their outlines are laid out the same way, then placed by the layer transform.
  const data = rich ?? text.textLayer(l.text, { size: l.fontSize, weight: 600, color: [r, g, b] }, { origin: { x: 0, y: l.fontSize * 0.8 } });
  const out = await text.textToPathAsync(data, { resolution: rich ? documentPpi(e.doc) : 72 });
  const cmds = out.contours.flat() as Cmd[];
  const paths = commandsToPaths(cmds, 'non-zero', 'combine', true);
  if (rich) {
    // Rich text is laid out in its own local space, placed by the text matrix.
    const [a, b, c, d, tx, ty] = textMatrix(l);
    transformMask({ paths }, a, b, c, d, tx, ty);
  } else {
    const t = l.transform, a = (t.rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const sx = t.width / l.sourceWidth, sy = t.height / l.sourceHeight, cx = t.x + t.width / 2, cy = t.y + t.height / 2;
    transformMask({ paths }, cos * sx, sin * sx, -sin * sy, cos * sy, cx - cos * t.width / 2 + sin * t.height / 2, cy - sin * t.width / 2 - cos * t.height / 2);
  }
  if (!paths.length) {
    e.message('此文本没有轮廓。');
    return;
  }
  e.command('创建工作路径', (d) => {
    d.workPath = { paths };
  });
  setActive(e, 'work');
  e.update();
  if (out.missingFonts.length) e.message(`以下字体的轮廓使用了默认字体：${out.missingFonts.join(', ')}。`);
}

export function installVectorCommands() {
  const cmd = (c: Command) => registerCommand(c);
  cmd({ id: 'path.fill', label: '使用前景色填充路径', enabled: paintablePath, run: (e) => fillPath(e) });
  cmd({
    id: 'path.fill-dialog',
    label: '填充路径…',
    enabled: paintablePath,
    run: async (e) => {
      const v = await formDialog('填充路径', [
        { name: 'source', label: '内容', value: 'foreground', type: 'select', options: sources },
        { name: 'opacity', label: '不透明度 (%)', value: 100, type: 'number', min: 1, max: 100 },
        { name: 'feather', label: '羽化半径 (像素)', value: 0, type: 'number', min: 0, max: 250 },
      ], '确定');
      if (v) await fillPath(e, v.source, Number(v.opacity) / 100, Number(v.feather) || 0);
    },
  });
  cmd({ id: 'path.stroke', label: '使用画笔描边路径', enabled: paintablePath, run: (e) => strokePath(e) });
  cmd({
    id: 'path.stroke-dialog',
    label: '描边路径…',
    enabled: paintablePath,
    run: async (e) => {
      const v = await formDialog('描边路径', [
        { name: 'tool', label: '工具', value: 'brush', type: 'select', options: [['brush', '画笔'], ['pencil', '铅笔'], ['eraser', '橡皮擦']] },
        { name: 'pressure', label: '模拟压力', value: 'no', type: 'checkbox' },
      ], '确定', '使用该工具当前的大小、硬度和不透明度。');
      if (v) await strokePath(e, v.tool as 'brush', v.pressure === 'yes');
    },
  });
  cmd({ id: 'path.make-selection', label: '将路径作为选区载入', enabled: hasPath, shortcut: 'Mod+Enter', run: (e) => pathToSelection(e) });
  cmd({
    id: 'path.make-selection-dialog',
    label: '建立选区…',
    enabled: hasPath,
    run: async (e) => {
      const v = await formDialog('建立选区', [
        { name: 'feather', label: '羽化半径 (像素)', value: 0, type: 'number', min: 0, max: 250 },
        { name: 'aa', label: '消除锯齿', value: 'yes', type: 'checkbox' },
        { name: 'op', label: '操作', value: e.doc.selection ? 'add' : 'replace', type: 'select', options: [['replace', '新选区'], ['add', '添加到选区'], ['subtract', '从选区减去'], ['intersect', '与选区交叉']] },
      ], '确定');
      if (v) await pathToSelection(e, v.op as 'replace', Number(v.feather) || 0, v.aa === 'yes');
    },
  });
  cmd({ id: 'path.from-selection', label: '从选区生成工作路径', enabled: (e) => !!e.doc.selection, run: (e) => selectionToWorkPath(e, 2) });
  cmd({
    id: 'path.from-selection-dialog',
    label: '建立工作路径…',
    enabled: (e) => !!e.doc.selection,
    run: async (e) => {
      const v = await formDialog('建立工作路径', [{ name: 'tolerance', label: '容差 (像素)', value: 2, type: 'number', min: 0.5, max: 10, step: 0.5 }], '确定');
      if (v) selectionToWorkPath(e, Math.max(0.5, Math.min(10, Number(v.tolerance) || 2)));
    },
  });
  cmd({
    id: 'path.new',
    label: '新建路径',
    enabled: (e) => e.hasDocument,
    run: (e) => {
      const name = nextPathName(e.doc);
      const id = crypto.randomUUID();
      e.command('新建路径', (d) => {
        d.paths = [...(d.paths ?? []), { id, name, mask: { paths: [] } }];
      });
      setActive(e, `path:${id}`);
      e.update();
    },
  });
  cmd({ id: 'path.save', label: '存储路径…', enabled: (e) => actionPath(e)?.kind === 'work', run: (e) => savePathDialog(e, actionPath(e)!) });
  cmd({
    id: 'path.duplicate',
    label: '复制路径',
    enabled: (e) => hasPath(e),
    run: (e) => {
      const t = actionPath(e)!;
      const id = crypto.randomUUID();
      e.command('复制路径', (d) => {
        d.paths = [...(d.paths ?? []), { id, name: `${t.kind === 'saved' ? t.name : t.name.replace(/ (Shape Path|Vector Mask|Type Path)$/, '')} 副本`, mask: structuredClone(t.mask) }];
      });
      setActive(e, `path:${id}`);
      e.update();
    },
  });
  cmd({
    id: 'path.delete',
    label: '删除路径',
    enabled: (e) => {
      const t = targetPath(e);
      return !!t && t.kind !== 'shape' && t.kind !== 'text';
    },
    run: (e) => {
      const t = targetPath(e);
      if (!t || t.kind === 'shape' || t.kind === 'text') return;
      if (t.kind === 'vmask') return deleteVectorMask(e);
      e.command('删除路径', (d) => {
        if (t.kind === 'work') delete d.workPath;
        else {
          d.paths = d.paths!.filter((p) => p.id !== t.id);
          if (!d.paths.length) delete d.paths;
        }
      });
      setActive(e, undefined);
      e.update();
    },
  });
  cmd({
    id: 'path.make-shape',
    label: '从路径创建形状',
    description: '从工作路径或选中的存储路径创建形状图层，并应用形状工具的填充和描边。',
    enabled: paintablePath,
    run: makeShapeFromPath,
  });
  cmd({ id: 'path.merge-components', label: '合并形状组件', enabled: (e) => (targetPath(e)?.mask.paths.length ?? 0) > 1, run: mergeComponents });

  // ----- Vector masks -----
  cmd({ id: 'layer.vmask-reveal-all', label: '显示全部', enabled: (e) => canAddVectorMask(e, e.layer), run: (e) => addVectorMask(e, { paths: [], fillStartsWithAllPixels: true }, '添加矢量蒙版') });
  cmd({ id: 'layer.vmask-hide-all', label: '隐藏全部', enabled: (e) => canAddVectorMask(e, e.layer), run: (e) => addVectorMask(e, { paths: [] }, '添加矢量蒙版') });
  cmd({
    id: 'layer.vmask-current-path',
    label: '当前路径',
    enabled: (e) => canAddVectorMask(e, e.layer) && !!currentPathForMask(e) && targetPath(e)?.kind !== 'shape',
    run: (e) => addVectorMask(e, structuredClone(currentPathForMask(e)!), '添加矢量蒙版'),
  });
  cmd({ id: 'layer.vmask-delete', label: '删除', enabled: (e) => !!e.layer?.vectorMask, run: deleteVectorMask });
  cmd({ id: 'layer.vmask-toggle', label: '停用', enabled: (e) => !!e.layer?.vectorMask, checked: (e) => !!e.layer?.vectorMask?.disabled, run: toggleVectorMask });
  cmd({ id: 'layer.rasterize-vector-mask', label: '矢量蒙版', enabled: (e) => !!e.layer?.vectorMask, run: rasterizeVectorMask });
  const combinable = (e: Editor) => e.selectedLayers.filter((l) => l.kind === 'vector').length > 1;
  for (const [op, label, description] of COMBINE_OPS) cmd({ id: `layer.combine-${op}`, label, description, enabled: combinable, run: (e) => combineShapes(e, op) });

  // ----- View, Edit and Type -----
  cmd({
    id: 'view.show-target-path',
    label: '目标路径',
    shortcut: 'Mod+Shift+H',
    checked: (e) => !e.settings.hideTargetPath,
    recordable: false,
    run: (e) => {
      e.settings.hideTargetPath = !e.settings.hideTargetPath;
      e.overlay();
    },
  });
  cmd({
    id: 'edit.define-shape',
    label: '定义自定形状…',
    enabled: hasPath,
    recordable: false,
    run: async (e) => {
      const t = actionPath(e);
      const d = t && shapeFromMask(t.mask);
      if (!d) return;
      const v = await formDialog('形状名称', [{ name: 'name', label: '名称', value: t!.kind === 'saved' ? t!.name : '形状' }], '确定');
      if (!v) return;
      saveUserShape(v.name || '形状', d);
      e.message(`“${v.name || '形状'}”现已添加到自定形状选择器中。`);
    },
  });
  cmd({ id: 'edit.stroke', label: '描边…', enabled: (e) => !!e.doc.selection, run: strokeSelection });
  cmd({ id: 'type.create-work-path', label: '创建工作路径', enabled: (e) => e.layer?.kind === 'text' && !!e.layer.text, run: textWorkPath });
}
