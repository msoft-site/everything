// @name 添加水印
// @description 在图像角标处添加包含版权声明等文字的文本图层。
const doc = await studio.documents.active();
if (!doc) return studio.ui.alert('请先打开一个文档。');

const year = new Date().getFullYear();
const v = await studio.ui.form('添加水印', [
  { name: 'text', label: '文本', value: `© ${year}` },
  { name: 'corner', label: '位置', type: 'select', value: 'bottom-right', options: [['bottom-right', '右下角'], ['bottom-left', '左下角'], ['top-right', '右上角'], ['top-left', '左上角'], ['center', '居中']] },
  { name: 'size', label: '字号 (短边百分比 %)', type: 'range', min: 1, max: 20, step: 1, value: 4 },
  { name: 'color', label: '颜色', type: 'color', value: '#ffffff' },
  { name: 'opacity', label: '不透明度 (%)', type: 'number', min: 1, max: 100, value: 70 },
  { name: 'shadow', label: '柔和阴影', type: 'checkbox', value: true },
], { submit: '添加' });
if (!v || !v.text.trim()) return;

const size = Math.max(6, Math.round((Math.min(doc.width, doc.height) * v.size) / 100));
const margin = Math.round(size * 0.8);
let layer = await doc.addLayer({ kind: 'text', name: 'Watermark', text: v.text, size, color: v.color, x: 0, y: 0 });
const b = layer.bounds;
const x = v.corner.endsWith('left') ? margin : v.corner === 'center' ? Math.round((doc.width - b.width) / 2) : doc.width - margin - b.width;
const y = v.corner.startsWith('top') ? margin : v.corner === 'center' ? Math.round((doc.height - b.height) / 2) : doc.height - margin - b.height;
layer = await layer.moveTo(x, y);
await layer.set({ opacity: v.opacity });
if (v.shadow) await layer.setStyle({ dropShadow: { opacity: 45, distance: Math.max(1, Math.round(size / 12)), size: Math.max(2, Math.round(size / 6)) } });
