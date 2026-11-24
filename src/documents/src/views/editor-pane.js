/**
 * The Editor pane: spelling (local dictionary), optional grammar and style suggestions from Puter's
 * AI (off until the reader turns it on, and marked as AI), and document statistics with readability
 * scores computed on this device. Corrections are ordinary edits, one undo step each.
 */
import { el, listItem, listboxKeys } from '../ui/dom.js';
import * as P from '../lib/puter.js';
import { engineApi } from '../lib/engine-api.js';
import { textStatistics, easeLabel } from '../lib/readability.js';
import { checkGrammar, SUGGESTION_KINDS } from '../lib/proofing-ai.js';
import { sidePane, section, button, hint, preference, reveal } from './review-ui.js';
import { shownText } from './word-count.js';

const AI_ON = preference('documents:editor-ai', false);
const AI_KINDS = preference('documents:editor-ai-kinds', ['grammar', 'punctuation', 'clarity', 'conciseness']);

export function createEditorPane({ editor, pkg, proofing, error, onState = () => {} }) {
  let spellingIssues = [], current = null, aiSuggestions = [], aiBusy = null, ignoredSuggestions = new Set();
  const pane = sidePane({ title: '编辑器', label: '编辑器窗格', className: 'rv-editor-pane', onOpen: () => { refreshAll(); }, onClose: () => {
    // A check whose answer never comes (a stalled connection) is let go here: waiting for it would leave Check with AI disabled for good.
    if (aiBusy) { aiBusy.abort(); aiBusy = null; aiStatus.textContent = ''; }
    onState(); editor()?.focus();
  } });

  /* ---- Overview ---- */
  const score = el('div.rv-score', { role: 'status' });
  const scope = el('p.rv-scope');

  /* ---- Spelling ---- */
  const spellingList = el('div.rv-list', { role: 'list', 'aria-label': '拼写问题' });
  const detail = el('div.rv-detail', { hidden: true });
  const spelling = section('拼写', spellingList, detail, el('div.rv-actions', {}, button('逐一检查 (F7)', () => { pane.close({ quiet: true }); proofing.openPane(); })));

  function renderSpelling() {
    const groups = new Map();
    for (const m of spellingIssues) { if (!groups.has(m.word)) groups.set(m.word, []); groups.get(m.word).push(m); }
    spellingList.replaceChildren(...[...groups].map(([word, list]) => listItem(el('button.rv-item', { type: 'button', 'aria-current': String(current?.word === word), onclick: () => pick(list[0]) },
      el('span.rv-item-word.rv-misspelled', {}, word), el('span.rv-item-count', {}, list.length > 1 ? `×${list.length}` : '')))));
    if (!groups.size) spellingList.append(el('p.rv-empty', {}, '未发现拼写问题。'));
    if (current && !spellingIssues.some(m => m.start === current.start && m.word === current.word)) current = null;
    if (!current) detail.hidden = true;
  }
  function pick(m) {
    current = m;
    reveal(editor(), m.start, m.end);
    const options = proofing.suggest(m.word);
    const editable = !pkg()?.readOnly;
    const chooseItem = item => { for (const other of choice.children) other.setAttribute('aria-selected', String(other === item)); };
    const choice = el('div.rv-suggestions', { role: 'listbox', 'aria-label': `针对 ${m.word} 的建议` }, ...(options.length ? options : []).map((option, i) => {
      const item = el('button.ed-proof-suggestion', { type: 'button', role: 'option', 'aria-selected': String(i === 0), dataset: { value: option }, disabled: !editable,
        onclick: () => chooseItem(item),
        ondblclick: () => apply(option) }, option);
      return item;
    }));
    // One Tab stop, on the chosen suggestion; the arrows move through the suggestions and choose as they go.
    listboxKeys(choice, chooseItem);
    const selected = () => choice.querySelector('[aria-selected="true"]')?.dataset.value;
    const apply = option => { proofing.change(m, option); current = null; later(); };
    detail.replaceChildren(
      el('p.rv-detail-title', {}, '不在词典中: ', el('strong', {}, m.word)),
      options.length ? choice : hint('无建议。'),
      el('div.rv-actions', {},
        button('更改', () => selected() && apply(selected()), { primary: true, disabled: !options.length || !editable }),
        button('全部更改', () => { const option = selected(); if (option) { proofing.changeAll(m.word, option); current = null; later(); } }, { disabled: !options.length || !editable }),
        button('忽略', () => { proofing.ignoreOnce(m); current = null; later(); }),
        button('全部忽略', () => { proofing.ignoreAll(m.word); current = null; later(); }),
        button('添加到词典', () => { proofing.addToDictionary(m.word); current = null; later(); })));
    detail.hidden = false;
    renderSpelling();
    (choice.querySelector('[aria-selected="true"]') || detail.querySelector('button'))?.focus({ preventScroll: true });
  }

  /* ---- Grammar and refinements (AI, opt-in) ---- */
  const aiToggle = el('input', { type: 'checkbox', checked: AI_ON.get(), onchange: () => { AI_ON.set(aiToggle.checked); renderAi(); } });
  const kindBoxes = Object.entries(SUGGESTION_KINDS).filter(([k]) => k !== 'style').map(([kind, label]) => {
    const box = el('input', { type: 'checkbox', checked: AI_KINDS.get().includes(kind), onchange: () => AI_KINDS.set(kindBoxes.filter(b => b.input.checked).map(b => b.kind)) });
    return { kind, input: box, node: el('label.rv-check', {}, box, label) };
  });
  const aiStatus = el('p.rv-status', { role: 'status' });
  const aiList = el('div.rv-list', { role: 'list', 'aria-label': '语法和样式建议' });
  const aiRun = button('使用 AI 检查', () => runAi(), { primary: true });
  const aiBody = el('div.rv-ai-body', {}, el('div.rv-checks', {}, ...kindBoxes.map(b => b.node)), el('div.rv-actions', {}, aiRun), aiStatus, aiList);
  const ai = section('语法和修改建议', el('label.rv-check.rv-ai-toggle', {}, aiToggle, el('span', {}, '使用 ', el('span.rv-ai-badge', { title: '使用内置 AI' }, 'AI'), ' 提供建议')),
    hint('运行检查时，被检查的文本将由 AI 处理。在点击“使用 AI 检查”之前不会处理任何内容。'), aiBody);
  function renderAi() {
    aiBody.hidden = !aiToggle.checked;
    const available = P.canUseAi();
    aiRun.disabled = !available || !!aiBusy;
    if (!available) aiStatus.textContent = 'AI 建议功能暂不可用。';
    const visible = aiSuggestions.filter(s => !ignoredSuggestions.has(key(s)) && !(pkg()?.reviewSettings?.hideGrammaticalErrors));
    aiList.replaceChildren(...visible.map(s => el('div.rv-item.rv-ai-item', { role: 'listitem' },
      el('button.rv-ai-target', { type: 'button', onclick: () => reveal(editor(), s.start, s.end) }, el('span.rv-ai-kind', {}, SUGGESTION_KINDS[s.kind]), el('span.rv-ai-change', {}, el('del', {}, s.original), ' → ', el('ins', {}, s.suggestion))),
      s.reason ? el('p.rv-ai-reason', {}, s.reason) : null,
      el('div.rv-actions', {}, button('接受', () => acceptSuggestion(s), { primary: true, disabled: !!pkg()?.readOnly }), button('忽略', () => { ignoredSuggestions.add(key(s)); renderAi(); onState(); })))));
    editor()?.paint();
  }
  const key = s => `${s.start}:${s.original}:${s.suggestion}`;
  function acceptSuggestion(s) {
    const engine = editor(); if (!engine) return;
    // Suggestions are in the body's text: compare there, not with a header or footer being edited.
    if (engine.session.body.text.slice(s.start, s.end) !== s.original) { error(new Error('检查后文本已发生更改。请重新检查。')); return; }
    engine.finishComposition();
    if (engine.session.path !== null) engine.editStory(null);
    const delta = s.suggestion.length - s.original.length;
    if (engine.execute(() => { engine.model.select(s.start, s.end); engine.model.replace(s.suggestion); })) {
      aiSuggestions = aiSuggestions.filter(x => x !== s).map(x => x.start >= s.end ? { ...x, start: x.start + delta, end: x.end + delta } : x);
      renderAi();
    }
  }
  async function runAi() {
    const engine = editor(); if (!engine || !P.canUseAi()) return;
    aiBusy?.abort(); aiBusy = new AbortController();
    const signal = aiBusy.signal, revision = engine.session.body.revision;
    const [a, b] = engine.session.path === null ? engine.model.range : [0, 0];
    // Text tracked as deleted is not sent: it is not part of the document as edited, and accepting a suggestion
    // in it brought the deleted words back. Each paragraph is sent as it reads without it, at a place of its own
    // (`start`, past the previous one), and `places` maps a place back to the document.
    const paragraphs = [], places = [];
    let at = 0, sent = 0;
    for (const p of engine.session.body.paragraphs) {
      const length = p.runs.reduce((n, r) => n + r.text.length, 0);
      if (a === b || at + length >= a && at <= b) {
        let text = '', offset = at;
        const map = [];
        for (const run of p.runs) {
          if (run.revision?.type !== 'del') for (let i = 0; i < run.text.length; i++) { map.push(offset + i); text += run.text[i]; }
          offset += run.text.length;
        }
        map.push(offset);
        paragraphs.push({ text: text.replace(/￼/g, ' '), start: sent });
        places.push({ start: sent, map });
        sent += text.length + 1;
      }
      at += length + 1;
    }
    const placed = position => { const place = places.findLast(item => item.start <= position); return place.map[Math.min(position - place.start, place.map.length - 1)]; };
    aiStatus.textContent = '正在检查…'; aiRun.disabled = true; aiList.replaceChildren();
    try {
      const kinds = kindBoxes.filter(k => k.input.checked).map(k => k.kind);
      const found = (await checkGrammar(paragraphs, { chat: prompt => P.aiChat(prompt), kinds: kinds.length ? kinds : ['grammar'], signal }))
        .map(s => ({ ...s, start: placed(s.start), end: s.end > s.start ? placed(s.end - 1) + 1 : placed(s.start) }));
      if (signal.aborted) return;
      if (editor()?.session.body.revision !== revision) { aiStatus.textContent = '检查期间文档已更改。请重新检查。'; return; }
      // An object (a note reference, field or picture) was sent as a space. A suggestion that takes it in ("claim ."
      // → "claim.") could not be accepted, and would delete the object if it were: it is not offered. Nor is one
      // around deleted text, which it would delete for good.
      const body = editor()?.session.body.text || '';
      aiSuggestions = found.filter(s => body.slice(s.start, s.end) === s.original); ignoredSuggestions = new Set();
      aiStatus.textContent = aiSuggestions.length ? `${aiSuggestions.length} 条建议` : '无语法或样式建议。';
    } catch (e) { if (!signal.aborted) aiStatus.textContent = e.message; }
    finally { if (aiBusy?.signal === signal) aiBusy = null; renderAi(); onState(); }
  }

  /* ---- Statistics and readability ---- */
  const stats = el('dl.rv-stats');
  const readability = section('统计信息与可读性', stats, hint('在本地设备上计算。阅读易读性得分从 0 (难) 到 100 (易)；年级级别估算理解所需的受教育年限。'));
  function renderStats() {
    const engine = editor(); if (!engine) return;
    const [a, b] = engine.model.range, selected = engine.session.path === null && a !== b;
    // The text as the view shows it, as the status bar and Word Count count it: a deletion hidden by Simple or No
    // Markup is not counted or judged (nor an insertion in Original).
    const body = engine.session.body, tracked = body.revisions.length > 0;
    const text = tracked ? shownText(body.paragraphs, ...(selected ? [a, b] : [])) : selected ? body.text.slice(a, b) : body.text;
    const s = textStatistics(text);
    scope.textContent = selected ? '显示所选内容的统计结果。' : '显示整篇文档的统计结果。';
    const row = (label, value) => [el('dt', {}, label), el('dd', {}, value)];
    stats.replaceChildren(
      ...row('字数', s.words.toLocaleString()), ...row('字符数', s.characters.toLocaleString()), ...row('段落数', s.paragraphs.toLocaleString()), ...row('句子数', s.sentences.toLocaleString()),
      ...row('每段句子数', s.averages.sentencesPerParagraph), ...row('每句字数', s.averages.wordsPerSentence), ...row('每字字符数', s.averages.charactersPerWord),
      ...row('阅读易读性', `${s.readability.fleschReadingEase} · ${easeLabel(s.readability.fleschReadingEase)}`), ...row('年级级别', s.readability.fleschKincaidGrade), ...row('被动语态句比例', `${s.readability.passivePercent}%`));
    const total = spellingIssues.length + aiSuggestions.filter(x => !ignoredSuggestions.has(key(x))).length;
    score.replaceChildren(el('strong', {}, total ? `${total} 条建议` : '无建议'), el('span', {}, ` · ${s.words.toLocaleString()} 字`));
  }

  pane.body.append(score, scope, spelling, ai, readability);

  let pending = null, statsPending = null;
  // Checks run after a pause in typing; statistics follow the selection a moment later.
  function later() { clearTimeout(pending); pending = setTimeout(refreshAll, 400); }
  async function refreshAll() {
    if (!pane.isOpen) return;
    try { spellingIssues = proofing.enabled ? await proofing.issues() : []; } catch (e) { spellingIssues = []; error(e); }
    renderSpelling(); renderAi(); renderStats(); onState();
  }

  /** AI suggestions drawn as double blue underlines while the pane holds them. */
  function overlay(ctx, index) {
    const engine = editor();
    if (!engine || pkg()?.reviewSettings?.hideGrammaticalErrors || !aiSuggestions.length || engine.session.path !== null) return;
    ctx.save(); ctx.strokeStyle = '#2F6FD0'; ctx.lineWidth = 1;
    const rectsOf = engineApi().selectionRectFinder(engine.layout);
    for (const s of aiSuggestions) {
      if (ignoredSuggestions.has(key(s))) continue;
      for (const r of rectsOf(s.start, s.end)) {
        if (r.page !== index || r.width < 2) continue;
        const y = r.y + r.height - 2;
        ctx.beginPath(); ctx.moveTo(r.x, y + 0.5); ctx.lineTo(r.x + r.width, y + 0.5); ctx.moveTo(r.x, y - 1.5); ctx.lineTo(r.x + r.width, y - 1.5); ctx.stroke();
      }
    }
    ctx.restore();
  }

  return {
    pane, overlay,
    open() { pane.open(); },
    refresh() { if (pane.isOpen) later(); },
    selectionChanged() { if (pane.isOpen) { clearTimeout(statsPending); statsPending = setTimeout(renderStats, 150); } },
    /** Typing invalidates AI suggestion positions: drop the ones whose text changed. */
    changed() {
      const engine = editor(); if (!engine || !aiSuggestions.length) return;
      const text = engine.session.body.text;
      const kept = aiSuggestions.filter(s => text.slice(s.start, s.end) === s.original);
      if (kept.length !== aiSuggestions.length) { aiSuggestions = kept; renderAi(); }
    },
    get suggestionCount() { return aiSuggestions.filter(x => !ignoredSuggestions.has(key(x))).length; },
    destroy() { aiBusy?.abort(); clearTimeout(pending); clearTimeout(statsPending); pane.destroy(); },
  };
}
