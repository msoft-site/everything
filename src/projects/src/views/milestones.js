import { el, clear, requireValue } from '../lib/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../lib/store.js';
import { milestoneProgress, doneColumnIds, columnTasks } from '../lib/board.js';
import { todayISO, diffDays, fmtLong, isValidISO } from '../lib/dates.js';
import { fieldId } from '../lib/util.js';
import { openMenu } from '../ui/menu.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { openTaskSheet } from '../ui/tasksheet.js';
import { progressBar, emptyState } from '../ui/bits.js';

export function milestonesView({ projectId }) {
  const list = el('div.milestone-list');
  // Which rows are expanded, kept outside the row DOM so it survives the
  // full rebuild that any doc mutation (e.g. "Mark as reached") triggers.
  const expanded = new Set();
  const root = el('div.milestones-wrap', {},
    el('div.row.row-between.milestones-head', {},
      el('p.form-hint.grow', {}, '里程碑用于标记关键节点日期。可在任务详情面板中将任务关联到里程碑。'),
      el('button.btn.btn-primary.btn-sm', {
        html: icon('plus', 14, 2.2),
        onclick: () => openMilestoneForm(),
      }, ' 添加里程碑')
    ),
    list
  );

  const doc = () => store.getDoc(projectId);

  function dueLabel(m, today) {
    if (m.done) return { text: '已达成', cls: 'done' };
    const d = diffDays(today, m.date);
    if (d < 0) return { text: `已逾期 ${-d} 天`, cls: 'overdue' };
    if (d === 0) return { text: '今天', cls: 'soon' };
    if (d <= 7) return { text: `${d} 天后`, cls: 'soon' };
    return { text: `${d} 天后`, cls: '' };
  }

  function milestoneRow(m) {
    const d = doc();
    const today = todayISO();
    const { done, total } = milestoneProgress(d.tasks, m.id, doneColumnIds(d));
    const due = dueLabel(m, today);
    const tasks = d.tasks.filter((t) => t.milestoneId === m.id);

    const menuBtn = el('button.icon-btn', {
      html: icon('more', 18, 2),
      'aria-label': `${m.name} 的选项`,
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      onclick: (e) => {
        e.stopPropagation();
        openMenu(menuBtn, [
          { label: '编辑里程碑', icon: 'pencil', onClick: () => openMilestoneForm(m) },
          {
            label: m.done ? '标记为未达成' : '标记为已达成', icon: 'check',
            onClick: () => store.updateMilestone(projectId, m.id, { done: !m.done }),
          },
          'sep',
          {
            label: '删除里程碑', icon: 'trash', danger: true,
            // No confirm: the toast explains what happened to its tasks and
            // undoes the whole thing.
            onClick: () => {
              const removed = store.deleteMilestone(projectId, m.id);
              if (!removed) return;
              const n = removed.taskIds.length;
              toast(n
                ? `里程碑已删除。已保留 ${n} 个任务并解除了里程碑关联`
                : '里程碑已删除', {
                icon: 'trash',
                duration: 7000,
                action: {
                  label: '撤销',
                  onClick: () => store.restoreMilestone(projectId, removed),
                },
              });
            },
          },
        ]);
      },
    });

    const isOpen = expanded.has(m.id);
    const taskList = el('div.milestone-tasks', { hidden: !isOpen },
      tasks.length
        ? columnOrdered(d, tasks).map((t) => {
          const isDone = doneColumnIds(d).has(t.columnId);
          return el('button.milestone-task', {
            type: 'button',
            onclick: () => openTaskSheet(projectId, t.id),
          },
            el('span.milestone-task-ic', {
              html: icon(isDone ? 'taskDone' : 'circleDashed', 15, 2),
              className: `milestone-task-ic${isDone ? ' done' : ''}`,
            }),
            el('span', { className: isDone ? 'done-text' : '' }, t.title)
          );
        })
        : el('p.form-hint', {}, '暂无关联任务。可在任意任务详情面板中选择此里程碑。')
    );

    const chevron = el('span.chevron', {
      html: icon('chevDown', 17, 2), 'aria-hidden': 'true',
      className: `chevron${isOpen ? ' open' : ''}`,
    });
    const toggle = el('button.milestone-summary', {
      type: 'button',
      'aria-expanded': String(isOpen),
      onclick: () => {
        const open = taskList.hidden;
        taskList.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        chevron.classList.toggle('open', open);
        if (open) expanded.add(m.id); else expanded.delete(m.id);
      },
    },
      el(`span.milestone-flag${m.done ? '.done' : ''}`, { html: icon(m.done ? 'check' : 'flag', 16, 2) }),
      el('div.milestone-main', {},
        el('div.milestone-title-row', {},
          el('h3.milestone-name', {}, m.name),
          el(`span.milestone-due.${due.cls}`, {}, due.text)
        ),
        el('div.milestone-date', {}, fmtLong(m.date)),
        m.description && el('p.milestone-desc', {}, m.description),
        el('div.milestone-progress', {},
          progressBar(done, total, { label: `${m.name}：已完成 ${done}/${total} 个任务` }),
          el('span.milestone-count', {}, total ? `${done}/${total}` : '暂无任务'))
      ),
      chevron
    );

    return el('article.milestone', {}, el('div.milestone-row', {}, toggle, menuBtn), taskList);
  }

  /** Tasks in board order: column by column, then card order. */
  function columnOrdered(d, tasks) {
    const ids = new Set(tasks.map((t) => t.id));
    const out = [];
    for (const col of d.columns) {
      for (const t of columnTasks(d.tasks, col.id)) if (ids.has(t.id)) out.push(t);
    }
    return out;
  }

  function openMilestoneForm(m = null) {
    const nameId = fieldId('milestone-name');
    const dateId = fieldId('milestone-date');
    const descId = fieldId('milestone-desc');
    const nameInput = el('input.input', {
      id: nameId, type: 'text', value: m?.name || '', placeholder: '例如：公开发布',
      maxLength: 80, required: true,
    });
    const dateInput = el('input.input', {
      id: dateId, type: 'date', value: m?.date || '', required: true,
    });
    const descInput = el('textarea.input', {
      id: descId, rows: 3, value: m?.description || '',
      placeholder: '达成该里程碑意味着什么？',
    });

    const form = el('form', {
      onsubmit: (e) => {
        e.preventDefault();
        // `required` catches an empty field; a name of only spaces gets past it
        // and would otherwise leave the button looking broken.
        const name = requireValue(nameInput, '里程碑需要填写名称。');
        if (!name) return;
        if (!isValidISO(dateInput.value)) { dateInput.focus(); return; }
        const fields = { name, date: dateInput.value, description: descInput.value.trim() };
        if (m) store.updateMilestone(projectId, m.id, fields);
        else store.addMilestone(projectId, fields);
        modal.close();
      },
    },
      el('div.field', {}, el('label.label', { htmlFor: nameId }, '名称'), nameInput),
      el('div.field', {}, el('label.label', { htmlFor: dateId }, '日期'), dateInput),
      el('div.field', {}, el('label.label', { htmlFor: descId }, '描述（可选）'), descInput),
      el('div.row.row-end', {},
        el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'),
        el('button.btn.btn-primary', { type: 'submit' }, m ? '保存更改' : '添加里程碑')
      )
    );
    const modal = openModal({
      title: m ? '编辑里程碑' : '新建里程碑',
      content: form,
      dismissOnBack: true,
    });
  }

  function render() {
    const d = doc();
    if (!d) return;
    clear(list);
    if (!d.milestones.length) {
      list.append(emptyState({
        icon: 'flag',
        title: '暂无里程碑',
        sub: '设计冻结、测试版、正式发布日：为项目设定明确的目标日期。',
        action: el('button.btn.btn-primary', { onclick: () => openMilestoneForm() }, '添加里程碑'),
      }));
      return;
    }
    const sorted = [...d.milestones].sort((a, b) =>
      (a.done - b.done) || String(a.date).localeCompare(String(b.date)));
    for (const m of sorted) list.append(milestoneRow(m));
  }

  const onChange = (e) => {
    if (e.detail?.scope === 'doc' && e.detail.projectId === projectId) render();
  };
  store.addEventListener('change', onChange);
  root.destroy = () => store.removeEventListener('change', onChange);

  render();
  return root;
}
