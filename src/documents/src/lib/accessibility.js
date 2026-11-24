/**
 * Accessibility checks over the document model. Each rule returns issues
 * { rule, severity: 'error'|'warning'|'tip', title, detail, start, end, fix? } where start/end are
 * document positions for Go To and `fix` names a quick fix the pane can apply. Original rules,
 * informed by WCAG 2.1 (contrast ratios per §1.4.3, relative luminance per its definition).
 */

export const RULES = {
  altText: { severity: 'error', title: '缺少替代文字', why: '屏幕阅读器通过说明朗读图片。如果缺少说明，图片含义将会丢失。' },
  tableHeader: { severity: 'error', title: '表格无标题行', why: '标题行可告知辅助技术各列所包含的内容。' },
  lowContrast: { severity: 'error', title: '文字对比度过低', why: '与背景对比不明显的文字对许多人来说难以阅读。' },
  hardColors: { severity: 'warning', title: '不易辨认的突出显示', why: '突出显示或底纹导致文字颜色难以分辨。' },
  headingOrder: { severity: 'warning', title: '跳级标题级别', why: '跳过级别的标题会使文档大纲难以理解。' },
  mergedCells: { severity: 'warning', title: '合并或拆分的表格单元格', why: '合并的单元格会改变屏幕阅读器用于播报位置的网格。' },
  blankRows: { severity: 'warning', title: '空白表格行', why: '用于间距的空行会被朗读为缺失数据。' },
  emptyParagraphs: { severity: 'tip', title: '使用空段落设置间距', why: '请使用段落间距代替空行；屏幕阅读器会朗读每一个空行。' },
  repeatedBlanks: { severity: 'tip', title: '重复的空格或制表符', why: '用于排列文字的连续空白字符会被朗读为杂音。' },
  unclearLinks: { severity: 'warning', title: '超链接文字不明确', why: '超链接文字应指明目标，而不是“点击此处”或单纯的网址。' },
};

/* ---- Colors ---- */

const HIGHLIGHT_HEX = { black: '000000', blue: '0000FF', cyan: '00FFFF', green: '00FF00', magenta: 'FF00FF', red: 'FF0000', yellow: 'FFFF00', white: 'FFFFFF', darkBlue: '000080', darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080', darkRed: '800000', darkYellow: '808000', darkGray: '808080', lightGray: 'C0C0C0' };
const hex = value => /^[0-9a-f]{6}$/i.test(value || '') ? value.toUpperCase() : null;
/** Relative luminance of a 6-digit hex color. */
export function luminance(color) {
  const value = hex(color); if (!value) return null;
  const channel = i => { const c = parseInt(value.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}
/** Contrast ratio (1–21) between two hex colors. */
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const runBackground = (run, page) => hex(HIGHLIGHT_HEX[run.highlight]) || (run.shading && run.shading !== 'auto' && run.shading !== 'foreground' ? hex(run.shading) : null) || page;
/** "Automatic" text color is black, or white on a dark background, as word processors draw it. */
const textColor = (run, background) => hex(run.color) || (luminance(background) < 0.18 ? 'FFFFFF' : '000000');

/* ---- Helpers over the model ---- */

const UNCLEAR = /^(?:click here|here|click|link|this link|more|read more|learn more|this|go|details|info|page|website|url)$/i;
const ADDRESS = /^(?:https?:\/\/|www\.)\S+$/i;
const length = p => p.runs.reduce((n, r) => n + r.text.length, 0);
const text = p => p.runs.map(r => r.text).join('');

/**
 * Run every rule. model: { paragraphs, tables, pageSettings }; options.outline gives each
 * paragraph's heading level (1–9) or null; options.styleName names a paragraph's style.
 */
export function checkAccessibility({ paragraphs, tables = [], pageSettings = {} }, { headingLevel = () => null, enabled = Object.keys(RULES) } = {}) {
  const issues = [];
  const on = rule => enabled.includes(rule);
  const add = (rule, start, end, detail, fix) => issues.push({ rule, severity: RULES[rule].severity, title: RULES[rule].title, why: RULES[rule].why, detail, start, end, ...(fix ? { fix } : {}) });
  const page = hex(pageSettings.background) || 'FFFFFF';
  const starts = []; { let at = 0; for (const p of paragraphs) { starts.push(at); at += length(p) + 1; } }
  const cellOf = new Map();
  for (const table of tables) for (const row of table.rows) for (const cell of row.cells) cellOf.set(cell.id, { table, row, cell });

  let lastLevel = 0, emptyRun = [];
  const flushEmpty = () => {
    if (emptyRun.length >= 2) add('emptyParagraphs', starts[emptyRun[0]], starts[emptyRun.at(-1)] + 1, `${emptyRun.length} 个连续的空段落`, { kind: 'removeEmpty', paragraphs: emptyRun.map(i => paragraphs[i].id) });
    emptyRun = [];
  };
  paragraphs.forEach((p, index) => {
    const start = starts[index], body = text(p);
    // Empty paragraphs used as spacing (body text only; a cell may legitimately be empty).
    if (!p.cellId && !body.trim() && !p.runs.some(r => r.image) && !p.sectionEnd && index < paragraphs.length - 1) emptyRun.push(index);
    else flushEmpty();
    // Heading levels that skip.
    const level = headingLevel(p);
    if (level && on('headingOrder')) {
      if (lastLevel && level > lastLevel + 1) add('headingOrder', start, start + length(p), `标题 ${level} 紧随标题 ${lastLevel}`);
      lastLevel = level;
    }
    let at = start;
    for (const run of p.runs) {
      const end = at + run.text.length;
      if (run.image && !run.image.alt?.trim() && !run.image.decorative && on('altText')) add('altText', at, end, run.image.name || '图片', run.image.retainedDrawing ? null : { kind: 'altText' });
      if (run.text.trim() && !run.image && !run.revision?.type?.startsWith?.('del')) {
        const background = runBackground(run, page), color = textColor(run, background);
        const ratio = contrastRatio(color, background);
        const large = (run.fontSize || 12) >= 18 || run.bold && (run.fontSize || 12) >= 14;
        if (ratio !== null && ratio < (large ? 3 : 4.5)) {
          const highlighted = background !== page;
          if (highlighted ? on('hardColors') : on('lowContrast')) add(highlighted ? 'hardColors' : 'lowContrast', at, end, `对比度 ${ratio.toFixed(1)}:1 (需要 ${large ? 3 : 4.5}:1)`, highlighted ? { kind: 'clearHighlight' } : { kind: 'autoColor' });
        }
      }
      at = end;
    }
    if (on('repeatedBlanks')) for (const match of body.matchAll(/ {3,}|\t{2,}/g)) add('repeatedBlanks', start + match.index, start + match.index + match[0].length, match[0][0] === '\t' ? `${match[0].length} 个连续制表符` : `${match[0].length} 个连续空格`, { kind: 'collapseBlanks' });
    if (on('unclearLinks')) {
      // Contiguous runs of one link form its text.
      let linkAt = start, current = null, from = start;
      for (const run of [...p.runs, null]) {
        const id = run?.link ? run.link.id ?? run.link.target ?? run.link.anchor : null;
        if (id !== current) {
          if (current !== null) {
            const label = body.slice(from - start, linkAt - start).trim();
            if (UNCLEAR.test(label) || ADDRESS.test(label)) add('unclearLinks', from, linkAt, `“${label}”`);
          }
          current = id; from = linkAt;
        }
        if (run) linkAt += run.text.length;
      }
    }
  });
  flushEmpty();

  // Each cell's paragraphs and each table's first paragraph, in document order, found once: looking
  // through every paragraph for each row took seconds in a document with long tables.
  const cellParagraphs = new Map(), tableFirst = new Map();
  paragraphs.forEach((p, i) => {
    if (!p.cellId) return;
    if (!cellParagraphs.has(p.cellId)) cellParagraphs.set(p.cellId, []);
    cellParagraphs.get(p.cellId).push(i);
    const table = cellOf.get(p.cellId)?.table;
    if (table && !tableFirst.has(table)) tableFirst.set(table, i);
  });
  for (const table of tables) {
    const first = tableFirst.get(table) ?? -1;
    if (first < 0) continue;
    const tableStart = starts[first];
    if (!table.rows.some(row => row.header) && table.rows.length > 1 && on('tableHeader')) add('tableHeader', tableStart, tableStart, `包含 ${table.rows.length} 行的表格`, { kind: 'headerRow', cellId: paragraphs[first].cellId });
    if (on('mergedCells') && table.rows.some(row => row.cells.some(cell => (cell.span || 1) > 1 || cell.vMerge))) add('mergedCells', tableStart, tableStart, '合并的单元格');
    if (on('blankRows')) for (const row of table.rows) {
      const ids = new Set(row.cells.map(c => c.id));
      const own = [...ids].flatMap(id => cellParagraphs.get(id) || []).sort((a, b) => a - b).map(i => [paragraphs[i], i]);
      if (own.length && own.every(([p]) => !text(p).trim() && !p.runs.some(r => r.image))) add('blankRows', starts[own[0][1]], starts[own[0][1]], '此行中所有单元格均为空', { kind: 'deleteRow', cellId: own[0][0].cellId });
    }
  }
  return issues.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Counts for the status bar: { errors, warnings, tips }. */
export function summarize(issues) {
  return { errors: issues.filter(i => i.severity === 'error').length, warnings: issues.filter(i => i.severity === 'warning').length, tips: issues.filter(i => i.severity === 'tip').length };
}
