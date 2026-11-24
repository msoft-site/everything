/**
 * The Thesaurus pane: synonyms and antonyms for the selected word from the bundled WordNet-derived
 * data (loaded on first use), with Insert, Copy and look-up-again. Insert replaces the word the pane
 * was opened on, matching its capitalization, as one undo step.
 */
import { el, listItem } from '../ui/dom.js';
import { openMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { loadThesaurus, lookupWord, matchCase } from '../lib/thesaurus.js';
import { sidePane, hint } from './review-ui.js';

const POS_LABEL = { noun: '名词', verb: '动词', adjective: '形容词', adverb: '副词' };

/** The word at or around a document position (letters, digits, apostrophes and inner hyphens). */
export function wordAt(text, position) {
  const isWord = ch => /[\p{L}\p{M}\p{N}'’-]/u.test(ch || '');
  let start = position, end = position;
  while (start > 0 && isWord(text[start - 1])) start--;
  while (end < text.length && isWord(text[end])) end++;
  while (start < end && /['’-]/.test(text[start])) start++;
  while (end > start && /['’-]/.test(text[end - 1])) end--;
  return start < end ? { start, end, word: text.slice(start, end) } : null;
}

export function createThesaurusPane({ editor, pkg, error }) {
  let target = null, history = [], data = null;
  const pane = sidePane({ title: '同义词库', label: '同义词库窗格', className: 'rv-thesaurus-pane', onClose: () => editor()?.focus() });
  const input = el('input.input', { type: 'search', 'aria-label': '查找字词', placeholder: '查找字词', autofocus: true });
  const back = el('button.icon-btn.rv-back', { type: 'button', 'aria-label': '返回', title: '返回', disabled: true, onclick: () => { const previous = history.pop(); if (previous) show(previous, { remember: false }); } }, '‹');
  const form = el('form.rv-lookup', { onsubmit: e => { e.preventDefault(); show(input.value); } }, back, input, el('button.btn.btn-primary.btn-sm', { type: 'submit' }, '查找'));
  const results = el('div.rv-thesaurus', { 'aria-live': 'polite' });
  const footer = hint('同义词来自普林斯顿大学 WordNet 3.1。插入操作将替换所选字词。');
  pane.body.append(form, results, footer);

  /** Pick the word to work on from the selection or the caret. */
  function captureTarget() {
    const engine = editor(); if (!engine) return null;
    const [a, b] = engine.model.range, text = engine.model.text;
    // A selection made word by word (Ctrl+Shift+Right) ends with the space after the word; insert over the word alone.
    const lead = a !== b ? text.slice(a, b).match(/^\s*/)[0].length : 0, trail = a !== b ? text.slice(a, b).match(/\s*$/)[0].length : 0;
    const found = a !== b ? { start: a + lead, end: Math.max(a + lead, b - trail), word: text.slice(a, b).trim() } : wordAt(text, a);
    target = found && found.word && !/\s/.test(found.word) ? { ...found, path: engine.session.path } : null;
    return target;
  }

  async function show(word, { remember = true } = {}) {
    word = String(word || '').trim();
    input.value = word;
    if (!word) { results.replaceChildren(el('p.rv-empty', {}, '选择一个词或输入词语以进行查找。')); return; }
    if (remember && results.dataset.word && results.dataset.word !== word) history.push(results.dataset.word);
    back.disabled = !history.length;
    results.dataset.word = word;
    results.replaceChildren(el('p.rv-status', {}, '正在查找…'));
    try { data ??= await loadThesaurus(); } catch (e) { results.replaceChildren(el('p.rv-status', {}, e.message)); return; }
    if (results.dataset.word !== word) return;
    const found = lookupWord(data, word);
    if (!found) { results.replaceChildren(el('p.rv-empty', {}, `未找到“${word}”的结果。`), hint('请检查拼写，或尝试使用更简单的词形。')); return; }
    results.replaceChildren(...[
      found.lemma.toLowerCase() !== word.toLowerCase() ? el('p.rv-status', {}, `显示“${found.lemma}”的结果。`) : null,
      ...found.senses.map(sense => el('section.rv-sense', {},
        el('h3.rv-sense-head', {}, el('span.rv-pos', {}, POS_LABEL[sense.pos] || sense.pos), sense.lemma ? el('span.rv-pos', {}, `(${sense.lemma})`) : null, sense.gloss ? el('span.rv-gloss', {}, sense.gloss) : null),
        sense.synonyms.length ? el('div.rv-words', { role: 'list', 'aria-label': '同义词' }, ...sense.synonyms.map(w => chip(w))) : null,
        sense.antonyms.length ? el('div.rv-antonyms', {}, el('span.rv-label', {}, '反义词'), el('div.rv-words', { role: 'list', 'aria-label': '反义词' }, ...sense.antonyms.map(w => chip(w, true)))) : null)),
    ].filter(Boolean));
  }
  function chip(word, antonym = false) {
    const node = el(`button.rv-word${antonym ? '.is-antonym' : ''}`, { type: 'button', title: `插入“${word}”，或打开菜单查看更多`,
      onclick: e => openMenu({ anchor: node, label: word, pointer: !!e.detail, items: [
        { label: `插入“${insertion(word)}”`, disabled: !canInsert(), onSelect: () => insert(word) },
        { label: '复制', onSelect: () => navigator.clipboard?.writeText(word).then(() => toast(`已复制“${word}”`)).catch(error) },
        { label: `查找“${word}”`, onSelect: () => show(word) },
      ] }),
      ondblclick: () => insert(word) }, word);
    return listItem(node);
  }
  const insertion = word => target ? matchCase(target.word, word) : word;
  const canInsert = () => !!target && !pkg()?.readOnly && !!editor();
  function insert(word) {
    const engine = editor(); if (!engine || !target) return;
    engine.finishComposition();
    if (engine.session.path !== target.path || engine.model.text.slice(target.start, target.end) !== target.word) { error(new Error('所选字词已更改。请重新选择并打开同义词库。')); return; }
    const text = insertion(word);
    if (engine.execute(() => { engine.model.select(target.start, target.end); engine.model.replace(text); })) {
      target = { ...target, end: target.start + text.length, word: text };
      engine.model.select(target.start, target.end); engine.focus();
    }
  }

  return {
    pane,
    open() { const found = captureTarget(); pane.open(); history = []; back.disabled = true; delete results.dataset.word; show(found?.word || ''); },
    /** Up to `limit` synonyms for the word at the caret, for the context menu. */
    async synonymsAt(limit = 6) {
      const found = captureTarget(); if (!found) return null;
      try { data ??= await loadThesaurus(); } catch { return null; }
      const result = lookupWord(data, found.word);
      if (!result) return { word: found.word, synonyms: [] };
      const synonyms = [...new Set(result.senses.flatMap(s => s.synonyms))].slice(0, limit);
      return { word: found.word, synonyms: synonyms.map(w => ({ word: w, text: matchCase(found.word, w) })) };
    },
    insert,
    get loaded() { return !!data; },
    preload() { loadThesaurus().then(d => { data = d; }).catch(() => {}); },
    destroy() { pane.destroy(); },
  };
}
