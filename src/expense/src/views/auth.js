import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/** Intro page shown before sign-in: what the app does, one call to action. */
export function authView({ onSignedIn }) {
  const cta = el('button.btn.btn-primary.btn-lg.auth-cta', {
    type: 'button',
    onclick: async () => {
      cta.disabled = true;
      cta.textContent = '正在等待 Puter…';
      try {
        await puter.auth.signIn();
        onSignedIn();
      } catch {
        cta.disabled = false;
        cta.textContent = '使用 Puter 继续';
      }
    },
  }, '使用 Puter 继续');

  return el('div.auth-view', {},
    el('div.auth-card', {},
      el('img.auth-logo', { src: './icons/icon-192.png', width: 72, height: 72, alt: '费用报销标志' }),
      el('h1.auth-title', {}, '费用报销'),
      el('p.auth-sub', {}, '拍照识别票据、AI 自动提取信息、汇总提交报销单，并与银行卡账单自动对账。私密、快捷，跨设备同步。'),
      el('ul.auth-features', {},
        feature('scan', 'AI 智能识别票据', '自动读取商家、日期、总额、税额与分类，核对确认即可保存。'),
        feature('folder', '费用报销单', '将多笔费用归集到报销单，全程跟踪草稿、已提交、已批准与已报销状态。'),
        feature('scale', '账单对账', '导入信用卡或银行账单，自动将每条账单记录与费用匹配。'),
        feature('cloud', '您的数据，您的云端', '所有数据均保存在您自己的 Puter 账户中，绝不外传。')
      ),
      cta,
      el('p.auth-note', {}, '免费 · 无广告 · 由 ',
        el('a', { href: 'https://developer.puter.com', target: '_blank', rel: 'noopener' }, 'Puter'), ' 提供支持')
    )
  );

  function feature(ic, title, text) {
    return el('li.auth-feature', {},
      el('span.auth-feature-ic', { html: icon(ic, 20, 1.8) }),
      el('div', {}, el('div.auth-feature-title', {}, title), el('div.auth-feature-text', {}, text))
    );
  }
}
