/**
 * First-run onboarding: one decision (set up / sample data / skip) and one
 * setting (base currency). Gated on an empty dataset; closing at any point
 * marks onboarding done.
 */

import { el, clear, append } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { store } from '../lib/store.js';
import { CURRENCIES } from '../lib/currencies.js';
import { sampleDataset, renderSampleReceipt } from '../lib/sample.js';

export function shouldOnboard(s = store) {
  return !s.settings.onboarded && !s.settings.sampleData && s.months.length === 0 && s.reports.length === 0;
}

export function openOnboarding({ onCapture } = {}) {
  const body = el('div');

  const markDone = () => {
    if (!store.settings.onboarded) store.updateSettings({ onboarded: true }).catch(() => {});
  };
  const modal = openModal({ title: '欢迎使用', content: body, onClose: markDone });

  const skipBtn = () => el('button.btn.btn-ghost.btn-block', {
    type: 'button', style: { marginTop: '8px' },
    onclick: () => { markDone(); modal.close(); },
  }, '暂时跳过');

  function renderWelcome() {
    clear(body);
    append(body, [
      el('div.empty', { style: { padding: '8px 8px 4px' } },
        el('div.empty-icon', { html: icon('scan', 28), style: { background: 'var(--accent-wash)', color: 'var(--accent-strong)' } }),
        el('h3', {}, '采集票据，轻松报销'),
        el('p', {}, '拍照或上传票据交由 AI 自动识别，汇总生成报销单，并与银行账单对账。数据安全存储在您自己的 Puter 账户中。')
      ),
      el('button.btn.btn-primary.btn-block.btn-lg', { type: 'button', onclick: renderCurrency }, '设置我的费用报销'),
      el('button.btn.btn-outline.btn-block', {
        type: 'button', style: { marginTop: '10px' }, html: icon('sparkle', 15, 2),
        onclick: useSampleData,
      }, '使用示例数据体验'),
      skipBtn(),
    ]);
  }

  async function useSampleData(e) {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '正在加载示例数据…';
    try {
      const data = sampleDataset(store);
      await store.importAll(data);
      // A few receipts so the viewer has something to show. Best effort.
      attachSampleReceipts(data).catch(() => {});
    } catch (err) {
      console.error(err);
      toast('无法加载示例数据，请检查网络连接', { icon: 'wifiOff' });
      btn.disabled = false;
      btn.textContent = '使用示例数据体验';
      return;
    }
    modal.close();
    toast('示例数据已加载，可随时从顶部横幅清除', { icon: 'sparkle' });
  }

  async function attachSampleReceipts(data) {
    const all = Object.values(data.expenses).flat().filter((e) => e.paymentMethod === 'Card').slice(0, 6);
    for (const exp of all) {
      const blob = await renderSampleReceipt(exp, store.category(exp.categoryId)?.name);
      if (!blob) return;
      const file = new File([blob], `${exp.merchant.toLowerCase().replace(/\s+/g, '-')}.png`, { type: 'image/png' });
      const meta = await store.saveReceipt(exp.id, file);
      await store.updateExpense(exp.id, meta);
    }
  }

  function renderCurrency() {
    clear(body);
    let picked = store.settings.baseCurrency;
    append(body, [
      el('h3.onboard-h', {}, '您使用哪种币种进行报销？'),
      el('p.onboard-p', {}, '统计汇总与报销单将使用此基准币种。单张票据可以使用任意币种。'),
      el('div.field', {},
        el('div.select-wrap', {},
          el('select.select', { 'aria-label': '基准币种', onchange: (ev) => { picked = ev.target.value; } },
            CURRENCIES.map((c) => el('option', { value: c.code, selected: c.code === picked }, `${c.code} · ${c.name}`)))
        )
      ),
      el('button.btn.btn-primary.btn-block.btn-lg', {
        type: 'button',
        onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          await store.updateSettings({ baseCurrency: picked, onboarded: true }).catch(() => {});
          modal.close();
          if (onCapture) setTimeout(onCapture, 250);
        },
      }, '采集我的第一张票据'),
      el('button.btn.btn-ghost.btn-block', {
        type: 'button', style: { marginTop: '8px' },
        onclick: async () => {
          await store.updateSettings({ baseCurrency: picked, onboarded: true }).catch(() => {});
          modal.close();
        },
      }, '稍后再添加费用'),
    ]);
  }

  renderWelcome();
}
