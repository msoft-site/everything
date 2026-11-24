import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { BORDER_SIDES, BORDER_STYLES, checkedParagraphBorder, visibleParagraphBorders } from '../engine/paragraph-borders.js';

const names = { top: '上', left: '左', bottom: '下', right: '右', between: '段落之间' };
const fields = row => [row.style.value, row.width.value, row.space.value, row.color.value];
export const paragraphBorderLabel = value => value === null ? '多种' : visibleParagraphBorders(value) ? '自定义' : '无';

/** The same per-side controls edit direct formatting and style declarations. */
export function paragraphBorderFields(values, inherit = false) {
  const rows = [], prefix = inherit ? '样式' : '';
  let reset = null;
  for (const [side, label] of Object.entries(names)) {
    const declarations = values.map(value => value?.[side]);
    const current = key => {
      const defaults = { style: inherit ? '' : 'none', size: 8, space: 2, color: 'auto' };
      const all = declarations.map(d => d?.[key] ?? defaults[key]);
      return all.every(value => value === all[0]) ? all[0] : '';
    };
    const style = el('select.input', { 'aria-label': `${prefix}${label}边框线型` },
      el('option', { value: '' }, inherit ? '继承' : '多种 — 保持'), ...Object.entries(BORDER_STYLES).map(([value, label]) => el('option', { value }, label)));
    style.value = current('style') === 'nil' ? 'none' : current('style');
    const width = el('input.input', { type: 'number', min: 0, max: 12, step: .125, value: current('size') === '' ? '' : current('size') / 8, placeholder: '多种', 'aria-label': `${prefix}${label}边框宽度 (磅)` });
    const space = el('input.input', { type: 'number', min: 0, max: 31, step: 1, value: current('space'), placeholder: '多种', 'aria-label': `${prefix}${label}边框间距 (磅)` });
    const color = el('input.input', { type: 'text', pattern: 'auto|#?[0-9a-fA-F]{6}', value: current('color'), placeholder: '多种', 'aria-label': `${prefix}${label}边框颜色`, title: 'auto 或六位十六进制 RGB 颜色' });
    const row = { side, label, style, width, space, color };
    row.refresh = () => { for (const input of [width, space, color]) input.disabled = !style.value || style.value === 'none'; };
    style.addEventListener('change', row.refresh); row.refresh();
    row.original = JSON.stringify(fields(row)); rows.push(row);
  }
  const preset = (label, enabled) => el('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => {
    reset = enabled;
    for (const row of rows) { row.style.value = enabled.includes(row.side) ? 'single' : 'none'; row.width.value = '1'; row.space.value = '2'; row.color.value = 'auto'; row.refresh(); }
  } }, label);
  const table = el('table.canvas-border-fields', {}, el('thead', {}, el('tr', {}, ...['边', '线型', '宽度 (磅)', '间距 (磅)', '颜色'].map(label => el('th', { scope: 'col' }, label)))),
    el('tbody', {}, ...rows.map(row => el('tr', {}, el('th', { scope: 'row' }, row.label), ...[row.style, row.width, row.space, row.color].map(input => el('td', {}, input))))));
  // In the style dialog the borders are one of its titled groups; on their own the dialog's title names them.
  const node = el(inherit ? 'section.canvas-style-section' : 'section', inherit ? { 'aria-label': '边框' } : {}, inherit && el('h3', {}, '边框'),
    el('div.canvas-border-presets', { role: 'group', 'aria-label': '边框预设' }, el('span.field-label', { 'aria-hidden': 'true' }, '预设'),
      preset('方框', ['top', 'left', 'bottom', 'right']), preset('所有边框', ['top', 'left', 'bottom', 'right', 'between']), preset('仅底端边框', ['bottom']), preset('无边框', []),
      inherit && el('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { reset = 'inherit'; for (const row of rows) { row.style.value = ''; row.refresh(); } } }, '全部继承边框')),
    el('div.canvas-border-scroll', {}, table),
    el('p.field-hint', {}, '使用 auto 或六位 RGB 颜色。间距为边框距离文本的距离；分隔线忽略此设置。相同的边框设置会合并相邻段落。' + (inherit ? ' 选择“继承”可删除该侧的声明。' : ' 多种数值在编辑前保持不变。')));
  const read = () => {
    const patch = reset === 'inherit' ? Object.fromEntries(BORDER_SIDES.map(side => [side, null])) : reset !== null ? { bar: { style: 'none' } } : {};
    for (const row of rows) {
      if (reset === null && row.original === JSON.stringify(fields(row))) continue;
      if (inherit && !row.style.value) { patch[row.side] = null; continue; }
      if (row.style.value === 'none') { patch[row.side] = checkedParagraphBorder({ style: 'none' }); continue; }
      if (!row.style.value || [row.width, row.space, row.color].some(input => input.value === '')) throw new Error(`请为${row.label}边框选择线型、宽度、间距和颜色。`);
      patch[row.side] = checkedParagraphBorder({ style: row.style.value, size: Number(row.width.value) * 8, space: Number(row.space.value), color: row.color.value.replace(/^#/, '') });
    }
    return reset === 'inherit' && Object.values(patch).every(value => value === null) ? null : patch;
  };
  return { node, read };
}

export function openParagraphBorders(values, apply) {
  const fields = paragraphBorderFields(values), error = el('p.field-error', { role: 'alert', hidden: true });
  const content = el('form.canvas-border-form', { onsubmit: e => {
    e.preventDefault();
    try { if (apply(fields.read()) === false) throw new Error('这些边框无法适应当前页面或单元格。请减小其宽度或间距，或增大页边距或缩进。'); modal.close(); }
    catch (e) { error.textContent = e.message; error.hidden = false; }
  } }, el('div.canvas-style-scroll', {}, fields.node), error,
  el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '应用')));
  const modal = openModal({ title: '段落边框', content, wide: true, onClose: () => {
    const root = modal.panel.closest('.modal-root'); root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true');
  } });
  modal.panel.classList.add('canvas-border-dialog');
  return modal;
}
