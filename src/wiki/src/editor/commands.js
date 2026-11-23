/** Block types offered in the "/" menu and in "Turn into". */
export const INSERTABLE = [
  { type: 'paragraph', label: '文本', icon: 'pilcrow', keywords: 'text paragraph plain 文本 段落 纯文本', description: '普通纯文本' },
  { type: 'h1', label: '一级标题', icon: 'h1', keywords: 'heading title h1 big 标题 一级 大标题', description: '大号章节标题', shortcut: '#' },
  { type: 'h2', label: '二级标题', icon: 'h2', keywords: 'heading subtitle h2 标题 二级 副标题', description: '中号章节标题', shortcut: '##' },
  { type: 'h3', label: '三级标题', icon: 'h3', keywords: 'heading h3 small 标题 三级 小标题', description: '小号章节标题', shortcut: '###' },
  { type: 'bulleted', label: '无序列表', icon: 'list', keywords: 'bullet unordered list ul 列表 无序 项目符号', description: '简单项目列表', shortcut: '-' },
  { type: 'numbered', label: '有序列表', icon: 'listOrdered', keywords: 'numbered ordered list ol 列表 有序 编号', description: '带编号的列表', shortcut: '1.' },
  { type: 'todo', label: '待办列表', icon: 'squareCheck', keywords: 'todo task check checkbox 待办 任务 复选框', description: '跟进任务事项', shortcut: '[]' },
  { type: 'toggle', label: '折叠列表', icon: 'chevronRight', keywords: 'toggle collapse expand details 折叠 展开 详情', description: '隐藏或展开内部内容', shortcut: '>' },
  { type: 'quote', label: '引用', icon: 'quote', keywords: 'quote blockquote citation 引用 引言', description: '突出引用文字', shortcut: '"' },
  { type: 'callout', label: '提示框', icon: 'lightbulb', keywords: 'callout note tip info warning 提示 标注 说明 警告', description: '让文字更加醒目' },
  { type: 'code', label: '代码', icon: 'codeXml', keywords: 'code snippet pre monospace 代码 片段', description: '代码片段', shortcut: '```' },
  { type: 'divider', label: '分割线', icon: 'minus', keywords: 'divider line separator hr 分割线 分隔线', description: '分隔不同段落', shortcut: '---' },
  { type: 'table', label: '表格', icon: 'table', keywords: 'table grid rows columns 表格 行 列', description: '简单表格' },
  { type: 'image', label: '图片', icon: 'image', keywords: 'image picture photo upload 图片 图像 照片 上传', description: '上传或链接图片' },
  { type: 'bookmark', label: '网页书签', icon: 'bookmark', keywords: 'bookmark link url web embed 书签 链接 网址', description: '保存网页链接' },
];

export const PAGE_COMMANDS = [
  { action: 'page', label: '页面', icon: 'fileText', keywords: 'page subpage new child 页面 子页面 新建', description: '在此页面内创建子页面' },
  { action: 'database', label: '数据库', icon: 'database', keywords: 'database table board kanban collection 数据库 表格 看板', description: '由页面组成的数据表' },
  { action: 'mention', label: '链接到页面', icon: 'arrowUpRight', keywords: 'link mention page reference 链接 引用 页面', description: '链接到另一个页面' },
];

export const TEXT_TYPES = new Set(['paragraph', 'h1', 'h2', 'h3', 'bulleted', 'numbered', 'todo', 'toggle', 'quote', 'callout', 'code']);

export const PLACEHOLDERS = {
  paragraph: "输入内容，或输入 '/' 调用命令",
  h1: '一级标题',
  h2: '二级标题',
  h3: '三级标题',
  bulleted: '列表',
  numbered: '列表',
  todo: '待办事项',
  toggle: '折叠内容',
  quote: '引用内容',
  callout: '输入内容',
  code: '代码',
};

export const CODE_LANGUAGES = ['纯文本', 'Bash', 'C', 'C++', 'C#', 'CSS', 'Go', 'HTML', 'Java', 'JavaScript', 'JSON', 'Kotlin', 'Markdown', 'PHP', 'Python', 'Ruby', 'Rust', 'SQL', 'Swift', 'TypeScript', 'YAML'];

/** Markdown typed at the start of a paragraph, then a space. */
export const SHORTCUTS = [
  [/^#$/, { type: 'h1' }],
  [/^##$/, { type: 'h2' }],
  [/^###$/, { type: 'h3' }],
  [/^[-*+]$/, { type: 'bulleted' }],
  [/^1[.)]$/, { type: 'numbered' }],
  [/^\[ ?\]$/, { type: 'todo', checked: false }],
  [/^\[x\]$/i, { type: 'todo', checked: true }],
  [/^>$/, { type: 'toggle' }],
  [/^["“]$/, { type: 'quote' }],
];
