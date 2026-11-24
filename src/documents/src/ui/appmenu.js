/**
 * The account menu shared by the home screen and the editor: theme,
 * shortcuts, about, and (outside the Puter desktop) sign in or out. Inside a
 * Puter app window the desktop owns the session, so neither is offered there.
 *
 * Where puter.js has <puter-user-menu> (user-menu.js), that holds the account
 * and the Apps launcher, and this menu is the Settings button's beside it,
 * without the account's rows.
 */

import { el } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { appsButton, closeAppsPanel } from './apps-panel.js';
import { userMenu } from './user-menu.js';
import { openModal, confirmDialog } from './modal.js';
import { toast } from './toast.js';
import { openShortcuts } from './shortcuts.js';
import { segmented } from './segmented.js';
import { currentTheme, isDark, darkPage, setDarkPage } from './theme.js';
import { UNITS, recallUnit, rememberUnit, unitLabel } from '../lib/units.js';
import { autocorrectEnabled, setAutocorrectEnabled, capitalizeSentencesEnabled, setCapitalizeSentencesEnabled } from '../lib/autocorrect.js';
import { autolinkEnabled, setAutolinkEnabled } from '../lib/linkify.js';
import { session } from '../lib/session.js';
import * as P from '../lib/puter.js';

/** `account: false` leaves out who is signed in and Sign in or out, for the Settings button beside <puter-user-menu>. */
export function openAppMenu(anchor, { extraItems = [], account = true } = {}) {
  // The Apps panel hangs from the same corner: never both at once.
  closeAppsPanel();
  let opened = null;
  // One radio group, like the dialogs' choices: Left and Right move between the themes.
  const themeRow = el('div.menu-theme', {},
    segmented([['system', 'monitor', '跟随系统'], ['light', 'sun', '浅色'], ['dark', 'moon', '深色']]
      .map(([mode, ic, label]) => [mode, [el('span', { html: icon(ic, 15, 2) }), label]]),
    currentTheme(), (mode) => {
      session.setTheme(mode);
      // The dark page option follows the theme picked here without reopening the menu.
      darkPageItem.disabled = !isDark();
      const button = [...(opened?.menu?.querySelectorAll('.menu-item') || [])].find((node) => node.querySelector('.menu-label')?.firstChild?.textContent === darkPageItem.label);
      if (button) button.disabled = darkPageItem.disabled;
    }, '外观'));
  const darkPageItem = { label: '深色页面', icon: 'brand', checked: darkPage(), disabled: !isDark(), hint: '深色主题下的深色纸张', onSelect: () => setDarkPage(!darkPage()) };

  const items = [
    account && { header: session.signedOut ? '未登录' : session.username },
    { custom: themeRow },
    darkPageItem,
    { separator: true },
    ...extraItems,
    { label: '度量单位', icon: 'ruler', hint: unitLabel(recallUnit()), onSelect: () => openUnitsMenu(anchor) },
    { label: '键入时自动更正', checked: autocorrectEnabled(), hint: '直引号替换为弯引号、破折号、省略号、符号、分数等', onSelect: () => setAutocorrectEnabled(!autocorrectEnabled()) },
    { label: '句首字母大写', checked: capitalizeSentencesEnabled(), onSelect: () => setCapitalizeSentencesEnabled(!capitalizeSentencesEnabled()) },
    { label: '键入时将网址转为超链接', checked: autolinkEnabled(), hint: '在空格或回车时将网址和邮箱设为链接', onSelect: () => setAutolinkEnabled(!autolinkEnabled()) },
    { label: '键盘快捷键', icon: 'keyboard', onSelect: openShortcuts },
    { label: '关于 Documents', icon: 'info', onSelect: openAbout },
  ];
  if (account && !P.isApp()) {
    items.push({ separator: true });
    if (session.signedOut) items.push({ label: '登录 Puter', icon: 'login', hint: '将文档保存到您的云端空间', onSelect: () => session.signIn() });
    else items.push({ label: '退出登录', icon: 'logout', onSelect: confirmSignOut });
  }
  opened = openMenu({ anchor, items: items.filter(Boolean), align: 'end', label: account ? '账户' : '设置', minWidth: 250 });
}

/**
 * A header's account corner, shared by the home screen and the editor: the Apps button and the account button,
 * or, where puter.js has it, a Settings button and <puter-user-menu>, which holds both. `refresh` redraws the
 * account button's face after the session changed.
 */
export function accountControls({ label = '账户菜单', buttonClass = 'icon-btn.user-btn' } = {}) {
  const sdkMenu = userMenu({ onSignOut: confirmSignOut });
  if (sdkMenu) {
    const settings = el('button.icon-btn.settings-btn', {
      type: 'button', html: icon('settings', 20), title: '设置', 'aria-label': '设置', 'aria-haspopup': 'menu',
      onclick: (e) => openAppMenu(e.currentTarget, { account: false }),
    });
    return { nodes: [settings, sdkMenu], refresh() {} };
  }
  const avatar = el(`button.${buttonClass}`, {
    type: 'button', 'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: (e) => openAppMenu(e.currentTarget),
  });
  renderAccountButton(avatar);
  return { nodes: [appsButton(), avatar], refresh: () => renderAccountButton(avatar) };
}

const accountFaces = new WeakMap();

/** Keep the initial visible until an optional profile picture has actually loaded. */
export function renderAccountButton(button) {
  const signedOut = session.signedOut;
  button.title = signedOut ? '未登录' : session.username;
  button.setAttribute('aria-label', signedOut ? '账户菜单。未登录' : `${session.username} 的账户菜单`);
  const id = session.accountId;
  const key = `${session.state}:${id}:${session.username}`;
  let face = accountFaces.get(button);
  if (face?.key !== key || button.firstElementChild !== face.avatar) {
    face = { key, avatar: signedOut
      ? el('span.user-avatar.user-avatar-anon', { html: icon('user', 17, 2), 'aria-hidden': 'true' })
      : el('span.user-avatar', { 'aria-hidden': 'true' }, session.username.charAt(0)) };
    accountFaces.set(button, face);
    button.replaceChildren(face.avatar);
  }
  if (!id) return;
  const current = () => accountFaces.get(button) === face && button.firstElementChild === face.avatar && session.accountId === id && button.isConnected;
  session.getProfilePicture().then((picture) => {
    if (!current() || face.picture === picture) return;
    face.picture = picture;
    const initial = session.username.charAt(0);
    if (!picture) { face.avatar.replaceChildren(initial); return; }
    const image = el('img', { alt: '', width: 32, height: 32, decoding: 'async', draggable: false,
      onload: () => { if (current() && face.picture === picture) face.avatar.replaceChildren(image); },
      onerror: () => { if (current() && face.picture === picture) face.avatar.replaceChildren(initial); },
    });
    image.src = picture;
  });
}

/** Inches or centimeters, for the ruler and every dialog that measures. */
export function openUnitsMenu(anchor) {
  const current = recallUnit();
  openMenu({
    anchor, align: 'end', label: '度量单位', minWidth: 220,
    items: [
      { header: '度量单位' },
      ...UNITS.map((u) => ({ label: u.label, radio: true, checked: current === u.id, onSelect: () => rememberUnit(u.id) })),
      { separator: true },
      { note: '用于标尺、页面设置、缩进和表格' },
    ],
  });
}

export async function confirmSignOut() {
  const ok = await confirmDialog({
    title: '退出登录？',
    message: '您的文档保存在您的 Puter 账户中。打开文档中的任何未保存更改将首先保存。',
    confirmLabel: '退出登录', danger: false,
  });
  if (!ok) return;
  const pending = [];
  window.dispatchEvent(new CustomEvent('app:before-signout', {
    detail: { waitUntil: (promise) => pending.push(Promise.resolve(promise)) },
  }));
  try {
    // Signing out would lose what the open document could not save: stay, and say why.
    if ((await Promise.all(pending)).some((saved) => saved === false)) {
      toast('当前打开的文档无法保存，因此您仍处于登录状态。请先保存或下载。', { icon: 'alert', duration: 8000 });
      return;
    }
    await P.signOut();
    location.hash = '';
    location.reload();
  } catch (e) {
    toast(e?.message || '无法退出登录。请重试', { icon: 'alert', duration: 8000 });
  }
}

export function openAbout() {
  openModal({
    title: '文档 (Documents)',
    content: el('div', {},
      el('p.modal-text', {}, '基于原生 Canvas 编辑器的私有文字处理软件。文件以 .docx 格式保存在您自己的 Puter 云端。'),
      el('p.modal-text', {}, '当前版本支持文本和段落格式设置、选区、撤销/重做以及 DOCX 导出下载。'),
      el('p.small.muted', {}, '基于原生 JavaScript、Vite、Lucide 图标、fflate、思源黑体与 ',
        el('a', { href: 'https://developer.puter.com', target: '_blank', rel: 'noopener' }, 'Puter'), ' 构建。'),
      el('p.small.muted', {}, el('a', { href: `${import.meta.env.BASE_URL}licenses/THIRD_PARTY.txt`, target: '_blank', rel: 'noopener' }, '第三方开源许可')),
      el('p.small.muted', { lang: 'ko' }, '본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.')),
  });
}
