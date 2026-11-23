/**
 * Starting points for new pages, and the pages a new workspace begins with.
 * Blocks are plain specs for insertBlocks(); databases list their
 * properties, views and rows.
 */
const t = (text, extra = {}) => ({ type: 'paragraph', text, ...extra });
const h = (n, text) => ({ type: `h${n}`, text });
const todo = (text, checked = false, indent = 0) => ({ type: 'todo', text, checked, indent });
const bullet = (text, indent = 0) => ({ type: 'bulleted', text, indent });

export const TEMPLATES = [
  {
    id: 'meeting',
    name: '会议纪要',
    description: '议程、笔记与行动项',
    icon: { name: 'users', color: 'blue' },
    blocks: () => [
      { type: 'callout', icon: 'calendar', bg: 'blue', delta: [{ insert: '日期：' }, { insert: new Date().toLocaleDateString(undefined, { dateStyle: 'long' }), attributes: { bold: true } }] },
      h(2, '参会人'),
      bullet(''),
      h(2, '议程'),
      { type: 'numbered', text: '' },
      h(2, '笔记'),
      t(''),
      h(2, '行动项'),
      todo(''),
    ],
  },
  {
    id: 'brief',
    name: '项目简报',
    description: '目标、范围与里程碑',
    icon: { name: 'target', color: 'red' },
    blocks: () => [
      { type: 'callout', icon: 'lightbulb', bg: 'yellow', text: '用一句话说明此项目为何重要。' },
      h(2, '目标'),
      bullet(''),
      h(2, '超出范围'),
      bullet(''),
      h(2, '里程碑'),
      todo('项目启动'),
      todo('首次评审'),
      todo('正式发布'),
      h(2, '待定问题'),
      { type: 'toggle', text: '问题' },
      t('', { indent: 1 }),
    ],
  },
  {
    id: 'weekly',
    name: '周计划',
    description: '优先事项与每日清单',
    icon: { name: 'calendarDays', color: 'green' },
    blocks: () => [
      h(2, '最高优先级'),
      { type: 'numbered', text: '' },
      ...['星期一', '星期二', '星期三', '星期四', '星期五'].flatMap((d) => [h(3, d), todo('')]),
      h(2, '备注'),
      t(''),
    ],
  },
  {
    id: 'tasks',
    name: '任务看板',
    description: '包含看板与表格视图的数据库',
    icon: { name: 'kanban', color: 'purple' },
    database: {
      props: [
        { name: '状态', type: 'status' },
        { name: '负责人', type: 'text' },
        { name: '截止日期', type: 'date' },
      ],
      views: ['board', 'table'],
      rows: [
        { title: '撰写项目简报', status: 2 },
        { title: '评审设计方案', status: 1 },
        { title: '规划发布事宜', status: 0 },
      ],
    },
  },
  {
    id: 'reading',
    name: '阅读清单',
    description: '待读的书籍与文章',
    icon: { name: 'bookOpen', color: 'orange' },
    database: {
      props: [
        { name: '类型', type: 'select', options: ['书籍', '文章', '论文'] },
        { name: '作者', type: 'text' },
        { name: '已读完', type: 'checkbox' },
        { name: '链接', type: 'url' },
      ],
      views: ['table', 'gallery'],
      rows: [],
    },
  },
];

export function templateById(id) {
  return TEMPLATES.find((x) => x.id === id) || null;
}

/** The first page in a brand new workspace. */
export function welcomeBlocks() {
  return [
    { type: 'callout', icon: 'sparkles', bg: 'purple', text: '欢迎使用您的知识库。这里的一切都作为文件保存在您专属的 Puter 云端。' },
    h(2, '撰写内容'),
    t('点击任意位置即可开始输入。输入 / 可插入标题、列表、待办、折叠块、引用、代码、图片、表格等。'),
    bullet('支持 Markdown 快捷输入：# 标题，- 列表，[] 待办，> 折叠块，``` 代码。'),
    bullet('选中文本即可设置粗体、斜体、链接或颜色。'),
    bullet('拖动块左侧的手柄可以移动位置，点击手柄可查看更多选项。'),
    h(2, '组织管理'),
    todo('使用侧边栏的 + 按钮添加新页面', true),
    todo('在侧边栏中将页面拖放到另一个页面上即可嵌套页面'),
    todo('收藏页面以便在“收藏夹”中快速访问'),
    { type: 'toggle', text: '键盘快捷键' },
    bullet('搜索：Ctrl/Cmd + K', 1),
    bullet('新建页面：Ctrl/Cmd + Alt + N', 1),
    bullet('移动块：Ctrl/Cmd + Shift + 上/下方向键', 1),
    bullet('增加与减少缩进：Tab 和 Shift + Tab', 1),
    h(2, '共享协作'),
    t('点击右上角的“共享”即可邀请他人访问页面及其下属页面。受邀者可以查看、评论或编辑，您还能实时看到谁正在浏览同一页面。'),
    { type: 'quote', text: '提示：页面也可以作为数据库。打开侧边栏中的“任务”即可查看看板视图。' },
  ];
}
