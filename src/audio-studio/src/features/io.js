// Files, export and recording: Save As / Export File dialog and encoders,
// recording into the Waveform editor (app.recorder), input metering and
// device choice, the Media Browser and Metadata panels, marker import,
// Open Recent, autosave with crash recovery and the Puter window-close prompt.

import '../styles/files.css';
import { CornerLeftUp } from 'lucide';
import { h } from '../lib/dom.js';
import { registerIcons } from '../ui/icons.js';
import { openDialog } from '../ui/dialog.js';
import { AudioFile } from '../model/audio-file.js';
import { createMarker, sortMarkers } from '../model/markers.js';
import { openFiles, pickLocalFiles } from '../storage/files.js';
import * as puter from '../storage/puter.js';
import { saveFlow } from '../export/save.js';
import { createRecorder, inputErrorMessage } from '../record/recorder.js';
import { recordingName } from '../record/take.js';
import { mediaBrowserPanel, PUTER_DRAG_TYPE, resolveMediaItems } from '../panels/media-browser.js';
import { metadataPanel } from '../panels/metadata.js';
import { parseMarkerText } from '../storage/markers-io.js';
import { installAutosave, recoveryDialog, opfsAvailable } from '../storage/autosave-controller.js';
import { newSessionId, LOCK_PREFIX } from '../storage/autosave.js';
import { installSessionBackup, SessionBackupStore, sessionRestoreDialog, backupBrowserDialog } from '../storage/session-backup.js';

const audio = (app) => (app.active?.kind === 'audio' ? app.active : null);
const hasAudio = (app) => Boolean(audio(app));

export function installIo(app) {
  registerIcons({ 'corner-left-up': CornerLeftUp });
  app.registerPanel({ id: 'media', title: '媒体浏览器', create: mediaBrowserPanel, near: ['files', 'favorites', 'markers'] });
  app.registerPanel({ id: 'metadata', title: '元数据', create: metadataPanel, near: ['properties', 'assistant'] });
  app.recorder = createRecorder(app);
  app.recording = false;
  app.inputMetering = false;
  const C = app.commands;

  C.register([
    { id: 'file.exportFile', label: '文件...', shortcut: 'Mod+Shift+E', enabled: hasAudio, run: () => saveFlow(app, audio(app), { mode: 'export' }) },
    {
      id: 'file.saveSelectionAs',
      label: '选区另存为...',
      shortcut: 'Mod+Alt+S',
      enabled: (a) => Boolean(audio(a)?.hasSelection),
      run: () => {
        const doc = audio(app);
        return saveFlow(app, doc, { mode: 'selection', range: [doc.selection.start, doc.selection.end] });
      },
    },
    { id: 'file.download', label: '下载到此设备...', enabled: hasAudio, run: () => saveFlow(app, audio(app), { mode: 'download' }) },
    { id: 'file.importMarkers', label: '标记...', enabled: hasAudio, run: () => importMarkers(app) },
    {
      id: 'file.recover',
      label: '恢复未保存的文件...',
      enabled: () => Boolean(autosave),
      run: async () => {
        const list = await autosave.check();
        if (!list.length) return app.notify('没有可恢复的自动保存文件。');
        return recoveryDialog(app, autosave, list);
      },
    },
    {
      id: 'file.restoreBackup',
      label: '恢复会话备份...',
      enabled: () => Boolean(app.sessionBackup),
      run: () => backupBrowserDialog(app, app.sessionBackup),
    },
    {
      id: 'transport.record',
      label: (a) => (a.recording || a.recorder?.active || a.multitrack?.recorder?.active ? '停止录音' : '录音'),
      shortcut: 'Shift+Space',
      // Base command for every kind: the multitrack session overrides run()
      // through its document kind to record into armed tracks.
      enabled: () => true,
      run: () => toggleRecord(app),
    },
    {
      id: 'transport.recordOverwrite',
      label: '录音时覆盖',
      // Waveform editor, no selection: record over the audio after the playhead instead of inserting.
      checked: (a) => Boolean(a.prefs.get('recordOverwrite')),
      run: () => app.prefs.toggle('recordOverwrite'),
    },
    {
      id: 'transport.punchRoll',
      label: '穿插并预卷录音',
      // Waveform editor: rolls in from before the playhead (or selection) and records over what follows.
      enabled: (a) => Boolean(audio(a)) && !a.recording && !a.recorder?.active,
      run: () => punchAndRoll(app),
    },
    {
      id: 'transport.meterInput',
      label: '监测输入信号',
      checked: (a) => Boolean(a.inputMetering),
      run: () => toggleInputMeter(app),
    },
  ]);

  app.preferenceSections = app.preferenceSections || [];
  app.preferenceSections.push({ category: 'audioHardware', title: '设备', keywords: 'input microphone device latency output 输入 麦克风 设备 延迟 输出', build: audioHardwarePrefs });

  // Open Recent: Puter files, reopened through their path. Sessions come first, then audio
  // files; a name shared by files in different folders shows its folder.
  app.recentMenuItems = () => {
    const list = app.prefs.get('recent') || [];
    if (!list.length) return [{ type: 'cmd', label: '无最近使用的文件', enabled: false }];
    const groups = recentGroups(list);
    return [
      ...groups.flatMap((g, i) => [...(i ? [null] : []), ...g]).map((r) => (!r ? { type: 'sep' } : {
        type: 'cmd',
        label: r.label,
        enabled: Boolean(r.path),
        run: async () => {
          if (puter.sdk() && !puter.isSignedIn() && !(await puter.signIn().catch(() => false))) return;
          const open = app.documents.find((d) => d.source?.path === r.path);
          if (open) return app.activate(open);
          const docs = await openFiles(app, [{ name: r.name, path: r.path }]);
          if (!docs.length) app.prefs.set('recent', (app.prefs.get('recent') || []).filter((x) => x.path !== r.path));
        },
      })),
      { type: 'sep' },
      { type: 'cmd', label: '清除最近使用的文件', enabled: true, run: () => app.prefs.set('recent', []) },
    ];
  };

  // Drags from the Media Browser: open, or insert into a session when dropped on it.
  window.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.types || [])].includes(PUTER_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  window.addEventListener('drop', async (e) => {
    if (e.defaultPrevented || ![...(e.dataTransfer?.types || [])].includes(PUTER_DRAG_TYPE)) return;
    e.preventDefault();
    let items = [];
    try {
      items = JSON.parse(e.dataTransfer.getData(PUTER_DRAG_TYPE));
    } catch {
      return;
    }
    const onEditor = e.target instanceof Element && e.target.closest('[data-panel="editor"]');
    // Device folder items arrive as references; read them as Files.
    items = await resolveMediaItems(items);
    if (!items.length) return;
    if (onEditor && app.active?.kind === 'session' && app.commands.isEnabled('mt.insertFiles', { docs: [true] })) {
      const docs = await openFiles(app, items, { activate: false });
      if (docs.length) app.commands.run('mt.insertFiles', { docs, items, clientX: e.clientX, clientY: e.clientY });
    } else openFiles(app, items);
  });

  installWindowClose(app);

  // Autosave and the recovery prompt (after the shell has mounted).
  let autosave = null;
  const intervalMs = () => Math.max(5, Number(app.prefs.get('autosaveInterval')) || 60) * 1000;
  const startAutosave = () => {
    try {
      autosave = installAutosave(app, { interval: intervalMs() });
    } catch (err) {
      console.warn('[autosave]', err);
    }
    app.autosave = autosave;
  };
  if (app.prefs.get('autosave') !== false) startAutosave();
  app.autosave = autosave;
  // Multitrack session backups share the tab id (and its Web Lock) with autosave.
  let tab = autosave?.session;
  if (!tab) {
    tab = newSessionId();
    navigator.locks?.request?.(`${LOCK_PREFIX}${tab}`, () => new Promise(() => {})).catch(() => {});
  }
  try {
    app.sessionBackup = opfsAvailable() ? installSessionBackup(app, { store: new SessionBackupStore(() => navigator.storage.getDirectory()), tab }) : null;
  } catch (err) {
    console.warn('[session backup]', err);
    app.sessionBackup = null;
  }
  if (app.sessionBackup) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && app.prefs.get('sessionBackup') !== false) app.sessionBackup.run();
    });
  }
  if (autosave || app.sessionBackup) {
    setTimeout(async () => {
      const list = autosave ? await autosave.check() : [];
      if (list.length) await recoveryDialog(app, autosave, list);
      const sessions = app.sessionBackup ? await app.sessionBackup.check() : [];
      if (sessions.length) await sessionRestoreDialog(app, app.sessionBackup, sessions);
    }, 600);
  }
  // Preferences > Auto Save apply right away.
  app.prefs.on('change', (key) => {
    if (key === 'autosave') {
      const on = app.prefs.get('autosave') !== false;
      if (on && !autosave) startAutosave();
      else if (on) autosave.start?.();
      else autosave?.stop?.();
    } else if (key === 'autosaveInterval') autosave?.setInterval?.(intervalMs());
  });
}

// ------------------------------------------------------------------ record

async function newRecordingDialog(app) {
  const name = h('input.input', { type: 'text', value: app.uniqueName(recordingName()), 'aria-label': '文件名', style: { width: '100%' } });
  const rate = h('select.select', { 'aria-label': '采样率' }, [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 192000].map((r) => h('option', { value: r, selected: r === app.prefs.get('defaultRate') }, `${r} Hz`)));
  const channels = h('select.select', { 'aria-label': '声道' }, h('option', { value: '1', selected: app.prefs.get('defaultChannels') === 1 }, '单声道'), h('option', { value: '2', selected: app.prefs.get('defaultChannels') !== 1 }, '立体声'));
  const bits = h('select.select', { 'aria-label': '位深度' }, [16, 24, 32].map((b) => h('option', { value: b, selected: b === 32 }, b === 32 ? '32 (浮点)' : String(b))));
  const r = await openDialog({
    title: '新建音频文件',
    body: h(
      'div',
      h('p.muted', { style: { margin: '0 0 10px', maxWidth: '360px' } }, '将使用这些设置在新文件中开始录音。'),
      h('div.form-grid', h('label', '文件名：'), name, h('label', '采样率：'), rate, h('label', '声道：'), channels, h('label', '位深度：'), bits),
    ),
    buttons: [
      { label: '取消', value: null },
      { label: '录音', value: 'ok', primary: true },
    ],
  });
  if (r !== 'ok') return null;
  app.prefs.set('defaultRate', Number(rate.value));
  app.prefs.set('defaultChannels', Number(channels.value));
  return { name: name.value.trim() || recordingName(), sampleRate: Number(rate.value), channels: Number(channels.value), bitDepth: Number(bits.value) };
}

async function toggleRecord(app) {
  if (app.recorder.active) return app.recorder.stop();
  if (app.active && app.active.kind !== 'audio') return;
  let doc = audio(app);
  if (!doc) {
    const o = await newRecordingDialog(app);
    if (!o) return;
    doc = AudioFile.blank({ name: o.name, sampleRate: o.sampleRate, channels: o.channels });
    doc.info.bitDepth = o.bitDepth;
    app.addDocument(doc);
  }
  const replace = doc.hasSelection ? [doc.selection.start, doc.selection.end] : null;
  if (prerolling) return prerolling.cancel();
  const secs = Number(app.prefs.get('prerollSeconds')) || 0;
  if (replace && secs > 0 && replace[0] > 0) {
    if (!(await preroll(app, doc, replace[0], secs))) return;
  }
  // Without a selection the take goes in at the playhead, pushing later audio along, or
  // (Overwrite When Recording) records over it.
  // Punching in or overwriting leaves channels disabled for editing alone.
  return app.recorder.start({ doc, replace, at: doc.cursor, overwrite: Boolean(app.prefs.get('recordOverwrite')), mask: doc.channelMask });
}

/**
 * Punch and Roll: plays the pre-roll (Preferences > Playback and Recording,
 * at least two seconds) before the punch-in point, then records from there:
 * over the selection, or over everything after the playhead.
 */
async function punchAndRoll(app) {
  const doc = audio(app);
  if (!doc || app.recorder.active) return;
  if (prerolling) return prerolling.cancel();
  const at = doc.hasSelection ? doc.selection.start : Math.round(app.playhead);
  if (app.engine.playing) app.stop();
  doc.setCursor(at);
  const replace = doc.hasSelection ? [doc.selection.start, doc.selection.end] : [at, Infinity];
  const secs = Math.max(2, Number(app.prefs.get('prerollSeconds')) || 0);
  if (at > 0 && !(await preroll(app, doc, at, secs))) return;
  return app.recorder.start({ doc, replace, at });
}

// ----------------------------------------------------------------- pre-roll

let prerolling = null;

/**
 * Punch-in pre-roll (Preferences > Playback and Recording): plays `secs` of
 * the audio before the punch-in point, optionally with a countdown, then
 * resolves true. Stopping playback or pressing Record again cancels (false).
 */
function preroll(app, doc, at, secs) {
  const engine = app.engine;
  const from = Math.max(0, Math.round(at - secs * doc.sampleRate));
  const total = (at - from) / doc.sampleRate;
  return new Promise((resolve) => {
    let done = false;
    let raf = 0;
    const counter = app.prefs.get('prerollCountdown') ? h('div.preroll-countdown', { role: 'status', 'aria-live': 'polite' }) : null;
    if (counter) document.body.append(counter);
    const finish = (ok) => {
      if (done) return;
      done = true;
      prerolling = null;
      offEnded();
      offTransport();
      cancelAnimationFrame(raf);
      counter?.remove();
      app.setStatus(ok ? '' : '预卷已取消');
      resolve(ok);
    };
    const offEnded = engine.on('ended', () => finish(true));
    // A stop before the punch-in point (Space, Stop) cancels; the natural end arrives as 'ended'.
    const offTransport = app.on('transport', (s) => {
      if (s === 'stopped') setTimeout(() => finish(engine.lastPos?.frame >= at - doc.sampleRate * 0.05), 0);
    });
    prerolling = {
      cancel: () => {
        finish(false);
        if (engine.playing) app.stop();
      },
    };
    const started = performance.now();
    let shown = '';
    const tick = () => {
      if (done) return;
      const left = Math.max(0, total - (performance.now() - started) / 1000);
      const text = `录音倒计时 ${Math.ceil(left)}`;
      if (counter && text !== shown) counter.textContent = shown = text;
      raf = requestAnimationFrame(tick);
    };
    app.setStatus('预卷中...');
    app
      .play({ from, to: at, loop: false })
      .then(() => {
        if (!engine.playing && !done) finish(false);
        else tick();
      });
  });
}

async function toggleInputMeter(app) {
  const engine = app.engine;
  if (app.inputMetering) {
    app.inputMetering = false;
    if (!app.recording) {
      engine.closeInput();
      app.meterInput?.(false);
    }
  } else {
    if (!app.recording) {
      try {
        await engine.openInput({ deviceId: app.prefs.get('inputDevice') || undefined });
      } catch (err) {
        if (err.name !== 'AbortError') app.notify(inputErrorMessage(err), { error: true });
        return;
      }
    }
    app.inputMetering = true;
    app.meterInput?.(true);
    app.dock?.openPanel('levels', { focus: false });
  }
  app.emit('transport', engine.state);
}

// ------------------------------------------------------------- preferences

function audioHardwarePrefs(app) {
  const p = app.prefs;
  const input = h('select.select', { 'aria-label': '默认输入设备' }, h('option', { value: '' }, '系统默认'));
  // Output choice needs AudioContext.setSinkId (not in every browser).
  const canPickOutput = typeof AudioContext !== 'undefined' && typeof AudioContext.prototype.setSinkId === 'function';
  const output = h('select.select', { 'aria-label': '默认输出设备' }, h('option', { value: '' }, '系统默认'));
  const allow = h('button.btn', { type: 'button', hidden: true }, '显示设备名称');
  const latency = h('span.muted.tabular');
  const fill = async () => {
    let devices = [];
    try {
      devices = (await navigator.mediaDevices?.enumerateDevices?.()) || [];
    } catch {
      devices = [];
    }
    const inputs = devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default');
    input.replaceChildren(h('option', { value: '' }, '系统默认'), ...inputs.map((d, i) => h('option', { value: d.deviceId }, d.label || `输入 ${i + 1}`)));
    input.value = inputs.some((d) => d.deviceId === p.get('inputDevice')) ? p.get('inputDevice') : '';
    const outputs = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default');
    output.replaceChildren(h('option', { value: '' }, '系统默认'), ...outputs.map((d, i) => h('option', { value: d.deviceId }, d.label || `输出 ${i + 1}`)));
    output.value = outputs.some((d) => d.deviceId === p.get('outputDevice')) ? p.get('outputDevice') : '';
    allow.hidden = !inputs.length || inputs.some((d) => d.label);
    const e = app.engine;
    latency.textContent = e.ctx ? `${((e.outputLatencyFrames / e.rate) * 1000).toFixed(1)} ms (${e.rate} Hz)` : '在开始播放或录音时测量';
  };
  input.addEventListener('change', async () => {
    p.set('inputDevice', input.value || null);
    if (app.inputMetering && !app.recording) {
      try {
        await app.engine.openInput({ deviceId: input.value || undefined });
      } catch (err) {
        if (err.name !== 'AbortError') app.notify(inputErrorMessage(err), { error: true });
      }
    }
  });
  output.addEventListener('change', () => p.set('outputDevice', output.value));
  allow.addEventListener('click', async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch (err) {
      app.notify(inputErrorMessage(err), { error: true });
    }
    fill();
  });
  fill();
  return [
    h(
      'div.form-grid',
      h('label', '默认输入：'),
      h('div.io-row', input, allow),
      canPickOutput ? h('label', '默认输出：') : null,
      canPickOutput ? output : null,
      h('label', '输出延迟：'),
      latency,
    ),
  ];
}

// ----------------------------------------------------------------- markers

export async function importMarkers(app) {
  const doc = audio(app);
  if (!doc) return false;
  const targetOpen = () => {
    if (app.documents.includes(doc)) return true;
    app.notify('由于目标文件已关闭，标记导入已停止。', { error: true });
    return false;
  };
  let file = null;
  let item = null;
  if (puter.sdk() && puter.isSignedIn()) {
    [item] = await puter.pickFiles({ multiple: false, accept: '.csv,.txt,.tsv' });
    if (item) {
      if (!targetOpen()) return false;
      file = await item.read();
    }
  } else {
    [file] = await pickLocalFiles({ accept: '.csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values', multiple: false });
  }
  if (!file) return;
  if (!targetOpen()) return false;
  const name = file.name || item?.name || '';
  let parsed;
  try {
    const timeOptions = { timeFormat: app.prefs.get('timeFormat'), ...app.timeOptions() };
    const text = await file.text();
    if (!targetOpen()) return false;
    parsed = parseMarkerText(text, doc.sampleRate, timeOptions);
  } catch (err) {
    // A file with no readable markers is the user's to fix, not a failure of the command.
    const why = err?.message ? ` ${err.message}` : '';
    const from = name ? `（来自“${name}”）` : '';
    const hint =
      '标记文件应为包含 Name 和 Start 列的制表符分隔或 CSV 文本文件，格式与“文件 > 导出 > 标记”导出的文件相同。';
    app.notify(`未能导入任何标记${from}。${why} ${hint}`, { error: true });
    return;
  }
  const inside = parsed.filter((m) => m.start <= doc.length).map((m) => createMarker({ ...m, duration: Math.min(m.duration, doc.length - m.start) }));
  if (!inside.length) {
    app.notify('文件中的所有标记均超出了此音频的结尾。', { error: true });
    return;
  }
  doc.apply('导入标记', { ...doc.state, markers: sortMarkers([...doc.state.markers, ...inside]) });
  app.notify(`已导入 ${inside.length} 个标记${inside.length < parsed.length ? `（已跳过超出结尾的 ${parsed.length - inside.length} 个标记）` : ''}。`);
  app.dock?.openPanel('markers', { focus: false });
}

// ------------------------------------------------------------ window close

/**
 * Recent files for the Open Recent menu: [sessions, audio files] (empty groups left out),
 * each { name, path, label }, the label naming the folder when two files share a name.
 */
export function recentGroups(list) {
  const count = new Map();
  for (const r of list) count.set(r.name, (count.get(r.name) || 0) + 1);
  const label = (r) => {
    if (count.get(r.name) < 2 || !r.path) return r.name;
    const parts = r.path.split('/');
    return `${r.name} (${parts[parts.length - 2] || '/'})`;
  };
  const item = (r) => ({ ...r, label: label(r) });
  const session = (r) => /\.asesx$/i.test(r.name || '');
  return [list.filter(session).map(item), list.filter((r) => !session(r)).map(item)].filter((g) => g.length);
}

function installWindowClose(app) {
  const p = puter.sdk();
  if (!p?.ui?.onWindowClose || puter.env() !== 'app') return;
  p.ui.onWindowClose(async () => {
    if (app.recorder.active) await app.recorder.stop();
    // Finalizing a session take can add unsaved audio files and edit the
    // session. Finish it before taking the list of documents to prompt for.
    if (app.multitrack?.recorder?.active) await app.multitrack.recorder.stop();
    const dirty = app.documents.filter((d) => d.dirty);
    const batch = { others: dirty.length - 1, answer: null };
    for (const doc of dirty) {
      if (!(await app.closeDocument(doc, { batch }))) return; // Cancel keeps the window open
    }
    await app.autosave?.run().catch(() => {});
    p.exit();
  });
}
