import { el } from './dom.js';
import { icon } from './icons.js';
import { trapFocus } from './focus.js';
import { toast } from './toast.js';
import { getPref, prefsReady, setPref } from '../lib/prefs.js';
import { sanitizeName } from '../lib/protocol.js';

/** The same nickname editor before and during a call. */
export function nicknameField({ ctx, session }) {
  const input = el('input', {
    type: 'text', 'aria-label': '昵称', placeholder: '您的姓名',
    maxlength: '60', autocomplete: 'nickname',
    value: session?.name ?? getPref('name') ?? ctx.getUserName?.() ?? '',
  });
  const save = el('button', { type: 'submit', class: 'btn btn-primary' }, '保存昵称');
  const update = () => {
    save.disabled = !input.value.trim();
  };
  let edited = false;
  input.addEventListener('input', () => { edited = true; update(); });
  update();
  const form = el(
    'form',
    {
      class: 'nickname-form',
      onsubmit: (e) => {
        e.preventDefault();
        if (!input.value.trim()) return;
        const name = sanitizeName(input.value);
        session?.setName(name);
        setPref('name', name);
        ctx.setUserName?.(name);
        input.value = name;
        edited = true;
        toast('已保存昵称', { icon: 'check' });
      },
    },
    el('label', {}, el('span', { class: 'field-label' }, '昵称'), el('div', { class: 'text-field' }, input)),
    el('p', { class: 'nickname-hint' }, '将向会议中的所有人显示，并为今后的会议记住此昵称。'),
    save
  );
  void prefsReady().then(() => {
    if (session || edited || !form.isConnected) return;
    input.value = getPref('name') ?? ctx.getUserName?.() ?? '';
    update();
  });
  return form;
}

/** Home settings do not acquire devices just to edit a nickname. */
export function openHomeSettings(root, ctx, opener) {
  const close = () => backdrop.remove();
  const dialog = el(
    'div',
    { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': '设置', tabindex: '-1' },
    el('div', { class: 'dialog-header' }, el('h2', {}, '设置'),
      el('button', { class: 'icon-btn', 'aria-label': '关闭', onclick: close }, icon('close'))),
    el('div', { class: 'dialog-body' }, nicknameField({ ctx }))
  );
  let pressedBackdrop = false;
  const backdrop = el('div', {
    class: 'dialog-backdrop',
    onpointerdown: (e) => { pressedBackdrop = e.target === backdrop; },
    onclick: (e) => { if (pressedBackdrop && e.target === backdrop) close(); },
    onkeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } },
  }, dialog);
  root.append(backdrop);
  trapFocus(dialog, { restoreTo: opener });
  dialog.querySelector('input').focus();
  return close;
}
