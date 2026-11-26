// Scripting, script events and the remaining automation: File → Scripts
// (installed scripts, Browse, Script Events Manager, Statistics), the
// Scripts panel, File → Automate → Lens Correction and Create Batch Link.
// Registration is light; the sandbox, editor and dialogs load on first use.
import type { Editor } from '../../editor';
import { commands, registerCommand, registerPanel, type Command } from '../../app/registry';
import { lazy, lazyPanel, lazyRun, whenIdle } from '../../app/lazy';
import { emitAppEvent, onAppEvent } from '../../app/app-events';
import { allActions, playAction } from '../actions';
import { dispatchEvent } from './event-dispatch';
import { BATCH_LINK_PREFIX } from './batch-link-core';
import { eventSettings, findScript, listScripts, loadScripts, onScriptsChanged, scriptSelection } from './store';

const runner = lazy(() => import('./run'));
const manage = lazy(() => import('./manage'));
const editor = lazy(() => import('./code-editor'));
const events = lazy(() => import('./events'));
const samples = lazy(() => import('./samples'));
const statistics = lazy(() => import('./statistics'));
const lensBatch = lazy(() => import('./lens-batch'));
const batchLink = lazy(() => import('./batch-link'));
const panel = lazy(() => import('./panel'));

const SCRIPT_PREFIX = 'script.run.';
/** Run an installed script by its record ID. */
async function runInstalled(e: Editor, id: string) {
  const s = findScript(id);
  if (!s) return e.message('That script is no longer installed.');
  await (await runner()).runScript(e, { id: s.id, name: s.name, source: s.source });
}
// File → Scripts lists the enabled scripts, each with its shortcut.
function syncScriptCommands(e: Editor) {
  for (const id of [...commands.keys()]) if (id.startsWith(SCRIPT_PREFIX)) commands.delete(id);
  listScripts()
    .filter((s) => s.enabled)
    .forEach((s, i) =>
      registerCommand({
        id: SCRIPT_PREFIX + s.id,
        label: s.name,
        menu: 'file.scripts',
        order: i,
        shortcut: s.shortcut,
        description: s.description || 'Installed script',
        run: (e) => runInstalled(e, s.id),
        prefetch: runner.prefetch,
      }),
    );
  e.dock?.update();
}

export function installScripting(e: Editor) {
  const selected = () => !!findScript(scriptSelection.id);
  const cmd = (c: Omit<Command, 'recordable'> & { recordable?: boolean }) => registerCommand({ recordable: false, ...c });
  cmd({ id: 'file.scripts-browse', label: '浏览…', description: '从当前设备运行脚本文件', ...lazyRun(manage, (m, e) => m.browse(e, 'device')) });
  cmd({ id: 'file.scripts-browse-cloud', label: '浏览本地…', description: '从本地存储运行脚本文件', ...lazyRun(manage, (m, e) => m.browse(e, 'puter')) });
  cmd({ id: 'file.script-events', label: '脚本事件管理器…', description: '在打开、保存、导出或关闭文档时运行脚本或操作', ...lazyRun(events, (m, e) => m.scriptEventsManager(e)) });
  cmd({ id: 'file.statistics', label: '统计…', description: '使用堆栈模式将多张图像合并为一个嵌入对象', ...lazyRun(statistics, (m, e) => m.statisticsDialog(e)) });
  cmd({ id: 'file.lens-correction-batch', label: '镜头校正…', description: '使用自动或自定义设置批量校正照片', ...lazyRun(lensBatch, (m, e) => m.lensCorrectionBatch(e)) });
  cmd({ id: 'file.batch-link', label: '创建批处理链接…', description: '生成可在打开图像工作室后直接对拖放照片运行操作的链接', ...lazyRun(batchLink, (m, e) => m.createBatchLink(e)) });
  cmd({ id: 'scripts.new', label: '新建脚本…', description: '在内置编辑器中编写脚本', ...lazyRun(editor, (m, e) => m.openScriptEditor(e)) });
  cmd({ id: 'scripts.install', label: '安装脚本…', description: '将 .js 脚本文件添加到脚本面板和文件 → 脚本', ...lazyRun(manage, (m, e) => m.installFromFile(e)) });
  cmd({ id: 'scripts.run-selected', label: '运行脚本', enabled: selected, run: (e) => runInstalled(e, scriptSelection.id), prefetch: runner.prefetch });
  cmd({ id: 'scripts.edit-selected', label: '编辑脚本…', enabled: selected, ...lazyRun(editor, (m, e) => m.openScriptEditor(e, scriptSelection.id)) });
  cmd({ id: 'scripts.shortcut', label: '键盘快捷键…', enabled: selected, description: '为所选脚本指定运行快捷键', ...lazyRun(manage, (m, e) => m.assignShortcut(e, scriptSelection.id)) });
  cmd({ id: 'scripts.export', label: '保存脚本为文件', enabled: selected, ...lazyRun(manage, (m) => m.exportScript(scriptSelection.id)) });
  cmd({ id: 'scripts.delete', label: '删除脚本', enabled: selected, ...lazyRun(manage, (m, e) => m.removeScript(e, scriptSelection.id)) });
  cmd({
    id: 'scripts.restore-samples',
    label: '恢复示例脚本',
    description: '重新安装已删除的内置示例脚本',
    ...lazyRun(samples, async (m, e) => {
      const n = await m.installSamples(false);
      e.message(n ? `已恢复 ${n} 个示例脚本。` : '所有示例脚本均已安装。');
    }),
  });
  cmd({ id: 'scripts.clear-output', label: '清空输出', ...lazyRun(runner, (m) => m.clearScriptLog()) });
  registerPanel(scriptsPanel);

  onScriptsChanged(() => syncScriptCommands(e));
  void loadScripts().then(() => {
    syncScriptCommands(e);
    // Samples install once, the first time Photo Studio starts.
    whenIdle(() => void samples().then((m) => m.installSamples(true)).catch(() => undefined));
  });

  // A batch link opens its window at startup or when pasted into an open tab.
  const openLinkInAddress = () => {
    if (location.hash.startsWith(BATCH_LINK_PREFIX)) void batchLink().then((m) => m.openBatchLink(e, location.hash));
  };
  window.addEventListener('hashchange', openLinkInAddress);

  // Script events. Closing is announced here (the editor's close hooks).
  e.closeHooks.push((s) => void emitAppEvent('close-document', s));
  onAppEvent(async (event, session) => {
    if (event === 'start') openLinkInAddress();
    await loadScripts();
    await dispatchEvent(eventSettings(), event, session, {
      busy: () => !!runner.loaded?.scriptRunning(),
      script: async (record, ev) => {
        const { runScript } = await runner();
        const go = () => runScript(e, { id: record.id, name: record.name, source: record.source, event: ev });
        // Hold the editor for the run unless the event came from inside a command.
        if (e.busy) await go();
        else await e.run(async () => void (await go()));
      },
      action: async (id, s) => {
        const found = allActions().find((a) => a.action.id === id);
        if (!found) return;
        // Plays on the event's document while it is open, holding the editor
        // as a script run does: a tab chosen meanwhile is shown afterwards.
        const play = async () => {
          if (s && s !== e.session && e.sessions.includes(s)) await e.switchSession(s);
          if (e.hasDocument) await playAction(e, found.action);
        };
        if (e.busy) await play();
        else await e.run(play);
      },
    });
  });
}

/** The Scripts panel (Window → Scripts). */
const scriptsPanel = lazyPanel(
  {
    id: 'scripts',
    title: '脚本',
    icon: 'square-code',
    location: 'strip',
    menu: () => ['scripts.run-selected', 'scripts.edit-selected', 'scripts.shortcut', 'scripts.export', 'scripts.delete', '-', 'scripts.new', 'scripts.install', 'scripts.restore-samples', '-', 'file.script-events', '-', 'scripts.clear-output'],
  },
  panel,
);
