// Audio export: the song or the current pattern to a WAV file, or one WAV
// per mixer insert (stems) in a ZIP. Renders offline through
// app.engine.render with a progress bar; closing the dialog cancels.
// When signed in, a copy can also go to Exports in the app's Puter folder.

import { h } from '../lib/dom.js';
import { openDialog } from '../ui/dialog.js';
import { encodeWav } from '../io/wav.js';
import { zipBlob } from '../io/zip.js';
import { downloadBlob, safeFileName } from '../io/download.js';
import { songLength, patternLength, patternById } from '../model/project.js';
import { formatTime } from '../model/time.js';
import { tempoMap } from '../engine/compile.js';
import * as puter from '../storage/puter.js';

export const EXPORT_RATES = [44100, 48000, 88200, 96000];
/** Longest effect tail rendered after the end, in seconds (long reverbs decay up to 20 s). */
export const TAIL_MAX = 30;
export const EXPORT_BITS = [
  { bits: 16, label: '16 位（抖动）' },
  { bits: 24, label: '24 位' },
  { bits: 32, label: '32 位浮点' },
];

/** Mixer inserts that carry sound: a channel plays into them, or another insert sends to them. */
export function stemInserts(project) {
  const used = new Set(project.channels.filter((c) => c.mixer > 0).map((c) => c.mixer));
  // Buses fed by used inserts count too (follow sends until nothing new).
  let grew = true;
  while (grew) {
    grew = false;
    for (const i of [...used]) {
      for (const k of Object.keys(project.mixer[i]?.routes || {})) {
        const to = Number(k);
        if (to > 0 && !used.has(to)) {
          used.add(to);
          grew = true;
        }
      }
    }
  }
  return [...used].sort((a, b) => a - b).map((index) => ({ index, name: project.mixer[index]?.name || `轨道 ${index}` }));
}

let seq = 0;

export async function openExportDialog(app, { stems = false } = {}) {
  const store = app.store;
  const p = store.project;
  const fmt = app.prefs.get('exportFormat');
  const hasSong = songLength(p) > 0;
  const inserts = stems ? stemInserts(p) : [];
  if (stems && !inserts.length) {
    app.notify('没有通道输出到混音器轨道，因此没有可导出的分轨。请在通道机架中将通道路由至混音器轨道。', { error: true });
    return;
  }

  const id = (s) => `exp-${s}-${++seq}`;
  const radio = (name, value, label, checked, detail) => {
    const rid = id(name);
    return h('label.exp-radio', { for: rid }, h('input', { type: 'radio', id: rid, name, value, checked }), h('span', label), detail ? h('span.faint', detail) : null);
  };
  const lenText = (ticks, mode = 'song') => formatTime(ticks, tempoMap(store.project, mode)).replace(/:\d\d$/, '');
  const groupName = id('range');
  const range = h(
    'fieldset.exp-field',
    h('legend', '导出范围'),
    radio(groupName, 'song', '整首歌曲', hasSong, hasSong ? lenText(songLength(p)) : '空'),
    radio(groupName, 'pattern', `样式：${store.pattern.name}`, !hasSong, lenText(patternLength(store.pattern, p.sig), 'pattern')),
  );
  if (!hasSong) range.querySelector('input[value="song"]').disabled = true;

  const rateId = id('rate');
  const rate = h('select.select', { id: rateId }, EXPORT_RATES.map((r) => h('option', { value: String(r), selected: r === fmt.rate }, `${(r / 1000).toFixed(r % 1000 ? 1 : 0)} kHz`)));
  const bitsId = id('bits');
  const bits = h('select.select', { id: bitsId }, EXPORT_BITS.map((b) => h('option', { value: String(b.bits), selected: b.bits === fmt.bits }, b.label)));
  const tailId = id('tail');
  const tail = h('input', { type: 'checkbox', id: tailId, checked: fmt.tail !== false });
  const signedIn = puter.isSignedIn();
  const cloudId = id('cloud');
  const cloud = h('input', { type: 'checkbox', id: cloudId, checked: Boolean(fmt.cloudCopy) });

  const bar = h('div.exp-bar', h('div.exp-fill'));
  const status = h('div.exp-status', { role: 'status', 'aria-live': 'polite' });
  const progress = h('div.exp-progress', { role: 'progressbar', 'aria-label': '导出进度', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', hidden: true }, bar);
  const setProgress = (f) => {
    const pct = Math.round(Math.max(0, Math.min(1, f)) * 100);
    bar.firstChild.style.width = `${pct}%`;
    progress.setAttribute('aria-valuenow', String(pct));
  };

  const stemSummary = stems ? h('p') : null;
  const body = h(
    'div.export',
    stemSummary,
    range,
    h('div.form-grid', h('label', { for: rateId }, '采样率'), rate, h('label', { for: bitsId }, '格式'), bits),
    h('label.check', { for: tailId }, tail, h('span', '包含效果尾音（保留混响与延迟余音）')),
    signedIn ? h('label.check', { for: cloudId }, cloud, h('span', '同时在您的 本地存储 Exports 文件夹中保存副本')) : null,
    progress,
    status,
  );

  let controller = null;
  let busy = false;
  let replaced = false;
  let closeDialog;
  const closeReplaced = () => {
    if (!body.isConnected) return;
    closeDialog(null);
    app.notify('由于打开了其他工程，导出已关闭。');
  };
  const dialogDone = openDialog({
    title: stems ? '导出分轨' : '导出音频',
    className: 'dlg-export',
    body: (close) => { closeDialog = close; return body; },
    buttons: [
      { label: '取消', value: null },
      { label: '导出', value: 'export', primary: true },
    ],
    onSubmit: async () => {
      if (busy) return false;
      if (replaced) { closeReplaced(); return false; }
      if (stems && !stemInserts(store.project).length) return false;
      busy = true;
      const exportBtn = body.closest('.dialog')?.querySelector('.btn.primary');
      if (exportBtn) exportBtn.disabled = true;
      controller = new AbortController();
      const opts = {
        mode: range.querySelector('input:checked')?.value || 'pattern',
        rate: Number(rate.value),
        bits: Number(bits.value),
        tail: tail.checked,
      };
      app.prefs.merge('exportFormat', { rate: opts.rate, bits: opts.bits, tail: opts.tail, cloudCopy: cloud.checked });
      progress.hidden = false;
      status.classList.remove('error');
      setProgress(0);
      try {
        const ok = await runExport(app, { ...opts, stems, signal: controller.signal, cloudCopy: signedIn && cloud.checked, setProgress, setStatus: (t) => (status.textContent = t) });
        return ok;
      } catch (err) {
        if (controller.signal.aborted) return true;
        status.textContent = renderError(err);
        status.classList.add('error');
        return false;
      } finally {
        busy = false;
        if (exportBtn) exportBtn.disabled = false;
        refreshMetadata();
      }
    },
  });
  function refreshMetadata() {
    if (busy || replaced || !body.isConnected) return;
    const project = store.project;
    const pattern = store.pattern;
    const songTicks = songLength(project);
    const songInput = range.querySelector('input[value="song"]');
    const patternInput = range.querySelector('input[value="pattern"]');
    songInput.disabled = songTicks <= 0;
    if (songInput.disabled && songInput.checked) patternInput.checked = true;
    songInput.closest('label').querySelector('.faint').textContent = songTicks > 0 ? lenText(songTicks) : '空';
    patternInput.nextElementSibling.textContent = `样式：${pattern.name}`;
    patternInput.closest('label').querySelector('.faint').textContent = lenText(patternLength(pattern, project.sig), 'pattern');
    if (stems) {
      const currentInserts = stemInserts(project);
      stemSummary.textContent = currentInserts.length
        ? `每个混音器轨道导出一个 WAV 文件（共 ${currentInserts.length} 个）：${currentInserts.map((i) => i.name).join('、')}。每个分轨均包含该轨道的效果器与发送。`
        : '没有通道输出到混音器轨道。导出分轨前请先将通道路由至混音器轨道。';
      const exportBtn = body.closest('.dialog')?.querySelector('.btn.primary');
      if (exportBtn) exportBtn.disabled = !currentInserts.length;
    }
  }
  refreshMetadata();
  const offView = store.on('view', refreshMetadata);
  const off = store.on('change', (_project, _previous, info) => {
    if (info?.source !== 'load') { refreshMetadata(); return; }
    replaced = true;
    // A running export already owns a snapshot. Only unsubmitted settings
    // still refer to the mutable project and must be discarded on replacement.
    if (!busy) closeReplaced();
  });
  const result = await dialogDone;
  off();
  offView();
  // Closed (Cancel, Escape, close button) while rendering: stop the render.
  if (result === null && controller && !controller.signal.aborted) controller.abort();
}

function renderError(err) {
  const msg = err?.message || String(err);
  if (/not available/i.test(msg)) return '音频导出需要音频引擎支持，当前版本暂不可用，请更新后重试。';
  return `导出失败：${msg}`;
}

async function runExport(app, { mode, rate, bits, tail, stems, signal, cloudCopy, setProgress, setStatus }) {
  const snapshot = app.engine.captureRenderSnapshot();
  const p = snapshot.project;
  const pattern = patternById(p, snapshot.patternId) || p.patterns[0];
  const inserts = stems ? stemInserts(p) : [];
  const base = safeFileName(mode === 'pattern' ? `${p.name} - ${pattern.name}` : p.name);
  const render = (isolate, part, parts) =>
    app.engine.render({
      mode,
      snapshot,
      rate,
      // Seconds at most: the render ends early once the tails fall silent.
      tail: tail ? TAIL_MAX : 0,
      isolate,
      signal,
      onProgress: (f) => setProgress((part + f) / parts),
    });
  let blob;
  let filename;
  if (!stems) {
    setStatus('正在渲染...');
    const audio = await render(undefined, 0, 1);
    if (signal.aborted) return true;
    setStatus('正在写入文件...');
    blob = new Blob([encodeWav(audio, { bits })], { type: 'audio/wav' });
    filename = `${base}.wav`;
  } else {
    const files = [];
    for (let i = 0; i < inserts.length; i++) {
      const ins = inserts[i];
      setStatus(`正在渲染分轨 ${i + 1} / ${inserts.length}：${ins.name}`);
      const audio = await render(ins.index, i, inserts.length);
      if (signal.aborted) return true;
      files.push({ name: `${String(ins.index).padStart(2, '0')} ${safeFileName(ins.name)}.wav`, data: new Uint8Array(encodeWav(audio, { bits })) });
    }
    setStatus('正在写入 ZIP 文件...');
    blob = zipBlob(files);
    filename = `${base} stems.zip`;
  }
  setProgress(1);
  downloadBlob(blob, filename);
  if (cloudCopy && puter.isSignedIn()) {
    setStatus('正在保存副本到 Puter...');
    try {
      const directory = await puter.appSubdir('Exports');
      if (signal.aborted) return true;
      const item = await puter.writeNew(puter.joinPath(directory, filename), blob);
      app.notify(`已导出 ${filename}（副本已保存至 本地存储 Exports 文件夹，文件名为 ${item?.name || filename}）`);
    } catch (err) {
      if (signal.aborted) return true;
      app.notify(`已下载 ${filename}，但保存到本地 失败：${puter.errorMessage(err)}`, { error: true });
    }
  } else {
    app.notify(`已导出 ${filename}`);
  }
  return true;
}
