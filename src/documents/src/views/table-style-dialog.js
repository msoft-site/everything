// New Table Style and Modify Table Style: name the style, then format each of
// its regions (the whole table, header and total rows, first and last columns,
// bands) with a fill, text color, weight and borders. The sample redraws as
// you go, with the regions the table's Style Options turn on.
import { el } from '../ui/dom.js';
import { formDialog } from './table-dialogs.js';
import { drawTableStyleThumbnail } from '../ui/table-design-gallery.js';
import { REGION_LABELS, STYLE_REGIONS } from '../engine/table-styles.js';

const BORDER_PRESETS = [['keep', '保留框线'], ['none', '无框线'], ['all', '所有框线'], ['outside', '外侧框线'], ['inside', '内部框线'], ['top', '上框线'], ['bottom', '下框线'], ['topBottom', '上下框线']];
const PRESET_SIDES = { none: ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'], all: ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'], outside: ['top', 'left', 'bottom', 'right'], inside: ['insideH', 'insideV'], top: ['top'], bottom: ['bottom'], topBottom: ['top', 'bottom'] };
const WEIGHTS = [[2, '¼ 磅'], [4, '½ 磅'], [6, '¾ 磅'], [8, '1 磅'], [12, '1½ 磅'], [18, '2¼ 磅'], [24, '3 磅']];

/** spec: the style to edit (a copy is edited). apply(spec) saves it. */
export function openTableStyleDialog({ title, spec, look, nameTaken = () => false }, apply, { onClose } = {}) {
  const work = structuredClone(spec);
  work.regions ||= {}; work.borders ||= {};
  const name = el('input.input', { type: 'text', value: work.name, required: true, maxLength: 100, 'aria-label': '样式名称' });
  const region = el('select.input', { 'aria-label': '将格式应用于' }, ...['whole', ...STYLE_REGIONS].map(id => el('option', { value: id }, REGION_LABELS[id])));
  const fill = el('input.input.table-color', { type: 'color', 'aria-label': '填充颜色' });
  const noFill = el('input', { type: 'checkbox', 'aria-label': '无填充' });
  const color = el('input.input.table-color', { type: 'color', 'aria-label': '文字颜色' });
  const autoColor = el('input', { type: 'checkbox', 'aria-label': '自动文字颜色' });
  const bold = el('input', { type: 'checkbox', 'aria-label': '加粗' }), italic = el('input', { type: 'checkbox', 'aria-label': '倾斜' });
  const borders = el('select.input', { 'aria-label': '边框' }, ...BORDER_PRESETS.map(([v, t]) => el('option', { value: v }, t)));
  const borderColor = el('input.input.table-color', { type: 'color', value: '#000000', 'aria-label': '边框颜色' });
  const weight = el('select.input', { 'aria-label': '边框磅值' }, ...WEIGHTS.map(([v, t]) => el('option', { value: v, selected: v === 4 }, t)));
  const canvas = el('canvas.table-style-preview', { role: 'img', 'aria-label': '样式预览' });
  const target = () => region.value === 'whole' ? (work.whole ||= {}) : (work.regions[region.value] ||= {});
  const hex = value => value.replace('#', '').toUpperCase();
  function load() {
    const r = region.value === 'whole' ? work.whole || {} : work.regions[region.value] || {};
    noFill.checked = !r.fill; fill.value = `#${r.fill || 'FFFFFF'}`; fill.disabled = noFill.checked;
    autoColor.checked = !r.color; color.value = `#${r.color || '000000'}`; color.disabled = autoColor.checked;
    bold.checked = !!r.bold; italic.checked = !!r.italic; borders.value = 'keep';
  }
  function draw() { work.name = name.value; drawTableStyleThumbnail(canvas, work, look, { width: 220, height: 132 }); }
  function store() {
    const r = target();
    if (noFill.checked) delete r.fill; else r.fill = hex(fill.value);
    if (autoColor.checked) delete r.color; else r.color = hex(color.value);
    if (bold.checked) r.bold = true; else delete r.bold;
    if (italic.checked) r.italic = true; else delete r.italic;
    fill.disabled = noFill.checked; color.disabled = autoColor.checked;
    draw();
  }
  function setBorders() {
    if (borders.value === 'keep') return;
    const sides = PRESET_SIDES[borders.value], value = borders.value === 'none' ? 'nil' : { style: 'single', size: Number(weight.value), color: hex(borderColor.value) };
    const set = region.value === 'whole' ? (work.borders ||= {}) : ((target().borders ||= {}));
    if (['all', 'none'].includes(borders.value) && region.value !== 'whole') for (const side of Object.keys(set)) delete set[side];
    for (const side of sides) set[side] = value;
    draw();
  }
  region.addEventListener('change', load);
  for (const control of [fill, noFill, color, autoColor, bold, italic]) control.addEventListener('input', store);
  for (const control of [noFill, autoColor, bold, italic]) control.addEventListener('change', store);
  for (const control of [borders, borderColor, weight]) control.addEventListener('change', setBorders);
  name.addEventListener('input', draw);
  load(); queueMicrotask(draw);
  const row = (...items) => el('div.table-style-row', {}, ...items);
  const labelled = (text, control) => el('label.table-check', {}, control, text);
  return formDialog({ title, onClose, className: 'table-style-dialog', wide: true, body: [
    el('div.table-style-layout', {},
      el('div.table-style-fields', {},
        el('label.field', {}, el('span.field-label', {}, '名称'), name),
        el('label.field', {}, el('span.field-label', {}, '将格式应用于'), region),
        el('div.field', {}, el('span.field-label', {}, '填充'), row(fill, labelled('无填充', noFill))),
        el('div.field', {}, el('span.field-label', {}, '文字'), row(color, labelled('自动', autoColor), labelled('加粗', bold), labelled('倾斜', italic))),
        el('div.field', {}, el('span.field-label', {}, '边框'), row(borders, borderColor, weight))),
      el('div.table-style-sample', {}, canvas, el('p.field-hint', {}, '示例显示选定表格的样式选项所启用的区域。'))),
  ], submit: () => {
    const value = name.value.trim();
    if (!value) throw new Error('请输入表格样式名称。');
    if (nameTaken(value)) throw new Error('已有同名的表格样式。');
    for (const key of Object.keys(work.regions)) if (!Object.keys(work.regions[key]).length) delete work.regions[key];
    if (work.whole && !Object.keys(work.whole).length) delete work.whole;
    return apply({ ...work, name: value });
  } });
}
