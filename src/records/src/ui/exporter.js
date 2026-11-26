/**
 * Getting data out: CSV downloads of a view or a whole table, and a
 * printable page of a view.
 */
import { h, escapeHtml } from '../lib/dom.js';
import { toCSV } from '../lib/csv.js';
import { runView } from '../data/query.js';
import { visibleFields } from '../data/views.js';
import { toText, listText } from '../data/fields.js';
import { toast } from './toast.js';

/**
 * Rows of text for a view (or every field and record of the table). For
 * files, list items with commas are quoted so they import back.
 */
export function exportRows(base, table, view, { forFile = true } = {}) {
  const fields = view ? visibleFields(table, view) : table.fields;
  const records = view ? runView(base, table, view).records : table.ordered();
  const ctx = base.compute.ctx;
  const rows = [fields.map((f) => f.name)];
  for (const rec of records) {
    rows.push(fields.map((f) => {
      const v = base.compute.value(table, rec, f);
      if (f.type === 'checkbox') return v ? 'checked' : '';
      // Files keep exact dates and times; printed views show them as cells do.
      if ((f.type === 'date' || f.type === 'createdTime' || f.type === 'lastModifiedTime') && v && forFile) return v;
      return forFile ? listText(f, v, ctx) : toText(f, v, ctx);
    }));
  }
  return rows;
}

export function download(name, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿', text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

function safe(name) {
  return String(name).replace(/[\\/:*?"<>|]+/g, '-').trim() || 'export';
}

export function exportCsv(base, table, view) {
  const rows = exportRows(base, table, view);
  const name = view ? `${table.name} - ${view.name}` : table.name;
  download(`${safe(name)}.csv`, toCSV(rows));
  toast(`已下载 ${rows.length - 1} 条记录`);
}

/** Print a view as a plain table in a new window. */
export function printView(base, table, view) {
  const rows = exportRows(base, table, view, { forFile: false });
  const win = window.open('', '_blank');
  if (!win) {
    toast('请允许弹出窗口以打印此视图。', { error: true });
    return;
  }
  const head = rows[0].map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(`${table.name}: ${view.name}`)}</title>
<style>body{font:12px -apple-system,system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{color:#555;margin:0 0 16px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f3f3f3}
@page{margin:12mm}</style></head><body><h1>${escapeHtml(table.name)}</h1><p>${escapeHtml(view.name)} &middot; ${rows.length - 1} 条记录</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 200);
}

/** A whole base (schema, records, comments) as one JSON file. Attachments stay in the cloud. */
export function exportBaseJson(base) {
  const records = {};
  for (const t of base.tableList()) records[t.id] = [...t.records.values()];
  const data = { format: 'records-base', version: 1, exportedAt: new Date().toISOString(), doc: base.doc, records };
  download(`${safe(base.doc.name)}.json`, JSON.stringify(data), 'application/json');
  toast('数据库已下载');
}

/** Read a base backup; throws with a readable message when it is not one. */
export function readBaseJson(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^\ufeff/, ''));
  } catch {
    throw new Error('此文件不是有效的 JSON 格式。');
  }
  if (data?.format !== 'records-base' || !data.doc?.tables || !data.records) throw new Error('此文件不是多维表格数据库备份文件。');
  return data;
}
