import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { checkedBookmarkName } from '../engine/bookmarks.js';

export function openBookmarks({ entries, add, rename, remove, navigate }) {
  const name = el('input.input', { 'aria-label': '书签名称', maxLength: 40, spellcheck: false });
  const list = el('select.input', { 'aria-label': '文档书签', size: 6, style: { backgroundImage: 'none' } });
  const error = el('p.field-error', { role: 'alert', hidden: true });
  const validate = action => {
    try {
      checkedBookmarkName(name.value);
      // Names starting with an underscore are hidden bookmarks (tables of contents, cross-references), which this list leaves out.
      if (name.value.startsWith('_')) throw new Error('名称须以字母或汉字开头。以下划线开头的名称为隐藏书签。');
      // Add with a name already in use moves that bookmark to the selection, as desktop word processors do.
      if (action === 'rename' && entries().some(e => e.name?.toLowerCase() === name.value.toLowerCase() && e.id !== list.value)) throw new Error('已存在同名书签。');
    } catch (e) { error.hidden = false; error.textContent = e.message; return; }
    const moved = action === 'add' && entries().find(e => e.name?.toLowerCase() === name.value.toLowerCase());
    if (action === 'add' ? add(name.value, { move: true }) : rename(list.value, name.value)) {
      refresh(); error.hidden = true;
      // The moved bookmark is the one chosen in the list, so Go to bookmark goes to its new place.
      if (moved) { const now = entries().find(e => e.name?.toLowerCase() === name.value.toLowerCase()); if (now) { list.value = now.id; update(); } }
    }
  };
  const renameButton = el('button.btn', { type: 'button', onclick: () => validate('rename') }, '重命名');
  const removeButton = el('button.btn', { type: 'button', onclick: () => { remove(list.value); refresh(); } }, '删除');
  const go = el('button.btn', { type: 'button', onclick: () => { const id = list.value; modal.close(); navigate(id); } }, '定位');
  const update = () => { const item = entries().find(e => e.id === list.value); if (item) name.value = item.name; for (const b of [renameButton, removeButton, go]) b.disabled = !item; };
  const refresh = () => { const id = list.value; list.replaceChildren(...entries().map(e => el('option', { value: e.id }, `${e.name || '(未命名)'} · 第 ${e.page} 页`))); list.value = id; update(); };
  list.addEventListener('change', update); refresh();
  const content = el('form.bookmark-form', { onsubmit: e => { e.preventDefault(); validate('add'); } },
    el('label.field', {}, el('span.field-label', {}, '书签名称'), name),
    el('p.field-hint', {}, '在光标处或所选文本周围添加书签。名称须为 1–40 个字符，以字母或字符开头。'), error,
    el('div.row', {}, el('button.btn.btn-primary', { type: 'submit' }, '添加'), renameButton),
    el('label.field', {}, el('span.field-label', {}, '书签列表'), list),
    el('div.row.row-end', {}, go, removeButton, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '关闭')));
  const modal = openModal({ title: '书签', content }); name.focus(); return modal;
}
