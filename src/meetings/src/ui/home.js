import { el, clear } from './dom.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { toggleTheme, effectiveTheme } from './theme.js';
import { extractCode, buildMeetingURL } from '../lib/codes.js';
import { mintRoomCode } from '../lib/rooms.js';
import { copyText } from './panels.js';
import { formatClock, formatDay } from '../lib/time.js';
import { accountAvatar, loadAccountAvatar } from './account-avatar.js';
import { hasPuter } from '../lib/env.js';
import { mountAgenda } from './agenda.js';
import { clearAgendaCaches } from '../lib/agenda.js';
import { brandLockup } from './brand.js';
import { openHomeSettings } from './nickname.js';
import { userMenu } from './user-menu.js';

/**
 * Home screen: start or join a meeting.
 * @param {HTMLElement} root
 * @param {object} ctx  app context (openPrejoin, getUserName, ...)
 * @returns {() => void} cleanup
 */
export function mountHome(root, ctx) {
  clear(root);

  let mounted = true; // false once the view unmounts (async work may outlive it)

  // The signed-in user, fetched once per sign-in state: the header and the
  // meetings panel both want it, and /whoami is a network call.
  let userPromise = null;
  const currentUser = () => (userPromise ??= fetchUser());
  const forgetUser = () => {
    userPromise = null;
  };

  const clock = el('span', { class: 'home-clock' }, clockText());
  const themeBtn = el(
    'button',
    { class: 'icon-btn', 'aria-label': '切换主题', title: '切换浅色/深色主题', onclick: onThemeToggle },
    icon(effectiveTheme() === 'dark' ? 'sun' : 'moon')
  );

  const userSlot = el('div', { class: 'home-user' });
  // puter.js's <puter-user-menu> where the SDK has it (src/ui/user-menu.js):
  // made once, since it loads the account each time it joins the page.
  const accountMenu = userMenu({ onSignOut: signOut, onSignIn: onSignedIn, onSignedOut });
  let closeSettings = null;
  const settingsBtn = el('button', {
    class: 'icon-btn', 'aria-label': '设置', title: '设置',
    onclick: () => {
      closeSettings?.();
      closeSettings = openHomeSettings(root, ctx, settingsBtn);
    },
  }, icon('settings'));

  const joinInput = el('input', {
    type: 'text',
    placeholder: '输入会议代码或链接',
    'aria-label': '会议代码或链接',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    onkeydown: (e) => {
      if (e.key === 'Enter') onJoin();
    },
    oninput: () => {
      joinBtn.disabled = !joinInput.value.trim();
    },
  });
  const joinBtn = el('button', { class: 'btn home-join-btn', disabled: true, onclick: onJoin }, '加入');
  const newMeetingLabel = el('span', {}, '新建会议');
  const newMeetingBtn = el(
    'button',
    { class: 'btn btn-primary', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: toggleNewMenu },
    icon('videoCall'),
    newMeetingLabel
  );

  const view = el(
    'div',
    { class: 'home' },
    el(
      'header',
      { class: 'home-header' },
      brandLockup(),
      el('div', { class: 'home-header-actions' }, clock, settingsBtn, themeBtn, userSlot)
    ),
    el(
      'main',
      { class: 'home-main' },
      el(
        'section',
        { class: 'home-hero' },
        el('h1', {}, '视频会议，', el('span', { class: 'home-hero-accent' }, '就在您的浏览器中。')),
        el('p', { class: 'home-lede' }, '几秒钟内发起通话，或创建链接稍后分享。一切均在您的浏览器中运行。'),
        el(
          'div',
          { class: 'home-actions' },
          el('div', { class: 'home-new' }, newMeetingBtn),
          el('div', { class: 'home-join' }, el('div', { class: 'text-field' }, icon('keyboard'), joinInput, joinBtn))
        ),
        el(
          'ul',
          { class: 'home-features' },
          feature('无需安装任何软件'),
          feature('链接永不过期'),
          feature('无需账号即可加入')
        ),
        hasPuter() && !ctx.calendar?.supported()
          ? el(
              'p',
              { class: 'home-art-hint' },
              icon('calendar'),
              '从您的 Puter 桌面打开“视频会议”，即可在此查看日历中当天的会议。'
            )
          : null
      ),
      // Inside the Puter desktop the day's meetings from the Calendar app
      // sit beside the hero, each one click from joining. On the open web
      // there is no Calendar to ask (see lib/calendar.js), so the hero stands
      // alone — with a line saying where the list lives.
      ctx.calendar?.supported() ? el('aside', { class: 'home-agenda' }) : null
    )
  );

  root.append(view);
  renderUser();

  let unmountAgenda = null;
  const agendaHost = view.querySelector('.home-agenda');
  mountAgendaPanel();

  /**
   * The meetings panel is scoped to the signed-in account — its snapshot is
   * keyed by it, and what it shows is theirs. So it is mounted afresh when
   * the account changes: the one that was there would otherwise keep
   * showing the last account's meetings, and write its next answer under
   * that account's key.
   */
  function mountAgendaPanel() {
    unmountAgenda?.();
    unmountAgenda = null;
    if (!agendaHost) return;
    unmountAgenda = mountAgenda(agendaHost, {
      calendar: ctx.calendar,
      ctx,
      // Scopes the panel's local snapshot to this account, so a shared
      // device never paints one person's meetings for the next.
      userKey: currentUser().then((user) => user?.uuid ?? user?.id ?? user?.username ?? ''),
      openCalendar: () => {
        try {
          void window.puter.ui.launchApp({ name: 'calendar' });
        } catch {
          toast('无法打开日历。', { icon: 'info' });
        }
      },
    });
  }

  const clockTimer = setInterval(() => {
    clock.textContent = clockText();
  }, 10_000);

  function clockText() {
    const now = new Date();
    return `${formatClock(now)} • ${formatDay(now)}`;
  }

  function onThemeToggle() {
    const next = toggleTheme();
    clear(themeBtn).append(icon(next === 'dark' ? 'sun' : 'moon'));
  }

  let newMenu = null;
  let menuDismissTimer = null;

  function toggleNewMenu() {
    if (newMenu) {
      closeNewMenu();
      return;
    }
    newMenu = el(
      'div',
      { class: 'menu home-new-menu', role: 'menu' },
      menuItem('videoCall', '发起即时会议', () => {
        closeNewMenu();
        newMeetingBtn.focus();
        void onStartInstant();
      }),
      menuItem('link', '创建稍后使用的会议', () => {
        closeNewMenu();
        // Removing the focused menu item drops focus to <body>; return it to
        // the trigger while creation runs (the dialog takes focus when ready).
        newMeetingBtn.focus();
        onCreateForLater();
      })
    );
    newMeetingBtn.parentElement.append(newMenu);
    newMeetingBtn.setAttribute('aria-expanded', 'true');
    newMenu.querySelector('.menu-item')?.focus();
    document.addEventListener('keydown', onMenuKeydown);
    // Dismiss on any click outside the menu. Registration is deferred past
    // the opening click; closeNewMenu cancels it if the menu closes first
    // (e.g. via Escape), so no stale listener survives to kill the next open.
    menuDismissTimer = setTimeout(() => document.addEventListener('click', onDocClick), 0);
  }

  function onDocClick(e) {
    if (newMenu && !newMenu.contains(e.target)) closeNewMenu();
  }

  function onMenuKeydown(e) {
    if (!newMenu) return;
    if (e.key === 'Escape') {
      closeNewMenu();
      newMeetingBtn.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...newMenu.querySelectorAll('.menu-item')];
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = (items.indexOf(document.activeElement) + step + items.length) % items.length;
      items[next]?.focus();
    } else if (e.key === 'Tab') {
      // Hand focus back to the trigger so the default Tab lands on the
      // control after (or before) it, not on document.body.
      closeNewMenu();
      newMeetingBtn.focus();
    }
  }

  function closeNewMenu() {
    clearTimeout(menuDismissTimer);
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onMenuKeydown);
    newMeetingBtn.setAttribute('aria-expanded', 'false');
    newMenu?.remove();
    newMenu = null;
  }

  function menuItem(name, label, onclick) {
    return el('button', { class: 'menu-item', role: 'menuitem', onclick }, icon(name), label);
  }

  let starting = false; // an instant meeting is on its way

  /**
   * Straight into a meeting when the app already knows who this is
   * (src/main.js startInstantMeeting); otherwise the pre-join screen, which
   * replaces this view at once. Starting can take a moment — a permission
   * prompt, the room's entry being written — so the button says so, and
   * takes no second click meanwhile.
   */
  async function onStartInstant() {
    if (starting) return;
    starting = true;
    newMeetingBtn.disabled = true;
    newMeetingLabel.textContent = '正在发起…';
    try {
      await ctx.startInstantMeeting();
    } finally {
      starting = false;
      newMeetingBtn.disabled = false;
      newMeetingLabel.textContent = '新建会议';
    }
  }

  let closeLinkDialog = null; // active meeting-link dialog's close(), if open

  /**
   * Mint a room code now. Nothing is created anywhere — a room exists from
   * the moment someone with the link starts a meeting on it (lib/rooms.js)
   * — so this needs no account and no network, and can never fail.
   */
  function onCreateForLater() {
    showMeetingLinkDialog(mintRoomCode());
  }

  function showMeetingLinkDialog(code) {
    const url = buildMeetingURL(code);
    const close = () => {
      window.removeEventListener('keydown', onDialogKeydown);
      closeLinkDialog = null;
      backdrop.remove();
      if (newMeetingBtn.isConnected) newMeetingBtn.focus();
    };
    const onDialogKeydown = (e) => {
      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'Tab') {
        // aria-modal promises focus stays inside — enforce it by wrapping
        // at the edges (and pulling focus in from the container itself).
        const focusables = [...dialog.querySelectorAll('button')];
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const current = document.activeElement;
        const inside = dialog.contains(current) && current !== dialog;
        if (e.shiftKey && (!inside || current === first)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (!inside || current === last)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const dialog = el(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': '会议链接', tabindex: '-1' },
      el(
        'div',
        { class: 'dialog-header' },
        el('h2', {}, '这是您的会议链接'),
        el('button', { class: 'icon-btn', 'aria-label': '关闭', onclick: close }, icon('close'))
      ),
      el(
        'div',
        { class: 'dialog-body' },
        el(
          'p',
          { class: 'home-link-note' },
          '将此链接发送给您想会面的人，或将其添加到日历邀请中。该链接永不过期。到时间后，打开链接即可发起会议 —— 您或任何持有该链接的人都可以发起。提早到达的访客将等待有人发起会议。'
        ),
        el('div', { class: 'info-link-box' }, url),
        el(
          'button',
          {
            class: 'btn btn-primary',
            style: { alignSelf: 'flex-start' },
            onclick: () => copyText(url, '已复制会议链接'),
          },
          icon('copy'),
          '复制会议链接'
        )
      )
    );
    // Only a click that both starts and ends on the backdrop dismisses.
    // A drag that starts inside the dialog (e.g. selecting the link text)
    // and ends outside still fires a click targeting the backdrop.
    let pressedBackdrop = false;
    const backdrop = el(
      'div',
      {
        class: 'dialog-backdrop',
        onpointerdown: (e) => {
          pressedBackdrop = e.target === backdrop;
        },
        onclick: (e) => {
          if (pressedBackdrop && e.target === backdrop) close();
        },
      },
      dialog
    );
    closeLinkDialog = close;
    window.addEventListener('keydown', onDialogKeydown);
    root.append(backdrop);
    dialog.focus();
  }

  function onJoin() {
    const code = extractCode(joinInput.value);
    if (!code) {
      toast('请输入会议代码或粘贴会议链接。', { icon: 'info' });
      return;
    }
    ctx.openPrejoin({ mode: 'join', code });
  }

  /** The signed-in Puter user, or null. */
  async function fetchUser() {
    if (!hasPuter()) return null;
    try {
      const puter = window.puter;
      if (!puter.auth?.isSignedIn?.()) return null;
      return (await puter.auth.getUser()) ?? null;
    } catch {
      return null;
    }
  }

  async function signOut() {
    try {
      await window.puter.auth.signOut();
    } catch {
      /* noop */
    }
    onSignedOut();
  }

  function onSignedOut() {
    forgetUser();
    // Whoever signs in next must not be shown this account's
    // meetings from the panel's snapshot — nor by the panel
    // itself, which is mounted afresh for the account now here.
    clearAgendaCaches();
    renderUser();
    mountAgendaPanel();
  }

  function onSignedIn() {
    forgetUser();
    renderUser();
    mountAgendaPanel();
  }

  async function renderUser() {
    if (accountMenu) {
      // The element shows the account by itself; the app still takes the
      // username as the fallback display name.
      if (!userSlot.contains(accountMenu)) clear(userSlot).append(accountMenu);
      const user = await currentUser();
      if (mounted && user && !ctx.getUserName?.()) ctx.setUserName?.(user.username ?? '您');
      return;
    }
    clear(userSlot);
    if (!hasPuter()) return;
    const puter = window.puter;
    try {
      if (puter.auth?.isSignedIn?.()) {
        const avatar = accountAvatar();
        userSlot.append(avatar);
        const user = await currentUser();
        if (!mounted || !userSlot.contains(avatar)) return;
        const name = user?.username ?? '您';
        userSlot.append(
          avatar,
          el(
            'button',
            {
              class: 'icon-btn',
              title: '退出登录',
              'aria-label': '退出登录',
              onclick: signOut,
            },
            icon('logout')
          )
        );
        void loadAccountAvatar(avatar, user, puter.auth);
        // The account username is only a fallback — never clobber a
        // display name the user chose earlier.
        if (!ctx.getUserName?.()) ctx.setUserName?.(name);
      } else {
        userSlot.append(
          el(
            'button',
            {
              class: 'btn btn-outline home-signin',
              onclick: async () => {
                try {
                  await puter.auth.signIn();
                  onSignedIn();
                } catch {
                  /* user dismissed */
                }
              },
            },
            '登录'
          )
        );
      }
    } catch {
      /* auth unavailable */
    }
  }

  return () => {
    mounted = false;
    clearInterval(clockTimer);
    closeNewMenu();
    closeLinkDialog?.();
    closeSettings?.();
    unmountAgenda?.();
  };
}

function feature(text) {
  return el('li', {}, icon('check'), text);
}
