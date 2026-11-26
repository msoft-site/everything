import type { Editor } from '../../editor';
import { commands, type Panel } from '../../app/registry';
import { escapeXML } from '../../model/assets';
import { svg } from '../../app/icons';
import { formDialog } from '../../ui/dialog';
import { maskToSvg } from './geometry';
import { activeKey, listedPaths, nextPathName, setActive, targetPath, type PathTarget } from './state';

// Paths panel: the selected shape layer's path and vector mask, the work path
// and saved document paths, with the classic footer actions.
function thumb(e: Editor, t: PathTarget) {
  const W = e.doc.width, H = e.doc.height;
  const d = maskToSvg(t.mask);
  return `<svg class="path-thumb" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect width="${W}" height="${H}" class="path-thumb-bg"/><path d="${d}" fill-rule="${t.mask.paths[0]?.fillRule === 'even-odd' ? 'evenodd' : 'nonzero'}" class="path-thumb-fill"/></svg>`;
}
export async function savePathDialog(e: Editor, t: PathTarget) {
  if (t.kind === 'saved') {
    const v = await formDialog('重命名路径', [{ name: 'name', label: '名称', value: t.name }], '确定');
    if (v?.name) e.command('重命名路径', (d) => (d.paths!.find((p) => p.id === t.id)!.name = v.name));
    return;
  }
  const name = nextPathName(e.doc);
  const v = await formDialog('存储路径', [{ name: 'name', label: '名称', value: name }], '确定');
  if (!v) return;
  const id = crypto.randomUUID();
  e.command('存储路径', (d) => {
    d.paths = [...(d.paths ?? []), { id, name: v.name || name, mask: structuredClone(t.mask) }];
    if (t.kind === 'work') delete d.workPath;
  });
  setActive(e, `path:${id}`);
  e.update();
}
let lastClick = { key: '', time: 0 };
export const pathsPanel: Panel = {
  id: 'paths',
  title: '路径',
  icon: 'path-panel',
  location: 'dock-bottom',
  mount: (e, el) => {
    el.classList.add('paths-panel');
    el.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      if (target.closest('[data-command]')) return;
      const row = target.closest<HTMLElement>('[data-path-key]');
      if (!row) {
        if (target.closest('.path-list')) {
          // Clicking empty space deselects the path (hides it).
          setActive(e, 'none');
          e.update();
        }
        return;
      }
      const key = row.dataset.pathKey!;
      // Double-click saves or renames. Detected from click times because the
      // first click re-renders the list, so the browser's dblclick never fires.
      const now = ev.timeStamp;
      const double = lastClick.key === key && now - lastClick.time < 500;
      lastClick = double ? { key: '', time: 0 } : { key, time: now };
      setActive(e, key.startsWith('layer:') ? undefined : key);
      e.update();
      // Mod-click (or a click on the thumbnail with Mod) loads the path as a selection.
      if (ev.metaKey || ev.ctrlKey) void e.runCommand('path.make-selection');
      else if (double) {
        const t = listedPaths(e).find((p) => activeKey(p) === key);
        if (t && (t.kind === 'work' || t.kind === 'saved')) void savePathDialog(e, t);
      }
    });
    el.addEventListener('keydown', (ev) => {
      const row = (ev.target as HTMLElement).closest<HTMLElement>('[data-path-key]');
      if (!row) return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        row.click();
      } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        const rows = [...el.querySelectorAll<HTMLElement>('[data-path-key]')];
        rows[(rows.indexOf(row) + (ev.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
      }
    });
  },
  update: (e, el) => {
    const list = listedPaths(e);
    const active = targetPath(e);
    const activeK = active ? activeKey(active) : '';
    const rows = list
      .map((t) => {
        const key = activeKey(t);
        const italic = t.kind !== 'saved';
        return `<div class="path-row ${key === activeK ? 'selected' : ''}" data-path-key="${escapeXML(key)}" role="option" tabindex="0" aria-selected="${key === activeK}" title="${t.kind === 'work' ? '双击以存储工作路径' : t.kind === 'saved' ? '双击以重命名' : ''}">${thumb(e, t)}<span class="path-name">${italic ? `<i>${escapeXML(t.name)}</i>` : escapeXML(t.name)}</span></div>`;
      })
      .join('');
    const focused = (document.activeElement as HTMLElement | null)?.closest?.('[data-path-key]')?.getAttribute('data-path-key');
    el.innerHTML = `<div class="path-list" role="listbox" aria-label="路径列表">${rows || '<p class="muted path-empty">没有路径。使用钢笔或在“路径”模式下的形状工具进行绘制。</p>'}</div><div class="layer-footer"><button data-command="path.fill" title="用前景色填充路径" aria-label="用前景色填充路径">${svg('path-fill', 16)}</button><button data-command="path.stroke" title="用画笔描边路径" aria-label="用画笔描边路径">${svg('path-stroke', 16)}</button><button data-command="path.make-selection" title="将路径作为选区载入" aria-label="将路径作为选区载入">${svg('circle-dashed', 16)}</button><button data-command="path.from-selection" title="从选区生成工作路径" aria-label="从选区生成工作路径">${svg('path-from-selection', 16)}</button><button data-command="layer.vmask-current-path" title="添加矢量蒙版" aria-label="添加矢量蒙版">${svg('mask-add', 16)}</button><button data-command="path.new" title="创建新路径" aria-label="创建新路径">${svg('plus', 16)}</button><button data-command="path.delete" title="删除路径" aria-label="删除路径">${svg('trash-2', 16)}</button></div>`;
    if (focused) el.querySelector<HTMLElement>(`[data-path-key="${CSS.escape(focused)}"]`)?.focus();
    for (const b of el.querySelectorAll<HTMLButtonElement>('.layer-footer [data-command]')) {
      const id = b.dataset.command!;
      b.disabled = !commandEnabled(e, id);
    }
  },
  menu: () => ['path.new', 'path.save', 'path.duplicate', 'path.delete', '-', 'path.from-selection-dialog', 'path.make-selection-dialog', 'path.fill-dialog', 'path.stroke-dialog', '-', 'layer.vmask-current-path', 'edit.define-shape'],
};
function commandEnabled(e: Editor, id: string) {
  const c = commands.get(id);
  return !!c && (c.enabled?.(e) ?? true);
}
