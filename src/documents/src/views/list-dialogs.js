import { el, fieldId, isComposing } from '../ui/dom.js';
import { openSymbolPicker } from '../ui/symbols.js';
import { NUMBER_STYLES, LIST_SUFFIXES } from '../engine/list-definitions.js';
import { fontChoices } from './font-picker.js';
import { field, checkbox, group, select, distance, openFormatDialog, colorField } from './format-dialog-kit.js';

/** Bullet characters that read well in any font; Symbol… offers the rest. */
export const BULLET_CHOICES = ['•', '◦', '▪', '▫', '■', '□', '●', '○', '◆', '◇', '❖', '➢', '➤', '►', '▸', '✓', '✔', '✗', '★', '☆', '♦', '–', '—', '→', '⇒', '※', '¶', '§'];
const ALIGN = [['left', '左对齐'], ['center', '居中'], ['right', '右对齐']];
const numeral = (n, format) => {
  if (format === 'none') return '';
  if (format === 'decimalZero') return String(n).padStart(2, '0');
  if (/Letter$/.test(format)) { const s = String.fromCharCode(64 + ((n - 1) % 26) + 1).repeat(Math.floor((n - 1) / 26) + 1); return format === 'lowerLetter' ? s.toLowerCase() : s; }
  if (/Roman$/.test(format)) {
    let text = '', v = n;
    for (const [k, t] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (v >= k) { text += t; v -= k; }
    return format === 'lowerRoman' ? text.toLowerCase() : text;
  }
  return String(n);
};
const fontSelect = (label, value) => {
  const list = el('datalist', { id: fieldId('fmt-fonts') }, ...fontChoices().map(name => el('option', { value: name })));
  const input = el('input.input', { type: 'text', value: value || '', placeholder: '与正文相同', list: list.id, 'aria-label': label, autocomplete: 'off' });
  return { input, node: el('span.fmt-font-input', {}, input, list) };
};
const listPreview = () => el('div.fmt-list-preview', { 'aria-hidden': 'true' });
function paintList(node, labels, { alignment = 'left', font = '', bold = false, italic = false, color = null } = {}) {
  node.replaceChildren(...labels.map(([label, depth = 0]) => el('div.fmt-list-preview-row', { style: { paddingLeft: `${depth * 18}px` } },
    el('span.fmt-list-preview-label', { style: { textAlign: alignment === 'center' ? 'center' : alignment === 'right' ? 'right' : 'left', fontFamily: font ? `"${font}", system-ui` : '', fontWeight: bold ? '700' : '', fontStyle: italic ? 'italic' : '', color: color && color !== 'auto' ? `#${color}` : '' } }, label),
    el('span.fmt-list-preview-line'))));
}

/** Define New Bullet: a character, its font and color, and the bullet's alignment. */
export function openDefineBullet({ level, apply, onClose }) {
  let character = level?.format === 'bullet' ? level.text : '•';
  const grid = el('div.fmt-symbol-grid', { role: 'radiogroup', 'aria-label': '项目符号字符' });
  const custom = el('input.input', { type: 'text', maxLength: 2, value: character, 'aria-label': '项目符号字符', autocomplete: 'off', oninput: () => { if ([...custom.value].length) { character = [...custom.value][0]; paint(); } } });
  const font = fontSelect('项目符号字体', level?.markerStyle?.fontAscii);
  const color = colorField('项目符号颜色', level?.markerStyle?.color || 'auto', { onchange: () => paint() });
  const alignment = select('项目符号对齐方式', ALIGN, level?.alignment || 'left', { onchange: () => paint() });
  const preview = listPreview();
  function paint() {
    for (const button of grid.children) button.setAttribute('aria-checked', String(button.textContent === character));
    // The group is one Tab stop, on the chosen bullet (the first when the character is not one of these).
    const stop = [...grid.children].find(button => button.textContent === character) || grid.firstChild;
    for (const button of grid.children) button.tabIndex = button === stop ? 0 : -1;
    if ([...custom.value][0] !== character) custom.value = character;
    paintList(preview, [[character], [character], [character]], { alignment: alignment.value, font: font.input.value.trim(), color: color.value });
  }
  for (const ch of BULLET_CHOICES) grid.append(el('button.fmt-symbol', { type: 'button', role: 'radio', 'aria-label': `项目符号 ${ch}`, 'aria-checked': 'false', onclick: () => { character = ch; paint(); } }, ch));
  // The arrows choose the previous or next bullet, as in any group of radio buttons; Home and End the first and last.
  grid.addEventListener('keydown', e => {
    if (isComposing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
    const buttons = [...grid.children], at = buttons.indexOf(e.target);
    const next = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (at < 0 || next === undefined) return;
    e.preventDefault();
    const button = buttons[(next + buttons.length) % buttons.length];
    button.click(); button.focus();
  });
  font.input.addEventListener('input', paint);
  const more = el('button.btn.btn-outline', { type: 'button', onclick: () => openSymbolPicker({ onPick: ch => { character = ch; paint(); } }) }, '符号…');
  paint();
  const modal = openFormatDialog({ title: '定义新项目符号', className: 'fmt-list-dialog', onClose, wide: false,
    body: [group('项目符号字符', grid, el('div.row', {}, field('字符', custom), more)),
      el('div.fmt-grid', {}, field('字体', font.node), field('颜色', color), field('对齐方式', alignment)),
      el('div.ed-font-preview-frame', {}, el('span.field-label', {}, '预览'), preview)],
    submit: () => apply({ character, font: font.input.value.trim() || null, color: color.value === 'auto' ? null : color.value, alignment: alignment.value }) });
  (grid.querySelector('[aria-checked="true"]') || grid.firstChild).focus();
  return modal;
}

/** Split a level's lvlText around its own number into the literal text before and after. */
export function splitLevelText(text, index) {
  const token = `%${index + 1}`, at = String(text || '').indexOf(token);
  return at < 0 ? { before: '', after: '.' } : { before: text.slice(0, at).replace(/%\d/g, ''), after: text.slice(at + token.length).replace(/%\d/g, '') };
}

/** Define New Number Format: number style, the text around the number, start, alignment and font. */
export function openDefineNumberFormat({ level, levelIndex = 0, apply, onClose }) {
  const parts = level && level.format !== 'bullet' ? splitLevelText(level.text, levelIndex) : { before: '', after: '.' };
  const style = select('编号样式', NUMBER_STYLES, level && level.format !== 'bullet' ? level.format : 'decimal', { onchange: () => paint() });
  const before = el('input.input', { type: 'text', value: parts.before, maxLength: 20, 'aria-label': '编号前文本', oninput: () => paint() });
  const after = el('input.input', { type: 'text', value: parts.after, maxLength: 20, 'aria-label': '编号后文本', oninput: () => paint() });
  const start = el('input.input', { type: 'number', min: 0, max: 32767, step: 1, value: level?.start ?? 1, 'aria-label': '起始编号', oninput: () => paint() });
  const alignment = select('编号对齐方式', ALIGN, level?.alignment || 'left', { onchange: () => paint() });
  const font = fontSelect('编号字体', level?.markerStyle?.fontAscii);
  const bold = checkbox('加粗', !!level?.markerStyle?.bold, () => paint()), italic = checkbox('倾斜', !!level?.markerStyle?.italic, () => paint());
  const preview = listPreview();
  function paint() {
    const first = Math.max(0, Number(start.value) || 0);
    paintList(preview, [0, 1, 2].map(i => [`${before.value}${numeral(first + i, style.value)}${after.value}`]), { alignment: alignment.value, font: font.input.value.trim(), bold: bold.box.checked, italic: italic.box.checked });
  }
  font.input.addEventListener('input', paint);
  paint();
  const modal = openFormatDialog({ title: '定义新编号格式', className: 'fmt-list-dialog', onClose, wide: false,
    body: [el('div.fmt-grid', {}, field('编号样式', style), field('起始编号', start)),
      group('编号格式', el('div.fmt-number-format', {}, field('前缀', before), el('span.fmt-number-token', { 'aria-hidden': 'true' }, '1'), field('后缀', after))),
      el('div.fmt-grid', {}, field('对齐方式', alignment), field('字体', font.node)), el('div.fmt-checks', {}, bold, italic),
      el('div.ed-font-preview-frame', {}, el('span.field-label', {}, '预览'), preview)],
    submit: () => {
      if (!start.checkValidity() || start.value === '') throw new Error('请输入 0 到 32767 之间的整数作为起始编号。');
      return apply({ format: style.value, before: before.value, after: after.value, start: Number(start.value), alignment: alignment.value, font: font.input.value.trim() || null, bold: bold.box.checked, italic: italic.box.checked });
    } });
  style.focus();
  return modal;
}

/** Set Numbering Value: start a new list at a value, or continue the previous list (optionally skipping ahead). */
export function openSetNumberingValue({ current = 1, canContinue = false, apply, onClose }) {
  const name = fieldId('fmt-numbering-mode');
  const fresh = el('input', { type: 'radio', name, value: 'new', checked: true, onchange: () => sync() });
  const resume = el('input', { type: 'radio', name, value: 'continue', disabled: !canContinue, onchange: () => sync() });
  const advance = checkbox('前进值(跳过编号)', false, () => sync());
  const value = el('input.input', { type: 'number', min: 0, max: 32767, step: 1, value: canContinue ? current : 1, 'aria-label': '值设置为' });
  const sync = () => { advance.box.disabled = !resume.checked; value.disabled = resume.checked && !advance.box.checked; };
  sync();
  const modal = openFormatDialog({ title: '设置编号值', className: 'fmt-list-dialog', onClose, wide: false,
    body: [el('div.fmt-radios', { role: 'radiogroup', 'aria-label': '编号' },
      el('label.ed-check', {}, fresh, '开始新列表'),
      el('label.ed-check', { title: canContinue ? '' : '前面没有可以继续的编号列表。' }, resume, '继续上一列表'), advance),
      field('值设置为', value)],
    submit: () => {
      if (!value.disabled && (!value.checkValidity() || value.value === '')) throw new Error('请输入 0 到 32767 之间的整数。');
      return apply(resume.checked ? { mode: 'continue', value: advance.box.checked ? Number(value.value) : null } : { mode: 'new', value: Number(value.value) });
    } });
  value.focus(); value.select();
  return modal;
}

/** Adjust List Indents: number position, text indent, what follows the number and an optional tab stop. */
export function openAdjustListIndents({ level, unit = 'in', apply, onClose }) {
  const g = level?.geometry || {}, indent = g.indentLeft ?? 720, first = g.firstLine ?? -360;
  const position = distance('编号位置', indent + first, { unit, min: -22 });
  const text = distance('文本缩进', indent, { unit });
  const follow = select('编号之后', Object.entries(LIST_SUFFIXES), level?.suffix || 'tab');
  const tabTwips = g.tabs?.find(t => t.numberingOnly || t.alignment === 'left')?.position;
  const addTab = checkbox('添加制表位在', tabTwips !== undefined, on => { tab.disabled = !on; });
  const tab = distance('制表位', tabTwips ?? indent, { unit });
  tab.disabled = tabTwips === undefined;
  follow.addEventListener('change', () => { addTab.box.disabled = follow.value !== 'tab'; tab.disabled = follow.value !== 'tab' || !addTab.box.checked; });
  const modal = openFormatDialog({ title: '调整列表缩进', className: 'fmt-list-dialog', onClose, wide: false,
    body: [el('div.fmt-grid', {}, field(`编号位置 (${position.unit})`, position), field(`文本缩进 (${text.unit})`, text)),
      field('编号之后', follow), el('div.row', {}, addTab, tab),
      el('p.field-hint', {}, '位置均从正文页边距起度量。所做更改将应用于整个列表的当前级别。')],
    submit: () => {
      const numberPosition = position.read(), textIndent = text.read();
      if (numberPosition === null || textIndent === null) throw new Error('请输入编号位置和文本缩进。');
      return apply({ numberPosition, textIndent, suffix: follow.value, tabStop: follow.value === 'tab' && addTab.box.checked ? tab.read() : null });
    } });
  position.focus();
  return modal;
}

/**
 * Define New Multilevel List: each of the nine levels' number style, format text (with %1–%9 for level
 * numbers), start, alignment, positions and what follows the number. levels: the current nine definitions.
 */
export function openDefineMultilevelList({ levels, unit = 'in', apply, onClose }) {
  const state = levels.map((level, i) => ({
    format: level?.format || 'decimal', text: level?.text ?? `%${i + 1}.`, start: level?.start ?? 1, alignment: level?.alignment || 'left', suffix: level?.suffix || 'tab',
    indentLeft: level?.geometry?.indentLeft ?? 720 * (i + 1), firstLine: level?.geometry?.firstLine ?? -360,
  }));
  let current = 0;
  const levelList = el('div.fmt-level-list', { role: 'listbox', 'aria-label': '要修改的级别', tabindex: 0 });
  const style = select('此级别的编号样式', [['bullet', '项目符号'], ...NUMBER_STYLES], 'decimal');
  const text = el('input.input', { type: 'text', maxLength: 64, 'aria-label': '编号格式', autocomplete: 'off' });
  const include = select('包含的级别编号来自', [['', '插入级别编号…'], ...Array.from({ length: 9 }, (_, i) => [String(i + 1), `级别 ${i + 1}`])], '');
  const start = el('input.input', { type: 'number', min: 0, max: 32767, step: 1, 'aria-label': '起始编号' });
  const alignment = select('编号对齐方式', ALIGN, 'left');
  const at = distance('对齐位置', 0, { unit }), indent = distance('文本缩进位置', 0, { unit });
  const follow = select('编号之后', Object.entries(LIST_SUFFIXES), 'tab');
  const preview = listPreview();
  function load(i) {
    current = i;
    const s = state[i];
    style.value = s.format; text.value = s.format === 'bullet' ? s.text : s.text; start.value = s.start; alignment.value = s.alignment; follow.value = s.suffix;
    at.value = String(Number(((s.indentLeft + s.firstLine) / (unit === 'cm' ? 1440 / 2.54 : 1440)).toFixed(3)));
    indent.value = String(Number((s.indentLeft / (unit === 'cm' ? 1440 / 2.54 : 1440)).toFixed(3)));
    for (const [n, item] of [...levelList.children].entries()) item.setAttribute('aria-selected', String(n === i));
    levelList.setAttribute('aria-activedescendant', levelList.children[i].id);
    paint();
  }
  function store() {
    const s = state[current], perTwips = unit === 'cm' ? 1440 / 2.54 : 1440;
    s.format = style.value; s.text = text.value; s.start = Number(start.value) || 0; s.alignment = alignment.value; s.suffix = follow.value;
    const textAt = Math.round(Number(indent.value || 0) * perTwips), numberAt = Math.round(Number(at.value || 0) * perTwips);
    s.indentLeft = textAt; s.firstLine = numberAt - textAt;
  }
  function label(i, counters) {
    const s = state[i];
    if (s.format === 'bullet') return s.text;
    return s.text.replace(/%([1-9])/g, (_, n) => numeral(counters[n - 1] ?? state[n - 1]?.start ?? 1, state[n - 1]?.format === 'bullet' ? 'decimal' : state[n - 1]?.format || 'decimal'));
  }
  function paint() {
    store();
    const counters = state.map(s => s.start);
    paintList(preview, [0, 1, 2].map(i => [label(i, counters), i]).concat([[label(0, counters.map((c, i) => i === 0 ? c + 1 : c)), 0]]));
  }
  for (let i = 0; i < 9; i++) levelList.append(el('div.fmt-level-item', { role: 'option', id: fieldId('fmt-level'), 'aria-selected': 'false', onclick: () => { store(); load(i); } }, String(i + 1)));
  levelList.addEventListener('keydown', e => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault(); store(); load(Math.max(0, Math.min(8, current + step)));
  });
  include.addEventListener('change', () => {
    if (!include.value) return;
    const pos = text.selectionStart ?? text.value.length;
    text.value = text.value.slice(0, pos) + `%${include.value}` + text.value.slice(text.selectionEnd ?? pos);
    include.value = ''; paint(); text.focus();
  });
  style.addEventListener('change', () => {
    if (style.value === 'bullet' && /%\d/.test(text.value)) text.value = '•';
    if (style.value !== 'bullet' && !/%\d/.test(text.value)) text.value = `%${current + 1}.`;
    paint();
  });
  for (const input of [text, start, at, indent]) input.addEventListener('input', paint);
  for (const input of [alignment, follow]) input.addEventListener('change', paint);
  load(0);
  const modal = openFormatDialog({ title: '定义新多级列表', className: 'fmt-multilevel-dialog', onClose,
    body: el('div.fmt-multilevel', {},
      el('div.fmt-multilevel-levels', {}, el('span.field-label', {}, '级别'), levelList),
      el('div.fmt-multilevel-fields', {},
        el('div.fmt-grid', {}, field('编号样式', style), field('起始编号', start)),
        el('div.fmt-grid', {}, field('编号格式', text, '使用 %1–%9 表示级别编号'), field('包含级别编号', include)),
        el('div.fmt-grid', {}, field('对齐方式', alignment), field(`对齐位置 (${at.unit})`, at), field(`文本缩进位置 (${indent.unit})`, indent), field('编号之后', follow)),
        el('div.ed-font-preview-frame', {}, el('span.field-label', {}, '预览'), preview))),
    submit: () => {
      store();
      for (const [i, s] of state.entries()) {
        if (s.format !== 'bullet' && !/%[1-9]/.test(s.text)) throw new Error(`级别 ${i + 1}：编号格式中必须包含级别编号 (%1–%9)。`);
        if (s.format === 'bullet' && !s.text) throw new Error(`级别 ${i + 1}：请输入项目符号字符。`);
        if ([...s.text.matchAll(/%([1-9])/g)].some(m => Number(m[1]) > i + 1)) throw new Error(`级别 ${i + 1}：级别编号只能引用当前级别或更高级别。`);
      }
      return apply(state.map(s => ({ format: s.format, text: s.text, start: s.start, alignment: s.alignment, suffix: s.suffix, geometry: { indentLeft: s.indentLeft, firstLine: s.firstLine } })));
    } });
  levelList.focus();
  return modal;
}
