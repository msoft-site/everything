// The assistant sidebar: the conversation, the steps the assistant takes in
// the scene, and the message box. Each message's changes become one undo step
// ("Assistant: …") that the reply's Undo button reverts. Ported from
// Parametric's assistant panel.

import { app } from '../app/app';
import { prefs } from '../app/prefs';
import { clearScriptFiles } from '../scripting/files';
import { iconEl } from '../ui/icons';
import { type Agent, type ExchangeResult, MAX_RETRIES, type Step, createAgent } from './agent';
import { type ChatFn, puterChat } from './ai';
import { ATTACH_ACCEPT, type Attachment, MAX_ATTACHMENTS, attachmentKind, attachmentProblem, attachmentsTooLarge, formatSize, offerImages } from './attach';
import { readAttachment } from './attachments';
import { viewportUI } from './capture';
import { renderMarkdown } from './markdown';
import { SYSTEM_PROMPT, sceneSnapshot } from './prompt';
import { inPuterDesktop, isSignedIn, loadPuter, signIn } from './puter';
import { type AssistantHost, changesScene, runTool, toolSpecs } from './tools';

export const ASSISTANT_MODELS: { id: string; label: string; title: string }[] = [
  { id: 'claude-fable-5-1', label: 'Fable 5.1', title: 'Claude Fable 5.1: the most capable' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5', title: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', title: 'Claude Sonnet 5.5: faster' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', title: 'Claude Haiku 5.5: the fastest' },
];
const DEFAULT_MODEL = 'claude-opus-5-5';
const SETTINGS_KEY = 'p3d:assistant';

/** Development builds and browser tests may stand in for 本地智能引擎 with window.__assistantChat. */
const devChat = (): ChatFn | null => (import.meta.env.DEV ? ((window as unknown as { __assistantChat?: ChatFn }).__assistantChat ?? null) : null);

function loadModel(): string {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as { model?: string };
    if (v.model && ASSISTANT_MODELS.some((m) => m.id === v.model)) return v.model;
  } catch {
    /* settings are optional */
  }
  return DEFAULT_MODEL;
}

function saveModel(model: string) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ model }));
  } catch {
    /* settings are optional */
  }
}

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Kid = Node | string | null | undefined | false;

/** A DOM element (never HTML text). */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, String(v));
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
}

const ic = (name: string) => {
  const e = iconEl(name);
  e.classList.add('as-ic');
  return e;
};

const short = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** A short label for a step, in the user's words. */
export function stepLabel(name: string, a: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
  switch (name) {
    case 'get_scene':
      return '读取场景';
    case 'get_object':
      return `查看 ${s(a.name)}`;
    case 'get_material':
      return `查看材质 ${s(a.name)}`;
    case 'run_script': {
      const d = s(a.description).trim();
      const label = d ? d : '运行脚本';
      return a.dry_run === true ? `尝试运行：${label}` : label;
    }
    case 'api_help':
      return `查阅 API：${short(s(a.topic), 48)}`;
    case 'capture_view':
      return `查看场景${a.view && a.view !== 'CURRENT' ? ` (${s(a.view).toLowerCase()})` : ''}`;
    case 'set_view':
      return '更改视图';
    default:
      return name;
  }
}

interface PendingFile {
  file: File;
  kind: 'image' | 'pdf' | 'text';
  name: string;
  ready: Promise<Attachment | null>;
  node: HTMLElement;
  /** An image's preview, once read. */
  url?: string;
}

/** The files a sent message carried: thumbnails for images, names for the rest. */
function sentFiles(items: PendingFile[]): HTMLElement {
  return el(
    'ul',
    { class: 'as-user-files', 'aria-label': '随此消息发送的文件' },
    ...items.map((it) => el('li', { class: 'as-user-file', title: it.name }, it.url ? el('img', { class: 'as-user-thumb', src: it.url, alt: it.name }) : el('span', { class: 'as-user-chip' }, ic(it.kind === 'image' ? 'file_image' : 'file_blank'), el('span', {}, it.name)))),
  );
}

/** Whether a paste is text that came with a picture of itself (text copied from a document): then the text is what was meant. */
function copiedText(data: DataTransfer, files: File[]): boolean {
  if (!files.every((f) => String(f.type).startsWith('image/'))) return false;
  const read = (type: string) => {
    try {
      return data.getData(type) || '';
    } catch {
      return '';
    }
  };
  if (!read('text/plain').trim()) return false;
  if ([...(data.types ?? [])].includes('text/rtf')) return true;
  return !!read('text/html')
    .replace(/<(style|script|title)\b[\s\S]*?<\/\1>|<[^>]*>|&nbsp;/gi, ' ')
    .trim();
}

interface Segment {
  el: HTMLElement;
  src: string;
}

/** One reply: text and step lists in the order they arrived, then a footer. */
interface Turn {
  el: HTMLElement;
  body: HTMLElement;
  text: Segment | null;
  steps: HTMLElement | null;
  stepEls: Map<string, HTMLElement>;
  foot: HTMLElement;
}

export class AssistantPanel {
  readonly el: HTMLElement;
  /** Set by tests to answer without Puter. */
  chat: ChatFn | null = null;
  private log: HTMLElement;
  private input: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private status: HTMLElement;
  private agent: Agent;
  private host: AssistantHost = { app, ui: viewportUI };
  private model = loadModel();
  private renderQueued = false;
  private turn: Turn | null = null;
  private pendingText: Segment | null = null;
  /** Files waiting to go with the next message. */
  private pending: PendingFile[] = [];
  private tray: HTMLElement;
  private fileInput: HTMLInputElement;
  /** The pending files are being read before a message goes. */
  private sending = false;
  private readQueue: { item: PendingFile; resolve: (a: Attachment) => void; reject: (e: unknown) => void }[] = [];
  private reading = 0;
  private flashTimer = 0;

  constructor(private onClose: () => void) {
    this.agent = createAgent({
      chat: (m, o) => (this.chat ?? devChat() ?? puterChat)(m, o),
      tools: () => toolSpecs(this.host),
      runTool: (name, args, signal) => runTool(this.host, name, args, signal),
      system: SYSTEM_PROMPT,
      snapshot: () => sceneSnapshot(this.host),
      model: () => this.model,
      changes: changesScene,
    });

    const modelSel = el('select', { class: 'as-model', 'aria-label': 'AI 模型', title: 'AI 模型' });
    for (const m of ASSISTANT_MODELS) {
      const o = el('option', { value: m.id, title: m.title }, m.label);
      o.selected = m.id === this.model;
      modelSel.append(o);
    }
    modelSel.addEventListener('change', () => {
      this.model = modelSel.value;
      saveModel(this.model);
    });
    const newChat = el('button', { class: 'as-icon-btn', type: 'button', 'aria-label': '新建会话', 'data-tip': '新建会话' }, ic('new_chat'));
    newChat.addEventListener('click', () => this.reset());
    const close = el('button', { class: 'as-icon-btn', type: 'button', 'aria-label': '关闭助手', 'data-tip': '关闭' }, ic('x'));
    close.addEventListener('click', () => this.onClose());

    this.log = el('div', { class: 'as-log', role: 'log', 'aria-live': 'polite', 'aria-label': '对话记录' });
    this.input = el('textarea', { class: 'as-input', rows: 1, placeholder: '描述要创建或修改的内容…', 'aria-label': '给助手发送消息' });
    this.sendBtn = el('button', { class: 'as-send', type: 'button', 'aria-label': '发送' }, ic('send'));
    this.status = el('div', { class: 'as-status', role: 'status' });
    this.input.addEventListener('input', () => this.grow());
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void this.submit();
      } else if (e.key === 'Escape' && this.agent.busy) {
        e.preventDefault();
        this.agent.stop();
      }
    });
    this.sendBtn.addEventListener('click', () => (this.agent.busy ? this.agent.stop() : void this.submit()));
    // Files go with a message: picked with the paperclip, pasted into the box, or dropped on the panel.
    this.fileInput = el('input', { type: 'file', multiple: true, accept: ATTACH_ACCEPT, hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
    this.fileInput.addEventListener('change', () => {
      const files = [...(this.fileInput.files ?? [])];
      this.fileInput.value = '';
      this.attach(files);
      this.input.focus();
    });
    const attachBtn = el('button', { class: 'as-icon-btn as-attach', type: 'button', 'aria-label': '附加文件', 'data-tip': '附加图片、PDF 或文本文件' }, ic('attach'));
    attachBtn.addEventListener('click', () => this.fileInput.click());
    this.tray = el('ul', { class: 'as-tray', 'aria-label': '附加的文件', hidden: true });
    this.input.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length || copiedText(e.clipboardData!, files)) return;
      e.preventDefault();
      this.attach(files);
    });
    const composer = el('div', { class: 'as-composer' }, this.tray, el('div', { class: 'as-row' }, attachBtn, this.input, this.sendBtn), this.fileInput);

    this.el = el(
      'aside',
      { class: 'assistant', 'aria-label': 'AI 助手' },
      el('div', { class: 'as-bar' }, el('span', { class: 'as-title' }, ic('assistant'), 'AI 助手'), modelSel, newChat, close),
      this.log,
      el('div', { class: 'as-bottom' }, this.status, composer, el('div', { class: 'as-note' }, '将您的消息和场景描述发送至本地智能引擎。')),
    );
    this.bindDrop();
    this.renderEmpty();
  }

  get busy() {
    return this.agent.busy;
  }

  focus() {
    requestAnimationFrame(() => this.input.focus());
  }

  private grow() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(200, this.input.scrollHeight)}px`;
  }

  /** The status line is a live region: it is only written when what it says changes, or it is read out again for every streamed piece. */
  private say(text: string) {
    if (this.status.textContent !== text) this.status.textContent = text;
  }

  private flash(message: string) {
    clearTimeout(this.flashTimer);
    this.status.textContent = message;
    this.status.classList.add('warn');
    this.flashTimer = window.setTimeout(() => {
      this.status.classList.remove('warn');
      if (!this.agent.busy) this.say('');
    }, 6000);
  }

  private reset() {
    for (const it of [...this.pending]) this.removePending(it);
    for (const img of this.log.querySelectorAll<HTMLImageElement>('img.as-user-thumb')) URL.revokeObjectURL(img.src);
    this.agent.reset();
    clearScriptFiles();
    this.turn = null;
    this.setBusy(false);
    this.renderEmpty();
    this.input.focus();
  }

  /** Whether the scene is the untouched startup scene. */
  private startupScene() {
    const names = Object.values(app.doc.objects)
      .map((o) => o.name)
      .sort()
      .join(',');
    return names === 'Camera,Cube,Light' || names === '';
  }

  private renderEmpty() {
    const fresh = this.startupScene();
    const ideas = fresh
      ? ['棕色树干与绿色树冠的低多边形树木', '带四把椅子的木制餐桌', '温馨的房间：地板、两面墙、沙发和台灯', '带胡萝卜鼻子和围巾的雪人']
      : ['解释此场景是如何构建的', '为每个物体赋予合适的材质', '添加柔和的三点布光并将摄像机对准模型', '在 120 帧内让选中的物体旋转一圈'];
    const chips = el(
      'div',
      { class: 'as-ideas' },
      ...ideas.map((t) => {
        const b = el('button', { class: 'as-idea', type: 'button' }, t);
        b.addEventListener('click', () => {
          this.input.value = t;
          this.grow();
          void this.submit();
        });
        return b;
      }),
    );
    this.log.replaceChildren(
      el(
        'div',
        { class: 'as-empty' },
        el('div', { class: 'as-empty-icon' }, ic('assistant')),
        el('div', { class: 'as-empty-title' }, fresh ? '描述要构建的内容' : '修改或询问此场景'),
        el('p', {}, '助手可以进行物体建模、添加材质、灯光、摄像机和动画，并在视口中检查工作。在单条消息中所做的所有修改均为单个撤销步骤。'),
        chips,
      ),
    );
  }

  private setBusy(on: boolean) {
    this.sendBtn.replaceChildren(ic(on ? 'stop' : 'send'));
    this.sendBtn.setAttribute('aria-label', on ? '停止' : '发送');
    this.sendBtn.classList.toggle('stop', on);
    this.el.classList.toggle('busy', on);
    if (!on) this.say('');
  }

  /** Whether 本地智能引擎 can be used; otherwise explains why in the conversation. */
  private async ready(): Promise<boolean> {
    if (this.chat || devChat()) return true;
    // Turned off, nothing is fetched (not even Puter's SDK), and "check your connection" would be wrong.
    if (!prefs.use_online_access) {
      this.notice('助手需要在线运行，但在线访问已关闭（首选项 ▸ 系统 ▸ 网络）。');
      return false;
    }
    this.say('正在连接本地智能引擎…');
    const sdk = await loadPuter();
    this.say('');
    if (!sdk?.ai) {
      this.notice('助手运行在本地智能引擎上，当前无法连接。请检查网络连接后重试。');
      return false;
    }
    if (!inPuterDesktop() && !isSignedIn()) {
      const btn = el('button', { class: 'as-btn primary', type: 'button' }, '登录');
      btn.addEventListener('click', () => {
        void signIn()
          .then((ok) => {
            if (!ok) return;
            btn.closest('.as-msg')?.remove();
            this.input.focus();
            void this.submit();
          })
          .catch((e) => this.flash((e as Error).message));
      });
      this.notice('登录以使用助手（运行在本地智能引擎上）。', btn);
      return false;
    }
    return true;
  }

  private notice(text: string, action?: HTMLElement) {
    this.log.querySelector('.as-empty')?.remove();
    // Asking again replaces the notice instead of stacking copies of it.
    this.clearNotices();
    this.log.append(el('div', { class: 'as-msg as-notice' }, el('p', {}, text), action));
    this.scroll(true);
  }

  private clearNotices() {
    for (const n of this.log.querySelectorAll('.as-notice')) n.remove();
  }

  private scroll(force = false) {
    const l = this.log;
    if (force || l.scrollHeight - l.scrollTop - l.clientHeight < 120) l.scrollTop = l.scrollHeight;
  }

  async submit() {
    if ((!this.input.value.trim() && !this.pending.length) || this.agent.busy || this.sending) return;
    this.sending = true;
    let ok: boolean;
    try {
      ok = await this.ready();
    } finally {
      this.sending = false;
    }
    if (!ok || this.agent.busy) return;
    let text = this.input.value.trim();
    let items: PendingFile[] = [];
    let files: Attachment[] = [];
    if (this.pending.length) {
      const waiting = this.pending;
      this.sending = true;
      this.say('Reading attached files…');
      let read: (Attachment | null)[];
      try {
        read = await Promise.all(waiting.map((it) => it.ready));
      } finally {
        this.sending = false;
        this.say('');
      }
      if (this.agent.busy) return;
      items = waiting.filter((it, i) => read[i] && this.pending.includes(it));
      files = items.map((it) => read[waiting.indexOf(it)]!);
      // Too much for one request: nothing goes, and the tray and the text stay.
      const tooLarge = attachmentsTooLarge(files);
      if (tooLarge) {
        this.flash(tooLarge);
        return;
      }
      this.pending = this.pending.filter((it) => !waiting.includes(it));
      for (const it of items) it.node.remove();
      this.syncTray();
      // What was typed while the files were read is part of the message.
      text = this.input.value.trim();
      if (!text && !files.length) return;
    }
    this.input.value = '';
    this.grow();
    this.log.querySelector('.as-empty')?.remove();
    this.clearNotices();
    const bubble = el('div', { class: 'as-msg as-user' });
    if (items.length) bubble.append(sentFiles(items));
    if (text) bubble.append(el('div', { class: 'as-user-text' }, text));
    this.log.append(bubble);
    const label = text || items.map((it) => it.name).join(', ');
    offerImages(files);
    void this.run(label, (on) => this.agent.send(text, on, { attachments: files }));
  }

  // ---------- attachments ----------

  /** Takes files for the next message. Each is read as it comes, so Send rarely waits. */
  attach(files: File[]) {
    let over = 0;
    for (const file of files) {
      if (this.pending.length >= MAX_ATTACHMENTS) {
        over++;
        continue;
      }
      const problem = attachmentProblem(file, this.pending.length);
      if (problem) {
        this.flash(problem);
        continue;
      }
      const kind = attachmentKind(file)!;
      const item = { file, kind, name: file.name || (kind === 'image' ? 'Pasted image' : 'File') } as PendingFile;
      item.ready = new Promise<Attachment>((resolve, reject) => this.readQueue.push({ item, resolve, reject })).catch((e) => {
        if (this.pending.includes(item)) {
          this.flash((e as Error)?.message || `${item.name} could not be read`);
          this.removePending(item);
        }
        return null;
      });
      this.pending.push(item);
      this.tray.append(this.trayItem(item));
    }
    if (over) this.flash(`单条消息最多可附加 ${MAX_ATTACHMENTS} 个文件，因此略过了 ${over} 个文件。`);
    this.readNext();
    this.syncTray();
  }

  // Read a couple at a time: a photo decodes to full size before it is fitted.
  private readNext() {
    while (this.reading < 2 && this.readQueue.length) {
      const { item, resolve, reject } = this.readQueue.shift()!;
      if (!this.pending.includes(item)) {
        reject(null);
        continue;
      }
      this.reading++;
      readAttachment(item.file)
        .then(resolve, reject)
        .finally(() => {
          this.reading--;
          this.readNext();
        });
    }
  }

  private trayItem(item: PendingFile): HTMLElement {
    const remove = el('button', { class: 'as-tray-remove', type: 'button', 'aria-label': `移除 ${item.name}`, title: '移除' }, ic('x'));
    remove.addEventListener('click', () => {
      this.removePending(item);
      this.input.focus();
    });
    const preview = el('span', { class: 'as-tray-icon', 'aria-hidden': 'true' }, ic(item.kind === 'image' ? 'file_image' : 'file_blank'));
    const spinner = el('span', { class: 'as-spinner', 'aria-hidden': 'true' });
    item.node = el('li', { class: 'as-tray-item reading', title: `${item.name} · ${formatSize(item.file.size)}`, 'aria-busy': 'true' }, preview, spinner, el('span', { class: 'as-tray-name' }, item.name), remove);
    void item.ready.then((read) => {
      item.node.classList.remove('reading');
      item.node.removeAttribute('aria-busy');
      spinner.remove();
      if (!read || read.kind !== 'image' || !this.pending.includes(item)) return;
      try {
        item.url = URL.createObjectURL(read.thumb || item.file);
      } catch {
        return;
      }
      preview.replaceWith(el('img', { class: 'as-tray-thumb', src: item.url, alt: '' }));
    });
    return item.node;
  }

  private removePending(item: PendingFile) {
    this.pending = this.pending.filter((p) => p !== item);
    item.node?.remove();
    if (item.url) URL.revokeObjectURL(item.url);
    this.syncTray();
  }

  private syncTray() {
    this.tray.hidden = !this.pending.length;
  }

  /** Files dropped anywhere on the panel are attached. */
  private bindDrop() {
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    let depth = 0;
    this.el.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      this.el.classList.add('as-drop');
    });
    this.el.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    this.el.addEventListener('dragleave', () => {
      if (--depth <= 0) {
        depth = 0;
        this.el.classList.remove('as-drop');
      }
    });
    this.el.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      this.el.classList.remove('as-drop');
      this.attach([...(e.dataTransfer?.files ?? [])]);
      this.input.focus();
    });
  }

  // ---------- replies ----------

  private newTurn(): Turn {
    const body = el('div', { class: 'as-body' });
    const foot = el('div', { class: 'as-foot' });
    const node = el('div', { class: 'as-msg as-bot' }, body, foot);
    this.log.append(node);
    return { el: node, body, text: null, steps: null, stepEls: new Map(), foot };
  }

  /** A reply that may still be winding down after New Chat stopped it. */
  private inFlight: Promise<void> | null = null;

  private run(request: string, go: (on: Parameters<Agent['send']>[1]) => Promise<ExchangeResult>): Promise<void> {
    // A reply New Chat stopped folds its changes into its undo step when it ends: the next one starts after that.
    const before = this.inFlight;
    const p = (before ? before.then(() => this.runTurn(request, go)) : this.runTurn(request, go)).finally(() => {
      if (this.inFlight === p) this.inFlight = null;
    });
    this.inFlight = p;
    return p;
  }

  private async runTurn(request: string, go: (on: Parameters<Agent['send']>[1]) => Promise<ExchangeResult>) {
    const mark = app.undo.mark();
    const turn = this.newTurn();
    this.turn = turn;
    // The reply is redrawn as it streams: screen readers wait for it to finish instead of reading every redraw.
    turn.el.setAttribute('aria-busy', 'true');
    this.setBusy(true);
    this.say('思考中…');
    this.scroll(true);
    let res: ExchangeResult;
    try {
      res = await go((e) => {
        if (this.turn !== turn) return;
        if (e.type === 'text') {
          if (!turn.text) {
            turn.text = { el: el('div', { class: 'as-text' }), src: '' };
            turn.body.append(turn.text.el);
            turn.steps = null;
          }
          turn.text.src += e.text;
          this.queueText(turn.text);
          this.say('编写中…');
        } else if (e.type === 'step') {
          if (!turn.steps) {
            if (turn.text) this.renderText(turn.text);
            turn.steps = el('ol', { class: 'as-steps', 'aria-label': '步骤' });
            turn.body.append(turn.steps);
            turn.text = null;
          }
          this.renderStep(turn, turn.steps, e.step);
          this.say(e.step.status === 'running' ? `${stepLabel(e.step.name, e.step.args)}…` : '思考中…');
        } else if (e.type === 'round') {
          this.say('思考中…');
        } else if (e.type === 'retry') {
          this.say(`AI 服务未响应。正在重试（第 ${e.attempt} 次，共 ${MAX_RETRIES} 次）…`);
        }
      });
    } catch (e) {
      res = { stopped: false, error: e as Error, steps: [] };
    }
    turn.el.removeAttribute('aria-busy');
    // Everything this message changed becomes one undo step, also when New Chat stopped it.
    const label = `助手: ${short(request, 40)}`;
    const changed = !!mark && !app.undo.isCurrent(mark) && app.undo.squash(mark, label);
    if (this.turn !== turn) return;
    if (turn.text) this.renderText(turn.text);
    const after = app.undo.mark();
    if (res.stopped) turn.foot.append(el('span', { class: 'as-meta' }, '已停止。'));
    if (res.error) {
      const retry = el('button', { class: 'as-btn', type: 'button' }, '重试');
      retry.addEventListener('click', () => {
        if (this.agent.busy) return;
        turn.foot.replaceChildren();
        // The button is gone: the keyboard goes to the message box, not to the page.
        this.input.focus();
        void this.run(request, (on) => this.agent.retry(on));
      });
      turn.foot.append(el('div', { class: 'as-error', role: 'alert' }, `助手无法回答：${res.error.message}`), retry);
    }
    if (changed) {
      const undo = el('button', { class: 'as-btn', type: 'button' }, ic('undo'), '撤销更改');
      undo.addEventListener('click', () => {
        if (!app.undo.isCurrent(after)) {
          this.flash('场景此后已更改；请使用 编辑 ▸ 撤销历史 进行后退。');
          return;
        }
        app.undoStep();
        undo.replaceWith(el('span', { class: 'as-meta' }, '已撤销更改。'));
        this.input.focus();
      });
      turn.foot.prepend(undo);
    }
    this.turn = null;
    this.setBusy(false);
    this.scroll();
  }

  private queueText(seg: Segment) {
    if (this.pendingText && this.pendingText !== seg) this.renderText(this.pendingText);
    this.pendingText = seg;
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      if (this.pendingText) this.renderText(this.pendingText);
      this.pendingText = null;
      this.scroll();
    });
  }

  private renderText(seg: Segment) {
    seg.el.replaceChildren(renderMarkdown(seg.src));
  }

  private renderStep(turn: Turn, list: HTMLElement, step: Step) {
    let node = turn.stepEls.get(step.id);
    if (!node) {
      node = el('li', { class: 'as-step' });
      turn.stepEls.set(step.id, node);
      list.append(node);
    }
    const mark = step.status === 'running' ? el('span', { class: 'as-spinner', 'aria-hidden': 'true' }) : ic(step.status === 'done' ? 'check' : step.status === 'error' ? 'error' : 'x');
    node.className = `as-step ${step.status}`;
    node.replaceChildren(el('span', { class: 'as-step-mark' }, mark), el('span', { class: 'as-step-label' }, stepLabel(step.name, step.args)));
    if (step.summary && step.status !== 'running') {
      node.title = step.summary;
      if (step.status === 'error') node.append(el('div', { class: 'as-step-detail' }, short(step.summary, 220)));
    }
    if (step.image) node.append(el('img', { class: 'as-shot', src: step.image, alt: '助手查看的内容' }));
    this.scroll();
  }
}
