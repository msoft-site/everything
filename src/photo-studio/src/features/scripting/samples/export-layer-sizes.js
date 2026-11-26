// @name 按多种尺寸导出图层
// @description 按您列出的各个缩放比例将每个图层分别导出为图像，并统一打包为 ZIP 文件。
const doc = await studio.documents.active();
if (!doc) return studio.ui.alert('请先打开一个文档。');

const v = await studio.ui.form('按多种尺寸导出图层', [
  { name: 'scales', label: '缩放比例 (百分比，以逗号分隔)', value: '100, 50, 25' },
  { name: 'format', label: '导出格式', type: 'select', value: 'png', options: [['png', 'PNG'], ['jpeg', 'JPEG'], ['webp', 'WebP']] },
  { name: 'quality', label: '图像质量 (JPEG 和 WebP)', type: 'range', min: 10, max: 100, step: 5, value: 85 },
  { name: 'visibleOnly', label: '仅限可见图层', type: 'checkbox', value: true },
  { name: 'trim', label: '裁剪至各图层实际内容', type: 'checkbox', value: true },
], { submit: '导出' });
if (!v) return;

const scales = v.scales.split(/[,;\s]+/).map(Number).filter((n) => n > 0 && n <= 1000);
if (!scales.length) return studio.ui.alert('请至少列出一个缩放比例，例如 100, 50。');
// Groups export their children; adjustment layers have no pixels of their own.
const layers = (await doc.layers()).filter((l) => !['group', 'artboard', 'adjustment'].includes(l.kind) && (!v.visibleOnly || l.visible));
if (!layers.length) return studio.ui.alert('没有可供导出的图层。');

const safe = (s) => s.replace(/[^\w\- ]+/g, '_').trim() || 'layer';
const files = [];
let done = 0;
for (const layer of layers) {
  for (const scale of scales) {
    studio.checkCancelled();
    await studio.ui.progress(done / (layers.length * scales.length), `${layer.name} at ${scale}%`);
    const out = await layer.export({ format: v.format, quality: v.quality, scale: scale / 100, trim: v.trim });
    files.push({ name: `${safe(layer.name)}@${scale}.${out.extension}`, data: out.data });
    done++;
  }
}
await studio.ui.progress(1, 'Saving…');
await studio.files.saveAll(files, `${safe(doc.name)}-layers.zip`);
console.log(`Exported ${layers.length} layers at ${scales.length} sizes.`);
