// Keyboard shortcuts: every command that has keys, read live from the
// command registry, plus the keys the editing surfaces handle themselves
// (KEYBOARD_EDITING), grouped by area and filterable by name or key.

import { h } from '../lib/dom.js';
import { openDialog } from '../ui/dialog.js';
import { formatKeys } from '../commands/registry.js';

const SCOPES = { playlist: '播放列表', pianoRoll: '钢琴卷帘', rack: '通道机架', mixer: '混音器', browser: '浏览器', typingKeyboard: '电脑键盘演奏' };
const PREFIXES = {
  file: '文件', edit: '编辑', transport: '走带控制', view: '窗口', patterns: '样式', add: '添加',
  options: '选项', theme: '选项', tools: '工具', help: '帮助', project: '文件',
};
const ORDER = ['文件', '编辑', '走带控制', '窗口', '样式', '添加', '选项', '工具', '帮助', '其他', '菜单与窗口', ...Object.values(SCOPES)];

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/** Keys handled by the editing surfaces and the shell rather than by commands: { scope, label, keys }. */
export const KEYBOARD_EDITING = [
  { scope: '菜单与窗口', label: '聚焦菜单栏', keys: ['F10'] },
  { scope: '菜单与窗口', label: '打开当前焦点项的上下文菜单', keys: ['Shift+F10'] },
  { scope: '菜单与窗口', label: '关闭菜单、对话框或编辑器窗口；取消拖拽', keys: ['Escape'] },
  { scope: 'pianoRoll', label: '移动光标或选中的音符', keys: ARROWS },
  { scope: 'pianoRoll', label: '将选中的音符按八度移动', keys: ['Shift+ArrowUp', 'Shift+ArrowDown'] },
  { scope: 'pianoRoll', label: '修改选中音符的长度', keys: ['Shift+ArrowLeft', 'Shift+ArrowRight'] },
  { scope: 'pianoRoll', label: '修改选中音符的力度', keys: ['Alt+ArrowUp', 'Alt+ArrowDown'] },
  { scope: 'pianoRoll', label: '在光标处添加音符，或编辑选中的音符', keys: ['Enter'] },
  { scope: 'pianoRoll', label: '选择下一个或上一个音符', keys: ['Tab', 'Shift+Tab'] },
  { scope: 'rack', label: '在步进格与控件之间移动', keys: ARROWS },
  { scope: 'rack', label: '从旋钮在单元格之间移动', keys: ['Mod+ArrowLeft', 'Mod+ArrowRight', 'Mod+ArrowUp', 'Mod+ArrowDown'] },
  { scope: 'rack', label: '切换当前焦点步进格的开关', keys: ['Space', 'Enter'] },
  { scope: 'rack', label: '修改当前焦点步进格的力度', keys: ['Shift+ArrowUp', 'Shift+ArrowDown'] },
  { scope: 'rack', label: '打开乐器编辑器（在通道名称上）', keys: ['Enter'] },
  { scope: 'rack', label: '跳转到当前行的第一个或最后一个步进格', keys: ['Home', 'End'] },
  { scope: 'playlist', label: '选择下一个或上一个片段', keys: ['Tab', 'Shift+Tab'] },
  { scope: 'playlist', label: '移动选中的片段或光标', keys: ARROWS },
  { scope: 'playlist', label: '移动光标', keys: ['Alt+ArrowLeft', 'Alt+ArrowRight', 'Alt+ArrowUp', 'Alt+ArrowDown'] },
  { scope: 'playlist', label: '修改选中片段的长度', keys: ['Shift+ArrowLeft', 'Shift+ArrowRight'] },
  { scope: 'playlist', label: '打开光标处的片段，或放置选中的素材源', keys: ['Enter'] },
  { scope: 'typingKeyboard', label: '弹奏音符：Z 至 M（低八度），Q 至 P（高八度）。开启时，这些按键将用于弹奏音符而非触发快捷键', keys: ['Z', 'Q'] },
];

/** Groups [{ title, items: [{ id, label, keys: string[] }] }] for a search query (pure). */
export function shortcutGroups(commands, query = '', extras = []) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map();
  const add = (title, id, label, combos) => {
    const keys = combos.map(formatKeys);
    const hay = `${label} ${title} ${keys.join(' ')} ${combos.join(' ')}`.toLowerCase();
    if (words.length && !words.every((w) => hay.includes(w))) return;
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push({ id, label, keys });
  };
  for (const c of commands.all()) {
    if (!c.keys?.length) continue;
    const title = c.scope && c.scope !== 'global' ? SCOPES[c.scope] || c.scope : PREFIXES[c.id.split('.')[0]] || '其他';
    add(title, c.id, c.longLabel || commands.label(c.id), c.keys);
  }
  extras.forEach((x, i) => add(SCOPES[x.scope] || x.scope, `keys.${i}`, x.label, x.keys));
  return [...groups.entries()]
    .sort((a, b) => (ORDER.indexOf(a[0]) + 1 || 99) - (ORDER.indexOf(b[0]) + 1 || 99))
    .map(([title, items]) => ({ title, items }));
}

export async function openShortcuts(app) {
  const search = h('input.input.sc-search', { type: 'search', placeholder: '搜索快捷键', 'aria-label': '搜索快捷键', autocomplete: 'off', spellcheck: false });
  const list = h('div.sc-list');
  const count = h('div.sr-only', { 'aria-live': 'polite' });
  const render = () => {
    const groups = shortcutGroups(app.commands, search.value, KEYBOARD_EDITING);
    list.replaceChildren();
    if (!groups.length) list.append(h('p.faint.sc-empty', '没有匹配的快捷键。'));
    for (const g of groups) {
      list.append(
        h(
          'section.sc-group',
          h('h3.dlg-section', g.title),
          h(
            'dl.sc-items',
            g.items.map((it) => [h('dt', it.label), h('dd', it.keys.map((k, i) => [i ? h('span.faint', ' 或 ') : null, h('kbd.kbd', k)]))]),
          ),
        ),
      );
    }
    const n = groups.reduce((s, g) => s + g.items.length, 0);
    count.textContent = `${n} 个快捷键`;
  };
  search.addEventListener('input', render);
  render();
  await openDialog({
    title: '键盘快捷键',
    wide: true,
    className: 'dlg-shortcuts',
    body: h(
      'div.shortcuts',
      search,
      count,
      h('p.faint.sc-note', '窗口专属快捷键在对应窗口激活时生效（点击窗口内部或按下该窗口的快捷键即可激活）。将鼠标悬停在任意按钮上即可查看其快捷键。'),
      list,
    ),
    buttons: [{ label: '关闭', value: true, primary: true }],
  });
}
