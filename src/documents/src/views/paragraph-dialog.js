import { el } from '../ui/dom.js';
import { tabStrip, field, checkbox, group, select, distance, points, openFormatDialog, paragraphPreview } from './format-dialog-kit.js';
import { physicalAlignment } from '../engine/rtl-paragraph.js';

const ALIGNMENTS = [['left', '左对齐'], ['center', '居中'], ['right', '右对齐'], ['both', '两端对齐'], ['distribute', '分散对齐']];
const OUTLINE = [...Array.from({ length: 9 }, (_, i) => [String(i), `${i + 1} 级`]), ['9', '正文文本']];
const LINE_CHOICES = [['single', '单倍行距'], ['oneHalf', '1.5 倍行距'], ['double', '2 倍行距'], ['atLeast', '最小值'], ['exact', '固定值'], ['multiple', '多倍行距']];

/** The line-spacing choice and amount for a paragraph format (null when mixed). */
export function lineChoice(rule, spacing) {
  if (rule === null || spacing === null || rule === undefined) return ['', ''];
  if (rule === 'exact') return ['exact', spacing];
  if (rule === 'atLeast') return ['atLeast', spacing];
  if (spacing === 1) return ['single', ''];
  if (spacing === 1.5) return ['oneHalf', ''];
  if (spacing === 2) return ['double', ''];
  return ['multiple', spacing];
}
/** The lineRule/lineSpacing pair a choice stands for. */
export function lineSetting(choice, amount) {
  if (choice === 'single') return { lineRule: 'auto', lineSpacing: 1 };
  if (choice === 'oneHalf') return { lineRule: 'auto', lineSpacing: 1.5 };
  if (choice === 'double') return { lineRule: 'auto', lineSpacing: 2 };
  if (choice === 'multiple') return { lineRule: 'auto', lineSpacing: Math.round(Number(amount) * 240) / 240 };
  return { lineRule: choice, lineSpacing: Math.round(Number(amount) * 20) / 20 };
}

/**
 * The Paragraph dialog: Indents and Spacing, Line and Page Breaks, with a live preview, Tabs… and Set As
 * Default. Fields start from the selection; mixed values stay blank and only changed fields are applied,
 * in one undo step.
 *
 * format: the selection's paragraph formatting (null where mixed). apply(patch) returns false on failure.
 * openTabs(patch): applies the pending patch and opens the Tabs dialog. setDefault(patch): applies it to
 * the default paragraph style.
 */
export function openParagraphDialog({ format: f, unit = 'in', canSetOutline = true, apply, openTabs, setDefault, onClose, initialTab = 'indents' }) {
  /* ---- Indents and Spacing ---- */
  // Thai Distributed (§17.18.44 thaiDistribute) is offered where a paragraph has it, so the dialog shows it and keeps it.
  // Left and Right name sides of the page. The file keeps alignment relative to the reading direction
  // (rtl-paragraph.js), so a right-to-left paragraph shows, and stores, the opposite value. With mixed
  // directions the stored value is shown as it is.
  const direction = select('文字方向', [['ltr', '从左向右'], ['rtl', '从右向左']], f.bidi === null ? '' : f.bidi ? 'rtl' : 'ltr', { mixed: f.bidi === null });
  const rtlNow = () => direction.value === 'rtl';
  const alignment = select('对齐方式', f.alignment === 'thaiDistribute' ? [...ALIGNMENTS, ['thaiDistribute', '泰文分散对齐']] : ALIGNMENTS, f.alignment === null ? null : physicalAlignment(f.alignment, !!f.bidi), { mixed: f.alignment === null });
  let shownRtl = !!f.bidi;
  const outline = select('大纲级别', OUTLINE, f.outlineLevel === null ? '' : String(f.outlineLevel), { mixed: f.outlineLevel === null });
  outline.disabled = !canSetOutline;
  if (!canSetOutline) outline.title = '内置标题样式具有固定的大纲级别。';
  const left = distance('左侧缩进', f.indentLeft, { unit }), right = distance('右侧缩进', f.indentRight, { unit });
  const special = select('特殊格式', [['none', '(无)'], ['firstLine', '首行缩进'], ['hanging', '悬挂缩进']], f.firstLine === null ? '' : f.firstLine > 0 ? 'firstLine' : f.firstLine < 0 ? 'hanging' : 'none', { mixed: f.firstLine === null });
  const by = distance('磅值/字符', f.firstLine === null ? null : Math.abs(f.firstLine), { unit, min: 0 });
  const syncSpecial = () => { by.disabled = !special.value || special.value === 'none'; if (!by.disabled && by.value === '') by.value = unit === 'cm' ? '1.27' : '0.5'; };
  special.addEventListener('change', syncSpecial); syncSpecial();
  const leftLabel = el('span.field-label', {}, '左侧'), rightLabel = el('span.field-label', {}, '右侧');
  // The stored left indent is the one before the text: on the right in a right-to-left paragraph.
  const labelIndents = on => { leftLabel.textContent = on ? '内部' : rtlNow() ? '文字之前' : '左侧'; rightLabel.textContent = on ? '外部' : rtlNow() ? '文字之后' : '右侧'; };
  const mirror = checkbox('镜像缩进', f.mirrorIndents, on => { labelIndents(on); preview(); });
  labelIndents(!!f.mirrorIndents);
  direction.addEventListener('change', () => {
    // The paragraph turns over as a whole: its alignment keeps its stored value, so the side shown flips.
    if (alignment.value) alignment.value = physicalAlignment(physicalAlignment(alignment.value, shownRtl), rtlNow());
    shownRtl = rtlNow(); labelIndents(mirror.box.checked && !mirror.box.indeterminate); preview();
  });
  // A document's amounts need not fall on the arrows' steps (spacing is kept in twentieths of a point, 7.5 pt or
  // 13.8 pt), so the fields take any amount, as Word does; it is rounded to the file's units where it is applied.
  const before = points('段前间距', f.spaceBefore, { step: 'any' }), after = points('段后间距', f.spaceAfter, { step: 'any' });
  const [choice, amount] = lineChoice(f.lineRule, f.lineSpacing);
  // A multiple is kept in 240ths of a line: Word's 1.08 is 259/240. It shows to two places, as Word shows it, and an
  // untouched amount keeps its exact value.
  const shownAmount = choice === 'multiple' ? String(Number(Number(amount).toFixed(2))) : String(amount);
  const line = select('行距', LINE_CHOICES, choice, { mixed: !choice });
  const at = el('input.input', { type: 'number', min: 0, step: 'any', value: shownAmount, placeholder: choice ? '' : '多种', 'aria-label': '行距设置值' });
  const syncLine = (fill = false) => {
    const fixed = ['single', 'oneHalf', 'double', ''].includes(line.value);
    at.disabled = fixed;
    at.max = line.value === 'multiple' ? 5 : 600;
    if (fixed) at.value = '';
    else if (fill || at.value === '') at.value = line.value === 'multiple' ? '3' : '12';
  };
  line.addEventListener('change', () => { syncLine(true); preview(); }); syncLine();
  const contextual = checkbox('如果定义了相同样式，则段落之间不添加空格', f.contextualSpacing);
  const indentsPanel = el('div', {},
    group('常规', el('div.fmt-grid', {}, field('对齐方式', alignment), field('大纲级别', outline), field('文字方向', direction))),
    group('缩进', el('div.fmt-grid', {}, el('label.ed-font-field', {}, leftLabel, left), el('label.ed-font-field', {}, rightLabel, right), field('特殊格式', special), field(`磅值 (${by.unit})`, by)), mirror),
    group('间距', el('div.fmt-grid', {}, field('段前 (磅)', before), field('段后 (磅)', after), field('行距', line), field('设置值', at)), contextual));

  /* ---- Line and Page Breaks ---- */
  const flags = [['widowControl', '孤行控制'], ['keepNext', '与下段同页'], ['keepLines', '段中不分页'], ['pageBreakBefore', '段前分页']].map(([key, label]) => ({ key, node: checkbox(label, f[key]) }));
  const exceptions = [['suppressLineNumbers', '取消行号'], ['suppressAutoHyphens', '不进行断字']].map(([key, label]) => ({ key, node: checkbox(label, f[key]) }));
  const breaksPanel = el('div', {},
    group('换行和分页', el('div.fmt-checks', {}, ...flags.map(x => x.node))),
    group('格式异常', el('div.fmt-checks', {}, ...exceptions.map(x => x.node))),
    el('p.field-hint', {}, '行号与断字设置保存在文档中供其他文字处理程序读取；本编辑器不自动排版行号或断字。'));
  const tabs = tabStrip('段落设置', [['indents', '缩进和间距', indentsPanel], ['breaks', '换行和分页', breaksPanel]]);

  /* ---- Preview ---- */
  const sample = paragraphPreview();
  function preview() {
    const s = sample.sample.style, scale = 1 / 1440 * 40; // 40px per inch in the miniature page
    const twips = input => { const v = input.read?.(); return v ?? 0; };
    const align = alignment.value || 'left';
    s.textAlign = align === 'both' || align === 'distribute' || align === 'thaiDistribute' ? 'justify' : align;
    s.textAlignLast = align === 'distribute' ? 'justify' : '';
    const leftTw = twips(rtlNow() ? right : left), rightTw = twips(rtlNow() ? left : right);
    s.direction = rtlNow() ? 'rtl' : 'ltr';
    s.marginLeft = `${Math.max(-20, leftTw * scale)}px`; s.marginRight = `${Math.max(-20, rightTw * scale)}px`;
    const first = special.value === 'firstLine' ? twips(by) : special.value === 'hanging' ? -twips(by) : 0;
    s.textIndent = `${first * scale}px`;
    s.marginTop = `${Math.min(24, Number(before.value || 0) / 2)}px`; s.marginBottom = `${Math.min(24, Number(after.value || 0) / 2)}px`;
    const setting = line.value ? lineSetting(line.value, at.value || 1) : null;
    s.lineHeight = !setting ? '' : setting.lineRule === 'auto' ? String(1.2 * setting.lineSpacing) : `${Math.max(4, setting.lineSpacing / 2)}px`;
  }
  for (const input of [alignment, left, right, special, by, before, after, at]) input.addEventListener('input', preview);
  for (const input of [alignment, special]) input.addEventListener('change', preview);
  preview();

  /* ---- Reading the patch ---- */
  function patch() {
    const result = {};
    // A caller that gives no direction (a style or a search format) means left-to-right.
    if (direction.value && (f.bidi === null || rtlNow() !== !!f.bidi)) result.bidi = rtlNow();
    const stored = alignment.value && physicalAlignment(alignment.value, direction.value ? rtlNow() : false);
    if (stored && stored !== f.alignment) result.alignment = stored;
    if (canSetOutline && outline.value !== '' && Number(outline.value) !== f.outlineLevel) result.outlineLevel = Number(outline.value);
    for (const [key, input] of [['indentLeft', left], ['indentRight', right]]) { const v = input.read(); if (v !== null && v !== f[key]) result[key] = v; }
    if (special.value) {
      const v = special.value === 'none' ? 0 : (by.read() ?? 0) * (special.value === 'hanging' ? -1 : 1);
      if (v !== f.firstLine) result.firstLine = v;
    }
    for (const [key, input] of [['spaceBefore', before], ['spaceAfter', after]]) { const v = input.read(); if (v !== null && v !== f[key]) result[key] = v; }
    if (line.value && !(line.value === choice && at.value === shownAmount)) {
      if (!line.value.match(/single|oneHalf|double/) && (at.value === '' || !at.checkValidity())) throw new Error('请输入行距设置值。');
      const setting = lineSetting(line.value, at.value);
      if (setting.lineRule !== f.lineRule || setting.lineSpacing !== f.lineSpacing) Object.assign(result, setting);
    }
    const box = (key, node) => { if (!node.box.indeterminate && node.box.checked !== f[key]) result[key] = node.box.checked; };
    box('mirrorIndents', mirror); box('contextualSpacing', contextual);
    for (const { key, node } of [...flags, ...exceptions]) box(key, node);
    return result;
  }
  const tabsButton = el('button.btn.btn-outline', { type: 'button', onclick: async () => {
    try { const value = patch(); if (await openTabs?.(value) !== false) modal.close(); } catch (e) { modal.fail(e.message); }
  } }, '制表位…');
  const defaultButton = el('button.btn.btn-ghost', { type: 'button', onclick: async () => {
    try { const value = patch(); if (await setDefault?.(value) !== false) modal.close(); } catch (e) { modal.fail(e.message); }
  } }, '设为默认值');
  const modal = openFormatDialog({ title: '段落', className: 'fmt-paragraph-dialog', onClose,
    body: [tabs.node, indentsPanel, breaksPanel, el('div.ed-font-preview-frame', {}, el('span.field-label', {}, '预览'), sample.node)],
    extra: [openTabs && tabsButton, setDefault && defaultButton].filter(Boolean),
    submit: () => { const value = patch(); return Object.keys(value).length ? apply(value) : true; } });
  if (initialTab !== 'indents') tabs.show(initialTab);
  (initialTab === 'breaks' ? flags[0].node.box : alignment).focus();
  return modal;
}
