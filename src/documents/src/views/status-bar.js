import { el, MOD_KEY, isComposing, keepDocumentFocus } from '../ui/dom.js';
import { openMenu } from '../ui/menu.js';
import { openModal } from '../ui/modal.js';
import { commandIconEl } from '../ui/ribbon.js';
import { localStore } from '../lib/storage.js';
import { DOCUMENT_VIEWS } from './classic-menus.js';
import { LANGUAGES } from './review-ui.js';

const STORE = 'documents:statusbar';

/** "English (United States)" for "en-US", in the user's language. */
export function languageName(tag, locale = 'zh-CN') {
  if (!tag) return '无语言';
  try { return new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'language', languageDisplay: 'standard' }).of(tag) || tag; } catch { return tag; }
}

export const STATUS_ITEMS = [
  ['page', '页码'], ['words', '字数统计'], ['proofing', '拼写检查'], ['language', '语言'], ['accessibility', '无障碍检查器'], ['track', '修订状态'],
  ['area', '编辑区域'], ['textMode', '纯文本模式'], ['focus', '专注模式'], ['views', '视图快捷方式'], ['zoomSlider', '缩放滑块'], ['zoom', '显示比例'],
];
const HIDDEN_BY_DEFAULT = ['track'];

function readHidden() {
  try { const value = JSON.parse(localStore()?.getItem(STORE) || 'null'); return Array.isArray(value) ? value : HIDDEN_BY_DEFAULT; } catch { return HIDDEN_BY_DEFAULT; }
}

/**
 * The status bar: page and word counts (each opens its dialog), spelling, the language of the
 * selection, Track Changes, the editing area, and on the right Text mode, Focus, the views and the zoom.
 * Right-click it to choose what it shows; the choice is remembered on this device.
 */
export function createStatusBar({ w, a, parts, help }) {
  const { stats, words, proofingButton, editingArea, textMode, focusButton, zoomOut, zoomSlider, zoomIn, zoomLabel } = parts;
  stats.className = ''; // its button carries the status-item look
  const pageButton = el('button.ed-status-item.ed-page-count', { type: 'button', title: `转到 (${MOD_KEY === 'Cmd' ? 'Cmd+Option+G' : 'Ctrl+G'})`, onclick: () => (w.goTo ? w.goTo() : a.toggleNavigation?.()) }, stats);
  const wordsButton = el('button.ed-status-item.ed-word-count', { type: 'button', title: '字数统计', onclick: () => w.wordCount?.() }, words);
  const languageLabel = el('span', {}, languageName('zh-CN'));
  const language = el('button.ed-status-item.ed-status-language', { type: 'button', title: '语言', 'aria-haspopup': 'dialog', onclick: () => openLanguageDialog() }, languageLabel);
  const accessibilityLabel = el('span', {}, '无障碍');
  const accessibility = w.accessibilitySummary ? el('button.ed-status-item.ed-status-accessibility', { type: 'button', title: '检查无障碍',
    onclick: () => (w.accessibilitySummary()?.open ? w.accessibilitySummary().open() : w.checkAccessibility?.()) }, commandIconEl('accessibility', 14), accessibilityLabel) : null;
  const trackLabel = el('span', {}, '修订: 关');
  const track = w.toggleTracking ? el('button.ed-status-item.ed-status-track', { type: 'button', title: `修订 (${MOD_KEY}+Shift+E)`, onclick: () => w.toggleTracking() }, commandIconEl('trackChanges', 14), trackLabel) : null;
  const views = el('div.ed-status-views', { role: 'group', 'aria-label': '视图' });
  let viewSignature = '';
  function renderViews() {
    const modes = w.documentViewModes?.() || ['print'];
    const current = w.documentView?.() || 'print';
    const signature = JSON.stringify([modes, current]);
    if (signature === viewSignature) return;
    viewSignature = signature;
    views.replaceChildren(...DOCUMENT_VIEWS.filter(([mode]) => mode === 'print' || modes.includes(mode)).map(([mode, label, icon]) => {
      const button = el('button.icon-btn.ed-status-view', { type: 'button', 'aria-label': label, title: label, 'aria-pressed': String(current === mode),
        onclick: () => (w.setDocumentView ? w.setDocumentView(mode) : a.focusEditor?.()) }, commandIconEl(mode === 'print' ? 'printLayoutSolid' : icon, 16));
      return button;
    }));
  }
  const items = {
    page: pageButton, words: wordsButton, proofing: proofingButton, language, accessibility, track, area: editingArea,
    textMode, focus: focusButton, views, zoomSlider: el('div.ed-zoom-slider-wrap', {}, zoomOut, zoomSlider, zoomIn), zoom: zoomLabel,
  };
  for (const [id, node] of Object.entries(items)) node?.setAttribute('data-status-item', id);
  let hidden = new Set(readHidden());
  const left = el('div.ed-status-left', {}, ...['page', 'words', 'proofing', 'language', 'accessibility', 'track', 'area'].map(id => items[id]).filter(Boolean));
  const right = el('div.ed-status-right', {}, items.textMode, items.focus, items.views, el('div.ed-zoom', {}, items.zoomSlider, items.zoom));
  const footer = el('footer.canvas-statusbar.ed-statusbar', { 'aria-label': '状态栏' }, left, right, help);
  // Its buttons (the zoom steps, the counts, a right-click for the menu) leave the keyboard in the document.
  keepDocumentFocus(footer, { buttons: true });
  footer.addEventListener('contextmenu', e => {
    if (e.target.closest('input, select')) return;
    e.preventDefault();
    // The ContextMenu key (Chrome reports no button, -1) starts on the first item; a right-click on none.
    openMenu({ anchor: footer, x: e.clientX, y: e.clientY, label: '自定义状态栏', minWidth: 230, pointer: e.button !== -1, items: [
      { header: '在状态栏显示' },
      ...STATUS_ITEMS.filter(([id]) => items[id]).map(([id, label]) => ({ label, checked: !hidden.has(id), onSelect: () => toggle(id) })),
    ] });
  });
  function toggle(id) {
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    try { localStore()?.setItem(STORE, JSON.stringify([...hidden])); } catch { /* storage unavailable */ }
    apply();
  }
  // Track Changes shows itself while tracking is on; choosing it in the menu keeps it shown when off too.
  function apply() { for (const [id, node] of Object.entries(items)) if (node) node.classList.toggle('is-user-hidden', hidden.has(id) && !(id === 'track' && w.isTracking?.())); }
  apply();

  /** The proofing language for the selection (w:lang); with the engine's support it is written to the document. */
  function openLanguageDialog() {
    const current = w.currentLanguage?.() ?? 'zh-CN';
    const list = el('div.ed-choice-list.ed-language-list', { role: 'listbox', 'aria-label': '语言' });
    const filter = el('input.input', { type: 'search', placeholder: '搜索语言', 'aria-label': '搜索语言' });
    const noProof = el('input', { type: 'checkbox', checked: !!w.noProofing?.() });
    const tags = [...new Set([current, ...LANGUAGES].filter(Boolean))];
    let chosen = current;
    // The list is one Tab stop, on the chosen language; Up, Down, Home and End move the choice.
    const options = () => [...list.querySelectorAll('[role="option"]')];
    const mark = () => {
      const all = options(), stop = all.find(o => o.dataset.tag === chosen) || all[0];
      for (const o of all) { o.setAttribute('aria-selected', String(o.dataset.tag === chosen)); o.tabIndex = o === stop ? 0 : -1; }
      return stop;
    };
    const render = () => {
      const q = filter.value.trim().toLowerCase();
      const shown = tags.filter(tag => !q || languageName(tag).toLowerCase().includes(q) || tag.toLowerCase().includes(q));
      // A filter that hides the chosen language chooses the first it shows: Enter applies what is on screen.
      if (q && shown.length && !shown.includes(chosen)) chosen = shown[0];
      list.replaceChildren(...shown.map(tag => el('button.ed-choice', { type: 'button', role: 'option', dataset: { tag },
        onclick: () => { chosen = tag; mark(); }, ondblclick: () => apply() }, languageName(tag), el('span.ed-choice-hint', {}, tag))));
      // A filter that shows no language leaves nothing to apply: OK waits for one on screen, rather than applying
      // one an earlier letter of the filter happened to show.
      empty.hidden = shown.length > 0;
      ok.disabled = !editable || !shown.length;
      mark();
    };
    list.addEventListener('keydown', e => {
      if (isComposing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
      const all = options(), at = all.indexOf(document.activeElement);
      // Enter on a language is OK, as in a list in a desktop dialog: the option is a button, which would only choose it.
      if (e.key === 'Enter' && at >= 0 && !e.shiftKey) { e.preventDefault(); chosen = all[at].dataset.tag; mark(); list.closest('form')?.requestSubmit(); return; }
      const next = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key];
      if (next === undefined || at < 0) return;
      e.preventDefault();
      const option = all[Math.max(0, Math.min(all.length - 1, next))];
      option.click(); option.focus();
    });
    filter.addEventListener('input', render);
    filter.addEventListener('keydown', e => { if (e.key === 'ArrowDown' && !isComposing(e)) { e.preventDefault(); mark()?.focus(); } });
    const editable = !!w.setLanguage && !!a.hasDocument?.() && !w.documentReadOnly?.();
    const empty = el('p.field-hint', { role: 'status', hidden: true }, '未找到匹配的语言。');
    const ok = el('button.btn.btn-primary', { type: 'submit', disabled: !editable }, '确定');
    const apply = () => { modal.close(); w.setLanguage?.(chosen, { noProof: noProof.checked }); };
    const modal = openModal({ title: '语言', onClose: () => queueMicrotask(() => a.focusEditor?.()), content: el('form.ed-dialog-body', { onsubmit: e => { e.preventDefault(); if (ok.disabled && editable) return; if (editable) apply(); else modal.close(); } },
      el('p.field-hint', {}, editable ? '将所选文字标记为：' : '光标处文字的语言：'), filter, list, empty,
      el('label.ed-check', {}, noProof, '不检查拼写或语法'),
      el('p.field-hint', {}, '拼写检查适用于英文文本。其他语言会在文档中标记，以便其他编辑器使用其词典进行检查。'),
      el('div.modal-actions', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), ok)) });
    noProof.disabled = !editable;
    render();
    filter.focus();
  }

  function refresh() {
    if (accessibility) {
      const summary = a.hasDocument?.() ? w.accessibilitySummary() : null;
      const label = summary?.label || '无障碍: 检查';
      if (accessibilityLabel.textContent !== label) { accessibilityLabel.textContent = label; accessibility.title = summary ? `${label.replace(/…$/, '')}。打开无障碍窗格。` : '检查无障碍'; }
      accessibility.dataset.state = !summary ? 'unchecked' : summary.checking ? 'checking' : summary.errors ? 'errors' : summary.warnings || summary.tips ? 'warnings' : 'clean';
      accessibility.disabled = !a.hasDocument?.();
    }
    const tag = w.currentLanguage?.();
    const name = tag === null ? '多种语言' : languageName(tag || 'zh-CN');
    if (languageLabel.textContent !== name) { languageLabel.textContent = name; language.title = `语言: ${name}`; }
    if (track) { const on = !!w.isTracking?.(); trackLabel.textContent = `修订: ${on ? '开' : '关'}`; track.setAttribute('aria-pressed', String(on)); track.disabled = !w.canTrack?.(); apply(); }
    pageButton.disabled = wordsButton.disabled = !a.hasDocument?.();
    renderViews();
  }
  return { el: footer, refresh, openLanguageDialog, isShown: id => !hidden.has(id), toggle };
}
