/**
 * The Share dialog: invite people by Local username or email address with a
 * role (can edit, can comment, can view), copy a link that admits whoever
 * opens it with a chosen role, see and change who has access, send a copy of
 * the document by email (Word or PDF), and stop sharing.
 *
 * Sharing starts with the first invitation or link: until then nothing leaves
 * this device. `api` is the editor's collaboration controller (collab.js).
 */
import { el, isComposing } from '../ui/dom.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { EMAIL } from '../lib/mail-send.js';
import { roleLabel, INVITE_ROLES, initials } from '../collab/protocol.js';

const ROLE_HINTS = { editor: '可以更改文本和格式', commenter: '可以阅读和添加批注', viewer: '仅可阅读' };

const roleSelect = (value, label, onchange, { owner = false, remove = false } = {}) => {
  const select = el('select.input.sh-role', { 'aria-label': label, onchange: () => onchange(select.value) },
    ...(owner ? [el('option', { value: 'owner' }, '所有者')] : []),
    ...INVITE_ROLES.map(role => el('option', { value: role, title: ROLE_HINTS[role] }, roleLabel(role))),
    ...(remove ? [el('option', { value: 'removed' }, '移除访问权限')] : []));
  select.value = value;
  return select;
};

export function openShareDialog(api) {
  const live = () => api.live();
  const status = el('p.sh-status', { role: 'status', 'aria-live': 'polite' });
  const say = (text, error = false) => { status.textContent = text || ''; status.classList.toggle('is-error', !!error); };
  const busy = async (button, label, fn) => {
    const text = button.textContent;
    button.disabled = true; button.textContent = label;
    try { return await fn(); }
    catch (e) { say(e?.message || String(e), true); return null; }
    finally { button.disabled = false; button.textContent = text; }
  };

  /* ---- Invite ---- */
  const people = el('input.input', { type: 'text', placeholder: api.local ? '本地共享不可用' : '云端用户名或电子邮件地址', 'aria-label': '邀请人员', autocomplete: 'off', disabled: api.local,
    // Enter that confirms an input method's conversion belongs to it, not to Invite.
    onkeydown: e => { if (e.key === 'Enter' && !isComposing(e)) { e.preventDefault(); invite.click(); } } });
  let inviteRole = 'editor';
  const inviteRoleSelect = roleSelect(inviteRole, '被邀请人员的权限', v => { inviteRole = v; });
  const note = el('textarea.input.sh-note', { rows: 1, placeholder: '添加附言（可选）', 'aria-label': '发给被邀请人员的消息', disabled: api.local });
  const invite = el('button.btn.btn-primary', { type: 'button', disabled: api.local, onclick: () => busy(invite, '正在邀请…', async () => {
    const names = people.value.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    if (!names.length) { say('请输入至少一个云端用户名或电子邮件地址。', true); people.focus(); return; }
    const bad = names.filter(n => !EMAIL.test(n) && !/^@?[A-Za-z0-9._-]{1,64}$/.test(n));
    if (bad.length) { say(`“${bad[0]}”既不是有效的用户名也不是电子邮件地址。`, true); return; }
    await api.ensureShared(text => say(text));
    const emailed = [], invited = [], failed = [];
    for (const name of names) {
      if (EMAIL.test(name)) {
        const result = await api.emailInvitation(name, inviteRole, note.value.trim());
        (result.ok ? emailed : failed).push(result.ok ? name : `${name}: ${result.message}`);
      } else {
        await live().inviteUser(name.replace(/^@/, ''), inviteRole);
        invited.push(name.replace(/^@/, ''));
      }
    }
    people.value = ''; note.value = '';
    const parts = [];
    if (invited.length) parts.push(`${invited.join(', ')} 登录云端后即可通过链接打开此文档。`);
    if (emailed.length) parts.push(`已向 ${emailed.join(', ')} 发送邀请。`);
    if (failed.length) parts.push(`未发送: ${failed.join('; ')}`);
    say(parts.join(' '), !!failed.length);
    if (invited.length) await copyInviteLink(inviteRole, { quiet: true });
    renderAccess();
  }) }, '邀请');
  // Only the owner invites people and makes links (the room refuses anyone else): someone invited is told so up front.
  const ownerOnly = el('p.sh-muted', { hidden: true });
  const inviteSection = el('section.sh-section', {},
    el('h3.sh-heading', {}, '邀请人员'),
    ownerOnly,
    el('div.sh-row', {}, people, inviteRoleSelect),
    note,
    el('div.sh-row.sh-row-end', {}, el('span.field-hint', {}, api.local ? '此文档保存在本地设备上：使用下方链接与此浏览器的其他标签页共享。' : '人员需登录云端打开此文档。邀请链接在七天后过期。'), invite));

  /* ---- Link ---- */
  let linkRole = 'editor';
  const linkRoleSelect = roleSelect(linkRole, '获得链接人员的操作权限', v => { linkRole = v; });
  const copy = el('button.btn.btn-outline', { type: 'button', onclick: () => copyInviteLink(linkRole) }, '复制链接');
  async function copyInviteLink(role, { quiet = false } = {}) {
    return busy(copy, '正在准备…', async () => {
      await api.ensureShared(text => say(text));
      const url = await live().inviteLink(role);
      linkField.value = url; linkField.hidden = false;
      try { await navigator.clipboard.writeText(url); if (!quiet) say(`链接已复制。任何打开此链接的人${role === 'editor' ? '都可以编辑' : role === 'commenter' ? '都可以批注' : '都可以查看'}${api.local ? '（在此浏览器中）' : '（需登录云端）'}。`); }
      catch { if (!quiet) say('请复制下方链接。'); linkField.select(); }
      renderAccess();
      return url;
    });
  }
  const linkField = el('input.input.sh-link', { readOnly: true, hidden: true, 'aria-label': '邀请链接', onfocus: e => e.target.select() });
  const revoke = el('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => busy(revoke, '正在停用…', async () => { await live()?.revokeLinks(); linkField.hidden = true; say('之前的链接和邀请不再允许新人加入。已加入的人员保留其权限。'); }) }, '停用旧链接');
  const linkSection = el('section.sh-section', {},
    el('h3.sh-heading', {}, '共享链接'),
    el('div.sh-row', {}, el('span.sh-link-label', {}, '获得链接的人员'), linkRoleSelect, copy),
    linkField,
    el('div.sh-row', {}, revoke));

  /* ---- Access ---- */
  const access = el('div.sh-access', { role: 'list', 'aria-label': '具有访问权限的人员' });
  // Each change reloads the list; when reloads overlap, only the latest one's answer is shown.
  let accessRequest = 0;
  async function renderAccess() {
    const request = ++accessRequest;
    const session = live();
    const guest = !!session && !session.local && !session.canManage;
    revoke.hidden = !session || session.local || guest;
    stop.hidden = !session || !session.canManage;
    ownerOnly.hidden = !guest;
    ownerOnly.textContent = guest ? `只有拥有此文档的 ${session.ownerName || '所有者'} 才能邀请人员或共享链接。` : '';
    for (const control of [people, inviteRoleSelect, note, invite]) control.disabled = !!api.local || guest;
    for (const control of [linkRoleSelect, copy]) control.disabled = guest;
    if (!session) { access.replaceChildren(el('p.sh-muted', {}, '仅您自己。邀请人员或复制链接即可开始协同编辑。')); return; }
    access.replaceChildren(el('p.sh-muted', {}, '正在加载…'));
    let data;
    try { data = await session.members(); } catch (e) { if (request === accessRequest) access.replaceChildren(el('p.sh-muted', {}, e.message)); return; }
    if (request !== accessRequest) return;
    const here = new Set(session.people().map(p => p.name));
    const rows = data.members.map(m => el('div.sh-person', { role: 'listitem' },
      el('span.sh-avatar', { 'aria-hidden': 'true' }, initials(m.username)),
      el('span.sh-name', {}, m.username, here.has(m.username) ? el('span.sh-here', {}, ' · 当前在此') : null),
      m.role === 'owner' || !session.canManage || session.local ? el('span.sh-role-text', {}, roleLabel(m.role))
        : roleSelect(m.role, `${m.username} 的权限`, async role => {
          if (role === 'removed' && !await confirmDialog({ title: '移除访问权限？', message: `${m.username} 将无法再打开此文档。`, confirmLabel: '移除' })) { renderAccess(); return; }
          try { await session.setRole(m.uuid, role); say(role === 'removed' ? `${m.username} 不再具有访问权限。` : `${m.username} 现在具有${roleLabel(role)}权限。`); } catch (e) { say(e.message, true); }
          renderAccess();
        }, { remove: true })));
    for (const n of data.named || []) if (!data.members.some(m => m.username.toLowerCase() === n.username.toLowerCase())) rows.push(el('div.sh-person.is-pending', { role: 'listitem' },
      el('span.sh-avatar', { 'aria-hidden': 'true' }, initials(n.username)), el('span.sh-name', {}, n.username, el('span.sh-here', {}, ' · 已邀请')), el('span.sh-role-text', {}, roleLabel(n.role))));
    access.replaceChildren(...rows);
  }
  const accessSection = el('section.sh-section', {}, el('h3.sh-heading', {}, '具有访问权限的人员'), access);

  /* ---- Send a copy ---- */
  const to = el('input.input', { type: 'email', placeholder: '电子邮件地址', 'aria-label': '发送副本至', autocomplete: 'email' });
  const format = el('select.input.sh-role', { 'aria-label': '副本格式' }, el('option', { value: 'docx' }, 'Word 文档 (.docx)'), el('option', { value: 'pdf' }, 'PDF 文档 (.pdf)'));
  const send = el('button.btn.btn-outline', { type: 'button', onclick: () => busy(send, '正在发送…', async () => {
    const address = to.value.trim();
    if (!EMAIL.test(address)) { say('请输入接收副本的电子邮件地址。', true); to.focus(); return; }
    const result = await api.sendCopy(address, format.value, note.value.trim());
    if (result.ok) { say(`已向 ${address} 发送副本。`); to.value = ''; } else say(result.message, true);
  }) }, '发送副本');
  const download = el('button.btn.btn-ghost', { type: 'button', onclick: () => api.downloadCopy(format.value) }, '改为下载');
  const copySection = el('details.sh-section.sh-copy', {},
    el('summary.sh-heading', {}, '通过电子邮件发送副本'),
    el('div.sh-row', {}, to, format),
    el('div.sh-row.sh-row-end', {}, el('span.field-hint', {}, api.canEmail ? '将从您的云端邮箱以附件形式发送。副本不会随文档的更改而变化。' : '此环境暂不支持直接发送邮件；请下载副本后自行添加附件。'), download, send));
  send.disabled = !api.canEmail; to.disabled = !api.canEmail;

  /* ---- Footer ---- */
  const stop = el('button.btn.btn-ghost.sh-stop', { type: 'button', onclick: async () => {
    if (!await confirmDialog({ title: '停止共享？', message: '其他所有人将失去访问权限，其打开的副本将停止更新。文档仍归您所有。', confirmLabel: '停止共享' })) return;
    await busy(stop, '正在停止…', async () => { await live()?.stop(); say('已停止共享。'); renderAccess(); });
  } }, '停止共享');
  const done = el('button.btn.btn-primary', { type: 'button', onclick: () => modal.close() }, '完成');
  const content = el('div.ed-dialog-body.sh-dialog', {}, inviteSection, linkSection, accessSection, copySection, status, el('div.modal-actions', {}, stop, done));
  const modal = openModal({ title: `共享“${api.documentName() || '无标题文档'}”`, content, onClose: () => api.onClose?.() });
  renderAccess();
  queueMicrotask(() => (api.local ? copy : people).focus());
  return modal;
}

/** A short line for toasts about a role. */
export const roleSentence = role => ({ owner: '您是此文档的所有者。', editor: '您可以编辑此文档。', commenter: '您可以批注此文档。', viewer: '您可以查看此文档。' })[role] || '';
