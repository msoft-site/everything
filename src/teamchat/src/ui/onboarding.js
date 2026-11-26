/**
 * First run: the user has no workspace yet. One decision: create one or join
 * one. Closing without choosing leaves an empty home with the same two
 * options, so nothing is lost.
 */
import { el } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';
import { store } from '../lib/store.js';
import { createWorkspaceDialog, joinWorkspaceDialog } from './dialogs.js';

export function shouldOnboard() {
  return store.workspaces.length === 0;
}

function choice({ icon: ic, title, sub, onClick }) {
  return el('button.onboard-choice', { type: 'button', onclick: onClick },
    el('span.onboard-icon', { html: icon(ic, 22) }),
    el('span.onboard-text', {}, el('strong', {}, title), el('span', {}, sub)),
    el('span', { html: icon('chevRight', 18), className: 'chev' }));
}

export function openOnboarding({ onClose } = {}) {
  const name = store.profile?.name || store.profile?.username || '用户';
  const body = el('div', {},
    el('p', { style: { color: 'var(--ink-2)', marginBottom: '16px' } },
      `你好 ${name}。团队聊天通过频道、话题和私信让团队沟通井然有序。你想从哪里开始？`),
    el('div.onboard-choices', {},
      choice({
        icon: 'building', title: '创建工作区', sub: '为您的团队创建协作空间并邀请成员加入',
        onClick: () => { modal.close(); createWorkspaceDialog(); },
      }),
      choice({
        icon: 'login', title: '通过邀请加入', sub: '粘贴来自团队成员的邀请码或加入链接',
        onClick: () => { modal.close(); joinWorkspaceDialog(); },
      })),
    el('p.small.muted', { style: { marginTop: '16px', textAlign: 'center' } }, '您可以稍后随时从工作区菜单中执行这些操作。'));
  const modal = openModal({ title: '欢迎使用团队聊天', content: body, onClose });
  return modal;
}

/** The empty home screen behind the onboarding modal. */
export function homeEmpty() {
  return el('div.auth-view', {},
    el('div.empty-icon', { html: icon('messages', 28), style: { width: '64px', height: '64px', borderRadius: '18px', background: 'var(--accent-wash)', color: 'var(--accent-strong)' } }),
    el('h1.auth-title', { style: { fontSize: '24px', marginTop: '8px' } }, '暂无工作区'),
    el('p.auth-sub', {}, '创建一个新工作区，或通过邀请链接加入。'),
    el('div.onboard-choices', { style: { width: '100%', maxWidth: '420px', textAlign: 'left' } },
      choice({ icon: 'building', title: '创建工作区', sub: '为您的团队创建协作空间', onClick: () => createWorkspaceDialog() }),
      choice({ icon: 'login', title: '通过邀请加入', sub: '粘贴邀请码或加入链接', onClick: () => joinWorkspaceDialog() })),
    el('p.auth-note', {}, '运行平台：本地环境'));
}
