/** Page templates (Insert > Page Templates). Outline HTML uses the normal note markup. */
const todo = (text) => `<p><span class="nt-tag" data-tag="todo" data-done="false" contenteditable="false"></span>${text}</p>`;
const today = () => new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

export const TEMPLATES = [
  {
    id: 'blank',
    category: '空白',
    label: '空白页',
    desc: '一个空白页面。',
    build: () => ({ title: '', outlines: [] }),
  },
  {
    id: 'meeting-simple',
    category: '商务',
    label: '简易会议纪要',
    desc: '议程、参会人员、笔记和待办事项。',
    build: () => ({
      title: '会议纪要',
      outlines: [
        { x: 48, y: 140, w: 560, html: `<h2>会议详情</h2><p>日期：${today()}</p><p>地点：</p><h2>议程</h2><ol><li><br></li></ol><h2>参会人员</h2><ul><li><br></li></ul><h2>会议笔记</h2><p><br></p><h2>行动项</h2>${todo('')}` },
      ],
    }),
  },
  {
    id: 'meeting-detailed',
    category: '商务',
    label: '详细会议纪要',
    desc: '目标、讨论、决议和后续跟进。',
    build: () => ({
      title: '项目会议',
      outlines: [
        { x: 48, y: 140, w: 600, html: `<h2>会议详情</h2><table><tbody><tr><th>日期</th><td>${today()}</td></tr><tr><th>时间</th><td><br></td></tr><tr><th>地点</th><td><br></td></tr><tr><th>主持人</th><td><br></td></tr></tbody></table><h2>目标</h2><p><br></p><h2>讨论内容</h2><ul><li><br></li></ul><h2>决议事项</h2><ul><li><br></li></ul><h2>后续跟进</h2>${todo('')}<h2>下次会议</h2><p><br></p>` },
      ],
    }),
  },
  {
    id: 'todo',
    category: '规划',
    label: '待办事项列表',
    desc: '按优先级排列的清单。',
    build: () => ({
      title: '待办事项列表',
      outlines: [
        { x: 48, y: 140, w: 420, html: `<h3>高优先级</h3>${todo('')}${todo('')}<h3>中优先级</h3>${todo('')}${todo('')}<h3>低优先级</h3>${todo('')}` },
      ],
    }),
  },
  {
    id: 'weekly',
    category: '规划',
    label: '每周计划',
    desc: '按周内每日安排的计划表格。',
    build: () => {
      const days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
      return {
        title: '每周计划',
        outlines: [{ x: 48, y: 140, w: 720, html: `<table><tbody><tr><th>星期</th><th>计划</th><th>备注</th></tr>${days.map((d) => `<tr><td>${d}</td><td><br></td><td><br></td></tr>`).join('')}</tbody></table>` }],
      };
    },
  },
  {
    id: 'project',
    category: '商务',
    label: '项目概览',
    desc: '目标、里程碑、团队和风险。',
    build: () => ({
      title: '项目概览',
      outlines: [
        { x: 48, y: 140, w: 600, html: '<h2>概述</h2><p><br></p><h2>目标</h2><ul><li><br></li></ul><h2>里程碑</h2><table><tbody><tr><th>里程碑</th><th>负责人</th><th>截止日期</th><th>状态</th></tr><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr></tbody></table><h2>团队成员</h2><ul><li><br></li></ul><h2>风险</h2><p><span class="nt-tag" data-tag="critical" contenteditable="false"></span><br></p>' },
      ],
    }),
  },
  {
    id: 'lecture',
    category: '学术',
    label: '课程笔记',
    desc: '提示栏、笔记和总结。',
    build: () => ({
      title: '课程笔记',
      outlines: [
        { x: 48, y: 140, w: 200, html: '<h3>问题与线索</h3><p><span class="nt-tag" data-tag="question" contenteditable="false"></span><br></p>' },
        { x: 290, y: 140, w: 480, html: `<h3>课堂笔记</h3><p>课程：</p><p>日期：${today()}</p><p><br></p>` },
        { x: 48, y: 420, w: 722, html: '<h3>总结</h3><p><br></p>' },
      ],
    }),
  },
  {
    id: 'journal',
    category: '个人',
    label: '每日日记',
    desc: '感恩、亮点与明日规划。',
    build: () => ({
      title: today(),
      outlines: [
        { x: 48, y: 140, w: 520, html: '<h3>今日值得感恩的事</h3><ul><li><br></li></ul><h3>今日亮点</h3><p><br></p><h3>今日心得</h3><p><br></p><h3>明日规划</h3>' + todo('') },
      ],
    }),
  },
  {
    id: 'recipe',
    category: '个人',
    label: '菜谱食谱',
    desc: '用料与制作步骤。',
    build: () => ({
      title: '菜谱',
      outlines: [
        { x: 48, y: 140, w: 260, html: '<h3>食材用料</h3><ul><li><br></li></ul>' },
        { x: 340, y: 140, w: 420, html: '<h3>制作步骤</h3><ol><li><br></li></ol><h3>备注</h3><p><br></p>' },
      ],
    }),
  },
];
