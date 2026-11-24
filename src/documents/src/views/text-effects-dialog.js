import { el } from '../ui/dom.js';
import { tabStrip, field, group, select, openFormatDialog, colorField } from './format-dialog-kit.js';

const EMU_PER_PT = 12700;
const OUTLINE_WIDTHS = [[3175, '¼ pt'], [6350, '½ pt'], [9525, '¾ pt'], [12700, '1 pt'], [19050, '1½ pt'], [28575, '2¼ pt'], [38100, '3 pt']];
/** Shadow presets: [label, distance pt, angle °, blur pt]. */
export const SHADOW_PRESETS = [['右下偏移', 3, 45, 3], ['向下偏移', 3, 90, 3], ['向右偏移', 3, 0, 3], ['左上偏移', 3, 225, 3], ['发光光晕', 0, 0, 8]];

/**
 * Text Effects: text fill (solid or none), outline and shadow, written as w14 text effects (§17.3.2 run
 * properties extended by the 2010 wordprocessingml namespace) and painted by the canvas. Reflection, glow
 * and 3-D presets are not offered: the canvas does not render them.
 *
 * format: the selection's run formatting. apply(patch) returns false on failure.
 */
export function openTextEffects({ format: f, apply, onClose }) {
  const ink = f.color && f.color !== 'auto' ? f.color : '000000';
  /* ---- Fill and outline ---- */
  const fill = select('文本填充', [['solid', '纯色填充 (文字颜色)'], ['none', '无填充 (仅轮廓)']], f.textFill === 'none' ? 'none' : 'solid', { onchange: () => paint() });
  const outline = select('文本轮廓', [['none', '无线条'], ['solid', '实线']], f.textOutline ? 'solid' : 'none', { onchange: () => { sync(); paint(); } });
  const outlineColor = colorField('轮廓颜色', f.textOutline?.color || ink, { reset: { value: ink, label: '文字颜色' }, onchange: () => paint() });
  const outlineWidth = select('轮廓宽度', OUTLINE_WIDTHS.map(([v, t]) => [String(v), t]), String(OUTLINE_WIDTHS.find(([v]) => v === f.textOutline?.width)?.[0] ?? 9525), { onchange: () => paint() });
  /* ---- Shadow ---- */
  const s = f.textShadow;
  const shadow = select('阴影类型', [['none', '无阴影'], ['outer', '外阴影']], s ? 'outer' : 'none', { onchange: () => { sync(); paint(); } });
  const preset = select('阴影预设', [['', '自定义'], ...SHADOW_PRESETS.map(([label], i) => [String(i), label])], '', { onchange: () => {
    const chosen = SHADOW_PRESETS[Number(preset.value)]; if (!chosen) return;
    [distance.value, angle.value, blur.value] = [chosen[1], chosen[2], chosen[3]].map(String); paint();
  } });
  const shadowColor = colorField('阴影颜色', s?.color || '000000', { reset: { value: '000000', label: '黑色' }, onchange: () => paint() });
  const number = (label, value, min, max, step) => el('input.input', { type: 'number', min, max, step, value, 'aria-label': label, oninput: () => { preset.value = ''; paint(); } });
  const transparency = number('阴影透明度 (%)', Math.round((1 - (s?.alpha ?? 0.6)) * 100), 0, 100, 1);
  const blur = number('阴影模糊 (磅)', s ? Math.round(s.blurRadius / EMU_PER_PT * 10) / 10 : 3, 0, 100, 0.5);
  const distance = number('阴影距离 (磅)', s ? Math.round(s.distance / EMU_PER_PT * 10) / 10 : 3, 0, 200, 0.5);
  const angle = number('阴影角度 (°)', s ? Math.round(s.direction / 60000) : 45, 0, 359, 1);
  const shadowFields = [preset, shadowColor, transparency, blur, distance, angle];
  function sync() {
    outlineColor.disabled = outlineWidth.disabled = outline.value === 'none';
    for (const control of shadowFields) control.disabled = shadow.value === 'none';
  }
  /* ---- Preview ---- */
  const sample = el('span', {}, 'AaBbCcYyZz');
  const previewBox = el('div.ed-font-preview.fmt-effects-preview', { 'aria-hidden': 'true' }, sample);
  function paint() {
    const st = sample.style;
    const width = outline.value === 'solid' ? Number(outlineWidth.value) / EMU_PER_PT * 4 / 3 : 0;
    st.webkitTextStroke = width ? `${Math.max(0.5, width)}px #${outlineColor.value}` : '';
    st.color = fill.value === 'none' ? 'transparent' : `#${ink}`;
    if (fill.value === 'none' && !width) st.webkitTextStroke = `0.5px #${ink}`;
    if (shadow.value === 'outer') {
      const rad = Number(angle.value || 0) * Math.PI / 180, d = Number(distance.value || 0) * 4 / 3;
      const alpha = 1 - Number(transparency.value || 0) / 100;
      const hex = shadowColor.value, rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');
      st.textShadow = `${(Math.cos(rad) * d).toFixed(1)}px ${(Math.sin(rad) * d).toFixed(1)}px ${Number(blur.value || 0) * 4 / 3}px rgba(${rgb},${alpha})`;
    } else st.textShadow = '';
  }
  sync(); paint();
  const fillPanel = el('div', {}, group('文本填充', field('填充', fill)), group('文本轮廓', el('div.fmt-grid', {}, field('线条', outline), field('颜色', outlineColor), field('宽度', outlineWidth))));
  const shadowPanel = el('div', {}, group('阴影', el('div.fmt-grid', {}, field('阴影', shadow), field('预设', preset), field('颜色', shadowColor), field('透明度 (%)', transparency)),
    el('div.fmt-grid', {}, field('模糊 (磅)', blur), field('距离 (磅)', distance), field('角度 (°)', angle))),
    el('p.field-hint', {}, '其他文件中的倒影、发光和三维格式会保留，但无法在此编辑。'));
  const tabs = tabStrip('文本效果', [['fill', '文本填充与轮廓', fillPanel], ['shadow', '阴影', shadowPanel]]);
  const modal = openFormatDialog({ title: '设置文本效果格式', className: 'fmt-effects-dialog', onClose,
    body: [tabs.node, fillPanel, shadowPanel, el('div.ed-font-preview-frame', {}, el('span.field-label', {}, '预览'), previewBox)],
    submit: () => {
      const patch = {};
      if (fill.value === 'none' && f.textFill !== 'none') patch.textFill = 'none';
      if (fill.value === 'solid' && f.textFill === 'none') patch.textFill = ink;
      const nextOutline = outline.value === 'solid' ? { width: Number(outlineWidth.value), color: outlineColor.value, join: 'round', cap: 'flat', miter: 8 } : null;
      if (JSON.stringify(nextOutline) !== JSON.stringify(f.textOutline ?? null)) patch.textOutline = nextOutline;
      for (const [input, label, max] of [[transparency, '透明度', 100], [blur, '模糊', 100], [distance, '距离', 200], [angle, '角度', 359]]) {
        if (shadow.value === 'outer' && (input.value === '' || !input.checkValidity())) throw new Error(`${label} 必须是 0 到 ${max} 之间的数字。`);
      }
      const nextShadow = shadow.value === 'outer' ? { blurRadius: Math.round(Number(blur.value) * EMU_PER_PT), distance: Math.round(Number(distance.value) * EMU_PER_PT), direction: Math.round(Number(angle.value) % 360) * 60000,
        scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, alignment: 'tl', color: shadowColor.value, alpha: Math.round((1 - Number(transparency.value) / 100) * 1000) / 1000 } : null;
      if (JSON.stringify(nextShadow) !== JSON.stringify(f.textShadow ?? null)) patch.textShadow = nextShadow;
      return Object.keys(patch).length ? apply(patch) : true;
    } });
  fill.focus();
  return modal;
}
