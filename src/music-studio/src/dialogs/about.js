// About Music Studio: version, license, source and credits.

import { h } from '../lib/dom.js';
import { openDialog } from '../ui/dialog.js';
import { appIcon } from '../ui/icons.js';
import { REPO_URL } from '../ui/toolbar.js';
import { version } from '../../package.json';

export async function openAbout() {
  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
  const logo = appIcon(48);
  logo.addEventListener('error', () => logo.remove());
  await openDialog({
    title: '关于音乐工作室',
    className: 'dlg-about',
    body: h(
      'div.about',
      h('div.about-head', logo, h('div', h('h3.about-name', '音乐工作室'), h('div.faint', `版本 ${version}（内测版）`))),
      h('p', '浏览器中基于样式的音乐工作站：在通道机架中编写节拍，在钢琴卷帘中创作旋律，在播放列表中编排歌曲，并使用工作室效果器进行混音。所有内置音色均由实时合成生成，不捆绑任何录音采样。'),
      h('p', h('strong', '免费且开源 (MIT)。'), '您可以在 ', link(REPO_URL, 'GitHub'), ' 上阅读源码、反馈问题并参与贡献。'),
      h('p.about-alpha', '当前为早期内测版本。功能可能会发生变动，工程也有丢失风险，请务必备份重要作品（文件 > 保存到当前设备）。'),
      h('h3.dlg-section', '致谢'),
      h('ul.about-credits', h('li', link('https://lucide.dev', 'Lucide'), ' 图标（ISC 许可证）'), h('li', '云端存储与登录服务由 ', link('https://developer.puter.com', 'Puter'), ' 提供')),
    ),
    buttons: [{ label: '关闭', value: true, primary: true }],
  });
}
