/**
 * Footnotes and endnotes on the References tab: Insert Footnote and Insert Endnote, Next/Previous
 * Footnote or Endnote, Show Notes (between a reference and its note), and the Footnote and Endnote
 * dialog (placement, number format, custom mark, start number, restart, convert between kinds).
 */
import { el } from '../ui/dom.js';
import { check, field, number, openDialog, select, text } from './references-ui.js';

export const NOTE_FORMAT_CHOICES = [['decimal', '1, 2, 3, …'], ['lowerLetter', 'a, b, c, …'], ['upperLetter', 'A, B, C, …'], ['lowerRoman', 'i, ii, iii, …'], ['upperRoman', 'I, II, III, …'], ['chicago', '*, †, ‡, §, …']];

export function createNoteCommands(ctx) {
  const { editor, pkg, ready, fail, error, onChange, unshared = () => {} } = ctx;
  const settingsKey = kind => `${kind}s`;

  async function insertNote(kind = 'footnote', { customMark = '' } = {}) {
    try {
      const engine = ready(); if (!engine) return;
      engine.finishComposition();
      const notes = await import('../engine/footnotes.js');
      if (engine.session.path !== null) {
        if (notes.isNoteStoryKind(engine.pageStories?.stories[engine.session.path]?.kind)) throw new Error('备注中不能再包含其他备注。');
        // The shortcut pressed in a header or footer used to leave it and put the note wherever the caret was last in the text.
        throw new Error('脚注和尾注应插入到正文中。请先关闭页眉或页脚。');
      }
      ctx.trackableStories?.();
      unshared(`New ${kind}s`);
      const { TextDocument, paragraph } = await import('../engine/model.js');
      const body = engine.session.body;
      const note = kind === 'footnote' ? pkg().addFootnote() : pkg().addEndnote();
      const mark = customMark.trim();
      let textStyle = null, referenceStyle = null;
      if (!engine.execute(() => {
        // Word's Footnote Text and Footnote Reference styles (or the endnote ones), added when missing.
        ({ textStyle, referenceStyle } = body.addNoteStyles(kind));
        body.insertFootnoteReference(note.id, kind, { custom: !!mark, style: referenceStyle });
        if (mark) {
          const at = body.range[0];
          body.replace(mark);
          body.select(at, at + mark.length); body.setRunFormat({ verticalAlign: 'superscript' }); body.select(at + mark.length);
        }
        return true;
      })) { pkg().releaseNote?.(note); return; }
      // The note opens with its own number mark (or the custom mark), then a space, as existing documents start one.
      const draft = new TextDocument([paragraph('', textStyle ? { styleId: textStyle, styleChanged: true } : {})], body.pageSettings, body.numbering, body.styles, [], body.assets);
      draft.paragraphs[0].runs = mark
        ? [{ ...draft.typingRun(0), text: mark, verticalAlign: 'superscript', overrides: { verticalAlign: 'superscript' } }, { ...draft.typingRun(0), text: ' ' }]
        : notes.footnoteOpeningRuns(draft.typingRun(0), referenceStyle, kind);
      for (const run of draft.paragraphs[0].runs) { delete run.revision; delete run.link; }
      if (!textStyle) { draft.select(0, draft.text.length); draft.setRunFormat({ fontSize: 10 }); draft.setParagraphFormat({ spaceBefore: 0, spaceAfter: 0, lineRule: 'auto', lineSpacing: 1 }); }
      engine.attachPageStory(note.path, kind, draft.paragraphs, { [settingsKey(kind)]: note.settings, story: { noteId: note.id } });
      const area = [...(engine.layout.footnoteAreas || []), ...(engine.layout.endnoteAreas || [])].find(a => a.notes.some(n => n.path === note.path));
      engine.editStory(note.path, area?.page ?? 0);
      engine.model.select(engine.model.text.length);
      engine.focus(); engine.revealCaret?.(); onChange();
    } catch (e) { fail(e); }
  }

  /** Body references of both kinds in document order. */
  async function references() {
    const engine = editor(); if (!engine) return [];
    const notes = await import('../engine/footnotes.js');
    const body = engine.session.body;
    return ['footnote', 'endnote'].flatMap(kind => notes.noteReferences(body.paragraphs, kind).map(ref => ({ ...ref, kind }))).sort((a, b) => a.position - b.position);
  }

  /** Move to the next (or previous) reference of `kind` in the body. */
  async function goToNote(kind, direction = 1) {
    const engine = ready() || editor(); if (!engine) return;
    engine.finishComposition();
    const refs = (await references()).filter(r => r.kind === kind);
    if (!refs.length) { error(new Error(`本文档没有${kind === 'footnote' ? '脚注' : '尾注'}。`)); return; }
    let at;
    if (engine.session.path !== null) {
      const story = engine.pageStories?.stories[engine.session.path];
      // From a note, step from its reference as from the caret just after it: next is the following note, not this one.
      const own = refs.find(r => r.id === story?.noteId && story?.kind === kind);
      at = own ? own.position + 1 : 0;
      engine.editStory(null);
    } else at = engine.model.range[direction > 0 ? 1 : 0];
    // The caret rests just after a reference mark; next looks beyond it, previous before it. Both wrap.
    const target = direction > 0 ? refs.find(r => r.position >= at) || refs[0] : [...refs].reverse().find(r => r.position + 1 < at) || refs.at(-1);
    engine.model.select(target.position + 1);
    engine.focus(); engine.revealCaret?.(); onChange();
  }

  /** Jump between a note and its reference. */
  async function showNotes() {
    const engine = editor(); if (!engine) return;
    engine.finishComposition();
    const [notes, refs] = await Promise.all([import('../engine/footnotes.js'), references()]);
    if (!refs.length) { error(new Error('本文档尚未包含脚注或尾注。')); return; }
    if (engine.session.path !== null) {
      const story = engine.pageStories?.stories[engine.session.path];
      if (!notes.isNoteStoryKind(story?.kind)) { engine.editStory(null); return; }
      const ref = refs.find(r => r.kind === story.kind && r.id === story.noteId);
      engine.editStory(null);
      if (ref) engine.model.select(ref.position + 1);
      engine.focus(); engine.revealCaret?.(); onChange();
      return;
    }
    const at = engine.model.range[0];
    const ref = refs.find(r => r.position === at - 1 || r.position === at) || refs.find(r => r.position >= at) || refs[0];
    const definition = engine.pageStories, part = definition?.[settingsKey(ref.kind)]?.part;
    const path = part && notes.footnoteStoryPath(part, ref.id);
    const area = [...(engine.layout.footnoteAreas || []), ...(engine.layout.endnoteAreas || [])].find(a => a.notes.some(n => n.path === path));
    if (!path || !definition.stories[path]?.editable || !engine.editStory(path, area?.page ?? 0)) { error(new Error('此备注无法在此处编辑。')); return; }
    engine.model.select(engine.model.text.length);
    engine.focus(); engine.revealCaret?.(); onChange();
  }

  function nextNoteItems() {
    const disabled = !editor();
    return [
      { label: '下一条脚注', icon: 'nextFootnote', disabled, onSelect: () => goToNote('footnote', 1) },
      { label: '上一条脚注', disabled, onSelect: () => goToNote('footnote', -1) },
      { separator: true },
      { label: '下一条尾注', disabled, onSelect: () => goToNote('endnote', 1) },
      { label: '上一条尾注', disabled, onSelect: () => goToNote('endnote', -1) },
    ];
  }

  /** Current settings of `kind`: the document's, else the package's pending ones, else defaults. */
  async function currentSettings(kind) {
    const { NOTE_DEFAULTS } = await import('../engine/docx-notes.js');
    return { ...NOTE_DEFAULTS[kind], ...editor()?.pageStories?.[settingsKey(kind)], ...pkg()?.noteSettings?.[kind] };
  }

  function applySettings(kind, values) {
    const engine = ready(); if (!engine) return;
    ctx.unprotected?.('its footnote and endnote settings');
    // One undo step, which takes back what is saved and what is shown.
    engine.changeSettings(() => {
      pkg().setNoteSettings(kind, values);
      const definition = engine.session.definition, key = settingsKey(kind);
      if (definition?.[key]) engine.session.definition = { ...definition, [key]: { ...definition[key], ...values } };
    });
    onChange();
  }

  async function notesDialog() {
    const engine = ready(); if (!engine) return;
    const settings = { footnote: await currentSettings('footnote'), endnote: await currentSettings('endnote') };
    const inNote = engine.pageStories?.stories[engine.session.path || '']?.kind;
    let kind = inNote === 'endnote' ? 'endnote' : 'footnote';
    const footRadio = el('input', { type: 'radio', name: 'ref-note-kind', value: 'footnote', checked: kind === 'footnote', onchange: () => switchKind('footnote') });
    const endRadio = el('input', { type: 'radio', name: 'ref-note-kind', value: 'endnote', checked: kind === 'endnote', onchange: () => switchKind('endnote') });
    const footPosition = select('脚注位置', [['pageBottom', '页面底端'], ['beneathText', '文字下方']], settings.footnote.position, () => remember());
    const endPosition = select('尾注位置', [['docEnd', '文档结尾'], ['sectEnd', '节的结尾']], settings.endnote.position, () => remember());
    const format = select('编号格式', NOTE_FORMAT_CHOICES, settings[kind].format, () => remember());
    const custom = text('自定义标记', '', { placeholder: '可选，例如 *', maxLength: 10 });
    const start = number('起始编号', settings[kind].start, { min: 1, max: 32767, oninput: () => remember() });
    const restart = select('编号方式', [], null, () => remember());
    const pending = { footnote: { ...settings.footnote }, endnote: { ...settings.endnote } };
    // What the document has now: only settings that differ from it are written, so Apply with nothing changed
    // leaves settings.xml as it was, and a footnote change adds no endnote settings.
    const applied = { footnote: { ...settings.footnote }, endnote: { ...settings.endnote } };
    // Footnote and endnote settings changed together are one undo step.
    const applyChanged = () => (editor() || { transact: fn => fn() }).transact(() => {
      for (const k of ['footnote', 'endnote']) {
        const changed = Object.fromEntries(['format', 'start', 'restart', 'position'].filter(key => pending[k][key] !== applied[k][key]).map(key => [key, pending[k][key]]));
        if (!Object.keys(changed).length) continue;
        applySettings(k, changed);
        applied[k] = { ...applied[k], ...changed };
      }
    });
    function remember() {
      if (!restart.options.length) return; // Not filled in yet.
      pending[kind] = { ...pending[kind], format: format.value, start: Math.max(1, Math.min(32767, Math.round(Number(start.value)) || 1)), restart: restart.value, position: kind === 'footnote' ? footPosition.value : endPosition.value };
    }
    function switchKind(next) {
      remember(); kind = next;
      footPosition.disabled = kind !== 'footnote'; endPosition.disabled = kind !== 'endnote';
      format.value = pending[kind].format; start.value = pending[kind].start;
      restart.replaceChildren(...[['continuous', '连续编号'], ['eachSect', '每节重新编号'], ...(kind === 'footnote' ? [['eachPage', '每页重新编号']] : [])].map(([v, l]) => el('option', { value: v }, l)));
      restart.value = pending[kind].restart;
    }
    switchKind(kind);
    const convert = el('button.btn.btn-outline', { type: 'button', onclick: () => convertDialog() }, '转换…');
    const apply = el('button.btn.btn-outline', { type: 'button', onclick: () => { if (!dialog.form.reportValidity()) return; remember(); try { applyChanged(); dialog.showError(''); } catch (e) { dialog.showError(e.message); } } }, '应用');
    const dialog = openDialog({ title: '脚注和尾注', className: 'ref-notes-dialog', submitLabel: '插入', actions: [apply], body: [
      el('fieldset.ref-section', {}, el('legend', {}, '位置'),
        el('div.ref-location-row', {}, el('label.ed-check', {}, footRadio, '脚注'), footPosition),
        el('div.ref-location-row', {}, el('label.ed-check', {}, endRadio, '尾注'), endPosition),
        el('div.row', {}, convert)),
      el('fieldset.ref-section', {}, el('legend', {}, '格式'),
        field('编号格式', format),
        field('自定义标记', custom, '留空将自动为备注编号。'),
        el('div.ref-two-column.ref-tight', {}, field('起始编号', start), field('编号方式', restart))),
      el('p.field-hint', {}, '更改将应用于整个文档。'),
    ], onSubmit: async () => {
      remember();
      applyChanged();
      await insertNote(kind, { customMark: custom.value });
    } });
  }

  function convertDialog() {
    const choice = value => el('input', { type: 'radio', name: 'ref-convert', value, checked: value === 'toEnd' });
    const toEnd = choice('toEnd'), toFoot = choice('toFoot'), swap = choice('swap');
    openDialog({ title: '转换备注', submitLabel: '转换', body: [
      el('div.ref-radio-group', { role: 'radiogroup', 'aria-label': '转换' },
        el('label.ed-check', {}, toEnd, '将所有脚注转换成尾注'),
        el('label.ed-check', {}, toFoot, '将所有尾注转换成脚注'),
        el('label.ed-check', {}, swap, '互换脚注和尾注')),
    ], onSubmit: () => convertNotes(toEnd.checked ? 'toEnd' : toFoot.checked ? 'toFoot' : 'swap') });
  }

  /** Convert notes between kinds: the reference keeps its place; the note text moves to the other part. */
  async function convertNotes(mode) {
    const engine = ready(); if (!engine) return false;
    try { unshared('Footnotes and endnotes', 'converted'); } catch (e) { error(e); return false; }
    engine.finishComposition();
    if (engine.session.path !== null) engine.editStory(null);
    const notes = await import('../engine/footnotes.js');
    const body = engine.session.body;
    const plans = [];
    const from = mode === 'toEnd' ? ['footnote'] : mode === 'toFoot' ? ['endnote'] : ['footnote', 'endnote'];
    for (const kind of from) {
      const to = kind === 'footnote' ? 'endnote' : 'footnote';
      const definition = engine.pageStories, part = definition?.[settingsKey(kind)]?.part;
      for (const id of new Set(notes.noteReferences(body.paragraphs, kind).map(r => r.id))) {
        const story = part && definition.stories[notes.footnoteStoryPath(part, id)];
        if (!story) continue;
        // A note shown read-only (a table, a bookmark, a field the editor keeps as it is) cannot be copied into a new one.
        if (!story.editable || story.tables?.length || story.paragraphs.some(p => p.bookmarks?.length)) { error(new Error(`本文档中的某个${kind === 'footnote' ? '脚注' : '尾注'}包含无法转换的内容 (表格、书签或字段)。未做任何更改。`)); return false; }
        plans.push({ kind, to, id, paragraphs: story.paragraphs });
      }
    }
    if (!plans.length) { error(new Error(mode === 'toFoot' ? '本文档没有要转换的尾注。' : '本文档没有要转换的脚注。')); return false; }
    const styles = body.styles.definitions || {};
    const named = (type, name) => Object.values(styles).find(s => s.type === type && s.name?.toLowerCase() === name)?.id;
    const mapping = new Map();
    for (const plan of plans) {
      const note = plan.to === 'footnote' ? pkg().addFootnote() : pkg().addEndnote();
      const paragraphs = notes.convertedNoteParagraphs(plan.paragraphs, plan.to).map(p => {
        const fromText = named('paragraph', `${plan.kind} text`), toText = named('paragraph', `${plan.to} text`);
        const fromRef = named('character', `${plan.kind} reference`), toRef = named('character', `${plan.to} reference`);
        return { ...p, ...(p.styleId && p.styleId === fromText && toText ? { styleId: toText } : {}), runs: p.runs.map(r => r.styleId && r.styleId === fromRef && toRef ? { ...r, styleId: toRef } : r) };
      });
      engine.attachPageStory(note.path, plan.to, paragraphs, { [settingsKey(plan.to)]: note.settings, story: { noteId: note.id } });
      // Load it into the session, so the next save writes the new note.
      engine.session.activate(note.path); engine.session.activate(null);
      mapping.set(`${plan.kind}:${plan.id}`, { kind: plan.to, id: note.id });
    }
    const ok = engine.execute(() => {
      body.checkpoint();
      for (const p of body.paragraphs) {
        if (!p.runs.some(r => notes.isNoteReference(r))) continue;
        p.runs = p.runs.map(r => {
          const kind = notes.noteKindOf(r), next = kind && mapping.get(`${kind}:${r.noteMark.id}`);
          return next ? { ...r, noteMark: { ...r.noteMark, kind: notes.NOTE_KINDS[next.kind].reference, id: next.id } } : r;
        });
      }
      body.didChange();
      return true;
    });
    engine.focus(); onChange();
    return ok;
  }

  return { insertNote, goToNote, showNotes, nextNoteItems, notesDialog, convertNotes, applySettings };
}
