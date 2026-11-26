import { el, button, modal, download } from './lib/ui.js';

/**
 * Digital IDs for certificate signatures: open a .pfx/.p12 file with its password, or create
 * a new self-signed ID (offered as a .p12 download so it can be used again). IDs stay in this
 * tab's memory only; nothing is stored on the device.
 */
const field = (id, label, control, hint) =>
  el(
    'div',
    { class: 'field' },
    el('label', { for: id }, label),
    Object.assign(control, { id }),
    hint && el('p', { class: 'muted field-hint' }, hint),
  );

const WRONG_PASSWORD = '此数字身份证文件的密码不正确。';
/** Why a digital ID cannot sign now: its certificate expired or is not valid yet; or null. */
function validityProblem(summary, now = new Date()) {
  const day = (date) => date.toLocaleDateString(undefined, { dateStyle: 'medium' });
  if (now > summary.validTo)
    return `此数字身份证已于 ${day(summary.validTo)} 过期。请选择其他身份证进行签名。`;
  if (now < summary.validFrom)
    return `此数字身份证自 ${day(summary.validFrom)} 起生效。请选择其他身份证进行签名。`;
  return null;
}
function errorText(error) {
  if (error?.name === 'Pkcs12PasswordError' || /password|mac/i.test(error?.message || ''))
    return WRONG_PASSWORD;
  return error?.message || '无法使用此数字身份证。';
}

/**
 * Choose a digital ID. Resolves to `{ identity, summary }` or null when cancelled.
 * `identities` are the IDs already opened in this session, offered first.
 */
export function chooseDigitalId(identities = [], { signal } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const mode = (value) => {
      for (const [key, section] of Object.entries(sections)) section.hidden = key !== value;
      dialog.querySelector('.dialog-error').hidden = true;
    };
    const radios = el(
      'div',
      { class: 'choice-list', role: 'radiogroup', 'aria-label': '数字身份证' },
      ...identities.map((entry, i) =>
        el(
          'label',
          { class: 'choice-row' },
          el('input', {
            type: 'radio',
            name: 'digital-id',
            value: `open-${i}`,
            checked: i === 0,
            onchange: () => mode('existing'),
          }),
          el(
            'span',
            {},
            `${entry.summary.commonName || '数字身份证'}${entry.summary.email ? ` (${entry.summary.email})` : ''}`,
          ),
        ),
      ),
      el(
        'label',
        { class: 'choice-row' },
        el('input', {
          type: 'radio',
          name: 'digital-id',
          value: 'file',
          checked: !identities.length,
          onchange: () => mode('file'),
        }),
        el('span', {}, '使用数字身份证文件 (.pfx 或 .p12)'),
      ),
      el(
        'label',
        { class: 'choice-row' },
        el('input', {
          type: 'radio',
          name: 'digital-id',
          value: 'create',
          onchange: () => mode('create'),
        }),
        el('span', {}, '创建新的数字身份证'),
      ),
    );
    const file = el('input', {
      type: 'file',
      class: 'file-input',
      accept: '.pfx,.p12,application/x-pkcs12',
    });
    const filePassword = el('input', {
      type: 'password',
      class: 'input',
      autocomplete: 'current-password',
    });
    const name = el('input', { class: 'input', autocomplete: 'name', maxlength: 64 });
    const email = el('input', { class: 'input', type: 'email', autocomplete: 'email' });
    const organization = el('input', { class: 'input', autocomplete: 'organization' });
    const keyType = el(
      'select',
      { class: 'input' },
      el('option', { value: 'RSA-2048' }, 'RSA 2048 位'),
      el('option', { value: 'P-256' }, 'ECDSA P-256'),
    );
    const newPassword = el('input', {
      type: 'password',
      class: 'input',
      autocomplete: 'new-password',
    });
    const sections = {
      existing: el('div', { class: 'stack' }),
      file: el(
        'div',
        { class: 'stack' },
        field('id-file', '数字身份证文件', file),
        field('id-file-password', '密码', filePassword),
      ),
      create: el(
        'div',
        { class: 'stack' },
        field('id-name', '姓名', name),
        field('id-email', '电子邮箱 (可选)', email),
        field('id-organization', '单位/组织 (可选)', organization),
        field('id-key', '密钥类型', keyType),
        field(
          'id-password',
          '身份证文件的密码',
          newPassword,
          '新的身份证将以受该密码保护的 .p12 文件形式下载，以便您再次签名使用。在其他人信任此身份证前，它将被视为自签名证书。',
        ),
      ),
    };
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        '证书签名可证明签署者身份，并能显示此后的任何更改。',
      ),
      radios,
      sections.existing,
      sections.file,
      sections.create,
    );
    const choose = async () => {
      // Enter submits the form even while Continue is disabled; one ID at a time.
      if (submit.disabled) return;
      submit.disabled = true;
      const choice = form.querySelector('input[name="digital-id"]:checked')?.value;
      // Continue is disabled while it works, which drops a focus it had; the field to fix
      // takes it, so the keyboard is not sent back to the start of the page.
      const fail = (message, field) => {
        const feedback = dialog.querySelector('.dialog-error');
        feedback.textContent = message;
        feedback.hidden = false;
        field?.focus();
        field?.select?.();
      };
      try {
        const { importPkcs12, exportPkcs12, createSelfSignedId, describeIdentity } =
          await import('./core/digital-signature.js');
        if (choice?.startsWith('open-')) {
          const chosen = identities[Number(choice.slice(5))];
          // Asked before the signature's details, which a signing refused afterwards loses.
          const problem = validityProblem(chosen.summary);
          if (problem) return fail(problem);
          result = chosen;
        } else if (choice === 'file') {
          const chosen = file.files?.[0];
          if (!chosen) return fail('请选择数字身份证文件。', file);
          const identity = await importPkcs12(
            new Uint8Array(await chosen.arrayBuffer()),
            filePassword.value,
          );
          if (!dialog.open) return;
          const summary = describeIdentity(identity);
          const problem = validityProblem(summary);
          if (problem) return fail(problem, file);
          result = { identity, summary };
        } else {
          if (!name.value.trim()) return fail('请输入用于签名的姓名。', name);
          // The address goes into the certificate, where readers show it as the signer's.
          email.value = email.value.trim();
          if (!email.checkValidity())
            return fail('请输入有效的电子邮箱地址，或留空。', email);
          if (newPassword.value.length < 6)
            return fail('身份证文件密码至少需要 6 个字符。', newPassword);
          const identity = await createSelfSignedId({
            name: name.value.trim(),
            email: email.value.trim(),
            organization: organization.value.trim(),
            keyType: keyType.value,
          });
          const p12 = await exportPkcs12(identity, newPassword.value);
          // Making a key takes a moment; a dialog cancelled meanwhile wants no ID file.
          if (!dialog.open) return;
          download(
            new Blob([p12], { type: 'application/x-pkcs12' }),
            `${name.value.trim().replace(/[\\/:*?"<>|]+/g, ' ')} 数字身份证.p12`,
          );
          result = { identity, summary: describeIdentity(identity) };
        }
        dialog.close();
      } catch (error) {
        if (dialog.open) {
          const message = errorText(error);
          fail(
            message,
            choice !== 'file' ? null : message === WRONG_PASSWORD ? filePassword : file,
          );
        }
      } finally {
        submit.disabled = false;
        if (dialog.open && !dialog.contains(document.activeElement)) submit.focus();
      }
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      choose();
    };
    const submit = button('继续', null, () => choose(), 'btn primary');
    const dialog = modal(
      '选择数字身份证',
      form,
      [button('取消', null, () => dialog.close()), submit],
      { signal },
    );
    dialog.addEventListener('close', () => resolve(result), { once: true });
    mode(identities.length ? 'existing' : 'file');
  });
}

/**
 * The details of a certificate signature. Resolves to `{ reason, location, contactInfo,
 * certify }` or null when cancelled.
 */
export function signatureDetailsDialog(summary, { certify = false, signal } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const reason = el('input', {
      class: 'input',
      maxlength: 200,
      value: certify ? '我是此文档的作者' : '',
    });
    const location = el('input', { class: 'input', maxlength: 120 });
    const contact = el('input', { class: 'input', maxlength: 120 });
    const level = el(
      'select',
      { class: 'input' },
      el('option', { value: '2' }, '允许表单填写与签名'),
      el('option', { value: '3' }, '允许表单填写、批注与签名'),
      el('option', { value: '1' }, '不允许任何更改'),
    );
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        {},
        `以 ${summary.commonName || '此数字身份证'} 签名${summary.email ? ` (${summary.email})` : ''}。`,
      ),
      field('sig-reason', '签名原因 (可选)', reason),
      field('sig-location', '签署地点 (可选)', location),
      field('sig-contact', '联系信息 (可选)', contact),
      certify && field('sig-certify', '认证后允许的更改', level),
      el(
        'p',
        { class: 'muted' },
        '签署后的 PDF 为当前屏幕上显示的版本。在此之后的任何编辑都会导致签名失效，因此请在完成所有编辑后再签名。',
      ),
    );
    const sign = () => {
      result = {
        reason: reason.value.trim(),
        location: location.value.trim(),
        contactInfo: contact.value.trim(),
        certify: certify ? Number(level.value) : undefined,
      };
      dialog.close();
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      sign();
    };
    const dialog = modal(
      certify ? '认证文档' : '使用证书签名',
      form,
      [
        button('取消', null, () => dialog.close()),
        button(certify ? '认证' : '签名', null, sign, 'btn primary'),
      ],
      { signal },
    );
    dialog.addEventListener('close', () => resolve(result), { once: true });
    reason.focus();
  });
}
