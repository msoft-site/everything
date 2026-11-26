// Provenance panel: the active document's record as a timeline with filters.
import type { Editor } from '../../editor';
import { escapeXML } from '../../model/assets';
import { recordOf, onRecordChange } from './recorder';
import { summaryHtml, timelineHtml, type TimelineFilter } from './timeline';
import './provenance.css';

let filter: TimelineFilter = 'all';
const FILTERS: [TimelineFilter, string][] = [
  ['all', '全部'],
  ['edits', '编辑'],
  ['sources', '来源'],
  ['ai', 'AI'],
  ['exports', '导出'],
];
let version = 0;

export function mount(e: Editor, el: HTMLElement) {
  el.classList.add('provenance-panel');
  el.innerHTML = `<div class="prov-head"></div><div class="prov-filters" role="radiogroup" aria-label="显示">${FILTERS.map(([f, l]) => `<button type="button" role="radio" data-prov-filter="${f}" aria-checked="${f === filter}" tabindex="${f === filter ? 0 : -1}">${l}</button>`).join('')}</div><div class="prov-body" tabindex="0" aria-label="内容凭证时间轴"></div><div class="prov-foot muted">在“导出为”或“首选项 → 导出”中将凭证记录附加到导出文件中。</div>`;
  const choose = (b: HTMLElement) => {
    filter = b.dataset.provFilter as TimelineFilter;
    el.querySelectorAll<HTMLElement>('[data-prov-filter]').forEach((x) => {
      x.setAttribute('aria-checked', String(x === b));
      x.tabIndex = x === b ? 0 : -1;
    });
    version++;
    update(e, el);
  };
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-prov-filter]');
    if (b) choose(b);
  });
  // Arrow keys move between the filters (one tab stop for the group).
  el.querySelector('.prov-filters')!.addEventListener('keydown', (ev) => {
    const k = (ev as KeyboardEvent).key;
    const step = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    ev.preventDefault();
    ev.stopPropagation();
    const all = [...el.querySelectorAll<HTMLElement>('[data-prov-filter]')];
    const next = all[(all.indexOf(document.activeElement as HTMLElement) + step + all.length) % all.length];
    choose(next);
    next.focus();
  });
  onRecordChange(() => {
    version++;
    if (el.isConnected) update(e, el);
  });
}

export function update(e: Editor, el: HTMLElement) {
  const key = `${version}:${e.session.id}:${e.hasDocument}:${e.history.position}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const head = el.querySelector<HTMLElement>('.prov-head')!;
  const body = el.querySelector<HTMLElement>('.prov-body')!;
  if (!e.hasDocument) {
    head.innerHTML = '';
    body.innerHTML = '<p class="muted prov-empty">打开或创建文档以查看其创建过程与凭证。</p>';
    return;
  }
  const r = recordOf(e.session);
  head.innerHTML = `<div class="prov-title">${escapeXML(e.doc.name)}</div>${summaryHtml(r)}`;
  const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
  body.innerHTML = timelineHtml(r, filter);
  // Follow new entries unless the user scrolled back.
  if (atEnd) body.scrollTop = body.scrollHeight;
}
