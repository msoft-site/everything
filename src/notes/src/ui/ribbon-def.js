/** Ribbon layout: tabs, their groups and which commands sit where. */
export const RIBBON_TABS = [
  {
    id: 'home',
    label: '开始',
    groups: [
      { label: '剪贴板', items: [{ cmd: 'paste', size: 'big' }, { stack: [[{ cmd: 'cut', label: true }], [{ cmd: 'copy', label: true }], [{ cmd: 'formatPainter', label: true }]] }] },
      {
        label: '字体',
        items: [{
          stack: [
            [{ combo: 'fontName' }, { combo: 'fontSize' }, { cmd: 'growFont' }, { cmd: 'shrinkFont' }],
            [{ cmd: 'bold' }, { cmd: 'italic' }, { cmd: 'underline' }, { cmd: 'strike' }, { cmd: 'subscript' }, { cmd: 'superscript' }, { cmd: 'highlight', split: true }, { cmd: 'fontColor', split: true }, { cmd: 'clearFormat' }],
          ],
        }],
      },
      {
        label: '段落',
        items: [{
          stack: [
            [{ cmd: 'bullets', split: true }, { cmd: 'numbering', split: true }, { cmd: 'outdent' }, { cmd: 'indent' }],
            [{ cmd: 'align', dropdown: true }, { cmd: 'moveUp' }, { cmd: 'moveDown' }],
          ],
        }],
      },
      { label: '样式', items: [{ gallery: 'styles', rows: 2, visible: 6 }] },
      { label: '标记', items: [{ cmd: 'todo', size: 'big' }, { gallery: 'tags', visible: 6 }, { cmd: 'findTags', size: 'big' }] },
      { label: '语音', items: [{ cmd: 'dictate', size: 'big' }] },
      { label: '智能助手', items: [{ cmd: 'assist', size: 'big' }] },
      { label: '电子邮件', items: [{ cmd: 'emailPage', size: 'big' }] },
    ],
  },
  {
    id: 'insert',
    label: '插入',
    groups: [
      { label: '表格', items: [{ cmd: 'insertTable', size: 'big', dropdown: true }] },
      { label: '文件', items: [{ cmd: 'insertFile', size: 'big', split: true }, { cmd: 'insertPrintout', size: 'big' }] },
      { label: '图片', items: [{ cmd: 'insertPicture', size: 'big', split: true }, { cmd: 'insertScreenshot', size: 'big' }] },
      { label: '链接', items: [{ cmd: 'insertLink', size: 'big' }] },
      { label: '符号', items: [{ cmd: 'insertEquation', size: 'big' }] },
      { label: '时间戳', items: [{ stack: [[{ cmd: 'insertDate', label: true }], [{ cmd: 'insertTime', label: true }], [{ cmd: 'insertDateTime', label: true }]] }] },
      { label: '形状', items: [{ gallery: 'shapes', visible: 7 }, { cmd: 'insertLine', size: 'big' }] },
      { label: '录制', items: [{ cmd: 'insertAudio', size: 'big' }, { cmd: 'insertVideo', size: 'big' }] },
      { label: '页面', items: [{ cmd: 'pageTemplates', size: 'big' }, { cmd: 'toolSpace', size: 'big' }] },
    ],
  },
  {
    id: 'draw',
    label: '绘图',
    groups: [
      { label: '工具', items: [{ cmd: 'toolType', size: 'big' }, { cmd: 'toolLasso', size: 'big' }, { cmd: 'toolSpace', size: 'big' }, { cmd: 'toolEraser', size: 'big' }] },
      { label: '笔', items: [{ gallery: 'pens', rows: 2, visible: 8 }, { cmd: 'penSettings', size: 'big', dropdown: true }] },
      { label: '形状', items: [{ gallery: 'shapes', visible: 7 }, { cmd: 'inkToShape', size: 'big' }] },
      { label: '编辑', items: [{ cmd: 'deleteInk', size: 'big' }] },
    ],
  },
  {
    id: 'view',
    label: '视图',
    groups: [
      { label: '视图', items: [{ cmd: 'navPanes', size: 'big', dropdown: true }, { cmd: 'reader', size: 'big' }, { cmd: 'fullPage', size: 'big' }] },
      { label: '页面设置', items: [{ cmd: 'pageColor', size: 'big', dropdown: true }, { cmd: 'ruleLines', size: 'big', dropdown: true }, { cmd: 'switchBackground', size: 'big' }] },
      { label: '历史记录', items: [{ cmd: 'deletedNotes', size: 'big' }, { cmd: 'pageVersions', size: 'big' }] },
      { label: '缩放', items: [{ cmd: 'zoomOut', size: 'big' }, { cmd: 'zoomIn', size: 'big' }, { stack: [[{ cmd: 'zoom100', label: true }], [{ cmd: 'pageWidth', label: true }]] }] },
      { label: '窗口', items: [{ cmd: 'newWindow', size: 'big' }, { cmd: 'theme', size: 'big', dropdown: true }] },
    ],
  },
  {
    id: 'help',
    label: '帮助',
    groups: [
      { label: '帮助', items: [{ cmd: 'help', size: 'big' }, { cmd: 'shortcuts', size: 'big' }, { cmd: 'about', size: 'big' }] },
    ],
  },
  {
    id: 'table',
    label: '表格',
    contextual: true,
    groups: [
      { label: '选择', items: [{ cmd: 'tableSelect', size: 'big', dropdown: true }] },
      { label: '删除', items: [{ cmd: 'tableDelete', size: 'big', dropdown: true }] },
      { label: '插入', items: [{ cmd: 'tableAbove', size: 'big' }, { cmd: 'tableBelow', size: 'big' }, { cmd: 'tableLeft', size: 'big' }, { cmd: 'tableRight', size: 'big' }] },
      { label: '格式', items: [{ cmd: 'tableBorders', size: 'big' }, { cmd: 'tableHeader', size: 'big' }, { cmd: 'tableShading', size: 'big', dropdown: true }, { cmd: 'tableAlign', size: 'big', dropdown: true }] },
      { label: '数据', items: [{ cmd: 'tableSort', size: 'big', dropdown: true }, { cmd: 'tableToText', size: 'big' }] },
    ],
  },
];

/** Items of the File menu (the first tab opens this menu instead of a panel). */
export function fileMenu(app) {
  return [
    { label: '新建页面', icon: 'newPage', shortcut: 'Mod+Alt+N', run: () => app.runCommand('newPage') },
    { label: '新建分区', icon: 'newSection', shortcut: 'Mod+Alt+T', run: () => app.runCommand('newSection') },
    { label: '新建分区组', icon: 'sectionGroup', run: () => app.runCommand('newSectionGroup') },
    { label: '新建笔记本...', icon: 'notebook', run: () => app.runCommand('newNotebook') },
    { type: 'sep' },
    { label: '导入', icon: 'upload', submenu: () => app.commands.get('import').menu(app) },
    { label: '导出', icon: 'download', submenu: () => app.commands.get('export').menu(app) },
    { label: '分享...', icon: 'share', disabled: !app.editor?.page, run: () => app.runCommand('share') },
    { label: '打印...', icon: 'print', shortcut: 'Mod+P', disabled: !app.editor?.page, run: () => app.runCommand('print') },
    { type: 'sep' },
    { label: '立即同步', icon: 'sync', shortcut: 'Mod+S', run: () => app.runCommand('syncNow') },
    { label: '已删除笔记', icon: 'trash', run: () => app.runCommand('deletedNotes') },
    { label: '锁定所有受保护分区', icon: 'lock', shortcut: 'Mod+Alt+L', run: () => app.runCommand('lockAll') },
    { label: '外观主题', icon: app.commands.get('theme').dynamicIcon(), submenu: () => app.commands.get('theme').menu(app) },
    { type: 'sep' },
    { label: '键盘快捷键', icon: 'keyboard', shortcut: 'Mod+Shift+Slash', run: () => app.runCommand('shortcuts') },
    { label: '关于笔记', icon: 'info', run: () => app.runCommand('about') },
  ];
}
