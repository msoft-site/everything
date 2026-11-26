// Generation History: AI results kept in this browser (see panel.ts). The
// panel body and the store load when the panel is first shown.
import './generations.css';
import type { Editor } from '../../editor';
import { registerCommand, registerPanel } from '../../app/registry';
import { lazy, lazyPanel, lazyRun } from '../../app/lazy';

const panel = lazy(() => import('./panel'));

export function installGenerations(e: Editor) {
  void e;
  registerPanel(
    lazyPanel(
      { id: 'generations', title: '生成历史记录', icon: 'generation-history', location: 'strip', menu: () => ['generations.clear'] },
      lazy(async () => {
        const m = await panel();
        return { mount: m.mountGenerations, update: m.updateGenerations };
      }),
    ),
  );
  registerCommand({
    id: 'generations.clear',
    label: '清空生成历史记录…',
    recordable: false,
    description: '删除本浏览器中保存的全部 AI 生成结果（已放置的图层将保留）。',
    ...lazyRun(panel, (m, ed) => m.clearGenerations(ed)),
  });
}
