/**
 * Tracking display choices: the Show Markup menu and the Tracking Options dialog (marks and colors
 * for insertions, deletions, moves and formatting, change bars, balloons, reviewer colors), with a
 * live preview. View choices are remembered per reader; the document-level ones (what markup is
 * shown, whether moves and formatting are tracked) are saved in the file's settings.
 */
import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { revisionView, revisionColor, INSERT_MARKS, DELETE_MARKS, FORMAT_MARKS, MOVE_COLOR } from '../engine/revisions.js';
import { preference, hint } from './review-ui.js';

const STORED = preference('documents:tracking-options', {});
const VIEW_KEYS = ['balloons', 'insertMark', 'deleteMark', 'insertColor', 'deleteColor', 'formatMark', 'formatColor', 'moveFromMark', 'moveToMark', 'moveColor', 'changeBars', 'changeBarColor', 'authorColors', 'paneOrientation'];
export const BALLOONS = [['balloons', '在批注框中显示修订'], ['inline', '以嵌入方式显示所有修订'], ['commentsFormatting', '仅在批注框中显示批注和格式设置']];
const MARK_NAMES = { underline: '下划线', doubleUnderline: '双下划线', strikethrough: '删除线', doubleStrikethrough: '双删除线', bold: '加粗', italic: '倾斜', colorOnly: '仅颜色', hidden: '隐藏', none: '(无)' };
export const COLORS = [['author', '按作者'], ['000000', '黑色'], ['2E6EB5', '蓝色'], ['00838F', '青色'], ['2F8A3A', '绿色'], ['2E7D32', '深绿'], ['B5082E', '红色'], ['C25E00', '橙色'], ['8A3FB0', '紫罗兰色'], ['A0306E', '粉红色'], ['5B6B00', '橄榄色'], ['7A7A7A', '灰色']];
const BAR_SIDES = [['none', '无'], ['left', '左边框'], ['right', '右边框'], ['outside', '外侧边框']];

/** Apply remembered view choices at startup. */
export function restoreTrackingOptions() {
  const stored = STORED.get();
  for (const key of VIEW_KEYS) if (stored[key] !== undefined) revisionView.options[key] = stored[key];
}
export function rememberTrackingOptions() {
  STORED.set(Object.fromEntries(VIEW_KEYS.map(key => [key, revisionView.options[key]])));
}

const select = (label, value, options, onchange) => {
  const node = el('select.input', { 'aria-label': label, onchange: () => onchange(node.value) }, ...options.map(([v, text]) => el('option', { value: v, selected: v === value }, text)));
  return node;
};
const markOptions = list => list.map(v => [v, MARK_NAMES[v] || v]);

/**
 * The Tracking Options dialog. ctx: { authors(), doc: { trackMoves, trackFormatting }, apply(options, doc) }.
 */
export function openTrackingOptions({ authors = () => [], doc = {}, apply, onClose }) {
  const o = structuredClone(revisionView.options);
  const d = { trackMoves: doc.trackMoves !== false, trackFormatting: doc.trackFormatting !== false };
  const preview = el('div.rv-preview', { 'aria-hidden': 'true' });
  const swatch = color => color && color !== 'author' ? `#${color}` : `#${revisionColor(authors()[0] || 'Reviewer', authors())}`;
  const style = (mark, color) => {
    const c = swatch(color);
    return { underline: `text-decoration: underline; text-decoration-color: ${c}`, doubleUnderline: `text-decoration: underline double; text-decoration-color: ${c}`, strikethrough: `text-decoration: line-through; text-decoration-color: ${c}`, doubleStrikethrough: `text-decoration: line-through double; text-decoration-color: ${c}`, bold: 'font-weight: 700', italic: 'font-style: italic', colorOnly: '', hidden: 'display: none', none: '' }[mark] + `; color: ${c}`;
  };
  function renderPreview() {
    const bar = o.changeBars === 'none' ? '' : `border-${o.changeBars === 'right' ? 'right' : 'left'}: 2px solid ${o.changeBarColor && o.changeBarColor !== 'auto' && o.changeBarColor !== 'author' ? `#${o.changeBarColor}` : '#7a7a7a'}`;
    preview.innerHTML = '';
    preview.append(el('p', { style: bar ? `${bar}; padding-inline: 6px` : '' },
      '正文文字，', el('span', { style: style(o.insertMark, o.insertColor) }, '插入的文字'), '，', el('span', { style: style(o.deleteMark, o.deleteColor) }, '删除的文字'), '，',
      d.trackMoves ? el('span', { style: style(o.moveFromMark, o.moveColor || MOVE_COLOR) }, '移自') : '移自', '，',
      d.trackMoves ? el('span', { style: style(o.moveToMark, o.moveColor || MOVE_COLOR) }, '移至') : '移至', ' 与 ',
      el('span', { style: o.formatMark === 'none' ? '' : style(o.formatMark, o.formatColor) }, '重新设置格式的'), ' 文字。'));
  }
  const field = (label, control) => el('label.field.rv-field', {}, el('span.field-label', {}, label), control);
  const check = (label, checked, onchange, disabled = false) => { const input = el('input', { type: 'checkbox', checked, disabled, onchange: () => { onchange(input.checked); renderPreview(); } }); return el('label.rv-check', {}, input, label); };
  const set = key => value => { o[key] = value; renderPreview(); };
  const authorRows = authors().map(name => field(name, select(`${name} 颜色`, o.authorColors?.[name] || 'author', [['author', '自动'], ...COLORS.slice(1)], value => { o.authorColors = { ...o.authorColors }; if (value === 'author') delete o.authorColors[name]; else o.authorColors[name] = value; renderPreview(); })));
  const content = el('form.ed-dialog-body.rv-tracking-options', { onsubmit: e => { e.preventDefault(); modal.close(); apply(o, d); } },
    el('fieldset.rv-fieldset', {}, el('legend', {}, '标记'),
      el('div.rv-grid', {},
        field('插入', select('插入标记', o.insertMark, markOptions(INSERT_MARKS), set('insertMark'))), field('颜色', select('插入颜色', o.insertColor, COLORS, set('insertColor'))),
        field('删除', select('删除标记', o.deleteMark, markOptions(DELETE_MARKS), set('deleteMark'))), field('颜色', select('删除颜色', o.deleteColor, COLORS, set('deleteColor'))),
        field('修改的行', select('修订竖线位置', o.changeBars, BAR_SIDES, set('changeBars'))), field('颜色', select('修订竖线颜色', o.changeBarColor === 'auto' ? 'author' : o.changeBarColor, [['author', '自动'], ...COLORS.slice(1)], value => { o.changeBarColor = value === 'author' ? 'auto' : value; renderPreview(); })))),
    el('fieldset.rv-fieldset', {}, el('legend', {}, '移动'),
      check('跟踪移动', d.trackMoves, value => { d.trackMoves = value; }),
      el('div.rv-grid', {},
        field('移自', select('移自标记', o.moveFromMark, markOptions(DELETE_MARKS.filter(m => m !== 'hidden')), set('moveFromMark'))), field('颜色', select('移动颜色', o.moveColor || MOVE_COLOR, COLORS.slice(1), set('moveColor'))),
        field('移至', select('移至标记', o.moveToMark, markOptions(INSERT_MARKS), set('moveToMark'))))),
    el('fieldset.rv-fieldset', {}, el('legend', {}, '格式设置'),
      check('跟踪格式设置', d.trackFormatting, value => { d.trackFormatting = value; }, !!doc.formattingLocked),
      doc.formattingLocked ? hint('修订已锁定，因此格式设置更改将被跟踪。') : null,
      el('div.rv-grid', {}, field('格式设置', select('格式设置标记', o.formatMark, markOptions(FORMAT_MARKS), set('formatMark'))), field('颜色', select('格式设置颜色', o.formatColor, COLORS, set('formatColor'))))),
    el('fieldset.rv-fieldset', {}, el('legend', {}, '批注框和窗格'),
      field('批注框', select('批注框', o.balloons, BALLOONS, set('balloons'))),
      field('审阅窗格', select('审阅窗格方向', o.paneOrientation || 'vertical', [['vertical', '垂直(页面侧边)'], ['horizontal', '水平(页面下方)']], set('paneOrientation')))),
    authorRows.length ? el('fieldset.rv-fieldset', {}, el('legend', {}, '审阅者颜色'), ...authorRows) : null,
    el('div.rv-preview-wrap', {}, el('span.field-label', {}, '预览'), preview),
    hint('标记和颜色仅控制修订在屏幕上的显示方式。跟踪移动和格式设置将随文档保存。'),
    el('div.modal-actions', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '确定')));
  renderPreview();
  const modal = openModal({ title: '修订选项', content, onClose, wide: true });
  return modal;
}

/**
 * Show Markup menu items. ctx: { authors(), ink?: { shown, toggle }, comments: { shown, toggle }, update(options) }.
 */
export function showMarkupItems({ authors, ink, comments, update }) {
  const o = revisionView.options;
  const toggle = key => () => update({ [key]: !o[key] });
  const people = authors();
  return [
    { label: '批注', checked: comments.shown, onSelect: () => comments.toggle() },
    ...(ink ? [{ label: '墨迹', checked: ink.shown, onSelect: () => ink.toggle() }] : []),
    { label: '插入和删除', checked: o.showInsDel, onSelect: toggle('showInsDel') },
    { label: '格式设置', checked: o.showFormatting, onSelect: toggle('showFormatting') },
    { separator: true },
    { label: '批注框', items: BALLOONS.map(([value, label]) => ({ label, radio: true, checked: o.balloons === value, onSelect: () => update({ balloons: value }) })) },
    { label: '特定审阅者', disabled: !people.length, items: [
      { label: '所有审阅者', checked: !o.hiddenAuthors.length, onSelect: () => update({ hiddenAuthors: [] }) },
      { separator: true },
      ...people.map(name => ({ label: name, checked: !o.hiddenAuthors.includes(name), onSelect: () => update({ hiddenAuthors: o.hiddenAuthors.includes(name) ? o.hiddenAuthors.filter(n => n !== name) : [...o.hiddenAuthors, name] }) })),
    ] },
  ];
}
