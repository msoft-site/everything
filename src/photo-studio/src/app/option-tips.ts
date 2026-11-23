// Tooltips for the options bar. Tools render their controls as HTML; after
// rendering, every control without a title gets one here: written help for
// the common controls (with their keyboard shortcuts), the command's label,
// shortcut and description for command buttons, else its visible label.
import { commands } from './registry';
import { formatShortcut, isMac } from './shortcuts';

const tips: Record<string, string> = {
  // Brushes (painting and retouching tools).
  'brush-size': '画笔直径（像素）。[ 减小，] 增大',
  'retouch-size': '画笔直径（像素）。[ 减小，] 增大',
  'brush-hardness': '边缘硬度：0% 为柔和，100% 为锐利。Shift+[ 更柔和，Shift+] 更硬',
  'retouch-hardness': '边缘硬度：0% 为柔和，100% 为锐利。Shift+[ 更柔和，Shift+] 更硬',
  'brush-opacity': '单次笔触的最大不透明度。数字键：1 = 10% … 0 = 100%；快速连按两位数可设精确值',
  'brush-flow': '在区域上拖动时颜料累积的速度。Shift+数字键',
  'brush-mode': '颜料与下方像素的混合方式',
  'brush-smoothing': '使笔触更平稳；值越高，跟随指针越平滑松散',
  'tool-strength': '每次笔触的效果强度',
  'tone-range': '工具主要改变的色调范围',
  'tone-exposure': '每次笔触的效果强度',
  'sponge-flow': '每次笔触改变饱和度的程度',
  'protect-tones': '减淡或加深时防止色相偏移和溢色',
  'sponge-mode': '降低或增加颜色饱和度',
  'pattern-scale': '图案相对于其原始定义的大小',
  'pattern-aligned': '在多次笔触之间连续对齐图案，而不是每次笔触重新开始',
  'clone-aligned': '在笔触之间保持源点随画笔移动；关闭则每次从源点重新开始',
  'heal-aligned': '在笔触之间保持源点随画笔移动；关闭则每次从源点重新开始',
  'clone-sample': '源像素取自哪些图层',
  'heal-sample': '源像素取自哪些图层',
  'mixer-preset': '潮湿度、载色量与混合率的预设组合',
  'art-style': '从源状态绘制的笔触形态',
  'bg-sampling': '要擦除颜色的取样方式：连续取样、首次点击时取样，或使用背景色',
  'bg-tolerance': '颜色与取样颜色相差多大范围内仍会被擦除',
  'replace-tolerance': '颜色与取样颜色相差多大范围内仍会被替换',
  // Selections.
  'sel-feather': '将新选区的边缘柔化指定像素数',
  'sel-aa': '平滑曲线选区的锯齿边缘',
  'marquee-style': '自由绘制、按固定长宽比或按固定大小绘制',
  'marquee-w': '选框的宽度（或宽度比）',
  'marquee-h': '选框的高度（或高度比）',
  tolerance: '颜色与点击处颜色相差多大范围内仍会被包含 (0–255)',
  'wand-contiguous': '仅选择相连的区域；关闭则选择图像中所有该颜色区域',
  'wand-all': '对合并后的可见图层取样，而不是仅当前图层',
  'qs-all': '对合并后的可见图层取样，而不是仅当前图层',
  'object-all': '对合并后的可见图层取样，而不是仅当前图层',
  'object-mode': '在对象周围绘制矩形或套索',
  'sample-size': '点击位置周围像素的平均值范围',
  'sampler-size': '每个取样点周围像素的平均值范围',
  'sample-layers': '对当前图层、当前及下方图层或所有图层取样（可选忽略调整图层）',
  'wand-sample-size': '与点击处的单个像素或周围像素的平均值进行比较',
  // Healing and removal.
  'spot-type': '污点的替换方式',
  'spot-all': '对合并后的可见图层取样，而不是仅当前图层',
  'patch-mode': '将修补区域与周围融合，或根据上下文内容填充',
  'patch-all': '对合并后的可见图层取样，而不是仅当前图层',
  'remove-all': '对合并后的可见图层取样，而不是仅当前图层',
  'remove-each': '每次笔触后立即应用；关闭则等待手动提交',
  'cm-mode': '移动所选区域或通过复制进行扩展',
  'cm-all': '对合并后的可见图层取样，而不是仅当前图层',
  'contextMove-structure': '结果保留原始形状的紧密程度 (1–7)',
  'contextMove-color': '颜色与周围环境融合的程度 (0–10)',
  'mixer-all': '对合并后的可见图层取样，而不是仅当前图层',
  'red-pupil': '瞳孔相对于眼睛的大小',
  'red-darken': '修正后瞳孔的变暗程度',
  // Fill and gradient.
  'bucket-source': '使用前景色或当前图案填充',
  'bucket-opacity': '填充的不透明度。可通过数字键设置',
  'gradient-mode': '渐变与下方像素的混合方式',
  'gradient-opacity': '渐变的不透明度。可通过数字键设置',
  'gradient-reverse': '交换起始颜色和结束颜色',
  'gradient-dither': '添加轻微杂色以防止色彩条带',
  'gradient-transparency': '使用渐变的透明度色标',
  'gradient-method': '色标之间的颜色插值方式',
  // Shapes and paths.
  'vec-mode': '绘制形状图层、路径或像素',
  'vec-op': '新形状与现有形状的组合方式',
  'vec-w': '所选形状的宽度',
  'vec-h': '所选形状的高度',
  'vec-weight': '线条粗细',
  'vec-radius': '圆角半径',
  'vec-tri-radius': '圆角半径',
  'vec-poly-radius': '圆角半径',
  'vec-sides': '边数（或星形的顶点数）',
  'vec-smooth-indents': '使星形的内角变圆滑',
  'vec-arrow-start': '线条起点处的箭头',
  'vec-arrow-end': '线条终点处的箭头',
  'pen-mode': '绘制形状图层或路径',
  'pen-op': '新路径与现有路径的组合方式',
  'pen-rubber': '移动指针时预览下一段路径',
  'pen-auto': '点击线段添加锚点，或点击锚点将其删除',
  'pen-fit': '自由路径跟随指针的紧密程度',
  // Crop, slices, artboards and frames.
  'crop-preset': '裁剪的长宽比或尺寸',
  'crop-rw': '长宽比的宽度部分',
  'crop-rh': '长宽比的高度部分',
  'crop-overlay': '在裁剪框内绘制的参考线',
  'pc-w': '校正后图像的宽度',
  'pc-h': '校正后图像的高度',
  'pc-grid': '在透视框内显示网格',
  'slice-style': '自由绘制、按固定长宽比或按固定大小绘制',
  'artboard-preset': '新画板的尺寸',
  'artboard-w': '画板宽度',
  'artboard-h': '画板高度',
  'artboard-bg': '新画板的背景',
  'frame-fit': '置入图像适应画框的方式',
  // Measuring and notes.
  'count-group': '新标记添加到的计数编组',
  'count-color': '此编组标记的颜色',
  'count-marker': '标记的大小',
  'count-label': '数字标签的大小',
  'note-tool-author': '新注释上显示的名称',
  // Move and view.
  'auto-select': `点击即可选中指针下最顶层的图层（或按住 ${isMac ? '⌘' : 'Ctrl'}）`,
  'transform-snap': '变换时对齐到参考线、图层和画布',
  'transform-proportions': '缩放时保持等比例（按 Shift 切换）',
  'view-angle': '视图旋转角度（度）',
  'rotate-all': '旋转所有打开的窗口',
  'scrubby-zoom': '向左或向右拖动以缩小或放大',
};

// What each tool does, for the toolbar tooltips.
export const toolTips: Record<string, string> = {
  move: '移动和变换图层及选区',
  artboard: '创建、移动和调整画板大小',
  'rect-marquee': '选择矩形区域（按住 Shift 选择正方形）',
  'ellipse-marquee': '选择椭圆区域（按住 Shift 选择正圆）',
  'row-marquee': '选择 1 像素高的单行区域',
  'column-marquee': '选择 1 像素宽的单列区域',
  lasso: '自由手绘选择区域',
  'polygonal-lasso': '通过逐点点击选择直边多边形区域',
  'magnetic-lasso': '选择边缘自动贴合图像特征的区域',
  'object-selection': '选择矩形或套索内的对象',
  'quick-selection': '涂抹并自动扩展到边缘的选区',
  'magic-wand': '选择颜色相近的区域',
  crop: '裁剪并拉直图像',
  'perspective-crop': '裁剪并同时校正透视',
  slice: '将图像划分为切片以供导出',
  'slice-select': '选择、移动和编辑切片',
  frame: '绘制用于遮罩置入图像的画框',
  eyedropper: '从图像中吸取前景色（按住 Alt：背景色）',
  'color-sampler': '在信息面板中放置最多十个颜色读数点',
  ruler: '测量距离和角度；拉直图像',
  count: '通过点击对图像中的对象进行计数',
  note: '在画布上添加文字注释',
  'spot-healing': '通过涂抹去除污点和瑕疵',
  'healing-brush': '使用取样纹理绘画并匹配周围光照（按住 Alt 点击取样源）',
  patch: '使用其他区域的像素修复所选区域',
  'context-move': '移动或扩展选区并自动填充原位置',
  'remove-tool': '涂抹干扰物以将其移除',
  'red-eye': '消除闪光灯照片中的红眼',
  brush: '使用前景色绘画',
  pencil: '绘制硬边缘笔触',
  'color-replacement': '替换颜色并保留原有纹理',
  'mixer-brush': '与画布上的颜色相互混合的画笔',
  'clone-stamp': '使用从其他区域取样的像素绘画（按住 Alt 点击取样源）',
  'pattern-stamp': '使用图案绘画',
  'history-brush': '恢复绘制早期历史记录状态中的像素',
  'art-history': '使用早期历史记录状态绘制风格化笔触',
  eraser: '擦除为透明，或在背景图层上擦除为背景色',
  'background-eraser': '擦除取样颜色并保留前景边缘',
  'magic-eraser': '一键擦除颜色相近的区域',
  gradient: '通过拖动填充渐变',
  bucket: '使用前景色或图案填充颜色相近的区域',
  'blur-tool': '通过涂抹柔化区域',
  'sharpen-tool': '通过涂抹锐化区域',
  'smudge-tool': '像用手指一样涂抹颜料',
  dodge: '通过涂抹提亮区域',
  burn: '通过涂抹加深区域',
  sponge: '通过涂抹改变区域的饱和度',
  pen: '使用锚点和曲线绘制路径和形状',
  'freeform-pen': '自由手绘路径',
  'curvature-pen': '通过点击曲线上的点绘制平滑路径',
  'add-anchor': '向路径添加锚点',
  'delete-anchor': '从路径移除锚点',
  'convert-point': '在平滑点和角点之间转换锚点',
  type: '添加横排文字',
  'type-vertical': '添加直排文字',
  'type-mask': '创建横排文字形状的选区',
  'type-mask-vertical': '创建直排文字形状的选区',
  'path-select': '选择并移动整条路径和形状',
  'direct-select': '选择并移动锚点和线段',
  'rect-shape': '绘制矩形（按住 Shift 绘制正方形）',
  'ellipse-shape': '绘制椭圆（按住 Shift 绘制正圆）',
  'triangle-shape': '绘制三角形',
  'polygon-shape': '绘制多边形和星形',
  'line-shape': '绘制直线和箭头',
  'custom-shape': '从形状库中绘制自定义形状',
  hand: '平移视图（或在使用任何工具时按住空格键）；双击以适应屏幕显示图像',
  'rotate-view': '旋转视图而不改变图像本身',
  zoom: '点击或拖动以放大（按住 Alt 缩小）；双击恢复 100%',
};
/** The toolbar tooltip of a tool: name, key and what it does. */
export function toolTitle(t: { id: string; label: string; key?: string }) {
  const key = t.key ? ` (${t.key.toUpperCase()})` : '';
  return `${t.label}${key}${toolTips[t.id] ? `\n${toolTips[t.id]}` : ''}`;
}
/** Keep every control in the options bar titled, however a tool renders it. */
export function watchOptionTips(root: HTMLElement) {
  applyOptionTips(root);
  new MutationObserver(() => applyOptionTips(root)).observe(root, { childList: true, subtree: true });
}
/** Give every control in `root` without a title a helpful one. */
export function applyOptionTips(root: HTMLElement) {
  for (const c of root.querySelectorAll<HTMLElement>('input:not([type=hidden]),select,button,textarea,[role=slider]')) {
    const label = c.closest('label');
    if (c.title || label?.title) continue;
    const command = c.dataset.command ? commands.get(c.dataset.command) : undefined;
    let tip = tips[c.id];
    if (!tip && command) {
      const keys = formatShortcut(command.shortcut);
      tip = `${command.label.replace(/…$/, '')}${keys ? ` (${keys})` : ''}${command.description ? `: ${command.description}` : ''}`;
    }
    // A label's own words, without the option texts of a select inside it.
    const words = label ? [...label.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(' ') : '';
    tip ??= (c.getAttribute('aria-label') || words || c.textContent || '').replace(/\s+/g, ' ').trim();
    if (tip) (label ?? c).title = tip;
  }
}
