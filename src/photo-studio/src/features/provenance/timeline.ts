// A provenance record as a readable timeline (Provenance panel and Inspect
// Provenance): a summary, then sources, edits, AI use and exports in time order.
import { escapeXML } from '../../model/assets';
import { keptSteps, type ProvenanceRecord } from '../../model/provenance';

export type TimelineFilter = 'all' | 'edits' | 'sources' | 'ai' | 'exports';
type Entry = { when: string; kind: Exclude<TimelineFilter, 'all'>; html: string; undone?: boolean };

const ORIGIN: Record<ProvenanceRecord['origin'], string> = { new: '从新建文档开始', opened: '从打开的文件开始', captured: '从相机捕获开始', unknown: '未记录来源' };
const ROLE: Record<string, string> = { opened: '已打开', placed: '已置入', library: '从资源库置入', captured: '已捕获' };
const AI_KIND: Record<string, string> = { generate: '生成内容', edit: '提示词编辑', upscale: 'AI 细节图层', fill: 'AI 填充', expand: 'AI 扩图', other: 'AI 辅助编辑' };

export function formatSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export function formatTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
const short = (hash: string) => `${hash.slice(0, 10)}…`;

export function summaryHtml(r: ProvenanceRecord) {
  const ai = r.ai.length;
  const parts = [
    `${keptSteps(r)} 个编辑步骤`,
    `${r.sources.length} 个源文件`,
    ai ? `使用 AI ${ai} 次` : '未记录 AI 使用',
    `${r.exports.length} 次导出`,
  ];
  return `<div class="prov-summary"><div class="prov-origin">${escapeXML(ORIGIN[r.origin])} · ${escapeXML(formatTime(r.created))}</div><div class="prov-counts">${parts.map((x) => `<span>${escapeXML(x)}</span>`).join(' · ')}</div></div>`;
}

function entries(r: ProvenanceRecord): Entry[] {
  const out: Entry[] = [];
  for (const s of r.sources)
    out.push({ when: s.when, kind: 'sources', html: `<b>${escapeXML(ROLE[s.role] ?? '来源')}</b> ${escapeXML(s.name)} <span class="prov-meta">${escapeXML(s.format.toUpperCase())}, ${formatSize(s.size)}, SHA-256 <code title="${escapeXML(s.sha256)}">${escapeXML(short(s.sha256))}</code></span>` });
  for (const s of r.steps)
    out.push({
      when: s.when,
      kind: 'edits',
      undone: s.undone,
      html: `${escapeXML(s.label)}${(s.count ?? 1) > 1 ? ` <span class="prov-count">×${s.count}</span>` : ''}${s.command || s.tool ? ` <span class="prov-meta">${escapeXML(s.command ?? s.tool!)}</span>` : ''}${s.undone ? ' <span class="prov-meta">(已撤销)</span>' : ''}`,
    });
  for (const a of r.ai)
    out.push({ when: a.when, kind: 'ai', html: `<b>${escapeXML(AI_KIND[a.kind] ?? 'AI')}</b>${a.layer ? ` 于“${escapeXML(a.layer)}”` : ''} <span class="prov-meta">${escapeXML(a.command)}${a.model ? `, ${escapeXML(a.model)}` : ''}</span>${a.prompt ? `<div class="prov-prompt">“${escapeXML(a.prompt)}”</div>` : ''}` });
  for (const x of r.exports)
    out.push({ when: x.when, kind: 'exports', html: `<b>已导出</b> ${escapeXML(x.name)} <span class="prov-meta">${escapeXML(x.format.toUpperCase())}${x.pixelHash ? `, 像素 <code title="${escapeXML(x.pixelHash)}">${escapeXML(short(x.pixelHash.replace(/^sha256:/, '')))}</code>` : ''}${x.signed ? '，已签名' : ''}</span>` });
  return out.sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0));
}

const KIND_LABEL: Record<Entry['kind'], string> = { edits: '编辑', sources: '来源', ai: 'AI', exports: '导出' };
/** The timeline, newest last; `limit` keeps the most recent entries. */
export function timelineHtml(r: ProvenanceRecord, filter: TimelineFilter = 'all', limit = 400) {
  const list = entries(r).filter((x) => filter === 'all' || x.kind === filter);
  if (!list.length) return `<p class="muted prov-empty">${filter === 'all' ? '暂无记录。' : '未记录此类型的操作。'}</p>`;
  const shown = list.slice(-limit);
  return `${list.length > shown.length ? `<p class="muted prov-more">${list.length - shown.length} 条较早的条目未显示。</p>` : ''}<ol class="prov-timeline">${shown
    .map((x) => `<li class="prov-entry prov-${x.kind}${x.undone ? ' prov-undone' : ''}"><span class="prov-kind">${KIND_LABEL[x.kind]}</span><span class="prov-text">${x.html}</span><time datetime="${escapeXML(x.when)}">${escapeXML(formatTime(x.when))}</time></li>`)
    .join('')}</ol>`;
}
