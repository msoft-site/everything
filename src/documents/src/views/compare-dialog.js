/**
 * Compare Documents and Combine Documents. The reader picks an original and a revised document
 * (this one, a file from the device, or one from local storage); the result is a new document whose
 * differences are tracked changes, shown first beside both sources and then opened or downloaded.
 */
import { el } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import * as P from '../lib/puter.js';
import { engineApi } from '../lib/engine-api.js';
import { hint, preference } from './review-ui.js';

const OPTIONS = preference('documents:compare-options', { granularity: 'word', formatting: true, caseChanges: true, whiteSpace: true, tables: true });

const visible = run => run.revision?.type !== 'del';
const plainText = p => p.runs.filter(visible).map(r => r.text).join('').replace(/￼/g, '');

/** A column of paragraphs; the compared column shows marks. */
function column(title, paragraphs, marked = false) {
  return el('section.rv-compare-column', { 'aria-label': title }, el('h3', {}, title),
    el('div.rv-compare-scroll', { tabIndex: 0 }, ...paragraphs.map(p => el('p', {}, ...(marked ? p.runs.map(run => {
      const text = run.text.replace(/￼/g, '▫');
      if (run.revision?.type === 'ins') return el(run.revision.move ? 'ins.is-move' : 'ins', { title: `插入者: ${run.revision.author}` }, text);
      if (run.revision?.type === 'del') return el(run.revision.move ? 'del.is-move' : 'del', { title: `删除者: ${run.revision.author}` }, text);
      if (run.formatRevision) return el('span.rv-formatted', { title: '格式已更改' }, text);
      return text;
    }) : [plainText(p) || ' '])))));
}

export function openCompareDialog({ mode = 'compare', editor, pkg, documentName, author, openDocument, currentBytes, error, original: presetOriginal = null }) {
  const combine = mode === 'combine';
  const sources = { original: null, revised: null };
  const options = OPTIONS.get();
  const slot = (key, label) => {
    const name = el('span.rv-source-name', {}, '未选择');
    const fileInput = el('input', { type: 'file', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', hidden: true, onchange: () => {
      const file = fileInput.files?.[0]; fileInput.value = '';
      if (file) choose(key, { name: file.name, read: async () => new Uint8Array(await file.arrayBuffer()) });
    } });
    const choose = (k, source) => { sources[k] = source; name.textContent = source.name; refresh(); };
    const current = () => {
      choose(key, { name: `${documentName() || '当前文档'} (当前打开)`, current: true, read: currentBytes });
    };
    const fromPuter = async () => {
      const picked = await P.pickFile({ accept: ['.docx'] });
      if (picked) choose(key, { name: picked.name, read: async () => new Uint8Array(await (await P.readFile(picked.path)).arrayBuffer()) });
    };
    return { fileInput, current, set: source => choose(key, source), node: el('fieldset.rv-fieldset.rv-source', {}, el('legend', {}, label), name,
      el('div.rv-actions', {},
        el('button.btn.btn-outline.btn-sm', { type: 'button', onclick: current }, '当前文档'),
        el('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => fileInput.click() }, '从设备选取…'),
        P.canPickFiles() ? el('button.btn.btn-outline.btn-sm', { type: 'button', onclick: fromPuter }, '从本地选取…') : null), fileInput) };
  };
  const original = slot('original', '原文档'), revised = slot('revised', '修订的文档');
  const label = el('input.input', { value: '', placeholder: combine ? '修订副本的作者' : '修订文档的作者', 'aria-label': '标签修订为' });
  const check = (key, text) => { const input = el('input', { type: 'checkbox', checked: options[key] !== false, onchange: () => { options[key] = input.checked; OPTIONS.set(options); } }); return el('label.rv-check', {}, input, text); };
  const granularity = el('select.input', { 'aria-label': '显示修订级别', onchange: () => { options.granularity = granularity.value; OPTIONS.set(options); } },
    el('option', { value: 'word', selected: options.granularity !== 'character' }, '词级别'), el('option', { value: 'character', selected: options.granularity === 'character' }, '字符级别'));
  const status = el('p.field-error', { role: 'alert', hidden: true });
  const run = el('button.btn.btn-primary', { type: 'submit' }, combine ? '合并' : '比较');
  function refresh() { run.disabled = !sources.original || !sources.revised; }
  const content = el('form.ed-dialog-body.rv-compare-dialog', { onsubmit: async e => {
    e.preventDefault();
    status.hidden = true; run.disabled = true; run.textContent = '处理中…';
    try { await compare(); modal.close(); }
    catch (err) { status.textContent = err.message || '无法比较文档。'; status.hidden = false; }
    finally { run.textContent = combine ? '合并' : '比较'; refresh(); }
  } },
    original.node, revised.node,
    el('label.field', {}, el('span.field-label', {}, combine ? '未标记修订的标签' : '标签修订为'), label),
    el('details.rv-more', { open: false }, el('summary', {}, '更多选项'),
      el('label.field', {}, el('span.field-label', {}, '显示修订级别'), granularity),
      el('div.rv-checks', {}, check('formatting', '格式设置'), check('caseChanges', '大小写更改'), check('whiteSpace', '空格/空白'), check('tables', '表格')),
      hint(combine ? '结果将保留原文档及其自身的修订和批注，并将修订副本的差异作为跟踪修订添加。' : '结果为修订文档，自原文档以来的所有更改将显示为跟踪修订。其批注将被保留。')),
    status,
    el('div.modal-actions', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), run));
  // Closing the dialog while documents are still being read or compared abandons the comparison.
  let closed = false;
  const modal = openModal({ title: combine ? '合并文档' : '比较文档', content, wide: true, onClose: () => { closed = true; } });
  if (editor() && pkg()) (combine ? original : revised).current();
  // Compare with an earlier version (Version History): that version is the original, and the comparison runs at once.
  if (presetOriginal) { original.set(presetOriginal); refresh(); queueMicrotask(() => content.requestSubmit()); }
  refresh();

  async function compare() {
    const api = engineApi(); if (!api) throw new Error('编辑器仍在加载中。');
    const [a, b] = await Promise.all([sources.original.read(), sources.revised.read()]);
    if (closed) return;
    const [originalPkg, revisedPkg] = await Promise.all([api.DocxPackage.open(a), api.DocxPackage.open(b)]);
    if (closed) return;
    if (originalPkg.readOnly || revisedPkg.readOnly) throw new Error('其中一个文档使用了此编辑器仅可显示的特性，因此无法进行比较。');
    const basePkg = combine ? originalPkg : revisedPkg, otherPkg = combine ? revisedPkg : originalPkg;
    const label2 = label.value.trim() || api.documentAuthor(revisedPkg.parts) || author() || '作者';
    const result = api.mergeDocuments({ paragraphs: basePkg.paragraphs, tables: basePkg.tables }, { paragraphs: otherPkg.paragraphs, tables: otherPkg.tables }, {
      mode, author: label2, granularity: options.granularity, formatting: options.formatting !== false, caseChanges: options.caseChanges !== false, whiteSpace: options.whiteSpace !== false, tables: options.tables !== false,
      styleIds: new Set(Object.keys(basePkg.styles?.definitions || {})),
      numbering: basePkg.numbering,
    });
    const blob = basePkg.export(result.paragraphs, basePkg.pageSettings, basePkg.numbering, basePkg.styles, result.tables, basePkg.assets, undefined, basePkg.comments);
    const stem = name => name.replace(/ \(当前打开\)$/, '').replace(/ \(open now\)$/, '').replace(/\.docx$/i, '');
    const name = combine ? `合并文档-${stem(sources.original.name)}.docx` : `比较文档-${stem(sources.original.name)}与${stem(sources.revised.name)}.docx`;
    showResult({ result, originalPkg, revisedPkg, blob, name, label: label2 });
  }

  function showResult({ result, originalPkg, revisedPkg, blob, name, label: who }) {
    const { stats } = result;
    const columns = [column(`原文档: ${sources.original.name}`, originalPkg.paragraphs), column(combine ? '合并结果' : '比较结果', result.paragraphs, true), column(`修订的文档: ${sources.revised.name}`, revisedPkg.paragraphs)];
    // The three columns scroll together.
    const scrollers = columns.map(c => c.querySelector('.rv-compare-scroll'));
    let syncing = false;
    for (const s of scrollers) s.addEventListener('scroll', () => {
      if (syncing) return; syncing = true;
      const share = s.scrollTop / Math.max(1, s.scrollHeight - s.clientHeight);
      for (const other of scrollers) if (other !== s) other.scrollTop = share * (other.scrollHeight - other.clientHeight);
      requestAnimationFrame(() => { syncing = false; });
    });
    const summary = el('p.rv-status', {}, `${stats.inserted.toLocaleString()} 字符插入，${stats.deleted.toLocaleString()} 字符删除${stats.formatted ? `，${stats.formatted} 处格式更改` : ''}，标记为“${who}”。`);
    const view = openModal({ title: combine ? '合并的文档' : '比较的文档', wide: true, content: el('div.ed-dialog-body.rv-compare-result', {},
      summary, el('div.rv-compare-columns', {}, ...columns),
      el('div.modal-actions', {},
        el('button.btn.btn-ghost', { type: 'button', onclick: () => P.downloadBlob(blob, name) }, '下载'),
        el('button.btn.btn-primary', { type: 'button', onclick: async () => { view.close(); try { await openDocument(new File([blob], name, { type: P.DOCX_MIME })); } catch (e) { error(e); } } }, '打开文档'))) });
  }
  return modal;
}
