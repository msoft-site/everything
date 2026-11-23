/**
 * Invoices: the creation sheet (from a client's unbilled time) and the
 * printable invoice page. The page is one clean layout rendered as a
 * full-screen overlay; the browser's print-to-PDF is the export path,
 * so print CSS shows the sheet and nothing else.
 */

import { el, clear, append } from './dom.js';
import { icon } from './icons.js';
import { openModal, confirmDialog } from './modal.js';
import { toast, setToastsTabbable } from './toast.js';
import { field, fieldError, nativeError, switchField } from './fields.js';
import { logoURL } from './logo.js';
import { openPrintOverlay } from './printsheet.js';
import { openTimesheetSheet } from './timesheetprint.js';
import {
  store, dueDateFor, paidAmount, outstandingAmount, invoiceState, lastPaymentDate,
  invoiceTotals, linesTotal,
} from '../lib/store.js';
import { fmtDuration, fmtDay, toHours, todayISO, daysApart } from '../lib/time.js';
import { fmtMoney, parseAmount, round2, sum, termsLabel } from '../lib/util.js';

export const invoiceNumber = (n) => `#${String(n).padStart(4, '0')}`;

/* One wording for a tax rate that will not parse, phrased like the rate
   errors on the entry and client sheets. */
const TAX_ERROR = '请输入数字格式的税率，例如 19';

/* Same for an amount received. */
const AMOUNT_ERROR = '请输入收款金额，例如 500';

/** How an invoice's state reads wherever it is shown. */
export const STATE_LABEL = {
  paid: '已付',
  partial: '部分支付',
  overdue: '已逾期',
  open: '未付',
};

/** "3 days overdue" / "due in 5 days" / "due today", from a due date. */
export function dueText(invoice, today = todayISO()) {
  if (!invoice.dueDate) return null;
  if (invoiceState(invoice, today) === 'paid') return null;
  const days = daysApart(today, invoice.dueDate);
  if (days === 0) return '今天到期';
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`;
  return `${days} 天后到期`;
}



/* Manual invoice lines: what an invoice carries besides tracked time. */
const LINE_KINDS = [
  { key: 'fee', label: '固定费用', placeholder: '例如：项目费、里程碑 2' },
  { key: 'expense', label: '报销费用', placeholder: '例如：图库授权、机票' },
  { key: 'discount', label: '折扣', placeholder: '例如：首单优惠' },
];
const LINE_LABEL = Object.fromEntries(LINE_KINDS.map((k) => [k.key, k.label]));
const AMOUNT_LINE_ERROR = '请输入数字格式的金额，例如 500';
const QUANTITY_ERROR = '请输入数量，例如 1、2 或 0.5';

/**
 * Add or edit one manual line, over the create sheet that owns the list.
 * A discount is entered as a positive number to take off, so nobody has to
 * type a minus sign for the app to store one.
 */
function openLineForm({ line = null, currency, onSave, onRemove = null }) {
  const isEdit = !!line;
  const kind = el('select.select', {},
    LINE_KINDS.map((k) => el('option', { value: k.key, selected: (line?.kind || 'fee') === k.key }, k.label))
  );
  const label = el('input.input', {
    type: 'text', maxLength: 120, autocomplete: 'off', value: line?.label || '',
  });
  const quantity = el('input.input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: line && line.quantity !== 1 ? line.quantity : '',
    placeholder: '1',
  });
  const quantityErr = fieldError(quantity);
  const amount = el('input.input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: line ? Math.abs(line.unitAmount) : '',
    required: true,
  });
  const amountErr = fieldError(amount);
  nativeError(amount, amountErr, AMOUNT_LINE_ERROR);
  const taxable = switchField('按账单税率计税', line ? line.taxable !== false : true,
    { hint: '对于不含税的代垫费用，请关闭此项。' });

  const quantityField = el('div', {}, field('数量', quantity), quantityErr);
  const amountField = el('div', {}, field(`单价 (${currency})`, amount), amountErr);
  const sync = () => {
    const k = kind.value;
    label.placeholder = LINE_KINDS.find((x) => x.key === k).placeholder;
    // A discount is one deduction, so a quantity would only invite the
    // question of what it multiplies.
    quantityField.hidden = k === 'discount';
    amountField.querySelector('.field-label').textContent =
      k === 'discount' ? `扣减金额 (${currency})` : `单价 (${currency})`;
  };
  kind.addEventListener('change', sync);
  sync();

  const form = el('form.form', {
    onsubmit: (e) => {
      e.preventDefault();
      quantityErr.hide();
      amountErr.hide();
      /* Kept at the two decimals the invoice record freezes them at
         (normalizeInvoiceLines rounds both), so the sheet previews, lists,
         and promises exactly the figures the issued invoice will carry: a
         quantity of 0.333 at $100 read as $33.30 here and froze as 0.33,
         $33.00, and the total on the button was not the total on the
         document. A value that rounds away to nothing is refused rather
         than accepted as a line the record would then silently drop. */
      const qtyRaw = quantity.value.trim();
      const qty = qtyRaw === '' ? 1 : round2(parseAmount(qtyRaw));
      if (!Number.isFinite(qty) || qty <= 0) {
        quantityErr.show(QUANTITY_ERROR);
        quantity.focus();
        return;
      }
      const value = round2(parseAmount(amount.value));
      if (!Number.isFinite(value) || value <= 0) {
        amountErr.show(AMOUNT_LINE_ERROR);
        amount.focus();
        return;
      }
      onSave({
        kind: kind.value,
        label: label.value.trim(),
        quantity: kind.value === 'discount' ? 1 : qty,
        unitAmount: value,
        taxable: taxable.input.checked,
      });
      modal.close();
    },
  },
    field('类型', kind),
    field('描述', label, { hint: '作为明细项打印在账单上。' }),
    el('div.form-grid', {}, quantityField, amountField),
    taxable,
    el('button.btn.btn-primary.btn-block', { type: 'submit' }, isEdit ? '保存明细项' : '添加明细项'),
    isEdit && onRemove && el('button.btn.btn-ghost.btn-block.btn-danger-ghost', {
      type: 'button',
      onclick: () => { onRemove(); modal.close(); },
    }, '移除明细项')
  );

  const modal = openModal({ title: isEdit ? '编辑明细项' : '添加明细项', content: form });
}

/**
 * openCreateInvoice({ client, entries }) — `entries` are the client's
 * shown unbilled entries, and none is allowed: a fixed-fee invoice is
 * lines only. Saving marks the entries invoiced, freezes the lines with
 * the rest of the record, and opens the printable page.
 */
export function openCreateInvoice({ client, entries = [] }) {
  const targets = entries.filter((e) => e.billable && !e.invoicedAt);
  const currency = client.currency || store.settings.currency;
  const seconds = sum(targets, (e) => store.billedSeconds(e));
  // The same resolution that invoicing freezes, so the preview is exact.
  const timeSubtotal = round2(sum(targets, (e) => store.entryAmount(e)));
  const n = targets.length;
  const nextNumber = store.invoices.reduce((m, i) => Math.max(m, i.number), 0) + 1;

  const issueDate = el('input.input', { type: 'date', value: todayISO(), required: true });
  const issueDateErr = fieldError(issueDate);
  nativeError(issueDate, issueDateErr, '请选择此账单的开具日期');

  /* Due date, dated from the payment terms so it starts filled in rather
     than blank. It follows the issue date until the user sets it by hand;
     after that their date is theirs, and clearing it means this invoice
     has no due date at all (and so can never read as overdue). */
  const terms = store.resolvePaymentTermsDays(client.id);
  const termsSource = client.paymentTermsDays != null ? `${client.name}` : '您的付款条款';
  const dueDate = el('input.input', {
    type: 'date', value: dueDateFor(issueDate.value, terms) || '',
  });
  let dueTouched = false;
  dueDate.addEventListener('change', () => { dueTouched = true; });
  issueDate.addEventListener('change', () => {
    if (!dueTouched) dueDate.value = dueDateFor(issueDate.value, terms) || '';
  });

  /* Tax starts at the rate that applies to this client rather than blank:
     typing it from memory on every invoice was the one part of the
     billing terms the app never remembered. */
  const resolvedTax = store.resolveTaxRate(client.id);
  const taxInput = el('input.input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '例如：19',
    value: resolvedTax || '',
  });
  const taxErr = fieldError(taxInput);
  const taxSource = client.taxRate != null ? `${client.name}` : '您的默认税率';
  const notes = el('textarea.input.textarea', { rows: 2, maxLength: 500, placeholder: '显示在账单底部' });

  /* Manual lines, in the order they were added, editable until the
     invoice is issued and frozen with it after that. */
  const lines = [];
  const linesBox = el('div');
  const totalsBox = el('div.entry-summary');

  const currentRate = () => {
    const rate = taxInput.value.trim() === '' ? 0 : parseAmount(taxInput.value);
    return Number.isFinite(rate) && rate >= 0 ? rate : null;
  };

  const lineAmount = (l) => round2((l.kind === 'discount' ? -1 : 1) * l.quantity * l.unitAmount);

  const renderLines = () => {
    clear(linesBox);
    if (lines.length) {
      linesBox.append(el('div.card.list-card', {}, lines.map((l, i) => el('div.entry-row', {},
        el('button.entry-main', {
          type: 'button',
          'aria-label': `编辑明细项：${l.label || LINE_LABEL[l.kind]}`,
          onclick: () => openLineForm({
            line: l,
            currency,
            onSave: (next) => { lines[i] = next; renderLines(); renderTotals(); },
            onRemove: () => { lines.splice(i, 1); renderLines(); renderTotals(); },
          }),
        },
          el('div.entry-text', {},
            el('div.entry-title', {},
              l.label || LINE_LABEL[l.kind],
              el('span.chip.chip-plain', {}, LINE_LABEL[l.kind])
            ),
            el('div.entry-sub', {}, [
              l.quantity !== 1 ? `${l.quantity} × ${fmtMoney(l.unitAmount, currency)}` : null,
              l.taxable === false ? '不含税' : null,
            ].filter(Boolean).join(' · ') || '点击编辑')
          ),
          el('div.entry-nums', {},
            el('div.entry-duration', {}, fmtMoney(lineAmount(l), currency))
          )
        )
      ))));
    }
    linesBox.append(el('button.btn.btn-ghost.btn-slim', {
      type: 'button',
      style: { marginTop: lines.length ? '8px' : '0' },
      html: icon('plus', 15, 2.2),
      onclick: () => openLineForm({
        currency,
        onSave: (next) => { lines.push(next); renderLines(); renderTotals(); },
      }),
    }, ' 添加固定费用、报销费用或折扣'));
  };

  const renderTotals = () => {
    const rate = currentRate();
    // A rate that reads as a number again clears the complaint about it,
    // the same way the shared field helper does on every other input.
    if (rate != null) taxErr.hide();
    const normalized = lines.map((l) => ({ ...l, amount: lineAmount(l) }));
    const totals = invoiceTotals(timeSubtotal, normalized, rate || 0);
    const manual = linesTotal(normalized);
    const untaxed = normalized.some((l) => l.taxable === false);
    clear(totalsBox);
    const row = (label, value, strong = false) => el('div.summary-row', {},
      el('span.summary-label', {}, label),
      el(strong ? 'strong.summary-value' : 'span.summary-value', {}, value));
    append(totalsBox, [
      seconds > 0 && row('可计费时长', fmtDuration(seconds)),
      seconds > 0 && manual !== 0 && row('已追踪工作', fmtMoney(timeSubtotal, currency)),
      manual !== 0 && row(
        `${lines.length} 个附加明细项`,
        fmtMoney(manual, currency)),
      row('小计', fmtMoney(totals.subtotal, currency)),
      rate > 0 && row(`税费 (${rate}%)${untaxed ? '（仅计税项）' : ''}`, fmtMoney(totals.tax, currency)),
      row('合计', fmtMoney(totals.total, currency), true),
    ]);
    // Nothing to bill, or a discount deeper than the invoice: either way
    // there is no honest document to issue, so the button says so.
    const nothing = !targets.length && !lines.length;
    save.disabled = nothing || totals.total < 0;
    save.textContent = nothing ? '请添加工时或明细项以开具账单'
      : totals.total < 0 ? '折扣金额超过了账单总额'
        : `创建账单 ${invoiceNumber(nextNumber)}`;
  };
  taxInput.addEventListener('input', renderTotals);

  const save = el('button.btn.btn-primary.btn-block', { type: 'submit' },
    `创建账单 ${invoiceNumber(nextNumber)}`);
  renderLines();
  renderTotals();

  const form = el('form.form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const rate = currentRate();
      if (rate == null) {
        taxErr.show(TAX_ERROR);
        taxInput.focus();
        return;
      }
      save.disabled = true;
      let invoice;
      try {
        invoice = await store.createInvoice({
          clientId: client.id,
          entries: targets,
          taxRate: rate,
          notes: notes.value,
          issueDate: issueDate.value || todayISO(),
          dueDate: dueDate.value || null,
          lines,
        });
      } catch (err) {
        console.error(err);
        save.disabled = false;
        toast('无法创建账单，请检查网络连接', { icon: 'wifiOff' });
        return;
      }
      modal.close();
      toast(`账单 ${invoiceNumber(invoice.number)} 已创建`, { icon: 'receipt' });
      openInvoiceView(invoice);
    },
  },
    el('p.confirm-message', {}, targets.length
      ? `${client.name} 的 ${n} 条未开票记录将生成账单 ${invoiceNumber(nextNumber)}。其费率、取整规则和币种将被锁定以确保账单记录不再变动；作废账单可重新解锁这些记录。`
      : `${client.name} 当前没有未开票工时，因此此账单仅包含您在下方添加的明细项。日后作废账单将撤销整个单据。`),
    el('div.form-grid', {},
      el('div', {}, field('开具日期', issueDate), issueDateErr),
      el('div', {}, field('税率 (%)', taxInput, {
        hint: resolvedTax > 0 ? `来自${taxSource}。` : null,
      }), taxErr)
    ),
    field('到期日', dueDate, {
      hint: terms != null
        ? `按${termsSource}（${termsLabel(terms)}）计算。可针对此账单修改，或留空表示无到期日。`
        : '选填。在“设置”或此客户下设置付款条款后，将自动为您填写。',
    }),
    el('h3.sheet-section', {}, '费用、报销与折扣'),
    linesBox,
    el('p.field-hint', {},
      '非追踪工时的可选明细项。它们将打印在账单工时下方并计入小计。'),
    field('备注', notes),
    totalsBox,
    !store.settings.businessName && el('p.field-hint', {},
      '提示：在“设置 → 账单开具”中添加您的企业信息以完善账单抬头。'),
    save
  );

  const modal = openModal({ title: '创建账单', content: form });
}

/**
 * Start an invoice for a client picked here, with whatever unbilled time
 * they are holding. This is the way in for work with no tracked time at
 * all — a fixed-fee project, an expense to pass through — which the
 * unbilled-time route in Reports cannot offer, because there is nothing
 * of theirs for it to list.
 */
/**
 * Start an invoice for one client, covering everything of theirs that is
 * still unbilled. Shared by the client picker and by the ready-to-invoice
 * list, so both land in the same sheet with the same set of time.
 */
export async function openInvoiceForClient(client) {
  let unbilled = [];
  try {
    const all = await store.entriesBetween('2000-01-01', '9999-12-31');
    unbilled = all.filter((entry) => entry.billable && !entry.invoicedAt
      && store.project(entry.projectId)?.clientId === client.id);
  } catch (err) {
    console.error(err);
    toast('无法读取您的记录，请检查网络连接', { icon: 'wifiOff' });
    return;
  }
  openCreateInvoice({ client, entries: unbilled });
}

export function openNewInvoice() {
  const clients = store.activeClients();
  if (!clients.length) {
    toast('请先添加客户', { icon: 'users' });
    return;
  }
  const select = el('select.select', { required: true },
    clients.map((c) => el('option', { value: c.id }, c.name)));
  const next = el('button.btn.btn-primary.btn-block', { type: 'submit' }, '继续');
  const form = el('form.form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const client = store.client(select.value);
      if (!client) return;
      next.disabled = true;
      modal.close();
      // Everything of theirs that is still unbilled, so an invoice
      // started here never silently leaves tracked time behind.
      await openInvoiceForClient(client);
    },
  },
    field('客户', select, { hint: '将包含该客户下所有未开票工时；下一步您可以添加固定费用、报销费用或折扣。' }),
    next
  );
  const modal = openModal({ title: '新建账单', content: form });
}

/**
 * Record money received against an invoice, and take one back off. The
 * amount starts at what is still outstanding, so the common case — the
 * client paid the bill — is one tap on Save. Several payments are normal
 * (a deposit, then the balance) and each one is listed with the day it
 * landed.
 */
export function openPaymentSheet(invoice) {
  const cur = invoice.currency;
  const money = (v) => fmtMoney(v, cur);
  const fresh = () => store.invoices.find((i) => i.id === invoice.id) || invoice;

  const date = el('input.input', { type: 'date', value: todayISO(), required: true });
  const dateErr = fieldError(date);
  nativeError(date, dateErr, '请选择款项到账日期');
  const amount = el('input.input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: outstandingAmount(fresh()) || '',
    placeholder: `例如：${outstandingAmount(fresh()) || invoice.total}`,
    required: true,
  });
  const amountErr = fieldError(amount);
  nativeError(amount, amountErr, AMOUNT_ERROR);
  const note = el('input.input', {
    type: 'text', maxLength: 120, autocomplete: 'off',
    placeholder: '例如：定金，或转账流水号',
  });

  const summary = el('div.entry-summary');
  const paidList = el('div');

  const renderState = () => {
    const inv = fresh();
    const paid = paidAmount(inv);
    const left = outstandingAmount(inv);
    const row = (label, value, strong = false) => el('div.summary-row', {},
      el('span.summary-label', {}, label),
      el(strong ? 'strong.summary-value' : 'span.summary-value', {}, value));
    clear(summary);
    append(summary, [
      row('账单总额', money(inv.total)),
      paid > 0 && row('已收款', money(paid)),
      row(left > 0 ? '待付余额' : '已结清', money(left), true),
    ]);

    clear(paidList);
    const payments = [...(inv.payments || [])].sort((a, b) => a.date.localeCompare(b.date));
    if (!payments.length) return;
    paidList.append(
      el('h3.sheet-section', {}, '已收款项'),
      el('div.card.list-card', {}, payments.map((p) => el('div.entry-row', {},
        el('div.entry-main.entry-main-static', {},
          el('div.entry-text', {},
            el('div.entry-title', {}, money(p.amount)),
            el('div.entry-sub', {}, [fmtDay(p.date, { year: true }), p.note].filter(Boolean).join(' · '))
          )
        ),
        el('button.icon-btn', {
          html: icon('trash', 16, 2),
          'aria-label': `移除 ${fmtDay(p.date, { year: true })} 的 ${money(p.amount)} 收款记录`,
          title: '移除此收款记录',
          onclick: async () => {
            try {
              await store.removePayment(inv.id, p.id);
            } catch (err) {
              console.error(err);
              toast('无法移除，请检查网络连接', { icon: 'wifiOff' });
              return;
            }
            amount.value = outstandingAmount(fresh()) || '';
            renderState();
          },
        })
      )))
    );
  };
  renderState();

  const save = el('button.btn.btn-primary.btn-block', { type: 'submit' }, '记录收款');

  const form = el('form.form', {
    onsubmit: async (e) => {
      e.preventDefault();
      amountErr.hide();
      const value = parseAmount(amount.value);
      if (!Number.isFinite(value) || value <= 0) {
        amountErr.show(AMOUNT_ERROR);
        amount.focus();
        return;
      }
      save.disabled = true;
      try {
        await store.addPayment(invoice.id, { date: date.value || todayISO(), amount: value, note: note.value });
      } catch (err) {
        console.error(err);
        save.disabled = false;
        toast('无法保存收款记录，请检查网络连接', { icon: 'wifiOff' });
        return;
      }
      const inv = fresh();
      modal.close();
      toast(invoiceState(inv) === 'paid'
        ? `账单 ${invoiceNumber(inv.number)} 已付清`
        : `已记录 ${money(value)}，尚余 ${money(outstandingAmount(inv))} 未付`, { icon: 'banknote' });
    },
  },
    summary,
    el('div.form-grid', {},
      el('div', {}, field('收款日期', date), dateErr),
      el('div', {}, field(`金额 (${cur})`, amount), amountErr)
    ),
    field('备注', note),
    save,
    paidList
  );

  const modal = openModal({ title: `${invoiceNumber(invoice.number)} 的收款记录`, content: form });
}

/**
 * The printable invoice page, rendered from the frozen invoice record.
 *
 * Line items come from the entries the invoice froze and never change, so
 * they are computed once. Payment state does change while the page is
 * open (recording one is done from its own toolbar button), so the sheet
 * is rebuilt from the stored record on every store change, and the page
 * closes itself if the invoice is voided from anywhere.
 */
export async function openInvoiceView(invoice) {
  let entries = [];
  try {
    entries = await store.invoiceEntries(invoice);
  } catch (err) {
    console.error(err);
  }
  /* The logo the invoice was issued with, read from the file its record
     names. Unreadable (offline, or removed outside the app) is not an
     error: the header renders exactly as it did before logos existed. */
  const logoSrc = await logoURL(invoice.business.logo).catch(() => null);

  /* Line items: grouped like the Reports view, one line per project,
     task, and rate (a rate change mid-period honestly becomes its own
     line instead of a fudged average).

     Hours print at the precision the amounts were actually computed
     with. Two decimals looked tidier but did not multiply out: 55
     minutes reads as 0.92 h, and 0.92 x $120 is $110.40 against an
     amount column saying $110.00. A client checking the arithmetic has
     to be able to reproduce it, and a duration that is a clean number of
     hours still prints as one ("5.25", "3.5"). */
  const lineHours = (seconds) => String(toHours(seconds, 4));
  const lines = new Map();
  for (const e of entries) {
    const project = store.project(e.projectId);
    const rate = store.effectiveRate(e);
    const key = `${e.projectId}|${(e.task || '').toLowerCase()}|${rate}`;
    let line = lines.get(key);
    if (!line) {
      line = {
        // Project · task, the separator every other list in the app uses.
        label: [project?.name || '无项目', e.task].filter(Boolean).join(' · '),
        rate,
        seconds: 0,
        amount: 0,
      };
      lines.set(key, line);
    }
    line.seconds += store.billedSeconds(e);
    line.amount = round2(line.amount + store.entryAmount(e));
  }
  const items = [...lines.values()].sort((a, b) => a.label.localeCompare(b.label));

  const cur = invoice.currency;
  const money = (v) => fmtMoney(v, cur);
  const addressBlock = (text) => text && el('p.invoice-address', {}, text);
  /* The stored record, which payments change; the argument is only the
     copy the caller happened to hold. */
  const current = () => store.invoices.find((i) => i.id === invoice.id) || invoice;

  /* The overlay owns the dialog mechanics (inert app, Escape, focus
     return, print CSS); this file only decides what is on the page. */
  let overlay = null;
  const close = () => overlay?.close();

  const voidBtn = el('button.btn.btn-ghost.btn-slim.btn-danger-ghost', {
    style: { marginTop: 0 },
    onclick: async () => {
      const inv = current();
      const n = inv.entries.length;
      const paid = paidAmount(inv);
      const ok = await confirmDialog({
        title: `作废账单 ${invoiceNumber(inv.number)}？`,
        message: `该账单将被删除，其中的 ${n} 条记录将恢复为未开票状态，费率也将解锁。该账单编号可供下一张账单重新使用。`
          // Voiding a bill that was partly or fully settled throws the
          // payment record away with it, which is worth saying out loud.
          + (paid > 0 ? ` 已记录收到的 ${money(paid)} 款项也将一并删除。` : ''),
        confirmLabel: '作废账单',
      });
      if (!ok) return;
      try {
        await store.voidInvoice(inv.id);
      } catch (err) {
        console.error(err);
        toast('无法作废，请检查网络连接', { icon: 'wifiOff' });
        return;
      }
      toast(`账单 ${invoiceNumber(inv.number)} 已作废`, { icon: 'trash' });
      close();
    },
  }, '作废');

  /* The payment button keeps its node identity across renders: closing the
     payment sheet puts focus back on the control that opened it, and a
     rebuilt button would be a different, detached node by then. */
  const payLabel = el('span', {}, ' 记录收款');
  const payBtn = el('button.btn.btn-ghost.btn-slim', {
    html: icon('banknote', 15, 2),
    onclick: () => openPaymentSheet(current()),
  }, payLabel);

  /** The state line under the invoice number, and the paid/overdue stamp. */
  function statusLines(inv) {
    const state = invoiceState(inv);
    if (state === 'paid') {
      const on = lastPaymentDate(inv);
      return [el('p.invoice-meta-line', {}, on ? `已于 ${fmtDay(on, { year: true })} 付清` : '已付清')];
    }
    if (!inv.dueDate) return [];
    return [el('p.invoice-meta-line', {},
      `到期日 ${fmtDay(inv.dueDate, { year: true })}`,
      state === 'overdue' ? ` · ${dueText(inv)}` : '')];
  }

  function totalsBlock(inv) {
    const paid = paidAmount(inv);
    const left = outstandingAmount(inv);
    const row = (label, value, cls = '') => el(`div.invoice-total-row${cls}`, {},
      el('span', {}, label), el('span', {}, value));
    return el('div.invoice-totals', {},
      row('小计', money(inv.subtotal)),
      inv.taxRate > 0 && row(`税费 (${inv.taxRate}%)`, money(inv.tax)),
      // With nothing paid, the last line is the one to pay, worded as it
      // always has been. Once money has come in, the total is a fact and
      // the amount still owed becomes the line that matters.
      paid > 0
        ? row('合计', money(inv.total), '.sum')
        : row('应付总额', money(inv.total), '.total'),
      paid > 0 && row('已付', `−${money(paid)}`),
      // "Amount due" while something is owed; a settled invoice states its
      // balance instead, which is the honest word for zero.
      paid > 0 && row(left > 0 ? '待付金额' : '余额', money(left), '.total')
    );
  }

  function buildSheet(inv) {
    const state = invoiceState(inv);
    const marksUntaxed = inv.taxRate > 0 && (inv.lines || []).some((l) => l.taxable === false);
    return el('div.invoice-sheet', {},
      el('header.invoice-head', {},
        el('div.grow', {},
          // Decorative: the business name right below says the same thing,
          // so a screen reader gains nothing from reading it twice.
          logoSrc && el('img.invoice-logo', { src: logoSrc, alt: '' }),
          el('div.invoice-business-name', {}, inv.business.name || store.user?.username || '账单'),
          addressBlock(inv.business.address),
          inv.business.taxId && el('p.invoice-meta-line', {}, `税号：${inv.business.taxId}`)
        ),
        el('div.invoice-title-block', {},
          el('div.invoice-doc-title', {}, '账单'),
          el('div.invoice-number', {}, invoiceNumber(inv.number)),
          el('p.invoice-meta-line', {}, `开具日期 ${fmtDay(inv.issueDate, { year: true })}`),
          statusLines(inv),
          inv.periodFrom && el('p.invoice-meta-line', {},
            `服务周期 ${fmtDay(inv.periodFrom, { year: true })} – ${fmtDay(inv.periodTo, { year: true })}`),
          // A settled bill says so on the page, so a re-sent copy is a
          // receipt rather than a second demand; a late one says that too.
          (state === 'paid' || state === 'overdue') && el('div', {
            className: `invoice-stamp ${state}`,
          }, state === 'paid' ? '已付清' : '已逾期')
        )
      ),
      el('section.invoice-billto', {},
        el('div.invoice-label', {}, '客户信息'),
        el('div.invoice-billto-name', {}, inv.billTo.name),
        addressBlock(inv.billTo.address),
        inv.billTo.email && el('p.invoice-meta-line', {}, inv.billTo.email),
        inv.billTo.taxId && el('p.invoice-meta-line', {}, `税号：${inv.billTo.taxId}`)
      ),
      /* Hours, rate, and amount never wrap, so a wide enough set of line
         items (a five-figure amount, a long rate) outgrows a phone whatever
         the type size. They scroll on their own rather than drag the whole
         page sideways, which used to push the amount column, the part a
         client checks first, off the edge of the screen. */
      el('div.invoice-table-wrap', {},
        el('table.invoice-table', {},
          el('thead', {}, el('tr', {},
            el('th.desc', {}, '描述'),
            el('th.num', {}, '工时'),
            el('th.num', {}, '费率'),
            el('th.num', {}, '金额')
          )),
          el('tbody', {},
            items.map((line) => el('tr', {},
              el('td.desc', {}, line.label),
              el('td.num', {}, lineHours(line.seconds)),
              el('td.num', {}, `${money(line.rate)}/h`),
              el('td.num', {}, money(line.amount))
            )),
            // Time that could not be resolved into line items still has to
            // account for the hours the invoice froze.
            !items.length && inv.seconds > 0
              && el('tr', {}, el('td.desc', { colSpan: 4 }, `${fmtDuration(inv.seconds)} 可计费工作`)),
            /* Fees, expenses, and discounts, printed under the time. The
               quantity rides in the description rather than the Hours
               column: a count of licences is not a number of hours, and
               putting it there would misread as one. */
            (inv.lines || []).map((line) => el('tr', {},
              el('td.desc', {},
                line.label,
                line.quantity !== 1 ? ` (${line.quantity} × ${money(line.unitAmount)})` : '',
                marksUntaxed && line.taxable === false ? ' *' : ''
              ),
              el('td.num', {}, ''),
              el('td.num', {}, ''),
              el('td.num', {}, money(line.amount))
            ))
          )
        )
      ),
      // The footnote only exists when a line is actually excluded, so the
      // arithmetic of a mixed invoice can be followed to the cent.
      marksUntaxed && el('p.invoice-note', {}, '* 免税项目'),
      totalsBlock(inv),
      (inv.business.payment || inv.notes || inv.terms) && el('footer.invoice-foot', {},
        // Payment instructions get their own labelled block: a client
        // looking for where to send the money should not have to read a
        // terms sentence to find an IBAN. A settled invoice needs none of
        // it: nothing is left to pay.
        inv.business.payment && state !== 'paid' && el('div.invoice-pay', {},
          el('div.invoice-label', {}, '付款方式'),
          el('p.invoice-pay-text', {}, inv.business.payment)
        ),
        inv.notes && el('p', {}, inv.notes),
        inv.terms && el('p', {}, inv.terms)
      )
    );
  }

  function render() {
    const inv = current();
    const state = invoiceState(inv);
    payLabel.textContent = state === 'paid' ? ' 收款记录' : ' 记录收款';
    payBtn.title = state === 'paid'
      ? '查看或更正已收款项'
      : '记录此账单收到的款项';
    overlay.body.replaceChildren(buildSheet(inv));
  }

  const onChange = () => {
    // Voided from somewhere else (another tab, an undo): there is no
    // record left to show, so the page goes with it.
    if (!store.invoices.some((i) => i.id === invoice.id)) {
      close();
      return;
    }
    render();
  };

  overlay = openPrintOverlay({
    label: `${invoice.billTo.name} 的账单 ${invoiceNumber(invoice.number)}`,
    onClose: () => store.removeEventListener('change', onChange),
    actions: () => [
      payBtn,
      // The detail a client asks for behind an hourly bill: which days,
      // which tasks, how long.
      el('button.btn.btn-ghost.btn-slim', {
        html: icon('calendar', 15, 2),
        title: '此账单随附的可打印工时表',
        onclick: () => openTimesheetSheet({ invoice }),
      }, ' 工时表'),
      voidBtn,
      el('button.btn.btn-primary.btn-slim', {
        html: icon('printer', 15, 2),
        onclick: () => window.print(),
      }, ' 打印或另存为 PDF'),
    ],
  });

  render();
  store.addEventListener('change', onChange);
}
