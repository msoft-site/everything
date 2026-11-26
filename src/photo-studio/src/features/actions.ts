import type { Editor } from '../editor';
import { commands, findCommand, interactiveOnly, registerCommand, registerPanel, type Panel } from '../app/registry';
import { escapeXML } from '../model/assets';
import { svg } from '../app/icons';
import { formDialog } from '../ui/dialog';
import { batchSteps, registerBatchStep } from './files/automate-steps';
import { takeDialogCancelled } from './action-settings';
import { modal } from './files/ui';

// Actions record command IDs (with their arguments) and replay them. Commands
// that accept an argument object apply it without a dialog when the step's
// dialog toggle is off, which is what makes actions repeatable in batches.
export type ActionStep = { command: string; arg?: unknown; enabled: boolean; dialog: boolean };
export type Action = { id: string; name: string; steps: ActionStep[]; key?: string };
export type ActionSet = { id: string; name: string; actions: Action[]; open?: boolean };

const storageKey = 'photo-studio-actions';
const defaults = (): ActionSet[] => [
  {
    id: 'defaults',
    name: '默认动作',
    open: true,
    actions: [
      { id: 'a-dup-desat', name: '去色副本', steps: [step('layer.duplicate'), step('adjust.desaturate')] },
      { id: 'a-flatten-auto', name: '合并并自动对比度', steps: [step('layer.flatten'), step('image.auto-contrast')] },
      { id: 'a-stamp', name: '盖印可见图层到新图层', steps: [step('layer.stamp-visible')] },
      { id: 'a-mirror', name: '镜像画布', steps: [step('image.flip-horizontal')] },
      { id: 'a-trim', name: '基于透明像素裁剪', steps: [step('image.trim')] },
    ],
  },
];
function step(command: string, arg?: unknown): ActionStep {
  return { command, arg, enabled: true, dialog: false };
}
// Action sets come from stored settings and from files people share, so they
// are rebuilt from checked fields: identifiers end up in panel markup and are
// split on ':' there.
const safeId = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const name = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.slice(0, 200) : fallback);
function readStep(v: unknown): ActionStep | undefined {
  const s = v as Partial<ActionStep> | null;
  if (!s || typeof s !== 'object' || typeof s.command !== 'string' || !s.command || s.command.length > 200) return undefined;
  return { command: s.command, ...(s.arg !== undefined ? { arg: s.arg } : {}), enabled: s.enabled !== false, dialog: s.dialog === true };
}
/** Well-formed action sets from stored or imported data; `fresh` gives every
 * set and action a new identifier (an imported file is a copy). */
export function readActionSets(value: unknown, fresh: boolean): ActionSet[] {
  if (!Array.isArray(value)) return [];
  const id = (v: unknown) => (!fresh && safeId(v) ? (v as string) : crypto.randomUUID());
  return value
    .filter((v): v is Partial<ActionSet> => !!v && typeof v === 'object')
    .map((v) => ({
      id: id(v.id),
      name: name(v.name, '动作组'),
      ...(typeof v.open === 'boolean' ? { open: v.open } : {}),
      actions: (Array.isArray(v.actions) ? (v.actions as unknown[]) : [])
        .filter((a): a is Partial<Action> => !!a && typeof a === 'object')
        .map((a) => ({
          id: id(a.id),
          name: name(a.name, '动作'),
          steps: (Array.isArray(a.steps) ? (a.steps as unknown[]) : []).map(readStep).filter((x): x is ActionStep => !!x),
          ...(typeof a.key === 'string' ? { key: a.key.slice(0, 40) } : {}),
        })),
    }));
}
function load(): ActionSet[] {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (Array.isArray(v)) return readActionSets(v, false);
  } catch {
    /* Optional. */
  }
  return defaults();
}
let sets = load();
const save = () => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(sets));
  } catch {
    /* Optional. */
  }
  syncBatchSteps();
};
// Every action is offered as a step in File > Automate > Batch, and only
// while it exists: Batch checks every step, so a deleted one would fail each file.
function syncBatchSteps() {
  const live = new Set(allActions().map(({ action }) => `action:${action.id}`));
  for (const id of batchSteps.keys()) if (id.startsWith('action:') && !live.has(id)) batchSteps.delete(id);
  for (const { action } of allActions())
    registerBatchStep({
      id: `action:${action.id}`,
      label: `动作: ${action.name}`,
      // Batch runs the action chosen in the Actions panel, not every action.
      preselected: () => find().action?.id === action.id,
      document: async (e) => {
        const current = allActions().find((x) => x.action.id === action.id)?.action;
        if (!current) throw new Error(`动作“${action.name}”已不存在。`);
        // The batch lists the file with the reason the action stopped.
        if (!(await playAction(e, current))) throw new Error(`动作“${current.name}”已停止${stopReason ? `：${stopReason}` : '。'}`);
      },
    });
}
let selected: { set: string; action?: string; step?: number } = { set: sets[0]?.id ?? '' };
let recording: Action | undefined;
let playing = false;
// Set by the Stop button while an action plays; playback ends before the next step.
let stopRequested = false;
// Why the last played action stopped (a batch reports it per file).
let stopReason = '';
// Insert Stop adds a step that pauses playback with a message.
export const STOP_STEP = 'actions.stop-step';
type StopArg = { message: string; allowContinue: boolean };
const stopArg = (arg: unknown): StopArg => {
  const a = (arg && typeof arg === 'object' ? arg : {}) as Partial<StopArg>;
  return { message: typeof a.message === 'string' ? a.message.slice(0, 1000) : '', allowContinue: a.allowContinue !== false };
};
/** Show a Stop step's message; resolves true to go on with the action. */
async function pauseAt(action: Action, arg: unknown) {
  const { message, allowContinue } = stopArg(arg);
  const r = await modal({
    title: '动作已暂停',
    className: 'action-stop',
    body: `<p>${escapeXML(message || `“${action.name}”已暂停。`)}</p>`,
    submit: allowContinue ? '继续' : '停止',
    bind: (dialog) => {
      const cancel = dialog.querySelector<HTMLButtonElement>('[data-act="cancel"]')!;
      if (allowContinue) cancel.textContent = '停止';
      else cancel.hidden = true;
    },
  });
  r?.close();
  return !!r && allowContinue;
}

export function allActions() {
  return sets.flatMap((s) => s.actions.map((a) => ({ set: s, action: a })));
}
function dialogArg(arg: unknown) {
  const params = arg && typeof arg === 'object' ? (arg as { params?: unknown }).params : undefined;
  return params && typeof params === 'object' ? { initial: params } : undefined;
}
/** Why the last played action stopped ('' when it finished). */
export const lastStopReason = () => stopReason;
/** Replay an action's enabled steps; returns false if a step failed. */
export async function playAction(e: Editor, action: Action, from = 0) {
  playing = true;
  stopRequested = false;
  stopReason = '';
  takeDialogCancelled();
  // Enables the Stop button.
  e.dock?.update();
  try {
    for (let i = from; i < action.steps.length; i++) {
      const s = action.steps[i];
      if (!s.enabled) continue;
      if (stopRequested) {
        stopReason = '已按停止。';
        e.message(`已停止“${action.name}”。`);
        return false;
      }
      if (s.command === STOP_STEP) {
        if (!(await pauseAt(action, s.arg))) {
          stopReason = '已按停止。';
          e.message(`已停止“${action.name}”。`);
          return false;
        }
        continue;
      }
      // Steps recorded before a command was renamed run the current one.
      const c = findCommand(s.command);
      if (!c) throw new Error(`命令“${s.command}”不可用。`);
      // Imported action files and batch links can name any command; an
      // Actions panel command would play an action from inside one (itself,
      // forever), and commands that are never recorded (deleting custom
      // brushes, resetting presets) reach beyond the documents played on.
      if (interactiveOnly(c.id) || c.id.startsWith('actions.') || c.recordable === false) throw new Error(`动作无法运行“${c.label.replace(/…$/, '')}”。`);
      if (c.enabled && !c.enabled(e)) throw new Error(`“${c.label}”在当前状态下不可用。`);
      // Steps call commands directly so the busy guard does not skip them.
      // A step with its dialog on opens the dialog, showing the recorded
      // settings ({ initial }) where the command has any.
      await c.run(e, s.dialog ? dialogArg(s.arg) : s.arg);
      // Cancelling a step's dialog stops the action, as Stop does.
      if (takeDialogCancelled()) {
        stopReason = `已取消 ${c.label.replace(/…$/, '')}。`;
        e.message(`已停止“${action.name}”：${stopReason}`);
        return false;
      }
    }
    return true;
  } catch (error) {
    stopReason = error instanceof Error ? error.message : String(error);
    e.message(`动作已停止：${stopReason}`);
    return false;
  } finally {
    playing = false;
    stopRequested = false;
    e.update();
    e.dock?.update();
  }
}
function find(): { set?: ActionSet; action?: Action } {
  const set = sets.find((s) => s.id === selected.set);
  return { set, action: set?.actions.find((a) => a.id === selected.action) };
}
function startRecording(e: Editor, action: Action) {
  recording = action;
  e.recorder = (id, arg) => {
    const c = commands.get(id);
    if (!recording || playing || !c || c.recordable === false || id.startsWith('actions.')) return;
    recording.steps.push(step(id, arg));
    save();
    e.dock.update();
  };
  e.dock.update();
}
function stopRecording(e: Editor) {
  recording = undefined;
  e.recorder = undefined;
  e.dock.update();
}
function label(id: string, arg?: unknown) {
  if (id === STOP_STEP) {
    const { message } = stopArg(arg);
    return message ? `停止: ${message}` : '停止';
  }
  return findCommand(id)?.label ?? id;
}

const actionsPanel: Panel = {
  id: 'actions',
  title: '动作',
  icon: 'play',
  location: 'strip',
  shortcut: 'Alt+F9',
  mount: (e, el) => {
    el.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      // Stop runs here, not as a command: commands wait while an action plays.
      if (t.closest('[data-actions-stop]')) {
        if (playing) stopRequested = true;
        else if (recording) stopRecording(e);
        return;
      }
      const toggle = t.closest<HTMLElement>('[data-step-toggle]');
      if (toggle) {
        const { action } = find();
        const [aid, i, kind] = toggle.dataset.stepToggle!.split(':');
        const a = sets.flatMap((s) => s.actions).find((x) => x.id === aid) ?? action;
        const s = a?.steps[Number(i)];
        if (s) {
          if (kind === 'enabled') s.enabled = !s.enabled;
          else s.dialog = !s.dialog;
          save();
          e.dock.update();
        }
        return;
      }
      const disclose = t.closest<HTMLElement>('[data-set-toggle]');
      if (disclose) {
        const s = sets.find((x) => x.id === disclose.dataset.setToggle);
        if (s) s.open = !s.open;
        save();
        e.dock.update();
        return;
      }
      const row = t.closest<HTMLElement>('[data-action-row]');
      if (row) {
        const [setId, actionId, stepIndex] = row.dataset.actionRow!.split(':');
        selected = { set: setId, action: actionId || undefined, step: stepIndex ? Number(stepIndex) : undefined };
        e.dock.update();
      }
    });
    el.addEventListener('dblclick', async (ev) => {
      const row = (ev.target as HTMLElement).closest<HTMLElement>('[data-action-row]');
      if (!row) return;
      const { action } = find();
      if (action && selected.step === undefined) {
        const v = await formDialog('动作选项', [{ name: 'name', label: '名称', value: action.name }], '确定');
        if (v) {
          action.name = v.name;
          save();
          e.dock.update();
        }
      }
    });
  },
  update: (e, el) => {
    // Each row's name is a button, so sets, actions and steps can be chosen
    // from the keyboard (Play and Delete act on the chosen one).
    const choose = (row: string, on: boolean, text: string) =>
      `<button type="button" class="action-name" data-action-choose="${escapeXML(row)}" aria-pressed="${on}">${escapeXML(text)}</button>`;
    const html = sets
      .map(
        (s) => `<div class="action-set"><div class="action-row set ${selected.set === s.id && !selected.action ? 'selected' : ''}" data-action-row="${escapeXML(s.id)}::"><button class="group-disclosure" data-set-toggle="${escapeXML(s.id)}" aria-label="${s.open ? '折叠' : '展开'} ${escapeXML(s.name)}">${svg(s.open ? 'chevron-down' : 'chevron-right', 13)}</button>${svg('folder', 14)}${choose(`${s.id}::`, selected.set === s.id && !selected.action, s.name)}</div>${
          s.open
            ? s.actions
                .map(
                  (a) => `<div class="action-row action ${selected.action === a.id && selected.step === undefined ? 'selected' : ''} ${recording === a ? 'recording' : ''}" data-action-row="${escapeXML(s.id)}:${escapeXML(a.id)}:"><span class="indent"></span>${svg('play', 12)}${choose(`${s.id}:${a.id}:`, selected.action === a.id && selected.step === undefined, a.name)}<small>${a.steps.length}</small></div>${
                    selected.action === a.id
                      ? a.steps
                          .map(
                            (st, i) => `<div class="action-row step ${selected.step === i ? 'selected' : ''}" data-action-row="${escapeXML(s.id)}:${escapeXML(a.id)}:${i}"><button class="step-check" data-step-toggle="${escapeXML(a.id)}:${i}:enabled" aria-label="${st.enabled ? '停用' : '启用'}步骤" aria-pressed="${st.enabled}">${st.enabled ? '✓' : ''}</button><button class="step-dialog" data-step-toggle="${escapeXML(a.id)}:${i}:dialog" aria-label="切换对话框" aria-pressed="${st.dialog}" title="播放期间显示对话框">${st.dialog ? svg('ellipsis', 12) : ''}</button>${choose(`${s.id}:${a.id}:${i}`, selected.action === a.id && selected.step === i, label(st.command, st.arg))}</div>`,
                          )
                          .join('')
                      : ''
                  }`,
                )
                .join('')
            : ''
        }</div>`,
      )
      .join('');
    el.innerHTML = `<div class="actions-list">${html}</div><div class="layer-footer"><button data-actions-stop aria-label="${playing ? '停止播放' : '停止录制'}" title="停止播放/录制" ${recording || playing ? '' : 'disabled'}>${svg('square', 14)}</button><button data-command="actions.record" class="${recording ? 'recording' : ''}" aria-label="开始录制" title="开始录制" ${find().action && !recording ? '' : 'disabled'}>${svg('circle-dot', 14)}</button><button data-command="actions.play" aria-label="播放所选动作" title="播放所选动作" ${find().action && !recording ? '' : 'disabled'}>${svg('play', 14)}</button><button data-command="actions.new-set" aria-label="创建新组" title="创建新组">${svg('folder-plus', 14)}</button><button data-command="actions.new" aria-label="创建新动作" title="创建新动作">${svg('plus', 14)}</button><button data-command="actions.delete" aria-label="删除" title="删除">${svg('trash-2', 14)}</button></div>`;
    void e;
  },
  menu: () => ['actions.new', 'actions.new-set', 'actions.duplicate', 'actions.delete', '-', 'actions.play', 'actions.record', 'actions.stop', '-', 'actions.insert-menu-item', 'actions.insert-stop', '-', 'actions.export', 'actions.import', 'actions.reset'],
};

export function installActions(e: Editor) {
  registerPanel(actionsPanel);
  syncBatchSteps();
  registerCommand(
    {
      id: 'actions.new',
      label: '新建动作…',
      recordable: false,
      run: async (e) => {
        const set = sets.find((s) => s.id === selected.set) ?? sets[0];
        if (!set) return;
        const v = await formDialog('新建动作', [{ name: 'name', label: '名称', value: `动作 ${set.actions.length + 1}` }], '录制');
        if (!v) return;
        const a: Action = { id: crypto.randomUUID(), name: v.name, steps: [] };
        set.actions.push(a);
        set.open = true;
        selected = { set: set.id, action: a.id };
        save();
        e.dock.show('actions');
        startRecording(e, a);
      },
    },
    {
      id: 'actions.new-set',
      label: '新建组…',
      recordable: false,
      run: async (e) => {
        const v = await formDialog('新建组', [{ name: 'name', label: '名称', value: `动作组 ${sets.length + 1}` }], '确定');
        if (!v) return;
        sets.push({ id: crypto.randomUUID(), name: v.name, actions: [], open: true });
        save();
        e.dock.update();
      },
    },
    {
      id: 'actions.record',
      label: '开始录制',
      recordable: false,
      enabled: () => !!find().action && !recording,
      run: (e) => startRecording(e, find().action!),
    },
    { id: 'actions.stop', label: '停止录制', recordable: false, enabled: () => !!recording, run: (e) => stopRecording(e) },
    {
      id: 'actions.play',
      label: '播放',
      recordable: false,
      enabled: (e) => !!find().action && !recording && e.hasDocument,
      run: async (e) => {
        const { action } = find();
        if (!action) return;
        // Playing from a selected step starts there, so the rest of an action can be replayed.
        const ok = await playAction(e, action, selected.step ?? 0);
        if (ok) e.message(`已播放“${action.name}”。`);
      },
    },
    {
      id: 'actions.duplicate',
      label: '复制',
      recordable: false,
      enabled: () => !!find().action,
      run: (e) => {
        const { set, action } = find();
        if (!set || !action) return;
        set.actions.push({ ...structuredClone(action), id: crypto.randomUUID(), name: `${action.name} 副本` });
        save();
        e.dock.update();
      },
    },
    {
      id: 'actions.delete',
      label: '删除',
      recordable: false,
      run: (e) => {
        const { set, action } = find();
        // Deleting the action being recorded (or its set) ends the recording.
        const removed = action ? (selected.step === undefined ? [action] : []) : (set?.actions ?? []);
        if (recording && removed.includes(recording)) stopRecording(e);
        if (action && selected.step !== undefined) action.steps.splice(selected.step, 1);
        else if (set && action) set.actions = set.actions.filter((a) => a !== action);
        else if (set) sets = sets.filter((s) => s !== set);
        selected = { set: sets[0]?.id ?? '' };
        save();
        e.dock.update();
      },
    },
    {
      id: 'actions.insert-menu-item',
      label: '插入菜单项目…',
      recordable: false,
      enabled: () => !!find().action,
      run: async (e) => {
        const { action } = find();
        if (!action) return;
        const options = [...commands.values()].filter((c) => !c.hidden && c.recordable !== false && !c.id.startsWith('actions.') && !c.id.startsWith('window.') && !c.id.startsWith('view.')).sort((a, b) => a.label.localeCompare(b.label)).map((c) => [c.id, `${c.label} (${c.id.split('.')[0]})`] as [string, string]);
        const v = await formDialog('插入菜单项目', [{ name: 'command', label: '菜单项目', value: options[0]?.[0] ?? '', type: 'select', options }], '插入');
        if (!v) return;
        action.steps.splice((selected.step ?? action.steps.length - 1) + 1, 0, { ...step(v.command), dialog: true });
        save();
        e.dock.update();
      },
    },
    {
      id: 'actions.insert-stop',
      label: '插入停止…',
      recordable: false,
      enabled: () => !!find().action,
      run: async (e) => {
        const { action } = find();
        if (!action) return;
        const v = await formDialog('插入停止', [
          { name: 'message', label: '消息', value: '', type: 'textarea' },
          { name: 'allowContinue', label: '允许继续', value: 'yes', type: 'checkbox' },
        ], '插入', '回放将在此步骤暂停并显示该消息。');
        if (!v) return;
        const at = (selected.step ?? action.steps.length - 1) + 1;
        action.steps.splice(at, 0, step(STOP_STEP, { message: v.message.trim(), allowContinue: v.allowContinue === 'yes' }));
        selected = { ...selected, step: at };
        save();
        e.dock.update();
      },
    },
    {
      id: 'actions.export',
      label: '存储动作',
      recordable: false,
      run: () => {
        const blob = new Blob([JSON.stringify({ format: 'photo-studio-actions', version: 1, sets }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'actions.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
    },
    {
      id: 'actions.import',
      label: '载入动作…',
      recordable: false,
      run: (e) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = async () => {
          try {
            const data = JSON.parse(await input.files![0].text());
            if (data?.format !== 'photo-studio-actions' || !Array.isArray(data.sets)) throw new Error('不是有效的动作文件。');
            const loaded = readActionSets(data.sets, true);
            sets.push(...loaded);
            save();
            e.message(`已载入 ${loaded.length} 个动作组。`);
            e.dock.update();
          } catch (error) {
            e.message(String(error instanceof Error ? error.message : error));
          }
        };
        input.click();
      },
    },
    {
      id: 'actions.reset',
      label: '复位动作',
      recordable: false,
      run: (e) => {
        // The action being recorded goes with the old sets.
        if (recording) stopRecording(e);
        sets = defaults();
        selected = { set: sets[0].id };
        save();
        e.dock.update();
      },
    },
  );
  void e;
}
