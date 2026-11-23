import { openCanvasDocument } from './engine/open-document.js';
import { registerRevisionAuthors } from './engine/revisions.js';
import './styles/index.css';
import { el } from './ui/dom.js';
import { editorView } from './views/editor.js';
import { createDocx } from './engine/docx.js';
import { paragraph } from './engine/model.js';
import { parseLink } from './collab/protocol.js';
import { localGuest } from './views/collab.js';

/** The local harness uses no cloud SDK or account. All files stay in this tab. */
class LocalDocument extends EventTarget {
  constructor(name, blob) { super(); this.name = name; this.blob = blob; this.dirty = false; this.path = null; }
  attach(exporter) { this.exporter = exporter; }
  changed() { if (this.writes === false) return; this.dirty = true; this.dispatchEvent(new Event('status')); }
  discardEdits() { this.dirty = false; }
  /** A tab that joined a local shared document keeps no changes of its own to download. */
  setSaving(on) { this.writes = on; if (!on) this.dirty = false; }
  async flush() { return true; }
  destroy() {}
}

let current, request = 0;
const host = el('div.playground-editor');
const open = async (name, blob, { initial = false, collab = null } = {}) => {
  const token = ++request;
  // Opened once: the editor starts from this validated package and its measurements.
  let opened = null;
  const release = () => { for (const image of opened?.images.values() || []) image.close(); };
  try {
    // Reviewers' colors are set before the first layout, as the editor does (registerRevisionAuthors).
    if (blob) opened = await openCanvasDocument(blob, { beforeLayout: pkg => registerRevisionAuthors(pkg.paragraphs) });
  }
  catch (e) { document.getElementById('playground-error').textContent = e.message; return; }
  if (token !== request) { release(); return; }
  if (!initial && current?.doc.dirty && !window.confirm('要打开其他文档吗？如果您想保留当前更改，请先将其下载。')) { release(); return; }
  current?.destroy();
  const doc = new LocalDocument(name, blob);
  doc.opened = opened;
  if (collab) { doc.collab = collab; doc.setSaving(false); }
  current = editorView({
    doc, local: true,
    goHome: () => sample(false), newDoc: () => open('无标题文档', null),
    importFile: file => open(file.name.replace(/\.docx$/i, ''), file),
  });
  host.replaceChildren(current.el);
  document.getElementById('playground-error').textContent = '';
  current.ready.catch(() => {});
};
function sample(long, initial = false) {
  const first = '一个小开始。点击此段落中的任意位置即可开始编写。';
  const second = '跨这两个段落选择文字，应用加粗，然后撤销。下载 DOCX 并在此处重新打开，以检查您的更改是否保留。';
  const ps = long ? [paragraph(first), paragraph(`${second} ${'每一页都是让编辑器变得更好一点的新机会。'.repeat(60)}`)] : [paragraph(first), paragraph(second)];
  return open(long ? '跨两页文档' : '两个段落', createDocx(ps).export(), { initial });
}
document.getElementById('app').append(el('main.playground-shell', {},
  el('nav.playground-nav', { 'aria-label': '试验场示例' },
    el('strong', {}, '编辑器试验场'),
    el('button.btn', { onclick: () => open('无标题文档', null) }, '新建'),
    el('button.btn', { onclick: () => sample(false) }, '两个段落'),
    el('button.btn', { onclick: () => sample(true) }, '跨页文档'),
    el('details.playground-samples', {}, el('summary', {}, '示例文档'), el('div.playground-sample-list', {},
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/two-paragraphs.docx`, download: true }, '示例 DOCX'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/font-formatting.docx`, download: true }, '字体示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/page-settings.docx`, download: true }, '页面示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/indents-tabs.docx`, download: true }, '缩进与制表位示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/paragraph-pagination.docx`, download: true }, '分页示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/numbering.docx`, download: true }, '列表示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/styles.docx`, download: true }, '样式示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/character-styles.docx`, download: true }, '字符样式示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/contextual-spacing.docx`, download: true }, '上下文间距示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/tab-leaders.docx`, download: true }, '制表位前导符示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/format-features.docx`, download: true }, '格式特性示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/row-heights.docx`, download: true }, '行高示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/exact-row-heights.docx`, download: true }, '固定行高示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/content-controls.docx`, download: true }, '临时内容控件示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/line-spacing.docx`, download: true }, '行距示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/style-line-spacing.docx`, download: true }, '样式行距示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/find-replace.docx`, download: true }, '查找与替换示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/clear-text-formatting.docx`, download: true }, '清除文本格式示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/grouped-drawings.docx`, download: true }, '组合绘图与分节示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/annual-report.docx`, download: true }, '年度报告功能示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/artwork-metadata.docx`, download: true }, '锁定与装饰性图形示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/clear-paragraph-formatting.docx`, download: true }, '清除段落格式示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/kerning.docx`, download: true }, '字距调整示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/trailing-spaces.docx`, download: true }, '尾随空格示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/underlines.docx`, download: true }, '下划线示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/hyperlinks.docx`, download: true }, '超链接示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/paragraph-shading.docx`, download: true }, '段落底纹示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/paragraph-borders.docx`, download: true }, '段落边框示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/cell-alignment.docx`, download: true }, '单元格对齐示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/cell-shading.docx`, download: true }, '单元格底纹示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/cell-borders.docx`, download: true }, '单元格边框示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/cell-margins.docx`, download: true }, '单元格边距示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/justification.docx`, download: true }, '两端对齐示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/bookmarks.docx`, download: true }, '书签示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/capitalization.docx`, download: true }, '大小写示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/strikethrough.docx`, download: true }, '删除线示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/text-width.docx`, download: true }, '字符宽度示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/character-spacing.docx`, download: true }, '字符间距示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/baseline-shifts.docx`, download: true }, '基线偏移示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/script-text.docx`, download: true }, '上标与下标示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/style-toggles-on.docx`, download: true }, '样式继承示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/tables.docx`, download: true }, '表格示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/autofit-tables.docx`, download: true }, '自动调整表格示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/merged-cells.docx`, download: true }, '合并单元格示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/vertical-cells.docx`, download: true }, '垂直单元格示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/vertical-pages.docx`, download: true }, '跨页表格示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/table-headers.docx`, download: true }, '表头示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/inline-images.docx`, download: true }, '嵌入式图片示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/cropped-images.docx`, download: true }, '裁剪图片示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/flipped-images.docx`, download: true }, '翻转图片示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/rotated-images.docx`, download: true }, '旋转图片示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/outline-levels.docx`, download: true }, '大纲级别示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/text-colors.docx`, download: true }, '文本颜色示例'),
    el('a', { href: `${import.meta.env.BASE_URL}fixtures/text-highlights.docx`, download: true }, '突出显示示例'),
    )), el('a', { href: './index.html' }, '打开应用')),
  el('p', { id: 'playground-error', role: 'alert' }), host));
window.addEventListener('beforeunload', e => { if (current?.doc.dirty) { e.preventDefault(); e.returnValue = ''; } });
// A link from Share in another tab of this browser (#collab-local=…) joins that tab's document.
async function joinFromLink() {
  let link = null;
  try { link = parseLink(location.href); } catch (e) { document.getElementById('playground-error').textContent = e.message; }
  if (!link?.local) return false;
  try {
    const { joinRoom } = await import('./collab/live.js');
    const joined = await joinRoom(link, localGuest());
    await open(joined.name, new Blob([joined.base]), { initial: true, collab: { client: joined.client, link } });
    return true;
  } catch (e) { document.getElementById('playground-error').textContent = e.message; return false; }
}
joinFromLink().then(joined => { if (!joined) sample(false, true); });
