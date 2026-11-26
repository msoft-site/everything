import './style.css';
import './shell/shell.css';
import './glass-icons.css';
import {
  el,
  icon,
  appIcon,
  button,
  iconButton,
  modal,
  waitForAppDialogsToClose,
  confirmAction,
  promptText,
  toast,
  download,
  applyTheme,
  themeValue,
  syncThemeColor,
  formatBytes,
} from './lib/ui.js';
import * as P from './lib/puter.js';
import { waitFor } from './lib/abort.js';
import { appsButton, closeAppsPanel, refreshAppsButtons, setAppsAccount } from './apps-panel.js';
import { configureUserMenu, hasUserMenu, refreshUserMenus, userMenuSlot } from './user-menu.js';
import {
  PdfSession,
  safeName,
  preparePdfForEditing,
  blankPdf,
  samplePdf,
  MAX_FILE_SIZE,
} from './core/document.js';

const root = document.querySelector('#app');
/** The library's URL. Opening the app lands in the editor instead. */
const LIBRARY_HASH = '#library';
const settingsAccountViews = new Set();
let user = null,
  sessionState = 'unknown', // until the SDK has been asked; then 'in' or 'out'
  accountGeneration = 0,
  accountToken,
  accountRefreshRequest = null,
  accountRefreshController = null,
  accountRefreshToken,
  accountRefreshHint,
  signInRequest = null,
  signInController = null,
  signOutPending = false,
  accountController = new AbortController(),
  editor = null,
  loading = false,
  openGeneration = 0,
  cloudOpenGeneration = 0,
  openController = null,
  homeGeneration = 0;
const run =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      // Closing the sign-in dialog is a choice, not a failure worth a red toast.
      if (P.isSignInCancelled(e)) return;
      // Puter's SDK rejects with plain objects too, at times with the reason nested inside.
      toast(e?.message || e?.error?.message || 'Something went wrong. Please try again.', {
        error: true,
      });
    }
  };
function sameAccount(first, second) {
  if (!first || !second) return false;
  if (first.uuid && second.uuid) return first.uuid === second.uuid;
  // The desktop's provisional label resolves to its existing account, not a new session.
  return (
    first.username === 'Local user' ||
    second.username === 'Local user' ||
    first.username === second.username
  );
}
function cancelledSignIn() {
  const error = new Error('The sign-in was cancelled.');
  error.code = 'sign-in-cancelled';
  return error;
}
const sessionChanged = () => accountToken !== undefined && accountToken !== P.sessionToken();
configureUserMenu({
  signOut: () => run(signOut)(),
  sessionChanged: () => run(refreshSDKAccount)(),
});
/** The account changed (a sign-in, or the SDK's first answer): the open view follows. */
function setAccount(account, { profileOnly = false } = {}) {
  accountGeneration++;
  const resetCloud = !account || (user && !sameAccount(user, account));
  if (resetCloud) {
    cloudOpenGeneration++;
    // The SDK's profile read can still be pending after its sign-in event. Signing out
    // retires that read and its cloud continuations, and frees a fresh authentication attempt.
    const cancelled = cancelledSignIn();
    accountController.abort(cancelled);
    accountController = new AbortController();
    signInController?.abort(cancelled);
    signInController = null;
    signInRequest = null;
    accountRefreshController?.abort(cancelled);
    accountRefreshController = null;
    accountRefreshRequest = null;
  }
  user = account;
  setAppsAccount(account);
  accountToken = P.sessionToken();
  sessionState = account ? 'in' : 'out';
  for (const refresh of settingsAccountViews) refresh();
  if (editor) editor.updateAccount({ resetCloud });
  else if (profileOnly && !resetCloud) {
    // Resolving the desktop's existing session must preserve library work in progress.
    const label = root.querySelector('.account-label');
    if (label) label.textContent = label.title = account?.username || 'Local workspace';
  } else if (!loading) showHome({ accountRefresh: true });
}
/** SDK auth profiles can arrive out of order. Verify its current session before adopting one. */
function refreshSDKAccount(hint) {
  const token = P.sessionToken();
  if (
    accountRefreshRequest &&
    (token !== undefined
      ? token === accountRefreshToken
      : hint && sameAccount(hint, accountRefreshHint))
  )
    return accountRefreshRequest;
  if (
    !accountRefreshRequest &&
    token &&
    token === accountToken &&
    sameAccount(user, hint) &&
    user.username === hint.username
  ) {
    return Promise.resolve(user);
  }
  accountRefreshController?.abort(cancelledSignIn());
  const controller = (accountRefreshController = new AbortController());
  accountRefreshToken = token;
  accountRefreshHint = hint;
  let version = ++accountGeneration;
  const request = waitFor(async () => {
    const signedIn = await P.isSignedIn();
    controller.signal.throwIfAborted();
    if (version !== accountGeneration || token !== P.sessionToken()) return null;
    if (signedIn && !user) {
      // A confirmed session can be signed out while its profile is still loading.
      // Callback metadata may be stale, so only the verified profile supplies its name.
      setAccount({ username: 'Local user' });
      version = accountGeneration;
    }
    return signedIn ? P.currentUser() : null;
  }, controller.signal)
    .then((account) => {
      controller.signal.throwIfAborted();
      if (version !== accountGeneration) return user;
      if (token !== P.sessionToken()) return refreshSDKAccount();
      if (account || user || sessionState !== 'out')
        setAccount(account, { profileOnly: sameAccount(user, account) });
      return user;
    })
    .finally(() => {
      if (accountRefreshRequest === request) accountRefreshRequest = null;
      if (accountRefreshController === controller) accountRefreshController = null;
    });
  accountRefreshRequest = request;
  // The SDK does not await its callback. Retired verification must not become unhandled.
  request.catch(() => {});
  return request;
}
/** Cloud continuations wait for a changed SDK session, then check their original account. */
async function settleAccount(signal) {
  if (sessionChanged()) refreshSDKAccount();
  while (accountRefreshRequest) {
    const request = accountRefreshRequest;
    try {
      await waitFor(() => request, signal);
    } catch (error) {
      if (
        !signal?.aborted &&
        P.isSignInCancelled(error) &&
        accountRefreshRequest &&
        accountRefreshRequest !== request
      )
        continue;
      throw error;
    }
  }
  signal?.throwIfAborted();
}
/** Cloud actions need a session: resolve the account, asking Puter to sign in when nobody is. */
async function ensureSignedIn({ signal = accountController.signal } = {}) {
  await settleAccount(signal);
  if (user) return user;
  // Repeated activations and other cloud actions share the same authentication window.
  // Release the request after success, cancellation, or failure so a later attempt can retry.
  if (!signInRequest) {
    const controller = (signInController = new AbortController());
    const request = waitFor(() => P.signIn(), controller.signal)
      .then(async (account) => {
        await settleAccount(controller.signal);
        controller.signal.throwIfAborted();
        if (!user) setAccount(account || { username: 'Local user' });
        return user;
      })
      .finally(() => {
        if (signInRequest === request) signInRequest = null;
        if (signInController === controller) signInController = null;
      });
    signInRequest = request;
  }
  return signInRequest;
}
/**
 * Signs out, one request at a time, once the open PDF may be left. From Settings (`dialog`) the
 * library follows only while that dialog is still up; from local storage.js's user menu it always does.
 */
async function signOut(dialog = null) {
  // Settings can be reopened while the SDK is pending. Claim this operation
  // before its first await so repeated presses cannot start another sign-out.
  if (signOutPending) return;
  signOutPending = true;
  try {
    if (!(await canLeave())) return;
    // Nothing can be edited behind Settings. The user menu has no dialog to hold the PDF still
    // while the SDK signs out, so the library comes first there.
    if (!dialog && editor) showHome();
    await P.signOut();
    const leaving = !!dialog?.open;
    if (leaving) dialog.close();
    // Closing Settings returns to work. Complete the account change without
    // discarding later edits, replacing a newer PDF, or aborting its file read.
    setAccount(null);
    if (leaving && editor) showHome();
  } finally {
    signOutPending = false;
  }
}
function settings() {
  // Settings holds the account, as the account menu does elsewhere: the Apps panel gives way.
  closeAppsPanel();
  const accountSummary = el('p', { class: 'muted' });
  const accountActions = el('div', { class: 'stack' });
  const themeLabels = { system: '跟随系统', light: '浅色', dark: '深色' };
  const select = el(
    'select',
    { id: 'theme-select', class: 'input', onchange: (e) => applyTheme(e.target.value) },
    ...['system', 'light', 'dark'].map((t) =>
      el(
        'option',
        { value: t, selected: themeValue() === t },
        themeLabels[t] || t,
      ),
    ),
  );
  const body = el(
    'div',
    { class: 'stack' },
    el('label', { for: 'theme-select' }, '外观'),
    select,
    accountSummary,
    button('键盘快捷键', 'Keyboard', () => {
      dialog.close();
      shortcuts();
    }),
    button('关于 PDF 编辑器', 'Info', () => {
      dialog.close();
      about();
    }),
    accountActions,
  );
  let accountAction;
  const refreshAccount = () => {
    if (!dialog.open) return;
    // puter.js's user menu, beside Settings in the title bar, holds the account where it renders.
    accountSummary.hidden = hasUserMenu();
    if (hasUserMenu()) {
      accountAction = null;
      accountActions.replaceChildren();
      accountActions.hidden = true;
      return;
    }
    const focused = accountActions.contains(document.activeElement);
    accountSummary.textContent = user
      ? `已登录为 ${user.username}`
      : '本地工作模式。PDF 保存在您的设备上。';
    const nextAction = !user ? 'sign-in' : P.isApp() ? null : 'sign-out';
    if (nextAction === accountAction) return;
    accountAction = nextAction;
    accountActions.replaceChildren();
    accountActions.hidden = !!user && P.isApp();
    if (user && !P.isApp())
      accountActions.append(
        button(
          '退出登录',
          'LogOut',
          run(async (event) => {
            // Safari does not focus clicked buttons; the confirmation needs a return target.
            if (!signOutPending) event.currentTarget.focus({ preventScroll: true });
            await signOut(dialog);
          }),
        ),
      );
    if (!user)
      accountActions.append(
        button(
          '登录',
          'Cloud',
          run(async () => {
            await ensureSignedIn();
            dialog.close();
          }),
          'btn primary',
        ),
      );
    if (focused) (accountActions.querySelector('button') || select).focus();
  };
  const dialog = modal('设置', body);
  dialog.classList.add('app-dialog');
  refreshAccount();
  settingsAccountViews.add(refreshAccount);
  dialog.addEventListener('close', () => settingsAccountViews.delete(refreshAccount), {
    once: true,
  });
}
function shortcuts() {
  const dialog = modal(
    '键盘快捷键',
    el(
      'div',
      { class: 'shortcut-list' },
      ...[
        ['打开 PDF', 'Ctrl / ⌘ O'],
        ['保存', 'Ctrl / ⌘ S'],
        ['下载', 'Ctrl / ⌘ Shift S'],
        ['撤销', 'Ctrl / ⌘ Z'],
        ['重做', 'Ctrl / ⌘ Shift Z 或 Ctrl Y'],
        ['在 PDF 中查找', 'Ctrl / ⌘ F'],
        ['查找下一个 / 上一个', 'Ctrl / ⌘ G，配合 Shift；F3'],
        ['打印', 'Ctrl / ⌘ P'],
        ['放大 / 缩小', 'Ctrl / ⌘ + / −'],
        ['适应页面', 'Ctrl / ⌘ 0'],
        ['实际大小', 'Ctrl / ⌘ 1'],
        ['适应宽度', 'Ctrl / ⌘ 2'],
        ['上一页 / 下一页', 'Alt ← / →'],
        ['第一页 / 最后一页', 'Home / End'],
        ['前往页面', 'Ctrl / ⌘ Alt G'],
        ['顺时针旋转页面', 'Ctrl / ⌘ Shift R'],
        ['删除页面', 'Ctrl / ⌘ Shift D'],
        ['文档属性', 'Ctrl / ⌘ D'],
        ['全屏', 'Ctrl / ⌘ L'],
        ['显示或隐藏侧边栏', 'F4'],
        ['显示或隐藏工具面板', 'Shift F4'],
        ['选择工具 / 抓手工具', 'V / H'],
        ['按住空格拖动页面', '空格键'],
      ].map(([label, key]) => el('div', {}, el('span', {}, label), el('kbd', {}, key))),
    ),
  );
  dialog.classList.add('app-dialog');
  // The list is taller than most windows and holds nothing to focus, which left the keyboard
  // on the Close button with no way to scroll it. The list itself takes the focus instead, so
  // the arrow keys, Page Down, and End move through it.
  const body = dialog.querySelector('.dialog-body');
  body.tabIndex = 0;
  body.setAttribute('role', 'region');
  body.setAttribute('aria-labelledby', dialog.getAttribute('aria-labelledby'));
  body.focus();
}
function about() {
  modal(
    '关于 PDF 编辑器',
    el(
      'div',
      { class: 'stack' },
      appIcon(64),
      el(
        'p',
        {},
        '用于阅读、批注、填写表单和组织 PDF 的专属工作区。',
      ),
      el(
        'p',
        {},
        'PDF.js 渲染页面，pdf-lib 写入更改。所有处理均在您的本地设备上进行；文件保存在本地存储中。',
      ),
      el(
        'p',
        { class: 'muted' },
        '使用“文本”工具点击并编辑支持的现有文本，或在空白区域添加文本。兼容的段落会在其栏宽内重排。标注和图片将成为页面的一部分。删除文本不等同于涂黑密文：请使用“涂黑密文”永久删除敏感内容。“扫描与 OCR”在本地设备上识别文本。密码保护的 PDF 打开时需要密码，保存时会再次加密；暂不支持证书加密的文件。编辑已签名的 PDF 会使其签名失效；建议最后进行签名。',
      ),
      el(
        'a',
        { href: './THIRD_PARTY_NOTICES.txt', target: '_blank', rel: 'noopener' },
        '开源许可证',
      ),
    ),
  ).classList.add('app-dialog');
}
async function canLeave(signal) {
  if (signal?.aborted) return false;
  if (!editor?.dirty) return true;
  // Sign-in and saving can outlive this PDF or a newer open that is still reading its bytes.
  const leavingEditor = editor;
  const generation = openGeneration;
  const isCurrent = () =>
    !signal?.aborted && editor === leavingEditor && generation === openGeneration;
  if (user) {
    // Saving is offered right here, as a desktop editor does, rather than sending the reader
    // back to find the Save button and then leave again.
    const choice = await new Promise((resolve) => {
      const dialog = modal(
        '离开此 PDF？',
        el(
          'p',
          {},
          `“${leavingEditor.name}”有未保存的更改。请在离开前保存到本地存储，或离开并放弃更改。`,
        ),
        [
          button('取消', null, () => dialog.close()),
          button(
            '不保存并离开',
            null,
            () => {
              resolve('leave');
              dialog.close();
            },
            'btn danger',
          ),
          button(
            '保存并离开',
            null,
            () => {
              resolve('save');
              dialog.close();
            },
            'btn primary',
          ),
        ],
        { signal },
      );
      dialog.classList.add('leave-save-dialog');
      dialog.addEventListener('close', () => resolve('stay'), { once: true });
    });
    if (!isCurrent()) return false;
    if (choice !== 'save') return choice === 'leave';
    try {
      await leavingEditor.save();
    } catch (error) {
      if (isCurrent()) toast(error.message || '无法保存 PDF。', { error: true });
      return false;
    }
    // A save that was cancelled or overtaken by new edits leaves the PDF open.
    return isCurrent() && !leavingEditor.dirty;
  }
  // Without an account the PDF has nowhere to go yet: offer the sign-in that saving needs.
  const choice = await new Promise((resolve) => {
    const dialog = modal(
      '在离开前保存？',
      el(
        'p',
        {},
        '此 PDF 尚未保存。请将其保存到本地设备，或离开并放弃更改。如需下载副本，请继续编辑并选择“下载”。',
      ),
      [
        button('继续编辑', null, () => dialog.close()),
        button(
          '不保存并离开',
          null,
          () => {
            resolve('leave');
            dialog.close();
          },
          'btn danger',
        ),
        button(
          '保存并离开',
          null,
          () => {
            resolve('save');
            dialog.close();
          },
          'btn primary',
        ),
      ],
      { signal },
    );
    dialog.classList.add('leave-save-dialog');
    dialog.addEventListener('close', () => resolve('stay'), { once: true });
  });
  if (!isCurrent()) return false;
  if (choice !== 'sign-in') return choice === 'leave';
  try {
    await ensureSignedIn();
  } catch {
    return false; // The sign-in was dismissed; the PDF stays open.
  }
  if (!isCurrent()) return false;
  await leavingEditor.save();
  return isCurrent() && !leavingEditor.dirty;
}
const PICTURE_TYPES = 'image/png,image/jpeg';
const isPdfFile = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
const isPictureFile = (file) =>
  PICTURE_TYPES.split(',').includes(file.type) || /\.(png|jpe?g)$/i.test(file.name);
function pickFiles(accept) {
  const input = el('input', { type: 'file', accept, multiple: true });
  input.onchange = run(async () => {
    if (input.files.length) await openFiles([...input.files]);
  });
  input.click();
}
const pickDevice = () => pickFiles(`.pdf,application/pdf,${PICTURE_TYPES}`);
const pickPictures = () => pickFiles(PICTURE_TYPES);
/**
 * Only one PDF is open at a time. When several files arrive together and one of them is a PDF,
 * it opens and the reader learns what became of the others, and where they can be combined.
 */
function oneOfSeveral(opened, name, count) {
  if (opened && count > 1)
    toast(
      `已打开“${name}”。一次只能打开一个 PDF；如需合并多个文件，请使用“工具”中的“合并文件”。`,
    );
}
/** A PDF opens as it is; pictures become the pages of a new PDF, one each, in the given order. */
async function openFiles(files) {
  const pdf = files.find(isPdfFile);
  if (pdf) return oneOfSeveral(await openDevice(pdf), pdf.name, files.length);
  const pictures = files.filter(isPictureFile);
  if (!pictures.length) throw new Error('请选择 PDF 文件，或 PNG、JPEG 图片。');
  const name = pictures[0].name.replace(/\.[^.]+$/, '') || '图片集';
  // The new PDF exists nowhere else yet, as a combined one does, so it starts out unsaved.
  await openDocument(
    async (signal) => {
      const [{ imagesToPdf, defaultPaper }, { normalizeImageFiles }] = await Promise.all([
        import('./core/image-pages.js'),
        import('./image-codec.js'),
      ]);
      signal.throwIfAborted();
      const images = await normalizeImageFiles(pictures, { lazy: true, signal });
      // An obsolete batch must not decode and embed pictures after its file reads finish.
      signal.throwIfAborted();
      return imagesToPdf(images, { paper: defaultPaper(), signal });
    },
    `${name}.pdf`,
    null,
    { unsaved: true },
  );
}
/** A new PDF is a sheet of the paper the region prints on, as pictures turned into pages are. */
async function newBlankPdf() {
  const { PAPER_SIZES, defaultPaper } = await import('./core/image-pages.js');
  return blankPdf(PAPER_SIZES[defaultPaper()]);
}
async function openDevice(file) {
  if (file.size > MAX_FILE_SIZE) throw new Error('请选择小于 100 MB 的 PDF 文件。');
  return openDocument(async () => new Uint8Array(await file.arrayBuffer()), file.name);
}
async function openCloudItem(item) {
  if (Array.isArray(item)) item = item[0];
  if (item?.path) {
    if (item.size > MAX_FILE_SIZE) throw new Error('请选择小于 100 MB 的 PDF 文件。');
    const source = { remote: null };
    return openDocument(
      (signal) =>
        waitFor(async () => {
          await settleAccount(signal);
          // Described before it is read: a description taken after a slow read could belong
          // to somebody else's newer file, which saving would then overwrite unasked.
          source.remote = P.canStat() ? await P.statFile(item.path).catch(() => null) : null;
          const bytes = await P.readFile(item.path, { maxBytes: MAX_FILE_SIZE, signal });
          await settleAccount(signal);
          return bytes;
        }, signal),
      item.name || item.path.split('/').pop(),
      item.path,
      { signal: accountController.signal, source },
    );
  }
}
const isPdfName = (name) => /\.pdf$/i.test(name || '');
const isPictureName = (name) => /\.(png|jpe?g)$/i.test(name || '');
/**
 * Files the desktop hands over: opened with the app, or dragged onto its window. A PDF opens
 * as it is, and pictures become the pages of a new PDF, as they do when chosen on this device.
 */
async function openDesktopItems(items) {
  const files = (items || []).filter((item) => item?.path && !P.isDirItem(item));
  if (!files.length) {
    if (items?.length) throw new Error('无法打开文件夹。请从文件夹中打开具体的 PDF 文件。');
    return;
  }
  const name = (item) => item.name || item.path.split('/').pop();
  const pdf = files.find((item) => isPdfName(name(item)));
  if (pdf) return oneOfSeveral(await openCloudItem(pdf), name(pdf), files.length);
  const pictures = files.filter((item) => isPictureName(name(item)));
  if (!pictures.length)
    throw new Error(`“${name(files[0])}”不是 PDF 文件。请选择 PDF，或 PNG、JPEG 图片。`);
  const signal = accountController.signal;
  const blobs = await waitFor(
    () =>
      Promise.all(
        pictures.map((item) => P.readBlob(item.path, { maxBytes: MAX_FILE_SIZE, signal })),
      ),
    signal,
  );
  await openFiles(
    blobs.map((blob, i) => {
      const fileName = name(pictures[i]);
      const type = /\.png$/i.test(fileName) ? 'image/png' : 'image/jpeg';
      return new File([blob], fileName, { type });
    }),
  );
}
const pickCloud = run(async () => {
  // Authentication and the cloud picker can return after another file choice or navigation.
  // Claim the request before either one, and ignore obsolete answers and failures.
  const token = ++cloudOpenGeneration;
  let item;
  try {
    await ensureSignedIn();
    if (token !== cloudOpenGeneration) return;
    item = await P.pickFile();
  } catch (error) {
    if (token !== cloudOpenGeneration) return;
    throw error;
  }
  if (token === cloudOpenGeneration && item) await openCloudItem(item);
});
async function openDocument(
  readBytes,
  name,
  path = null,
  { signal: sourceSignal, source = null, unsaved = false } = {},
) {
  if (sourceSignal?.aborted) return;
  cloudOpenGeneration++;
  // The newest request wins: a file launched from the desktop replaces the landing document
  // even while that one is still opening. Reserve its turn before reading or converting the
  // source, so an older slow read (or its failure) cannot replace the latest choice.
  loading = true;
  const token = ++openGeneration;
  openController?.abort();
  const controller = (openController = new AbortController());
  // Cloud files belong to the account that requested them. Retire their entire open,
  // including parsing and password prompts, when that session ends. Local opens stay independent.
  const abortSource = () => {
    controller.abort(sourceSignal.reason);
    if (token === openGeneration) {
      openGeneration++;
      loading = false;
    }
  };
  sourceSignal?.addEventListener('abort', abortSource, { once: true });
  let nextEditor;
  try {
    let bytes = await readBytes(controller.signal);
    if (token !== openGeneration) return;
    let protection = null,
      encryptedOriginal = null;
    try {
      bytes = await preparePdfForEditing(bytes);
    } catch (error) {
      if (token !== openGeneration) return;
      if (error.code !== 'encrypted') throw error;
      // A protected file opens once its password is known; the working copy is then plain.
      const { promptUnlock } = await import('./unlock-dialog.js');
      if (token !== openGeneration) return;
      const unlocked = await promptUnlock(bytes, safeName(name), {
        signal: controller.signal,
        beforeOpen: () => waitForAppDialogsToClose({ signal: controller.signal }),
      });
      if (token !== openGeneration) return;
      if (!unlocked) {
        // A library already on screen keeps its search, sort, and the file chosen in it.
        if (!editor && !root.querySelector('.home')) showHome();
        return;
      }
      // Certificate signatures cover the encrypted file, so it is kept to validate them.
      encryptedOriginal = bytes;
      bytes = unlocked.bytes;
      protection = unlocked.protection;
      bytes = await preparePdfForEditing(bytes);
    }
    if (
      token !== openGeneration ||
      !(await waitForAppDialogsToClose({ signal: controller.signal }))
    )
      return;
    if (token !== openGeneration || !(await canLeave(controller.signal))) return;
    const { createEditor } = await import('./editor.js');
    if (token !== openGeneration) return;
    const hadFocus = viewHasFocus();
    editor?.destroy();
    homeGeneration++;
    const session = new PdfSession(bytes);
    // A PDF made here (combined files or pictures) exists nowhere else until it is saved or
    // downloaded.
    if (unsaved) session.markSaved(-1);
    nextEditor = createEditor({
      root,
      session,
      name: safeName(name),
      path,
      remote: (path && source?.remote) || null,
      blank: readBytes === newBlankPdf,
      protection,
      encryptedOriginal,
      settings,
      shortcuts,
      getUser: () => (accountRefreshRequest || sessionChanged() ? null : user),
      signedOut: () => sessionState === 'out',
      signIn: (signal) => ensureSignedIn({ signal }),
      goHome: run(async () => {
        if (await canLeave()) showHome();
      }),
      onOpen: pickDevice,
      onOpenCloud: pickCloud,
      onNew: run(() => openDocument(newBlankPdf, '未命名.pdf')),
      onOpenBytes: run((bytes, name) =>
        openDocument(async () => bytes, name, null, { unsaved: true }),
      ),
    });
    editor = nextEditor;
    if (hadFocus) refocusView('.workspace');
    if (location.hash === LIBRARY_HASH)
      history.replaceState(null, '', location.pathname + location.search);
    await nextEditor.ready;
    // Whether this PDF is the one now open (a newer choice may have replaced it meanwhile).
    return token === openGeneration && editor === nextEditor;
  } catch (error) {
    if (token !== openGeneration) return;
    if (nextEditor && editor === nextEditor) showHome();
    throw error;
  } finally {
    sourceSignal?.removeEventListener('abort', abortSource);
    if (token === openGeneration) loading = false;
    if (openController === controller) openController = null;
    controller.abort();
  }
}
/** Whether the focus is on a control in the current view, which replacing the view removes. */
const viewHasFocus = () =>
  document.activeElement !== document.body && root.contains(document.activeElement);
/**
 * A view that replaced the one holding the focus takes it, so the keyboard carries on in the
 * new view instead of starting again from the top of the document. A focus that has already
 * moved elsewhere is left alone, and so is a view that opens with the app.
 */
function refocusView(selector) {
  if (document.activeElement === document.body || !document.activeElement?.isConnected)
    root.querySelector(selector)?.focus({ preventScroll: true });
}
/** The app's name, and the library view's own heading. */
function brand() {
  return el('h1', { class: 'brand' }, appIcon(), el('span', {}, 'PDF 编辑器'));
}
function showHome({ accountRefresh = false } = {}) {
  // Updating the library after signing in belongs to the pending cloud-open workflow.
  // Actual navigation to the library retires that workflow instead.
  if (!accountRefresh) cloudOpenGeneration++;
  openGeneration++;
  openController?.abort();
  openController = null;
  loading = false;
  const hadFocus = viewHasFocus();
  editor?.destroy();
  editor = null;
  document.title = 'PDF 编辑器';
  P.setWindowTitle('PDF 编辑器');
  if (location.hash !== LIBRARY_HASH) history.replaceState(null, '', LIBRARY_HASH);
  const generation = ++homeGeneration;
  const list = el('div', { class: 'file-list' });
  let files = [],
    loadGeneration = 0,
    filter = '',
    libraryState = 'ready',
    sort = 'modified';
  const search = el('input', {
    type: 'search',
    class: 'input search-input',
    placeholder: '搜索 PDF',
    'aria-label': '搜索 PDF',
    oninput: (e) => {
      // Spaces around the words (a pasted name, a stray space) do not hide every file.
      filter = e.target.value.trim().toLowerCase();
      renderFiles();
    },
  });
  const sortSelect = el(
    'select',
    {
      class: 'sort-select',
      'aria-label': '排序方式',
      onchange: (e) => {
        sort = e.target.value;
        renderFiles();
      },
    },
    el('option', { value: 'modified' }, '最后修改时间'),
    el('option', { value: 'name' }, '名称'),
    el('option', { value: 'size' }, '大小'),
  );
  const renderFiles = () => {
    // Replacing the rows drops a focused one; the search field then takes the focus.
    const hadFocus = list.contains(document.activeElement);
    drawFiles();
    if (hadFocus && document.activeElement === document.body) search.focus({ preventScroll: true });
  };
  const drawFiles = () => {
    list.replaceChildren();
    if (libraryState === 'loading') {
      list.append(el('div', { class: 'empty-library' }, '正在加载 PDF…'));
      return;
    }
    if (libraryState === 'error') {
      list.append(
        el(
          'div',
          { class: 'empty-library' },
          el('p', {}, '无法加载您的文档库。'),
          button('重试', 'RefreshCw', load),
        ),
      );
      return;
    }
    const shown = files
      .filter((f) => f.name.toLowerCase().includes(filter))
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
          : (b[sort] || 0) - (a[sort] || 0),
      );
    if (!shown.length) {
      list.append(
        el(
          'div',
          { class: 'empty-library' },
          icon(filter ? 'Search' : 'FolderOpen', 30),
          el(
            'h3',
            {},
            filter
              ? '未找到匹配的 PDF'
              : user
                ? '您的文档库从这里开始'
                : '本地 PDF 文档',
          ),
          el(
            'p',
            {},
            filter
              ? '尝试使用其他文件名。'
              : user
                ? '打开 PDF 并保存后即可在此处找到。'
                : '在本地设备上保存和访问您的文件。',
          ),
          !user && !filter && button('本地存储', 'FolderOpen', run(ensureSignedIn)),
        ),
      );
      return;
    }
    list.append(
      el(
        'div',
        { class: 'file-table-head', 'aria-hidden': 'true' },
        el('span', {}, '名称'),
        el('span', {}, '修改时间'),
        el('span', {}, '大小'),
        el('span'),
      ),
    );
    shown.forEach((file) => {
      const timestamp = file.modified;
      const date = timestamp
        ? new Date(timestamp).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : '未知';
      list.append(
        el(
          'div',
          { class: 'file-row' },
          button(
            file.name,
            'FileText',
            run(() => openCloudItem(file)),
            'file-open',
          ),
          el('span', { class: 'file-date muted' }, date),
          el('span', { class: 'file-size muted' }, formatBytes(file.size || 0)),
          iconButton(`“${file.name}”的选项`, 'MoreHorizontal', (e) => {
            // Safari does not focus clicked buttons; give the dialog a real return target.
            e.currentTarget.focus({ preventScroll: true });
            fileOptions(file);
          }),
        ),
      );
    });
  };
  function refreshAfterAction() {
    load();
    // Replacing the rows can remove the focused action button. Recover focus in that
    // case, but keep a newer focus choice made while the cloud action was pending.
    if (document.activeElement === document.body) search.focus({ preventScroll: true });
  }
  function fileOptions(file) {
    // This file and every confirmation derived from it belong to this account session.
    const signal = accountController.signal;
    // Download and Duplicate read (and write) in the cloud before the dialog closes; while
    // one runs, every action is disabled so a second click cannot start another copy.
    let working = false;
    const action = (fn) =>
      run(async () => {
        if (working || signal.aborted) return;
        working = true;
        const buttons = [...d.querySelectorAll('.dialog-body button')];
        buttons.forEach((b) => (b.disabled = true));
        try {
          await settleAccount(signal);
          await fn();
        } catch (error) {
          // A previous account's cloud failure must not appear in a newer workflow.
          if (!signal.aborted) throw error;
        } finally {
          working = false;
          buttons.forEach((b) => (b.disabled = false));
        }
      });
    const d = modal(
      file.name,
      el(
        'div',
        { class: 'stack' },
        button(
          '打开 PDF',
          'FolderOpen',
          action(async () => {
            d.close();
            await openCloudItem(file);
          }),
        ),
        button(
          '下载',
          'Download',
          action(async () => {
            const bytes = await P.readFile(file.path, { signal });
            await settleAccount(signal);
            download(bytes, file.name);
            d.close();
          }),
        ),
        button(
          '重命名',
          'Pencil',
          action(async () => {
            d.close();
            const name = await promptText(
              '重命名 PDF',
              '文件名',
              file.name.replace(/\.pdf$/i, ''),
              { signal },
            );
            await settleAccount(signal);
            // An unchanged name is no rename: Puter would refuse it as a name already taken.
            if (name && safeName(name) !== file.name && !signal.aborted) {
              await P.renameFile(file.path, name);
              if (!signal.aborted) refreshAfterAction();
            }
          }),
        ),
        button(
          '创建副本',
          'Copy',
          action(async () => {
            // A cloud read can finish after sign-out and another account's sign-in.
            // Only the session that requested the copy may initiate its write.
            let bytes;
            try {
              bytes = await P.readFile(file.path, { signal });
              await settleAccount(signal);
              signal.throwIfAborted();
            } catch (error) {
              if (signal.aborted) return;
              throw error;
            }
            await P.saveFile(file.name.replace(/\.pdf$/i, ' 副本'), bytes);
            d.close();
            if (!signal.aborted) refreshAfterAction();
          }),
        ),
        button(
          '删除',
          'Trash2',
          action(async () => {
            d.close();
            if (
              await confirmAction(
                '删除 PDF？',
                `从本地存储中删除“${file.name}”？此操作无法撤销。`,
                '删除 PDF',
                { signal },
              )
            ) {
              await settleAccount(signal);
              if (signal.aborted) return;
              await P.deleteFile(file.path);
              if (!signal.aborted) refreshAfterAction();
            }
          }),
          'btn danger',
        ),
      ),
      [],
      { signal },
    );
  }
  async function load() {
    const token = ++loadGeneration;
    const signal = accountController.signal;
    // A refresh after renaming, duplicating, or deleting keeps the rows on screen until the new
    // listing arrives, so a long library is not cut to one line and the reader keeps their place.
    if (!user || libraryState !== 'ready' || !files.length) {
      libraryState = user ? 'loading' : 'ready';
      renderFiles();
    }
    if (!user) return;
    try {
      await settleAccount(signal);
      const next = await P.listFiles();
      await settleAccount(signal);
      if (generation !== homeGeneration || token !== loadGeneration) return;
      // Compare the same timestamps we display. Cloud metadata can use seconds or
      // milliseconds; sorting the raw values would put older millisecond dates first.
      files = next.map((file) => {
        const modified = Number(file.modified);
        return { ...file, modified: modified < 1e12 ? modified * 1000 : modified };
      });
      libraryState = 'ready';
      renderFiles();
    } catch {
      if (generation === homeGeneration && token === loadGeneration) {
        libraryState = 'error';
        renderFiles();
      }
    }
  }
  root.replaceChildren(
    el(
      'div',
      { class: 'home' },
      el(
        'header',
        { class: 'topbar' },
        brand(),
        el(
          'div',
          { class: 'header-right' },
          el(
            'span',
            { class: 'account-label', title: user?.username || '本地工作区' },
            user?.username || '本地工作区',
          ),
          appsButton(),
          iconButton('设置', 'Settings2', settings),
          userMenuSlot(),
        ),
      ),
      el(
        'main',
        { id: 'main', class: 'home-main', tabindex: '-1' },
        el(
          'div',
          { class: 'start-grid' },
          el(
            'button',
            { class: 'open-card', onclick: pickDevice, type: 'button' },
            el('span', { class: 'open-card-icon' }, icon('Upload', 27)),
            el('strong', {}, '打开 PDF'),
            el('span', {}, '选择 PDF 或图片，或将其拖放到任意位置'),
            el('span', { class: 'card-cta' }, '浏览文件', icon('ArrowUpRight', 16)),
          ),
          el(
            'div',
            { class: 'quick-actions' },
            button(
              '新建空白 PDF',
              'FilePlus2',
              run(() => openDocument(newBlankPdf, '未命名.pdf')),
              'quick-action',
            ),
            button('图片转 PDF', 'Images', pickPictures, 'quick-action'),
            button('从本地打开', 'FolderOpen', pickCloud, 'quick-action'),
            button(
              '试用示例 PDF',
              'BookOpen',
              run(() => openDocument(samplePdf, '新手入门.pdf')),
              'quick-action',
            ),
          ),
        ),
        el(
          'section',
          { class: 'library', 'aria-labelledby': 'library-title' },
          el(
            'div',
            { class: 'library-head' },
            el('h2', { id: 'library-title' }, '您的 PDF'),
            el(
              'div',
              { class: 'library-tools' },
              sortSelect,
              el('div', { class: 'search-wrap' }, icon('Search', 16), search),
            ),
          ),
          list,
        ),
        el(
          'div',
          { class: 'local-note' },
          icon('FolderCheck', 16),
          el(
            'span',
            {},
            'PDF 将在您的设备上本地处理并保存。',
          ),
        ),
      ),
      el(
        'footer',
        { class: 'home-footer' },
        el('span', {}, 'PDF 编辑器'),
        button('键盘快捷键', 'Keyboard', shortcuts, 'text-btn'),
      ),
    ),
  );
  if (hadFocus) refocusView('#main');
  load();
}
window.addEventListener('beforeunload', (e) => {
  if (editor?.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  // Also by the key's place, for layouts whose letters are not Latin (Ctrl+O arrives as "щ").
  const o =
    e.key.toLowerCase() === 'o' || (e.code === 'KeyO' && !e.altKey && !/[\x00-\x7f]/.test(e.key));
  if ((e.ctrlKey || e.metaKey) && o) {
    e.preventDefault();
    // When Puter opened the app (a desktop window, or a tab from the dashboard) the files are
    // in the cloud, so Open browses it, as other desktop apps do; the device picker stays in
    // the File menu.
    if (P.launchedByPuter()) pickCloud();
    else pickDevice();
  }
});
let dragDepth = 0;
/**
 * A modal dialog owns the screen and the keyboard, as the Open shortcut above already respects.
 * A file dropped while one is open used to replace the document behind it, leaving the dialog
 * over a document it no longer belonged to, where its own button quietly did nothing.
 */
const dialogOpen = () => !!document.querySelector('dialog[open]');
window.addEventListener('dragenter', (e) => {
  if (!dialogOpen() && [...(e.dataTransfer?.types || [])].includes('Files')) {
    e.preventDefault();
    dragDepth++;
    document.body.classList.add('dropping');
  }
});
window.addEventListener('dragover', (e) => {
  if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    document.body.classList.remove('dropping');
  }
});
window.addEventListener('drop', (e) => {
  const files = [...(e.dataTransfer?.files || [])];
  // Only file drops belong to the app. Text dragged into a field keeps its native insertion,
  // which cancelling the event here would silently discard.
  if (!files.length && !document.body.classList.contains('dropping')) return;
  // The drop is always cancelled, even when it is ignored: the browser would otherwise leave
  // the app and show the file itself.
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dropping');
  if (!files.length) return;
  // The message lands in the open dialog, which is where the reader is looking.
  if (dialogOpen()) return toast('请先关闭此对话框以打开拖放的文件。', { error: true });
  run(() => openFiles(files))();
});
window.addEventListener('hashchange', () => {
  if (location.hash !== LIBRARY_HASH || !editor) return;
  run(async () => {
    const generation = openGeneration;
    if (await canLeave()) showHome();
    else if (generation === openGeneration)
      history.replaceState(null, '', location.pathname + location.search);
  })();
});
// The skip link moves the focus, not the address: following #main left the library's own
// #library behind, so reloading opened a blank PDF instead, and Back first returned to #main.
document.querySelector('.skip-link')?.addEventListener('click', (e) => {
  const target = document.getElementById('main');
  if (!target) return;
  e.preventDefault();
  target.focus();
});
syncThemeColor();
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeColor);
// Nobody has to sign in to work: the app opens straight into a blank PDF (or the library at
// its own URL), and Puter is asked for a sign-in at the first action that needs the cloud.
async function start() {
  if (location.hash === LIBRARY_HASH) {
    showHome();
    return;
  }
  try {
    await openDocument(newBlankPdf, '未命名.pdf');
  } catch (e) {
    if (!editor && !loading) showHome();
    toast(e.message || '发生错误，请重试。', { error: true });
  }
}
start();
// The SDK script is async, so the workspace renders before it arrives and the account state
// is applied once it has loaded. Only a signed-in account changes what the home shows.
const initPuter = async () => {
  // The SDK signs the user in on its own before some cloud calls; the views follow.
  P.onAuth(run(refreshSDKAccount));
  // The desktop has its own app launcher; puter.js's user menu, where the SDK has it, holds
  // the launcher and the account.
  refreshAppsButtons();
  refreshUserMenus();
  for (const refresh of settingsAccountViews) refresh();
  // A tab Puter opened (a file opened from the dashboard, say) gets its file the same way as a
  // desktop window, once the dashboard tab hands it over with the token.
  if (P.launchedByPuter()) {
    const onItems = (items) => {
      items = Array.isArray(items) ? items : [items];
      if (items.length) run(() => openDesktopItems(items))();
    };
    // onItemsOpened also replays the launch file. Subscribing to both reads it twice.
    if (globalThis.puter.ui?.onItemsOpened) globalThis.puter.ui.onItemsOpened(onItems);
    else globalThis.puter.ui?.onLaunchedWithItems?.(onItems);
  }
  if (P.isApp()) {
    // The desktop already has a session. File and close events must not wait for its profile.
    setAccount({ username: '本地用户' });
    // A second press of the close button while its question is open must not stack another
    // on top; the first answer decides. Only the question counts: a save it started that
    // never settles must not leave the button dead.
    P.onWindowClose(
      run(async () => {
        if (document.querySelector('dialog.leave-save-dialog[open]')) return;
        if (await canLeave()) P.exitApp();
      }),
    );
    if (!editor) P.setWindowTitle('PDF 编辑器');
  }
  // A tab Puter opened gets its token from the dashboard tab moments after loading; read the
  // account once it is in rather than reporting the person signed out first.
  await P.puterLaunchSettled();
  // A sign-in or sign-out can finish while the SDK's initial session/profile read is
  // pending. Its older answer must not change the newer account or reset library work.
  const version = accountGeneration;
  // Observe credentials before either read waits: an explicit sign-in can finish first.
  const token = (accountToken = P.sessionToken());
  const signedIn = await P.isSignedIn();
  if (version !== accountGeneration) return;
  if (token !== P.sessionToken()) return refreshSDKAccount();
  if (signedIn) {
    const account = await P.currentUser();
    if (version !== accountGeneration) return;
    if (token !== P.sessionToken()) return refreshSDKAccount();
    setAccount(account || { username: '本地用户' }, { profileOnly: P.isApp() });
  } else {
    accountToken = token;
    sessionState = 'out';
    editor?.updateAccount();
  }
};
if (globalThis.puter) initPuter();
else window.addEventListener('load', initPuter, { once: true });
