/**
 * Global keyboard shortcuts: one document-level listener, active only
 * outside form fields and open dialogs. The set is small and fixed (no
 * rebinding); `?` opens the reference overlay, which is also where the
 * shortcuts are documented.
 */

import { el } from './dom.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { openEntryForm } from './entryform.js';
import { store } from '../lib/store.js';
import { fmtClock } from '../lib/time.js';

const VIEW_KEYS = { 1: '#/', 2: '#/timesheet', 3: '#/reports', 4: '#/projects' };

export function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.repeat) return;
    // Never shadow browser/OS shortcuts, typing, or an open dialog
    // (dialogs own the keyboard; Escape already closes them).
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (overlayOpen() || inField(e.target)) return;

    const k = e.key;
    if (k === 's' || k === 'S') {
      e.preventDefault();
      toggleTimer();
    } else if (k === 'n' || k === 'N') {
      e.preventDefault();
      openEntryForm();
    } else if (k === '/') {
      e.preventDefault();
      openSearch();
    } else if (k === '?') {
      e.preventDefault();
      openHelp();
    } else if (k === 'ArrowLeft') {
      if (clickTimesheet('[aria-label^="上一"]')) e.preventDefault();
    } else if (k === 'ArrowRight') {
      if (clickTimesheet('[aria-label^="下一"]')) e.preventDefault();
    } else if (k === 't' || k === 'T') {
      if (clickToday()) e.preventDefault();
    } else if (VIEW_KEYS[k]) {
      e.preventDefault();
      location.hash = VIEW_KEYS[k];
    }
  });
}

function inField(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
}

/** A dialog or the full-screen invoice page: both own the keyboard. */
function overlayOpen() {
  return !!document.querySelector('.modal-root:not(.closing), .invoice-view');
}

function currentRoute() {
  return (location.hash || '#/').split('?')[0];
}

/** Run `fn` on `hash`'s view, switching to it first when needed. */
function afterRoute(hash, fn) {
  if (currentRoute() === hash) {
    fn();
    return;
  }
  location.hash = hash;
  // hashchange dispatches in a later task; the view renders synchronously
  // inside its handler, so one short beat is enough.
  setTimeout(fn, 60);
}

/** S: stop the running timer, or start one from the Timer view's form. */
async function toggleTimer() {
  if (store.running) {
    try {
      const entry = await store.stopTimer();
      toast(`已记录 ${fmtClock(entry.seconds)}`, { icon: 'check' });
    } catch (err) {
      console.error(err);
      toast('无法停止，请检查网络连接', { icon: 'wifiOff' });
    }
    return;
  }
  // Submitting the idle form reuses its own validation ("Pick a project
  // first") instead of duplicating that logic here.
  afterRoute('#/', () => document.querySelector('.timer-card form')?.requestSubmit());
}

/** /: open (or refocus) search on the Timesheet. */
function openSearch() {
  afterRoute('#/timesheet', () => {
    const btn = document.querySelector('button[aria-label="搜索记录"]');
    if (btn?.getAttribute('aria-pressed') === 'false') btn.click();
    else document.querySelector('.search-input')?.focus();
  });
}

/** Arrows page the Timesheet range; inert anywhere else (returns false). */
function clickTimesheet(selector) {
  if (currentRoute() !== '#/timesheet') return false;
  const btn = document.querySelector(selector);
  if (!btn || btn.hidden) return false; // search mode hides range nav
  btn.click();
  return true;
}

function clickToday() {
  if (currentRoute() !== '#/timesheet') return false;
  const btn = [...document.querySelectorAll('.week-nav button')]
    .find((b) => b.textContent.trim() === '今天');
  if (!btn || btn.hidden) return false;
  btn.click();
  return true;
}

function openHelp() {
  const rows = [
    [['S'], '启动或停止计时器'],
    [['N'], '手动记录工时'],
    [['/'], '搜索工时表'],
    [['←', '→'], '上一周 / 月或下一周 / 月'],
    [['T'], '跳转到今天'],
    [['1', '4'], '计时器、工时表、报表、项目', ' 至 '],
    [['Esc'], '关闭对话框'],
    [['?'], '显示此快捷键说明'],
  ];
  openModal({
    title: '键盘快捷键',
    content: el('div.shortcut-list', {}, rows.map(([keys, what, sep]) =>
      el('div.shortcut-row', {},
        el('span.shortcut-what', {}, what),
        el('span.shortcut-keys', {},
          keys.flatMap((key, i) => [i > 0 && (sep ?? ' '), el('kbd.kbd', {}, key)]))
      ))),
  });
}
