// Preferences: General (theme, hints, layout, warnings), Audio (latency,
// sample rate, output device, test tone, MIDI input) and Saving (cloud
// autosave, where projects are kept). Changes apply immediately.

import { h } from '../lib/dom.js';
import { openDialog } from '../ui/dialog.js';
import * as puter from '../storage/puter.js';

const LATENCY = [
  { value: 'interactive', label: '最低延迟', hint: '最适合实时演奏，需要性能较好的设备。' },
  { value: 'balanced', label: '平衡', hint: '延迟略高，减少爆音与卡顿。' },
  { value: 'playback', label: '最稳定', hint: '适合配置较低的设备与大型工程，实时演奏会有明显延迟。' },
];
const RATES = [
  { value: 'auto', label: '设备默认' },
  { value: 44100, label: '44.1 kHz' },
  { value: 48000, label: '48 kHz' },
  { value: 96000, label: '96 kHz' },
];

let seq = 0;
const nid = (p) => `${p}-${++seq}`;
const outputChanges = new WeakMap();

// Keep device changes ordered even if Preferences is closed and reopened
// while a browser device switch is still pending.
function changeOutput(engine, prefs, id) {
  const apply = async () => {
    for (;;) {
      const context = engine.ctx;
      try {
        if (engine.setOutputDevice) await engine.setOutputDevice(id);
        else if (context?.setSinkId) await context.setSinkId(id);
      } catch (err) {
        if (engine.ctx === context) throw err;
      }
      // A latency/rate change may replace the context while switching. Apply
      // the choice to its successor before remembering it as the output.
      if (engine.ctx === context) break;
    }
    prefs.set('outputDevice', id);
  };
  const previous = outputChanges.get(engine);
  const pending = previous ? previous.then(apply, apply) : apply();
  outputChanges.set(engine, pending);
  const clear = () => { if (outputChanges.get(engine) === pending) outputChanges.delete(engine); };
  pending.then(clear, clear);
  return pending;
}

function selectRow(label, options, value, onChange, hint) {
  const id = nid('pref');
  const sel = h('select.select', { id, onchange: () => onChange(sel.value) }, options.map((o) => h('option', { value: String(o.value), selected: String(o.value) === String(value) }, o.label)));
  return h('div.pref-row', h('label', { for: id }, label), h('div.pref-control', sel, hint ? h('div.pref-hint', hint) : null));
}

function checkRow(label, checked, onChange, hint) {
  const id = nid('pref');
  const box = h('input', { id, type: 'checkbox', checked, onchange: () => onChange(box.checked) });
  return h('div.pref-row.pref-check', h('div'), h('div.pref-control', h('label.check', { for: id }, box, h('span', label)), hint ? h('div.pref-hint', hint) : null));
}

function buttonRow(label, text, onClick, hint) {
  return h('div.pref-row', h('span.pref-label', label), h('div.pref-control', h('button.btn.sm', { type: 'button', onclick: onClick }, text), hint ? h('div.pref-hint', hint) : null));
}

export async function openPreferences(app, { section = 'general' } = {}) {
  const prefs = app.prefs;
  const engine = app.engine;
  let toneRequest = 0;
  let stopTone = null;
  let toneTimer = null;
  const cancelTone = () => {
    toneRequest++;
    clearTimeout(toneTimer);
    toneTimer = null;
    stopTone?.();
    stopTone = null;
  };

  // ---------------------------------------------------------------- general
  const general = h(
    'div.pref-section',
    selectRow('主题', [{ value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }], prefs.get('theme'), (v) => app.commands.run(`theme.${v}`)),
    checkRow('在状态栏中显示提示', prefs.get('hints') !== false, (v) => prefs.set('hints', v), '描述鼠标指针下方的控件。'),
    buttonRow('窗口布局', '重置布局', () => {
      app.commands.run('view.resetLayout');
      app.notify('窗口布局已重置');
    }),
    buttonRow('提示消息', '重新显示所有消息', () => {
      prefs.set('dismissedNotices', []);
      try {
        localStorage.removeItem('music-studio:alphaNoticeSeen');
      } catch {
        // Blocked storage: nothing was remembered anyway.
      }
      app.notify('已关闭的提示消息将重新显示');
    }, '重新显示内测提示和保存技巧等一次性通知。'),
  );

  // ---------------------------------------------------------------- audio
  const latencyHint = h('div.pref-hint');
  const syncLatencyHint = (v) => {
    latencyHint.textContent = `${LATENCY.find((l) => l.value === v)?.hint || ''} 将在下次启动音频时生效。`;
  };
  const latency = selectRow('延迟', LATENCY, prefs.get('latencyHint'), (v) => {
    prefs.set('latencyHint', v);
    syncLatencyHint(v);
    engine.restart?.();
  });
  latency.querySelector('.pref-control').append(latencyHint);
  syncLatencyHint(prefs.get('latencyHint'));

  const rate = selectRow('采样率', RATES, prefs.get('sampleRate') ?? 'auto', (v) => {
    prefs.set('sampleRate', v === 'auto' ? 'auto' : Number(v));
    engine.restart?.();
  }, '将在下次启动音频时生效。导出音频时可单独选择采样率。');

  const audio = h('div.pref-section', latency, rate);
  const canSink = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
  if (canSink && navigator.mediaDevices?.enumerateDevices) {
    const id = nid('pref');
    const sel = h('select.select', { id }, h('option', { value: '' }, '系统默认'));
    const row = h('div.pref-row', h('label', { for: id }, '输出设备'), h('div.pref-control', sel, h('div.pref-hint', '浏览器允许音频输入后将显示设备名称。')));
    audio.append(row);
    navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        const outs = list.filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default');
        outs.forEach((d, i) => sel.append(h('option', { value: d.deviceId, selected: d.deviceId === prefs.get('outputDevice') }, d.label || `输出设备 ${i + 1}`)));
      })
      .catch(() => {});
    sel.addEventListener('change', async () => {
      const choice = sel.value;
      sel.disabled = true;
      try {
        await changeOutput(engine, prefs, choice);
      } catch (err) {
        sel.value = prefs.get('outputDevice') || '';
        app.notify(`无法使用该输出设备：${err?.message || err}`, { error: true });
      } finally {
        sel.disabled = false;
      }
    });
  }
  audio.append(
    buttonRow('测试', '播放测试音', async () => {
      cancelTone();
      const request = toneRequest;
      try {
        const ready = await engine.start();
        if (!ready || request !== toneRequest || !audio.isConnected) return;
        stopTone = engine.audition?.({ type: 'synth', params: { osc1_wave: 0, osc2_level: 0, sub_level: 0, cutoff: 20000, a_attack: 10, a_sustain: 1, a_release: 80, vel_amp: 0, gain: 0.5 } }, 69, 0.7);
        toneTimer = setTimeout(cancelTone, 900);
      } catch (err) {
        if (request === toneRequest && audio.isConnected) app.reportError(err);
      }
    }, '通过主输出播放持续 1 秒的 440 Hz A 音。'),
  );
  if (app.commands.has('options.midiInput')) {
    audio.append(checkRow('MIDI 键盘输入', Boolean(app.commands.checked('options.midiInput')), () => app.commands.run('options.midiInput'), '使用已连接的 MIDI 键盘演奏乐器。'));
  }

  // ---------------------------------------------------------------- saving
  const signedIn = puter.isSignedIn();
  const where = h('p.pref-note', signedIn ? '工程将保存到您的 本地存储（Music Studio 文件 > Projects）。当前会话也会保存在此浏览器中，因此刷新页面不会丢失工作内容。' : '您尚未登录，因此工程将保存在当前设备的此浏览器中。当前会话会自动保留，刷新页面不会丢失工作内容。');
  const saving = h(
    'div.pref-section',
    where,
    checkRow('自动保存云端工程', prefs.get('cloudAutosave') !== false, (v) => prefs.set('cloudAutosave', v), '在您停止编辑一分钟后以及离开页面时，自动保存位于 本地存储的工程。'),
  );
  if (!signedIn && puter.sdk() && puter.env() !== 'app') {
    saving.append(buttonRow('本地存储', '登录', () => app.signIn?.(), '将工程保存到您的 本地存储，并在任何设备上打开。'));
  }
  const usage = h('div.pref-hint');
  saving.append(h('div.pref-row', h('span.pref-label', '当前浏览器'), h('div.pref-control', usage)));
  navigator.storage
    ?.estimate?.()
    .then((e) => {
      if (e?.usage !== undefined) usage.textContent = `音乐工作室及本站其他数据已使用 ${(e.usage / 1024 / 1024).toFixed(1)} MB。`;
    })
    .catch(() => {});

  // ---------------------------------------------------------------- tabs
  const sections = [
    { id: 'general', label: '常规', el: general },
    { id: 'audio', label: '音频', el: audio },
    { id: 'saving', label: '保存', el: saving },
  ];
  const tabs = h('div.pref-tabs', { role: 'tablist', 'aria-label': '首选项', 'aria-orientation': 'vertical' });
  const panels = h('div.pref-panels');
  const select = (id, focus = false) => {
    for (const s of sections) {
      const on = s.id === id;
      s.tab.setAttribute('aria-selected', String(on));
      s.tab.tabIndex = on ? 0 : -1;
      s.el.hidden = !on;
      if (on && focus) s.tab.focus();
    }
  };
  for (const s of sections) {
    const tabId = nid('tab');
    const panelId = nid('tabpanel');
    s.tab = h('button.pref-tab', { type: 'button', role: 'tab', id: tabId, 'aria-controls': panelId, onclick: () => select(s.id) }, s.label);
    s.el.id = panelId;
    s.el.setAttribute('role', 'tabpanel');
    s.el.setAttribute('aria-labelledby', tabId);
    tabs.append(s.tab);
    panels.append(s.el);
  }
  tabs.addEventListener('keydown', (e) => {
    const i = sections.findIndex((s) => s.tab === document.activeElement);
    const moves = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (e.key in moves) {
      e.preventDefault();
      select(sections[(i + moves[e.key] + sections.length) % sections.length].id, true);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      select(sections[e.key === 'Home' ? 0 : sections.length - 1].id, true);
    }
  });
  select(sections.some((s) => s.id === section) ? section : 'general');

  await openDialog({
    title: '首选项',
    wide: true,
    className: 'dlg-prefs',
    body: h('div.prefs', tabs, panels),
    buttons: [{ label: '完成', value: true, primary: true }],
    initialFocus: '.pref-tab[aria-selected="true"]',
  });
  cancelTone();
}
