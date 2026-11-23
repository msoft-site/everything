/**
 * Starter bases. Each template is described by name and built through the
 * regular base operations, so links, inverse fields and formulas come out
 * exactly as if someone had set them up by hand.
 */
import { Base, makeChoice } from './base.js';
import { fromDisplay } from './formula.js';
import { newId } from '../lib/ids.js';

const sel = (...names) => names.map((n) => (Array.isArray(n) ? n : [n, null]));

export const TEMPLATES = [
  {
    id: 'projects',
    name: '项目跟踪',
    description: '管理项目的负责人、预算、截止日期以及构成项目的各项任务。',
    color: 'blue',
    icon: 'rocket',
    tables: [
      {
        name: '项目',
        fields: [
          { name: '名称', type: 'text' },
          { name: '状态', type: 'singleSelect', choices: sel(['规划中', 'gray'], ['进行中', 'blue'], ['受阻', 'red'], ['已完成', 'green']) },
          { name: '负责人', type: 'text' },
          { name: '开始日期', type: 'date' },
          { name: '截止日期', type: 'date' },
          { name: '预算', type: 'currency', options: { symbol: '$', precision: 0 } },
          { name: '备注', type: 'longText' },
        ],
        rows: [
          { '名称': '官网改版', '状态': '进行中', '负责人': 'Maya', '开始日期': -20, '截止日期': 25, '预算': 18000, '备注': '全新落地页与更轻量的设计系统。' },
          { '名称': '移动应用公测', '状态': '规划中', '负责人': 'Theo', '开始日期': 10, '截止日期': 70, '预算': 42000 },
          { '名称': '客户调研', '状态': '已完成', '负责人': 'Ines', '开始日期': -60, '截止日期': -15, '预算': 3500, '备注': '调研结果已与团队分享。' },
          { '名称': '办公室搬迁', '状态': '受阻', '负责人': 'Sam', '开始日期': -5, '截止日期': 40, '预算': 9000, '备注': '正在等待租约确认。' },
        ],
        views: [
          { type: 'kanban', name: '按状态', stack: '状态' },
          { type: 'calendar', name: '截止日历', date: '截止日期' },
          { type: 'timeline', name: '时间线', date: '开始日期', end: '截止日期' },
        ],
      },
      {
        name: '任务',
        fields: [
          { name: '任务', type: 'text' },
          { name: '已完成', type: 'checkbox' },
          { name: '截止日期', type: 'date' },
          { name: '预估工时', type: 'duration', options: { format: 'h:mm' } },
          { name: '优先级', type: 'singleSelect', choices: sel(['高', 'red'], ['中', 'yellow'], ['低', 'gray']) },
        ],
        rows: [
          { '任务': '撰写页面文案', '已完成': true, '截止日期': -3, '预估工时': 4 * 3600, '优先级': '高', '所属项目': ['官网改版'] },
          { '任务': '设计首屏区域', '截止日期': 4, '预估工时': 6 * 3600, '优先级': '高', '所属项目': ['官网改版'] },
          { '任务': '配置统计分析', '截止日期': 12, '预估工时': 2 * 3600, '优先级': '中', '所属项目': ['官网改版'] },
          { '任务': '招募公测用户', '截止日期': 20, '预估工时': 3 * 3600, '优先级': '中', '所属项目': ['移动应用公测'] },
          { '任务': '起草问卷题目', '已完成': true, '截止日期': -40, '预估工时': 2 * 3600, '优先级': '低', '所属项目': ['客户调研'] },
          { '任务': '收集搬家公司报价', '截止日期': 7, '预估工时': 3600, '优先级': '中', '所属项目': ['办公室搬迁'] },
        ],
        views: [{ type: 'grid', name: '未完成任务', filter: [['已完成', 'is', false]], sort: [['截止日期', 'asc']] }],
      },
    ],
    links: [{ from: '任务', name: '所属项目', to: '项目', inverse: '任务' }],
    computed: [
      { table: '项目', name: '已完成任务数', type: 'rollup', link: '任务', target: '已完成', fn: 'sum' },
      { table: '项目', name: '任务总数', type: 'count', link: '任务' },
      { table: '项目', name: '进度', type: 'formula', formula: 'IF({任务总数} > 0, ROUND({已完成任务数} / {任务总数} * 100) & "%", "")' },
    ],
  },
  {
    id: 'content',
    name: '内容日历',
    description: '跨渠道规划内容发布、跟踪草稿进度并掌控发布排期。',
    color: 'pink',
    icon: 'megaphone',
    tables: [
      {
        name: '内容',
        fields: [
          { name: '标题', type: 'text' },
          { name: '状态', type: 'singleSelect', choices: sel(['创意', 'gray'], ['撰稿中', 'yellow'], ['审核中', 'purple'], ['已排期', 'blue'], ['已发布', 'green']) },
          { name: '渠道', type: 'multipleSelect', choices: sel(['博客', 'blue'], ['邮件通讯', 'teal'], ['社交媒体', 'pink'], ['视频', 'orange']) },
          { name: '发布日期', type: 'date' },
          { name: '作者', type: 'text' },
          { name: '草稿链接', type: 'url' },
          { name: '配图', type: 'attachment' },
        ],
        rows: [
          { '标题': '远程团队高效协作的十个技巧', '状态': '已发布', '渠道': ['博客', '社交媒体'], '发布日期': -8, '作者': 'Ari' },
          { '标题': '十月产品更新日志', '状态': '已排期', '渠道': ['邮件通讯'], '发布日期': 3, '作者': 'Jo' },
          { '标题': '幕后花絮纪录', '状态': '撰稿中', '渠道': ['视频', '社交媒体'], '发布日期': 12, '作者': 'Kai' },
          { '标题': '客户故事：一家社区烘焙坊', '状态': '审核中', '渠道': ['博客'], '发布日期': 6, '作者': 'Ari' },
          { '标题': '节假日营业时间通知', '状态': '创意', '渠道': ['社交媒体'], '作者': 'Jo' },
        ],
        views: [
          { type: 'calendar', name: '日历', date: '发布日期' },
          { type: 'kanban', name: '发布进度', stack: '状态' },
          { type: 'gallery', name: '画廊', cover: '配图' },
        ],
      },
    ],
  },
  {
    id: 'crm',
    name: '销售漏斗',
    description: '管理客户公司、联系人和商机，并自动计算加权销售预测。',
    color: 'green',
    icon: 'briefcase',
    tables: [
      {
        name: '商机',
        fields: [
          { name: '商机名称', type: 'text' },
          { name: '阶段', type: 'singleSelect', choices: sel(['线索', 'gray'], ['已确认', 'cyan'], ['方案报价', 'blue'], ['商务谈判', 'purple'], ['赢单', 'green'], ['输单', 'red']) },
          { name: '金额', type: 'currency', options: { symbol: '$', precision: 0 } },
          { name: '赢率', type: 'percent', options: { precision: 0 } },
          { name: '预计成交日', type: 'date' },
        ],
        rows: [
          { '商机名称': 'Northwind 年度采购计划', '阶段': '商务谈判', '金额': 48000, '赢率': 0.7, '预计成交日': 14, '客户公司': ['Northwind Supply'] },
          { '商机名称': 'Lumen 试点项目', '阶段': '方案报价', '金额': 12000, '赢率': 0.4, '预计成交日': 30, '客户公司': ['Lumen Studio'] },
          { '商机名称': 'Harbor 扩容项目', '阶段': '赢单', '金额': 26000, '赢率': 1, '预计成交日': -10, '客户公司': ['Harbor Freight Co'] },
          { '商机名称': 'Lumen 增购席位', '阶段': '线索', '金额': 5000, '赢率': 0.1, '预计成交日': 60, '客户公司': ['Lumen Studio'] },
        ],
        views: [{ type: 'kanban', name: '销售漏斗', stack: '阶段' }],
      },
      {
        name: '公司',
        fields: [
          { name: '公司名称', type: 'text' },
          { name: '行业', type: 'singleSelect', choices: sel(['零售', 'orange'], ['设计', 'pink'], ['物流', 'teal'], ['软件', 'blue']) },
          { name: '网站', type: 'url' },
        ],
        rows: [
          { '公司名称': 'Northwind Supply', '行业': '零售', '网站': 'https://example.com/northwind' },
          { '公司名称': 'Lumen Studio', '行业': '设计', '网站': 'https://example.com/lumen' },
          { '公司名称': 'Harbor Freight Co', '行业': '物流', '网站': 'https://example.com/harbor' },
        ],
      },
      {
        name: '联系人',
        fields: [
          { name: '姓名', type: 'text' },
          { name: '电子邮箱', type: 'email' },
          { name: '电话', type: 'phone' },
          { name: '职位', type: 'text' },
        ],
        rows: [
          { '姓名': 'Priya Natarajan', '电子邮箱': 'priya@example.com', '电话': '(555) 010-2231', '职位': '运营总监', '客户公司': ['Northwind Supply'] },
          { '姓名': 'Leo Martins', '电子邮箱': 'leo@example.com', '电话': '(555) 010-4410', '职位': '创始人', '客户公司': ['Lumen Studio'] },
          { '姓名': 'Grace Okafor', '电子邮箱': 'grace@example.com', '职位': '采购经理', '客户公司': ['Harbor Freight Co'] },
        ],
      },
    ],
    links: [
      { from: '商机', name: '客户公司', to: '公司', inverse: '商机' },
      { from: '联系人', name: '客户公司', to: '公司', inverse: '联系人' },
    ],
    computed: [
      { table: '商机', name: '加权金额', type: 'formula', formula: '{金额} * {赢率}', format: 'currency', precision: 0 },
      { table: '公司', name: '漏斗总金额', type: 'rollup', link: '商机', target: '金额', fn: 'sum' },
      { table: '公司', name: '商机数量', type: 'count', link: '商机' },
    ],
  },
  {
    id: 'inventory',
    name: '库存管理',
    description: '跟踪商品、库存数量和补货预警线，并计算库存总价值。',
    color: 'orange',
    icon: 'package',
    tables: [
      {
        name: '商品',
        fields: [
          { name: '商品名称', type: 'text' },
          { name: 'SKU', type: 'barcode' },
          { name: '分类', type: 'singleSelect', choices: sel(['文具', 'blue'], ['厨具', 'orange'], ['户外', 'green']) },
          { name: '库存数量', type: 'number' },
          { name: '补货阈值', type: 'number' },
          { name: '单位成本', type: 'currency', options: { symbol: '$', precision: 2 } },
          { name: '评分', type: 'rating', options: { max: 5, icon: 'star', color: 'yellow' } },
          { name: '图片', type: 'attachment' },
        ],
        rows: [
          { '商品名称': '点阵笔记本', SKU: 'ST-1001', '分类': '文具', '库存数量': 140, '补货阈值': 50, '单位成本': 4.2, '评分': 5 },
          { '商品名称': '中性笔（10支装）', SKU: 'ST-1002', '分类': '文具', '库存数量': 35, '补货阈值': 40, '单位成本': 6.5, '评分': 4 },
          { '商品名称': '陶瓷马克杯', SKU: 'KT-2001', '分类': '厨具', '库存数量': 60, '补货阈值': 20, '单位成本': 3.1, '评分': 4 },
          { '商品名称': '运动水壶', SKU: 'OD-3001', '分类': '户外', '库存数量': 12, '补货阈值': 25, '单位成本': 7.8, '评分': 3 },
          { '商品名称': '野餐垫', SKU: 'OD-3002', '分类': '户外', '库存数量': 18, '补货阈值': 10, '单位成本': 14, '评分': 5 },
        ],
        views: [{ type: 'grid', name: '按分类', group: ['分类'] }, { type: 'gallery', name: '商品目录', cover: '图片' }],
      },
    ],
    computed: [
      { table: '商品', name: '库存价值', type: 'formula', formula: '{库存数量} * {单位成本}', format: 'currency', precision: 2 },
      { table: '商品', name: '补货提醒', type: 'formula', formula: 'IF({库存数量} <= {补货阈值}, "需要补货", "")' },
    ],
  },
  {
    id: 'events',
    name: '活动策划',
    description: '一站式管理活动排期、嘉宾名单及出席回执（RSVP）。',
    color: 'purple',
    icon: 'calendar',
    tables: [
      {
        name: '活动',
        fields: [
          { name: '活动名称', type: 'text' },
          { name: '日期', type: 'date', options: { includeTime: true } },
          { name: '地点', type: 'text' },
          { name: '人数上限', type: 'number' },
        ],
        rows: [
          { '活动名称': '团队团建营', '日期': 21, '地点': '湖畔度假屋', '人数上限': 40 },
          { '活动名称': '产品发布派对', '日期': 45, '地点': '露台花园', '人数上限': 120 },
        ],
        views: [{ type: 'calendar', name: '活动日历', date: '日期' }],
      },
      {
        name: '嘉宾',
        fields: [
          { name: '嘉宾姓名', type: 'text' },
          { name: '电子邮箱', type: 'email' },
          { name: '出席状态', type: 'singleSelect', choices: sel(['已邀请', 'gray'], ['确认出席', 'green'], ['待定', 'yellow'], ['不出席', 'red']) },
          { name: '随行人数', type: 'number' },
        ],
        rows: [
          { '嘉宾姓名': 'Alex Kim', '电子邮箱': 'alex@example.com', '出席状态': '确认出席', '随行人数': 1, '活动': ['团队团建营'] },
          { '嘉宾姓名': 'Bea Lund', '电子邮箱': 'bea@example.com', '出席状态': '待定', '活动': ['团队团建营', '产品发布派对'] },
          { '嘉宾姓名': 'Chris Diaz', '电子邮箱': 'chris@example.com', '出席状态': '已邀请', '活动': ['产品发布派对'] },
        ],
        views: [{ type: 'form', name: '出席回执表单' }, { type: 'kanban', name: '出席看板', stack: '出席状态' }],
      },
    ],
    links: [{ from: '嘉宾', name: '活动', to: '活动', inverse: '嘉宾' }],
    computed: [{ table: '活动', name: '嘉宾人数', type: 'count', link: '嘉宾' }],
  },
  {
    id: 'bugs',
    name: '缺陷跟踪',
    description: '报告、分类并修复问题，按严重程度分组展示。',
    color: 'red',
    icon: 'wrench',
    tables: [
      {
        name: '问题',
        fields: [
          { name: '简述', type: 'text' },
          { name: '编号', type: 'autonumber' },
          { name: '严重程度', type: 'singleSelect', choices: sel(['严重', 'red'], ['主要', 'orange'], ['次要', 'yellow'], ['轻微', 'gray']) },
          { name: '状态', type: 'singleSelect', choices: sel(['新建', 'blue'], ['已确认', 'purple'], ['处理中', 'yellow'], ['已修复', 'green'], ['暂不修复', 'gray']) },
          { name: '经办人', type: 'text' },
          { name: '复现步骤', type: 'longText' },
          { name: '报告时间', type: 'createdTime' },
        ],
        rows: [
          { '简述': '小屏幕设备上登录按钮无响应', '严重程度': '主要', '状态': '处理中', '经办人': 'Dana', '复现步骤': '1. 在手机上打开应用\n2. 点击登录按钮' },
          { '简述': '欢迎邮件中存在拼写错误', '严重程度': '轻微', '状态': '已修复', '经办人': 'Omar' },
          { '简述': '导出大文件时失败', '严重程度': '严重', '状态': '已确认', '经办人': 'Dana' },
          { '简述': '深色模式下徽章对比度不足', '严重程度': '次要', '状态': '新建' },
        ],
        views: [{ type: 'grid', name: '按严重程度', group: ['严重程度'] }, { type: 'kanban', name: '状态看板', stack: '状态' }, { type: 'form', name: '提交缺陷报告' }],
      },
    ],
  },
];

function isoDay(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Build a template into { doc, records } ready for Store.createBase. */
export function buildTemplate(tpl, { user = '' } = {}) {
  const doc = { v: 1, id: newId('app'), name: tpl.name, color: tpl.color, icon: tpl.icon, tables: [] };
  const base = new Base(doc, {}, { user });
  const tables = new Map();
  const fieldOf = (tname, fname) => {
    const t = base.table(tables.get(tname));
    return t.fieldByName(fname);
  };
  for (const t of tpl.tables) {
    const fields = t.fields.map((f) => {
      const options = { ...(f.options || {}) };
      if (f.choices) {
        const choices = [];
        for (const [name, color] of f.choices) {
          const c = makeChoice(name, choices);
          if (color) c.color = color;
          choices.push(c);
        }
        options.choices = choices;
      }
      return { name: f.name, type: f.type, options };
    });
    const id = base.addTable(t.name, { fields: fields.slice(0, 1) });
    tables.set(t.name, id);
    for (const f of fields.slice(1)) base.addField(id, f);
  }
  for (const l of tpl.links || []) {
    const fid = base.addField(tables.get(l.from), { name: l.name, type: 'link', options: { tableId: tables.get(l.to) } });
    const inv = base.table(tables.get(l.from)).field(fid).options.inverseId;
    if (inv && l.inverse) base.updateField(tables.get(l.to), inv, { name: l.inverse });
  }
  // Rows (links are filled in once every record exists).
  const ids = new Map();
  const pendingLinks = [];
  for (const t of tpl.tables) {
    const tid = tables.get(t.name);
    const table = base.table(tid);
    const cellsList = (t.rows || []).map((row) => {
      const cells = {};
      for (const [k, v] of Object.entries(row)) {
        const f = table.fieldByName(k);
        if (!f) continue;
        if (f.type === 'link') {
          pendingLinks.push({ tid, rowName: row[table.primary.name], field: f, names: v });
          continue;
        }
        if (f.type === 'singleSelect') cells[f.id] = f.options.choices.find((c) => c.name === v)?.id;
        else if (f.type === 'multipleSelect') cells[f.id] = v.map((n) => f.options.choices.find((c) => c.name === n)?.id).filter(Boolean);
        else if (f.type === 'date' && typeof v === 'number') cells[f.id] = f.options.includeTime ? new Date(`${isoDay(v)}T18:00:00`).toISOString() : isoDay(v);
        else cells[f.id] = v;
      }
      return cells;
    });
    const created = base.createRecords(tid, cellsList);
    created.forEach((rid, i) => ids.set(`${t.name}:${t.rows[i][table.primary.name]}`, rid));
  }
  for (const p of pendingLinks) {
    const toName = [...tables].find(([, id]) => id === p.field.options.tableId)[0];
    const targets = p.names.map((n) => ids.get(`${toName}:${n}`)).filter(Boolean);
    const tname = [...tables].find(([, id]) => id === p.tid)[0];
    base.setCell(p.tid, ids.get(`${tname}:${p.rowName}`), p.field.id, targets);
  }
  for (const c of tpl.computed || []) {
    const tid = tables.get(c.table);
    const table = base.table(tid);
    if (c.type === 'formula') {
      base.addField(tid, { name: c.name, type: 'formula', options: { formula: fromDisplay(c.formula, table.fields), format: c.format || 'auto', precision: c.precision ?? 2 } });
    } else {
      const link = table.fieldByName(c.link);
      const target = c.target ? base.table(link.options.tableId).fieldByName(c.target) : null;
      base.addField(tid, { name: c.name, type: c.type, options: { linkFieldId: link.id, targetFieldId: target?.id || null, fn: c.fn || 'sum', precision: 0 } });
    }
  }
  // Extra views.
  for (const t of tpl.tables) {
    const tid = tables.get(t.name);
    for (const v of t.views || []) {
      const vid = base.addView(tid, v.type, v.name);
      const patch = {};
      if (v.stack) patch.stackFieldId = fieldOf(t.name, v.stack).id;
      if (v.date) patch.dateFieldId = fieldOf(t.name, v.date).id;
      if (v.end) patch.endFieldId = fieldOf(t.name, v.end).id;
      if (v.cover) patch.coverFieldId = fieldOf(t.name, v.cover).id;
      if (v.group) patch.groups = v.group.map((n) => ({ fieldId: fieldOf(t.name, n).id, dir: 'asc' }));
      if (v.sort) patch.sorts = v.sort.map(([n, dir]) => ({ fieldId: fieldOf(t.name, n).id, dir }));
      if (v.filter) patch.filters = { conjunction: 'and', conditions: v.filter.map(([n, op, value]) => ({ id: newId('flt'), fieldId: fieldOf(t.name, n).id, op, value })) };
      if (Object.keys(patch).length) base.updateView(tid, vid, patch);
    }
  }
  const records = {};
  for (const [, tid] of tables) records[tid] = [...base.table(tid).records.values()];
  return { doc: base.doc, records };
}
