// Retouching and assisted selection: healing tools, Quick/Object Selection,
// Magnetic Lasso, Select Subject/Sky, Color Range, Select and Mask, Context
// Fill, AI Fill/Expand, Remove Background, Matting and the Quick Actions Bar.
// Tools, commands and menus register here; their implementations load on
// first use (app/lazy.ts).
import type { Editor } from '../../editor';
import { contributeMenu, registerCommand, registerOverlay, registerTool, type Tool } from '../../app/registry';
import { lazy, lazyRun, lazyTool } from '../../app/lazy';
import { installTaskbar } from './taskbar';
import { hasMask } from '../../model/masks';
import { maskActions } from '../panels/layer-properties';

const selectTools = lazy(() => import('./tools-select'));
const healTools = lazy(() => import('./tools-heal'));
const commands = lazy(() => import('./commands'));
const colorRange = lazy(() => import('./color-range'));
const focusArea = lazy(() => import('./focus-area'));
const selectAndMask = lazy(() => import('./select-mask'));
const contextFill = lazy(() => import('./context-fill'));
const ai = lazy(() => import('./ai'));
const refineMask = lazy(() => import('./refine-mask'));

type ToolMeta = Parameters<typeof lazyTool>[0];
const tool = (meta: ToolMeta, list: typeof selectTools | typeof healTools) =>
  lazyTool(
    meta,
    lazy(async () => {
      const m = await list();
      const tools: Tool[] = 'selectTools' in m ? m.selectTools : m.healTools;
      return tools.find((t) => t.id === meta.id)!;
    }),
  );

export function installRetouch(e: Editor) {
  registerTool(
    tool({ id: 'object-selection', label: '对象选择工具', key: 'W', icon: 'object-select', group: 'select' }, selectTools),
    tool({ id: 'quick-selection', label: '快速选择工具', key: 'W', icon: 'quick-select', group: 'select' }, selectTools),
    tool({ id: 'magnetic-lasso', label: '磁性套索工具', key: 'L', icon: 'lasso-magnetic', group: 'lasso' }, selectTools),
    tool({ id: 'spot-healing', label: '污点修复画笔工具', key: 'J', icon: 'heal-spot', group: 'heal' }, healTools),
    tool({ id: 'healing-brush', label: '修复画笔工具', key: 'J', icon: 'bandage', group: 'heal' }, healTools),
    tool({ id: 'patch', label: '修补工具', key: 'J', icon: 'patch', group: 'heal' }, healTools),
    tool({ id: 'context-move', label: '内容感知移动工具', key: 'J', icon: 'context-move', group: 'heal' }, healTools),
    tool({ id: 'remove-tool', label: '移除工具', key: 'J', icon: 'remove-tool', group: 'heal' }, healTools),
    tool({ id: 'red-eye', label: '红眼工具', key: 'J', icon: 'red-eye', group: 'heal' }, healTools),
  );
  const doc = (e: Editor) => e.hasDocument;
  const pixel = (e: Editor) => e.layer?.kind === 'pixel';
  const sel = (e: Editor) => !!e.doc.selection;
  registerCommand(
    { id: 'select.subject', label: '主体', description: '选择图像中最显著的主体。', enabled: doc, ...lazyRun(commands, (m, e) => m.selectSubject(e)) },
    { id: 'select.sky', label: '天空', description: '选择图像顶部的天空区域。', enabled: doc, ...lazyRun(commands, (m, e) => m.selectSky(e)) },
    {
      id: 'layer.remove-background',
      label: '移除背景',
      description: '使用图层蒙版隐藏所选图层的背景（非破坏性）。',
      enabled: (e) => !!e.layer && e.layer.kind !== 'group' && e.layer.kind !== 'adjustment',
      ...lazyRun(commands, (m, e) => m.removeBackground(e)),
    },
    {
      id: 'layer.mask-refine-edge',
      label: '调整蒙版边缘…',
      description: '根据图层像素重新估算图层蒙版边缘，使头发与柔和轮廓紧随图像。',
      enabled: (e) => !!e.layer && e.layer.kind !== 'group' && e.layer.kind !== 'adjustment' && (hasMask(e.layer) || !!e.layer.maskGrid),
      ...lazyRun(refineMask, (m, e) => m.refineMaskEdge(e)),
    },
    {
      id: 'layer.mask-enhance-edge',
      label: '优化边缘',
      description: '一步根据图层像素优化图层蒙版边缘，使毛发细节跟随图像。',
      enabled: (e) => !!e.layer && e.layer.kind !== 'group' && e.layer.kind !== 'adjustment' && (hasMask(e.layer) || !!e.layer.maskGrid),
      ...lazyRun(refineMask, (m, e) => m.enhanceMaskEdge(e)),
    },
    { id: 'layer.defringe', label: '去边…', enabled: pixel, ...lazyRun(commands, (m, e) => m.runMatting(e, 'defringe')) },
    { id: 'layer.color-decontaminate', label: '颜色净化…', enabled: pixel, ...lazyRun(commands, (m, e) => m.runMatting(e, 'decontaminate')) },
    { id: 'layer.remove-black-matte', label: '移去黑色杂边', enabled: pixel, ...lazyRun(commands, (m, e) => m.runMatting(e, 'black')) },
    { id: 'layer.remove-white-matte', label: '移去白色杂边', enabled: pixel, ...lazyRun(commands, (m, e) => m.runMatting(e, 'white')) },
    { id: 'select.color-range', label: '色彩范围…', description: '通过取样颜色或预设范围选取像素。', enabled: doc, ...lazyRun(colorRange, (m, e) => m.openColorRange(e)) },
    { id: 'select.focus-area', label: '焦点区域…', description: '选择图像中对焦清晰的部分。', enabled: doc, ...lazyRun(focusArea, (m, e) => m.openFocusArea(e)) },
    {
      id: 'select.mask-refine',
      label: '选择并遮住…',
      shortcut: 'Mod+Alt+R',
      description: '使用边缘检测、画笔和全局调整来优化选区边缘。',
      enabled: doc,
      ...lazyRun(selectAndMask, (m, e, arg) => m.openSelectAndMask(e, arg === 'mask')),
    },
    { id: 'edit.context-fill', label: '内容识别填充…', description: '使用图像其他区域的纹理和结构填充选区。', enabled: sel, ...lazyRun(contextFill, (m, e) => m.openContextFill(e)) },
    { id: 'edit.context-fill-apply', label: '内容识别填充', hidden: true, enabled: sel, ...lazyRun(contextFill, (m, e) => m.quickContextFill(e)) },
    { id: 'edit.ai-fill', label: 'AI 填充…', description: '使用本地智能引擎在选区中生成新内容。', enabled: sel, ...lazyRun(ai, (m, e, arg) => m.openAIFill(e, arg)), recordable: false },
    { id: 'edit.ai-expand', label: 'AI 扩展…', description: '扩展画布并使用本地智能引擎生成新区域。', enabled: doc, ...lazyRun(ai, (m, e, arg) => m.openAIExpand(e, arg)), recordable: false },
  );
  // Live previews of the Color Range and Focus Area dialogs.
  registerOverlay('color-range-preview', () => colorRange.loaded?.previewOverlay() ?? '');
  registerOverlay('focus-area-preview', () => focusArea.loaded?.previewOverlay() ?? '');
  contributeMenu('edit', ['edit.ai-expand'], 'edit.ai-fill');
  installTaskbar(e);
  contributeMenu('layer', ['layer.remove-background'], 'layer.clipping-mask');
  // Properties: refining the edge of the selected layer's mask, in its Mask section.
  maskActions.push(
    ['layer.mask-enhance-edge', '优化边缘', 'wand-sparkles'],
    ['layer.mask-refine-edge', '调整边缘…', 'feather'],
  );
}
