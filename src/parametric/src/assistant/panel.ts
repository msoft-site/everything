// The assistant sidebar: conversation, the steps the assistant takes on the
// part, and the message box. Each message's changes become one undo step
// ("Assistant: …") that the turn's Undo button reverts.

import type { App } from '../app/app';
import { appHost } from '../app/assistant-host';
import { doSignIn } from '../app/start';
import { type ChatFn, puterChat } from '../platform/ai';
import { type PuterFSItem, cloudAvailable, env, puter } from '../platform/puter';
import { h, nextDomId } from '../ui/dom';
import { icon } from '../ui/icons';
import { toast } from '../ui/overlay';
import { type Agent, type ExchangeResult, MAX_RETRIES, type Step, createAgent } from './agent';
import type { AssistantHost } from './host';
import { renderMarkdown } from './markdown';
import { ATTACH_ACCEPT, type Attachment, MAX_ATTACHMENTS, MAX_TEXT_CHARS, attachmentKind, attachmentProblem, attachmentsTooLarge, formatSize } from './attach';
import { readAttachment } from './attachments';
import { SYSTEM_PROMPT, partSnapshot } from './prompt';
import { changesDocument, runTool, toolSpecs } from './tools';

export const ASSISTANT_MODEL = 'claude-opus-5-5';

/** Development builds and browser tests may stand in for 本地智能引擎 with window.__assistantChat. */
const devChat = (): ChatFn | null => (import.meta.env.DEV ? (window as unknown as { __assistantChat?: ChatFn }).__assistantChat ?? null : null);

const short = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** A short label for a step, in the user's words. */
export function stepLabel(name: string, a: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
  const featureNames: Record<string, string> = {
    add_extrude: a.cut ? '拉伸切除' : '拉伸', add_revolve: a.cut ? '旋转切除' : '旋转', add_fillet: '圆角', add_chamfer: '倒角',
    add_shell: '抽壳', add_hole: '孔', add_linear_pattern: '线性阵列', add_circular_pattern: '圆周阵列', add_mirror: '镜像',
    add_plane: '参考基准面', add_loft: a.cut ? '放样切除' : '放样', add_sweep: a.cut ? '扫掠切除' : '扫掠', add_draft: '拔模',
  };
  if (featureNames[name]) return `添加${featureNames[name]}${a.name ? ` "${s(a.name)}"` : ''}`;
  switch (name) {
    case 'get_model': return '读取零件';
    case 'get_sketch': return a.sketch ? `读取草图 ${s(a.sketch)}` : '读取草图';
    case 'find_geometry': return `查找${a.kind === 'edges' ? '边' : '面'}`;
    case 'measure': return '测量';
    case 'mass_properties': return '质量属性';
    case 'calculate': return '计算';
    case 'capture_view': return `查看模型${a.orientation ? ` (${s(a.orientation)})` : ''}`;
    case 'create_sketch': return a.plane ? `在 ${s(a.plane)} 上绘制草图` : '创建草图';
    case 'edit_sketch': return a.sketch ? `编辑草图 ${s(a.sketch)}` : '编辑草图';
    case 'edit_feature': return a.feature ? `编辑 ${s(a.feature)}` : '编辑特征';
    case 'delete_features': return a.features ? `删除 ${Array.isArray(a.features) ? a.features.join(', ') : s(a.features)}` : '删除特征';
    case 'set_rollback': return '移动回退栏';
    case 'set_variables': return '设置变量';
    case 'set_part': return '零件属性';
    case 'set_view': return '更改视图';
    case 'drawing': return '工程图';
    case 'run_command': return a.command ? `运行 ${s(a.command).replace(/_/g, ' ')}` : '运行命令';
    default: return name;
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
  return h('ul', { class: 'as-user-files', 'aria-label': '随此消息发送的文件' }, ...items.map((it) =>
    h('li', { class: 'as-user-file', title: it.name },
      it.url ? h('img', { class: 'as-user-thumb', src: it.url, alt: it.name })
        : h('span', { class: 'as-user-chip' }, icon(it.kind === 'pdf' || it.kind === 'text' ? 'file' : 'image', 14), h('span', {}, it.name)))));
}

/**
 * Whether a paste is text that came with a picture of itself (text copied from
 * a document or spreadsheet): then the text is what was meant.
 */
function copiedText(data: DataTransfer, files: File[]): boolean {
  if (!files.every((f) => String(f.type).startsWith('image/'))) return false;
  const read = (type: string) => { try { return data.getData(type) || ''; } catch { return ''; } };
  if (!read('text/plain').trim()) return false;
  if ([...(data.types ?? [])].includes('text/rtf')) return true;
  return !!read('text/html').replace(/<(style|script|title)\b[\s\S]*?<\/\1>|<[^>]*>|&nbsp;/gi, ' ').trim();
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
  /** Text of the round being written: it joins the conversation only when the round completes. */
  draft: HTMLElement | null;
}

export class AssistantPanel {
  readonly el: HTMLElement;
  /** Buttons for the pane's header, beside its title. */
  readonly headActions: HTMLElement[];
  private newChat: HTMLButtonElement;
  private log: HTMLElement;
  private input: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private status: HTMLElement;
  /** Says why the typed message cannot go (too long). */
  private limit: HTMLElement;
  private agent: Agent;
  private host: AssistantHost;
  private renderQueued = false;
  private turn: Turn | null = null;
  /** Set by tests and the dev mock to answer without Puter. */
  chat: ChatFn | null = null;
  /** Files waiting to go with the next message. */
  private pending: PendingFile[] = [];
  private tray: HTMLElement;
  private fileInput: HTMLInputElement;
  /** The pending files are being read before a message goes. */
  private sending = false;
  private readQueue: { item: PendingFile; resolve: (a: Attachment) => void; reject: (e: unknown) => void }[] = [];
  private reading = 0;
  /** Where the message being answered started in the undo history, and its undo step's name. */
  private undoRun: { mark: number; label: string } | null = null;

  constructor(private app: App) {
    this.host = appHost(app);
    this.agent = createAgent({
      chat: (m, o) => (this.chat ?? devChat() ?? puterChat)(m, o),
      tools: toolSpecs,
      runTool: async (name, args) => {
        const r = await runTool(this.host, name, args);
        // The message's changes are folded into one undo step as they come: a long
        // build would otherwise push older history, and its own start, off the
        // bottom of the undo stack before the message ends.
        const run = this.undoRun;
        if (run && this.app.store.undoMark > run.mark + 1) this.app.store.squash(run.mark, run.label);
        return r;
      },
      system: SYSTEM_PROMPT,
      snapshot: () => partSnapshot(this.host),
      model: () => ASSISTANT_MODEL,
      changes: changesDocument,
    });

    this.newChat = h('button', { class: 'icon-btn', type: 'button', 'aria-label': '新建会话', title: '新建会话' }, icon('newChat', 16)) as HTMLButtonElement;
    this.newChat.addEventListener('click', (e) => this.reset(e));
    this.headActions = [this.newChat];

    this.log = h('div', { class: 'as-log', role: 'log', 'aria-live': 'polite', 'aria-label': '对话记录' });
    // Follow new content only while the user is at the bottom; scrolling up to read stops it.
    this.log.addEventListener('scroll', () => { const l = this.log; this.stick = l.scrollHeight - l.scrollTop - l.clientHeight < 40; }, { passive: true });
    this.input = h('textarea', { class: 'as-input', rows: 1, placeholder: '描述零件设计或修改需求…', 'aria-label': '给助手发送消息' }) as HTMLTextAreaElement;
    this.sendBtn = h('button', { class: 'as-send', type: 'button', 'aria-label': '发送' }, icon('send', 16)) as HTMLButtonElement;
    this.status = h('div', { class: 'as-status', role: 'status' });
    this.limit = h('div', { class: 'as-limit', id: nextDomId('as-limit'), 'aria-live': 'polite' });
    this.input.setAttribute('aria-describedby', this.limit.id);
    this.input.addEventListener('input', () => { this.grow(); this.checkLength(); });
    this.input.addEventListener('keydown', (e) => {
      // keyCode 229: Safari's Enter that commits an IME composition comes with isComposing false.
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); void this.submit(); }
      else if (e.key === 'Escape' && this.agent.busy) { e.preventDefault(); this.stop(); }
    });
    this.sendBtn.addEventListener('click', () => (this.agent.busy ? this.stop() : void this.submit()));
    // Files go with a message: picked with the paperclip, pasted into the box, or dropped on the panel.
    this.fileInput = h('input', { type: 'file', multiple: true, accept: ATTACH_ACCEPT, hidden: true, tabindex: '-1', 'aria-hidden': 'true' }) as HTMLInputElement;
    this.fileInput.addEventListener('change', () => {
      const files = [...(this.fileInput.files ?? [])];
      this.fileInput.value = '';
      this.attach(files);
      this.input.focus();
    });
    const attachBtn = h('button', { class: 'icon-btn as-attach', type: 'button', 'aria-label': '附加文件', title: '附加图片、PDF 或文本文件 (DXF, CSV…)' }, icon('attach', 17));
    attachBtn.addEventListener('click', () => this.fileInput.click());
    this.tray = h('ul', { class: 'as-tray', 'aria-label': '附加的文件', hidden: true });
    this.input.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length || copiedText(e.clipboardData!, files)) return;
      e.preventDefault();
      this.attach(files);
    });
    const composer = h('div', { class: 'as-composer' }, this.tray, h('div', { class: 'as-row' }, attachBtn, this.input, this.sendBtn), this.fileInput);

    this.el = h('div', { class: 'assistant' },
      this.log,
      h('div', { class: 'as-bottom' }, this.status, composer, this.limit,
        h('div', { class: 'as-note' }, '将您的消息和零件描述发送至本地智能引擎。在投入使用前请仔细检查设计。')));
    this.bindDrop();
    this.renderEmpty();
    app.store.on((reason) => {
      if (reason !== 'load') return;
      // Another part was opened: the reply in progress was about the one that was closed.
      if (this.agent.busy) this.stop('已停止：已打开另一个零件。');
      else if (!this.agent.messages.length) this.renderEmpty();
    });
  }

  focus() {
    requestAnimationFrame(() => this.focusInput());
  }

  /**
   * Focuses the message box, except on a touch screen: there that raises the
   * on-screen keyboard over the conversation and its suggestions, so it waits
   * for a tap in the box.
   */
  private focusInput() {
    if (!matchMedia?.('(pointer: coarse)').matches) this.input.focus();
  }

  /**
   * A button pressed from the keyboard that goes away with the press (idea, Try
   * again, Undo changes) hands focus to the message box, not to the page.
   * Tapped or clicked ones do not: on a phone that would open the keyboard.
   */
  private keepFocus(e: MouseEvent) {
    if (e.detail === 0) this.input.focus({ preventScroll: true });
  }

  /**
   * A message longer than the assistant takes (megabytes pasted by mistake)
   * would fail, and stay in the conversation failing every later message.
   * Returns false, saying so under the box, when the text is too long.
   */
  private checkLength(): boolean {
    const n = this.input.value.trim().length;
    const over = n > MAX_TEXT_CHARS;
    const text = over ? `此消息包含 ${n.toLocaleString('zh-CN')} 个字符；助手最多接受 ${MAX_TEXT_CHARS.toLocaleString('zh-CN')} 个字符。请缩短消息，或将长文本作为文件附加。` : '';
    if (this.limit.textContent !== text) this.limit.textContent = text;
    if (over) this.input.setAttribute('aria-invalid', 'true');
    else this.input.removeAttribute('aria-invalid');
    return !over;
  }

  private grow() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(200, this.input.scrollHeight)}px`;
  }

  private reset(e?: MouseEvent) {
    for (const it of [...this.pending]) this.removePending(it);
    for (const img of this.log.querySelectorAll<HTMLImageElement>('img.as-user-thumb')) URL.revokeObjectURL(img.src);
    this.agent.reset();
    this.turn = null;
    // A step still running finishes first; its message's run then squashes and clears busy.
    this.setBusy(this.agent.busy);
    if (this.agent.busy) this.status.textContent = '正在停止…';
    this.renderEmpty();
    // A key press on New chat goes on typing; a tap leaves the keyboard down.
    if (e?.detail === 0) this.input.focus();
    else this.focusInput();
  }

  private renderEmpty() {
    const hasFeatures = this.app.store.doc.features.length > 0;
    const ideas = hasFeatures
      ? ['解释此零件是如何构建的', '用 1 mm 圆角对所有外边缘倒圆角', '通过全局变量实现主要尺寸参数化', '如果使用铝合金，重量是多少？']
      : ['带四个 M5 安装孔和圆角的 100 × 60 × 8 mm 安装底板', '带法兰的衬套：40 mm 法兰，20 mm 轴径，10 mm 内孔', '80 × 50 × 30 mm 外壳盒，2 mm 壁厚，顶部开口', '正齿轮盘：直径 60 mm，12 齿，8 mm 内孔'];
    const chips = h('div', { class: 'as-ideas' }, ...ideas.map((t) => {
      const b = h('button', { class: 'as-idea', type: 'button' }, t);
      b.addEventListener('click', (e) => { this.input.value = t; this.grow(); this.keepFocus(e); void this.submit(); });
      return b;
    }));
    this.log.replaceChildren(h('div', { class: 'as-empty' },
      h('div', { class: 'as-empty-icon' }, icon('assistant', 22)),
      h('div', { class: 'as-empty-title' }, hasFeatures ? '修改或询问此零件' : '描述要设计的零件'),
      h('p', {}, '助手可以绘制草图、添加特征、编辑尺寸、测量并在模型中检查工作。在单条消息中所做的所有修改均为单个撤销步骤。'),
      chips));
    this.syncNewChat();
  }

  /** New chat has something to clear: a message, a notice, files waiting, or a reply still running. */
  private syncNewChat() {
    this.newChat.disabled = !this.agent.busy && !this.pending.length && !this.log.querySelector('.as-msg');
  }

  private setBusy(on: boolean) {
    this.syncNewChat();
    this.sendBtn.replaceChildren(icon(on ? 'stop' : 'send', 16));
    this.sendBtn.setAttribute('aria-label', on ? '停止' : '发送');
    this.sendBtn.classList.toggle('stop', on);
    this.el.classList.toggle('busy', on);
    if (!on) this.status.textContent = '';
  }

  /** The status line is a live region: it is only written when what it says changes. */
  private setStatus(text: string) {
    if (this.status.textContent !== text) this.status.textContent = text;
  }

  /** Stops the reply; a step already running finishes first (it cannot be interrupted). */
  private stop(reason = '已停止。') {
    this.agent.stop();
    this.stopReason = reason;
    if (this.turn) this.status.textContent = '正在停止…';
  }

  /** What the footer of a stopped reply says. */
  private stopReason = '已停止。';

  /** Whether 本地智能引擎 can be used. Signs in to Puter first when needed. */
  private async ready(): Promise<boolean> {
    if (this.chat || devChat()) return true;
    const sdk = puter() as unknown as { ai?: unknown } | null;
    if (!sdk?.ai) {
      this.notice('助手需要本地智能引擎，当前不可用。请检查网络连接并刷新页面。');
      return false;
    }
    if (env() === 'app' || cloudAvailable()) return true;
    // Sending is a click or Enter press, so the sign-in window opens without being blocked.
    this.sending = true;
    this.status.textContent = '正在连接本地智能引擎…';
    try { return await doSignIn(this.app); } finally { this.sending = false; this.status.textContent = ''; }
  }

  private notice(text: string, action?: HTMLElement) {
    this.log.querySelector('.as-empty')?.remove();
    this.log.append(h('div', { class: 'as-msg as-notice' }, h('p', {}, text), action ?? null));
    this.syncNewChat();
    this.scroll(true);
  }

  /** Whether the conversation follows new content (the user has not scrolled up from the bottom). */
  private stick = true;

  private scroll(force = false) {
    // Judged by where the user left it, not by the distance now: one piece of text
    // or a screenshot can add more than a screenful at once.
    if (force) this.stick = true;
    if (this.stick) this.log.scrollTop = this.log.scrollHeight;
  }

  async submit() {
    let text = this.input.value.trim();
    if ((!text && !this.pending.length) || this.agent.busy || this.sending) return;
    if (!this.checkLength()) { this.input.focus(); return; }
    if (!(await this.ready()) || this.agent.busy) return;
    // What the box holds now goes: it may have been edited while signing in.
    text = this.input.value.trim();
    if (!text && !this.pending.length) return;
    if (!this.checkLength()) return;
    let items: PendingFile[] = [];
    let files: Attachment[] = [];
    if (this.pending.length) {
      const waiting = this.pending;
      this.sending = true;
      this.status.textContent = '正在读取附加文件…';
      let read: (Attachment | null)[];
      try { read = await Promise.all(waiting.map((it) => it.ready)); } finally { this.sending = false; this.status.textContent = ''; }
      if (this.agent.busy) return;
      items = waiting.filter((it, i) => read[i] && this.pending.includes(it));
      files = items.map((it) => read[waiting.indexOf(it)]!);
      // Too much for one request: nothing goes, and the tray and the text stay.
      const tooLarge = attachmentsTooLarge(files);
      if (tooLarge) { toast({ kind: 'warning', message: tooLarge, timeout: 6000 }); return; }
      if (!this.checkLength()) return;
      this.pending = this.pending.filter((it) => !waiting.includes(it));
      for (const it of items) it.node.remove();
      this.syncTray();
      // What was typed while the files were read is part of the message.
      text = this.input.value.trim();
      if (!text && !files.length) return;
    }
    this.input.value = '';
    this.grow();
    this.checkLength();
    this.log.querySelector('.as-empty')?.remove();
    const bubble = h('div', { class: 'as-msg as-user' });
    if (items.length) bubble.append(sentFiles(items));
    if (text) bubble.append(h('div', { class: 'as-user-text' }, text));
    this.log.append(bubble);
    const label = text || items.map((it) => it.name).join(', ');
    void this.run(label, (on) => this.agent.send(text, on, { attachments: files }));
  }

  // ---------- attachments ----------

  /** Attaches files of the local drive. Folders and files the assistant cannot read are not read. */
  async attachDriveItems(items: unknown[]) {
    type Entry = PuterFSItem & { isDirectory?: boolean; fsentry_is_dir?: boolean };
    const entries = items.filter((it): it is Entry => !!it && typeof it === 'object' && typeof (it as Entry).path === 'string' && !!(it as Entry).path);
    const isDir = (it: Entry) => !!(it.is_dir || it.isDir || it.isDirectory || it.fsentry_is_dir);
    if (entries.some(isDir)) toast({ message: '无法附加文件夹。请改为附加其中的文件。', timeout: 5000 });
    const files: File[] = [];
    for (const it of entries) {
      if (isDir(it)) continue;
      const name = it.name || it.path.replace(/\/+$/, '').split('/').pop() || '文件';
      // Size not known yet counts as non-empty: what is read is checked again by attach.
      const problem = attachmentProblem({ name, size: typeof it.size === 'number' ? it.size : 1 });
      if (problem) { toast({ kind: 'warning', message: problem, timeout: 5000 }); continue; }
      try {
        const blob = it.read ? await it.read() : await puter()!.fs.read(it.path);
        files.push(new File([blob], name, { type: blob.type }));
      } catch {
        toast({ kind: 'warning', message: `无法读取 ${name}`, timeout: 5000 });
      }
    }
    if (files.length) this.attach(files);
  }

  /** Takes files for the next message. Each is read as it comes, so Send rarely waits. */
  attach(files: File[]) {
    let over = 0;
    for (const file of files) {
      if (this.pending.length >= MAX_ATTACHMENTS) { over++; continue; }
      const problem = attachmentProblem(file, this.pending.length);
      if (problem) { toast({ kind: 'warning', message: problem, timeout: 5000 }); continue; }
      const kind = attachmentKind(file)!;
      const item = { file, kind, name: file.name || (kind === 'image' ? '粘贴的图片' : '文件') } as PendingFile;
      item.ready = new Promise<Attachment>((resolve, reject) => this.readQueue.push({ item, resolve, reject })).catch((e) => {
        if (this.pending.includes(item)) {
          toast({ kind: 'warning', message: (e as Error)?.message || `无法读取 ${item.name}`, timeout: 5000 });
          this.removePending(item);
        }
        return null;
      });
      this.pending.push(item);
      this.tray.append(this.trayItem(item));
    }
    if (over) toast({ kind: 'info', message: `单条消息最多可附加 ${MAX_ATTACHMENTS} 个文件，因此略过了 ${over} 个文件。` });
    this.readNext();
    this.syncTray();
  }

  // Read a couple at a time: a photo decodes to full size before it is fitted.
  private readNext() {
    while (this.reading < 2 && this.readQueue.length) {
      const { item, resolve, reject } = this.readQueue.shift()!;
      if (!this.pending.includes(item)) { reject(null); continue; }
      this.reading++;
      readAttachment(item.file).then(resolve, reject).finally(() => { this.reading--; this.readNext(); });
    }
  }

  private trayItem(item: PendingFile): HTMLElement {
    const remove = h('button', { class: 'as-tray-remove', type: 'button', 'aria-label': `移除 ${item.name}`, title: '移除' }, icon('close', 12));
    remove.addEventListener('click', () => { this.removePending(item); this.input.focus(); });
    const preview = h('span', { class: 'as-tray-icon', 'aria-hidden': 'true' }, icon(item.kind === 'image' ? 'image' : 'file', 16));
    const spinner = h('span', { class: 'spinner', 'aria-hidden': 'true' });
    item.node = h('li', { class: 'as-tray-item reading', title: `${item.name} · ${formatSize(item.file.size)}`, 'aria-busy': 'true' },
      preview, spinner, h('span', { class: 'as-tray-name' }, item.name), remove);
    void item.ready.then((read) => {
      item.node.classList.remove('reading');
      item.node.removeAttribute('aria-busy');
      spinner.remove();
      if (!read || read.kind !== 'image' || !this.pending.includes(item)) return;
      try { item.url = URL.createObjectURL(read.thumb || item.file); } catch { return; }
      preview.replaceWith(h('img', { class: 'as-tray-thumb', src: item.url, alt: '' }));
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
    this.syncNewChat();
  }

  /** Files dropped anywhere on the panel are attached. */
  private bindDrop() {
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    let depth = 0;
    this.el.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; this.el.classList.add('as-drop'); });
    this.el.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    this.el.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; this.el.classList.remove('as-drop'); } });
    this.el.addEventListener('drop', (e) => {
      // Files dragged in from a Puter folder window: the SDK's own drop event, with drive entries in its detail.
      const items = (e as unknown as CustomEvent<{ items?: unknown }>).detail?.items;
      if (!e.dataTransfer && Array.isArray(items)) {
        e.preventDefault();
        e.stopPropagation();
        void this.attachDriveItems(items).then(() => this.input.focus());
        return;
      }
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      this.el.classList.remove('as-drop');
      this.attach([...(e.dataTransfer?.files ?? [])]);
      this.input.focus();
    });
  }

  private newTurn(): Turn {
    const body = h('div', { class: 'as-body' });
    const foot = h('div', { class: 'as-foot' });
    const el = h('div', { class: 'as-msg as-bot' }, body, foot);
    this.log.append(el);
    return { el, body, text: null, steps: null, stepEls: new Map(), foot, draft: null };
  }

  private async run(request: string, go: (on: Parameters<Agent['send']>[1]) => Promise<ExchangeResult>) {
    const store = this.app.store;
    const mark = store.undoMark;
    const label = `Assistant: ${short(request, 40)}`;
    const undoRun = { mark, label };
    this.undoRun = undoRun;
    // Only the latest reply can be asked again: a later message has moved the conversation on.
    for (const b of this.log.querySelectorAll('.as-retry')) b.remove();
    this.stopReason = 'Stopped.';
    const turn = this.newTurn();
    // The conversation is a live region: the reply is announced once it is complete,
    // not again on every streamed piece (the status line tells what is happening meanwhile).
    turn.el.setAttribute('aria-busy', 'true');
    this.turn = turn;
    this.setBusy(true);
    this.status.textContent = 'Thinking…';
    this.scroll(true);
    let res: ExchangeResult;
    try {
      res = await go((e) => {
        if (this.turn !== turn) return;
        if (e.type === 'text') {
          if (!turn.text) {
            turn.text = { el: h('div', { class: 'as-text' }), src: '' };
            turn.body.append(turn.text.el);
            turn.steps = null;
          }
          turn.text.src += e.text;
          turn.draft = turn.text.el;
          this.queueText(turn.text);
          this.setStatus('编写中…');
        } else if (e.type === 'step') {
          turn.draft = null;
          if (!turn.steps) {
            if (turn.text) this.renderText(turn.text);
            turn.steps = h('ol', { class: 'as-steps', 'aria-label': '步骤' });
            turn.body.append(turn.steps);
            turn.text = null;
          }
          this.renderStep(turn, turn.steps, e.step);
          if (this.status.textContent !== '正在停止…') this.setStatus(e.step.status === 'running' ? `${stepLabel(e.step.name, e.step.args)}…` : '思考中…');
        } else if (e.type === 'writing') {
          if (this.status.textContent !== '正在停止…') this.setStatus(`${stepLabel(e.name, {})}…`);
        } else if (e.type === 'round') {
          turn.draft = null;
          this.setStatus('思考中…');
        } else if (e.type === 'retry') {
          if (this.status.textContent !== '正在停止…') this.setStatus(`AI 服务未响应。正在重试（第 ${e.attempt} 次，共 ${MAX_RETRIES} 次）…`);
        } else if (e.type === 'filesRefused') {
          const names = e.names.join(', ');
          toast({ kind: 'warning', message: `AI 服务无法读取 ${names}，助手将在未包含${e.names.length === 1 ? '该文件' : '这些文件'}的情况下回答。`, timeout: 8000 });
        }
      });
    } catch (e) {
      res = { stopped: false, error: e as Error, steps: [] };
    }
    if (this.undoRun === undoRun) this.undoRun = null;
    // Everything this message changed becomes one undo step, even when New chat cut it off.
    let changed = false;
    if (store.undoMark > mark) {
      store.squash(mark, label);
      changed = true;
    }
    if (this.turn !== turn) {
      if (!this.turn) this.setBusy(false);
      return;
    }
    if (turn.text) this.renderText(turn.text);
    turn.el.removeAttribute('aria-busy');
    const after = store.undoMark;
    if (res.stopped) turn.foot.append(h('span', { class: 'as-meta' }, this.stopReason));
    if (res.error) {
      const retry = h('button', { class: 'btn small as-retry', type: 'button' }, '重试');
      const error = h('div', { class: 'as-error', role: 'alert' }, `助手无法回答：${res.error.message}`);
      retry.addEventListener('click', (e) => {
        if (this.agent.busy) return;
        this.keepFocus(e);
        // Undo changes stays: what this reply did before it failed is still its own undo step.
        error.remove();
        retry.remove();
        // Text the failure broke off never joined the conversation; the new reply replaces it.
        turn.draft?.remove();
        if (!turn.body.textContent?.trim() && !turn.body.querySelector('li, img') && !turn.foot.childElementCount) turn.el.remove();
        void this.run(request, (on) => this.agent.retry(on));
      });
      turn.foot.append(error, retry);
    }
    if (changed) {
      const undo = h('button', { class: 'btn small', type: 'button' }, icon('undo', 14), '撤销更改');
      undo.addEventListener('click', (e) => {
        if (store.undoMark !== after || store.undoLabel !== label) {
          toast({ kind: 'info', message: '零件此后已更改；请使用 编辑 > 撤销 进行后退。' });
          return;
        }
        this.keepFocus(e);
        this.app.commands.run('undo');
        undo.replaceWith(h('span', { class: 'as-meta' }, '已撤销更改。'));
      });
      turn.foot.prepend(undo);
    }
    this.turn = null;
    this.setBusy(false);
    this.scroll();
  }

  private pendingText: Segment | null = null;

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
    let el = turn.stepEls.get(step.id);
    if (!el) {
      el = h('li', { class: 'as-step' });
      turn.stepEls.set(step.id, el);
      list.append(el);
    }
    const mark = step.status === 'running' ? h('span', { class: 'spinner', 'aria-hidden': 'true' })
      : icon(step.status === 'done' ? 'check' : step.status === 'error' ? 'error' : 'close', 14);
    el.className = `as-step ${step.status}`;
    const label = h('span', { class: 'as-step-label' }, stepLabel(step.name, step.args));
    const children: (HTMLElement | SVGElement)[] = [h('span', { class: 'as-step-mark' }, mark), label];
    el.replaceChildren(...children);
    if (step.summary && step.status !== 'running') {
      el.title = step.summary;
      if (step.status === 'error') el.append(h('div', { class: 'as-step-detail' }, short(step.summary, 220)));
    }
    if (step.image) {
      const img = h('img', { class: 'as-shot', src: step.image, alt: '助手查看的内容' }) as HTMLImageElement;
      img.addEventListener('load', () => this.scroll(), { once: true });
      el.append(img);
    }
    this.scroll();
  }
}
