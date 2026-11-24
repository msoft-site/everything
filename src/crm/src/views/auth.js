import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/** Pre-sign-in intro page: what the app is, why it's safe, one button in. */
export function authView({ onSignedIn }) {
  const cta = el('button.btn.btn-primary.auth-cta', {
    onclick: async () => {
      cta.disabled = true;
      cta.textContent = '正在进入…';
      try {
        await puter.auth.signIn();
        onSignedIn();
      } catch {
        cta.disabled = false;
        cta.textContent = '进入系统';
      }
    },
  }, '进入系统');

  return el('div.auth-view', {},
    el('img.auth-logo', { src: './icon-192.png', alt: '', 'aria-hidden': 'true' }),
    el('h1.auth-title', {}, '客户关系管理 (Sales CRM)'),
    el('p.auth-sub', {}, '为创始人与团队打造的线索、漏斗商机、跟进与回款预测系统。'),
    el('div.auth-features', {},
      feature('pipeline', '可视化销售漏斗看板，清晰掌控每笔商机进展'),
      feature('followups', '智能到期跟进提醒，绝不错过任何关键潜客沟通'),
      feature('chart', '基于阶段概率的精准业绩预测，数据一目了然'),
      feature('company', '数据完全保存在您的本地安全存储中，隐私自主可控')
    ),
    cta,
    el('p.auth-note', {}, '全开源 · 纯本地存储 · 安全无广告')
  );

  function feature(ic, text) {
    return el('div.auth-feature', { html: icon(ic, 20, 1.8) }, el('span', {}, text));
  }
}
