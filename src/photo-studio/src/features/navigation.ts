import type { Editor } from '../editor';
import { registerTool } from '../app/registry';
import { dragRotation, zoomAround } from '../app/view-transform';
import { setViewRotation } from './view-modes';

export function installNavigation(_e: Editor) {
  registerTool(
    {
      id: 'hand',
      label: '抓手工具',
      key: 'H',
      icon: 'hand',
      group: 'hand',
      needsDocument: false,
      cursor: () => 'grab',
      options: (e) =>
        `<label class="transform-setting" title="同时滚动所有打开的窗口 (按住 Shift 拖动生效一次)"><input type="checkbox" id="scroll-all" ${e.settings.scrollAllWindows ? 'checked' : ''}>滚动所有窗口</label><button data-command="view.actual-pixels">100%</button><button data-command="view.fit">适合屏幕</button><button data-command="view.fill">满屏</button><span class="hint">拖动以滚动 · 空格键+拖动可在任意工具下生效</span>`,
      bindOptions: ({ e, el }) => {
        el.querySelector<HTMLInputElement>('#scroll-all')?.addEventListener('change', (ev) => (e.settings.scrollAllWindows = (ev.target as HTMLInputElement).checked));
      },
    },
    {
      id: 'rotate-view',
      label: '旋转视图工具',
      key: 'R',
      icon: 'rotate-view',
      group: 'hand',
      cursor: () => 'grab',
      options: (e) =>
        `<label class="transform-setting rotate-angle">旋转角度 <input type="number" id="view-angle" min="-180" max="180" step="1" value="${Math.round(e.rotation * 10) / 10}" aria-label="视图旋转角度 (度)">°</label><button data-command="view.reset-rotation" ${e.rotation ? '' : 'disabled'}>复位视图</button><label class="transform-setting"><input type="checkbox" id="rotate-all" ${e.preferences.rotateAllWindows ? 'checked' : ''}>旋转所有窗口</label><span class="hint">拖动旋转画布 · Shift 约束为 15° · Esc 复位</span>`,
      bindOptions: ({ e, el }) => {
        const angle = el.querySelector<HTMLInputElement>('#view-angle')!;
        angle.addEventListener('change', () => {
          const v = Number(angle.value);
          if (Number.isFinite(v)) setViewRotation(e, v);
          e.options();
        });
        el.querySelector<HTMLInputElement>('#rotate-all')!.addEventListener('change', (ev) => {
          e.preferences.rotateAllWindows = (ev.target as HTMLInputElement).checked;
          e.savePreferences();
          if (e.preferences.rotateAllWindows) setViewRotation(e, e.rotation);
        });
      },
      pointerDown: (e, p) => {
        const r = e.el('#viewport').getBoundingClientRect();
        rotateDrag = { from: [p.clientX, p.clientY], center: [r.left + r.width / 2, r.top + r.height / 2], start: e.rotation };
        compass(e);
      },
      pointerMove: (e, p) => {
        if (!rotateDrag) return;
        // The pivot is the window center; a press near it would spin wildly.
        if (Math.hypot(p.clientX - rotateDrag.center[0], p.clientY - rotateDrag.center[1]) < 8) return;
        setViewRotation(e, dragRotation(rotateDrag.start, rotateDrag.from, [p.clientX, p.clientY], rotateDrag.center, p.shift ? 15 : 0));
        compass(e);
        const field = e.root.querySelector<HTMLInputElement>('#view-angle');
        if (field) field.value = String(Math.round(e.rotation * 10) / 10);
      },
      pointerUp: (e) => {
        rotateDrag = undefined;
        e.screenOverlayContent = '';
        e.screenOverlay();
        e.options();
      },
      keyDown: (e, ev) => {
        if (ev.key !== 'Escape' || !e.rotation) return false;
        setViewRotation(e, 0);
        e.options();
        return true;
      },
      deactivate: (e) => {
        rotateDrag = undefined;
        e.screenOverlayContent = '';
        e.screenOverlay();
      },
    },
    {
      id: 'zoom',
      label: '缩放工具',
      key: 'Z',
      icon: 'zoom-in',
      group: 'zoom',
      needsDocument: false,
      cursor: (e) => ((e.settings.zoomOut as boolean) ? 'zoom-out' : 'zoom-in'),
      options: (e) =>
        `<div class="segmented" role="group" aria-label="缩放方向"><button data-zoom-dir="in" aria-pressed="${!e.settings.zoomOut}" title="放大">+</button><button data-zoom-dir="out" aria-pressed="${!!e.settings.zoomOut}" title="缩小 (Alt)">−</button></div><label class="transform-setting" title="缩放后调整浮动窗口大小以适合图像"><input type="checkbox" id="zoom-resize" ${e.preferences.zoomResizesWindows ? 'checked' : ''}>调整窗口大小以适合</label><label class="transform-setting" title="以相同比例缩放每个打开的窗口"><input type="checkbox" id="zoom-all" ${e.settings.zoomAllWindows ? 'checked' : ''}>缩放所有窗口</label><label class="transform-setting"><input type="checkbox" id="scrubby-zoom" ${e.settings.scrubbyZoom !== false ? 'checked' : ''}>细微缩放</label><button data-command="view.actual-pixels">100%</button><button data-command="view.fit">适合屏幕</button><button data-command="view.fill">满屏</button>`,
      bindOptions: ({ e, el }) => {
        el.querySelectorAll<HTMLButtonElement>('[data-zoom-dir]').forEach((b) =>
          b.addEventListener('click', () => {
            e.settings.zoomOut = b.dataset.zoomDir === 'out';
            e.options();
          }),
        );
        el.querySelector<HTMLInputElement>('#scrubby-zoom')?.addEventListener('change', (ev) => (e.settings.scrubbyZoom = (ev.target as HTMLInputElement).checked));
        el.querySelector<HTMLInputElement>('#zoom-all')?.addEventListener('change', (ev) => (e.settings.zoomAllWindows = (ev.target as HTMLInputElement).checked));
        el.querySelector<HTMLInputElement>('#zoom-resize')?.addEventListener('change', (ev) => {
          e.preferences.zoomResizesWindows = (ev.target as HTMLInputElement).checked;
          e.savePreferences();
        });
      },
      pointerDown: (e, p) => {
        zoomDrag = { x: p.clientX, y: p.clientY, zoom: e.zoom, moved: false, ox: p.clientX, oy: p.clientY };
      },
      pointerMove: (e, p) => {
        if (!zoomDrag || e.settings.scrubbyZoom === false) return;
        const dx = p.clientX - zoomDrag.x;
        if (Math.abs(dx) > 3) zoomDrag.moved = true;
        if (!zoomDrag.moved) return;
        const rect = e.el('#viewport').getBoundingClientRect();
        const before = e.zoom;
        e.zoomAt(zoomDrag.zoom * Math.exp(dx / 150), zoomDrag.ox - rect.left, zoomDrag.oy - rect.top);
        zoomOthers(e, e.zoom / before);
      },
      pointerUp: (e, p) => {
        const d = zoomDrag;
        zoomDrag = undefined;
        if (d?.moved) return;
        const rect = e.el('#viewport').getBoundingClientRect();
        const out = p.alt !== !!e.settings.zoomOut;
        const z = out ? e.zoom / 1.5 : e.zoom * 1.5;
        zoomOthers(e, z / e.zoom);
        if (e.preferences.zoomClickedToCenter) e.zoomBy(z, undefined, undefined, [p.x, p.y]);
        else e.zoomBy(z, p.clientX - rect.left, p.clientY - rect.top);
      },
    },
  );
}
let zoomDrag: { x: number; y: number; zoom: number; moved: boolean; ox: number; oy: number } | undefined;
/** Zoom All Windows: the other windows zoom by the same factor about their centers. */
function zoomOthers(e: Editor, ratio: number) {
  if (!e.settings.zoomAllWindows || !Number.isFinite(ratio) || ratio === 1) return;
  for (const v of e.views) {
    if (v === e.activeView) continue;
    const next = zoomAround(v.state(), v.zoom * ratio, e.windows.viewportSize(v));
    v.zoom = next.zoom;
    v.pan = next.pan;
  }
  e.windows.renderTabs();
  e.windows.queueDraw();
}
let rotateDrag: { from: [number, number]; center: [number, number]; start: number } | undefined;
/** A compass at the window center while rotating: the accent needle points to the image's top. */
function compass(e: Editor) {
  const v = e.el('#viewport');
  const cx = v.clientWidth / 2,
    cy = v.clientHeight / 2,
    r = Math.min(70, Math.min(cx, cy) * 0.4);
  const a = e.rotation;
  e.screenOverlayContent = `<g class="view-compass" transform="translate(${cx} ${cy})"><circle r="${r}"/><g transform="rotate(${a})"><path class="needle-up" d="M0 ${-r + 6}L7 0H-7Z"/><path class="needle-down" d="M0 ${r - 6}L7 0H-7Z"/></g><circle class="hub" r="3"/><text y="${r + 18}" text-anchor="middle">${Math.round(a)}°</text></g>`;
  e.screenOverlay();
}
