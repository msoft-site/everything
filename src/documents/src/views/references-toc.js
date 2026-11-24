/**
 * Tables of contents and tables of figures on the References tab: the design gallery, the custom
 * table dialog with a live preview, Add Text (a paragraph's level in the table), Update Table
 * (page numbers only or the entire table), Remove, and Insert Table of Figures.
 */
import { el } from '../ui/dom.js';
import { check, field, galleryItem, number, openDialog, section, select, tablePreview, text } from './references-ui.js';

const LEADER_OPTIONS = [['dot', '点 ......'], ['hyphen', '短划线 ------'], ['underscore', '实线 ______'], ['middleDot', '居中点 ····'], ['none', '(无)']];
const SAMPLE = [{ text: '引言', page: 1, level: 1 }, { text: '背景', page: 2, level: 2 }, { text: '先前工作', page: 3, level: 3 }, { text: '方法', page: 5, level: 1 }];

export function createTocCommands(ctx) {
  const { editor, ready, runBody, error } = ctx;
  const engineToc = () => import('../engine/toc.js');
  const bodyParagraphs = () => editor()?.session.body.paragraphs || [];
  // A new table goes into the text: not while a header, footer or note is being edited.
  const bodyReady = () => !!ready() && editor()?.session.path === null;
  let tocModule = null;
  engineToc().then(m => { tocModule = m; }).catch(() => {});
  const tables = () => { try { return tocModule ? tocModule.tocFields(bodyParagraphs()) : []; } catch { return []; } };
  const hasTable = (figures = false) => tables().some(t => t.figures === figures);
  /** The table at the caret, else the first of its kind. */
  const tableFor = (toc, body, figures) => {
    const all = toc.tocFields(body.paragraphs).filter(t => t.figures === figures);
    const at = body.range[0];
    return all.find(t => t.start <= at && at <= t.end) || all[0] || null;
  };

  function insertDesign(design) {
    return runBody((body, toc) => {
      const existing = tableFor(toc, body, false);
      if (existing) return toc.insertTableOfContents(body, { existing, options: toc.contentsOptions({ levels: design.levels, pageNumbers: design.pageNumbers !== false, rightAlign: design.rightAlign !== false }), leader: design.leader, rightAlign: design.rightAlign !== false, boldTop: !!design.boldTop });
      return toc.insertTableOfContents(body, { title: design.title, options: toc.contentsOptions({ levels: design.levels, pageNumbers: design.pageNumbers !== false, rightAlign: design.rightAlign !== false }), leader: design.leader, rightAlign: design.rightAlign !== false, boldTop: !!design.boldTop });
    }, { modules: ['toc'], track: true });
  }

  function galleryItems(focusEditor) {
    const designs = tocModule?.TOC_DESIGNS || [];
    return [
      { header: '自动目录' },
      ...designs.map(design => galleryItem({ label: design.name, description: design.description, disabled: !bodyReady(), focusEditor, onSelect: () => insertDesign(design),
        preview: tablePreview(SAMPLE.filter(r => r.level <= design.levels).map(r => ({ ...r, bold: design.boldTop && r.level === 1 })), { title: design.title, leader: design.leader, rightAlign: design.rightAlign !== false, pageNumbers: design.pageNumbers !== false }) })),
    ];
  }

  function tocItems(focusEditor) {
    const has = hasTable(false);
    return [
      ...galleryItems(focusEditor),
      { separator: true },
      { label: '自定义目录…', icon: 'toc', disabled: !bodyReady(), onSelect: () => customDialog() },
      { label: '更新目录…', icon: 'updateTable', disabled: !ready() || !has, onSelect: () => updateDialog(false) },
      { label: '删除目录', icon: 'delete', disabled: !ready() || !has, onSelect: removeTable },
    ];
  }

  // With Track Changes on, the removal is a tracked deletion (runBody edits untracked), so it can be rejected.
  function removeTable() {
    const tracked = !!editor()?.session.body.trackChanges;
    return runBody((body, toc) => toc.removeTableOfContents(body, tableFor(toc, body, false), { tracked }), { modules: ['toc'] });
  }

  /* ---- Custom table of contents ---- */
  async function customDialog() {
    const engine = ready(); if (!engine) return;
    const toc = await engineToc();
    const body = engine.session.body;
    const existing = tableFor(toc, body, false);
    const options = existing ? existing.options : toc.parseTocInstruction(toc.TOC_INSTRUCTION);
    const look = existing ? toc.tocAppearance(body, existing) : { leader: 'dot', rightAlign: true, boldTop: false };
    const levelsHigh = options.headingRange?.[1] ?? Math.max(3, ...options.styles.map(s => s.level));
    const pageNumbers = check('显示页码', !options.omitPageNumbers, sync);
    const rightAlign = check('页码右对齐', look.rightAlign, sync);
    const leader = select('制表符前导符', LEADER_OPTIONS, look.leader, sync);
    const links = check('在屏幕上使用超链接替代页码', options.hyperlinks, sync);
    const levels = number('显示级别', levelsHigh, { min: 1, max: 9, oninput: sync });
    const headings = check('标题样式', !!options.headingRange || !existing, sync);
    const outline = check('大纲级别', options.outline || !existing, sync);
    const title = text('标题', existing ? '' : '目录', { placeholder: '无标题' });
    // Custom styles: each paragraph style can map to a level (the \t switch).
    const styles = Object.values(body.styles?.definitions || {}).filter(s => s.type === 'paragraph' && !/^(toc|heading) \d$/i.test(s.name || '') && s.name);
    const mapped = new Map(options.styles.map(s => [s.name.toLowerCase(), s.level]));
    const styleRows = styles.map(style => {
      const input = el('input.input.ref-level-input', { type: 'number', min: 1, max: 9, step: 1, value: mapped.get(style.name.toLowerCase()) ?? '', 'aria-label': `样式 ${style.name} 的目录级别`, oninput: sync });
      return { style, input, row: el('div.ref-style-row', {}, el('span.ref-style-name', {}, style.name), input) };
    });
    const preview = el('div.ref-preview-frame', { 'aria-label': '预览', role: 'img' });
    const styleList = el('div.ref-style-list', {}, ...styleRows.map(r => r.row));
    function sync() {
      rightAlign.box.disabled = !pageNumbers.box.checked;
      leader.disabled = !pageNumbers.box.checked || !rightAlign.box.checked;
      const high = Math.min(9, Math.max(1, Number(levels.value) || 3));
      preview.replaceChildren(tablePreview(SAMPLE.filter(r => r.level <= high), { leader: leader.value, rightAlign: rightAlign.box.checked, pageNumbers: pageNumbers.box.checked }));
    }
    sync();
    openDialog({ title: '目录', wide: true, className: 'ref-toc-dialog', submitLabel: existing ? '替换' : '插入', body: [
      el('div.ref-two-column', {},
        el('div.ref-column', {},
          el('span.field-label', {}, '打印预览'), preview,
          pageNumbers, rightAlign, field('制表符前导符', leader),
          !existing && field('标题', title)),
        el('div.ref-column', {},
          links,
          field('显示级别', levels),
          section('有效样式来自', headings, outline,
            styleRows.length ? el('details.ref-details', {}, el('summary', {}, '其他样式…'), el('p.field-hint', {}, '为样式指定 1 到 9 的级别以列出其段落。'), styleList) : null))),
    ], onSubmit: async () => {
      const high = Math.min(9, Math.max(1, Number(levels.value) || 3));
      const custom = styleRows.filter(r => r.input.value).map(r => ({ name: r.style.name, level: Math.min(9, Math.max(1, Number(r.input.value))) }));
      if (!headings.box.checked && !outline.box.checked && !custom.length) throw new Error('请至少为目录选择一个来源：标题样式、大纲级别或其他样式。');
      // Outline levels alone still honour the level limit, so either source keeps the \o range.
      const next = toc.contentsOptions({ levels: high, hyperlinks: links.box.checked, pageNumbers: pageNumbers.box.checked, rightAlign: rightAlign.box.checked,
        headingStyles: headings.box.checked || outline.box.checked, outline: outline.box.checked, styles: custom });
      await runBody((doc, t) => {
        const target = tableFor(t, doc, false);
        return t.insertTableOfContents(doc, { existing: target, title: target ? null : title.value.trim(), options: next, leader: leader.value, rightAlign: rightAlign.box.checked, boldTop: target ? null : false });
      }, { modules: ['toc'], track: true });
    } });
  }

  /* ---- Update Table ---- */
  async function updateDialog(figures = false) {
    const engine = ready(); if (!engine) return;
    const toc = await engineToc();
    const target = tableFor(toc, engine.session.body, figures);
    if (!target) { error(new Error(figures ? '本文档尚未包含图表目录。' : '本文档尚未包含目录。')); return; }
    const pages = el('input', { type: 'radio', name: 'ref-update-mode', value: 'pages', checked: true });
    const entire = el('input', { type: 'radio', name: 'ref-update-mode', value: 'entire' });
    openDialog({ title: figures ? '更新图表目录' : '更新目录', submitLabel: '更新', body: [
      el('p.field-hint', {}, '请选择要更新的内容。'),
      el('div.ref-radio-group', { role: 'radiogroup', 'aria-label': '更新' },
        el('label.ed-check', {}, pages, '只更新页码'),
        el('label.ed-check', {}, entire, '更新整个目录 (包含新条目和文本)')),
    ], onSubmit: () => updateTable(figures, entire.checked ? 'entire' : 'pages') });
  }

  async function updateTable(figures = false, mode = 'entire') {
    if (mode === 'pages') {
      // A table another application wrote can show its page numbers as plain text (LibreOffice does): with no
      // PAGEREF fields there is nothing to refresh, and the update did nothing without saying so.
      let plain = false;
      const result = await runBody((body, toc) => {
        const target = tableFor(toc, body, figures);
        if (!target) return false;
        const only = toc.tocPageReferences(body, target);
        if (!only.size && !target.options.omitPageNumbers) { plain = true; return false; }
        return { only };
      }, { modules: ['toc'], scopedRefresh: true });
      // Shown in the Update dialog, which stays open for the other choice.
      if (plain) throw new Error(`此${figures ? '图表目录' : '目录'}没有可更新的页码字段。请选择“更新整个目录”以重新生成带有页码的目录。`);
      return result;
    }
    return runBody((body, toc) => {
      const target = tableFor(toc, body, figures);
      if (!target) return false;
      if (!target.whole) return { only: toc.tocPageReferences(body, target) };
      return toc.insertTableOfContents(body, { existing: target });
    }, { modules: ['toc'] });
  }

  /* ---- Add Text: a paragraph's level in the table ---- */
  function currentLevel() {
    const engine = editor();
    if (!engine || engine.session.path !== null) return null;
    const level = engine.model.paragraphFormatting?.outlineLevel;
    return level === null || level === undefined ? null : level;
  }
  function addTextItems() {
    const toc = tables().find(t => !t.figures), shown = Math.max(3, toc?.options.headingRange?.[1] ?? 3);
    const level = currentLevel(), disabled = !ready() || editor()?.session.path !== null;
    return [
      { label: '不在目录中显示', checked: level === 9, radio: true, disabled, onSelect: () => setLevel(0) },
      ...Array.from({ length: shown }, (_, i) => ({ label: `级别 ${i + 1}`, checked: level === i, radio: true, disabled, onSelect: () => setLevel(i + 1) })),
    ];
  }
  function setLevel(level) {
    const engine = ready(); if (!engine) return;
    engine.finishComposition();
    if (engine.session.path !== null) { error(new Error('“添加文本”仅适用于正文中的段落。')); return; }
    const model = engine.model, styles = model.styles?.definitions || {};
    const named = name => Object.values(styles).find(s => s.type === 'paragraph' && s.name?.toLowerCase() === name)?.id;
    engine.execute(() => {
      const heading = level ? named(`heading ${level}`) : null;
      if (heading) return model.setParagraphStyle(heading);
      // Built-in heading styles fix their level: return to the default paragraph style first.
      if (!model.canSetOutlineLevel) model.setParagraphStyle(model.styles.defaultParagraph || null);
      const now = model.paragraphFormatting?.outlineLevel;
      if (level) return model.setOutlineLevel(level - 1) || true;
      if (now !== 9) model.setOutlineLevel(9);
      return true;
    });
    engine.focus(); ctx.onChange();
  }

  /* ---- Table of figures ---- */
  async function figuresDialog() {
    const engine = ready(); if (!engine) return;
    const [toc, captions] = await Promise.all([engineToc(), import('../engine/captions.js')]);
    const body = engine.session.body;
    const existing = tableFor(toc, body, true);
    const labels = captions.captionLabels(body);
    const options = existing?.options;
    const look = existing ? toc.tocAppearance(body, existing) : { leader: 'dot', rightAlign: true };
    // A table of figures names its captions' SEQ identifier ("My_Chart"); show the label it stands for.
    const current = options?.caption || options?.captionNoLabel;
    const label = select('题注标签', labels.map(l => [l, l]), (current && labels.find(l => captions.sequenceId(l).toLowerCase() === captions.sequenceId(current).toLowerCase())) || current || labels[0], sync);
    const includeLabel = check('包含标签和编号', !options?.captionNoLabel, sync);
    const pageNumbers = check('显示页码', !options?.omitPageNumbers, sync);
    const rightAlign = check('页码右对齐', look.rightAlign, sync);
    const leader = select('制表符前导符', LEADER_OPTIONS, look.leader, sync);
    const links = check('在屏幕上使用超链接替代页码', options ? options.hyperlinks : true);
    const preview = el('div.ref-preview-frame', { role: 'img', 'aria-label': '预览' });
    function sync() {
      rightAlign.box.disabled = !pageNumbers.box.checked;
      leader.disabled = !pageNumbers.box.checked || !rightAlign.box.checked;
      const name = label.value || '图表', prefix = n => includeLabel.box.checked ? `${name} ${n}: ` : '';
      preview.replaceChildren(tablePreview([{ text: `${prefix(1)}示例一`, page: 1, level: 1 }, { text: `${prefix(2)}示例二`, page: 3, level: 1 }, { text: `${prefix(3)}示例三`, page: 5, level: 1 }],
        { leader: leader.value, rightAlign: rightAlign.box.checked, pageNumbers: pageNumbers.box.checked }));
    }
    sync();
    openDialog({ title: '图表目录', wide: true, className: 'ref-toc-dialog', submitLabel: existing ? '替换' : '插入', body: [
      el('div.ref-two-column', {},
        el('div.ref-column', {}, el('span.field-label', {}, '打印预览'), preview, pageNumbers, rightAlign, field('制表符前导符', leader)),
        el('div.ref-column', {}, field('题注标签', label), includeLabel, links)),
    ], onSubmit: () => runBody((doc, t) => {
      const target = tableFor(t, doc, true);
      const next = t.figuresOptions({ label: label.value || 'Figure', includeLabel: includeLabel.box.checked, hyperlinks: links.box.checked, pageNumbers: pageNumbers.box.checked, rightAlign: rightAlign.box.checked });
      return t.insertTableOfContents(doc, { existing: target, title: null, options: next, leader: leader.value, rightAlign: rightAlign.box.checked, boldTop: false });
    }, { modules: ['toc'], track: true }) });
  }

  return {
    tocItems, addTextItems, customDialog, updateDialog, updateTable, figuresDialog, setLevel,
    hasToc: () => hasTable(false), hasFigures: () => hasTable(true),
  };
}
