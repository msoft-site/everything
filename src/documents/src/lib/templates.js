/**
 * Starting points for a new document. A template is a list of blocks the
 * Document API can create on a blank document: styled paragraphs, headings,
 * lists, and tables. Square-bracketed text marks what to replace.
 */

/** Today's date the way a letter would carry it, in the user's locale. */
export const today = (date = new Date()) => date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

const p = (text = '') => ({ kind: 'paragraph', text });
const h = (level, text) => ({ kind: 'heading', level, text });
const title = (text) => ({ kind: 'title', text });
const subtitle = (text) => ({ kind: 'subtitle', text });
const bullets = (...items) => ({ kind: 'bullets', items });
const numbers = (...items) => ({ kind: 'numbers', items });
const table = (rows) => ({ kind: 'table', rows });

export const TEMPLATES = [
  {
    id: 'letter', name: '信函', icon: 'brand', description: '发件人、日期、问候语、正文和署名',
    blocks: () => [
      p('[你的姓名]'), p('[街道地址]'), p('[城市，省份 邮编]'), p(''),
      p(today()), p(''),
      p('[收件人姓名]'), p('[公司名称]'), p('[街道地址]'), p('[城市，省份 邮编]'), p(''),
      p('尊敬的 [收件人姓名]：'), p(''),
      p('[在此开门见山写明致信缘由。首段建议控制在两到三句话。]'), p(''),
      p('[在第二段补充具体细节：发生了什么、你的需求或你可以提供的内容。]'), p(''),
      p('[在结语处写明后续步骤并致谢。]'), p(''),
      p('此致，'), p('敬礼！'), p(''), p('[你的姓名]'),
    ],
  },
  {
    id: 'meeting', name: '会议纪要', icon: 'clock', description: '与会者、议程、记录和行动事项',
    blocks: () => [
      title('会议纪要'), subtitle(today()),
      h(2, '与会者'), bullets('[姓名]', '[姓名]', '[姓名]'),
      h(2, '议程'), numbers('[议题一]', '[议题二]', '[议题三]'),
      h(2, '记录'), p('[会议达成的决定和讨论要点。]'),
      h(2, '行动事项'), table([['负责人', '行动', '截止日期'], ['[姓名]', '[事项内容]', '[时间]'], ['[姓名]', '[事项内容]', '[时间]']]),
    ],
  },
  {
    id: 'report', name: '报告', icon: 'outline', description: '封面、摘要和分节正文',
    blocks: () => [
      title('[报告标题]'), subtitle('[副标题或作者] · ' + today()),
      h(1, '摘要'), p('[概括核心问题、研究发现和建议的一段话。]'),
      h(1, '背景'), p('[为何该事项重要以及既往已知情况。]'),
      h(1, '调查结果'), h(2, '[第一项发现]'), p('[事实证据与分析讨论。]'), h(2, '[第二项发现]'), p('[事实证据与分析讨论。]'),
      h(1, '建议'), numbers('[第一项建议]', '[第二项建议]'),
      h(1, '附录'), p('[资料来源、数据和研究方法。]'),
    ],
  },
  {
    id: 'resume', name: '个人简历', icon: 'edit', description: '联系方式、工作经历、教育背景、专业技能',
    blocks: () => [
      title('[你的姓名]'), subtitle('[城市] · [电话] · [邮箱] · [个人主页]'),
      h(2, '个人优势'), p('[用两三句话阐明你的核心能力与职业方向。]'),
      h(2, '工作经历'), h(3, '[职务名称], [公司名称] — [起始时间] 至 [结束时间]'), bullets('[带量化数据的业绩成果]', '[体现工作体量的重要职责]', '[熟练使用的技能或工具]'),
      h(3, '[职务名称], [公司名称] — [起始时间] 至 [结束时间]'), bullets('[带量化数据的业绩成果]', '[体现工作体量的重要职责]'),
      h(2, '教育背景'), p('[学历学位], [院校名称] — [毕业年份]'),
      h(2, '专业技能'), p('[专业技能] · [专业技能] · [专业技能] · [专业技能]'),
    ],
  },
  {
    id: 'essay', name: '文章/论文', icon: 'text', description: '标题、论点、正文论述、结论',
    blocks: () => [
      title('[文章标题]'), subtitle('[你的姓名] · [课程/专栏] · ' + today()),
      p('[引言：交代背景并在段尾用一句话亮出核心论点。]'),
      p('[正文第一段：核心分论点、支撑论据及其现实意义。]'),
      p('[正文第二段。]'),
      p('[正文第三段。]'),
      p('[结论：换用新措辞重申中心论点，并说明由此得出的延伸结论。]'),
      h(2, '参考文献'), p('[作者, 书名/篇名, 出版年份.]'),
    ],
  },
];

export function templateById(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

const ok = (r, what) => {
  if (r == null || (r.success === false && r.failure?.code !== 'NO_OP')) throw new Error(r?.failure?.message || `${what} failed`);
  return r;
};
const paragraph = (nodeId) => ({ kind: 'block', nodeType: 'paragraph', nodeId });
const end = { kind: 'documentEnd' };

/**
 * Create a template's blocks at the end of the document, then drop the empty
 * paragraph a blank document starts with. Resolves the number of blocks
 * created; throws on the first failure.
 */
export async function applyTemplate(api, template) {
  const before = (await api.blocks.list())?.blocks || [];
  const blocks = typeof template.blocks === 'function' ? template.blocks() : template.blocks;
  let created = 0;
  for (const b of blocks) {
    if (b.kind === 'heading') {
      ok(await api.create.heading({ level: b.level, text: b.text, at: end }), 'Heading');
    } else if (b.kind === 'title' || b.kind === 'subtitle') {
      const r = ok(await api.create.paragraph({ text: b.text, at: end }), 'Paragraph');
      ok(await api.styles.paragraph.setStyle({ target: paragraph(r.paragraph.nodeId), styleId: b.kind === 'title' ? 'Title' : 'Subtitle' }), 'Style');
    } else if (b.kind === 'bullets' || b.kind === 'numbers') {
      for (const item of b.items) {
        const r = ok(await api.create.paragraph({ text: item, at: end }), 'Paragraph');
        ok(await api.lists.apply({ target: paragraph(r.paragraph.nodeId), seed: b.kind === 'bullets' ? 'bullet' : 'ordered' }), 'List');
      }
    } else if (b.kind === 'table') {
      const rows = b.rows.length;
      const columns = Math.max(...b.rows.map((r) => r.length));
      const r = ok(await api.create.table({ rows, columns, at: end }), 'Table');
      const nodeId = r.table?.nodeId;
      if (nodeId && api.tables?.setCellText) {
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < b.rows[i].length; j++) {
            if (b.rows[i][j]) ok(await api.tables.setCellText({ nodeId, rowIndex: i, columnIndex: j, text: b.rows[i][j] }), 'Cell');
          }
        }
      }
    } else {
      ok(await api.create.paragraph({ text: b.text || '', at: end }), 'Paragraph');
    }
    created += 1;
  }
  // A blank document opens with one empty paragraph ahead of the template.
  if (created && before.length === 1 && before[0].isEmpty && api.blocks.delete) {
    try { await api.blocks.delete({ target: paragraph(before[0].nodeId) }); } catch { /* leave the blank line */ }
  }
  return created;
}
