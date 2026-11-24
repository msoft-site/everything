/**
 * The Layout tab's page setup: margins, orientation, size, columns, breaks, sections and the Page
 * Setup dialog. Every change goes through the editor's transactions, so undo, saving and read-only
 * rules apply. Line numbers and hyphenation come from their own modules (w.lineNumberItems,
 * w.hyphenationItems).
 */
import { el, MOD_KEY } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { openPageSetup, multiplePagesOf } from './page-setup.js';
import { openColumns, presetColumns, columnPreset, COLUMN_PRESETS } from './columns-dialog.js';
import { readingPageSize } from '../engine/page-settings.js';
import { recallUnit, onUnitChange } from '../lib/units.js';
import { defaultPageSettings, saveDefaultPageSettings, lastCustomMargins, saveCustomMargins, MARGIN_KEYS } from '../lib/page-defaults.js';

const IN = 1440;
/** Margin presets in inches: [id, label, top, bottom, left (inside), right (outside), mirrored]. */
export const MARGIN_PRESETS = [
  ['normal', '常规', 1, 1, 1, 1, false],
  ['narrow', '窄', 0.5, 0.5, 0.5, 0.5, false],
  ['moderate', '适中', 1, 1, 0.75, 0.75, false],
  ['wide', '宽', 1, 1, 2, 2, false],
  ['mirrored', '对称', 1, 1, 1.25, 1, true],
];
/** Paper sizes in twips, portrait: [label, description, width, height]. */
export const PAPER_PRESETS = [
  ['Letter', '8.5″ × 11″', 12240, 15840],
  ['Legal', '8.5″ × 14″', 12240, 20160],
  ['Executive', '7.25″ × 10.5″', 10440, 15120],
  ['Tabloid', '11″ × 17″', 15840, 24480],
  ['Statement', '5.5″ × 8.5″', 7920, 12240],
  ['A3', '29.7 cm × 42 cm', 16838, 23811],
  ['A4', '21 cm × 29.7 cm', 11906, 16838],
  ['A5', '14.8 cm × 21 cm', 8391, 11906],
  ['A6', '10.5 cm × 14.8 cm', 5953, 8391],
  ['B5 (JIS)', '18.2 cm × 25.7 cm', 10319, 14572],
  ['Envelope #10', '4.12″ × 9.5″', 5940, 13680],
  ['Envelope DL', '11 cm × 22 cm', 6237, 12474],
];
export const SECTION_BREAKS = [
  ['nextPage', '下一页', 'breakNextPage', '在下一页开始新节。'],
  ['continuous', '连续', 'breakContinuous', '在同一页开始新节。'],
  ['evenPage', '偶数页', 'breakEvenPage', '在下一个偶数页开始新节。'],
  ['oddPage', '奇数页', 'breakOddPage', '在下一个奇数页开始新节。'],
];
const BREAK_NAMES = { nextPage: '分节符 (下一页)', continuous: '分节符 (连续)', evenPage: '分节符 (偶数页)', oddPage: '分节符 (奇数页)' };

const near = (a, b) => Math.abs(a - b) < 15;
const describe = twips => {
  const unit = recallUnit();
  return `${Number((twips / (unit === 'cm' ? IN / 2.54 : IN)).toFixed(2))}${unit === 'cm' ? ' cm' : '″'}`;
};

export function createLayoutTab({ editor, pkg, error, onChange = () => {}, commands: base = {} }) {
  const ready = () => { const engine = editor(); return engine && !pkg()?.readOnly ? engine : null; };
  /** The body, where sections live; leaves a header or footer first. */
  const body = () => {
    const engine = ready(); if (!engine) return null;
    engine.finishComposition();
    if (engine.session.path !== null) engine.editStory(null);
    return engine;
  };
  const model = () => editor()?.session.body;
  const settings = () => model()?.sectionPageSettings;
  const inTable = () => !!editor()?.model.selectedParagraphs.some(p => p.cellId);
  const inStory = () => editor()?.session.path !== null;
  /** Apply page settings; failures are reported, not thrown. Returns whether the document changed. */
  function setPage(patch, options) {
    const engine = body(); if (!engine) return false;
    let failure = null;
    const ok = engine.execute(() => engine.model.setPageSettings(patch, options), e => { failure = e; }, undefined, true);
    if (!ok && failure) error(failure);
    engine.focus();
    return ok;
  }
  /** Where a dialog's settings can apply, given the sections and the selection. */
  function scopes() {
    const doc = model(); if (!doc) return [['document', '整篇文档']];
    const [start, end] = doc.range, list = [['document', '整篇文档']];
    if (doc.sectionCount > 1) list.push(['section', '本节']);
    if (start !== end && !doc.selectedParagraphs.some(p => p.cellId)) list.push(['selection', '所选文字']);
    else list.push(['forward', '插入点之后']);
    return list;
  }
  const defaultScope = () => (model()?.sectionCount > 1 ? 'section' : 'document');
  const writingWidth = s => readingPageSize(s)[0] - s.left - s.right - (s.gutterAtTop ? 0 : s.gutter);

  const commands = {
    /** The Page Setup group shows Line Numbers and Hyphenation, so their modules add no groups of their own. */
    pageSetupHasHyphenation: true,
    /** Section-aware page settings for other modules (line numbers): 'section' | 'document' | 'forward'. */
    applySectionSettings(patch, { scope } = {}) { return setPage(patch, { scope }); },
    /** The Page Setup dialog for the caret's section. */
    openPageSetup(tab = 'page') {
      const engine = body(); if (!engine) return;
      const doc = engine.model, section = doc.sectionIndexAt(doc.range[0]), current = doc.sectionPageSettings;
      const definition = engine.pageStories;
      const stories = { firstPageDifferent: !!definition?.sections?.[section]?.firstPageDifferent, evenAndOdd: !!definition?.evenAndOdd };
      // Apply is one undo step, the page settings with the header and footer options.
      return openPageSetup(current, (patch, { scope, stories: storyPatch }) => engine.transact(() => {
        let failure = null;
        if (Object.keys(patch).length) {
          const ok = engine.execute(() => engine.model.setPageSettings(patch, { scope, section, breakType: 'nextPage' }), e => { failure = e; }, undefined, true);
          if (!ok) { if (failure) throw failure; return false; }
          if (MARGIN_KEYS.some(key => key in patch)) {
            const next = engine.model.sectionPageSettings;
            if (!MARGIN_PRESETS.some(preset => marginMatch(next, preset))) saveCustomMargins(next);
          }
        }
        if (storyPatch) setStories(engine, section, storyPatch);
        queueMicrotask(() => engine.focus());
        return true;
      }), { tab, scopes: scopes(), scope: defaultScope(), firstSection: section === 0, stories,
        lineNumbers: base.lineNumberOptions || commands.lineNumberOptions ? () => (commands.lineNumberOptions || base.lineNumberOptions)() : null,
        borders: base.bordersAndShading || commands.bordersAndShading ? () => (commands.bordersAndShading || base.bordersAndShading)('page') : null,
        setDefault: value => { if (saveDefaultPageSettings(value)) toast('新文档将使用此页面设置', { icon: 'check' }); else error(new Error('无法在此浏览器中保存页面默认设置。')); } });
    },
    /** The Columns dialog. */
    columnsDialog() {
      const engine = body(); if (!engine) return;
      const doc = engine.model, current = doc.sectionPageSettings;
      const [start, end] = doc.range;
      return openColumns({ columns: current.columns, available: writingWidth(current), scopes: scopes(), scope: start !== end && !inTable() ? 'selection' : defaultScope(),
        onClose: () => queueMicrotask(() => editor()?.focus()),
        apply: (columns, scope) => setPage({ columns }, { scope, breakType: 'continuous' }) || JSON.stringify(engine.model.sectionPageSettings.columns) === JSON.stringify(columns) });
    },
    /** A line break that continues below floating pictures beside the line (Shift+Enter is a plain line break). */
    insertTextWrappingBreak() {
      const engine = ready(); if (!engine) return;
      engine.finishComposition(); engine.execute(() => engine.model.insertTextWrappingBreak('all')); engine.focus();
    },
    insertSectionBreak(type) {
      const engine = body(); if (!engine) return;
      if (inTable()) { error(new Error('表格中无法插入分节符。')); return; }
      engine.insertSectionBreak(type);
    },
    sectionBreakItems() {
      const disabled = !ready() || inTable() || inStory();
      return [{ header: '分节符' }, ...SECTION_BREAKS.map(([type, label, icon, hint]) => ({ label, picture: icon, hint, disabled, onSelect: () => commands.insertSectionBreak(type) }))];
    },
    marginItems() {
      const s = settings(), custom = lastCustomMargins();
      const customItem = custom && !MARGIN_PRESETS.some(preset => marginMatch(custom, preset)) ? [{
        label: '上次自定义设置', picture: 'marginsCustom', radio: true, checked: !!s && MARGIN_KEYS.every(key => key === 'gutter' ? true : near(Number(s[key]), Number(custom[key])) || s[key] === custom[key]),
        hint: `上 ${describe(custom.top)} · 下 ${describe(custom.bottom)} · ${custom.mirrorMargins ? '内侧' : '左侧'} ${describe(custom.left)} · ${custom.mirrorMargins ? '外侧' : '右侧'} ${describe(custom.right)}`,
        onSelect: () => setPage({ ...custom, mirrorMargins: !!custom.mirrorMargins }) }] : [];
      return [...customItem, ...MARGIN_PRESETS.map(preset => {
        const [id, label, top, bottom, left, right, mirrored] = preset;
        return { label, picture: `margins${id[0].toUpperCase()}${id.slice(1)}`, radio: true, checked: !!s && marginMatch(s, preset),
          hint: `上 ${describe(top * IN)} · 下 ${describe(bottom * IN)} · ${mirrored ? '内侧' : '左侧'} ${describe(left * IN)} · ${mirrored ? '外侧' : '右侧'} ${describe(right * IN)}`,
          onSelect: () => setPage({ top: top * IN, bottom: bottom * IN, left: Math.round(left * IN), right: Math.round(right * IN), mirrorMargins: mirrored }) };
      }), { separator: true }, { label: '自定义页边距…', icon: 'pageSetup', disabled: !ready(), onSelect: () => commands.openPageSetup('page') }];
    },
    orientationItems() {
      const s = settings();
      return [['纵向', 'portrait'], ['横向', 'landscape']].map(([label, value]) => ({
        label, picture: value, radio: true, checked: s?.orientation === value,
        onSelect: () => {
          const current = settings(); if (!current || current.orientation === value) return;
          // Turning the page swaps its sides and rotates the margins with it.
          setPage({ orientation: value, width: current.height, height: current.width,
            ...(value === 'landscape' ? { top: current.left, bottom: current.right, left: current.bottom, right: current.top }
              : { top: current.right, bottom: current.left, left: current.top, right: current.bottom }) });
        },
      }));
    },
    sizeItems() {
      const s = settings();
      return [...PAPER_PRESETS.map(([label, hint, width, height]) => {
        const [w, h] = s?.orientation === 'landscape' ? [height, width] : [width, height];
        return { label, hint, radio: true, checked: !!s && near(s.width, w) && near(s.height, h), onSelect: () => setPage({ width: w, height: h }) };
      }), { separator: true }, { label: '其他纸张大小…', icon: 'pageSetup', disabled: !ready(), onSelect: () => commands.openPageSetup('page') }];
    },
    columnItems() {
      const s = settings(), doc = model();
      const preset = s ? columnPreset(s.columns) : null;
      const selected = !!doc && doc.range[0] !== doc.range[1] && !inTable();
      return [...COLUMN_PRESETS.map(([id, label, icon]) => ({
        label, picture: icon, radio: true, checked: preset === id, disabled: !ready(),
        // With text selected, the columns go to that text alone, between two continuous section breaks.
        onSelect: () => { const current = settings(); setPage({ columns: presetColumns(id, writingWidth(current), current.columns?.space || 720) }, selected ? { scope: 'selection', breakType: 'continuous' } : undefined); },
      })), { separator: true },
      { label: '偏栏分界线', checked: !!s?.columns?.separator, disabled: !ready() || (s?.columns?.count || 1) < 2, onSelect: () => setPage({ columns: { ...settings().columns, separator: !settings().columns.separator } }) },
      { label: '更多分栏…', icon: 'columnsDialog', disabled: !ready(), onSelect: () => commands.columnsDialog() }];
    },
    breakItems() {
      const engine = ready(), disabled = !engine;
      return [{ header: '分页符' },
        { label: '分页符', picture: 'breakPage', shortcut: `${MOD_KEY}+Enter`, hint: '在下一页继续。', disabled: disabled || inTable(), onSelect: () => { const e = ready(); if (e) { e.finishComposition(); e.insertPageBreak(); } } },
        { label: '分栏符', picture: 'breakColumn', shortcut: `${MOD_KEY}+Shift+Enter`, hint: '在下一栏继续。', disabled: disabled || !base.insertColumnBreak, onSelect: () => base.insertColumnBreak?.() },
        { label: '文字环绕符', picture: 'breakTextWrapping', hint: '在同一段落内换行，并排在旁边的图片下方。', disabled, onSelect: () => commands.insertTextWrappingBreak() },
        ...commands.sectionBreakItems()];
    },
    /** Indents in the measurement unit the View tab chooses. */
    setIndent(key, value, unit = 'in') {
      const engine = ready(); if (!engine) return;
      engine.finishComposition();
      const twips = Math.round(value * (unit === 'cm' ? IN / 2.54 : IN));
      if (engine.setParagraphGeometry({ [key]: twips }) === false) error(new Error('该缩进超出页面范围。'));
      engine.focus();
    },
    indentValue(key, unit = 'in') {
      const value = editor()?.model.paragraphFormatting?.[key];
      return value === null || value === undefined ? null : Math.round(value / (unit === 'cm' ? IN / 2.54 : IN) * 100) / 100;
    },
  };

  function marginMatch(s, [, , top, bottom, left, right, mirrored]) {
    return near(s.top, top * IN) && near(s.bottom, bottom * IN) && near(s.left, left * IN) && near(s.right, right * IN) && !!s.mirrorMargins === mirrored;
  }
  function setStories(engine, section, patch) {
    try {
      engine.changeSettings(() => {
        if ('firstPageDifferent' in patch) { pkg().setTitlePage(section, patch.firstPageDifferent); engine.setStoryOptions({ section, firstPageDifferent: patch.firstPageDifferent }); }
        if ('evenAndOdd' in patch) { pkg().setEvenAndOdd(patch.evenAndOdd); engine.setStoryOptions({ evenAndOdd: patch.evenAndOdd }); }
      });
      onChange();
    } catch (e) { error(e); }
  }

  /** The Page Setup group, in place of the chrome's simpler one. */
  function extendTab(tabId, kit) {
    if (tabId !== 'layout') return [];
    const { command, menuButton, rows, when } = kit;
    const enabled = () => !!ready();
    const margins = menuButton('页边距', 'margins', () => commands.marginItems());
    const orientation = menuButton('纸张方向', 'orientation', () => commands.orientationItems());
    const size = menuButton('纸张大小', 'size', () => commands.sizeItems());
    const columns = menuButton('分栏', 'columns', () => commands.columnItems());
    const breaks = menuButton('分隔符', 'breaks', () => commands.breakItems(), { size: 'small', text: '分隔符' });
    const unavailable = label => [{ label, disabled: true }];
    const lineNumbers = menuButton('行号', 'lineNumbers', () => base.lineNumberItems?.() || unavailable('行号不可用'), { size: 'small', text: '行号' });
    const hyphenation = menuButton('连字符', 'hyphenation', () => base.hyphenationItems?.() || unavailable('连字符不可用'), { size: 'small', text: '连字符' });
    const launcher = command('页面设置', 'pageSetup', () => commands.openPageSetup());
    launcher.addEventListener('mousedown', e => e.preventDefault());
    for (const control of [margins, orientation, size, columns, breaks, launcher]) when(control, enabled);
    when(lineNumbers, () => enabled() && !!base.lineNumberItems);
    when(hyphenation, () => enabled() && !!base.hyphenationItems);
    return [{ id: 'pageSetup', replaces: 'pageSetup', label: '页面设置', icon: 'margins', priority: 9,
      items: [margins, orientation, size, columns, rows([breaks], [lineNumbers], [hyphenation]), el('div.ribbon-launcher', {}, launcher)] }];
  }

  function extendMenu(menuId) {
    if (menuId === 'insert') return [{ label: '分隔符', icon: 'breaks', items: [
      { label: '分页符', icon: 'breakPage', shortcut: `${MOD_KEY}+Enter`, disabled: !ready() || inTable(), onSelect: () => { const e = ready(); if (e) { e.finishComposition(); e.insertPageBreak(); } } },
      { label: '分栏符', icon: 'breakColumn', shortcut: `${MOD_KEY}+Shift+Enter`, disabled: !ready() || !base.insertColumnBreak, onSelect: () => base.insertColumnBreak?.() },
      { separator: true },
      ...SECTION_BREAKS.map(([type, , icon]) => ({ label: BREAK_NAMES[type], icon, disabled: !ready() || inTable() || inStory(), onSelect: () => commands.insertSectionBreak(type) }))] }];
    if (menuId === 'format') return [
      { label: '文档…', icon: 'pageSetup', disabled: !ready(), onSelect: () => commands.openPageSetup('page') },
      { label: '分栏…', icon: 'columnsDialog', disabled: !ready(), onSelect: () => commands.columnsDialog() }];
    if (menuId === 'file') return [{ label: '页面设置…', icon: 'pageSetup', disabled: !ready(), onSelect: () => commands.openPageSetup('page') }];
    return [];
  }
  function contextMenuItems() { return []; }
  // A new measurement unit relabels the indent boxes at once.
  const unsubscribe = onUnitChange(() => onChange());
  return { commands, extendTab, extendMenu, contextMenuItems, destroy() { unsubscribe?.(); } };
}

export { defaultPageSettings, multiplePagesOf };
