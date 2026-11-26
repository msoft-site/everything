// Warps (Edit menu): Context Scale, Pin Warp and Perspective Warp, each an
// on-canvas workspace that commits as one history step.
import type { Editor } from '../../editor';
import { registerCommand } from '../../app/registry';
import { currentWarp, registerSessionTool, watchSessions } from './session';
import { lazy } from '../../app/lazy';
import { CONTEXT_SCALE_TOOL, PERSPECTIVE_WARP_TOOL, PIN_WARP_TOOL } from './ids';

// Each workspace loads when it starts.
const pinWarp = lazy(() => import('./pin-warp'));
const perspectiveWarp = lazy(() => import('./perspective-warp'));
const contextScale = lazy(() => import('./context-scale'));

export function installWarps(e: Editor) {
  registerSessionTool(PIN_WARP_TOOL, '操控变形', 'pin-warp');
  registerSessionTool(PERSPECTIVE_WARP_TOOL, '透视变形', 'perspective-warp');
  registerSessionTool(CONTEXT_SCALE_TOOL, '内容识别缩放', 'context-scale');
  const enabled = (e: Editor) => e.hasDocument && !!e.layer && e.selectedIds.size === 1;
  const start = (tool: string, run: (e: Editor) => Promise<void>) => async (e: Editor) => {
    // Choosing the running workspace again keeps it.
    if (currentWarp()?.tool === tool) return;
    e.transform.apply();
    e.modal?.apply();
    await run(e);
  };
  registerCommand(
    {
      id: 'edit.context-scale',
      label: '内容识别缩放',
      shortcut: 'Mod+Alt+Shift+C',
      description: '在保持细节区域、肤色或存储的选区完好的同时调整图层大小',
      enabled,
      recordable: false,
      checked: () => currentWarp()?.tool === CONTEXT_SCALE_TOOL,
      run: start(CONTEXT_SCALE_TOOL, async (e) => (await contextScale()).startContextScale(e)),
      prefetch: contextScale.prefetch,
    },
    {
      id: 'edit.pin-warp',
      label: '操控变形',
      description: '使用图钉网格弯曲图层',
      enabled,
      recordable: false,
      checked: () => currentWarp()?.tool === PIN_WARP_TOOL,
      run: start(PIN_WARP_TOOL, async (e) => (await pinWarp()).startPinWarp(e)),
      prefetch: pinWarp.prefetch,
    },
    {
      id: 'edit.perspective-warp',
      label: '透视变形',
      description: '在表面上布置平面，然后更改其透视',
      enabled,
      recordable: false,
      checked: () => currentWarp()?.tool === PERSPECTIVE_WARP_TOOL,
      run: start(PERSPECTIVE_WARP_TOOL, async (e) => (await perspectiveWarp()).startPerspectiveWarp(e)),
      prefetch: perspectiveWarp.prefetch,
    },
  );
  watchSessions(e);
}
