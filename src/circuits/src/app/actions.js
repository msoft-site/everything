// Command definitions. Shortcuts avoid keys the browser reserves (Ctrl+W,
// Ctrl+N, Ctrl+T) and the menu accelerator letters (F E V C P D T U R W H),
// which open menus for two-key chords such as P then W for a wire.

import { applyTheme, currentTheme } from './theme.js';
import { mil, GRID_PRESETS, SCH_GRID_PRESETS, formatLength, parseLength } from '../core/units.js';
import { promptDialog } from '../ui/dialog.js';
import { bboxUnion, bboxEmpty } from '../core/geom.js';
import { schBounds, translateSch } from '../model/sch.js';
import { pcbBounds, translatePcb } from '../model/pcb.js';

export function registerCommands(app) {
  const c = app.commands;
  const ed = () => app.activeEditor;
  const is = (k) => () => ed()?.kind === k;
  const hasProject = () => !!app.project;
  const hasSel = () => (ed()?.selection?.size || 0) > 0;
  const hasEditor = () => !!ed()?.doc;
  // A sheet or board, which can be drawn as SVG; the component editor cannot.
  const hasDrawing = () => ed()?.kind === 'sch' || ed()?.kind === 'pcb';

  c.registerAll([
    // ---- File ----
    { id: 'file.new', label: '新建项目', menuLabel: '项目(&P)...', icon: 'new', run: () => app.newProject() },
    { id: 'file.open', label: '打开项目', menuLabel: '打开(&O)...', icon: 'open', shortcut: 'Mod+O', anywhere: true, run: () => app.openProjectDialog() },
    { id: 'file.openExample', label: '打开示例项目', menuLabel: '打开示例(&X)', icon: 'chip', run: () => app.openExample() },
    { id: 'file.save', label: '保存', menuLabel: '保存(&S)', icon: 'save', shortcut: 'Mod+S', anywhere: true, enabled: hasProject, run: () => (ed()?.kind === 'lib' ? ed().save() : app.save()) },
    { id: 'file.saveAs', label: '另存为', menuLabel: '另存为(&A)...', shortcut: 'Mod+Shift+S', anywhere: true, enabled: hasProject, run: () => app.saveAs() },
    { id: 'file.download', label: '下载项目文件', menuLabel: '下载项目文件(&D)', icon: 'download', enabled: hasProject, run: () => app.downloadProject() },
    { id: 'file.import', label: '从本机打开项目文件', menuLabel: '从本机打开(&D)...', icon: 'upload', run: () => app.importFromDevice() },
    { id: 'file.importKicad', label: '导入 KiCad 文件', menuLabel: 'KiCad 原理图与电路板文件(&K)...', icon: 'upload', run: () => app.importKicad() },
    { id: 'file.share', label: '共享项目', menuLabel: '共享(&H)...', icon: 'share', enabled: hasProject, run: () => app.share() },
    { id: 'file.history', label: '版本历史', menuLabel: '版本历史(&V)...', icon: 'history', enabled: hasProject, run: () => app.history() },
    { id: 'file.print', label: '打印', menuLabel: '打印(&P)...', icon: 'print', shortcut: 'Mod+P', anywhere: true, enabled: hasDrawing, run: () => app.print() },
    { id: 'file.close', label: '关闭项目', menuLabel: '关闭项目(&C)', enabled: hasProject, run: () => app.closeProject() },

    // ---- Export ----
    { id: 'export.fabrication', label: '导出生产文件包', menuLabel: '生产文件包 (Gerber、钻孔、BOM)(&F)...', icon: 'gerber', enabled: () => !!app.project?.boards.length, run: () => app.exportFabrication() },
    { id: 'export.gerber', label: '导出 Gerber 文件', menuLabel: 'Gerber 文件(&G)', enabled: () => !!app.project?.boards.length, run: () => app.exportGerbers() },
    { id: 'export.drill', label: '导出钻孔文件', menuLabel: '钻孔文件(&D)', enabled: () => !!app.project?.boards.length, run: () => app.exportDrill() },
    { id: 'export.bom', label: '物料清单 (BOM)', menuLabel: '物料清单 (CSV)(&B)', icon: 'bom', enabled: hasProject, run: () => app.exportBom() },
    { id: 'export.pnp', label: '贴片坐标文件', menuLabel: '贴片坐标 (CSV)(&P)', enabled: () => !!app.project?.boards.length, run: () => app.exportPnp() },
    { id: 'export.netlist', label: '网表', menuLabel: '网表(&N)', icon: 'network', enabled: hasProject, run: () => app.exportNetlist() },
    { id: 'export.svg', label: '导出当前文档为 SVG', menuLabel: '当前文档的 SVG 图像(&S)', icon: 'image', enabled: hasDrawing, run: () => app.exportSvg() },

    // ---- Edit ----
    { id: 'edit.undo', label: '撤销', menuLabel: '撤销(&U)', icon: 'undo', shortcut: 'Mod+Z', enabled: () => !!ed()?.doc?.store.canUndo, run: () => app.undo() },
    { id: 'edit.redo', label: '重做', menuLabel: '重做(&R)', icon: 'redo', shortcut: ['Mod+Y', 'Mod+Shift+Z'], enabled: () => !!ed()?.doc?.store.canRedo, run: () => app.redo() },
    { id: 'edit.cut', label: '剪切', menuLabel: '剪切(&T)', icon: 'cut', shortcut: 'Mod+X', enabled: hasSel, run: () => app.cut() },
    { id: 'edit.copy', label: '复制', menuLabel: '复制(&C)', icon: 'copy', shortcut: 'Mod+C', enabled: hasSel, run: () => app.copy() },
    { id: 'edit.paste', label: '粘贴', menuLabel: '粘贴(&P)', icon: 'paste', shortcut: 'Mod+V', enabled: hasEditor, run: () => app.paste() },
    { id: 'edit.duplicate', label: '复制副本', menuLabel: '复制副本(&I)', shortcut: 'Mod+D', enabled: hasSel, run: () => app.duplicate() },
    { id: 'edit.delete', label: '删除', menuLabel: '删除(&D)', icon: 'trash', shortcut: ['Delete', 'Backspace'], enabled: hasSel, run: () => ed().deleteSelection() },
    { id: 'edit.selectAll', label: '全选', menuLabel: '全选(&A)', shortcut: 'Mod+A', enabled: hasEditor, run: () => ed().selectAll() },
    { id: 'edit.find', label: '查找', menuLabel: '查找(&F)...', icon: 'search', shortcut: 'Mod+F', anywhere: true, enabled: hasEditor, run: () => app.find() },
    { id: 'edit.properties', label: '属性', menuLabel: '属性(&R)', icon: 'settings', run: () => app.showPanel('properties', true) },
    { id: 'edit.alignLeft', label: '左对齐', menuLabel: '左对齐(&L)', enabled: () => (ed()?.selection?.size || 0) > 1, run: () => align('left') },
    { id: 'edit.alignRight', label: '右对齐', menuLabel: '右对齐(&R)', enabled: () => (ed()?.selection?.size || 0) > 1, run: () => align('right') },
    { id: 'edit.alignTop', label: '顶对齐', menuLabel: '顶对齐(&T)', enabled: () => (ed()?.selection?.size || 0) > 1, run: () => align('top') },
    { id: 'edit.alignBottom', label: '底对齐', menuLabel: '底对齐(&B)', enabled: () => (ed()?.selection?.size || 0) > 1, run: () => align('bottom') },
    { id: 'edit.distributeH', label: '水平均匀分布', menuLabel: '水平均匀分布(&H)', enabled: () => (ed()?.selection?.size || 0) > 2, run: () => distribute('x') },
    { id: 'edit.distributeV', label: '垂直均匀分布', menuLabel: '垂直均匀分布(&V)', enabled: () => (ed()?.selection?.size || 0) > 2, run: () => distribute('y') },
    { id: 'app.preferences', label: '首选项', menuLabel: '首选项(&E)...', icon: 'settings', shortcut: 'Mod+,', anywhere: true, run: () => app.preferences() },

    // ---- View ----
    { id: 'view.fit', label: '适应文档', menuLabel: '适应文档(&D)', icon: 'fit', shortcut: ['Mod+PageDown', 'Home'], enabled: hasEditor, run: () => ed().fitAll() },
    { id: 'view.fitContent', label: '适应所有对象', menuLabel: '适应所有对象(&O)', enabled: hasEditor, run: () => ed().fitContent() },
    { id: 'view.fitSelection', label: '适应选中项', menuLabel: '适应选中项(&S)', shortcut: 'Mod+Shift+PageDown', enabled: hasSel, run: () => ed().fitSelection() },
    { id: 'view.zoomIn', label: '放大', menuLabel: '放大(&I)', icon: 'zoom-in', shortcut: ['PageUp', 'Mod+='], enabled: hasEditor, run: () => ed().zoomBy(1.4) },
    { id: 'view.zoomOut', label: '缩小', menuLabel: '缩小(&O)', icon: 'zoom-out', shortcut: ['PageDown', 'Mod+-'], enabled: hasEditor, run: () => ed().zoomBy(1 / 1.4) },
    { id: 'view.cycleGrid', label: '下一个栅格尺寸', menuLabel: '下一个栅格尺寸(&N)', icon: 'grid', shortcut: 'G', enabled: hasEditor, run: () => cycleGrid(1) },
    { id: 'view.cycleGridBack', label: '上一个栅格尺寸', shortcut: 'Shift+G', enabled: hasEditor, run: () => cycleGrid(-1) },
    { id: 'view.setGrid', label: '设置栅格', menuLabel: '设置栅格(&G)...', shortcut: 'Mod+G', enabled: hasEditor, run: () => setGrid() },
    { id: 'view.toggleUnits', label: '切换单位 (mm / mil)', menuLabel: '切换单位(&U)', shortcut: 'Q', run: () => { app.settings.set('units', app.settings.get('units') === 'mm' ? 'mil' : 'mm'); app.toast(`单位：${app.settings.get('units')}`, { timeout: 1500 }); } },
    { id: 'view.hud', label: '平视坐标显示 (HUD)', menuLabel: '平视坐标显示(&H)', shortcut: 'Shift+H', checked: () => app.settings.get('showHud'), run: () => { app.settings.set('showHud', !app.settings.get('showHud')); ed()?._updateHud?.(); } },
    { id: 'panel.projects', label: '项目面板', menuLabel: '项目(&P)', checked: () => app.isPanelVisible('projects'), run: () => app.togglePanel('projects') },
    { id: 'panel.navigator', label: '导航器面板', menuLabel: '导航器(&N)', checked: () => app.isPanelVisible('navigator'), run: () => app.togglePanel('navigator') },
    { id: 'panel.properties', label: '属性面板', menuLabel: '属性(&R)', checked: () => app.isPanelVisible('properties'), run: () => app.togglePanel('properties') },
    { id: 'panel.components', label: '元器件面板', menuLabel: '元器件(&C)', checked: () => app.isPanelVisible('components'), run: () => app.togglePanel('components') },
    { id: 'panel.layers', label: '板层面板', menuLabel: '板层(&L)', checked: () => app.isPanelVisible('layers'), run: () => app.togglePanel('layers') },
    { id: 'panel.messages', label: '消息面板', menuLabel: '消息(&M)', checked: () => app.bottomOpen, run: () => app.setBottomDock(!app.bottomOpen) },
    { id: 'theme.system', label: '主题：跟随系统', menuLabel: '跟随系统(&S)', checked: () => currentTheme() === 'system', run: () => setTheme('system') },
    { id: 'theme.light', label: '主题：浅色', menuLabel: '浅色(&L)', checked: () => currentTheme() === 'light', run: () => setTheme('light') },
    { id: 'theme.dark', label: '主题：深色', menuLabel: '深色(&D)', checked: () => currentTheme() === 'dark', run: () => setTheme('dark') },

    // ---- Project ----
    { id: 'project.compile', label: '编译并检查原理图', menuLabel: '编译 (电气规则检查)(&O)', icon: 'erc', enabled: hasProject, run: () => app.compile() },
    { id: 'project.updateBoard', label: '从原理图更新电路板', menuLabel: '从原理图更新电路板(&U)...', icon: 'sync', enabled: hasProject, run: () => app.updateBoard() },
    { id: 'project.addSheet', label: '添加原理图页', menuLabel: '原理图页(&S)', icon: 'symbol', enabled: hasProject, run: () => app.addDoc('sch') },
    { id: 'project.addBoard', label: '添加电路板', menuLabel: '电路板(&B)', icon: 'board', enabled: hasProject, run: () => app.addDoc('pcb') },
    { id: 'project.rename', label: '重命名项目', menuLabel: '重命名项目(&R)...', icon: 'pencil', enabled: hasProject, run: () => app.renameProject() },
    { id: 'lib.manage', label: '项目元器件库', menuLabel: '元器件库(&L)...', icon: 'library', enabled: hasProject, run: () => app.manageLibrary() },
    { id: 'lib.newComponent', label: '新建元器件', menuLabel: '新建元器件(&C)...', icon: 'package', enabled: hasProject, run: () => app.newComponent() },
    { id: 'lib.footprintWizard', label: '封装向导', menuLabel: '封装向导(&F)...', icon: 'wand', enabled: hasProject, run: () => app.newComponent({ start: 'footprint' }) },
    { id: 'lib.blankComponent', label: '在编辑器中新建空白元器件', menuLabel: '在编辑器中新建元器件(&E)', icon: 'pencil', enabled: hasProject, run: () => app.newComponentInEditor() },

    // ---- Component editor ----
    { id: 'libed.place.pin', context: 'lib', label: '放置引脚', menuLabel: '引脚(&P)', icon: 'pin', run: () => ed().startTool('pin') },
    { id: 'libed.place.pad', context: 'lib', label: '放置焊盘', menuLabel: '焊盘(&D)', icon: 'pad', run: () => ed().startTool('pad') },
    { id: 'libed.padArray', context: 'lib', label: '焊盘阵列', menuLabel: '焊盘阵列(&Y)...', icon: 'layout-grid', run: () => ed().padArrayDialog() },
    { id: 'libed.place.line', context: 'lib', label: '绘制线条', menuLabel: '线条(&L)', icon: 'line-tool', run: () => ed().startTool('line') },
    { id: 'libed.place.rect', context: 'lib', label: '绘制矩形', menuLabel: '矩形(&R)', icon: 'square', run: () => ed().startTool('rect') },
    { id: 'libed.place.circle', context: 'lib', label: '绘制圆形', menuLabel: '圆形(&C)', icon: 'circle', run: () => ed().startTool('circle') },
    { id: 'libed.place.arc', context: 'lib', label: '绘制圆弧', menuLabel: '圆弧(&A)', icon: 'arc-tool', run: () => ed().startTool('arc') },
    { id: 'libed.place.poly', context: 'lib', label: '绘制多边形', menuLabel: '多边形(&O)', icon: 'region', run: () => ed().startTool('poly') },
    { id: 'libed.place.text', context: 'lib', label: '放置文本', menuLabel: '文本(&T)', icon: 'text', run: () => ed().startTool('text') },
    { id: 'libed.rotate', context: 'lib', label: '旋转选中项', menuLabel: '旋转(&R)', icon: 'rotate-ccw', shortcut: 'Space', enabled: hasSel, run: () => ed().rotateSelection(90) },
    { id: 'libed.rotateCw', context: 'lib', label: '顺时针旋转选中项', shortcut: 'Shift+Space', enabled: hasSel, run: () => ed().rotateSelection(270) },
    { id: 'libed.mirrorX', context: 'lib', label: '水平镜像', menuLabel: '水平镜像(&H)', icon: 'flip-h', shortcut: 'X', enabled: hasSel, run: () => ed().mirrorSelection('x') },
    { id: 'libed.mirrorY', context: 'lib', label: '垂直镜像', menuLabel: '垂直镜像(&V)', icon: 'flip-v', shortcut: 'Y', enabled: hasSel, run: () => ed().mirrorSelection('y') },
    { id: 'libed.mode.symbol', context: 'lib', label: '编辑符号', menuLabel: '符号(&S)', icon: 'symbol', checked: () => ed()?.mode === 'symbol', run: () => ed().setMode('symbol') },
    { id: 'libed.mode.footprint', context: 'lib', label: '编辑封装', menuLabel: '封装(&F)', icon: 'footprint', checked: () => ed()?.mode === 'footprint', run: () => ed().setMode('footprint') },
    { id: 'libed.pinTable', context: 'lib', label: '引脚表', menuLabel: '引脚表(&T)...', icon: 'table', run: () => ed().pinTableDialog() },
    { id: 'libed.courtyard', context: 'lib', label: '按焊盘适配占位边界', menuLabel: '适配占位边界(&C)', icon: 'select-rect', run: () => ed().fitCourtyard() },
    { id: 'libed.save', context: 'lib', label: '保存元器件到项目', menuLabel: '保存到项目(&S)', icon: 'save', run: () => ed().save() },
    { id: 'libed.validate', context: 'lib', label: '检查元器件', menuLabel: '检查元器件(&H)', icon: 'list-checks', run: () => {
      const e = ed();
      const list = e.validate().map((m) => ({ ...m, severity: m.severity === 'info' ? 'warning' : m.severity, docId: e.doc.id }));
      app.panels.messages.set(list, `元器件检查：${e.doc.name}`);
      app.setBottomDock(true);
      app.updateStatus();
    } },

    // ---- Schematic ----
    { id: 'sch.place.part', context: 'sch', label: '放置器件', menuLabel: '器件(&P)...', icon: 'part', run: () => app.showPanel('components', true, true) },
    { id: 'sch.place.wire', context: 'sch', label: '放置导线', menuLabel: '导线(&W)', icon: 'wire', shortcut: 'Shift+W', run: () => ed().startTool('wire') },
    { id: 'sch.place.bus', context: 'sch', label: '放置总线', menuLabel: '总线(&B)', icon: 'bus', run: () => ed().startTool('bus') },
    { id: 'sch.place.label', context: 'sch', label: '放置网络标号', menuLabel: '网络标号(&L)', icon: 'net-label', run: () => ed().startTool('label') },
    { id: 'sch.place.power', context: 'sch', label: '放置电源端口', menuLabel: '电源端口(&O)', icon: 'power', run: () => ed().startTool('power') },
    { id: 'sch.place.ground', context: 'sch', label: '放置接地', menuLabel: '接地(&G)', icon: 'ground', run: () => ed().startTool('ground') },
    { id: 'sch.place.port', context: 'sch', label: '放置图纸端口', menuLabel: '图纸端口(&R)', icon: 'port', run: () => ed().startTool('port') },
    { id: 'sch.place.junction', context: 'sch', label: '放置连接点', menuLabel: '连接点(&J)', icon: 'junction', run: () => ed().startTool('junction') },
    { id: 'sch.place.noerc', context: 'sch', label: '放置忽略 ERC 标记', menuLabel: '忽略 ERC 标记(&N)', icon: 'no-erc', run: () => ed().startTool('noerc') },
    { id: 'sch.place.text', context: 'sch', label: '放置文本', menuLabel: '文本(&T)', icon: 'text', run: () => ed().startTool('text') },
    { id: 'sch.place.line', context: 'sch', label: '绘制线条', menuLabel: '线条(&L)', icon: 'line-tool', run: () => ed().startTool('line') },
    { id: 'sch.place.rect', context: 'sch', label: '绘制矩形', menuLabel: '矩形(&R)', icon: 'square', run: () => ed().startTool('rect') },
    { id: 'sch.place.circle', context: 'sch', label: '绘制圆形', menuLabel: '圆形(&C)', icon: 'circle', run: () => ed().startTool('circle') },
    { id: 'sch.rotate', context: 'sch', label: '旋转选中项', menuLabel: '旋转(&R)', icon: 'rotate-ccw', shortcut: 'Space', enabled: hasSel, run: () => ed().rotateSelection(90) },
    { id: 'sch.rotateCw', context: 'sch', label: '顺时针旋转选中项', shortcut: 'Shift+Space', enabled: hasSel, run: () => ed().rotateSelection(270) },
    { id: 'sch.mirrorX', context: 'sch', label: '水平镜像', menuLabel: '水平镜像(&H)', icon: 'flip-h', shortcut: 'X', enabled: hasSel, run: () => ed().mirrorSelection('x') },
    { id: 'sch.mirrorY', context: 'sch', label: '垂直镜像', menuLabel: '垂直镜像(&V)', icon: 'flip-v', shortcut: 'Y', enabled: hasSel, run: () => ed().mirrorSelection('y') },
    { id: 'sch.annotate', label: '原理图自动编号', menuLabel: '原理图自动编号(&A)...', icon: 'annotate', enabled: () => !!app.project?.sheets.length, run: () => app.annotate() },
    { id: 'sch.sheetOptions', context: 'sch', label: '图纸选项', menuLabel: '图纸选项(&S)', icon: 'settings', run: () => { ed().setSelection([]); app.showPanel('properties', true); } },
    { id: 'sch.clearHighlight', context: 'sch', label: '清除网络高亮', menuLabel: '清除高亮(&C)', shortcut: 'Shift+C', run: () => ed().clearHighlight() },

    // ---- Board ----
    { id: 'pcb.place.component', context: 'pcb', label: '放置元器件', menuLabel: '元器件(&C)...', icon: 'component', run: () => app.showPanel('components', true, true) },
    { id: 'pcb.route', context: 'pcb', label: '交互式布线', menuLabel: '交互式布线(&I)', icon: 'route', shortcut: 'Shift+W', run: () => ed().startTool('route') },
    { id: 'pcb.place.via', context: 'pcb', label: '放置过孔', menuLabel: '过孔(&V)', icon: 'via', run: () => ed().startTool('via') },
    { id: 'pcb.place.pad', context: 'pcb', label: '放置焊盘', menuLabel: '焊盘(&A)', icon: 'pad', run: () => ed().startTool('pad') },
    { id: 'pcb.place.pour', context: 'pcb', label: '放置多边形覆铜', menuLabel: '多边形覆铜(&P)', icon: 'pour', run: () => ed().startTool('pour') },
    { id: 'pcb.place.fill', context: 'pcb', label: '放置填充区', menuLabel: '填充区(&F)', icon: 'fill', run: () => ed().startTool('fill') },
    { id: 'pcb.place.region', context: 'pcb', label: '放置实心区域', menuLabel: '实心区域(&R)', icon: 'region', run: () => ed().startTool('region') },
    { id: 'pcb.place.keepout', context: 'pcb', label: '放置禁止布线区', menuLabel: '禁止布线区(&K)', icon: 'keepout', run: () => ed().startTool('keepout') },
    { id: 'pcb.place.line', context: 'pcb', label: '在当前层绘制线条', menuLabel: '线条(&L)', icon: 'line-tool', run: () => ed().startTool('line') },
    { id: 'pcb.place.text', context: 'pcb', label: '放置文本', menuLabel: '文本(&T)', icon: 'text', run: () => ed().startTool('text') },
    { id: 'pcb.place.dimension', context: 'pcb', label: '放置尺寸标注', menuLabel: '尺寸标注(&D)', icon: 'dimension', run: () => ed().startTool('dim') },
    { id: 'pcb.measure', context: 'pcb', label: '测量距离', menuLabel: '测量距离(&M)', icon: 'measure', shortcut: 'Mod+M', run: () => ed().startTool('measure') },
    { id: 'pcb.rotate', context: 'pcb', label: '旋转选中项', menuLabel: '旋转 90 度(&R)', icon: 'rotate-ccw', shortcut: 'Space', enabled: hasSel, run: () => ed().rotateSelection(90) },
    { id: 'pcb.rotateCw', context: 'pcb', label: '顺时针旋转选中项', shortcut: 'Shift+Space', enabled: hasSel, run: () => ed().rotateSelection(270) },
    { id: 'pcb.flip', context: 'pcb', label: '翻转到另一面', menuLabel: '翻转到另一面(&F)', icon: 'flip', shortcut: 'L', enabled: () => ed()?.selectedObjects?.().some((o) => o.t === 'comp'), run: () => ed().flipSelection() },
    { id: 'pcb.nextLayer', context: 'pcb', label: '下一层', menuLabel: '下一层(&N)', icon: 'layer-up', shortcut: ['+', 'Num+'], run: () => ed().stepLayer(1) },
    { id: 'pcb.prevLayer', context: 'pcb', label: '上一层', menuLabel: '上一层(&P)', icon: 'layer-up', shortcut: ['-', 'Num-'], run: () => ed().stepLayer(-1) },
    { id: 'pcb.nextCopper', context: 'pcb', label: '下一铜皮层', shortcut: ['*', 'Num*'], run: () => ed().stepLayer(1, true) },
    { id: 'pcb.singleLayer', context: 'pcb', label: '单层模式', menuLabel: '单层模式(&L)', icon: 'single-layer', shortcut: 'Shift+S', run: () => ed().cycleSingleLayer() },
    { id: 'pcb.view2d', context: 'pcb', label: '2D 视图', menuLabel: '2D 视图(&2)', icon: 'view-2d', shortcut: '2', run: () => app.set3d(false) },
    { id: 'pcb.toggle3d', context: 'pcb', label: '3D 视图', menuLabel: '3D 视图(&3)', icon: 'cube', shortcut: '3', checked: () => !!app.view3dOpen, run: () => app.set3d(!app.view3dOpen) },
    { id: 'pcb.fitBoard', context: 'pcb', label: '适应板框', menuLabel: '适应板框(&B)', run: () => ed().fitBoard() },
    { id: 'pcb.clearHighlight', context: 'pcb', label: '清除网络高亮', menuLabel: '清除高亮(&C)', shortcut: 'Shift+C', run: () => ed().clearHighlight() },
    { id: 'pcb.drc', context: 'pcb', label: '设计规则检查 (DRC)', menuLabel: '设计规则检查(&D)', icon: 'drc', run: () => app.runDrc() },
    { id: 'pcb.repour', context: 'pcb', label: '重新覆铜所有多边形', menuLabel: '重新覆铜(&R)', icon: 'pour', run: () => ed().repour() },
    { id: 'pcb.rules', context: 'pcb', label: '设计规则', menuLabel: '规则(&R)...', icon: 'ruler', run: () => app.editRules() },
    { id: 'pcb.layerStack', context: 'pcb', label: '层叠结构', menuLabel: '层叠结构(&S)...', icon: 'layers', run: () => app.editLayerStack() },
    { id: 'pcb.boardSize', context: 'pcb', label: '设置电路板尺寸', menuLabel: '设置矩形尺寸(&R)...', icon: 'board', run: () => app.boardSize() },
    { id: 'pcb.redefineBoard', context: 'pcb', label: '重绘板框形状', menuLabel: '绘制板框形状(&D)', run: () => ed().startTool('board') },
    { id: 'pcb.addCutout', context: 'pcb', label: '添加板内挖空', menuLabel: '添加板内挖空(&C)', run: () => ed().startTool('cutout') },
    { id: 'pcb.setOrigin', context: 'pcb', label: '设置原点', menuLabel: '在光标处设置原点(&O)', run: () => app.setOriginAtCursor() },
    { id: 'pcb.boardOptions', context: 'pcb', label: '电路板选项', menuLabel: '电路板选项(&B)', icon: 'settings', run: () => { ed().setSelection([]); app.showPanel('properties', true); } },
    { id: 'pcb.setCopper', context: 'pcb', label: '设置铜皮层数', visible: () => false, run: (n) => app.setCopperLayers(n) },
    { id: 'pcb.autorouteAll', context: 'pcb', label: '自动布线全部网络', menuLabel: '全部自动布线(&R)', icon: 'autoroute', run: () => app.autoroute() },
    { id: 'pcb.autorouteNet', context: 'pcb', label: '自动布线高亮网络', menuLabel: '自动布线当前网络(&N)', enabled: () => !!ed()?.highlight, run: () => app.autoroute([ed().highlight.net]) },
    { id: 'pcb.unrouteAll', context: 'pcb', label: '移除所有走线和过孔', menuLabel: '拆除全部布线(&U)', run: () => app.unroute(null) },
    { id: 'pcb.unrouteNet', context: 'pcb', label: '拆除高亮网络布线', menuLabel: '拆除高亮网络布线(&H)', enabled: () => !!ed()?.highlight, run: () => app.unroute(ed().highlight.net) },
    { id: 'pcb.routingMode', context: 'pcb', label: '遇到障碍物停止布线', menuLabel: '遇到障碍物停止(&S)', shortcut: 'Shift+R', checked: () => app.settings.get('routingMode') === 'stop', run: () => app.settings.set('routingMode', app.settings.get('routingMode') === 'stop' ? 'ignore' : 'stop') },
    { id: 'report.boardInfo', label: '电路板信息', menuLabel: '电路板信息(&I)', icon: 'info', enabled: () => !!app.project?.boards.length, run: () => app.boardInfo() },

    // ---- Window and help ----
    { id: 'window.nextTab', label: '下一个文档', menuLabel: '下一个文档(&N)', shortcut: 'Alt+PageDown', anywhere: true, run: () => app.cycleTab(1) },
    { id: 'window.prevTab', label: '上一个文档', shortcut: 'Alt+PageUp', anywhere: true, run: () => app.cycleTab(-1) },
    { id: 'window.closeTab', label: '关闭文档', menuLabel: '关闭文档(&C)', shortcut: 'Alt+W', anywhere: true, enabled: () => !!app.activeDocId, run: () => app.closeTab(app.activeDocId) },
    { id: 'window.closeAll', label: '关闭所有文档', menuLabel: '关闭所有文档(&A)', run: () => app.closeAllTabs() },
    { id: 'window.resetLayout', label: '重置面板布局', menuLabel: '重置布局(&R)', run: () => app.resetLayout() },
    { id: 'help.gettingStarted', label: '快速入门', menuLabel: '快速入门(&G)', icon: 'help', run: () => app.gettingStarted() },
    { id: 'help.shortcuts', label: '键盘快捷键', menuLabel: '键盘快捷键(&K)', icon: 'keyboard', shortcut: ['?', 'F1'], anywhere: true, run: () => app.showShortcuts() },
    { id: 'help.commands', label: '搜索命令', menuLabel: '搜索命令(&S)...', icon: 'command', shortcut: ['Mod+K', 'Mod+Shift+P'], anywhere: true, run: () => app.commandPalette() },
    { id: 'help.github', label: 'GitHub 源代码', menuLabel: 'GitHub 源代码(&G)', icon: 'github', run: () => window.open('https://github.com/heyputer/everything', '_blank', 'noopener,noreferrer') },
    { id: 'help.about', label: '关于 Circuits', menuLabel: '关于 Circuits(&A)', icon: 'info', run: () => app.about() },
  ]);

  function setTheme(t) { app.settings.set('theme', t); applyTheme(t); }

  function cycleGrid(dir) {
    const e = ed();
    if (!e) return;
    if (e.kind === 'sch' || e.mode === 'symbol') {
      const list = SCH_GRID_PRESETS, cur = app.settings.get('schGrid');
      const next = list[(list.indexOf(cur) + dir + list.length) % list.length] || mil(100);
      app.settings.set('schGrid', next);
      app.toast(`栅格 ${formatLength(next, 'mil')}`, { timeout: 1200 });
    } else {
      const u = app.settings.get('units');
      const list = GRID_PRESETS[u];
      const cur = app.settings.get('pcbGrid');
      let i = list.indexOf(cur);
      if (i < 0) i = list.findIndex((g) => g > cur) - 1;
      const next = list[(i + dir + list.length) % list.length];
      app.settings.set('pcbGrid', next);
      app.toast(`栅格 ${formatLength(next, u)}`, { timeout: 1200 });
    }
    e.requestRender(true);
    app.updateStatus();
  }

  async function setGrid() {
    const e = ed();
    const schLike = e.kind === 'sch' || e.mode === 'symbol';
    const u = schLike ? 'mil' : app.settings.get('units');
    const key = schLike ? 'schGrid' : 'pcbGrid';
    const v = await promptDialog({ title: '吸附栅格', label: `栅格 (${u})`, value: formatLength(app.settings.get(key), u, { suffix: false }), validate: (s) => { const n = parseLength(s, u); return n > 0 ? null : '请输入大于零的尺寸'; } });
    if (v) { app.settings.set(key, parseLength(v, u)); e.requestRender(true); app.updateStatus(); }
  }

  function boundsOf(o) { return ed().kind === 'sch' ? schBounds(o, ed().lib) : pcbBounds(o, ed().lib); }
  function moveBy(o, dx, dy) { return ed().kind === 'sch' ? translateSch(o, dx, dy) : translatePcb(o, dx, dy); }

  function align(side) {
    const e = ed();
    const objs = e.selectedObjects();
    const boxes = objs.map(boundsOf);
    const all = boxes.reduce(bboxUnion, bboxEmpty());
    e.doc.store.transact('对齐', (s) => {
      objs.forEach((o, i) => {
        const b = boxes[i];
        const dx = side === 'left' ? all.minX - b.minX : side === 'right' ? all.maxX - b.maxX : 0;
        const dy = side === 'bottom' ? all.minY - b.minY : side === 'top' ? all.maxY - b.maxY : 0;
        const g = e.grid || 1;
        if (dx || dy) s.update(o.id, moveBy(o, Math.round(dx / g) * g, Math.round(dy / g) * g));
      });
    });
  }

  function distribute(axis) {
    const e = ed();
    const objs = e.selectedObjects().map((o) => ({ o, b: boundsOf(o) }));
    const key = axis === 'x' ? 'minX' : 'minY';
    objs.sort((a, b) => a.b[key] - b.b[key]);
    const first = objs[0].b[key], last = objs[objs.length - 1].b[key];
    const step = (last - first) / (objs.length - 1);
    const g = e.grid || 1;
    e.doc.store.transact('均匀分布', (s) => {
      objs.forEach(({ o, b }, i) => {
        const target = Math.round((first + step * i) / g) * g;
        const d = target - b[key];
        if (d) s.update(o.id, moveBy(o, axis === 'x' ? d : 0, axis === 'y' ? d : 0));
      });
    });
  }
}
