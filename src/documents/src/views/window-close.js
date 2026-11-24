import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { session } from '../lib/session.js';
import * as P from '../lib/puter.js';

/**
 * The Puter desktop window's close button, which waits for this (lib/puter.js onWindowClose). Edits the
 * autosave has not written yet are written first, and a save that cannot go through asks, as leaving the
 * document for another screen does. A document that was never saved has nowhere to go without the user:
 * inside the Puter desktop it waits for a first Save to ask where (lib/doc.js), so closing asks whether to
 * save it, as a desktop app does. Without this the window went at once, and a new document with it.
 */

export const CLOSE_TITLE = '关闭前保存？';
export const SAVE_CHANGES_TITLE = '是否保存更改？';

/**
 * Whether leaving the document has to ask about its changes first: with AutoSave off only Save writes the file,
 * so leaving must not write the changes on its own (the user may mean to throw them away), nor drop them unasked.
 * A document waiting for a first Save to ask where it goes, one someone else saves, and one without a session (the
 * sign-in question covers it) are asked about elsewhere.
 */
export function asksToSave(doc) {
  return !!doc && !doc.autosave && doc.dirty && !!doc.exporter && doc.writes !== false && !doc._deleted && !doc.waitsForPlace && !session.signedOut;
}

/** The question about changes AutoSave is not writing: 'save', 'discard', or 'stay'. */
export function saveChangesDialog(doc) {
  return new Promise((resolve) => {
    const content = el('div', {},
      el('p.modal-text', {}, `自动保存已关闭，您对“${doc.name}”的更改尚未保存。离开前是否保存？`),
      el('div.row.row-end', { style: { flexWrap: 'wrap' } },
        el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'),
        el('button.btn.btn-danger', { type: 'button', onclick: () => { resolve('discard'); modal.close(); } }, '不保存'),
        el('button.btn.btn-primary', { type: 'button', onclick: () => { resolve('save'); modal.close(); } }, '保存')));
    const modal = openModal({ title: SAVE_CHANGES_TITLE, content, onClose: () => resolve('stay') });
  });
}

/** The question about a never-saved document: 'save', 'close' (and lose it), or 'stay'. */
export function closeDialog(doc) {
  return new Promise((resolve) => {
    const content = el('div', {},
      // A template or other file opened from the drive stays as it is: only the edits, which go to a new .docx, are at stake.
      el('p.modal-text', {}, doc.path
        ? `您对“${P.displayName(doc.path)}”的更改尚未保存。另存为新文档以选择存储位置，或者不保存直接关闭（更改将丢失）。`
        : `“${doc.name}”尚未保存。保存以选择存储位置，或者不保存直接关闭（内容将丢失）。`),
      el('div.row.row-end', { style: { flexWrap: 'wrap' } },
        el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'),
        el('button.btn.btn-danger', { type: 'button', onclick: () => { resolve('close'); modal.close(); } }, '不保存直接关闭'),
        el('button.btn.btn-primary', { type: 'button', onclick: () => { resolve('save'); modal.close(); } }, '保存…')));
    const modal = openModal({ title: CLOSE_TITLE, content, onClose: () => resolve('stay') });
  });
}

/**
 * Whether the window may close now. `open()` is the screen on show ({ kind, view }); `leaveDialog(doc, options)`
 * asks about edits that could not be written ('stay', 'leave' or 'sign-in'). A screen that changes while a
 * question is up is the user's answer: the window stays.
 */
export async function readyToClose({ open, leaveDialog }) {
  const shown = open();
  if (shown?.kind !== 'editor') return true;
  const { view } = shown, doc = view.doc;
  const still = () => open() === shown;
  view.engine?.finishComposition?.();
  if (asksToSave(doc)) {
    const choice = await saveChangesDialog(doc);
    if (!still() || choice === 'stay') return false;
    if (choice === 'discard') return true;
  }
  if (doc.waitsForPlace) {
    const choice = await closeDialog(doc);
    if (!still() || choice === 'stay') return false;
    if (choice === 'close') return true;
    // Save…: Puter's Save dialog. Cancelling it keeps the window open, with the document as it was.
    try {
      view.engine?.finishComposition?.();
      if (!await doc.save()) return false;
    } catch (e) {
      toast(e?.message || String(e), { icon: 'alert', duration: 8000 });
      return false;
    }
    if (!still()) return false;
  }
  for (;;) {
    if (await view.flush()) return true;
    if (!still()) return false;
    const choice = await leaveDialog(doc, { unsaveable: !!view.unsaveable, undelivered: !!view.undelivered });
    if (!still() || choice === 'stay') return false;
    if (choice === 'leave') return true;
    // 'sign-in': with a session the save can go through; then try again.
    if (!await session.signIn() || !still()) return false;
  }
}

/**
 * The handler for the close button. Pressed again while a question or a save is under way, it changes
 * nothing: the answer to that decides. `asking()`: whether the question about leaving the open document is
 * already on screen for another reason (going to the documents, say); the window waits for that answer too.
 */
export function createCloseWindow({ open, leaveDialog, exit, asking = () => false }) {
  let closing = null;
  return () => {
    if (closing) return closing;
    if (asking()) {
      toast('请先处理打开文档的确认提示', { icon: 'info' });
      return Promise.resolve(false);
    }
    closing = readyToClose({ open, leaveDialog })
      .then((ok) => { if (ok) exit(); return ok; }, (e) => { console.error(e); return false; })
      .finally(() => { closing = null; });
    return closing;
  };
}
