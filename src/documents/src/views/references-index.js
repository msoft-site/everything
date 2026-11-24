/**
 * Index and table of authorities on the References tab: Mark Entry and Mark Citation (modeless
 * panels, so text can be selected while they stay open), Insert Index and Insert Table of
 * Authorities (with a live preview), and Update for each. Page numbers come from the current
 * layout and settle over a few passes, since a generated table can move the text it lists.
 */
import { el } from '../ui/dom.js';
import { nextCitation } from '../engine/authorities.js';
import { clipText } from '../core/text.js';
import { check, field, number, openDialog, openPanel, select, tablePreview, text } from './references-ui.js';

const LEADERS = [['dot', '点 ......'], ['hyphen', '短划线 ------'], ['underscore', '实线 ______'], ['none', '(无)']];

export function createIndexCommands(ctx) {
  const { editor, ready, runBody, error, pageOf } = ctx;
  const selectedText = () => {
    const engine = editor(); if (!engine || engine.session.path !== null) return '';
    const [start, end] = engine.model.range;
    return clipText(engine.model.text.slice(start, end).replace(/[\n\t\f\v￼]+/g, ' ').trim(), 200);
  };

  /** Run `write(body, module, pages)` until the pages it lists stop moving (at most four passes). */
  function settle(write, read) {
    return (body, module) => {
      let previous = null, result;
      for (let pass = 0; pass < 4; pass++) {
        result = write(body, module, pageOf(body), result);
        const now = read(body, module, result);
        if (now === previous) break;
        previous = now;
      }
      return result;
    };
  }
  const resultText = (body, range) => body.text.slice(range.start, range.end);

  /* ---- Mark Entry ---- */
  function markEntryPanel() {
    const engine = ready(); if (!engine) return;
    const main = text('主索引项', selectedText(), { required: true });
    const sub = text('次索引项', '');
    const cross = text('交叉引用', '参见 ');
    const bookmarkSelect = select('书签', (engine.model.bookmarks || []).filter(b => !b.name.startsWith('_')).map(b => [b.name, b.name]));
    const choice = value => el('input', { type: 'radio', name: 'ref-entry-kind', value, checked: value === 'page', onchange: sync });
    const crossRadio = choice('cross'), pageRadio = choice('page'), rangeRadio = choice('range');
    const bold = check('加粗', false), italic = check('倾斜', false);
    const status = el('p.field-hint', { 'aria-live': 'polite' });
    let edited = false;
    main.addEventListener('input', () => { edited = true; });
    function sync() { cross.disabled = !crossRadio.checked; bookmarkSelect.disabled = !rangeRadio.checked || !bookmarkSelect.options.length; rangeRadio.disabled = !bookmarkSelect.options.length; }
    sync();
    const options = () => ({ main: main.value, sub: sub.value, bold: bold.box.checked, italic: italic.box.checked,
      crossReference: crossRadio.checked ? cross.value.trim() : null, bookmark: rangeRadio.checked ? bookmarkSelect.value : null });
    const mark = async all => {
      if (!main.value.trim()) { status.textContent = '请先输入主索引项。'; main.focus(); return; }
      const selection = selectedText();
      let count = 0;
      await runBody((body, idx) => { if (all) count = idx.markAllEntries(body, selection, options()); else { idx.markEntry(body, options()); count = 1; } return true; }, { modules: ['index'], refresh: false, keepFocus: true, track: true });
      status.textContent = all ? `已标记 ${count} 个条目。` : '已标记条目。';
      edited = false;
      ctx.showFieldCodes?.();
    };
    const markAll = el('button.btn.btn-outline', { type: 'button', onclick: () => mark(true) }, '全部标记');
    const panel = openPanel({ title: '标记索引项', className: 'ref-mark-panel', body: [
      field('主索引项', main), field('次索引项', sub),
      el('fieldset.ref-section', {}, el('legend', {}, '选项'),
        el('label.ed-check', {}, crossRadio, '交叉引用:'), cross,
        el('label.ed-check', {}, pageRadio, '当前页'),
        el('label.ed-check', {}, rangeRadio, '页码范围书签:'), bookmarkSelect),
      el('fieldset.ref-section', {}, el('legend', {}, '页码格式'), el('div.row', {}, bold, italic)),
      el('p.field-hint', {}, '面板保持打开状态：选择其他文字，然后再次点击“标记”。显示编辑标记时，索引项将显示为 { XE } 域代码。'),
      status,
    ], actions: [markAll, el('button.btn.btn-primary', { type: 'button', onclick: () => mark(false) }, '标记')] });
    // Coming back to the panel picks up a new selection.
    panel.node.addEventListener('focusin', e => { if (!panel.node.contains(e.relatedTarget) && !edited) { const t = selectedText(); if (t) { main.value = t; sub.value = ''; } markAll.disabled = !selectedText(); } });
    markAll.disabled = !selectedText();
    main.select();
  }

  /* ---- Insert / update index ---- */
  const indexFor = (idx, body) => { const all = idx.indexFields(body.paragraphs), at = body.range[0]; return all.find(r => r.start <= at && at <= r.end) || all[0] || null; };
  async function insertIndexDialog() {
    const engine = ready(); if (!engine) return;
    const idx = await import('../engine/index-entries.js');
    const existing = indexFor(idx, engine.session.body);
    const o = existing ? idx.parseIndexInstruction(existing.field.instruction) : { runIn: false, columns: 2, rightAlign: false, headings: null };
    const leaderNow = existing ? engine.session.body.paragraphs[existing.first]?.format?.tabs?.find(t => t.alignment === 'right')?.leader || 'dot' : 'dot';
    const type = select('类型', [['indented', '缩进式'], ['runin', '紧密式']], o.runIn ? 'runin' : 'indented', sync);
    const columns = number('栏数', o.columns || 1, { min: 1, max: 4, oninput: sync });
    const rightAlign = check('页码右对齐', o.rightAlign, sync);
    const leader = select('制表符前导符', LEADERS, leaderNow, sync);
    const format = select('格式', [['plain', '无标题'], ['letters', '字母标题'], ['spaced', '带空格的字母标题']], o.headings ? (o.headings.trim() === 'A' && o.headings !== 'A' ? 'spaced' : 'letters') : 'plain', sync);
    const language = select('语言', [['1033', '英语 (美国)'], ['2057', '英语 (英国)'], ['2052', '中文 (简体)'], ['1036', '法语'], ['1031', '德语'], ['3082', '西班牙语']], o.lcid || '2052');
    const preview = el('div.ref-preview-frame', { role: 'img', 'aria-label': '预览' });
    function sync() {
      leader.disabled = !rightAlign.box.checked;
      const runIn = type.value === 'runin', headings = format.value !== 'plain';
      const rows = [...(headings ? [{ text: 'A', level: 1, bold: true }] : []), { text: '大气层', page: 1, level: 1 }, ...(runIn ? [] : [{ text: '地球', page: 4, level: 2 }]), { text: runIn ? '大气层: 地球 4; 火星 7' : '火星', page: runIn ? undefined : 7, level: runIn ? 1 : 2 }, ...(headings ? [{ text: 'B', level: 1, bold: true }] : []), { text: '沸点', page: 12, level: 1 }];
      preview.replaceChildren(tablePreview(rows, { leader: leader.value, rightAlign: rightAlign.box.checked }));
      preview.style.columnCount = String(Math.max(1, Math.min(4, Number(columns.value) || 1)));
    }
    sync();
    openDialog({ title: '索引', wide: true, className: 'ref-toc-dialog', submitLabel: existing ? '替换' : '插入', body: [
      el('div.ref-two-column', {},
        el('div.ref-column', {}, el('span.field-label', {}, '打印预览'), preview, rightAlign, field('制表符前导符', leader)),
        el('div.ref-column', {}, field('类型', type), field('栏数', columns, '栏数保存在字段中；页面在添加分节分栏之前显示为单栏。'), field('格式', format), field('语言', language))),
    ], onSubmit: () => {
      const options = { ...idx.parseIndexInstruction(existing?.field.instruction || ' INDEX '), runIn: type.value === 'runin', columns: Math.max(1, Math.min(4, Number(columns.value) || 1)), rightAlign: rightAlign.box.checked,
        entrySeparator: rightAlign.box.checked ? '\t' : ', ', headings: format.value === 'letters' ? 'A' : format.value === 'spaced' ? ' A ' : null, lcid: language.value };
      return runBody(settle((body, m, pages, last) => m.writeIndex(body, { existing: last ? m.indexFields(body.paragraphs).find(r => r.field.id === last.field.id) : indexFor(m, body), options, pageOf: pages, leader: leader.value }),
        (body, m, range) => resultText(body, m.indexFields(body.paragraphs).find(r => r.field.id === range.field.id))), { modules: ['index'], refresh: false, track: true });
    } });
  }
  async function updateIndex() {
    const engine = ready(); if (!engine) return;
    const idx = await import('../engine/index-entries.js');
    if (!indexFor(idx, engine.session.body)) { error(new Error('本文档尚未包含索引。请先使用“插入索引”。')); return; }
    await runBody(settle((body, m, pages, last) => {
      const target = last ? m.indexFields(body.paragraphs).find(r => r.field.id === last.field.id) : indexFor(m, body);
      const leader = body.paragraphs[target.first]?.format?.tabs?.find(t => t.alignment === 'right')?.leader || 'dot';
      return m.writeIndex(body, { existing: target, pageOf: pages, leader });
    }, (body, m, range) => resultText(body, m.indexFields(body.paragraphs).find(r => r.field.id === range.field.id))), { modules: ['index'], refresh: false });
  }

  /* ---- Mark Citation (table of authorities) ---- */
  async function markCitationPanel() {
    const engine = ready(); if (!engine) return;
    const toa = await import('../engine/authorities.js');
    const selected = selectedText();
    const long = el('textarea.input.ref-long-citation', { 'aria-label': '完整引文', rows: 3 }, selected);
    const short = text('简短引文', selected);
    const category = select('类别', toa.TOA_CATEGORIES.map((name, i) => [String(i + 1), name]), '1');
    const existingList = el('select.input', { 'aria-label': '已标记的完整引文', size: 4, onchange: () => {
      const picked = toa.authorities(editor().session.body.paragraphs).find(a => a.long === existingList.value);
      if (picked) { long.value = picked.long; short.value = picked.short; category.value = String(picked.category); }
    } });
    const status = el('p.field-hint', { 'aria-live': 'polite' });
    const fillExisting = () => existingList.replaceChildren(...toa.authorities(editor()?.session.body.paragraphs || []).map(a => el('option', { value: a.long }, a.long)));
    fillExisting();
    const options = () => ({ long: long.value.trim().replace(/\s*\n\s*/g, ' '), short: short.value.trim() || long.value.trim(), category: Number(category.value) });
    const mark = async all => {
      if (!long.value.trim()) { status.textContent = '请先输入完整引文。'; long.focus(); return; }
      let count = 0;
      await runBody((body, m) => { if (all) count = m.markAllAuthorities(body, options()); else { m.markAuthority(body, options()); count = 1; } return true; }, { modules: ['authorities'], refresh: false, keepFocus: true, track: true });
      status.textContent = all ? `已标记 ${count} 个引文。` : '已标记引文。';
      fillExisting();
      ctx.showFieldCodes?.();
    };
    /** Find the next likely citation after the selection: "v.", "§", "U.S.C.", "Id.", "supra". */
    const next = () => {
      const engine2 = editor(); if (!engine2) return;
      const body = engine2.session.body, from = body.range[1];
      const match = nextCitation(body.text, from);
      if (!match) { status.textContent = '未找到更多引文。'; return; }
      body.select(match.index, match.index + match[0].length); engine2.revealCaret?.(); engine2.paint?.(); ctx.onChange();
      long.value = match[0]; short.value = match[0]; status.textContent = '';
    };
    const markAll = el('button.btn.btn-outline', { type: 'button', onclick: () => mark(true) }, '全部标记');
    const panel = openPanel({ title: '标记引文', className: 'ref-mark-panel', body: [
      field('所选文本 (完整引文)', long), field('类别', category), field('简短引文', short),
      field('已标记的完整引文', existingList),
      status,
    ], actions: [el('button.btn.btn-ghost', { type: 'button', onclick: next }, '下一个引文'), markAll, el('button.btn.btn-primary', { type: 'button', onclick: () => mark(false) }, '标记')] });
    panel.node.addEventListener('focusin', e => { if (!panel.node.contains(e.relatedTarget)) { const t = selectedText(); if (t && t !== long.value) { long.value = t; short.value = t; } fillExisting(); } });
    long.focus();
  }

  /* ---- Insert / update table of authorities ---- */
  async function insertAuthoritiesDialog() {
    const engine = ready(); if (!engine) return;
    const toa = await import('../engine/authorities.js');
    const body = engine.session.body;
    const existing = toa.tableFields(body.paragraphs)[0];
    const o = existing ? toa.parseTableInstruction(existing.field.instruction) : { category: 0, passim: true, keepFormatting: true };
    const category = select('类别', [['0', '全部'], ...toa.TOA_CATEGORIES.map((name, i) => [String(i + 1), name])], existing ? String(o.category) : '0', sync);
    const passim = check('使用 passim (五页或以上)', o.passim, sync);
    const keep = check('保留原格式', o.keepFormatting);
    const leader = select('制表符前导符', LEADERS, 'dot', sync);
    const preview = el('div.ref-preview-frame', { role: 'img', 'aria-label': '预览' });
    function sync() {
      const heading = category.value === '0' ? '案例' : toa.TOA_CATEGORIES[Number(category.value) - 1];
      preview.replaceChildren(tablePreview([{ text: '示例一诉示例二, 123 U.S. 45 (1990)', page: 3, level: 1 }, { text: '其他诉当事人, 67 F.3d 89 (2001)', page: passim.box.checked ? 'passim' : '2, 4, 6, 8, 9', level: 1 }], { title: heading, leader: leader.value }));
    }
    sync();
    openDialog({ title: '引文目录', wide: true, className: 'ref-toc-dialog', submitLabel: existing ? '替换' : '插入', body: [
      el('div.ref-two-column', {},
        el('div.ref-column', {}, el('span.field-label', {}, '打印预览'), preview, field('制表符前导符', leader)),
        el('div.ref-column', {}, field('类别', category), passim, keep)),
    ], onSubmit: () => runBody(settle((doc, m, pages) => {
      const base = { passim: passim.box.checked, keepFormatting: keep.box.checked, headings: true, entrySeparator: '\t', pageSeparator: ', ', extra: [] };
      const present = new Set(m.authorities(doc.paragraphs).map(a => a.category));
      const categories = category.value === '0' ? [...present].sort((a, b) => a - b) : [Number(category.value)];
      if (!categories.length) categories.push(1);
      const tables = m.tableFields(doc.paragraphs);
      if (tables.length) {
        // Replace the existing tables: rebuild in place, from the last so positions stay valid.
        for (let i = tables.length - 1; i >= 0; i--) {
          const current = m.tableFields(doc.paragraphs)[i];
          const parsed = m.parseTableInstruction(current.field.instruction);
          m.writeTableOfAuthorities(doc, { existing: current, options: { ...parsed, ...base, category: category.value === '0' ? parsed.category : Number(category.value) }, pageOf: pages, leader: leader.value });
        }
        return true;
      }
      categories.forEach((c, i) => {
        const span = m.writeTableOfAuthorities(doc, { options: { ...base, category: c }, pageOf: pages, leader: leader.value });
        // The next category's table follows this one (writing leaves the caret at a table's start).
        if (i < categories.length - 1) doc.select(span.paragraphEnd + 1);
      });
      return true;
    }, (doc, m) => m.tableFields(doc.paragraphs).map(r => resultText(doc, r)).join('\n')), { modules: ['authorities'], refresh: false, track: true }) });
  }
  async function updateAuthorities() {
    const engine = ready(); if (!engine) return;
    const toa = await import('../engine/authorities.js');
    if (!toa.tableFields(engine.session.body.paragraphs).length) { error(new Error('本文档尚未包含引文目录。')); return; }
    await runBody(settle((doc, m, pages) => {
      const count = m.tableFields(doc.paragraphs).length;
      for (let i = count - 1; i >= 0; i--) {
        const current = m.tableFields(doc.paragraphs)[i];
        const leader = doc.paragraphs[current.first]?.format?.tabs?.find(t => t.alignment === 'right')?.leader || 'dot';
        m.writeTableOfAuthorities(doc, { existing: current, pageOf: pages, leader });
      }
      return true;
    }, (doc, m) => m.tableFields(doc.paragraphs).map(r => resultText(doc, r)).join('\n')), { modules: ['authorities'], refresh: false });
  }

  return { markEntryPanel, insertIndexDialog, updateIndex, markCitationPanel, insertAuthoritiesDialog, updateAuthorities };
}
