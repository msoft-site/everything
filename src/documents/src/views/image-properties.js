import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { EMU_PER_INCH, ANGLE_PER_DEGREE, normalizedRotation, normalizeCrop, CROP_SIDES } from '../engine/images.js';

const CROP_SIDE_NAMES = { top: '上', bottom: '下', left: '左', right: '右' };

export function openImageProperties(image, apply, { canResize = false } = {}) {
  const resizeOnly = image.retainedDrawing && canResize;
  if (image.retainedDrawing && !resizeOnly) {
    const modal = openModal({ title: '图形属性', content: el('div', {},
      el('p', {}, '此图形保留为完整对象。您可以对其进行选择、删除和撤消操作。暂不支持编辑其内容或外观。'),
      el('div.row.row-end', {}, el('button.btn.btn-primary', { type: 'button', onclick: () => modal.close() }, '完成'))) });
    return modal;
  }
  image = { ...image };
  const pending = new AbortController();
  const decimal = value => String(Number((value / EMU_PER_INCH).toFixed(6)));
  const field = (label, control) => el('label.field', {}, el('span.field-label', {}, label), control);
  // Sizes show two decimals; the exact values behind them are what is applied unless retyped.
  const shown = inches => String(Number(Number(inches).toFixed(2)));
  const exact = { width: decimal(image.width), height: decimal(image.height) };
  const width = el('input.input', { type: 'number', min: .000001, max: 22, step: 'any', required: true, value: shown(exact.width), 'aria-label': '图片宽度 (英寸)' });
  const height = el('input.input', { type: 'number', min: .000001, max: 22, step: 'any', required: true, value: shown(exact.height), 'aria-label': '图片高度 (英寸)' });
  const proportions = el('input', { type: 'checkbox', checked: true, disabled: image.aspectLocked, 'aria-label': '锁定纵横比' });
  width.addEventListener('input', () => { exact.width = width.value; if (proportions.checked) { exact.height = decimal(Number(width.value) * EMU_PER_INCH * image.height / image.width); height.value = shown(exact.height); } });
  height.addEventListener('input', () => { exact.height = height.value; if (proportions.checked) { exact.width = decimal(Number(height.value) * EMU_PER_INCH * image.width / image.height); width.value = shown(exact.width); } });
  const size = (input, key) => input.value === shown(exact[key]) ? exact[key] : input.value;
  const alt = el('textarea.input', { maxLength: 2000, rows: 3, value: image.alt, 'aria-label': '图片替代文本' });
  const originalCrop = normalizeCrop(image.crop);
  const crop = Object.fromEntries(CROP_SIDES.map(side => [side, el('input.input', { type: 'number', min: -2147483.648, max: 2147483.647, step: .001, required: true, value: originalCrop[side] / 1000, 'aria-label': `${CROP_SIDE_NAMES[side] || side}侧裁剪 (%)` })]));
  const cropFields = CROP_SIDES.map(side => field(`${CROP_SIDE_NAMES[side] || side} (%)`, crop[side]));
  const flipH = el('input', { type: 'checkbox', checked: !!image.flipH, 'aria-label': '水平翻转图片' });
  const flipV = el('input', { type: 'checkbox', checked: !!image.flipV, 'aria-label': '垂直翻转图片' });
  const degrees = String(Number((normalizedRotation(image.rotation) / ANGLE_PER_DEGREE).toFixed(6)));
  const rotation = el('input.input', { type: 'number', min: -360, max: 360, step: 'any', required: true, value: degrees, disabled: image.rotateWithShape === false, 'aria-label': '图片旋转 (度)' });
  const error = el('p.field-error', { role: 'alert', hidden: true });
  for (const control of [width, height, alt, flipH, flipV, rotation, ...Object.values(crop)]) control.addEventListener('input', () => { error.hidden = true; });
  const form = el('form.image-form', { onsubmit: e => {
    e.preventDefault();
    const patch = {};
    const w = size(width, 'width'), h = size(height, 'height');
    if (w !== decimal(image.width)) patch.width = Math.round(Number(w) * EMU_PER_INCH);
    if (h !== decimal(image.height)) patch.height = Math.round(Number(h) * EMU_PER_INCH);
    if (alt.value !== image.alt) patch.alt = alt.value;
    if (flipH.checked !== !!image.flipH) patch.flipH = flipH.checked;
    if (flipV.checked !== !!image.flipV) patch.flipV = flipV.checked;
    if (rotation.value !== degrees) patch.rotation = Math.round(Number(rotation.value) * ANGLE_PER_DEGREE);
    const offsets = Object.fromEntries(CROP_SIDES.map(side => [side, Math.round(Number(crop[side].value) * 1000)]));
    try { normalizeCrop(offsets); } catch (e) { error.textContent = e.message; error.hidden = false; return; }
    if (CROP_SIDES.some(side => offsets[side] !== originalCrop[side])) patch.crop = offsets;
    const finish = ok => {
      if (ok !== false) modal.close();
      else { error.textContent = '无法应用这些图片设置。请检查其旋转角度、尺寸和可用页面空间。'; error.hidden = false; }
    };
    const result = apply(patch, pending.signal);
    if (result?.then) {
      const submit=form.querySelector('[type=submit]');submit.disabled=true;
      result.then(finish).finally(()=>{submit.disabled=false;});
    } else finish(result);
  } }, el('div.canvas-page-fields', {}, field('宽度 (英寸)', width), field('高度 (英寸)', height)),
  el('p.field-hint', {}, '选择图片以使用其移动控件或角部调整手柄。使用 Alt+单击或右键菜单可选择位于文字下方的图片。'),
  el('label.row', {}, proportions, '锁定纵横比'),
  ...(resizeOnly ? [el('p.field-hint', {}, '调整大小会保留此图片的裁剪和视觉效果。')] : [
  el('div.row', {}, el('label.row', {}, flipH, '水平翻转'), el('label.row', {}, flipV, '垂直翻转')),
  field('旋转 (度)', rotation), el('p.field-hint', {}, image.rotateWithShape === false ? '此图片的填充无法在此处旋转。' : '正角度按顺时针方向旋转。宽度和高度描述未旋转时的图片；空间会自动扩展以保持每个角可见。'), field('替代文本', alt),
  el('p.field-hint', {}, '描述图片传达的信息。如果是装饰性图片，请留空。'),
  el('fieldset.image-crop', {}, el('legend', {}, '裁剪原始图片'), el('div.canvas-page-fields', {}, ...cropFields),
    el('p.field-hint', {}, '正百分比会修剪边缘。负百分比会添加透明空间。裁剪边缘针对原始图片（翻转和旋转之前）。框架保持其尺寸。'),
    el('button.btn.btn-ghost', { type: 'button', onclick: () => { for (const control of Object.values(crop)) control.value = '0'; error.hidden = true; } }, '重置裁剪'))]), error,
  el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '应用')));
  const modal = openModal({ title: '图片属性', content: form, onClose:()=>pending.abort() }); return modal;
}
