import { el, isComposing } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { PAPER_SIZES, validatePageSettings, readingPageSize } from '../engine/page-settings.js';
import { recallUnit } from '../lib/units.js';
import { revealControl } from './format-dialog-kit.js';

/** Twips per display unit. */
const PER_UNIT = { in: 1440, cm: 1440 / 2.54 };
export const MULTIPLE_PAGES = [['normal', '普通'], ['mirror', '对称页边距'], ['twoOnOne', '每张纸打印 2 页'], ['bookFold', '书籍折页'], ['reverseBookFold', '反向书籍折页']];
export const SECTION_STARTS = [['continuous', '接续本页'], ['nextPage', '新页'], ['evenPage', '偶数页'], ['oddPage', '奇数页']];
export const VERTICAL_ALIGNMENTS = [['top', '顶端对齐'], ['center', '居中'], ['both', '两端对齐'], ['bottom', '底端对齐']];

/** How a document's pages are arranged on paper, as one choice. */
export function multiplePagesOf(s) {
  return s.bookFoldRevPrinting ? 'reverseBookFold' : s.bookFoldPrinting ? 'bookFold' : s.printTwoOnOne ? 'twoOnOne' : s.mirrorMargins ? 'mirror' : 'normal';
}
export function multiplePagesSettings(mode) {
  return { mirrorMargins: mode === 'mirror', printTwoOnOne: mode === 'twoOnOne', bookFoldPrinting: mode === 'bookFold', bookFoldRevPrinting: mode === 'reverseBookFold' };
}

/**
 * The Page Setup dialog: paper, margins and page arrangement on one tab, section layout on another,
 * with a live preview.
 * settings: the page settings of the section holding the caret.
 * apply(patch, { scope, stories }) changes only the settings the dialog changed, in the chosen scope,
 * and returns false when they cannot be applied.
 * options: { unit, tab ('page' | 'layout'), scopes: [[id, label]], scope, firstSection, stories: { firstPageDifferent, evenAndOdd } | null,
 *   lineNumbers(), borders(), setDefault(settings) }
 * Untouched measurements keep their exact stored values, including imported sizes other producers rounded.
 */
export function openPageSetup(settings, apply, options = {}) {
  const unit = options.unit || recallUnit(), per = PER_UNIT[unit] || 1440;
  const inputs = {}, originals = {};
  const error = el('p.field-error', { role: 'alert', hidden: true });
  const write = (key, twips) => {
    // An untouched field keeps its exact stored value, however it displays.
    const text = String(Number((twips / per).toFixed(unit === 'cm' ? 3 : 5)));
    inputs[key].value = text;
    originals[key] = { text, twips };
  };
  const read = key => inputs[key].value === originals[key].text ? originals[key].twips : Math.round(Number(inputs[key].value) * per);
  const measure = (key, label, { min = 0, max = 22 } = {}) => {
    inputs[key] = el('input.input', { type: 'number', required: true, step: 0.01, min: min * (unit === 'cm' ? 2.54 : 1), max: max * (unit === 'cm' ? 2.54 : 1), 'aria-label': `${label} (${unit})`,
      oninput: () => { if (['width', 'height'].includes(key)) paper.value = matchPaper(); preview(); } });
    write(key, settings[key]);
    const caption = el('span.field-label', {}, `${label} (${unit})`);
    const field = el('label.field', {}, caption, inputs[key]);
    field.caption = caption;
    return field;
  };

  /* ---- Margins ---- */
  const top = measure('top', '上', { min: -22 }), bottom = measure('bottom', '下', { min: -22 });
  const left = measure('left', '左'), right = measure('right', '右');
  const gutter = measure('gutter', '装订线');
  const gutterPosition = el('select.input', { 'aria-label': '装订线位置', onchange: preview },
    el('option', { value: 'left' }, '左侧'), el('option', { value: 'top' }, '顶部'));
  gutterPosition.value = settings.gutterAtTop ? 'top' : 'left';
  const orientation = el('select.input', { 'aria-label': '纸张方向', onchange: () => {
    const w = read('width'), h = read('height');
    write('width', h); write('height', w);
    paper.value = matchPaper(); preview();
  } }, ...['portrait', 'landscape'].map(value => el('option', { value, selected: value === settings.orientation }, value === 'portrait' ? '纵向' : '横向')));
  const pages = el('select.input', { 'aria-label': '多页', onchange: () => {
    // A booklet folds a landscape sheet in half.
    if (['bookFold', 'reverseBookFold'].includes(pages.value) && orientation.value === 'portrait') { orientation.value = 'landscape'; orientation.dispatchEvent(new Event('change')); }
    preview();
  } }, ...MULTIPLE_PAGES.map(([value, label]) => el('option', { value }, label)));
  pages.value = multiplePagesOf(settings);
  /* ---- Paper ---- */
  const width = measure('width', '宽度', { min: 1 }), height = measure('height', '高度', { min: 1 });
  const paper = el('select.input', { 'aria-label': '纸张大小', onchange: () => {
    const size = PAPER_SIZES[paper.value];
    if (!size) return;
    const [w, h] = orientation.value === 'landscape' ? [...size].reverse() : size;
    write('width', w); write('height', h); preview();
  } }, ...[...Object.keys(PAPER_SIZES), 'Custom'].map(value => el('option', { value }, value === 'Custom' ? '自定义大小' : value)));
  function matchPaper() {
    const w = read('width'), h = read('height');
    return Object.entries(PAPER_SIZES).find(([, dims]) => {
      const [pw, ph] = orientation.value === 'landscape' ? [...dims].reverse() : dims;
      return Math.abs(pw - w) <= 2 && Math.abs(ph - h) <= 2;
    })?.[0] || 'Custom';
  }
  paper.value = matchPaper();
  // Paper, orientation and margins share one tab: everything that shapes the page is in view together.
  const pagePanel = panel('page', '页面',
    el('fieldset.ps-group', {}, el('legend', {}, '纸张'), el('div.canvas-page-fields', {},
      el('label.field', {}, el('span.field-label', {}, '纸张大小'), paper),
      el('label.field', {}, el('span.field-label', {}, '方向'), orientation), width, height)),
    el('fieldset.ps-group', {}, el('legend', {}, '页边距'), el('div.canvas-page-fields', {}, top, bottom, left, right, gutter,
      el('label.field', {}, el('span.field-label', {}, '装订线位置'), gutterPosition))),
    el('fieldset.ps-group', {}, el('legend', {}, '多页'), el('label.field', {}, el('span.field-label', {}, '多页'), pages)));

  /* ---- Layout ---- */
  const start = el('select.input', { 'aria-label': '节的起始位置', disabled: !!options.firstSection, title: options.firstSection ? '第一节始终从第一页开始。' : '' },
    ...SECTION_STARTS.map(([value, label]) => el('option', { value }, label)));
  start.value = settings.sectionType;
  const stories = options.stories;
  const evenOdd = el('input', { type: 'checkbox', checked: !!stories?.evenAndOdd, disabled: !stories });
  const firstPage = el('input', { type: 'checkbox', checked: !!stories?.firstPageDifferent, disabled: !stories });
  const headerDistance = measure('header', '页眉'), footerDistance = measure('footer', '页脚');
  const vertical = el('select.input', { 'aria-label': '垂直对齐方式', onchange: preview }, ...VERTICAL_ALIGNMENTS.map(([value, label]) => el('option', { value }, label)));
  vertical.value = settings.verticalAlignment;
  const extra = (label, run) => el('button.btn.btn-outline', { type: 'button', disabled: !run, onclick: () => run?.() }, label);
  const layoutPanel = panel('layout', '版式',
    el('fieldset.ps-group', {}, el('legend', {}, '节'), el('label.field', {}, el('span.field-label', {}, '节的起始位置'), start)),
    el('fieldset.ps-group', {}, el('legend', {}, '页眉和页脚'),
      el('label.ed-check', {}, evenOdd, '奇偶页不同'), el('label.ed-check', {}, firstPage, '首页不同'),
      el('div.canvas-page-fields', {}, headerDistance, footerDistance),
      el('p.field-hint', {}, '页眉和页脚距边界的距离。')),
    el('fieldset.ps-group', {}, el('legend', {}, '页面'), el('label.field', {}, el('span.field-label', {}, '垂直对齐方式'), vertical)),
    el('div.ps-buttons', {}, extra('行号…', options.lineNumbers), extra('边框…', options.borders)));

  /* ---- Tabs, preview and scope ---- */
  const tabs = [['page', '页面', pagePanel], ['layout', '版式', layoutPanel]];
  function panel(id, label, ...children) { return el('div.ed-font-panel.ps-panel', { role: 'tabpanel', id: `ps-tab-${id}`, 'aria-labelledby': `ps-tab-${id}-button`, hidden: true }, ...children); }
  const tabButtons = tabs.map(([id, label, node], i) => el('button.ed-font-tab', { type: 'button', role: 'tab', id: `ps-tab-${id}-button`, 'aria-controls': node.id,
    onclick: () => show(id), onkeydown: e => {
      if (isComposing(e) || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      e.preventDefault(); const next = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; show(tabs[next][0]); tabButtons[next].focus();
    } }, label));
  function show(id) {
    tabs.forEach(([tab, , node], i) => { const on = tab === id; node.hidden = !on; tabButtons[i].setAttribute('aria-selected', String(on)); tabButtons[i].tabIndex = on ? 0 : -1; });
  }
  const scopes = options.scopes?.length ? options.scopes : [['document', '整篇文档']];
  const scope = el('select.input', { 'aria-label': '应用于' }, ...scopes.map(([value, label]) => el('option', { value }, label)));
  scope.value = options.scope && scopes.some(([value]) => value === options.scope) ? options.scope : scopes[0][0];
  const sheet = el('div.ps-preview-sheet', { 'aria-hidden': 'true' });
  const previewBox = el('div.ps-preview', { role: 'img', 'aria-label': '页面预览' }, sheet);

  /** The settings as the dialog now describes them; only fields that changed. */
  function changes() {
    const patch = {};
    for (const key of Object.keys(inputs)) if (read(key) !== settings[key]) patch[key] = read(key);
    if (orientation.value !== settings.orientation) patch.orientation = orientation.value;
    const arrangement = multiplePagesSettings(pages.value);
    for (const [key, value] of Object.entries(arrangement)) if (value !== settings[key]) patch[key] = value;
    if ((gutterPosition.value === 'top') !== settings.gutterAtTop) patch.gutterAtTop = gutterPosition.value === 'top';
    if (!start.disabled && start.value !== settings.sectionType) patch.sectionType = start.value;
    if (vertical.value !== settings.verticalAlignment) patch.verticalAlignment = vertical.value;
    return patch;
  }
  function storyChanges() {
    if (!stories) return null;
    const next = {};
    if (evenOdd.checked !== !!stories.evenAndOdd) next.evenAndOdd = evenOdd.checked;
    if (firstPage.checked !== !!stories.firstPageDifferent) next.firstPageDifferent = firstPage.checked;
    return Object.keys(next).length ? next : null;
  }
  function preview() {
    // Mirrored and booklet pages put the gutter inside; their side margins read as inside and outside.
    const mirrored = pages.value === 'mirror', folded = ['bookFold', 'reverseBookFold'].includes(pages.value);
    left.caption.textContent = `${mirrored ? '内侧' : '左'} (${unit})`; inputs.left.setAttribute('aria-label', left.caption.textContent);
    right.caption.textContent = `${mirrored ? '外侧' : '右'} (${unit})`; inputs.right.setAttribute('aria-label', right.caption.textContent);
    gutterPosition.disabled = mirrored || folded;
    let next;
    try { next = validatePageSettings({ ...settings, ...changes() }); } catch { sheet.replaceChildren(); return; }
    const [w, h] = readingPageSize(next), scale = 96 / Math.max(w, h);
    const box = (x, y, bw, bh, cls) => el(`span.${cls}`, { style: { left: `${x * scale}px`, top: `${y * scale}px`, width: `${Math.max(0, bw) * scale}px`, height: `${Math.max(0, bh) * scale}px` } });
    const g = next.gutter, atTop = next.gutterAtTop && !mirrored && !folded;
    const l = next.left + (atTop ? 0 : g), t = Math.abs(next.top) + (atTop ? g : 0);
    const spread = mirrored || folded || pages.value === 'twoOnOne';
    // A short passage of text, placed as the vertical alignment puts it.
    const textHeight = h - t - Math.abs(next.bottom), passage = vertical.value === 'both' ? textHeight : textHeight * 0.45;
    const offset = { top: 0, center: (textHeight - passage) / 2, bottom: textHeight - passage, both: 0 }[vertical.value] || 0;
    const one = (dx, swap) => {
      const area = box(swap ? next.right : l, t, w - next.left - next.right - (atTop ? 0 : g), textHeight, 'ps-text');
      area.append(box(0, offset, w - next.left - next.right - (atTop ? 0 : g), passage, 'ps-lines'));
      const page = el('span.ps-page', { style: { left: `${dx}px`, width: `${w * scale}px`, height: `${h * scale}px` } }, area);
      if (g && !atTop) page.append(box(swap ? w - g : 0, 0, g, h, 'ps-gutter'));
      if (g && atTop) page.append(box(0, 0, w, g, 'ps-gutter'));
      return page;
    };
    sheet.style.width = `${(spread ? 2 : 1) * w * scale + (spread ? 4 : 0)}px`; sheet.style.height = `${h * scale}px`;
    sheet.replaceChildren(...(spread ? [one(0, mirrored), one(w * scale + 4, false)] : [one(0, false)]));
  }

  const setDefault = options.setDefault && el('button.btn.btn-ghost.ps-default', { type: 'button', onclick: () => {
    try { options.setDefault(validatePageSettings({ ...settings, ...changes() })); error.hidden = true; }
    catch (e) { error.textContent = e.message; error.hidden = false; }
  } }, '设为默认值');
  // The arrows step by hundredths, but any value in range is accepted: imported measurements need not
  // fall on the step.
  const content = el('form.ed-dialog-body.ps-dialog', { noValidate: true, onsubmit: e => {
    e.preventDefault();
    const invalid = Object.values(inputs).find(input => input.value === '' || input.validity.badInput || input.validity.rangeUnderflow || input.validity.rangeOverflow);
    if (invalid) { error.textContent = `请输入介于 ${invalid.min} 到 ${invalid.max} ${unit} 之间的数值。`; error.hidden = false; revealControl(invalid); invalid.focus(); return; }
    try {
      const patch = changes(), storyPatch = storyChanges();
      validatePageSettings({ ...settings, ...patch });
      if (Object.keys(patch).length && apply(patch, { scope: scope.value, stories: storyPatch }) === false) throw new Error('当前页面设置无法容纳文本。请调整页边距或纸张大小。');
      if (!Object.keys(patch).length && storyPatch) apply({}, { scope: scope.value, stories: storyPatch });
      modal.close();
    } catch (e) { error.textContent = e.message; error.hidden = false; }
  } },
  el('div.ed-font-tabs', { role: 'tablist', 'aria-label': '页面设置' }, ...tabButtons),
  el('div.ps-body', {}, el('div.ps-panels', {}, pagePanel, layoutPanel),
    el('div.ps-side', {}, el('span.field-label', {}, '预览'), previewBox,
      el('label.field', {}, el('span.field-label', {}, '应用于'), scope))),
  ...((settings.bookFoldPrinting || settings.bookFoldRevPrinting) ? [el('p.field-hint', {}, '保留书籍折页打印。宽度和高度描述每个阅读页。')] : []),
  ...(settings.top < 0 || settings.bottom < 0 ? [el('p.field-hint', {}, '负页边距保留其存储的符号以及距页面边缘的距离。')] : []),
  error,
  el('div.row.ps-actions', {}, setDefault || el('span'),
    el('div.row.row-end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'),
      el('button.btn.btn-primary', { type: 'submit' }, '确定'))));
  show(options.tab === 'layout' ? 'layout' : 'page');
  preview();
  const modal = openModal({ title: '页面设置', content, wide: true, onClose: () => {
    const root = modal.panel.closest('.modal-root');
    root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true');
  } });
  return modal;
}
