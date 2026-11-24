/**
 * Review tools beyond comments and changes: the Editor pane, Thesaurus, Word Count, Check
 * Accessibility, Language and Translate, Compare and Combine, Restrict Editing and Lock Tracking.
 * Each contributes ribbon groups (extendTab), classic menu items (extendMenu) and document context
 * menu items (contextMenuItems) through the editor's command object.
 */
import { isComposing, MOD_KEY, shortcutCode } from '../ui/dom.js';
import { selectionLanguage, languageProperty } from '../engine/font-families.js';
import { toast } from '../ui/toast.js';
import { openMenu } from '../ui/menu.js';
import { revisionView } from '../engine/revisions.js';
import { createEditorPane } from './editor-pane.js';
import { createThesaurusPane } from './thesaurus-pane.js';
import { openWordCount } from './word-count.js';
import { createAccessibilityPane } from './accessibility-pane.js';
import { openLanguageDialog, createTranslatePane, TRANSLATION_LANGUAGE, DETECT_LANGUAGE } from './language-tools.js';
import { createCommentsPane } from './comments-pane.js';
import { createRestrictEditing } from './restrict-editing.js';
import { openCompareDialog } from './compare-dialog.js';
import { openTrackingOptions, restoreTrackingOptions, rememberTrackingOptions, showMarkupItems } from './tracking-options.js';
import { languageName, LANGUAGES } from './review-ui.js';

export function createReviewTools({ editor, pkg, error, author, review, proofing, commands: w, documentName, openDocument, currentBytes, onChange = () => {} }) {
  const ready = () => { const engine = editor(); return engine && !pkg()?.readOnly ? engine : null; };
  const editorPane = createEditorPane({ editor, pkg, proofing, error, onState: onChange });
  const thesaurus = createThesaurusPane({ editor, pkg, error });
  const accessibility = createAccessibilityPane({ editor, pkg, error, onState: onChange });
  const translator = createTranslatePane({ editor, pkg, error, openDocument, documentName });
  const people = () => {
    const engine = editor(); if (!engine) return [];
    const body = engine.session.body;
    return [...new Set([author(), ...(body.comments || []).map(c => c.author), ...body.revisions.map(r => r.author)].filter(Boolean))];
  };
  const commentsPane = createCommentsPane({ editor, review, people });
  const restrict = createRestrictEditing({ editor, pkg, error, author, onChange });
  restoreTrackingOptions();

  const markDirty = () => { const engine = editor(); engine?.onChange?.(); onChange(); };
  const setSettings = patch => { const p = pkg(); if (!p || p.readOnly) return; p.reviewSettings = { ...p.reviewSettings, ...patch }; markDirty(); };
  const docRevisionView = () => pkg()?.reviewSettings?.revisionView || {};

  /* ---- Language ---- */
  function languageDialog() {
    const engine = ready(); if (!engine) return;
    engine.finishComposition();
    const format = engine.model.runFormatting || {};
    openLanguageDialog({ language: selectionLanguage(engine.model) || pkg()?.reviewSettings?.defaultLanguage || 'zh-CN', noProof: !!format.noProof, defaultLanguage: pkg()?.reviewSettings?.defaultLanguage,
      // Each language is written to the attribute for its kind of text (§17.3.2.20): Japanese to w:eastAsia, Arabic to w:bidi.
      apply: ({ language, noProof }) => { engine.setRunFormat({ [languageProperty(language)]: language, noProof }); proofing.recheck?.(); },
      setDefault: language => { setSettings({ defaultLanguage: language }); },
      onClose: () => queueMicrotask(() => editor()?.focus()) });
  }

  /* ---- Tracking display ---- */
  function updateOptions(patch) {
    Object.assign(revisionView.options, patch);
    rememberTrackingOptions();
    // What markup the document shows is also a document setting (§17.15.1 revisionView).
    const view = { ...docRevisionView(), ...(('showInsDel' in patch) ? { insDel: patch.showInsDel } : {}), ...(('showFormatting' in patch) ? { formatting: patch.showFormatting } : {}) };
    if (('showInsDel' in patch || 'showFormatting' in patch) && !pkg()?.readOnly) setSettings({ revisionView: view });
    editor()?.relayout(); review.refresh(true); onChange();
  }
  const markupMenu = () => showMarkupItems({ authors: () => people().filter(name => editor()?.session.body.revisions.some(r => r.author === name) || (editor()?.session.body.comments || []).some(c => c.author === name)),
    ink: w.toggleInk ? { shown: !w.inkHidden?.(), toggle: () => w.toggleInk() } : null,
    comments: { shown: review.commands.shown, toggle: () => review.commands.toggleShown() }, update: updateOptions });
  function trackingOptions() {
    const engine = editor(); if (!engine) return;
    const settings = pkg()?.reviewSettings || {};
    // While tracking is locked, formatting changes are tracked: the setting is shown on and cannot be changed.
    const locked = restrict.trackingLocked;
    openTrackingOptions({ authors: () => people(), doc: { trackMoves: !settings.doNotTrackMoves, trackFormatting: locked || !settings.doNotTrackFormatting, formattingLocked: locked },
      apply: (options, doc) => {
        Object.assign(revisionView.options, options);
        rememberTrackingOptions();
        const trackFormatting = locked ? !settings.doNotTrackFormatting : doc.trackFormatting;
        if (!pkg()?.readOnly && (doc.trackMoves !== !settings.doNotTrackMoves || trackFormatting !== !settings.doNotTrackFormatting)) setSettings({ doNotTrackMoves: !doc.trackMoves, doNotTrackFormatting: !trackFormatting });
        applyTrackingSettings(); review.commands.setPaneOrientation(options.paneOrientation); editor()?.relayout(); review.refresh(true); onChange();
      }, onClose: () => queueMicrotask(() => editor()?.focus()) });
  }
  function applyTrackingSettings() {
    const engine = editor(); if (!engine) return;
    const settings = pkg()?.reviewSettings || {};
    engine.session.body.trackMoves = !settings.doNotTrackMoves;
    engine.session.body.trackFormatting = restrict.trackingLocked || !settings.doNotTrackFormatting;
    revisionView.options.trackMoves = !settings.doNotTrackMoves;
  }
  async function lockTracking() {
    if (restrict.trackingLocked) { await restrict.stopEnforcing({ title: '解除修订锁定' }); return; }
    if (restrict.enforced) { error(new Error('锁定修订前请先解除文档保护。')); return; }
    const wasTracking = review.commands.tracking;
    review.commands.toggleTracking(true);
    const locked = await restrict.startEnforcing({ edit: 'trackedChanges', formatting: false, title: '锁定修订', intro: '其他人将无法关闭修订，也无法接受或拒绝修订。输入密码以防止其解除锁定，或将其留空。' });
    // Cancelled: Track Changes goes back to how it was, as nothing was locked.
    if (!locked && !wasTracking) review.commands.toggleTracking(false);
  }

  /* ---- Commands ---- */
  const commands = {
    spelling: () => editorPane.open(),
    editorPane: () => editorPane.open(),
    spellingItems: () => [
      { label: '编辑器', icon: 'spelling', onSelect: () => editorPane.open() },
      { label: '逐一检查拼写', icon: 'spell', shortcut: 'F7', onSelect: () => proofing.openPane() },
      { label: '键入时检查拼写', checked: proofing.enabled, onSelect: () => proofing.setEnabled(!proofing.enabled) },
      { separator: true },
      { label: '在此文档中隐藏拼写错误', checked: !!pkg()?.hideSpellingErrors, disabled: !!pkg()?.readOnly, onSelect: () => commands.toggleHideSpelling() },
      { label: '在此文档中隐藏语法错误', checked: !!pkg()?.reviewSettings?.hideGrammaticalErrors, disabled: !!pkg()?.readOnly, onSelect: () => commands.toggleHideGrammar() },
      { separator: true },
      { label: '重新检查文档', disabled: !proofing.enabled, onSelect: () => proofing.recheck() },
      { label: '重置忽略的单词', onSelect: () => commands.resetIgnoredWords() },
    ],
    toggleHideSpelling() { const p = pkg(); if (!p || p.readOnly) return; p.hideSpellingErrors = !p.hideSpellingErrors; editor()?.paint(); markDirty(); },
    toggleHideGrammar() { setSettings({ hideGrammaticalErrors: !pkg()?.reviewSettings?.hideGrammaticalErrors }); editor()?.paint(); editorPane.refresh(); },
    resetIgnoredWords() { proofing.resetIgnored(); toast('将再次检查已忽略的单词'); editorPane.refresh(); },
    thesaurus: () => { if (editor()) thesaurus.open(); },
    wordCount: () => { const engine = editor(); if (engine) openWordCount(engine, { onClose: () => queueMicrotask(() => editor()?.focus()), onChange }); },
    checkAccessibility: () => accessibility.open(),
    accessibilitySummary: () => accessibility.summary(),
    language: languageDialog,
    languageItems: () => [
      { label: '设置校对语言…', onSelect: languageDialog, disabled: !ready() },
      { label: '自动检测语言', checked: DETECT_LANGUAGE.get(), onSelect: () => { DETECT_LANGUAGE.set(!DETECT_LANGUAGE.get()); proofing.recheck(); } },
      { separator: true },
      { label: '设置默认校对语言', disabled: !ready(), items: LANGUAGES.map(tag => ({ label: languageName(tag), radio: true, checked: (pkg()?.reviewSettings?.defaultLanguage || 'zh-CN') === tag, onSelect: () => setSettings({ defaultLanguage: tag }) })) },
    ],
    /** For the status bar: the proofing language at the caret. */
    proofingLanguage() { const engine = editor(); const tag = engine?.model.runFormatting?.fontLanguage || pkg()?.reviewSettings?.defaultLanguage || 'zh-CN'; return { tag, name: languageName(tag), open: languageDialog }; },
    translateSelection: () => translator.open(),
    translateDocument: () => translator.open(),
    translateItems: () => [
      { label: '翻译所选文字', onSelect: () => translator.open() },
      { label: '翻译文档', onSelect: () => translator.open() },
      { separator: true },
      { label: '设置文档翻译语言', items: LANGUAGES.map(tag => ({ label: languageName(tag), radio: true, checked: TRANSLATION_LANGUAGE.get() === tag, onSelect: () => TRANSLATION_LANGUAGE.set(tag) })) },
    ],
    compareDocuments: () => openCompareDialog({ mode: 'compare', editor, pkg, documentName, author, openDocument, currentBytes, error }),
    combineDocuments: () => openCompareDialog({ mode: 'combine', editor, pkg, documentName, author, openDocument, currentBytes, error }),
    restrictEditing: () => restrict.open(),
    protectionEnforced: () => restrict.enforced,
    trackingLocked: () => restrict.trackingLocked,
    lockTracking,
    trackingOptions,
    showMarkupItems: markupMenu,
    commentsPane: () => commentsPane.open(),
    alwaysOpenReadOnly: () => restrict.toggleAlwaysReadOnly(),
  };

  /* ---- Ribbon ---- */
  function extendTab(tabId, kit) {
    if (tabId !== 'review') return [];
    const { command, menuButton, split, rows, when } = kit;
    const quiet = (...buttons) => { for (const b of buttons) b.addEventListener('mousedown', e => e.preventDefault()); return buttons[0]; };
    const accessibilityButton = quiet(command('检查辅助功能', 'accessibility', () => accessibility.open(), { size: 'large', text: '检查辅助功能' }));
    when(accessibilityButton, () => !!editor());
    const translate = menuButton('翻译', 'translate', commands.translateItems, { size: 'large', text: '翻译' });
    const language = menuButton('语言', 'language', commands.languageItems, { size: 'large', text: '语言' });
    when(translate, () => !!editor()); when(language, () => !!editor());
    const compare = menuButton('比较', 'compare', () => [
      { label: '比较…', icon: 'compare', onSelect: commands.compareDocuments },
      { label: '合并…', icon: 'combine', onSelect: commands.combineDocuments },
    ], { size: 'large', text: '比较' });
    when(compare, () => !!editor());
    const protect = quiet(command('限制编辑', 'protect', () => restrict.open(), { size: 'large', text: '限制编辑' }));
    when(protect, () => !!editor() && !pkg()?.readOnly, () => String(restrict.enforced));
    // One-command groups fold to a button as wide as the command, so they never fold; groups that
    // gain room by folding (Language, and the comment and change groups) fold instead.
    const groups = [
      { id: 'accessibility', label: '辅助功能', icon: 'accessibility', priority: 3, after: 'speech', items: [accessibilityButton] },
      { id: 'language', label: '语言', icon: 'language', priority: 2.5, after: 'speech', items: [translate, language] },
      { id: 'compare', label: '比较', icon: 'compare', priority: 3.5, after: 'changes', items: [compare] },
      { id: 'protect', label: '保护', icon: 'protect', priority: 3, after: 'changes', items: [protect] },
    ];
    if (w.toggleInk) {
      const ink = quiet(command('隐藏墨迹', 'hideInk', () => w.toggleInk(), { size: 'large', text: '隐藏墨迹' }));
      when(ink, () => !!editor(), () => String(!!w.inkHidden?.()));
      groups.push({ id: 'ink', label: '墨迹', icon: 'hideInk', priority: 1, after: 'changes', items: [ink] });
    }
    void split; void rows;
    return groups;
  }

  /* ---- Menu bar ---- */
  function extendMenu(menuId) {
    const has = !!editor();
    if (menuId === 'tools') return [
      { label: '拼写和语法', icon: 'spelling', items: commands.spellingItems() },
      { label: '同义词库…', icon: 'thesaurus', shortcut: 'Shift+F7', disabled: !has, onSelect: commands.thesaurus },
      { label: '翻译', icon: 'translate', disabled: !has, items: commands.translateItems() },
      { label: '语言…', icon: 'language', disabled: !ready(), onSelect: languageDialog },
      { separator: true },
      // On a Mac Cmd+Shift+G is Find Previous (editor.js), so Word Count has its chord only elsewhere.
      { label: '字数统计…', icon: 'wordCount', shortcut: MOD_KEY === 'Cmd' ? null : 'Ctrl+Shift+G', disabled: !has, onSelect: commands.wordCount },
      { separator: true },
      { label: '检查辅助功能', icon: 'accessibility', disabled: !has, onSelect: commands.checkAccessibility },
      { separator: true },
      { label: '修订', icon: 'trackChanges', disabled: !has, items: [
        { label: '修订', checked: review.commands.tracking, disabled: !review.commands.canTrack() || restrict.trackingLocked, onSelect: () => review.commands.toggleTracking() },
        { label: restrict.trackingLocked ? '解除修订锁定…' : '锁定修订…', disabled: !ready(), onSelect: lockTracking },
        { label: '修订选项…', onSelect: trackingOptions },
        { separator: true },
        { label: '比较文档…', icon: 'compare', onSelect: commands.compareDocuments },
      ] },
      { label: '合并文档…', icon: 'combine', disabled: !has, onSelect: commands.combineDocuments },
      { separator: true },
      { label: '保护文档…', icon: 'protect', disabled: !has || !!pkg()?.readOnly, onSelect: commands.restrictEditing },
    ];
    if (menuId === 'file') return fileItems();
    if (menuId === 'view') return [
      { separator: true },
      { label: '标记', icon: 'markup', disabled: !has, items: [
        ...['all', 'simple', 'none', 'original'].map(mode => ({ label: { all: '所有标记', simple: '简单标记', none: '无标记', original: '原始状态' }[mode], radio: true, checked: revisionView.mode === mode, onSelect: () => review.commands.setMarkupView(mode) })),
        { separator: true }, ...markupMenu()] },
      { label: '审阅窗格', icon: 'reviewingPane', checked: !!review.commands.paneShown, disabled: !has, onSelect: () => review.commands.toggleReviewingPane() },
      { label: '批注窗格', icon: 'showComments', disabled: !has, onSelect: () => commentsPane.open() },
    ];
    if (menuId === 'insert') return [{ label: '批注', icon: 'newComment', shortcut: MOD_KEY === 'Cmd' ? 'Cmd+Option+A' : 'Ctrl+Alt+M', disabled: !review.commands.canComment(), onSelect: () => review.commands.newComment() }];
    return [];
  }

  /* ---- Document context menu ---- */
  function contextMenuItems(context) {
    if (context === 'field') return review.contextItems();
    if (context !== 'text' && context !== 'table' && context !== 'list' && context !== 'link') return [];
    const engine = editor(); if (!engine) return [];
    const items = [];
    if (engine.session.path === null || context === 'text') {
      items.push({ label: '同义词', icon: 'thesaurus', disabled: !ready(), submenu: async (anchor, { focusFirst } = {}) => {
        const found = await thesaurus.synonymsAt(8);
        const list = found?.synonyms || [];
        openMenu({ anchor, label: '同义词', focusFirst, items: [
          ...(list.length ? list.map(s => ({ label: s.text, onSelect: () => thesaurus.insert(s.word) })) : [{ note: found ? '未找到同义词。' : '请先选择一个词。' }]),
          { separator: true }, { label: '同义词库…', onSelect: commands.thesaurus }] });
      } });
      items.push({ label: '翻译', icon: 'translate', disabled: engine.model.range[0] === engine.model.range[1], onSelect: () => translator.open() });
    }
    return [...items, ...review.contextItems()];
  }

  /* ---- Keys ---- */
  const keyAbort = new AbortController();
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented || isComposing(e) || !e.target?.matches?.('.canvas-input')) return;
    const mac = MOD_KEY === 'Cmd';
    if (e.key === 'F7' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey || mac && e.metaKey && e.altKey && !e.shiftKey && shortcutCode(e) === 'KeyR') { e.preventDefault(); commands.thesaurus(); }
    else if (!mac && e.ctrlKey && e.shiftKey && !e.altKey && shortcutCode(e) === 'KeyG') { e.preventDefault(); commands.wordCount(); }
  }, { signal: keyAbort.signal });

  /** Items for the File menu: the read-only recommendation and protection. */
  const fileItems = () => [
    { separator: true },
    { label: '始终以只读方式打开', icon: 'readOnly', checked: restrict.alwaysReadOnly, disabled: !editor() || !!pkg()?.readOnly, onSelect: commands.alwaysOpenReadOnly },
    { label: '保护文档…', icon: 'protect', disabled: !editor() || !!pkg()?.readOnly, onSelect: commands.restrictEditing },
  ];

  return {
    commands, extendTab, extendMenu, contextMenuItems, people, fileItems,
    panes: [editorPane.pane.node, thesaurus.pane.node, accessibility.pane.node, translator.pane.node, commentsPane.pane.node, restrict.pane.node],
    /** Tints the comment layer adds to its own: editable regions under protection. */
    tints: () => restrict.tints(),
    attach(engine) {
      if (!engine.overlays.includes(editorPane.overlay)) engine.overlays.push(editorPane.overlay);
      applyTrackingSettings();
      const view = docRevisionView();
      // The document's own choices, shown or not: those of the document opened before it would otherwise stay.
      Object.assign(revisionView.options, { showInsDel: view.insDel !== false, showFormatting: view.formatting !== false });
      restrict.applyGuard();
      // A protected document opens with its permissions in view, as desktop word processors show them.
      const protection = pkg()?.reviewSettings?.protection;
      if (protection?.enforcement && protection.edit !== 'trackedChanges' && !pkg()?.readOnly) queueMicrotask(() => restrict.open({ focus: false }));
      queueMicrotask(() => restrict.offerReadOnly());
    },
    refresh() { commentsPane.refresh(); restrict.refresh(); },
    changed() { accessibility.changed(); editorPane.changed(); editorPane.refresh(); },
    selectionChanged() { editorPane.selectionChanged(); translator.selectionChanged(); },
    get trackingLocked() { return restrict.trackingLocked; },
    get protectionEnforced() { return restrict.enforced; },
    /** The protection in force, or null. */
    get protection() { return restrict.enforced ? restrict.protection : null; },
    destroy() { keyAbort.abort(); for (const part of [editorPane, thesaurus, accessibility, translator, commentsPane, restrict]) part.destroy(); },
  };
}

