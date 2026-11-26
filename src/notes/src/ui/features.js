import { h, announce, escapeHtml, debounce } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { uid } from '../lib/ids.js';
import { shortcutLabel } from '../lib/platform.js';
import { toLocalInput } from '../lib/dates.js';
import { sanitizeHtml, safeUrl, htmlToText } from '../lib/sanitize.js';
import { htmlToMarkdown, markdownToHtml } from '../lib/markdown.js';
import { pageText, normalize } from '../data/store.js';
import { insertHtml, insertNode, setFontName } from '../editor/format.js';
import { mathSpan, renderMath, hydrate } from '../editor/embeds.js';
import { currentRange, selectRange, placeCaret } from '../editor/selection.js';
import { textToHtml } from '../editor/page-editor.js';
import { openDialog, confirmDialog } from './dialog.js';
import { openMenu } from './menu.js';
import { toast } from './toast.js';
import { TEMPLATES } from './templates.js';

void setFontName;

// ------------------------------------------------------------ tables

export function tablePicker(onPick) {
  const ROWS = 8;
  const COLS = 10;
  const label = h('div.table-picker-label', { 'aria-live': 'polite' }, '插入表格');
  const grid = h('div.table-picker', { role: 'group', 'aria-label': '表格大小' });
  let cur = [1, 1];
  const cells = [];
  const paint = (r, c) => {
    cur = [r, c];
    label.textContent = `${c} x ${r} 表格`;
    for (const cell of cells) cell.classList.toggle('on', Number(cell.dataset.r) <= r && Number(cell.dataset.c) <= c);
  };
  for (let r = 1; r <= ROWS; r++) {
    const row = h('div.table-picker-row');
    for (let c = 1; c <= COLS; c++) {
      const cell = h('button.table-picker-cell', { type: 'button', tabindex: r === 1 && c === 1 ? '0' : '-1', 'aria-label': `${c} 列 ${r} 行表格`, dataset: { r, c } });
      cell.addEventListener('pointerenter', () => paint(r, c));
      cell.addEventListener('focus', () => paint(r, c));
      cell.addEventListener('click', () => onPick(r, c));
      cells.push(cell);
      row.append(cell);
    }
    grid.append(row);
  }
  grid.addEventListener('keydown', (e) => {
    let [r, c] = cur;
    if (e.key === 'ArrowRight') c = Math.min(COLS, c + 1);
    else if (e.key === 'ArrowLeft') c = Math.max(1, c - 1);
    else if (e.key === 'ArrowDown') r = Math.min(ROWS, r + 1);
    else if (e.key === 'ArrowUp') r = Math.max(1, r - 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
    const target = cells.find((x) => Number(x.dataset.r) === r && Number(x.dataset.c) === c);
    cells.forEach((x) => (x.tabIndex = -1));
    target.tabIndex = 0;
    target.focus();
  });
  paint(1, 1);
  const wrap = h('div.table-picker-wrap', label, grid);
  setTimeout(() => cells[0].focus(), 0);
  return wrap;
}

export function insertTableDialog(app) {
  const rows = h('input.input', { type: 'number', min: '1', max: '100', value: '3', id: 'tbl-rows' });
  const cols = h('input.input', { type: 'number', min: '1', max: '30', value: '3', id: 'tbl-cols' });
  openDialog({
    title: '插入表格',
    width: 320,
    body: h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
      h('div.field', h('label.field-label', { for: 'tbl-cols' }, '列数'), cols),
      h('div.field', h('label.field-label', { for: 'tbl-rows' }, '行数'), rows),
    ),
    actions: [
      { label: '取消' },
      { label: '插入', primary: true, run: () => {
        const r = Math.max(1, Math.min(100, Number(rows.value) || 1));
        const c = Math.max(1, Math.min(30, Number(cols.value) || 1));
        setTimeout(() => app.insertTable(r, c));
      } },
    ],
  });
}

// ------------------------------------------------------------ files, pictures, screenshots

export function pickFiles(app, { accept = '', attach = false } = {}) {
  app.editor.ensureCaret();
  const range = currentRange()?.cloneRange();
  const input = h('input', { type: 'file', multiple: true, accept, style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.remove();
    if (!files.length) return;
    if (range) {
      app.editor.lastRange = range;
      app.editor.restoreRange();
    }
    try {
      for (const f of files) {
        if (!attach && f.type.startsWith('image/')) await app.editor.insertImage(f);
        else await app.editor.insertAttachment(f);
      }
      announce(files.length === 1 ? `已插入 ${files[0].name}` : `已插入 ${files.length} 个文件`);
    } catch (err) {
      app.reportError(err);
    }
  });
  document.body.append(input);
  input.click();
}

/**
 * Insert > Printout: attaches a PDF and puts a picture of each of its pages
 * on the page, like a printout. Rendering runs in pdf.js, loaded on demand.
 */
export function insertPrintout(app, file) {
  app.editor.ensureCaret();
  const range = currentRange()?.cloneRange();
  if (file) return printout(app, file, range);
  const input = h('input', { type: 'file', accept: 'application/pdf,.pdf', style: { display: 'none' } });
  input.addEventListener('change', () => {
    const picked = input.files[0];
    input.remove();
    if (picked) printout(app, picked, range);
  });
  document.body.append(input);
  input.click();
}

async function printout(app, file, range) {
  const dismiss = toast(`正在插入 ${file.name} 的打印样式...`, { duration: 60000 });
  let task = null;
  try {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    const count = Math.min(doc.numPages, 60);
    if (range) app.editor.lastRange = range;
    app.editor.restoreRange();
    await app.editor.insertAttachment(file);
    // The pages take a while to draw: if another page is opened meanwhile,
    // they must not land on it.
    const target = app.editor.page;
    const sectionId = app.store.findPage(target.id)?.section.id;
    const images = [];
    for (let i = 1; i <= count; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      if (app.editor.page !== target) throw new Error('页面在完成前已被关闭');
      const id = await app.store.saveAsset(blob, `printout-${i}.png`, { sectionId });
      images.push(`<p><img data-asset="${id}" alt="${escapeHtml(`第 ${i} 页 / 共 ${file.name}`)}" style="width: 640px"></p>`);
    }
    if (app.editor.page !== target) throw new Error('页面在完成前已被关闭');
    const el = app.editor.createOutlineAt(48, app.editor.nextFreeY(), '');
    const body = el.querySelector('.outline-body');
    body.innerHTML = sanitizeHtml(images.join(''));
    // Replacing the content dropped the caret to the top: put it after the last page.
    placeCaret(body);
    await hydrate(body, app.store);
    app.editor.dirty.add(el);
    app.editor.commit();
    app.editor.layout();
    dismiss();
    toast(doc.numPages > count ? `已插入前 ${count} 页 / 共 ${doc.numPages} 页` : `已插入 ${count} 页`);
  } catch (err) {
    dismiss();
    toast(`无法插入打印样式：${err?.message || '无法读取文件'}`, { kind: 'error' });
  } finally {
    // Frees the parsed document and ends its pdf.js worker.
    task?.destroy().catch(() => {});
  }
}

/** Inserts pictures or attachments picked from the user's local files. */
export async function pickFromCloud(app, { accept = '*/*', attach = false } = {}) {
  const picker = app.cloudPicker();
  if (!picker) return;
  app.editor.ensureCaret();
  const range = currentRange()?.cloneRange();
  let picked;
  try {
    picked = await picker({ multiple: true, accept });
  } catch {
    return;
  }
  const items = [].concat(picked || []);
  for (const item of items) {
    try {
      const blob = await item.read();
      const file = new File([blob], item.name || 'file', { type: blob.type || '' });
      if (range) app.editor.lastRange = range;
      app.editor.restoreRange();
      if (!attach && (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name))) await app.editor.insertImage(file);
      else await app.editor.insertAttachment(file);
    } catch (err) {
      toast(`无法插入 ${item.name || '文件'}：${err?.message || '读取失败'}`, { kind: 'error' });
    }
  }
}

export async function insertScreenshot(app) {
  app.editor.ensureCaret();
  const range = currentRange()?.cloneRange();
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch {
    return;
  }
  try {
    const video = h('video', { muted: true, playsInline: true });
    video.srcObject = stream;
    await video.play();
    await new Promise((r) => setTimeout(r, 250));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('无法截取屏幕');
    if (range) app.editor.lastRange = range;
    app.editor.restoreRange();
    await app.editor.insertImage(new File([blob], `屏幕截图 ${new Date().toLocaleString().replace(/[/:]/g, '-')}.png`, { type: 'image/png' }), { alt: '屏幕截图' });
  } catch (err) {
    toast(`无法插入屏幕截图：${err?.message || '无法截取屏幕'}`, { kind: 'error' });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/**
 * The type to open an attachment as in a new tab, or '' to download it.
 * The tab shows a blob: URL, which belongs to this app's origin: a file
 * that can run script there (HTML, SVG, XML) would run it with the app's
 * access to the account, so only types that can't are shown. Other text
 * (CSV, Markdown, code) is shown as plain text.
 */
export function viewType(type) {
  const t = String(type).toLowerCase().split(';')[0].trim();
  if (/^image\/(png|jpeg|gif|webp|bmp|avif|x-icon|vnd\.microsoft\.icon)$/.test(t) || /^(audio|video)\//.test(t) || t === 'application/pdf') return t;
  if (/^text\//.test(t) && !/html|xml|svg/.test(t)) return 'text/plain;charset=utf-8';
  return '';
}

export async function openAttachment(app, data) {
  try {
    const blob = await app.store.assetBlob(data.asset);
    if (!blob) {
      toast("未找到此附件。", { kind: 'error' });
      return;
    }
    const view = viewType(data.type || blob.type || '');
    const file = new Blob([blob], { type: view || data.type || blob.type || 'application/octet-stream' });
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: view ? null : data.name || 'attachment', target: '_blank', rel: 'noopener' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    app.reportError(err);
  }
}

// ------------------------------------------------------------ recording

export async function record(app, kind) {
  if (app.recorder) {
    app.recorder.stop();
    return;
  }
  app.editor.ensureCaret();
  const range = currentRange()?.cloneRange();
  // Taken before the permission prompt: a second click while it is open
  // must not start a second recording, whose microphone nothing could stop.
  const starting = { kind, stop() {} };
  app.recorder = starting;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { audio: true, video: true } : { audio: true });
  } catch {
    if (app.recorder === starting) app.recorder = null;
    toast(`请允许${kind === 'video' ? '摄像头和麦克风' : '麦克风'}权限以进行录制。`, { kind: 'error' });
    return;
  }
  const types = kind === 'video' ? ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  let mimeType = '';
  let rec;
  try {
    mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    if (app.recorder === starting) app.recorder = null;
    toast("此浏览器不支持在此录制。", { kind: 'error' });
    return;
  }
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let started = Date.now();
  let elapsed = 0;
  const time = h('span.rec-time', '0:00');
  const pauseBtn = h('button.icon-btn', { type: 'button', 'aria-label': '暂停录制' }, icon('pause', 16));
  const stopBtn = h('button.btn.small', { type: 'button' }, icon('stop', 14), '停止');
  const preview = kind === 'video' ? h('video', { muted: true, autoplay: true, playsInline: true, style: { width: '120px', borderRadius: '6px' } }) : null;
  if (preview) preview.srcObject = stream;
  const bar = h('div.recording-bar', { role: 'region', 'aria-label': `${kind === 'video' ? '视频' : '音频'}录制` }, preview, h('span.rec-dot'), h('span', kind === 'video' ? '正在录制视频' : '正在录制音频'), time, pauseBtn, stopBtn);
  app.canvasCol.append(bar);
  const tick = setInterval(() => {
    const ms = elapsed + (rec.state === 'recording' ? Date.now() - started : 0);
    const s = Math.floor(ms / 1000);
    time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 250);
  pauseBtn.addEventListener('click', () => {
    if (rec.state === 'recording') {
      rec.pause();
      elapsed += Date.now() - started;
      bar.classList.add('paused');
      pauseBtn.replaceChildren(icon('play', 16));
      pauseBtn.setAttribute('aria-label', '继续录制');
    } else {
      rec.resume();
      started = Date.now();
      bar.classList.remove('paused');
      pauseBtn.replaceChildren(icon('pause', 16));
      pauseBtn.setAttribute('aria-label', '暂停录制');
    }
  });
  const stop = () => {
    if (rec.state !== 'inactive') rec.stop();
  };
  stopBtn.addEventListener('click', stop);
  app.recorder = { kind, stop };
  rec.onstop = async () => {
    clearInterval(tick);
    stream.getTracks().forEach((t) => t.stop());
    bar.remove();
    app.recorder = null;
    app.ribbon.refresh();
    const type = rec.mimeType || mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm');
    const blob = new Blob(chunks, { type });
    if (!blob.size) return;
    const ext = type.includes('mp4') ? (kind === 'video' ? 'mp4' : 'm4a') : type.includes('ogg') ? 'ogg' : 'webm';
    const name = `${kind === 'video' ? '视频' : '音频'}录制 ${new Date().toLocaleString().replace(/[/:]/g, '-')}.${ext}`;
    if (range) app.editor.lastRange = range;
    app.editor.restoreRange();
    const file = new File([blob], name, { type });
    try {
      await app.editor.insertAttachment(file, kind);
      toast('录制内容已添加到页面');
    } catch (err) {
      // No page to put it on (its section locked, the page was deleted) or
      // the upload failed: the recording is still worth keeping.
      console.error(err);
      toast("无法将录制内容添加到页面。", { kind: 'error', duration: 120000, action: { label: '保存到设备', run: () => download(name, file) } });
    }
  };
  rec.start(1000);
  app.ribbon.refresh();
  stopBtn.focus();
  announce('录制已开始');
}

// ------------------------------------------------------------ links

/**
 * A typed address as a link: "example.com" gets https://, "sam@example.com"
 * mailto:. "localhost:3000" and "example.com:8080/docs" are a host and a
 * port, not a scheme named "localhost".
 */
export function completeAddress(href) {
  if (href.startsWith('#')) return href;
  if (/^[^\s/:@?#]+:\d{1,5}([/?#]|$)/.test(href) && !/^tel:/i.test(href)) return `https://${href}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(href) ? `mailto:${href}` : `https://${href}`;
}

export function linkDialog(app) {
  app.editor.ensureCaret();
  const range = currentRange()?.cloneRange();
  const startEl = range && (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement);
  const existing = startEl?.closest('a[href]');
  const selectedText = existing ? existing.textContent : range?.toString() || '';
  const text = h('input.input', { id: 'link-text', type: 'text', value: selectedText, autocomplete: 'off' });
  const address = h('input.input', { id: 'link-address', type: 'text', value: existing?.getAttribute('href') || '', placeholder: 'https://', autocomplete: 'off', spellcheck: 'false' });
  const error = h('p.field-error', { role: 'alert' });
  const filter = h('input.input', { type: 'search', placeholder: '查找页面或分区', 'aria-label': '查找页面或分区', autocomplete: 'off' });
  const list = h('div.link-targets', { role: 'listbox', 'aria-label': '页面和分区' });
  const renderTargets = () => {
    const q = normalize(filter.value.trim());
    const rows = [];
    for (const { notebook, section } of app.store.allSections()) {
      const secMatch = !q || normalize(section.name).includes(q);
      const pages = section.pages.filter((p) => !q || normalize(p.title || '无标题页面').includes(q));
      if (!secMatch && !pages.length) continue;
      rows.push(targetRow(`#section=${section.id}`, icon('folder', 14, undefined, { plain: true }), `${section.name}`, notebook.name));
      for (const p of pages.slice(0, 30)) rows.push(targetRow(`#page=${p.id}`, icon('fileText', 14, undefined, { plain: true }), p.title || '无标题页面', section.name, p.level));
      if (rows.length > 120) break;
    }
    list.replaceChildren(...(rows.length ? rows : [h('div.pane-empty', '无匹配项。')]));
  };
  const targetRow = (href, ic, label, sub, level = 0) => {
    const b = h('button.link-target', { type: 'button', role: 'option', 'aria-selected': String(address.value === href), style: { paddingLeft: `${10 + level * 14}px` } }, ic, h('span', label), h('span.link-target-sub', sub));
    b.addEventListener('click', () => {
      address.value = href;
      if (!text.value.trim()) text.value = label;
      for (const x of list.children) x.setAttribute?.('aria-selected', String(x === b));
    });
    return b;
  };
  filter.addEventListener('input', debounce(renderTargets, 100));
  renderTargets();
  const actions = [{ label: '取消' }];
  if (existing) actions.unshift({ label: '删除链接', run: () => {
    const outline = existing.closest('.outline');
    existing.replaceWith(document.createTextNode(existing.textContent));
    if (outline) app.editor.dirty.add(outline);
    app.editor.commit();
  } });
  actions.push({
    label: '确定',
    primary: true,
    run: () => {
      let href = address.value.trim();
      if (!href) {
        error.textContent = '请输入地址或选择一个页面。';
        address.focus();
        return false;
      }
      href = completeAddress(href);
      if (!safeUrl(href)) {
        error.textContent = "该地址不能用作链接。";
        address.focus();
        return false;
      }
      const label = text.value.trim() || href;
      if (existing) {
        existing.setAttribute('href', href);
        if (existing.textContent !== label) existing.textContent = label;
        const outline = existing.closest('.outline');
        if (outline) app.editor.dirty.add(outline);
        app.editor.commit();
        return true;
      }
      return () => {
        if (range) app.editor.lastRange = range;
        if (!app.editor.restoreRange()) app.editor.ensureCaret();
        const external = !href.startsWith('#');
        insertHtml(`<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a>&nbsp;`);
        app.editor.markActiveDirty();
      };
    },
  });
  openDialog({
    title: existing ? '编辑链接' : '插入链接',
    width: 520,
    body: h('div',
      h('div.field', h('label.field-label', { for: 'link-text' }, '要显示的文本'), text),
      h('div.field', h('label.field-label', { for: 'link-address' }, '地址'), address, error),
      h('div.field', h('span.field-label', '或在笔记本中选择一个位置'), filter, list),
    ),
    actions,
    initialFocus: selectedText ? address : text,
  });
}

// ------------------------------------------------------------ equations

const SNIPPETS = [
  ['x^{2}', '平方 / 上标'], ['x_{i}', '下标'], ['\\frac{a}{b}', '分式'], ['\\sqrt{x}', '平方根'], ['\\sqrt[n]{x}', '方根'],
  ['\\sum_{i=1}^{n}', '求和'], ['\\int_{a}^{b}', '积分'], ['\\lim_{x \\to \\infty}', '极限'], ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '矩阵'],
  ['\\alpha', 'Alpha'], ['\\beta', 'Beta'], ['\\pi', 'Pi'], ['\\theta', 'Theta'], ['\\infty', '无穷大'], ['\\pm', '正负号'], ['\\neq', '不等号'], ['\\leq', '小于等于'], ['\\geq', '大于等于'], ['\\times', '乘号'], ['\\rightarrow', '箭头'],
];

export function equationDialog(app, span) {
  if (!span) app.editor.ensureCaret();
  const range = currentRange()?.cloneRange();
  const input = h('textarea.input.mono', { id: 'eq-input', rows: 3, spellcheck: 'false', 'aria-describedby': 'eq-hint' });
  input.value = span?.dataset.tex || '';
  const error = h('p.field-error', { role: 'alert' });
  const preview = h('div.eq-preview', { 'aria-live': 'polite', 'aria-label': '预览' });
  const update = debounce(async () => {
    preview.innerHTML = input.value.trim() ? await renderMath(input.value, true) : '<span class="field-hint">此处将显示公式预览。</span>';
  }, 120);
  input.addEventListener('input', update);
  input.addEventListener('input', () => {
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  });
  update();
  const snippets = h('div.eq-snippets', { role: 'group', 'aria-label': '插入结构或符号' }, SNIPPETS.map(([tex, label]) => {
    const b = h('button.btn.small', { type: 'button', title: label, 'aria-label': label });
    renderMath(tex).then((html) => (b.innerHTML = html));
    b.addEventListener('click', () => {
      const s = input.selectionStart;
      input.setRangeText(tex, s, input.selectionEnd, 'end');
      input.focus();
      update();
    });
    return b;
  }));
  openDialog({
    title: span ? '编辑公式' : '插入公式',
    width: 560,
    body: h('div',
      h('div.field', h('label.field-label', { for: 'eq-input' }, '公式 (LaTeX)'), input, error, h('p.field-hint', { id: 'eq-hint' }, '例如：E = mc^2 或 \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}')),
      snippets,
      h('div.field', h('span.field-label', '预览'), preview),
    ),
    actions: [
      { label: '取消' },
      { label: span ? '更新' : '插入', primary: true, run: async () => {
        const tex = input.value.trim();
        if (!tex) {
          // Like the Link dialog: say what's missing and keep the dialog open.
          error.textContent = '请输入公式。';
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return false;
        }
        if (span) {
          span.dataset.tex = tex;
          span.setAttribute('aria-label', `公式: ${tex}`);
          span.innerHTML = await renderMath(tex);
          const outline = span.closest('.outline');
          if (outline) app.editor.dirty.add(outline);
          app.editor.commit();
          return;
        }
        return async () => {
          if (range) app.editor.lastRange = range;
          if (!app.editor.restoreRange()) app.editor.ensureCaret();
          insertNode(mathSpan(tex));
          const body = app.editor.activeOutline?.querySelector('.outline-body');
          if (body) await hydrate(body, app.store);
          app.editor.markActiveDirty();
        };
      } },
    ],
  });
}

// ------------------------------------------------------------ templates

export function templatesDialog(app) {
  const categories = [...new Set(TEMPLATES.map((t) => t.category))];
  let dlg = null;
  const body = h('div.templates', categories.map((cat) => h('section',
    h('h3.templates-cat', cat),
    h('div.templates-grid', TEMPLATES.filter((t) => t.category === cat).map((t) => {
      const b = h('button.template-card', { type: 'button' }, h('span.template-thumb', icon(t.id === 'blank' ? 'newPage' : 'template', 22)), h('span.template-name', t.label), h('span.template-desc', t.desc));
      b.addEventListener('click', () => {
        dlg.close();
        const built = t.build();
        app.newPage({ title: built.title, outlines: built.outlines.map((o) => ({ id: uid('o'), w: null, ...o, html: sanitizeHtml(o.html) })) });
        announce(`已添加${t.label}页面`);
      });
      return b;
    })),
  )));
  dlg = openDialog({ title: '页面模板', width: 640, body, actions: [{ label: '关闭' }] });
}

// ------------------------------------------------------------ move or copy

export function moveDialog(app, kind, id) {
  const store = app.store;
  const filter = h('input.input', { type: 'search', placeholder: '搜索', 'aria-label': '筛选位置', autocomplete: 'off' });
  const list = h('div.move-targets', { role: 'listbox', 'aria-label': kind === 'page' ? '分区' : '笔记本和分区组' });
  let target = null;
  const choose = (btn, t) => {
    target = t;
    for (const b of list.querySelectorAll('[role="option"]')) b.setAttribute('aria-selected', String(b === btn));
  };
  const option = (label, depth, t, ic, color) => {
    const b = h('button.link-target', { type: 'button', role: 'option', 'aria-selected': 'false', style: { paddingLeft: `${10 + depth * 16}px` } }, color ? h('span.section-tab', { style: { '--sec-color': color, height: '16px', margin: 0 } }) : icon(ic, 14, undefined, { plain: true }), h('span', label));
    b.addEventListener('click', () => choose(b, t));
    b.addEventListener('dblclick', () => {
      choose(b, t);
      dlg.dialog.querySelector('.dialog-actions .primary')?.click();
    });
    return b;
  };
  const render = () => {
    const q = normalize(filter.value.trim());
    const rows = [];
    for (const nb of store.notebooks) {
      const nbRow = option(nb.name, 0, kind === 'page' ? null : { notebookId: nb.id, parentId: null }, 'notebook');
      if (kind === 'page') nbRow.disabled = true;
      const sub = [];
      const walk = (nodes, depth) => {
        for (const n of nodes) {
          if (n.id === id) continue;
          if (n.type === 'group') {
            if (kind !== 'page' && (!q || normalize(n.name).includes(q))) sub.push(option(n.name, depth, { notebookId: nb.id, parentId: n.id }, 'sectionGroup'));
            else if (kind === 'page') sub.push(Object.assign(option(n.name, depth, null, 'sectionGroup'), { disabled: true }));
            walk(n.children, depth + 1);
          } else if (kind === 'page' && (!q || normalize(n.name).includes(q) || normalize(nb.name).includes(q))) {
            if (n.locked && !app.isUnlocked(n.id)) continue;
            sub.push(option(n.name, depth, { sectionId: n.id }, null, app.nav.colorOf(n.color)));
          }
        }
      };
      walk(nb.sections, 1);
      if (kind !== 'page' && q && !normalize(nb.name).includes(q) && !sub.length) continue;
      if (kind === 'page' && !sub.some((s) => !s.disabled)) continue;
      rows.push(nbRow, ...sub);
    }
    list.replaceChildren(...(rows.length ? rows : [h('div.pane-empty', '无匹配的位置。')]));
  };
  filter.addEventListener('input', debounce(render, 100));
  render();
  const name = kind === 'page' ? store.findPage(id)?.meta.title || '无标题页面' : store.findNode(id)?.node.name;
  const copyFailed = (err) => {
    console.error(err);
    toast(`无法复制“${name}”。请检查网络后重试。`, { kind: 'error' });
    return 'failed';
  };
  const act = async (copy) => {
    if (!target) {
      toast(kind === 'page' ? '请选择一个分区。' : '请选择笔记本或分区组。');
      return false;
    }
    if (kind === 'page') {
      if (copy) {
        if ((await store.copyPage(id, { sectionId: target.sectionId }).catch(copyFailed)) === 'failed') return false;
        toast(`已复制“${name}”`);
      } else {
        store.movePage(id, { sectionId: target.sectionId, level: 0 });
        app.openPage(id);
        toast(`已移动“${name}”`);
      }
    } else if (copy) {
      const done = await store.copySection(id, target).catch(copyFailed);
      if (done === 'failed') return false;
      if (!done) {
        toast("无法复制该分区。", { kind: 'error' });
        return false;
      }
      toast(`已复制“${name}”`);
    } else {
      if (!store.moveNode(id, target)) {
        toast("不能将分区组移动到自身内部。");
        return false;
      }
      app.state.notebookId = target.notebookId;
      app.ensureSelection();
      toast(`已移动“${name}”`);
    }
    return true;
  };
  const dlg = openDialog({
    title: kind === 'page' ? '移动或复制页面' : '移动或复制分区',
    width: 460,
    body: h('div', h('p.dialog-message', `选择“${name}”的目标位置。`), filter, list),
    actions: [{ label: '取消' }, kind === 'group' ? null : { label: '复制', run: () => act(true) }, { label: '移动', primary: true, run: () => act(false) }].filter(Boolean),
  });
}

// ------------------------------------------------------------ page date

export function pageDateDialog(app) {
  const page = app.editor.page;
  if (!page || app.editor.readOnly) return;
  const input = h('input.input', { id: 'page-date', type: 'datetime-local', value: toLocalInput(page.created) });
  openDialog({
    title: '修改页面日期和时间',
    width: 360,
    body: h('div.field', h('label.field-label', { for: 'page-date' }, '日期和时间'), input),
    actions: [
      { label: '取消' },
      { label: '确定', primary: true, run: () => {
        const d = new Date(input.value);
        if (Number.isNaN(d.getTime())) return false;
        page.created = d.toISOString();
        const f = app.store.findPage(page.id);
        if (f) f.meta.created = page.created;
        app.editor.updateDate();
        app.editor.changed();
      } },
    ],
  });
}

// ------------------------------------------------------------ deleted notes

export function deletedNotesDialog(app) {
  const store = app.store;
  const list = h('div.trash-list');
  const purgeFailed = (what) => (err) => {
    console.error(err);
    toast(`无法${what}。请检查网络后重试。`, { kind: 'error' });
  };
  let dlg = null;
  const render = () => {
    list.setAttribute('role', store.trash.length ? 'list' : 'presentation');
    if (!store.trash.length) {
      list.replaceChildren(h('div.empty-state', icon('trash', 28), h('p', '已删除笔记为空。'), h('p.field-hint', '已删除的页面、分区和笔记本将在此保留 60 天。')));
      return;
    }
    list.replaceChildren(...store.trash.map((t) => {
      const name = t.kind === 'page' ? t.pages[0]?.title || (t.sealedPages ? '受保护分区中的页面' : '无标题页面') : t.kind === 'notebook' ? t.notebook.name : t.node.name;
      const where = t.kind === 'page' ? `来自 ${t.sectionName || '分区'} 的页面${t.pages.length > 1 ? ` 及 ${t.pages.length - 1} 个子页` : ''}` : t.kind === 'notebook' ? '笔记本' : t.kind === 'group' ? '分区组' : `包含 ${t.node.pages.length} 个页面的分区`;
      const days = Math.max(0, 60 - Math.floor((Date.now() - Date.parse(t.deletedAt)) / 86400000));
      return h('div.trash-item', { role: 'listitem' },
        icon(t.kind === 'page' ? 'fileText' : t.kind === 'notebook' ? 'notebook' : 'folder', 18),
        h('div.trash-text', h('div.result-title', name), h('div.result-path', `${where} · 删除于 ${new Date(t.deletedAt).toLocaleDateString()} · 剩余 ${days} 天`)),
        h('button.btn.small', { type: 'button', onclick: async () => { if (await app.restoreTrash(t.id)) { render(); toast(`已恢复“${name}”`); } } }, '恢复'),
        h('button.btn.small.danger', { type: 'button', 'aria-label': `永久删除“${name}”`, onclick: async () => {
          if (!(await confirmDialog({ title: '永久删除？', message: `“${name}”将被彻底永久删除，无法撤销。`, okLabel: '删除', danger: true }))) return;
          await store.purge(t.id).catch(purgeFailed(`永久删除“${name}”`));
          render();
        } }, '删除'),
      );
    }));
  };
  render();
  dlg = openDialog({
    title: '已删除笔记',
    width: 620,
    body: list,
    actions: [
      { label: '清空已删除笔记', danger: true, run: async () => {
        if (!store.trash.length) return false;
        if (!(await confirmDialog({ title: '清空已删除笔记？', message: '已删除笔记中的所有内容将被彻底永久删除。', okLabel: '清空', danger: true }))) return false;
        await store.emptyTrash().catch(purgeFailed('清空已删除笔记'));
        render();
        return false;
      } },
      { label: '关闭', primary: true },
    ],
  });
  void dlg;
}

// ------------------------------------------------------------ immersive reader

export function openReader(app) {
  const page = app.editor.page;
  if (!page) return;
  app.editor.flush();
  const settings = { size: 26, spacing: false, font: 'sans', theme: 'light', focus: 0, rate: 1 };
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem('notes:reader') || '{}'));
  } catch {
    /* defaults */
  }
  const save = () => {
    try {
      localStorage.setItem('notes:reader', JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  };
  const content = h('article.reader-content', { tabindex: '0', 'aria-label': '页面文本' });
  content.append(h('h1', page.title || '无标题页面'));
  const ordered = [...page.outlines].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const o of ordered) {
    for (const para of htmlToText(o.html).split('\n')) if (para.trim()) content.append(h('p', para));
  }
  const overlay = h('div.reader', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '沉浸式阅读器' });
  const apply = () => {
    overlay.dataset.theme = settings.theme;
    overlay.dataset.font = settings.font;
    overlay.classList.toggle('wide-spacing', settings.spacing);
    overlay.style.setProperty('--reader-size', `${settings.size}px`);
    overlay.dataset.focus = String(settings.focus);
    save();
  };
  const synth = window.speechSynthesis;
  let speaking = false;
  let reading = 0;
  let readingAt = 0;
  const playBtn = h('button.reader-play', { type: 'button', 'aria-label': '朗读' }, icon('play', 26));
  const stopSpeech = () => {
    // Ends this reading for good: a cancelled utterance may still report
    // its end, which must not read on.
    reading++;
    synth?.cancel();
    speaking = false;
    playBtn.replaceChildren(icon('play', 26));
    playBtn.setAttribute('aria-label', '朗读');
    if (globalThis.CSS?.highlights) CSS.highlights.delete('nt-read');
  };
  const speak = (from = 0) => {
    if (!synth) {
      toast('此浏览器不支持朗读功能。');
      return;
    }
    if (speaking) {
      if (synth.paused) {
        synth.resume();
        playBtn.replaceChildren(icon('pause', 26));
      } else {
        synth.pause();
        playBtn.replaceChildren(icon('play', 26));
      }
      return;
    }
    const paras = [...content.children];
    let i = Number.isInteger(from) ? from : 0;
    const mine = ++reading;
    speaking = true;
    playBtn.replaceChildren(icon('pause', 26));
    playBtn.setAttribute('aria-label', '暂停朗读');
    const next = () => {
      if (mine !== reading) return;
      if (!speaking || i >= paras.length) return stopSpeech();
      readingAt = i;
      const el = paras[i++];
      const text = el.textContent;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = settings.rate;
      u.onboundary = (e) => {
        if (e.name !== 'word' || !globalThis.CSS?.highlights || !el.firstChild) return;
        const len = e.charLength || (text.slice(e.charIndex).match(/^\S+/)?.[0].length ?? 1);
        const r = document.createRange();
        r.setStart(el.firstChild, Math.min(e.charIndex, text.length));
        r.setEnd(el.firstChild, Math.min(e.charIndex + len, text.length));
        CSS.highlights.set('nt-read', new Highlight(r));
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      u.onend = next;
      synth.speak(u);
    };
    next();
  };
  playBtn.addEventListener('click', () => speak());
  const close = () => {
    stopSpeech();
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    app.reader = null;
    app.editor.restoreRange() || app.editor.scroller.focus();
  };
  app.reader = { close };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === ' ' && e.target === content) {
      e.preventDefault();
      speak();
    } else if (e.key === 'Tab') {
      const f = [...overlay.querySelectorAll('button, select, input, [tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent !== null);
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        f.at(-1).focus();
      } else if (!e.shiftKey && i === f.length - 1) {
        e.preventDefault();
        f[0].focus();
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  const sizeInput = h('input', { type: 'range', min: '16', max: '56', step: '2', value: String(settings.size), 'aria-label': '文字大小' });
  sizeInput.addEventListener('input', () => {
    settings.size = Number(sizeInput.value);
    apply();
  });
  const fontSel = h('select.select', { 'aria-label': '字体' }, [['sans', '无衬线'], ['serif', '衬线'], ['mono', '等宽']].map(([v, l]) => h('option', { value: v, selected: settings.font === v }, l)));
  fontSel.addEventListener('change', () => {
    settings.font = fontSel.value;
    apply();
  });
  const themeSel = h('select.select', { 'aria-label': '页面主题' }, [['light', '浅色'], ['sepia', '羊皮纸'], ['dark', '深色']].map(([v, l]) => h('option', { value: v, selected: settings.theme === v }, l)));
  themeSel.addEventListener('change', () => {
    settings.theme = themeSel.value;
    apply();
  });
  const spacing = h('input', { type: 'checkbox', checked: settings.spacing });
  spacing.addEventListener('change', () => {
    settings.spacing = spacing.checked;
    apply();
  });
  const rateSel = h('select.select', { 'aria-label': '语速' }, [[0.75, '慢速'], [1, '正常'], [1.25, '快速'], [1.5, '较快']].map(([v, l]) => h('option', { value: String(v), selected: settings.rate === v }, l)));
  rateSel.addEventListener('change', () => {
    settings.rate = Number(rateSel.value);
    if (speaking) {
      // Go on from the paragraph being read, at the new speed.
      const at = readingAt;
      stopSpeech();
      speak(at);
    }
    apply();
  });
  const toolbar = h('div.reader-bar',
    h('span.reader-title', '沉浸式阅读器'),
    h('label.reader-opt', icon('fontSize', 16), sizeInput),
    h('label.reader-opt', fontSel),
    h('label.reader-opt', themeSel),
    h('label.reader-opt.check-row', spacing, '宽字符间距'),
    h('label.reader-opt', '语速', rateSel),
    h('button.icon-btn', { type: 'button', 'aria-label': '关闭沉浸式阅读器', onclick: close }, icon('x', 20)),
  );
  overlay.append(toolbar, h('div.reader-scroll', content), h('div.reader-foot', playBtn));
  document.body.append(overlay);
  apply();
  content.focus();
}

// ------------------------------------------------------------ email, export, import

export function emailPage(app) {
  const page = app.editor.page;
  if (!page) return;
  app.editor.flush();
  const { url, truncated } = mailtoForPage(page);
  if (truncated) toast('此页面内容过长，邮件中仅包含开头部分。若要发送完整内容，请导出页面。', { duration: 8000 });
  window.location.href = url;
}

// Mail apps and browsers drop or refuse mailto: links much longer than
// about 2,000 characters (counted after URL encoding).
const MAILTO_MAX = 2000;

/** A mailto: link for a page, its text cut to fit; truncated says whether it was. */
export function mailtoForPage(page) {
  const title = page.title || '';
  const subject = encodeURIComponent(Array.from(title || '笔记页面').slice(0, 200).join(''));
  const head = `mailto:?subject=${subject}&body=`;
  const body = pageText(page).replace(title, '').trim();
  const fits = (text) => head.length + encodeURIComponent(text).length <= MAILTO_MAX;
  if (fits(body)) return { url: head + encodeURIComponent(body), truncated: false };
  // Cut by code points so an emoji is never split into a lone surrogate.
  const chars = Array.from(body);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(`${chars.slice(0, mid).join('')}\u2026`)) lo = mid;
    else hi = mid - 1;
  }
  return { url: head + encodeURIComponent(`${chars.slice(0, lo).join('').trimEnd()}\u2026`), truncated: true };
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function safeName(s) {
  return (s || '无标题页面').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim() || '无标题页面';
}

async function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

/** A page's outlines with images inlined as data URLs, for export and sharing. */
async function inlineOutlines(app, page, { maxImage = 8 * 1024 * 1024, keepTags = false } = {}) {
  const out = [];
  for (const o of [...page.outlines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const div = document.createElement('div');
    div.innerHTML = sanitizeHtml(o.html);
    for (const img of div.querySelectorAll('img[data-asset]')) {
      const blob = await app.store.assetBlob(img.dataset.asset).catch(() => null);
      if (blob && blob.size <= maxImage) {
        const url = await blobToDataUrl(blob instanceof Blob ? blob : new Blob([blob]));
        if (url) img.setAttribute('src', url);
      }
      img.removeAttribute('data-asset');
    }
    for (const f of div.querySelectorAll('.nt-file')) f.replaceWith(document.createTextNode(`[${f.dataset.name || 'attachment'}]`));
    for (const m of div.querySelectorAll('.nt-math')) {
      if (keepTags) continue;
      m.innerHTML = await renderMath(m.dataset.tex);
    }
    if (!keepTags) {
      for (const t of div.querySelectorAll('.nt-tag')) {
        const label = t.dataset.done !== undefined ? (t.dataset.done === 'true' ? '[x] ' : '[ ] ') : '';
        t.replaceWith(document.createTextNode(label));
      }
    }
    out.push({ x: o.x, y: o.y, w: o.w, html: div.innerHTML });
  }
  return out;
}

async function inlinePageHtml(app, page, opts) {
  return (await inlineOutlines(app, page, opts)).map((o) => `<div class="outline">${o.html}</div>`).join('\n');
}

const EXPORT_CSS = 'body{font:11pt/1.4 -apple-system,"Segoe UI",system-ui,sans-serif;color:#1b1b1b;max-width:820px;margin:40px auto;padding:0 24px}h1.page-title{font-weight:300;font-size:22pt;border-bottom:1px solid #aaa;padding-bottom:4px;margin-bottom:4px}.meta{color:#666;font-size:9.5pt;margin-bottom:24px}.outline{margin:0 0 18px}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:2px 6px;vertical-align:top}img{max-width:100%;height:auto}blockquote{border-left:3px solid #bbb;margin:0;padding-left:10px;color:#555;font-style:italic}pre{background:#f4f4f4;padding:4px 6px;white-space:pre-wrap}hr.page-break{border:0;border-top:2px solid #ddd;margin:40px 0}';

async function pageHtmlDocument(app, pages) {
  const sections = [];
  for (const page of pages) {
    sections.push(`<article><h1 class="page-title">${escapeHtml(page.title || '无标题页面')}</h1><div class="meta">${escapeHtml(new Date(page.created).toLocaleString())}</div>${await inlinePageHtml(app, page)}</article>`);
  }
  const title = pages.length === 1 ? pages[0].title || '无标题页面' : '笔记导出';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${EXPORT_CSS}</style></head><body>${sections.join('<hr class="page-break">')}</body></html>`;
}

export async function exportPage(app, format) {
  const page = app.editor.page;
  if (!page) return;
  app.editor.flush();
  const name = safeName(page.title);
  if (format === 'txt') return download(`${name}.txt`, new Blob([pageText(page)], { type: 'text/plain' }));
  if (format === 'md') {
    const md = [`# ${page.title || '无标题页面'}`, ...[...page.outlines].sort((a, b) => a.y - b.y || a.x - b.x).map((o) => htmlToMarkdown(o.html)).filter((md) => md.trim())].join('\n\n');
    return download(`${name}.md`, new Blob([md + '\n'], { type: 'text/markdown' }));
  }
  const html = await pageHtmlDocument(app, [page]);
  download(`${name}.html`, new Blob([html], { type: 'text/html' }));
}

export async function exportSection(app, sectionId) {
  const section = app.store.section(sectionId);
  if (!section) return;
  // A locked section's page list is sealed: unlock it rather than export
  // an empty file.
  if (section.locked && !app.store.keys.has(section.id) && !(await unlockSection(app, section))) return;
  app.editor.flush();
  const pages = [];
  for (const m of section.pages) pages.push(await app.store.loadPage(m.id));
  const html = await pageHtmlDocument(app, pages);
  download(`${safeName(section.name)}.html`, new Blob([html], { type: 'text/html' }));
}

export async function exportNotebook(app, notebookId) {
  const nb = app.store.notebook(notebookId);
  if (!nb) return;
  const protectedSections = [...app.store.sectionsOf(nb)].filter((s) => s.locked);
  const locked = protectedSections.filter((s) => !app.store.keys.has(s.id));
  const open = protectedSections.filter((s) => app.store.keys.has(s.id));
  if (protectedSections.length) {
    const parts = [];
    if (locked.length) parts.push(`锁定分区未包含在内: ${locked.map((s) => `"${s.name}"`).join(', ')}。请先解锁以包含它们。`);
    if (open.length) parts.push(`已解锁的受保护分区 (${open.map((s) => `"${s.name}"`).join(', ')}) 在备份文件中未经加密保存。`);
    if (!(await confirmDialog({ title: '导出笔记本备份？', message: parts.join(' '), okLabel: '导出' }))) return;
  }
  app.editor.flush();
  toast('正在准备备份...');
  const pages = {};
  const assets = {};
  for (const section of app.store.sectionsOf(nb)) {
    for (const m of section.pages) {
      const page = await app.store.loadPage(m.id);
      pages[m.id] = page;
      for (const o of page.outlines) {
        for (const match of o.html.matchAll(/data-asset="([^"]+)"/g)) {
          if (assets[match[1]]) continue;
          const blob = await app.store.assetBlob(match[1]).catch(() => null);
          if (blob) assets[match[1]] = await blobToDataUrl(blob instanceof Blob ? blob : new Blob([blob]));
        }
      }
    }
  }
  // Locked sections stay out; unlocked protected ones go in as plain sections.
  const strip = (nodes) => nodes.flatMap((n) => {
    if (n.type === 'group') return [{ ...n, children: strip(n.children) }];
    if (n.locked && !app.store.keys.has(n.id)) return [];
    const { locked, sealed, ...rest } = n;
    void locked;
    void sealed;
    return [rest];
  });
  const backup = { format: 'notes-backup', v: 1, exported: new Date().toISOString(), notebook: { ...nb, sections: strip(nb.sections) }, pages, assets };
  download(`${safeName(nb.name)}.notes.json`, new Blob([JSON.stringify(backup)], { type: 'application/json' }));
}

/**
 * A Markdown file's title: its first line when that is a level 1 heading,
 * which then leaves the body. A file that opens with "## Agenda" or "#todo"
 * has none (a "# " heading further down is not the page's title).
 */
export function markdownTitle(text) {
  const m = String(text).match(/^\s*#[ \t]+(.+?)[ \t]*(?:\r?\n|$)/);
  if (!m) return { title: '', body: text };
  return { title: m[1].replace(/\\([\\`*_[\]~#+\-.>)])/g, '$1').trim(), body: text.slice(m[0].length) };
}

/** Rebuilds a notebook from a backup with fresh ids so it never collides. */
export async function importBackup(app, backup) {
  const store = app.store;
  const idMap = new Map();
  const fresh = (old, prefix) => {
    if (!idMap.has(old)) idMap.set(old, uid(prefix));
    return idMap.get(old);
  };
  // The structure is read first: a file that isn't a notebook backup after
  // all is refused before anything is uploaded or an empty notebook made.
  const cloneNodes = (nodes) => nodes.map((n) => (n.type === 'group'
    ? { ...n, id: fresh(n.id, 'g'), children: cloneNodes(n.children || []) }
    : { ...n, id: fresh(n.id, 's'), locked: undefined, pages: (n.pages || []).map((p) => ({ ...p, id: fresh(p.id, 'p') })) }));
  const sections = cloneNodes(backup.notebook.sections || []);
  const assetMap = new Map();
  let failed = 0;
  for (const [oldId, dataUrl] of Object.entries(backup.assets || {})) {
    let blob;
    try {
      blob = await (await fetch(dataUrl)).blob();
    } catch {
      continue; // a broken entry in the file
    }
    try {
      const ext = oldId.replace(/\.sealed$/, '').split('.').pop();
      assetMap.set(oldId, await store.saveAsset(blob, `asset.${ext}`));
    } catch (err) {
      console.error(err);
      failed++;
    }
  }
  if (failed) toast(`${failed} 个图片或文件无法导入。请检查网络并重新导入备份。`, { kind: 'error' });
  const nb = store.createNotebook(store.notebooks.some((n) => n.name === backup.notebook.name) ? `${backup.notebook.name} (已导入)` : backup.notebook.name, { color: backup.notebook.color, silent: true });
  nb.sections = sections;
  for (const [oldId, page] of Object.entries(backup.pages || {})) {
    const id = fresh(oldId, 'p');
    // The copy's links go to the copy's pages and sections, and it is not
    // shared: the read-only link belongs to the page it was made from.
    const { published, ...rest } = page;
    const copy = { ...rest, id, outlines: (page.outlines || []).map((o) => ({ ...o, html: sanitizeHtml(String(o.html || '').replace(/data-asset="([^"]+)"/g, (m, a) => `data-asset="${assetMap.get(a) || a}"`).replace(/#(page|section)=([\w-]+)/g, (m, kind, p) => `#${kind}=${idMap.get(p) || p}`)) })) };
    store.pages.set(id, copy);
    store.schedule(`pages/${id}.json`, () => store.pages.get(id), 0);
  }
  store.touchNotebook(nb);
  store.emit('change', { type: 'notebook', id: nb.id });
  return nb;
}

/** The files Import takes, from this device or from local storage: Markdown, HTML, text and notebook backups. */
const IMPORT_EXTENSIONS = '.md,.markdown,.txt,.html,.htm,.json';
export const isImportable = (name) => /\.(md|markdown|txt|html?|json)$/i.test(String(name || ''));

/** Import > From This Device. */
export function importFiles(app) {
  const input = h('input', { type: 'file', multiple: true, accept: `${IMPORT_EXTENSIONS},text/markdown,text/plain,text/html,application/json`, style: { display: 'none' } });
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.remove();
    importFileList(app, files);
  });
  document.body.append(input);
  input.click();
}

/**
 * Makes each file a page of the current section (a notebook backup becomes a
 * notebook of its own) and opens the first page. Returns how many were imported.
 */
export async function importFileList(app, files) {
  let firstPage = null;
  let count = 0;
  // A locked section is unlocked once for the whole batch, as New Page asks.
  const section = app.store.section(app.state.sectionId);
  if (section && app.store.isLocked(section.id) && files.some((f) => !/\.json$/i.test(f.name))) await unlockSection(app, section);
  for (const file of files) {
    try {
      const text = await file.text();
      if (/\.json$/i.test(file.name)) {
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          /* refused below */
        }
        if (data?.format !== 'notes-backup') throw new Error(`${file.name} 不是笔记本备份文件`);
        const nb = await importBackup(app, data);
        app.selectNotebook(nb.id);
        count++;
        continue;
      }
      let html;
      let title = file.name.replace(/\.[^.]+$/, '');
      if (/\.html?$/i.test(file.name)) {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        title = doc.querySelector('title')?.textContent?.trim() || doc.querySelector('h1')?.textContent?.trim() || title;
        html = sanitizeHtml(doc.body?.innerHTML || '');
      } else if (/\.(md|markdown)$/i.test(file.name)) {
        const { title: heading, body } = markdownTitle(text);
        if (heading) title = heading;
        html = markdownToHtml(body);
      } else html = sanitizeHtml(textToHtml(text));
      if (!app.store.section(app.state.sectionId)) app.newSection();
      const meta = app.store.createPage(app.state.sectionId, { title, outlines: [{ id: uid('o'), x: 48, y: 140, w: 720, html }] });
      firstPage ||= meta.id;
      count++;
    } catch (err) {
      toast(`无法导入 ${file.name}：${err.message}`, { kind: 'error' });
    }
  }
  if (firstPage) app.openPage(firstPage);
  if (count) toast(`已导入 ${count} 个文件`);
  return count;
}

// ------------------------------------------------------------ local files

const isDriveDir = (it) => Boolean(it.is_dir || it.isDir || it.isDirectory || it.fsentry_is_dir);
const driveName = (it) => it.name || it.path.replace(/\/+$/, '').split('/').pop();
const PICTURE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

/**
 * The files among entries of the local drive (launch items, picked files or
 * a drop from a desktop folder). Folders are left out, with a word when there
 * is nothing else.
 */
function driveFiles(given) {
  const all = [].concat(given || []).filter((it) => it && typeof it === 'object');
  const files = all.filter((it) => typeof it.path === 'string' && it.path && !isDriveDir(it));
  if (!files.length && all.some(isDriveDir)) toast("无法打开文件夹。请改为打开其中的文件。", { kind: 'error' });
  return files;
}

/** A drive entry's contents as a File. Picture types the drive leaves out come from the name, as the page shows pictures by type. */
export async function readDriveFile(it, name = driveName(it)) {
  // Launch items and picked files can read themselves; dropped entries are plain records.
  const blob = typeof it.read === 'function' ? await it.read() : await puter.fs.read(it.path);
  const type = blob.type || PICTURE_TYPES[name.split('.').pop().toLowerCase()] || '';
  return new File([blob], name, { type });
}

const readError = (err) => err?.message || err?.error?.message || '无法读取文件';

/**
 * Opens local files in Notes: double-click, Open with, Import > From Local
 * and a drop outside the page. Notes keeps its notebooks itself, so a file
 * is imported as File > Import does it.
 */
export async function openDriveItems(app, given) {
  const files = [];
  for (const it of driveFiles(given)) {
    const name = driveName(it);
    if (!isImportable(name)) {
      toast(`${name} 无法在笔记中打开。请打开 Markdown、HTML、文本文件或笔记本备份。`, { kind: 'error' });
      continue;
    }
    try {
      files.push(await readDriveFile(it, name));
    } catch (err) {
      toast(`无法打开 ${name}：${readError(err)}`, { kind: 'error' });
    }
  }
  return files.length ? importFileList(app, files) : 0;
}

/**
 * The files Notes was launched with. Inside Puter the launch stays in the
 * window's address, so a reload hands the same files over again: those were
 * imported already, and are not imported twice.
 */
export async function openLaunchItems(app, given) {
  const KEY = 'notes:launched';
  const keyOf = (it) => `${location.search}|${it?.uid || it?.id || it?.path}`;
  let seen = [];
  try {
    seen = JSON.parse(sessionStorage.getItem(KEY) || '[]');
  } catch {
    /* storage blocked: every launch is new */
  }
  const items = [].concat(given || []).filter((it) => !seen.includes(keyOf(it)));
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...seen, ...items.map(keyOf)].slice(-50)));
  } catch {
    /* as above */
  }
  return items.length ? openDriveItems(app, items) : 0;
}

/** Import > From Local: Puter's Open dialog. */
export async function importFromCloud(app) {
  const picker = app.cloudPicker();
  if (!picker) return 0;
  let picked;
  try {
    picked = await picker({ multiple: true, accept: IMPORT_EXTENSIONS });
  } catch {
    return 0;
  }
  return openDriveItems(app, picked);
}

/** local files dropped on the page go into it as files dropped from this device do: pictures shown, other files attached. */
export async function dropDriveItems(app, given, point) {
  const page = app.editor.page;
  const files = [];
  for (const it of driveFiles(given)) {
    const name = driveName(it);
    try {
      files.push(await readDriveFile(it, name));
    } catch (err) {
      toast(`无法插入 ${name}：${readError(err)}`, { kind: 'error' });
    }
  }
  // The files take a while to read: if another page was opened meanwhile, they must not land on it.
  if (files.length && app.editor.page === page) await app.editor.dropFiles(files, point);
}

// ------------------------------------------------------------ share

export function shareDialog(app) {
  const page = app.editor.page;
  if (!page) return;
  app.editor.flush();
  const status = h('p.field-hint', { role: 'status' });
  const linkInput = h('input.input', { type: 'text', readonly: true, 'aria-label': '只读链接', placeholder: '发布以创建链接' });
  const copyBtn = h('button.btn', { type: 'button', disabled: true, onclick: () => navigator.clipboard?.writeText(linkInput.value).then(() => toast('链接已复制')) }, icon('copy', 14), '复制');
  const expiry = h('select.select', { 'aria-label': '链接过期时间' }, [['1d', '1 天'], ['7d', '7 天'], ['30d', '30 天'], ['365d', '1 年']].map(([v, l]) => h('option', { value: v, selected: v === '30d' }, l)));
  const publishBtn = h('button.btn.primary', { type: 'button' }, icon('globe', 14), '创建链接');
  const stopBtn = h('button.btn', { type: 'button', hidden: !page.published }, '停止共享');
  publishBtn.addEventListener('click', async () => {
    publishBtn.disabled = true;
    status.textContent = '正在发布...';
    try {
      const outlines = await inlineOutlines(app, page, { maxImage: 3 * 1024 * 1024, keepTags: true });
      const snapshot = { format: 'notes-shared-page', v: 2, title: page.title, created: page.created, color: page.color, rules: page.rules, outlines, ink: page.ink || [], published: new Date().toISOString() };
      const path = `published/${page.id}.json`;
      await app.store.backend.writeJSON(path, snapshot);
      const url = await app.store.backend.readURL(path, expiry.value);
      linkInput.value = `${location.origin}${location.pathname}#view=${encodeURIComponent(url)}`;
      copyBtn.disabled = false;
      stopBtn.hidden = false;
      page.published = { at: snapshot.published, expires: expiry.value };
      app.store.pageChanged(page);
      status.textContent = `任何拥有此链接的人都可以在 ${expiry.selectedOptions[0].textContent} 内阅读此页面的副本。编辑后再次发布可更新内容。`;
      linkInput.select();
    } catch (err) {
      status.textContent = `无法创建链接：${err?.message || '请求失败'}`;
    } finally {
      publishBtn.disabled = false;
    }
  });
  stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    try {
      await app.store.backend.remove(`published/${page.id}.json`);
    } catch (err) {
      // The snapshot is still there, so the link still opens it.
      status.textContent = `无法停止共享：${err?.message || '请求失败'}。链接仍然有效，请重试。`;
      return;
    } finally {
      stopBtn.disabled = false;
    }
    delete page.published;
    app.store.pageChanged(page);
    linkInput.value = '';
    copyBtn.disabled = true;
    stopBtn.hidden = true;
    status.textContent = '已停止共享。现有链接将无法再打开此页面。';
  });
  const pageLink = `${location.origin}${location.pathname}#page=${page.id}`;
  openDialog({
    title: `共享“${page.title || '无标题页面'}”`,
    width: 520,
    body: h('div',
      h('h3.share-head', '只读链接'),
      h('p.dialog-message', '创建任何人都可以打开阅读此页面的链接，无需登录。'),
      h('div.share-row', expiry, publishBtn, stopBtn),
      h('div.share-row', linkInput, copyBtn),
      status,
      h('h3.share-head', '其他共享方式'),
      h('div.share-row',
        h('button.btn', { type: 'button', onclick: () => navigator.clipboard?.writeText(pageLink).then(() => toast('链接已复制')) }, icon('link', 14), '复制页面链接'),
        h('button.btn', { type: 'button', onclick: () => emailPage(app) }, icon('mail', 14), '通过电子邮件发送页面'),
        h('button.btn', { type: 'button', onclick: (e) => openMenu(e.currentTarget, app.commands.get('export').menu(app), { label: '导出' }) }, icon('download', 14), '导出'),
      ),
      h('p.field-hint', '“复制页面链接”会在笔记中为您打开此页面（需登录账户）。'),
    ),
    actions: [{ label: '完成', primary: true }],
  });
}

// ------------------------------------------------------------ help, shortcuts, about

const EDITING_KEYS = [
  ['Tab', '缩进段落，或移动到下一个表格单元格'],
  ['Shift+Tab', '减少段落缩进，或移动到上一个表格单元格'],
  ['Escape', '停止键入并选择笔记容器'],
  ['Delete', '删除所选容器或墨迹'],
  ['Enter', '在页面标题中，按回车移至笔记内容'],
  ['* 空格', '开始项目符号列表'],
  ['1. 空格', '开始编号列表'],
  ['Mod+A', '选择容器文本；再次按下选择所有容器'],
  ['Mod+滚轮', '缩放页面'],
  ['F6', '在功能区、窗格和页面之间切换'],
  ['Alt+Shift+ArrowUp', '在窗格中：上移页面或分区'],
];

export function shortcutsDialog(app) {
  const groups = [
    ['笔记本与页面', ['newPage', 'newSubpage', 'newSection', 'makeSubpage', 'promoteSubpage', 'nextPage', 'prevPage', 'search', 'findOnPage', 'syncNow', 'print']],
    ['格式', ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'highlight', 'clearFormat', 'growFont', 'shrinkFont', 'bullets', 'numbering', 'indent', 'outdent', 'alignLeft', 'alignCenter', 'alignRight', 'moveUp', 'moveDown', 'formatPainter', 'insertLink']],
    ['样式', ['style:h1', 'style:h2', 'style:h3', 'style:h4', 'style:h5', 'style:h6', 'style:normal']],
    ['标记', ['tag:todo', 'tag:important', 'tag:question', 'tag:remember', 'tag:definition', 'tag:highlight', 'tag:contact', 'tag:address', 'tag:phone', 'removeTags']],
    ['插入', ['insertDate', 'insertTime', 'insertDateTime']],
    ['视图', ['zoomIn', 'zoomOut', 'fullPage', 'toggleNav', 'collapseRibbon', 'tellMe', 'undo', 'redo', 'shortcuts', 'help']],
  ];
  const filter = h('input.input', { type: 'search', placeholder: '搜索快捷键', 'aria-label': '搜索快捷键' });
  const body = h('div.shortcuts', { tabindex: '0', role: 'region', 'aria-label': '快捷键列表' });
  const render = () => {
    const q = filter.value.trim().toLowerCase();
    const sections = [];
    for (const [title, ids] of groups) {
      const rows = ids.map((id) => app.commands.get(id)).filter((c) => c?.key && (!q || c.label.toLowerCase().includes(q)));
      if (!rows.length) continue;
      sections.push(h('section', h('h3', title), h('table.shortcut-table', h('tbody', rows.map((c) => h('tr', h('td', c.label), h('td', h('kbd.kbd', shortcutLabel(c.key)))))))));
    }
    const edit = EDITING_KEYS.filter(([, d]) => !q || d.toLowerCase().includes(q));
    if (edit.length) sections.push(h('section', h('h3', '编辑'), h('table.shortcut-table', h('tbody', edit.map(([k, d]) => h('tr', h('td', d), h('td', h('kbd.kbd', shortcutLabel(k.includes('then') || k === 'Mod+Wheel' ? k : k).replace('Wheel', ' + 滚动')))))))));
    body.replaceChildren(...(sections.length ? sections : [h('p.field-hint', '无匹配的快捷键。')]));
  };
  filter.addEventListener('input', render);
  render();
  openDialog({ title: '键盘快捷键', width: 620, body: h('div', filter, body), actions: [{ label: '关闭', primary: true }] });
}

export function helpDialog(app) {
  const tip = (ic, title, text) => h('div.help-tip', icon(ic, 20, undefined, { plain: true }), h('div', h('strong', title), h('p', text)));
  openDialog({
    title: '帮助',
    width: 560,
    body: h('div.help',
      tip('container', '随时随地自由记录', '笔记排版完全自由。点击页面任意位置即可创建笔记容器，拖动顶部栏可移动，拖动右侧边缘可调整大小。'),
      tip('notebooks', '笔记本、分区和页面', '使用左侧窗格。拖动页面调整顺序或向右拖动设为子页面，将分区拖入分区组中。'),
      tip('todo', '标记', `使用待办事项 (${shortcutLabel('Mod+1')}) 和重要 (${shortcutLabel('Mod+2')}) 等标记段落。“查找标记”会列出所有标记。`),
      tip('pen', '绘图与墨迹', '在“绘图”选项卡上选择笔或荧光笔进行手写绘图。使用套索选择移动墨迹，使用插入空白留出空隙。'),
      tip('search', '搜索', `按 ${shortcutLabel('Mod+E')} 搜索所有笔记本，或按 ${shortcutLabel('Mod+F')} 在当前页面查找。`),
      tip('cloud', '保存到本地存储', '所有内容自动保存到本地存储。已删除项目将在已删除笔记中保留 60 天。'),
    ),
    actions: [{ label: '键盘快捷键', run: () => setTimeout(() => app.shortcutsDialog()) }, { label: '关闭', primary: true }],
  });
}

export function aboutDialog() {
  openDialog({
    title: '关于笔记',
    width: 440,
    body: h('div.about',
      h('img', { src: './favicon.svg', alt: '', width: 56, height: 56 }),
      h('p', h('strong', '笔记'), ' 是一款自由排版的数字笔记本。您的笔记本将作为文件保存在本地存储中。'),
      h('p.field-hint', '基于 Puter.js 构建。图标来自 Lucide (ISC 许可证)。墨迹平滑来自 perfect-freehand (MIT 许可证)。公式渲染来自 Temml (MIT 许可证)。PDF 打印来自 pdf.js (Apache-2.0 许可证)。'),
    ),
    actions: [{ label: '关闭', primary: true }],
  });
}

// ------------------------------------------------------------ password-protected sections

function passwordField(id, label, autocomplete) {
  const input = h('input.input', { id, type: 'password', autocomplete, spellcheck: 'false' });
  return { input, field: h('div.field', h('label.field-label', { for: id }, label), input) };
}

/** Asks for a protected section's password. Resolves true once it is unlocked. */
export function unlockSection(app, section) {
  return new Promise((resolve) => {
    const pw = passwordField('unlock-pw', '密码', 'current-password');
    const error = h('p.field-error', { role: 'alert' });
    let ok = false;
    openDialog({
      title: '受保护的分区',
      width: 380,
      body: h('div', h('p.dialog-message', `“${section.name}”已受密码保护。请输入密码以查看其页面。`), pw.field, error),
      actions: [
        { label: '取消' },
        { label: '解锁', primary: true, run: async (btn) => {
          if (!pw.input.value) {
            error.textContent = '请输入密码。';
            return false;
          }
          btn.disabled = true;
          let damaged = null;
          const unlocked = await app.store.unlockSection(section.id, pw.input.value).catch((err) => {
            if (err?.damaged) damaged = err.message;
            return false;
          });
          btn.disabled = false;
          if (damaged) {
            error.textContent = damaged;
            return false;
          }
          if (!unlocked) {
            error.textContent = '密码不正确。密码区分大小写。';
            pw.input.select();
            return false;
          }
          ok = true;
          app.unlocked.add(section.id);
          app.touchProtected();
          return true;
        } },
      ],
      onClose: () => resolve(ok),
    });
  });
}

export function passwordDialog(app, section) {
  const store = app.store;
  if (section.locked && !store.keys.has(section.id)) {
    unlockSection(app, section).then((ok) => ok && passwordDialog(app, section));
    return;
  }
  const isNew = !section.locked;
  const first = passwordField('pw-new', isNew ? '输入密码' : '新密码', 'new-password');
  const second = passwordField('pw-confirm', '确认密码', 'new-password');
  const error = h('p.field-error', { role: 'alert' });
  const actions = [{ label: '取消' }];
  if (!isNew) {
    actions.push({ label: '删除密码', run: async () => {
      if (!(await confirmDialog({ title: '删除密码？', message: `“${section.name}”将不再加密。任何可访问此应用的人都将能阅读该分区。`, okLabel: '删除' }))) return false;
      try {
        // False: the section locked again while this dialog was open.
        if (!(await store.unprotectSection(section.id))) throw new Error('分区已锁定。请先解锁后再试。');
      } catch (err) {
        error.textContent = `无法删除密码：${err.message}`;
        return false;
      }
      app.unlocked.delete(section.id);
      toast('密码已删除');
      app.renderNav();
      return true;
    } });
  }
  actions.push({
    label: isNew ? '保护' : '修改密码',
    primary: true,
    run: async (btn) => {
      const a = first.input.value;
      if (a.length < 4) {
        error.textContent = '密码长度至少为 4 个字符。';
        first.input.focus();
        return false;
      }
      if (a !== second.input.value) {
        error.textContent = "两次输入的密码不一致。";
        second.input.select();
        return false;
      }
      btn.disabled = true;
      app.editor.flush();
      try {
        if (!(await store.protectSection(section.id, a))) throw new Error('分区已锁定。请先解锁后再试。');
      } catch (err) {
        error.textContent = `无法保护分区：${err.message}`;
        btn.disabled = false;
        return false;
      }
      app.unlocked.add(section.id);
      app.touchProtected();
      toast(isNew ? `“${section.name}”现已受密码保护` : '密码已修改');
      app.renderNav();
      return true;
    },
  });
  openDialog({
    title: isNew ? '密码保护' : '修改密码',
    width: 420,
    body: h('div',
      h('p.dialog-message', isNew ? `“${section.name}”中的页面将使用此密码加密。在闲置 10 分钟后或点击“全部锁定”后将再次锁定。该分区的只读共享链接也将停止工作。` : `修改“${section.name}”的密码，或删除密码。`),
      first.field,
      second.field,
      error,
      h('p.field-hint', { role: 'note' }, '请妥善保管密码。如果您忘记密码，将无法找回这些笔记。'),
    ),
    actions,
  });
}

// ------------------------------------------------------------ canvas context menu

export function canvasContextMenu(app, e) {
  const ed = app.editor;
  if (!ed.page || ed.readOnly) return;
  const img = e.target.closest('.outline-body img');
  const file = e.target.closest('.nt-file');
  const bar = e.target.closest('.outline-bar');
  const outline = e.target.closest('.outline');
  const point = { x: e.clientX, y: e.clientY };
  if (img) {
    e.preventDefault();
    openMenu(point, [
      { label: '可选文字...', icon: 'accessibility', run: () => altTextDialog(app, img) },
      { label: '另存为...', icon: 'download', run: async () => {
        const blob = img.dataset.asset ? await app.store.assetBlob(img.dataset.asset) : null;
        if (blob) download(img.getAttribute('alt') || img.dataset.asset, blob instanceof Blob ? blob : new Blob([blob]));
      } },
      { label: '重置大小', icon: 'pageWidth', run: () => { img.style.removeProperty('width'); img.style.removeProperty('height'); ed.dirty.add(outline); ed.commit(); } },
      { type: 'sep' },
      { label: '删除', icon: 'trash', danger: true, run: () => { img.remove(); ed.clearImageSelection(); ed.dirty.add(outline); ed.commit(); } },
    ], { label: '图片' });
    return;
  }
  if (file) {
    e.preventDefault();
    openMenu(point, [
      { label: '打开', icon: 'external', run: () => openAttachment(app, file.dataset) },
      { label: '另存为...', icon: 'download', run: async () => {
        const blob = await app.store.assetBlob(file.dataset.asset);
        if (blob) download(file.dataset.name || 'attachment', blob instanceof Blob ? blob : new Blob([blob]));
      } },
      { type: 'sep' },
      { label: '删除', icon: 'trash', danger: true, run: () => { file.remove(); ed.dirty.add(outline); ed.commit(); } },
    ], { label: '附件' });
    return;
  }
  if (bar && outline) {
    e.preventDefault();
    ed.selectOutlines([outline]);
    openMenu(point, [
      { label: '复制', icon: 'copy', run: () => {
        const body = outline.querySelector('.outline-body');
        const html = body.innerHTML;
        navigator.clipboard?.write?.([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([body.innerText], { type: 'text/plain' }) })]).then(() => toast('已复制'), () => toast("无法复制。"));
      } },
      { label: '自适应内容宽度', icon: 'pageWidth', run: () => { const m = ed.outlineModel(outline); m.w = null; ed.place(outline, m); ed.layout(); ed.changed(); } },
      { label: '置于顶层', icon: 'up', run: () => {
        const m = ed.outlineModel(outline);
        ed.page.outlines = [...ed.page.outlines.filter((o) => o !== m), m];
        ed.outlinesEl.append(outline);
        ed.changed();
      } },
      { label: '置于底层', icon: 'down', run: () => {
        const m = ed.outlineModel(outline);
        ed.page.outlines = [m, ...ed.page.outlines.filter((o) => o !== m)];
        ed.outlinesEl.prepend(outline);
        ed.changed();
      } },
      { type: 'sep' },
      { label: '删除', icon: 'trash', danger: true, shortcut: 'Delete', run: () => ed.deleteSelectedOutlines() },
    ], { label: '笔记容器' });
    return;
  }
  if (!outline && !e.target.closest('.page-header')) {
    e.preventDefault();
    const p = ed.pagePoint(e);
    if (ed.ink.selected.size) {
      openMenu(point, [{ label: '删除', icon: 'trash', danger: true, run: () => ed.deleteSelectedOutlines() }], { label: '墨迹' });
      return;
    }
    openMenu(point, [
      { label: '粘贴', icon: 'paste', run: () => { ed.createOutlineAt(p.x, p.y); app.paste(); } },
      { type: 'sep' },
      { label: '插入表格', icon: 'table', run: () => { ed.createOutlineAt(p.x, p.y); app.insertTableDialog(); } },
      { label: '插入图片', icon: 'picture', run: () => { ed.createOutlineAt(p.x, p.y); app.pickFiles({ accept: 'image/*' }); } },
      { label: '附加文件', icon: 'file', run: () => { ed.createOutlineAt(p.x, p.y); app.pickFiles({ attach: true }); } },
      { type: 'sep' },
      { label: '页面颜色', icon: 'pageColor', submenu: () => app.commands.get('pageColor').menu(app) },
      { label: '基准线', icon: 'ruleLines', submenu: () => app.commands.get('ruleLines').menu(app) },
      { label: '全选', icon: 'pointer', run: () => ed.selectAllOutlines() },
    ], { label: '页面' });
  }
}

function altTextDialog(app, img) {
  const input = h('textarea.input', { id: 'alt-text', rows: 3 });
  input.value = img.getAttribute('alt') || '';
  openDialog({
    title: '可选文字',
    width: 420,
    body: h('div.field', h('label.field-label', { for: 'alt-text' }, '为使用屏幕阅读器的人群描述此图片'), input),
    actions: [{ label: '取消' }, { label: '确定', primary: true, run: () => {
      img.setAttribute('alt', input.value.trim());
      const outline = img.closest('.outline');
      app.editor.dirty.add(outline);
      app.editor.commit();
    } }],
  });
}

export { selectRange };
