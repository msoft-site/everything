import { el } from '../ui/dom.js';
import { BORDER_STYLES, checkedParagraphBorder } from '../engine/paragraph-borders.js';
import { PAGE_BORDER_SIDES } from '../engine/page-borders.js';
import { patternedFill, SHADING_PERCENTAGES } from '../engine/docx-paragraph-shading.js';
import { tabStrip, field, checkbox, group, select, openFormatDialog, colorField } from './format-dialog-kit.js';

/** Line widths in eighths of a point (w:sz), as the width list offers them. */
export const BORDER_WIDTHS = [[2, '¼ pt'], [4, '½ pt'], [6, '¾ pt'], [8, '1 pt'], [12, '1½ pt'], [18, '2¼ pt'], [24, '3 pt'], [36, '4½ pt'], [48, '6 pt']];
const PARAGRAPH_SIDES = ['top', 'bottom', 'left', 'right', 'between'];
const SIDE_NAMES = { top: '上', bottom: '下', left: '左', right: '右', between: '段落之间' };
const visible = border => !!border && !['none', 'nil'].includes(border.style) && border.size !== 0;
const PATTERNS = [['clear', '清除'], ['solid', '纯色 (100%)'], ...SHADING_PERCENTAGES.map(p => [p, `${p.slice(3)}%`])];

/** The flat fill a fill/pattern/pattern-color choice paints as. */
export function shadingValue(fill, pattern, color) {
  if (pattern === 'clear') return fill;
  if (pattern === 'solid') return color === 'auto' ? 'foreground' : color;
  return patternedFill(pattern, color, fill);
}

/**
 * The Border side editor shared by the Borders and Page Border tabs: setting presets, style, color, width,
 * a clickable preview and per-side toggles. sides: which sides exist. initial: { side: border }.
 */
function borderEditor({ sides, initial, presets, label, page = false }) {
  const state = Object.fromEntries(sides.map(side => [side, initial?.[side] && visible(initial[side]) ? { ...initial[side] } : null]));
  const firstVisible = Object.values(state).find(Boolean);
  const style = select(`${label}样式`, Object.entries(BORDER_STYLES).filter(([v]) => v !== 'none'), firstVisible?.style || 'single');
  const width = select(`${label}宽度`, BORDER_WIDTHS.map(([v, t]) => [String(v), t]), String(BORDER_WIDTHS.find(([v]) => v === firstVisible?.size)?.[0] ?? (page ? 4 : 4)));
  const color = colorField(`${label}颜色`, firstVisible?.color || 'auto', { onchange: () => restyle() });
  const current = () => ({ style: style.value, size: Number(width.value), space: page ? 24 : 1, color: color.value });
  let touched = false;
  const toggles = {};
  const preview = el('div.fmt-border-preview', { 'aria-hidden': 'true' });
  const sample = el('div.fmt-border-sample', {}, ...(page ? [el('div.fmt-border-page-lines')] : [el('p', {}, '示例文本文本文本文本文本文本'), el('p', {}, '示例文本文本文本文本文本文本')]));
  const hit = side => el(`button.fmt-border-hit.is-${side}`, { type: 'button', tabindex: -1, title: SIDE_NAMES[side], onclick: () => toggle(side) });
  preview.append(sample, ...sides.map(hit));
  function paint() {
    for (const side of sides) {
      const border = state[side];
      toggles[side].setAttribute('aria-pressed', String(!!border));
      const css = border ? `${Math.max(1, Math.round(border.size / 6))}px ${border.style === 'double' ? 'double' : /dot/i.test(border.style) && !/dash/i.test(border.style) ? 'dotted' : /dash/i.test(border.style) ? 'dashed' : 'solid'} ${border.color === 'auto' ? '#000' : `#${border.color}`}` : '';
      if (side === 'between') sample.style.setProperty('--between', css || '0 none');
      else sample.style[`border${side[0].toUpperCase()}${side.slice(1)}`] = css;
    }
    for (const [name, button] of Object.entries(presetButtons)) button.setAttribute('aria-pressed', String(name === presetName()));
  }
  function toggle(side) {
    touched = true;
    state[side] = state[side] && JSON.stringify(state[side]) === JSON.stringify({ ...state[side], ...current() }) ? null : current();
    paint();
  }
  const presetName = () => {
    const on = sides.filter(s => state[s]);
    for (const [name, list] of Object.entries(presets)) if (list.length === on.length && list.every(s => on.includes(s))) return name;
    return 'custom';
  };
  const presetButtons = Object.fromEntries(Object.entries(presets).map(([name, list]) => [name, el('button.btn.btn-outline.fmt-preset', { type: 'button', 'aria-pressed': 'false', onclick: () => {
    touched = true;
    for (const side of sides) state[side] = list.includes(side) ? current() : null;
    paint();
  } }, name === 'none' ? '无' : name === 'box' ? '方框' : name === 'all' ? '全部' : name === 'grid' ? '网格' : name)]));
  // Changing style, width or color restyles the sides already on, as the preview shows.
  const restyle = () => { touched = true; for (const side of sides) if (state[side]) state[side] = { ...state[side], ...current(), space: state[side].space ?? current().space }; paint(); };
  style.addEventListener('change', restyle); width.addEventListener('change', restyle);
  const node = el('div.fmt-border-editor', {},
    el('div.fmt-border-settings', {}, el('span.field-label', {}, '设置'), el('div.fmt-presets', { role: 'group', 'aria-label': `${label}设置` }, ...Object.values(presetButtons))),
    el('div.fmt-border-controls', {}, field('样式', style), field('颜色', color), field('宽度', width)),
    el('div.fmt-border-preview-wrap', {}, el('span.field-label', {}, '预览 — 单击边框或使用按钮切换'), preview,
      el('div.fmt-side-toggles', { role: 'group', 'aria-label': `${label}边框` }, ...sides.map(side => (toggles[side] = el('button.btn.btn-outline.btn-sm', { type: 'button', 'aria-pressed': 'false', onclick: () => toggle(side) }, SIDE_NAMES[side]))))));
  paint();
  return { node, state, touched: () => touched, current };
}

/**
 * Borders and Shading: paragraph borders, page borders and shading (fill and pattern), each in one undo
 * step. values: { paragraphBorders (null if mixed), paragraphShading, runShading, pageBorders, singleSection }.
 * apply({ paragraphBorders?, paragraphShading?, runShading?, pageBorders? }) returns false on failure.
 */
export function openBordersAndShading({ values: v, apply, onClose, initialTab = 'borders' }) {
  /* ---- Borders ---- */
  const paragraph = borderEditor({ sides: PARAGRAPH_SIDES, initial: v.paragraphBorders || {}, label: '边框', presets: { none: [], box: ['top', 'bottom', 'left', 'right'], all: ['top', 'bottom', 'left', 'right', 'between'] } });
  const distances = Object.fromEntries(['top', 'bottom', 'left', 'right'].map(side => [side, el('input.input', { type: 'number', min: 0, max: 31, step: 1, value: v.paragraphBorders?.[side]?.space ?? (side === 'left' || side === 'right' ? 4 : 1), 'aria-label': `${SIDE_NAMES[side]}与正文的距离 (pt)` })]));
  // The fields' starting text: an untouched distance leaves the borders alone. (Their value is set as a
  // property, so defaultValue is empty and cannot tell.)
  const startText = inputs => Object.fromEntries(Object.entries(inputs).map(([side, input]) => [side, input.value]));
  const distanceStart = startText(distances);
  const bordersPanel = el('div', {}, paragraph.node,
    group('与正文的距离 (pt)', el('div.fmt-grid.is-four', {}, ...Object.entries(distances).map(([side, input]) => field(SIDE_NAMES[side], input)))),
    v.paragraphBorders === null ? el('p.field-hint', {}, '所选内容的边框设置不同。更改边框将应用于所选的每个段落。') : null,
    el('p.field-hint', {}, '边框应用于所选段落。相邻段落若边框样式相同则会合并；“段落之间”可绘制分隔线。'));

  /* ---- Page Border ---- */
  const pageBorders = v.pageBorders || null;
  const pageEditor = borderEditor({ sides: PAGE_BORDER_SIDES, initial: pageBorders?.borders || {}, label: '页面边框', page: true, presets: { none: [], box: ['top', 'bottom', 'left', 'right'] } });
  const measure = select('度量依据', [['text', '正文'], ['page', '页面边缘']], pageBorders?.offsetFrom || 'text');
  const display = select('应用于', [['allPages', '整篇文档'], ['firstPage', '仅首页'], ['notFirstPage', '除首页外的所有页']], pageBorders?.display || 'allPages');
  const front = checkbox('始终显示在正文前面', (pageBorders?.zOrder || 'front') === 'front');
  const pageSpace = Object.fromEntries(PAGE_BORDER_SIDES.map(side => [side, el('input.input', { type: 'number', min: 0, max: 31, step: 1, value: pageBorders?.borders?.[side]?.space ?? 24, 'aria-label': `${SIDE_NAMES[side]}页面边框边距 (pt)` })]));
  const pageSpaceStart = startText(pageSpace);
  const pagePanel = el('div', {}, pageEditor.node,
    group('选项', el('div.fmt-grid', {}, field('应用于', display), field('度量依据', measure)), front,
      el('div.fmt-grid.is-four', {}, ...PAGE_BORDER_SIDES.map(side => field(`${SIDE_NAMES[side]} (pt)`, pageSpace[side])))),
    !v.singleSection ? el('p.field-error', {}, '本文档包含多个节；页面边框将保持原样。') : null,
    el('p.field-hint', {}, '边距可以从正文或页面边缘度量。艺术型边框不可用。'));
  if (!v.singleSection) for (const control of pagePanel.querySelectorAll('button, input, select')) control.disabled = true;

  /* ---- Shading ---- */
  const target = select('将底纹应用于', [['paragraph', '段落'], ['text', '文字']], 'paragraph');
  const initialFill = value => value === null ? null : value === 'foreground' ? 'auto' : value;
  let shadingTouched = false;
  const touchShading = () => { shadingTouched = true; paintShading(); };
  const fill = colorField('填充', initialFill(v.paragraphShading), { reset: { value: 'auto', label: '无颜色' }, onchange: touchShading });
  const pattern = select('图案样式', PATTERNS, v.paragraphShading === 'foreground' ? 'solid' : 'clear');
  const patternColor = colorField('图案颜色', 'auto', { onchange: touchShading });
  const swatch = el('div.fmt-shading-swatch', { 'aria-hidden': 'true' });
  function paintShading() {
    patternColor.disabled = pattern.value === 'clear';
    let value = null;
    try { value = fill.value === null ? null : shadingValue(fill.value, pattern.value, patternColor.value); } catch { value = null; }
    swatch.style.background = value === null ? '' : value === 'auto' ? '#fff' : value === 'foreground' ? '#000' : `#${value}`;
  }
  pattern.addEventListener('change', touchShading);
  target.addEventListener('change', () => {
    const current = target.value === 'text' ? v.runShading : v.paragraphShading;
    fill.set(initialFill(current)); pattern.value = current === 'foreground' ? 'solid' : 'clear'; shadingTouched = false; paintShading();
  });
  paintShading();
  const shadingPanel = el('div', {},
    group('填充', el('div.fmt-grid', {}, field('填充', fill), field('应用于', target))),
    group('图案', el('div.fmt-grid', {}, field('样式', pattern), field('颜色', patternColor))),
    el('div.fmt-shading-preview', {}, el('span.field-label', {}, '预览'), swatch),
    el('p.field-hint', {}, '图案将保存为其渲染的纯色。'));

  const tabs = tabStrip('边框和底纹', [['borders', '边框', bordersPanel], ['page', '页面边框', pagePanel], ['shading', '底纹', shadingPanel]]);
  const modal = openFormatDialog({ title: '边框和底纹', className: 'fmt-borders-dialog', onClose,
    body: [tabs.node, bordersPanel, pagePanel, shadingPanel],
    submit: () => {
      const patch = {};
      const spacesChanged = Object.entries(distances).some(([side, input]) => distanceStart[side] !== input.value);
      if (paragraph.touched() || spacesChanged) {
        const borders = {};
        for (const side of PARAGRAPH_SIDES) {
          const border = paragraph.state[side];
          borders[side] = border ? checkedParagraphBorder({ style: border.style, size: border.size, color: border.color, space: side === 'between' ? 0 : Math.round(Number(distances[side].value) || 0) }) : checkedParagraphBorder({ style: 'none' });
        }
        patch.paragraphBorders = borders;
      }
      if (v.singleSection && (pageEditor.touched() || [measure, display].some(s => s.value !== (s === measure ? pageBorders?.offsetFrom || 'text' : pageBorders?.display || 'allPages')) || front.box.checked !== ((pageBorders?.zOrder || 'front') === 'front') || PAGE_BORDER_SIDES.some(side => pageSpace[side].value !== pageSpaceStart[side]))) {
        const sides = Object.fromEntries(PAGE_BORDER_SIDES.filter(side => pageEditor.state[side]).map(side => [side, { ...pageEditor.state[side], space: Math.round(Number(pageSpace[side].value) || 0) }]));
        patch.pageBorders = Object.keys(sides).length ? { offsetFrom: measure.value, display: display.value, zOrder: front.box.checked ? 'front' : 'back', borders: sides } : null;
      }
      if (shadingTouched && fill.value !== null) patch[target.value === 'text' ? 'runShading' : 'paragraphShading'] = shadingValue(fill.value, pattern.value, patternColor.value);
      return Object.keys(patch).length ? apply(patch) : true;
    } });
  if (initialTab !== 'borders') tabs.show(initialTab);
  tabs.buttons[['borders', 'page', 'shading'].indexOf(initialTab)]?.focus();
  return modal;
}
