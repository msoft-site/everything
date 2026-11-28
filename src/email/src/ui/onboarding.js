import { el } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';

const LS_KEY = 'puter-mail:onboarded';

export function shouldOnboard() {
  try {
    return !localStorage.getItem(LS_KEY);
  } catch {
    return false;
  }
}

function markDone() {
  try {
    localStorage.setItem(LS_KEY, '1');
  } catch {}
}

/**
 * 欢迎向导与首次使用引导
 */
export function openOnboarding({ onNotify = null, notificationsOn = false } = {}) {
  const body = el('div');
  const modal = openModal({ title: '欢迎使用电子邮件', content: body, onClose: markDone });

  const row = (iconName, title, text) => el('div.onboard-row', {},
    el('span.onboard-icon', { html: icon(iconName, 18) }),
    el('span', {},
      el('strong', {}, title),
      el('span.onboard-text', {}, text),
    ),
  );

  const notifyRow = () => {
    const status = el('span.onboard-text', { role: 'status' },
      notificationsOn ? '已为此设备开启新邮件通知。' : '');
    const button = el('button.btn.btn-tonal.btn-small.onboard-action', {
      type: 'button',
      onclick: async () => {
        button.disabled = true;
        const on = await onNotify().catch(() => false);
        if (!on) {
          button.disabled = false;
          return;
        }
        button.remove();
        status.textContent = '已为此设备开启新邮件通知。';
      },
    }, '开启新邮件通知');
    const item = row('bell', '新邮件实时通知',
      '即使关闭邮件应用，也能在此设备上及时收到新邮件提醒。您可随时在“设置”中修改此项。');
    item.lastChild.append(status);
    if (!notificationsOn) item.lastChild.append(button);
    return item;
  };

  body.append(
    el('p.onboard-lead', {}, '您的所有邮件数据均安全保存在本地独立存储中，应用为您直接收发与管理。'),
    row('shield', '邮件隐私完全归您所有',
      '所有邮件均作为独立文件保存在本地存储中。应用仅在您明确指示时执行写入（如保存发件箱副本、归档、删除与恢复）。除非您在废纸篓中彻底清空，否则绝不自动删除任何邮件。'),
    row('mailOpen', '安全隔离渲染',
      '邮件默认以纯文本安全模式打开。您也可以选择显示邮件的原始排版，系统将在无脚本运行权限的隔离沙箱中安全渲染，且在您允许前自动拦截远程外部图片。'),
    row('star', '本地账户独立保存',
      '您的已读与星标标记保存在本地账户中，状态精准保持一致。'),
    row('send', '邮件撰写与发送',
      '支持富文本轻量排版与本地附件上传，每封邮件同时包含纯文本兼容版本，确保在任何客户端上均可完美排版阅读。'),
    row('pencil', '草稿自动本地暂存',
      '编辑未完成的邮件在关闭时会自动保存为本地草稿，重新打开写信即可继续编辑。'),
    onNotify && notifyRow(),
    el('button.btn.btn-primary.btn-block', {
      type: 'button', onclick: () => modal.close(),
    }, '进入收件箱'),
  );

  return modal;
}
