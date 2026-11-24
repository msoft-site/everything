/**
 * The Design tab: document themes, style sets, theme colors, fonts and effects, paragraph spacing,
 * watermarks, page color and page borders.
 * Theme, style-set, watermark and fill-effect changes rewrite parts of the saved package and reopen it
 * in place (see editor.js changePackage), so Undo steps back to the package before the change; spacing,
 * colors and borders of the page go through the editor's transactions.
 */
import { el } from '../ui/dom.js';
import { openMenu, closeMenu } from '../ui/menu.js';
import { promptDialog, confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { THEMES, COLOR_SCHEMES, FONT_SCHEMES, EFFECT_SCHEMES, STYLE_SETS, resolvedTheme } from '../engine/document-themes.js';
import { openCustomizeColors, openCustomizeFonts, openParagraphSpacing, openCustomWatermark, openFillEffects, openPageColor, WATERMARK_PRESETS } from './design-dialogs.js';
import '../styles/design-tab.css';

const design = () => import('../engine/package-design.js');

/* Saved themes, palettes, font pairs, style sets and new-document defaults live in this browser. */
const KEYS = { themes: 'documents.design.themes', colors: 'documents.design.colors', fonts: 'documents.design.fonts', styleSets: 'documents.design.styleSets', defaults: 'documents.design.defaults' };
export function loadSaved(key, fallback = []) {
  try { const value = JSON.parse(localStorage.getItem(KEYS[key]) || 'null'); return value ?? fallback; } catch { return fallback; }
}
export function storeSaved(key, value) {
  try { if (value === null) localStorage.removeItem(KEYS[key]); else localStorage.setItem(KEYS[key], JSON.stringify(value)); return true; } catch { return false; }
}
const remember = (key, entry) => {
  const list = loadSaved(key).filter(item => item.name !== entry.name);
  if (!storeSaved(key, [...list, entry].slice(-24))) toast('当前浏览器未能保留已保存的项目。', { icon: 'alert' });
};

/** Small previews drawn in HTML: they follow the theme's colors and name its fonts. */
const fontStack = name => `"${name}", "Canvas Noto Sans", "Noto Sans", sans-serif`;
function themeCard(theme, { selected, onSelect, label = theme.name }) {
  const c = theme.colors;
  return el('button.swatch.design-card.design-theme-card', { type: 'button', role: 'menuitemradio', tabindex: -1, 'aria-checked': String(!!selected), 'aria-label': `${label} 主题`, title: label, onclick: onSelect },
    el('span.design-theme-page', { 'aria-hidden': 'true', style: { background: `#${c.lt1}` } },
      el('span.design-theme-title', { style: { fontFamily: fontStack(theme.fonts.major), color: `#${c.dk2}` } }, 'Aa'),
      el('span.design-theme-bars', {}, ...['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(slot => el('span', { style: { background: `#${c[slot]}` } })))),
    el('span.design-card-name', {}, label));
}
function colorStrip(colors) {
  return el('span.design-color-strip', { 'aria-hidden': 'true' }, ...['dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(slot => el('span', { style: { background: `#${colors[slot]}` } })));
}

export function createDesignTab({ editor, pkg, error, onChange = () => {}, commands: base = {} }) {
  /** A gallery choice in a menu closes the menus and returns to the document before acting. */
  const choose = action => () => { closeMenu(); editor()?.focus(); action(); };
  const ready = () => { const engine = editor(); return engine && !pkg()?.readOnly && !engine.viewOnly ? engine : null; };
  // Under Restrict Editing or Lock Tracking the design stays as it is (editor.js changePackage refuses it too).
  const editable = () => !!ready() && !!base.changePackage && !base.protectionEnforced?.();
  let api = null;
  const loading = design().then(module => { api = module; onChange(); }).catch(() => {});
  // What the open package declares, read once per package and each part only when asked for; the theme the
  // document opened with is kept for Reset. The watermark parses every header, which in a long document took
  // longer than opening it: only its menu asks for it.
  let infoFor = null, info = null, openedTheme;
  const packageInfo = parts => {
    const read = { theme: () => api.readThemeInfo(parts), styleSet: () => api.currentStyleSetName(parts, [...STYLE_SETS, ...loadSaved('styleSets')]),
      watermark: () => api.readWatermark(parts) };
    const fallback = { theme: null, styleSet: null, watermark: null }, known = {};
    return Object.defineProperties({}, {
      ...Object.fromEntries(Object.keys(read).map(name => [name, { enumerable: true, get() {
        if (!Object.hasOwn(known, name)) { try { known[name] = read[name](); } catch { known[name] = fallback[name]; } }
        return known[name];
      } }])),
      // The page's fill effect is the editor's picture background: a page color chosen afterwards replaces it,
      // and Undo brings it back, without a new package.
      fill: { enumerable: true, get: () => !!editor()?.model.pageSettings?.backgroundPicture },
    });
  };
  function current() {
    const p = pkg();
    if (!p || !api) return { theme: null, styleSet: null, watermark: null, fill: false };
    if (infoFor !== p) {
      infoFor = p;
      info = packageInfo(p.parts);
      if (openedTheme === undefined) openedTheme = api.themePartXml(p.parts);
    }
    return info;
  }
  /** Change the package: edit(parts, api) mutates the parts map, or returns false to leave it alone. `label` names the undo step. */
  async function edit(change, label) {
    if (!editable()) return false;
    await loading;
    const ok = await base.changePackage(async blob => {
      const parts = await api.blobParts(blob);
      if (await change(parts, api) === false) return null;
      return api.partsBlob(parts);
    }, { label });
    if (ok) onChange();
    return ok;
  }
  // A dialog's change reopens the package in a new editor, so the one focused when it opened is gone: the keyboard
  // goes back to the document the dialog leaves open.
  const refocus = () => queueMicrotask(() => editor()?.focus());
  const themeChange = change => edit((parts, a) => { a.applyDesignTheme(parts, change); a.refreshStyleThemeColors(parts); },
    change.colors ? 'Theme Colors' : change.fonts ? 'Theme Fonts' : change.effects ? 'Theme Effects' : 'Theme');

  /* ---- Themes ---- */
  const themeSelected = theme => {
    const now = current().theme;
    return !!now && now.name === theme.name && now.colorName === theme.colors.name && now.fonts.major === theme.fonts.major && now.fonts.minor === theme.fonts.minor && now.effects === theme.effects.name;
  };
  async function browseTheme() {
    const input = el('input', { type: 'file', accept: '.thmx,.xml,application/xml', hidden: true });
    input.addEventListener('change', async () => {
      const file = input.files?.[0]; input.remove();
      if (!file) return;
      try {
        await loading;
        const xml = api.themeFileXml(new Uint8Array(await file.arrayBuffer()));
        if (await themeChange({ xml })) remember('themes', { name: file.name.replace(/\.(thmx|xml)$/i, ''), xml });
      } catch (e) { error(e); }
    }, { once: true });
    document.body.append(input); input.click();
  }
  async function saveTheme() {
    await loading;
    const name = await promptDialog({ title: '保存当前主题', label: '主题名称', value: current().theme?.name || '我的主题', confirmLabel: '保存',
      hint: '保存的主题将出现在此浏览器“主题”库的“自定义”下。' });
    if (!name) return;
    const xml = api.themePartXml(pkg().parts) || api.themeXml({ ...resolvedTheme('Paper'), name });
    remember('themes', { name, xml: xml.replace(/(<a:theme\b[^>]*?\sname=")[^"]*"/, `$1${name.replace(/[&<"]/g, '')}"`) });
    toast(`已保存主题“${name}”`, { icon: 'check' });
  }
  function themeItems() {
    const enabled = editable();
    const gallery = (themes, selected) => el('div.menu-custom-grid.design-grid', { role: 'group', dataset: { columns: '4' } },
      ...themes.map(theme => themeCard(theme, { selected: selected(theme), onSelect: choose(() => { if (enabled) themeChange(theme.xml ? { xml: theme.xml } : { theme }); }) })));
    const saved = loadSaved('themes').map(entry => {
      // A saved theme previews from its own XML.
      const colors = Object.fromEntries([...entry.xml.matchAll(/<a:(\w+)><a:(?:srgbClr val|sysClr[^>]*lastClr)="([0-9A-Fa-f]{6})"/g)].map(m => [m[1], m[2].toUpperCase()]));
      const typeface = tag => new RegExp(`<a:${tag}>\\s*<a:latin typeface="([^"]*)"`).exec(entry.xml)?.[1] || 'Noto Sans';
      return { name: entry.name, xml: entry.xml, colors: { dk1: '000000', lt1: 'FFFFFF', dk2: '1F2A44', lt2: 'EEF0F3', ...colors }, fonts: { major: typeface('majorFont'), minor: typeface('minorFont') } };
    });
    return [{ header: '内置' }, { custom: gallery(THEMES.map(resolvedTheme), themeSelected) },
      ...(saved.length ? [{ header: '自定义' }, { custom: gallery(saved, entry => current().theme?.name === entry.name) }] : []),
      { separator: true },
      { label: '重置为模板中的主题', disabled: !enabled, onSelect: () => (openedTheme ? themeChange({ xml: openedTheme }) : themeChange({ theme: resolvedTheme('Paper') })) },
      { label: '浏览主题…', disabled: !enabled, onSelect: browseTheme },
      { label: '保存当前主题…', onSelect: saveTheme }];
  }

  /* ---- Colors, fonts, effects ---- */
  function colorItems() {
    const enabled = editable(), now = current().theme;
    const saved = loadSaved('colors');
    const item = scheme => ({ custom: el('button.menu-item.design-row', { type: 'button', role: 'menuitemradio', tabindex: -1, disabled: !enabled,
      'aria-checked': String(!!now && now.colorName === scheme.name), onclick: choose(() => themeChange({ colors: { name: scheme.name, ...scheme.colors } })) },
    colorStrip(scheme.colors), el('span.menu-label', {}, scheme.name)) });
    return [{ header: '内置' }, ...COLOR_SCHEMES.map(item),
      ...(saved.length ? [{ header: '自定义' }, ...saved.map(item)] : []),
      { separator: true }, { label: '自定义颜色…', disabled: !enabled, onSelect: customizeColors }];
  }
  async function customizeColors() {
    await loading;
    const now = current().theme, start = now?.colors && Object.values(now.colors).every(Boolean) ? now.colors : resolvedTheme('Paper').colors;
    openCustomizeColors({ colors: start, name: '自定义 1', onClose: refocus, apply: scheme => { remember('colors', scheme); return themeChange({ colors: { name: scheme.name, ...scheme.colors } }); } });
  }
  function fontItems() {
    const enabled = editable(), now = current().theme;
    const saved = loadSaved('fonts');
    const item = scheme => ({ custom: el('button.menu-item.design-font-row', { type: 'button', role: 'menuitemradio', tabindex: -1, disabled: !enabled,
      'aria-checked': String(!!now && now.fonts.major === scheme.major && now.fonts.minor === scheme.minor), onclick: choose(() => themeChange({ fonts: scheme })) },
    el('span.design-font-sample', { 'aria-hidden': 'true' }, 'Aa'),
    el('span.design-font-names', {}, el('span.design-font-name', {}, scheme.name),
      el('span.design-font-major', { style: { fontFamily: fontStack(scheme.major) } }, scheme.major),
      el('span.design-font-minor', { style: { fontFamily: fontStack(scheme.minor) } }, scheme.minor))) });
    return [{ header: '内置' }, ...FONT_SCHEMES.map(item), ...(saved.length ? [{ header: '自定义' }, ...saved.map(item)] : []),
      { separator: true }, { label: '自定义字体…', disabled: !enabled, onSelect: customizeFonts }];
  }
  async function customizeFonts() {
    await loading;
    const now = current().theme?.fonts;
    openCustomizeFonts({ fonts: now?.major ? now : FONT_SCHEMES[0], name: '自定义 1', onClose: refocus, apply: scheme => { remember('fonts', scheme); return themeChange({ fonts: scheme }); } });
  }
  function effectItems() {
    const enabled = editable(), now = current().theme;
    return [{ note: '效果可更改使用主题样式的图形的填充、轮廓和阴影。' },
      ...EFFECT_SCHEMES.map(scheme => ({ label: scheme.name, icon: `effects${scheme.name.replace(/\s/g, '')}`, radio: true, checked: now?.effects === scheme.name, disabled: !enabled,
        hint: scheme.effects.some(Boolean) ? '阴影' : scheme.fills.includes('gradient') ? '渐变' : '无特殊效果', onSelect: () => themeChange({ effects: scheme }) }))];
  }

  /* ---- Style sets ---- */
  // Style sets name theme fonts and colors: a document without a theme takes the default one first.
  const applyStyleSet = set => edit((parts, a) => {
    if (!a.themePartPath(parts)) a.applyDesignTheme(parts, { theme: resolvedTheme('Paper') });
    a.applyStyleSetParts(parts, set); a.refreshStyleThemeColors(parts);
  }, 'Style Set');
  const styleSetCard = (set, theme, { selected, onSelect, tag = 'button.ribbon-style.design-set' }) => {
    const c = theme.colors, color = spec => spec?.color ? `#${c[{ text1: 'dk1', text2: 'dk2', background1: 'lt1', background2: 'lt2' }[spec.color.theme] || spec.color.theme] || c.dk1}` : `#${c.dk1}`;
    const s = set.styles || {};
    const title = s.Title || {}, heading = s.Heading1 || {};
    return el(tag, { type: 'button', role: tag.startsWith('button.swatch') ? 'menuitemradio' : 'option', [tag.startsWith('button.swatch') ? 'aria-checked' : 'aria-selected']: String(!!selected), title: set.description ? `${set.name}: ${set.description}` : set.name, 'aria-label': `${set.name} 样式集`, tabindex: tag.startsWith('button.swatch') ? -1 : null, onclick: onSelect },
      el('span.design-set-page', { 'aria-hidden': 'true' },
        el('span.design-set-title', { style: { color: color(title), fontFamily: fontStack(theme.fonts.major), fontWeight: title.bold ? '700' : '400', textTransform: title.caps ? 'uppercase' : '', textAlign: title.align === 'center' ? 'center' : 'left', borderBottom: title.border ? `1.5px solid #${c.accent1}` : '' } }, '标题'),
        el('span.design-set-heading', { style: { color: color(heading), fontFamily: fontStack(theme.fonts.major), fontWeight: heading.bold ? '700' : '400', textTransform: heading.caps ? 'uppercase' : '', textAlign: heading.align === 'center' ? 'center' : 'left', borderBottom: heading.border ? `1.5px solid #${c.accent1}` : '' } }, '标题 1'),
        el('span.design-set-lines', {}, el('span'), el('span'), el('span'))),
      el('span.design-card-name', {}, set.name));
  };
  const currentTheme = () => {
    const now = current().theme;
    return now?.colors?.accent1 ? { colors: now.colors, fonts: now.fonts } : resolvedTheme('Paper');
  };
  const gallery = el('div.ribbon-gallery.design-sets', { role: 'listbox', 'aria-label': '样式集', 'aria-orientation': 'horizontal', dataset: { shrinkMin: '1', shrinkMax: '420' } });
  let gallerySignature = '';
  function refreshGallery() {
    const theme = currentTheme(), selected = current().styleSet, enabled = editable();
    const signature = JSON.stringify([theme.colors, theme.fonts, selected, enabled]);
    if (signature === gallerySignature) return;
    gallerySignature = signature;
    gallery.replaceChildren(...STYLE_SETS.map(set => {
      const card = styleSetCard(set, theme, { selected: selected === set.name, onSelect: () => applyStyleSet(set) });
      card.disabled = !enabled;
      card.addEventListener('mousedown', e => e.preventDefault());
      return card;
    }));
  }
  function styleSetItems() {
    const enabled = editable(), theme = currentTheme(), selected = current().styleSet;
    const saved = loadSaved('styleSets');
    const grid = sets => el('div.menu-custom-grid.design-grid.design-set-grid', { role: 'group', dataset: { columns: '4' } },
      ...sets.map(set => styleSetCard(set, theme, { selected: selected === set.name, tag: 'button.swatch.design-card.design-set', onSelect: choose(() => { if (enabled) applyStyleSet(set); }) })));
    return [{ header: '内置' }, { custom: grid(STYLE_SETS) }, ...(saved.length ? [{ header: '自定义' }, { custom: grid(saved) }] : []),
      { separator: true },
      { label: '重置为默认样式集', disabled: !enabled, onSelect: () => applyStyleSet(STYLE_SETS[0]) },
      { label: '另存为新样式集…', onSelect: saveStyleSet }];
  }
  async function saveStyleSet() {
    await loading;
    const engine = editor(); if (!engine) return;
    const name = await promptDialog({ title: '另存为新样式集', label: '样式集名称', value: '我的样式集', confirmLabel: '保存',
      hint: '保存正文、标题、副标题、标题 1–3 和引用的外观。保存的样式集将出现在此浏览器的“自定义”下。' });
    if (!name) return;
    const blob = base.exportPackage?.(); if (!blob) return;
    try {
      const parts = await api.blobParts(blob), snippets = api.captureStyleSet(parts);
      // A saved set previews with its heading's look; keep the declarations the preview reads.
      remember('styleSets', { name, snippets, styles: {} });
      toast(`已保存样式集“${name}”`, { icon: 'check' });
      infoFor = null; onChange();
    } catch (e) { error(e); }
  }

  /* ---- Paragraph spacing ---- */
  function spacingItems() {
    const engine = editor(), id = engine?.model.styles.defaultParagraph;
    return [...(base.paragraphSpacingItems?.() || []), { separator: true },
      { label: 'Custom Paragraph Spacing…', disabled: !ready() || !id, onSelect: customSpacing }];
  }
  function customSpacing() {
    const engine = ready(), id = engine?.model.styles.defaultParagraph;
    if (!engine || !id) return;
    engine.finishComposition();
    const spacing = engine.model.styles.definitions[id]?.properties?.spacing || {}, defaults = engine.model.styles.defaults.properties?.spacing || {};
    const value = key => Number(spacing[key] ?? defaults[key] ?? 0);
    openParagraphSpacing({ before: value('before') / 20, after: value('after') / 20, line: (spacing.lineRule ?? defaults.lineRule ?? 'auto') === 'auto' ? value('line') / 240 || 1 : 1,
      apply: ({ before, after, line }) => {
        const target = ready(); if (!target) return false;
        const ok = target.editParagraphStyle(id, { paragraph: { spaceBefore: before, spaceAfter: after, lineSpacing: line, lineRule: 'auto' } });
        queueMicrotask(() => target.focus());
        return ok !== false;
      } });
  }

  /* ---- Set as Default ---- */
  async function setAsDefault() {
    await loading;
    const blob = base.exportPackage?.(); if (!blob) return;
    const has = !!loadSaved('defaults', null);
    const ok = await confirmDialog({ title: '设为默认值', danger: false, confirmLabel: '设为默认值',
      message: `新建文档将以此文档的主题和样式集作为默认设置${has ? '，覆盖之前设置的默认值' : ''}。现有文档不会被更改。` });
    if (!ok) return;
    try {
      const parts = await api.blobParts(blob);
      if (!storeSaved('defaults', { themeXml: api.themePartXml(parts), styleSet: api.captureStyleSet(parts) })) throw new Error('此浏览器未能保存默认设置。');
      toast('新建文档将使用此主题和样式集', { icon: 'check' });
    } catch (e) { error(e); }
  }
  /** A new blank package with the saved defaults applied and opened, or null without defaults. */
  async function newDocumentDefaults(blank, openCanvasDocument) {
    const defaults = loadSaved('defaults', null);
    if (!defaults?.styleSet && !defaults?.themeXml) return null;
    try {
      await loading;
      const parts = await api.blobParts(blank.export());
      if (defaults.themeXml) api.applyDesignTheme(parts, { xml: defaults.themeXml });
      if (api.appAuthoredStyles(parts) || defaults.themeXml) api.linkStylesToTheme(parts);
      if (defaults.styleSet) api.applyStyleSetParts(parts, { snippets: defaults.styleSet });
      api.refreshStyleThemeColors(parts);
      const opened = await openCanvasDocument(api.partsBlob(parts));
      if (opened.pkg.readOnly) { for (const image of opened.images.values()) image.close(); return null; }
      return opened;
    } catch { return null; }
  }

  /* ---- Watermark ---- */
  const setWatermark = watermark => edit((parts, a) => { a.setWatermarkParts(parts, watermark); }, watermark ? 'Watermark' : 'Remove Watermark');
  function watermarkItems() {
    const enabled = editable(), now = current().watermark;
    const grid = el('div.menu-custom-grid.design-grid.design-watermark-grid', { role: 'group', dataset: { columns: '3' } },
      ...WATERMARK_PRESETS.map(preset => el('button.swatch.design-card.design-watermark-card', { type: 'button', role: 'menuitemradio', tabindex: -1, disabled: !enabled,
        'aria-checked': String(now?.kind === 'text' && now.text === preset.text && now.layout === preset.layout), 'aria-label': `${preset.text}, ${preset.layout}`, title: `${preset.text} (${preset.layout})`,
        onclick: choose(() => setWatermark({ kind: 'text', text: preset.text, font: null, size: 'auto', color: 'C0C0C0', semitransparent: true, layout: preset.layout, language: 'zh-CN' })) },
      el('span.design-watermark-page', { 'aria-hidden': 'true' }, el(`span.design-watermark-text.is-${preset.layout}`, {}, preset.text)),
      el('span.design-card-name', {}, preset.text.toLowerCase().replace(/^\w/, ch => ch.toUpperCase()) + (preset.layout === 'diagonal' ? ' 1' : ' 2')))));
    return [{ header: '免责声明与状态' }, { custom: grid }, { separator: true },
      { label: '自定义水印…', disabled: !enabled, onSelect: customWatermark },
      { label: '删除水印', disabled: !enabled || !now, onSelect: () => setWatermark(null) }];
  }
  async function customWatermark() {
    await loading;
    if (!editable()) return;
    openCustomWatermark({ current: current().watermark, onClose: refocus, apply: watermark => setWatermark(watermark) });
  }

  /* ---- Page color and borders ---- */
  const pageSize = () => { const page = editor()?.layout?.pages?.[0]; return { width: page?.width || 816, height: page?.height || 1056 }; };
  function pageColorItems() {
    const enabled = editable(), fill = current().fill;
    return [...(base.pageColorItems?.() || []).map(item => item.onSelect && fill ? { ...item, checked: false } : item), { separator: true },
      { label: '其他颜色…', disabled: !ready(), onSelect: moreColors },
      { label: '填充效果…', icon: 'fillEffects', disabled: !enabled, onSelect: fillEffects },
      ...(fill ? [{ label: '删除填充效果', disabled: !enabled, onSelect: () => edit((parts, a) => a.setPageFillParts(parts, null), '删除填充效果') }] : [])];
  }
  function moreColors() {
    const engine = ready(); if (!engine) return;
    const now = engine.model.pageSettings.background;
    openPageColor({ value: now === 'auto' ? 'FFFFFF' : now, apply: color => {
      const target = ready(); if (!target) return false;
      try { target.setPageSettings({ background: color }); } catch (e) { error(e); return false; }
      target.focus(); return true;
    } });
  }
  async function fillEffects() {
    await loading;
    openFillEffects({ page: pageSize(), onClose: refocus, apply: async effect => {
      const { renderFill } = await import('./page-fill-effects.js');
      const fill = await renderFill(effect, pageSize());
      const color = editor()?.model.pageSettings.background;
      return edit((parts, a) => a.setPageFillParts(parts, { ...fill, color: color && color !== 'auto' ? color : 'FFFFFF' }), 'Fill Effect');
    } });
  }
  function pageBorderItems() {
    return [...(base.pageBorderItems?.() || []), { separator: true },
      { label: '边框和底纹选项…', disabled: !ready() || !base.bordersAndShading, onSelect: () => base.bordersAndShading?.('page') }];
  }

  const commands = {
    themeItems, colorItems: colorItems, themeFontItems: fontItems, effectItems, styleSetItems, watermarkItems, designPageColorItems: pageColorItems,
    applyTheme: name => themeChange({ theme: resolvedTheme(name) }), applyStyleSet: name => { const set = STYLE_SETS.find(s => s.name === name); return set && applyStyleSet(set); },
    setWatermark, customWatermark, fillEffects, setAsDefault, newDocumentDefaults, designState: () => current(),
  };

  /** Ribbon groups for a tab (see canvas-chrome.js: after / replaces). */
  function extendTab(tabId, kit) {
    if (tabId !== 'design') return [];
    const { menuButton, command, rows, when, engineReady } = kit;
    const themes = menuButton('主题', 'themes', themeItems, { text: '主题' });
    const colors = menuButton('主题颜色', 'themeColors', colorItems, { text: '颜色' });
    const fonts = menuButton('主题字体', 'themeFonts', fontItems, { text: '字体' });
    const spacing = menuButton('段落间距', 'paragraphSpacing', spacingItems, { size: 'small', text: '段落间距' });
    const effects = menuButton('主题效果', 'effects', effectItems, { size: 'small', text: '效果' });
    const setDefault = command('设为默认值', 'setDefault', setAsDefault, { text: '设为默认值' });
    const more = command('更多样式集', 'more', e => openMenu({ anchor: more, label: '样式集', minWidth: 300, pointer: !!e?.detail, onClose: e?.detail ? () => editor()?.focus() : null, items: kit.inDocument(styleSetItems()) }));
    more.classList.add('ribbon-gallery-more'); more.setAttribute('aria-haspopup', 'menu');
    more.addEventListener('mousedown', e => e.preventDefault());
    for (const control of [themes, colors, fonts, effects]) when(control, () => engineReady() && editable());
    when(spacing, () => engineReady() && !!base.paragraphSpacingItems);
    when(setDefault, () => !!editor() && !!pkg() && !pkg().readOnly);
    when(more, () => { refreshGallery(); return engineReady() && editable(); });
    const watermark = menuButton('水印', 'watermark', watermarkItems, { text: '水印' });
    const pageColor = menuButton('页面颜色', 'pageColor', pageColorItems, { text: '页面颜色' });
    const pageBorders = menuButton('页面边框', 'pageBorders', pageBorderItems, { text: '页面边框' });
    when(watermark, () => engineReady() && editable());
    when(pageColor, () => !!base.pageColorItems && engineReady());
    when(pageBorders, () => !!base.pageBorderItems && engineReady());
    refreshGallery();
    return [
      { id: 'formatting', replaces: 'formatting', label: '文档格式', icon: 'themes', priority: 6,
        items: [themes, el('div.ribbon-gallery-frame', {}, gallery, more), colors, fonts, rows([spacing], [effects], [setDefault])] },
      { id: 'background', replaces: 'background', label: '页面背景', icon: 'pageColor', priority: 5, items: [watermark, pageColor, pageBorders] },
    ];
  }
  /** Items for the menu bar's menus. */
  function extendMenu(menuId) {
    if (menuId === 'insert') return [{ label: '水印…', icon: 'watermark', disabled: !editable(), onSelect: customWatermark }];
    if (menuId === 'format') return [
      { label: '主题', icon: 'themes', disabled: !editable(), items: themeItems() },
      { label: '背景', icon: 'pageColor', disabled: !editable(), items: [...pageColorItems(), { separator: true }, { label: '水印…', icon: 'watermark', onSelect: customWatermark }] },
    ];
    return [];
  }
  function contextMenuItems() { return []; }
  return { commands, extendTab, extendMenu, contextMenuItems, destroy() {} };
}
