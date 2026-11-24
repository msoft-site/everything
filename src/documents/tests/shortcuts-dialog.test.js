// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { openShortcuts } from '../src/ui/shortcuts.js';
import { MOD_KEY } from '../src/ui/dom.js';

beforeEach(() => { vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {} })); });
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); document.body.className = ''; });

it('lists only chords the canvas editor handles, with alternatives joined by "或"', () => {
  openShortcuts();
  const text = document.querySelector('.modal-panel').textContent;
  for (const promised of ['小型大写字母', '增大字号', '分栏符', '更新页面引用', '标题 1 至 6', '上一个或下一个段落', '显示键盘快捷键', '纯文本粘贴（或粘贴格式）', '上移或下移段落', '拼写检查', '字体对话框', '不间断空格', '不间断连字符']) expect(text).toContain(promised);
  for (const gone of ['Focus mode', 'Go to page', 'Insert footnote', 'Comment on the selection', 'Word count', 'Zoom in']) expect(text).not.toContain(gone);
  const redo = [...document.querySelectorAll('.modal-panel dd')].find(dd => dd.textContent === '重做').previousElementSibling;
  expect(redo.textContent).toBe(`${MOD_KEY} + Shift + Z 或 ${MOD_KEY} + Y`);
  expect(redo.querySelectorAll('.kbd')).toHaveLength(5);
  // One chord, one result: Cmd/Ctrl+, is Preferences, so Subscript does not claim it too.
  const chordFor = what => [...document.querySelectorAll('.modal-panel dd')].filter(dd => dd.textContent === what).map(dd => dd.previousElementSibling.textContent);
  expect(chordFor('下标')).toEqual([`${MOD_KEY} + =`]);
  // Cmd/Ctrl+Shift+E is Track Changes, not Center; on a Mac Cmd+G is Find Next, not Go To.
  expect(chordFor('居中对齐')).toEqual([`${MOD_KEY} + E`]);
  expect(chordFor('定位到页、行、标题、书签、表格或图形')).toEqual([`${MOD_KEY === 'Cmd' ? 'Cmd + Option + G' : 'Ctrl + G'} 或 F5`]);
  expect([...document.querySelectorAll('.modal-panel dt')].filter(dt => dt.textContent.split(' 或 ').includes(`${MOD_KEY} + ,`)).map(dt => dt.nextElementSibling.textContent)).toEqual(['首选项']);
});

const chordsFor = (what) => [...document.querySelectorAll('.modal-panel dd')].filter(dd => dd.textContent === what).map(dd => dd.previousElementSibling.textContent);

it('promises only chords that reach the command: Ctrl+, is Preferences, not Subscript', () => {
  openShortcuts();
  expect(chordsFor('下标')).toEqual([`${MOD_KEY} + =`]);
  expect(chordsFor('首选项')).toEqual([`${MOD_KEY} + ,`]);
  expect(chordsFor('定位到页、行、标题、书签、表格或图形')).toEqual(['Ctrl + G 或 F5']);
});

it('on a Mac lists Go To under Cmd+Option+G, since Cmd+G finds the next match, and names the Option key', async () => {
  vi.resetModules();
  vi.stubGlobal('navigator', { ...navigator, platform: 'MacIntel', userAgent: navigator.userAgent });
  const mac = await import('../src/ui/shortcuts.js');
  mac.openShortcuts();
  expect(chordsFor('定位到页、行、标题、书签、表格或图形')).toEqual(['Cmd + Option + G 或 F5']);
  expect(chordsFor('定位')).toEqual([]);
  expect(chordsFor('查找下一个或上一个')).toEqual(['Cmd + G 或 Cmd + Shift + G 或 Shift + F4 或 Cmd + Shift + F4']);
  expect(chordsFor('标题 1 至 6')).toEqual(['Cmd + Option + 1 … 6']);
  expect(chordsFor('上移或下移段落')).toEqual(['Ctrl + Shift + Up / Down']);
  expect(document.querySelector('.modal-panel').textContent).not.toMatch(/\bAlt\b/);
});

it('no longer promises a built-in chord that a shortcut of your own now runs', () => {
  openShortcuts({ custom: [[`${MOD_KEY} + B`, '倾斜'], [`${MOD_KEY} + Shift + Z`, '字数统计']] });
  // Bold had only this chord; Redo keeps its other one.
  expect(chordsFor('加粗')).toEqual([]);
  expect(chordsFor('重做')).toEqual([`${MOD_KEY} + Y`]);
  expect(chordsFor('倾斜')).toEqual([`${MOD_KEY} + I`, `${MOD_KEY} + B`]);
  expect(chordsFor('字数统计')).toEqual([`${MOD_KEY} + Shift + Z`]);
});
