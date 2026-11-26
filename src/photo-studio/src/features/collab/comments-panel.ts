// Comments panel: review threads of the active document, filtered (open,
// resolved, mine, all), with replies, @mentions, resolve and reopen, edits
// and removal of one's own messages, and a click to zoom to a pin.
import './collab.css';
import type { Editor } from '../../editor';
import type { Panel } from '../../app/registry';
import { svg } from '../../app/icons';
import { escapeXML } from '../../model/assets';
import { isRegion, LIMITS, type CommentFilter, type CommentThread } from '../../collab/comments';
import { commentsOf, sharedOf, view, visibleThreads } from './state';
import { formDialog } from '../../ui/dialog';
import { formatShortcut } from '../../app/shortcuts';

// Mod+Enter sends from any comment field.
const sendKeys = () => formatShortcut('Mod+Enter');

const filters: [CommentFilter, string][] = [
  ['open', '未解决'],
  ['resolved', '已解决'],
  ['mine', '我的'],
  ['all', '全部'],
];
// Message being edited, and unsent replies by thread (kept across redraws).
let editing = '';
const replies = new Map<string, string>();
let draftText = '';

function when(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return '刚刚';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  return new Date(t).toLocaleDateString();
}
/** Message text with @mentions marked (escaped). */
export function richText(text: string) {
  return escapeXML(text).replace(/(^|[^\w@])@([A-Za-z0-9._-]{1,64})/g, (_, pre, name) => `${pre}<span class="comment-mention">@${name}</span>`);
}
/** Names that can be mentioned: people in a shared document. */
function mentionable(e: Editor): string[] {
  return sharedOf(e.session)?.people?.() ?? [];
}

function threadHtml(e: Editor, t: CommentThread, n: number) {
  const store = commentsOf(e);
  const me = store.me().id;
  const selected = view.selected === t.id;
  const first = t.messages.find((m) => !m.deleted) ?? t.messages[0];
  const where = isRegion(t.anchor) ? `区域 ${t.anchor.width} × ${t.anchor.height}` : `坐标点 ${t.anchor.x}, ${t.anchor.y}`;
  const head = `<div class="comment-head" data-open="${t.id}"><button class="comment-number" data-locate="${t.id}" title="在画布上显示 (${where})" aria-label="评论 ${n}：在画布上显示">${n}</button><span class="comment-author">${escapeXML(t.author.name)}</span><span class="muted comment-time">${when(t.created)}</span>${t.resolved ? `<span class="comment-badge" title="由 ${escapeXML(t.resolved.by.name)} 解决">${svg('check', 12)}已解决</span>` : ''}<span class="panel-tabs-spacer"></span><button class="icon-button comment-toggle" data-open="${t.id}" aria-expanded="${selected}" aria-label="${selected ? '折叠' : '展开'}评论 ${n}" title="${selected ? '折叠' : '展开评论'}">${svg(selected ? 'chevron-down' : 'chevron-right', 14)}</button></div>`;
  if (!selected) {
    const more = t.messages.filter((m) => !m.deleted).length - 1;
    return `<li class="comment-thread${t.resolved ? ' resolved' : ''}" data-thread="${t.id}">${head}<div class="comment-text" data-open="${t.id}">${first ? (first.deleted ? '<em class="muted">已删除</em>' : richText(first.text)) : ''}</div>${more > 0 ? `<div class="muted comment-replies">${more} 条回复</div>` : ''}</li>`;
  }
  const can = store.canComment();
  const owner = sharedOf(e.session)?.role === 'owner' || !store.shared;
  const msgs = t.messages
    .map((m) => {
      if (m.deleted) return `<div class="comment-message removed muted"><em>消息已删除</em></div>`;
      const mine = m.author.id === me;
      const actions =
        can && (mine || owner)
          ? `<span class="comment-actions">${mine ? `<button class="icon-button" data-edit="${m.id}" aria-label="编辑消息" title="编辑">${svg('pen-line', 13)}</button>` : ''}<button class="icon-button" data-remove="${m.id}" aria-label="删除消息" title="删除">${svg('trash-2', 13)}</button></span>`
          : '';
      const body =
        editing === m.id
          ? `<textarea class="comment-input" data-editing="${m.id}" aria-label="编辑消息" maxlength="${LIMITS.text}">${escapeXML(m.text)}</textarea><div class="comment-buttons"><button data-cancel-edit>取消</button><button class="primary" data-save-edit="${m.id}" title="保存 (${sendKeys()})">保存</button></div>`
          : `<div class="comment-text">${richText(m.text)}${m.edited ? ' <span class="muted">(已编辑)</span>' : ''}</div>`;
      return `<div class="comment-message"><div class="comment-meta"><span class="comment-author">${escapeXML(m.author.name)}</span><span class="muted comment-time">${when(m.created)}</span>${actions}</div>${body}</div>`;
    })
    .join('');
  const reply = can
    ? `<textarea class="comment-input" data-reply="${t.id}" aria-label="回复" placeholder="回复… (输入 @ 提及他人)" maxlength="${LIMITS.text}">${escapeXML(replies.get(t.id) ?? '')}</textarea><div class="comment-suggest" data-suggest-for="reply"></div><div class="comment-buttons"><button data-resolve="${t.id}">${svg(t.resolved ? 'rotate-ccw' : 'check', 13)}${t.resolved ? '重新打开' : '标记为解决'}</button>${t.author.id === me || owner ? `<button data-remove-thread="${t.id}" aria-label="删除评论" title="删除评论">${svg('trash-2', 13)}</button>` : ''}<span class="panel-tabs-spacer"></span><button class="primary" data-send="${t.id}" title="回复 (${sendKeys()})">回复</button></div>`
    : '';
  return `<li class="comment-thread selected${t.resolved ? ' resolved' : ''}" data-thread="${t.id}">${head}${msgs}${reply}</li>`;
}

function panelHtml(e: Editor) {
  const store = commentsOf(e);
  const all = store.threads().filter((t) => !t.deleted);
  const list = visibleThreads(e);
  const number = new Map(all.map((t, i) => [t.id, i + 1]));
  const tabs = filters.map(([f, label]) => `<button data-filter="${f}" aria-pressed="${view.filter === f}">${label}</button>`).join('');
  const can = store.canComment() && e.hasDocument;
  const draft = view.draft
    ? `<div class="comment-draft"><div class="muted">新评论位于 ${view.draft.width ? `${view.draft.width} × ${view.draft.height} 区域` : `坐标点 ${view.draft.x}, ${view.draft.y}`}</div><textarea class="comment-input" id="comment-draft" aria-label="新评论" placeholder="撰写评论… (输入 @ 提及他人)" maxlength="${LIMITS.text}">${escapeXML(draftText)}</textarea><div class="comment-suggest" data-suggest-for="draft"></div><div class="comment-buttons"><button data-cancel-draft>取消</button><span class="panel-tabs-spacer"></span><button class="primary" data-post title="发表评论 (${sendKeys()})">发表评论</button></div></div>`
    : '';
  const empty = !e.hasDocument
    ? '<p class="muted">打开文档即可查看和添加评论。</p>'
    : all.length
      ? `<p class="muted">没有${view.filter === 'all' ? '' : `${filters.find(([f]) => f === view.filter)![1]} `}评论。</p>`
      : `<p class="muted">暂无评论。${can ? ' 选择“新建评论”，然后单击图像以放置图钉，或拖动以对区域进行评论。' : ''}</p>`;
  const sh = sharedOf(e.session);
  const scope = sh ? `<p class="muted comment-scope">${sh.role === 'viewer' ? '您可以查看此共享文档中的评论。' : '此文档中的所有协作者都可以看到评论。'}</p>` : '';
  return `<div class="comments-head"><div class="comments-filter" role="group" aria-label="显示评论">${tabs}</div><button class="icon-button" data-command="comments.new" title="新建评论" aria-label="新建评论" ${can ? '' : 'disabled'}>${svg('comment-add', 16)}</button></div>${draft}${list.length ? `<ul class="comments-list">${list.map((t) => threadHtml(e, t, number.get(t.id) ?? 0)).join('')}</ul>` : view.draft ? '' : empty}${scope}`;
}

/** Center the view on a thread's pin (and fit a region) and open it. */
export function revealThread(e: Editor, id: string, zoom = true) {
  const t = commentsOf(e).threads().find((x) => x.id === id);
  if (!t) return;
  view.selected = id;
  if (zoom) {
    const vp = e.viewportSize();
    const fit = isRegion(t.anchor) ? Math.min(32, Math.max(0.05, Math.min((vp.width * 0.6) / t.anchor.width!, (vp.height * 0.6) / t.anchor.height!))) : e.zoom;
    const cx = t.anchor.x + (t.anchor.width ?? 0) / 2,
      cy = t.anchor.y + (t.anchor.height ?? 0) / 2;
    e.zoomBy(fit, undefined, undefined, [cx, cy]);
  }
  e.overlay();
  e.dock.update();
}
export function focusComposer(e: Editor) {
  // The panel may still be mounting (it loads on first use), so wait for the
  // field rather than leave focus on the canvas, where typing would run tool
  // shortcuts. Timers, not animation frames, so a background tab works too.
  let tries = 0;
  const attempt = () => {
    const field = e.root.querySelector<HTMLTextAreaElement>('#comment-draft');
    if (field) field.focus();
    else if (view.draft && ++tries < 40) setTimeout(attempt, 25);
  };
  setTimeout(attempt, 0);
}

function suggest(e: Editor, input: HTMLTextAreaElement) {
  const box = input.parentElement?.querySelector<HTMLElement>(`.comment-suggest`);
  if (!box) return;
  const before = input.value.slice(0, input.selectionStart ?? input.value.length);
  const m = /(?:^|[^\w@])@([A-Za-z0-9._-]{0,64})$/.exec(before);
  const names = m ? mentionable(e).filter((n) => n.toLowerCase().startsWith(m[1].toLowerCase()) && n !== commentsOf(e).me().name).slice(0, 6) : [];
  box.innerHTML = names.map((n) => `<button type="button" data-mention="${escapeXML(n)}">@${escapeXML(n)}</button>`).join('');
}

export const commentsPanel: Pick<Panel, 'mount' | 'update' | 'menu'> = {
  mount: (e, el) => {
    el.classList.add('comments-panel');
    const run = (fn: () => void) => {
      try {
        fn();
      } catch (error) {
        e.message(error instanceof Error ? error.message : String(error));
      }
      delete el.dataset.key;
      e.overlay();
      e.dock.update();
    };
    el.addEventListener('input', (ev) => {
      const t = ev.target as HTMLTextAreaElement;
      if (t.id === 'comment-draft') draftText = t.value;
      if (t.dataset.reply) replies.set(t.dataset.reply, t.value);
      if (t.matches('.comment-input')) suggest(e, t);
    });
    el.addEventListener('keydown', (ev) => {
      const t = ev.target as HTMLElement;
      // Mod+Enter sends; Escape leaves the field.
      if (t.matches('.comment-input') && ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        const send = t.closest('.comment-draft')?.querySelector<HTMLButtonElement>('[data-post]') ?? t.parentElement?.querySelector<HTMLButtonElement>('[data-send],[data-save-edit]');
        send?.click();
      }
    });
    el.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      const store = commentsOf(e);
      const get = (attr: string) => target.closest<HTMLElement>(`[data-${attr}]`)?.dataset[attr.replace(/-(\w)/g, (_, c) => c.toUpperCase())];
      const mention = get('mention');
      if (mention) {
        const input = target.closest('.comment-thread,.comment-draft')?.querySelector<HTMLTextAreaElement>('.comment-input');
        if (input) {
          const at = input.selectionStart ?? input.value.length;
          const before = input.value.slice(0, at).replace(/@([A-Za-z0-9._-]{0,64})$/, `@${mention} `);
          input.value = before + input.value.slice(at);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
          input.setSelectionRange(before.length, before.length);
        }
        return;
      }
      const filter = get('filter');
      if (filter) return run(() => (view.filter = filter as CommentFilter));
      const locate = get('locate');
      if (locate) return run(() => revealThread(e, locate));
      const open = get('open');
      if (open) return run(() => (view.selected = view.selected === open ? '' : open));
      if (target.closest('[data-cancel-draft]')) return run(() => ((view.draft = null), (draftText = '')));
      if (target.closest('[data-post]')) {
        const text = draftText.trim();
        if (!text || !view.draft) return;
        return run(() => {
          const t = store.add(view.draft!, text, e.selected || undefined);
          view.draft = null;
          draftText = '';
          view.selected = t.id;
          if (view.filter === 'resolved') view.filter = 'open';
        });
      }
      const send = get('send');
      if (send) {
        const text = (replies.get(send) ?? '').trim();
        if (!text) return;
        return run(() => {
          store.reply(send, text);
          replies.delete(send);
        });
      }
      const resolve = get('resolve');
      if (resolve) return run(() => store.resolve(resolve, !store.threads().find((t) => t.id === resolve)?.resolved));
      const removeThread = get('remove-thread');
      if (removeThread) {
        void formDialog('删除评论？', [], '删除', '此评论及其所有回复将对可以看到此文档的所有人移除。').then(
          (ok) =>
            ok &&
            run(() => {
              store.remove(removeThread);
              view.selected = '';
            }),
        );
        return;
      }
      const thread = target.closest<HTMLElement>('[data-thread]')?.dataset.thread;
      const remove = get('remove');
      if (remove && thread) return run(() => store.remove(thread, remove));
      const edit = get('edit');
      if (edit) return run(() => (editing = edit));
      if (target.closest('[data-cancel-edit]')) return run(() => (editing = ''));
      const save = get('save-edit');
      if (save && thread) {
        const text = el.querySelector<HTMLTextAreaElement>(`[data-editing="${save}"]`)?.value.trim();
        if (!text) return;
        return run(() => {
          store.edit(thread, save, text);
          editing = '';
        });
      }
    });
  },
  update: (e, el) => {
    const store = commentsOf(e);
    const key = JSON.stringify([e.session.id, store.version, store.threads().length, view.filter, view.selected, view.draft, editing, e.hasDocument, store.canComment(), sharedOf(e.session)?.role]);
    if (el.dataset.key === key) return;
    // Keep typing undisturbed: redraw once the field loses focus.
    const focused = el.contains(document.activeElement) && document.activeElement?.matches('textarea');
    if (focused && el.dataset.session === e.session.id && el.dataset.selected === view.selected && !!el.querySelector('#comment-draft') === !!view.draft) {
      el.addEventListener('focusout', () => setTimeout(() => !el.contains(document.activeElement) && e.dock.update(), 0), { once: true });
      return;
    }
    el.dataset.key = key;
    el.dataset.session = e.session.id;
    el.dataset.selected = view.selected;
    el.innerHTML = panelHtml(e);
    el.querySelector('.comment-thread.selected')?.scrollIntoView({ block: 'nearest' });
  },
  menu: () => ['comments.new', '-', 'view.show-comments', '-', 'file.share-for-review'],
};
