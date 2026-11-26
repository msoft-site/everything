import type { Editor } from '../../editor';
import { registerOverlay, registerPanel, registerTool, type Tool } from '../../app/registry';
import { lazy, lazyTool } from '../../app/lazy';
import { shapeOpts, type ShapeKind } from './shape-options';
import { pathOverlay } from './overlay';
import { pathsPanel } from './panel';
import { installVectorCommands } from './commands';
import { installVectorProperties } from './properties';
import { installKeys } from './keys';
import { guardTool } from './guard';
import { installShapesPanel } from './shapes-panel';

// The tools' implementations load when one is first chosen.
const penTools = lazy(() => import('./pen-tools'));
const selectTools = lazy(() => import('./select-tools'));
const shapeTools = lazy(() => import('./shape-tools'));
type Meta = Parameters<typeof lazyTool>[0];
const fromModule = <M,>(meta: Meta, mod: () => Promise<M>, pick: (m: M) => Tool) => lazyTool(meta, lazy(async () => pick(await mod())));
const shape = (id: string, label: string, icon: string, kind: ShapeKind) =>
  fromModule({ id, label, key: 'U', icon, group: 'shape' }, shapeTools, (m) => m.shapeTool(id, label, icon, kind));

// Pen, shape and path selection tools, the Paths panel, vector masks and the
// shape layer Properties editor. Shapes use the PSD-compatible vector model.
export function installVector(e: Editor) {
  installKeys();
  // Path tools wait for queued vector-mask commits before reading paths.
  const tools = [
    fromModule({ id: 'pen', label: '钢笔工具', key: 'P', icon: 'pen-tool', group: 'pen' }, penTools, (m) => m.penTool),
    fromModule({ id: 'freeform-pen', label: '自由钢笔工具', key: 'P', icon: 'pen-freeform', group: 'pen' }, penTools, (m) => m.freeformPenTool),
    fromModule({ id: 'curvature-pen', label: '弯度钢笔工具', key: 'P', icon: 'pen-curvature', group: 'pen' }, penTools, (m) => m.curvaturePenTool),
    fromModule({ id: 'add-anchor', label: '添加锚点工具', icon: 'anchor-add', group: 'pen' }, penTools, (m) => m.addAnchorTool),
    fromModule({ id: 'delete-anchor', label: '删除锚点工具', icon: 'anchor-delete', group: 'pen' }, penTools, (m) => m.deleteAnchorTool),
    fromModule({ id: 'convert-point', label: '转换点工具', icon: 'anchor-convert', group: 'pen' }, penTools, (m) => m.convertPointTool),
    fromModule({ id: 'path-select', label: '路径选择工具', key: 'A', icon: 'path-select', group: 'path-select' }, selectTools, (m) => m.pathSelectTool),
    fromModule({ id: 'direct-select', label: '直接选择工具', key: 'A', icon: 'direct-select', group: 'path-select' }, selectTools, (m) => m.directSelectTool),
    shape('rect-shape', '矩形工具', 'square', 'rect'),
    shape('ellipse-shape', '椭圆工具', 'circle', 'ellipse'),
    shape('triangle-shape', '三角形工具', 'triangle', 'triangle'),
    shape('polygon-shape', '多边形工具', 'shape-polygon', 'polygon'),
    shape('line-shape', '直线工具', 'shape-line', 'line'),
    shape('custom-shape', '自定形状工具', 'shape-custom', 'custom'),
  ];
  registerTool(...tools.map(guardTool));
  registerPanel(pathsPanel);
  registerOverlay('vector-paths', pathOverlay);
  installVectorCommands();
  installVectorProperties(e);
  installShapesPanel(e);
  // The shape tools' Align Edges option follows Tools → Snap vector tools to pixel grid.
  let snap = e.preferences.snapPixelGrid;
  if (snap) shapeOpts.alignEdges = true;
  e.preferenceHooks.push(() => {
    if (e.preferences.snapPixelGrid === snap) return;
    snap = shapeOpts.alignEdges = e.preferences.snapPixelGrid;
  });
}
