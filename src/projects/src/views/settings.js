import { el, clear } from '../lib/dom.js';
import { icon } from '../ui/icons.js';
import { radioGroupKeys } from '../ui/bits.js';
import { store, TRASH_DAYS } from '../lib/store.js';
import { applyTheme } from '../ui/theme.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/modal.js';
import { openOnboarding } from '../ui/onboarding.js';
import { openProjectTrash } from '../ui/trash.js';
import { openRestorePoints } from '../ui/restorepoints.js';
import { openMenu } from '../ui/menu.js';
import { exportBackup } from '../ui/backupactions.js';
import { importAnyFile } from '../ui/importfile.js';
import { openCalendarExport } from '../ui/calendarexport.js';
import { canSaveFiles } from '../lib/puterui.js';
import { openShortcuts, MOD_KEY } from '../ui/shortcuts.js';
import { menuButton } from '../ui/navdrawer.js';
import { notificationState, requestNotificationPermission } from '../ui/reminders.js';

export async function confirmSignOut() {
  const ok = await confirmDialog({
    title: '退出登录？',
    message: '您的数据将安全地保留在 Puter 账户中，下次登录时即可恢复。',
    confirmLabel: '退出登录',
    danger: false,
  });
  if (!ok) return;
  // Debounced writes must land before the session token goes away.
  await store.flushAll();
  if (store.dirty) {
    // The flush failed (offline?) — signing out now would silently discard
    // the very changes the dialog above promised were safe.
    const discard = await confirmDialog({
      title: '部分更改尚未保存',
      message: '您的最新更改无法同步到 Puter，如果现在退出登录将会丢失。请检查网络连接后重试，或仍然退出登录。',
      confirmLabel: '仍然退出登录',
    });
    if (!discard) return;
  }
  puter.auth.signOut();
  location.hash = '#/';
  location.reload();
}

export function settingsView() {
  const username = store.user?.username || 'Puter 用户';

  /* Appearance */
  const themeGroup = el('div.seg', { role: 'radiogroup', 'aria-label': '主题' });
  function renderTheme() {
    const current = store.settings.theme || 'system';
    themeGroup.replaceChildren(...[
      { value: 'light', label: '浅色', icon: 'sun' },
      { value: 'dark', label: '深色', icon: 'moon' },
      { value: 'system', label: '跟随系统', icon: 'monitor' },
    ].map((o) => el('button.seg-btn', {
      type: 'button',
      role: 'radio',
      'aria-checked': o.value === current ? 'true' : 'false',
      tabindex: o.value === current ? 0 : -1,
      className: `seg-btn${o.value === current ? ' active' : ''}`,
      html: icon(o.icon, 15, 2),
      onclick: () => {
        applyTheme(o.value);
        store.updateSettings({ theme: o.value }).catch(() => {});
        renderTheme();
      },
    }, el('span', {}, o.label))));
  }
  renderTheme();
  radioGroupKeys(themeGroup, '.seg-btn');

  /* Data */
  const exportBtn = el('button.btn.btn-ghost.btn-sm', {
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    html: icon('download', 15, 2),
    onclick: () => openMenu(exportBtn, [
      {
        label: '全部内容 (.zip)',
        icon: 'archive',
        onClick: () => exportBackup(exportBtn, { withAttachments: true }),
      },
      {
        label: '仅数据 (.json)',
        icon: 'fileText',
        onClick: () => exportBackup(exportBtn, { withAttachments: false }),
      },
      canSaveFiles() && 'sep',
      canSaveFiles() && {
        label: '保存 .zip 到 Puter…',
        icon: 'cloud',
        onClick: () => exportBackup(exportBtn, { withAttachments: true, toPuter: true }),
      },
    ]),
  }, ' 导出');

  const importBtn = el('button.btn.btn-ghost.btn-sm', {
    html: icon('upload', 15, 2),
    onclick: () => importInput.click(),
  }, ' 导入');

  const importInput = el('input', {
    type: 'file',
    accept: '.zip,.json,.csv,.tsv,application/json,application/zip,text/csv',
    style: { display: 'none' },
    onchange: async () => {
      const file = importInput.files?.[0];
      importInput.value = '';
      if (file) await importAnyFile(file, importBtn);
    },
  });

  /* Reminders: permission is asked for here and nowhere else, and the copy
     is honest that they only fire while the app is running. */
  const reminderControl = el('span.row');

  function reminderSub() {
    const state = notificationState();
    if (state === 'unsupported') return '当前浏览器不支持显示通知';
    if (state === 'granted') return '当应用处于打开状态或固定在标签页时将显示提醒';
    if (state === 'denied') return '已在浏览器设置中阻止。标签页标题中的计数仍会正常工作';
    return '提醒会在应用内显示；允许通知后，应用在后台运行时也能看到提醒';
  }

  function renderReminders() {
    const state = notificationState();
    clear(reminderControl);
    if (state === 'granted') {
      reminderControl.append(el('span.settings-state', {}, '已开启'));
    } else if (state === 'denied' || state === 'unsupported') {
      reminderControl.append(el('span.settings-state.muted', {},
        state === 'denied' ? '已阻止' : '不可用'));
    } else {
      reminderControl.append(el('button.btn.btn-ghost.btn-sm', {
        onclick: async () => {
          await requestNotificationPermission();
          renderReminders();
          const row = reminderControl.closest('.settings-row');
          const sub = row?.querySelector('.sub');
          if (sub) sub.textContent = reminderSub();
        },
      }, '允许'));
    }
  }
  renderReminders();

  /* The count is a discoverability cue: after a delete people look here. */
  const trashCount = store.deletedProjects.length;
  const trashBtn = el('button.btn.btn-ghost.btn-sm', {
    // Two rows in this section put an "Open" button on the right, and out of
    // that context — a screen reader's list of buttons, or a voice command —
    // the pair is indistinguishable. Each says which one it is, count and all.
    'aria-label': `打开已删除的项目${trashCount ? ` (${trashCount})` : ''}`,
    onclick: () => openProjectTrash(),
  }, trashCount ? `打开 (${trashCount})` : '打开');

  const section = (title, ...rows) => el('section.settings-section', {},
    el('h2.section-title', {}, title),
    el('div.settings-card', {}, rows));

  const row = ({ ic, title, sub, control }) => el('div.settings-row', {},
    el('span.settings-ic', { html: icon(ic, 19, 1.8) }),
    el('div.grow', {},
      el('div.title', {}, title),
      sub && el('div.sub', {}, sub)),
    control || null);

  return el('section.view.settings-view', {},
    el('header.view-head', {},
      menuButton(),
      el('a.icon-btn.back-btn', { href: '#/', 'aria-label': '所有项目', html: icon('arrowL', 20, 2) }),
      el('h1.view-title', {}, '设置')
    ),

    section('外观',
      row({ ic: 'monitor', title: '主题', sub: '跟随系统将采用您的设备设置', control: themeGroup })
    ),

    section('提醒',
      row({
        ic: 'bell',
        title: '到期任务提醒通知',
        sub: reminderSub(),
        control: reminderControl,
      })
    ),

    section('键盘',
      row({
        ic: 'help',
        title: '键盘快捷键',
        sub: `在任意位置按 ?，或按 ${MOD_KEY}+K 打开命令面板`,
        control: el('button.btn.btn-ghost.btn-sm', { onclick: () => openShortcuts() }, '查看'),
      })
    ),

    section('数据',
      row({
        ic: 'download',
        title: '导出全部数据',
        sub: '包含所有项目及其附件的 .zip 压缩包，或单独的 JSON 文件',
        control: exportBtn,
      }),
      row({
        ic: 'upload',
        title: '导入',
        sub: '本应用的备份、Trello 看板 JSON，或来自 Asana 及电子表格的 CSV。始终作为新项目添加',
        control: el('span.row', {}, importBtn, importInput),
      }),
      row({
        ic: 'calendarClock',
        title: '日历文件',
        sub: '包含所有截止日期与里程碑的 .ics 文件，适用于您常用的日历应用',
        control: el('button.btn.btn-ghost.btn-sm', {
          'aria-label': '导出日历文件',
          onclick: () => openCalendarExport(),
        }, '导出'),
      }),
      row({
        ic: 'history',
        title: '还原点',
        sub: '自动保留每个项目（包括已删除项目）的每日副本',
        control: el('button.btn.btn-ghost.btn-sm', {
          'aria-label': '打开还原点',
          onclick: () => openRestorePoints(),
        }, '打开'),
      }),
      row({
        ic: 'trashBin',
        title: '已删除的项目',
        sub: `删除后可在 ${TRASH_DAYS} 天内恢复`,
        control: trashBtn,
      }),
      store.settings.sampleData && row({
        ic: 'sparkle', title: '示例数据', sub: '清除示例项目并重新开始',
        control: el('button.btn.btn-ghost.btn-sm', {
          onclick: async () => {
            const ok = await confirmDialog({
              title: '重新开始？',
              message: '示例项目将被移除，您将从干净的工作区开始。',
              confirmLabel: '清除示例数据',
            });
            if (!ok) return;
            try {
              await store.wipeSampleData();
              location.hash = '#/';
              openOnboarding();
            } catch (err) {
              console.error(err);
              toast('无法清除，请检查网络连接', { icon: 'cloudOff' });
            }
          },
        }, '清除'),
      })
    ),

    section('账户',
      row({ ic: 'users', title: username, sub: '已通过 Puter 登录' }),
      // Inside the Puter desktop, the session belongs to the OS — no sign-out.
      puter.env !== 'app' && row({
        ic: 'logout', title: '退出登录', sub: '您的数据将保留在您的 Puter 账户中',
        control: el('button.btn.btn-ghost.btn-sm', { onclick: confirmSignOut }, '退出登录'),
      })
    ),

    section('关于',
      row({ ic: 'board', title: '项目管理', sub: '看板、时间线与里程碑。您的数据保存在您自己的 Puter 云端。' }),
      row({
        ic: 'cloud', title: '由 Puter 提供支持',
        control: el('a.btn.btn-ghost.btn-sm', { href: 'https://developer.puter.com', target: '_blank', rel: 'noopener' }, '了解更多'),
      })
    )
  );
}
