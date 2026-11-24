import { MAX_DOCUMENT_CHARACTERS } from '../engine/text-limits.js';
import { describeFormat } from '../engine/advanced-search.js';
import { el, isComposing } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';

/** The special characters the Special menu inserts, as [code, label, findOnly]. */
export const SPECIAL_CHARACTERS = [
  ['^p', '段落标记'], ['^t', '制表符'], ['^l', '手动换行符'], ['^m', '手动分页符'], ['^n', '分栏符'],
  ['^s', '不间断空格'], ['^~', '不间断连字符'], ['^-', '可选连字符'], ['^+', '长划线 (Em dash)'], ['^=', '短划线 (En dash)'], ['^^', '脱字符号 (Caret)'],
  ['^?', '任意字符', 'find'], ['^#', '任意数字', 'find'], ['^$', '任意字母', 'find'], ['^w', '空白区域', 'find'], ['^g', '图形/图片', 'find'],
  ['^&', '“查找内容”文字', 'replace'],
];
export const WILDCARD_HELP = '? 单个字符 · * 任意字符 · [abc] 字符集之一 · [!a] 非 · {n,m} 重复次数 · @ 一次或多次 · < 单词开头 · > 单词结尾 · ( ) 分组引用 \\1';
const ADVANCED_FLAGS = [['wildcards', '使用通配符'], ['matchPrefix', '前缀匹配'], ['matchSuffix', '后缀匹配'], ['ignorePunctuation', '忽略标点符号'], ['ignoreWhitespace', '忽略空白字符']];

/**
 * The Find and Replace panel. Basic use is literal (Match case, Whole words); More options adds
 * wildcards, prefix/suffix, punctuation/white-space-insensitive matching, special characters, a search
 * scope (selection, headers and footers) and formatting to find and to replace with.
 *
 * api: matches(query, options), range(), select(match), highlight(matches), replace(query, text, options, all),
 * readOnly(), close(); optional: chooseFont(seed, done), chooseParagraph(seed, done), styles(), scopes(), textLength().
 */
export function findReplacePanel(api) {
  const query = el('input.input', { 'aria-label': '查找内容', type: 'text', spellcheck: false, maxLength: MAX_DOCUMENT_CHARACTERS });
  const replacement = el('input.input', { 'aria-label': '替换为', type: 'text', spellcheck: false, maxLength: MAX_DOCUMENT_CHARACTERS });
  const matchCase = el('input', { type: 'checkbox' }), wholeWord = el('input', { type: 'checkbox' });
  const flags = Object.fromEntries(ADVANCED_FLAGS.map(([key]) => [key, el('input', { type: 'checkbox' })]));
  const count = el('span.canvas-find-count', { role: 'status', 'aria-live': 'polite' });
  const notice = el('p.canvas-find-notice', { role: 'status', 'aria-live': 'polite' });
  const error = el('p.field-error', { role: 'alert', hidden: true });
  let findFormat = {}, replaceFormat = {}, within = null, lastField = query;
  // The selection the user made, as opposed to the match the panel selected while searching: "Current
  // selection" searches the user's, though typing the query has since selected its first match.
  let userRange = null, panelRange = null;
  const scope = el('select.input', { 'aria-label': '搜索范围', onchange: () => {
    within = scope.value === 'selection' ? [...(userRange && userRange[0] !== userRange[1] ? userRange : api.range())] : null;
    notice.textContent = ''; navigate();
  } }, el('option', { value: 'document' }, '主文档'), el('option', { value: 'selection' }, '当前所选内容'));
  for (const [value, label] of api.scopes?.() || []) scope.append(el('option', { value }, label));
  const advancedUsed = () => ADVANCED_FLAGS.some(([key]) => flags[key].checked) || Object.keys(findFormat).length || Object.keys(replaceFormat).length || /\^/.test(query.value) || /\^|\\[1-9]/.test(replacement.value) || scope.value !== 'document';
  const options = () => {
    // What the view hides (a deletion in Simple Markup, hidden text) is not found, as a reader would not find it.
    const base = { matchCase: matchCase.checked, wholeWord: wholeWord.checked, visibleOnly: true };
    if (!advancedUsed()) return base;
    return { ...base, advanced: true, ...Object.fromEntries(ADVANCED_FLAGS.map(([key]) => [key, flags[key].checked])), format: findFormat, replaceFormat, ...(within ? { within } : {}), scope: scope.value };
  };
  const action = (label, icon, run) => el('button.icon-btn', { type: 'button', 'aria-label': label, title: label, onclick: run }, iconEl(icon, 18));
  const previous = action('上一个匹配项', 'arrowUp', () => navigate(-1)), next = action('下一个匹配项', 'arrowDown', () => navigate(1));
  const replace = el('button.btn', { type: 'button', onclick: () => change(false) }, '替换');
  const all = el('button.btn', { type: 'button', onclick: () => change(true) }, '全部替换');
  // Whether the document shows this panel's matches. Hidden, the panel leaves the tints alone unless they
  // are its own: the Navigation pane's search tints the document with the panel closed.
  let highlighted = false;
  const highlight = matches => { highlighted = matches.length > 0; api.highlight?.(matches); };
  const close = () => { if (node.hidden) return; node.hidden = true; highlight([]); api.close(); };

  /* ---- More options ---- */
  const findFormatLabel = el('span.canvas-find-format'), replaceFormatLabel = el('span.canvas-find-format');
  const paintFormats = () => {
    findFormatLabel.textContent = Object.keys(findFormat).length ? `查找格式: ${describeFormat(findFormat)}` : '';
    replaceFormatLabel.textContent = Object.keys(replaceFormat).length ? `替换格式: ${describeFormat(replaceFormat)}` : '';
    findFormatLabel.hidden = !findFormatLabel.textContent; replaceFormatLabel.hidden = !replaceFormatLabel.textContent;
    noFormatting.disabled = !Object.keys(findFormat).length && !Object.keys(replaceFormat).length;
  };
  const formatTarget = () => lastField === replacement ? 'replace' : 'find';
  const setFormat = patch => {
    if (formatTarget() === 'replace') replaceFormat = { ...replaceFormat, ...patch }; else findFormat = { ...findFormat, ...patch };
    paintFormats(); notice.textContent = ''; navigate();
  };
  const formatButton = el('button.btn.btn-outline.btn-sm', { type: 'button', 'aria-haspopup': 'menu', onclick: () => {
    const target = formatTarget(), current = target === 'replace' ? replaceFormat : findFormat;
    const styles = api.styles?.() || [];
    openMenu({ anchor: formatButton, label: target === 'replace' ? '替换格式' : '查找格式', items: [
      { header: target === 'replace' ? '替换为格式' : '查找格式' },
      { label: '字体…', disabled: !api.chooseFont, onSelect: () => api.chooseFont(current, patch => setFormat(fontCondition(patch))) },
      { label: '段落…', disabled: !api.chooseParagraph, onSelect: () => api.chooseParagraph(current, patch => setFormat(patch)) },
      { label: '样式', disabled: !styles.length, items: styles.map(style => ({ label: style.name, radio: true, checked: style.type === 'character' ? current.characterStyle === style.id : current.paragraphStyle === style.id,
        onSelect: () => setFormat(style.type === 'character' ? { characterStyle: style.id } : { paragraphStyle: style.id }) })) },
      { label: '突出显示', checked: target === 'replace' ? current.highlight === 'yellow' : current.highlight === 'any', onSelect: () => setFormat({ highlight: target === 'replace' ? 'yellow' : 'any' }) },
      { label: '无突出显示', onSelect: () => setFormat({ highlight: 'none' }) },
    ] });
  } }, '格式');
  const noFormatting = el('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => {
    if (formatTarget() === 'replace') replaceFormat = {}; else findFormat = {};
    paintFormats(); navigate();
  } }, '不限定格式');
  const specialButton = el('button.btn.btn-outline.btn-sm', { type: 'button', 'aria-haspopup': 'menu', onclick: () => {
    const target = lastField, kind = target === replacement ? 'replace' : 'find';
    openMenu({ anchor: specialButton, label: '特殊字符', items: SPECIAL_CHARACTERS.filter(([, , only]) => !only || only === kind).map(([code, label]) => ({ label, hint: code, onSelect: () => {
      const at = target.selectionStart ?? target.value.length, end = target.selectionEnd ?? at;
      target.value = target.value.slice(0, at) + code + target.value.slice(end);
      target.focus(); target.setSelectionRange(at + code.length, at + code.length);
      target.dispatchEvent(new Event('input', { bubbles: true }));
    } })) });
  } }, '特殊字符');
  const wildcardHint = el('p.field-hint.canvas-find-wildcards', { hidden: true }, WILDCARD_HELP);
  flags.wildcards.addEventListener('change', () => {
    wildcardHint.hidden = !flags.wildcards.checked;
    // Wildcard searches are case-sensitive and whole-word matching uses < and > instead.
    for (const box of [matchCase, wholeWord, flags.matchPrefix, flags.matchSuffix, flags.ignorePunctuation, flags.ignoreWhitespace]) box.disabled = flags.wildcards.checked;
  });
  const more = el('div.canvas-find-more', { hidden: true },
    el('div.canvas-find-options', {}, ...ADVANCED_FLAGS.map(([key, label]) => el('label', {}, flags[key], label))),
    wildcardHint,
    el('label.canvas-find-field', {}, el('span', {}, '搜索范围'), scope),
    el('div.canvas-find-row', {}, formatButton, specialButton, noFormatting),
    findFormatLabel, replaceFormatLabel);
  const moreButton = el('button.btn.btn-ghost.btn-sm.canvas-find-more-toggle', { type: 'button', 'aria-expanded': 'false', onclick: () => setMore(more.hidden) }, '更多选项');
  function setMore(open) {
    more.hidden = !open; moreButton.setAttribute('aria-expanded', String(open)); moreButton.textContent = open ? '更少选项' : '更多选项';
  }
  paintFormats();

  const node = el('section.canvas-find', { role: 'search', 'aria-label': '查找和替换', hidden: true, onkeydown: e => {
    if (e.key === 'Escape' && !isComposing(e)) { e.preventDefault(); e.stopPropagation(); close(); }
  } }, el('div.canvas-find-heading', {}, el('strong', {}, '查找和替换'), action('关闭查找和替换', 'x', close)),
  el('label.canvas-find-field', {}, el('span', {}, '查找内容'), query),
  el('div.canvas-find-row', {}, el('label', {}, matchCase, '区分大小写'), el('label', {}, wholeWord, '全字匹配')),
  el('div.canvas-find-row', {}, count, previous, next),
  el('label.canvas-find-field', {}, el('span', {}, '替换为'), replacement),
  el('div.canvas-find-row.canvas-find-actions', {}, el('span.field-hint', {}, '回车: 下一个 · Shift+回车: 上一个'), replace, all),
  moreButton, more, notice, error);
  // The last search, kept while the document and the search are the same: a caret move only changes which
  // match is current, and searching a long document again on every move or keystroke elsewhere cost more
  // than the rest of the update.
  let searched = null;
  function refresh() {
    if (node.hidden) { searched = null; if (highlighted) highlight([]); return { matches: [], current: -1 }; }
    const range = api.range();
    if (!panelRange || range[0] !== panelRange[0] || range[1] !== panelRange[1]) { userRange = [...range]; panelRange = null; }
    let matches = [];
    const searching = !!query.value || Object.keys(findFormat).length > 0;
    const version = api.version?.() || null, key = JSON.stringify([query.value, options()]);
    if (searching && version && searched?.key === key && searched.version.length === version.length && searched.version.every((v, i) => v === version[i])) matches = searched.matches;
    else {
      searched = null;
      try { matches = searching ? api.matches(query.value, options()) : []; error.hidden = true; if (searching && version) searched = { key, version, matches }; }
      catch (e) { error.textContent = e.message; error.hidden = false; }
    }
    highlight(matches);
    const [start, end] = api.range(), current = matches.findIndex(m => m.start === start && m.end === end && (api.isCurrentStory ? api.isCurrentStory(m.story || null) : !m.story));
    count.textContent = !searching ? '输入查找内容' : !matches.length ? '未找到匹配项' : current < 0 ? `共 ${matches.length} 个匹配项` : `第 ${current + 1} 个，共 ${matches.length} 个`;
    previous.disabled = next.disabled = !matches.length;
    replacement.disabled = !!api.readOnly?.();
    all.disabled = replacement.disabled || !matches.length;
    replace.disabled = replacement.disabled || current < 0;
    // A button that turns itself off (Replace all, with nothing left to find) would drop the keyboard on the page
    // body, out of the panel's keys: the search field takes it.
    if ([previous, next, replace, all].some(button => button.disabled && document.activeElement === button)) query.focus();
    return { matches, current };
  }
  function navigate(direction = 0) {
    const { matches, current } = refresh(); if (!matches.length) return;
    const [start] = api.range(); let index;
    if (direction && current >= 0) index = (current + direction + matches.length) % matches.length;
    else if (direction < 0) { index = matches.findLastIndex(m => m.start < start); if (index < 0) index = matches.length - 1; }
    else { index = matches.findIndex(m => m.start >= start); if (index < 0) index = 0; }
    api.select(matches[index]); panelRange = [...api.range()]; refresh();
  }
  function change(every) {
    try {
      const length = api.textLength?.();
      const total = api.replace(query.value, replacement.value, options(), every);
      // A replacement inside the searched selection moves its end: the search stays within it.
      const delta = api.textLength?.() - length;
      if (within && Number.isFinite(delta)) within = [within[0], within[1] + delta];
      else if (within) { within = null; scope.value = 'document'; }
      if (!every) navigate(1); else refresh();
      notice.textContent = `已完成替换，共替换了 ${total} 处。`; error.hidden = true;
    } catch (e) { error.textContent = e.message; error.hidden = false; }
  }
  for (const input of [query, matchCase, wholeWord, ...Object.values(flags)]) input.addEventListener('input', e => { if (!e.isComposing) { notice.textContent = ''; navigate(); } });
  for (const box of Object.values(flags)) box.addEventListener('change', () => { notice.textContent = ''; navigate(); });
  for (const input of [query, replacement]) input.addEventListener('focus', () => { lastField = input; });
  query.addEventListener('compositionend', () => { notice.textContent = ''; navigate(); });
  query.addEventListener('keydown', e => { if (e.key === 'Enter' && !isComposing(e)) { e.preventDefault(); navigate(e.shiftKey ? -1 : 1); } });
  replacement.addEventListener('keydown', e => { if (e.key === 'Enter' && !isComposing(e)) { e.preventDefault(); if (!replace.disabled) change(false); } });
  return { node, refresh, close, open(selected = '', { advanced = false } = {}) {
    if (node.hidden) { userRange = [...api.range()]; panelRange = null; }
    if (node.hidden && selected && !/[\u0000-\u001f￼]/u.test(selected)) query.value = selected;
    if (advanced) setMore(true);
    node.hidden = false; notice.textContent = ''; navigate(); query.focus(); query.select();
  },
  /** Seed formatting conditions (Select → similar formatting, tests). */
  setFindFormat(format) { findFormat = { ...format }; paintFormats(); setMore(true); navigate(); } };
}

/** A Font dialog patch as find conditions: one value per property, without the complex-script twins. */
export function fontCondition(patch) {
  const result = { ...patch };
  for (const key of ['fontHAnsi', 'fontSizeCs', 'boldCs', 'italicCs', 'underlineColor']) delete result[key];
  if ('underlineStyle' in result) { result.underline = result.underlineStyle !== 'none'; delete result.underlineStyle; }
  return result;
}
