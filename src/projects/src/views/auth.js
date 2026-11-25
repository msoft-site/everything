import { el } from '../lib/dom.js';
import { icon } from '../ui/icons.js';
import { appIcon } from '../ui/bits.js';

/** Signed-out intro page: what the app is, one button to get in. */
export function authView({ onSignedIn }) {
  const cta = el('button.btn.btn-primary.auth-cta', {
    onclick: async () => {
      cta.disabled = true;
      cta.textContent = '正在加载本地工作区…';
      try {
        await puter.auth.signIn();
        onSignedIn();
      } catch {
        cta.disabled = false;
        cta.textContent = '登录';
      }
    },
  }, '登录');

  return el('div.auth-view', {},
    appIcon(84, 'auth-logo'),
    el('h1.auth-title', {}, '项目管理'),
    el('p.auth-sub', {}, '专为高效交付打造的看板、时间线与里程碑。轻巧易用，结构严谨，值得信赖。'),
    el('div.auth-features', {},
      feature('board', '支持拖拽、标签、优先级和负责人的看板'),
      feature('timeline', '一目了然展现所有带日期任务与里程碑的时间线'),
      feature('cloud', '每个任务均支持评论与附件，保存在您自己的 本地存储')
    ),
    cta,
    el('p.auth-note', {}, '免费 · 无广告 · 由 ',
      el('a', { href: 'https://developer.puter.com', target: '_blank', rel: 'noopener' }, 'Puter'), ' 提供支持')
  );

  function feature(ic, text) {
    return el('div.auth-feature', { html: icon(ic, 20, 1.8) }, el('span', {}, text));
  }
}
