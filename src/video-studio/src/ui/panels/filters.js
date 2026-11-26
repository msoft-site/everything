/**
 * Filters tab: color looks. Clicking applies the look to the selected clip;
 * with no clip selected (or by dragging) it adds a filter clip that grades
 * everything below it.
 */
import { h } from '../../lib/dom.js';
import { FILTERS, FILTER_CATEGORIES } from '../../model/catalog.js';
import { tabLayout, tileGrid, tile, emptyState } from './common.js';
import { lookPreview, hoverAnimate, matchesLook } from './previews.js';

export function filtersTab(ctx) {
  const { store, actions } = ctx;
  const selectedVisual = () => {
    const s = store.selected;
    return s && (s.clip.type === 'video' || s.clip.type === 'image') ? s.clip : null;
  };
  const hint = h('p.asset-hint', { role: 'status' });
  let shown = null; // the selected clip's filter the tiles show
  const layout = tabLayout({
    title: 'Filters',
    categories: [{ id: 'all', label: 'All' }, ...FILTER_CATEGORIES],
    render(cat, q) {
      const clip = selectedVisual();
      shown = clip?.filter?.id ?? null;
      hint.textContent = clip ? '点击滤镜应用到选中的剪辑。' : '点击滤镜将其添加到时间线。先选择一个剪辑片段可仅应用到该片段。';
      const list = FILTERS.filter((f) => (cat === 'all' || f.cat === cat) && matchesLook(f, q, FILTER_CATEGORIES));
      if (!list.length) return emptyState('search', '未找到滤镜', '请尝试其他关键词。');
      const tiles = list.map((f) => {
        const t = tile({
          label: f.label,
          preview: lookPreview('filter', f.id),
          active: clip?.filter?.id === f.id,
          onAdd: () => actions.addFilter(f.id),
          drag: { kind: 'filter', id: f.id },
          addLabel: clip ? `应用 ${f.label} 滤镜到剪辑` : `添加 ${f.label} 滤镜`,
        });
        hoverAnimate(t, 'filter', f.id);
        return t;
      });
      if (clip?.filter) {
        tiles.unshift(tile({ label: '无', preview: lookPreview('none', 'none'), onAdd: () => actions.addFilter(null), addLabel: '从剪辑移除滤镜' }));
      }
      return h('div', hint, tileGrid(tiles, { label: '滤镜' }));
    },
  });
  // An applied, removed or undone filter shows on the tiles; focus stays on the same tile.
  const onChange = () => {
    if (!layout.el.isConnected || (selectedVisual()?.filter?.id ?? null) === shown) return;
    const had = layout.el.contains(document.activeElement) ? document.activeElement : null;
    layout.refresh();
    if (had && !had.isConnected) (layout.el.querySelector(`.tile[aria-label="${CSS.escape(had.getAttribute('aria-label') || '')}"]`) || layout.el.querySelector('.tile'))?.focus();
  };
  const offs = [store.on('select', () => layout.refresh()), store.on('change', onChange)];
  return { el: layout.el, shown: () => layout.refresh(), dispose: () => offs.forEach((f) => f()) };
}
