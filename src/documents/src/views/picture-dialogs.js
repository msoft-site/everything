import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { RESOLUTIONS } from './picture-presets.js';

/** Compress Pictures: resolution for the pictures' printed size, delete cropped areas, this picture or all. */
export function openCompressDialog({ selectedOnly = true, onApply }) {
  const only = el('input', { type: 'checkbox', checked: selectedOnly, disabled: !selectedOnly, id: 'pic-compress-only' });
  const crop = el('input', { type: 'checkbox', checked: true, id: 'pic-compress-crop' });
  const name = 'pic-compress-ppi';
  const choices = RESOLUTIONS.map(([label, ppi], i) => {
    const input = el('input', { type: 'radio', name, value: String(ppi), checked: ppi === 150, id: `pic-compress-${i}` });
    return el('label.pic-radio', { htmlFor: input.id }, input, label);
  });
  const working = el('p.pic-hint', { 'aria-live': 'polite' });
  let modal;
  const submit = async e => {
    e.preventDefault();
    const ppi = Number(e.target.querySelector(`input[name="${name}"]:checked`)?.value || 150);
    working.textContent = '正在压缩…';
    for (const button of e.target.querySelectorAll('button')) button.disabled = true;
    try { await onApply({ ppi, deleteCropped: crop.checked, selectedOnly: only.checked }); } finally { modal.close(); }
  };
  modal = openModal({ title: '压缩图片', content: el('form.pic-dialog', { onsubmit: submit },
    el('fieldset.pic-fieldset', {}, el('legend', {}, '压缩选项'),
      el('label.pic-check', { htmlFor: only.id }, only, '仅应用于此图片'),
      el('label.pic-check', { htmlFor: crop.id }, crop, '删除图片的剪裁区域')),
    el('fieldset.pic-fieldset', {}, el('legend', {}, '分辨率'), el('div.pic-radios', { role: 'radiogroup', 'aria-label': '分辨率' }, ...choices)),
    el('p.pic-hint', {}, '图片将按显示的尺寸重新采样。压缩会删除为“重置图片”保留的原始图片。'),
    working,
    el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '确定'))) });
  queueMicrotask(() => modal.panel?.querySelector('input:checked')?.focus());
  return modal;
}

/** Grid settings for aligning objects: spacing of the gridlines and whether objects snap to them. */
export function openGridDialog({ value = 0.125, snap = false, onApply }) {
  const size = el('input.input.pic-number', { type: 'number', min: 0.01, max: 2, step: 0.01, value, id: 'pic-grid-size', required: true });
  const snapBox = el('input', { type: 'checkbox', checked: snap, id: 'pic-grid-snap' });
  let modal;
  // The arrows step by hundredths, but any spacing in range is taken: the default is an eighth of an inch.
  const inRange = () => size.value !== '' && !size.validity.badInput && !size.validity.rangeUnderflow && !size.validity.rangeOverflow;
  modal = openModal({ title: '网格设置', content: el('form.pic-dialog', { noValidate: true, onsubmit: e => { e.preventDefault(); if (!inRange()) { size.reportValidity(); return; } onApply({ size: Number(size.value), snap: snapBox.checked }); modal.close(); } },
    el('label.pic-field', { htmlFor: size.id }, el('span', {}, '网格间距 (英寸)'), size),
    el('label.pic-check', { htmlFor: snapBox.id }, snapBox, '移动对象时对齐到网格'),
    el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '确定'))) });
  queueMicrotask(() => size.focus());
  return modal;
}
