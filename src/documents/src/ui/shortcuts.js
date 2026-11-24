import { el, MOD_KEY, IS_MAC } from './dom.js';
import { openModal } from './modal.js';
import { displayedChordReserved } from '../views/keymap.js';

/**
 * What the keyboard does in the editor. Each row names a result and the
 * chord (or chords) for it; every entry here is handled by the editor or
 * the engine, so the list is a promise rather than a wish.
 */
const ALT = IS_MAC ? 'Option' : 'Alt';

const GROUPS = [
  ['文本', [
    [`${MOD_KEY} + B`, '加粗'],
    [`${MOD_KEY} + I`, '倾斜'],
    [`${MOD_KEY} + U`, '下划线'],
    [`${MOD_KEY} + Shift + X`, '删除线'],
    [[`${MOD_KEY} + Shift + =`, `${MOD_KEY} + .`], '上标'],
    [`${MOD_KEY} + =`, '下标'],
    [`${MOD_KEY} + Shift + A`, '全部大写'],
    [`${MOD_KEY} + Shift + K`, '小型大写字母'],
    [`${MOD_KEY} + Shift + .`, '增大字号'],
    [`${MOD_KEY} + Shift + ,`, '减小字号'],
    [`${MOD_KEY} + K`, '插入或编辑链接'],
    [`${MOD_KEY} + Shift + V`, '纯文本粘贴（或粘贴格式）'],
    [`${MOD_KEY} + ${ALT} + Shift + V`, '粘贴并匹配格式'],
    [`${MOD_KEY} + Shift + C`, '复制格式'],
    [[`${MOD_KEY} + Space`, `${MOD_KEY} + \\`], '清除直接文本格式'],
    ['Ctrl + Shift + D', '双下划线'],
    ['Ctrl + Shift + W', '仅字下加线'],
    [`${MOD_KEY} + D`, '字体对话框'],
    ['Ctrl + Shift + F', '选择字体'],
    ['Ctrl + Shift + P', '字号'],
    ['Shift + F3', '更改大小写'],
    [`${MOD_KEY} + Shift + Space`, '不间断空格'],
    [`${MOD_KEY} + Shift + Hyphen`, '不间断连字符'],
  ]],
  ['段落', [
    [[`${MOD_KEY} + L`, `${MOD_KEY} + Shift + L`], '左对齐'],
    // Cmd/Ctrl+Shift+E is Track Changes, so only the plain chord centers.
    [`${MOD_KEY} + E`, '居中对齐'],
    [[`${MOD_KEY} + R`, `${MOD_KEY} + Shift + R`], '右对齐'],
    [[`${MOD_KEY} + J`, `${MOD_KEY} + Shift + J`], '两端对齐'],
    [`${MOD_KEY} + Shift + 8`, '项目符号列表'],
    [`${MOD_KEY} + Shift + 7`, '编号列表'],
    [IS_MAC ? 'Ctrl + Shift + Right / Left' : 'Alt + Shift + Right / Left', '更改列表级别'],
    [`${MOD_KEY} + ${ALT} + 0`, '正文样式'],
    [`${MOD_KEY} + ${ALT} + 1 … 6`, '标题 1 至 6'],
    ['Shift + Enter', '换行符'],
    [`${MOD_KEY} + Enter`, '分页符'],
    [`${MOD_KEY} + Shift + Enter`, '分栏符'],
    ['Ctrl + 1 / 2 / 5', '单倍、双倍或 1.5 倍行距'],
    ['Ctrl + 0', '添加或删除段前间距'],
    [['Ctrl + M', 'Ctrl + Shift + M'], '增加或减少左侧缩进'],
    [['Ctrl + T', 'Ctrl + Shift + T'], '悬挂缩进或减少悬挂缩进'],
    ['Ctrl + Q', '清除直接段落格式'],
    ['Ctrl + Shift + N', '正文样式'],
    [IS_MAC ? 'Ctrl + Shift + Up / Down' : 'Alt + Shift + Up / Down', '上移或下移段落'],
    [`${MOD_KEY} + 8`, '显示或隐藏格式标记'],
  ]],
  ['文档', [
    [`${MOD_KEY} + S`, '立即保存'],
    [[`${MOD_KEY} + F`, MOD_KEY === 'Cmd' ? 'Cmd + Shift + H' : 'Ctrl + H'], '查找和替换'],
    [`${MOD_KEY} + Z`, '撤销'],
    [[`${MOD_KEY} + Shift + Z`, `${MOD_KEY} + Y`], '重做'],
    [['F4', `${MOD_KEY} + Y`], '重复上一步操作（无重做项时）'],
    [IS_MAC ? 'Cmd + Shift + S' : 'Ctrl + Shift + S', '另存为'],
    [`${MOD_KEY} + O`, '打开文档'],
    [IS_MAC ? ['Cmd + G', 'Cmd + Shift + G', 'Shift + F4', 'Cmd + Shift + F4'] : ['Shift + F4', 'Ctrl + Shift + F4'], '查找下一个或上一个'],
    [IS_MAC ? 'Cmd + Option + K' : 'Alt + Q', '搜索命令'],
    [`${MOD_KEY} + ,`, '首选项'],
    [`${MOD_KEY} + A`, '全选'],
    [`${MOD_KEY} + P`, '打印或另存为 PDF'],
    ['F9', '更新页面引用'],
    ['F7', '拼写检查'],
    [[IS_MAC ? 'Cmd + Option + G' : 'Ctrl + G', 'F5'], '定位到页、行、标题、书签、表格或图形'],
    [`${MOD_KEY} + click`, '打开链接'],
    [`${MOD_KEY} + /`, '显示键盘快捷键'],
  ]],
  ['导航', [
    [MOD_KEY === 'Cmd' ? 'Option + Left / Right' : 'Ctrl + Left / Right', '上一个或下一个词'],
    [MOD_KEY === 'Cmd' ? 'Option + Up / Down' : 'Ctrl + Up / Down', '上一个或下一个段落'],
    [MOD_KEY === 'Cmd' ? ['Cmd + Up / Down', 'Cmd + Home / End'] : 'Ctrl + Home / End', '文档开头或末尾'],
    ['Page Up / Page Down', '向上或向下翻页'],
    ['Shift + any movement key', '扩展所选内容'],
    ['Double-click / triple-click', '选择一个词 / 一个段落'],
    [`${MOD_KEY} + ${ALT} + O`, '显示或隐藏大纲'],
    [IS_MAC ? 'Option' : ['Alt', 'F10'], '显示按键提示：功能区选项卡与命令的按键字母'],
    [IS_MAC ? 'Cmd + Option + R' : 'Ctrl + F1', '折叠或展开功能区'],
    [IS_MAC ? 'Ctrl + F2' : 'Alt + F10', '转到菜单栏'],
    ...(IS_MAC ? [['Cmd + Option + M', '段落设置'], ['Cmd + Ctrl + Shift + F', '专注模式']] : []),
    [['Tab', 'Shift + Tab'], '下一个或上一个表格单元格'],
    [['Tab', 'Shift + Tab'], '在列表项开头降级或升级'],
    ['Shift + F10', '打开所选项的快捷菜单'],
    ['Escape', '关闭面板或菜单；在文档中按 Tab 可移动到工具栏'],
  ]],
];

export function openShortcuts({ custom = [] } = {}) {
  // A chord of your own runs your command instead of the built-in one, which the sheet then no longer promises.
  const taken = new Set(custom.flatMap(([keys]) => [keys].flat()).map(chord => chord.toLowerCase()));
  // Nor are chords promised that the browser keeps for itself here (Ctrl+T opens a tab on Windows and Linux, and
  // Ctrl+Shift+W closes the window): a result with no other chord is left to its menu or ribbon command.
  const builtIn = GROUPS.map(([title, rows]) => [title, rows.map(([keys, what]) => {
    const left = [keys].flat().filter(chord => !taken.has(chord.toLowerCase()) && !displayedChordReserved(chord));
    return left.length ? [left, what] : null;
  }).filter(Boolean)]);
  const groups = custom.length ? [...builtIn, ['自定义快捷键', custom]] : builtIn;
  const content = el('div.shortcuts', {},
    groups.map(([title, rows]) => el('section.shortcut-group', {},
      el('h3', {}, title),
      el('dl', {}, rows.map(([keys, what]) => [
        el('dt', {}, [keys].flat().map((chord, n) => [n > 0 && ' 或 ', chord.split(' + ').map((k, i) => [i > 0 && ' + ', el('span.kbd', {}, k)])])),
        el('dd', {}, what),
      ])))));
  const modal = openModal({ title: '键盘快捷键', content, wide: true });
  // Two columns of chords with alternatives need more room than the wide dialog gives a form.
  modal.panel.classList.add('shortcuts-panel');
  return modal;
}
