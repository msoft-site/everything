/** Sign-in screen, error screen, and the first-run company setup. */
import { el, append } from '../ui/dom.js';
import { icon, appMark } from '../ui/icons.js';
import { openDialog } from '../ui/dialog.js';
import { field, textInput, selectInput, checkbox } from '../ui/fields.js';
import { monthName } from '../lib/dates.js';

export function authView({ onSignIn, error = null }) {
  const btn = el('button.btn.btn-primary.auth-cta', { type: 'button' }, '登录');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = '正在登录...';
    try {
      await onSignIn();
    } finally {
      btn.disabled = false;
      btn.textContent = '登录';
    }
  });
  return el('main.auth', { id: 'main' },
    el('div.auth-card', {},
      el('div.auth-mark', { html: appMark(56) }),
      el('h1.auth-title', {}, '财务记账'),
      el('p.auth-sub', {}, '发票、账单、银行账户、对账与财务报表，全部安全存储在本地。'),
      error ? el('p.field-error', { role: 'alert' }, error) : null,
      btn,
      el('ul.auth-points', {},
        ['复式记账法，确保借贷始终平衡', '损益表、资产负债表、现金流量表与账龄分析', '数据完全保存在您的本地空间'].map((t) => el('li', {}, el('span', { html: icon('check', 16) }), t))),
      el('p.auth-foot', {}, '基于 ', el('a', { href: 'https://developer.puter.com', target: '_blank', rel: 'noopener' }, 'Puter'), ' 驱动')));
}

export function errorView({ title, message, onRetry }) {
  return el('main.auth', { id: 'main' },
    el('div.auth-card', {},
      el('div.empty-icon', { html: icon('offline', 26) }),
      el('h1.auth-title', { style: { fontSize: '22px' } }, title),
      el('p.auth-sub', {}, message),
      el('button.btn.btn-primary.auth-cta', { type: 'button', onclick: onRetry }, '重试')));
}

export function bootView(text = '正在打开账套...') {
  return el('div.boot', { role: 'status', 'aria-live': 'polite' }, el('div.boot-inner', {}, el('div', { html: appMark(48) }), el('div.boot-bar'), el('span', {}, text)));
}

/** First run: name the company and pick basics. Resolves { name, currency, fiscalStartMonth, dateStyle, sample }. */
export function onboarding({ defaultName = '' } = {}) {
  return new Promise((resolve) => {
    const o = { name: defaultName, currency: 'CNY', fiscalStartMonth: 1, dateStyle: 'ymd', sample: false };
    const name = textInput({ value: o.name, autocomplete: 'organization' });
    const nameErr = el('span.field-error', { role: 'alert', hidden: true }, '请输入企业名称。');
    name.addEventListener('input', () => { o.name = name.value; nameErr.hidden = true; name.removeAttribute('aria-invalid'); });
    const currency = selectInput({
      options: [
        ['CNY', 'CNY (人民币 ¥)'],
        ['USD', 'USD (美元 $)'],
        ['EUR', 'EUR (欧元 €)'],
        ['GBP', 'GBP (英镑 £)'],
        ['HKD', 'HKD (港币 HK$)'],
        ['JPY', 'JPY (日元 ¥)'],
        ['CAD', 'CAD (加拿大元 $)'],
        ['AUD', 'AUD (澳大利亚元 $)'],
        ['SGD', 'SGD (新加坡元 $)'],
      ],
      value: o.currency,
      onChange: (v) => { o.currency = v; }
    });
    const fy = selectInput({ options: Array.from({ length: 12 }, (_, i) => [String(i + 1), `${i + 1}月`]), value: '1', onChange: (v) => { o.fiscalStartMonth = +v; } });
    const ds = selectInput({ options: [['ymd', '年-月-日 (中国标准)'], ['mdy', '月/日/年 (美制)'], ['dmy', '日/月/年 (欧制)']], value: o.dateStyle, onChange: (v) => { o.dateStyle = v; } });
    const sample = checkbox({ checked: false, label: '预置演示样例数据以供快速体验', onChange: (v) => { o.sample = v; } });
    let done = false;
    const finish = () => {
      o.name = o.name.trim();
      if (!o.name) {
        nameErr.hidden = false;
        name.setAttribute('aria-invalid', 'true');
        name.focus();
        return;
      }
      done = true;
      dlg.close();
      resolve(o);
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });
    const dlg = openDialog({
      title: '初始化设置您的账套',
      body: el('div.stack', {},
        el('p', {}, '系统已为您预置标准会计科目表。您稍后随时可以在“设置”中修改任何配置。'),
        append(field('企业/组织名称', name, { required: true }), [nameErr]),
        el('div.form-grid', {}, field('本位币', currency), field('会计年度起始月份', fy), field('日期显示格式', ds)),
        sample),
      footer: el('div.end', {}, el('button.btn.btn-primary', { type: 'button', onclick: finish }, '立即创建账套')),
      initialFocus: name,
      onClose: () => { if (!done) resolve({ ...o, name: o.name.trim() || '我的企业' }); },
    });
  });
}
