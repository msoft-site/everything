// @name 从打开的文档生成网格
// @description 在新文档中以网格排列展示所有打开文档的缩略图，并可在下方附带文档名称。
const docs = await studio.documents.list();
if (!docs.length) return studio.ui.alert('请先打开需要汇总的文档。');

const v = await studio.ui.form('从打开的文档生成网格', [
  { name: 'columns', label: '列数', type: 'number', min: 1, max: 12, step: 1, value: Math.min(4, Math.ceil(Math.sqrt(docs.length))) },
  { name: 'cell', label: '单元格大小 (像素)', type: 'number', min: 32, max: 2048, step: 1, value: 320 },
  { name: 'gap', label: '间距 (像素)', type: 'number', min: 0, max: 400, step: 1, value: 24 },
  { name: 'background', label: '背景颜色', type: 'color', value: '#f2f2f2' },
  { name: 'captions', label: '图像下方显示文档名称', type: 'checkbox', value: true },
], { submit: '创建' });
if (!v) return;

const cols = Math.min(v.columns, docs.length);
const rows = Math.ceil(docs.length / cols);
const captionHeight = v.captions ? Math.round(v.cell * 0.12) : 0;
const width = cols * v.cell + (cols + 1) * v.gap;
const height = rows * (v.cell + captionHeight) + (rows + 1) * v.gap;
if (width > 8192 || height > 8192) return studio.ui.alert('网格尺寸超过 8192 像素上限。请减少列数或缩小单元格大小。');

// Area-average downscale (or nearest-neighbor upscale) of RGBA pixels.
function resize(src, w, h) {
  const out = studio.image.create(w, h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * src.height) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * src.width) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.width) / w));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++)
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) * 4, alpha = src.data[i + 3];
          r += src.data[i] * alpha; g += src.data[i + 1] * alpha; b += src.data[i + 2] * alpha; a += alpha; n++;
        }
      const o = (y * w + x) * 4;
      if (a) { out.data[o] = r / a; out.data[o + 1] = g / a; out.data[o + 2] = b / a; }
      out.data[o + 3] = a / n;
    }
  }
  return out;
}

// Read every composite before the new document becomes the active one.
const thumbs = [];
for (const [i, d] of docs.entries()) {
  studio.checkCancelled();
  await studio.ui.progress(i / docs.length, `Reading ${d.name}`);
  const s = Math.min(v.cell / d.width, v.cell / d.height);
  const w = Math.max(1, Math.round(d.width * s)), h = Math.max(1, Math.round(d.height * s));
  thumbs.push({ name: d.name, image: resize(await d.composite(), w, h) });
}
const sheet = await studio.documents.create({ name: 'Document Grid', width, height, background: v.background });
for (const [i, t] of thumbs.entries()) {
  studio.checkCancelled();
  await studio.ui.progress(i / thumbs.length, `Placing ${t.name}`);
  const col = i % cols, row = Math.floor(i / cols);
  const cx = v.gap + col * (v.cell + v.gap), cy = v.gap + row * (v.cell + captionHeight + v.gap);
  const x = cx + Math.round((v.cell - t.image.width) / 2), y = cy + Math.round((v.cell - t.image.height) / 2);
  const layer = await sheet.addLayer({ name: t.name });
  await layer.setPixels(t.image, x, y);
  if (v.captions) {
    const caption = await sheet.addLayer({ kind: 'text', name: `${t.name} caption`, text: t.name, size: Math.max(8, Math.round(captionHeight * 0.55)), color: '#333333', x: cx, y: cy + v.cell + Math.round(captionHeight * 0.2) });
    // Center the caption under its cell.
    await caption.move(Math.round((v.cell - caption.bounds.width) / 2), 0);
  }
}
