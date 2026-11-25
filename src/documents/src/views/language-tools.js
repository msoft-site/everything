/**
 * Language: mark text's proofing language (§17.3.2.20 lang) or exclude it from proofing
 * (§17.3.2.21 noProof), set the document's default language, and translate the selection or the
 * whole document with local AI into a pane (with Insert) or a new document.
 */
import { el, listboxKeys, isComposing } from '../ui/dom.js';
import { languageProperty } from '../engine/font-families.js';
import { clipText } from '../core/text.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import * as P from '../lib/puter.js';
import { translateParagraphs } from '../lib/proofing-ai.js';
import { readableText, insertableText } from '../lib/ai.js';
import { LANGUAGES, languageName, englishLanguageName, sidePane, button, hint, preference } from './review-ui.js';

export const DETECT_LANGUAGE = preference('documents:detect-language', true);
export const TRANSLATION_LANGUAGE = preference('documents:translation-language', 'zh-CN');

function languageSelect(value, label) {
  const tags = [...new Set([...(value ? [value] : []), ...LANGUAGES])];
  return el('select.input', { 'aria-label': label }, ...tags.map(tag => el('option', { value: tag, selected: tag === value }, languageName(tag))));
}

/** The Language dialog for the selection. apply({ language, noProof }) and setDefault(language). */
export function openLanguageDialog({ language, noProof, defaultLanguage, apply, setDefault, onClose }) {
  const filter = el('input.input', { type: 'search', placeholder: '查找语言', 'aria-label': '查找语言' });
  const options = [...new Set([...(language ? [language] : []), ...LANGUAGES])];
  let chosen = language || defaultLanguage || 'zh-CN';
  const list = el('div.rv-language-list', { role: 'listbox', 'aria-label': '语言' });
  // Choosing marks the option where it is: redrawing the list took the keyboard off the option it was on.
  const choose = tag => { chosen = tag; for (const option of list.children) option.setAttribute('aria-selected', String(option.dataset.tag === chosen)); };
  let settle = null;
  const render = () => {
    const query = filter.value.trim().toLowerCase();
    list.replaceChildren(...options.filter(tag => !query || languageName(tag).toLowerCase().includes(query) || tag.toLowerCase().includes(query)).map(tag => el('button.rv-language', {
      type: 'button', role: 'option', 'aria-selected': String(tag === chosen), dataset: { tag },
      onclick: () => choose(tag), ondblclick: () => { chosen = tag; submit(); } }, el('span', {}, languageName(tag)), el('span.rv-language-tag', {}, tag === defaultLanguage ? `${tag} · 默认` : tag))));
    settle?.();
  };
  filter.addEventListener('input', render);
  const skip = el('input', { type: 'checkbox', checked: !!noProof });
  const detect = el('input', { type: 'checkbox', checked: DETECT_LANGUAGE.get(), onchange: () => DETECT_LANGUAGE.set(detect.checked) });
  const submit = () => { modal.close(); apply({ language: chosen, noProof: skip.checked }); };
  render();
  // One Tab stop, on the chosen language; the arrows move through the list and choose as they go.
  settle = listboxKeys(list, option => choose(option.dataset.tag));
  // Enter on a language is OK, as in a list in a desktop dialog: the option is a button, which would only choose it.
  list.addEventListener('keydown', e => {
    const option = e.target.closest?.('[role="option"]');
    if (e.key !== 'Enter' || !option || isComposing(e) || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault(); choose(option.dataset.tag); submit();
  });
  const modal = openModal({ title: '语言', onClose, content: el('form.ed-dialog-body.rv-language-dialog', { onsubmit: e => { e.preventDefault(); submit(); } },
    el('p.field-hint', {}, '将所选文字标记为:'),
    filter, list,
    el('label.rv-check', {}, skip, '不检查拼写或语法'),
    el('label.rv-check', {}, detect, '自动检测语言'),
    hint('拼写检查使用所选语言。开启自动检测时，标记为其他语言或用其他字符书写的文本将被略过。'),
    el('div.modal-actions', {},
      el('button.btn.btn-ghost', { type: 'button', onclick: () => { setDefault(chosen); toast(`默认语言: ${languageName(chosen)}`); } }, '设为默认值'),
      el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'),
      el('button.btn.btn-primary', { type: 'submit' }, '确定'))) });
  queueMicrotask(() => list.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }));
  return modal;
}

/** The Translator pane. */
export function createTranslatePane({ editor, pkg, error, openDocument, documentName }) {
  let busy = null, result = null;
  // Closing the pane stops a translation under way. One whose answer never comes is let go there and then: waiting
  // for it to end would leave Translate disabled for good.
  const pane = sidePane({ title: '翻译器', label: '翻译面板', className: 'rv-translate-pane', onClose: () => { if (busy) { busy.abort(); busy = null; status.textContent = ''; } editor()?.focus(); } });
  const source = el('p.rv-translate-source');
  const target = languageSelect(TRANSLATION_LANGUAGE.get(), '翻译为');
  target.addEventListener('change', () => TRANSLATION_LANGUAGE.set(target.value));
  const status = el('p.rv-status', { role: 'status' });
  const output = el('div.rv-translation', { 'aria-live': 'polite' });
  const insert = button('插入', () => insertResult(), { primary: true, disabled: true });
  const copy = button('复制', () => { if (result) navigator.clipboard?.writeText(result.text).then(() => toast('已复制翻译内容')).catch(error); }, { disabled: true });
  const translate = button('翻译', () => run(), { primary: true });
  const wholeDocument = button('翻译整个文档…', () => translateDocument());
  pane.body.append(
    el('label.field', {}, el('span.field-label', {}, '翻译为'), target),
    source, el('div.rv-actions', {}, translate, wholeDocument), status, output, el('div.rv-actions', {}, insert, copy),
    hint('翻译功能：选择文本或整个文档，然后选择“翻译”。'));

  const selection = () => {
    const engine = editor(); if (!engine) return null;
    const [a, b] = engine.model.range;
    // `original` is the document's own text, to see whether it changed; `text` is what is translated.
    return a === b ? null : { start: a, end: b, original: engine.model.text.slice(a, b), text: readableText(engine.model.paragraphs, a, b), path: engine.session.path };
  };
  function describe() {
    const chosen = selection();
    source.textContent = chosen ? `所选内容: “${clipText(chosen.text, 120)}${chosen.text.length > 120 ? '…' : ''}”` : '选定文本以在此翻译，或将整个文档翻译为新文档。';
    translate.disabled = !chosen || !P.canUseAi() || !!busy;
    wholeDocument.disabled = !P.canUseAi() || !!busy;
    if (!P.canUseAi()) status.textContent = '翻译服务不可用。';
  }
  async function run() {
    const chosen = selection(); if (!chosen) return;
    busy?.abort(); busy = new AbortController();
    const signal = busy.signal;
    status.textContent = '正在翻译…'; output.replaceChildren(); insert.disabled = copy.disabled = true; describe();
    try {
      const paragraphs = await translateParagraphs(chosen.text.split('\n'), englishLanguageName(target.value), { chat: prompt => P.aiChat(prompt), signal });
      if (signal.aborted) return;
      result = { ...chosen, text: insertableText(paragraphs.join('\n')) };
      output.replaceChildren(...paragraphs.map(text => el('p', {}, text)));
      status.textContent = `已翻译为 ${languageName(target.value)}。`;
      insert.disabled = !!pkg()?.readOnly; copy.disabled = false;
    } catch (e) { if (!signal.aborted) status.textContent = e.message; }
    finally { if (busy?.signal === signal) busy = null; describe(); }
  }
  function insertResult() {
    const engine = editor(); if (!engine || !result) return;
    engine.finishComposition();
    const { start, end } = result;
    if (engine.session.path !== result.path || engine.model.text.slice(start, end) !== result.original) { error(new Error('所选文本已更改。请重新翻译。')); return; }
    // The translation is marked in its language (§17.3.2.20), so proofing treats it as such.
    engine.execute(() => {
      engine.model.select(start, end); engine.model.replace(result.text);
      const after = engine.model.range[1];
      engine.model.select(after - result.text.length, after); engine.model.setRunFormat({ [languageProperty(target.value)]: target.value });
      engine.model.select(after);
    });
    engine.focus();
  }
  async function translateDocument() {
    const engine = editor(); if (!engine) return;
    const body = engine.session.body;
    // The document as it is sent: edits made while the translation runs (a paragraph added, say) must not shift the
    // translated paragraphs onto others, nor leave the new document's tables out of step with its paragraphs.
    const sent = body.documentSnapshot();
    const plain = p => p.runs.every(r => !r.image && !r.math && !r.field && !r.noteMark && !r.contentControl && !r.bodySymbol) && !p.fieldMarkers?.length;
    const texts = sent.paragraphs.map(p => plain(p) ? p.runs.filter(r => r.revision?.type !== 'del').map(r => r.text).join('') : '');
    busy?.abort(); busy = new AbortController();
    const signal = busy.signal;
    status.textContent = '正在翻译文档…'; describe();
    try {
      const translated = await translateParagraphs(texts, englishLanguageName(target.value), { chat: prompt => P.aiChat(prompt), signal, onProgress: share => { status.textContent = `正在翻译文档… ${Math.round(share * 100)}%`; } });
      if (signal.aborted) return;
      const paragraphs = sent.paragraphs.map((p, i) => {
        if (!texts[i].trim()) return p;
        const first = p.runs.find(r => r.text && r.revision?.type !== 'del') || p.runs[0];
        const run = { ...structuredClone(first), text: translated[i] };
        delete run.revision; delete run.formatRevision; delete run.link;
        const length = translated[i].length;
        const out = { ...structuredClone(p), runs: [run] };
        delete out.markRevision; delete out.formatRevision;
        if (out.bookmarks) out.bookmarks = out.bookmarks.map(m => ({ ...m, offset: Math.min(m.offset, length + (m.blockBoundary === 'after' ? 1 : 0)) }));
        return out;
      });
      const blob = pkg().export(paragraphs, sent.pageSettings, sent.numbering, sent.styles, sent.tables, body.assets, undefined, sent.comments);
      const name = `${(documentName() || '文档').replace(/\.docx$/i, '')} (${languageName(target.value)}).docx`;
      status.textContent = '翻译完成。正在打开新文档…';
      await openDocument(new File([blob], name, { type: P.DOCX_MIME }));
    } catch (e) { if (!signal.aborted) { status.textContent = e.message; error(e); } }
    finally { if (busy?.signal === signal) busy = null; describe(); }
  }
  return {
    pane,
    open() { pane.open(); describe(); },
    selectionChanged() { if (pane.isOpen && !busy) describe(); },
    destroy() { busy?.abort(); pane.destroy(); },
  };
}
