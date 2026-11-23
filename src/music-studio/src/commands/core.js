// Core commands: transport, windows, editing (routed to the active panel),
// patterns, theme and options. Feature modules register their own.

import * as E from '../model/edits.js';
import { COLORS, patternLength, splitPatternName } from '../model/project.js';
import { newProject, demoProject } from '../model/demo.js';
import { promptDialog, confirmDialog } from '../ui/dialog.js';
import { openMenu } from '../ui/menu.js';
import { REPO_URL } from '../ui/toolbar.js';
import { SYNTH_PRESETS, DRUM_PRESETS } from '../instruments/presets.js';
import { applyTheme } from '../ui/theme.js';
import { IS_MAC } from '../lib/util.js';

// Cmd+Y is the browser history on macOS. The metronome is Alt+M because
// Cmd+M minimizes the window on macOS.
const REDO_KEYS = IS_MAC ? ['Mod+Shift+Z'] : ['Mod+Shift+Z', 'Mod+Y'];

/** Runs a panel action ('copy', 'paste', 'delete', ...) on the active panel, if it supports it. */
function panelAction(app, name) {
  const impl = app.shell.panels.get(app.activePanel)?.impl;
  const fn = impl?.actions?.[name];
  if (fn) fn();
  return Boolean(fn);
}
const panelHas = (app, name) => Boolean(app.shell.panels.get(app.activePanel)?.impl?.actions?.[name]);

export function registerCoreCommands(app) {
  const { commands } = app;
  const store = app.store;

  const patterns = () => store.project.patterns;
  const patIndex = () => patterns().findIndex((p) => p.id === store.view.pattern);

  commands.register(
    // ---------------------------------------------------------- transport
    { id: 'transport.play', label: '播放 / 暂停', keys: ['Space'], run: () => app.engine.togglePlay() },
    { id: 'transport.stop', label: '停止', keys: [], run: () => app.engine.stop() },
    { id: 'transport.record', label: '录音', keys: ['R'], checked: () => app.engine.recording, run: () => app.engine.setRecording(!app.engine.recording) },
    { id: 'transport.toggleMode', label: '样式 / 歌曲模式', keys: ['L'], run: () => app.setMode(app.engine.mode === 'pattern' ? 'song' : 'pattern') },
    { id: 'transport.start', label: '回到开头', keys: ['Home'], run: () => app.engine.seek(0) },

    // ---------------------------------------------------------- windows
    { id: 'view.playlist', label: '播放列表', keys: ['F5', 'Alt+1'], checked: () => app.shell.isVisible('playlist'), run: () => app.shell.toggle('playlist') },
    { id: 'view.rack', label: '通道机架', keys: ['F6', 'Alt+2'], checked: () => app.shell.isVisible('rack'), run: () => app.shell.toggle('rack') },
    { id: 'view.pianoRoll', label: '钢琴卷帘', keys: ['F7', 'Alt+3'], checked: () => app.shell.isVisible('pianoRoll'), run: () => app.shell.toggle('pianoRoll') },
    { id: 'view.mixer', label: '混音器', keys: ['F9', 'Alt+4'], checked: () => app.shell.isVisible('mixer'), run: () => app.shell.toggle('mixer') },
    { id: 'view.browser', label: '浏览器', keys: ['Alt+F8', 'Alt+5'], checked: () => app.shell.isVisible('browser'), run: () => app.shell.toggle('browser') },
    {
      id: 'view.resetLayout',
      label: '重置窗口布局',
      run: () => {
        app.prefs.reset(['layout']);
        app.shell.layout();
      },
    },
    {
      id: 'view.fullscreen',
      label: '全屏',
      // macOS reserves F11 (show desktop); its full screen shortcut is Cmd+Ctrl+F.
      keys: [IS_MAC ? 'Mod+Ctrl+F' : 'F11'],
      enabled: () => Boolean(document.documentElement.requestFullscreen),
      checked: () => Boolean(document.fullscreenElement),
      run: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}),
    },

    // ---------------------------------------------------------- theme
    ...['system', 'light', 'dark'].map((t) => ({
      id: `theme.${t}`,
      label: t === 'system' ? '跟随系统' : t === 'light' ? '浅色' : '深色',
      checked: () => app.prefs.get('theme') === t,
      run: () => {
        app.prefs.set('theme', t);
        applyTheme(t);
      },
    })),

    // ---------------------------------------------------------- edit
    { id: 'edit.undo', label: () => (store.canUndo ? `撤销 ${store.undoLabel.toLowerCase()}` : '撤销'), keys: ['Mod+Z'], enabled: () => store.canUndo, run: () => app.notify(`已撤销 ${store.undo()?.toLowerCase()}`) },
    { id: 'edit.redo', label: () => (store.canRedo ? `重做 ${store.redoLabel.toLowerCase()}` : '重做'), keys: REDO_KEYS, enabled: () => store.canRedo, run: () => app.notify(`已重做 ${store.redo()?.toLowerCase()}`) },
    { id: 'edit.cut', label: '剪切', keys: ['Mod+X'], enabled: () => panelHas(app, 'cut'), run: () => panelAction(app, 'cut') },
    { id: 'edit.copy', label: '复制', keys: ['Mod+C'], enabled: () => panelHas(app, 'copy'), run: () => panelAction(app, 'copy') },
    { id: 'edit.paste', label: '粘贴', keys: ['Mod+V'], enabled: () => panelHas(app, 'paste'), run: () => panelAction(app, 'paste') },
    { id: 'edit.delete', label: '删除', keys: ['Delete', 'Backspace'], enabled: () => panelHas(app, 'delete'), run: () => panelAction(app, 'delete') },
    { id: 'edit.selectAll', label: '全选', keys: ['Mod+A'], enabled: () => panelHas(app, 'selectAll'), run: () => panelAction(app, 'selectAll') },
    { id: 'edit.deselect', label: '取消全选', keys: ['Escape'], enabled: () => panelHas(app, 'deselect'), run: () => panelAction(app, 'deselect') },
    { id: 'edit.duplicate', label: '复制副本', keys: ['Mod+B'], enabled: () => panelHas(app, 'duplicate'), run: () => panelAction(app, 'duplicate') },

    // ---------------------------------------------------------- patterns
    {
      id: 'patterns.new',
      label: '新建样式',
      run: () => {
        const r = store.apply('新建样式', (p) => E.addPattern(p, { after: store.view.pattern }));
        store.setPattern(r.id);
      },
    },
    {
      id: 'patterns.nextEmpty',
      label: '查找下一个空样式',
      keys: ['F4'],
      run: () => {
        const list = patterns();
        const i = patIndex();
        const empty = [...list.slice(i + 1), ...list.slice(0, i + 1)].find((p) => !Object.keys(p.notes).length);
        if (empty) store.setPattern(empty.id);
        else commands.run('patterns.new');
      },
    },
    { id: 'patterns.prev', label: '上一个样式', keys: ['Num-'], enabled: () => patIndex() > 0, run: () => store.setPattern(patterns()[patIndex() - 1].id) },
    {
      id: 'patterns.next',
      label: '下一个样式',
      keys: ['Num+'],
      run: () => {
        const i = patIndex();
        if (i < patterns().length - 1) store.setPattern(patterns()[i + 1].id);
        else commands.run('patterns.new');
      },
    },
    {
      id: 'patterns.rename',
      label: '重命名样式...',
      keys: ['F2'],
      run: async () => {
        const pat = store.pattern;
        const loadVersion = store.loadVersion;
        const name = await promptDialog({ store, title: '重命名样式', label: '名称', value: pat.name, confirm: '重命名', validate: (v) => (v.trim() ? '' : '请输入名称。') });
        if (name && store.loadVersion === loadVersion) store.apply('重命名样式', (p) => E.updatePattern(p, pat.id, { name: name.trim().slice(0, 60) }));
      },
    },
    {
      id: 'patterns.color',
      label: '样式颜色',
      run: () => {
        const pat = store.pattern;
        const btn = document.querySelector('.pattern-picker');
        openMenu(
          [
            { type: 'radio', label: '自动', checked: !pat.color, run: () => store.apply('样式颜色', (p) => E.updatePattern(p, pat.id, { color: null })) },
            ...COLORS.map((c, i) => ({ type: 'radio', label: `颜色 ${i + 1}`, swatch: c, checked: pat.color === c, run: () => store.apply('样式颜色', (p) => E.updatePattern(p, pat.id, { color: c })) })),
          ],
          btn ? { anchor: btn, label: '样式颜色' } : { x: 200, y: 60, label: '样式颜色' },
        );
      },
    },
    {
      id: 'patterns.clone',
      label: '克隆样式',
      run: () => {
        const r = store.apply('克隆样式', (p) => E.clonePattern(p, store.view.pattern));
        if (r?.id) store.setPattern(r.id);
      },
    },
    {
      id: 'patterns.delete',
      label: '删除样式',
      enabled: () => patterns().length > 1,
      run: async () => {
        const pat = store.pattern;
        const used = store.project.clips.some((c) => c.kind === 'pattern' && c.ref === pat.id);
        const loadVersion = store.loadVersion;
        if (used && !(await confirmDialog({ store, title: '删除样式', message: `“${pat.name}”已在播放列表中使用。要删除它及其所有片段吗？`, confirm: '删除', danger: true }))) return;
        if (store.loadVersion !== loadVersion) return;
        store.apply('删除样式', (p) => E.removePattern(p, pat.id));
      },
    },
    { id: 'patterns.moveUp', label: '上移样式', enabled: () => patIndex() > 0, run: () => store.apply('移动样式', (p) => E.movePattern(p, store.view.pattern, patIndex() - 1)) },
    { id: 'patterns.moveDown', label: '下移样式', enabled: () => patIndex() < patterns().length - 1, run: () => store.apply('移动样式', (p) => E.movePattern(p, store.view.pattern, patIndex() + 1)) },
    {
      id: 'patterns.splitByChannel',
      label: '按通道拆分',
      enabled: () => Object.keys(store.pattern.notes).length > 1,
      run: () => {
        const src = store.pattern;
        const length = patternLength(src, store.project.sig);
        store.apply('按通道拆分', (p) => {
          let next = p;
          for (const cid of Object.keys(src.notes)) {
            const ch = p.channels.find((c) => c.id === cid);
            const r = E.addPattern(next, { name: splitPatternName(src.name, ch?.name || '通道') });
            next = E.setNotes(r.project, r.id, cid, src.notes[cid].map((n) => ({ ...n })));
            // Each part must keep the full loop, including the other channels' silence.
            next = E.updatePattern(next, r.id, { length });
          }
          return next;
        });
      },
    },
    {
      id: 'patterns.transpose',
      label: '样式移调...',
      run: async () => {
        const loadVersion = store.loadVersion;
        const patternId = store.view.pattern;
        const isCurrent = () => store.loadVersion === loadVersion && store.view.pattern === patternId;
        const v = await promptDialog({ store, isCurrent, title: '样式移调', label: '半音数（负数为降调）', value: '12', confirm: '移调', validate: (s) => (Number.isInteger(Number(s)) && Math.abs(Number(s)) <= 96 ? '' : '请输入 -96 到 96 之间的整数。') });
        if (v === null || !isCurrent()) return;
        const st = Number(v);
        const pat = store.pattern;
        store.apply('样式移调', (p) => {
          let next = p;
          for (const [cid, list] of Object.entries(pat.notes)) next = E.setNotes(next, pat.id, cid, list.map((n) => ({ ...n, key: Math.max(0, Math.min(127, n.key + st)) })));
          return next;
        });
      },
    },

    // ---------------------------------------------------------- add
    ...Object.entries({ synth: '复音合成器', drum: '鼓合成器', sampler: '采样器' }).map(([type, label]) => ({
      id: `add.${type}`,
      label: `添加${label}`,
      run: () => app.addChannel({ type, name: label }),
    })),
    { id: 'add.pattern', label: '添加样式', run: () => commands.run('patterns.new') },

    // ---------------------------------------------------------- options
    { id: 'options.metronome', label: '节拍器', keys: ['Alt+M'], checked: () => app.prefs.get('metronome'), run: () => app.prefs.toggle('metronome') },
    { id: 'options.countIn', label: '录音前预备拍', keys: ['Mod+P'], checked: () => app.prefs.get('countIn'), run: () => app.prefs.toggle('countIn') },
    { id: 'options.typingKeyboard', label: '电脑键盘作钢琴键盘', keys: ['Alt+K'], checked: () => app.prefs.get('typingKeyboard'), run: () => app.prefs.toggle('typingKeyboard') },
    { id: 'options.stepEdit', label: '步进编辑', keys: ['Mod+E'], checked: () => app.prefs.get('stepEditing'), run: () => app.prefs.toggle('stepEditing') },
    { id: 'options.autoScroll', label: '自动滚动', checked: () => app.prefs.get('autoScroll'), run: () => app.prefs.toggle('autoScroll') },

    // ---------------------------------------------------------- tools
    { id: 'tools.stopSound', label: '停止所有声音', keys: ['Mod+.'], run: () => app.engine.allNotesOff() },
    {
      id: 'tools.selectUnused',
      label: '选择未使用的通道',
      run: () => {
        const used = new Set(store.project.patterns.flatMap((p) => Object.keys(p.notes)));
        for (const c of store.project.clips) if (c.kind === 'audio') used.add(c.ref);
        const ids = store.project.channels.filter((c) => !used.has(c.id)).map((c) => c.id);
        store.selectChannels(ids);
        app.notify(ids.length ? `已选择 ${ids.length} 个未使用的通道` : '所有通道均已使用');
      },
    },

    // ---------------------------------------------------------- file (in memory; storage adds the rest)
    { id: 'file.newEmpty', label: '空白工程', run: () => app.newProject(() => ({ ...newProject(), channels: [] })) },
    { id: 'file.newStarter', label: '入门鼓组', run: () => app.newProject(() => newProject()) },
    { id: 'file.newDemo', label: '示范曲', run: () => app.newProject(() => demoProject()) },
    { id: 'file.new', label: '新建工程', run: () => app.newProject(() => newProject()) },

    // ---------------------------------------------------------- help
    { id: 'help.github', label: 'GitHub 源码', run: () => window.open(REPO_URL, '_blank', 'noopener') },
  );

  // Dynamic submenus.
  app.presetMenuItems = () => [
    { type: 'heading', label: '合成器' },
    ...SYNTH_PRESETS.filter((p) => p.name !== 'Init').map((p) => ({ type: 'cmd', label: p.name, icon: 'synth', run: () => app.addChannel({ type: 'synth', name: p.name, params: p.params }) })),
    { type: 'heading', label: '鼓机' },
    ...DRUM_PRESETS.map((p) => ({ type: 'cmd', label: p.name, icon: 'drum', run: () => app.addChannel({ type: 'drum', name: p.name, params: p.params }) })),
  ];
}
