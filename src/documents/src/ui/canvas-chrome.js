import { el, isComposing, MOD_KEY, shortcutCode, styleColor, amountInRange, keepDocumentFocus } from './dom.js';
import { iconEl } from './icons.js';
import { openMenu, closeMenu } from './menu.js';
import { openShortcuts } from './shortcuts.js';
import { createRibbon, large, small, split, command, rows, divider, commandIconEl, setControlIcon } from './ribbon.js';
import { openListLibrary } from './list-library-menu.js';
import { recallUnit } from '../lib/units.js';
import { classicMenus } from '../views/classic-menus.js';
import { createTitleBar } from '../views/title-bar.js';
import { ribbonEntries, menuEntries } from './command-index.js';
import { createRibbonModes } from './ribbon-modes.js';

// Keep the user's pane and tab choices when opening another document in this tab.
let expandedTools = false;
let pageToolsExpanded = false;
let rememberedTab = 'home';

/**
 * The editor's chrome in a desktop word-processor layout: a title bar with quick-access commands, a
 * row of ribbon tabs over a card of command groups, and a formatting pane for the rarer settings.
 * It arranges the editor's own controls (their state and handlers stay in the editor view) and adds
 * ribbon commands that call the editor's actions.
 */
export function createCanvasChrome({ title, status, account, local, controls: c, actions: a, commands: w = {}, focusEditor, rulers }) {
  const field = (label, control) => el('label.canvas-tool-field', {}, el('span', {}, label), control);
  const section = (label, ...items) => el('section.canvas-advanced-section', { 'aria-label': label },
    el('h2', {}, label), el('div.canvas-advanced-controls', {}, ...items));

  /* ---- Formatting pane: the settings of the Font, Paragraph and Style dialogs ---- */
  const textSection = section('文本', field('字符样式', c.characterStyle), c.editCharacterStyle, c.newCharacterStyle,
    c.caps, c.smallCaps, c.doubleStrike, c.baselineShift, c.characterSpacing, c.textWidth, c.kerning);
  // With the Paragraph and Borders and Shading dialogs on the ribbon, the older direct editors stay here.
  const paragraphSection = section('段落', field('段落样式', c.paragraphStyle), c.editStyle, c.newStyle, c.clearParagraphFormatting,
    field('行距', c.lineSpacing), c.lineSpacingOptions, c.restart, ...(w.paragraphDialog ? [c.paragraphGeometry, c.paragraphBorders] : []));
  const tableSection = section('表格', field('行和列', c.tableActions));
  const pageSection = el('details.canvas-inspector-details', { open: pageToolsExpanded, ontoggle: () => { pageToolsExpanded = pageSection.open; } }, el('summary', {}, '页面与文档'),
    section('页面与文档设置', c.pageBreakBefore, c.insertTab, ...c.paginationTools, field('大纲级别', c.outlineLevel), c.unlink));
  const heading = el('h2', {}, '段落格式');
  const pane = el('aside.canvas-advanced.canvas-inspector', { id: 'canvas-advanced-tools', 'aria-label': '格式窗格', hidden: !expandedTools },
    el('div.canvas-panel-heading', {}, heading, el('button.icon-btn', { type: 'button', 'aria-label': '关闭格式窗格', onclick: () => { setExpanded(false); focusEditor(); } }, iconEl('x', 18))),
    el('div.canvas-panel-scroll', {}, tableSection, paragraphSection, textSection, pageSection));
  const more = command('格式窗格', 'formattingPane', () => setExpanded(!expandedTools), { size: 'large', text: '格式窗格', attrs: { 'aria-expanded': String(expandedTools), 'aria-controls': pane.id } });
  function setExpanded(value) {
    expandedTools = value;
    pane.hidden = !value;
    more.setAttribute('aria-expanded', String(value));
    paneToggle.setAttribute('aria-pressed', String(value));
    if (value && compact.matches) { a.closeOutline?.(); a.closeFind?.(); }
    refresh();
    if (value) pane.querySelector('button, select')?.focus();
  }
  pane.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented && !isComposing(e)) { e.preventDefault(); setExpanded(false); focusEditor(); } });
  for (const button of pane.querySelectorAll('button.canvas-tool')) button.append(el('span.inspector-label', {}, button.getAttribute('aria-label')));
  const compact = window.matchMedia('(max-width: 700px)');

  /* ---- Shared building blocks ---- */
  const noFocusSteal = (...buttons) => { for (const b of buttons) b.addEventListener('mousedown', e => e.preventDefault()); };
  // A menu the mouse opened closes back into the document; one the keyboard opened returns to its button.
  const menuButton = (label, icon, items, { size = 'large', text = label } = {}) => {
    const button = command(label, icon, e => openMenu({ anchor: button, label, items: inDocument(items()), minWidth: 220, pointer: !!e?.detail, onClose: e?.detail ? focusEditor : null }),
      { size, text, caret: true, attrs: { 'aria-haspopup': 'menu' } });
    noFocusSteal(button);
    button.menuItems = items; // command search lists what the menu offers
    return button;
  };
  // A command chosen from a ribbon menu acts on the document: the keyboard goes back to it first.
  const inDocument = list => list.map(item => !item ? item
    : item.onSelect ? { ...item, onSelect: () => { focusEditor(); w.noteCommand?.(item.label, item.onSelect); item.onSelect(); } }
    : item.items ? { ...item, items: inDocument(item.items) } : item);
  const engineReady = () => !c.bold.disabled;
  const separator = { separator: true };
  const tableAction = value => () => { c.tableActions.value = value; c.tableActions.dispatchEvent(new Event('change', { bubbles: true })); };
  const tableOption = value => c.tableActions.querySelector(`option[value="${value}"]`);
  const optionItems = (select, filter = () => true) => [...select.options].filter(o => o.value && !o.disabled && filter(o)).map(o => ({
    label: o.textContent, onSelect: () => { select.value = o.value; select.dispatchEvent(new Event('change', { bubbles: true })); } }));
  // Ribbon commands without an editor control follow these predicates on every refresh.
  const states = [];
  const when = (control, enabled, pressed) => { states.push({ control, enabled, pressed }); return control; };

  /* ---- Home ---- */
  const paste = command('粘贴', 'paste', () => a.paste?.(), { size: 'large', shortcut: `${MOD_KEY}+V` });
  const pasteSplit = split(paste, { label: '粘贴选项', size: 'large', open: (anchor, e) => openMenu({ anchor, label: '粘贴选项', pointer: !!e?.detail, onClose: e?.detail ? focusEditor : null, items: inDocument(w.pasteItems?.() || [
    { label: '保留源格式', icon: 'paste', shortcut: `${MOD_KEY}+V`, onSelect: () => a.paste?.() },
    { label: '只保留文本', icon: 'pasteText', shortcut: `${MOD_KEY}+Shift+V`, onSelect: () => a.pastePlain?.() }]) }) });
  const cut = command('剪切', 'cut', () => a.cut?.(), { shortcut: `${MOD_KEY}+X` });
  const copy = command('复制', 'copy', () => a.copy?.(), { shortcut: `${MOD_KEY}+C` });
  const painter = command('格式刷', 'formatPainter', e => w.formatPainter?.(e), { attrs: { 'aria-pressed': 'false' } });
  noFocusSteal(paste, cut, copy, painter);
  when(paste, () => a.clipboardState?.().paste); when(pasteSplit.arrow, () => a.clipboardState?.().paste);
  when(cut, () => a.clipboardState?.().cut); when(copy, () => a.clipboardState?.().copy);
  when(painter, () => engineReady() && !!w.formatPainter, () => w.formatPainterActive?.() ? 'true' : 'false');

  const grow = command('增大字号', 'fontGrow', () => w.growFont?.(1), { shortcut: `${MOD_KEY}+Shift+.` });
  const shrink = command('减小字号', 'fontShrink', () => w.growFont?.(-1), { shortcut: `${MOD_KEY}+Shift+,` });
  const changeCase = menuButton('更改大小写', 'changeCase', () => [
    ['句首字母大写', 'sentence'], ['全部小写', 'lower'], ['全部大写', 'upper'], ['每个单词首字母大写', 'title'], ['切换大小写', 'toggle'],
  ].map(([label, mode]) => ({ label, onSelect: () => w.changeCase?.(mode) })), { size: 'small', text: null });
  noFocusSteal(grow, shrink, changeCase);
  for (const control of [grow, shrink]) when(control, engineReady);
  when(changeCase, () => engineReady() && !!w.changeCase);
  small(c.clearTextFormatting, { icon: 'clearFormat' });
  c.clearTextFormatting.setAttribute('aria-label', '清除所有格式');
  c.clearTextFormatting.title = `清除所有格式 (${MOD_KEY}+Space)。清除直接文本格式，保留样式和链接。`;
  small(c.bold, { icon: 'bold' }); small(c.italic, { icon: 'italic' }); small(c.underline, { icon: 'underline' });
  small(c.strike, { icon: 'strike' }); small(c.subscript, { icon: 'sub' }); small(c.superscript, { icon: 'sup' });
  // The underline options dialog is the underline command's arrow, next to the underline styles.
  c.underlineOptions.className = 'ribbon-split-arrow';
  c.underlineOptions.replaceChildren(el('span.ribbon-caret', { 'aria-hidden': 'true' }));
  const underlineSplit = el('span.ribbon-split.is-small', {}, c.underline, c.underlineOptions);
  for (const [control, name] of [[c.textColor, 'textColor'], [c.highlight, 'highlight']]) {
    control.classList.add('ribbon-small', 'ribbon-color');
    const svg = control.querySelector('.canvas-color-icon > svg');
    svg?.replaceWith(commandIconEl(name, 16));
    control.querySelector(':scope > svg')?.replaceWith(el('span.ribbon-caret', { 'aria-hidden': 'true' }));
  }
  c.fontFamily.classList.add('ribbon-font');
  c.fontSize.classList.add('ribbon-size');
  c.fontSizeMenu.className = 'ribbon-split-arrow ribbon-size-arrow';
  c.fontSizeMenu.replaceChildren(el('span.ribbon-caret', { 'aria-hidden': 'true' }));
  const fontSizeSplit = el('span.ribbon-split.ribbon-size-split', {}, c.fontSize, c.fontSizeMenu);
  const textEffects = menuButton('文字效果', 'textEffects', () => w.textEffectItems?.() || [], { size: 'small', text: null });
  when(textEffects, () => engineReady() && !!w.textEffectItems);
  const fontLauncher = command('字体设置', 'fontDialog', () => (w.fontDialog ? w.fontDialog() : setExpanded(true)), { shortcut: `${MOD_KEY}+D` });
  when(fontLauncher, engineReady);
  const fontGroup = [rows(
    [c.fontFamily, fontSizeSplit, grow, shrink, divider(), changeCase, divider(), c.clearTextFormatting],
    [c.bold, c.italic, underlineSplit, c.strike, c.subscript, c.superscript, divider(), textEffects, c.highlight, c.textColor, divider(), fontLauncher])];

  small(c.bullets, { icon: 'bullets' }); small(c.numbers, { icon: 'numbers' });
  // The list buttons' arrows open the bullet and numbering libraries.
  const listSplit = (control, kind) => {
    const wrap = split(control, { label: kind === 'bullet' ? '项目符号库' : '编号库', open: (anchor, e) => openListLibrary({ anchor, kind, current: w.listLibraryIndex?.(kind) ?? -1, extra: inDocument(w.listLibraryExtras?.(kind) || []),
      apply: index => { focusEditor(); w.applyListLibrary?.(kind, index); }, none: () => { focusEditor(); w.removeList?.(kind); }, pointer: !!e?.detail, onClose: e?.detail ? focusEditor : null }) });
    when(wrap.arrow, () => engineReady() && !!w.applyListLibrary && !control.disabled);
    return wrap;
  };
  const bulletSplit = listSplit(c.bullets, 'bullet'), numberSplit = listSplit(c.numbers, 'number');
  const multilevel = menuButton('多级列表', 'multilevel', () => [{ header: '列表库' }, ...(w.multilevelItems?.() || [])], { size: 'small', text: null });
  when(multilevel, () => engineReady() && !!w.multilevelItems);
  small(c.outdent, { icon: 'outdent' }); small(c.indent, { icon: 'indent' });
  c.outdent.setAttribute('aria-label', '减少缩进量'); c.indent.setAttribute('aria-label', '增加缩进量');
  c.outdent.title = '减少缩进量'; c.indent.title = '增加缩进量';
  const sort = command('排序', 'sort', () => w.sortParagraphs?.());
  const marks = command('显示格式标记', 'pilcrow', () => w.toggleMarks?.(), { shortcut: `${MOD_KEY}+8`, attrs: { 'aria-pressed': 'false' } });
  noFocusSteal(sort, marks, multilevel);
  when(sort, () => engineReady() && !!w.sortParagraphs);
  when(marks, () => !!w.toggleMarks && !!a.hasDocument?.(), () => w.marksVisible?.() ? 'true' : 'false');
  const [alignLeft, alignCenter, alignRight, justify] = c.alignmentButtons;
  for (const [control, name] of [[alignLeft, 'alignLeft'], [alignCenter, 'alignCenter'], [alignRight, 'alignRight'], [justify, 'alignJustify']]) small(control, { icon: name });
  // One toggle: pressed in a right-to-left paragraph, and pressing it again makes the paragraph left-to-right.
  const directionRtl = c.directionButtons[1];
  small(directionRtl, { icon: 'directionRtl' });
  directionRtl.setAttribute('aria-label', '从右到左文字方向'); directionRtl.title = '从右到左文字方向';
  small(c.lineSpacingMenu, { icon: 'lineSpacing' });
  c.lineSpacingMenu.setAttribute('aria-label', '行和段落间距'); c.lineSpacingMenu.title = '行和段落间距';
  c.lineSpacingMenu.append(el('span.ribbon-caret', { 'aria-hidden': 'true' }));
  small(c.paragraphShading, { icon: 'shading' });
  // Borders: the last border choice, with the border presets and Borders and Shading on its arrow.
  let bordersControl = c.paragraphBorders;
  if (w.paragraphBorderItems) {
    const main = command('边框', 'borders', () => w.applyLastBorder?.());
    noFocusSteal(main); when(main, engineReady);
    bordersControl = split(main, { label: '边框选项', open: (anchor, e) => openMenu({ anchor, label: '边框', pointer: !!e?.detail, onClose: e?.detail ? focusEditor : null, items: inDocument(w.paragraphBorderItems()) }) });
    when(bordersControl.arrow, engineReady);
  } else small(c.paragraphBorders, { icon: 'borders' });
  const paragraphLauncher = w.paragraphDialog ? command('段落设置', 'paragraphDialog', () => w.paragraphDialog(), { shortcut: MOD_KEY === 'Cmd' ? 'Cmd+Option+M' : null }) : small(c.paragraphGeometry, { icon: 'paragraphDialog' });
  if (w.paragraphDialog) { noFocusSteal(paragraphLauncher); when(paragraphLauncher, () => !!a.hasDocument?.()); }
  const paragraphGroup = [rows(
    [bulletSplit, numberSplit, multilevel, divider(), c.outdent, c.indent, directionRtl, divider(), sort, divider(), marks],
    [alignLeft, alignCenter, alignRight, justify, divider(), c.lineSpacingMenu, divider(), c.paragraphShading, bordersControl, divider(), paragraphLauncher])];

  // The quick style gallery shows the document's paragraph styles in their own formatting.
  const gallery = el('div.ribbon-gallery', { role: 'listbox', 'aria-label': '样式', 'aria-orientation': 'horizontal', dataset: { shrinkMin: '1', shrinkMax: '620' } });
  const galleryMore = command('更多样式', 'more', e => {
    if (c.paragraphStyle.disabled) return;
    openMenu({ anchor: galleryMore, label: '样式', minWidth: 240, pointer: !!e?.detail, onClose: e?.detail ? focusEditor : null, items: inDocument([
      ...optionItems(c.paragraphStyle).map(item => ({ ...item, radio: true, checked: c.paragraphStyle.value === [...c.paragraphStyle.options].find(o => o.textContent === item.label)?.value })),
      separator, { label: '创建样式…', icon: 'newStyle', disabled: c.newStyle.disabled, onSelect: () => c.newStyle.click() },
      { label: '修改样式…', icon: 'editStyle', disabled: c.editStyle.disabled, onSelect: () => c.editStyle.click() },
      { label: '清除格式', icon: 'clearFormat', disabled: c.clearParagraphFormatting.disabled, onSelect: () => c.clearParagraphFormatting.click() }]) });
  });
  galleryMore.classList.add('ribbon-gallery-more'); galleryMore.setAttribute('aria-haspopup', 'menu');
  noFocusSteal(galleryMore);
  let gallerySignature = '';
  function refreshGallery() {
    const options = [...c.paragraphStyle.options].filter(o => o.value && o.value !== '__mixed' && !o.disabled);
    const preferred = ['normal', 'no spacing', 'heading 1', 'heading 2', 'heading 3', 'title', 'subtitle', 'quote', 'list paragraph'];
    const ranked = [...options].sort((x, y) => {
      const ix = preferred.indexOf(x.textContent.toLowerCase()), iy = preferred.indexOf(y.textContent.toLowerCase());
      return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
    }).slice(0, 8);
    // A style's look is part of the signature, so modifying a style redraws its sample.
    const looks = ranked.map(option => w.stylePreview?.(option.value) || {});
    const signature = JSON.stringify([ranked.map(o => [o.value, o.textContent]), looks, c.paragraphStyle.value, c.paragraphStyle.disabled]);
    if (signature === gallerySignature) return;
    const count = gallery.children.length;
    gallerySignature = signature;
    gallery.replaceChildren(...ranked.map((option, index) => {
      const look = looks[index];
      const item = el('button.ribbon-style', { type: 'button', role: 'option', 'aria-selected': String(c.paragraphStyle.value === option.value), disabled: c.paragraphStyle.disabled,
        title: option.textContent, onclick: () => { c.paragraphStyle.value = option.value; c.paragraphStyle.dispatchEvent(new Event('change', { bubbles: true })); },
        oncontextmenu: e => { e.preventDefault(); openMenu({ anchor: item, x: e.clientX, y: e.clientY, label: option.textContent, onClose: focusEditor, items: inDocument([
          { label: '应用', onSelect: () => item.click() }, { label: '修改…', icon: 'editStyle', onSelect: () => { item.click(); queueMicrotask(() => c.editStyle.click()); } }]) }); } },
      styleColor(el('span.ribbon-style-sample', { 'aria-hidden': 'true', style: { fontFamily: look.fontFamily || '', fontWeight: look.bold ? '700' : '', fontStyle: look.italic ? 'italic' : '', fontSize: look.size ? `${Math.max(10, Math.min(14, look.size * 0.8))}px` : '' } }, 'AaBbCcDdEe'), look.color),
      el('span.ribbon-style-name', {}, option.textContent));
      item.addEventListener('mousedown', e => e.preventDefault());
      return item;
    }));
    // The ribbon sizes the gallery to whole items: refit when the number of styles changes.
    if (gallery.children.length !== count) queueMicrotask(() => ribbon?.fit());
  }
  const styleGroup = [el('div.ribbon-gallery-frame', {}, gallery, galleryMore), ...(w.styleGroupItems?.({ command, when }) || []), more];

  // Find searches from the Navigation pane; its menu also offers the Find and Replace panel and Go To.
  const findButton = command('查找', 'find', () => a.openSearch?.(), { text: '查找', shortcut: `${MOD_KEY}+F` });
  const findSplit = split(findButton, { label: '查找选项', open: (anchor, e) => openMenu({ anchor, label: '查找选项', pointer: !!e?.detail, onClose: e?.detail ? focusEditor : null, items: inDocument([
    { label: '查找', icon: 'search', shortcut: `${MOD_KEY}+F`, onSelect: () => a.openSearch?.() },
    { label: '高级查找…', onSelect: () => (w.advancedFind ? w.advancedFind() : c.find.click()) },
    { label: '转到…', shortcut: MOD_KEY === 'Cmd' ? 'Cmd+Option+G' : 'Ctrl+G', onSelect: () => w.goTo?.() }]) }) });
  noFocusSteal(findButton);
  when(findButton, () => !c.find.disabled); when(findSplit.arrow, () => !c.find.disabled);
  const replace = command('替换', 'replace', () => w.openReplace?.(), { text: '替换', shortcut: MOD_KEY === 'Cmd' ? 'Cmd+Shift+H' : 'Ctrl+H' });
  const selectMenu = menuButton('选择', 'select', () => [
    { label: '全选', shortcut: `${MOD_KEY}+A`, icon: 'selectAll', onSelect: a.selectAll }, ...(w.selectItems?.() || [])], { size: 'small', text: '选择' });
  noFocusSteal(replace);
  when(replace, () => !c.find.disabled); when(selectMenu, engineReady);
  const editingGroup = [rows([findSplit], [replace], [selectMenu])];

  const home = { id: 'home', label: '开始', groups: [
    { id: 'clipboard', label: '剪贴板', icon: 'paste', priority: 7, items: [pasteSplit, rows([cut], [copy], [painter])] },
    { id: 'font', label: '字体', icon: 'fontDialog', priority: 9, items: fontGroup },
    { id: 'paragraph', label: '段落', icon: 'paragraphDialog', priority: 8, items: paragraphGroup },
    { id: 'styles', label: '样式', icon: 'stylesPane', priority: 6, items: styleGroup },
    { id: 'editing', label: '编辑', icon: 'find', priority: 2, items: editingGroup },
  ] };

  /* ---- Insert ---- */
  const coverPage = menuButton('封面', 'coverPage', () => w.coverPageItems?.() || [], { text: '封面' });
  when(coverPage, () => engineReady() && !!w.coverPageItems);
  const blankPage = command('空白页', 'blankPage', () => w.insertBlankPage?.(), { size: 'large' });
  when(blankPage, () => !c.pageBreak.disabled);
  large(c.pageBreak, { label: '分页符', icon: 'pageBreak' });
  large(c.insertTable, { label: '表格', icon: 'table', caret: true });
  large(c.insertImage, { label: '图片', icon: 'pictures' });
  const shapesButton = command('形状', 'shapes', e => w.openShapes?.(shapesButton, e), { size: 'large', caret: true, attrs: { 'aria-haspopup': 'menu' } });
  noFocusSteal(shapesButton);
  when(shapesButton, () => engineReady() && !!w.openShapes);
  large(c.hyperlink, { label: '链接', icon: 'link' });
  large(c.bookmarks, { label: '书签', icon: 'bookmark' });
  const headerButton = command('页眉', 'header', () => w.editHeader?.('header'), { size: 'large' });
  const footerButton = command('页脚', 'footer', () => w.editHeader?.('footer'), { size: 'large' });
  const pageNumber = command('页码', 'pageNumber', e => w.insertPageNumber?.(e, pageNumber), { size: 'large', caret: true, attrs: { 'aria-haspopup': 'menu' } });
  noFocusSteal(pageNumber);
  when(headerButton, () => !!w.canEditHeader?.('header')); when(footerButton, () => !!w.canEditHeader?.('footer'));
  when(pageNumber, () => !!w.canInsertPageNumber?.());
  const textBox = command('文本框', 'textBox', () => w.insertTextBox?.(), { size: 'large', text: '文本框' });
  noFocusSteal(textBox);
  when(textBox, () => engineReady() && !!w.insertTextBox);
  const dateTime = command('日期和时间', 'dateTime', () => w.insertDateTime?.(), { size: 'large', text: '日期和时间' });
  const symbol = command('符号', 'symbol', () => w.insertSymbol?.(), { size: 'large' });
  for (const control of [dateTime, symbol]) when(control, engineReady);
  noFocusSteal(blankPage, c.pageBreak);
  // Galleries and dialogs come from the editor's Insert commands (views/insert-tab.js); without them the basic commands remain.
  const ins = w.insertRibbon?.({ command, menuButton, split, rows, divider, when, engineReady, focusEditor, inDocument, pageBreak: c.pageBreak }) || {};
  const insert = { id: 'insert', label: '插入', groups: [
    { id: 'pages', label: '页面', icon: 'blankPage', priority: 4, items: ins.pages || [coverPage, blankPage, c.pageBreak] },
    { id: 'tables', label: '表格', icon: 'table', priority: 9, items: [c.insertTable] },
    { id: 'illustrations', label: '插图', icon: 'pictures', priority: 8, items: ins.illustrations || [c.insertImage, shapesButton] },
    { id: 'links', label: '链接', icon: 'link', priority: 7, items: [c.hyperlink, c.bookmarks] },
    { id: 'headerFooter', label: '页眉和页脚', icon: 'header', priority: 5, items: ins.headerFooter || [headerButton, footerButton, pageNumber] },
    { id: 'text', label: '文本', icon: 'textBox', priority: 3, items: ins.text || [textBox, dateTime] },
    { id: 'symbols', label: '符号', icon: 'symbol', priority: 2, items: ins.symbols || [symbol] },
  ] };

  /* ---- Design ---- */
  const paragraphSpacing = menuButton('段落间距', 'paragraphSpacing', () => w.paragraphSpacingItems?.() || [], { text: '段落间距' });
  when(paragraphSpacing, () => !!w.paragraphSpacingItems && engineReady());
  const pageColor = menuButton('页面颜色', 'pageColor', () => w.pageColorItems?.() || [], { text: '页面颜色' });
  const pageBorders = menuButton('页面边框', 'pageBorders', () => w.pageBorderItems?.() || [], { text: '页面边框' });
  when(pageColor, () => !!w.pageColorItems && !c.pageSetup.disabled);
  when(pageBorders, () => !!w.pageBorderItems && !c.pageSetup.disabled);
  const design = { id: 'design', label: '设计', groups: [
    { id: 'formatting', label: '文档格式', icon: 'paragraphSpacing', priority: 4, items: [paragraphSpacing] },
    { id: 'background', label: '页面背景', icon: 'pageColor', priority: 5, items: [pageColor, pageBorders] },
  ] };

  /* ---- Layout ---- */
  const margins = menuButton('页边距', 'margins', () => [...(w.marginItems?.() || []), separator, { label: '自定义页边距…', onSelect: () => c.pageSetup.click() }]);
  const orientation = menuButton('纸张方向', 'orientation', () => w.orientationItems?.() || []);
  const size = menuButton('纸张大小', 'size', () => [...(w.sizeItems?.() || []), separator, { label: '其他页面大小…', onSelect: () => c.pageSetup.click() }]);
  const columns = menuButton('分栏', 'columns', () => w.columnItems?.() || []);
  const breaks = menuButton('分隔符', 'breaks', () => [
    { header: '分页符' },
    { label: '分页符', icon: 'pageBreak', shortcut: `${MOD_KEY}+Enter`, disabled: c.pageBreak.disabled, onSelect: () => c.pageBreak.click() },
    { label: '分栏符', shortcut: `${MOD_KEY}+Shift+Enter`, disabled: !engineReady() || !w.insertColumnBreak, onSelect: () => w.insertColumnBreak() },
    { label: '文字环绕', shortcut: 'Shift+Enter', disabled: !engineReady(), onSelect: () => w.insertLineBreak?.() },
    ...(w.sectionBreakItems?.() || [])]);
  for (const control of [margins, orientation, size, breaks]) when(control, () => !c.pageSetup.disabled);
  when(columns, () => !!w.columnItems && !c.pageSetup.disabled);
  small(c.pageSetup, { icon: 'pageSetup' });
  const spin = (label, icon, input, unit) => el('label.ribbon-spin', { title: label }, commandIconEl(icon, 16), el('span.ribbon-spin-label', {}, label), input, el('span.ribbon-spin-unit', {}, unit));
  c.spaceBefore.classList.add('ribbon-number'); c.spaceAfter.classList.add('ribbon-number');
  // Indents follow the measurement unit chosen on the View tab.
  const indentInput = (key, label) => {
    const input = el('input.canvas-spacing.ribbon-number', { type: 'number', step: 0.1, min: -56, max: 56, disabled: true, 'aria-label': `${label} (${recallUnit()})`, placeholder: '多种',
      // The arrows step by tenths; any typed value in range is kept (2.54 cm is an inch).
      onchange: () => { const v = input.validity; if (input.value === '' || v.badInput || v.rangeOverflow || v.rangeUnderflow) { input.reportValidity(); refresh(); return; } w.setIndent?.(key, Number(input.value), recallUnit()); },
      onkeydown: e => { if (e.key === 'Enter' && !isComposing(e)) { e.preventDefault(); input.dispatchEvent(new Event('change')); focusEditor(); } } });
    states.push({ control: input, enabled: () => engineReady() && !!w.setIndent, value: () => w.indentValue?.(key, recallUnit()), unit: label });
    return input;
  };
  const indentLeft = indentInput('indentLeft', '左侧缩进'), indentRight = indentInput('indentRight', '右侧缩进');
  const wrapText = menuButton('文字环绕', 'wrapText', () => w.wrapItems?.() || []);
  const forward = command('上移一层', 'bringForward', () => w.arrange?.('forward'), { size: 'large' });
  const backward = command('下移一层', 'sendBackward', () => w.arrange?.('backward'), { size: 'large' });
  when(wrapText, () => !!(w.canWrap || w.canArrange)?.()); for (const control of [forward, backward]) when(control, () => !!w.canArrange?.());
  const layout = { id: 'layout', label: '布局', groups: [
    { id: 'pageSetup', label: '页面设置', icon: 'margins', priority: 9, items: [margins, orientation, size, columns, breaks, el('div.ribbon-launcher', {}, c.pageSetup)] },
    { id: 'layoutParagraph', label: '段落', icon: 'paragraphDialog', priority: 6, items: [
      el('div.ribbon-spin-group', {}, el('span.ribbon-spin-title', {}, '缩进'), spin('左', 'indentLeft', indentLeft, recallUnit()), spin('右', 'indentRight', indentRight, recallUnit())),
      divider(),
      el('div.ribbon-spin-group', {}, el('span.ribbon-spin-title', {}, '间距'), spin('段前', 'spaceBefore', c.spaceBefore, 'pt'), spin('段后', 'spaceAfter', c.spaceAfter, 'pt'))] },
    { id: 'arrange', label: '排列', icon: 'wrapText', priority: 3, items: [wrapText, forward, backward] },
  ] };

  /* ---- References ---- */
  const toc = menuButton('目录', 'toc', () => w.tocItems?.(focusEditor) || [], { text: '目录' });
  const addText = menuButton('添加文本', 'addText', () => w.addTextItems?.() || [], { size: 'small', text: '添加文本' });
  const updateTable = command('更新目录', 'updateTable', () => (w.updateTocDialog ? w.updateTocDialog() : w.updateFields?.()), { text: '更新目录' });
  const updateFields = command('更新域', 'updateFields', () => w.updateAllFields?.(), { text: '更新域', shortcut: 'F9' });
  when(toc, () => !!w.tocItems && engineReady()); when(addText, () => !!w.addTextItems && engineReady()); when(updateTable, () => !!w.canUpdateFields?.()); when(updateFields, () => !!w.updateAllFields && engineReady());
  const footnote = command('插入脚注', 'footnote', () => w.insertFootnote?.(), { size: 'large', text: '插入脚注', shortcut: MOD_KEY === 'Cmd' ? 'Cmd+Option+F' : 'Ctrl+Alt+F' });
  const endnote = command('插入尾注', 'endnote', () => w.insertEndnote?.(), { text: '插入尾注', shortcut: MOD_KEY === 'Cmd' ? 'Cmd+Option+E' : 'Ctrl+Alt+D' });
  const nextNote = menuButton('下一条脚注', 'nextFootnote', () => w.nextNoteItems?.() || [], { size: 'small', text: '下一条脚注' });
  const showNotes = command('显示备注', 'showNotes', () => w.showNotes?.(), { text: '显示备注' });
  const notesLauncher = command('脚注和尾注设置', 'noteSettings', () => w.notesDialog?.());
  when(footnote, () => !!w.insertFootnote && engineReady()); when(endnote, () => !!w.insertEndnote && engineReady()); when(nextNote, () => !!w.nextNoteItems && engineReady());
  when(showNotes, () => !!w.showNotes && engineReady()); when(notesLauncher, () => !!w.notesDialog && engineReady());
  noFocusSteal(updateFields, endnote, showNotes, notesLauncher);
  const references = { id: 'references', label: '引用', groups: [
    { id: 'toc', label: '目录', icon: 'toc', priority: 7, items: [toc, rows([addText], [updateTable], [updateFields])] },
    { id: 'footnotes', label: '脚注', icon: 'footnote', priority: 5, items: [footnote, rows([endnote], [nextNote], [showNotes]), el('div.ribbon-launcher', {}, notesLauncher)] },
  ] };

  /* ---- Review ---- */
  const spellingButton = command('拼写检查', 'spelling', () => w.spelling?.(), { size: 'large', text: '拼写检查', shortcut: 'F7' });
  const spelling = split(spellingButton, { label: '拼写检查选项', size: 'large', open: (anchor, e) => openMenu({ anchor, label: '拼写检查选项', pointer: !!e?.detail, onClose: e?.detail ? focusEditor : null, items: inDocument(w.spellingItems?.() || []) }) });
  const wordCount = command('字数统计', 'wordCount', () => w.wordCount?.(), { text: '字数统计' });
  const thesaurus = command('同义词库', 'thesaurus', () => w.thesaurus?.(), { text: '同义词库', shortcut: 'Shift+F7' });
  when(spellingButton, () => !!w.spelling && !!a.hasDocument?.()); when(spelling.arrow, () => !!w.spellingItems && !!a.hasDocument?.()); when(wordCount, () => !!a.hasDocument?.()); when(thesaurus, () => !!w.thesaurus && !!a.hasDocument?.());
  const review = { id: 'review', label: '审阅', groups: [
    { id: 'proofing', label: '校对', icon: 'spelling', priority: 7, items: [spelling, rows([thesaurus], [wordCount])] },
  ] };

  /* ---- View ---- */
  // The document views (views/document-views.js): each button shows whether it is the current view.
  const viewButton = (label, icon, kind, size = 'large') => {
    const button = command(label, icon, () => (w.setDocumentView ? w.setDocumentView(kind) : focusEditor()), { size, text: label, attrs: { 'aria-pressed': String(kind === 'print') } });
    noFocusSteal(button);
    when(button, () => kind === 'print' || (!!w.setDocumentView && !!a.hasDocument?.()), () => String((w.documentView?.() ?? 'print') === kind));
    return button;
  };
  const readMode = viewButton('阅读模式', 'readMode', 'read'), printLayout = viewButton('页面视图', 'printLayout', 'print'), webLayout = viewButton('Web 版式视图', 'webLayout', 'web');
  const outlineView = viewButton('大纲', 'outlineView', 'outline', 'small'), draftView = viewButton('草稿', 'draft', 'draft', 'small');
  const focusMode = command('专注模式', 'focus', () => w.focusMode?.(), { size: 'large' });
  when(focusMode, () => !!w.focusMode && !!a.hasDocument?.());
  const check = (label, get, set) => {
    const input = el('input', { type: 'checkbox', onchange: () => set(input.checked) });
    states.push({ control: input, enabled: () => true, checked: get });
    return el('label.ribbon-check', {}, input, label);
  };
  const rulerCheck = check('标尺', () => rulers?.visible ?? true, value => { if ((rulers?.visible ?? true) !== value) rulers?.toggle(); });
  const gridCheck = check('网格线', () => !!w.gridlinesVisible?.(), value => w.setGridlines?.(value));
  small(c.outline, { icon: 'navigationPane', label: '导航窗格' });
  c.outline.setAttribute('aria-label', '导航窗格'); c.outline.title = `导航窗格 (${MOD_KEY === 'Cmd' ? 'Cmd+Option+O' : 'Ctrl+Alt+O'})`;
  const paneToggle = command('格式窗格', 'formattingPane', () => setExpanded(!expandedTools), { text: '格式窗格', attrs: { 'aria-pressed': String(expandedTools) } });
  paneToggle.setAttribute('aria-label', '显示格式窗格');
  const zoomDialog = command('显示比例', 'zoom', () => w.zoomDialog?.(), { size: 'large' });
  const zoom100 = command('100%', 'zoom100', () => w.setZoom?.(1), { size: 'large' });
  const onePage = command('单页', 'onePage', () => w.zoomTo?.('page'), { text: '单页' });
  const pageWidth = command('页宽', 'pageWidth', () => w.zoomTo?.('width'), { text: '页宽' });
  const multiplePages = command('多页', 'multiplePages', () => w.multiplePages?.(), { text: '多页', attrs: { 'aria-pressed': 'false' } });
  when(multiplePages, () => !!w.multiplePages && !!a.hasDocument?.(), () => w.multiplePagesActive?.() ? 'true' : 'false');
  for (const control of [zoomDialog, zoom100, onePage, pageWidth]) when(control, () => !!a.hasDocument?.());
  const units = menuButton('单位', 'units', () => [['in', '英寸'], ['cm', '厘米']].map(([id, label]) => ({ label, radio: true, checked: rulers?.unit === id, onSelect: () => rulers?.setUnit(id) })), { size: 'small', text: '单位' });
  const fonts = command('文档字体', 'documentFonts', () => a.loadFontFiles?.(), { text: '文档字体…' });
  when(fonts, () => !!a.hasDocument?.());
  const view = { id: 'view', label: '视图', groups: [
    { id: 'views', label: '视图', icon: 'printLayout', priority: 8, items: [readMode, printLayout, webLayout, rows([outlineView], [draftView])] },
    { id: 'immersive', label: '沉浸式', icon: 'focus', priority: 4, items: [focusMode] },
    { id: 'show', label: '显示', icon: 'ruler', priority: 7, items: [rows([rulerCheck], [gridCheck], [c.outline]), rows([paneToggle])] },
    { id: 'zoom', label: '显示比例', icon: 'zoom', priority: 5, items: [zoomDialog, zoom100, rows([onePage], [multiplePages], [pageWidth])] },
    { id: 'options', label: '选项', icon: 'units', priority: 3, items: [rows([units], [fonts])] },
  ] };

  /* ---- Contextual: tables ---- */
  // The table tabs come from the table tools (views/table-tools.js); `designs` also refreshes them.
  const designs = w.tableRibbon?.({ command, menuButton, split, rows, divider, large, small, when, check, spin, inDocument, engineReady, focusEditor, separator, commandIconEl, controls: c });
  const tableDesign = { id: 'tableDesign', label: '表格设计', contextual: 'table', groups: designs?.design || [] };
  const tableLayout = { id: 'tableLayout', label: '表格布局', contextual: 'table', groups: designs?.layout || [] };

  /* ---- Contextual: pictures ---- */
  large(c.imageProperties, { label: '图片属性', icon: 'pictures' });
  const pictureWrap = menuButton('文字环绕', 'wrapText', () => w.wrapItems?.() || []);
  const pictureForward = command('上移一层', 'bringForward', () => w.arrange?.('forward'), { size: 'large', text: '上移一层' });
  const pictureBackward = command('下移一层', 'sendBackward', () => w.arrange?.('backward'), { size: 'large', text: '下移一层' });
  when(pictureWrap, () => !!(w.canWrap || w.canArrange)?.()); for (const control of [pictureForward, pictureBackward]) when(control, () => !!w.canArrange?.());
  const drawingText = menuButton('绘图文字', 'drawingText', () => w.drawingTextItems?.() || [], { text: '编辑绘图文字' });
  when(drawingText, () => (w.drawingTextItems?.() || []).length > 0);
  const deletePicture = command('删除图片', 'deletePicture', () => w.deleteSelection?.(), { size: 'large', text: '删除' });
  when(deletePicture, () => !c.imageProperties.disabled);
  const rotate = menuButton('旋转', 'rotate', () => w.rotateItems?.() || [], { text: '旋转' });
  when(rotate, () => !!w.pictureSelected?.());
  const pictureSizeInput = (key, label) => {
    const input = el('input.canvas-spacing.ribbon-number', { type: 'number', step: 0.01, min: 0.01, max: 22, 'aria-label': `图片${label} (英寸)`,
      onchange: () => { if (!amountInRange(input)) { input.reportValidity(); refresh(); return; } w.setPictureSize?.(key, Number(input.value)); },
      onkeydown: e => { if (e.key === 'Enter' && !isComposing(e)) { e.preventDefault(); input.dispatchEvent(new Event('change')); } } });
    states.push({ control: input, enabled: () => !!w.pictureSelected?.(), value: () => w.pictureSize?.(key) });
    return spin(label, key === 'height' ? 'shapeHeight' : 'shapeWidth', input, '英寸');
  };
  const picture = { id: 'picture', label: '图片格式', contextual: 'image', groups: [
    { id: 'pictureArrange', label: '排列', icon: 'wrapText', priority: 5, items: [pictureWrap, pictureForward, pictureBackward, rotate] },
    { id: 'size', label: '大小', icon: 'pictures', priority: 6, items: [el('div.ribbon-spin-group', {}, pictureSizeInput('height', '高度'), pictureSizeInput('width', '宽度')), c.imageProperties] },
    { id: 'pictureText', label: '文本', icon: 'drawingText', priority: 3, items: [drawingText, deletePicture] },
  ] };

  /* ---- Contextual: shapes ---- */
  const shapeFill = command('形状填充', 'shapeFill', () => w.shapeColorMenu?.(shapeFill, 'fill'), { caret: true, text: '形状填充', attrs: { 'aria-haspopup': 'menu' } });
  const shapeOutline = command('形状轮廓', 'shapeOutline', () => w.shapeColorMenu?.(shapeOutline, 'line'), { caret: true, text: '形状轮廓', attrs: { 'aria-haspopup': 'menu' } });
  const shapeWeight = menuButton('粗细', 'lineWeight', () => w.shapeWeightItems?.() || [], { size: 'small', text: '粗细' });
  noFocusSteal(shapeFill, shapeOutline);
  for (const control of [shapeFill, shapeOutline, shapeWeight]) when(control, () => !!w.shapeSelected?.());
  const shapeSizeInput = (key, label) => {
    const input = el('input.canvas-spacing.ribbon-number', { type: 'number', step: 0.01, min: 0.01, max: 22, 'aria-label': `形状${label} (英寸)`,
      onchange: () => { if (!amountInRange(input)) { input.reportValidity(); refresh(); return; } w.setShapeSize?.(key, Number(input.value)); },
      onkeydown: e => { if (e.key === 'Enter' && !isComposing(e)) { e.preventDefault(); input.dispatchEvent(new Event('change')); } } });
    states.push({ control: input, enabled: () => !!w.shapeSelected?.() && (key === 'width' || w.shapeSize?.('height') > 0), value: () => w.shapeSize?.(key) });
    return spin(label, key === 'height' ? 'shapeHeight' : 'shapeWidth', input, '英寸');
  };
  const shapeWrap = menuButton('文字环绕', 'wrapText', () => w.wrapItems?.() || []);
  const shapeForward = command('上移一层', 'bringForward', () => w.arrange?.('forward'), { size: 'large', text: '上移一层' });
  const shapeBackward = command('下移一层', 'sendBackward', () => w.arrange?.('backward'), { size: 'large', text: '下移一层' });
  when(shapeWrap, () => !!(w.canWrap || w.canArrange)?.()); for (const control of [shapeForward, shapeBackward]) when(control, () => !!w.canArrange?.());
  const deleteShape = command('删除形状', 'deleteShape', () => w.deleteSelection?.(), { size: 'large', text: '删除' });
  const editShapeText = command('编辑文字', 'drawingText', () => w.editShapeText?.(), { size: 'large', text: '编辑文字' });
  when(editShapeText, () => (w.drawingTextItems?.() || []).some(item => !item.disabled));
  when(deleteShape, () => !!w.shapeSelected?.());
  const shapeFormat = { id: 'shapeFormat', label: '形状格式', contextual: 'shape', groups: [
    { id: 'shapeStyles', label: '形状样式', icon: 'shapeFill', priority: 7, items: [rows([shapeFill], [shapeOutline], [shapeWeight])] },
    { id: 'shapeArrange', label: '排列', icon: 'wrapText', priority: 5, items: [shapeWrap, shapeForward, shapeBackward] },
    { id: 'shapeSize', label: '大小', icon: 'shapeHeight', priority: 6, items: [el('div.ribbon-spin-group', {}, shapeSizeInput('height', '高度'), shapeSizeInput('width', '宽度'))] },
    { id: 'shapeEdit', label: '编辑', icon: 'drawingText', priority: 4, items: [editShapeText, deleteShape] },
  ] };

  /* ---- File ---- */
  const fileItems = () => [
    { label: '新建文档', icon: 'filePlus', onSelect: a.newDocument },
    { label: '打开 .docx…', icon: 'folderOpen', shortcut: `${MOD_KEY}+O`, onSelect: a.openDocument },
    separator, ...(!local ? [fileCommand(c.saveButton, { icon: 'save', shortcut: `${MOD_KEY}+S` })] : []),
    fileCommand(c.exportButton, { icon: 'download' }),
    ...(!local ? [fileCommand(c.templateButton, { icon: 'template' })] : []),
    fileCommand(c.printButton, { icon: 'print', shortcut: `${MOD_KEY}+P` }),
    ...(w.fileItems?.() || []),
    { label: '重命名…', icon: 'rename', onSelect: () => { title.focus(); title.select(); } },
    separator, { label: '页面设置…', icon: 'pageSetup', disabled: c.pageSetup.disabled, onSelect: () => c.pageSetup.click() },
    { label: '文档字体…', icon: 'documentFonts', disabled: !a.hasDocument?.(), onSelect: a.loadFontFiles },
    separator, { label: '键盘快捷键', icon: 'keyboard', shortcut: `${MOD_KEY}+/`, onSelect: openShortcuts },
    { label: '所有文档', icon: 'back', onSelect: a.goHome },
  ];
  const fileCommand = (control, overrides) => ({ label: control.getAttribute('aria-label') || control.textContent, disabled: control.disabled, onSelect: () => control.click(), ...overrides });
  const fileButton = el('button.ribbon-file', { type: 'button', 'aria-haspopup': w.openBackstage ? 'dialog' : 'menu', 'aria-expanded': 'false', onclick: e => {
    if (w.openBackstage) { w.openBackstage(); return; }
    const opened = openMenu({ anchor: fileButton, label: '文件', minWidth: 250, items: inDocument(fileItems()), pointer: !!e.detail, onClose: e.detail ? focusEditor : null });
    if (!opened.menu && e.detail) focusEditor();
  } }, '文件');
  fileButton.addEventListener('mousedown', e => { if (document.activeElement?.matches?.('.canvas-input')) e.preventDefault(); });

  // Feature modules add their own groups: w.extendTab(tabId, kit) returns groups, each optionally
  // placed `after` an existing group id (otherwise appended), or taking the place of the group it `replaces`.
  const kit = { command, menuButton, split, rows, divider, large, small, when, check, inDocument, engineReady, focusEditor, separator, commandIconEl };
  // Picture Format, Shape Format and the Layout tab's Arrange group from the drawing module (views/pictures.js).
  const drawingTabs = w.drawingTabs?.(kit);
  if (drawingTabs) {
    picture.groups = drawingTabs.picture; shapeFormat.groups = drawingTabs.shape;
    // The image dialog (exact size, rotation, crop, flips, alt text) stays one click away beside the size boxes.
    for (const groups of [picture.groups, shapeFormat.groups]) {
      const sizeGroup = groups.find(g => g.label === 'Size');
      if (!sizeGroup || !c.imageProperties) continue;
      const imageDialog = command('Image properties', 'pictures', () => c.imageProperties.click());
      noFocusSteal(imageDialog);
      when(imageDialog, () => !c.imageProperties.disabled);
      sizeGroup.items.push(el('div.ribbon-launcher', {}, imageDialog));
    }
    const at = layout.groups.findIndex(g => g.id === 'arrange');
    if (at >= 0) layout.groups.splice(at, 1, drawingTabs.layoutArrange);
  }
  // Standard tabs from feature modules ({ id, label, groups, after }), placed after the tab named by `after`.
  const standardTabs = [home, insert, design, layout, references, review, view];
  for (const tab of w.extraTabs?.(kit) || []) { const at = standardTabs.findIndex(t => t.id === tab.after); standardTabs.splice(at < 0 ? standardTabs.length : at + 1, 0, tab); }
  for (const tab of [...standardTabs, tableDesign, tableLayout, picture, shapeFormat]) {
    const placed = new Map();
    for (const group of w.extendTab?.(tab.id, kit) || []) {
      const replaced = group.replaces ? tab.groups.findIndex(g => g.id === group.replaces) : -1;
      if (replaced >= 0) { tab.groups[replaced] = group; continue; }
      const at = group.after ? tab.groups.findIndex(g => g.id === (placed.get(group.after) ?? group.after)) : -1;
      if (at >= 0) { tab.groups.splice(at + 1, 0, group); placed.set(group.after, group.id); } else tab.groups.push(group);
    }
  }
  // Contextual tabs from feature modules: [{ id, label, contextual, groups }], shown by setContext's extra contexts.
  const moduleTabs = w.contextTabs?.(kit) || [];
  const ribbon = createRibbon({ tabs: [...standardTabs, tableDesign, tableLayout, picture, shapeFormat, ...moduleTabs], fileButton, focusEditor,
    onSelect: id => { if (!['tableDesign', 'tableLayout', 'picture', 'shapeFormat', ...moduleTabs.map(t => t.id)].includes(id)) rememberedTab = id; } });
  if (rememberedTab !== 'home') ribbon.select(rememberedTab);

  // Clicking a ribbon button leaves the keyboard in the document: a dialog it
  // opens then hands focus back to the text when it closes. Fields (font name, size) still take focus.
  keepDocumentFocus(ribbon.card, { buttons: true });
  // A ribbon command that changes the document becomes the one Repeat runs again, and names its undo step.
  ribbon.card.addEventListener('click', e => {
    const button = e.target.closest?.('button');
    if (!button || button.disabled || button.getAttribute('aria-haspopup') || button.classList.contains('ribbon-split-arrow') || button.classList.contains('ribbon-collapsed')) return;
    const label = button.getAttribute('aria-label') || button.title || button.textContent.trim();
    w.noteCommand?.(label, () => { if (button.isConnected && !button.disabled) button.click(); });
  }, true);

  /* ---- Title bar: quick access, menu bar, document name, command search, modes, comments, share ---- */
  if (local) {
    c.exportButton.className = 'canvas-download';
    c.exportButton.setAttribute('aria-label', '下载 .docx');
    c.exportButton.title = '下载 .docx';
    c.exportButton.replaceChildren(commandIconEl('download', 16), el('span', {}, '下载 .docx'));
  }
  // Every tab the ribbon holds, the feature modules' standard tabs (Draw, Mailings) among them: command search,
  // Customize Keyboard and the KeyTips list their commands from here.
  const allTabs = [...standardTabs, tableDesign, tableLayout, picture, shapeFormat, ...moduleTabs];
  let modes = null, titleBar = null;
  const menuContext = { w, c, a, local, kit, focusEditor, inDocument, engineReady, rulers, engine: () => a.engine?.(),
    tableAction, tableOption, shortcut: id => w.shortcutFor?.(id) ?? null, menuAnchor: () => document.activeElement,
    toggleFormattingPane: () => setExpanded(!expandedTools), formattingPaneShown: () => expandedTools,
    ribbonMode: () => modes?.mode ?? 'always', setRibbonMode: m => modes?.setMode(m), toggleRibbon: () => modes?.toggle(),
    statusBarShown: () => w.statusBarShown?.() ?? true, setStatusBarShown: w.setStatusBarShown ? on => w.setStatusBarShown(on) : null,
    openShortcuts: () => (w.openShortcuts ? w.openShortcuts() : openShortcuts()), focusSearch: () => titleBar?.focusSearch(), showKeyTips: () => modes?.showKeyTips() };
  const menus = classicMenus(menuContext);
  /** Every command in the window, for search, KeyTips and Customize Keyboard. */
  const entries = () => [...ribbonEntries({ ribbon, tabs: allTabs, beforeRun: () => modes?.beforeRun() }), ...menuEntries(menus)];
  titleBar = createTitleBar({ w, c, a, local, title, status, account, menus, focusEditor, entries,
    openShortcuts: menuContext.openShortcuts, keymapShortcut: id => w.shortcutFor?.(id) ?? null });
  const header = el('header.canvas-header.ed-header', {}, titleBar.el, ribbon.tablist);
  // The space between the title bar's controls and beside the tabs is not somewhere to type.
  keepDocumentFocus(header);
  const toolbar = el('div.ed-ribbon', {}, ribbon.card);
  const navigation = el('div.canvas-navigation', { hidden: true });

  function setContext(context = 'paragraph', extra = []) {
    heading.textContent = context === 'image' || context === 'shape' ? '格式' : `${context === 'paragraph' ? '段落' : context === 'table' ? '表格' : context}格式`;
    tableSection.hidden = context !== 'table';
    paragraphSection.hidden = textSection.hidden = context === 'image' || context === 'shape';
    const appeared = ribbon.setContexts([...(context === 'table' ? ['table'] : context === 'image' ? ['image'] : context === 'shape' ? ['shape'] : []), ...extra]) || [];
    // Selecting a picture or shape brings up its format tab.
    if (appeared.includes('image')) ribbon.select('picture');
    if (appeared.includes('shape')) ribbon.select('shapeFormat');
    for (const tab of moduleTabs) if (appeared.includes(tab.contextual) && tab.selectOnAppear) ribbon.select(tab.id);
  }

  function refresh() {
    for (const { control, enabled, pressed, checked, value, unit } of states) {
      const disabled = !enabled();
      if (unit && control.getAttribute('aria-label') !== `${unit} (${recallUnit()})`) {
        control.setAttribute('aria-label', `${unit} (${recallUnit()})`);
        const label = control.closest('.ribbon-spin')?.querySelector('.ribbon-spin-unit'); if (label) label.textContent = recallUnit();
      }
      if (control.disabled !== disabled) control.disabled = disabled;
      if (pressed) { const state = pressed(); if (control.getAttribute('aria-pressed') !== state) control.setAttribute('aria-pressed', state); }
      if (checked) control.checked = !!checked();
      if (value && document.activeElement !== control) { const v = String(value() ?? ''); if (control.value !== v) control.value = v; }
    }
    if (!pane.hidden) for (const control of pane.querySelectorAll('button, select, input')) if (control.tabIndex !== 0) control.tabIndex = 0;
    refreshGallery();
    designs?.refresh();
    ribbon.refresh();
    titleBar.refresh();
  }

  // Keyboard chords for the ribbon's own commands, while the keyboard is in the document.
  const keyAbort = new AbortController();
  // Narrow windows hide some quick access commands, which may hold its tab stop.
  compact.addEventListener('change', () => titleBar.refreshQuickStop(), { signal: keyAbort.signal });
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented || isComposing(e) || !e.target?.matches?.('.canvas-input')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && !e.shiftKey && e.code === 'Digit8' && w.toggleMarks) { e.preventDefault(); w.toggleMarks(); }
    else if (e.shiftKey && !mod && !e.altKey && e.key === 'F3' && w.changeCase) { e.preventDefault(); w.changeCase('cycle'); }
    else if (mod && !e.altKey && !e.shiftKey && (e.code === 'BracketRight' || e.code === 'BracketLeft')) { e.preventDefault(); w.growFont?.(e.code === 'BracketRight' ? 1 : -1, 1); }
    else if (mod && !e.altKey && !e.shiftKey && shortcutCode(e) === 'KeyD' && w.fontDialog) { e.preventDefault(); w.fontDialog(); }
  }, { signal: keyAbort.signal });

  setContext();
  refresh();
  return { header, toolbar, navigation, inspector: pane, refresh, setContext, ribbon, titleBar, menus, entries,
    get ribbonModes() { return modes; },
    /** Ribbon display modes and KeyTips need the workspace the chrome sits in. */
    attach(workspace) { modes ??= createRibbonModes({ workspace, header, toolbar, ribbon, tabs: allTabs, titleBar: titleBar.el, focusEditor }); },
    focusSearch: () => titleBar.focusSearch(), focusMenubar: () => titleBar.focusMenubar(), showKeyTips: () => modes?.showKeyTips(),
    toggleFormattingPane: () => setExpanded(!expandedTools),
    closeInspector: () => setExpanded(false), destroy() { keyAbort.abort(); ribbon.destroy(); titleBar.destroy(); modes?.destroy(); closeMenu(); } };
}
