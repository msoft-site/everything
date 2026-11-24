import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { CanvasEditor } from '../engine/canvas-editor.js';
import { shapeTextWidth } from '../engine/shape-text-layout.js';

const MARGIN = 360; // Twips around the draft's text.

// A rich draft owns its own positions and local history. Apply publishes one
// drawing mutation to the document history; cancel never changes the document.
export function openDrawingText({ engine, pkg, image, frame, select = null, type = null }) {
  const descriptor = pkg.drawingTextFrames(image, engine.model.assets)[frame];
  if (!descriptor || descriptor.reason) throw new Error(descriptor?.reason || '该图形文字不可用。');
  const assets = {}, images = new Map();
  const addPicture = picture => {
    for (const id of [picture?.assetId, picture?.fallbackAssetId]) {
      if (!id || assets[id]) continue;
      const asset = engine.model.assets[id];
      if (!asset) throw new Error('缺少图形图片资源。');
      assets[id] = asset;
      if (engine.images.has(id)) images.set(id, engine.images.get(id));
      if (asset.scene) visitScene(asset.scene);
    }
  };
  const visitParagraphs = paragraphs => { for (const p of paragraphs) for (const r of p.runs) addPicture(r.image); };
  const visitScene = node => { addPicture(node.image); addPicture(node.fill?.image); if (node.text) visitParagraphs(node.text.paragraphs); node.children?.forEach(visitScene); };
  visitParagraphs(descriptor.paragraphs);
  let draft, busy = false;
  const abort = new AbortController();
  const host = el('div.canvas-host', { style: 'height: min(55vh, 480px); overflow: auto;' });
  const error = el('p.field-error', { role: 'alert', hidden: true });
  const report = e => { error.textContent = e.message; error.hidden = false; };
  const tool = (label, action) => el('button.btn', { type: 'button', onclick: () => { if (!busy) action(); } }, label);
  const apply = tool('应用', async () => {
    busy = true; apply.disabled = true; error.hidden = true;
    draft.finishComposition(); draft.input.readOnly = true;
    try {
      if (await engine.applyDrawingText(pkg, image, frame, draft.model.paragraphs, { signal: abort.signal, tables: draft.model.tables })) { modal.close(); engine.focus(); }
    } catch (e) { if (!abort.signal.aborted) report(e); }
    finally { busy = false; apply.disabled = false; draft.input.readOnly = false; }
  });
  const content = el('div', {},
    el('p.modal-text', {}, '编辑此文本框内容，然后将更改应用到图形中。文档将保留其原始文本框大小和位置。'),
    // Drawing text is applied with its drawing, which tracking does not record (see conformance.md); said before typing.
    engine.session.body.trackChanges ? el('p.field-hint', {}, '“修订”功能已开启，但对图形中文字的更改不会被记录。') : null,
    el('div.row', { role: 'toolbar', 'aria-label': '图形文字格式' },
      tool('加粗', () => draft.toggleBold()), tool('倾斜', () => draft.toggleItalic()),
      tool('撤消', () => draft.undo()), tool('恢复', () => draft.redo())),
    host, error,
    el('div.row.row-end', {}, tool('取消', () => modal.close()), apply));
  const modal = openModal({ title: '编辑图形文字', content, wide: true, onClose: () => { abort.abort(); draft?.destroy(); } });
  // The draft's lines are as long as the frame's, so its text wraps where the drawing's will.
  let writing = 9000 - 2 * MARGIN;
  try {
    const node = pkg.drawingTextSources(image, engine.model.assets[image.assetId])[frame]?.node, width = node ? Math.round(shapeTextWidth(node) * 15) : 0;
    if (Number.isFinite(width) && width > 0) writing = width;
  } catch { /* the default width */ }
  const pageWidth = Math.max(1440, Math.min(31680, writing + 2 * MARGIN));
  try {
    draft = new CanvasEditor(host, {
      paragraphs: descriptor.paragraphs, tables: descriptor.tables, styles: engine.model.styles, numbering: engine.model.numbering,
      assets, images, borrowImages: true,
      pageSettings: { width: pageWidth, left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN, compatibilityMode: engine.model.pageSettings.compatibilityMode },
      inputLabel: '图形文字', onError: report,
      protectedPageFields: true,
    });
    draft.input.setAttribute('data-testid', 'drawing-text-input');
    // A new drawing's sample text starts selected, so typing replaces it.
    const at = select ? draft.model.text.indexOf(select) : -1;
    if (at >= 0) draft.model.select(at, at + select.length);
    // Opened by typing with the drawing selected: the text goes on after the drawing's own, as in Word.
    if (type !== null) { draft.model.select(draft.model.text.length); if (type) draft.typeText(() => draft.model.replace(type), type); }
    draft.focus();
  } catch (e) { modal.close(); throw e; }
  return modal;
}
