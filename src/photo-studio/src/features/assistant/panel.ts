// The Assistant panel: a conversation per document. Requests become plans
// shown as readable steps (each linked to its command) that can be edited,
// reordered or removed, then run all at once or step by step; questions get
// answers with "Show me" buttons. Everything works from the keyboard.
import type { Editor } from '../../editor';
import { svg } from '../../app/icons';
import { escapeXML } from '../../model/assets';
import {
  ask,
  assistantRevision,
  cancelAsk,
  conversation,
  discardPlan,
  editStep,
  findPlan,
  moveStep,
  onAssistantChange,
  removeStep,
  runPlan,
  showMe,
  stopPlan,
  type Message,
  type PlanMessage,
} from './controller';
import { stepDetail, usesAI, type Step } from './plan';
import type { Param } from './params';
import { assistantSettings, modelLabel, saveAssistantSettings, sentNote } from './settings';
import { AI_COMMANDS } from './catalog';

// The step whose settings are being edited.
let editing: { plan: string; step: string } | undefined;
const EXAMPLES = ['让天空更加富有层次并裁剪为 16:9', '去除背景并添加柔和投影', '如何校正倾斜的照片？'];

/** Light formatting for model text: paragraphs, "- " lists, **bold** and `code`. */
export function formatText(text: string): string {
  const inline = (s: string) =>
    escapeXML(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n');
      if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
        const ordered = /^\s*\d/.test(lines[0]);
        return `<${ordered ? 'ol' : 'ul'}>${lines.map((l) => `<li>${inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    })
    .join('');
}

const STATUS_ICON: Record<Step['status'], [string, string]> = {
  pending: ['circle', '未运行'],
  running: ['circle-dot', '运行中'],
  done: ['check', '已完成'],
  failed: ['x', '失败'],
  skipped: ['minus', '已跳过'],
};
function badges(s: Step) {
  const out: string[] = [];
  if (AI_COMMANDS.has(s.action)) out.push('<span class="ast-tag ai" title="预填提示词打开；点击“生成”时消耗本地智能算力">AI 算力</span>');
  else if (s.input === 'dialog') out.push('<span class="ast-tag" title="在运行时打开设置对话框供您确认参数">需确认参数</span>');
  return out.join('');
}
function paramField(p: Param, value: unknown) {
  const label = escapeXML(p.label ?? p.key);
  const v = value === undefined ? '' : value;
  const hint = p.unit ? ` <small>${escapeXML(p.unit)}</small>` : '';
  if (p.type === 'boolean')
    return `<label class="ast-field ast-check"><input type="checkbox" name="${p.key}" ${v === true ? 'checked' : ''}><span>${label}</span></label>`;
  if (p.type === 'enum')
    return `<label class="ast-field"><span>${label}</span><select name="${p.key}"><option value="">Default</option>${(p.options ?? []).map((o) => `<option value="${escapeXML(o.value)}" ${o.value === v ? 'selected' : ''}>${escapeXML(o.label ?? o.value)}</option>`).join('')}</select></label>`;
  if (p.type === 'number' || p.type === 'integer')
    return `<label class="ast-field"><span>${label}${hint}</span><input type="number" name="${p.key}" value="${escapeXML(String(v))}" ${p.min !== undefined ? `min="${p.min}"` : ''} ${p.max !== undefined ? `max="${p.max}"` : ''} step="${p.type === 'integer' ? 1 : (p.step ?? 'any')}"></label>`;
  if (p.type === 'color') return `<label class="ast-field"><span>${label}</span><input type="text" name="${p.key}" value="${escapeXML(String(v))}" placeholder="#rrggbb" spellcheck="false"></label>`;
  if (p.type === 'text') return `<label class="ast-field ast-wide"><span>${label}</span><textarea name="${p.key}" rows="3">${escapeXML(String(v))}</textarea></label>`;
  if (p.type === 'object' || p.type === 'point')
    return `<label class="ast-field ast-wide"><span>${label} (JSON)</span><textarea name="${p.key}" rows="3" spellcheck="false" data-json>${escapeXML(v === '' ? '' : JSON.stringify(v))}</textarea></label>`;
  return `<label class="ast-field"><span>${label}</span><input type="text" name="${p.key}" value="${escapeXML(String(v))}"></label>`;
}
function stepHTML(m: PlanMessage, s: Step, i: number) {
  const [icon, statusText] = STATUS_ICON[s.status];
  const ready = m.state === 'ready';
  const detail = stepDetail(s);
  const link = s.kind === 'command' ? `<button type="button" class="ast-step-name" data-show="${escapeXML(s.action)}" title="定位查看此命令">${escapeXML(s.label)}</button>` : `<strong class="ast-step-name">${escapeXML(s.label)}</strong>`;
  const edit = ready && s.params?.length ? `<button type="button" data-step-act="edit" aria-expanded="${editing?.step === s.key}">${svg('pencil', 13)}编辑</button>` : '';
  const actions = ready
    ? `<div class="ast-step-actions">${edit}<button type="button" class="icon-button" data-step-act="up" aria-label="上移第 ${i + 1} 步" title="上移" ${i === 0 ? 'disabled' : ''}>${svg('arrow-up', 13)}</button><button type="button" class="icon-button" data-step-act="down" aria-label="下移第 ${i + 1} 步" title="下移" ${i === m.plan.steps.length - 1 ? 'disabled' : ''}>${svg('arrow-down', 13)}</button><button type="button" class="icon-button" data-step-act="remove" aria-label="删除第 ${i + 1} 步" title="删除步骤">${svg('trash-2', 13)}</button></div>`
    : '';
  const form =
    ready && editing?.plan === m.id && editing.step === s.key && s.params
      ? `<form class="ast-edit" aria-label="第 ${i + 1} 步的设置">${s.params.map((p) => paramField(p, s.args[p.key])).join('')}<div class="ast-edit-bar"><button type="button" data-step-act="cancel-edit">取消</button><button type="submit" class="primary">应用</button></div></form>`
      : '';
  return `<li class="ast-step status-${s.status}${s.problems.length ? ' has-problem' : ''}" data-step="${s.key}">
<div class="ast-step-head"><span class="ast-step-status" role="img" aria-label="${statusText}" title="${statusText}">${svg(icon, 13)}</span><span class="ast-step-index">${i + 1}.</span>${link}${badges(s)}</div>
${detail ? `<div class="ast-step-detail">${escapeXML(detail)}</div>` : ''}${s.note ? `<div class="ast-step-note">${escapeXML(s.note)}</div>` : ''}
${s.problems.map((p) => `<p class="ast-problem" role="note">${svg('ban', 12)}${escapeXML(p)}</p>`).join('')}${s.notes.map((n) => `<p class="ast-step-hint">${escapeXML(n)}</p>`).join('')}${s.error && s.status === 'failed' ? `<p class="ast-problem">${escapeXML(s.error)}</p>` : ''}
${actions}${form}</li>`;
}
function planHTML(m: PlanMessage) {
  const p = m.plan;
  const problems = p.steps.some((s) => s.problems.length);
  const state = { ready: '', running: '运行中…', stepping: '已暂停', done: '已应用', stopped: '已停止', failed: '失败', discarded: '已放弃' }[m.state];
  let foot = '';
  if (m.state === 'ready')
    foot = `<button type="button" class="primary" data-plan-act="run" ${problems || !p.steps.length ? 'disabled' : ''}>${svg('play', 14)}全部运行</button><button type="button" data-plan-act="step" ${problems || !p.steps.length ? 'disabled' : ''}>${svg('step-forward', 14)}单步执行</button><span class="ast-spacer"></span><button type="button" data-plan-act="discard">放弃</button>`;
  else if (m.state === 'stepping')
    foot = `<button type="button" class="primary" data-plan-act="step">${svg('step-forward', 14)}下一步</button><button type="button" data-plan-act="run">${svg('play', 14)}运行余下步骤</button><span class="ast-spacer"></span><button type="button" data-plan-act="stop">${svg('square', 13)}停止</button>`;
  else if (m.state === 'running') foot = `<span class="ast-running">${m.outcome === 'stopping' ? '将在本步完成后停止…' : '运行中…'}</span><span class="ast-spacer"></span><button type="button" data-plan-act="stop">${svg('square', 13)}停止</button>`;
  else if (m.state !== 'discarded' && m.outcome) foot = `<p class="ast-outcome" role="status">${escapeXML(m.outcome)}</p>`;
  return `<section class="ast-plan state-${m.state}" data-plan="${m.id}" aria-label="计划: ${escapeXML(p.title)}">
<header><span class="ast-plan-title">${svg('list-ordered', 14)}<strong>${escapeXML(p.title)}</strong></span>${state ? `<span class="ast-state">${state}</span>` : ''}</header>
${m.text ? `<div class="ast-text">${formatText(m.text)}</div>` : ''}${p.summary ? `<p class="ast-summary">${escapeXML(p.summary)}</p>` : ''}
${usesAI(p) && m.state === 'ready' ? `<p class="ast-ai-note">${svg('sparkles', 13)}标记“AI 算力”的步骤会打开预填提示词的对话框。在您点击“生成”前不会产生消耗。</p>` : ''}
${problems && m.state === 'ready' ? `<p class="ast-ai-note">${svg('ban', 13)}部分步骤存在问题。请编辑或删除它们后再运行计划。</p>` : ''}
<ol class="ast-steps">${p.steps.map((s, i) => stepHTML(m, s, i)).join('')}</ol>
${m.state === 'discarded' ? '' : `<footer class="ast-plan-foot">${foot}</footer>`}</section>`;
}
function messageHTML(m: Message) {
  if (m.role === 'user') return `<div class="ast-msg ast-user"><div class="ast-text">${formatText(m.text)}</div>${m.image ? '<small>包含图像预览</small>' : ''}</div>`;
  if (m.kind === 'plan') return planHTML(m);
  if (m.kind === 'error') return `<div class="ast-msg ast-error" role="alert">${svg('ban', 14)}<div class="ast-text">${formatText(m.text)}</div></div>`;
  const pointers = m.pointers?.length
    ? `<ul class="ast-pointers">${m.pointers.map((p) => `<li><span><strong>${escapeXML(p.label)}</strong><small>${escapeXML(p.where)}</small></span><button type="button" data-show="${escapeXML(p.id)}" aria-label="查看 ${escapeXML(p.label)}">${svg('mouse-pointer-click', 13)}定位查看</button></li>`).join('')}</ul>`
    : '';
  return `<div class="ast-msg ast-bot"><div class="ast-text">${formatText(m.text)}</div>${pointers}</div>`;
}

function renderLog(e: Editor, el: HTMLElement) {
  const log = el.querySelector<HTMLElement>('.ast-log')!;
  const c = conversation(e);
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const count = c.messages.length;
  const intro = `<div class="ast-intro">${svg('assistant', 28)}<p><strong>描述编辑需求</strong>，AI 助手将使用图像工作室的原生命令规划步骤。你可以预览、修改参数、调整顺序，并作为单次撤销步骤一键运行。也可以直接向它询问任何功能的操作指引。</p><div class="ast-examples" role="group" aria-label="示例">${EXAMPLES.map((x) => `<button type="button" data-example="${escapeXML(x)}">${escapeXML(x)}</button>`).join('')}</div></div>`;
  const pending = c.pending ? `<div class="ast-pending" role="status"><span class="ast-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${escapeXML(c.pending.status)}</span><button type="button" data-cancel>停止</button></div>` : '';
  const scroll = log.scrollTop;
  log.innerHTML = (count ? c.messages.map(messageHTML).join('') : intro) + pending;
  const last = log.querySelector<HTMLElement>(':scope > :last-child');
  if (Number(log.dataset.count ?? 0) < count && last && !c.pending && last.offsetHeight > log.clientHeight - 16) {
    // A long new reply (a plan) shows from its start.
    log.scrollTop = last.offsetTop - log.offsetTop - 8;
  } else if (atBottom || Number(log.dataset.count ?? 0) !== count || c.pending) log.scrollTop = log.scrollHeight;
  else log.scrollTop = scroll;
  log.dataset.count = String(count);
  const busy = !!c.pending;
  const input = el.querySelector<HTMLTextAreaElement>('.ast-input')!;
  input.disabled = busy;
  el.querySelector<HTMLButtonElement>('.ast-send')!.disabled = busy;
  el.querySelector<HTMLElement>('.ast-model')!.textContent = modelLabel(assistantSettings.model);
  el.querySelector<HTMLInputElement>('.ast-see input')!.checked = assistantSettings.seeImage;
  el.querySelector<HTMLElement>('.ast-sent')!.textContent = sentNote(e.hasDocument);
}

function readForm(form: HTMLFormElement, params: Param[]): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  for (const p of params) {
    const f = form.elements.namedItem(p.key) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!f) continue;
    if (p.type === 'boolean') {
      out[p.key] = (f as HTMLInputElement).checked;
      continue;
    }
    const v = f.value.trim();
    if (!v) continue;
    if (p.type === 'object' || p.type === 'point') {
      try {
        out[p.key] = JSON.parse(v);
      } catch {
        return `${p.label ?? p.key} is not valid JSON.`;
      }
    } else out[p.key] = v;
  }
  return out;
}

/** Submit a request typed elsewhere (the start screen, Describe an Edit). */
export function submit(e: Editor, text: string) {
  void ask(e, text);
}
export function focusComposer(el: HTMLElement, text?: string) {
  const input = el.querySelector<HTMLTextAreaElement>('.ast-input');
  if (!input) return;
  if (text !== undefined) input.value = text;
  input.focus();
}

export function mountAssistant(e: Editor, el: HTMLElement) {
  el.classList.add('assistant-panel');
  el.innerHTML = `<div class="ast-log" role="log" aria-label="AI 助手会话" aria-live="polite" tabindex="-1"></div>
<form class="ast-compose" aria-label="向 AI 助手提问">
<textarea class="ast-input" rows="2" aria-label="描述编辑需求或提问" placeholder="描述想要进行的图像编辑，或询问操作方法…"></textarea>
<div class="ast-compose-bar"><label class="ast-see" title="允许模型查看当前图像的缩小预览图"><input type="checkbox"> 发送图像预览</label><span class="ast-spacer"></span><span class="ast-model muted" title="在面板菜单中切换模型"></span><button type="submit" class="primary ast-send" aria-label="发送" title="发送 (Enter)">${svg('arrow-up', 15)}</button></div>
<p class="ast-sent"></p></form>`;
  const form = el.querySelector<HTMLFormElement>('.ast-compose')!;
  const input = el.querySelector<HTMLTextAreaElement>('.ast-input')!;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text) return input.focus();
    input.value = '';
    void ask(e, text).then(() => {
      if (el.isConnected && document.activeElement === document.body) input.focus();
    });
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      form.requestSubmit();
    } else if (ev.key === 'Escape' && conversation(e).pending) {
      ev.preventDefault();
      cancelAsk(e);
    }
    // Typing here never reaches the canvas shortcuts.
    ev.stopPropagation();
  });
  el.querySelector<HTMLInputElement>('.ast-see input')!.addEventListener('change', (ev) => {
    assistantSettings.seeImage = (ev.target as HTMLInputElement).checked;
    saveAssistantSettings();
    el.querySelector<HTMLElement>('.ast-sent')!.textContent = sentNote(e.hasDocument);
  });
  const log = el.querySelector<HTMLElement>('.ast-log')!;
  log.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const example = t.closest<HTMLElement>('[data-example]')?.dataset.example;
    if (example) return focusComposer(el, example);
    if (t.closest('[data-cancel]')) return cancelAsk(e);
    const show = t.closest<HTMLElement>('[data-show]')?.dataset.show;
    if (show) return showMe(e, show);
    const planEl = t.closest<HTMLElement>('[data-plan]');
    const m = planEl ? findPlan(e, planEl.dataset.plan!) : undefined;
    if (!m) return;
    const planAct = t.closest<HTMLElement>('[data-plan-act]')?.dataset.planAct;
    if (planAct === 'run' || planAct === 'step') {
      editing = undefined;
      return void runPlan(e, m, planAct === 'run' ? 'all' : 'step');
    }
    if (planAct === 'stop') return stopPlan(e, m);
    if (planAct === 'discard') return discardPlan(m);
    const stepAct = t.closest<HTMLElement>('[data-step-act]')?.dataset.stepAct;
    const key = t.closest<HTMLElement>('[data-step]')?.dataset.step;
    const step = m.plan.steps.find((s) => s.key === key);
    if (!stepAct || !step) return;
    if (stepAct === 'remove') removeStep(e, m, step.key);
    else if (stepAct === 'up' || stepAct === 'down') moveStep(e, m, step.key, stepAct === 'up' ? -1 : 1);
    else if (stepAct === 'edit') {
      editing = editing?.step === step.key ? undefined : { plan: m.id, step: step.key };
      renderLog(e, el);
      el.querySelector<HTMLElement>(`[data-step="${step.key}"] .ast-edit input, [data-step="${step.key}"] .ast-edit select, [data-step="${step.key}"] .ast-edit textarea`)?.focus();
      return;
    } else if (stepAct === 'cancel-edit') {
      editing = undefined;
      renderLog(e, el);
      el.querySelector<HTMLElement>(`[data-step="${step.key}"] [data-step-act="edit"]`)?.focus();
      return;
    }
    // Keep keyboard focus near where it was.
    el.querySelector<HTMLElement>(`[data-step="${step.key}"] [data-step-act="${stepAct}"]`)?.focus();
  });
  log.addEventListener('submit', (ev) => {
    const f = (ev.target as HTMLElement).closest<HTMLFormElement>('.ast-edit');
    if (!f) return;
    ev.preventDefault();
    const m = findPlan(e, f.closest<HTMLElement>('[data-plan]')!.dataset.plan!);
    const step = m?.plan.steps.find((s) => s.key === f.closest<HTMLElement>('[data-step]')!.dataset.step);
    if (!m || !step?.params) return;
    const values = readForm(f, step.params);
    if (typeof values === 'string') return e.message(values);
    editing = undefined;
    editStep(e, m, step, values);
    el.querySelector<HTMLElement>(`[data-step="${step.key}"] [data-step-act="edit"]`)?.focus();
  });
  // Shortcuts typed in the edit forms stay there.
  log.addEventListener('keydown', (ev) => {
    if ((ev.target as HTMLElement).closest('.ast-edit')) ev.stopPropagation();
  });
  const off = onAssistantChange(() => {
    if (!el.isConnected) return;
    el.dataset.key = '';
    updateAssistant(e, el);
  });
  void off;
}
export function updateAssistant(e: Editor, el: HTMLElement) {
  const key = `${e.session?.id}:${assistantRevision()}:${e.hasDocument}:${assistantSettings.model}:${assistantSettings.seeImage}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  renderLog(e, el);
}
