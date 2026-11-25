import { el, button, modal, toast } from './lib/ui.js';
import { sameEncryptionPassword } from './core/security.js';

const PERMISSIONS = [
  ['print', '打印'],
  ['copy', '复制文本和图像'],
  ['annotate', '批注与填写表单'],
  ['edit', '编辑内容和页面'],
];
/**
 * Choose the password readers need and, optionally, a permissions password with the actions
 * allowed without it. Resolves to the new protection, to null when it is removed, or to
 * undefined when the dialog is cancelled.
 */
export function protectDialog(current, { signal } = {}) {
  return new Promise((resolve) => {
    let result;
    // A file opened with its permissions password keeps an open password that is not known
    // here; leaving the fields empty keeps it.
    const unknownOpen = current?.open === null && (current.openFrom || current.original);
    const passwordField = (id, label, value = '') => {
      const input = el('input', {
        class: 'input',
        id,
        type: 'password',
        autocomplete: 'new-password',
        maxlength: 127,
        value,
        ...(unknownOpen && id !== 'protect-owner' && { placeholder: '未更改' }),
      });
      return { input, row: el('div', { class: 'field' }, el('label', { for: id }, label), input) };
    };
    const open = passwordField('protect-open', '打开密码', current?.open || '');
    const confirm = passwordField('protect-confirm', '确认密码', current?.open || '');
    if (unknownOpen) {
      const hint = el(
        'p',
        { class: 'muted field-hint', id: 'protect-open-hint' },
        '留空以保留当前的打开密码。',
      );
      open.row.append(hint);
      open.input.setAttribute('aria-describedby', hint.id);
    }
    const owner = passwordField(
      'protect-owner',
      '权限密码',
      current?.permissions || '',
    );
    // A file opened with its reader password keeps restrictions whose password is not known
    // here; they show as ticked so that changing the open password does not drop them.
    const restricted =
      Boolean(current?.permissions) ||
      Object.values(current?.allow || {}).some((allowed) => allowed === false);
    const restrict = el('input', {
      type: 'checkbox',
      id: 'protect-restrict',
      checked: restricted,
    });
    const allowances = PERMISSIONS.map(([key, label]) => {
      const box = el('input', {
        type: 'checkbox',
        id: `protect-allow-${key}`,
        checked: current?.allow?.[key] !== false,
      });
      return {
        key,
        box,
        row: el(
          'label',
          { class: 'checkbox-row', for: `protect-allow-${key}` },
          el('span', {}, label),
          box,
        ),
      };
    });
    const restrictions = el(
      'div',
      { class: 'stack protect-restrictions' },
      owner.row,
      el('p', { class: 'muted' }, '没有权限密码时，读者仅允许：'),
      ...allowances.map((a) => a.row),
    );
    const syncRestrictions = () => {
      restrictions.hidden = !restrict.checked;
    };
    restrict.onchange = syncRestrictions;
    syncRestrictions();
    const show = el('input', { type: 'checkbox', id: 'protect-show' });
    show.onchange = () => {
      for (const { input } of [open, confirm, owner])
        input.type = show.checked ? 'text' : 'password';
    };
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        '下载或保存时，PDF 将使用 AES-256 加密。密码仅保留在此标签页中。',
      ),
      open.row,
      confirm.row,
      el(
        'label',
        { class: 'checkbox-row', for: 'protect-restrict' },
        el('span', {}, '限制打印、复制或编辑'),
        restrict,
      ),
      restrictions,
      el(
        'label',
        { class: 'checkbox-row', for: 'protect-show' },
        el('span', {}, '显示密码'),
        show,
      ),
    );
    const fail = (message, input) => {
      toast(message, { error: true });
      input.focus();
    };
    const apply = () => {
      const openValue = open.input.value;
      const ownerValue = restrict.checked ? owner.input.value : '';
      const keepOpen = unknownOpen && !openValue && !confirm.input.value;
      if (!openValue && !restrict.checked && !keepOpen)
        return fail(
          '请输入打开 PDF 的密码，或限制读者可执行的操作。',
          open.input,
        );
      if (openValue !== confirm.input.value)
        return fail('两次输入的密码不一致。', confirm.input);
      // Invisible characters such as soft hyphens are dropped from PDF passwords.
      const invisible = '请使用可见字符。此密码在 PDF 中为空。';
      if (openValue && sameEncryptionPassword(openValue, '')) return fail(invisible, open.input);
      if (restrict.checked && !ownerValue)
        return fail('请输入权限密码。', owner.input);
      if (restrict.checked && sameEncryptionPassword(ownerValue, ''))
        return fail(invisible, owner.input);
      if (restrict.checked && sameEncryptionPassword(ownerValue, openValue))
        return fail(
          '请使用不同的权限密码。在 PDF 中此权限密码与打开密码等价，会导致打开密码解除所有限制。',
          owner.input,
        );
      const allow = Object.fromEntries(
        allowances.map(({ key, box }) => [key, restrict.checked ? box.checked : true]),
      );
      // Permissions finer than the checkboxes carry over while their box is left as it was.
      const { R, P } = current?.original?.security || {};
      const base = restrict.checked ? (current?.base ?? (R >= 3 ? P : null)) : null;
      result = keepOpen
        ? { open: null, permissions: ownerValue, allow, base, openFrom: unknownOpen }
        : { open: openValue, permissions: ownerValue, allow, base };
      dialog.close();
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const dialog = modal(
      current ? '修改密码' : '设置密码保护',
      form,
      [
        button('取消', null, () => dialog.close()),
        current &&
          button('移除密码', 'LockOpen', () => {
            result = null;
            dialog.close();
          }),
        button(current ? '更新' : '保护', 'Lock', apply, 'btn primary'),
      ].filter(Boolean),
      { signal },
    );
    dialog.addEventListener('close', () => resolve(result), { once: true });
    open.input.focus();
  });
}
