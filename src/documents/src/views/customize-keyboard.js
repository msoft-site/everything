import { el, typesCharacter } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { chordOf, bindable, displayChord, browserReserved } from './keymap.js';

/**
 * Customize Keyboard: give any command — a ribbon button or a menu item — a shortcut of your own, or
 * take one away. Bindings are kept in this browser. Built-in shortcuts are listed; a custom chord that
 * collides with one takes precedence while the keyboard is in the document.
 */
export function openCustomizeKeyboard({ entries, keymap, onClose, select = null }) {
  const all = dedupe(entries());
  const categories = [...new Set(all.map(e => e.path[0]).filter(Boolean))];
  const category = el('select.input', { 'aria-label': '类别' }, el('option', { value: '' }, '所有命令'), ...categories.map(c => el('option', { value: c }, c)));
  const filter = el('input.input', { type: 'search', placeholder: '搜索命令', 'aria-label': '搜索命令' });
  const list = el('div.kb-list', { role: 'listbox', 'aria-label': '命令', tabindex: 0 });
  const detail = el('div.kb-detail', { 'aria-live': 'polite' });
  let chosen = all.find(e => e.id === select) || null;
  let shown = [];

  function renderList() {
    const q = filter.value.trim().toLowerCase();
    shown = all.filter(e => (!category.value || e.path[0] === category.value) && (!q || `${e.label} ${e.path.join(' ')}`.toLowerCase().includes(q))).slice(0, 400);
    list.replaceChildren(...shown.map((entry, i) => el('div.kb-item', { role: 'option', id: `kb-item-${i}`, 'aria-selected': String(entry === chosen), onclick: () => pick(entry) },
      el('span.kb-label', {}, entry.label), el('span.kb-path', {}, entry.path.filter(Boolean).join(' › ')),
      el('span.kb-keys', {}, [...new Set([...keymap.chordsFor(entry.id).map(c => displayChord(c)), ...(builtIn(entry) ? [entry.shortcut] : [])])].join(', ')))));
    if (!shown.length) list.append(el('p.field-hint', {}, '无匹配的命令。'));
    const at = shown.indexOf(chosen);
    if (at >= 0) list.setAttribute('aria-activedescendant', `kb-item-${at}`); else list.removeAttribute('aria-activedescendant');
  }
  /** The command a shortcut of your own on this entry's built-in shortcut runs instead, or null. */
  function takenBy(entry) {
    if (!entry.shortcut) return null;
    const shown = entry.shortcut.toLowerCase();
    const owner = Object.entries(keymap.custom).find(([id, chords]) => id !== entry.id && chords.some(chord => displayChord(chord).toLowerCase() === shown))?.[0];
    return owner ? all.find(e => e.id === owner) || { label: '其他命令' } : null;
  }
  /**
   * Whether the entry's built-in shortcut still runs it: not taken by another command's. A shortcut of its own is
   * one more way to run it (the built-in one, which the document or the window handles, goes on working).
   */
  const builtIn = entry => !!entry.shortcut && !takenBy(entry);
  function pick(entry) { chosen = entry; renderList(); renderDetail(); list.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }); }
  list.addEventListener('keydown', e => {
    const at = shown.indexOf(chosen);
    const next = e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowUp' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? shown.length - 1 : null;
    if (next === null || !shown.length) return;
    e.preventDefault(); pick(shown[Math.max(0, Math.min(shown.length - 1, next))]);
  });
  filter.addEventListener('input', renderList);
  category.addEventListener('change', renderList);

  function renderDetail() {
    if (!chosen) { detail.replaceChildren(el('p.field-hint', {}, '请选择一个命令以查看并更改其快捷键。')); return; }
    const custom = keymap.chordsFor(chosen.id);
    let pending = null;
    const capture = el('input.input.kb-capture', { readOnly: true, placeholder: '请按新快捷键', 'aria-label': '新快捷键', 'aria-describedby': 'kb-capture-hint' });
    const hint = el('p.field-hint', { id: 'kb-capture-hint' }, '单击此处并按下按键组合，例如 Ctrl+Alt+K。功能键可单独使用。');
    // The pressed button is rebuilt with the details: focus goes on to the shortcut field, not to the page.
    const changed = () => { renderList(); renderDetail(); detail.querySelector('.kb-capture')?.focus(); };
    const assign = el('button.btn.btn-primary', { type: 'button', disabled: true, onclick: () => { if (pending && keymap.assign(chosen.id, pending)) changed(); } }, '指定');
    capture.addEventListener('keydown', e => {
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) return;
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return;
      e.preventDefault(); e.stopPropagation();
      const chord = chordOf(e);
      if (!chord) return;
      // Most of the browser's own chords never get here; one that does (an installed app's window) still opens a tab elsewhere.
      if (browserReserved(chord)) { capture.value = displayChord(chord); hint.textContent = `浏览器为自身窗口和标签页保留了 ${displayChord(chord)}，文档无法接收该按键。请选择其他快捷键。`; pending = null; assign.disabled = true; return; }
      if (!bindable(chord)) { capture.value = displayChord(chord); hint.textContent = '请使用修饰键（Ctrl、Alt、Cmd 或 Option），或功能键。'; pending = null; assign.disabled = true; return; }
      // AltGr and Option keys that type a character keep typing it, so they cannot be a shortcut.
      if (typesCharacter(e)) { capture.value = displayChord(chord); hint.textContent = `这些按键将输入 ${e.key}。请选择其他快捷键。`; pending = null; assign.disabled = true; return; }
      pending = chord; capture.value = displayChord(chord); assign.disabled = false;
      const owner = keymap.commandFor(chord);
      const builtIn = all.find(entry => entry.shortcut && entry.shortcut.toLowerCase() === displayChord(chord).toLowerCase());
      hint.textContent = owner && owner !== chosen.id ? `当前已指定给 ${all.find(x => x.id === owner)?.label || '其他命令'}；重新指定会将其移动到此处。`
        : builtIn && builtIn.id !== chosen.id ? `内置于 ${builtIn.label}。您的快捷键将在文档中替代它。` : '可用。';
    });
    detail.replaceChildren(
      el('h3.kb-title', {}, chosen.label), el('p.kb-path', {}, chosen.path.filter(Boolean).join(' › ')),
      el('div.kb-current', {},
        el('span.field-label', {}, '当前快捷键'),
        !custom.length && !builtIn(chosen) ? el('p.field-hint', {}, '无') : null,
        ...(builtIn(chosen) && !custom.map(c => displayChord(c)).includes(chosen.shortcut) ? [el('div.kb-chord', {}, el('span.kbd', {}, chosen.shortcut), el('span.field-hint', {}, '内置'))] : []),
        ...(takenBy(chosen) ? [el('p.field-hint', {}, `${chosen.shortcut} 现在运行 ${takenBy(chosen).label}。`)] : []),
        ...custom.map(chord => el('div.kb-chord', {}, el('span.kbd', {}, displayChord(chord)),
          el('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => { keymap.remove(chosen.id, chord); changed(); } }, '删除')))),
      el('label.field', {}, el('span.field-label', {}, '新快捷键'), capture), hint,
      el('div.row', {}, assign,
        el('button.btn.btn-ghost', { type: 'button', disabled: !keymap.isCustom(chosen.id), onclick: () => { keymap.reset(chosen.id); changed(); } }, '重置')));
  }
  const resetAll = el('button.btn.btn-ghost', { type: 'button', onclick: () => { keymap.reset(); renderList(); renderDetail(); } }, '全部重置');
  // A form, as the other dialogs are: Enter presses Done, the default button (the shortcut field takes Enter as a key).
  const modal = openModal({ title: '自定义键盘', wide: true, onClose, content: el('form.kb-dialog', { onsubmit: e => { e.preventDefault(); modal.close(); } },
    el('div.kb-browse', {}, el('div.kb-filters', {}, category, filter), list),
    detail,
    el('div.row.row-end.kb-actions', {}, resetAll, el('button.btn.btn-primary', { type: 'submit' }, '完成'))) });
  modal.panel.classList.add('kb-panel');
  renderList(); renderDetail();
  filter.focus();
  return modal;
}

function dedupe(entries) {
  const seen = new Set();
  return entries.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
    .sort((a, b) => (a.path[0] || '').localeCompare(b.path[0] || '') || a.label.localeCompare(b.label));
}
