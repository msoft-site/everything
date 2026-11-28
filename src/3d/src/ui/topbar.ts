// Top bar menus (app, File, Edit, Render, Window, Help), the splash screen, and the window-level
// operators behind them: Open Recent, Revert, Recover Auto Save, Startup File, Repeat History,
// System Info, Memory Statistics, Redraw Timer, wm.call_menu.
import { h, type Child } from './h';
import { appIcon, icon } from './icons';
import { openMenu, type MenuItem } from './menu';
import { app, registerOperators, operators, operatorListeners } from '../app/app';
import { addKeys } from '../app/keymap';
import { prefs, savePrefs, formatDate } from '../app/prefs';
import { importMenu, exportMenu } from '../io/files';
import { canOpenFromPuter, opensFromPuter } from '../io/puterfiles';
import { recentFiles, clearRecent, recentBytes, loadProjectBytes, listSnapshots, openSnapshot, saveStartupFile, freshStart, type Snapshot } from '../io/session';
import { APP_VERSION } from '../scripting/wmops';
import { openDialog, closeDialog } from '../scripting/dialog';
import { assistantOpen } from '../assistant';
import { renderContext } from '../render/context';
import { shell, type Shell } from './shell';
import './topbar.css';
import { externalDataMenu, previewsMenu } from '../io/fileops';
import { quickSetupBody, quickSetupPending, splashArt } from './quicksetup';

/** File ▸ New entries (application templates, e.g. 2D Animation); modules append to it. */
export const fileNewTemplates: { label: string; icon?: string; template: string }[] = [{ label: '常规', icon: 'file_blank', template: '' }];

const sizeLabel = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.round(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  return formatDate(t, false);
}

// ---------------------------------------------------------------------------
// menus

export function fileNewMenu(): MenuItem[] {
  return fileNewTemplates.map((t) => ({ label: t.label, icon: t.icon, op: 'wm.read_homefile', props: t.template ? { app_template: t.template } : {} }));
}

export function openRecentMenu(): MenuItem[] {
  const list = recentFiles();
  return [
    ...(list.length ? list.map((e) => ({ label: e.name, icon: 'file_3d', description: `${sizeLabel(e.size)}, ${ago(e.time)}`, op: 'wm.open_mainfile', props: { filepath: e.name } })) : [{ label: '暂无最近打开的文件', disabled: true }]),
    { separator: true },
    { label: '清空最近文件列表…', icon: 'trash', op: 'wm.clear_recent_files' },
  ];
}

/** File ▸ Open's other source: this device inside the Puter desktop (where Open shows Puter's dialog), else Puter. */
export function openFromMenu(): MenuItem[] {
  if (opensFromPuter()) return [{ label: '从当前设备打开…', icon: 'file_folder', description: '从当前设备打开工程文件', op: 'wm.open_mainfile', props: { source: 'DEVICE' } }];
  if (canOpenFromPuter()) return [{ label: '从本地打开…', icon: 'file_folder', description: '从本地存储打开工程文件', op: 'wm.open_mainfile', props: { source: 'PUTER' } }];
  return [];
}

export function fileMenu(): MenuItem[] {
  return [
    { label: '新建', icon: 'file_blank', shortcut: 'Ctrl N', submenu: fileNewMenu },
    { label: '打开…', icon: 'file_folder', shortcut: 'Ctrl O', op: 'wm.open_mainfile' },
    ...openFromMenu(),
    { label: '打开最近文件', shortcut: 'Shift Ctrl O', submenu: openRecentMenu },
    { label: '恢复', op: 'wm.revert_mainfile' },
    {
      label: '工程恢复',
      submenu: () => [
        { label: '上一会话', op: 'wm.recover_last_session' },
        { label: '自动保存版本…', op: 'wm.recover_auto_save' },
      ],
    },
    { separator: true },
    { label: '保存', icon: 'file_3d', shortcut: 'Ctrl S', op: 'wm.save_mainfile' },
    { label: '另存为…', shortcut: 'Shift Ctrl S', op: 'wm.save_as_mainfile' },
    { label: '保存副本…', op: 'wm.save_as_mainfile', props: { copy: true } },
    { label: '增量保存', shortcut: 'Ctrl Alt S', op: 'wm.save_mainfile', props: { incremental: true } },
    { separator: true },
    { label: '关联…', icon: 'link', op: 'wm.link' },
    { label: '追加…', icon: 'append_blend', op: 'wm.append' },
    { label: '数据预览', submenu: previewsMenu },
    { separator: true },
    { label: '导入', icon: 'import', submenu: importMenu },
    { label: '导出', icon: 'export', submenu: exportMenu },
    { label: '导出所有集合', op: 'wm.collection_export_all' },
    { separator: true },
    { label: '外部数据', submenu: externalDataMenu },
    { label: '清理孤立数据', submenu: () => [{ label: '彻底清除孤立数据…', op: 'outliner.orphans_purge' }, { label: '管理孤立数据…', op: 'outliner.orphans_manage' }] },
    { separator: true },
    {
      label: '默认设置',
      submenu: () => [
        { label: '保存启动文件', op: 'wm.save_homefile' },
        { label: '恢复初始出厂设置', op: 'wm.read_factory_settings' },
      ],
    },
    { separator: true },
    { label: '退出', icon: 'panel_close', shortcut: 'Ctrl Q', op: 'wm.quit_blender' },
  ];
}

/** F4: a short File menu at the pointer. */
export function fileContextMenu(): MenuItem[] {
  return [
    { label: '新建', icon: 'file_blank', submenu: fileNewMenu },
    { label: '打开…', icon: 'file_folder', shortcut: 'Ctrl O', op: 'wm.open_mainfile' },
    ...openFromMenu(),
    { label: '打开最近文件', submenu: openRecentMenu },
    { separator: true },
    { label: '关联…', icon: 'link', op: 'wm.link' },
    { label: '追加…', icon: 'append_blend', op: 'wm.append' },
    { separator: true },
    { label: '保存', shortcut: 'Ctrl S', op: 'wm.save_mainfile' },
    { label: '另存为…', shortcut: 'Shift Ctrl S', op: 'wm.save_as_mainfile' },
    { separator: true },
    { label: '导入', icon: 'import', submenu: importMenu },
    { label: '导出', icon: 'export', submenu: exportMenu },
    { separator: true },
    { label: '偏好设置…', icon: 'preferences', shortcut: 'Ctrl ,', op: 'screen.userpref_show' },
  ];
}

function undoHistoryMenu(): MenuItem[] {
  const items = app.undo.history.map((s, i) => ({ label: s.label || '初始状态', active: s.active, action: () => {
    const d = app.undo.jump(i);
    if (d) app.setDocument(d, false);
  } }));
  return items.reverse().slice(0, 40);
}

export function editMenu(): MenuItem[] {
  return [
    { label: '撤销', icon: 'undo', shortcut: 'Ctrl Z', op: 'ed.undo', disabled: !app.undo.canUndo },
    { label: '重做', icon: 'redo', shortcut: 'Shift Ctrl Z', op: 'ed.redo', disabled: !app.undo.canRedo },
    { label: '撤销历史', shortcut: 'Ctrl Alt Z', submenu: undoHistoryMenu },
    { separator: true },
    { label: '微调上一步操作…', shortcut: 'F9', op: 'screen.redo_last' },
    { label: '重复上一步', shortcut: 'Shift R', op: 'screen.repeat_last' },
    { label: '重复历史…', op: 'screen.repeat_history' },
    { separator: true },
    { label: '搜索菜单功能…', icon: 'search', shortcut: 'F3', op: 'wm.search_menu' },
    ...(prefs.show_developer_ui ? [{ label: '搜索操作符…', op: 'wm.search_operator' }] : []),
    { separator: true },
    { label: '重命名当前项…', shortcut: 'F2', op: 'wm.call_panel', props: { name: 'TOPBAR_PT_name' } },
    { label: '批量重命名…', shortcut: 'Ctrl F2', op: 'wm.batch_rename' },
    { separator: true },
    { label: '偏好设置…', icon: 'preferences', shortcut: 'Ctrl ,', op: 'screen.userpref_show' },
  ];
}

export function renderMenu(): MenuItem[] {
  return [
    { label: '渲染静态图像', icon: 'render', shortcut: 'F12', op: 'render.render' },
    { label: '渲染动画序列', shortcut: 'Ctrl F12', op: 'render.render', props: { animation: true } },
    { separator: true },
    { label: '渲染音频…', op: 'sound.mixdown' },
    { separator: true },
    { label: '查看渲染结果', shortcut: 'F11', op: 'render.view_show' },
    { label: '播放已渲染动画', shortcut: 'Ctrl F11', op: 'render.play_rendered_anim' },
    { separator: true },
    { label: '锁定界面交互', checked: !!app.doc.scene.render.use_lock_interface, action: () => ((app.doc.scene.render.use_lock_interface = !app.doc.scene.render.use_lock_interface), app.pushUndo('锁定界面交互'), app.changed('doc')) },
  ];
}

export function windowMenu(sh: Shell): MenuItem[] {
  return [
    { label: '新建窗口', op: 'wm.window_new' },
    { label: '新建主窗口', op: 'wm.window_new_main' },
    { separator: true },
    { label: '切换全屏', icon: 'fullscreen_enter', op: 'wm.window_fullscreen_toggle' },
    ...(app.doc.scene.render.use_multiview ? [{ label: '立体 3D 设置…', op: 'wm.set_stereo_3d' }] : []),
    { separator: true },
    { label: '下一个工作区', shortcut: 'Ctrl Page Down', op: 'screen.workspace_cycle', props: { direction: 'NEXT' } },
    { label: '上一个工作区', shortcut: 'Ctrl Page Up', op: 'screen.workspace_cycle', props: { direction: 'PREV' } },
    { separator: true },
    { label: '显示状态栏', checked: sh.showStatusbar, op: 'screen.toggle_statusbar' },
    { label: '状态栏场景统计信息', checked: prefs.show_statusbar_stats, disabled: !sh.showStatusbar, action: () => ((prefs.show_statusbar_stats = !prefs.show_statusbar_stats), savePrefs(), sh.drawStatus()) },
    { separator: true },
    { label: 'AI 创作助理', icon: 'assistant', checked: assistantOpen(), op: 'wm.assistant_toggle' },
    { separator: true },
    { label: '截取全屏', op: 'screen.screenshot' },
    { label: '截取编辑器区域', op: 'screen.screenshot_area' },
  ];
}

export function helpMenu(): MenuItem[] {
  return [
    { label: '键盘快捷键大全', op: 'wm.keymap_reference' },
    ...(prefs.show_developer_ui ? [{ label: '操作符速查表', op: 'wm.operator_cheat_sheet' }] : []),
    { separator: true },
    // feedback goes through Puter's own dialog, so it is offered where the app runs inside Puter
    ...(window.self !== window.top || (globalThis as { puter?: unknown }).puter ? [{ label: '反馈与报错', op: 'wm.url_open_preset', props: { type: 'BUG' } }] : []),
    { label: '导出系统环境信息', op: 'wm.sysinfo' },
    { separator: true },
    { label: '关于 3D Studio', icon: 'info_small', op: 'wm.about' },
  ];
}

const REDRAW_TYPES: [string, string, string][] = [
  ['DRAW', '重绘区域', '绘制 3D 视口'],
  ['DRAW_SWAP', '重绘并交换缓冲区', '绘制 3D 视口并等待 GPU'],
  ['DRAW_WIN', '重绘窗口', '重绘窗口的每个区域'],
  ['DRAW_WIN_SWAP', '重绘窗口并交换缓冲区', '重绘所有区域并等待 GPU'],
  ['ANIM_STEP', '动画单帧步进', '向前推进一帧并计算场景'],
  ['UNDO', '撤销/重做测试', '撤销并重做上一步'],
];

export function appMenu(): MenuItem[] {
  return [
    { label: '初始启动画面', op: 'wm.splash' },
    { label: '关于 3D Studio', icon: 'info_small', op: 'wm.splash_about' },
    { separator: true },
    { label: '安装应用模板…', op: 'preferences.app_template_install' },
    { separator: true },
    {
      label: '系统管理',
      submenu: () => [
        { label: '重新加载脚本', op: 'script.reload' },
        { separator: true },
        { label: '内存统计信息', op: 'wm.memory_statistics' },
        { label: '视口重绘性能计时器', submenu: () => REDRAW_TYPES.map(([id, label]) => ({ label, op: 'wm.redraw_timer', props: { type: id } })) },
        { separator: true },
        { label: '清除操作符预设', op: 'wm.operator_presets_cleanup' },
      ],
    },
  ];
}

/** Menus that wm.call_menu (and wm.search_single_menu) can open by name; other modules may add theirs. */
export const NAMED_MENUS: Record<string, [string, () => MenuItem[]]> = {
  TOPBAR_MT_file_new: ['新建文件', fileNewMenu],
  TOPBAR_MT_file_open_recent: ['打开最近文件', openRecentMenu],
  TOPBAR_MT_file_context_menu: ['文件', fileContextMenu],
  TOPBAR_MT_file: ['文件', fileMenu],
  TOPBAR_MT_edit: ['编辑', editMenu],
  TOPBAR_MT_render: ['渲染', renderMenu],
  TOPBAR_MT_window: ['窗口', () => windowMenu(shell)],
  TOPBAR_MT_help: ['帮助', helpMenu],
  TOPBAR_MT_undo_history: ['撤销历史', undoHistoryMenu],
};

// ---------------------------------------------------------------------------
// splash screen

let snapshotsCache: Snapshot[] = [];
/** the splash shows the Quick Setup page first on the first run */
let splashPage: 'setup' | 'main' = 'main';
let splashHandle: { redraw(): void } | null = null;

function splashBody(): Child {
  const recent = recentFiles().slice(0, 8);
  const close = () => closeDialog('splash');
  const run = (op: string, props: Record<string, unknown> = {}) => () => {
    close();
    app.run(op, props);
  };
  const cols = h(
    'div',
    { class: 'splash-cols' },
    h(
      'div',
      { class: 'splash-col' },
      h('div', { class: 'splash-head' }, '新建工程'),
      fileNewTemplates.map((t) => h('button', { key: t.label, class: 'splash-item', onclick: run('wm.read_homefile', t.template ? { app_template: t.template } : {}) }, icon(t.icon ?? 'file_blank'), h('span', null, t.label))),
      h('div', { class: 'splash-gap' }),
      h('button', { class: 'splash-item', onclick: run('wm.open_mainfile') }, icon('file_folder'), h('span', null, '打开…')),
      h('button', { class: 'splash-item', onclick: run('wm.recover_last_session') }, icon('undo'), h('span', null, '恢复上一会话')),
      snapshotsCache.length ? h('button', { class: 'splash-item', onclick: run('wm.recover_auto_save') }, icon('time'), h('span', null, '恢复自动保存版本…')) : null,
    ),
    h(
      'div',
      { class: 'splash-col wide' },
      h('div', { class: 'splash-head' }, '最近打开的工程'),
      recent.length
        ? recent.map((e) =>
            h(
              'button',
              { key: e.name, class: 'splash-item recent', 'data-tip': `${e.name}\n${sizeLabel(e.size)}, saved or opened ${ago(e.time)}`, onclick: run('wm.open_mainfile', { filepath: e.name }) },
              icon('file_3d'),
              h('span', { class: 'splash-recent-name' }, e.name),
              h('span', { class: 'splash-recent-meta' }, ago(e.time)),
            ),
          )
        : h('div', { class: 'splash-empty' }, '您打开或保存的工程文件将在此处列出。'),
    ),
  );
  const foot = h(
    'div',
    { class: 'splash-foot' },
    h(
      'label',
      { class: 'splash-check' },
      h('input', { type: 'checkbox', checked: prefs.show_splash, onchange: (e: Event) => ((prefs.show_splash = (e.target as HTMLInputElement).checked), savePrefs()) }),
      '启动时显示此初始画面',
    ),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: run('wm.splash_about') }, '关于 3D Studio'),
    h('button', { class: 'btn', onclick: run('wm.keymap_reference') }, '键盘快捷键大全'),
  );
  return h(
    'div',
    { class: 'splash' },
    h(
      'div',
      { class: 'splash-hero', onclick: close },
      splashArt(),
      h('div', { class: 'splash-brand' }, h('span', { class: 'splash-logo' }, appIcon(44)), h('div', null, h('div', { class: 'splash-name' }, '3D'), h('div', { class: 'splash-ver' }, `Version ${APP_VERSION}`))),
    ),
    splashPage === 'setup'
      ? quickSetupBody(() => {
          splashPage = 'main';
          splashHandle?.redraw();
        })
      : [cols, foot],
  );
}

/** Show the splash screen; at startup the first run begins with the Quick Setup page. */
export function showSplash(opts: { startup?: boolean } = {}) {
  void listSnapshots().then((s) => {
    snapshotsCache = s;
    splashPage = opts.startup && quickSetupPending() ? 'setup' : 'main';
    splashHandle = openDialog({ id: 'splash', title: 'Welcome', width: 560, className: 'splash-dialog', body: splashBody });
  });
}

// ---------------------------------------------------------------------------
// recover auto save

function autoSaveBody(list: Snapshot[]): Child {
  return h(
    'div',
    { class: 'autosave-list' },
    list.length
      ? list.map((s) =>
          h(
            'button',
            {
              key: s.key,
              class: 'splash-item recent',
              onclick: () => {
                closeDialog('autosave');
                void openSnapshot(s);
              },
            },
            icon('time'),
            h('span', { class: 'splash-recent-name' }, s.name),
            h('span', { class: 'splash-recent-meta' }, `${s.reason ? `${s.reason} · ` : ''}${formatDate(s.time)} · ${sizeLabel(s.size)}`),
          ),
        )
      : h('div', { class: 'splash-empty' }, `No auto saves yet. While you work, a copy of the project is kept every ${prefs.autosave_interval || 2} minutes (Preferences ▸ Save & Load).`),
  );
}

// ---------------------------------------------------------------------------
// repeat history

interface Done {
  idname: string;
  props: Record<string, unknown>;
  label: string;
}
const doneOps: Done[] = [];
operatorListeners.add((idname, props) => {
  const op = operators.get(idname);
  if (!op || op.undo === false || op.internal || idname.startsWith('screen.repeat')) return;
  doneOps.push({ idname, props: structuredCloneSafe(props), label: op.label });
  if (doneOps.length > 30) doneOps.shift();
});

function structuredCloneSafe(p: Record<string, unknown>) {
  try {
    return structuredClone(p);
  } catch {
    return { ...p };
  }
}

/** Operators run in this session, most recent first (Edit ▸ Repeat History). */
export function repeatHistory(): readonly Done[] {
  return [...doneOps].reverse();
}

// ---------------------------------------------------------------------------
// system info / memory statistics

function glInfo(): string[] {
  const gl = renderContext?.engine.renderer.getContext() as WebGL2RenderingContext | undefined;
  if (!gl) return ['WebGL: unavailable'];
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return [
    `WebGL version: ${gl.getParameter(gl.VERSION)}`,
    `Shading language: ${gl.getParameter(gl.SHADING_LANGUAGE_VERSION)}`,
    `Vendor: ${dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)}`,
    `Renderer: ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)}`,
    `Max texture size: ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`,
    `Max renderbuffer size: ${gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)}`,
    `Max samples: ${gl.getParameter(gl.MAX_SAMPLES)}`,
    `Extensions: ${(gl.getSupportedExtensions() ?? []).join(', ')}`,
  ];
}

/** Rough size of the typed-array data held by the document. */
export function documentBytes(doc: unknown): { arrays: number; bytes: number } {
  let arrays = 0,
    bytes = 0;
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 12) return;
    seen.add(v);
    if (ArrayBuffer.isView(v)) {
      arrays++;
      bytes += v.byteLength;
      return;
    }
    for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x, depth + 1);
  };
  walk(doc, 0);
  return { arrays, bytes };
}

function memoryLines(): string[] {
  const doc = app.doc as unknown as Record<string, unknown>;
  const lines: string[] = [];
  const counts = Object.entries(doc)
    .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v))
    .map(([k, v]) => [k, Object.keys(v as object).length] as const)
    .filter(([k, n]) => n > 0 && k !== 'scene');
  lines.push(`Data-blocks: ${counts.map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const { arrays, bytes } = documentBytes(app.doc);
  lines.push(`Document arrays: ${arrays} (${sizeLabel(bytes)})`);
  lines.push(`Undo steps: ${app.undo.history.length}`);
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (mem) lines.push(`JavaScript heap: ${sizeLabel(mem.usedJSHeapSize)} used of ${sizeLabel(mem.totalJSHeapSize)} (limit ${sizeLabel(mem.jsHeapSizeLimit)})`);
  const info = renderContext?.engine.renderer.info;
  if (info) lines.push(`GPU: ${info.memory.geometries} geometries, ${info.memory.textures} textures, ${info.programs?.length ?? 0} shader programs`);
  return lines;
}

function sysInfoText(): string {
  const n = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } };
  const out = [
    `3D system information (${new Date().toISOString()})`,
    '',
    '== Application',
    `Version: ${APP_VERSION}`,
    `File: ${app.filename}`,
    `Location: ${location.origin}${location.pathname}`,
    '',
    '== Browser',
    `User agent: ${navigator.userAgent}`,
    `Platform: ${n.userAgentData?.platform ?? navigator.platform}`,
    `Language: ${navigator.language}`,
    `CPU threads: ${navigator.hardwareConcurrency ?? '?'}`,
    `Device memory: ${n.deviceMemory ? `${n.deviceMemory} GB` : 'unknown'}`,
    `Screen: ${screen.width}×${screen.height} @ ${devicePixelRatio}x, window ${innerWidth}×${innerHeight}`,
    `WebGPU: ${'gpu' in navigator ? 'available' : 'unavailable'}`,
    `Cross-origin isolated: ${(globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated ? 'yes' : 'no'}`,
    '',
    '== Graphics',
    ...glInfo(),
    '',
    '== Memory',
    ...memoryLines(),
    '',
    '== Preferences',
    ...Object.entries(prefs).map(([k, v]) => `${k}: ${JSON.stringify(v)}`),
    '',
  ];
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// operators

registerOperators([
  {
    idname: 'wm.call_menu',
    label: 'Call Menu',
    description: 'Open a menu by name at the pointer',
    undo: false,
    internal: true,
    props: [{ id: 'name', label: 'Name', type: 'string', default: '' }],
    exec: (_ctx, p) => {
      const m = NAMED_MENUS[String(p.name)];
      if (!m) {
        app.report('WARNING', `Unknown menu: ${p.name}`);
        return 'CANCELLED';
      }
      openMenu(m[1](), { x: app.pointer.x, y: app.pointer.y }, { title: m[0] });
    },
  },
  {
    idname: 'wm.revert_mainfile',
    label: 'Revert',
    description: 'Reload the saved version of the current file, discarding changes since it was saved or opened',
    undo: false,
    poll: () => recentFiles().some((e) => e.name === app.filename),
    invoke: () => {
      openMenu(
        [{ heading: `Revert to the saved "${app.filename}"?` }, { label: 'Revert', icon: 'file_3d', action: () => app.run('wm.revert_mainfile', {}, { invoke: false }) }],
        { x: app.pointer.x, y: app.pointer.y },
      );
      return 'CANCELLED';
    },
    exec: () => {
      const name = app.filename;
      void recentBytes(name).then((bytes) => {
        if (!bytes) return app.report('ERROR', `No saved copy of "${name}" to revert to`);
        try {
          loadProjectBytes(bytes, name);
          app.report('INFO', `Reverted "${name}"`);
        } catch (e) {
          app.report('ERROR', `Cannot revert: ${e instanceof Error ? e.message : String(e)}`);
        }
      });
    },
  },
  {
    idname: 'wm.clear_recent_files',
    label: 'Clear Recent Files List',
    description: 'Forget the recently opened and saved files',
    undo: false,
    poll: () => recentFiles().length > 0,
    invoke: () => {
      openMenu([{ heading: 'Clear the recent files list?' }, { label: 'Clear Recent Files', icon: 'trash', action: () => app.run('wm.clear_recent_files', {}, { invoke: false }) }], { x: app.pointer.x, y: app.pointer.y });
      return 'CANCELLED';
    },
    exec: () => void clearRecent(),
  },
  {
    idname: 'wm.recover_auto_save',
    label: 'Recover Auto Save',
    description: 'Open one of the copies of the project kept automatically while working',
    undo: false,
    exec: () => {
      void listSnapshots().then((list) => openDialog({ id: 'autosave', title: 'Recover Auto Save', width: 520, className: 'autosave-dialog', body: () => autoSaveBody(list) }));
    },
  },
  {
    idname: 'wm.save_homefile',
    label: 'Save Startup File',
    description: 'Make the current project (scene and workspaces) the one New File and a fresh start begin with',
    undo: false,
    invoke: () => {
      openMenu([{ heading: 'Overwrite the startup file?' }, { label: 'Save Startup File', icon: 'file_3d', action: () => app.run('wm.save_homefile', {}, { invoke: false }) }], { x: app.pointer.x, y: app.pointer.y });
      return 'CANCELLED';
    },
    exec: () => {
      void saveStartupFile().then(
        () => app.report('INFO', 'Startup file saved'),
        () => app.report('ERROR', 'The startup file could not be saved'),
      );
    },
  },
  {
    idname: 'wm.splash',
    label: 'Splash Screen',
    description: 'Open the splash screen with new file templates and recent files',
    undo: false,
    exec: () => showSplash(),
  },
  {
    idname: 'wm.splash_about',
    label: 'About',
    description: 'Show version, credits and licences',
    undo: false,
    exec: () => void app.run('wm.about'),
  },
  {
    idname: 'wm.window_fullscreen_toggle',
    label: 'Toggle Window Fullscreen',
    description: 'Show the application on the whole screen, or leave full screen',
    undo: false,
    exec: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.().catch(() => app.report('WARNING', 'The browser refused full screen'));
    },
  },
  {
    idname: 'screen.repeat_history',
    label: 'Repeat History',
    description: 'Pick an operation done in this session and run it again',
    undo: false,
    poll: () => doneOps.length > 0,
    invoke: () => {
      openMenu(
        repeatHistory().map((d) => ({ label: d.label, action: () => app.run(d.idname, d.props, { invoke: false }) })),
        { x: app.pointer.x, y: app.pointer.y },
        { title: 'Repeat History' },
      );
      return 'CANCELLED';
    },
  },
  {
    idname: 'wm.sysinfo',
    label: 'Save System Info',
    description: 'Save a text file describing the browser, graphics and memory, for bug reports',
    undo: false,
    exec: () => {
      const blob = new Blob([sysInfoText()], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'system-info.txt';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      app.report('INFO', 'Saved system-info.txt');
    },
  },
  {
    idname: 'wm.memory_statistics',
    label: 'Memory Statistics',
    description: 'Report memory used by the document, undo history, JavaScript heap and GPU',
    undo: false,
    exec: () => {
      for (const l of memoryLines()) app.report('INFO', l);
    },
  },
  {
    idname: 'wm.redraw_timer',
    label: 'Redraw Timer',
    description: 'Time repeated redraws (or frame steps, undo/redo) and report the average',
    undo: false,
    props: [
      { id: 'type', label: 'Type', type: 'enum', default: 'DRAW', items: REDRAW_TYPES },
      { id: 'iterations', label: 'Iterations', type: 'int', default: 10, min: 1, max: 1000 },
    ],
    exec: (_ctx, p) => {
      const n = Math.max(1, Math.round(p.iterations as number));
      const engine = renderContext?.engine;
      const gl = engine?.renderer.getContext();
      const type = p.type as string;
      const t0 = performance.now();
      const startFrame = app.doc.scene.frame_current;
      for (let i = 0; i < n; i++) {
        if (type === 'UNDO') {
          if (!app.undo.canUndo) break;
          app.undoStep();
          app.redoStep();
          app.flush();
        } else if (type === 'ANIM_STEP') {
          app.setFrame(startFrame + i + 1);
          app.flush();
          engine?.drawAll();
        } else {
          if (type.startsWith('DRAW_WIN')) shell?.screen.update(new Set(['ui']));
          engine?.drawAll();
          if (type.endsWith('SWAP')) gl?.finish();
        }
      }
      const ms = (performance.now() - t0) / n;
      if (type === 'ANIM_STEP') app.setFrame(startFrame);
      const label = REDRAW_TYPES.find((t) => t[0] === type)?.[1] ?? type;
      app.report('INFO', `${label}: ${n} iterations, ${ms.toFixed(2)} ms each`);
    },
  },
]);

addKeys('Window', [
  { key: 'O', ctrl: true, shift: true, op: 'wm.call_menu', props: { name: 'TOPBAR_MT_file_open_recent' } },
  { key: 'S', ctrl: true, alt: true, op: 'wm.save_mainfile', props: { incremental: true } },
]);

// splash at startup (not when a session was recovered, nor for ?factory-startup)
void freshStart.then((fresh) => {
  if (fresh && (prefs.show_splash || quickSetupPending())) showSplash({ startup: true });
});
