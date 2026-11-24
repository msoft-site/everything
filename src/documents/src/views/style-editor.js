import { MAX_FONT_SIZE } from '../engine/font-size.js';
import { paragraphBorderFields } from './paragraph-borders.js';
import { styleLineSpacingFields } from './style-line-spacing.js';
import { UNDERLINE_STYLES } from '../engine/underlines.js';
import { KERNING_LIMIT } from '../engine/kerning.js';
import { CHARACTER_SPACING_LIMIT } from '../engine/character-spacing.js';
import { styleDisplayName } from '../lib/style-names.js';
import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { builtinOutlineLevel } from '../engine/outline.js';

/** The ids of `id` and of the styles among `choices` whose basedOn chain reaches it. */
function inheritingFrom(id, choices) {
  const parent = new Map(choices.map(s => [s.id, s.basedOn])), known = new Map([[id, true]]);
  for (const choice of choices) {
    const path = new Set();
    let at = choice.id;
    // Each chain is walked once; a cycle or a missing base ends it without reaching `id`.
    while (at && !known.has(at) && !path.has(at)) { path.add(at); at = parent.get(at); }
    const reaches = !!at && known.get(at) === true;
    for (const step of path) known.set(step, reaches);
  }
  return new Set([...known].filter(([, reaches]) => reaches).map(([key]) => key));
}

export function openStyleEditor(style, choices, apply, defaultRun = {}) {
  const character = style.type === 'character', kind = character ? 'character' : 'paragraph';
  const fixedOutline = character ? null : builtinOutlineLevel(style.id);
  const creating = !style.id, controls = [], error = el('p.field-error', { role: 'alert', hidden: true });
  const field = (label, input) => el('label.field', {}, el('span.field-label', {}, label), input);
  // Visible labels drop the "Style" prefix the dialog's title gives; accessible names keep it.
  const shown = label => label.replace(/^样式/, '');
  const name = el('input.input', { required: true, maxLength: 253, value: style.name || '', 'aria-label': '样式名称' });
  const selectStyle = (label, value, emptyLabel, excluded = new Set()) => el('select.input', { 'aria-label': label },
    el('option', { value: '' }, emptyLabel), ...choices.filter(s => !s.error && !excluded.has(s.id)).map(s => el('option', { value: s.id, selected: s.id === value }, styleDisplayName(s.name))));
  // A style cannot be based on itself or on a style that inherits from it (§17.7.4.3: no cycles).
  const basedOn = selectStyle('基于样式', style.basedOn, '无基准样式', creating ? new Set() : inheritingFrom(style.id, choices));
  const next = selectStyle('后续段落样式', style.next, '相同样式');
  // Keep ignored/missing original references unless the user changes the field.
  const originalBase = basedOn.value, originalNext = next.value;
  const register = (group, key, label, value, options) => {
    const input = ['color', 'underlineColor', 'paragraphShading'].includes(key) ? el('input.input', { type: 'text', placeholder: '继承', pattern: key === 'paragraphShading' ? 'auto|foreground|#?[0-9a-fA-F]{6}' : 'auto|#?[0-9a-fA-F]{6}', title: key === 'paragraphShading' ? 'auto 表示无填充，foreground 表示自动黑色，或输入六位 RGB 十六进制颜色；留空则继承' : 'auto 或六位 RGB 颜色；留空则继承', 'aria-label': label }) : options ? el('select.input', { 'aria-label': label }, ...[['', '继承'], ...options].map(([v, text]) => el('option', { value: v }, text))) : el('input.input', { type: 'number', min: key === 'characterSpacing' ? -CHARACTER_SPACING_LIMIT : key === 'baselineShift' ? -200 : ['fontSize', 'textScale'].includes(key) ? 1 : 0, max: key === 'kerning' ? KERNING_LIMIT : key === 'characterSpacing' ? CHARACTER_SPACING_LIMIT : key === 'fontSize' ? MAX_FONT_SIZE : ['baselineShift', 'kerning'].includes(key) ? 200 : 600, step: key === 'textScale' ? 1 : key === 'characterSpacing' ? .05 : ['fontSize', 'baselineShift', 'kerning'].includes(key) ? .5 : 'any', placeholder: '继承', 'aria-label': label });
    input.value = value === undefined ? '' : String(value);
    if (key === 'outlineLevel' && fixedOutline !== null) { input.value = String(fixedOutline); input.disabled = true; input.title = '内置标题样式具有固定的大纲级别。'; }
    controls.push({ group, key, input, original: input.value, boolean: typeof value === 'boolean' || ['bold', 'italic', 'underline', 'keepNext', 'keepLines', 'widowControl', 'pageBreakBefore', 'contextualSpacing'].includes(key), number: (!options && !['color', 'underlineColor', 'paragraphShading'].includes(key)) || key === 'outlineLevel' });
    return field(shown(label), input);
  };
  const toggles = [['true', '开启'], ['false', '关闭']];
  const combinedCaps = { bothCapsOff: '全部大写关；小型大写字母关', capsSmallCapsOff: '全部大写开；小型大写字母关', smallCapsCapsOff: '全部大写关；小型大写字母开', bothCapsOn: '全部大写开；小型大写字母开' };
  const retainedCaps = combinedCaps[style.run?.capitalization] ? [[style.run.capitalization, combinedCaps[style.run.capitalization]]] : [];
  const lineSpacing = !creating && !character ? styleLineSpacingFields(style.properties?.spacing) : null;
  // Fields are grouped by kind: font, paragraph, pagination.
  const run = creating ? null : {
    fontSize: register('run', 'fontSize', '样式字号 (磅)', style.run?.fontSize),
    kerning: register('run', 'kerning', '样式字距微调自 (磅)', style.run?.kerning),
    textScale: register('run', 'textScale', '样式字符缩放 (%)', style.run?.textScale),
    characterSpacing: register('run', 'characterSpacing', '样式字符间距 (磅)', style.run?.characterSpacing),
    baselineShift: register('run', 'baselineShift', '样式基线偏移 (磅)', style.run?.baselineShift),
    capitalization: register('run', 'capitalization', '样式大写', style.run?.capitalization, ['caps', 'capsOff', 'smallCaps', 'smallCapsOff'].map(value => { const kind = value.startsWith('smallCaps') ? '小型大写' : '全部大写', on = !value.endsWith('Off'); return [value, `${kind} ${on ? '开' : '关'}${character ? ` (${on === (defaultRun.capitalization === kind) ? '保持' : '反转'})` : ''}`]; }).concat(retainedCaps)),
    strikethrough: register('run', 'strikethrough', '样式删除线', style.run?.strikethrough, [['single', character ? `单删除线开 (${defaultRun.strikethrough === 'single' ? '保持' : '反转'})` : '单删除线开'], ['singleOff', character ? `单删除线关 (${defaultRun.strikethrough === 'single' ? '反转' : '保持'})` : '单删除线关'], ['double', '双删除线开'], ['doubleOff', '双删除线关'], ['bothStrikeOff', '单和双删除线关'], ['singleStrikeDoubleOff', '单删除线开，双删除线关'], ['doubleStrikeSingleOff', '双删除线开，单删除线关']]),
    color: register('run', 'color', '样式字体颜色', style.run?.color),
    verticalAlign: register('run', 'verticalAlign', '样式文字位置', style.run?.verticalAlign, [['baseline', '基准线'], ['superscript', '上标'], ['subscript', '下标']]),
    underlineStyle: register('run', 'underlineStyle', '样式下划线', style.run?.underlineStyle ?? (style.run?.underline === undefined ? undefined : style.run.underline ? 'single' : 'none'), Object.entries(UNDERLINE_STYLES)),
    underlineColor: register('run', 'underlineColor', '样式下划线颜色', style.run?.underlineColor),
    ...Object.fromEntries([['bold', '样式加粗'], ['italic', '样式倾斜']].map(([key, label]) => [key, register('run', key, label, style.run?.[key], character && key !== 'underline'
      ? toggles.map(([value, label]) => [value, `${label} (${(value === 'true') === Boolean(defaultRun[key]) ? '保持' : '反转'})`]) : toggles)])),
  };
  const paragraphFields = creating || character ? [] : [register('paragraph', 'alignment', '样式对齐方式', style.properties?.alignment, [['left', '左对齐'], ['center', '居中'], ['right', '右对齐'], ['both', '两端对齐'], ['distribute', '分散对齐']]),
    ...lineSpacing.nodes,
    ...[['spaceBefore', 'before', '样式段前间距 (磅)'], ['spaceAfter', 'after', '样式段后间距 (磅)']].map(([key, attr, label]) => register('paragraph', key, label, style.properties?.spacing?.[attr] === undefined ? undefined : Number(style.properties.spacing[attr]) / 20)),
    register('paragraph', 'paragraphShading', '样式段落底纹', style.properties?.paragraphShading),
    register('paragraph', 'outlineLevel', '样式大纲级别', style.properties?.outlineLevel, [...Array.from({ length: 9 }, (_, i) => [String(i), `${i + 1} 级`]), ['9', '正文文本']])];
  const paginationFields = creating || character ? [] : [['contextualSpacing', '样式如果定义了相同样式，则在段落之间不添加空格'], ['keepNext', '样式与下段同页'], ['keepLines', '样式段中不分页'], ['widowControl', '样式孤行控制'], ['pageBreakBefore', '样式段前分页']].map(([key, label]) => register('paragraph', key, label, style.properties?.[key], toggles));
  const group = (title, nodes) => nodes.length ? el('section.canvas-style-section', { 'aria-label': title }, el('h3', {}, title), el('div.canvas-page-fields.canvas-style-fields', {}, ...nodes)) : null;
  const sections = creating ? [] : [
    group('字体', ['fontSize', 'bold', 'italic', 'underlineStyle', 'underlineColor', 'strikethrough', 'color', 'capitalization', 'verticalAlign', 'characterSpacing', 'textScale', 'kerning', 'baselineShift'].map(key => run[key])),
    group('段落', paragraphFields), group('换行和分页', paginationFields)].filter(Boolean);
  const borders = !creating && !character ? paragraphBorderFields([style.properties?.paragraphBorders], true) : null;
  const content = el('form.canvas-style-form', { onsubmit: e => {
    e.preventDefault();
    const patch = character ? { run: {} } : { paragraph: {}, run: {} };
    for (const [key, input, old] of [['name', name, style.name || ''], ['basedOn', basedOn, originalBase], ...(!character ? [['next', next, originalNext]] : [])]) if (creating || input.value !== old) patch[key] = input.value || null;
    for (const control of controls) if (control.input.value !== control.original) {
      const value = control.input.value;
      patch[control.group][control.key] = value === '' ? null : control.boolean ? value === 'true' : control.number ? Number(value) : ['color', 'underlineColor', 'paragraphShading'].includes(control.key) ? value.replace(/^#/, '') : value;
    }
    try {
      if (lineSpacing) Object.assign(patch.paragraph, lineSpacing.read());
      if (borders) { const value = borders.read(); if (value === null || Object.keys(value).length) patch.paragraph.paragraphBorders = value; }
      if (apply(patch) === false) throw new Error('无法应用此样式。请检查其格式和继承设置。');
      modal.close();
    } catch (e) { error.textContent = e.message; error.hidden = false; }
  } }, el('div.canvas-style-scroll', {}, el('div.canvas-page-fields.canvas-style-fields', {}, field('样式名称', name), field('基于样式', basedOn), ...(!creating && !character ? [field('后续段落样式', next)] : [])), ...sections, borders?.node,
  el('p.field-hint', {}, creating ? character ? '为所选文字或后续键入的内容创建字符样式。' : '创建段落样式并将其应用到所选段落。' : '所做更改将应用于所有使用此样式的位置（包括基于此样式的样式）。保留直接格式设置。选择“继承”可清除该属性设置。' + (character ? ' 对于加粗和倾斜，“保持”保留继承的格式，“反转”切换该设置。大写和单删除线也会相对于文档默认值进行切换；双删除线使用常规的开/关继承。' : ''))), error,
  el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, creating ? '创建样式' : '应用')));
  const modal = openModal({ wide: !creating && !character, title: `${creating ? '新建' : '修改'}${character ? '字符' : '段落'}样式`, content, onClose: () => {
    const root = modal.panel.closest('.modal-root'); root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true');
  } });
  modal.panel.classList.add('canvas-style-dialog');
  return modal;
}
