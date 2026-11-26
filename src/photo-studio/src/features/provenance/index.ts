// Provenance: a record of how each document is made (sources, edit steps,
// AI use, exports), shown in the Provenance panel, saved in projects,
// optionally attached to exports and readable from any image with
// File → Inspect Provenance. The recorder is small and always on; the panel,
// codecs and dialogs load on first use.
import type { Editor } from '../../editor';
import { registerCommand, registerPanel } from '../../app/registry';
import { lazy, lazyPanel, lazyRun } from '../../app/lazy';
import { download } from '../../persistence/puter';
import { installRecorder, recordOf } from './recorder';

const panel = lazy(() => import('./panel'));
const inspect = lazy(() => import('./inspect'));

export function installProvenance(e: Editor) {
  installRecorder(e);
  registerPanel(lazyPanel({ id: 'provenance', title: '内容凭证', icon: 'provenance', location: 'strip', hidden: true, menu: () => ['file.inspect-provenance', 'provenance.export-record'] }, panel));
  registerCommand(
    // Directly in the Window menu (not under Panels).
    { id: 'window.panel.provenance', label: '内容凭证', recordable: false, checked: (e) => e.dock.isVisible('provenance'), run: (e) => e.dock.show('provenance', true) },
    {
      id: 'file.inspect-provenance',
      label: '检查内容凭证…',
      description: '读取图像文件附加的历史记录和签名，并检查其像素',
      recordable: false,
      ...lazyRun(inspect, (m, e) => m.inspectFile(e)),
    },
    {
      id: 'provenance.export-record',
      label: '导出内容凭证记录',
      description: '将文档的内容凭证记录另存为 JSON',
      recordable: false,
      enabled: (e) => e.hasDocument,
      run: (e) => {
        const name = `${e.doc.name.replace(/[\\/:*?"<>|]+/g, '_') || '未命名'}-provenance.json`;
        download(new Blob([JSON.stringify(recordOf(e.session), null, 2)], { type: 'application/json' }), name);
        e.message(`已保存 ${name}`);
      },
    },
  );
}
