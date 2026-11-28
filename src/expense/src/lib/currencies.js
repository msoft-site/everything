export const CURRENCIES = [
  { code: 'CNY', name: '人民币 ¥' },
  { code: 'USD', name: '美元 $' },
  { code: 'EUR', name: '欧元 €' },
  { code: 'GBP', name: '英镑 £' },
  { code: 'CAD', name: '加拿大元' },
  { code: 'AUD', name: '澳大利亚元' },
  { code: 'NZD', name: '新西兰元' },
  { code: 'JPY', name: '日元 ¥' },
  { code: 'HKD', name: '港元 HK$' },
  { code: 'INR', name: '印度卢比' },
  { code: 'CHF', name: '瑞士法郎' },
  { code: 'SEK', name: '瑞典克朗' },
  { code: 'NOK', name: '挪威克朗' },
  { code: 'DKK', name: '丹麦克朗' },
  { code: 'PLN', name: '波兰兹罗提' },
  { code: 'CZK', name: '捷克克朗' },
  { code: 'HUF', name: '匈牙利福林' },
  { code: 'TRY', name: '土耳其里拉' },
  { code: 'BRL', name: '巴西雷亚尔' },
  { code: 'MXN', name: '墨西哥比索' },
  { code: 'ARS', name: '阿根廷比索' },
  { code: 'CLP', name: '智利比索' },
  { code: 'ZAR', name: '南非兰特' },
  { code: 'AED', name: '阿联酋迪拉姆' },
  { code: 'SAR', name: '沙特里亚尔' },
  { code: 'ILS', name: '以色列新谢克尔' },
  { code: 'SGD', name: '新加坡元' },
  { code: 'HKD', name: '港元' },
  { code: 'KRW', name: '韩元' },
  { code: 'THB', name: '泰铢' },
  { code: 'IDR', name: '印尼盾' },
  { code: 'PHP', name: '菲律宾比索' },
  { code: 'MYR', name: '马来西亚林吉特' },
  { code: 'VND', name: '越南盾' },
  { code: 'NGN', name: '尼日利亚奈拉' },
  { code: 'KES', name: '肯尼亚先令' },
  { code: 'EGP', name: '埃及镑' },
];

export const CURRENCY_CODES = new Set(CURRENCIES.map((c) => c.code));

const SYMBOLS = { $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW', '₺': 'TRY', 'R$': 'BRL', 'zł': 'PLN', 'Kč': 'CZK', 'CHF': 'CHF', '₪': 'ILS', '₫': 'VND', '₦': 'NGN', '฿': 'THB' };

/** Map an OCR'd currency hint (code or symbol) to an ISO code, or null. */
export function resolveCurrency(hint, fallback = null) {
  if (!hint) return fallback;
  const s = String(hint).trim();
  const up = s.toUpperCase();
  if (CURRENCY_CODES.has(up)) return up;
  for (const [sym, code] of Object.entries(SYMBOLS)) {
    if (s.includes(sym)) return code;
  }
  return fallback;
}
