import { el } from '../ui/dom.js';
import { openPopover } from '../ui/popover.js';
import { checkedHyperlinkTarget, internalHyperlink, openableHyperlink } from '../engine/hyperlinks.js';
import { hrefForToken } from '../lib/linkify.js';

export function openHyperlink({ link, bookmarks = [], insert, apply, remove, open, anchor, focusFirst = true }) {
  const kind = el('select.input', { 'aria-label': '链接目标类型' }, el('option', { value: 'address' }, '地址'), el('option', { value: 'bookmark' }, '书签'));
  kind.value = internalHyperlink(link) ? 'bookmark' : 'address';
  // Hidden bookmarks (_Toc…, _Ref…, _GoBack: those tables of contents and cross-references make) are left out, as in
  // the Bookmarks dialog; a link that already goes to one keeps it.
  const choices = [...new Set(bookmarks.map(b => b.name).filter(name => !name?.startsWith('_')))];
  if (internalHyperlink(link) && link.anchor !== null && !choices.includes(link.anchor)) choices.push(link.anchor);
  const bookmark = el('select.input', { 'aria-label': '链接书签' }, el('option', { value: 'null' }, '文档开头'), ...choices.map(name => el('option', { value: JSON.stringify(name) }, name || '(未命名)')));
  bookmark.value = internalHyperlink(link) ? JSON.stringify(link.anchor) : 'null';
  const target = el('input.input', { 'aria-label': '链接地址', value: link?.target || '', required: true, spellcheck: false, placeholder: 'https://example.com' });
  const addressField = el('label.field', {}, el('span.field-label', {}, '地址'), target), bookmarkField = el('label.field', {}, el('span.field-label', {}, '书签'), bookmark);
  const update = () => { addressField.hidden = kind.value !== 'address'; target.required = kind.value === 'address'; bookmarkField.hidden = kind.value !== 'bookmark'; };
  kind.addEventListener('change', update); update();
  const text = insert ? el('input.input', { 'aria-label': '链接文本', placeholder: '使用链接地址' }) : null;
  const error = el('p.field-error', { role: 'alert', hidden: true });
  const retained = !!link && !openableHyperlink(link);
  const content = el('form', { onsubmit: e => {
    e.preventDefault();
    // A typed "example.com" or "joe@example.com" links as it would when typed in the document.
    const typed = target.value.trim();
    // An imported address this editor can't open stays as it is when left unchanged.
    if (retained && kind.value === 'address' && typed === link.target) { modal.close(); return; }
    const destination = kind.value === 'bookmark' ? { anchor: JSON.parse(bookmark.value) } : hrefForToken(typed) || typed;
    try { if (typeof destination === 'string') checkedHyperlinkTarget(destination); } catch (e) { error.textContent = e.message; error.hidden = false; target.setAttribute('aria-invalid', 'true'); target.focus(); return; }
    modal.close(); apply(destination, text?.value || (typeof destination === 'string' ? typed : destination.anchor || '文档开头'));
  } },
  el('label.field', {}, el('span.field-label', {}, '目标'), kind), addressField, bookmarkField,
  text ? el('label.field', {}, el('span.field-label', {}, '要显示的文字'), text) : null,
  el('p.field-hint', {}, retained ? '此链接指向无法在此处打开的文件或地址。除非进行更改，否则将保留原样。' : '粘贴网页或电子邮件地址，或选择本文档中的书签。'), error,
  el('div.row.row-end', {},
    link && !retained ? el('button.btn.btn-ghost', { type: 'button', onclick: () => { if (internalHyperlink(link)) modal.close(); open(); } }, '打开链接') : null,
    link ? el('button.btn.btn-ghost', { type: 'button', onclick: () => { modal.close(); remove(); } }, '删除链接') : null,
    el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'),
    el('button.btn.btn-primary', { type: 'submit' }, '确定')));
  const modal = openPopover({ anchor, label: link ? '编辑超链接' : '插入超链接', content, focusFirst });
  if (focusFirst && modal.menu) (internalHyperlink(link) ? bookmark : target).focus(); return modal;
}
