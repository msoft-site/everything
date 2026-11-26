// Note tool and Notes panel: pin text notes (with an author and creation
// time) on the canvas, read and edit them in the panel, step between them,
// and import notes from a JSON or plain-text file. Notes are saved with the
// document and never drawn into pixels.
import type { Editor } from '../../editor';
import type { DocumentSession } from '../../app/session';
import { registerCommand, registerOverlay, registerPanel, registerTool } from '../../app/registry';
import { escapeXML } from '../../model/assets';
import { svg } from '../../app/icons';
import { parseNotes, type DocumentNote } from '../../model/annotations';
import { annotationsOf, editAnnotations, px, shown } from './state';

const selectedNote = new WeakMap<DocumentSession, string>();
type Drag = { id: string; x: number; y: number; dx: number; dy: number; moved: boolean };
let drag: Drag | undefined;
const NOTE_COLORS = ['#ffd60a', '#ff9f0a', '#30d158', '#64d2ff', '#ff6482', '#bf5af2'];

export const notesOf = (e: Editor) => annotationsOf(e.doc).notes ?? [];
/** The color the Note tool gives new notes (its options bar sets it). */
const newNoteColor = (e: Editor) => (NOTE_COLORS.includes(e.settings.noteColor as string) ? (e.settings.noteColor as string) : NOTE_COLORS[0]);
export function currentNote(e: Editor): DocumentNote | undefined {
  const id = selectedNote.get(e.session);
  return notesOf(e).find((n) => n.id === id);
}
export function selectNote(e: Editor, id: string | undefined) {
  if (id) selectedNote.set(e.session, id);
  else selectedNote.delete(e.session);
}
function author() {
  try {
    return localStorage.getItem('photo-studio-note-author') ?? '';
  } catch {
    return '';
  }
}
function setAuthor(v: string) {
  try {
    localStorage.setItem('photo-studio-note-author', v);
  } catch {
    /* Optional. */
  }
}
export function makeNote(x: number, y: number, fields: Partial<DocumentNote> = {}): DocumentNote {
  return { id: crypto.randomUUID(), x, y, author: author(), text: '', color: NOTE_COLORS[0], created: new Date().toISOString(), ...fields };
}

function hit(e: Editor, x: number, y: number): DocumentNote | undefined {
  const s = px(e, 18);
  // Topmost (last placed) note wins.
  return [...notesOf(e)].reverse().find((n) => x >= n.x && x <= n.x + s && y >= n.y && y <= n.y + s);
}
function noteMarkup(e: Editor, n: DocumentNote, selected: boolean) {
  const s = px(e, 18),
    w = px(e, 1),
    f = s * 0.32;
  const x = drag?.id === n.id ? drag.x : n.x,
    y = drag?.id === n.id ? drag.y : n.y;
  // A sheet with a folded corner and three text lines.
  const sheet = `M${x} ${y}H${x + s - f}L${x + s} ${y + f}V${y + s}H${x}Z`;
  const fold = `M${x + s - f} ${y}V${y + f}H${x + s}`;
  const lines = [0.42, 0.6, 0.78].map((t, i) => `M${x + s * 0.2} ${y + s * t}H${x + s * (i === 2 ? 0.6 : 0.8)}`).join('');
  return `<g class="note-marker ${selected ? 'selected' : ''}"><title>${escapeXML(n.author ? `${n.author}: ` : '')}${escapeXML(n.text.slice(0, 200))}</title>${selected ? `<rect x="${x - px(e, 3)}" y="${y - px(e, 3)}" width="${s + px(e, 6)}" height="${s + px(e, 6)}" rx="${px(e, 3)}" class="note-focus" stroke-width="${w * 1.5}"/>` : ''}<path d="${sheet}" fill="${n.color}" stroke="#000" stroke-opacity=".6" stroke-width="${w}"/><path d="${fold}${lines}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="${w}"/></g>`;
}

export function deleteNote(e: Editor, id: string) {
  const list = notesOf(e);
  const i = list.findIndex((n) => n.id === id);
  editAnnotations(e, '删除注释', (a) => (a.notes = (a.notes ?? []).filter((n) => n.id !== id)));
  const next = list[i + 1] ?? list[i - 1];
  selectNote(e, next && next.id !== id ? next.id : undefined);
  e.update();
}
function showPanel(e: Editor, focus = false) {
  if (!e.dock.isVisible('notes')) e.dock.show('notes');
  if (focus) requestAnimationFrame(() => e.root.querySelector<HTMLTextAreaElement>('#note-text')?.focus());
}

export async function importNotes(e: Editor) {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt,application/json,text/plain';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) throw new Error('注释文件大于 8 MB。');
  let notes: DocumentNote[];
  try {
    notes = parseNotes(await file.text(), e.doc.width, e.doc.height, { author: author(), color: NOTE_COLORS[0] });
  } catch (error) {
    throw new Error(`无法从 ${file.name} 读取注释：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!notes.length) {
    e.message(`${file.name} 未包含任何注释。`);
    return;
  }
  const room = 1000 - notesOf(e).length;
  editAnnotations(e, '导入注释', (a) => (a.notes = [...(a.notes ?? []), ...notes.slice(0, Math.max(0, room))]));
  selectNote(e, notes[0].id);
  e.settings.hideNotes = false;
  showPanel(e);
  e.update();
  e.message(`已从 ${file.name} 导入 ${Math.min(room, notes.length)} 个注释。`);
}

function panelHtml(e: Editor) {
  const list = notesOf(e);
  const n = currentNote(e) ?? list[0];
  if (n && !currentNote(e)) selectNote(e, n.id);
  const i = n ? list.indexOf(n) : -1;
  if (!n)
    return `<div class="notes-empty muted"><p>本文档中没有注释。</p><p>选择注释工具 (I) 并在图像上单击以固定注释，或从文件导入注释。</p><button data-command="file.import-notes">导入注释…</button></div>`;
  const when = new Date(n.created);
  return `<div class="notes-nav"><button class="icon-button" data-note-nav="-1" ${i > 0 ? '' : 'disabled'} aria-label="上一个注释" title="上一个注释">${svg('chevron-left', 15)}</button><span class="notes-position">注释 ${i + 1} / ${list.length}</span><button class="icon-button" data-note-nav="1" ${i < list.length - 1 ? '' : 'disabled'} aria-label="下一个注释" title="下一个注释">${svg('chevron-right', 15)}</button><span class="panel-tabs-spacer"></span><button class="icon-button" data-note-action="locate" aria-label="在画布上显示" title="在画布上显示">${svg('crosshair', 15)}</button><button class="icon-button" data-note-action="delete" aria-label="删除注释" title="删除注释">${svg('trash-2', 15)}</button></div><label class="notes-field">作者 <input id="note-author" value="${escapeXML(n.author)}" maxlength="256" spellcheck="false"></label><div class="notes-meta muted">${Number.isNaN(when.getTime()) ? '' : `添加于 ${escapeXML(when.toLocaleString())}`}</div><textarea id="note-text" aria-label="注释文本" placeholder="写下注释…" maxlength="100000">${escapeXML(n.text)}</textarea><div class="notes-colors" role="radiogroup" aria-label="注释颜色">${NOTE_COLORS.map((c) => `<button role="radio" aria-checked="${c === n.color}" data-note-color="${c}" style="--swatch:${c}" aria-label="颜色 ${c}"></button>`).join('')}</div>`;
}

export function installNotes(_e: Editor) {
  registerOverlay('notes', (e) => {
    if (!e.hasDocument || !shown(e, 'hideNotes')) return '';
    const sel = currentNote(e)?.id;
    return notesOf(e).map((n) => noteMarkup(e, n, n.id === sel && e.tool === 'note')).join('');
  });
  registerTool({
    id: 'note',
    label: '注释工具',
    key: 'I',
    icon: 'note',
    group: 'eyedropper',
    cursor: () => 'copy',
    options: (e) =>
      `<label>作者 <input id="note-tool-author" value="${escapeXML(author())}" placeholder="你的姓名" maxlength="256" spellcheck="false" style="width:140px"></label><span class="notes-colors note-tool-colors" role="radiogroup" aria-label="新注释颜色">${NOTE_COLORS.map((c, i) => `<button type="button" role="radio" aria-checked="${c === newNoteColor(e)}" tabindex="${c === newNoteColor(e) ? 0 : -1}" data-new-note-color="${c}" style="--swatch:${c}" aria-label="注释颜色 ${i + 1}" title="新注释颜色"></button>`).join('')}</span><span class="divider"></span><button data-command="notes.clear" ${notesOf(e).length ? '' : 'disabled'}>全部清除</button><button data-command="window.panel.notes">注释面板</button>`,
    bindOptions: ({ e, el }) => {
      el.querySelector<HTMLInputElement>('#note-tool-author')?.addEventListener('change', (ev) => setAuthor((ev.target as HTMLInputElement).value.trim()));
      const swatches = [...el.querySelectorAll<HTMLButtonElement>('[data-new-note-color]')];
      const choose = (b: HTMLButtonElement) => {
        e.settings.noteColor = b.dataset.newNoteColor;
        e.options();
        el.querySelector<HTMLElement>(`[data-new-note-color="${b.dataset.newNoteColor}"]`)?.focus();
      };
      for (const b of swatches) {
        b.addEventListener('click', () => choose(b));
        // Arrow keys move through the colors, as in a radio group.
        b.addEventListener('keydown', (ev) => {
          const step = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
          if (!step) return;
          ev.preventDefault();
          ev.stopPropagation();
          choose(swatches[(swatches.indexOf(b) + step + swatches.length) % swatches.length]);
        });
      }
    },
    pointerDown: (e, p) => {
      const n = hit(e, p.x, p.y);
      if (n && p.alt) {
        deleteNote(e, n.id);
        return;
      }
      if (n) {
        selectNote(e, n.id);
        drag = { id: n.id, x: n.x, y: n.y, dx: p.x - n.x, dy: p.y - n.y, moved: false };
        showPanel(e);
        e.update();
        return;
      }
      if (p.alt || p.x < 0 || p.y < 0 || p.x >= e.doc.width || p.y >= e.doc.height) return;
      if (notesOf(e).length >= 1000) {
        e.message('本文档最多可容纳 1000 个注释。');
        return;
      }
      const note = makeNote(Math.round(p.x), Math.round(p.y), { color: newNoteColor(e) });
      editAnnotations(e, '添加注释', (a) => (a.notes = [...(a.notes ?? []), note]));
      selectNote(e, note.id);
      e.settings.hideNotes = false;
      showPanel(e, true);
      e.update();
    },
    pointerMove: (e, p) => {
      if (!drag) return;
      drag.x = Math.round(p.x - drag.dx);
      drag.y = Math.round(p.y - drag.dy);
      drag.moved = true;
      e.overlay();
    },
    pointerUp: (e) => {
      const d = drag;
      drag = undefined;
      if (!d?.moved) return;
      const x = Math.max(0, Math.min(e.doc.width - 1, d.x)),
        y = Math.max(0, Math.min(e.doc.height - 1, d.y));
      editAnnotations(e, '移动注释', (a) => (a.notes = (a.notes ?? []).map((n) => (n.id === d.id ? { ...n, x, y } : n))));
    },
    keyDown: (e, ev) => {
      const n = currentNote(e);
      if (n && (ev.key === 'Backspace' || ev.key === 'Delete')) {
        deleteNote(e, n.id);
        return true;
      }
      return false;
    },
  });

  registerPanel({
    id: 'notes',
    title: '注释',
    icon: 'sticky-note',
    location: 'strip',
    hidden: true,
    mount: (e, el) => {
      el.classList.add('notes-panel');
      const edit = (label: string, patch: (n: DocumentNote) => Partial<DocumentNote>) => {
        const n = currentNote(e);
        if (!n) return;
        const next = { ...n, ...patch(n) };
        if (JSON.stringify(next) === JSON.stringify(n)) return;
        editAnnotations(e, label, (a) => (a.notes = (a.notes ?? []).map((x) => (x.id === n.id ? next : x))));
      };
      el.addEventListener('change', (ev) => {
        const t = ev.target as HTMLElement;
        if (t.id === 'note-text') edit('编辑注释', () => ({ text: (t as HTMLTextAreaElement).value }));
        if (t.id === 'note-author') edit('编辑注释作者', () => ({ author: (t as HTMLInputElement).value.trim() }));
      });
      el.addEventListener('click', (ev) => {
        const t = ev.target as HTMLElement;
        const nav = t.closest<HTMLElement>('[data-note-nav]');
        const list = notesOf(e);
        const n = currentNote(e);
        if (nav && n) {
          const next = list[list.indexOf(n) + Number(nav.dataset.noteNav)];
          if (next) {
            selectNote(e, next.id);
            reveal(e, next);
          }
          return;
        }
        const color = t.closest<HTMLElement>('[data-note-color]');
        if (color) edit('注释颜色', () => ({ color: color.dataset.noteColor! }));
        const action = t.closest<HTMLElement>('[data-note-action]')?.dataset.noteAction;
        if (action === 'delete' && n) deleteNote(e, n.id);
        if (action === 'locate' && n) reveal(e, n);
      });
    },
    update: (e, el) => {
      const list = notesOf(e);
      const n = currentNote(e) ?? list[0];
      // Keep typing undisturbed: while a field of the shown note has focus,
      // only the position readout changes.
      if (n && el.dataset.noteId === n.id && el.contains(document.activeElement)) {
        const pos = el.querySelector('.notes-position');
        if (pos) pos.textContent = `注释 ${list.indexOf(n) + 1} / ${list.length}`;
        return;
      }
      const key = JSON.stringify([n, list.length, n ? list.indexOf(n) : -1]);
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      el.dataset.noteId = n?.id ?? '';
      el.innerHTML = panelHtml(e);
    },
    menu: () => ['file.import-notes', '-', 'notes.clear', '-', 'view.show-notes'],
  });

  registerCommand(
    {
      id: 'notes.clear',
      label: '删除所有注释',
      enabled: (e) => notesOf(e).length > 0,
      run: (e) => {
        editAnnotations(e, '删除所有注释', (a) => (a.notes = []));
        selectNote(e, undefined);
      },
    },
    { id: 'file.import-notes', label: '注释…', menu: 'file.import', enabled: (e) => e.hasDocument, run: (e) => importNotes(e), recordable: false },
    {
      id: 'view.show-notes',
      label: '注释',
      checked: (e) => !e.settings.hideNotes,
      run: (e) => {
        e.settings.hideNotes = !e.settings.hideNotes;
        e.overlay();
      },
      recordable: false,
    },
  );
}

/** Center the view on a note and select it. */
function reveal(e: Editor, n: DocumentNote) {
  e.pan = { x: (e.doc.width / 2 - n.x) * e.zoom, y: (e.doc.height / 2 - n.y) * e.zoom };
  e.view();
  e.update();
}
