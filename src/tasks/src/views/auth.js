import { el } from '../lib/dom.js';
import { icon } from '../ui/icons.js';
import iconUrl from '../assets/icon-192.png';

/** Signed-out intro page: value proposition + Sign in. */
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
    el('img.auth-logo', { src: iconUrl, width: 88, height: 88, alt: '待办清单' }),
    el('h1.auth-title', {}, '待办事项 (Tasks)'),
    el('p.auth-sub', {}, '高效轻量的个人与团队待办清单，完全运行在您的本地私有环境。'),
    el('div.auth-features', {},
      feature('repeat', '周期性重复任务与智能提醒，让日程井井有条'),
      feature('users', '支持清单灵活管理与共享视图导出'),
      feature('calendar', '内置日历视图与日程全景掌控'),
      feature('cloud', '数据保存在您本地，隐私完全自主可控')
    ),
    cta,
    el('p.auth-note', {}, '全开源 · 纯本地存储 · 安全无广告')
  );

  function feature(ic, text) {
    return el('div.auth-feature', { html: icon(ic, 20, 1.8) }, el('span', {}, text));
  }
}
