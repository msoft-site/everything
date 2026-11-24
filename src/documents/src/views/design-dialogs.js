/**
 * Design tab dialogs: Customize Colors, Customize Fonts, Custom Paragraph Spacing, Custom Watermark,
 * Fill Effects and More Colors. Each shows a live preview and applies through the callback it is given;
 * a callback that returns (or resolves to) false keeps the dialog open.
 */
import { el, fieldId, isComposing } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { segmented } from '../ui/segmented.js';
import { COLOR_SLOTS, COLOR_SLOT_LABELS, FONT_SCHEMES, WATERMARK_TEXTS } from '../engine/document-themes.js';
import { GRADIENT_STYLES, PATTERNS, TEXTURES, drawGradient, drawPattern, drawTexture } from './page-fill-effects.js';

/** Fonts the canvas can draw: bundled faces and their reviewed substitutes. */
export const DESIGN_FONTS = [...new Set([...FONT_SCHEMES.flatMap(s => [s.major, s.minor]), 'Noto Sans', 'Open Sans', 'Montserrat', 'Karla', 'Source Sans Pro', 'Oswald', 'Bebas Neue'])].sort((a, b) => a.localeCompare(b));
export const WATERMARK_PRESETS = ['机密', '严禁复制', '草稿', '样本', '紧急'].flatMap(text => [{ text, layout: 'diagonal' }, { text, layout: 'horizontal' }]);
const LANGUAGES = [['zh-CN', '中文 (简体)'], ['en-US', '英语 (美国)'], ['en-GB', '英语 (英国)'], ['fr-FR', '法语'], ['de-DE', '德语'], ['es-ES', '西班牙语'], ['it-IT', '意大利语'], ['ja-JP', '日语']];
const fontStack = name => `"${name}", "Canvas Noto Sans", "Noto Sans", sans-serif`;
const hexOf = value => value.replace('#', '').toUpperCase();

function dialog({ title, body, submitLabel = '保存', onSubmit, extra = [], wide = true, onClose }) {
  const error = el('p.field-error', { role: 'alert', hidden: true });
  let modal;
  const form = el('form.ed-dialog-body.design-dialog', { onsubmit: async e => {
    e.preventDefault();
    error.hidden = true;
    try {
      const result = await onSubmit();
      if (result === false) return;
      modal.close();
    } catch (failure) { error.textContent = failure?.message || String(failure); error.hidden = false; }
  } }, ...body, error,
  el('div.row.row-end', {}, ...extra, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, submitLabel)));
  modal = openModal({ title, content: form, wide, onClose });
  return { modal, form, error };
}
const field = (label, control, hint) => el('label.field', {}, el('span.field-label', {}, label), control, hint && el('span.field-hint', {}, hint));
const nameInput = value => el('input.input', { type: 'text', value, required: true, maxLength: 60, 'aria-label': '名称' });

/** Customize Colors: the twelve theme colors, with a sample that follows them. */
export function openCustomizeColors({ colors, name, apply, onClose }) {
  const values = { ...colors };
  const sample = el('div.design-color-sample', { 'aria-hidden': 'true' });
  const drawSample = () => {
    sample.style.background = `#${values.lt1}`;
    sample.replaceChildren(el('span.design-sample-heading', { style: { color: `#${values.dk2}` } }, '标题'),
      el('span.design-sample-text', { style: { color: `#${values.dk1}` } }, '正文文本 ', el('span', { style: { color: `#${values.hlink}`, textDecoration: 'underline' } }, '超链接')),
      el('span.design-sample-bars', {}, ...[1, 2, 3, 4, 5, 6].map(i => el('span', { style: { background: `#${values[`accent${i}`]}` } }))));
  };
  const inputs = COLOR_SLOTS.map(slot => {
    const input = el('input.design-color-input', { type: 'color', value: `#${values[slot]}`, 'aria-label': COLOR_SLOT_LABELS[slot], oninput: () => { values[slot] = hexOf(input.value); drawSample(); } });
    return el('label.design-color-field', {}, input, el('span', {}, COLOR_SLOT_LABELS[slot]));
  });
  const named = nameInput(name);
  drawSample();
  dialog({ title: '自定义颜色', onClose, body: [
    el('div.design-color-layout', {}, el('div.design-color-fields', { role: 'group', 'aria-label': '主题颜色' }, ...inputs), el('div', {}, el('span.field-label', {}, '示例'), sample)),
    field('名称', named)],
  onSubmit: () => apply({ name: named.value.trim() || name, colors: { ...values } }),
  extra: [el('button.btn.btn-ghost', { type: 'button', onclick: () => { Object.assign(values, colors); COLOR_SLOTS.forEach((slot, i) => { inputs[i].querySelector('input').value = `#${colors[slot]}`; }); drawSample(); } }, '重置')] });
}

/** Customize Fonts: the heading and body fonts, with a sample. */
export function openCustomizeFonts({ fonts, name, apply, onClose }) {
  const select = value => el('select.input', {}, ...[...new Set([value, ...DESIGN_FONTS])].map(font => el('option', { value: font, selected: font === value }, font)));
  const major = select(fonts.major), minor = select(fonts.minor);
  const sample = el('div.design-font-preview', { 'aria-hidden': 'true' });
  const draw = () => sample.replaceChildren(el('span.design-font-preview-heading', { style: { fontFamily: fontStack(major.value) } }, '标题'),
    el('span.design-font-preview-body', { style: { fontFamily: fontStack(minor.value) } }, '用于段落和列表的正文文本。'));
  major.addEventListener('change', draw); minor.addEventListener('change', draw); draw();
  const named = nameInput(name);
  major.setAttribute('aria-label', '标题字体'); minor.setAttribute('aria-label', '正文字体');
  dialog({ title: '自定义字体', onClose, body: [el('div.grid-2', {}, field('标题字体', major), field('正文字体', minor)), el('span.field-label', {}, '示例'), sample, field('名称', named)],
    onSubmit: () => apply({ name: named.value.trim() || name, major: major.value, minor: minor.value }) });
}

/** Custom Paragraph Spacing for the Normal style: before and after in points, line spacing as a multiple. */
export function openParagraphSpacing({ before, after, line, apply }) {
  const number = (value, min, max, step, label) => el('input.input', { type: 'number', value: Number(value.toFixed(2)), min, max, step, required: true, 'aria-label': label });
  const b = number(before, 0, 600, 0.5, '段前 (磅)'), a = number(after, 0, 600, 0.5, '段后 (磅)'), l = number(line, 0.06, 132, 0.01, '行距 (倍数)');
  dialog({ title: '自定义段落间距', submitLabel: '确定', wide: false,
    body: [el('p.field-hint', {}, '设置“正文”样式的间距；基于它的样式将继承此设置。'), el('div.grid-2', {}, field('段前 (磅)', b), field('段后 (磅)', a)), field('行距 (倍数)', l)],
    onSubmit: () => {
      for (const input of [b, a, l]) if (!input.checkValidity()) { input.reportValidity(); return false; }
      return apply({ before: Number(b.value), after: Number(a.value), line: Number(l.value) });
    } });
}

/** More Colors for the page: any RGB color. */
export function openPageColor({ value, apply }) {
  const picker = el('input.design-page-color', { type: 'color', value: `#${value}`, 'aria-label': '页面颜色' });
  const hex = el('input.input', { type: 'text', value: `#${value}`, 'aria-label': '十六进制值', maxLength: 7, pattern: '#?[0-9A-Fa-f]{6}' });
  picker.addEventListener('input', () => { hex.value = picker.value.toUpperCase(); });
  hex.addEventListener('input', () => { if (/^#?[0-9a-f]{6}$/i.test(hex.value.trim())) picker.value = `#${hex.value.trim().replace('#', '')}`; });
  dialog({ title: '页面颜色', submitLabel: '确定', wide: false, body: [el('div.design-page-color-row', {}, picker, field('十六进制值', hex))],
    onSubmit: () => { if (!hex.checkValidity()) { hex.reportValidity(); return false; } return apply(hexOf(hex.value.trim())); } });
}

/** Custom Watermark: none, a picture (scale, washout) or text (language, text, font, size, color, transparency, layout). */
export function openCustomWatermark({ current, apply, onClose }) {
  let kind = current?.kind || 'text';
  // The current picture is kept unless another is chosen.
  let picture = current?.kind === 'picture' && current.bytes ? { bytes: current.bytes, mime: current.mime, width: current.width, height: current.height } : null;
  const text = current?.kind === 'text' ? current : { text: '草稿', font: null, size: 'auto', color: 'C0C0C0', semitransparent: true, layout: 'diagonal', language: 'zh-CN' };
  const listId = fieldId('watermark-texts');
  const words = el('input.input', { type: 'text', value: text.text, list: listId, maxLength: 120, 'aria-label': '文字' });
  // A watermark's own font (one Word wrote, say) is offered too, so OK keeps it.
  const fontNames = text.font && !DESIGN_FONTS.includes(text.font) ? [text.font, ...DESIGN_FONTS] : DESIGN_FONTS;
  const fonts = el('select.input', { 'aria-label': '字体' }, el('option', { value: '' }, '自动'), ...fontNames.map(f => el('option', { value: f, selected: f === text.font }, f)));
  const size = el('select.input', { 'aria-label': '字号' }, el('option', { value: 'auto' }, '自动'), ...[36, 48, 54, 60, 66, 72, 80, 90, 96, 105, 120, 144].map(n => el('option', { value: n, selected: n === text.size }, String(n))));
  const color = el('input.design-color-input', { type: 'color', value: `#${text.color || 'C0C0C0'}`, 'aria-label': '颜色' });
  const transparent = el('input', { type: 'checkbox', checked: text.semitransparent !== false });
  const language = el('select.input', { 'aria-label': '语言' }, ...LANGUAGES.map(([code, label]) => el('option', { value: code, selected: code === (text.language || 'zh-CN') }, label)));
  let layout = text.layout || 'diagonal';
  const layoutGroup = segmented([['diagonal', '斜式'], ['horizontal', '水平']], layout, value => { layout = value; draw(); }, '版式');
  const file = el('input', { type: 'file', accept: 'image/png,image/jpeg', hidden: true });
  const pictureName = el('span.field-hint', {}, picture ? '将保留当前图片，除非您选择其他图片。' : '未选择图片。');
  const choose = el('button.btn.btn-outline', { type: 'button', onclick: () => file.click() }, '选择图片…');
  const scale = el('select.input', { 'aria-label': '缩放' }, ...[['auto', '自动'], ['0.5', '50%'], ['1', '100%'], ['1.5', '150%'], ['2', '200%'], ['5', '500%']].map(([v, label]) => el('option', { value: v, selected: String(current?.scale ?? 'auto') === v }, label)));
  const washout = el('input', { type: 'checkbox', checked: current?.kind === 'picture' ? !!current.washout : true });
  const preview = el('div.design-watermark-preview', { 'aria-hidden': 'true' });
  let previewUrl = picture ? URL.createObjectURL(new Blob([picture.bytes], { type: picture.mime })) : null;
  const draw = () => {
    if (kind === 'text') {
      const label = el(`span.design-watermark-text.is-${layout}`, { style: { color: color.value, opacity: transparent.checked ? '0.5' : '1', fontFamily: fontStack(fonts.value || 'Noto Sans') } }, words.value || ' ');
      preview.replaceChildren(el('span.design-watermark-page', {}, label));
    } else if (kind === 'picture') {
      preview.replaceChildren(el('span.design-watermark-page', {}, previewUrl ? el('img', { src: previewUrl, alt: '', style: { opacity: washout.checked ? '0.35' : '1' } }) : el('span.design-watermark-empty', {}, '图片')));
    } else preview.replaceChildren(el('span.design-watermark-page', {}));
  };
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0]; if (!chosen) return;
    const bytes = new Uint8Array(await chosen.arrayBuffer());
    try {
      const bitmap = await createImageBitmap(new Blob([bytes], { type: chosen.type }));
      picture = { bytes, mime: chosen.type === 'image/png' ? 'image/png' : 'image/jpeg', width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([bytes], { type: chosen.type }));
      pictureName.textContent = chosen.name;
    } catch { pictureName.textContent = '无法读取该图片。请选择 PNG 或 JPEG 文件。'; picture = null; }
    draw();
  });
  for (const control of [words, fonts, size, color, transparent, washout]) control.addEventListener('input', draw);
  const textPanel = el('div.design-panel', {},
    field('语言', language), field('文字', words), el('datalist', { id: listId }, ...WATERMARK_TEXTS.map(t => el('option', { value: t }))),
    el('div.grid-2', {}, field('字体', fonts), field('字号', size)),
    el('div.design-inline', {}, el('label.design-color-field', {}, color, el('span', {}, '颜色')), el('label.ed-check', {}, transparent, '半透明')),
    el('div.field', {}, el('span.field-label', {}, '版式'), layoutGroup));
  const picturePanel = el('div.design-panel', {}, el('div.design-inline', {}, choose, pictureName), file,
    el('div.grid-2', {}, field('缩放', scale), el('label.ed-check.design-washout', {}, washout, '冲蚀')));
  const show = () => { textPanel.hidden = kind !== 'text'; picturePanel.hidden = kind !== 'picture'; draw(); };
  const kinds = segmented([['none', '无水印'], ['picture', '图片水印'], ['text', '文字水印']], kind, value => { kind = value; show(); }, '水印');
  const watermark = () => {
    if (kind === 'none') return null;
    if (kind === 'picture') {
      if (!picture) throw new Error('请先选择图片。');
      return { kind: 'picture', ...picture, scale: scale.value === 'auto' ? 'auto' : Number(scale.value), washout: washout.checked };
    }
    if (!words.value.trim()) throw new Error('请输入水印文字。');
    return { kind: 'text', text: words.value.trim(), font: fonts.value || null, size: size.value === 'auto' ? 'auto' : Number(size.value), color: hexOf(color.value), semitransparent: transparent.checked, layout, language: language.value };
  };
  // What Apply last put in the document: OK with nothing changed since then adds no second, identical undo step.
  const NOT_APPLIED = {};
  let applied = NOT_APPLIED;
  const same = (a, b) => JSON.stringify(a, (key, value) => key === 'bytes' ? undefined : value) === JSON.stringify(b, (key, value) => key === 'bytes' ? undefined : value) && a?.bytes === b?.bytes;
  const applyButton = el('button.btn.btn-outline', { type: 'button', onclick: async () => {
    try {
      error.hidden = true;
      const chosen = watermark();
      applied = NOT_APPLIED;
      if (await apply(chosen) !== false) applied = chosen;
    } catch (failure) { error.textContent = failure.message; error.hidden = false; }
  } }, '应用');
  const { modal, error } = dialog({ title: '水印', submitLabel: '确定', extra: [applyButton], onClose,
    body: [el('div.field', {}, kinds), el('div.design-watermark-layout', {}, el('div', {}, textPanel, picturePanel), preview)],
    onSubmit: async () => { const chosen = watermark(); if (applied === NOT_APPLIED || !same(chosen, applied)) await apply(chosen); } });
  const close = modal.close;
  modal.close = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); close(); };
  show();
}

/** Fill Effects: gradient, texture, pattern or picture, with a page preview. */
export function openFillEffects({ page, apply, onClose }) {
  let kind = 'gradient', pictureFill = null;
  const state = { color1: 'DEEAF6', color2: 'FFFFFF', style: 'horizontal', texture: TEXTURES[0][0], pattern: PATTERNS[0][0], foreground: '7F7F7F', background: 'FFFFFF' };
  const canvas = el('canvas.design-fill-preview', { width: 120, height: Math.round(120 * page.height / page.width), 'aria-label': '预览', role: 'img' });
  const draw = () => {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (kind === 'gradient') drawGradient(ctx, canvas.width, canvas.height, state);
    else if (kind === 'pattern') drawPattern(ctx, canvas.width, canvas.height, state, 1);
    else if (kind === 'texture') drawTexture(ctx, canvas.width, canvas.height, state);
    else if (pictureFill?.bitmap) { const pattern = ctx.createPattern(pictureFill.bitmap, 'repeat'); ctx.fillStyle = pattern; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  };
  const colorInput = (key, label) => { const input = el('input.design-color-input', { type: 'color', value: `#${state[key]}`, 'aria-label': label, oninput: () => { state[key] = hexOf(input.value); draw(); } }); return el('label.design-color-field', {}, input, el('span', {}, label)); };
  // Each set of tiles is a group of radio buttons: one Tab stop on the chosen tile, the arrows choose the previous or
  // next one, Home and End the first and last.
  const tile = (list, key, paint) => {
    const group = el('div.design-tile-grid', { role: 'radiogroup', 'aria-label': { texture: '纹理', pattern: '图案', style: '底纹样式' }[key], onkeydown: e => {
      if (isComposing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
      const buttons = [...group.children], at = buttons.indexOf(e.target);
      const next = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: buttons.length - 1 }[e.key];
      if (at < 0 || next === undefined) return;
      e.preventDefault();
      const button = buttons[(next + buttons.length) % buttons.length];
      button.click(); button.focus();
    } }, ...list.map(([id, label]) => {
      const preview = el('canvas', { width: 40, height: 40, 'aria-hidden': 'true' });
      const ctx = preview.getContext('2d'); if (ctx) paint(ctx, id);
      const button = el('button.design-tile', { type: 'button', role: 'radio', 'aria-checked': String(state[key] === id), tabindex: state[key] === id ? 0 : -1, title: label, 'aria-label': label, onclick: () => {
        state[key] = id; for (const b of button.parentNode.children) { b.setAttribute('aria-checked', String(b === button)); b.tabIndex = b === button ? 0 : -1; } draw();
      } }, preview);
      return button;
    }));
    if (group.firstChild && ![...group.children].some(b => b.tabIndex === 0)) group.firstChild.tabIndex = 0;
    return group;
  };
  const gradientPanel = el('div.design-panel', {}, el('div.design-inline', {}, colorInput('color1', '颜色 1'), colorInput('color2', '颜色 2')),
    el('div.field', {}, el('span.field-label', {}, '底纹样式'), tile(GRADIENT_STYLES, 'style', (ctx, id) => drawGradient(ctx, 40, 40, { color1: '7FA7D9', color2: 'FFFFFF', style: id }))));
  const texturePanel = el('div.design-panel', {}, tile(TEXTURES, 'texture', (ctx, id) => drawTexture(ctx, 40, 40, { texture: id })));
  const patternPanel = el('div.design-panel', {}, tile(PATTERNS, 'pattern', (ctx, id) => drawPattern(ctx, 40, 40, { pattern: id, foreground: '595959', background: 'FFFFFF' }, 2)),
    el('div.design-inline', {}, colorInput('foreground', '前景色'), colorInput('background', '背景色')));
  const file = el('input', { type: 'file', accept: 'image/png,image/jpeg', hidden: true });
  const pictureName = el('span.field-hint', {}, '未选择图片。图片将在每页上平铺重复。');
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0]; if (!chosen) return;
    const bytes = new Uint8Array(await chosen.arrayBuffer());
    try {
      const bitmap = await createImageBitmap(new Blob([bytes], { type: chosen.type }));
      pictureFill = { bytes, mime: chosen.type === 'image/png' ? 'image/png' : 'image/jpeg', name: chosen.name, bitmap };
      pictureName.textContent = chosen.name;
    } catch { pictureName.textContent = '无法读取该图片。请选择 PNG 或 JPEG 文件。'; pictureFill = null; }
    draw();
  });
  const picturePanel = el('div.design-panel', {}, el('div.design-inline', {}, el('button.btn.btn-outline', { type: 'button', onclick: () => file.click() }, '选择图片…'), pictureName), file);
  const panels = { gradient: gradientPanel, texture: texturePanel, pattern: patternPanel, picture: picturePanel };
  const show = () => { for (const [id, panel] of Object.entries(panels)) panel.hidden = id !== kind; draw(); };
  const kinds = segmented([['gradient', '渐变'], ['texture', '纹理'], ['pattern', '图案'], ['picture', '图片']], kind, value => { kind = value; show(); }, '填充类型');
  dialog({ title: '填充效果', submitLabel: '确定', onClose,
    body: [el('div.field', {}, kinds), el('div.design-fill-layout', {}, el('div', {}, ...Object.values(panels)), el('div', {}, el('span.field-label', {}, '示例'), canvas)),
      el('p.field-hint', {}, '填充效果将另存为图片背景，以便其他应用显示相同的填充。')],
    onSubmit: async () => {
      if (kind === 'picture' && !pictureFill) throw new Error('请先选择图片。');
      const ok = await apply(kind === 'picture' ? { kind, bytes: pictureFill.bytes, mime: pictureFill.mime, name: pictureFill.name } : { kind, ...state });
      if (ok) pictureFill?.bitmap?.close?.();
      return ok;
    } });
  show();
}
