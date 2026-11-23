/** Business-wide settings, stored as one small KV item. */

export function defaultSettings() {
  return {
    company: {
      name: '',
      phone: '',
      email: '',
      website: '',
      address: '',
      taxId: '',
    },
    currency: 'USD',
    weekStart: 0,
    workday: { start: '07:00', end: '18:00' },
    taxes: [],
    defaultTaxId: null,
    numbering: { quote: 1, job: 1, invoice: 1, request: 1 },
    quotes: {
      validDays: 30,
      message: '感谢您给我们提供本次工作报价的机会。如有任何问题，请随时与我们联系。',
      disclaimer: '本报价单自出具之日起 30 天内有效，逾期价格可能会有所调整。',
    },
    invoices: {
      terms: 'net30',
      message: '感谢您的惠顾。如对本账单有任何疑问，请随时与我们联系。',
      disclaimer: '',
    },
    jobs: { defaultBilling: 'on_completion' },
    leadSources: ['转介绍', 'Google', '网站', '社交媒体', '传单', '老客户', '其他'],
    expenseCategories: ['材料', '燃油', '设备', '分包商', '办公', '车辆', '其他'],
    onboarded: false,
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Deep merge for plain objects; arrays and scalars replace. */
export function mergeSettings(base, changes) {
  const out = { ...base };
  for (const [k, v] of Object.entries(changes || {})) {
    out[k] = isObj(v) && isObj(base?.[k]) ? mergeSettings(base[k], v) : v;
  }
  return out;
}

export const PAYMENT_TERMS = [
  { id: 'receipt', label: '收到即付', days: 0 },
  { id: 'net7', label: '7 天账期 (Net 7)', days: 7 },
  { id: 'net15', label: '15 天账期 (Net 15)', days: 15 },
  { id: 'net30', label: '30 天账期 (Net 30)', days: 30 },
  { id: 'net45', label: '45 天账期 (Net 45)', days: 45 },
  { id: 'net60', label: '60 天账期 (Net 60)', days: 60 },
  { id: 'custom', label: '自定义日期', days: null },
];

export function termDays(terms) {
  return PAYMENT_TERMS.find((t) => t.id === terms)?.days ?? 30;
}

export const PAYMENT_METHODS = [
  { id: 'cash', label: '现金' },
  { id: 'check', label: '支票' },
  { id: 'card', label: '信用卡或借记卡' },
  { id: 'bank', label: '银行转账' },
  { id: 'other', label: '其他' },
];

export function taxRateFor(settings, taxId) {
  const t = (settings.taxes || []).find((x) => x.id === taxId);
  return t ? Number(t.rate) || 0 : 0;
}
