/**
 * The References tab and page furniture: tables of contents and figures, footnotes and endnotes,
 * citations and bibliography, captions and cross-references, index, table of authorities, Smart
 * Lookup, plus headers and footers that do not exist yet and page numbers (Insert tab). Each area
 * lives in its own module; this one wires them to the ribbon, menus and keyboard. Engine code loads
 * on demand, like the rest of the editor's engine.
 */
import { openMenu } from '../ui/menu.js';
import { clipText } from '../core/text.js';
import { el, MOD_KEY, shortcutCode, typesCharacter } from '../ui/dom.js';
import { createTocCommands } from './references-toc.js';
import { createNoteCommands } from './references-notes.js';
import { createCitationCommands } from './references-citations.js';
import { createIndexCommands } from './references-index.js';
import { createSmartLookup } from './smart-lookup.js';
import { check, field, openDialog, select, text } from './references-ui.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** A page field record for header/footer stories, as the DOCX reader produces one. */
async function pageField(type) {
  const { pageFieldSegments } = await import('../engine/docx-page-fields.js');
  const root = new DOMParser().parseFromString(`<w:p xmlns:w="${W}"><w:fldSimple w:instr=" ${type} "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>`, 'application/xml').documentElement;
  const [segment] = pageFieldSegments(root);
  return { ...segment.field, cachedText: '1' };
}

export function createReferences({ editor, pkg, error, base = {}, onChange = () => {} }) {
  const ready = () => { const engine = editor(); return engine && !pkg()?.readOnly ? engine : null; };
  const fail = e => { error(e); editor()?.focus(); };
  /**
   * New header and footer parts and document settings bypass the protection check every edit passes through:
   * under Restrict Editing they are refused, as typing is.
   */
  const unprotected = what => { if (base.protectedDocument?.()) throw new Error(`This document is protected against editing, so ${what} cannot be changed. Stop protection under Review > Restrict Editing first.`); };
  // Headers, footers and notes hold no tracked changes here, so with tracking locked they cannot be edited (the guard
  // refuses it): a new one would stay as it was made, an empty header or a note with only its number.
  const trackableStories = () => { if (base.trackingLocked?.()) throw new Error('Changes to this document are tracked, and headers, footers and notes cannot be changed with tracking here.'); };
  /**
   * A new header, footer or note is a new part of this tab's package. The room shares the text of the stories
   * everyone's package has, not new parts: the others would never see it, and a note's reference would reach
   * them (and the file the owner's tab saves) without the note. Existing ones stay editable together.
   */
  const unshared = (what, change = 'added') => { if (base.shared?.()) throw new Error(`${what} cannot be ${change} while the document is shared: the others would not receive them. Stop sharing first.`); };

  /**
   * Which header/footer variant a page shows: first, even or default (§17.10.5). Even and odd go by the
   * page's number, as layout chooses them: a section numbered from 2 shows its even story on its first sheet.
   */
  async function variantFor(engine, page) {
    const definition = engine.pageStories, section = engine.sectionOfPage(page), layout = engine.layout;
    const firstPage = layout.pageSections?.indexOf(section) ?? 0;
    if (page === firstPage && definition?.sections[section]?.firstPageDifferent) return 'first';
    if (!definition?.evenAndOdd) return 'default';
    const { pageNumberSequence } = await import('../engine/page-numbering.js');
    const number = pageNumberSequence(layout.pageSections || [], definition, layout.numberingApproximations)[page] ?? page + 1;
    return number % 2 === 0 ? 'even' : 'default';
  }
  const currentPage = engine => engine.session.path !== null ? engine.storyPage ?? 0 : engine.caretPageIndex ?? 0;

  /** The editable header/footer story of `kind` for the current page, creating it (in the right variant) when missing. */
  async function story(kind, page = null) {
    const engine = ready(); if (!engine) return null;
    engine.finishComposition();
    page ??= currentPage(engine);
    const section = engine.sectionOfPage(page), variant = await variantFor(engine, page);
    const existing = engine.pageStories?.sections[section]?.[kind]?.[variant];
    if (existing) {
      if (!engine.pageStories.stories[existing]?.editable) throw new Error(`This document's ${kind} cannot be edited yet.`);
      engine.editStory(existing, page); return existing;
    }
    unprotected(`its ${kind}s`); trackableStories();
    unshared(`New ${kind}s`);
    const { TextDocument, paragraph } = await import('../engine/model.js');
    const body = engine.session.body;
    const styleId = Object.values(body.styles.definitions || {}).find(s => s.type === 'paragraph' && s.name?.toLowerCase() === kind)?.id;
    const draft = new TextDocument([paragraph('', styleId ? { styleId } : {})], body.pageSettings, body.numbering, body.styles, [], body.assets);
    const path = pkg().addPageStory(kind, { variant, section });
    engine.attachPageStory(path, kind, draft.paragraphs, { variant, section });
    engine.onChange();
    engine.editStory(path, page);
    return path;
  }
  async function setStoryOption(option, on) {
    try {
      const engine = ready(); if (!engine) return;
      unprotected('its headers and footers'); trackableStories();
      // Each needs headers of its own, new parts the others would not receive (unshared).
      unshared(option === 'first' ? 'Different first page headers' : 'Different odd and even page headers', 'turned on or off');
      const kind = activeStoryKind(), page = currentPage(engine), section = engine.sectionOfPage(page);
      engine.changeSettings(() => {
        if (option === 'first') { pkg().setTitlePage(section, on); engine.setStoryOptions({ section, firstPageDifferent: on }); }
        else { pkg().setEvenAndOdd(on); engine.setStoryOptions({ evenAndOdd: on }); }
      }, option === 'first' ? 'Different First Page' : 'Different Odd & Even Pages');
      if (kind === 'header' || kind === 'footer') await story(kind, page);
      onChange();
    } catch (e) { fail(e); }
  }

  async function editHeader(kind) {
    try { await story(kind); } catch (e) { fail(e); }
  }

  async function insertPageNumber(where, alignment, style = 'plain') {
    try {
      const engine = ready(); if (!engine) return;
      if (where !== 'current') await story(where === 'top' ? 'header' : 'footer');
      else if (engine.session.path === null) throw new Error('页码可插入在页眉或页脚中。请双击页面顶部或底部，或使用“页码”→“页面顶端”或“页面底端”。');
      const [page, total] = await Promise.all([pageField('PAGE'), pageField('NUMPAGES')]);
      engine.execute(() => {
        const model = engine.model;
        if (where !== 'current') {
          if (model.text.trim()) { model.select(model.text.length); model.replace('\n'); }
          else model.select(0, model.text.length);
          model.setParagraphFormat({ alignment });
        }
        if (style === 'pageOf') { model.replace('第 '); model.insertFieldRun(page); model.replace(' 页，共 '); model.insertFieldRun(total); model.replace(' 页'); }
        else model.insertFieldRun(page);
        return true;
      });
      engine.focus();
    } catch (e) { fail(e); }
  }

  function pageNumberItems() {
    const placements = where => ['left', 'center', 'right'].flatMap(alignment => [
      { label: `普通数字 ${alignment === 'left' ? '1 (左对齐)' : alignment === 'center' ? '2 (居中)' : '3 (右对齐)'}`, onSelect: () => insertPageNumber(where, alignment) },
    ]).concat([{ separator: true }, { label: '第 X 页 共 Y 页', onSelect: () => insertPageNumber(where, 'center', 'pageOf') }]);
    return [
      { label: '页面顶端', items: placements('top') },
      { label: '页面底端', items: placements('bottom') },
      { label: '当前位置', disabled: editor()?.session.path === null, items: [{ label: '普通数字', onSelect: () => insertPageNumber('current') }, { label: '第 X 页 共 Y 页', onSelect: () => insertPageNumber('current', null, 'pageOf') }] },
    ];
  }

  /* ---- Shared plumbing for the References modules ---- */
  const ENGINE = {
    toc: () => import('../engine/toc.js'),
    captions: () => import('../engine/captions.js'),
    bibliography: () => import('../engine/bibliography-fields.js'),
    index: () => import('../engine/index-entries.js'),
    authorities: () => import('../engine/authorities.js'),
    generated: () => import('../engine/generated-fields.js'),
  };
  let pageLookupModule = null;
  import('../engine/page-lookup.js').then(m => { pageLookupModule = m; }).catch(() => {});
  /** Printed pages of body positions, from a fresh layout of `body`. */
  const pageOf = body => {
    const engine = editor();
    return pageLookupModule.pageLookup(engine.layoutModel(body), engine.pageStories);
  };
  /**
   * Run `action(body, ...modules)` on the document body as one undo step, without tracking changes,
   * then refresh page references (all, or `result.only`). Returns the action's result. With `track`, text the
   * action inserts (a caption, a cross-reference) is then a tracked insertion when Track Changes is on.
   */
  /**
   * `after(body, ...modules)` runs in the same undo step once the action is recorded as inserted (Track Changes),
   * untracked (a citation's bibliography refresh). `settings`: the action also writes settings the step takes back
   * (the citation sources and style).
   */
  async function runBody(action, { modules = ['captions'], refresh = true, keepFocus = false, track = false, stay = null, after = null, settings = false } = {}) {
    const engine = ready(); if (!engine) return false;
    engine.finishComposition();
    const [refreshModule, ...loaded] = await Promise.all([import('../engine/page-reference-refresh.js'), ...modules.map(name => ENGINE[name]())]);
    if (!pageLookupModule) pageLookupModule = await import('../engine/page-lookup.js');
    if (!ready()) return false;
    // From here to the end nothing waits, so no keystroke can arrive while the body is the open story. With `stay`,
    // a header, footer or note open now is opened again with its caret where it is, and `stay(engine)` runs there:
    // keys typed while the modules loaded went into it, and keys typed after go into it too.
    engine.finishComposition();
    const story = stay && engine.session.path !== null ? { path: engine.session.path, page: engine.storyPage, ...engine.model.selection } : null;
    if (engine.session.path !== null) engine.editStory(null);
    const body = engine.session.body, tracking = body.trackChanges;
    body.trackChanges = false;
    let result;
    // The body's change and the one `stay` makes in the header or footer (F9's own fields there) are one undo step.
    engine.transact(() => {
      try {
        engine.execute(() => {
          const before = track && tracking ? body.text : null;
          // Fields there were before, so the ones the action adds are recorded as inserted with their text.
          const fields = before !== null ? new Set(body.paragraphs.flatMap(p => (p.fieldMarkers || []).map(m => m.field.id))) : null;
          result = action(body, ...loaded);
          if (result === false) return false;
          // Untracked, a caption or cross-reference inserted with Track Changes on stayed after Reject All, and with
          // tracking locked it could not be inserted at all.
          if (before !== null) body.trackInsertion(before, fields);
          after?.(body, ...loaded);
          if (refresh || result?.only) refreshModule.refreshPageReferences(body, model => engine.layoutModel(model), engine.pageStories, { checkpoint: false, only: result?.only || null });
          return result;
        }, undefined, settings ? { settings: true } : undefined);
      } finally {
        body.trackChanges = tracking;
        if (story && engine.session.path === null && engine.editStory(story.path, story.page) && engine.session.path === story.path) {
          engine.model.select(story.anchor, story.focus);
          stay(engine);
        }
      }
    });
    if (!keepFocus) engine.focus();
    onChange();
    return result;
  }
  const ctx = { editor, pkg, error, ready, fail, runBody, pageOf, unprotected, trackableStories, unshared, onChange: () => onChange(), showFieldCodes: () => base.showFieldCodes?.() };
  const toc = createTocCommands(ctx);
  const notes = createNoteCommands(ctx);
  const citations = createCitationCommands(ctx);
  const indexes = createIndexCommands(ctx);
  const lookup = createSmartLookup({ editor, error });
  const hasToc = () => toc.hasToc();

  /* ---- Field updates (F9) ---- */
  async function noteNumberMaps() {
    const engine = editor(), notesModule = await import('../engine/footnotes.js');
    const definition = engine?.pageStories, paragraphs = engine?.session.body.paragraphs || [];
    const maps = {};
    for (const kind of ['footnote', 'endnote']) {
      const settings = definition?.[`${kind}s`] || { format: kind === 'footnote' ? 'decimal' : 'lowerRoman' };
      // Footnotes numbered from 1 on each page are numbered by the pages the layout put them on, as shown.
      let pages = null;
      if (kind === 'footnote' && settings.restart === 'eachPage') { pages = new Map(); for (const area of engine?.layout?.footnoteAreas || []) for (const note of area.notes) pages.set(note.id, area.page); }
      maps[kind] = notesModule.noteNumbers(paragraphs, settings, kind, pages);
    }
    return maps;
  }
  /** Update every field this editor can evaluate: sequences, references, citations, bibliographies and page numbers. */
  async function updateAllFields() {
    const engine = ready(); if (!engine) return;
    engine.finishComposition();
    engine.fieldUpdateRunning = true;
    try {
      const [{ updateSequenceFields }, { updateStoryFields, fieldEvaluationContext }] = await Promise.all([import('../engine/field-update.js'), import('../engine/field-results.js')]);
      const issues = [], notesMaps = await noteNumberMaps(), citationsUpdate = await citations.refreshAction();
      // Pressed in a header, footer or note, F9 updates the body's fields and stays there (runBody's `stay`): it
      // used to leave the caret at the start of the body, and keys typed while it worked went into the body.
      await runBody((body, fields) => {
        updateSequenceFields(body, { onIssue: issue => issues.push(issue), notes: notesMaps });
        citationsUpdate?.(body, fields);
        return true;
      }, { modules: ['bibliography'], stay: open => {
        // The header's or footer's own fields (DATE, FILENAME…) update too; page numbers there follow pagination.
        if (!open.model.paragraphs.some(p => p.runs.some(r => r.field))) return;
        const { anchor, focus } = open.model.selection;
        open.execute(() => updateStoryFields(open.model, { ...(fieldEvaluationContext() || {}), text: open.session.body.text }) > 0);
        open.model.select(anchor, focus); open.revealCaret?.();
      } });
      if (issues.length) error(new Error([...new Set(issues.map(issue => issue.message))].join(' ')));
    } finally { engine.fieldUpdateRunning = false; }
  }

  /* ---- Captions ---- */
  const LABELS_KEY = 'documents.captions.labels';
  const customLabels = () => { try { const list = JSON.parse(localStorage.getItem(LABELS_KEY) || '[]'); return Array.isArray(list) ? list.filter(l => typeof l === 'string') : []; } catch { return []; } };
  const saveLabels = list => { try { localStorage.setItem(LABELS_KEY, JSON.stringify([...new Set(list)])); } catch { /* storage unavailable */ } };
  async function captionDialog() {
    const engine = ready(); if (!engine) return;
    if (engine.session.path !== null) engine.editStory(null);
    const captions = await import('../engine/captions.js');
    const body = engine.session.body;
    const labels = () => captions.captionLabels(body, customLabels());
    const label = select('标签', labels().map(l => [l, l]), engine.model.selectedImage ? '图表' : engine.model.tableContext ? '表格' : '图表', () => sync());
    const caption = text('题注文字', '', { placeholder: '可选描述' });
    const position = select('位置', [['below', '所选项目下方'], ['above', '所选项目上方']], engine.model.tableContext && !engine.model.selectedImage ? 'above' : 'below');
    const format = select('编号格式', Object.entries(captions.CAPTION_FORMATS).map(([id, name]) => [id, name]), 'ARABIC', () => sync());
    const exclude = check('从题注中排除标签', false, () => sync());
    const preview = el('p.ref-caption-preview', { 'aria-live': 'polite' });
    const sample = { ARABIC: '1', alphabetic: 'a', ALPHABETIC: 'A', roman: 'i', ROMAN: 'I' };
    function sync() {
      const used = customLabels().includes(label.value);
      deleteLabel.disabled = !used;
      const t = caption.value.trim();
      preview.textContent = `${exclude.box.checked ? '' : `${label.value} `}${sample[format.value]}${t ? `${/^[\s:.\-–—]/.test(t) ? '' : ': '}${t}` : ''}`;
    }
    const newLabel = el('button.btn.btn-outline', { type: 'button', onclick: () => {
      const input = text('新标签', '', { required: true, maxLength: 40, pattern: '\\p{L}[\\p{L}\\p{M}\\p{N} _]{0,39}' });
      openDialog({ title: '新建标签', body: [field('标签', input, '支持字母、汉字、数字和空格，如“图表”或“插图”。')], onSubmit: () => {
        const value = input.value.trim().replace(/\s+/g, ' ');
        if (!/^\p{L}[\p{L}\p{M}\p{N} _]{0,39}$/u.test(value)) throw new Error('标签必须以字母或汉字开头，并可包含数字和空格。');
        saveLabels([...customLabels(), value]);
        label.replaceChildren(...labels().map(l => el('option', { value: l }, l))); label.value = value; sync();
      } });
    } }, '新建标签…');
    const deleteLabel = el('button.btn.btn-outline', { type: 'button', onclick: () => {
      saveLabels(customLabels().filter(l => l !== label.value));
      label.replaceChildren(...labels().map(l => el('option', { value: l }, l))); sync();
    } }, '删除标签');
    caption.addEventListener('input', sync);
    sync();
    openDialog({ title: '题注', className: 'ref-caption-dialog', body: [
      field('题注', caption), preview,
      el('div.ref-two-column.ref-tight', {}, field('标签', label), field('位置', position)),
      exclude, field('编号格式', format),
      el('div.row', {}, newLabel, deleteLabel),
    ], onSubmit: () => runBody((doc, c) => c.insertCaption(doc, { label: label.value, text: caption.value.trim(), above: position.value === 'above', format: format.value, excludeLabel: exclude.box.checked }), { modules: ['captions'], track: true }) });
    caption.focus();
  }

  /* ---- Cross-references ---- */
  async function noteTargets() {
    const engine = editor(), notesModule = await import('../engine/footnotes.js'), maps = await noteNumberMaps();
    const definition = engine.pageStories, result = [];
    for (const kind of ['footnote', 'endnote']) {
      const part = definition?.[`${kind}s`]?.part;
      for (const [id, display] of maps[kind]) {
        const story = part && definition.stories[notesModule.footnoteStoryPath(part, id)];
        const textOf = story ? clipText(story.paragraphs.map(p => p.runs.filter(r => !r.noteMark).map(r => r.text).join('')).join(' ').trim(), 60) : '';
        result.push({ kind, id, display, text: textOf });
      }
    }
    return result;
  }
  async function crossReferenceDialog() {
    const engine = ready(); if (!engine) return;
    if (engine.session.path !== null) engine.editStory(null);
    const captions = await import('../engine/captions.js');
    const targets = captions.referenceTargets(engine.session.body, { notes: await noteTargets() });
    const captionKinds = [...new Set([...captions.CAPTION_LABELS.map(captions.sequenceId), ...targets.captions.map(c => c.kind)])];
    const kinds = [['heading', '标题', targets.headings], ['bookmark', '书签', targets.bookmarks], ['footnote', '脚注', targets.footnotes], ['endnote', '尾注', targets.endnotes],
      ...captionKinds.map(k => [k, k.replace(/_/g, ' '), targets.captions.filter(c => c.kind === k)])];
    const type = select('引用类型', kinds.map(([id, name]) => [id, name]), kinds.find(k => k[2].length)?.[0] || 'heading', () => fill());
    const show = select('引用内容', []);
    const list = el('select.input.ed-xref-list', { 'aria-label': '引用哪一个', size: 8 });
    const hyperlink = check('插入为超链接', true);
    const aboveBelow = check('包含“见上方/下方”', false);
    const empty = el('p.field-hint', { hidden: true }, '当前文档中暂无此类项目。');
    const insert = el('button.btn.btn-primary', { type: 'submit' }, '插入');
    function fill() {
      const kind = kinds.find(k => k[0] === type.value);
      show.replaceChildren(...captions.referenceChoices(['heading', 'bookmark', 'footnote', 'endnote'].includes(type.value) ? type.value : 'caption').map(([v, l]) => el('option', { value: v }, l)));
      list.replaceChildren(...kind[2].map((item, i) => el('option', { value: String(i) }, item.label)));
      if (kind[2].length) list.value = '0';
      empty.hidden = !!kind[2].length; insertButton.disabled = !kind[2].length;
      aboveBelow.box.disabled = show.value === 'position';
    }
    show.addEventListener('change', () => { aboveBelow.box.disabled = show.value === 'position'; });
    let insertButton;
    const dialog = openDialog({ title: '交叉引用', className: 'ref-xref-dialog', submitLabel: '插入', body: [
      el('div.ref-two-column.ref-tight', {}, field('引用类型', type), field('引用内容', show)),
      el('div.row', {}, hyperlink, aboveBelow),
      field('引用哪一个', list), empty,
    ], onSubmit: async () => {
      const target = kinds.find(k => k[0] === type.value)[2][Number(list.value)];
      if (!target) throw new Error('请选择要引用的项目。');
      await runBody((body, c) => { c.insertCrossReference(body, target, { show: show.value, hyperlink: hyperlink.box.checked, aboveBelow: aboveBelow.box.checked }); return true; }, { track: true });
    } });
    insertButton = dialog.submit;
    list.addEventListener('dblclick', () => dialog.form.requestSubmit());
    fill(); type.focus();
  }

  /* ---- Ribbon ---- */
  const noSteal = (...buttons) => { for (const b of buttons) b.addEventListener('mousedown', e => e.preventDefault()); };
  function extendTab(tabId, kit) {
    if (tabId !== 'references') return [];
    const { command, menuButton, rows, when, focusEditor } = kit;
    const bodyReady = () => !!ready() && editor()?.session.path === null;
    // Research
    const smart = command('智能查找', 'smartLookup', () => lookup.open(), { size: 'large', text: '智能查找' });
    when(smart, () => { const group = smart.closest('.ribbon-group'); const available = lookup.available(); if (group) group.hidden = !available; return available && !!editor(); });
    // Citations & Bibliography
    const citation = menuButton('插入引文', 'citation', () => citations.citationItems(), { text: '插入引文' });
    const manage = command('管理源', 'manageSources', () => citations.manageSources(), { text: '管理源' });
    const style = citations.styleControl();
    const styleWrap = el('label.ribbon-spin.ref-style-wrap', { title: '引文样式' }, el('span.ribbon-spin-label', {}, '样式:'), style.control);
    const bibliography = menuButton('书目', 'bibliography', () => citations.bibliographyItems(focusEditor), { size: 'small', text: '书目' });
    // A citation or bibliography goes into the text: unavailable in a header, footer or note, as Cross-reference is.
    when(citation, bodyReady); when(manage, () => !!ready()); when(bibliography, bodyReady);
    when(style.control, () => { style.sync(); return !!ready(); });
    // Captions
    const caption = command('插入题注', 'caption', () => captionDialog(), { size: 'large', text: '插入题注' });
    const figures = command('插入图表目录', 'tableOfFigures', () => toc.figuresDialog(), { text: '插入图表目录' });
    const updateFigures = command('更新图表目录', 'updateTable', () => toc.updateDialog(true), { text: '更新表格' });
    const xref = command('交叉引用', 'crossReference', () => crossReferenceDialog(), { text: '交叉引用' });
    when(caption, bodyReady); when(figures, bodyReady); when(updateFigures, () => !!ready() && toc.hasFigures()); when(xref, bodyReady);
    // Index
    const markEntry = command('标记索引项', 'markEntry', () => indexes.markEntryPanel(), { size: 'large', text: '标记索引项', shortcut: MOD_KEY === 'Cmd' ? 'Cmd+Option+Shift+X' : 'Alt+Shift+X' });
    const insertIndex = command('插入索引', 'index', () => indexes.insertIndexDialog(), { text: '插入索引' });
    const updateIndex = command('更新索引', 'updateIndex', () => indexes.updateIndex(), { text: '更新索引' });
    when(markEntry, bodyReady); when(insertIndex, bodyReady); when(updateIndex, () => !!ready() && hasField('INDEX'));
    // Table of authorities
    const markCitation = command('标记引文', 'markCitation', () => indexes.markCitationPanel(), { size: 'large', text: '标记引文', shortcut: MOD_KEY === 'Cmd' ? 'Cmd+Option+Shift+I' : 'Alt+Shift+I' });
    const insertToa = command('插入引文目录', 'tableOfAuthorities', () => indexes.insertAuthoritiesDialog(), { text: '插入引文目录' });
    const updateToa = command('更新引文目录', 'updateAuthorities', () => indexes.updateAuthorities(), { text: '更新引文目录' });
    when(markCitation, bodyReady); when(insertToa, bodyReady); when(updateToa, () => !!ready() && hasField('TOA'));
    noSteal(smart, manage, caption, figures, updateFigures, xref, markEntry, insertIndex, updateIndex, markCitation, insertToa, updateToa);
    return [
      { id: 'research', label: '研究', icon: 'smartLookup', priority: 2, after: 'footnotes', items: [smart] },
      { id: 'citations', label: '引文与书目', icon: 'citation', priority: 4, after: 'research', items: [citation, rows([manage], [styleWrap], [bibliography])] },
      { id: 'captions', label: '题注', icon: 'caption', priority: 4, after: 'citations', items: [caption, rows([figures], [updateFigures], [xref])] },
      { id: 'index', label: '索引', icon: 'index', priority: 3, after: 'captions', items: [markEntry, rows([insertIndex], [updateIndex])] },
      { id: 'authorities', label: '引文目录', icon: 'tableOfAuthorities', priority: 1, after: 'index', items: [markCitation, rows([insertToa], [updateToa])] },
    ];
  }
  const hasField = type => (editor()?.session.body.paragraphs || []).some(p => p.fieldMarkers?.some(m => m.field.type === type));

  /* ---- Menu bar and context menu contributions ---- */
  function extendMenu(menuId) {
    const disabled = !ready(), body = editor()?.session.path === null;
    if (menuId === 'insert') return [
      { separator: true },
      { label: '书签…', icon: 'bookmark', disabled: disabled || !body, onSelect: () => base.openBookmarks?.() },
      { label: '交叉引用…', icon: 'crossReference', disabled: disabled || !body, onSelect: () => crossReferenceDialog() },
      { separator: true },
      { label: '脚注…', icon: 'footnote', disabled, onSelect: () => notes.notesDialog() },
      { label: '题注…', icon: 'caption', disabled: disabled || !body, onSelect: () => captionDialog() },
      { label: '索引和目录', icon: 'toc', disabled: disabled || !body, items: [
        { label: '索引…', icon: 'index', onSelect: () => indexes.insertIndexDialog() },
        { label: '目录…', icon: 'toc', onSelect: () => toc.customDialog() },
        { label: '图表目录…', icon: 'tableOfFigures', onSelect: () => toc.figuresDialog() },
        { label: '引文目录…', icon: 'tableOfAuthorities', onSelect: () => indexes.insertAuthoritiesDialog() },
      ] },
    ];
    if (menuId === 'view') return [{ label: '脚注', icon: 'showNotes', disabled: !editor(), onSelect: () => notes.showNotes() }];
    if (menuId === 'tools' && lookup.available()) return [{ label: '智能查找…', icon: 'smartLookup', disabled: !editor(), onSelect: () => lookup.open() }];
    return [];
  }
  let fieldsModule = null;
  import('../engine/body-fields.js').then(m => { fieldsModule = m; }).catch(() => {});
  /** Whether the caret is in a body field's result (or at an index or authority entry). */
  function fieldAtCaret() {
    const engine = editor();
    if (!engine || engine.session.path !== null || !engine.model.hasBodyFields || !fieldsModule) return false;
    const [start, end] = engine.model.range;
    try { return fieldsModule.bodyFieldRanges(engine.model.paragraphs).some(r => r.start <= start && end <= r.end && (r.start < r.end || r.start === start)); } catch { return false; }
  }
  function contextMenuItems(context) {
    const items = [];
    if (['text', 'field', 'link'].includes(context) && lookup.available() && editor()) items.push({ label: '智能查找', icon: 'smartLookup', onSelect: () => lookup.open() });
    if (context === 'field' || context === 'text') {
      items.push(...citations.contextItems());
      if (context === 'field' && ready()) items.push({ label: '更新域', icon: 'updateFields', shortcut: 'F9', onSelect: () => updateAllFields() });
    }
    return items;
  }

  const commands = {
    insertFootnote: () => notes.insertNote('footnote'),
    insertEndnote: () => notes.insertNote('endnote'),
    nextNoteItems: () => notes.nextNoteItems(),
    showNotes: () => notes.showNotes(),
    notesDialog: () => notes.notesDialog(),
    canInsertFootnote: () => !!ready() && editor()?.session.path === null,
    canEditHeader: () => !!ready(),
    editHeader,
    canInsertPageNumber: () => !!ready(),
    insertPageNumber(event, button) {
      const anchor = button || document.querySelector('#ribbon-panel-insert button[aria-label="Page Number"]') || document.activeElement;
      // A menu the mouse opened closes back into the document; one the keyboard opened returns to its button.
      openMenu({ anchor, label: 'Page Number', minWidth: 220, items: pageNumberItems(), pointer: !!event?.detail, onClose: event?.detail ? () => editor()?.focus() : null });
    },
    pageNumberItems,
    tocItems: focusEditor => toc.tocItems(focusEditor),
    addTextItems: () => toc.addTextItems(),
    updateTocDialog: () => toc.updateDialog(false),
    customToc: () => toc.customDialog(),
    updateAllFields,
    canUpdateFields: () => !!ready() && (hasToc() || !!base.canUpdateFields?.()),
    // Update Fields (Tools menu, the field's context menu, after inserting a field) does what F9 does:
    // sequences, references, dates, citations and page numbers, including the table of contents' pages.
    // It refreshed only page references before, so SEQ and REF results stayed stale.
    updateFields: () => updateAllFields(),
    smartLookup: () => lookup.open(),
    canSmartLookup: () => lookup.available(),
    extendMenu,
    contextMenuItems,
  };
  /* ---- Contextual Header & Footer tab, shown while a header or footer is active ---- */
  const activeStoryKind = () => { const engine = editor(); return engine?.session.path ? engine.pageStories?.stories[engine.session.path]?.kind : null; };
  function contextTabs(kit) {
    const { command, rows, when, menuButton, commandIconEl } = kit;
    const IN = 1440;
    const header = command('页眉', 'header', () => editHeader('header'), { size: 'large' });
    const footer = command('页脚', 'footer', () => editHeader('footer'), { size: 'large' });
    const pageNumber = menuButton('页码', 'pageNumber', pageNumberItems);
    const goHeader = command('转到页眉', 'goToHeader', () => editHeader('header'), { text: '转到页眉' });
    const goFooter = command('转到页脚', 'goToFooter', () => editHeader('footer'), { text: '转到页脚' });
    const close = command('关闭页眉和页脚', 'close', () => { const engine = editor(); if (engine) { engine.editStory(null); engine.focus(); onChange(); } }, { size: 'large', text: '关闭页眉和页脚' });
    close.classList.add('ribbon-wide'); // '关闭页眉和页脚' in two lines
    for (const b of [header, footer, goHeader, goFooter, close]) b.addEventListener('mousedown', e => e.preventDefault());
    when(goHeader, () => activeStoryKind() !== 'header'); when(goFooter, () => activeStoryKind() !== 'footer');
    // Header and footer distances belong to the section whose header or footer is edited (the body's last
    // section had them before, so in a document of several sections the change landed on another section).
    const sectionSettings = engine => { const body = engine?.session.body; return body?.sectionSettings?.[engine.sectionOfPage(currentPage(engine))] || body?.pageSettings; };
    const shown = key => String(Math.round((sectionSettings(editor())?.[key] ?? 720) / IN * 100) / 100);
    // Leaving the header for the body takes the keyboard from the field, whose own change event then fired a second
    // time, from the body: that one made the change, and its undo step did not return to the header.
    let settingDistance = false;
    function setDistance(key, value) {
      const engine = ready(); if (!engine || settingDistance) return;
      settingDistance = true;
      try { applyDistance(engine, key, value); } finally { settingDistance = false; }
    }
    function applyDistance(engine, key, value) {
      engine.finishComposition();
      const story = engine.session.path, page = currentPage(engine), section = engine.sectionOfPage(page), { anchor, focus } = engine.model.selection;
      // Sections are the body's: apply there, then return to the header or footer with the caret where it was.
      if (story !== null) engine.editStory(null);
      let failure = null;
      engine.execute(() => engine.model.setPageSettings({ [key]: value }, { scope: 'section', section }), e => { failure = e; }, story !== null ? { resume: { path: story, page } } : undefined, true);
      if (story !== null && engine.editStory(story, page) && engine.session.path === story) engine.model.select(anchor, focus);
      if (failure) fail(failure);
      onChange();
    }
    const distance = (key, label) => {
      const input = document.createElement('input');
      Object.assign(input, { type: 'number', step: 0.05, min: 0, max: 22, className: 'canvas-spacing ribbon-number' });
      input.setAttribute('aria-label', `${label} (英寸)`);
      input.addEventListener('change', () => {
        // The arrows step by 0.05, but any distance in range is accepted, as Page Setup accepts it.
        const v = input.validity;
        const engine = ready(); if (!engine || input.value === '' || v.badInput || v.rangeOverflow || v.rangeUnderflow) { input.reportValidity(); return; }
        try { setDistance(key, Math.round(Number(input.value) * IN)); } catch (e) { fail(e); }
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.dispatchEvent(new Event('change')); editor()?.focus(); } });
      when(input, () => !!ready());
      kit.states?.push?.({ control: input, enabled: () => !!ready(), value: () => Number(shown(key)) });
      const wrap = document.createElement('label'); wrap.className = 'ribbon-spin'; wrap.title = label;
      wrap.append(commandIconEl(key === 'header' ? 'spaceBefore' : 'spaceAfter', 16), Object.assign(document.createElement('span'), { className: 'ribbon-spin-label', textContent: label }), input, Object.assign(document.createElement('span'), { className: 'ribbon-spin-unit', textContent: '英寸' }));
      input.value = shown(key);
      return { wrap, input };
    };
    const top = distance('header', '页眉顶端距离'), bottom = distance('footer', '页脚底端距离');
    const spinGroup = Object.assign(document.createElement('div'), { className: 'ribbon-spin-group' });
    spinGroup.append(top.wrap, bottom.wrap);
    const definition = () => editor()?.pageStories;
    const firstPage = kit.check('首页不同', () => !!definition()?.sections[editor()?.sectionOfPage(currentPage(editor())) ?? 0]?.firstPageDifferent, on => setStoryOption('first', on));
    const oddEven = kit.check('奇偶页不同', () => !!definition()?.evenAndOdd, on => setStoryOption('evenOdd', on));
    const sync = () => { if (!editor()) return; for (const [d, key] of [[top, 'header'], [bottom, 'footer']]) if (document.activeElement !== d.input) d.input.value = shown(key); };
    when(close, () => { sync(); return true; });
    return [{ id: 'headerFooter', label: '页眉和页脚', contextual: 'headerFooter', selectOnAppear: true, groups: [
      { id: 'hfHeaderFooter', label: '页眉和页脚', icon: 'header', priority: 6, items: [header, footer, pageNumber] },
      { id: 'hfNavigation', label: '导航', icon: 'next', priority: 4, items: [rows([goHeader], [goFooter])] },
      { id: 'hfOptions', label: '选项', icon: 'header', priority: 7, items: [rows([firstPage], [oddEven])] },
      { id: 'hfPosition', label: '位置', icon: 'margins', priority: 5, items: [spinGroup] },
      { id: 'hfClose', label: '关闭', icon: 'close', priority: 9, items: [close] },
    ] }];
  }

  // Keyboard: Cmd+Option+F footnote and Cmd+Option+E endnote on a Mac (Ctrl+Alt+F and Ctrl+Alt+D
  // elsewhere), F9 updates fields, Cmd+Option+Shift+X / Alt+Shift+X marks an index entry and
  // Cmd+Option+Shift+I / Alt+Shift+I marks a citation for the table of authorities.
  const keyAbort = new AbortController();
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.isComposing || typesCharacter(e) || !e.target?.matches?.('.canvas-input')) return;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const chord = mac ? e.metaKey && e.altKey && !e.ctrlKey : e.ctrlKey && e.altKey && !e.metaKey;
    const mark = mac ? e.metaKey && e.altKey && e.shiftKey : e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey;
    const code = shortcutCode(e);
    if (chord && !e.shiftKey && code === 'KeyF') { e.preventDefault(); notes.insertNote('footnote'); }
    else if (chord && !e.shiftKey && code === (mac ? 'KeyE' : 'KeyD')) { e.preventDefault(); notes.insertNote('endnote'); }
    else if (mark && code === 'KeyX') { e.preventDefault(); indexes.markEntryPanel(); }
    else if (mark && code === 'KeyI') { e.preventDefault(); indexes.markCitationPanel(); }
    else if (e.key === 'F9' && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); updateAllFields(); }
  }, { signal: keyAbort.signal });
  return { commands, contextTabs, extendTab, extendMenu, contextMenuItems, fieldAtCaret, activeStoryKind, updateAllFields, lookupPane: lookup.pane, destroy: () => { keyAbort.abort(); lookup.close(); document.querySelectorAll('.ref-panel').forEach(p => p.closePanel?.()); } };
}
