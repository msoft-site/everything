/**
 * First-run onboarding: one decision (set up / sample data / skip) and one
 * short form (business name, email, currency). Everything else lives in
 * Settings, so skipping loses nothing. Gated on an empty dataset; closing
 * at any point marks onboarding done.
 */

import { el, clear, append } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { refocus } from './bits.js';
import { store } from '../lib/store.js';
import { CURRENCIES } from '../lib/money.js';
import { sampleDataset } from '../lib/sample.js';

export function shouldOnboard(store) {
  return !store.settings.onboarded && !store.settings.sampleData
    && store.docs().length === 0 && store.clients.length === 0;
}

export function openOnboarding() {
  const body = el('div');

  const markDone = () => {
    if (!store.settings.onboarded) store.updateSettings({ onboarded: true }).catch(() => {});
  };
  const modal = openModal({ title: '欢迎使用发票管理', content: body, onClose: markDone });

  const skipBtn = () => el('button.btn.btn-ghost.btn-block', {
    type: 'button', style: { marginTop: '10px' },
    onclick: () => { markDone(); modal.close(); },
  }, '暂时跳过');

  function renderWelcome() {
    clear(body);
    append(body, [
      el('div.onboard-hero', {},
        el('img.onboard-icon', { src: './icon-192.png', alt: '', 'aria-hidden': 'true' }),
        el('h3', {}, '告别繁琐，轻松开票收款'),
        el('p', {}, '支持报价估算单、发票、周期性账单、收款收据与付款链接。所有数据均安全保存在您的本地存储中。')
      ),
      el('button.btn.btn-primary.btn-block', {
        type: 'button', style: { minHeight: '44px' },
        onclick: renderBusiness,
      }, '配置我的业务信息'),
      el('button.btn.btn-block', {
        type: 'button', style: { marginTop: '10px', minHeight: '44px' },
        html: icon('sparkle', 15, 1.6),
        onclick: useSampleData,
      }, ' 体验示例数据'),
      skipBtn(),
    ]);
  }

  async function useSampleData(e) {
    // currentTarget, not target: a click on the icon inside the button
    // would otherwise "disable" the svg and leave the button clickable
    // while the import is still running.
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await store.importAll(sampleDataset(store));
    } catch (err) {
      console.error(err);
      toast('无法加载示例数据，请检查网络连接', { icon: 'wifiOff' });
      btn.disabled = false;
      refocus(btn);
      return;
    }
    modal.close();
    toast('示例数据已成功加载，您随时可在顶部提示栏中清除', { icon: 'sparkle' });
  }

  function renderBusiness() {
    clear(body);
    const name = el('input.input', { id: 'ob-name', autocomplete: 'organization', placeholder: '极光创意工作室' });
    const email = el('input.input', { id: 'ob-email', type: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
    let picked = store.settings.currency;
    append(body, [
      el('h3.onboard-h', {}, '发票开具方信息'),
      el('p.onboard-p', {}, '此信息将显示在您创建的每一份单据上。稍后随时可在“设置”中修改。'),
      el('div.field', {},
        el('label.field-label', { for: 'ob-name' }, '企业或个人名称'),
        name),
      el('div.field', {},
        el('label.field-label', { for: 'ob-email' }, '联系邮箱（选填）'),
        email),
      el('div.field', {},
        el('label.field-label', { for: 'ob-currency' }, '默认币种'),
        el('div.select-wrap', {},
          el('select.select', { id: 'ob-currency', onchange: (ev) => { picked = ev.target.value; } },
            CURRENCIES.map((cur) =>
              el('option', { value: cur.code, selected: cur.code === picked }, `${cur.code} · ${cur.name}`))))),
      el('button.btn.btn-primary.btn-block', {
        type: 'button', style: { padding: '13px' },
        onclick: async (ev) => {
          const btn = ev.currentTarget;
          if (!name.value.trim()) {
            toast('请输入将显示在单据上的名称', { icon: 'alert' });
            name.focus();
            return;
          }
          btn.disabled = true;
          try {
            await store.updateSettings({
              business: { ...store.settings.business, name: name.value.trim(), email: email.value.trim() },
              currency: picked,
              onboarded: true,
            });
          } catch {
            btn.disabled = false;
            toast('保存失败，请检查网络连接', { icon: 'wifiOff' });
            refocus(btn);
            return;
          }
          modal.close();
          toast('设置完成！请创建您的第一张发票或报价单');
        },
      }, '开始使用发票管理'),
      skipBtn(),
    ]);
    // The step that was on screen went out with the button that was pressed,
    // and keyboard focus went with it — on <body>, outside the dialog, with
    // nothing on screen to say the form had arrived. Land where the sheet
    // itself lands when it opens: the first field on a desktop, the panel on
    // a phone, where a keyboard popping up would cover the form.
    if (matchMedia('(min-width: 640px)').matches) name.focus();
    else modal.panel.focus({ preventScroll: true });
  }

  renderWelcome();
}
