// Layer Comps panel: saved combinations of layer visibility, position and
// appearance that can be switched, updated and exported as files or a PDF.
import type { Editor } from '../../editor';
import type { DocumentSession } from '../../app/session';
import { registerCommand, registerPanel, type MenuItem, type Panel } from '../../app/registry';
import { svg } from '../../app/icons';
import { escapeXML } from '../../model/assets';
import type { PhotoDocument } from '../../model/document';
import {
  applyLayerComp,
  captureLayers,
  compMatches,
  missingLayers,
  maxCompNameLength,
  maxLayerComps,
  newLayerComp,
  recaptureAspects,
  updateLayerComp,
  type LayerComp,
  type LayerCompCapture,
  type LayerCompState,
} from '../../model/layer-comps';
import { fieldChecked, fieldValue, modal } from '../files/ui';
import type { ExportPage } from './page-export';
import { lazy } from '../../app/lazy';

// Exporting pages loads on first use.
const pageExport = lazy(() => import('./page-export'));

const everything: LayerCompCapture = { visibility: true, position: true, appearance: true };
// Per open document: the selected comp and the document state from before
// the first comp was applied ("Last Document State").
type CompSession = { selected?: string; last?: Record<string, LayerCompState> };
const sessions = new WeakMap<DocumentSession, CompSession>();
function state(e: Editor): CompSession {
  let s = sessions.get(e.session);
  if (!s) sessions.set(e.session, (s = {}));
  return s;
}
const comps = (e: Editor) => e.doc.layerComps ?? [];
const find = (e: Editor, id: string | undefined) => comps(e).find((c) => c.id === id);
function canAddComp(e: Editor) {
  if (comps(e).length < maxLayerComps) return true;
  e.message(`This document already has ${maxLayerComps} layer comps. Delete one before adding another.`);
  return false;
}
/** Selected comp, or the last applied one. */
function current(e: Editor) {
  return find(e, state(e).selected) ?? find(e, e.doc.lastComp);
}
/** The comp the document currently shows, if any. */
function shown(e: Editor) {
  const c = find(e, e.doc.lastComp);
  return c && compMatches(e.doc, c) ? c : undefined;
}

function nextName(e: Editor) {
  const used = new Set(comps(e).map((c) => c.name));
  let n = comps(e).length + 1;
  while (used.has(`图层复合 ${n}`)) n++;
  return `图层复合 ${n}`;
}

/** New comp / options dialog. Comments are optional, so this uses the free-form modal. */
async function compDialog(title: string, submit: string, init: { name: string; capture: LayerCompCapture; comment?: string }) {
  const check = (name: keyof LayerCompCapture, label: string) =>
    `<label class="dialog-field checkbox-field">${label}<input name="${name}" type="checkbox" ${init.capture[name] ? 'checked' : ''}></label>`;
  const result = await modal({
    title,
    submit,
    className: 'comp-dialog',
    body: `<label class="dialog-field">名称<input name="name" type="text" required maxlength="${maxCompNameLength}" value="${escapeXML(init.name)}"></label>
      <fieldset class="comp-capture"><legend>应用于图层</legend>${check('visibility', '可见性')}${check('position', '位置')}${check('appearance', '外观 (不透明度、混合模式、样式)')}</fieldset>
      <label class="dialog-field">注释<textarea name="comment" rows="3" maxlength="4096" placeholder="可选">${escapeXML(init.comment ?? '')}</textarea></label>`,
    bind: (dialog) => dialog.querySelector<HTMLInputElement>('[name=name]')?.select(),
  });
  if (!result) return null;
  const f = result.form;
  const out = {
    name: fieldValue(f, 'name').trim() || init.name,
    capture: { visibility: fieldChecked(f, 'visibility'), position: fieldChecked(f, 'position'), appearance: fieldChecked(f, 'appearance') },
    comment: (f.elements.namedItem('comment') as HTMLTextAreaElement).value.trim(),
  };
  result.close();
  return out;
}

function setComps(e: Editor, label: string, edit: (list: LayerComp[], d: PhotoDocument) => LayerComp[]) {
  e.command(label, (d) => {
    const list = edit([...(d.layerComps ?? [])], d);
    if (list.length) d.layerComps = list;
    else delete d.layerComps;
    if (d.lastComp && !list.some((c) => c.id === d.lastComp)) delete d.lastComp;
  });
}

async function newComp(e: Editor) {
  if (!canAddComp(e)) return;
  const v = await compDialog('新建图层复合', '确定', { name: nextName(e), capture: { visibility: true, position: true, appearance: false } });
  if (!v || !canAddComp(e)) return;
  const comp = newLayerComp(e.doc, v.name, v.capture, v.comment || undefined);
  setComps(e, '新建图层复合', (list, d) => {
    d.lastComp = comp.id;
    return [...list, comp];
  });
  state(e).selected = comp.id;
  e.dock.update();
}

function applyComp(e: Editor, comp: LayerComp) {
  const s = state(e);
  // Leaving the document's own state: remember it so it can be restored.
  if (!shown(e)) s.last = captureLayers(e.doc, everything);
  let missing = 0;
  e.command(`应用图层复合`, (d) => {
    missing = applyLayerComp(d, comp).missing;
    d.lastComp = comp.id;
  });
  s.selected = comp.id;
  if (missing) e.message(`“${comp.name}”无法恢复 ${missing} 个已删除的图层。更新此图层复合以清除此警告。`);
  e.dock.update();
}

function restoreLast(e: Editor) {
  const last = state(e).last;
  if (!last) return;
  const synthetic: LayerComp = { id: '', name: '上一个文档状态', capture: everything, layers: last };
  e.command('应用上一个文档状态', (d) => {
    applyLayerComp(d, synthetic);
    delete d.lastComp;
  });
  state(e).selected = undefined;
  e.dock.update();
}

function step(e: Editor, by: 1 | -1) {
  const list = comps(e);
  if (!list.length) return;
  const at = list.indexOf(current(e)!);
  const i = at < 0 ? (by > 0 ? 0 : list.length - 1) : (at + by + list.length) % list.length;
  applyComp(e, list[i]);
}

async function options(e: Editor, id?: string) {
  const comp = find(e, id) ?? current(e);
  if (!comp) return;
  const v = await compDialog('图层复合选项', '确定', comp);
  if (!v) return;
  setComps(e, '图层复合选项', (list, d) =>
    list.map((c) => {
      if (c.id !== comp.id) return c;
      const next = recaptureAspects(d, c, v.capture);
      next.name = v.name;
      if (v.comment) next.comment = v.comment;
      else delete next.comment;
      return next;
    }),
  );
}

/** Pages for exporting: the canvas with each comp applied. */
function compPages(e: Editor): ExportPage[] {
  return comps(e).map((comp) => {
    const doc = structuredClone({ ...e.doc, selection: null, selectionMask: null });
    applyLayerComp(doc, comp);
    // Moving pixel layers shifts their transforms; bake that as the history would.
    e.normalizePixelLayers(doc, e.assets);
    return { name: comp.name, doc };
  });
}

const hasComps = (e: Editor) => e.hasDocument && comps(e).length > 0;
const hasCurrent = (e: Editor) => !!current(e);

const compsPanel: Panel = {
  id: 'layer-comps',
  title: '图层复合',
  icon: 'layer-comps',
  location: 'strip',
  mount: (e, el) => {
    el.classList.add('comps-panel');
    el.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const apply = t.closest<HTMLElement>('[data-comp-apply]');
      if (apply) {
        const id = apply.dataset.compApply!;
        if (id) void e.runCommand('comps.apply', id);
        else void e.runCommand('comps.restore-last');
        return;
      }
      const row = t.closest<HTMLElement>('[data-comp]');
      if (row) {
        // Select in place: re-rendering would replace the row between the
        // two clicks of a double-click.
        state(e).selected = row.dataset.comp || undefined;
        for (const r of el.querySelectorAll('.comp-row')) r.classList.toggle('selected', r === row);
        for (const b of el.querySelectorAll<HTMLButtonElement>('[data-command="comps.update"],[data-command="comps.delete"]')) b.disabled = !row.dataset.comp;
      }
    });
    el.addEventListener('dblclick', (ev) => {
      const row = (ev.target as HTMLElement).closest<HTMLElement>('[data-comp]');
      if (row?.dataset.comp) void e.runCommand('comps.options', row.dataset.comp);
    });
  },
  update: (e, el) => {
    const scrollTop = el.querySelector('.comps-list')?.scrollTop ?? 0;
    const s = state(e);
    const list = comps(e);
    const on = shown(e);
    const selected = find(e, s.selected);
    const marker = (active: boolean, id: string, name: string) =>
      `<button class="comp-apply" data-comp-apply="${escapeXML(id)}" aria-pressed="${active}" title="${active ? '已在文档中显示' : `应用 ${escapeXML(name)}`}" aria-label="应用 ${escapeXML(name)}">${active ? svg('layer-comps', 14) : ''}</button>`;
    const rows = list
      .map((c) => {
        const missing = missingLayers(e.doc, c).length;
        const aspects = [c.capture.visibility && '可见性', c.capture.position && '位置', c.capture.appearance && '外观'].filter(Boolean).join('、') || '无';
        const tip = `${c.name} — 恢复${aspects}${c.comment ? `\n${c.comment}` : ''}`;
        return `<div class="comp-row ${selected === c ? 'selected' : ''}" data-comp="${escapeXML(c.id)}" role="listitem" title="${escapeXML(tip)}">${marker(on === c, c.id, c.name)}<span class="comp-name">${escapeXML(c.name)}</span>${
          missing
            ? `<span class="comp-warning" role="img" aria-label="无法完全恢复" title="${missing} 个图层已不存在。更新此图层复合以清除此警告。">${svg('info', 14)}</span>`
            : ''
        }${c.comment ? `<span class="comp-comment">${escapeXML(c.comment)}</span>` : ''}</div>`;
      })
      .join('');
    const lastRow = `<div class="comp-row last-state ${!selected ? 'selected' : ''}" data-comp="" role="listitem">${marker(!on, '', '上一个文档状态')}<span class="comp-name">上一个文档状态</span></div>`;
    const empty = list.length ? '' : `<p class="comps-empty">将图层的可见性、位置和外观保存为图层复合，以便在不同版式布局之间快速切换。</p>`;
    const button = (cmd: string, icon: string, label: string, enabled: boolean) =>
      `<button data-command="${cmd}" aria-label="${label}" title="${label}" ${enabled ? '' : 'disabled'}>${svg(icon, 15)}</button>`;
    el.innerHTML = `<div class="comps-list" role="list">${lastRow}${rows}</div>${empty}<div class="layer-footer">${button('comps.prev', 'chevron-left', '应用上一个复合', list.length > 0)}${button('comps.next', 'chevron-right', '应用下一个复合', list.length > 0)}<span class="comps-spacer"></span>${button('comps.update', 'refresh-cw', '更新选定的复合', !!selected)}${button('comps.new', 'plus', '创建新图层复合', e.hasDocument)}${button('comps.delete', 'trash-2', '删除选定的复合', !!selected)}</div>`;
    el.querySelector('.comps-list')!.scrollTop = scrollTop;
  },
  menu: (): MenuItem[] => ['comps.new', 'comps.duplicate', 'comps.delete', '-', 'comps.update', 'comps.update-all', 'comps.options', '-', 'comps.apply', 'comps.prev', 'comps.next', 'comps.restore-last', '-', 'file.export-comps-files', 'file.export-comps-pdf'],
};

export function installLayerComps(e: Editor) {
  void e;
  registerPanel(compsPanel);
  registerCommand(
    { id: 'comps.new', label: '新建图层复合…', run: (e) => newComp(e), enabled: (e) => e.hasDocument, recordable: false },
    {
      id: 'comps.duplicate',
      label: '复制图层复合',
      enabled: hasCurrent,
      run: (e) => {
        const c = current(e);
        if (!c || !canAddComp(e)) return;
        // Reserve room for the suffix without splitting a Unicode surrogate pair.
        const name = c.name.slice(0, maxCompNameLength - 5).replace(/[\uD800-\uDBFF]$/, '');
        const copy = { ...structuredClone(c), id: crypto.randomUUID(), name: `${name} 副本` };
        setComps(e, '复制图层复合', (list) => {
          list.splice(list.findIndex((x) => x.id === c.id) + 1, 0, copy);
          return list;
        });
        state(e).selected = copy.id;
        e.dock.update();
      },
    },
    {
      id: 'comps.delete',
      label: '删除图层复合',
      enabled: hasCurrent,
      run: (e) => {
        const c = current(e);
        if (!c) return;
        setComps(e, '删除图层复合', (list) => list.filter((x) => x.id !== c.id));
        state(e).selected = undefined;
        e.dock.update();
      },
    },
    {
      id: 'comps.update',
      label: '更新图层复合',
      description: '将当前图层状态捕获到选定的复合中',
      enabled: hasCurrent,
      run: (e) => {
        const c = current(e);
        if (!c) return;
        setComps(e, '更新图层复合', (list, d) => {
          d.lastComp = c.id;
          return list.map((x) => (x.id === c.id ? updateLayerComp(d, x) : x));
        });
      },
    },
    {
      id: 'comps.update-all',
      label: '更新所有图层复合',
      description: '将当前图层状态捕获到所有复合中，保留每个复合的选项',
      enabled: hasComps,
      run: (e) => setComps(e, '更新所有图层复合', (list, d) => list.map((x) => updateLayerComp(d, x))),
    },
    {
      id: 'comps.apply',
      label: '应用图层复合',
      enabled: hasComps,
      run: (e, arg) => {
        const c = find(e, typeof arg === 'string' ? arg : undefined) ?? current(e) ?? comps(e)[0];
        if (c) applyComp(e, c);
      },
    },
    { id: 'comps.prev', label: '应用上一个图层复合', enabled: hasComps, run: (e) => step(e, -1) },
    { id: 'comps.next', label: '应用下一个图层复合', enabled: hasComps, run: (e) => step(e, 1) },
    {
      id: 'comps.restore-last',
      label: '应用上一个文档状态',
      description: '返回应用复合之前的图层状态',
      enabled: (e) => !!state(e).last && !!shown(e),
      run: (e) => restoreLast(e),
    },
    { id: 'comps.options', label: '图层复合选项…', enabled: hasCurrent, run: (e, arg) => options(e, typeof arg === 'string' ? arg : undefined), recordable: false },
    {
      id: 'file.export-comps-files',
      label: '图层复合导出为文件…',
      description: '将每个图层复合保存为图像文件',
      enabled: hasComps,
      recordable: false,
      run: async (e) => (await pageExport()).exportPagesToFiles(e, { title: '导出图层复合为文件', noun: '图层复合', pages: compPages(e), base: e.doc.name }),
      prefetch: pageExport.prefetch,
    },
    {
      id: 'file.export-comps-pdf',
      label: '图层复合导出为 PDF…',
      description: '将所有图层复合保存为单份 PDF 中的各个页面',
      enabled: hasComps,
      recordable: false,
      run: async (e) => (await pageExport()).exportPagesToPdf(e, { title: '导出图层复合为 PDF', noun: '图层复合', pages: compPages(e), base: e.doc.name }),
      prefetch: pageExport.prefetch,
    },
  );
}
