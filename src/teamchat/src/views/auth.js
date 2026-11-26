import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

export function authView({ onSignedIn, pendingInvite = null }) {
  // One press at a time while Puter answers, said with aria-busy rather than
  // by disabling the button (as pressOnce in dom.js has it): a focused
  // button that is disabled hands its focus to the page body, so a sign-in
  // given up (its window closed) came back with the button live and nobody
  // on it, and the next Tab started over from the top of the page. Signed
  // in, the button stays busy: the page gives way to the app.
  const busy = () => cta.getAttribute('aria-busy') === 'true';
  const cta = el('button.btn.btn-primary.auth-cta', {
    type: 'button',
    onclick: async () => {
      if (busy()) return;
      cta.setAttribute('aria-busy', 'true');
      cta.textContent = '正在加载本地工作区…';
      try {
        await puter.auth.signIn();
      } catch {
        cta.removeAttribute('aria-busy');
        cta.textContent = '登录';
        return;
      }
      onSignedIn();
    },
  }, '登录');

  return el('main.auth-view', {},
    el('img.auth-logo', { src: './icons/icon-192.png', width: 88, height: 88, alt: '团队聊天图标' }),
    el('h1.auth-title', {}, '团队聊天'),
    el('p.auth-sub', {}, pendingInvite
      ? '您已收到工作区加入邀请。请登录以加入。'
      : '专为团队打造的频道、话题与私信。快速、专注、数据尽在本地。'),
    el('div.auth-features', {},
      feature('hash', '通过公开与私密频道高效组织工作'),
      feature('messages', '利用话题讨论保持专注，沟通不干扰主线'),
      feature('cloud', '纯本地私有运行，零服务器依赖，一键即用')),
    cta,
    el('p.auth-note', {}, '免费、无广告、纯本地离线优先支持'));

  function feature(ic, text) {
    return el('div.auth-feature', { html: icon(ic, 20, 1.8) }, el('span', {}, text));
  }
}

