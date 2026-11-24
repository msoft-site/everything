/**
 * Dialogs of the Insert tab: Date and Time, Field, Format Page Numbers, Symbol, Equation, Icons,
 * Diagram, Signature Line, Drop Cap and Generate Picture. Each shows a live preview of what it
 * inserts and hands the result to the caller, which makes the change in one editor transaction.
 */
import { el, isComposing, fieldId, listboxKeys } from '../ui/dom.js';
import { clipText } from '../core/text.js';
import { openModal } from '../ui/modal.js';
import { segmented } from '../ui/segmented.js';
import { symbolName } from '../ui/symbols.js';
import { formatDatePicture, DATE_PICTURES, FIELD_CATALOG, DOCUMENT_PROPERTY_NAMES, GENERAL_FORMATS, NUMBER_FORMATS, PAGE_NUMBER_FORMATS, fieldInstruction, evaluateField } from '../engine/field-results.js';
import { linearToOmml, ommlToLinear, EQUATION_GALLERY } from '../engine/math-linear.js';
import { ommlToMathml } from '../engine/omml-mathml.js';
import { ICONS, ICON_CATEGORIES, iconSvg, searchIcons } from '../lib/icon-library.js';
import { DIAGRAM_LAYOUTS, DIAGRAM_COLORS, DEFAULT_OUTLINE, parseOutline, diagramShapes, hiddenDiagramItems } from '../engine/diagram-builder.js';

const field = (label, control, hint) => el('label.field', {}, el('span.field-label', {}, label), control, hint ? el('span.field-hint', {}, hint) : null);
const select = (label, options, value) => {
  const node = el('select.input', { 'aria-label': label }, ...options.map(([v, text]) => el('option', { value: v }, text)));
  if (value !== undefined) node.value = value;
  return node;
};
/** A modal form: content nodes, a primary action and Cancel. onSubmit returns false to keep it open. */
export function formDialog({ title, content, submit = '插入', onSubmit, wide = false, className = '', onClose }) {
  let modal;
  const error = el('p.field-error', { role: 'alert', hidden: true });
  const primary = el('button.btn.btn-primary', { type: 'submit' }, submit);
  const form = el(`form.ed-dialog-body.insert-dialog${className ? `.${className}` : ''}`, { onsubmit: async e => {
    e.preventDefault(); error.hidden = true;
    try { if (await onSubmit() !== false) modal.close(); }
    catch (failure) { error.textContent = failure.message || String(failure); error.hidden = false; }
  } }, ...content, error, el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), primary));
  modal = openModal({ title, content: form, wide, onClose });
  return { modal, form, primary, error };
}

/* ---- Date and Time ---- */
const PICTURE_KEY = 'documents.insert.datePicture';
const stored = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const store = (key, value) => { try { localStorage.setItem(key, value); } catch { /* A private window keeps no defaults. */ } };
/** Date and Time: the formats as today's date, a choice to keep it updated as a field, and a default. */
export function openDateTime({ onInsert, onClose }) {
  const now = new Date(), preferred = stored(PICTURE_KEY, DATE_PICTURES[0]);
  const list = el('div.ed-choice-list', { role: 'listbox', 'aria-label': '可用格式' });
  let chosen = DATE_PICTURES.includes(preferred) ? preferred : DATE_PICTURES[0];
  const options = DATE_PICTURES.map(picture => {
    const option = el('button.ed-choice', { type: 'button', role: 'option', 'aria-selected': String(picture === chosen), dataset: { picture }, onclick: () => pick(picture),
      ondblclick: () => { pick(picture); dialog.form.requestSubmit(); },
      // Enter inserts the format it is on, as a double-click does; Space only chooses it.
      onkeydown: e => { if (e.key === 'Enter' && !isComposing(e) && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); pick(picture); dialog.form.requestSubmit(); } } }, formatDatePicture(now, picture));
    return option;
  });
  list.append(...options);
  listboxKeys(list, option => pick(option.dataset.picture));
  const pick = picture => { chosen = picture; for (const o of options) o.setAttribute('aria-selected', String(o.dataset.picture === picture)); };
  const update = el('input', { type: 'checkbox', checked: stored(`${PICTURE_KEY}.update`, '0') === '1' });
  const setDefault = el('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { store(PICTURE_KEY, chosen); setDefault.textContent = '已设为默认值'; } }, '设为默认值');
  const dialog = formDialog({ title: '日期和时间', onClose, content: [list, el('div.row', {}, el('label.ed-check', {}, update, '自动更新'), el('span.spacer', { style: { flex: '1' } }), setDefault),
    el('p.field-hint', {}, '自动更新的日期为 DATE 或 TIME 域：更新域 (F9) 时将显示当前日期。')],
  onSubmit: () => { store(`${PICTURE_KEY}.update`, update.checked ? '1' : '0'); onInsert({ picture: chosen, text: formatDatePicture(new Date(), chosen), field: update.checked }); } });
  (options.find(o => o.dataset.picture === chosen) || options[0]).focus();
  return dialog.modal;
}

/* ---- Field ---- */
/** Field: a field type, its argument and switches, with the instruction and its result previewed. */
export function openFieldDialog({ context, bookmarks = [], onInsert, onClose }) {
  const categories = ['(全部)', ...new Set(FIELD_CATALOG.map(f => f.category))];
  const category = select('类别', categories.map(c => [c, c]));
  const names = el('select.input.insert-field-names', { size: 10, 'aria-label': '域名' });
  const description = el('p.field-hint');
  const argument = el('input.input', { type: 'text', 'aria-label': '域参数' });
  const property = select('属性', DOCUMENT_PROPERTY_NAMES.map(([label]) => [label, label]));
  const bookmark = select('书签', bookmarks.map(b => [b, b]));
  const picture = select('日期格式', DATE_PICTURES.map(p => [p, formatDatePicture(context.now || new Date(), p)]));
  const format = select('格式', [['', '(无)']]);
  const preserve = el('input', { type: 'checkbox', checked: true });
  const code = el('code.insert-field-code'), result = el('output.insert-field-result');
  const argumentField = field('参数', argument), propertyField = field('属性', property), bookmarkField = field('书签名', bookmark), pictureField = field('日期和时间格式', picture), formatField = field('格式', format);
  const fill = () => {
    const shown = FIELD_CATALOG.filter(f => category.value === '(全部)' || f.category === category.value);
    const current = names.value;
    names.replaceChildren(...shown.map(f => el('option', { value: f.name }, f.name)));
    names.value = shown.some(f => f.name === current) ? current : shown[0]?.name;
    sync();
  };
  const instruction = () => {
    const entry = FIELD_CATALOG.find(f => f.name === names.value);
    if (!entry) return '';
    const arg = entry.argument === 'property' ? property.value : entry.argument === 'bookmark' ? bookmark.value : entry.argument ? argument.value.trim() : '';
    return fieldInstruction({ name: entry.name, argument: arg, picture: entry.picture ? picture.value : '', format: format.value, preserve: preserve.checked });
  };
  const sync = () => {
    const entry = FIELD_CATALOG.find(f => f.name === names.value);
    if (!entry) return;
    description.textContent = entry.description;
    argumentField.hidden = !entry.argument || ['property', 'bookmark'].includes(entry.argument);
    argument.placeholder = entry.argument === 'identifier' ? 'Figure' : '';
    propertyField.hidden = entry.argument !== 'property'; bookmarkField.hidden = entry.argument !== 'bookmark'; pictureField.hidden = !entry.picture;
    const formats = entry.formats === 'page' ? PAGE_NUMBER_FORMATS : entry.number ? NUMBER_FORMATS : entry.format ? GENERAL_FORMATS : [];
    const kind = formats.map(([v]) => v).join();
    if (format.dataset.kind !== kind) {
      const chosen = format.value;
      format.replaceChildren(el('option', { value: '' }, '(无)'), ...formats.map(([v, label]) => el('option', { value: v }, label)));
      format.value = formats.some(([v]) => v === chosen) ? chosen : '';
      format.dataset.kind = kind;
    }
    formatField.hidden = !formats.length;
    const text = instruction();
    code.textContent = `{${text}}`;
    const value = evaluateField(text, context);
    result.textContent = value === null ? (entry.name === 'PAGE' ? String(context.page ?? 1) : entry.name === 'SEQ' ? '1' : entry.name === 'REF' ? '书签文本（更新域时刷新）' : '') : value || '(空)';
  };
  for (const control of [category]) control.addEventListener('change', fill);
  for (const control of [names, argument, property, bookmark, picture, format, preserve]) { control.addEventListener('change', sync); control.addEventListener('input', sync); }
  const dialog = formDialog({ title: '域', wide: true, className: 'insert-field', onClose, content: [
    el('div.insert-field-grid', {},
      el('div.insert-field-list', {}, field('类别', category), field('域名', names)),
      el('div.insert-field-options', {}, description, argumentField, propertyField, bookmarkField, pictureField, formatField,
        el('label.ed-check', {}, preserve, '更新时保留格式'),
        el('div.insert-field-preview', {}, el('span.field-label', {}, '域代码'), code, el('span.field-label', {}, '预览结果'), result))),
  ], onSubmit: () => {
    const entry = FIELD_CATALOG.find(f => f.name === names.value);
    if (entry?.argument === 'identifier' && !/^\p{L}[\p{L}\p{M}\p{N}_]{0,39}$/u.test(argument.value.trim())) throw new Error('请输入由字母和数字组成的题注序号名称，例如 Figure。');
    if (entry?.argument === 'bookmark' && !bookmark.value) throw new Error('此文档中没有可引用的书签。');
    return onInsert({ name: entry.name, instruction: instruction() });
  } });
  fill(); names.focus();
  return dialog.modal;
}

/* ---- Format Page Numbers ---- */
export const PAGE_FORMATS = [['decimal', '1, 2, 3, …'], ['decimalZero', '01, 02, 03, …'], ['lowerLetter', 'a, b, c, …'], ['upperLetter', 'A, B, C, …'], ['lowerRoman', 'i, ii, iii, …'], ['upperRoman', 'I, II, III, …']];
export function openFormatPageNumbers({ current = {}, onApply, onClose }) {
  const format = select('编号格式', PAGE_FORMATS, current.format || 'decimal');
  let mode = Number.isInteger(current.start) ? 'start' : 'continue';
  const start = el('input.input', { type: 'number', min: 0, max: 32767, step: 1, value: current.start ?? 1, 'aria-label': '起始页码', disabled: mode !== 'start' });
  const modes = segmented([['continue', '续前节'], ['start', '起始页码']], mode, value => { mode = value; start.disabled = value !== 'start'; if (!start.disabled) start.focus(); }, '页码编号');
  return formDialog({ title: '页码格式', submit: '确定', onClose, content: [field('编号格式', format),
    el('fieldset.insert-fieldset', {}, el('legend.field-label', {}, '页码编号'), modes, field('起始页码', start)),
    el('p.field-hint', {}, '应用于光标所在节。页眉和页脚中的页码将采用此设置。')],
  onSubmit: () => {
    if (mode === 'start' && (!start.checkValidity() || start.value === '')) throw new Error('请输入 0 到 32767 之间的起始页码。');
    return onApply({ format: format.value, start: mode === 'start' ? Number(start.value) : null });
  } }).modal;
}

/* ---- Symbol ---- */
export const SYMBOL_SUBSETS = [['基本拉丁语', 0x21, 0x7E], ['拉丁语-1 补充', 0xA1, 0xFF], ['拉丁语扩充-A', 0x100, 0x17F], ['拉丁语扩充-B', 0x180, 0x24F], ['国际音标扩展', 0x250, 0x2AF],
  ['占位修饰字符', 0x2B0, 0x2FF], ['希腊语和科普特语', 0x370, 0x3FF], ['西里尔语', 0x400, 0x4FF], ['希伯来语', 0x5D0, 0x5EA], ['阿拉伯语', 0x621, 0x64A], ['常用标点', 0x2010, 0x205E],
  ['上标和下标', 0x2070, 0x209C], ['货币符号', 0x20A0, 0x20C0], ['类似字母的符号', 0x2100, 0x214F], ['数字形式', 0x2150, 0x218B], ['箭头', 0x2190, 0x21FF],
  ['数学运算符', 0x2200, 0x22FF], ['其他技术符号', 0x2300, 0x23FF], ['带括号的字母数字', 0x2460, 0x24FF], ['制表符', 0x2500, 0x257F], ['方块元素', 0x2580, 0x259F],
  ['几何图形', 0x25A0, 0x25FF], ['杂项符号', 0x2600, 0x26FF], ['装饰符号', 0x2700, 0x27BF]];
/** Special characters: [label, character]. Names are plain descriptions. */
export const SPECIAL_CHARACTERS = [['长划线 (Em Dash)', '\u2014'], ['短划线 (En Dash)', '\u2013'], ['不间断连字符', '\u2011'], ['可选连字符', '\u00AD'], ['全角空格 (Em Space)', '\u2003'], ['半角空格 (En Space)', '\u2002'], ['四分之一角空格', '\u2005'], ['不间断空格', '\u00A0'], ['版权所有 (©)', '\u00A9'], ['注册商标 (®)', '\u00AE'], ['商标 (™)', '\u2122'], ['分节符号 (§)', '\u00A7'], ['段落标记 (¶)', '\u00B6'], ['省略号 (…)', '\u2026'], ['单引号（开）', '\u2018'], ['单引号（闭）', '\u2019'], ['双引号（开）', '\u201C'], ['双引号（闭）', '\u201D'], ['零宽空格', '\u200B'], ['单词连接符', '\u2060'], ['度数符号 (°)', '\u00B0'], ['正负号 (±)', '\u00B1'], ['项目符号 (•)', '\u2022'], ['短剑号 (†)', '\u2020'], ['双短剑号 (‡)', '\u2021']];
export const SYMBOL_FONTS = ['(普通文本)', 'Noto Sans', 'Noto Serif', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Segoe UI Symbol'];
const assigned = ch => /\P{C}/u.test(ch) && !/\p{Cn}/u.test(ch);
const RECENT_KEY = 'documents.insert.recentSymbols';
export const DEFAULT_RECENT = ['€', '£', '¥', '©', '®', '™', '±', '≠', '≤', '≥', '÷', '×', '∞', 'µ', 'α', 'β', 'π', 'Ω', '∑', '☺'];
export function recentSymbols() { try { const list = JSON.parse(localStorage.getItem(RECENT_KEY) || 'null'); return Array.isArray(list) && list.length ? list.slice(0, 20) : DEFAULT_RECENT; } catch { return DEFAULT_RECENT; } }
export function rememberSymbol(ch, font = null) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([ch, ...recentSymbols().filter(c => c !== ch)].slice(0, 20))); } catch { /* Recent symbols are a convenience. */ }
  if (font) { try { localStorage.setItem(`${RECENT_KEY}.font`, font); } catch { /* ignore */ } }
}
const codeName = cp => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
/** Symbol: browse by Unicode subset, type a character code, or pick a special character. Inserting keeps the dialog open. */
export function openSymbolDialog({ onInsert, onClose }) {
  let tab = 'symbols', chosen = recentSymbols()[0];
  const font = select('字体', SYMBOL_FONTS.map(f => [f, f]));
  const subset = select('子集', SYMBOL_SUBSETS.map(([name], i) => [String(i), name]));
  const grid = el('div.insert-symbol-grid', { role: 'grid', 'aria-label': '字符' });
  const recent = el('div.insert-symbol-recent', { role: 'group', 'aria-label': '最近使用的符号' });
  const code = el('input.input.insert-symbol-code', { type: 'text', maxLength: 6, 'aria-label': '字符代码 (十六进制)', placeholder: '00A9' });
  const name = el('span.insert-symbol-name', { 'aria-live': 'polite' });
  const preview = el('span.insert-symbol-preview', { 'aria-hidden': 'true' });
  const describe = ch => { const cp = ch.codePointAt(0); name.textContent = `${symbolName(ch) !== ch ? `${symbolName(ch)} · ` : ''}${codeName(cp)}`; preview.textContent = ch; code.value = cp.toString(16).toUpperCase().padStart(4, '0'); };
  const choose = (ch, button) => { chosen = ch; for (const b of grid.querySelectorAll('[aria-selected="true"]')) b.setAttribute('aria-selected', 'false'); button?.setAttribute('aria-selected', 'true'); describe(ch); };
  const fontStyle = () => (font.value === '(普通文本)' || font.value === '(normal text)') ? '' : `"${font.value}"`;
  const cell = (ch, onPick) => el('button.insert-symbol', { type: 'button', role: 'gridcell', tabindex: -1, title: `${symbolName(ch) !== ch ? symbolName(ch) : ch} (${codeName(ch.codePointAt(0))})`, 'aria-label': symbolName(ch),
    style: { fontFamily: fontStyle() }, onclick: e => onPick(ch, e.currentTarget), ondblclick: () => { onPick(ch); dialog.form.requestSubmit(); } }, ch);
  const drawGrid = () => {
    const [, from, to] = SYMBOL_SUBSETS[Number(subset.value)];
    const chars = []; for (let cp = from; cp <= to && chars.length < 512; cp++) { const ch = String.fromCodePoint(cp); if (assigned(ch)) chars.push(ch); }
    grid.replaceChildren(...chars.map(ch => cell(ch, choose)));
    // The grid's Tab stop is the chosen character when the subset holds it, so Enter there inserts what the dialog describes.
    const start = [...grid.children].find(b => b.textContent === chosen);
    if (start) { start.tabIndex = 0; start.setAttribute('aria-selected', 'true'); } else if (grid.firstElementChild) grid.firstElementChild.tabIndex = 0;
  };
  // The recent symbols are one Tab stop too (each cell alone was out of the keyboard's reach); Left, Right, Home and End move along them.
  const drawRecent = () => { recent.replaceChildren(...recentSymbols().map(ch => cell(ch, choose))); if (recent.firstElementChild) recent.firstElementChild.tabIndex = 0; };
  recent.addEventListener('keydown', e => {
    if (isComposing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
    const cells = [...recent.children], at = cells.indexOf(document.activeElement); if (at < 0) return;
    const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: cells.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = cells[Math.max(0, Math.min(cells.length - 1, next))];
    cells[at].tabIndex = -1; target.tabIndex = 0; target.focus(); choose(target.textContent, null);
  });
  grid.addEventListener('keydown', e => {
    const cells = [...grid.children], at = cells.indexOf(document.activeElement); if (at < 0) return;
    const columns = Math.max(1, Math.round(grid.clientWidth / (cells[0]?.offsetWidth || 32)) || 16);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns, Home: -at, End: cells.length - 1 - at }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = cells[Math.max(0, Math.min(cells.length - 1, at + step))];
    cells[at].tabIndex = -1; next.tabIndex = 0; next.focus(); choose(next.textContent, next);
  });
  code.addEventListener('input', () => {
    const cp = parseInt(code.value, 16);
    if (!/^[0-9a-f]{2,6}$/i.test(code.value) || !(cp > 0x1F && cp <= 0x10FFFF) || cp >= 0xD800 && cp <= 0xDFFF) return;
    const ch = String.fromCodePoint(cp); chosen = ch; name.textContent = `${symbolName(ch) !== ch ? `${symbolName(ch)} · ` : ''}${codeName(cp)}`; preview.textContent = ch;
    const index = SYMBOL_SUBSETS.findIndex(([, a, b]) => cp >= a && cp <= b);
    if (index >= 0 && subset.value !== String(index)) { subset.value = String(index); drawGrid(); }
    const button = [...grid.children].find(b => b.textContent === ch); if (button) { choose(ch, button); button.scrollIntoView({ block: 'nearest' }); }
  });
  // Another subset chooses its first character, as the arrows choose the one they reach.
  subset.addEventListener('change', () => { drawGrid(); const first = grid.firstElementChild; if (first && first.textContent !== chosen) choose(first.textContent, first); });
  font.addEventListener('change', () => { for (const b of [...grid.children, ...recent.children]) b.style.fontFamily = fontStyle(); preview.style.fontFamily = fontStyle(); });
  const special = el('div.ed-choice-list.insert-special', { role: 'listbox', 'aria-label': '特殊字符' }, ...SPECIAL_CHARACTERS.map(([label, ch]) =>
    el('button.ed-choice.insert-special-row', { type: 'button', role: 'option', 'aria-selected': 'false', onclick: e => { chosen = ch; for (const o of special.children) o.setAttribute('aria-selected', String(o === e.currentTarget)); describe(ch); },
      ondblclick: () => { chosen = ch; dialog.form.requestSubmit(); } },
    el('span.insert-special-char', {}, /[\s\u00AD\u200B\u2060]/.test(ch) ? '\u00B7' : ch), el('span', {}, label), el('span.insert-special-keys', {}, `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`))));
  listboxKeys(special, option => option.click());
  // Enter inserts the character it is on, as a double-click does (the dialog stays open for the next); Space only chooses it.
  const insertOnEnter = e => {
    if (e.key !== 'Enter' || isComposing(e) || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const button = e.target.closest?.('button'); if (!button) return;
    e.preventDefault(); button.click(); dialog.form.requestSubmit();
  };
  for (const node of [grid, recent, special]) node.addEventListener('keydown', insertOnEnter);
  const symbolsPane = el('div.insert-symbol-pane', {}, el('div.insert-symbol-filters', {}, field('字体', font), field('子集', subset)), grid,
    el('div.insert-symbol-footer', {}, preview, el('div', {}, name, field('字符代码', code))), el('span.field-label', {}, '最近使用的符号'), recent);
  const specialPane = el('div.insert-symbol-pane', { hidden: true }, special);
  const tabs = segmented([['symbols', '符号'], ['special', '特殊字符']], tab, value => { tab = value; symbolsPane.hidden = value !== 'symbols'; specialPane.hidden = value !== 'special'; }, '符号页面');
  const dialog = formDialog({ title: '符号', wide: true, className: 'insert-symbols', onClose, content: [tabs, symbolsPane, specialPane], onSubmit: () => {
    if (!chosen) throw new Error('请选择一个字符。');
    const family = tab === 'symbols' && font.value !== '(普通文本)' && font.value !== '(normal text)' ? font.value : null;
    onInsert(chosen, family); rememberSymbol(chosen); drawRecent();
    return false; // Stay open for the next character, as symbol tables do.
  } });
  dialog.primary.textContent = '插入';
  // Open on the subset that holds the chosen (most recent) symbol, with that symbol chosen and focused.
  const home = SYMBOL_SUBSETS.findIndex(([, a, b]) => chosen.codePointAt(0) >= a && chosen.codePointAt(0) <= b);
  if (home >= 0) subset.value = String(home);
  drawGrid(); drawRecent(); describe(chosen);
  (grid.querySelector('[tabindex="0"]') || grid.firstElementChild)?.focus();
  return dialog.modal;
}

/* ---- Equation ---- */
export function openEquationDialog({ initial = '', display = false, onInsert, onClose, editing = false }) {
  const input = el('textarea.input.insert-equation-input', { rows: 3, 'aria-label': '线性格式公式', spellcheck: false, placeholder: '例如: x = (-b ± √(b^2 - 4ac))/2a' }, initial);
  const preview = el('div.insert-equation-preview', { 'aria-live': 'polite' });
  const own = el('input', { type: 'checkbox', checked: display });
  const gallery = el('div.insert-equation-gallery', { role: 'group', 'aria-label': '常用公式' }, ...EQUATION_GALLERY.map(entry => el('button.btn.btn-outline.btn-sm', { type: 'button', title: entry.linear, onclick: () => { input.value = entry.linear; render(); input.focus(); } }, entry.name)));
  const symbols = el('div.insert-equation-symbols', { role: 'group', 'aria-label': '符号' }, ...['±', '×', '÷', '≠', '≤', '≥', '≈', '∞', '√', '∑', '∫', '∂', 'π', 'θ', 'α', 'β', '→', '∈', '■', '█'].map(ch => el('button.insert-symbol', { type: 'button', title: symbolName(ch), onclick: () => {
    const [a, b] = [input.selectionStart, input.selectionEnd]; input.setRangeText(ch, a, b, 'end'); render(); input.focus();
  } }, ch)));
  const render = () => {
    const text = input.value.trim();
    if (!text) { preview.replaceChildren(el('span.field-hint', {}, '键入公式以在此处查看预览。')); return; }
    try { preview.innerHTML = ommlToMathml(linearToOmml(text, { display: own.checked })); } catch { preview.textContent = text; }
  };
  input.addEventListener('input', render); own.addEventListener('change', render);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !isComposing(e)) { e.preventDefault(); input.form.requestSubmit(); } });
  const dialog = formDialog({ title: editing ? '编辑公式' : '公式', submit: editing ? '更新' : '插入', wide: true, className: 'insert-equation', onClose, content: [
    field('公式', input, '线性格式: a/b 分数，x^2 上标，x_i 下标，√(x) 根号，∑_(i=1)^n 求和，■(a&b@c&d) 矩阵，\\alpha 表示希腊字母。'),
    symbols, el('div', {}, el('span.field-label', {}, '预览'), preview), el('label.ed-check', {}, own, '在其独立行上显示'),
    el('details.insert-equation-more', {}, el('summary', {}, '常用公式'), gallery)],
  onSubmit: () => {
    const text = input.value.trim(); if (!text) throw new Error('请先输入公式。');
    return onInsert({ linear: text, display: own.checked });
  } });
  render(); input.focus(); input.select();
  return dialog.modal;
}
export { linearToOmml, ommlToLinear };

/* ---- Icons ---- */
/** Icons: search and browse the original icon set; several icons can be inserted at once, in one color. */
export function openIconsDialog({ onInsert, onClose }) {
  const search = el('input.input', { type: 'search', 'aria-label': '搜索图标', placeholder: '搜索图标' });
  const category = select('类别', [['', '所有类别'], ...ICON_CATEGORIES.map(c => [c.id, c.label])]);
  const color = el('input.insert-icon-color', { type: 'color', value: stored('documents.insert.iconColor', '#1F3864'), 'aria-label': '图标颜色' });
  const grid = el('div.insert-icon-grid', { role: 'group', 'aria-label': '图标' });
  const count = el('span.field-hint', { 'aria-live': 'polite' });
  const chosen = new Set();
  const draw = () => {
    const found = searchIcons(search.value, category.value || null);
    grid.replaceChildren(...found.map(icon => el('button.insert-icon', { type: 'button', 'aria-pressed': String(chosen.has(icon.id)), title: icon.name, 'aria-label': icon.name,
      html: iconSvg(icon.id, { color: color.value.toUpperCase(), size: 36 }),
      onclick: e => { if (chosen.has(icon.id)) chosen.delete(icon.id); else chosen.add(icon.id); e.currentTarget.setAttribute('aria-pressed', String(chosen.has(icon.id))); sync(); },
      ondblclick: () => { chosen.add(icon.id); dialog.form.requestSubmit(); } })));
    if (!found.length) grid.append(el('p.field-hint', {}, '未找到匹配的图标。请尝试其他关键词。'));
    sync();
  };
  const sync = () => { count.textContent = `${searchIcons(search.value, category.value || null).length} 个图标 · 已选择 ${chosen.size} 个`; dialog && (dialog.primary.textContent = chosen.size > 1 ? `插入 (${chosen.size})` : '插入'); };
  search.addEventListener('input', draw); category.addEventListener('change', draw); color.addEventListener('input', draw);
  const dialog = formDialog({ title: '图标', wide: true, className: 'insert-icons', onClose, content: [el('div.insert-icon-filters', {}, search, category, el('label.insert-icon-color-label', {}, color, '颜色')), grid, count],
    onSubmit: () => { if (!chosen.size) throw new Error('请选择一个或多个图标。'); store('documents.insert.iconColor', color.value); return onInsert([...chosen].map(id => ICONS.find(i => i.id === id)), color.value.toUpperCase()); } });
  draw(); search.focus();
  return dialog.modal;
}

/* ---- Diagram ---- */
const NS_SVG = 'http://www.w3.org/2000/svg';
/** An SVG sketch of a diagram's shapes (rectangles, ovals and polygons), for the dialog and gallery. */
export function diagramSketch(layoutId, items, colors = 'blue', width = 320, height = 180) {
  const palette = DIAGRAM_COLORS.find(c => c.id === colors) || DIAGRAM_COLORS[0];
  // Lay out at document size (6 in wide) so spacing reads as it will on the page, then scale the drawing down.
  const realWidth = 576, realHeight = Math.round(576 * height / width);
  const shapes = diagramShapes(layoutId, items, { width: realWidth * 9525, height: realHeight * 9525 });
  const svg = document.createElementNS(NS_SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${realWidth} ${realHeight}`); svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height)); svg.classList.add('insert-diagram-sketch');
  const add = (name, attrs, text) => { const n = document.createElementNS(NS_SVG, name); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); if (text) n.textContent = text; svg.append(n); return n; };
  for (const s of shapes) {
    const x = s.x / 9525, y = s.y / 9525, w = s.w / 9525, h = s.h / 9525;
    const fill = s.role === 'connector' ? '#7F7F7F' : s.role === 'detail' ? `#${palette.light}` : s.role === 'accent' ? '#A6A6A6' : `#${palette.fills[(s.index || 0) % palette.fills.length]}`;
    const attrs = { fill, 'fill-opacity': s.alpha || 1, stroke: s.role === 'node' ? '#fff' : 'none' };
    const turn = s.rotation ? { transform: `rotate(${s.rotation / 60000} ${x + w / 2} ${y + h / 2})` } : {};
    if (s.preset === 'ellipse') add('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, ...attrs });
    else if (s.preset === 'triangle') add('polygon', { points: `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`, ...attrs });
    else if (s.preset === 'trapezoid') { const inset = Math.min(w, h) * (s.adj ?? 25000) / 100000; add('polygon', { points: `${x + inset},${y} ${x + w - inset},${y} ${x + w},${y + h} ${x},${y + h}`, ...attrs }); }
    else if (s.preset === 'rightArrow') add('polygon', { points: `${x},${y + h * .25} ${x + w * .55},${y + h * .25} ${x + w * .55},${y} ${x + w},${y + h / 2} ${x + w * .55},${y + h} ${x + w * .55},${y + h * .75} ${x},${y + h * .75}`, ...attrs, ...turn });
    else if (s.preset === 'chevron' || s.preset === 'homePlate') { const d = Math.min(w, h) / 2; add('polygon', { points: `${x},${y} ${x + w - d},${y} ${x + w},${y + h / 2} ${x + w - d},${y + h} ${x},${y + h}${s.preset === 'chevron' ? ` ${x + d},${y + h / 2}` : ''}`, ...attrs }); }
    else add('rect', { x, y, width: w, height: h, rx: s.preset === 'roundRect' ? Math.min(w, h) / 6 : 0, ...attrs });
    const label = String(s.text || '').split('\n')[0];
    if (label && w > 30) add('text', { x: x + w / 2, y: y + h / 2 + (s.preset === 'triangle' ? h / 4 : 0), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': Math.max(10, Math.min(22, w / Math.max(4, label.length) * 1.6, h * 0.4)), 'font-family': 'system-ui, sans-serif', fill: s.role === 'detail' ? `#${palette.lightText}` : '#fff' }, clipText(label, 24));
  }
  return svg;
}
/** Diagram: choose a layout and colors and type the outline; the preview follows each keystroke. */
export function openDiagramDialog({ initial = null, editing = false, onInsert, onClose }) {
  let layout = initial?.layout || 'basicProcess';
  const colors = select('配色方案', DIAGRAM_COLORS.map(c => [c.id, c.name]), initial?.colors || 'blue');
  const outline = el('textarea.input.insert-diagram-outline', { rows: 10, 'aria-label': '图示文本', spellcheck: true }, initial?.outline ?? DEFAULT_OUTLINE);
  const preview = el('div.insert-diagram-preview', { 'aria-hidden': 'true' });
  const layouts = el('div.insert-diagram-layouts', { role: 'listbox', 'aria-label': '版式' });
  const sample = parseOutline('第一项\n第二项\n第三项\n第四项');
  const options = DIAGRAM_LAYOUTS.map(entry => el('button.insert-diagram-layout', { type: 'button', role: 'option', 'aria-selected': String(entry.id === layout), tabindex: entry.id === layout ? 0 : -1, title: `${entry.name}: ${entry.hint}`, dataset: { layout: entry.id },
    onclick: () => { layout = entry.id; for (const o of options) { o.setAttribute('aria-selected', String(o.dataset.layout === layout)); o.tabIndex = o.dataset.layout === layout ? 0 : -1; } render(); } },
  diagramSketch(entry.id, entry.id === 'orgChart' ? parseOutline('负责人\n  成员A\n  成员B\n  成员C') : sample, 'blue', 120, 68), el('span', {}, entry.name), el('span.insert-diagram-category', {}, entry.category)));
  layouts.append(...options);
  layouts.addEventListener('keydown', e => {
    const at = options.indexOf(document.activeElement), step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    const edge = { Home: options[0], End: options.at(-1) }[e.key];
    if (at < 0 || !step && !edge) return; e.preventDefault(); const next = edge || options[(at + step + options.length) % options.length]; next.focus(); next.click();
  });
  // Items the chosen layout leaves out of its picture (deeper levels, sub-items, items past its room) are named, not dropped silently.
  const omitted = el('p.field-hint.insert-diagram-omitted', { 'aria-live': 'polite', hidden: true });
  const render = () => {
    const items = parseOutline(outline.value), hidden = hiddenDiagramItems(layout, items), name = DIAGRAM_LAYOUTS.find(entry => entry.id === layout)?.name || '当前版式';
    preview.replaceChildren(diagramSketch(layout, items, colors.value));
    const list = hidden.length > 6 ? `${hidden.slice(0, 5).map(t => `“${t}”`).join('、')}等 ${hidden.length} 项` : hidden.map(t => `“${t}”`).join('、');
    omitted.textContent = hidden.length ? `${name}未显示${hidden.length === 1 ? '该项目' : `这 ${hidden.length} 个项目`}: ${list}。这些项目仍保留在文本中；切换到其他版式即可显示。` : '';
    omitted.hidden = !hidden.length;
  };
  outline.addEventListener('input', render); colors.addEventListener('change', render);
  outline.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || isComposing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    // At the start of a line (before its text), Tab and Shift+Tab indent and outdent it, as in an outline.
    // Elsewhere they move on to the next or previous control, so the keyboard can leave the box.
    const caret = outline.selectionStart, start = outline.value.lastIndexOf('\n', caret - 1) + 1, lead = /^ */.exec(outline.value.slice(start))[0].length;
    if (outline.selectionEnd !== caret || caret - start > lead || e.shiftKey && lead < 2) return;
    e.preventDefault();
    if (e.shiftKey) { outline.setRangeText('', start, start + 2); outline.selectionStart = outline.selectionEnd = Math.max(start, caret - 2); }
    else { outline.setRangeText('  ', start, start); outline.selectionStart = outline.selectionEnd = caret + 2; }
    render();
  });
  const dialog = formDialog({ title: editing ? '编辑图示' : '图示', submit: editing ? '更新' : '插入', wide: true, className: 'insert-diagram', onClose, content: [
    el('div.insert-diagram-grid', {}, layouts,
      el('div.insert-diagram-editor', {}, field('文本 (每行一个项目；行首按 Tab 键可缩进详细内容)', outline), field('配色方案', colors), preview, omitted))],
  onSubmit: () => {
    const items = parseOutline(outline.value);
    if (!items.length) throw new Error('请至少输入一个项目。');
    return onInsert({ layout, colors: colors.value, items });
  } });
  render(); outline.focus();
  return dialog.modal;
}

/* ---- Signature line ---- */
export function openSignatureDialog({ onInsert, onClose }) {
  const signer = el('input.input', { type: 'text', 'aria-label': '建议的签署人' }), title = el('input.input', { type: 'text', 'aria-label': '建议的签署人职务' });
  const email = el('input.input', { type: 'email', 'aria-label': '建议的签署人电子邮件地址' }), instructions = el('textarea.input', { rows: 2, 'aria-label': '向签署人提供的说明' });
  const date = el('input', { type: 'checkbox', checked: true });
  const dialog = formDialog({ title: '签名行', onClose, content: [field('建议的签署人', signer), field('建议的签署人职务', title), field('建议的签署人电子邮件地址', email),
    field('向签署人提供的说明', instructions, '作为该签名行的可选替代文字。'), el('label.ed-check', {}, date, '在签名行中显示签署日期')],
  onSubmit: () => onInsert({ signer: signer.value.trim(), title: title.value.trim(), email: email.value.trim(), instructions: instructions.value.trim(), date: date.checked }) });
  signer.focus();
  return dialog.modal;
}

/* ---- Drop cap ---- */
export function openDropCapDialog({ state, fonts = [], onApply, onClose }) {
  let mode = state.mode || 'none';
  const font = select('字体', [['', '(正文字体)'], ...fonts.map(f => [f, f])], state.fontFamily || '');
  const lines = el('input.input', { type: 'number', min: 1, max: 10, step: 1, value: state.lines || 3, 'aria-label': '下沉行数' });
  const distance = el('input.input', { type: 'number', min: 0, max: 72, step: 0.5, value: state.distance || 0, 'aria-label': '距正文距离 (磅)' });
  const options = el('div.insert-dropcap-options', {}, field('字体', font), field('下沉行数', lines), field('距正文距离 (磅)', distance));
  const sync = () => { for (const c of [font, lines, distance]) c.disabled = mode === 'none'; };
  const position = segmented([['none', '无'], ['drop', '下沉'], ['margin', '悬挂']], mode, value => { mode = value; sync(); }, '位置');
  const dialog = formDialog({ title: '首字下沉', submit: '确定', onClose, content: [el('div', {}, el('span.field-label', {}, '位置'), position), options],
    onSubmit: () => {
      // The distance's arrows step by half points, but any distance in range is taken: Word steps by tenths of an
      // inch (0.1 in is 7.2 pt), and a document's own distance is kept in twentieths of a point.
      const distanceInRange = distance.value !== '' && !distance.validity.badInput && !distance.validity.rangeUnderflow && !distance.validity.rangeOverflow;
      if (mode !== 'none' && (!lines.checkValidity() || !distanceInRange)) throw new Error('下沉行数必须在 1 到 10 之间，且距离在 0 到 72 磅之间。');
      return onApply({ mode, lines: Number(lines.value), distance: Number(distance.value), fontFamily: font.value || null });
    } });
  // The fields are checked on OK, above, with the message in words.
  dialog.form.noValidate = true;
  sync();
  return dialog.modal;
}

/* ---- Generated picture ---- */
export function openGenerateDialog({ generate, onInsert, onClose }) {
  const prompt = el('textarea.input', { rows: 3, 'aria-label': '描述图片', placeholder: '例如：黎明时分的海边灯塔水彩画' });
  const preview = el('div.insert-generate-preview', { 'aria-live': 'polite' });
  let file = null, busy = false;
  const dialog = formDialog({ title: '生成图片', submit: '生成', onClose, content: [field('描述图片', prompt), preview,
    el('p.field-hint', {}, '图片描述将发送给 AI 生成图片。插入前请先检查。')],
  onSubmit: async () => {
    // The description the picture was made from is its alternative text, which screen readers announce.
    if (file) { await onInsert(file, { alt: prompt.value.trim() }); return true; }
    if (busy) return false;
    if (!prompt.value.trim()) throw new Error('请先输入图片描述。');
    busy = true; dialog.primary.disabled = true; preview.replaceChildren(el('span.field-hint', {}, '正在生成…'));
    try {
      file = await generate(prompt.value.trim());
      const url = URL.createObjectURL(file);
      preview.replaceChildren(el('img', { src: url, alt: prompt.value.trim(), onload: () => URL.revokeObjectURL(url) }));
      dialog.primary.textContent = '插入';
    } catch (e) {
      // The error shows below; "Generating…" does not stay above it.
      preview.replaceChildren();
      throw e;
    } finally { busy = false; dialog.primary.disabled = false; }
    return false;
  } });
  prompt.addEventListener('input', () => { if (file) { file = null; dialog.primary.textContent = '生成'; preview.replaceChildren(); } });
  prompt.focus();
  return dialog.modal;
}
export { fieldId };
