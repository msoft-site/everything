// Review and collaboration: the Comments panel and Comment tool (comments
// pinned to points or regions, in any document), Invite to Edit (a shared
// document edited live by several people) and Share for Review (a link that
// opens a lightweight review view). Everything heavy — Yjs, the room client,
// peer links, dialogs — loads on first use; see docs/collaboration.md.
import type { Editor } from '../../editor';
import { registerCommand, registerOverlay, registerPanel, registerTool } from '../../app/registry';
import { lazy, lazyPanel, lazyRun, lazyTool } from '../../app/lazy';
import { parseLink } from '../../collab/links';
import { commentsOf, commentsOverlay, dropLocalComments, sharedOf, view } from './state';

const share = lazy(() => import('./share'));
const tool = lazy(async () => (await import('./comment-tool')).commentTool);
const panel = lazy(async () => (await import('./comments-panel')).commentsPanel);

const owns = (e: Editor) => {
  const sh = sharedOf(e.session);
  return !sh || sh.role === 'owner';
};

export function installCollab(e: Editor) {
  registerOverlay('comments', commentsOverlay);
  registerOverlay('collab-presence', (ed) => sharedOf(ed.session)?.overlay(ed) ?? '');
  registerTool(lazyTool({ id: 'comment', label: '评论工具', key: 'I', icon: 'comment', group: 'eyedropper' }, tool));
  registerPanel(
    lazyPanel(
      {
        id: 'comments',
        title: '评论',
        icon: 'comment',
        location: 'strip',
        hidden: true,
        menu: () => ['comments.new', '-', 'view.show-comments', '-', 'file.share-for-review'],
      },
      panel,
    ),
  );
  registerCommand(
    {
      id: 'file.invite-to-edit',
      label: '邀请编辑…',
      description: '共享此文档以与其他协作者实时协作编辑',
      enabled: (ed) => ed.hasDocument && owns(ed) && !sharedOf(ed.session)?.review,
      recordable: false,
      ...lazyRun(share, (m, ed) => m.inviteToEdit(ed)),
    },
    {
      id: 'file.share-for-review',
      label: '共享以供审阅…',
      description: '创建链接以供他人查看并添加评论',
      enabled: (ed) => ed.hasDocument && owns(ed) && !sharedOf(ed.session)?.review,
      recordable: false,
      ...lazyRun(share, (m, ed) => m.shareForReview(ed)),
    },
    {
      id: 'file.stop-sharing',
      label: '停止共享…',
      description: '终止对所有人的共享；当前标签页将保留本地副本',
      enabled: (ed) => sharedOf(ed.session)?.role === 'owner',
      recordable: false,
      ...lazyRun(share, (m, ed) => m.stopSharing(ed)),
    },
    {
      id: 'comments.new',
      label: '新建评论',
      description: '选择评论工具：单击固定评论，拖动标记区域评论',
      enabled: (ed) => ed.hasDocument && commentsOf(ed).canComment(),
      recordable: false,
      run: (ed) => {
        ed.setTool('comment');
        if (!ed.dock.isVisible('comments')) ed.dock.show('comments');
      },
    },
    {
      id: 'view.show-comments',
      label: '评论',
      checked: () => !view.hidden,
      recordable: false,
      run: (ed) => {
        view.hidden = !view.hidden;
        ed.overlay();
      },
    },
  );
  e.closeHooks.push((s) => dropLocalComments(s));
  // A comment being placed, and the open thread, belong to the document they
  // were made in: switching documents puts them away.
  let shown = e.session;
  e.onUpdate((ed) => {
    if (ed.session === shown) return;
    shown = ed.session;
    if (!view.draft && !view.dragging && !view.selected) return;
    view.draft = view.dragging = null;
    view.selected = '';
    // Update hooks run after the panels and overlay were drawn.
    ed.overlay();
    ed.dock.update();
  });
  // Opening an invitation or review link (Photo Studio was opened with one,
  // or one was pasted into the address bar).
  const fromLink = () => {
    let link;
    try {
      link = parseLink(location.href);
    } catch (error) {
      e.message(error instanceof Error ? error.message : String(error));
      return;
    }
    if (!link) return;
    // The invitation stays out of the address bar (and browser history) once read.
    history.replaceState(null, '', location.pathname + location.search);
    void e.run(async () => (await share()).openLink(e, link));
  };
  e.whenReady(() => setTimeout(fromLink, 0));
  window.addEventListener('hashchange', fromLink);
}
