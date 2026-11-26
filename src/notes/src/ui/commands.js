import { h } from '../lib/dom.js';
import { icon, hasIcon } from '../lib/icons.js';
import { FONT_COLORS, HIGHLIGHT_COLORS, PAGE_COLORS } from '../data/colors.js';
import { TAGS, TAG_BY_ID } from '../data/tags.js';
import * as fmt from '../editor/format.js';
import * as table from '../editor/table.js';
import { toggleTag, removeAllTags, activeTags } from '../editor/tag-edit.js';
import { PENS, SHAPES, INK_COLORS, INK_WIDTHS } from '../editor/ink.js';
import { getTheme, setTheme, prefs, setPref } from './prefs.js';

/*
 * Every user-facing action, keyed by id. Ribbon buttons, menus, Tell Me and
 * keyboard shortcuts all run commands from here:
 *   { id, label, short, icon, key, desc, run(app, arg), active(app), enabled(app), menu(app), color(app), dynamicIcon(app) }
 */

const editable = (app) => Boolean(app.editor && app.editor.page && !app.editor.readOnly);
const inText = (app) => editable(app) && Boolean(app.format.editable);
const inBody = (app) => editable(app) && Boolean(app.format.inBody);
const inTable = (app) => inBody(app) && Boolean(app.format.inTable);

/** Runs a formatting action on the note's selection, restoring it if a ribbon control took focus. */
function onSelection(app, fn) {
  if (!app.editor) return;
  if (!app.format.editable || !document.activeElement?.closest?.('.outline-body, .page-title')) app.editor.restoreRange();
  fn();
  app.editor.markActiveDirty?.();
  app.updateFormatState();
}

function bodyAction(fn) {
  return (app, arg) => {
    if (!app.editor) return;
    if (!document.activeElement?.closest?.('.outline-body')) app.editor.ensureCaret();
    fn(app, arg);
    app.editor.markActiveDirty();
    app.updateFormatState();
  };
}

function lastColor(key, fallback) {
  return prefs()[key] || fallback;
}

export function buildCommands() {
  const list = [
    // ------------------------------------------------------------ clipboard
    { id: 'paste', label: '粘贴', icon: 'paste', key: 'Mod+V', desc: '从剪贴板添加内容。', enabled: editable, run: (app) => app.paste() },
    { id: 'cut', label: '剪切', icon: 'cut', key: 'Mod+X', desc: '移除所选内容并放置到剪贴板。', enabled: inText, run: (app) => app.clipboard('cut') },
    { id: 'copy', label: '复制', icon: 'copy', key: 'Mod+C', desc: '将所选内容的副本放置到剪贴板。', enabled: (app) => Boolean(app.editor?.page), run: (app) => app.clipboard('copy') },
    { id: 'formatPainter', label: '格式刷', short: '格式刷', icon: 'formatPainter', key: 'Mod+Shift+C', desc: '复制光标处的格式，然后选择文本进行应用。', enabled: inText, active: (app) => Boolean(app.painter), run: (app) => app.toggleFormatPainter() },

    // ------------------------------------------------------------ font
    { id: 'bold', label: '加粗', icon: 'bold', key: 'Mod+B', enabled: inText, active: (app) => app.format.bold, run: (app) => onSelection(app, () => fmt.toggleInline('bold')) },
    { id: 'italic', label: '斜体', icon: 'italic', key: 'Mod+I', enabled: inText, active: (app) => app.format.italic, run: (app) => onSelection(app, () => fmt.toggleInline('italic')) },
    { id: 'underline', label: '下划线', icon: 'underline', key: 'Mod+U', enabled: inText, active: (app) => app.format.underline, run: (app) => onSelection(app, () => fmt.toggleInline('underline')) },
    { id: 'strike', label: '删除线', icon: 'strike', key: 'Mod+Minus', enabled: inText, active: (app) => app.format.strike, run: (app) => onSelection(app, () => fmt.toggleInline('strikeThrough')) },
    { id: 'subscript', label: '下标', icon: 'subscript', key: 'Mod+Equal', enabled: inBody, active: (app) => app.format.subscript, run: (app) => onSelection(app, () => fmt.toggleInline('subscript')) },
    { id: 'superscript', label: '上标', icon: 'superscript', key: 'Mod+Shift+Equal', enabled: inBody, active: (app) => app.format.superscript, run: (app) => onSelection(app, () => fmt.toggleInline('superscript')) },
    {
      id: 'highlight', label: '文本高亮颜色', short: '高亮', icon: 'highlight', key: 'Mod+Shift+H', enabled: inBody,
      color: () => lastColor('highlightColor', HIGHLIGHT_COLORS[0]),
      run: (app, color) => onSelection(app, () => fmt.setHighlight(color === undefined ? lastColor('highlightColor', HIGHLIGHT_COLORS[0]) : color)),
      menu: (app) => [
        { type: 'swatches', label: '高亮颜色', colors: HIGHLIGHT_COLORS, selected: lastColor('highlightColor', HIGHLIGHT_COLORS[0]), run: (c) => { setPref('highlightColor', c); app.runCommand('highlight', c); } },
        { type: 'sep' },
        { label: '无颜色', icon: 'x', run: () => app.runCommand('highlight', null) },
      ],
    },
    {
      id: 'fontColor', label: '字体颜色', short: '字体颜色', icon: 'fontColor', enabled: inBody,
      color: () => lastColor('fontColor', '#c00000'),
      run: (app, color) => onSelection(app, () => fmt.setColor(color === undefined ? lastColor('fontColor', '#c00000') : color)),
      menu: (app) => [
        { label: '自动', icon: 'fontColor', run: () => app.runCommand('fontColor', null) },
        { type: 'sep' },
        { type: 'swatches', label: '字体颜色', colors: FONT_COLORS, selected: lastColor('fontColor', '#c00000'), run: (c) => { setPref('fontColor', c); app.runCommand('fontColor', c); } },
      ],
    },
    { id: 'clearFormat', label: '清除所有格式', short: '清除格式', icon: 'clearFormat', key: 'Mod+Shift+N', enabled: inText, run: (app) => onSelection(app, () => fmt.clearFormatting()) },
    { id: 'growFont', label: '增大字号', icon: 'grow', key: 'Mod+Shift+Period', enabled: inBody, run: (app) => onSelection(app, () => fmt.stepFontSize(1)) },
    { id: 'shrinkFont', label: '减小字号', icon: 'shrink', key: 'Mod+Shift+Comma', enabled: inBody, run: (app) => onSelection(app, () => fmt.stepFontSize(-1)) },

    // ------------------------------------------------------------ paragraph
    {
      id: 'bullets', label: '项目符号', icon: 'bullets', key: 'Mod+Period', enabled: inBody, active: (app) => app.format.bullets,
      run: bodyAction(() => fmt.toggleList(false)),
      menu: (app) => [
        { type: 'header', label: '项目符号库' },
        ...[['disc', '实心圆点'], ['circle', '空心圆点'], ['square', '实心方块'], ['"– "', '短划线'], ['"→ "', '箭头'], ['"✓ "', '对勾']].map(([type, label]) => ({ label, run: () => bodyAction(() => fmt.setListStyle(type, false))(app) })),
        { type: 'sep' },
        { label: '无', run: () => app.format.bullets && app.runCommand('bullets') },
      ],
    },
    {
      id: 'numbering', label: '编号', icon: 'numbering', key: 'Mod+Slash', enabled: inBody, active: (app) => app.format.numbering,
      run: bodyAction(() => fmt.toggleList(true)),
      menu: (app) => [
        { type: 'header', label: '编号库' },
        ...[['decimal', '1. 2. 3.'], ['lower-alpha', 'a. b. c.'], ['upper-alpha', 'A. B. C.'], ['lower-roman', 'i. ii. iii.'], ['upper-roman', 'I. II. III.']].map(([type, label]) => ({ label, run: () => bodyAction(() => fmt.setListStyle(type, true))(app) })),
        { type: 'sep' },
        { label: '无', run: () => app.format.numbering && app.runCommand('numbering') },
      ],
    },
    { id: 'outdent', label: '减小缩进量', icon: 'outdent', key: 'Alt+Shift+ArrowLeft', enabled: inBody, run: bodyAction(() => fmt.indent(-1)) },
    { id: 'indent', label: '增加缩进量', icon: 'indent', key: 'Alt+Shift+ArrowRight', enabled: inBody, run: bodyAction(() => fmt.indent(1)) },
    {
      id: 'align', label: '段落对齐方式', short: '对齐', icon: 'alignLeft', enabled: inBody,
      dynamicIcon: (app) => (app.format.align === 'center' ? 'alignCenter' : ['right', 'end'].includes(app.format.align) ? 'alignRight' : 'alignLeft'),
      menu: (app) => [
        { label: '左对齐', icon: 'alignLeft', shortcut: 'Mod+L', checked: !['center', 'right', 'end'].includes(app.format.align), run: () => app.runCommand('alignLeft') },
        { label: '居中', icon: 'alignCenter', shortcut: 'Mod+Shift+E', checked: app.format.align === 'center', run: () => app.runCommand('alignCenter') },
        { label: '右对齐', icon: 'alignRight', shortcut: 'Mod+R', checked: ['right', 'end'].includes(app.format.align), run: () => app.runCommand('alignRight') },
      ],
    },
    { id: 'alignLeft', label: '左对齐', icon: 'alignLeft', key: 'Mod+L', enabled: inBody, run: (app) => onSelection(app, () => fmt.align('left')) },
    { id: 'alignCenter', label: '居中', icon: 'alignCenter', key: 'Mod+Shift+E', enabled: inBody, run: (app) => onSelection(app, () => fmt.align('center')) },
    { id: 'alignRight', label: '右对齐', icon: 'alignRight', key: 'Mod+R', enabled: inBody, run: (app) => onSelection(app, () => fmt.align('right')) },
    { id: 'moveUp', label: '向上移动段落', icon: 'paraUp', key: 'Alt+Shift+ArrowUp', enabled: inBody, run: bodyAction(() => fmt.moveBlock(-1)) },
    { id: 'moveDown', label: '向下移动段落', icon: 'paraDown', key: 'Alt+Shift+ArrowDown', enabled: inBody, run: bodyAction(() => fmt.moveBlock(1)) },

    // ------------------------------------------------------------ styles and tags
    ...fmt.STYLES.map((s) => ({ id: `style:${s.id}`, label: s.label, key: s.key, enabled: inBody, active: (app) => app.format.styleId === s.id, run: bodyAction(() => fmt.setBlockStyle(s.id)) })),
    ...TAGS.map((t) => ({ id: `tag:${t.id}`, label: `${t.label} 标记`, key: t.key ? `Mod+${t.key}` : undefined, enabled: inBody, active: (app) => app.activeTags.has(t.id), run: bodyAction(() => app_announceTag(t.id)) })),
    { id: 'todo', label: '待办事项标记', short: '待办事项', icon: 'todoDone', desc: '为段落添加复选框。', key: 'Mod+1', enabled: inBody, active: (app) => app.activeTags.has('todo'), run: (app) => app.runCommand('tag:todo') },
    { id: 'removeTags', label: '清除标记', icon: 'x', key: 'Mod+0', enabled: inBody, run: bodyAction(() => removeAllTags()) },
    { id: 'findTags', label: '查找标记', icon: 'findTags', desc: '集中查看所有带标记的笔记。', enabled: (app) => Boolean(app.store), active: (app) => app.taskPaneKind === 'tags', run: (app) => app.toggleTaskPane('tags') },

    // ------------------------------------------------------------ voice, assist, email
    { id: 'dictate', label: '听写', icon: 'dictate', desc: '使用语音输入内容。', enabled: (app) => editable(app) && app.dictation.supported, active: (app) => app.dictation.active, run: (app) => app.dictation.toggle() },
    { id: 'assist', label: '智能助手', icon: 'sparkles', desc: '使用 AI 进行总结、查找行动项或重写。', enabled: (app) => Boolean(app.editor?.page) && app.ai.available(), active: (app) => app.taskPaneKind === 'assist', run: (app) => app.toggleTaskPane('assist') },
    { id: 'emailPage', label: '通过邮件发送页面', short: '发送页面', icon: 'mail', desc: '在电子邮件中发送此页面。', enabled: (app) => Boolean(app.editor?.page), run: (app) => app.emailPage() },

    // ------------------------------------------------------------ insert
    {
      id: 'insertTable', label: '表格', icon: 'table', desc: '插入表格以整理信息。', enabled: editable,
      menu: (app) => [{ type: 'custom', render: (close) => app.tablePicker(close) }, { type: 'sep' }, { label: '插入表格...', icon: 'table', run: () => app.insertTableDialog() }],
    },
    {
      id: 'insertFile', label: '附加文件', short: '文件', icon: 'file', desc: '将文件附加到页面。', enabled: editable, run: (app) => app.pickFiles({ attach: true }),
      menu: (app) => [
        { label: '来自此设备...', icon: 'upload', run: () => app.pickFiles({ attach: true }) },
        { label: '来自本地...', icon: 'cloud', disabled: !app.cloudPicker(), run: () => app.pickFromCloud({ attach: true }) },
      ],
    },
    { id: 'insertPrintout', label: '文件打印样式', short: '打印样式', icon: 'printout', desc: '将 PDF 页面作为图片插入并附带原文件。', enabled: editable, run: (app) => app.insertPrintout() },
    {
      id: 'insertPicture', label: '图片', short: '图片', icon: 'picture', desc: '从设备或本地文件插入图片。', enabled: editable, run: (app) => app.pickFiles({ accept: 'image/*' }),
      menu: (app) => [
        { label: '来自此设备...', icon: 'upload', run: () => app.pickFiles({ accept: 'image/*' }) },
        { label: '来自本地...', icon: 'cloud', disabled: !app.cloudPicker(), run: () => app.pickFromCloud({ accept: 'image/*' }) },
      ],
    },
    { id: 'insertScreenshot', label: '屏幕截图', icon: 'screenshot', desc: '捕获窗口或屏幕并插入。', enabled: (app) => editable(app) && Boolean(navigator.mediaDevices?.getDisplayMedia), run: (app) => app.insertScreenshot() },
    { id: 'insertLink', label: '链接', icon: 'link', key: 'Mod+K', desc: '添加指向网页、文件或笔记本中其他页面的链接。', enabled: editable, run: (app) => app.linkDialog() },
    { id: 'insertEquation', label: '数学公式', icon: 'equation', desc: '插入数学公式。', enabled: editable, run: (app) => app.equationDialog() },
    { id: 'insertDate', label: '日期', icon: 'date', key: 'Alt+Shift+D', enabled: editable, run: bodyAction(() => fmt.insertText(new Date().toLocaleDateString())) },
    { id: 'insertTime', label: '时间', icon: 'time', key: 'Alt+Shift+T', enabled: editable, run: bodyAction(() => fmt.insertText(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))) },
    { id: 'insertDateTime', label: '日期和时间', icon: 'dateTime', key: 'Alt+Shift+F', enabled: editable, run: bodyAction(() => fmt.insertText(`${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`)) },
    { id: 'insertAudio', label: '录音', short: '录音', icon: 'recordAudio', desc: '录制音频并添加到页面。', enabled: (app) => editable(app) && Boolean(window.MediaRecorder), active: (app) => app.recorder?.kind === 'audio', run: (app) => app.record('audio') },
    { id: 'insertVideo', label: '录像', short: '录像', icon: 'recordVideo', desc: '录制视频并添加到页面。', enabled: (app) => editable(app) && Boolean(window.MediaRecorder), active: (app) => app.recorder?.kind === 'video', run: (app) => app.record('video') },
    { id: 'pageTemplates', label: '页面模板', short: '页面模板', icon: 'template', desc: '从模板创建新页面。', enabled: (app) => Boolean(app.state.sectionId), run: (app) => app.templatesDialog() },
    { id: 'insertLine', label: '水平线', icon: 'hrLine', enabled: editable, run: bodyAction(() => fmt.insertHtml('<hr><p><br></p>')) },

    // ------------------------------------------------------------ table (contextual)
    { id: 'tableAbove', label: '在上方插入行', icon: 'rowAbove', enabled: inTable, run: bodyAction(() => table.insertRow('above')) },
    { id: 'tableBelow', label: '在下方插入行', icon: 'rowBelow', enabled: inTable, run: bodyAction(() => table.insertRow('below')) },
    { id: 'tableLeft', label: '在左侧插入列', icon: 'colLeft', enabled: inTable, run: bodyAction(() => table.insertColumn('left')) },
    { id: 'tableRight', label: '在右侧插入列', icon: 'colRight', enabled: inTable, run: bodyAction(() => table.insertColumn('right')) },
    {
      id: 'tableDelete', label: '删除', icon: 'trash', enabled: inTable,
      menu: (app) => [
        { label: '删除表格', run: () => bodyAction(() => table.deleteTable())(app) },
        { label: '删除列', run: () => bodyAction(() => table.deleteColumn())(app) },
        { label: '删除行', run: () => bodyAction(() => table.deleteRow())(app) },
      ],
    },
    {
      id: 'tableSelect', label: '选择', icon: 'pointer', enabled: inTable,
      menu: (app) => [{ p: 'table', l: '选择表格' }, { p: 'column', l: '选择列' }, { p: 'row', l: '选择行' }, { p: 'cell', l: '选择单元格' }].map(({ p, l }) => ({ label: l, run: () => { app.editor.restoreRange(); table.selectTablePart(p); } })),
    },
    { id: 'tableBorders', label: '隐藏边框', icon: 'grid', enabled: inTable, active: () => table.bordersHidden(), run: bodyAction(() => table.toggleBorders()) },
    { id: 'tableHeader', label: '标题行', icon: 'headerRow', enabled: inTable, active: () => table.hasHeaderRow(), run: bodyAction(() => table.toggleHeaderRow()) },
    {
      id: 'tableShading', label: '底纹', icon: 'pageColor', enabled: inTable,
      menu: (app) => [
        { type: 'swatches', label: '底纹颜色', colors: [...HIGHLIGHT_COLORS, '#f2f2f2', '#d9d9d9', '#dce9f8', '#fde7d6', '#e0f2e0', '#ece2f6'], run: (c) => bodyAction(() => table.shadeCells(c))(app) },
        { type: 'sep' },
        { label: '无颜色', run: () => bodyAction(() => table.shadeCells(null))(app) },
      ],
    },
    {
      id: 'tableAlign', label: '单元格对齐方式', short: '对齐', icon: 'alignLeft', enabled: inTable,
      menu: (app) => [['left', '左对齐', 'alignLeft'], ['center', '居中', 'alignCenter'], ['right', '右对齐', 'alignRight']].map(([w, label, ic]) => ({ label, icon: ic, run: () => bodyAction(() => table.alignCells(w))(app) })),
    },
    {
      id: 'tableSort', label: '排序', icon: 'sortAZ', enabled: inTable,
      menu: (app) => [
        { label: '升序排序', run: () => bodyAction(() => table.sortTable(false))(app) },
        { label: '降序排序', run: () => bodyAction(() => table.sortTable(true))(app) },
      ],
    },
    { id: 'tableToText', label: '转换为文本', icon: 'tableToText', enabled: inTable, run: bodyAction(() => table.tableToText()) },

    // ------------------------------------------------------------ draw
    { id: 'toolType', label: '键入', icon: 'type', desc: '键入并选择文本。', enabled: editable, active: (app) => app.editor?.ink.tool === 'type', run: (app) => app.setTool('type') },
    { id: 'toolLasso', label: '套索选择', short: '套索选择', icon: 'lasso', desc: '框选墨迹和容器。', enabled: editable, active: (app) => app.editor?.ink.tool === 'lasso', run: (app) => app.setTool('lasso') },
    { id: 'toolSpace', label: '插入空白', short: '插入空白', icon: 'insertSpace', desc: '向下拖动增加空白，向上拖动删除空白。', enabled: editable, active: (app) => app.editor?.ink.tool === 'space', run: (app) => app.setTool('space') },
    { id: 'toolEraser', label: '橡皮擦', icon: 'eraser', desc: '擦除墨迹笔划和形状。', enabled: editable, active: (app) => app.editor?.ink.tool === 'eraser', run: (app) => app.setTool('eraser') },
    {
      id: 'penSettings', label: '颜色和粗细', short: '颜色和粗细', icon: 'palette', desc: '选择笔的颜色和粗细。', enabled: editable,
      menu: (app) => {
        const pen = app.editor?.ink.pen || PENS[0];
        return [
          { type: 'header', label: '颜色' },
          { type: 'swatches', label: '墨水颜色', colors: INK_COLORS, selected: pen.color, run: (c) => app.setPen({ ...pen, color: c, id: 'custom' }, { color: c }) },
          { type: 'sep' },
          { type: 'header', label: '粗细' },
          ...INK_WIDTHS.map((w) => ({ label: `${w} 磅`, radio: true, checked: pen.width === w, run: () => app.setPen({ ...pen, width: w, id: 'custom' }, { width: w }) })),
          { type: 'sep' },
          { label: '荧光笔', checked: Boolean(pen.highlighter), run: () => app.setPen({ ...pen, highlighter: !pen.highlighter, id: 'custom' }, { highlighter: !pen.highlighter }) },
        ];
      },
    },
    { id: 'inkToShape', label: '墨迹转形状', short: '墨迹转形状', icon: 'inkToShape', desc: '将绘制的线条、圆形、矩形和三角形转换为规整形状。', enabled: editable, active: (app) => Boolean(app.editor?.ink.inkToShape), run: (app) => {
      const ink = app.editor.ink;
      ink.inkToShape = !ink.inkToShape;
      setPref('inkToShape', ink.inkToShape);
      if (ink.inkToShape && ink.tool !== 'pen') app.setTool('pen', { pen: ink.pen });
      app.ribbon.refresh();
    } },
    { id: 'deleteInk', label: '删除', icon: 'trash', desc: '删除所选墨迹或容器。', enabled: (app) => editable(app) && Boolean(app.editor.ink.selected.size || app.editor.selectedOutlines.size), run: (app) => app.editor.deleteSelectedOutlines() },

    // ------------------------------------------------------------ view
    { id: 'toggleNav', label: '导航窗格', short: '导航', icon: 'panel', key: 'Mod+Shift+G', desc: '显示或隐藏笔记本导航。', active: (app) => app.state.navVisible, run: (app) => app.toggleNav() },
    {
      id: 'navPanes', label: '导航窗格', short: '导航窗格', icon: 'panel',
      menu: (app) => [
        { label: '导航窗格', checked: app.state.navVisible, run: () => app.toggleNav() },
        { label: '页面列表', checked: app.state.pagesVisible, run: () => app.togglePages() },
      ],
    },
    { id: 'reader', label: '沉浸式阅读器', short: '沉浸式阅读器', icon: 'reader', desc: '使用可调文本和朗读功能阅读页面。', enabled: (app) => Boolean(app.editor?.page), run: (app) => app.openReader() },
    {
      id: 'pageColor', label: '页面颜色', icon: 'pageColor', enabled: editable,
      menu: (app) => [
        { label: '无颜色', checked: !app.editor.page.color, run: () => app.setPageColor(null) },
        { type: 'sep' },
        { type: 'swatches', label: '页面颜色', colors: PAGE_COLORS.map((c) => ({ value: c.light, label: c.label })), selected: PAGE_COLORS.find((c) => c.id === app.editor.page.color)?.light, run: (v) => app.setPageColor(PAGE_COLORS.find((c) => c.light === v)?.id || null) },
      ],
    },
    {
      id: 'ruleLines', label: '基准线', icon: 'ruleLines', enabled: editable,
      menu: (app) => {
        const r = app.editor.page.rules;
        const opt = (id, label) => ({ label, radio: true, checked: r === id, run: () => app.setRules(id) });
        return [
          { type: 'header', label: '基准线' },
          opt('narrow', '窄间距基准线'),
          opt('college', '中等间距基准线'),
          opt('standard', '标准基准线'),
          opt('wide', '宽间距基准线'),
          { type: 'header', label: '网格线' },
          opt('grid-small', '细网格'),
          opt('grid-medium', '中网格'),
          opt('grid-large', '大网格'),
          opt('grid-xl', '特大网格'),
          { type: 'sep' },
          { label: '无', radio: true, checked: !r, run: () => app.setRules(null) },
          { type: 'sep' },
          { label: '始终使用基准线创建页面', checked: Boolean(prefs().defaultRules), run: () => setPref('defaultRules', prefs().defaultRules ? null : r || 'college') },
        ];
      },
    },
    { id: 'deletedNotes', label: '已删除笔记', short: '已删除笔记', icon: 'trash', desc: '查看并恢复已删除的页面和分区。', run: (app) => app.openDeletedNotes() },
    { id: 'pageVersions', label: '页面版本', short: '页面版本', icon: 'history', desc: '查看并恢复此页面的早期版本。', enabled: editable, active: (app) => app.taskPaneKind === 'versions', run: (app) => app.toggleTaskPane('versions') },
    { id: 'zoomOut', label: '缩小', icon: 'zoomOut', key: 'Mod+Alt+Minus', enabled: (app) => Boolean(app.editor?.page), run: (app) => app.editor.stepZoom(-1) },
    { id: 'zoomIn', label: '放大', icon: 'zoomIn', key: 'Mod+Alt+Equal', enabled: (app) => Boolean(app.editor?.page), run: (app) => app.editor.stepZoom(1) },
    { id: 'zoom100', label: '100%', icon: 'zoom100', enabled: (app) => Boolean(app.editor?.page), run: (app) => app.editor.setZoom(1) },
    { id: 'pageWidth', label: '页宽', icon: 'pageWidth', enabled: (app) => Boolean(app.editor?.page), run: (app) => app.editor.fitWidth() },
    { id: 'fullPage', label: '全页视图', short: '全页视图', icon: 'fullPage', key: 'F11', desc: '隐藏功能区和导航以专注于页面。', active: (app) => app.state.fullPage, run: (app) => app.toggleFullPage() },
    { id: 'switchBackground', label: '切换背景', short: '切换背景', icon: 'switchBackground', desc: '在深色模式下使用浅色背景显示页面。', enabled: () => document.documentElement.dataset.themeResolved === 'dark', active: (app) => app.editor?.surface === 'light', run: (app) => app.switchBackground() },
    { id: 'newWindow', label: '新窗口', icon: 'external', desc: '在另一个窗口中打开此页面。', enabled: (app) => Boolean(app.state.pageId), run: (app) => app.newWindow() },
    {
      id: 'theme', label: '应用主题', short: '主题', icon: 'sun', desc: '使用浅色、深色或系统设置。',
      dynamicIcon: () => ({ system: 'monitor', dark: 'moon' }[getTheme()] || 'sun'),
      menu: (app) => [['system', '跟随系统设置', 'monitor'], ['light', '浅色', 'sun'], ['dark', '深色', 'moon']].map(([id, label, ic]) => ({ label, icon: ic, radio: true, checked: getTheme() === id, run: () => { setTheme(id); app.themeChanged(); } })),
    },

    // ------------------------------------------------------------ notebook / app
    { id: 'newPage', label: '新建页面', icon: 'newPage', key: 'Mod+Alt+N', run: (app) => app.newPage() },
    { id: 'newSubpage', label: '新建子页', icon: 'subpage', key: 'Mod+Shift+Alt+N', run: (app) => app.newPage({ sub: true }) },
    { id: 'newSection', label: '新建分区', icon: 'newSection', key: 'Mod+Alt+T', run: (app) => app.newSection() },
    { id: 'newSectionGroup', label: '新建分区组', icon: 'sectionGroup', run: (app) => app.newSectionGroup() },
    { id: 'newNotebook', label: '新建笔记本', icon: 'notebook', run: (app) => app.newNotebook() },
    { id: 'makeSubpage', label: '设为子页', icon: 'subpage', key: 'Mod+Alt+BracketRight', enabled: (app) => Boolean(app.state.pageId), run: (app) => app.setPageLevel(1) },
    { id: 'promoteSubpage', label: '提升子页', icon: 'promote', key: 'Mod+Alt+BracketLeft', enabled: (app) => Boolean(app.state.pageId), run: (app) => app.setPageLevel(-1) },
    { id: 'lockAll', label: '锁定所有受保护分区', icon: 'lock', key: 'Mod+Alt+L', run: (app) => app.lockAll() },
    { id: 'deletePage', label: '删除页面', icon: 'trash', enabled: (app) => Boolean(app.state.pageId), run: (app) => app.deletePage(app.state.pageId) },
    { id: 'movePage', label: '移动或复制页面...', icon: 'folderOpen', enabled: (app) => Boolean(app.state.pageId), run: (app) => app.moveDialog('page', app.state.pageId) },
    { id: 'copyPageLink', label: '复制指向页面的链接', icon: 'link', enabled: (app) => Boolean(app.state.pageId), run: (app) => app.copyLink('page', app.state.pageId) },
    { id: 'nextPage', label: '下一页', icon: 'down', key: 'Ctrl+PageDown', run: (app) => app.stepPage(1) },
    { id: 'prevPage', label: '上一页', icon: 'up', key: 'Ctrl+PageUp', run: (app) => app.stepPage(-1) },
    { id: 'search', label: '搜索笔记本', icon: 'search', key: 'Mod+E', desc: '搜索所有笔记本。', active: (app) => app.state.railView === 'search', run: (app) => app.setRailView('search', { focus: true }) },
    { id: 'searchAlt', label: '搜索笔记本', icon: 'search', key: 'Mod+Alt+F', hidden: () => true, run: (app) => app.setRailView('search', { focus: true }) },
    { id: 'recent', label: '最近笔记', icon: 'recent', active: (app) => app.state.railView === 'recent', run: (app) => app.setRailView('recent') },
    { id: 'notebooks', label: '笔记本', icon: 'notebooks', active: (app) => app.state.railView === 'notebooks', run: (app) => app.setRailView('notebooks') },
    { id: 'findOnPage', label: '在页面上查找', icon: 'search', key: 'Mod+F', enabled: (app) => Boolean(app.editor?.page), run: (app) => app.find.open() },
    { id: 'undo', label: '撤销', icon: 'undo', key: 'Mod+Z', enabled: (app) => Boolean(app.editor?.history.canUndo() || app.editor?.commitSoon.pending()), run: (app) => app.editor.undo() },
    { id: 'redo', label: '重做', icon: 'redo', key: 'Mod+Y', enabled: (app) => Boolean(app.editor?.history.canRedo()), run: (app) => app.editor.redo() },
    { id: 'print', label: '打印', icon: 'print', key: 'Mod+P', enabled: (app) => Boolean(app.editor?.page), run: () => window.print() },
    {
      id: 'export', label: '导出', icon: 'download', enabled: (app) => Boolean(app.store),
      menu: (app) => [
        { type: 'header', label: '当前页面' },
        { label: '网页 (.html)', icon: 'globe', disabled: !app.state.pageId, run: () => app.exportPage('html') },
        { label: 'Markdown (.md)', icon: 'fileText', disabled: !app.state.pageId, run: () => app.exportPage('md') },
        { label: '纯文本 (.txt)', icon: 'fileGeneric', disabled: !app.state.pageId, run: () => app.exportPage('txt') },
        { label: 'PDF (打印)', icon: 'print', disabled: !app.state.pageId, run: () => window.print() },
        { type: 'sep' },
        { type: 'header', label: '备份' },
        { label: '导出分区 (.html)', icon: 'download', disabled: !app.state.sectionId, run: () => app.exportSection() },
        { label: '导出笔记本备份 (.json)', icon: 'download', run: () => app.exportNotebook() },
      ],
    },
    {
      id: 'import', label: '导入', icon: 'upload', desc: '导入 Markdown、HTML、文本或笔记本备份。', run: (app) => app.importFiles(),
      menu: (app) => [
        { label: '从此设备...', icon: 'upload', run: () => app.importFiles() },
        { label: '从本地...', icon: 'cloud', disabled: !app.cloudPicker(), run: () => app.importFromCloud() },
      ],
    },
    { id: 'share', label: '共享', icon: 'share', enabled: (app) => Boolean(app.editor?.page), run: (app) => app.shareDialog() },
    { id: 'syncNow', label: '立即同步', icon: 'sync', key: 'Mod+S', run: (app) => app.syncNow() },
    { id: 'shortcuts', label: '快捷键', icon: 'keyboard', key: 'Mod+Shift+Slash', run: (app) => app.shortcutsDialog() },
    { id: 'about', label: '关于笔记', icon: 'info', run: (app) => app.aboutDialog() },
    { id: 'help', label: '帮助', icon: 'question', key: 'F1', run: (app) => app.helpDialog() },
    { id: 'collapseRibbon', label: '折叠功能区', icon: 'chevUp', key: 'Mod+F1', run: (app) => app.ribbon.toggleCollapsed() },
    { id: 'tellMe', label: '操作说明搜索', icon: 'tellMe', key: 'Alt+Q', run: (app) => app.focusTellMe() },
  ];
  return new Map(list.map((c) => [c.id, c]));
}

// Tag shortcuts cycle: add, mark done, remove.
function app_announceTag(id) {
  toggleTag(id, { cycle: true });
}

/** Galleries rendered in the ribbon (and as dropdowns when space is short). */
export function buildGalleries() {
  return {
    styles: {
      label: '样式',
      short: '样式',
      icon: 'pilcrow',
      items: (app) => fmt.STYLES.slice(0, 6).concat(fmt.STYLES.slice(-1)).map((s) => ({
        label: s.label,
        key: s.key,
        id: s.id,
        render: () => h(`span.style-preview.${s.id}`, s.label),
        run: () => app.runCommand(`style:${s.id}`),
      })),
      active: (app, entry) => app.format.styleId === entry.id,
      enabled: inBody,
      menu: (app) => fmt.STYLES.map((s) => ({ label: s.label, shortcut: s.key, radio: true, checked: app.format.styleId === s.id, disabled: !inBody(app), run: () => app.runCommand(`style:${s.id}`) })),
    },
    tags: {
      label: '标记',
      short: '标记',
      icon: 'flag',
      items: (app) => TAGS.slice(0, 6).map((t) => ({
        label: t.label,
        key: t.key ? `Mod+${t.key}` : undefined,
        id: t.id,
        render: () => [tagGlyph(t), h('span', t.label)],
        run: () => app.runCommand(`tag:${t.id}`),
      })),
      active: (app, entry) => app.activeTags.has(entry.id),
      enabled: inBody,
      menu: (app) => [
        ...TAGS.map((t) => ({
          label: t.label,
          icon: hasIcon(`tag:${t.id}`) ? `tag:${t.id}` : undefined,
          shortcut: t.key ? `Mod+${t.key}` : undefined,
          checked: app.activeTags.has(t.id),
          disabled: !inBody(app),
          run: () => app.runCommand(`tag:${t.id}`),
        })),
        { type: 'sep' },
        { label: '删除标记', icon: 'x', shortcut: 'Mod+0', disabled: !inBody(app), run: () => app.runCommand('removeTags') },
        { label: '查找标记', icon: 'findTags', run: () => app.runCommand('findTags') },
      ],
    },
    pens: {
      label: '笔',
      short: '笔',
      icon: 'pen',
      items: (app) => PENS.map((p) => ({
        label: p.label,
        id: p.id,
        render: () => penGlyph(p),
        run: () => app.setPen(p),
      })),
      active: (app, entry) => app.editor?.ink.tool === 'pen' && app.editor.ink.pen.id === entry.id,
      enabled: editable,
      menu: (app) => PENS.map((p) => ({ label: p.label, swatch: p.color, radio: true, checked: app.editor?.ink.tool === 'pen' && app.editor.ink.pen.id === p.id, run: () => app.setPen(p) })),
    },
    shapes: {
      label: '形状',
      short: '形状',
      icon: 'shapes',
      items: (app) => SHAPES.map((s) => ({
        label: s.label,
        id: s.kind,
        render: () => icon(s.icon, 16),
        run: () => app.setTool('shape', { shape: s.kind }),
      })),
      active: (app, entry) => app.editor?.ink.tool === 'shape' && app.editor.ink.shape === entry.id,
      enabled: editable,
      menu: (app) => SHAPES.map((s) => ({ label: s.label, icon: s.icon, run: () => app.setTool('shape', { shape: s.kind }) })),
    },
  };
}

/** A tag's glass drawing for the ribbon, or its masked line icon in the tag's colour. */
function tagGlyph(t) {
  if (hasIcon(`tag:${t.id}`)) return icon(`tag:${t.id}`, 16);
  return h('span.tag-glyph', { style: { '--tag-color': t.color, '--tag-icon': `var(--tagicon-${t.id})` } });
}

/** A pen or highlighter drawn in glass, its tip or band in the pen's ink. */
function penGlyph(p) {
  const s = icon(p.highlighter ? 'inkHighlighter' : 'inkPen', 22);
  s.classList.add('pen-glyph');
  s.style.setProperty('--pen-color', p.color);
  return s;
}


export { TAG_BY_ID, activeTags, icon };
