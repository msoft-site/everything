import { el, clear } from '../lib/dom.js';
import { icon } from '../ui/icons.js';
import { store, docTrash, docArchive, TRASH_DAYS } from '../lib/store.js';
import { toast } from '../ui/toast.js';
import { openMenu } from '../ui/menu.js';
import { confirmDialog, promptDialog } from '../ui/modal.js';
import { openProjectForm } from '../ui/projectform.js';
import { openDuplicateProject } from '../ui/duplicateproject.js';
import { openExportProject } from '../ui/exportproject.js';
import { openCalendarExport } from '../ui/calendarexport.js';
import { openMembersLabels } from '../ui/memberslabels.js';
import { openTaskTrash } from '../ui/trash.js';
import { openTaskArchive } from '../ui/archive.js';
import { openRestorePoints } from '../ui/restorepoints.js';
import { menuButton } from '../ui/navdrawer.js';
import { offlineNotice } from '../ui/offlinebar.js';
import { boardView } from './board.js';
import { timelineView } from './timeline.js';
import { milestonesView } from './milestones.js';
import { listView } from './list.js';

const TABS = [
  { key: 'board', label: '看板', icon: 'board', hash: (id) => `#/p/${id}` },
  { key: 'list', label: '列表', icon: 'listTodo', hash: (id) => `#/p/${id}/list` },
  { key: 'timeline', label: '时间线', icon: 'timeline', hash: (id) => `#/p/${id}/timeline` },
  { key: 'milestones', label: '里程碑', icon: 'flag', hash: (id) => `#/p/${id}/milestones` },
];

export function projectView({ id, tab, navigate }) {
  const entry = store.projectEntry(id);
  const body = el('div.project-body', {},
    el('div.view-loading', { role: 'status', 'aria-label': '正在加载项目' },
      el('span.spinner'))
  );

  /* Save indicator: quiet when clean, "Saving" pulse while a write is
     pending, "Not saved" once a write has failed (the retry toast handles
     recovery). aria-live keeps screen readers informed without spam.

     Every question it asks is about *this* project. The store is dirty
     whenever any project is, and plenty of them are written without anyone
     looking: the reminder pass stamps what it raised, opening a project
     catches up its recurring work and sweeps its trash, and a bulk edit from
     All tasks spans boards. Reading the global flag here made this header
     announce another project's write, and another project's failure. */
  const saveDot = el('span.save-state', { role: 'status', 'aria-live': 'polite' });
  let saveFailed = false;
  function renderSaveState() {
    const pending = store.hasPendingSave(id);
    const stale = store.hasConflict(id);
    const offline = !stale && store.offline;
    const failed = !stale && !offline && saveFailed && pending;
    saveDot.textContent = stale ? '已在别处更改'
      : offline ? '离线'
      : failed ? '未保存'
      : pending ? '保存中' : '';
    saveDot.classList.toggle('busy', pending && !failed && !stale && !offline);
    saveDot.classList.toggle('failed', failed);
    saveDot.classList.toggle('stale', stale || offline);
    saveDot.title = stale
      ? '此项目已在其他位置保存；请选择要保留的副本'
      : offline
        ? '无网络连接。更改已保存在当前设备上，将在恢复连接后同步'
        : '';
  }

  const menuBtn = el('button.icon-btn', {
    html: icon('more', 20, 2),
    'aria-label': '项目选项',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    onclick: () => {
      const doc = store.getDoc(id);
      const trashed = docTrash(doc).length;
      const archived = docArchive(doc).length;
      const entry = store.projectEntry(id);
      openMenu(menuBtn, [
        { label: '编辑项目', icon: 'pencil', onClick: () => openProjectForm({ project: entry }) },
        {
          label: entry?.pinned ? '取消置顶项目' : '置顶项目',
          icon: entry?.pinned ? 'unpin' : 'pin',
          onClick: () => togglePinned(!entry?.pinned),
        },
        { label: '成员与标签', icon: 'users', onClick: () => openMembersLabels(id) },
        {
          label: archived ? `已归档任务 (${archived})` : '已归档任务',
          icon: 'archive',
          disabled: !doc,
          onClick: () => openTaskArchive(id),
        },
        {
          label: trashed ? `回收站 (${trashed})` : '回收站',
          icon: 'trashBin',
          disabled: !doc,
          onClick: () => openTaskTrash(id),
        },
        'sep',
        {
          label: '复制项目',
          icon: 'copy',
          onClick: () => openDuplicateProject(id),
        },
        {
          label: '保存为模板',
          icon: 'template',
          onClick: saveAsTemplate,
        },
        {
          label: '还原点',
          icon: 'history',
          onClick: () => openRestorePoints({ projectId: id }),
        },
        {
          label: '导出项目…',
          icon: 'download',
          onClick: () => openExportProject(id),
        },
        {
          label: '日历文件 (.ics)…',
          icon: 'calendarClock',
          onClick: () => openCalendarExport({ projectId: id }),
        },
        {
          label: '打印此视图…',
          icon: 'fileText',
          // The browser's own dialog is already a PDF writer; the app's job is
          // to hand it a page worth printing (see styles/print.css).
          onClick: () => window.print(),
        },
        'sep',
        {
          label: entry?.archived ? '取消归档项目' : '归档项目',
          icon: entry?.archived ? 'unarchive' : 'archive',
          onClick: () => toggleArchived(!entry?.archived),
        },
        { label: '删除项目', icon: 'trash', danger: true, onClick: deleteProject },
      ]);
    },
  });

  const title = el('h1.view-title.project-title', {}, entry?.name || '');

  const tabsNav = el('nav.tabs', { 'aria-label': '项目视图' },
    TABS.map((t) => el('a.tab', {
      href: t.hash(id),
      className: `tab${t.key === tab ? ' active' : ''}`,
      'aria-current': t.key === tab ? 'page' : null,
      html: icon(t.icon, 16, 2),
    }, el('span', {}, t.label)))
  );

  /* Offline is a state to name, not to hide: the view says which copy it is
     showing, and how much is still only on this device. Shared with the
     cross-project list, so both say it the same way. */
  const offlineBar = offlineNotice();

  /* Paper has no sidebar to say which project this is, and no tab strip to
     say when it was printed. */
  const printHead = el('div.print-head');
  function renderPrintHead() {
    const current = store.projectEntry(id);
    printHead.textContent = `${current?.name ?? ''} · ${TABS.find((t) => t.key === tab)?.label ?? ''}`
      + ` · 打印于 ${new Date().toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      })}`;
  }
  renderPrintHead();

  const root = el('section.view.project-view', {},
    printHead,
    el('header.view-head.project-head', {},
      menuButton(),
      el('a.icon-btn.back-btn', { href: '#/', 'aria-label': '所有项目', html: icon('arrowL', 20, 2) }),
      el('span.dot', { style: { background: entry?.color }, 'aria-hidden': 'true' }),
      title,
      saveDot,
      el('span.grow'),
      menuBtn
    ),
    tabsNav,
    offlineBar,
    body
  );
  // The save chip has to speak for the state the view is *mounted* in, not
  // only for the next event: switching tab while offline (or while a conflict
  // is unresolved) rebuilds this header, and a blank chip beside a visible
  // offline bar reads as "everything is fine". (The bar renders itself.)
  renderSaveState();

  async function saveAsTemplate() {
    const suggested = store.projectEntry(id)?.name || '模板';
    const name = await promptDialog({
      title: '保存为模板',
      label: '模板名称',
      value: suggested,
      confirmLabel: '保存模板',
    });
    if (!name) return;
    try {
      await store.saveTemplate(id, name);
      toast('模板已保存，可在创建项目时选择', { icon: 'template' });
    } catch (err) {
      console.error(err);
      toast('无法保存模板，请检查网络连接', { icon: 'cloudOff' });
    }
  }

  async function togglePinned(pinned) {
    try {
      await store.setProjectPinned(id, pinned);
      toast(pinned ? '项目已置顶到顶部' : '已取消置顶项目', {
        icon: pinned ? 'pin' : 'unpin',
      });
    } catch (err) {
      console.error(err);
      toast('无法保存，请检查网络连接', { icon: 'cloudOff' });
    }
  }

  async function toggleArchived(archived) {
    try {
      await store.setProjectArchived(id, archived);
      if (archived) {
        // Leave the board: an archived project is out of the way by design.
        navigate('#/');
        toast('项目已归档', {
          icon: 'archive',
          duration: 7000,
          action: {
            label: '撤销',
            onClick: () => store.setProjectArchived(id, false).catch(() => {}),
          },
        });
      } else {
        toast('已取消归档项目', { icon: 'unarchive' });
      }
    } catch (err) {
      console.error(err);
      toast('无法保存，请检查网络连接', { icon: 'cloudOff' });
    }
  }

  async function deleteProject() {
    const current = store.projectEntry(id);
    const ok = await confirmDialog({
      title: `删除“${current?.name}”？`,
      message: `该项目将移至回收站，可在 ${TRASH_DAYS} 天内恢复。`,
      confirmLabel: '删除项目',
    });
    if (!ok) return;
    try {
      await store.deleteProject(id);
      navigate('#/');
      toast('项目已移至回收站', {
        icon: 'trash',
        duration: 7000,
        action: {
          label: '撤销',
          onClick: () => store.restoreProject(id).catch((err) => {
            console.error(err);
            toast('无法恢复，请检查网络连接', { icon: 'cloudOff' });
          }),
        },
      });
    } catch (err) {
      console.error(err);
      toast('无法删除，请检查网络连接', { icon: 'cloudOff' });
    }
  }

  let inner = null;
  /* Switching tab destroys this view and builds the next one, which can
     easily happen while the document is still being read. Building the inner
     view anyway would attach a board nobody can see: its store listener, its
     window-level drag listeners and its `n` shortcut would all outlive it —
     and the shortcut, registered last, would win over the live view's. */
  let destroyed = false;
  store.loadProject(id).then(() => {
    if (destroyed) return;
    clear(body);
    inner =
      tab === 'timeline' ? timelineView({ projectId: id, navigate })
      : tab === 'milestones' ? milestonesView({ projectId: id, navigate })
      : tab === 'list' ? listView({ projectId: id, navigate })
      : boardView({ projectId: id, navigate });
    body.append(inner);
  }).catch((err) => {
    if (destroyed) return;
    console.error(err);
    clear(body);
    body.append(el('div.empty', {},
      el('div.empty-icon', { html: icon('cloudOff', 28) }),
      el('h3', {}, '无法加载此项目'),
      el('p', {}, '请检查网络连接后重试。'),
      el('button.btn.btn-primary', { onclick: () => location.reload() }, '重新加载')
    ));
  });

  const onChange = (e) => {
    if (e.detail?.scope === 'projects') {
      const p = store.projectEntry(id);
      if (p) {
        title.textContent = p.name;
        root.querySelector('.project-head .dot').style.background = p.color;
        renderPrintHead();
      }
    }
  };
  /* Only this project's write events move the chip; another project's are
     none of this header's business. */
  const mine = (e) => e.detail?.projectId === id;
  const onSaving = (e) => { if (mine(e)) { saveFailed = false; renderSaveState(); } };
  const onSaved = (e) => { if (mine(e)) { saveFailed = false; renderSaveState(); } };
  const onSaveError = (e) => { if (mine(e)) { saveFailed = true; renderSaveState(); } };
  const onConflict = (e) => { if (mine(e)) renderSaveState(); };
  const onConnection = () => renderSaveState();
  store.addEventListener('change', onChange);
  store.addEventListener('saving', onSaving);
  store.addEventListener('saved', onSaved);
  store.addEventListener('save-error', onSaveError);
  store.addEventListener('conflict', onConflict);
  store.addEventListener('connection', onConnection);
  store.addEventListener('outbox', onConnection);

  root.destroy = () => {
    destroyed = true;
    inner?.destroy?.();
    offlineBar.destroy();
    store.removeEventListener('change', onChange);
    store.removeEventListener('saving', onSaving);
    store.removeEventListener('saved', onSaved);
    store.removeEventListener('save-error', onSaveError);
    store.removeEventListener('conflict', onConflict);
    store.removeEventListener('connection', onConnection);
    store.removeEventListener('outbox', onConnection);
  };
  return root;
}
