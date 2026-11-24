/**
 * Insert → Chart: a chart type, a small data grid and a live preview. The chart is written as a
 * chart part (c:chartSpace, ECMA-376 Part 1 §21.2) with its data inline, referenced from an inline
 * drawing; editing the data writes a new chart part and replaces the drawing in one undo step.
 */
import { el } from '../ui/dom.js';
import { formDialog } from './insert-dialogs.js';
import { CHART_TYPES, CHART_PALETTE, CHART_CONTENT_TYPE, CHART_RELATIONSHIP_TYPE, chartSpaceXml, defaultChartData, chartDataFromXml } from '../engine/chart-builder.js';
import { drawingFrame, freshPart, readDrawingFragment, carriedFrame, EMU_PER_INCH } from '../engine/inserted-drawings.js';

/** A chart drawing fragment: the chart part and the inline frame that references it. */
export async function chartFragment(model, packageParts, data, { id, width = 5.5 * EMU_PER_INCH, height = 3.2 * EMU_PER_INCH }) {
  const xml = chartSpaceXml(data), part = freshPart(model, packageParts, 'charts', 'canvas-chart', 'xml');
  const graphic = `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="${part.relId}"/></a:graphicData></a:graphic>`;
  try {
    return await readDrawingFragment(drawingFrame({ id, name: `Chart ${id}`, descr: data.title ? `Chart: ${data.title}` : '', width, height, graphic }),
      { parts: [{ ...part, bytes: xml, contentType: CHART_CONTENT_TYPE, relType: CHART_RELATIONSHIP_TYPE }] });
  } catch (e) {
    // The chart reader keeps Latin text only; its own message ("…the original file…") describes opening a file.
    if (/mixed-script/.test(e.message)) throw new Error('在此版本中，图表标签必须使用拉丁字母。请重命名类别或系列后重试。');
    if (/title script|line breaks/.test(e.message)) throw new Error('在此版本中，图表标题必须为单行拉丁字母且不包含表情符号。请修改标题后重试。');
    throw e;
  }
}

/** The chart XML behind a chart image: its inserted part, or the opened document's part. */
export function chartXml(image, assets, packageParts) {
  const parts = assets[image.assetId]?.packageParts;
  const bytes = parts?.find(p => p.path === image.assetId)?.bytes || packageParts?.[image.assetId];
  return bytes ? (typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes)) : null;
}

/** Chart dialog: type, title, legend and a data grid of categories × series, with a preview. */
/** Remove category `index` from chart data: its values, and its slice colors (pie and doughnut charts color each category). */
export function removeChartRow(data, index) {
  data.categories.splice(index, 1);
  for (const s of data.series) { s.values.splice(index, 1); s.colors?.splice(index, 1); }
}

export function openChartDialog({ initial = null, onInsert, onClose }) {
  const data = structuredClone(initial || defaultChartData('column-clustered'));
  let type = data.type;
  const groups = [...new Set(CHART_TYPES.map(t => t.group))];
  const typeList = el('div.insert-chart-types', { role: 'listbox', 'aria-label': '图表类型' });
  // One tab stop: the arrow keys, Home and End choose among the types.
  const options = CHART_TYPES.map(t => el('button.insert-chart-type', { type: 'button', role: 'option', 'aria-selected': String(t.id === type), tabindex: t.id === type ? 0 : -1, dataset: { type: t.id }, onclick: () => setType(t.id) }, t.label));
  for (const group of groups) typeList.append(el('div.menu-header', { role: 'presentation' }, group), ...options.filter(o => CHART_TYPES.find(t => t.id === o.dataset.type).group === group));
  typeList.addEventListener('keydown', e => {
    const at = options.indexOf(document.activeElement);
    const next = { ArrowDown: at + 1, ArrowRight: at + 1, ArrowUp: at - 1, ArrowLeft: at - 1, Home: 0, End: options.length - 1 }[e.key];
    if (at < 0 || next === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const option = options[Math.max(0, Math.min(options.length - 1, next))];
    option.focus(); setType(option.dataset.type);
  });
  const title = el('input.input', { type: 'text', value: data.title || '', 'aria-label': '图表标题' });
  const legend = el('select.input', { 'aria-label': '图例' }, el('option', { value: 'r' }, '靠右'), el('option', { value: 'b' }, '靠下'), el('option', { value: '' }, '无'));
  legend.value = data.legend ?? '';
  const grid = el('table.insert-chart-grid', { 'aria-label': '图表数据' });
  const preview = el('canvas.insert-chart-preview', { width: 440, height: 260, 'aria-hidden': 'true' });
  const status = el('p.field-hint', { 'aria-live': 'polite' });
  const single = () => ['pie', 'doughnut'].includes(type);
  // A pie or doughnut shows the first series only. The others stay in the data, hidden, so passing over
  // those types (the arrow keys choose as they go) does not delete them.
  const shown = () => single() ? data.series.slice(0, 1) : data.series;
  function setType(next) {
    type = next;
    for (const o of options) { o.setAttribute('aria-selected', String(o.dataset.type === type)); o.tabIndex = o.dataset.type === type ? 0 : -1; }
    drawGrid(); render();
  }
  // A value cell holds what was typed; one that is not a number ("1,200", "12%", "$5") is marked, and Insert
  // says which, rather than saving it as 0.
  const numberOf = value => { const text = String(value ?? '').trim(); return text === '' ? 0 : Number(text); };
  // Chart parts hold values up to a trillion either way (the reader refuses larger ones); a larger value is
  // marked and refused rather than saved as a trillion.
  const LARGEST = 1e12;
  const usable = value => { const n = numberOf(value); return Number.isFinite(n) && Math.abs(n) <= LARGEST; };
  const cellInput = (value, label, onInput, numeric = false) => el('input.input', { type: 'text', inputMode: numeric ? 'decimal' : 'text', value: String(value ?? ''), 'aria-label': label,
    oninput: e => { onInput(e.target.value); if (numeric) { if (usable(e.target.value)) e.target.removeAttribute('aria-invalid'); else e.target.setAttribute('aria-invalid', 'true'); } render(); } });
  function drawGrid(focus) {
    const head = el('tr', {}, el('th', {}, ''), ...shown().map((s, j) => el('th', {}, cellInput(s.name, `系列 ${j + 1} 名称`, v => { s.name = v; }))),
      el('th', {}, el('button.btn.btn-ghost.btn-sm', { type: 'button', disabled: single() || data.series.length >= 20, title: '添加系列', dataset: { action: 'addSeries' }, onclick: () => { data.series.push({ name: `系列 ${data.series.length + 1}`, values: data.categories.map(() => 0), color: CHART_PALETTE[data.series.length % CHART_PALETTE.length] }); drawGrid(() => [...grid.querySelectorAll('thead input')].at(-1)); render(); } }, '+ 系列')));
    const body = data.categories.map((category, i) => el('tr', {}, el('th', {}, cellInput(category, `类别 ${i + 1}`, v => { data.categories[i] = v; })),
      ...shown().map((s, j) => el('td', {}, cellInput(s.values[i], `${s.name || `系列 ${j + 1}`}, ${category}`, v => { s.values[i] = v; }, true))),
      el('td', {}, el('button.icon-btn.insert-chart-remove', { type: 'button', 'aria-label': `删除 ${category || `第 ${i + 1} 行`}`, title: '删除行', disabled: data.categories.length <= 1, onclick: () => { removeChartRow(data, i); drawGrid(() => { const removes = grid.querySelectorAll('.insert-chart-remove'), next = removes[Math.min(i, removes.length - 1)]; return next && !next.disabled ? next : grid.querySelector('[data-action="addRow"]'); }); render(); } }, '×'))));
    const foot = el('tr', {}, el('td', { colSpan: shown().length + 2 },
      el('button.btn.btn-ghost.btn-sm', { type: 'button', disabled: data.categories.length >= 100, dataset: { action: 'addRow' }, onclick: () => { data.categories.push(type.startsWith('scatter') ? String(data.categories.length + 1) : `类别 ${data.categories.length + 1}`); for (const s of data.series) s.values.push(0); drawGrid(() => [...grid.querySelectorAll('tbody th input')].at(-1)); render(); } }, '+ 行'),
      shown().length > 1 ? el('button.btn.btn-ghost.btn-sm', { type: 'button', dataset: { action: 'removeSeries' }, onclick: () => { data.series.pop(); drawGrid(() => grid.querySelector('[data-action="removeSeries"]') || grid.querySelector('[data-action="addSeries"]')); render(); } }, '− 系列') : null));
    grid.replaceChildren(el('thead', {}, head), el('tbody', {}, ...body, foot));
    // Rebuilding the grid removes the button just used, and focus with it: `focus` names the control that
    // takes its place (the new row's or series' name, selected so typing replaces it, or the next Remove button).
    const target = focus?.();
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  }
  const current = () => ({ type, title: title.value.trim(), legend: legend.value || null, categories: data.categories.map(c => String(c)), series: shown().map((s, j) => ({ name: s.name || `Series ${j + 1}`, values: s.values.map(v => usable(v) ? numberOf(v) : 0), color: s.color || CHART_PALETTE[j % CHART_PALETTE.length], ...(s.colors ? { colors: s.colors } : {}) })) });
  let pending = 0;
  async function render() {
    const ticket = ++pending;
    try {
      const { chart, fragmentAsset } = await previewChart(current());
      if (ticket !== pending) return;
      const ctx = preview.getContext('2d'), ratio = window.devicePixelRatio || 1;
      preview.width = 440 * ratio; preview.height = 260 * ratio; preview.style.width = '440px'; preview.style.height = '260px';
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, 440, 260);
      const { paintChart } = await import('../engine/canvas-charts.js');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 440, 260); paintChart(ctx, chart, 440, 260);
      status.textContent = ''; void fragmentAsset;
    } catch (e) { if (ticket === pending) status.textContent = e.message; }
  }
  title.addEventListener('input', render); legend.addEventListener('change', render);
  const dialog = formDialog({ title: initial ? '编辑图表' : '插入图表', submit: initial ? '更新' : '插入', wide: true, className: 'insert-chart', onClose, content: [
    el('div.insert-chart-layout', {}, typeList, el('div.insert-chart-editor', {}, el('div.insert-chart-meta', {}, el('label.field', {}, el('span.field-label', {}, '标题'), title), el('label.field', {}, el('span.field-label', {}, '图例'), legend)),
      preview, status, el('div.insert-chart-data', {}, grid)))],
  onSubmit: () => {
    for (const [j, s] of shown().entries()) for (const [i, v] of s.values.entries()) {
      if (!Number.isFinite(numberOf(v))) throw new Error(`“${String(v).trim()}” (${s.name || `系列 ${j + 1}`}, ${data.categories[i]}) 不是有效数字。请输入如 1200 或 1.5 的纯数字，不要包含分隔符、符号或单位。`);
      if (!usable(v)) throw new Error(`“${String(v).trim()}” (${s.name || `系列 ${j + 1}`}, ${data.categories[i]}) 数值过大。请输入 −1,000,000,000,000 到 1,000,000,000,000 之间的数字。`);
    }
    return onInsert(current());
  } });
  drawGrid(); render(); options.find(o => o.dataset.type === type)?.focus();
  return dialog.modal;
}

/** The decoded chart model for data, read through the same reader the document uses. */
async function previewChart(data) {
  const fragment = await chartFragment({ assets: {} }, {}, data, { id: 1, width: 440 * 9525, height: 260 * 9525 });
  return { chart: fragment.assets[fragment.image.assetId].chart, fragmentAsset: fragment.assets[fragment.image.assetId] };
}

/** Chart commands for the Insert tab, on top of the hub's drawing insertion. */
export function chartCommands({ hub, pkg, editor }) {
  const selectedChart = () => { const image = hub.ready()?.model.selectedImage; return image?.kind === 'chart' ? image : null; };
  function open(edit) {
    const engine = hub.ready(); if (!engine) return;
    const image = edit ? selectedChart() : null;
    let initial = null;
    if (image) {
      const xml = chartXml(image, engine.model.assets, pkg().parts);
      try { initial = xml ? chartDataFromXml(xml) : null; } catch { initial = null; }
      if (!initial) { hub.fail(new Error('此图表的数据无法在此编辑，已保留原样。')); return; }
    }
    openChartDialog({ initial, onClose: () => queueMicrotask(() => editor()?.focus()), onInsert: data => hub.insertDrawing(async (engine, id) => {
      const width = image ? image.width : Math.min(hub.textWidth(engine), 5.5 * EMU_PER_INCH), height = image ? image.height : Math.round(width * 0.58);
      const fragment = await chartFragment(engine.model, pkg().parts, data, { id, width, height });
      if (!image) return fragment;
      // An edited chart keeps its frame (position, wrapping, title, decorative mark) and the alt text the
      // reader wrote; alt text made from the old title follows the new one.
      const generated = image.alt === (initial.title ? `Chart: ${initial.title}` : '');
      const alt = generated ? fragment.image.alt : image.alt;
      let shell = carriedFrame(image.shell, fragment.image.shell, new Set());
      if (generated) shell = shell.replace(/(<wp:docPr\b[^>]*?)\sdescr="[^"]*"/, '$1').replace(/<wp:docPr\b/, alt ? `$& descr="${alt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}"` : '$&');
      return { ...fragment, image: { ...fragment.image, ...(image.anchor ? { anchor: image.anchor } : {}), ...(image.title !== undefined ? { title: image.title } : {}), ...(image.decorative !== undefined ? { decorative: image.decorative } : {}), name: image.name, alt, shell } };
    }, { replace: image }) });
  }
  return { insertChart: () => open(!!selectedChart()), editChart: () => open(true), selectedChart };
}
