// Character and Paragraph panels. They act on the selected range while
// editing, on the selected text layers otherwise, or set the defaults for
// new text. Mixed values show blank.

import type { Editor } from '../../editor';
import { registerPanel, type Panel } from '../../app/registry';
import { svg } from '../../app/icons';
import { escapeXML } from '../../model/assets';
import { hexRgb, rgbHexString } from '../../model/text-layer';
import type { CharStyle, Kerning, ParagraphStyle } from '../../imaging/text/model';
import { applyChar, applyParagraph, onSessionChange, restoreInputFocus, styleContext } from './session';
import { familyPatch, familyStyles, openFontPicker, styleName } from './options';
import { typeUnit } from './units';
import { typeFeatures } from './paragraph-options';

const LANGUAGES: [string, string][] = [
  ['en-US', '英语 (美国)'], ['en-GB', '英语 (英国)'], ['de-DE', '德语'], ['fr-FR', '法语'], ['es-ES', '西班牙语'], ['it-IT', '意大利语'],
  ['pt-BR', '葡萄牙语 (巴西)'], ['pt-PT', '葡萄牙语'], ['nl-NL', '荷兰语'], ['sv-SE', '瑞典语'], ['da-DK', '丹麦语'], ['nb-NO', '挪威语'],
  ['fi-FI', '芬兰语'], ['pl-PL', '波兰语'], ['cs-CZ', '捷克语'], ['tr-TR', '土耳其语'], ['el-GR', '希腊语'], ['ru-RU', '俄语'], ['uk-UA', '乌克兰语'],
  ['ja-JP', '日语'], ['zh-CN', '简体中文'], ['zh-TW', '繁体中文'], ['ko-KR', '韩语'],
];
const TOGGLES: [keyof CharStyle, string, string][] = [
  ['fauxBold', 'bold', '仿粗体'], ['fauxItalic', 'italic', '仿斜体'], ['allCaps', 'all-caps', '全部大写'], ['smallCaps', 'small-caps', '小型大写字母'],
  ['superscript', 'superscript', '上标'], ['subscript', 'subscript', '下标'], ['underline', 'underline', '下划线'], ['strikethrough', 'strikethrough', '删除线'],
];
const fmt = (v: unknown) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : '');
const field = (key: string, icon: string, title: string, unit: string, attrs = '') =>
  `<label class="type-field" title="${title}">${svg(icon, 15)}<input data-char="${key}" aria-label="${title}" ${attrs}><span class="type-unit">${unit}</span></label>`;

const characterPanel: Panel = {
  id: 'character',
  title: '字符',
  icon: 'case-upper',
  location: 'strip',
  mount: (e, el) => {
    el.classList.add('type-panel');
    el.innerHTML = `<div class="type-row"><button type="button" class="type-font-button wide" data-family aria-label="字体系列" aria-haspopup="dialog"><span></span>${svg('chevron-down', 12)}</button></div>
<div class="type-row"><select data-style aria-label="字体样式"></select></div>
<div class="type-grid">
${field('size', 'baseline', '字号', 'pt', 'type="number" min="0.5" max="1296" step="0.5"')}
${field('leading', 'leading', '行距 (自动或磅值)', 'pt', 'type="text" list="type-leading-list" inputmode="decimal"')}
<label class="type-field" title="字距微调">${svg('kerning', 15)}<select data-char="kerning" aria-label="字距微调"><option value="metrics">度量标准</option><option value="optical">视觉</option><option value="none">无</option></select></label>
${field('tracking', 'tracking', '字距调整 (1/1000 em)', '', 'type="number" step="10" min="-1000" max="10000"')}
${field('scaleY', 'scale-vertical', '垂直缩放', '%', 'type="number" min="1" max="1000" step="1"')}
${field('scaleX', 'scale-horizontal', '水平缩放', '%', 'type="number" min="1" max="1000" step="1"')}
${field('baselineShift', 'baseline-shift', '基线偏移', 'pt', 'type="number" step="0.5"')}
<label class="type-field" title="文本颜色">颜色 <input type="color" data-color aria-label="文本颜色"></label>
</div>
<datalist id="type-leading-list"><option value="自动"></option><option value="Auto"></option>${[6, 8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72].map((v) => `<option value="${v}"></option>`).join('')}</datalist>
<div class="type-toggles" role="group" aria-label="字符样式">${TOGGLES.map(([k, icon, label]) => `<button type="button" class="icon-button toggle" data-toggle="${k}" aria-pressed="false" title="${label}" aria-label="${label}">${svg(icon, 15)}</button>`).join('')}</div>
<div class="type-row"><label class="type-check"><input type="checkbox" data-check="ligatures"> 连字</label></div>
<div class="type-row"><label class="type-field wide" title="语言">语言 <select data-char="language" aria-label="语言">${LANGUAGES.map(([v, l]) => `<option value="${v}">${escapeXML(l)}</option>`).join('')}</select></label></div>
<div class="type-row" data-features="middle-eastern"><label class="type-field wide" title="数字字形">数字 <select data-char="digits" aria-label="数字字形"><option value="">西文 (123)</option><option value="arabic">阿拉伯-印度数字 (١٢٣)</option><option value="persian">波斯数字 (۱۲۳)</option></select></label></div>
<div class="type-row" data-features="east-asian"><label class="type-field wide" title="直排文本中的拉丁字母和数字">直排拉丁字母 <select data-char="vertical" aria-label="直排文本中的拉丁字母和数字"><option value="">保持竖直</option><option value="rotate">顺时针旋转</option><option value="combine">横向组合</option></select></label></div>`;
    const familyButton = el.querySelector<HTMLButtonElement>('[data-family]')!;
    familyButton.addEventListener('click', () => {
      const cur = styleContext(e).char;
      openFontPicker(e, familyButton, (f) => void applyChar(e, familyPatch(f, cur)).then(restoreInputFocus(e)), cur.family);
    });
    el.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement | HTMLSelectElement;
      let p: Promise<void> | undefined;
      if (t.matches('[data-style]')) {
        const [w, i] = t.value.split('|');
        if (w) p = applyChar(e, { weight: Number(w), italic: i === '1' });
      } else if (t.matches('[data-color]')) p = applyChar(e, { color: hexRgb(t.value) });
      else if (t.matches('[data-check]')) p = applyChar(e, { [(t as HTMLInputElement).dataset.check!]: (t as HTMLInputElement).checked });
      else if (t.dataset.char) {
        const key = t.dataset.char as keyof CharStyle;
        const raw = t.value.trim();
        if (key === 'kerning') p = applyChar(e, { kerning: raw as Kerning });
        else if (key === 'digits') p = applyChar(e, { digits: raw as CharStyle['digits'] });
        else if (key === 'vertical') p = applyChar(e, { vertical: raw as CharStyle['vertical'] });
        else if (key === 'language') p = applyChar(e, { language: raw });
        else if (key === 'leading') {
          if (/^auto$|^自动$/i.test(raw)) p = applyChar(e, { leading: 'auto' });
          else if (Number(raw) > 0) p = applyChar(e, { leading: Math.min(5000, Number(raw) / typeUnit(e).k) });
        } else if (raw !== '' && Number.isFinite(Number(raw))) {
          // Sizes are entered in the type unit and stored in points.
          const v = Number(raw) / (key === 'size' || key === 'baselineShift' ? typeUnit(e).k : 1);
          const clamp: Partial<Record<keyof CharStyle, [number, number]>> = { size: [0.5, 1296], tracking: [-1000, 10000], scaleX: [1, 1000], scaleY: [1, 1000], baselineShift: [-5000, 5000] };
          const [lo, hi] = clamp[key] ?? [-1e5, 1e5];
          p = applyChar(e, { [key]: Math.max(lo, Math.min(hi, v)) });
        }
      }
      void p?.then(restoreInputFocus(e));
    });
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.target as HTMLElement).matches('input')) (ev.target as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
    });
    el.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-toggle]');
      if (!b) return;
      const key = b.dataset.toggle as keyof CharStyle;
      void applyChar(e, { [key]: b.getAttribute('aria-pressed') !== 'true' }).then(restoreInputFocus(e));
    });
  },
  update: (e, el) => syncCharacter(e, el),
  menu: () => [
    'type.no-break', 'type.fractional-widths', '-',
    { label: 'OpenType', items: ['type.ot-liga', 'type.ot-calt', 'type.ot-dlig', 'type.ot-swsh', 'type.ot-salt', 'type.ot-titl', 'type.ot-ordn', 'type.ot-frac', 'type.ot-onum', 'type.ot-smcp'] },
    { label: '语言选项', items: ['type.features-default', 'type.features-east-asian', 'type.features-middle-eastern'] },
    '-', 'type.reset-character',
  ],
};
// Rows for a language feature set show only while that set is chosen.
function syncFeatureRows(e: Editor, el: HTMLElement) {
  const set = typeFeatures(e);
  for (const row of el.querySelectorAll<HTMLElement>('[data-features]')) row.hidden = row.dataset.features !== set;
}

// Field limits given in points, shown in the type unit (factor k), on the
// fields' 0.5 step grid (the minimum is where the stepper counts from).
function limits(input: HTMLInputElement, lo: number, hi: number, k: number) {
  input.min = String(Math.ceil(lo * k * 2) / 2);
  input.max = String(Math.floor(hi * k * 2) / 2);
}
function setValue(el: HTMLInputElement | HTMLSelectElement | null, v: string) {
  if (el && document.activeElement !== el) el.value = v;
}
function syncCharacter(e: Editor, el: HTMLElement) {
  const c = styleContext(e).char;
  const fam = el.querySelector<HTMLElement>('[data-family]')!;
  fam.querySelector('span')!.textContent = c.family ?? '';
  fam.style.fontFamily = c.family ? `"${c.family}", sans-serif` : '';
  const st = el.querySelector<HTMLSelectElement>('[data-style]')!;
  if (document.activeElement !== st) {
    const v = c.weight !== undefined && c.italic !== undefined ? `${c.weight}|${c.italic ? 1 : 0}` : '';
    const styles = familyStyles(c.family);
    const opts = styles.map((s) => [`${s.weight}|${s.italic ? 1 : 0}`, styleName(s.weight, s.italic)]);
    if (v && !opts.some(([k]) => k === v)) opts.unshift([v, styleName(c.weight!, !!c.italic)]);
    st.innerHTML = (v ? '' : '<option value="" selected></option>') + opts.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
  }
  const unit = typeUnit(e);
  for (const k of ['tracking', 'scaleX', 'scaleY'] as const) setValue(el.querySelector(`[data-char="${k}"]`), fmt(c[k]));
  for (const k of ['size', 'baselineShift'] as const) setValue(el.querySelector(`[data-char="${k}"]`), fmt(typeof c[k] === 'number' ? c[k] * unit.k : undefined));
  setValue(el.querySelector('[data-char="leading"]'), c.leading === 'auto' ? '自动' : fmt(typeof c.leading === 'number' ? c.leading * unit.k : undefined));
  for (const k of ['size', 'leading', 'baselineShift']) {
    const span = el.querySelector(`[data-char="${k}"] + .type-unit`);
    if (span) span.textContent = unit.suffix;
  }
  // The limits are in points; the field shows the type unit.
  limits(el.querySelector<HTMLInputElement>('[data-char="size"]')!, 0.5, 1296, unit.k);
  setValue(el.querySelector('[data-char="kerning"]'), c.kerning ?? '');
  setValue(el.querySelector('[data-char="language"]'), c.language ?? '');
  setValue(el.querySelector('[data-char="digits"]'), c.digits ?? '');
  setValue(el.querySelector('[data-char="vertical"]'), c.vertical ?? '');
  syncFeatureRows(e, el);
  const color = el.querySelector<HTMLInputElement>('[data-color]')!;
  setValue(color, c.color ? rgbHexString(c.color) : '#000000');
  color.classList.toggle('mixed', !c.color);
  for (const b of el.querySelectorAll<HTMLElement>('[data-toggle]')) {
    const v = c[b.dataset.toggle as keyof CharStyle];
    b.setAttribute('aria-pressed', String(v === true));
    b.classList.toggle('mixed', v === undefined);
  }
  const lig = el.querySelector<HTMLInputElement>('[data-check="ligatures"]')!;
  lig.checked = c.ligatures === true;
  lig.indeterminate = c.ligatures === undefined;
}

const ALIGNS: [ParagraphStyle['align'], string, string][] = [
  ['left', 'align-left', '左对齐文本'], ['center', 'align-center', '居中对齐文本'], ['right', 'align-right', '右对齐文本'],
  ['justify-left', 'justify-left', '两端对齐，末行靠左'], ['justify-center', 'justify-center', '两端对齐，末行居中'], ['justify-right', 'justify-right', '两端对齐，末行靠右'], ['justify-all', 'justify-all', '两端全部对齐'],
];
const paragraphPanel: Panel = {
  id: 'paragraph',
  title: '段落',
  icon: 'align-justify',
  location: 'strip',
  mount: (e, el) => {
    el.classList.add('type-panel');
    const pfield = (key: keyof ParagraphStyle, icon: string, title: string) =>
      `<label class="type-field" title="${title}">${svg(icon, 15)}<input type="number" step="0.5" min="-5000" max="5000" data-para="${key}" aria-label="${title}"><span class="type-unit">pt</span></label>`;
    el.innerHTML = `<div class="type-toggles" role="group" aria-label="对齐方式">${ALIGNS.map(([a, icon, label]) => `<button type="button" class="icon-button toggle" data-align="${a}" aria-pressed="false" title="${label}" aria-label="${label}">${svg(icon, 15)}</button>`).join('')}</div>
<div class="type-grid">
${pfield('indentLeft', 'indent-left', '左边距缩进')}
${pfield('indentRight', 'indent-right', '右边距缩进')}
${pfield('indentFirst', 'indent-first', '首行缩进')}
<span></span>
${pfield('spaceBefore', 'space-before', '段前添加空格')}
${pfield('spaceAfter', 'space-after', '段后添加空格')}
</div>
<div class="type-row"><label class="type-check"><input type="checkbox" data-hyphenate> 连字符</label></div>
<div class="type-row" data-features="middle-eastern"><div class="type-toggles" role="group" aria-label="段落方向"><button type="button" class="icon-button toggle" data-dir="ltr" aria-pressed="false" title="从左到右段落" aria-label="从左到右段落">${svg('text-ltr', 15)}</button><button type="button" class="icon-button toggle" data-dir="rtl" aria-pressed="false" title="从右到左段落" aria-label="从右到左段落">${svg('text-rtl', 15)}</button></div><label class="type-check"><input type="checkbox" data-kashida> 伸展字符</label></div>
<div class="type-row" data-features="east-asian"><label class="type-field wide" title="行距度量方式">行距 <select data-leading-model aria-label="行距度量方式"><option value="">基线到基线</option><option value="top">顶到顶</option><option value="bottom">底到底</option></select></label></div>
<p class="hint">两端对齐和连字符适用于段落文本（使用文字工具拖拽创建文本框即可生效）。</p>`;
    el.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-align]');
      if (b) void applyParagraph(e, { align: b.dataset.align as ParagraphStyle['align'] }).then(restoreInputFocus(e));
      const d = (ev.target as HTMLElement).closest<HTMLElement>('[data-dir]');
      if (d) void e.runCommand(`type.dir-${d.dataset.dir}`);
    });
    el.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement;
      let p: Promise<void> | undefined;
      if (t.matches('[data-hyphenate]')) p = applyParagraph(e, { hyphenate: t.checked });
      else if (t.matches('[data-kashida]')) p = applyParagraph(e, { kashida: t.checked });
      else if (t.matches('[data-leading-model]')) p = applyParagraph(e, { leadingModel: t.value as ParagraphStyle['leadingModel'] });
      else if (t.dataset.para && t.value.trim() !== '' && Number.isFinite(Number(t.value)))
        // Entered in the type unit, stored in points.
        p = applyParagraph(e, { [t.dataset.para]: Math.max(-5000, Math.min(5000, Number(t.value) / typeUnit(e).k)) });
      void p?.then(restoreInputFocus(e));
    });
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.target as HTMLElement).matches('input')) (ev.target as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
    });
  },
  update: (e, el) => {
    const p = styleContext(e).paragraph;
    for (const b of el.querySelectorAll<HTMLElement>('[data-align]')) b.setAttribute('aria-pressed', String(p.align === b.dataset.align));
    const unit = typeUnit(e);
    for (const k of ['indentLeft', 'indentRight', 'indentFirst', 'spaceBefore', 'spaceAfter'] as const) {
      const input = el.querySelector<HTMLInputElement>(`[data-para="${k}"]`)!;
      setValue(input, fmt(typeof p[k] === 'number' ? p[k] * unit.k : undefined));
      limits(input, -5000, 5000, unit.k);
      input.nextElementSibling!.textContent = unit.suffix;
    }
    const h = el.querySelector<HTMLInputElement>('[data-hyphenate]')!;
    h.checked = p.hyphenate === true;
    h.indeterminate = p.hyphenate === undefined;
    const k = el.querySelector<HTMLInputElement>('[data-kashida]')!;
    k.checked = p.kashida === true;
    for (const b of el.querySelectorAll<HTMLElement>('[data-dir]')) b.setAttribute('aria-pressed', String((p.direction ?? 'ltr') === b.dataset.dir && p.align !== undefined));
    setValue(el.querySelector('[data-leading-model]'), p.leadingModel ?? '');
    syncFeatureRows(e, el);
  },
  menu: () => [
    'type.hanging', '-', 'type.justification', 'type.hyphenation', '-', 'type.composer-single', 'type.composer-every', '-',
    { label: '语言选项', items: ['type.features-default', 'type.features-east-asian', 'type.features-middle-eastern', '-', 'type.leading-top', 'type.leading-bottom', 'type.kashida'] },
    '-', 'type.reset-paragraph',
  ],
};

export function installTypePanels(e: Editor) {
  registerPanel(characterPanel, paragraphPanel);
  onSessionChange(() => {
    for (const p of [characterPanel, paragraphPanel]) {
      const el = document.getElementById(`panel-${p.id}`);
      if (el?.isConnected) p.update!(e, el);
    }
  });
}
