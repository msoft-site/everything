import {
  PasswordError,
  authenticateOwner,
  documentAccess,
  openedProtection,
  unlockPdf,
} from './core/security.js';
import { el, button, modal, toast } from './lib/ui.js';

/**
 * Open a password-protected PDF. Files that only restrict permissions open silently; other
 * files ask for the password until it is right or the reader cancels.
 * Resolves to `{ bytes, protection }` with the unlocked bytes and the protection to carry on
 * to downloads and saves (the file's own, until it is changed), or to null when the reader
 * cancels or the requesting operation is aborted.
 */
export async function promptUnlock(
  bytes,
  name,
  { signal, isCurrent = () => true, onOpen, beforeOpen } = {},
) {
  if (signal?.aborted || !isCurrent()) return null;
  try {
    const opened = await unlockPdf(bytes, '');
    if (signal?.aborted || !isCurrent()) return null;
    return { bytes: opened.bytes, protection: openedProtection(opened, '') };
  } catch (error) {
    if (signal?.aborted || !isCurrent()) return null;
    if (!(error instanceof PasswordError)) throw error;
  }
  if (beforeOpen && !(await beforeOpen())) return null;
  if (signal?.aborted || !isCurrent()) return null;
  return new Promise((resolve) => {
    let pending = false;
    const input = el('input', {
      class: 'input',
      id: 'unlock-password',
      type: 'password',
      autocomplete: 'off',
      required: true,
    });
    const show = el('input', { type: 'checkbox', id: 'unlock-show' });
    show.onchange = () => {
      input.type = show.checked ? 'text' : 'password';
    };
    const form = el(
      'form',
      { class: 'stack' },
      el('p', { class: 'muted' }, `${name} 受密码保护。请输入密码以打开。`),
      el('div', { class: 'field' }, el('label', { for: 'unlock-password' }, '密码'), input),
      el(
        'label',
        { class: 'checkbox-row', for: 'unlock-show' },
        el('span', {}, '显示密码'),
        show,
      ),
    );
    const open = async () => {
      if (pending) return;
      const password = input.value;
      if (!password) {
        // Open sits outside the form, so the field's own "required" never spoke up.
        toast('请输入密码以打开 PDF。', { error: true });
        input.focus();
        return;
      }
      pending = true;
      openButton.disabled = true;
      try {
        const opened = await unlockPdf(bytes, password);
        if (!dialog.open || signal?.aborted || !isCurrent()) return;
        resolve({ bytes: opened.bytes, protection: openedProtection(opened, password) });
        dialog.close();
      } catch (error) {
        // A rejected submission must not select or report an error on a newer draft.
        if (!dialog.open || signal?.aborted || !isCurrent() || input.value !== password) return;
        toast(
          error instanceof PasswordError ? '密码不正确，请重试。' : error.message,
          { error: true },
        );
        input.focus();
        input.select();
      } finally {
        pending = false;
        openButton.disabled = false;
      }
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      open();
    };
    const openButton = button('打开', 'LockOpen', open, 'btn primary');
    const dialog = modal(
      '需要密码',
      form,
      [button('取消', null, () => dialog.close()), openButton],
      { signal },
    );
    onOpen?.(dialog);
    dialog.addEventListener('close', () => resolve(null), { once: true });
    input.focus();
  });
}

/** Lift restrictions only after authenticating the document's permissions (owner) password. */
export function promptOwner(protection, { signal, isCurrent = () => true, onOpen } = {}) {
  if (signal?.aborted || !isCurrent()) return Promise.resolve(null);
  const access = documentAccess(protection);
  if (access.owner) return Promise.resolve(protection);
  return new Promise((resolve) => {
    let pending = false;
    const input = el('input', {
      class: 'input',
      id: 'owner-password',
      type: 'password',
      autocomplete: 'off',
      required: true,
    });
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        '此 PDF 具有文档限制。输入其权限密码以解除所有编辑限制或更改保护设置。',
      ),
      el(
        'dl',
        { class: 'detail-facts', 'aria-label': '文档权限' },
        ...[
          ['打印', 'print'],
          ['复制内容', 'copy'],
          ['编辑内容', 'edit'],
          ['批注和链接', 'annotate'],
          ['填写表单', 'fill'],
          ['页面和书签', 'assemble'],
        ].flatMap(([label, key]) => [
          el('dt', {}, label),
          el(
            'dd',
            {},
            !access[key]
              ? '不允许'
              : key === 'print' && !access.printHighQuality
                ? '仅限低分辨率'
                : '允许',
          ),
        ]),
      ),
      el(
        'div',
        { class: 'field' },
        el('label', { for: 'owner-password' }, '权限密码'),
        input,
      ),
    );
    const unlock = async () => {
      if (pending) return;
      const password = input.value;
      if (!password) {
        toast('请输入权限密码。', { error: true });
        input.focus();
        return;
      }
      pending = true;
      unlockButton.disabled = true;
      try {
        const next = await authenticateOwner(protection, password);
        if (!dialog.open || signal?.aborted || !isCurrent()) return;
        resolve(next);
        dialog.close();
      } catch (error) {
        if (!dialog.open || signal?.aborted || !isCurrent() || input.value !== password) return;
        toast(
          error instanceof PasswordError
            ? '请输入权限密码。仅用于打开 PDF 的密码无法解除限制。'
            : error.message,
          { error: true },
        );
        input.focus();
        input.select();
      } finally {
        pending = false;
        unlockButton.disabled = false;
      }
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      unlock();
    };
    const unlockButton = button('解除限制', 'LockOpen', unlock, 'btn primary');
    const dialog = modal(
      '需要权限密码',
      form,
      [button('取消', null, () => dialog.close()), unlockButton],
      { signal },
    );
    onOpen?.(dialog);
    dialog.addEventListener('close', () => resolve(null), { once: true });
    input.focus();
  });
}
