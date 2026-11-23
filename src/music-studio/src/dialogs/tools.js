// Small tool windows: undo history, tap tempo and purge unused.

import { h, announce } from '../lib/dom.js';
import { openDialog, confirmDialog } from '../ui/dialog.js';
import { openWindow, getWindow } from '../ui/windows.js';
import * as E from '../model/edits.js';

// ------------------------------------------------------------------ undo history

/** History rows: the initial state, every undo step, then the redo steps (pure). */
export function historyEntries(store) {
  const rows = [{ index: 0, label: '已打开工程', state: store.undoStack.length === 0 ? 'current' : 'past' }];
  store.undoStack.forEach((s, i) => rows.push({ index: i + 1, label: s.label, state: i === store.undoStack.length - 1 ? 'current' : 'past' }));
  const n = store.undoStack.length;
  for (let j = store.redoStack.length - 1, k = 1; j >= 0; j--, k++) rows.push({ index: n + k, label: store.redoStack[j].label, state: 'future' });
  return rows;
}

export function openHistory(app) {
  // Already open: bring it forward (building another list would subscribe again).
  const existing = getWindow('undo-history');
  if (existing) {
    existing.raise();
    existing.focus();
    return existing;
  }
  const store = app.store;
  const list = h('div.history-list', { role: 'listbox', 'aria-label': '撤销历史', tabindex: '0' });
  let rows = [];
  const render = () => {
    rows = historyEntries(store);
    const current = rows.find((r) => r.state === 'current');
    list.replaceChildren(
      ...rows.map((r) =>
        h(
          `div.history-row.${r.state}`,
          { role: 'option', id: `hist-${r.index}`, 'aria-selected': String(r.state === 'current'), dataset: { index: String(r.index) } },
          h('span.history-label', r.label),
        ),
      ),
    );
    list.setAttribute('aria-activedescendant', `hist-${current.index}`);
    list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  };
  const jump = (index) => {
    store.jumpTo(index);
    const r = historyEntries(store).find((x) => x.state === 'current');
    announce(`当前处于：${r?.label}`);
  };
  list.addEventListener('click', (e) => {
    const row = e.target.closest('.history-row');
    if (row) jump(Number(row.dataset.index));
  });
  list.addEventListener('keydown', (e) => {
    const cur = rows.findIndex((r) => r.state === 'current');
    const moves = { ArrowUp: -1, ArrowDown: 1, Home: -Infinity, End: Infinity };
    if (!(e.key in moves)) return;
    e.preventDefault();
    e.stopPropagation();
    const to = Math.max(0, Math.min(rows.length - 1, cur + moves[e.key]));
    if (to !== cur) jump(rows[to].index);
  });
  const offs = [store.on('change', render)];
  render();
  const win = openWindow({
    key: 'undo-history',
    title: '撤销历史',
    icon: 'history',
    width: 280,
    body: h('div.history', h('p.faint.history-note', '点击任意步骤即可回退到该位置。在您做出新的更改之前，后续步骤将始终保留。'), list),
    onClose: () => offs.forEach((off) => off()),
  });
  requestAnimationFrame(() => list.focus());
  return win;
}

// ------------------------------------------------------------------ tap tempo

/** BPM from tap times in ms (the last taps within a 2 s gap), or null (pure). */
export function tapBpm(times) {
  const recent = [];
  for (let i = times.length - 1; i >= 0; i--) {
    if (recent.length && recent[0] - times[i] > 2000) break;
    recent.unshift(times[i]);
    if (recent.length >= 9) break;
  }
  if (recent.length < 2) return null;
  const avg = (recent.at(-1) - recent[0]) / (recent.length - 1);
  return Math.round((60000 / avg) * 10) / 10;
}

export async function openTapTempo(app) {
  const { store } = app;
  const loadVersion = store.loadVersion;
  const taps = [];
  const value = h('div.tap-value', { 'aria-live': 'polite' }, String(store.project.bpm));
  const unit = h('div.tap-unit.faint', '请至少敲击两次');
  let bpm = null;
  const tap = () => {
    const now = performance.now();
    if (taps.length && now - taps.at(-1) > 2000) taps.length = 0;
    taps.push(now);
    bpm = tapBpm(taps);
    pad.classList.remove('flash');
    void pad.offsetWidth;
    pad.classList.add('flash');
    if (bpm) {
      value.textContent = bpm.toFixed(1);
      unit.textContent = `由 ${Math.min(taps.length, 9)} 次敲击测得的 BPM`;
    }
    applyBtn().disabled = !bpm;
  };
  const pad = h('button.tap-pad', { type: 'button', onclick: tap, 'aria-label': '敲击测速' }, '敲击', h('span.faint', '或按 T 键'));
  const body = h('div.tap', pad, h('div.tap-readout', value, unit));
  const applyBtn = () => body.closest('.dialog')?.querySelector('.btn.primary') || { disabled: false };
  const done = openDialog({
    store,
    title: '敲击测速 (Tap Tempo)',
    className: 'dlg-tap',
    body,
    buttons: [
      { label: '取消', value: null },
      { label: '应用速度', value: 'apply', primary: true, disabled: true },
    ],
    onSubmit: () => Boolean(bpm),
    initialFocus: '.tap-pad',
  });
  // T taps anywhere in the dialog (the dialog is in the document once openDialog returns).
  body.closest('.dialog')?.addEventListener('keydown', (e) => {
    if ((e.key === 't' || e.key === 'T') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
      e.preventDefault();
      tap();
    }
  });
  const r = await done;
  if (r === 'apply' && bpm && store.loadVersion === loadVersion) {
    app.setTempo(bpm, '敲击测速');
    app.notify(`速度已设为 ${bpm} BPM`);
  }
}

// ------------------------------------------------------------------ purge unused

/**
 * Removes channels no pattern or audio clip uses, empty patterns not in the
 * playlist (one pattern always stays) and samples nothing refers to (pure).
 * Optional allowed ID sets restrict removal to a previously confirmed list.
 */
export function purgeUnused(project, allowed) {
  const used = new Set(project.patterns.flatMap((p) => Object.keys(p.notes).filter((k) => p.notes[k].length)));
  for (const c of project.clips) if (c.kind === 'audio') used.add(c.ref);
  const channels = project.channels.filter((c) => !used.has(c.id) && (!allowed || allowed.channels.has(c.id))).map((c) => c.id);
  let next = E.removeChannels(project, channels);
  const inPlaylist = new Set(next.clips.filter((c) => c.kind === 'pattern').map((c) => c.ref));
  const empty = next.patterns.filter((p) => !inPlaylist.has(p.id) && !Object.values(p.notes).some((l) => l.length) && (!allowed || allowed.patterns.has(p.id))).map((p) => p.id);
  const keepOne = empty.length === next.patterns.length ? empty.slice(1) : empty;
  if (keepOne.length) {
    const removed = new Set(keepOne);
    // These patterns have no playlist clips; remove them in one pass.
    next = { ...next, patterns: next.patterns.filter((p) => !removed.has(p.id)) };
  }
  const refs = new Set(next.channels.map((c) => c.sample).filter(Boolean));
  const samples = Object.keys(next.samples).filter((id) => !refs.has(id) && (!allowed || allowed.samples.has(id)));
  if (samples.length) {
    const kept = { ...next.samples };
    for (const id of samples) delete kept[id];
    next = { ...next, samples: kept };
  }
  return { project: next, channels: channels.length, patterns: keepOne.length, samples: samples.length, removed: { channels, patterns: keepOne, samples } };
}

export async function purgeCommand(app) {
  const { store } = app;
  const loadVersion = store.loadVersion;
  const preview = purgeUnused(store.project);
  const n = (count, word) => `${count} 个${word}`;
  const describe = (result) => [
    result.channels && n(result.channels, '未使用的通道'),
    result.patterns && n(result.patterns, '空样式'),
    result.samples && n(result.samples, '未使用的采样'),
  ].filter(Boolean).join('、');
  const summary = describe(preview);
  if (!summary) {
    app.notify('无需清理：所有通道、样式和采样均在使用中');
    return;
  }
  const allowed = Object.fromEntries(Object.entries(preview.removed).map(([kind, ids]) => [kind, new Set(ids)]));
  const ok = await confirmDialog({ store, title: '清理未使用的项', message: `要移除 ${summary} 吗？您可以撤销此操作。`, confirm: '移除', danger: true });
  if (!ok || store.loadVersion !== loadVersion) return;
  const result = store.apply('清理未使用的项', (p) => purgeUnused(p, allowed));
  const removed = describe(result);
  app.notify(removed ? `已移除 ${removed}` : '未移除任何项：所确认的项目现在已在使用中或已不存在');
}
