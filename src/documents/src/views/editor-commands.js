import { el, isComposing } from '../ui/dom.js';
import { countWords } from '../core/text.js';
import { openModal } from '../ui/modal.js';
import { openSymbolPicker } from '../ui/symbols.js';
import { styleRun } from '../engine/styles.js';
import { canvasFontFamily } from '../engine/font-families.js';
import { displayedFont } from '../engine/font-availability.js';
import { MAX_FONT_SIZE } from '../engine/font-size.js';
import { stepFontSize } from '../lib/fontsize.js';

/** Twips per inch and per centimetre: page settings are stored in twips. */
const IN = 1440, CM = 1440 / 2.54;
/** The margin presets a desktop word processor offers, in inches: top, bottom, left, right. */
export const MARGIN_PRESETS = [
  ['普通', 1, 1, 1, 1],
  ['窄', 0.5, 0.5, 0.5, 0.5],
  ['适中', 1, 1, 0.75, 0.75],
  ['宽', 1, 1, 2, 2],
];
/** Paper sizes in twips, portrait. */
export const PAPER_PRESETS = [
  ['Letter', '8.5″ × 11″', 12240, 15840],
  ['Legal', '8.5″ × 14″', 12240, 20160],
  ['Executive', '7.25″ × 10.5″', 10440, 15120],
  ['Tabloid', '11″ × 17″', 15840, 24480],
  ['A3', '29.7 cm × 42 cm', 16838, 23811],
  ['A4', '21 cm × 29.7 cm', 11906, 16838],
  ['A5', '14.8 cm × 21 cm', 8391, 11906],
  ['B5 (JIS)', '18.2 cm × 25.7 cm', 10319, 14572],
];
export const PAGE_COLORS = [
  ['白色', 'FFFFFF'], ['象牙白', 'FFFDF2'], ['浅灰', 'F2F2F2'], ['浅蓝', 'DEEAF6'], ['浅绿', 'E2EFD9'],
  ['浅黄', 'FFF2CC'], ['浅橙', 'FBE4D5'], ['浅红', 'F8D7D7'], ['浅紫', 'E7DCF0'], ['浅青', 'D9F0EF'],
];

/** Date formats for Insert → Date & Time, as a word processor lists them. */
export function dateFormats(now = new Date(), locale = undefined) {
  const f = options => new Intl.DateTimeFormat(locale, options).format(now);
  const pad = n => String(n).padStart(2, '0');
  const list = [
    f({ dateStyle: 'short' }),
    f({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    f({ year: 'numeric', month: 'long', day: 'numeric' }),
    f({ dateStyle: 'medium' }),
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    f({ day: 'numeric', month: 'long', year: 'numeric' }),
    f({ month: 'long', year: 'numeric' }),
    f({ dateStyle: 'short', timeStyle: 'short' }),
    f({ timeStyle: 'short' }),
    f({ timeStyle: 'medium' }),
  ];
  return [...new Set(list)];
}

/** Document statistics for a text: words, characters with and without spaces, paragraphs. */
export function documentStatistics(text) {
  const plain = String(text).replace(/[￼]/g, '');
  // The status bar's and the Word Count dialog's rule (core/text.js), so File > Info agrees with them.
  const words = countWords(plain);
  const characters = [...plain.replace(/[\n\f\v]/g, '')].length;
  const noSpaces = [...plain.replace(/\s/gu, '')].length;
  const paragraphs = plain.split('\n').filter(p => p.replace(/[\f\v\t ]/g, '').length).length;
  return { words, characters, noSpaces, paragraphs };
}

/** Change case: sentence, lower, upper, capitalized words or toggled. Returns the new text of the same length per code unit where possible. */
export function changeTextCase(text, mode) {
  if (mode === 'upper') return text.toLocaleUpperCase();
  if (mode === 'lower') return text.toLocaleLowerCase();
  if (mode === 'toggle') return [...text].map(ch => ch === ch.toLocaleUpperCase() ? ch.toLocaleLowerCase() : ch.toLocaleUpperCase()).join('');
  if (mode === 'title') return text.toLocaleLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, gap, ch) => gap + ch.toLocaleUpperCase());
  if (mode === 'sentence') {
    let start = true;
    return [...text.toLocaleLowerCase()].map(ch => {
      if (/\p{L}/u.test(ch)) { const out = start ? ch.toLocaleUpperCase() : ch; start = false; return out; }
      if (/[.!?\n\f]/.test(ch)) start = true;
      return ch;
    }).join('');
  }
  return text;
}

/**
 * The ribbon's commands that the editor's own controls do not already cover. Each acts on the
 * current editor through the same transactions as the toolbar, so undo and saving work unchanged.
 */
export function createWordCommands({ editor, pkg, error, zoomControl, fitWidth, openFind, root, focus }) {
  const ready = () => { const engine = editor(); return engine && !pkg()?.readOnly ? engine : null; };
  const run = action => { const engine = ready(); if (!engine) return false; engine.finishComposition(); const ok = engine.execute(() => action(engine)); engine.focus(); return ok; };
  const setPage = patch => { const engine = ready(); if (!engine) return; engine.finishComposition(); try { engine.setPageSettings(patch); } catch (e) { error(e); } engine.focus(); };
  const page = () => editor()?.model.pageSettings;
  const near = (a, b) => Math.abs(a - b) < 15;
  let focusExit = null;

  const commands = {
    growFont(direction, step = null) {
      const engine = ready(); if (!engine) return;
      const size = engine.model.runCommandFormatting.fontSize;
      if (size === null || size === undefined) return;
      const next = step ? size + direction * step : stepFontSize(size, direction);
      engine.setFontSize(Math.max(1, Math.min(MAX_FONT_SIZE, next)));
    },
    // Replace goes to its own field once there is something to find; with Find empty it starts there.
    openReplace() { openFind(); queueMicrotask(() => { if (document.querySelector('.canvas-find input[aria-label="Find text"]')?.value) document.querySelector('.canvas-find input[aria-label="Replace with"]')?.focus(); }); },
    insertBlankPage() { run(engine => { engine.model.insertPageBreak(); engine.model.insertPageBreak(); }); },
    insertLineBreak() { run(engine => engine.model.replace('\v')); },
    insertDateTime() {
      const engine = ready(); if (!engine) return;
      engine.finishComposition();
      const list = el('div.ed-choice-list', { role: 'listbox', 'aria-label': '可用格式' });
      let modal;
      const choose = text => { modal.close(); run(e => e.model.replace(text)); };
      for (const [i, text] of dateFormats().entries()) {
        const option = el('button.ed-choice', { type: 'button', role: 'option', 'aria-selected': String(i === 0), onclick: () => choose(text),
          onkeydown: e => {
            if (isComposing(e)) return;
            const items = [...list.children], at = items.indexOf(option);
            const next = e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowUp' ? at - 1 : null;
            if (next !== null && items[next]) { e.preventDefault(); items[next].focus(); }
          } }, text);
        list.append(option);
      }
      modal = openModal({ title: '日期和时间', content: el('div.ed-dialog-body', {}, el('p.field-hint', {}, '选择一种格式。日期将作为文本插入。'), list), onClose: () => queueMicrotask(() => editor()?.focus()) });
      list.firstChild?.focus();
    },
    insertSymbol() {
      const engine = ready(); if (!engine) return;
      engine.finishComposition();
      openSymbolPicker({ onPick: ch => run(e => e.model.replace(ch)) });
    },
    canEditHeader(kind) { return !!headerArea(kind); },
    editHeader(kind) {
      const engine = ready(), area = headerArea(kind);
      if (!engine || !area) return;
      try { engine.editStory(area.path, area.page); engine.focus(); } catch (e) { error(e); }
    },
    marginItems() {
      const p = page();
      return MARGIN_PRESETS.map(([label, top, bottom, left, right]) => ({
        label, hint: `上 ${top}″ · 下 ${bottom}″ · 左 ${left}″ · 右 ${right}″`, radio: true,
        checked: !!p && near(p.top, top * IN) && near(p.bottom, bottom * IN) && near(p.left, left * IN) && near(p.right, right * IN),
        onSelect: () => setPage({ top: top * IN, bottom: bottom * IN, left: Math.round(left * IN), right: Math.round(right * IN) }),
      }));
    },
    orientationItems() {
      const p = page();
      return [['纵向', 'portrait'], ['横向', 'landscape']].map(([label, value]) => ({
        label, radio: true, checked: p?.orientation === value,
        onSelect: () => {
          const current = page(); if (!current || current.orientation === value) return;
          // Turning the page swaps its sides and rotates the margins with it.
          setPage({ orientation: value, width: current.height, height: current.width,
            ...(value === 'landscape' ? { top: current.left, bottom: current.right, left: current.bottom, right: current.top }
              : { top: current.right, bottom: current.left, left: current.top, right: current.bottom }) });
        },
      }));
    },
    sizeItems() {
      const p = page();
      return PAPER_PRESETS.map(([label, hint, width, height]) => {
        const [w, h] = p?.orientation === 'landscape' ? [height, width] : [width, height];
        return { label, hint, radio: true, checked: !!p && near(p.width, w) && near(p.height, h), onSelect: () => setPage({ width: w, height: h }) };
      });
    },
    columnItems() {
      const p = page();
      const count = p?.columns?.count || 1, equal = p?.columns?.equalWidth !== false;
      const text = p ? p.width - p.left - p.right - (p.gutterAtTop ? 0 : p.gutter) : 0;
      // Left and Right presets: two columns, the narrower about a third of the width, half an inch apart.
      const uneven = narrowFirst => {
        const narrow = Math.round((text - 720) / 3), wide = text - 720 - narrow;
        return { count: 2, space: 720, equalWidth: false, separator: false, entries: narrowFirst ? [{ width: narrow, space: 720 }, { width: wide, space: 0 }] : [{ width: wide, space: 720 }, { width: narrow, space: 0 }] };
      };
      const first = p?.columns?.entries?.[0]?.width, second = p?.columns?.entries?.[1]?.width;
      return [
        ...[['一栏', 1], ['两栏', 2], ['三栏', 3]].map(([label, n]) => ({
          label, icon: 'columns', radio: true, checked: count === n && (n === 1 || equal),
          onSelect: () => setPage({ columns: n === 1 ? null : { count: n, space: 720, equalWidth: true, separator: false } }),
        })),
        { label: '偏左', radio: true, checked: count === 2 && !equal && first < second, onSelect: () => setPage({ columns: uneven(true) }) },
        { label: '偏右', radio: true, checked: count === 2 && !equal && first > second, onSelect: () => setPage({ columns: uneven(false) }) },
        { separator: true },
        { label: '分隔线', checked: !!p?.columns?.separator, disabled: count < 2, onSelect: () => setPage({ columns: { ...page().columns, separator: !page().columns.separator } }) },
      ];
    },
    pageBorderItems() {
      const p = page(), current = p?.pageBorders;
      const box = (style, size) => ({ offsetFrom: 'page', display: 'allPages', zOrder: 'front',
        borders: Object.fromEntries(['top', 'left', 'bottom', 'right'].map(side => [side, { style, size, space: 24, color: 'auto' }])) });
      // The stored borders carry normalized fields (frame, shadow, colour) the presets leave out: compare what a preset sets.
      const same = value => current?.offsetFrom === value.offsetFrom && Object.entries(value.borders).every(([side, b]) => {
        const at = current.borders?.[side];
        return !!at && at.style === b.style && at.size === b.size && at.space === b.space;
      }) && Object.keys(current.borders || {}).length === Object.keys(value.borders).length;
      const choices = [['方框，½ 磅线', 'single', 4], ['方框，1½ 磅线', 'single', 12], ['方框，3 磅线', 'single', 24], ['方框，双线', 'double', 6], ['方框，点线', 'dotted', 6], ['方框，虚线', 'dashed', 6]];
      return [{ label: '无边框', radio: true, checked: !current, onSelect: () => setPage({ pageBorders: null }) }, { separator: true },
        ...choices.map(([label, style, size]) => { const value = box(style, size); return { label, radio: true, checked: !!current && same(value), onSelect: () => setPage({ pageBorders: value }) }; })];
    },
    pageColorItems() {
      const p = page();
      return [{ label: '无颜色', radio: true, checked: !p || p.background === 'auto', swatch: 'none', onSelect: () => setPage({ background: 'auto' }) }, { separator: true },
        ...PAGE_COLORS.map(([label, hex]) => ({ label, radio: true, checked: p?.background === hex, swatch: `#${hex}`, onSelect: () => setPage({ background: hex }) }))];
    },
    setIndent(key, inches) {
      const engine = ready(); if (!engine) return;
      engine.finishComposition();
      if (engine.setParagraphGeometry({ [key]: Math.round(inches * IN) }) === false) error(new Error('缩进超出页面范围。'));
      engine.focus();
    },
    indentValue(key) {
      const value = editor()?.model.paragraphFormatting?.[key];
      return value === null || value === undefined ? null : Math.round(value / IN * 100) / 100;
    },
    canArrange() { return !pkg()?.readOnly && !!editor()?.model.selectedImage?.anchor; },
    arrange(direction) { run(engine => engine.model.arrangeImage(direction)); },
    wrapItems() {
      const image = editor()?.model.selectedImage;
      return [
        { label: '浮于文字上方', icon: 'inFront', radio: true, checked: !!image?.anchor && !image.anchor.behind, disabled: !commands.canArrange(), onSelect: () => commands.arrange('inFront') },
        { label: '衬于文字下方', icon: 'behindText', radio: true, checked: !!image?.anchor?.behind, disabled: !commands.canArrange(), onSelect: () => commands.arrange('behind') },
        { label: '置于顶层', icon: 'bringForward', disabled: !commands.canArrange(), onSelect: () => commands.arrange('front') },
        { label: '置于底层', icon: 'sendBackward', disabled: !commands.canArrange(), onSelect: () => commands.arrange('back') },
      ];
    },
    deleteSelection() { run(engine => engine.model.replace('')); },
    canUpdateFields() { const engine = editor(); return !!engine && !pkg()?.readOnly && engine.session.path === null && !!engine.model.hasBodyFields; },
    updateFields() { const engine = ready(); if (engine) { engine.updatePageReferences(); engine.focus(); } },
    wordCount() {
      const engine = editor(); if (!engine) return;
      engine.finishComposition();
      const [a, b] = engine.model.range, selected = a !== b;
      const stats = documentStatistics(selected ? engine.model.text.slice(a, b) : engine.model.text);
      const row = (label, value) => el('tr', {}, el('th', { scope: 'row' }, label), el('td', {}, value.toLocaleString()));
      openModal({ title: '字数统计', onClose: () => queueMicrotask(() => editor()?.focus()), content: el('div.ed-dialog-body', {},
        el('p.field-hint', {}, selected ? '选定内容的统计信息:' : '统计信息:'),
        el('table.ed-stats', {}, el('tbody', {},
          // The printed pages, as in Print Layout, whatever view is showing.
          ...(selected ? [] : [row('页数', engine.printedPages().count)]),
          row('字数', stats.words), row('字符数(不计空格)', stats.noSpaces), row('字符数(计空格)', stats.characters), row('段落数', stats.paragraphs))),
        el('div.modal-actions', {}, el('button.btn.btn-primary', { type: 'button', onclick: e => e.target.closest('.modal-panel')?.querySelector('.modal-head .icon-btn')?.click() }, '关闭'))) });
    },
    setZoom(value, at, { focus = true } = {}) { const engine = editor(); if (!engine) return; zoomControl.set(value, at); if (focus) engine.focus(); },
    zoomSetting() { return zoomControl.value; },
    zoomTo(kind) {
      const engine = editor(); if (!engine) return;
      // Whole page goes on fitting the page as the window changes size, as Fit width does.
      zoomControl.set(kind === 'width' ? 'fit' : 'page'); fitWidth();
      engine.focus();
    },
    zoomDialog() {
      const engine = editor(); if (!engine) return;
      const percent = el('input.input', { type: 'number', min: 10, max: 200, step: 1, required: true, value: Math.round(engine.zoom * 100), 'aria-label': '百分比' });
      let modal;
      const apply = value => { modal.close(); if (value === 'fit' || value === 'page') commands.zoomTo(value === 'fit' ? 'width' : 'page'); else commands.setZoom(value); };
      const preset = (label, value) => el('button.btn.btn-outline', { type: 'button', onclick: () => apply(value) }, label);
      modal = openModal({ title: '显示比例', onClose: () => queueMicrotask(() => editor()?.focus()), content: el('form.ed-dialog-body', { onsubmit: e => {
        e.preventDefault(); if (!percent.checkValidity()) { percent.reportValidity(); return; } apply(Number(percent.value) / 100);
      } },
      el('div.ed-zoom-presets', {}, preset('200%', 2), preset('100%', 1), preset('75%', 0.75), preset('50%', 0.5), preset('页宽', 'fit'), preset('整页', 'page')),
      el('label.field', {}, el('span.field-label', {}, '百分比'), percent),
      el('div.modal-actions', {}, el('button.btn.btn-primary', { type: 'submit' }, '确定'))) });
    },
    focusMode() {
      if (focusExit) { focusExit(); return; }
      const exit = el('button.btn.ed-focus-exit', { type: 'button', onclick: () => focusExit?.() }, '退出专注模式');
      const onKey = e => { if (e.key === 'Escape' && !isComposing(e) && !document.querySelector('.modal-root, .menu')) { e.preventDefault(); focusExit?.(); } };
      root().classList.add('ed-focus');
      root().append(exit);
      window.addEventListener('keydown', onKey, true);
      // Focus fills the screen where the browser allows it; leaving full screen (Esc) leaves Focus too.
      let fullScreen = false;
      const onFullScreen = () => { if (fullScreen && !document.fullscreenElement) focusExit?.(); };
      document.addEventListener('fullscreenchange', onFullScreen);
      if (document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(() => { fullScreen = true; }, () => {});
      focusExit = () => {
        root().classList.remove('ed-focus'); exit.remove(); window.removeEventListener('keydown', onKey, true);
        document.removeEventListener('fullscreenchange', onFullScreen);
        if (fullScreen && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        fullScreen = false; focusExit = null; fitWidth(); focus();
      };
      fitWidth(); focus();
    },
    stylePreview(id) {
      const engine = editor(); if (!engine) return null;
      try {
        const run = styleRun(engine.model.styles, id);
        return { bold: !!run.bold, italic: !!run.italic, size: run.fontSize, color: run.color && run.color !== 'auto' ? `#${run.color}` : null,
          fontFamily: canvasFontFamily({ fontFamily: displayedFont({ fontFamily: run.fontAscii }, engine.model.styles.fontAlternatives) }) };
      } catch { return null; }
    },
    drawingTextItems() { return []; },
  };

  function headerArea(kind) {
    const engine = editor();
    if (!engine || pkg()?.readOnly) return null;
    const areas = (engine.storyLayout?.positions || []).filter(item => engine.pageStories.stories[item.path]?.editable && engine.pageStories.stories[item.path].kind === kind);
    if (!areas.length) return null;
    const pageIndex = engine.caretPageIndex ?? 0;
    return areas.find(item => item.page === pageIndex) || areas[0];
  }

  return commands;
}
