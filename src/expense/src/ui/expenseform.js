/**
 * Add / edit expense sheet. Used on its own (manual entry, edit) and as the
 * confirmation step after OCR, where `prefill` carries what the model read
 * and `receiptFile` the image to store alongside the saved expense.
 */

import { el, field, inlineError, fieldId } from './dom.js';
import { icon } from './icons.js';
import { openModal, confirmDialog } from './modal.js';
import { toast } from './toast.js';
import { store } from '../lib/store.js';
import { parseAmount, formatMoney } from '../lib/money.js';
import { todayISO, isValidISO } from '../lib/dates.js';
import { CURRENCIES } from '../lib/currencies.js';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '../lib/ocr.js';
import { isEditable } from '../lib/reports.js';
import { previewURL, receiptURL, invalidateReceipt, isPdf, openReceiptViewer } from './receipt.js';
import { formatBytes } from '../lib/util.js';

export function openExpenseForm({ expense = null, prefill = {}, receiptFile = null, ocr = null, onSaved = null, onDeleted = null } = {}) {
  const editing = !!expense;
  const base = { date: todayISO(), currency: store.settings.baseCurrency, paymentMethod: 'Card', ...(expense || {}), ...prefill };
  let pendingFile = receiptFile;
  let removeReceipt = false;

  const merchant = el('input.input', { type: 'text', value: base.merchant || '', placeholder: '消费商家名称', autocomplete: 'off', maxlength: 120 });
  const merchantErr = inlineError(merchant);
  const amount = el('input.input.amount', { type: 'text', inputmode: 'decimal', value: base.amount != null && base.amount !== '' ? Number(base.amount).toFixed(2) : '', placeholder: '0.00', autocomplete: 'off' });
  const amountErr = inlineError(amount);
  const currency = el('select.select', { 'aria-label': '币种' },
    CURRENCIES.map((c) => el('option', { value: c.code, selected: c.code === base.currency }, c.code)));
  const date = el('input.input', { type: 'date', value: base.date || todayISO(), max: todayISO() });
  const dateErr = inlineError(date);
  const category = el('select.select', {},
    el('option', { value: '', selected: !base.categoryId }, '未分类'),
    store.categories.map((c) => el('option', { value: c.id, selected: c.id === base.categoryId }, c.name)));
  const method = el('select.select', {},
    PAYMENT_METHODS.map((m) => el('option', { value: m, selected: m === base.paymentMethod }, PAYMENT_METHOD_LABELS[m] || m)));
  const tax = el('input.input', { type: 'text', inputmode: 'decimal', value: base.tax != null && base.tax !== '' ? Number(base.tax).toFixed(2) : '', placeholder: '选填' });
  const notes = el('textarea.textarea', { rows: 2, placeholder: '参与人员、事由、项目等' }, base.notes || '');

  const draftReports = store.reports.filter((r) => isEditable(r));
  const currentReport = base.reportId ? store.report(base.reportId) : null;
  const reportLocked = currentReport && !isEditable(currentReport);
  const report = el('select.select', { disabled: !!reportLocked },
    el('option', { value: '', selected: !base.reportId }, '未加入报销单'),
    reportLocked && el('option', { value: currentReport.id, selected: true }, currentReport.title),
    draftReports.map((r) => el('option', { value: r.id, selected: r.id === base.reportId }, r.title)));

  /* Receipt panel: preview of the pending file or the stored receipt. */
  const receiptPanel = el('div.receipt-panel');
  const fileInput = el('input', {
    type: 'file', accept: 'image/*,application/pdf', className: 'visually-hidden', tabindex: -1,
    onchange: () => {
      const f = fileInput.files?.[0];
      if (f) { pendingFile = f; removeReceipt = false; renderReceipt(); }
      fileInput.value = '';
    },
  });
  const cameraInput = el('input', {
    type: 'file', accept: 'image/*', capture: 'environment', className: 'visually-hidden', tabindex: -1,
    onchange: () => {
      const f = cameraInput.files?.[0];
      if (f) { pendingFile = f; removeReceipt = false; renderReceipt(); }
      cameraInput.value = '';
    },
  });

  function renderReceipt() {
    receiptPanel.replaceChildren();
    const hasStored = editing && expense.receiptPath && !removeReceipt;
    if (pendingFile || hasStored) {
      const name = pendingFile ? pendingFile.name : (expense.receiptName || '票据');
      const size = pendingFile ? formatBytes(pendingFile.size) : '';
      const thumb = el('div.receipt-preview');
      const pdf = pendingFile ? /pdf$/i.test(pendingFile.type) : isPdf(expense);
      if (pdf) thumb.append(el('span.receipt-pdf-mark', { html: icon('file', 26, 1.6) }));
      else if (pendingFile) thumb.append(el('img', { src: previewURL(pendingFile), alt: '' }));
      else receiptURL(expense).then((url) => { if (url) thumb.append(el('img', { src: url, alt: '' })); });
      receiptPanel.append(
        el('div.receipt-attached', {},
          thumb,
          el('div.grow', {},
            el('div.title.truncate', {}, name),
            el('div.sub', {}, [pendingFile ? '准备上传' : '已存储在您的 Puter 云盘', size].filter(Boolean).join('，'))
          ),
          hasStored && !pendingFile && el('button.icon-btn', { type: 'button', html: icon('eye', 18, 2), 'aria-label': '查看票据', onclick: () => openReceiptViewer(expense) }),
          el('button.icon-btn', { type: 'button', html: icon('swap', 18, 2), 'aria-label': '替换票据', title: '替换', onclick: () => fileInput.click() }),
          el('button.icon-btn.danger', {
            type: 'button', html: icon('x', 18, 2), 'aria-label': '移除票据', title: '移除',
            onclick: () => { pendingFile = null; removeReceipt = true; renderReceipt(); },
          })
        )
      );
    } else {
      receiptPanel.append(
        el('div.receipt-add', {},
          el('button.btn.btn-outline.btn-sm', { type: 'button', html: icon('camera', 15, 2.2), onclick: () => cameraInput.click() }, '拍照'),
          el('button.btn.btn-outline.btn-sm', { type: 'button', html: icon('upload', 15, 2.2), onclick: () => fileInput.click() }, '添加附件'),
          el('span.small.muted', {}, '图片或 PDF')
        )
      );
    }
  }
  renderReceipt();

  const ocrNote = ocr && el('div.ocr-note', { html: icon(ocr.source === 'vision' ? 'sparkle' : 'scan', 15, 2.2) },
    el('span', {}, ocr.confidence >= 0.75 ? '已由 AI 识别。保存前请核对金额与日期。'
      : 'AI 对此票据部分信息不够确定，请仔细核对每个字段。'),
    ocr.confidence != null && el('span.badge', { className: `badge ${ocr.confidence >= 0.75 ? 'ok' : 'warn'}` }, `${Math.round(ocr.confidence * 100)}%`));

  const itemsBlock = Array.isArray(base.items) && base.items.length > 0 && el('details.items-details', {},
    el('summary', {}, `从票据中识别出 ${base.items.length} 个明细项`),
    el('ul.items-list', {}, base.items.map((it) => el('li', {}, el('span.grow.truncate', {}, it.name), it.amount != null && el('span.num', {}, formatMoney(it.amount, base.currency)))))
  );

  const saveBtn = el('button.btn.btn-primary', { type: 'submit' }, editing ? '保存修改' : '保存费用');
  const deleteBtn = editing && el('button.btn.btn-danger', {
    type: 'button',
    onclick: async () => {
      const ok = await confirmDialog({ title: '删除此笔费用？', message: '该笔费用及其关联票据将被移除，此操作无法撤销。', confirmLabel: '删除' });
      if (!ok) return;
      try {
        await store.deleteExpense(expense.id);
        modal.close();
        toast('费用已删除', { icon: 'trash' });
        onDeleted?.();
      } catch (err) {
        console.error(err);
        toast('无法删除，请检查网络连接', { icon: 'wifiOff' });
      }
    },
  }, '删除');

  const form = el('form.expense-form', {
    novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      const amt = parseAmount(amount.value);
      let bad = false;
      merchantErr.show(merchant.value.trim() ? null : '请输入商家名称');
      amountErr.show(amt === null || amt <= 0 ? '请输入大于零的金额' : null);
      dateErr.show(isValidISO(date.value) && date.value <= todayISO() ? null : '请输入今天或更早的有效日期');
      bad = !merchant.value.trim() || amt === null || amt <= 0 || !isValidISO(date.value) || date.value > todayISO();
      if (bad) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }

      saveBtn.disabled = true;
      saveBtn.textContent = pendingFile ? '正在上传票据…' : '正在保存…';
      const taxVal = parseAmount(tax.value);
      const data = {
        merchant: merchant.value.trim(), amount: amt, currency: currency.value, date: date.value,
        categoryId: category.value || null, paymentMethod: method.value, tax: taxVal === null ? null : taxVal,
        notes: notes.value.trim(), items: base.items || [], ocr: base.ocr || (ocr ? { source: ocr.source, confidence: ocr.confidence, at: Date.now() } : null),
        reportId: reportLocked ? base.reportId : (report.value || null),
      };
      try {
        let saved;
        if (editing) {
          const patch = { ...data };
          if (removeReceipt && expense.receiptPath) {
            await store.deleteReceipt(expense.receiptPath);
            invalidateReceipt(expense.receiptPath);
            Object.assign(patch, { receiptPath: null, receiptMime: null, receiptName: null });
          }
          if (pendingFile) {
            if (expense.receiptPath) invalidateReceipt(expense.receiptPath);
            Object.assign(patch, await store.saveReceipt(expense.id, pendingFile));
          }
          saved = await store.updateExpense(expense.id, patch);
        } else {
          saved = await store.addExpense(data);
          if (pendingFile) {
            try {
              const meta = await store.saveReceipt(saved.id, pendingFile);
              saved = await store.updateExpense(saved.id, meta);
            } catch (err) {
              console.error(err);
              toast('费用已保存，但票据上传失败', { icon: 'warn' });
            }
          }
        }
        modal.close();
        toast(editing ? '费用已更新' : '费用已保存');
        onSaved?.(saved);
      } catch (err) {
        console.error(err);
        saveBtn.disabled = false;
        saveBtn.textContent = editing ? '保存修改' : '保存费用';
        toast('无法保存，请检查网络连接', { icon: 'wifiOff' });
      }
    },
  },
    ocrNote,
    fileInput, cameraInput,
    el('div.field', {}, el('span.field-label', {}, '票据'), receiptPanel),
    field('商家', merchant, { error: merchantErr }),
    el('div.field', {},
      el('label.field-label', { for: (amount.id = fieldId()) }, '金额'),
      el('div.input-group', {}, el('div.select-wrap', {}, currency), amount),
      amountErr.node),
    el('div.field-row', {},
      field('日期', date, { error: dateErr }),
      field('分类', el('div.select-wrap', {}, category))),
    el('div.field-row', {},
      field('支付方式', el('div.select-wrap', {}, method)),
      field('税额', tax, { hint: '（选填）' })),
    field('报销单', el('div.select-wrap', {}, report), reportLocked ? { hint: '（已锁定：报销单已提交）' } : {}),
    field('备注', notes, { hint: '（选填）' }),
    itemsBlock,
    el('div.row.end', {}, deleteBtn, el('span.grow'), saveBtn)
  );
  // field() sets ids on the wrapper's control; the selects inside .select-wrap need the label to point at them.
  for (const wrap of form.querySelectorAll('.field > .select-wrap')) {
    const label = wrap.previousElementSibling;
    const sel = wrap.querySelector('select');
    if (label && sel) { sel.id = sel.id || fieldId(); label.setAttribute('for', sel.id); wrap.removeAttribute('id'); }
  }

  const modal = openModal({ title: editing ? '编辑费用' : '新建费用', content: form });
  if (!editing && !merchant.value && globalThis.matchMedia?.('(min-width: 640px)').matches) merchant.focus();
  return modal;
}
