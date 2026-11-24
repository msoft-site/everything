/**
 * Find and replace, driven by the shared search session (`ui.search`).
 * The bar owns only its inputs; match counts, the active index, and whether
 * replace is allowed all come from the controller's snapshot.
 */

import { el, debounce, isComposing } from './dom.js';
import { icon } from './icons.js';

/** Whether `pattern` compiles as the engine compiles it (a JavaScript regular expression without the u flag). */
export function validPattern(pattern) {
  try { new RegExp(pattern); return true; } catch { return false; }
}

/** The engine stops counting matches here; a count at the cap is a floor, not a total. */
export const MATCH_CAP = 1000;

export function matchLabel(snap) {
  if (!snap?.query) return '';
  // The engine refuses some patterns the bar's own check lets through.
  if (snap.reason === 'search-invalid-pattern') return '无效的模式';
  if (!snap.total) return '无匹配项';
  if (snap.total >= MATCH_CAP) return `${snap.activeIndex + 1} / ${MATCH_CAP.toLocaleString()}+`;
  return `${snap.activeIndex + 1} / ${snap.total}`;
}

export function createFindbar({ focusEditor = () => {}, onToggle = () => {} } = {}) {
  let ui = null;
  let unsub = null;
  let caseSensitive = false;
  let regex = false;
  let replacement = null;

  const query = el('input.input.find-input', { type: 'search', placeholder: '查找', 'aria-label': '查找', autocomplete: 'off', spellcheck: false });
  const replaceInput = el('input.input.find-input', { type: 'text', placeholder: '替换为', 'aria-label': '替换为', autocomplete: 'off', spellcheck: false });
  const count = el('span.find-count', { role: 'status', 'aria-live': 'polite' });
  const prevBtn = el('button.icon-btn', { type: 'button', 'aria-label': '上一个匹配项', html: icon('chevU', 18, 2), onclick: () => moveMatch(true) });
  const nextBtn = el('button.icon-btn', { type: 'button', 'aria-label': '下一个匹配项', html: icon('chevD', 18, 2), onclick: () => moveMatch(false) });
  const caseBtn = el('button.icon-btn', {
    type: 'button', 'aria-label': '区分大小写', 'aria-pressed': 'false', title: '区分大小写', html: icon('caseSensitive', 18, 2),
    onclick: () => { caseSensitive = !caseSensitive; caseBtn.setAttribute('aria-pressed', String(caseSensitive)); run(); },
  });
  // Regular expressions: the engine's search takes a JavaScript pattern.
  const regexBtn = el('button.icon-btn.find-regex', {
    type: 'button', 'aria-label': '使用正则表达式', 'aria-pressed': 'false', title: '正则表达式',
    onclick: () => { regex = !regex; regexBtn.setAttribute('aria-pressed', String(regex)); run(); },
  }, '.*');
  const replaceBtn = el('button.btn.btn-sm', { type: 'button', onclick: () => doReplace(false) }, '替换');
  const replaceAllBtn = el('button.btn.btn-sm', { type: 'button', 'aria-label': '全部替换', title: '替换所有匹配项', onclick: () => doReplace(true) }, '全部');
  const closeBtn = el('button.icon-btn', { type: 'button', 'aria-label': '关闭查找和替换', html: icon('x', 18, 2), onclick: () => close() });

  const root = el('div.findbar', { role: 'search', 'aria-label': '查找和替换', hidden: true },
    el('div.find-row', {}, query, count, prevBtn, nextBtn, caseBtn, regexBtn),
    el('div.find-row', {}, replaceInput, replaceBtn, replaceAllBtn),
    closeBtn);

  const run = () => {
    if (!ui) return;
    const q = query.value;
    if (!q) { ui.search.clear(); render(ui.search.getSnapshot()); return; }
    if (regex && !validPattern(q)) { ui.search.clear(); render({ ...ui.search.getSnapshot(), query: q, total: 0 }); count.textContent = '无效的模式'; return; }
    ui.search.search(q, { caseSensitive, regex });
  };
  const runDebounced = debounce(run, 120);

  query.addEventListener('input', runDebounced);
  query.addEventListener('keydown', (e) => {
    if (isComposing(e)) return;
    if (e.key === 'Enter') { e.preventDefault(); moveMatch(e.shiftKey); }
  });
  replaceInput.addEventListener('keydown', (e) => {
    if (isComposing(e)) return;
    // Enter does what the Replace button would; with nothing to replace it does nothing, like the button.
    if (e.key === 'Enter') { e.preventDefault(); if (!replaceBtn.disabled) doReplace(false); }
  });
  // Escape closes the bar from any of its controls, not only the two fields.
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !isComposing(e)) { e.preventDefault(); close(); }
  });

  function moveMatch(previous) {
    runDebounced.flush();
    if (previous) ui?.search.previous(); else ui?.search.next();
  }

  async function doReplace(all) {
    if (!ui || replacement) return;
    runDebounced.flush();
    const controller = ui;
    const pending = {};
    replacement = pending;
    render(controller.search.getSnapshot());
    let message = '';
    try {
      const r = all ? await controller.search.replaceAll(replaceInput.value) : await controller.search.replace(replaceInput.value);
      if (r?.ok === false) {
        // Replace all is refused beyond the match cap; the reason is not passed on, but the count says so.
        const capped = all && (controller.search.getSnapshot()?.total ?? 0) >= MATCH_CAP;
        message = r.reason === 'document-readonly' ? '只读文档' : capped ? '匹配项过多，无法一次性替换。请缩小搜索范围' : '无法替换';
      }
    } catch {
      message = '无法替换。请重试';
    } finally {
      // Unbinding invalidates outstanding work; it must not repaint another document.
      if (replacement === pending) {
        replacement = null;
        render(controller.search.getSnapshot());
        if (message && !root.hidden) count.textContent = message;
      }
    }
  }

  function render(snap) {
    count.textContent = matchLabel(snap);
    const has = snap.total > 0;
    prevBtn.disabled = !has;
    nextBtn.disabled = !has;
    replaceBtn.disabled = !!replacement || !has || !snap.canReplace;
    replaceAllBtn.disabled = !!replacement || !has || !snap.canReplace;
    root.classList.toggle('no-match', !!snap.query && !snap.total);
  }

  function bind(controller) {
    unbind();
    ui = controller;
    render(ui.search.getSnapshot());
    unsub = ui.search.observe(render);
  }

  function unbind() {
    replacement = null;
    runDebounced.cancel();
    unsub?.();
    unsub = null;
    ui = null;
  }

  function open(initial = '') {
    if (!ui) return;
    const opened = ui.search.open();
    root.hidden = false;
    onToggle(true);
    if (opened && opened.ok === false) count.textContent = '搜索不可用';
    if (initial) query.value = initial;
    query.focus();
    query.select();
    if (query.value) run();
  }

  function close() {
    runDebounced.cancel();
    if (root.hidden) return;
    root.hidden = true;
    onToggle(false);
    ui?.search.close();
    count.textContent = '';
    focusEditor();
  }

  function toggle() {
    if (root.hidden) open(); else close();
  }

  return { el: root, bind, unbind, open, close, toggle, get isOpen() { return !root.hidden; } };
}
