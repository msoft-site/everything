import './style.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

import {
  createIcons,
  CalendarDays,
  ChartNoAxesColumn,
  Check,
  Eraser,
  Lightbulb,
  LogOut,
  Monitor,
  Moon,
  Pause,
  Pencil,
  PencilOff,
  Plus,
  Redo2,
  Settings,
  Sun,
  Trophy,
  Undo2,
  UserRound,
  X,
} from 'lucide';

import { CELLS, SIZE, cellName, colOf, rowOf } from './engine/grid.js';
import { DIFFICULTIES, DIFFICULTY_IDS, isDifficulty, localDateKey } from './engine/generator.js';
import { requestPuzzle } from './game/puzzles.js';
import { nextHint } from './game/hints.js';
import {
  applyEliminations,
  canRedo,
  canUndo,
  clearCell,
  conflicts,
  createGame,
  isFlawless,
  isGiven,
  isSolved,
  mistakes,
  recordMistake,
  redo,
  remaining,
  setValue,
  toggleNote,
  undo,
} from './game/state.js';
import { resolveTheme } from './game/settings.js';
import { createTimer, formatDuration } from './game/timer.js';
import { STAT_DIFFICULTIES, dailyStreakOn, emptyStats, recordSolved, recordStart } from './game/stats.js';
import {
  clearSaveEverywhere,
  loadSavedGame,
  loadSettings,
  loadStats,
  pushSavedGame,
  pushStats,
  saveGame,
  saveSettings,
  saveStats,
  syncSavedGame,
  syncStats,
} from './game/persistence.js';
import * as account from './net/puter.js';
import { createBoardView } from './ui/boardView.js';
import { createKeypad } from './ui/keypad.js';
import { inUserMenu, mountUserMenu, setUserMenuTheme } from './ui/userMenu.js';

// Every icon index.html and this module reference. Named imports rather than
// the whole set, so the bundle carries twenty glyphs instead of sixteen hundred.
const ICONS = {
  CalendarDays,
  ChartNoAxesColumn,
  Check,
  Eraser,
  Lightbulb,
  LogOut,
  Monitor,
  Moon,
  Pause,
  Pencil,
  PencilOff,
  Plus,
  Redo2,
  Settings,
  Sun,
  Trophy,
  Undo2,
  UserRound,
  X,
};

const mountIcons = (root = document) => createIcons({ icons: ICONS, root });

const $ = (id) => document.getElementById(id);

const el = {
  board: $('board'),
  keypad: $('keypad'),
  veil: $('veil'),
  veilIcon: $('veil-icon'),
  veilTitle: $('veil-title'),
  veilBtn: $('veil-btn'),
  statusDifficulty: $('status-difficulty'),
  statusNote: $('status-note'),
  clock: $('clock'),
  pauseBtn: $('pause-btn'),
  progress: $('progress'),
  progressFill: $('progress-fill'),
  hintCard: $('hint-card'),
  hintBadge: $('hint-badge'),
  hintText: $('hint-text'),
  hintApply: $('hint-apply'),
  hintClose: $('hint-close'),
  undoBtn: $('undo-btn'),
  redoBtn: $('redo-btn'),
  eraseBtn: $('erase-btn'),
  notesBtn: $('notes-btn'),
  hintBtn: $('hint-btn'),
  difficultySelect: $('difficulty-select'),
  newGameBtn: $('new-game-btn'),
  dailyBtn: $('daily-btn'),
  controlsHint: $('controls-hint'),
  statsBtn: $('stats-btn'),
  settingsBtn: $('settings-btn'),
  topbarRight: document.querySelector('.topbar-right'),
  accountBtn: $('account-btn'),
  accountName: $('account-name'),
  srStatus: $('sr-status'),
  toast: $('toast'),
  solvedDialog: $('solved-dialog'),
  solvedSub: $('solved-sub'),
  resultGrid: $('result-grid'),
  solvedNew: $('solved-new'),
  solvedClose: $('solved-close'),
  statsDialog: $('stats-dialog'),
  statsSub: $('stats-sub'),
  statsBody: $('stats-body'),
  statsReset: $('stats-reset'),
  statsClose: $('stats-close'),
  settingsDialog: $('settings-dialog'),
  optionList: $('option-list'),
  settingsClose: $('settings-close'),
  confirmDialog: $('confirm-dialog'),
  confirmTitle: $('confirm-title'),
  confirmSub: $('confirm-sub'),
  confirmYes: $('confirm-yes'),
  confirmNo: $('confirm-no'),
};

/* ------------------------------------------------------------------ */
/* App state                                                           */
/* ------------------------------------------------------------------ */

const state = {
  game: null,
  timer: createTimer(),
  settings: loadSettings(),
  stats: loadStats(),
  /** Centre cell: the shortest average distance to anywhere else. */
  selected: 40,
  notesMode: false,
  /** The hint on screen, if any. Cleared by any move that changes the board. */
  hint: null,
  paused: false,
  generating: false,
  solved: false,
  /** The deduction already counted against this position. See `stepKey`. */
  chargedHint: null,
  /** Set by the first real input, so a late cloud sync never yanks the board
   *  out from under someone who has already started playing. */
  interacted: false,
  nextDifficulty: 'medium',
  accountName: null,
  signedIn: false,
};

let boardView;
let keypad;
/** puter.js's <puter-user-menu>, where it stands in for the account button. */
let userMenu = null;

/** True while the board is behind the veil: paused, or a puzzle is being built. */
const isVeiled = () => state.paused || state.generating;

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const resolved = resolveTheme(state.settings.theme, darkQuery.matches);
  document.documentElement.dataset.theme = resolved;
  // Keep the browser chrome in step with the page, and drop the media-scoped
  // pair from index.html so an explicit choice is not overridden by the OS.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.remove();
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.head.append(meta);

  for (const button of document.querySelectorAll('[data-theme-choice]')) {
    button.setAttribute(
      'aria-pressed',
      button.dataset.themeChoice === state.settings.theme ? 'true' : 'false',
    );
  }
  setUserMenuTheme(userMenu, state.settings.theme);
}

darkQuery.addEventListener('change', () => {
  if (state.settings.theme === 'system') applyTheme();
});

for (const button of document.querySelectorAll('[data-theme-choice]')) {
  button.addEventListener('click', () => {
    state.settings.theme = button.dataset.themeChoice;
    saveSettings(state.settings);
    applyTheme();
  });
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

let toastTimer;
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

/** Announce to assistive technology without moving focus or showing anything. */
let announceTimer;
function announce(message) {
  // Cleared first so an identical consecutive message is still spoken: a live
  // region only fires on a change, and "5 at r1c1" twice in a row is common.
  // A timer rather than requestAnimationFrame, which a backgrounded tab never
  // runs, so a queued announcement would simply be dropped.
  el.srStatus.textContent = '';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    el.srStatus.textContent = message;
  }, 40);
}

/**
 * A confirm dialog that resolves to the answer. Native <dialog> so focus is
 * trapped, Escape closes, and the backdrop is handled by the platform.
 */
function confirmAction({ title, body, confirmLabel, danger = true }) {
  el.confirmTitle.textContent = title;
  el.confirmSub.textContent = body;
  el.confirmYes.textContent = confirmLabel;
  el.confirmYes.className = danger ? 'btn btn-danger-solid' : 'btn btn-primary';
  el.confirmDialog.showModal();
  return new Promise((resolve) => {
    const finish = (answer) => {
      el.confirmYes.removeEventListener('click', yes);
      el.confirmNo.removeEventListener('click', no);
      el.confirmDialog.removeEventListener('close', cancel);
      if (el.confirmDialog.open) el.confirmDialog.close();
      resolve(answer);
    };
    const yes = () => finish(true);
    const no = () => finish(false);
    const cancel = () => finish(false);
    el.confirmYes.addEventListener('click', yes);
    el.confirmNo.addEventListener('click', no);
    el.confirmDialog.addEventListener('close', cancel);
  });
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function render() {
  const game = state.game;
  if (!game) return;

  // A veiled or finished board is read-only, and every control that edits one
  // says so rather than looking live and doing nothing when pressed.
  const frozen = state.solved || isVeiled();
  const wrong = state.settings.checkAsYouGo ? mistakes(game) : new Set();
  const hintFocus = new Set(state.hint?.focus ?? []);
  const hintTarget =
    state.hint?.kind === 'step' ? (state.hint.step.placements[0]?.cell ?? null) : null;

  boardView.render(game, {
    selected: state.selected,
    highlightPeers: state.settings.highlightPeers,
    highlightSame: state.settings.highlightSame,
    wrong,
    conflicts: conflicts(game),
    hintFocus,
    hintTarget,
  });

  keypad.render({
    remaining: (digit) => remaining(game, digit),
    notesMode: state.notesMode,
    showRemaining: state.settings.showRemaining,
    selectedDigit: state.selected === null ? 0 : game.values[state.selected],
    disabled: frozen,
  });

  el.undoBtn.disabled = frozen || !canUndo(game);
  el.redoBtn.disabled = frozen || !canRedo(game);
  el.eraseBtn.disabled = frozen || state.selected === null || isGiven(game, state.selected);
  el.notesBtn.disabled = frozen;
  el.notesBtn.setAttribute('aria-pressed', state.notesMode ? 'true' : 'false');
  el.hintBtn.disabled = frozen;

  const spec = DIFFICULTIES[game.difficulty] ?? DIFFICULTIES.medium;
  el.statusDifficulty.textContent = spec.label;
  el.statusNote.textContent = game.daily
    ? `每日挑战，${formatDate(game.daily)}`
    : `${game.givens ?? countGivens(game)} 个提示数`;

  const filled = countFilled(game);
  el.progress.setAttribute('aria-valuenow', String(filled));
  el.progress.setAttribute('aria-valuetext', `已填入 ${filled} / 81 个单元格`);
  el.progressFill.style.width = `${(100 * filled) / CELLS}%`;
  el.progress.classList.toggle('complete', state.solved);

  el.clock.hidden = !state.settings.showTimer;
  el.pauseBtn.hidden = state.solved;
  el.pauseBtn.setAttribute('aria-label', state.paused ? '继续' : '暂停');
  el.pauseBtn.title = state.paused ? '继续' : '暂停';
  renderClock();
  renderHintCard();
}

function renderClock() {
  if (!state.settings.showTimer) return;
  el.clock.textContent = formatDuration(state.timer.elapsedMs);
}

function renderHintCard() {
  const hint = state.hint;
  // A hint names the digit and the cell, so leaving it on screen while the board
  // is blurred would hand over the very thing the veil is hiding. The hint is
  // kept in state, so it comes back on resume.
  if (!hint || isVeiled()) {
    el.hintCard.hidden = true;
    return;
  }
  el.hintCard.hidden = false;
  el.hintBadge.textContent =
    hint.kind === 'step' ? hint.step.label : hint.kind === 'mistake' ? '错误' : '卡住了';
  el.hintText.textContent = hint.message;
  // Only a real deduction can be applied; a mistake is the player's to undo,
  // and being stuck has nothing to apply.
  el.hintApply.hidden = hint.kind !== 'step';
}

const countFilled = (game) => {
  let n = 0;
  for (let i = 0; i < CELLS; i++) if (game.values[i]) n++;
  return n;
};

const countGivens = (game) => {
  let n = 0;
  for (let i = 0; i < CELLS; i++) if (game.puzzle[i]) n++;
  return n;
};

/** "21 Aug" for a `YYYY-MM-DD` key, in the player's locale. */
function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString('zh-CN', { day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

let localSaveTimer;
let cloudSaveTimer;

/**
 * Persist the game in progress. localStorage is written on a short debounce
 * because it is cheap and synchronous; the account is written on a much longer
 * one, since every placement does not need a network round trip.
 */
function scheduleSave() {
  if (!state.game || state.solved) return;
  cancelScheduledSaves();
  localSaveTimer = setTimeout(() => {
    // The move that scheduled this write can be the one that finished the
    // puzzle, and a finished game's save has already been cleared. Re-checking
    // here is what stops a solved board from being restored on the next visit.
    if (state.game && !state.solved) {
      state.game.elapsedMs = state.timer.elapsedMs;
      saveGame(state.game);
    }
  }, 350);

  cloudSaveTimer = setTimeout(() => {
    if (state.game && !state.solved && state.signedIn) pushSavedGame(state.game);
  }, 4000);
}

/** Drop any write that has not landed yet, for when there is nothing to save. */
function cancelScheduledSaves() {
  clearTimeout(localSaveTimer);
  clearTimeout(cloudSaveTimer);
}

/** Write through immediately, for when the page is going away. */
function flushSave() {
  clearTimeout(localSaveTimer);
  if (state.game && !state.solved) {
    state.game.elapsedMs = state.timer.elapsedMs;
    saveGame(state.game);
  }
}

/* ------------------------------------------------------------------ */
/* Game lifecycle                                                      */
/* ------------------------------------------------------------------ */

function showVeil({ icon, title, button, onButton, spinner = false }) {
  el.veilIcon.innerHTML = '';
  if (spinner) {
    const dot = document.createElement('span');
    dot.className = 'spinner';
    el.veilIcon.append(dot);
  } else {
    const glyph = document.createElement('i');
    glyph.dataset.lucide = icon;
    el.veilIcon.append(glyph);
    mountIcons(el.veilIcon);
  }
  el.veilTitle.textContent = title;
  el.veilBtn.hidden = !button;
  if (button) el.veilBtn.textContent = button;
  el.veilBtn.onclick = onButton ?? null;
  el.veil.hidden = false;
  // The veil paints over the board but does not take it out of the tab order,
  // so without this a keyboard reaches 81 cells it cannot see, and the arrow
  // keys move a selection behind the blur.
  el.board.inert = true;
}

const hideVeil = () => {
  el.veil.hidden = true;
  el.board.inert = false;
};

/**
 * Start a puzzle. Generation is asynchronous (it runs in a worker), so the
 * board is veiled while it happens rather than the tab freezing.
 * @param {{difficulty: string, daily?: string|null}} options
 */
async function startPuzzle({ difficulty, daily = null }) {
  if (state.generating) return;
  state.generating = true;
  // The buttons that would start a second build, disabled for as long as this
  // one runs, so a second press reads as unavailable rather than ignored.
  el.newGameBtn.disabled = true;
  el.dailyBtn.disabled = true;
  // Nothing about the game in play is discarded here. Generation can fail, and
  // the player would be left looking at the board they were working on, so the
  // clock is only banked; `adoptGame` replaces it once a puzzle exists.
  const wasPaused = state.paused;
  state.timer.pause();
  render();
  showVeil({
    spinner: true,
    // "your <Label>" rather than "a <label>", so the wording does not need to
    // know that Expert takes "an" and the other three take "a".
    title: daily
      ? '正在生成每日挑战谜题…'
      : `正在生成您的${DIFFICULTIES[difficulty].label}难度谜题…`,
  });

  try {
    const result = await requestPuzzle({ difficulty, daily });
    const game = createGame({
      puzzle: result.puzzle,
      solution: result.solution,
      difficulty: result.difficulty,
      seed: result.seed,
      daily: result.daily,
    });
    game.givens = result.givens;
    adoptGame(game, { fresh: true });
    announce(
      `新${DIFFICULTIES[game.difficulty].label}难度谜题，共 ${result.givens} 个提示数。` +
        `使用方向键移动，按 1 到 9 输入数字。`,
    );
  } catch {
    toast('无法生成谜题，请重试。');
    // Give the board back exactly as it was, running clock included.
    if (wasPaused) {
      showPauseVeil();
    } else {
      hideVeil();
      if (state.game && !state.solved && !document.hidden) state.timer.start();
    }
  } finally {
    state.generating = false;
    el.newGameBtn.disabled = false;
    el.dailyBtn.disabled = false;
    render();
  }
}

/** Put `game` on the board and start its clock. */
function adoptGame(game, { fresh = false } = {}) {
  state.game = game;
  state.selected = firstEmptyCell(game);
  state.notesMode = false;
  state.hint = null;
  state.chargedHint = null;
  state.solved = isSolved(game);
  state.paused = false;
  state.timer = createTimer({ elapsedMs: game.elapsedMs });
  // Not in a hidden tab. visibilitychange banks the clock when a tab goes to the
  // background, but it only fires on a change, so a board opened in a background
  // tab (a middle-click, a restored session) had nothing to stop it and clocked
  // up every minute before the player first looked at it. The same handler starts
  // the clock when they do.
  if (!state.solved && !document.hidden) state.timer.start();
  hideVeil();

  if (fresh) {
    state.stats = recordStart(state.stats, game.difficulty);
    saveStats(state.stats);
    if (state.signedIn) pushStats(state.stats);
    saveGame(game);
  }
  render();
  boardView.focusCell(state.selected);
}

/** Where to put the cursor when a board first appears. */
function firstEmptyCell(game) {
  for (let i = 0; i < CELLS; i++) if (!game.values[i]) return i;
  return 40;
}

/** True when the player has put something on the board worth protecting. */
const hasProgress = (game) =>
  !!game && !state.solved && (countFilled(game) > countGivens(game) || game.history.length > 0);

async function confirmNewPuzzle(action) {
  if (hasProgress(state.game)) {
    const ok = await confirmAction({
      title: '开始新谜题？',
      body: '当前谜题尚未完成，已有进度将被丢弃。',
      confirmLabel: '开始新谜题',
    });
    if (!ok) return;
  }
  await action();
}

/* ------------------------------------------------------------------ */
/* Moves                                                               */
/* ------------------------------------------------------------------ */

/**
 * Move focus to a cell, but only from somewhere it belongs to the board.
 *
 * The roving tabindex wants the focused cell and the selected one to agree, and
 * a screen-reader player arrowing the grid needs focus to follow. But Undo,
 * Redo and Hint are buttons someone presses several times in a row, and pulling
 * focus out of one after the first press left the second Enter going to the
 * board instead of the button.
 */
function focusBoardCell(index) {
  const active = document.activeElement;
  if (!active || active === document.body || el.board.contains(active)) {
    boardView.focusCell(index);
  }
}

function select(index) {
  if (index < 0 || index >= CELLS) return;
  state.selected = index;
  state.interacted = true;
  render();
  boardView.focusCell(index);
}

function enterDigit(digit, { asNote = state.notesMode } = {}) {
  const game = state.game;
  if (!game || state.solved || state.paused || state.selected === null) return;
  const cell = state.selected;
  if (isGiven(game, cell)) {
    announce('该单元格是题目自带的提示数。');
    return;
  }
  state.interacted = true;

  if (asNote) {
    if (game.values[cell]) return; // a filled cell has no pencil marks
    const move = toggleNote(game, cell, digit);
    if (move) {
      state.hint = null;
      announce(`已在 ${cellName(cell)} ${game.notes[cell] & (1 << (digit - 1)) ? '添加' : '移除'}候选数 ${digit}`);
    }
  } else {
    // Tapping the digit already there clears it: the fastest way to fix a
    // wrong entry is the same key that made it.
    if (game.values[cell] === digit) {
      clearCell(game, cell);
      state.hint = null;
      announce(`已清除 ${cellName(cell)}`);
    } else {
      const move = setValue(game, cell, digit, { autoClearNotes: state.settings.autoClearNotes });
      if (!move) return;
      state.hint = null;
      const isWrong = game.solution[cell] !== digit;
      if (isWrong && state.settings.checkAsYouGo) {
        recordMistake(game);
        announce(`${cellName(cell)} 填入的 ${digit} 不正确`);
      } else {
        announce(`在 ${cellName(cell)} 填入 ${digit}`);
      }
    }
  }

  afterMove();
}

function eraseSelected() {
  const game = state.game;
  if (!game || state.solved || state.paused || state.selected === null) return;
  if (isGiven(game, state.selected)) return;
  state.interacted = true;
  if (clearCell(game, state.selected)) {
    state.hint = null;
    announce(`已清除 ${cellName(state.selected)}`);
    afterMove();
  }
}

function stepHistory(direction) {
  const game = state.game;
  // A finished puzzle is settled: its time is recorded and its save cleared, so
  // rewinding into it would leave a solved game with a stopped clock.
  if (!game || state.paused || state.solved) return;
  const move = direction === 'undo' ? undo(game) : redo(game);
  if (!move) return;
  state.interacted = true;
  state.hint = null;
  // Land the cursor on what changed, so the effect of an undo is visible
  // without hunting for it.
  const touched = direction === 'undo' ? move.before : move.after;
  if (touched.length) state.selected = touched[0].i;
  announce(direction === 'undo' ? '已撤销' : '已重做');
  afterMove();
  focusBoardCell(state.selected);
}

/** Everything that has to happen after the board changes. */
function afterMove() {
  // The position has moved on, so the next hint is a new one to account for.
  state.chargedHint = null;
  render();
  scheduleSave();
  if (!state.solved && isSolved(state.game)) finishGame();
}

/* ------------------------------------------------------------------ */
/* Hints                                                               */
/* ------------------------------------------------------------------ */

/**
 * Identifies one deduction, so the same hint asked for twice is not counted
 * twice. Cleared by any move, since the position it described has changed.
 */
const stepKey = (step) => (step ? `${step.technique}:${step.target}:${step.digit}` : null);

function showHint() {
  const game = state.game;
  if (!game || state.solved || isVeiled()) return;
  state.interacted = true;
  const hint = nextHint(game);
  // Reading a hint is using one. It names the digit and the cell, so a player
  // who then types the answer themselves has still been told it, and counting
  // only the ones applied reported "no hints" for a puzzle solved from them.
  const key = hint.kind === 'step' ? stepKey(hint.step) : null;
  if (key && key !== state.chargedHint) {
    game.hintsUsed++;
    state.chargedHint = key;
  }
  state.hint = hint;
  if (hint.kind === 'mistake' && hint.cells.length) state.selected = hint.cells[0];
  if (hint.kind === 'step' && hint.step.placements[0]) {
    state.selected = hint.step.placements[0].cell;
  }
  render();
  announce(hint.message);
  focusBoardCell(state.selected);
}

/** Carry out the deduction the hint card is describing. */
function applyHint() {
  const hint = state.hint;
  const game = state.game;
  if (!game || state.solved || isVeiled() || hint?.kind !== 'step') return;

  for (const { cell, digit } of hint.step.placements) {
    setValue(game, cell, digit, { autoClearNotes: state.settings.autoClearNotes });
    state.selected = cell;
  }
  if (hint.step.eliminations.length) {
    applyEliminations(game, hint.step.eliminations);
  }
  state.hint = null;

  if (hint.step.placements.length) {
    announce(`已在 ${cellName(hint.step.placements[0].cell)} 填入 ${hint.step.placements[0].digit}`);
  } else {
    // An elimination only shows on the board where there were pencil marks to
    // rub out, so with none the card would simply vanish and look like a button
    // that did nothing. The deduction is still recorded and still moves the next
    // hint forward, so it is worth saying that out loud.
    const n = hint.step.eliminations.length;
    const message = `已排除 ${n} 个候选数`;
    announce(message);
    toast(`${message}。`);
  }
  afterMove();
  boardView.focusCell(state.selected);
}

/**
 * Put the hint card away.
 *
 * Focus goes back to the board because the control that dismissed the card is
 * inside it: leaving focus on a button that has just become display:none strands
 * a keyboard user with no visible focus ring and nothing sensible to Tab from.
 */
function dismissHint() {
  if (!state.hint) return;
  state.hint = null;
  render();
  if (el.hintCard.contains(document.activeElement)) boardView.focusCell(state.selected);
}

/* ------------------------------------------------------------------ */
/* Pause                                                               */
/* ------------------------------------------------------------------ */

function showPauseVeil() {
  showVeil({
    icon: 'pause',
    title: '已暂停',
    button: '继续',
    onButton: () => setPaused(false),
  });
  // Focus follows the only live control, so Enter resumes and a screen reader
  // lands on the reason the board has gone quiet.
  el.veilBtn.focus();
}

function setPaused(paused) {
  if (state.solved || state.generating || !state.game) return;
  if (paused === state.paused) return;
  state.paused = paused;
  if (paused) {
    state.timer.pause();
    flushSave();
    showPauseVeil();
    announce('已暂停');
  } else {
    state.timer.start();
    hideVeil();
    boardView.focusCell(state.selected);
    announce('已继续');
  }
  render();
}

// A backgrounded tab stops getting timer callbacks but keeps its wall clock, so
// the clock is banked on the way out rather than left running unattended.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !state.solved && state.game) {
    state.timer.pause();
    flushSave();
  } else if (!document.hidden && !state.paused && !state.solved && state.game) {
    state.timer.start();
  }
});

window.addEventListener('pagehide', flushSave);

/* ------------------------------------------------------------------ */
/* Finishing                                                           */
/* ------------------------------------------------------------------ */

function finishGame() {
  const game = state.game;
  state.solved = true;
  state.hint = null;
  state.timer.pause();
  game.elapsedMs = state.timer.elapsedMs;

  const flawless = isFlawless(game);
  const previousBest = state.stats.byDifficulty[game.difficulty]?.bestMs ?? null;
  state.stats = recordSolved(state.stats, {
    difficulty: game.difficulty,
    elapsedMs: game.elapsedMs,
    flawless,
    dailyDate: game.daily,
  });
  saveStats(state.stats);
  // Before clearing, not after: a debounced write still in flight would put the
  // finished board straight back and it would be restored as an unfinished game.
  cancelScheduledSaves();
  clearSaveEverywhere();
  if (state.signedIn) pushStats(state.stats);

  const isRecord = previousBest === null || game.elapsedMs < previousBest;
  render();
  showResult({ game, flawless, isRecord });
  announce(
    `已完成解答，用时 ${formatDuration(game.elapsedMs)}。` +
      (isRecord ? ' 创造了新的最佳用时纪录。' : '') +
      (flawless ? ' 未使用提示，零失误。' : ''),
  );
}

function showResult({ game, flawless, isRecord }) {
  const spec = DIFFICULTIES[game.difficulty] ?? DIFFICULTIES.medium;
  el.solvedSub.textContent = game.daily
    ? `${formatDate(game.daily)} ${spec.label}难度每日挑战。`
    : `${spec.label}难度谜题已完成。`;

  const streak = game.daily ? dailyStreakOn(state.stats, game.daily) : 0;
  const cells = [
    { label: '用时', value: formatDuration(game.elapsedMs), record: isRecord },
    { label: '提示', value: String(game.hintsUsed), record: false },
    game.daily
      ? { label: '连胜', value: `${streak}`, record: false }
      : { label: '无瑕', value: flawless ? '是' : '否', record: flawless },
  ];

  el.resultGrid.innerHTML = '';
  for (const cell of cells) {
    const wrap = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = cell.label;
    const dd = document.createElement('dd');
    dd.textContent = cell.value;
    if (cell.record) dd.className = 'is-record';
    wrap.append(dt, dd);
    el.resultGrid.append(wrap);
  }
  el.solvedDialog.showModal();
}

/* ------------------------------------------------------------------ */
/* Records and settings dialogs                                        */
/* ------------------------------------------------------------------ */

function openStats() {
  el.statsBody.innerHTML = '';
  for (const id of STAT_DIFFICULTIES) {
    const record = state.stats.byDifficulty[id];
    const row = document.createElement('tr');

    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = DIFFICULTIES[id].label;

    const played = document.createElement('td');
    played.textContent = String(record.played);

    const solved = document.createElement('td');
    solved.textContent = String(record.solved);

    const best = document.createElement('td');
    if (record.bestMs) {
      best.textContent = formatDuration(record.bestMs);
    } else {
      best.textContent = '-';
      best.className = 'empty';
    }

    const clean = document.createElement('td');
    clean.textContent = String(record.flawless);

    row.append(name, played, solved, best, clean);
    el.statsBody.append(row);
  }

  const today = localDateKey();
  const streak = dailyStreakOn(state.stats, today);
  const best = state.stats.daily.best;
  el.statsSub.textContent = streak
    ? `每日挑战连胜 ${streak} 天，历史最佳 ${best} 天。`
    : best
      ? `当前无每日挑战连胜。历史最佳为 ${best} 天。`
      : '完成每日挑战谜题即可开启连胜纪录。';
  el.statsDialog.showModal();
}

const OPTIONS = [
  {
    key: 'checkAsYouGo',
    name: '即时检查错误',
    note: '填入的数字一旦不正确即立刻标红。',
  },
  {
    key: 'highlightPeers',
    name: '高亮同行、同列和同宫',
    note: '为选中单元格所在的行、列、宫添加底色。',
  },
  { key: 'highlightSame', name: '高亮相同数字', note: '突出显示盘面上与选中数字相同的所有单元格。' },
  {
    key: 'autoClearNotes',
    name: '自动清理候选数标记',
    note: '填入数字后自动从相关单元格的候选数中移除该数字。',
  },
  { key: 'showRemaining', name: '显示剩余数字数量', note: '在每个数字按键上显示还需填入的剩余个数。' },
  { key: 'showTimer', name: '显示计时器', note: '即使隐藏计时器，用时也仍会正常记录。' },
];

function openSettings() {
  el.optionList.innerHTML = '';
  for (const option of OPTIONS) {
    const row = document.createElement('div');
    row.className = 'option';

    const text = document.createElement('div');
    text.className = 'option-text';
    const name = document.createElement('p');
    name.className = 'option-name';
    name.textContent = option.name;
    const note = document.createElement('p');
    note.className = 'option-note';
    note.textContent = option.note;
    text.append(name, note);

    const label = document.createElement('label');
    label.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!state.settings[option.key];
    input.setAttribute('aria-label', option.name);
    const track = document.createElement('span');
    track.className = 'switch-track';
    label.append(input, track);

    input.addEventListener('change', () => {
      state.settings[option.key] = input.checked;
      saveSettings(state.settings);
      render();
    });

    row.append(text, label);
    el.optionList.append(row);
  }
  el.settingsDialog.showModal();
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

function renderAccount() {
  // With puter.js's <puter-user-menu> in the top bar, that is the account
  // button, and this one stands down.
  if (!account.isAvailable() || userMenu) {
    el.accountBtn.hidden = true;
    return;
  }
  el.accountBtn.hidden = false;
  const hosted = account.isHostedSession();

  if (!state.signedIn) {
    el.accountName.textContent = '登录';
    el.accountBtn.disabled = false;
    el.accountBtn.title = '登录以在多台设备间同步您的谜题进度和用时记录';
    el.accountBtn.setAttribute('aria-label', '登录账户');
    return;
  }

  el.accountName.textContent = state.accountName ?? '已登录';
  // Inside a Puter app the session belongs to the shell around us, so there is
  // no sign-out to offer: the button becomes a label saying who is signed in.
  // https://docs.puter.com/Utils/env/
  el.accountBtn.disabled = hosted;
  el.accountBtn.title = hosted
    ? `已登录为 ${state.accountName ?? '您的 本地账户'}`
    : '退出登录';
  el.accountBtn.setAttribute(
    'aria-label',
    hosted ? `已登录为 ${state.accountName ?? '您的 本地账户'}` : '退出登录',
  );
}

async function onAccountClick() {
  if (!account.isAvailable() || account.isHostedSession()) return;

  if (!state.signedIn) {
    const ok = await account.signIn();
    if (!ok) return;
    await followSignIn();
    return;
  }

  await requestSignOut();
}

/**
 * A session has just begun, from this app's button or from <puter-user-menu>:
 * reconcile with the account and say what happened.
 */
async function followSignIn() {
  await refreshAccount();
  if (!state.signedIn) return;
  const adopted = await syncEverything({ adoptCloudGame: !state.interacted });
  toast(
    adopted
      ? '已登录，并恢复了您在其他设备上未完成的谜题。'
      : '已登录。您的用时记录和谜题进度现在将随账户同步。',
  );
}

/**
 * Sign out, once the player has confirmed it. Also what a click on Sign out in
 * <puter-user-menu> runs, in place of the element's own immediate sign-out.
 */
async function requestSignOut() {
  const ok = await confirmAction({
    title: '退出登录？',
    body: '您的战绩记录仍保留在账户中，当前设备也会保留本地副本。',
    confirmLabel: '退出登录',
  });
  if (!ok) return;
  // The account's copy of the puzzle trails the board by a few seconds (see
  // scheduleSave), and after this there is no writing to it. Bring it up to
  // date first, so the puzzle picked up on another device is this one.
  if (state.signedIn && state.game && !state.solved) {
    state.game.elapsedMs = state.timer.elapsedMs;
    await pushSavedGame(state.game);
  }
  await account.signOut();
  followSignOut();
}

/** The session has ended, here or in <puter-user-menu>. */
function followSignOut() {
  state.signedIn = false;
  state.accountName = null;
  renderAccount();
  toast('已退出登录。');
}

/**
 * Where the loaded puter.js has <puter-user-menu>, it takes the account
 * button's place at the end of the top bar (see ui/userMenu.js).
 */
function mountAccountMenu() {
  userMenu = mountUserMenu(el.topbarRight, {
    theme: state.settings.theme,
    signOutGuard: () => requestSignOut,
    onSignIn: followSignIn,
    onSignOut: followSignOut,
  });
}

async function refreshAccount() {
  state.signedIn = await account.isSignedIn();
  const user = state.signedIn ? await account.getUser() : null;
  state.accountName = user?.username ?? null;
  renderAccount();
}

/**
 * Reconcile records and the game in progress with the account.
 * @param {{adoptCloudGame?: boolean}} options When false, a newer cloud game is
 *   left alone, because the player is mid-move and must not have the board
 *   swapped under them.
 * @returns {Promise<boolean>} Whether a board from another device was adopted.
 *   The caller says so, rather than this doing it: the sign-in path has its own
 *   message to show and only one of the two can be the one that is read.
 */
async function syncEverything({ adoptCloudGame = false } = {}) {
  if (!state.signedIn) return false;

  const { stats, synced } = await syncStats(state.stats);
  if (synced) {
    state.stats = stats;
  }

  // Mid-move, the board in front of the player is the newest one there is, so it
  // is pushed rather than reconciled. Without this, signing in while playing
  // mirrored the records but not the puzzle, and the promise that an account
  // carries your unfinished puzzle between devices waited on the next move.
  if (!adoptCloudGame) {
    if (state.game && !state.solved) await pushSavedGame(state.game);
    return false;
  }
  if (state.solved) return false;
  // An untouched board is not a game to protect. A freshly dealt puzzle is saved
  // the moment it appears, so its timestamp always beat the unfinished game left
  // on another device, which was then never picked up and was overwritten in the
  // account instead. Offered as "no local game", the account's game wins.
  const { game, source } = await syncSavedGame(hasProgress(state.game) ? state.game : null);
  if (source === 'cloud' && game && !state.interacted) {
    adoptGame(game);
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Keyboard                                                            */
/* ------------------------------------------------------------------ */

const ARROWS = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * The digit a key press asks for, or 0.
 *
 * `event.key` is what the layout produced and comes first, so a keyboard that
 * puts digits somewhere unusual is still obeyed. But it is not enough on its
 * own, because a shifted number row does not produce a digit at all: on a US or
 * UK layout Shift+3 arrives as "#", which left the documented Shift+digit
 * pencil mark doing nothing, and on AZERTY the number row needs Shift for the
 * digits, so its unshifted "&" meant those players could not type a digit at
 * all. The physical key fills both gaps. Only the number row, though: a Numpad
 * code arrives as End or ArrowDown with NumLock off, and those keys have their
 * own jobs on the board.
 */
function digitPressed(event) {
  if (event.key >= '1' && event.key <= '9' && event.key.length === 1) return Number(event.key);
  return /^Digit[1-9]$/.test(event.code ?? '') ? Number(event.code.slice(5)) : 0;
}

function moveSelection(dRow, dCol) {
  const current = state.selected ?? 40;
  const row = Math.min(SIZE - 1, Math.max(0, rowOf(current) + dRow));
  const col = Math.min(SIZE - 1, Math.max(0, colOf(current) + dCol));
  select(row * SIZE + col);
}

document.addEventListener('keydown', (event) => {
  // Leave the platform's own handling alone inside dialogs and form controls.
  if (document.querySelector('dialog[open]')) return;
  // Keys in the account menu are its own; they arrive here as the element's.
  if (inUserMenu(event.target)) return;
  const tag = event.target?.tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;

  // A veiled board is not there to be read or written, so the only key that does
  // anything is the one that brings a paused one back.
  if (isVeiled()) {
    if (state.paused && (event.key === 'p' || event.key === 'P')) {
      event.preventDefault();
      setPaused(false);
    }
    return;
  }

  const mod = event.ctrlKey || event.metaKey;

  if (mod && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    stepHistory(event.shiftKey ? 'redo' : 'undo');
    return;
  }
  if (mod && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    stepHistory('redo');
    return;
  }
  if (mod) return; // leave every other shortcut to the browser

  if (ARROWS[event.key]) {
    event.preventDefault();
    moveSelection(...ARROWS[event.key]);
    return;
  }

  const digit = digitPressed(event);
  if (digit) {
    event.preventDefault();
    // Shift writes to the other mode, so a pencil mark never needs a round
    // trip through the Notes toggle.
    enterDigit(digit, { asNote: event.shiftKey ? !state.notesMode : state.notesMode });
    return;
  }

  // The same layout problem as the digits: the unshifted "0" key does not report
  // "0" on every keyboard, so the physical key is accepted as well.
  if (event.key === '0' || event.code === 'Digit0') {
    event.preventDefault();
    eraseSelected();
    return;
  }

  switch (event.key) {
    case 'Backspace':
    case 'Delete':
      event.preventDefault();
      eraseSelected();
      break;
    case 'n':
    case 'N':
      event.preventDefault();
      toggleNotesMode();
      break;
    case 'h':
    case 'H':
      event.preventDefault();
      showHint();
      break;
    case 'p':
    case 'P':
      event.preventDefault();
      setPaused(!state.paused);
      break;
    case 'Escape':
      dismissHint();
      break;
    case 'Home':
      event.preventDefault();
      select(rowOf(state.selected ?? 0) * SIZE);
      break;
    case 'End':
      event.preventDefault();
      select(rowOf(state.selected ?? 0) * SIZE + SIZE - 1);
      break;
    default:
      break;
  }
});

function toggleNotesMode() {
  state.notesMode = !state.notesMode;
  render();
  announce(state.notesMode ? '已开启候选数标记' : '已关闭候选数标记');
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function wire() {
  el.undoBtn.addEventListener('click', () => stepHistory('undo'));
  el.redoBtn.addEventListener('click', () => stepHistory('redo'));
  el.eraseBtn.addEventListener('click', eraseSelected);
  el.notesBtn.addEventListener('click', toggleNotesMode);
  el.hintBtn.addEventListener('click', showHint);
  el.hintApply.addEventListener('click', applyHint);
  el.hintClose.addEventListener('click', dismissHint);
  el.pauseBtn.addEventListener('click', () => setPaused(!state.paused));

  el.newGameBtn.addEventListener('click', () =>
    confirmNewPuzzle(() => startPuzzle({ difficulty: state.nextDifficulty })),
  );
  el.dailyBtn.addEventListener('click', () => {
    const today = localDateKey();
    // The daily is the same board every time it is built, by design. Rebuilding
    // the one already in play would discard the player's progress on it and hand
    // back the identical grid, so the button says so instead.
    if (state.game?.daily === today && !state.solved) {
      toast('您当前已经在游玩今日的每日挑战谜题了。');
      return;
    }
    confirmNewPuzzle(() => startPuzzle({ difficulty: 'medium', daily: today }));
  });

  el.difficultySelect.addEventListener('change', () => {
    const value = el.difficultySelect.value;
    if (!isDifficulty(value)) return;
    state.nextDifficulty = value;
    el.controlsHint.textContent = DIFFICULTIES[value].blurb;
  });

  el.statsBtn.addEventListener('click', openStats);
  el.statsClose.addEventListener('click', () => el.statsDialog.close());
  el.statsReset.addEventListener('click', async () => {
    // One modal at a time, so the records go away while the question is asked.
    el.statsDialog.close();
    const ok = await confirmAction({
      title: '重置战绩记录？',
      body: '所有用时、统计次数和每日挑战连胜都将被清空。此操作无法撤销。',
      confirmLabel: '重置',
    });
    if (ok) {
      state.stats = emptyStats();
      saveStats(state.stats);
      if (state.signedIn) await pushStats(state.stats);
      announce('战绩记录已重置。');
    }
    // Either way, back to the records: cancelling should not cost the player the
    // dialog they were reading, and after a reset the emptied table is the
    // clearest confirmation there is. A toast would sit behind the backdrop.
    openStats();
  });

  el.settingsBtn.addEventListener('click', openSettings);
  el.settingsClose.addEventListener('click', () => el.settingsDialog.close());

  el.solvedNew.addEventListener('click', () => {
    el.solvedDialog.close();
    startPuzzle({ difficulty: state.nextDifficulty });
  });
  el.solvedClose.addEventListener('click', () => el.solvedDialog.close());

  el.accountBtn.addEventListener('click', onAccountClick);
}

function buildDifficultySelect() {
  for (const id of DIFFICULTY_IDS) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = DIFFICULTIES[id].label;
    el.difficultySelect.append(option);
  }
  el.difficultySelect.value = state.nextDifficulty;
  el.controlsHint.textContent = DIFFICULTIES[state.nextDifficulty].blurb;
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  mountIcons();
  applyTheme();

  boardView = createBoardView(el.board, { onSelect: select });
  keypad = createKeypad(el.keypad, { onDigit: (digit) => enterDigit(digit) });

  buildDifficultySelect();
  wire();
  mountAccountMenu();
  renderAccount();

  const saved = loadSavedGame();
  if (saved) {
    state.nextDifficulty = isDifficulty(saved.difficulty) ? saved.difficulty : 'medium';
    el.difficultySelect.value = state.nextDifficulty;
    el.controlsHint.textContent = DIFFICULTIES[state.nextDifficulty].blurb;
    saved.givens = countGivens(saved);
    adoptGame(saved);
    toast('已恢复上次未完成的进度。');
  } else {
    await startPuzzle({ difficulty: state.nextDifficulty });
  }

  // One interval for the clock; the board redraws only when it changes. Started
  // before the account work below, which is two network round trips: behind
  // them, a slow connection left the clock frozen on a board already in play.
  setInterval(() => {
    if (state.game && !state.paused && !state.solved && !document.hidden) renderClock();
  }, 500);

  // The account is a bonus, so it is resolved after the board is playable and
  // never blocks it.
  await refreshAccount();
  if (await syncEverything({ adoptCloudGame: !state.interacted })) {
    toast('已恢复您在其他设备上未完成的谜题。');
  }
  render();
}

main();
