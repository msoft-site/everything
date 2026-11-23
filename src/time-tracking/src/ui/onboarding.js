/**
 * First-run onboarding: one decision (set up / sample data / skip) and one
 * short setup step (currency + default rate). Gated on an empty dataset;
 * closing at any point marks onboarding done.
 */

import { el, clear, append } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { field, fieldError, RATE_ERROR } from './fields.js';
import { store, rateAt } from '../lib/store.js';
import { sampleDataset } from '../lib/sample.js';
import { CURRENCIES, parseAmount } from '../lib/util.js';
import { todayISO } from '../lib/time.js';

export function shouldOnboard(store) {
  return !store.settings.onboarded && !store.settings.sampleData
    && store.clients.length === 0 && store.months.length === 0;
}

export function openOnboarding() {
  const body = el('div');

  const markDone = () => {
    if (!store.settings.onboarded) {
      store.updateSettings({ onboarded: true }).catch(() => {});
    }
  };
  const modal = openModal({ title: '欢迎使用', content: body, onClose: markDone });

  const skipBtn = () => el('button.btn.btn-ghost.btn-block', {
    type: 'button', style: { marginTop: '10px' },
    onclick: () => { markDone(); modal.close(); },
  }, '暂时跳过');

  /* Step 0: welcome */
  function renderWelcome() {
    clear(body);
    append(body, [
      el('div.onboard-hero', {},
        el('img', { src: './icons/icon-192.png', width: 64, height: 64, alt: '' }),
        el('h3.onboard-title', {}, '每一小时，都清晰可查'),
        el('p.onboard-sub', {}, '按客户、项目或任务追踪可计费工时。数据存储在您自己的 Puter 账户中，绝不出售或共享。')
      ),
      el('button.btn.btn-primary.btn-block.btn-tall', {
        type: 'button',
        onclick: renderSetup,
      }, '开始设置'),
      el('button.btn.btn-ghost.btn-block.btn-dashed', {
        type: 'button', style: { marginTop: '10px' },
        html: icon('sparkle', 15, 2),
        onclick: useSampleData,
      }, ' 使用示例数据体验'),
      skipBtn(),
    ]);
  }

  async function useSampleData(e) {
    // currentTarget is only set while the event dispatches; capture the
    // button before awaiting (e.target can be the icon inside it).
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await store.importAll(sampleDataset(store));
    } catch (err) {
      console.error(err);
      toast('无法加载示例数据，请检查网络连接', { icon: 'wifiOff' });
      btn.disabled = false;
      return;
    }
    modal.close();
    toast('已加载示例数据，您可以随时从顶部横幅清除', { icon: 'sparkle' });
  }

  /* Step 1: currency + default rate, then the Projects view takes over */
  function renderSetup() {
    clear(body);
    const currency = el('select.select', { 'aria-label': '币种' },
      CURRENCIES.map((c) => el('option', { value: c, selected: c === store.settings.currency }, c)));
    const rate = el('input.input', {
      type: 'text', inputmode: 'decimal', placeholder: '例如：100',
      // The default rate can be an effective-dated list (kept across a
      // sample-data wipe); show the rate in effect today, not the list.
      value: rateAt(store.settings.defaultRate, todayISO()) || '', autocomplete: 'off',
    });
    const rateErr = fieldError(rate);
    append(body, [
      el('h3.onboard-h', {}, '您的计费方式是什么？'),
      el('p.onboard-p', {}, '当客户或项目没有单独设置费率时，将适用默认费率。您可以随时在“设置”中修改这两项。'),
      el('div.form-grid', {},
        field('币种', currency),
        el('div', {}, field('默认时薪费率', rate), rateErr)
      ),
      el('button.btn.btn-primary.btn-block.btn-tall', {
        type: 'button',
        onclick: async (ev) => {
          rateErr.hide();
          const n = rate.value.trim() === '' ? 0 : parseAmount(rate.value);
          if (!Number.isFinite(n) || n < 0) {
            rateErr.show(RATE_ERROR);
            rate.focus();
            return;
          }
          ev.target.disabled = true;
          await store.updateSettings({ currency: currency.value, defaultRate: n, onboarded: true }).catch(() => {});
          modal.close();
          location.hash = '#/projects';
          toast('现在请添加您的第一个客户和项目', { icon: 'folders' });
        },
      }, '开始追踪'),
      skipBtn(),
    ]);
  }

  renderWelcome();
}
