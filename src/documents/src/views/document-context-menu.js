import { MOD_KEY } from '../ui/dom.js';
import { openMenu } from '../ui/menu.js';
import { bodyFieldRanges } from '../engine/body-fields.js';
import { internalHyperlink, openableHyperlink } from '../engine/hyperlinks.js';

/** The kinds of place a right-click can land on, most specific first. */
export const CONTEXTS = ['image', 'shape', 'link', 'field', 'list', 'table', 'text'];

/**
 * What the caret or selection is in: one or more of CONTEXTS. A picture or shape selection is that
 * alone; text can be in a link, a field, a list and a table at once, and is always 'text' too.
 */
export function documentContexts(engine, { shapeSelected = false, fieldAtCaret = null } = {}) {
  const model = engine.model;
  if (shapeSelected) return ['shape'];
  if (model.selectedImage) return ['image'];
  const out = [];
  if (model.hyperlink) out.push('link');
  if (fieldAtCaret) { if (fieldAtCaret()) out.push('field'); }
  else if (model.hasBodyFields) {
    try { const at = model.range[0]; if (bodyFieldRanges(model.paragraphs).some(r => r.start <= at && at <= r.end)) out.push('field'); } catch { /* not a readable field */ }
  }
  if (model.listFormatting === 'bullet' || model.listFormatting === 'number') out.push('list');
  if (model.tableContext) out.push('table');
  out.push('text');
  return out;
}

/**
 * The document's right-click menu: spelling suggestions first, then the clipboard, formatting, link,
 * comment, table, picture and field commands for where it was opened, then each feature module's
 * entries from `commands.contextMenuItems(context, kit)`.
 */
export function openDocumentMenu({ event, behind, selectBehind, engine, pkg, w, kit, actions: x }) {
  const editable = !pkg.readOnly && !engine.viewOnly;
  const contexts = documentContexts(engine, { shapeSelected: !!w.shapeSelected?.(), fieldAtCaret: x.fieldAtCaret });
  const has = context => contexts.includes(context);
  const clipboard = x.clipboardState();
  const sep = { separator: true };
  const items = [];
  const add = (...list) => { for (const item of list) if (item) items.push(item); };
  const group = list => { const clean = list.filter(Boolean); if (clean.length) add(sep, ...clean); };

  if (has('text')) add(...x.spellingItems(engine.model.selection.focus));
  add({ label: '撤消', shortcut: `${MOD_KEY}+Z`, disabled: !editable || !engine.session.history.length && !w.packageHistory?.().undo, onSelect: () => engine.undo() },
    { label: '恢复', shortcut: `${MOD_KEY}+Shift+Z`, disabled: !editable || !engine.session.future.length && !w.packageHistory?.().redo, onSelect: () => engine.redo() });
  group([
    { label: '剪切', shortcut: `${MOD_KEY}+X`, icon: 'cut', disabled: !clipboard.cut, onSelect: () => x.cut() },
    { label: '复制', shortcut: `${MOD_KEY}+C`, icon: 'copy', disabled: !clipboard.copy, onSelect: () => x.copy() },
    { label: '粘贴', shortcut: `${MOD_KEY}+V`, icon: 'paste', disabled: !clipboard.paste, onSelect: () => x.paste() },
    { label: '只保留文本', shortcut: `${MOD_KEY}+Shift+V`, icon: 'pasteText', disabled: !clipboard.paste, onSelect: () => x.pastePlain() },
    w.pasteSpecial && { label: '选择性粘贴…', disabled: !clipboard.paste, onSelect: () => w.pasteSpecial() },
  ]);

  if (has('text') && editable) {
    group([
      { label: '字体…', icon: 'fontDialog', shortcut: `${MOD_KEY}+D`, onSelect: () => w.fontDialog?.() },
      { label: '段落…', icon: 'paragraphDialog', onSelect: () => x.paragraphDialog() },
      has('list') && { label: '重新开始编号', disabled: engine.model.listFormatting !== 'number', onSelect: () => engine.restartNumbering() },
      has('list') && w.multilevelItems && { label: engine.model.listFormatting === 'bullet' ? '项目符号' : '编号', items: w.multilevelItems() || [] },
      w.copyFormat && { label: '复制格式', icon: 'formatPainter', onSelect: () => w.copyFormat() },
      w.hasCopiedFormat?.() && { label: '粘贴格式', onSelect: () => w.pasteFormat() },
    ]);
  }
  if (has('link')) {
    const link = engine.model.hyperlink?.link;
    group([
      { label: '编辑链接…', icon: 'link', shortcut: `${MOD_KEY}+K`, disabled: !editable, onSelect: () => x.editLink() },
      { label: '打开链接', disabled: !!link && !openableHyperlink(link), onSelect: () => engine.openHyperlink() },
      link && !internalHyperlink(link) && link.target && { label: '复制链接', icon: 'copy', onSelect: () => navigator.clipboard?.writeText(link.target).catch(() => {}) },
      { label: '取消链接', icon: 'unlink', disabled: !editable, onSelect: () => engine.removeHyperlink() },
    ]);
  } else if (has('text') && editable) {
    group([{ label: '插入链接…', icon: 'link', shortcut: `${MOD_KEY}+K`, onSelect: () => x.editLink() }]);
  }
  if (has('field')) group([{ label: '更新域', icon: 'updateFields', shortcut: 'F9', disabled: !editable || !w.canUpdateFields?.(), onSelect: () => w.updateFields?.() }]);

  if (has('image')) group(x.imageItems());
  if (has('shape')) group([
    w.editShapeText && { label: '编辑文字', icon: 'drawingText', disabled: !editable, onSelect: () => w.editShapeText() },
    // A drawing with text frames keeps its per-frame editor here too.
    engine.model.selectedImage && (x.imageItems().find(item => item.label === '编辑绘图文字') || x.imageItems().find(item => item.label === 'Edit drawing text')),
    w.wrapItems && { label: '自动换行', icon: 'wrapText', disabled: !editable, items: w.wrapItems() || [] },
    w.arrange && { label: '上移一层', icon: 'bringForward', disabled: !w.canArrange?.(), onSelect: () => w.arrange('forward') },
    w.arrange && { label: '下移一层', icon: 'sendBackward', disabled: !w.canArrange?.(), onSelect: () => w.arrange('backward') },
    { label: '删除形状', icon: 'deleteShape', disabled: !editable, onSelect: () => w.deleteSelection?.() },
  ]);
  if (behind) group([{ label: '选择衬于文字下方的图片', onSelect: selectBehind }]);
  if (has('table') && editable) group(x.tableItems());

  const comments = x.commentItems?.() || [];
  if (comments.length) group(comments);
  for (const context of contexts) {
    let extra = [];
    try { extra = w.contextMenuItems?.(context, kit) || []; } catch (e) { console.error(e); }
    group(extra);
  }
  if (engine.session.path === null && engine.model.hasBodyFields && !has('field')) group([{ label: '更新页面引用', disabled: !editable, onSelect: () => engine.updatePageReferences() }]);
  group([{ label: '打印 / 另存为 PDF', icon: 'print', onSelect: x.print }]);

  const rect = engine.input.getBoundingClientRect();
  // A right-click or long press opens with no item chosen; the ContextMenu key and Shift+F10 start on the first.
  // Chrome reports the keys' menu as a mouse pointer event, with no button pressed (-1).
  const keyboard = event.button === -1 && (!event.pointerType || event.pointerType === 'mouse');
  const pointer = !keyboard && (!!event.pointerType || event.button === 2);
  const label = has('image') ? '图片菜单' : has('shape') ? '形状菜单' : '文档菜单';
  return openMenu({ anchor: engine.input, x: event.clientX || rect.left, y: event.clientY || rect.bottom, label, items: tidyMenu(items), pointer, onClose: () => engine.focus() });
}

function tidyMenu(items) {
  // Several contexts (text and field, say) can contribute the same command; it is listed once.
  const out = [], seen = new Set();
  for (const item of items) {
    if (item.separator && (!out.length || out.at(-1).separator)) continue;
    if (!item.separator && item.label) { if (seen.has(item.label)) continue; seen.add(item.label); }
    out.push(item);
  }
  while (out.at(-1)?.separator) out.pop();
  return out;
}
