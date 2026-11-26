// Edit > AI Fill… and AI Expand…: generative edits through local AI service.
// Pixels leave the device only after the user reads the notice and presses
// Generate in these dialogs; results arrive as new, masked layers.
import type { Editor } from '../../editor';
import { escapeXML } from '../../model/assets';
import { allLayers, insertLayerAt, type PhotoDocument } from '../../model/document';
import { isVectorGradient } from '../../model/vector-gradient';
import { isVectorPattern } from '../../model/vector-pattern';
import { multiplyMaskMatrix } from '../../model/pixel-mask';
import { newPixelLayer } from '../../model/pixel-layer';
import { applySelection } from '../../model/selection';
import { emptyGrid, gridFromImage, writeRect } from '../../model/tiles';
import { boundingBox } from '../../imaging/segment/mask-ops';
import { aiExpand, aiFill, AIError, toAIError, type AIImageOptions } from '../../imaging/ai/puter-ai';
import { mask8, type Mask8 } from '../../imaging/types';
import { cropMask, cropRGBA } from './logic';
import { mergedImage, selectionMask } from './source';
import { field, openWorkspace, options } from './workspace';
import { recordGeneration } from '../generations/record';

/** Settings to open AI Fill or AI Expand with (`{ prefill }` command argument). */
type AIPrefill = { prompt?: string; method?: 'edit' | 'inpaint'; blend?: 'normal' | 'seamless'; left?: number; top?: number; right?: number; bottom?: number; via?: 'assistant' };
function prefillOf(arg: unknown): AIPrefill {
  const p = arg && typeof arg === 'object' ? (arg as { prefill?: unknown }).prefill : undefined;
  return p && typeof p === 'object' ? (p as AIPrefill) : {};
}
const attr = (v: unknown) => escapeXML(String(v ?? ''));

type PuterAuth = { auth?: { isSignedIn?: () => boolean; signIn?: () => Promise<unknown> } };
/** Make sure a local session exists; must run inside the click that asked for it. */
export async function ensureSignedIn() {
  const p = (globalThis as unknown as { puter?: PuterAuth }).puter;
  if (!p) throw new AIError('unavailable', 'AI features need Puter. Check your connection and try again.');
  if (p.auth?.isSignedIn && !p.auth.isSignedIn()) {
    try {
      await p.auth.signIn?.();
    } catch {
      throw new AIError('unavailable', 'Sign in to use AI features.');
    }
    if (!p.auth.isSignedIn()) throw new AIError('unavailable', 'Sign in to use AI features.');
  }
}
const notice = (what: string) =>
  `<div class="ai-notice" role="note"><strong>生成须知</strong><p>${escapeXML(what)}将发送至本地智能引擎以生成新图像。在您点击“生成”前不会发送任何内容。</p></div>`;

/** Shared dialog flow: collect inputs, run the generation with cancel, return the result. */
async function aiDialog<T>(title: string, body: string, generate: (ws: ReturnType<typeof openWorkspace>, signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
  const ws = openWorkspace(
    title,
    'ai-workspace',
    `<form class="ai-body" novalidate>${body}<p class="ai-status" id="ai-status" role="status" aria-live="polite"></p></form>
<footer class="rw-footer"><span class="rw-spacer"></span><button id="ai-cancel" type="button">取消</button><button id="ai-generate" type="button" class="primary">生成</button></footer>`,
  );
  const status = ws.q('#ai-status');
  const go = ws.q<HTMLButtonElement>('#ai-generate');
  let ctrl: AbortController | undefined;
  let result: T | undefined;
  ws.q('#ai-cancel').addEventListener('click', () => {
    ctrl?.abort();
    ws.close();
  });
  ws.q('form').addEventListener('submit', (ev) => ev.preventDefault());
  go.addEventListener('click', async () => {
    if (ctrl) return;
    ctrl = new AbortController();
    go.disabled = true;
    status.className = 'ai-status busy';
    status.textContent = '正在连接本地智能引擎…';
    try {
      await ensureSignedIn();
      status.textContent = '正在生成… 请稍候。';
      result = await generate(ws, ctrl.signal);
      ws.close();
    } catch (error) {
      const err = toAIError(error);
      if (err.code === 'cancelled') return;
      status.className = 'ai-status error';
      status.textContent = err.message + (err.retryable ? ' 您可以重试。' : '');
    } finally {
      ctrl = undefined;
      go.disabled = false;
      if (status.classList.contains('busy')) status.className = 'ai-status';
    }
  });
  ws.dialog.addEventListener('close', () => ctrl?.abort());
  await ws.closed;
  return result;
}
const methodField = (value = 'edit') =>
  field('方法', options('ai-method', value === 'inpaint' ? 'inpaint' : 'edit', [['edit', '提示词编辑'], ['inpaint', '蒙版局部重绘']]), '蒙版局部重绘精确遵循选区，但分辨率较低。');

export async function openAIFill(e: Editor, arg?: unknown) {
  const pre = prefillOf(arg);
  const sel = selectionMask(e);
  const box = sel && boundingBox(sel);
  if (!sel || !box) {
    e.message('请先选择要填充的区域。');
    return;
  }
  const img = await mergedImage(e);
  const out = await aiDialog(
    'AI 填充',
    `${notice('选定区域及周围部分参考图像')}
${field('提示词', `<textarea id="ai-prompt" rows="3" placeholder="描述希望在选区中生成的内容，例如“一张木长凳”" required>${attr(pre.prompt)}</textarea>`)}
${methodField(pre.method)}
${field('边缘过渡', options('ai-blend', pre.blend === 'seamless' ? 'seamless' : 'normal', [['normal', '柔和边缘'], ['seamless', '无缝融合']]))}`,
    async (ws, signal) => {
      const prompt = ws.q<HTMLTextAreaElement>('#ai-prompt').value.trim();
      if (!prompt) throw new AIError('bad-request', '请先输入提示词。');
      const opts: AIImageOptions = { mode: ws.q<HTMLSelectElement>('#ai-method').value as 'edit' | 'inpaint', blend: ws.q<HTMLSelectElement>('#ai-blend').value as 'normal' | 'seamless', signal };
      return { prompt, image: await aiFill(img, sel, prompt, opts), settings: { method: opts.mode, blend: opts.blend } };
    },
  );
  if (!out) return;
  // A new layer with the generated pixels around the selection, masked to it.
  const pixels = cropRGBA(out.image, box);
  // History keeps the generated pixels cut to the selection's shape.
  const cut = cropMask(sel, box), kept = { ...pixels, data: new Uint8ClampedArray(pixels.data) };
  for (let i = 0; i < cut.data.length; i++) kept.data[i * 4 + 3] = Math.round((kept.data[i * 4 + 3] * cut.data[i]) / 255);
  void recordGeneration(e, { kind: pre.via === 'assistant' ? 'assistant' : 'fill', prompt: out.prompt, settings: { ...out.settings, dialog: 'fill' }, placement: { ...box } }, kept);
  const l = newPixelLayer(`AI 填充: ${out.prompt.slice(0, 40)}`, e.doc, gridFromImage(e.assets.tiles, pixels, box.x, box.y));
  l.maskGrid = writeRect(e.assets.tiles, emptyGrid(1), box.x, box.y, cropMask(sel, box));
  l.generated = { kind: 'fill', prompt: out.prompt.slice(0, 4000) };
  insertLayer(e, l, 'AI 填充', true);
  e.message('已将 AI 填充内容添加为带蒙版的新图层。');
}

export async function openAIExpand(e: Editor, arg?: unknown) {
  const pre = prefillOf(arg);
  const img = await mergedImage(e);
  const W = img.width,
    H = img.height;
  const side = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(4096, Math.round(v))) : d);
  const dx = Math.round(W * 0.125),
    dy = Math.round(H * 0.125);
  const num = (id: string, label: string, v: number) => field(label, `<input id="${id}" type="number" min="0" max="4096" value="${v}">`);
  const out = await aiDialog(
    'AI 扩展',
    `${notice('当前可见的完整图像')}
<div class="ai-sides">${num('ai-left', '左 (像素)', side(pre.left, dx))}${num('ai-right', '右 (像素)', side(pre.right, dx))}${num('ai-top', '上 (像素)', side(pre.top, dy))}${num('ai-bottom', '下 (像素)', side(pre.bottom, dy))}</div>
${field('提示词 (可选)', `<textarea id="ai-prompt" rows="2" placeholder="留空则自动自然扩展画面内容">${attr(pre.prompt)}</textarea>`)}
${methodField(pre.method)}`,
    async (ws, signal) => {
      const v = (id: string) => Math.max(0, Math.round(Number(ws.q<HTMLInputElement>(id).value) || 0));
      const by = { left: v('#ai-left'), top: v('#ai-top'), right: v('#ai-right'), bottom: v('#ai-bottom') };
      const nw = W + by.left + by.right,
        nh = H + by.top + by.bottom;
      if (nw === W && nh === H) throw new AIError('bad-request', '请至少在一侧输入要扩展的像素数。');
      if (nw > 8192 || nh > 8192 || nw * nh > 24_000_000) throw new AIError('bad-request', '扩展后的图像尺寸不能超过 8192 像素或 2400 万像素。');
      const prompt = ws.q<HTMLTextAreaElement>('#ai-prompt').value;
      const method = ws.q<HTMLSelectElement>('#ai-method').value as 'edit' | 'inpaint';
      return { by, prompt, method, image: await aiExpand(img, by, prompt, { mode: method, signal }) };
    },
  );
  if (!out) return;
  const { by, image } = out;
  void recordGeneration(e, { kind: pre.via === 'assistant' ? 'assistant' : 'expand', prompt: out.prompt.trim(), settings: { ...by, method: out.method, dialog: 'expand' }, placement: { x: 0, y: 0, width: image.width, height: image.height } }, image);
  const nw = image.width,
    nh = image.height;
  // The generated layer covers the new area and fades into the old edge, so the
  // original layers stay untouched underneath.
  const mask = expandMask(nw, nh, by.left, by.top, W, H, Math.max(2, Math.round(Math.min(W, H) * 0.01)));
  const l = newPixelLayer('AI 扩展', { width: nw, height: nh }, gridFromImage(e.assets.tiles, image));
  l.maskGrid = writeRect(e.assets.tiles, emptyGrid(1), 0, 0, mask);
  l.generated = { kind: 'expand', prompt: out.prompt.trim().slice(0, 4000) };
  e.command('AI 扩展', (d) => {
    enlargeCanvas(d, by.left, by.top, nw, nh);
    applySelection(d, null);
    d.layers.push(l);
  });
  e.selected = l.id;
  e.fit();
  e.update();
  e.message('已将 AI 扩展区域添加为带蒙版的新图层。');
}
/** Grow the canvas to `w`x`h`, moving existing content right/down by
 * (`left`, `top`). The shared crop helper clamps to the current canvas, so the
 * same per-layer offsets are applied here without clamping. */
export function enlargeCanvas(doc: PhotoDocument, left: number, top: number, w: number, h: number) {
  const x = -left,
    y = -top;
  for (const l of allLayers(doc.layers)) {
    if (isVectorGradient(l.vector?.fill) && l.vector.fill.align === false) l.vector.fill.matrix = multiplyMaskMatrix([1, 0, 0, 1, -x, -y], l.vector.fill.matrix ?? [1, 0, 0, 1, 0, 0]);
    if (isVectorPattern(l.vector?.fill) && l.vector.fill.align === false) {
      const fill = l.vector.fill;
      fill.phase ??= { x: 0, y: 0 };
      fill.phase.x -= x;
      fill.phase.y -= y;
    }
    if (l.pixelMask && (l.kind === 'group' || l.pixelMask.positionRelativeToLayer)) l.pixelMask.matrix = multiplyMaskMatrix([1, 0, 0, 1, -x, -y], l.pixelMask.matrix);
    if (l.vector?.mask.notLink) for (const path of l.vector.mask.paths) for (const knot of path.knots) knot.points = knot.points.map((n, i) => n - (i % 2 ? y : x));
    if (l.kind === 'group' && !l.pixelMask)
      for (const st of l.maskStrokes ?? []) {
        st.points = st.points.map(([px, py]) => [px - x, py - y]);
        st.clip = st.clip?.map(([px, py]) => [px - x, py - y]);
      }
    // Pixel layers follow their transform when the edit is normalized; other
    // layers' document-space masks move here.
    if (l.kind !== 'group') {
      l.transform.x -= x;
      l.transform.y -= y;
    }
    if (l.kind !== 'pixel' && l.maskGrid) l.maskGrid = { ...l.maskGrid, x: l.maskGrid.x - x, y: l.maskGrid.y - y };
    if (l.mask) {
      l.mask.x -= x;
      l.mask.y -= y;
    }
  }
  doc.width = w;
  doc.height = h;
  doc.selection = null;
  doc.selectionMask = null;
}
/** 255 in the added border, ramping to 0 a few pixels inside the old canvas. */
export function expandMask(nw: number, nh: number, left: number, top: number, w: number, h: number, band: number): Mask8 {
  const m = mask8(nw, nh);
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++) {
      const ix = x - left,
        iy = y - top;
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) {
        m.data[y * nw + x] = 255;
        continue;
      }
      // Distance to the nearest edge of the old canvas that was extended.
      let d = Infinity;
      if (left > 0) d = Math.min(d, ix);
      if (top > 0) d = Math.min(d, iy);
      if (nw - w - left > 0) d = Math.min(d, w - 1 - ix);
      if (nh - h - top > 0) d = Math.min(d, h - 1 - iy);
      if (d < band) m.data[y * nw + x] = Math.round(255 * (1 - (d + 0.5) / band));
    }
  return m;
}
function insertLayer(e: Editor, l: ReturnType<typeof newPixelLayer>, label: string, deselect: boolean) {
  const anchor = e.selected;
  e.command(label, (d) => {
    const find = (layers: typeof d.layers): boolean => {
      const i = layers.findIndex((x) => x.id === anchor);
      if (i >= 0) {
        insertLayerAt(layers, i + 1, l);
        return true;
      }
      return layers.some((x) => find(x.children));
    };
    if (!anchor || !find(d.layers)) d.layers.push(l);
    if (deselect) applySelection(d, null);
  });
  e.selected = l.id;
  e.update();
}

