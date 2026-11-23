// App dialogs and tool windows, registered as commands (menus pick them up
// by id): project settings, preferences, audio settings, shortcuts, about,
// getting started tour, undo history, tap tempo, purge unused, audio and
// stem export, and the signed-out "Open project" list.

import { openProjectSettings } from './project-settings.js';
import { openPreferences } from './preferences.js';
import { openShortcuts } from './shortcuts.js';
import { openAbout } from './about.js';
import { startTour, offerTourFromAlphaNotice } from './tour.js';
import { openHistory, openTapTempo, purgeCommand } from './tools.js';
import { openExportDialog } from './export.js';
import { openLocalProjects } from './open-local.js';

export function installDialogs(app) {
  const run = (fn) => () => Promise.resolve(fn()).catch((err) => app.reportError(err));
  app.openLocalProjects = () => openLocalProjects(app);
  app.openPreferences = (section) => openPreferences(app, { section });
  app.startTour = () => startTour(app);
  app.commands.register(
    { id: 'project.settings', label: '工程设置...', run: run(() => openProjectSettings(app)) },
    { id: 'options.preferences', label: '首选项...', keys: ['Mod+,'], run: run(() => openPreferences(app)) },
    { id: 'options.audio', label: '音频设置...', run: run(() => openPreferences(app, { section: 'audio' })) },
    { id: 'help.shortcuts', label: '键盘快捷键', keys: ['?', 'Mod+/'], run: run(() => openShortcuts(app)) },
    { id: 'help.about', label: '关于音乐工作室', run: run(() => openAbout()) },
    { id: 'help.tour', label: '新手入门导览', run: () => startTour(app) },
    { id: 'view.history', label: '撤销历史', keys: ['Alt+Z'], run: () => openHistory(app) },
    { id: 'tools.tapTempo', label: '测速（Tap Tempo）...', run: run(() => openTapTempo(app)) },
    { id: 'tools.purgeUnused', label: '清理未使用的项...', run: run(() => purgeCommand(app)) },
    { id: 'file.exportWav', label: '音频 (WAV)...', longLabel: '导出音频 (WAV)...', keys: ['Mod+R'], run: run(() => openExportDialog(app)) },
    { id: 'file.exportStems', label: '混音器分轨 (WAV 压缩包)...', longLabel: '导出混音器分轨...', run: run(() => openExportDialog(app, { stems: true })) },
  );
  // The first-run alpha notice appears after start; offer the tour from it.
  app.once('ready', () => offerTourFromAlphaNotice(app));
  setTimeout(() => offerTourFromAlphaNotice(app), 0);
}
