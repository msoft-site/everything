// Invite to Edit, Share for Review, access management, Stop Sharing and
// opening invitation links. Sharing deploys (or reuses) a room worker in the
// owner's account, uploads the document there and turns the tab into
// a shared document.
import * as Y from 'yjs';
import type { Editor } from '../../editor';
import { svg } from '../../app/icons';
import { escapeXML } from '../../model/assets';
import { formDialog } from '../../ui/dialog';
import { call, deploy } from '../../collab/api';
import { RoomClient } from '../../collab/client';
import { TileIndex } from '../../collab/tile-index';
import { INVITE_ROLES, roleLabel, shareLink, type RoomLink } from '../../collab/protocol';
import { collabPuter } from '../../collab/puter-types';
import { commentsOf, shared, sharedOf } from './state';
import { CollabSession, openShared, outboxStore, renderBar, type Member } from './session';

const activeShared = (e: Editor) => {
  const sh = sharedOf(e.session);
  return sh instanceof CollabSession ? sh : undefined;
};
const bytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export async function inviteToEdit(e: Editor) {
  const cs = activeShared(e) ?? (await startSharing(e, 'edit'));
  if (cs) await accessDialog(e, cs, 'edit');
}
export async function shareForReview(e: Editor) {
  const cs = activeShared(e) ?? (await startSharing(e, 'review'));
  if (cs) await accessDialog(e, cs, 'review');
}

async function startSharing(e: Editor, purpose: 'edit' | 'review'): Promise<CollabSession | undefined> {
  const s = e.session;
  const tiles = s.assets.tiles;
  const ok = await formDialog(
    purpose === 'edit' ? '邀请编辑' : '共享以供审阅',
    [],
    '开始共享',
    `${purpose === 'edit' ? '您邀请的人可以与您实时共同编辑此文档；每人只能撤销自己的更改。' : '审阅者可以缩放和平移查看此文档并发表评论；他们不能更改文档。'}\n\n共享将在您的本地账户中设置协作服务并将文档存储在此处（压缩前约 ${bytes(tiles.bytes)} 像素）。所有人打开链接时登录本地账户。\n\n当前标签页将成为共享文档，早期的撤销历史将被清除。`,
  );
  if (!ok) return;
  const puter = collabPuter();
  if (!puter.auth.isSignedIn()) await puter.auth.signIn();
  e.transform.apply();
  e.modal?.apply();
  const user = await puter.auth.getUser();
  const server = await deploy(puter, (text) => e.message(text));
  const ydoc = new Y.Doc();
  const index = new TileIndex(tiles);
  // Comments made here before sharing become the owner's.
  const me = { id: user.uuid, name: user.username };
  const comments = structuredClone(commentsOf(e, s).threads()).map((t) => ({
    ...t,
    author: t.author.id.startsWith('local:') ? me : t.author,
    resolved: t.resolved ? { ...t.resolved, by: t.resolved.by.id.startsWith('local:') ? me : t.resolved.by } : null,
    messages: t.messages.map((m) => (m.author.id.startsWith('local:') ? { ...m, author: me } : m)),
  }));
  const room = await RoomClient.create({ puter, server, tiles: index, assets: s.assets, doc: s.doc, comments, ydoc }, (f) => e.message(`正在上传文档… ${Math.round(f * 100)}%`));
  const client = new RoomClient({ puter, server, room, tiles: index, assets: s.assets, store: outboxStore(), ydoc });
  await client.join();
  return openShared(e, { server, room }, { target: s, client });
}

/** Invitation links, invitations by username and the people with access. */
async function accessDialog(e: Editor, cs: CollabSession, purpose: 'edit' | 'review') {
  if (cs.role !== 'owner') {
    e.message('只有所有者才能邀请他人加入此文档。');
    return;
  }
  const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
  const req = <T,>(input: Record<string, unknown>) => call<T>(cs.client.o.puter, cs.link.server, { room: cs.link.room, ...input });
  const roles = purpose === 'edit' ? INVITE_ROLES : INVITE_ROLES.filter((r) => r !== 'editor');
  const roleOptions = (selected: string, list = roles) => list.map((r) => `<option value="${r}" ${r === selected ? 'selected' : ''}>${escapeXML(roleLabel(r))}</option>`).join('');
  const days = `<option value="1">1 天</option><option value="7" selected>7 天</option><option value="30">30 天</option>`;
  dialog.innerHTML = `<form method="dialog" class="collab-dialog"><h2>${purpose === 'edit' ? '邀请编辑' : '共享以供审阅'}</h2>
<p class="muted">${purpose === 'edit' ? '任何拥有邀请链接的人都可以根据该链接授予的权限加入。需要账户。' : '审阅链接将打开审阅视图：具有缩放、平移和评论功能，无编辑工具。审阅者登录后即可查看。'}</p>
<section aria-labelledby="collab-link-title"><h3 id="collab-link-title">邀请链接</h3>
<div class="collab-row"><label>权限 <select name="role">${roleOptions(purpose === 'edit' ? 'editor' : 'commenter')}</select></label><label>有效期 <select name="days">${days}</select></label><button type="button" data-act="link">${svg('link', 14)}创建链接</button></div>
<div class="collab-row collab-link" hidden><input readonly aria-label="邀请链接" spellcheck="false"><button type="button" data-act="copy">${svg('copy', 14)}复制</button></div></section>
${purpose === 'edit' ? `<section aria-labelledby="collab-user-title"><h3 id="collab-user-title">按用户名邀请</h3><div class="collab-row"><input name="username" placeholder="用户名" aria-label="用户名" spellcheck="false" autocomplete="off"><select name="userrole" aria-label="权限">${roleOptions('editor')}</select><button type="button" data-act="user" disabled>邀请</button></div><p class="muted collab-small">然后向他们发送文档链接（在共享状态旁边的成员列表中点击“复制链接”）；他们登录后即可打开。</p></section>` : ''}
<section aria-labelledby="collab-members-title"><h3 id="collab-members-title">拥有访问权限的人员</h3><ul class="collab-members"><li class="muted">正在加载…</li></ul><div class="collab-row"><span class="muted collab-invites"></span><span class="panel-tabs-spacer"></span><button type="button" data-act="revoke">撤销所有邀请链接</button></div></section>
<p class="collab-error" role="alert" hidden></p>
<div class="dialog-actions"><button class="primary" value="done">完成</button></div></form>`;
  const form = dialog.querySelector('form')!;
  const error = (text = '') => {
    const p = form.querySelector<HTMLElement>('.collab-error')!;
    p.textContent = text;
    p.hidden = !text;
  };
  const value = (name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';
  const refresh = async () => {
    const res = await req<{ members: (Member & { expires?: number | null })[]; named: { username: string; role: string; expires: number }[]; invites: number }>({ op: 'members' });
    cs.members = res.members;
    const expiry = (m: { expires?: number | null }) => {
      const left = m.expires ? Math.round((m.expires - Date.now()) / 86_400_000) : null;
      const opt = (v: string, label: string, sel = false) => `<option value="${v}" ${sel ? 'selected' : ''}>${label}</option>`;
      return `${opt('', '永不过期', !m.expires)}${m.expires ? opt('keep', `截至 ${new Date(m.expires).toLocaleDateString()}`, true) : ''}${opt('1', '1 天', false)}${opt('7', '7 天', false)}${opt('30', '30 天', false)}${left !== null && left < 0 ? '' : ''}`;
    };
    form.querySelector('.collab-members')!.innerHTML =
      res.members
        .map((m) =>
          m.role === 'owner'
            ? `<li><span class="collab-member-name">${escapeXML(m.username)}</span><span class="muted">所有者</span></li>`
            : `<li data-member="${escapeXML(m.uuid)}"><span class="collab-member-name">${escapeXML(m.username)}</span><select data-member-role aria-label="${escapeXML(m.username)} 的权限">${roleOptions(m.role, INVITE_ROLES)}</select><select data-member-expiry aria-label="${escapeXML(m.username)} 的权限过期时间">${expiry(m)}</select><button type="button" class="icon-button" data-act="remove" aria-label="移除 ${escapeXML(m.username)}" title="移除访问权限">${svg('trash-2', 14)}</button></li>`,
        )
        .join('') + res.named.map((n) => `<li><span class="collab-member-name">${escapeXML(n.username)}</span><span class="muted">${escapeXML(roleLabel(n.role))} · 已邀请，尚未加入</span></li>`).join('');
    form.querySelector('.collab-invites')!.textContent = res.invites ? `${res.invites} 个有效邀请链接` : '无有效邀请链接';
    // Nothing to revoke without active links (the text beside it says so).
    form.querySelector<HTMLButtonElement>('[data-act="revoke"]')!.disabled = !res.invites;
    renderBar(e);
  };
  const act = async (fn: () => Promise<unknown>) => {
    error();
    try {
      await fn();
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
    }
  };
  form.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const a = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!a) return;
    if (a === 'link')
      void act(async () => {
        const role = value('role');
        const res = await req<{ token: string }>({ op: 'invite', role, review: purpose === 'review', days: Number(value('days')) });
        // Live updates for the people invited; the link works either way.
        void cs.client.allowLiveUpdates();
        const link: RoomLink = { server: cs.link.server, room: cs.link.room, token: res.token, review: purpose === 'review' };
        const row = form.querySelector<HTMLElement>('.collab-link')!;
        row.hidden = false;
        const input = row.querySelector('input')!;
        input.value = shareLink(location.href, link);
        input.select();
        await refresh();
      });
    if (a === 'copy') {
      const input = form.querySelector<HTMLInputElement>('.collab-link input')!;
      void navigator.clipboard?.writeText(input.value).then(
        () => e.message('邀请链接已复制。'),
        () => input.select(),
      );
    }
    if (a === 'user')
      void act(async () => {
        await req({ op: 'invite-user', username: value('username').trim(), role: value('userrole') });
        void cs.client.allowLiveUpdates();
        form.querySelector<HTMLInputElement>('[name="username"]')!.value = '';
        form.querySelector<HTMLButtonElement>('[data-act="user"]')!.disabled = true;
        await refresh();
      });
    if (a === 'revoke')
      void act(async () => {
        await req({ op: 'revoke-invites' });
        form.querySelector<HTMLElement>('.collab-link')!.hidden = true;
        await refresh();
      });
    if (a === 'remove') {
      const uuid = t.closest<HTMLElement>('[data-member]')!.dataset.member!;
      void act(async () => {
        await req({ op: 'role', uuid, role: 'removed' });
        await refresh();
      });
    }
  });
  // Invite by username needs a name.
  form.addEventListener('input', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.name === 'username') form.querySelector<HTMLButtonElement>('[data-act="user"]')!.disabled = !t.value.trim();
  });
  form.addEventListener('keydown', (ev) => {
    // Enter in the username field invites (rather than closing the dialog).
    const t = ev.target as HTMLInputElement;
    if (ev.key === 'Enter' && t.name === 'username') {
      ev.preventDefault();
      form.querySelector<HTMLButtonElement>('[data-act="user"]:not(:disabled)')?.click();
    }
  });
  form.addEventListener('change', (ev) => {
    const t = ev.target as HTMLSelectElement;
    const uuid = t.closest<HTMLElement>('[data-member]')?.dataset.member;
    if (!uuid) return;
    if (t.matches('[data-member-role]')) void act(async () => req({ op: 'role', uuid, role: t.value }));
    if (t.matches('[data-member-expiry]') && t.value !== 'keep') void act(async () => req({ op: 'role', uuid, expires: t.value ? Date.now() + Number(t.value) * 86_400_000 : null }).then(refresh));
  });
  const closed = new Promise<void>((resolve) => dialog.addEventListener('close', () => resolve(), { once: true }));
  dialog.showModal();
  void act(refresh);
  await closed;
}

export async function stopSharing(e: Editor) {
  const cs = activeShared(e);
  if (!cs || cs.role !== 'owner') return;
  if (!(await formDialog('停止共享？', [], '停止共享', '所有人将失去访问权限，他们打开的副本将停止更新。\n\n当前标签页将保留该文档及其评论作为本地副本；请保存它以持久化存储。'))) return;
  await call(cs.client.o.puter, cs.link.server, { op: 'stop', room: cs.link.room });
  cs.toLocal('共享已停止。当前标签页保留本地副本。');
}

/** Open an invitation or review link (Photo Studio was opened with one). */
export async function openLink(e: Editor, link: RoomLink) {
  for (const [s, h] of shared)
    if (h instanceof CollabSession && h.link.room === link.room) {
      await e.switchSession(s);
      return;
    }
  const puter = collabPuter();
  if (!puter.auth.isSignedIn()) {
    const ok = await formDialog(link.review ? '打开以供审阅' : '打开共享文档', [], '登录', '此链接将打开一个共享文档。请使用本地账户登录以加入协作。');
    if (!ok) return;
    await puter.auth.signIn();
  }
  await openShared(e, link, { review: link.review });
}
