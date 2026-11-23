/**
 * Import wizard: pick a CSV export from another tracker, confirm (or fix)
 * the column mapping, review what will land, then import. Re-importing
 * the same file is safe; identical rows are skipped.
 */

import { el, clear, append } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { field, fieldError } from './fields.js';
import { store } from '../lib/store.js';
import { parseCSV } from '../lib/csv.js';
import { IMPORT_TARGETS, detectMapping, rowsToItems } from '../lib/importer.js';
import { fmtDuration, fmtDay } from '../lib/time.js';
import { sum } from '../lib/util.js';

export function openImporter() {
  const body = el('div');
  const modal = openModal({ title: '导入工时数据', content: body });

  let headers = [];
  let dataRows = [];
  let mapping = {};
  let source = 'CSV';

  /* Step 1: pick a file */
  function renderPick() {
    clear(body);
    const fileInput = el('input', {
      type: 'file', accept: '.csv,text/csv', hidden: true,
      onchange: async () => {
        const file = fileInput.files?.[0];
        // Reset so picking the same file again (say, after fixing it in
        // place) still fires a change event.
        fileInput.value = '';
        if (!file) return;
        let rows;
        try {
          rows = parseCSV(await file.text());
        } catch {
          rows = [];
        }
        if (rows.length < 2) {
          toast('该文件没有数据行', { icon: 'x' });
          return;
        }
        headers = rows[0];
        dataRows = rows.slice(1);
        ({ source, mapping } = detectMapping(headers));
        renderMapping();
      },
    });
    append(body, [
      el('div.onboard-hero', {},
        el('div.empty-icon', { html: icon('fileUp', 28) }),
        el('h3.onboard-title', {}, '迁移您的历史记录'),
        el('p.onboard-sub', {}, '支持来自 Toggl、Clockify、Harvest 的详细 CSV 导出文件，或任何包含日期、时长和项目列的工时追踪工具导出文件。客户和项目将按名称匹配，若不存在则自动创建。')
      ),
      el('button.btn.btn-primary.btn-block.btn-tall', {
        type: 'button',
        onclick: () => fileInput.click(),
      }, '选择 CSV 文件'),
      fileInput,
    ]);
  }

  /* Step 2: column mapping (prefilled by detection) */
  function renderMapping() {
    clear(body);
    const selects = {};
    /* A required column that was not picked is reported under the field
       that is missing it, the way every other form in the app does it: one
       summary line under the whole list named the fields but left the user
       to find them again, and told a screen reader nothing about which
       control was at fault. */
    const errors = {};
    const rows = IMPORT_TARGETS.map((t) => {
      const select = el('select.select', {},
        el('option', { value: -1, selected: mapping[t.key] === -1 }, t.required ? '选择列' : '文件中无此项'),
        headers.map((h, i) => el('option', { value: i, selected: mapping[t.key] === i }, h || `第 ${i + 1} 列`))
      );
      selects[t.key] = select;
      const row = field(t.required ? `${t.label}（必填）` : t.label, select);
      if (!t.required) return row;
      const err = fieldError(select);
      errors[t.key] = err;
      select.addEventListener('change', () => { if (select.value !== '-1') err.hide(); });
      return el('div', {}, row, err);
    });

    append(body, [
      el('p.onboard-p', {},
        source === 'CSV'
          ? '将文件中的列与 Hourly 字段进行匹配。'
          : `这看起来是 ${source} 的导出文件；以下列已为您自动匹配。`),
      el('div.import-map', {}, rows),
      el('button.btn.btn-primary.btn-block', {
        type: 'button',
        onclick: () => {
          for (const t of IMPORT_TARGETS) mapping[t.key] = Number(selects[t.key].value);
          const missing = IMPORT_TARGETS.filter((t) => t.required && mapping[t.key] === -1);
          for (const err of Object.values(errors)) err.hide();
          if (missing.length) {
            for (const t of missing) errors[t.key].show(`请选择包含“${t.label}”的列`);
            selects[missing[0].key].focus();
            return;
          }
          renderReview();
        },
      }, '预览导入'),
      backBtn(renderPick),
    ]);
  }

  /* Step 3: review, then import */
  function renderReview() {
    clear(body);
    const { items, invalid } = rowsToItems(dataRows, mapping);
    if (!items.length) {
      append(body, [
        el('p.onboard-p', {}, '未找到可导入的数据行；请检查列匹配设置。'),
        invalid.length > 0 && invalidList(invalid),
        backBtn(renderMapping),
      ]);
      return;
    }

    const dates = items.map((i) => i.date).sort();
    const byClient = new Map();
    for (const i of items) {
      const name = i.client || '已导入';
      byClient.set(name, (byClient.get(name) || 0) + i.seconds);
    }
    const topClients = [...byClient.entries()].sort((a, b) => b[1] - a[1]);

    const importBtn = el('button.btn.btn-primary.btn-block', {
      type: 'button',
      onclick: async () => {
        importBtn.disabled = true;
        importBtn.textContent = '正在导入…';
        try {
          const result = await store.importEntries(items);
          modal.close();
          const parts = [`已导入 ${result.added} 条记录`];
          if (result.skipped) parts.push(`已跳过 ${result.skipped} 条重复项`);
          toast(parts.join('，'), { icon: 'check', duration: 5000 });
        } catch (err) {
          console.error(err);
          importBtn.disabled = false;
          importBtn.textContent = `导入 ${items.length} 条记录`;
          toast('导入失败，请检查网络连接', { icon: 'wifiOff' });
        }
      },
    }, `导入 ${items.length} 条记录`);

    append(body, [
      el('div.entry-summary', {},
        summaryRow('记录数', String(items.length)),
        summaryRow('时长', fmtDuration(sum(items, (i) => i.seconds))),
        summaryRow('起始日期', fmtDay(dates[0], { year: true })),
        summaryRow('结束日期', fmtDay(dates[dates.length - 1], { year: true })),
        topClients.slice(0, 5).map(([name, secs]) => summaryRow(name, fmtDuration(secs)))
      ),
      invalid.length > 0 && invalidList(invalid),
      el('p.small-note', {}, '与现有记录完全相同的行将被跳过，因此重复导入不会产生重复数据。'),
      importBtn,
      backBtn(renderMapping),
    ]);
  }

  function invalidList(invalid) {
    const shown = invalid.slice(0, 5);
    return el('div.import-invalid', {},
      el('p.import-invalid-title', {},
        el('span', { html: icon('alert', 14, 2.4), 'aria-hidden': 'true' }),
        ` 有 ${invalid.length} 行无法导入`),
      el('ul.import-invalid-list', {},
        shown.map((r) => el('li', {}, `第 ${r.line} 行：${r.reason}`)),
        invalid.length > shown.length && el('li', {}, `以及另外 ${invalid.length - shown.length} 行`))
    );
  }

  function summaryRow(label, value) {
    return el('div.summary-row', {},
      el('span.summary-label', {}, label),
      el('span.summary-value', {}, value)
    );
  }

  function backBtn(to) {
    return el('button.btn.btn-ghost.btn-block', {
      type: 'button', style: { marginTop: '10px' },
      onclick: to,
    }, '返回');
  }

  renderPick();
}
