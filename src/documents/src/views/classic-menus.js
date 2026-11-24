import { MOD_KEY, IS_MAC } from '../ui/dom.js';
import { openMenu } from '../ui/menu.js';

/**
 * The classic menu bar's menus — File, Edit, View, Insert, Format, Tools, Table, Window and Help — laid
 * out the way desktop word processors arrange them and wired to the commands the editor has. An entry
 * whose command no module provides is left out rather than shown dead; one that does not apply to the
 * current selection is disabled. Feature modules add their own entries through
 * `commands.extendMenu(menuId, kit)`.
 *
 * classicMenus(ctx) -> [{ id, label, items() }]
 */
export const MENU_IDS = ['file', 'edit', 'view', 'insert', 'format', 'tools', 'table', 'window', 'help'];
const LABELS = { file: '文件', edit: '编辑', view: '视图', insert: '插入', format: '格式', tools: '工具', table: '表格', window: '窗口', help: '帮助' };
export const DOCUMENT_VIEWS = [['read', '阅读视图', 'readMode'], ['print', '页面视图', 'printLayout'], ['web', 'Web 版式视图', 'webLayout'], ['outline', '大纲视图', 'outlineView'], ['draft', '草稿', 'draft']];

export function classicMenus(ctx) {
  const { w, c, a, local, kit, shortcut = () => null } = ctx;
  const sep = { separator: true };
  const ready = () => !!a.hasDocument?.();
  const editable = () => ctx.engineReady();
  const sc = (id, fallback = null) => shortcut(id) ?? fallback;
  /** A menu entry for an editor control: its label, its state and its click. */
  const control = (node, label, extra = {}) => node ? { label, disabled: !!node.disabled, onSelect: () => node.click(), ...extra } : null;
  /** An entry for an optional command: left out when no module provides it. */
  const opt = (fn, label, extra = {}) => typeof fn === 'function' ? { label, onSelect: () => fn(), ...extra } : null;
  const sub = (label, items, extra = {}) => { const list = tidy(items); return list.some(i => i && !i.separator && !i.header) ? { label, items: list, ...extra } : null; };
  const anchor = () => ctx.menuAnchor?.() || document.activeElement;
  const ext = id => { try { return tidy(w.extendMenu?.(id, kit) || []); } catch (e) { console.error(e); return []; } };
  // A module's entry takes the place of the built-in entry with the same name (it owns that command);
  // its other entries follow after a separator, each name once.
  const withExt = (id, items) => {
    const key = item => item && !item.separator && item.label ? String(item.label).replace(/…$/, '').trim().toLowerCase() : null;
    const base = tidy(items), positions = new Map(base.map((item, i) => [key(item), i]).filter(([k]) => k));
    const extra = [], seen = new Set();
    for (const item of ext(id)) {
      const k = key(item);
      if (k && seen.has(k)) continue;
      if (k) seen.add(k);
      if (k && positions.has(k)) base[positions.get(k)] = item; else extra.push(item);
    }
    return tidy([...base, ...(extra.some(item => !item.separator) ? [sep, ...extra] : [])]);
  };

  const file = () => withExt('file', [
    { label: '新建文档', icon: 'filePlus', onSelect: () => a.newDocument?.() },
    opt(w.openBackstage && (() => w.openBackstage('new')), '基于模板新建…', { icon: 'template' }),
    { label: '打开…', icon: 'folderOpen', shortcut: sc('file.open', `${MOD_KEY}+O`), onSelect: () => a.openDocument?.() },
    w.recentDocuments && { label: '打开最近文档', icon: 'history', submenu: (from, { focusFirst } = {}) => recentMenu(from, focusFirst) },
    sep,
    { label: '关闭', icon: 'close', onSelect: () => a.goHome?.() },
    !local ? control(c.saveButton, '保存', { icon: 'save', shortcut: `${MOD_KEY}+S` }) : control(c.exportButton, '下载 .docx', { icon: 'download' }),
    !local && opt(w.saveAs, '另存为…', { shortcut: sc('file.saveAs', `${MOD_KEY}+Shift+S`), disabled: !ready() }),
    opt(w.saveCopy, '下载副本', { icon: 'download', disabled: !ready() }),
    !local ? control(c.templateButton, '另存为模板…', { icon: 'template' }) : null,
    !local && opt(w.renameDocument, '重命名…', { icon: 'rename' }),
    sep,
    opt(w.versionHistory, '浏览版本历史', { icon: 'history' }),
    sub('共享', [
      opt(w.share, '邀请人员…', { icon: 'invitePeople', disabled: !ready() }),
      opt(w.publishWeb, '发布到 Web…', { icon: 'share', disabled: !ready() }),
      opt(w.sendCopy, '发送副本 (.docx)', { disabled: !ready() }),
      opt(w.savePdf, '作为 PDF 发送', { icon: 'pdf', disabled: !ready() }),
    ]),
    sub('导出', [
      { label: 'Word 文档 (.docx)', icon: 'download', disabled: c.exportButton.disabled, onSelect: () => c.exportButton.click() },
      opt(w.savePdf, 'PDF 文档 (.pdf)', { icon: 'pdf', disabled: !ready() }),
      opt(w.exportAs && (() => w.exportAs('html')), '网页 (.html)', { disabled: !ready() }),
      opt(w.exportAs && (() => w.exportAs('markdown')), 'Markdown (.md)', { disabled: !ready() }),
      opt(w.exportAs && (() => w.exportAs('text')), '纯文本 (.txt)', { disabled: !ready() }),
    ]),
    sep,
    control(c.pageSetup, '页面设置…', { icon: 'pageSetup' }),
    control(c.printButton, '打印…', { icon: 'print', shortcut: `${MOD_KEY}+P` }),
    sep,
    opt(w.openBackstage && (() => w.openBackstage('info')), '属性…', { icon: 'info' }),
    opt(w.preferences, '首选项…', { icon: 'preferences', shortcut: sc('app.preferences', `${MOD_KEY}+,`) }),
  ]);

  async function recentMenu(from, focusFirst) {
    let list = [], failed = false;
    try { list = await w.recentDocuments(); } catch { failed = true; }
    if (!from.isConnected) return;
    openMenu({ anchor: from, label: '打开最近文档', focusFirst, minWidth: 220, items: list.length
      ? [...list.map(doc => ({ label: doc.name, icon: 'filePlus', hint: doc.when || '', onSelect: () => w.openRecent(doc.path) })), sep, { label: '更多…', onSelect: () => w.openBackstage?.('open') }]
      // A listing that failed is not an empty one: say so, as the File view's Open page does.
      : [{ note: failed ? '无法加载最近文档。请检查网络连接并重试。' : '暂无最近文档。' }] });
  }

  const edit = () => {
    const engine = ctx.engine?.();
    const undoLabel = w.undoLabel?.();
    // Redo also steps forward through a design change undone (a theme, a watermark), as the toolbar's Redo does.
    const canRedo = !!(engine?.session.future.length || w.packageHistory?.().redo) && editable(), redoLabel = canRedo ? w.redoLabel?.() : null;
    const repeatLabel = w.repeatLabel?.();
    const clipboard = a.clipboardState?.() || {};
    return withExt('edit', [
      { label: !c.undo.disabled ? `撤消${undoLabel ? ` ${undoLabel}` : ''}` : '无法撤消', icon: 'undo', shortcut: `${MOD_KEY}+Z`, disabled: c.undo.disabled, onSelect: () => c.undo.click() },
      canRedo ? { label: `恢复${redoLabel ? ` ${redoLabel}` : ''}`, icon: 'redo', shortcut: `${MOD_KEY}+Y`, onSelect: () => c.redo.click() }
        : { label: w.canRepeat?.() ? `重复 ${repeatLabel}` : '无法重复', icon: 'redo', shortcut: sc('edit.repeat', `${MOD_KEY}+Y`), disabled: !w.canRepeat?.(), onSelect: () => w.repeat?.() },
      sep,
      { label: '剪切', icon: 'cut', shortcut: `${MOD_KEY}+X`, disabled: !clipboard.cut, onSelect: () => a.cut?.() },
      { label: '复制', icon: 'copy', shortcut: `${MOD_KEY}+C`, disabled: !clipboard.copy, onSelect: () => a.copy?.() },
      opt(w.copyFormat, '复制格式', { icon: 'formatPainter', shortcut: sc('edit.copyFormat'), disabled: !ready() }),
      sep,
      { label: '粘贴', icon: 'paste', shortcut: `${MOD_KEY}+V`, disabled: !clipboard.paste, onSelect: () => a.paste?.() },
      opt(w.pasteSpecial, '选择性粘贴…', { shortcut: sc('edit.pasteSpecial'), disabled: !clipboard.paste }),
      { label: '粘贴并匹配格式', icon: 'pasteText', shortcut: sc('edit.pasteMatch'), disabled: !clipboard.paste, onSelect: () => a.pastePlain?.() },
      opt(w.pasteFormat, '粘贴格式', { shortcut: sc('edit.pasteFormat'), disabled: !w.hasCopiedFormat?.() || !editable() }),
      sep,
      sub('清除', [
        opt(w.clearFormatting, '清除格式', { icon: 'clearFormat', disabled: !editable() }),
        opt(w.clearContents, '内容', { shortcut: 'Delete', disabled: !w.canClearContents?.() }),
      ]),
      { label: '全选', icon: 'selectAll', shortcut: `${MOD_KEY}+A`, disabled: !ready(), onSelect: () => a.selectAll?.() },
      ...(w.selectItems ? [sub('选择', w.selectItems() || [])] : []),
      sep,
      sub('查找', [
        { label: '查找…', icon: 'find', shortcut: `${MOD_KEY}+F`, disabled: c.find.disabled, onSelect: () => a.openSearch?.() },
        opt(w.findNext && (() => w.findNext(1)), '查找下一个', { shortcut: sc('edit.findNext'), disabled: !ready() }),
        opt(w.findNext && (() => w.findNext(-1)), '查找上一个', { shortcut: sc('edit.findPrevious'), disabled: !ready() }),
        sep,
        opt(w.openReplace, '替换…', { icon: 'replace', shortcut: IS_MAC ? 'Cmd+Shift+H' : 'Ctrl+H', disabled: c.find.disabled }),
        opt(w.goTo, '定位…', { icon: 'goTo', shortcut: sc('edit.goTo', `${MOD_KEY}+G`), disabled: !ready() }),
        { label: '高级查找和替换…', disabled: c.find.disabled, onSelect: () => (w.advancedFind ? w.advancedFind() : c.find.click()) },
      ]),
      sep,
      opt(w.editLinks, '链接…', { icon: 'link', disabled: !ready() }),
      control(c.bookmarks, '书签…', { icon: 'bookmark' }),
    ]);
  };

  const view = () => {
    const modes = w.documentViewModes?.() || ['print'];
    const current = w.documentView?.() || 'print';
    const ribbonMode = ctx.ribbonMode?.() || 'always';
    return withExt('view', [
      ...DOCUMENT_VIEWS.filter(([mode]) => mode === 'print' || modes.includes(mode)).map(([mode, label, icon]) => ({ label, icon, radio: true, checked: current === mode,
        onSelect: () => (w.setDocumentView ? w.setDocumentView(mode) : ctx.focusEditor()) })),
      sep,
      opt(w.focusMode, '专注模式', { icon: 'focus', shortcut: sc('view.focus'), disabled: !ready() }),
      sep,
      ctx.setRibbonMode && { label: '功能区', items: [
        { label: '始终显示', radio: true, checked: ribbonMode === 'always', onSelect: () => ctx.setRibbonMode('always') },
        { label: '仅显示选项卡', radio: true, checked: ribbonMode === 'tabs', onSelect: () => ctx.setRibbonMode('tabs') },
        { label: '自动隐藏', radio: true, checked: ribbonMode === 'auto', onSelect: () => ctx.setRibbonMode('auto') },
        sep, { label: '折叠或展开功能区', shortcut: sc('view.ribbon'), onSelect: () => ctx.toggleRibbon() }] },
      sub('侧边栏', [
        control(c.outline, '导航', { icon: 'navigationPane', checked: c.outline.getAttribute('aria-expanded') === 'true' }),
        opt(w.toggleReviewingPane, '审阅窗格', { icon: 'reviewingPane', checked: !!w.reviewingPaneShown?.() }),
        opt(w.spelling, '拼写', { icon: 'spelling' }),
        { label: '搜索', icon: 'find', onSelect: () => a.openSearch?.() },
        ctx.toggleFormattingPane && { label: '格式窗格', icon: 'formattingPane', checked: !!ctx.formattingPaneShown?.(), onSelect: () => ctx.toggleFormattingPane() },
        opt(w.stylesPane, '样式', { icon: 'stylesPane' }),
      ]),
      ctx.setStatusBarShown && { label: '状态栏', checked: ctx.statusBarShown(), onSelect: () => ctx.setStatusBarShown(!ctx.statusBarShown()) },
      sep,
      ctx.rulers && { label: '标尺', checked: ctx.rulers.visible, onSelect: () => ctx.rulers.toggle() },
      opt(w.toggleMarks, '格式标记', { icon: 'pilcrow', shortcut: `${MOD_KEY}+8`, checked: !!w.marksVisible?.(), disabled: !ready() }),
      opt(w.editHeader && (() => w.editHeader('header')), '页眉和页脚', { icon: 'header', disabled: !w.canEditHeader?.('header') }),
      w.setMarkupView && w.markupViews && sub('标记', w.markupViews().map(([mode, label]) => ({ label, radio: true, checked: w.markupView?.() === mode, onSelect: () => w.setMarkupView(mode) }))),
      sep,
      opt(w.zoomDialog, '显示比例…', { icon: 'zoom', disabled: !ready() }),
      sub('缩放到', [
        opt(w.setZoom && (() => w.setZoom(1)), '100%', { icon: 'zoom100', disabled: !ready() }),
        opt(w.zoomTo && (() => w.zoomTo('width')), '页宽', { icon: 'pageWidth', disabled: !ready() }),
        opt(w.zoomTo && (() => w.zoomTo('page')), '单页', { icon: 'onePage', disabled: !ready() }),
        opt(w.multiplePages, '多页', { icon: 'multiplePages', checked: !!w.multiplePagesActive?.(), disabled: !ready() }),
      ]),
      ctx.rulers && sub('单位', [['in', '英寸'], ['cm', '厘米']].map(([id, label]) => ({ label, radio: true, checked: ctx.rulers.unit === id, onSelect: () => ctx.rulers.setUnit(id) }))),
      sep,
      fullScreenItem(),
    ]);
  };

  function fullScreenItem() {
    if (!document.fullscreenEnabled) return null;
    const on = !!document.fullscreenElement;
    return { label: on ? '退出全屏' : '进入全屏', shortcut: sc('view.fullScreen'), onSelect: () => (on ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}) };
  }

  const insert = () => withExt('insert', [
    control(c.insertImage, '图片…', { icon: 'pictures' }),
    opt(w.openShapes && (() => w.openShapes(anchor(), null)), '形状…', { icon: 'shapes', disabled: !editable() }),
    c.insertTable && { label: '表格…', icon: 'table', disabled: c.insertTable.disabled, onSelect: () => c.insertTable.openPalette(anchor()) },
    sep,
    control(c.hyperlink, '链接…', { icon: 'link', shortcut: `${MOD_KEY}+K` }),
    control(c.bookmarks, '书签…', { icon: 'bookmark' }),
    opt(w.crossReference, '题注与交叉引用…', { icon: 'crossReference', disabled: !editable() }),
    sep,
    opt(w.newComment, '批注', { icon: 'newComment', shortcut: IS_MAC ? 'Cmd+Option+A' : 'Ctrl+Alt+M', disabled: !w.canComment?.() }),
    sep,
    sub('分隔符', [
      control(c.pageBreak, '分页符', { icon: 'pageBreak', shortcut: `${MOD_KEY}+Enter` }),
      opt(w.insertColumnBreak, '分栏符', { shortcut: `${MOD_KEY}+Shift+Enter`, disabled: !editable() }),
      opt(w.insertLineBreak, '文字环绕符', { shortcut: 'Shift+Enter', disabled: !editable() }),
      ...(w.sectionBreakItems?.() || []),
    ]),
    opt(w.insertBlankPage, '空白页', { icon: 'blankPage', disabled: c.pageBreak.disabled }),
    w.coverPageItems && sub('封面', w.coverPageItems() || []),
    sep,
    opt(w.insertFootnote, '脚注', { icon: 'footnote', shortcut: IS_MAC ? 'Cmd+Option+F' : 'Ctrl+Alt+F', disabled: !w.canInsertFootnote?.() }),
    opt(w.insertCaption, '题注…', { icon: 'caption', disabled: !editable() }),
    w.tocItems && sub('目录', w.tocItems() || []),
    w.pageNumberItems && sub('页码', w.pageNumberItems() || []),
    opt(w.editHeader && (() => w.editHeader('header')), '页眉', { icon: 'header', disabled: !w.canEditHeader?.('header') }),
    opt(w.editHeader && (() => w.editHeader('footer')), '页脚', { icon: 'footer', disabled: !w.canEditHeader?.('footer') }),
    sep,
    opt(w.insertTextBox, '文本框', { icon: 'textBox', disabled: !editable() }),
    opt(w.insertDateTime, '日期和时间…', { icon: 'dateTime', disabled: !editable() }),
    opt(w.insertSymbol, '符号…', { icon: 'symbol', disabled: !editable() }),
  ]);

  const format = () => withExt('format', [
    { label: '字体…', icon: 'fontDialog', shortcut: `${MOD_KEY}+D`, disabled: !editable(), onSelect: () => (w.fontDialog ? w.fontDialog() : ctx.toggleFormattingPane?.()) },
    w.textEffectItems && sub('文本效果', w.textEffectItems() || []),
    control(c.paragraphGeometry, '段落…', { icon: 'paragraphDialog', shortcut: sc('format.paragraph') }),
    // Each sets its direction (the ribbon's button toggles); the buttons carry the state for the selection.
    sub('文字方向', [false, true].map(rtl => opt(w.setParagraphDirection && (() => w.setParagraphDirection(rtl)), rtl ? '从右向左' : '从左向右',
      { icon: rtl ? 'directionRtl' : 'directionLtr', radio: true, checked: c.directionButtons[+rtl].getAttribute('aria-pressed') === 'true', disabled: !!c.directionButtons[+rtl].disabled }))),
    control(c.pageSetup, '页面设置…', { icon: 'pageSetup' }),
    sep,
    w.bulletsAndNumbering ? opt(w.bulletsAndNumbering, '项目符号和编号…', { icon: 'numbers', disabled: !editable() }) : sub('项目符号和编号', [
      control(c.bullets, '项目符号列表', { icon: 'bullets', checked: c.bullets.getAttribute('aria-pressed') === 'true' }),
      control(c.numbers, '编号列表', { icon: 'numbers', checked: c.numbers.getAttribute('aria-pressed') === 'true' }),
      ...(w.multilevelItems ? [{ header: '多级列表' }, ...(w.multilevelItems() || [])] : []),
      control(c.restart, '重新开始编号', { icon: 'restartNumbering' }),
    ]),
    w.bordersAndShading ? opt(w.bordersAndShading, '边框和底纹…', { icon: 'borders', disabled: !editable() }) : control(c.paragraphBorders, '边框…', { icon: 'borders' }),
    c.paragraphShading && { label: '底纹…', icon: 'shading', disabled: c.paragraphShading.disabled, onSelect: () => c.paragraphShading.openPalette(anchor()) },
    sep,
    w.columnItems && sub('分栏', w.columnItems() || []),
    w.tabsDialog ? opt(w.tabsDialog, '制表位…', { icon: 'tabStop', disabled: !editable() }) : control(c.paragraphGeometry, '制表位…', { icon: 'tabStop' }),
    opt(w.dropCap, '首字下沉…', { icon: 'dropCap', disabled: !editable() }),
    w.changeCase && sub('更改大小写', [['句首字母大写', 'sentence'], ['全部小写', 'lower'], ['全部大写', 'upper'], ['词首字母大写', 'title'], ['切换大小写', 'toggle']]
      .map(([label, mode]) => ({ label, disabled: !editable(), onSelect: () => w.changeCase(mode) }))),
    sub('行距', [1, 1.15, 1.5, 2, 2.5, 3].map(value => ({ label: `${value}`, disabled: !editable(), shortcut: { 1: `${MOD_KEY}+1`, 1.5: `${MOD_KEY}+5`, 2: `${MOD_KEY}+2` }[value] || null,
      onSelect: () => { c.lineSpacing.value = String(value); c.lineSpacing.dispatchEvent(new Event('change', { bubbles: true })); } })).concat([sep, control(c.lineSpacingOptions, '行距选项…')])),
    w.paragraphSpacingItems && sub('段落间距', w.paragraphSpacingItems() || []),
    sep,
    w.stylesPane ? opt(w.stylesPane, '样式…', { icon: 'stylesPane', shortcut: sc('format.styles') }) : control(c.editStyle, '修改样式…', { icon: 'editStyle' }),
    control(c.newStyle, '新建样式…', { icon: 'newStyle' }),
    opt(w.revealFormatting, '显示格式…'),
    sep,
    w.pageColorItems && sub('页面颜色', w.pageColorItems() || []),
    w.pageBorderItems && sub('页面边框', w.pageBorderItems() || []),
    sep,
    w.wrapItems && sub('自动换行', w.wrapItems() || []),
    opt(w.arrange && (() => w.arrange('forward')), '上移一层', { icon: 'bringForward', disabled: !w.canArrange?.() }),
    opt(w.arrange && (() => w.arrange('backward')), '下移一层', { icon: 'sendBackward', disabled: !w.canArrange?.() }),
    control(c.imageProperties, '图片属性…', { icon: 'pictures' }),
    sep,
    { label: '文档字体…', icon: 'documentFonts', disabled: !ready(), onSelect: () => a.loadFontFiles?.() },
  ]);

  const tools = () => withExt('tools', [
    sub('拼写和语法', w.spellingItems?.() || []),
    opt(w.wordCount, '字数统计…', { icon: 'wordCount', disabled: !ready() }),
    opt(w.languageDialog, '语言…', { icon: 'language', disabled: !ready() }),
    opt(w.preferences && (() => w.preferences('typing')), '自动更正选项…'),
    sep,
    w.toggleTracking && sub('修订', [
      { label: '修订', icon: 'trackChanges', shortcut: `${MOD_KEY}+Shift+E`, checked: !!w.isTracking?.(), disabled: !w.canTrack?.(), onSelect: () => w.toggleTracking() },
      sep,
      opt(w.resolveChanges && (() => w.resolveChanges(true, 'all')), '接受所有修订', { icon: 'accept', disabled: !w.hasRevisions?.() }),
      opt(w.resolveChanges && (() => w.resolveChanges(false, 'all')), '拒绝所有修订', { icon: 'reject', disabled: !w.hasRevisions?.() }),
      opt(w.goChange && (() => w.goChange(1)), '下一处修订', { disabled: !w.hasRevisions?.() }),
      opt(w.goChange && (() => w.goChange(-1)), '上一处修订', { disabled: !w.hasRevisions?.() }),
    ]),
    opt(w.readAloud, '大声朗读', { icon: 'readAloud', disabled: !ready() }),
    sep,
    opt(w.updateFields, '更新域', { icon: 'updateFields', shortcut: 'F9', disabled: !w.canUpdateFields?.() }),
    sep,
    opt(w.customizeKeyboard, '自定义键盘…', { icon: 'keyboard' }),
    opt(w.customizeQuickAccess, '自定义快速访问工具栏…'),
    opt(w.preferences, '首选项…', { icon: 'preferences' }),
  ]);

  const tableItem = (value, label, icon) => {
    const option = ctx.tableOption(value);
    return option ? { label, icon, disabled: c.tableActions.disabled || option.disabled, onSelect: ctx.tableAction(value) } : null;
  };
  // The table tools (views/table-tools.js), when present, provide the whole Table menu.
  const table = () => w.tableRibbon ? withExt('table', []) : withExt('table', [
    c.insertTable && { label: '插入表格…', icon: 'table', disabled: c.insertTable.disabled, onSelect: () => c.insertTable.openPalette(anchor()) },
    opt(w.drawTable, '绘制表格'),
    sep,
    sub('插入', [tableItem('addRow', '在下方插入行', 'insertBelow'), tableItem('addColumn', '在右侧插入列', 'insertRight'), sep,
      tableItem('before', '表格前插入段落', 'paragraphBefore'), tableItem('after', '表格后插入段落', 'paragraphAfter')]),
    sub('删除', [tableItem('row', '删除行', 'deleteRow'), tableItem('column', '删除列', 'deleteColumn'), tableItem('table', '删除表格', 'deleteTable')]),
    tableItem('mergeCells', '合并单元格', 'mergeCells'),
    tableItem('mergeBelow', '与下方单元格合并', 'mergeBelow'),
    tableItem('splitCell', '拆分单元格', 'splitCells'),
    sep,
    sub('自动调整', [tableItem('fitContents', '根据内容自动调整表格', 'autofit'), tableItem('fitPage', '根据窗口自动调整表格', 'autofit')]),
    { label: '重复标题行', icon: 'repeatHeader', disabled: c.tableActions.disabled || (ctx.tableOption('repeatHeader')?.disabled && ctx.tableOption('clearHeader')?.disabled),
      checked: !!ctx.tableOption('clearHeader') && !ctx.tableOption('clearHeader').disabled,
      onSelect: () => ctx.tableAction(ctx.tableOption('clearHeader') && !ctx.tableOption('clearHeader').disabled ? 'clearHeader' : 'repeatHeader')() },
    sep,
    control(c.tableProperties, '表格属性…', { icon: 'tableProperties' }),
    control(c.rowHeight, '行高…', { icon: 'rowHeight' }),
    control(c.cellAlignment, '单元格对齐方式…', { icon: 'cellAlignment' }),
    control(c.cellMargins, '单元格边距…', { icon: 'cellMargins' }),
    control(c.cellShading, '单元格底纹…', { icon: 'cellShading' }),
    control(c.cellBorders, '单元格边框…', { icon: 'cellBorders' }),
  ]);

  const windowMenu = () => withExt('window', [
    { label: '新建窗口', onSelect: () => window.open(location.href, '_blank', 'noopener') },
    fullScreenItem(),
    sep,
    control(c.outline, '导航窗格', { icon: 'navigationPane', checked: c.outline.getAttribute('aria-expanded') === 'true' }),
    opt(w.toggleReviewingPane, '审阅窗格', { icon: 'reviewingPane', checked: !!w.reviewingPaneShown?.() }),
    ctx.toggleFormattingPane && { label: '格式窗格', icon: 'formattingPane', checked: !!ctx.formattingPaneShown?.(), onSelect: () => ctx.toggleFormattingPane() },
    sep,
    { label: '所有文档', icon: 'home', onSelect: () => a.goHome?.() },
  ]);

  const help = () => withExt('help', [
    ctx.focusSearch && { label: '搜索命令…', icon: 'find', shortcut: sc('app.search'), onSelect: () => ctx.focusSearch() },
    { label: '键盘快捷键', icon: 'keyboard', shortcut: `${MOD_KEY}+/`, onSelect: () => ctx.openShortcuts() },
    ctx.showKeyTips && { label: '显示快捷键提示', hint: IS_MAC ? 'Option' : 'Alt', onSelect: () => ctx.showKeyTips() },
  ]);

  const builders = { file, edit, view, insert, format, tools, table, window: windowMenu, help };
  return MENU_IDS.map(id => ({ id, label: LABELS[id], items: () => ctx.inDocument(builders[id]()) }));
}

/** Drop missing entries, and separators at the ends or doubled. */
export function tidy(items) {
  const out = [];
  for (const item of items) {
    if (!item) continue;
    if (item.separator && (!out.length || out.at(-1).separator)) continue;
    out.push(item);
  }
  while (out.at(-1)?.separator) out.pop();
  return out;
}
