import { el, fieldId } from '../ui/dom.js';
import { clipText } from '../core/text.js';
import { openModal } from '../ui/modal.js';
import { UNDERLINE_STYLES } from '../engine/underlines.js';
import { FALLBACK_SIZES } from '../lib/fontsize.js';
import { openTextColor } from './text-color.js';
import { fontChoices } from './font-picker.js';
import { revealInvalidControls } from './format-dialog-kit.js';
import { canvasFontFamily, cssFontString } from '../engine/font-families.js';

const STYLES = [['regular', '常规'], ['italic', '倾斜'], ['bold', '加粗'], ['boldItalic', '加粗倾斜']];
const SCALES = [200, 150, 100, 90, 80, 66, 50, 33];
const fontStyle = f => f.bold === null || f.italic === null ? '' : f.bold ? (f.italic ? 'boldItalic' : 'bold') : f.italic ? 'italic' : 'regular';
const swatch = color => !color || color === 'auto' ? '#000' : `#${color}`;

/**
 * The Font dialog: font, style, size, color, underline and effects on one tab; scale, spacing,
 * position and kerning on Advanced. Fields start from the selection; a mixed value stays blank or
 * indeterminate and only fields the user changes are applied, in one undo step.
 *
 * format: the selection's run formatting (null where mixed). apply(patch) returns false on failure.
 */
// Chinese, Japanese and Korean letters, which runs show in their East Asian font (w:rFonts/@w:eastAsia).
const EAST_ASIAN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;
/**
 * Whether the Font dialog offers the selection's Asian text font: when the selection, or with only a caret the
 * paragraph it is in, holds East Asian text. `range` is [start, end] in `text`.
 */
export function selectsEastAsianText(text, [start, end]) {
  if (start === end) { start = text.lastIndexOf('\n', start - 1) + 1; end = text.indexOf('\n', end); if (end < 0) end = text.length; }
  return EAST_ASIAN.test(text.slice(start, end));
}

export function openFontDialog({ format: f, sample = '', apply, onClose, setDefault = null, textEffects = null, ligatures = false, title = '字体', eastAsian = false }) {
  const patch = {};
  const set = values => { Object.assign(patch, values); preview(); };
  const unset = (...keys) => { for (const key of keys) delete patch[key]; preview(); };
  const current = key => key in patch ? patch[key] : f[key];

  /* ---- Font tab ---- */
  const fontName = f.fontAscii === f.fontHAnsi ? f.fontAscii : '';
  const fonts = el('datalist', { id: 'ed-font-dialog-fonts' }, ...fontChoices().map(name => el('option', { value: name })));
  const font = el('input.input', { type: 'text', value: fontName || '', placeholder: fontName ? '' : '多种', list: fonts.id, 'aria-label': '西文字体', autocomplete: 'off',
    oninput: () => { const name = font.value.trim(); if (name) set({ fontAscii: name, fontHAnsi: name }); else unset('fontAscii', 'fontHAnsi'); } });
  // Chinese, Japanese and Korean text is shown in the run's Asian text font, which Font alone leaves as it was.
  const asianName = f.fontEastAsia ?? '';
  const asianFont = eastAsian && el('input.input', { type: 'text', value: asianName, placeholder: asianName ? '' : '多种', list: fonts.id, 'aria-label': '中文字体', autocomplete: 'off',
    oninput: () => { const name = asianFont.value.trim(); if (name) set({ fontEastAsia: name }); else unset('fontEastAsia'); } });
  const style = el('select.input', { 'aria-label': '字形', onchange: () => set({ bold: style.value.startsWith('bold'), italic: /italic/i.test(style.value) }) },
    ...(fontStyle(f) ? [] : [el('option', { value: '', disabled: true }, '多种')]), ...STYLES.map(([value, label]) => el('option', { value }, label)));
  style.value = fontStyle(f);
  const sizes = el('datalist', { id: 'ed-font-dialog-sizes' }, ...FALLBACK_SIZES.map(size => el('option', { value: size })));
  const size = el('input.input', { type: 'number', min: 1, max: 1638, step: 0.5, value: f.fontSize ?? '', placeholder: f.fontSize == null ? '多种' : '', list: sizes.id, 'aria-label': '字号',
    // An emptied field leaves the size as it was, as an emptied Font name does, rather than applying the last size typed.
    oninput: () => { if (!size.value) unset('fontSize', 'fontSizeCs'); else if (size.checkValidity()) set({ fontSize: Number(size.value), fontSizeCs: Number(size.value) }); } });
  const colorButton = (label, key) => {
    // The label names the button; the color it shows is read as its description.
    const chip = el('span.ed-font-chip'), name = el('span.ed-font-color-name', { id: fieldId('color-name') });
    const button = el('button.btn.btn-outline.ed-font-color', { type: 'button', 'aria-label': label, 'aria-describedby': name.id, 'aria-haspopup': 'true', onclick: () => {
      openTextColor(current(key), color => { set({ [key]: color }); paint(); }, { anchor: button });
    } }, chip, name);
    const paint = () => {
      const value = current(key);
      chip.style.background = value === null ? 'repeating-linear-gradient(45deg, #ccc 0 3px, #fff 3px 6px)' : swatch(value);
      name.textContent = value === null ? '多种' : value === 'auto' ? '自动' : `#${value}`;
    };
    paint();
    return button;
  };
  const underline = el('select.input', { 'aria-label': '下划线线型', onchange: () => set({ underlineStyle: underline.value }) },
    ...(f.underlineStyle === null ? [el('option', { value: '', disabled: true }, '多种')] : []),
    ...Object.entries(UNDERLINE_STYLES).map(([value, label]) => el('option', { value }, value === 'none' ? '(无)' : label)));
  underline.value = f.underlineStyle ?? '';

  // Effects: each pair shares one property, so checking one clears its partner.
  const effects = [];
  const effect = (label, key, on, partner) => {
    const box = el('input', { type: 'checkbox', onchange: () => {
      box.indeterminate = false;
      if (box.checked && partner) { const other = effects.find(e => e.label === partner); other.box.checked = false; other.box.indeterminate = false; }
      set({ [key]: box.checked ? on : key === 'verticalAlign' ? 'baseline' : key === 'capitalization' ? 'normal' : key === 'vanish' ? false : 'none' });
    } });
    if (f[key] === null) box.indeterminate = true; else box.checked = f[key] === on;
    effects.push({ label, box });
    return el('label.ed-check', {}, box, label);
  };
  const effectGrid = el('fieldset.ed-font-effects', {}, el('legend', {}, '效果'),
    effect('删除线', 'strikethrough', 'single', '双删除线'), effect('小型大写字母', 'capitalization', 'smallCaps', '全部大写'),
    effect('双删除线', 'strikethrough', 'double', '删除线'), effect('全部大写', 'capitalization', 'caps', '小型大写字母'),
    effect('上标', 'verticalAlign', 'superscript', '下标'), effect('隐藏', 'vanish', true),
    effect('下标', 'verticalAlign', 'subscript', '上标'));

  /* ---- Advanced tab ---- */
  const scales = el('datalist', { id: 'ed-font-dialog-scales' }, ...SCALES.map(n => el('option', { value: n })));
  const scale = el('input.input', { type: 'number', min: 1, max: 600, step: 1, value: f.textScale ?? '', placeholder: f.textScale == null ? '多种' : '', list: scales.id, 'aria-label': '缩放 (%)',
    oninput: () => { if (!scale.value) unset('textScale'); else if (scale.checkValidity()) set({ textScale: Number(scale.value) }); } });
  const signed = (value, positive, negative) => value === null ? '' : value > 0 ? positive : value < 0 ? negative : 'normal';
  const amount = (label, value) => el('input.input', { type: 'number', min: 0, max: 1584, step: 0.05, value: value ? Math.abs(value) : '', placeholder: value === null ? '多种' : '', 'aria-label': label });
  const spacing = el('select.input', { 'aria-label': '间距' }, el('option', { value: '', disabled: true, hidden: f.characterSpacing !== null }, '多种'),
    el('option', { value: 'normal' }, '标准'), el('option', { value: 'expanded' }, '加宽'), el('option', { value: 'condensed' }, '紧缩'));
  spacing.value = signed(f.characterSpacing, 'expanded', 'condensed');
  const spacingBy = amount('间距磅值 (磅)', f.characterSpacing);
  const applySpacing = () => {
    spacingBy.disabled = spacing.value === 'normal';
    if (spacing.value === 'normal') { spacingBy.value = ''; set({ characterSpacing: 0 }); return; }
    if (!spacing.value) return;
    const by = Number(spacingBy.value || 1);
    if (!spacingBy.value) spacingBy.value = '1';
    if (spacingBy.checkValidity()) set({ characterSpacing: spacing.value === 'condensed' ? -by : by });
  };
  spacing.addEventListener('change', applySpacing); spacingBy.addEventListener('input', applySpacing);
  spacingBy.disabled = spacing.value === 'normal';
  const position = el('select.input', { 'aria-label': '位置' }, el('option', { value: '', disabled: true, hidden: f.baselineShift !== null }, '多种'),
    el('option', { value: 'normal' }, '标准'), el('option', { value: 'raised' }, '提升'), el('option', { value: 'lowered' }, '降低'));
  position.value = signed(f.baselineShift, 'raised', 'lowered');
  const positionBy = amount('位置磅值 (磅)', f.baselineShift);
  positionBy.max = 200; positionBy.step = 0.5;
  const applyPosition = () => {
    positionBy.disabled = position.value === 'normal';
    if (position.value === 'normal') { positionBy.value = ''; set({ baselineShift: 0 }); return; }
    if (!position.value) return;
    if (!positionBy.value) positionBy.value = '3';
    if (positionBy.checkValidity()) set({ baselineShift: position.value === 'lowered' ? -Number(positionBy.value) : Number(positionBy.value) });
  };
  position.addEventListener('change', applyPosition); positionBy.addEventListener('input', applyPosition);
  positionBy.disabled = position.value === 'normal';
  const kern = el('input', { type: 'checkbox' });
  const kernFrom = el('input.input', { type: 'number', min: 0.5, max: 1638, step: 0.5, value: f.kerning || '', placeholder: f.kerning === null ? '多种' : '', 'aria-label': '字距调整起算磅值 (磅)' });
  if (f.kerning === null) kern.indeterminate = true; else kern.checked = f.kerning > 0;
  kernFrom.disabled = !kern.checked;
  const applyKerning = () => {
    kern.indeterminate = false; kernFrom.disabled = !kern.checked;
    if (!kern.checked) { set({ kerning: 0 }); return; }
    if (!kernFrom.value) kernFrom.value = String(f.fontSize || 12);
    if (kernFrom.checkValidity()) set({ kerning: Number(kernFrom.value) });
  };
  kern.addEventListener('change', applyKerning); kernFrom.addEventListener('input', applyKerning);

  // Ligatures only where this document renders OpenType features (its compatibility settings allow them).
  const LIGATURES = [['none', '无'], ['standard', '仅标准'], ['standardContextual', '标准和上下文'], ['historicalDiscretional', '历史和可选'], ['all', '全部']];
  const ligatureSelect = el('select.input', { 'aria-label': '连字', onchange: () => set({ ligatures: ligatureSelect.value }) },
    ...(f.ligatures == null || !LIGATURES.some(([v]) => v === f.ligatures) ? [el('option', { value: '', disabled: true }, f.ligatures == null ? '多种' : '自定义')] : []), ...LIGATURES.map(([v, label]) => el('option', { value: v }, label)));
  ligatureSelect.value = LIGATURES.some(([v]) => v === f.ligatures) ? f.ligatures : '';

  /* ---- Preview ---- */
  const previewText = el('span', {}, clipText(sample.replace(/\s+/g, ' ').trim(), 48) || fontName || 'Aa Bb Cc 中文字体示例');
  const previewBox = el('div.ed-font-preview', { 'aria-hidden': 'true' }, previewText);
  function preview() {
    const s = previewText.style, family = current('fontAscii'), asian = eastAsian && current('fontEastAsia');
    // Latin letters in the Latin font (the bundled Noto Sans under its page name), the rest in the Asian font.
    s.fontFamily = !asian ? (family ? `"${family}", system-ui, sans-serif` : '') : `${family ? canvasFontFamily({ fontFamily: family }) : '"Canvas Noto Sans"'}, ${cssFontString(asian)}, system-ui, sans-serif`;
    s.fontWeight = current('bold') ? '700' : '400';
    s.fontStyle = current('italic') ? 'italic' : 'normal';
    s.fontSize = `${Math.min(28, Math.max(8, current('fontSize') || 12)) * 4 / 3}px`;
    const color = current('color');
    s.color = color && color !== 'auto' ? `#${color}` : '';
    const strike = current('strikethrough'), line = current('underlineStyle');
    s.textDecorationLine = [line && line !== 'none' ? 'underline' : '', strike && strike !== 'none' ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
    s.textDecorationStyle = line === 'double' || strike === 'double' ? 'double' : /dot/i.test(line || '') ? 'dotted' : /dash/i.test(line || '') ? 'dashed' : /wav/i.test(line || '') ? 'wavy' : 'solid';
    const capitalization = current('capitalization');
    s.textTransform = capitalization === 'caps' ? 'uppercase' : '';
    s.fontVariantCaps = capitalization === 'smallCaps' ? 'small-caps' : '';
    const vertical = current('verticalAlign');
    s.verticalAlign = vertical === 'superscript' ? 'super' : vertical === 'subscript' ? 'sub' : '';
    s.letterSpacing = current('characterSpacing') ? `${current('characterSpacing') * 4 / 3}px` : '';
    s.display = 'inline-block';
    s.transform = current('textScale') && current('textScale') !== 100 ? `scaleX(${current('textScale') / 100})` : '';
    // Hidden text previews as it shows with formatting marks: dotted underline, dimmed.
    s.opacity = current('vanish') ? '0.55' : '';
    if (current('vanish') && s.textDecorationLine === 'none') { s.textDecorationLine = 'underline'; s.textDecorationStyle = 'dotted'; }
  }
  preview();

  /* ---- Tabs and actions ---- */
  const row = (label, control) => el('label.ed-font-field', {}, el('span.field-label', {}, label), control);
  const fontPanel = el('div.ed-font-panel', { role: 'tabpanel', id: 'ed-font-tab-font', 'aria-labelledby': 'ed-font-tab-font-button' },
    el('div.ed-font-grid', {}, row('西文字体', font), row('字形', style), row('字号', size)),
    asianFont && el('div.ed-font-grid', {}, row('中文字体', asianFont)),
    el('div.ed-font-grid', {}, row('字体颜色', colorButton('字体颜色', 'color')), row('下划线线型', underline), row('下划线颜色', colorButton('下划线颜色', 'underlineColor'))),
    effectGrid, fonts, sizes);
  const advancedPanel = el('div.ed-font-panel', { role: 'tabpanel', id: 'ed-font-tab-advanced', 'aria-labelledby': 'ed-font-tab-advanced-button', hidden: true },
    el('fieldset.ed-font-advanced', {}, el('legend', {}, '字符间距'),
      row('缩放 (%)', scale),
      el('div.ed-font-pair', {}, row('间距', spacing), row('磅值 (磅)', spacingBy)),
      el('div.ed-font-pair', {}, row('位置', position), row('磅值 (磅)', positionBy)),
      el('div.ed-font-pair', {}, el('label.ed-check', {}, kern, '字距调整:'), row('磅值及以上', kernFrom))),
    ligatures && el('fieldset.ed-font-advanced', {}, el('legend', {}, 'OpenType 功能'), row('连字', ligatureSelect)),
    scales);
  const tabs = [['font', '字体', fontPanel], ['advanced', '高级', advancedPanel]];
  const tabButtons = tabs.map(([id, label, panel], i) => el('button.ed-font-tab', { type: 'button', role: 'tab', id: `ed-font-tab-${id}-button`, 'aria-controls': panel.id, 'aria-selected': String(!i), tabindex: i ? -1 : 0,
    onclick: () => show(id), onkeydown: e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const next = tabs[(i + 1) % tabs.length][0]; show(next); tabButtons[(i + 1) % tabs.length].focus(); } } }, label));
  function show(id) {
    tabs.forEach(([tab, , panel], i) => { const on = tab === id; panel.hidden = !on; tabButtons[i].setAttribute('aria-selected', String(on)); tabButtons[i].tabIndex = on ? 0 : -1; });
  }
  const message = el('p.field-error', { role: 'alert', hidden: true });
  let modal;
  /** Apply the changes made so far; false (with the reason shown) when they cannot be. */
  const commit = async () => {
    if (!form.reportValidity()) return false;
    if (Object.keys(patch).length) {
      let failure = null;
      const ok = await apply(patch, error => { failure = error; });
      if (ok === false) { message.textContent = failure?.message || '无法将此格式应用于所选内容。'; message.hidden = false; return false; }
    }
    return true;
  };
  const form = el('form.ed-dialog-body.ed-font-dialog', { onsubmit: async e => {
    e.preventDefault();
    if (await commit()) modal.close();
  } },
  el('div.ed-font-tabs', { role: 'tablist', 'aria-label': '字体设置' }, ...tabButtons),
  fontPanel, advancedPanel,
  el('div.ed-font-preview-frame', {}, el('span.field-label', {}, '预览'), previewBox),
  message,
  el('div.fmt-footer', {},
    el('div.fmt-footer-start', {},
      setDefault && el('button.btn.btn-ghost', { type: 'button', onclick: async () => {
        if (!form.reportValidity()) return;
        let failure = null;
        const ok = await setDefault({ ...patch }, error => { failure = error; });
        if (ok === false) { if (failure) { message.textContent = failure.message; message.hidden = false; } return; }
        modal.close();
      } }, '设为默认值'),
      // Text Effects takes the Font dialog's changes with it, as the Paragraph dialog's Tabs… does.
      textEffects && el('button.btn.btn-outline', { type: 'button', onclick: async () => { if (!await commit()) return; modal.close(); textEffects(); } }, '文字效果…')),
    el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '确定'))));
  revealInvalidControls(form);
  modal = openModal({ title, content: form, wide: true, onClose });
  font.focus(); font.select();
  return modal;
}
