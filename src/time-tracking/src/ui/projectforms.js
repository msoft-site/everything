/** Client and project add/edit sheets. */

import { el } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { field, fieldError, nativeError, switchField, rateHistoryLine, RATE_ERROR } from './fields.js';
import { store, rateAt, withRateFrom } from '../lib/store.js';
import { startLinkFor } from '../lib/urlaction.js';
import {
  parseAmount, fmtMoney, CURRENCIES, ROUNDINGS, MINIMUMS, TERM_DAYS,
  roundingLabel, minimumLabel, termsLabel,
} from '../lib/util.js';
import { todayISO } from '../lib/time.js';

const RATE_FROM_HINT = '日期留空则将新费率同时应用于现有的未开票工作；设置日期则自该日起应用新费率，不对更早的工时重新计价。';

/* A date input half filled in reads as empty, so the browser rejects it
   rather than let the app silently treat a typo as "no date". */
const RATE_FROM_ERROR = '请输入完整日期，或留空';

const COLOR_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

/* One wording for a client tax rate that will not parse, phrased like the
   rate errors beside it. */
const TAX_ERROR = '请输入数字格式的税率，例如 19';

function parseOptionalRate(input) {
  if (input.value.trim() === '') return { ok: true, value: null };
  const n = parseAmount(input.value);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

/**
 * The rate to store on save. An empty field normally clears the history
 * ("bill at the inherited rate"), but when every period starts in the
 * future the field already opened empty (there is no rate in effect today
 * to show), so an untouched save must keep the scheduled history rather
 * than silently wiping it.
 */
function rateOnSave(current, parsed, from) {
  if (parsed == null && !from && current != null && rateAt(current, todayISO()) == null) return current;
  return withRateFrom(current, parsed, from);
}

/**
 * "Copy start link": the URL that starts a timer on this project, for a
 * home-screen icon, an OS or launcher shortcut, or a stream-deck button.
 * Clipboard access can be refused, and behind an unanswered permission
 * prompt the write simply never settles, so the promise is raced against
 * a short wait: either way the link itself appears, selected and ready to
 * copy by hand, instead of a button that looks broken.
 */
function startLinkField(project) {
  const wrap = el('div');
  const link = startLinkFor(project.id);
  const reveal = () => {
    const input = el('input.input', {
      type: 'text', value: link, readOnly: true, spellcheck: false,
      'aria-label': `${project.name} 的启动链接`,
      onclick: () => input.select(),
    });
    wrap.replaceChildren(field('启动链接', input, {
      hint: '打开此链接即可为此项目启动计时器。',
    }));
    input.focus();
    input.select();
  };
  const copy = el('button.btn.btn-ghost.btn-block', {
    type: 'button',
    style: { marginTop: '6px' },
    html: icon('link', 15, 2),
    onclick: async () => {
      copy.disabled = true;
      const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 1200));
      let ok = false;
      try {
        ok = await Promise.race([navigator.clipboard.writeText(link).then(() => true), timeout]);
      } catch {
        ok = false;
      }
      copy.disabled = false;
      if (!ok) {
        reveal();
        toast('请复制下方显示的链接', { icon: 'link' });
        return;
      }
      toast('启动链接已复制', { icon: 'link' });
    },
  }, ' 复制启动链接');
  wrap.append(
    copy,
    el('p.field-hint', {},
      '可直接为此项目启动计时器的链接。将其绑定到主屏幕图标或系统快捷指令，无需先打开应用即可开始追踪。')
  );
  return wrap;
}

export function openClientForm({ client = null, onSaved = null } = {}) {
  const isEdit = !!client;
  const name = el('input.input', {
    type: 'text', value: client?.name || '', placeholder: '例如：艾克米工作室',
    required: true, maxLength: 80, autocomplete: 'off',
  });
  const nameErr = fieldError(name);
  const rate = el('input.input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: rateAt(client?.rate, todayISO()) ?? '',
  });
  const rateErr = fieldError(rate);
  const rateFrom = el('input.input', { type: 'date', 'aria-label': '费率生效日期' });
  const rateFromErr = fieldError(rateFrom);
  const currency = el('select.select', {},
    el('option', { value: '', selected: !client?.currency }, `应用默认 (${store.settings.currency})`),
    CURRENCIES.map((c) => el('option', { value: c, selected: client?.currency === c }, c))
  );
  // The inherited default rate is a bare number that bills in whatever
  // currency this client is set to (nothing converts), so the placeholder
  // shows it in the currency picked right here rather than as a figure
  // that could be read as any of them.
  const setRatePlaceholder = () => {
    const cur = currency.value || store.settings.currency;
    rate.placeholder = `默认费率 (${fmtMoney(rateAt(store.settings.defaultRate, todayISO()) || 0, cur)}/h)`;
  };
  currency.addEventListener('change', setRatePlaceholder);
  setRatePlaceholder();
  const billingEmail = el('input.input', {
    type: 'email', maxLength: 120, autocomplete: 'off',
    value: client?.billingEmail || '',
  });
  const billingEmailErr = fieldError(billingEmail);
  // The messages a required or malformed field really shows: the browser
  // stops the submit before the handler below can say anything.
  nativeError(name, nameErr, '请为客户输入名称');
  nativeError(billingEmail, billingEmailErr, '请输入电子邮箱地址，例如 name@example.com');
  nativeError(rateFrom, rateFromErr, RATE_FROM_ERROR);
  const billingAddress = el('textarea.input.textarea', {
    rows: 2, maxLength: 400, placeholder: '街道、城市、国家/地区',
  }, client?.billingAddress || '');
  const clientTaxId = el('input.input', {
    type: 'text', maxLength: 60, autocomplete: 'off',
    value: client?.taxId || '',
  });

  /* Billing rules. Every one of them inherits by default and says which
     global value it is inheriting, exactly as the rate field does: rates
     were never the only term that differs per client, they were only the
     only one the app could express. */
  const rounding = el('select.select', {},
    el('option', { value: '', selected: client?.rounding == null },
      `默认（${roundingLabel(Number(store.settings.rounding) || 0)}）`),
    ROUNDINGS.map((v) => el('option', {
      value: v,
      selected: client?.rounding != null && Number(client.rounding) === v,
    }, roundingLabel(v)))
  );
  const minimum = el('select.select', {},
    MINIMUMS.map((v) => el('option', {
      value: v,
      selected: (Number(client?.minimumMinutes) || 0) === v,
    }, minimumLabel(v)))
  );
  const clientTax = el('input.input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: client?.taxRate ?? '',
    placeholder: Number(store.settings.taxRate) > 0
      ? `默认 (${Number(store.settings.taxRate)}%)`
      : '默认（免税）',
  });
  const clientTaxErr = fieldError(clientTax);
  const terms = el('select.select', {},
    el('option', { value: '', selected: client?.paymentTermsDays == null },
      `默认（${termsLabel(store.settings.paymentTermsDays ?? null)}）`),
    TERM_DAYS.map((d) => el('option', {
      value: d,
      selected: client?.paymentTermsDays != null && Number(client.paymentTermsDays) === d,
    }, termsLabel(d)))
  );

  let slot = client?.slot || COLOR_SLOTS[store.clients.length % COLOR_SLOTS.length];
  const swatches = el('div.swatch-row', { role: 'radiogroup', 'aria-label': '客户颜色' });

  /* A radio group is one stop in the tab order and the arrows move inside
     it: eight separate tab stops that answer to nothing but Space is not
     what "radiogroup" promises. Picking rebuilds the row, so focus is put
     back on the swatch that now holds it. */
  const pick = (s) => {
    slot = s;
    renderSwatches({ focus: true });
  };

  function renderSwatches({ focus = false } = {}) {
    swatches.replaceChildren(...COLOR_SLOTS.map((s) =>
      el('button.swatch', {
        type: 'button',
        role: 'radio',
        'aria-checked': s === slot ? 'true' : 'false',
        'aria-label': `颜色 ${s}`,
        className: `swatch${s === slot ? ' active' : ''}`,
        tabindex: s === slot ? 0 : -1,
        style: { background: `var(--series-${s})` },
        onclick: () => pick(s),
        onkeydown: (e) => {
          const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
            : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const i = COLOR_SLOTS.indexOf(slot);
          pick(COLOR_SLOTS[(i + step + COLOR_SLOTS.length) % COLOR_SLOTS.length]);
        },
      })
    ));
    if (focus) swatches.querySelector('[aria-checked="true"]')?.focus();
  }
  renderSwatches();

  const save = el('button.btn.btn-primary.btn-block', { type: 'submit' }, isEdit ? '保存更改' : '添加客户');

  const form = el('form.form', {
    onsubmit: async (e) => {
      e.preventDefault();
      nameErr.hide();
      rateErr.hide();
      if (!name.value.trim()) {
        nameErr.show('请为客户输入名称');
        name.focus();
        return;
      }
      const r = parseOptionalRate(rate);
      if (!r.ok) {
        rateErr.show(RATE_ERROR);
        rate.focus();
        return;
      }
      clientTaxErr.hide();
      let taxRate = null;
      if (clientTax.value.trim() !== '') {
        const t = parseAmount(clientTax.value);
        if (!Number.isFinite(t) || t < 0) {
          clientTaxErr.show(TAX_ERROR);
          clientTax.focus();
          return;
        }
        taxRate = t;
      }
      const data = {
        name: name.value.trim(),
        slot,
        rate: rateOnSave(client?.rate ?? null, r.value, rateFrom.value || null),
        currency: currency.value || null,
        billingEmail: billingEmail.value.trim(),
        billingAddress: billingAddress.value.trim(),
        taxId: clientTaxId.value.trim(),
        // Empty means inherit, at every one of these; a minimum of zero is
        // simply no minimum, so it stores as nothing rather than a rule.
        rounding: rounding.value === '' ? null : Number(rounding.value),
        taxRate,
        paymentTermsDays: terms.value === '' ? null : Number(terms.value),
        minimumMinutes: Number(minimum.value) || null,
      };
      // Disabled while saving so a double-click cannot add twice.
      save.disabled = true;
      try {
        if (isEdit) await store.updateClient(client.id, data);
        else await store.addClient(data);
      } catch (err) {
        console.error(err);
        save.disabled = false;
        toast('无法保存，请检查网络连接', { icon: 'wifiOff' });
        return;
      }
      modal.close();
      toast(isEdit ? '客户已更新' : '客户已添加');
      onSaved?.();
    },
  },
    el('div', {}, field('名称', name), nameErr),
    field('颜色', swatches),
    el('div.form-grid', {},
      el('div', {}, field('时薪费率', rate), rateErr),
      el('div', {}, field('费率生效日期', rateFrom), rateFromErr)
    ),
    el('p.field-hint', { style: { marginTop: '-8px' } }, RATE_FROM_HINT),
    rateHistoryLine(client?.rate, client?.currency || store.settings.currency),
    field('币种', currency, { hint: '未设置单独费率的项目将按此币种下的客户费率计费。总额不会跨币种混合计算。' }),
    el('div.form-grid', {},
      el('div', {}, field('账单邮箱', billingEmail), billingEmailErr),
      field('税号 / 增值税号', clientTaxId)
    ),
    field('账单地址', billingAddress, { hint: '账单详情为选填项，将显示在为此客户开具的账单上。' }),
    el('h3.sheet-section', {}, '计费规则'),
    /* Rounding and terms get the full width: their inherit option spells
       out the global value it inherits ("Default (Up to 15 minutes)",
       "Default (Due on receipt)"), and a native select cuts text that
       does not fit rather than wrapping it, so in a half-width column
       the value the option exists to show was the part that went
       missing. The two short rules share a row as before. */
    field('可计费时长取整', rounding),
    el('div.form-grid', {},
      field('最低计费时长', minimum),
      el('div', {}, field('税率 (%)', clientTax), clientTaxErr)
    ),
    field('付款条款', terms),
    el('p.field-hint', { style: { marginTop: '-4px' } },
      '在此处单独设置前，每项规则默认继承您的全局设置。取整和最低时长适用于新计费记录；已开票的工时保留其开票时的规则。'),
    save
  );

  const modal = openModal({ title: isEdit ? '编辑客户' : '新建客户', content: form });
}

export function openProjectForm({ project = null, clientId = null, onSaved = null } = {}) {
  const isEdit = !!project;
  const clients = store.activeClients();
  if (!clients.length && !isEdit) {
    toast('请先添加客户', { icon: 'users' });
    return;
  }

  const name = el('input.input', {
    type: 'text', value: project?.name || '', placeholder: '例如：网站改版',
    required: true, maxLength: 80, autocomplete: 'off',
  });
  const nameErr = fieldError(name);
  const clientSel = el('select.select', {},
    clients.map((c) => el('option', { value: c.id, selected: c.id === (project?.clientId || clientId) }, c.name))
  );
  // Editing a project of an archived client: keep it selectable as itself.
  if (isEdit && !clients.some((c) => c.id === project.clientId)) {
    const c = store.client(project.clientId);
    if (c) clientSel.append(el('option', { value: c.id, selected: true }, `${c.name}（已归档）`));
  }
  const rate = el('input.input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: rateAt(project?.rate, todayISO()) ?? '',
  });
  const rateErr = fieldError(rate);
  const rateFrom = el('input.input', { type: 'date', 'aria-label': '费率生效日期' });
  const rateFromErr = fieldError(rateFrom);
  nativeError(name, nameErr, '请为项目输入名称');
  nativeError(rateFrom, rateFromErr, RATE_FROM_ERROR);
  // Name the level the inherited rate actually comes from: a client
  // without a rate of its own passes the global default through, and
  // calling that "Client rate" misstates where to go to change it.
  const setRatePlaceholder = () => {
    const c = store.client(clientSel.value);
    const clientRate = rateAt(c?.rate, todayISO());
    const inherited = clientRate ?? rateAt(store.settings.defaultRate, todayISO()) ?? 0;
    const cur = c?.currency || store.settings.currency;
    rate.placeholder = `${clientRate != null ? '客户费率' : '默认费率'} (${fmtMoney(inherited, cur)}/h)`;
  };
  clientSel.addEventListener('change', setRatePlaceholder);
  setRatePlaceholder();
  const billable = switchField('默认可计费', project ? project.billable : true,
    { hint: '此项目下的新记录默认设为可计费。' });

  /* Budget: optional cap in hours or money, per month (retainer) or for
     the whole project. */
  const budget = project?.budget || null;
  const budgetKind = el('select.select', {},
    el('option', { value: '', selected: !budget }, '无预算'),
    el('option', { value: 'hours', selected: budget?.kind === 'hours' }, '工时'),
    el('option', { value: 'amount', selected: budget?.kind === 'amount' }, '金额')
  );
  const budgetValue = el('input.input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: budget?.value ?? '',
  });
  const budgetPeriod = el('select.select', {},
    el('option', { value: 'total', selected: !budget || budget.period === 'total' }, '整个项目'),
    el('option', { value: 'monthly', selected: budget?.period === 'monthly' }, '每月（包月顾问）')
  );
  const budgetErr = fieldError(budgetValue);
  const budgetDetail = el('div.form-grid', {},
    field('限额', budgetValue),
    field('重置周期', budgetPeriod)
  );
  const syncBudgetUI = () => {
    budgetDetail.hidden = !budgetKind.value;
    budgetValue.placeholder = budgetKind.value === 'hours' ? '例如：40' : '例如：5000';
  };
  budgetKind.addEventListener('change', syncBudgetUI);
  syncBudgetUI();

  const save = el('button.btn.btn-primary.btn-block', { type: 'submit' }, isEdit ? '保存更改' : '添加项目');

  const form = el('form.form', {
    onsubmit: async (e) => {
      e.preventDefault();
      nameErr.hide();
      rateErr.hide();
      if (!name.value.trim()) {
        nameErr.show('请为项目输入名称');
        name.focus();
        return;
      }
      const r = parseOptionalRate(rate);
      if (!r.ok) {
        rateErr.show(RATE_ERROR);
        rate.focus();
        return;
      }
      budgetErr.hide();
      let budgetData = null;
      if (budgetKind.value) {
        const v = parseAmount(budgetValue.value);
        if (!Number.isFinite(v) || v <= 0) {
          budgetErr.show(budgetKind.value === 'hours' ? '请输入以小时为单位的预算，例如 40' : '请输入预算金额，例如 5000');
          budgetValue.focus();
          return;
        }
        budgetData = { kind: budgetKind.value, value: v, period: budgetPeriod.value };
      }
      const data = {
        clientId: clientSel.value,
        name: name.value.trim(),
        rate: rateOnSave(project?.rate ?? null, r.value, rateFrom.value || null),
        billable: billable.input.checked,
        budget: budgetData,
      };
      // Disabled while saving so a double-click cannot add twice.
      save.disabled = true;
      try {
        if (isEdit) await store.updateProject(project.id, data);
        else await store.addProject(data);
      } catch (err) {
        console.error(err);
        save.disabled = false;
        toast('无法保存，请检查网络连接', { icon: 'wifiOff' });
        return;
      }
      modal.close();
      toast(isEdit ? '项目已更新' : '项目已添加');
      onSaved?.();
    },
  },
    el('div', {}, field('名称', name), nameErr),
    field('客户', clientSel),
    el('div.form-grid', {},
      el('div', {}, field('时薪费率', rate), rateErr),
      el('div', {}, field('费率生效日期', rateFrom), rateFromErr)
    ),
    el('p.field-hint', { style: { marginTop: '-8px' } },
      `费率留空则按客户费率计费，若客户也未设置则使用您的默认费率。${RATE_FROM_HINT}`),
    rateHistoryLine(project?.rate, store.client(project?.clientId || clientId)?.currency || store.settings.currency),
    billable,
    field('预算', budgetKind, { hint: '达到限额的 80% 和 100% 时收到提醒。' }),
    el('div', {}, budgetDetail, budgetErr),
    save,
    isEdit && startLinkField(project)
  );

  const modal = openModal({ title: isEdit ? '编辑项目' : '新建项目', content: form });
}
