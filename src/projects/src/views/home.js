import { el, clear } from '../lib/dom.js';
import { icon } from '../ui/icons.js';
import { store, docBrief, TRASH_DAYS } from '../lib/store.js';
import { toast } from '../ui/toast.js';
import { openMenu } from '../ui/menu.js';
import { confirmDialog } from '../ui/modal.js';
import { openProjectForm } from '../ui/projectform.js';
import { menuButton } from '../ui/navdrawer.js';
import { sampleBanner } from '../ui/shell.js';
import { avatarStack, progressBar, emptyState } from '../ui/bits.js';
import { projectProgress, doneColumnIds } from '../lib/board.js';
import { dueStatus } from '../lib/dates.js';
import { projectHash } from '../lib/routes.js';
import { plainSummary } from '../lib/markdown.js';
import { orderedProjects } from '../lib/projects.js';

export function homeView({ navigate }) {
  const grid = el('div.project-grid');
  const archivedWrap = el('div');
  const banner = sampleBanner();

  const root = el('section.view.home-view', {},
    el('header.view-head', {},
      menuButton(),
      el('h1.view-title', {}, '项目'),
      el('button.btn.btn-primary', {
        html: icon('plus', 16, 2.2),
        onclick: () => openProjectForm({
          onDone: (p) => navigate(projectHash(p.id), { replace: true }),
        }),
      }, ' 新建项目')
    ),
    banner,
    grid,
    archivedWrap
  );

  function projectCard(entry) {
    const stats = el('div.card-stats', {}, el('span.skeleton', { style: { width: '60%' } }));
    const menuBtn = el('button.icon-btn.card-menu', {
      html: icon('more', 18, 2),
      'aria-label': `${entry.name} 的选项`,
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        openMenu(menuBtn, [
          { label: '编辑项目', icon: 'pencil', onClick: () => openProjectForm({ project: entry }) },
          {
            label: entry.pinned ? '取消置顶项目' : '置顶项目',
            icon: entry.pinned ? 'unpin' : 'pin',
            onClick: () => togglePinned(entry),
          },
          {
            label: '归档项目',
            icon: 'archive',
            onClick: async () => {
              try {
                await store.setProjectArchived(entry.id, true);
                toast('项目已归档', {
                  icon: 'archive',
                  duration: 7000,
                  action: {
                    label: '撤销',
                    onClick: () => store.setProjectArchived(entry.id, false).catch(() => {}),
                  },
                });
              } catch (err) {
                console.error(err);
                toast('无法保存，请检查网络连接', { icon: 'cloudOff' });
              }
            },
          },
          { label: '删除项目', icon: 'trash', danger: true, onClick: () => deleteProject(entry) },
        ]);
      },
    });

    // The fastest way to tell two similarly-named projects apart, so it sits
    // between the name and the numbers. Empty until the document arrives.
    const summary = el('p.project-card-brief', { hidden: true });

    const card = el('a.project-card', { href: `#/p/${entry.id}` },
      el('div.card-top', {},
        el('span.dot.dot-lg', { style: { background: entry.color }, 'aria-hidden': 'true' }),
        el('h2.project-card-title', {}, entry.name),
        entry.pinned && el('span.card-pin', {
          html: icon('pin', 13, 2.2),
          role: 'img',
          'aria-label': '已置顶',
          title: '已置顶到顶部',
        }),
        entry.sample && el('span.nav-tag', {}, '示例'),
        menuBtn
      ),
      summary,
      stats
    );

    // Stats need the full doc; render them as they arrive.
    store.loadProject(entry.id).then((doc) => {
      const { done, total } = projectProgress(doc);
      const doneIds = doneColumnIds(doc);
      const overdue = doc.tasks.filter((t) =>
        dueStatus(t.dueDate, doneIds.has(t.columnId)) === 'overdue').length;
      // Markdown flattened to one line: a card showing "## Goals - ship it"
      // would be worse than a card showing nothing.
      const brief = plainSummary(docBrief(doc), 120);
      summary.textContent = brief;
      summary.hidden = !brief;
      clear(stats);
      stats.append(
        progressBar(done, total, { label: `${entry.name}：已完成 ${done}/${total} 个任务` }),
        el('div.card-meta', {},
          el('span', {}, total ? `已完成 ${done}/${total} 个任务` : '暂无任务'),
          overdue > 0 && el('span.card-overdue', {}, `${overdue} 个已逾期`),
          el('span.grow'),
          avatarStack(doc.members, { size: 22 })
        )
      );
    }).catch(() => {
      clear(stats);
      stats.append(el('span.card-meta', {}, '无法加载此项目'));
    });

    return card;
  }

  async function togglePinned(entry) {
    try {
      await store.setProjectPinned(entry.id, !entry.pinned);
      toast(entry.pinned ? '已取消置顶项目' : '项目已置顶到顶部', {
        icon: entry.pinned ? 'unpin' : 'pin',
      });
    } catch (err) {
      console.error(err);
      toast('无法保存，请检查网络连接', { icon: 'cloudOff' });
    }
  }

  async function deleteProject(entry) {
    const ok = await confirmDialog({
      title: `删除“${entry.name}”？`,
      message: `该项目将移至回收站，可在 ${TRASH_DAYS} 天内恢复。`,
      confirmLabel: '删除项目',
    });
    if (!ok) return;
    try {
      await store.deleteProject(entry.id);
      toast('项目已移至回收站', {
        icon: 'trash',
        duration: 7000,
        action: {
          label: '撤销',
          onClick: () => store.restoreProject(entry.id).catch((err) => {
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

  /**
   * Archived projects collapse into their own section so a finished project
   * neither clutters the grid nor disappears.
   */
  function archivedSection(entries) {
    const rows = entries.map((entry) => el('a.archived-row', { href: projectHash(entry.id) },
      el('span.dot', { style: { background: entry.color }, 'aria-hidden': 'true' }),
      el('span.archived-name', {}, entry.name),
      el('button.btn.btn-ghost.btn-sm', {
        type: 'button',
        html: icon('unarchive', 14, 2),
        // One "Unarchive" per row, all identical without the project name.
        'aria-label': `取消归档 ${entry.name}`,
        onclick: async (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            await store.setProjectArchived(entry.id, false);
            toast('已取消归档项目', { icon: 'unarchive' });
          } catch (err) {
            console.error(err);
            toast('无法保存，请检查网络连接', { icon: 'cloudOff' });
          }
        },
      }, ' 取消归档')
    ));
    return el('details.archived-section', {
      // When everything is archived the section is the page, not an aside.
      open: entries.length === store.projects.length,
    },
      el('summary.archived-summary', {},
        el('span.archived-chevron', { html: icon('chevDown', 15, 2), 'aria-hidden': 'true' }),
        `已归档 (${entries.length})`
      ),
      el('div.archived-list', {}, rows)
    );
  }

  function render() {
    clear(grid);
    clear(archivedWrap);
    // One arrangement, not two that disagree: the grid follows the sidebar.
    const ordered = orderedProjects(store.projects);
    const active = ordered.filter((p) => !p.archived);
    const archived = ordered.filter((p) => p.archived);
    if (archived.length) archivedWrap.append(archivedSection(archived));
    if (!active.length && archived.length) {
      grid.append(emptyState({
        icon: 'archive',
        title: '所有项目均已归档',
        sub: '在下方取消归档一个项目以继续处理，或创建新项目。',
      }));
      return;
    }
    if (!store.projects.length) {
      grid.append(emptyState({
        icon: 'folder',
        title: '暂无项目',
        sub: '每个项目都包含一个看板、时间线和里程碑。',
        action: el('button.btn.btn-primary', {
          onclick: () => openProjectForm({
          onDone: (p) => navigate(projectHash(p.id), { replace: true }),
        }),
        }, '创建项目'),
      }));
      return;
    }
    for (const entry of active) grid.append(projectCard(entry));
  }

  const onChange = (e) => {
    if (e.detail?.scope === 'projects' || e.detail?.scope === 'doc') render();
  };
  store.addEventListener('change', onChange);
  root.destroy = () => {
    store.removeEventListener('change', onChange);
    banner.destroy();
  };

  render();
  return root;
}
