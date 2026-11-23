/**
 * Tracking safeguards: the timer that runs through a sleeping laptop, the
 * timer that runs all night, the workday that was never tracked, and the
 * work that was tracked and never billed. A detected sleep/away gap
 * prompts to keep, trim, or split the session; a long-running timer
 * prompts once (keep it, stop at the threshold, or stop with full time);
 * an optional weekday nudge fires when nothing is tracked by a chosen
 * hour; an optional monthly one mentions unbilled time that is getting
 * old. All stay in-app unless the user opted into system notifications in
 * Settings.
 */

import { el } from './dom.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { store } from '../lib/store.js';
import { fmtDuration, fmtClock, todayISO, isoOf } from '../lib/time.js';

const NUDGE_LS = 'hourly:nudged';
const UNBILLED_LS = 'hourly:unbilled-nudged';
const HEARTBEAT_LS = 'hourly:heartbeat';
let prompting = false;
/* Like the budget warnings: the first pass after boot is silent, so
   opening the app is never a wall of things that were already true. */
let unbilledSeeded = false;

export function initSafeguards() {
  // The shell lives for the whole session; a slow heartbeat is plenty.
  // Hidden tabs are throttled to about one tick a minute, which still
  // beats far more often than any gap worth prompting about.
  setInterval(() => check().catch((e) => console.error('safeguards', e)), 30 * 1000);
  // Wake-from-sleep and tab refocus should be caught right away, not up
  // to half a minute later.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check().catch((e) => console.error('safeguards', e));
  });
  store.addEventListener('change', writeBeat);
  check().catch((e) => console.error('safeguards', e));
}

async function check() {
  await checkIdleGap();
  await checkLongTimer();
  await checkDailyNudge();
  await checkUnbilledReminder();
}

/* ---------- idle / sleep-gap detection ---------- */

/* While a timer runs, a heartbeat timestamp keyed to the timer's start
   lands in localStorage on every tick. A large gap between the last beat
   and now means this device slept or the app was closed while the timer
   kept counting; the user decides what happens to that time. The key is
   per-device on purpose: another device continuing to work is not a gap
   it can see, and a beat from a previous timer never matches the current
   one (different startedAt). */

function readBeat() {
  try {
    const b = JSON.parse(localStorage.getItem(HEARTBEAT_LS) || 'null');
    return b && typeof b.at === 'number' && typeof b.startedAt === 'number' ? b : null;
  } catch {
    return null;
  }
}

function writeBeat() {
  try {
    if (store.running) {
      localStorage.setItem(HEARTBEAT_LS, JSON.stringify({ startedAt: store.timer.startedAt, at: Date.now() }));
    } else {
      localStorage.removeItem(HEARTBEAT_LS);
    }
  } catch {}
}

async function checkIdleGap() {
  if (!store.running) {
    writeBeat(); // clear a stale beat so it can never haunt a later timer
    return;
  }
  const mins = Number(store.settings.idleGapMinutes) || 0;
  const t = store.timer;
  const now = Date.now();
  const beat = readBeat();
  const gapStart = beat && beat.startedAt === t.startedAt ? beat.at : null;
  if (!prompting && mins > 0 && gapStart != null && now - gapStart >= mins * 60000) {
    prompting = true;
    promptIdleGap(t, gapStart, now);
  }
  writeBeat();
}

function promptIdleGap(t, gapStart, now) {
  const project = store.project(t.projectId);
  const preGapSeconds = Math.max(0, Math.floor((gapStart - t.startedAt) / 1000));
  const sameDay = isoOf(new Date(gapStart)) === isoOf(new Date(now));
  const gapStartText = new Intl.DateTimeFormat(undefined,
    sameDay ? { hour: 'numeric', minute: '2-digit' }
      : { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(gapStart);

  /* 'split': log the pre-gap time and restart the timer fresh from now.
     'trim': log the pre-gap time and stop. */
  const finish = async (mode, modal) => {
    try {
      const entry = await store.stopTimer({ capSeconds: preGapSeconds });
      if (mode === 'split') {
        await store.startTimer({ projectId: t.projectId, task: t.task, notes: t.notes, billable: t.billable });
      }
      toast(`已记录 ${fmtClock(entry.seconds)}${mode === 'split' ? '，计时器已重新启动' : ''}`, { icon: 'check' });
      modal.close();
    } catch (err) {
      console.error(err);
      toast('无法更新计时器，请检查网络连接', { icon: 'wifiOff' });
    }
  };

  const modal = openModal({
    title: '您刚才离开了吗？',
    content: el('div', {},
      el('p.confirm-message', {},
        `当此设备休眠或应用关闭时，“${project?.name || '您的工作'}”的计时器自 ${gapStartText} 起持续运行了 ${fmtDuration((now - gapStart) / 1000)}。在此间隔前已追踪 ${fmtDuration(preGapSeconds)}。`),
      el('button.btn.btn-primary.btn-block', {
        onclick: () => finish('split', modal),
      }, '扣除离开时间并继续计时'),
      el('button.btn.btn-ghost.btn-block', {
        style: { marginTop: '10px' },
        onclick: () => finish('trim', modal),
      }, `在离开时停止（${fmtDuration(preGapSeconds)}）`),
      el('button.btn.btn-ghost.btn-block', {
        style: { marginTop: '10px' },
        onclick: () => modal.close(),
      }, '保留全部时长')
    ),
    onClose: () => { prompting = false; },
  });
}

async function checkLongTimer() {
  const hours = Number(store.settings.longTimerHours) || 0;
  if (!hours || !store.running || store.timer.longPrompted || prompting) return;
  const cap = hours * 3600;
  if (store.elapsedSeconds() < cap) return;

  prompting = true;
  // Persist the prompt marker first, so a reload (or a second tab) never
  // re-asks about the same timer; failing to persist retries next beat.
  try {
    await store.retagTimer({ longPrompted: true });
  } catch {
    prompting = false;
    return;
  }

  notifyNative('计时器仍在运行', `您的 Hourly 计时器已超过 ${hours} 小时。还在工作吗？`);

  const project = store.project(store.timer?.projectId);
  const running = fmtDuration(store.elapsedSeconds());
  const modal = openModal({
    title: '还在工作吗？',
    content: el('div', {},
      el('p.confirm-message', {},
        `“${project?.name || '您的工作'}”的计时器已持续运行 ${running}。如果是忘记关闭，请将其停止在符合实际工作的时长。`),
      el('button.btn.btn-primary.btn-block', {
        onclick: () => stopWith(cap, modal),
      }, `停止并保留 ${hours} 小时`),
      el('button.btn.btn-ghost.btn-block', {
        style: { marginTop: '10px' },
        onclick: () => stopWith(null, modal),
      }, `按完整时长停止（${running}）`),
      el('button.btn.btn-ghost.btn-block', {
        style: { marginTop: '10px' },
        onclick: () => modal.close(),
      }, '继续运行')
    ),
    onClose: () => { prompting = false; },
  });
}

async function stopWith(capSeconds, modal) {
  try {
    const entry = await store.stopTimer({ capSeconds });
    toast(`已记录 ${fmtClock(entry.seconds)}`, { icon: 'check' });
    modal.close();
  } catch (err) {
    console.error(err);
    toast('无法停止，请检查网络连接', { icon: 'wifiOff' });
  }
}

async function checkDailyNudge() {
  const hour = store.settings.dailyNudgeHour;
  if (hour == null) return;
  const now = new Date();
  const dow = now.getDay();
  if (dow === 0 || dow === 6) return; // weekdays only
  if (now.getHours() < Number(hour)) return;
  if (store.running) return;
  const today = todayISO();
  try {
    if (localStorage.getItem(NUDGE_LS) === today) return;
  } catch {
    return;
  }
  const entries = await store.entriesBetween(today, today);
  if (entries.length) return;
  try { localStorage.setItem(NUDGE_LS, today); } catch {}
  toast('今天还没有记录工时。要启动计时器吗？', { icon: 'timer', duration: 6000 });
  notifyNative('今天尚未记录工时', '您今天的 Hourly 工时表还是空的。');
}

/**
 * Once a month, on or after the chosen day: which clients are holding
 * unbilled time older than the threshold. Opt-in, quiet, and recorded per
 * month, so a reminder that has been seen is never repeated. Nothing is
 * said when there is nothing old enough to mention, and that silence is
 * not recorded either: work that ages later this month still gets its one
 * reminder.
 */
async function checkUnbilledReminder() {
  const day = store.settings.unbilledReminderDay;
  if (day == null) return;
  if (!unbilledSeeded) {
    unbilledSeeded = true;
    return;
  }
  const now = new Date();
  if (now.getDate() < Number(day)) return;
  const month = isoOf(now).slice(0, 7);
  try {
    if (localStorage.getItem(UNBILLED_LS) === month) return;
  } catch {
    return; // no storage means no way to keep this to once a month
  }
  const minAgeDays = Number(store.settings.unbilledAgeDays) || 30;
  const ready = await store.readyToInvoice({ minAgeDays });
  if (!ready.length) return;
  try { localStorage.setItem(UNBILLED_LS, month); } catch {}

  const oldest = ready[0];
  const message = ready.length === 1
    ? `${oldest.client.name} 有 ${fmtDuration(oldest.seconds)} 未开票工时，最早距今 ${oldest.ageDays} 天`
    : `有 ${ready.length} 位客户存在超过 ${minAgeDays} 天的未开票工时`;
  toast(message, {
    icon: 'receipt',
    duration: 8000,
    action: {
      label: '查看',
      // Straight to the surface that lists it, with the tab named in the
      // URL so the view opens on the right one.
      onClick: () => { location.hash = '#/reports?view=invoices'; },
    },
  });
  notifyNative('未开票工时待处理', message);
}

function notifyNative(title, body) {
  if (!store.settings.notifyNative) return;
  // The setting promises notifications "when the app is in the background";
  // with the app focused, the in-app prompt or toast is already on screen.
  if (document.hasFocus()) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: './icons/icon-192.png' });
  } catch {}
}
