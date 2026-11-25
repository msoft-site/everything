/**
 * Live co-editing in the editor: the Share command and dialog, who is here
 * (avatars in the title bar, carets and selections on the pages), the notice
 * bar for roles and the single-editor fallback. The co-editing engine (Yjs, the room client) loads only
 * when a document is shared or opened from an invitation.
 *
 * Commands on the editor's command object: share(), collaborators(),
 * shareItems() additions, coauthoringStatus().
 */
import { zipSync } from 'fflate';
import { clipText } from '../core/text.js';
import { el } from '../ui/dom.js';
import { openMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { engineApi } from '../lib/engine-api.js';
import { canEmail, sendMail } from '../lib/mail-send.js';
import { roleLabel, initials, colorFor } from '../collab/protocol.js';
import { rememberedRoom } from '../collab/room-memory.js';
import { openShareDialog, roleSentence } from './share-dialog.js';

/** This tab's name in local sharing (tabs of one browser): ?name= in the address, or a guest name kept for the tab. */
export function localGuest() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('documents:collab-guest') || 'null'); } catch { /* storage blocked */ }
  const asked = new URLSearchParams(location.search).get('name');
  if (!saved || (asked && saved.name !== asked)) {
    saved = { id: `guest-${Math.random().toString(36).slice(2, 10)}`, name: clipText(asked || `Guest ${Math.floor(10 + Math.random() * 90)}`, 40) };
    try { sessionStorage.setItem('documents:collab-guest', JSON.stringify(saved)); } catch { /* storage blocked */ }
  }
  return saved;
}

/**
 * Keep the document from being changed until the returned function is called: the editor reads only, whatever
 * Editing / Viewing mode is chosen meanwhile, and the mode chosen last applies afterwards.
 */
function holdEditing(engine) {
  const original = engine?.setViewOnly;
  if (typeof original !== 'function') return () => {};
  const own = Object.hasOwn(engine, 'setViewOnly');
  let wanted = !!engine.viewOnly, released = false;
  engine.setViewOnly = on => { wanted = !!on; original.call(engine, true); };
  original.call(engine, true);
  return () => {
    if (released) return;
    released = true;
    if (own) engine.setViewOnly = original; else delete engine.setViewOnly;
    if (!engine.destroyed) original.call(engine, wanted);
  };
}

const MODE_REASONS = { 'content controls without text': 'form fields that are still empty', 'line feeds inside a run': 'text this editor keeps as a single run' };

export function createCollaboration({ editor, pkg, doc, local, error, onChange = () => {}, documentName, user, saveFirst, exportDocx, exportPdf, signIn = async () => true, readOnly = () => false, baseAssets = () => Object.keys(pkg()?.assets || {}) }) {
  let live = null, starting = null, liveModule = null, dialog = null, destroyed = false;
  const loadLive = () => (liveModule ||= import('../collab/live.js'));
  // The room an owner shared this file in, looked up while the editor loads rather than after.
  const remembered = !local && doc.path && !doc.collab ? rememberedRoom(doc.path) : null;

  /* ---- Title bar: who is here ---- */
  const avatars = el('div.cl-presence', { hidden: true, role: 'group', 'aria-label': '当前文档中的协作人员' });
  const chip = el('span.cl-chip', { hidden: true });
  const banner = el('div.cl-banner', { role: 'status', hidden: true });

  function people() { return live ? live.people() : []; }
  // A narrow window has room for two avatars; "+N" counts everyone left out.
  const narrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 700px)') : null;
  const onNarrow = () => renderPeople();
  narrow?.addEventListener?.('change', onNarrow);
  function renderPeople() {
    const list = people();
    avatars.hidden = !live;
    if (!live) { avatars.replaceChildren(); return; }
    const shown = list.slice(0, narrow?.matches ? 2 : 4), extra = list.length - shown.length;
    avatars.replaceChildren(...shown.map(p => el('button.cl-avatar', { type: 'button', style: `--cl-color: ${p.color || colorFor(p.name)}`, title: `${p.name}${p.me ? ' (您)' : ''} · ${roleLabel(p.role || 'editor')}`,
      'aria-label': `${p.name}${p.me ? ' (您)' : ''}, ${roleLabel(p.role || 'editor')}`, onclick: e => peopleMenu(e.currentTarget, !!e.detail) }, initials(p.name))),
    ...(extra > 0 ? [el('button.cl-avatar.cl-more', { type: 'button', 'aria-label': `${extra} 位更多`, onclick: e => peopleMenu(e.currentTarget, !!e.detail) }, `+${extra}`)] : []), chip);
    renderChip();
  }
  function renderChip() {
    if (!live) { chip.hidden = true; return; }
    const offline = live.status === 'offline', pending = live.pending;
    const text = offline ? (pending ? `脱机 · ${pending} 项等待中` : '脱机') : live.role === 'viewer' ? '仅查看' : live.role === 'commenter' ? '仅批注' : '';
    chip.textContent = text; chip.hidden = !text;
    chip.classList.toggle('is-offline', offline);
  }
  function peopleMenu(anchor, pointer) {
    const list = people();
    openMenu({ anchor, label: '当前文档中的协作人员', minWidth: 240, align: 'end', pointer, items: [
      { header: `${list.length} 人在此` },
      ...list.map(p => ({ label: `${p.name}${p.me ? ' (您)' : ''}`, hint: roleLabel(p.role || 'editor'), disabled: p.me, onSelect: () => { if (!live.follow(p.session)) toast(`${p.name} 当前不在正文中。`, { icon: 'info' }); } })),
      { separator: true },
      { label: '共享…', icon: 'share', onSelect: () => share() },
    ] });
  }

  /* ---- Notices ---- */
  function setBanner(text, actions = []) {
    banner.hidden = !text;
    banner.replaceChildren(...(text ? [el('span.cl-banner-text', {}, text), ...actions] : []));
  }
  function renderBanner(event) {
    if (!live) return;
    const binding = live.binding, role = live.role;
    if (binding.conflict) return setBanner('对同一表格的两处更改无法合并。显示的是最后可吻合的版本；编辑者的下一处更改将为所有人恢复。');
    if (binding.mode === 'single' && !binding.holdsLock()) {
      const lock = binding.meta.get('lock');
      const holderHere = lock && live.client.roster.some(p => p.session === lock.session);
      const why = '此文档包含一次只能由一人编辑的内容';
      if (holderHere) return setBanner(`${why}。${lock.name} 正在编辑；其更改将实时显示。`);
      return setBanner(`${why}。当前无人编辑。`, role === 'viewer' || role === 'commenter' ? [] : [el('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => { live.binding.takeLock(); renderBanner(); editor()?.focus(); } }, '立即编辑')]);
    }
    if (binding.mode === 'single' && event?.type === 'single') return setBanner(`您编辑期间其他人将以只读方式查看此文档：它现在包含一次只能由一人更改的内容。`);
    if (role === 'viewer') return setBanner('您可以查看此文档。如需编辑，请联系其所有者。');
    if (role === 'commenter') return setBanner('您可以阅读和批注此文档。如需编辑，请联系其所有者。');
    setBanner('');
  }

  /* ---- Sessions ---- */
  async function begin(client, link, { reopened = false } = {}) {
    const engine = editor(); if (!engine) return null;
    const { LiveSession } = await loadLive();
    // The editor closed while the room was being joined: leave it rather than run a session no one sees.
    if (destroyed) { client.close().catch(() => {}); return null; }
    const api = engineApi();
    const me = user();
    const commentGuard = api?.protectionGuard({ edit: 'comments', enforcement: true }, { name: me.name, email: me.name });
    const fileText = engine.session?.body?.text;
    live = new LiveSession({ engine, doc, client, link, user: me, baseAssets: baseAssets(), commentGuard,
      onApplied: () => onChange(), onError: e => error(e) });
    // Reopening a document it shared, the owner sees the room's state, which the file is then saved to. The room may lack
    // what the file has: a change made outside it (another app, a session that could not reach the room). The file as it
    // was is kept as a version before anything writes over it.
    if (reopened && fileText !== undefined && engine.session.body.text !== fileText && doc.keepFileVersion) {
      doc.keepFileVersion({ label: '合并共享更改前' })
        .then(v => { if (v && !destroyed) toast('共享文档中存在本地文件未包含的更改，现已显示。之前的文件状态已保存在“版本历史记录”中。', { icon: 'info', duration: 10000 }); })
        .catch(e => console.warn('[documents] the file could not be kept as a version', e));
    }
    for (const name of ['people', 'status', 'saver']) live.addEventListener(name, () => { renderPeople(); onChange(); });
    for (const name of ['role', 'mode', 'single', 'conflict']) live.addEventListener(name, e => { renderBanner(e); renderPeople(); onChange(); });
    live.addEventListener('refused-undo', e => toast(e.detail?.direction === 'redo' ? '无法恢复：此后其他人已更改该表格。' : '无法撤消：此后其他人已更改该表格。', { icon: 'info' }));
    live.addEventListener('ended', e => {
      const reason = e.detail?.reason;
      const session = live; live = null;
      renderPeople();
      if (reason) setBanner(`${reason} 文档仍在此作为您的个人副本保持打开。`, session.role !== 'owner' ? [el('button.btn.btn-sm.btn-outline', { type: 'button', onclick: async () => { doc.setSaving?.(true); doc.changed?.(); setBanner(''); try { await saveFirst(); } catch (err) { error(err); } } }, local ? '保留副本' : '保存副本')] : []);
      else setBanner('');
      onChange();
    });
    renderPeople(); renderBanner();
    onChange();
    return live;
  }

  /**
   * Save As and Save a Copy go on in a new document of the user's own. It is not the shared one: this tab leaves the
   * room, with the changes made before the copy delivered, so nothing typed in the copy reaches the others (or, through
   * the room, the original file). A guest's copy is theirs to save from here on.
   */
  const onPath = e => {
    if (!live || !e.detail?.savedAs) return;
    live.end(null);
    setBanner('您现在正在编辑未共享的个人副本。其他人继续在共享文档中操作。');
    onChange();
  };
  doc.addEventListener?.('path', onPath);

  /** After the editor opened: join the room the document came from, or the one its owner shared before. */
  async function attach() {
    try {
      if (doc.collab) {
        const { client, link } = doc.collab;
        if (!await begin(client, link)) return;
        toast(roleSentence(client.role) || '您已加入共享文档。', { icon: 'info' });
        return;
      }
      if (!local && doc.path && !readOnly() && remembered) {
        // The room's state replaces what the editor shows once it has been joined: anything typed before then
        // would be lost. A document shared before reads only until its room has been joined. One that never
        // was opens for editing at once (the lookup started while the editor loaded).
        const saved = await remembered;
        if (!saved?.server || !saved?.room || destroyed) return;
        const release = holdEditing(editor());
        let found;
        for (;;) {
          setBanner('正在连接到共享文档… 打开后即可编辑。');
          try {
            const { reconnect } = await loadLive();
            found = await reconnect(doc.path, user(), saved);
            break;
          } catch (e) {
            if (destroyed) return;
            console.warn('[documents] could not reach the shared document', e);
            // The room is still the document's: changes made here now would not reach the others, and its state
            // replaces the editor's once it is joined. The document reads only until it has been.
            await new Promise(resolve => setBanner('无法连接到共享文档，已作为只读打开。请检查网络连接并重试。',
              [el('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => resolve() }, '重试')]));
            if (destroyed) return;
          }
        }
        try {
          if (!live) setBanner('');
          release();
          if (found) await begin(found.client, found.link, { reopened: true });
        } finally { release(); }
      }
    } catch (e) { if (!live) setBanner(''); error(e); }
  }

  /** Start sharing (once): the first invitation or link creates the room. */
  function ensureShared(progress = () => {}) {
    if (live) return Promise.resolve(live);
    return (starting ||= (async () => {
      const engine = editor();
      if (!engine) throw new Error('文档正在打开。');
      if (readOnly()) throw new Error('此文档以只读方式打开，无法协同编辑。请先另存副本。');
      engine.finishComposition();
      if (!local) {
        if (!await signIn()) throw new Error('登录账户以共享此文档。');
        // A template or other file whose edits go to a new .docx (inside the Puter desktop, at the first Save) is
        // shared as that .docx, as a new document is: the room must not be the template's, nor the file it writes.
        if (!doc.path || doc.waitsForPlace) { progress('正在先保存文档…'); await saveFirst(); }
        if (!doc.path || doc.waitsForPlace) throw new Error('共享前请先保存文档。');
      }
      const { shareDocument } = await loadLive();
      const p = pkg();
      const baseBytes = p?.parts ? zipSync(p.parts) : new Uint8Array(await exportDocx().arrayBuffer());
      const { client, link, reason } = await shareDocument({ engine, doc, user: user(), name: documentName() || '无标题文档', baseBytes, local, progress });
      if (!await begin(client, link)) throw new Error('文档已关闭。');
      // Pictures added since the file was opened are not in the document the room starts from.
      live.binding.shareOwnAssets();
      if (reason) toast('您编辑期间其他人将以只读方式查看此文档：它包含一次只能由一人更改的内容。', { icon: 'info', duration: 8000 });
      progress('');
      return live;
    })().finally(() => { starting = null; }));
  }

  async function emailInvitation(address, role, note) {
    const url = await live.inviteLink(role);
    const name = documentName() || '文档';
    const who = user().name;
    const roleText = role === 'editor' ? '编辑' : role === 'commenter' ? '批注' : '查看';
    const text = `${note ? `${note}\n\n` : ''}${who} 邀请您在“文档”中${roleText}“${name}”。\n\n打开链接: ${url}\n\n您需要登录。邀请链接将在七天后过期。`;
    return sendMail({ to: address, subject: `${who} 与您共享了“${name}”`, text, username: who });
  }
  async function sendCopy(address, format, note) {
    const name = (documentName() || '文档').replace(/[\\/:*?"<>|]+/g, ' ').trim() || '文档';
    const blob = format === 'pdf' ? await exportPdf() : await exportDocx();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return sendMail({ to: address, subject: `来自 ${user().name} 的“${name}”`, text: `${note ? `${note}\n\n` : ''}${user().name} 向您发送了“${name}”的副本。附件格式为 ${format === 'pdf' ? 'PDF' : 'Word 文档'}。`, username: user().name,
      attachments: [{ filename: `${name}.${format}`, bytes, contentType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }] });
  }

  function share() {
    if (!editor()) return;
    dialog?.close();
    dialog = openShareDialog({ live: () => live, local, documentName, ensureShared, emailInvitation, sendCopy, canEmail: canEmail(),
      downloadCopy: format => (format === 'pdf' ? exportPdf(true) : exportDocx(true)), onClose: () => { dialog = null; queueMicrotask(() => editor()?.focus()); } });
  }

  /* ---- Ribbon and menus ---- */
  /* ---- Menus ---- */
  // Share and Version History sit in the title bar and the File menu; the Review tab is full already.
  const extendTab = () => [];
  function extendMenu(id) {
    if (id === 'tools') return [{ separator: true }, { label: '共享…', icon: 'share', disabled: !editor(), onSelect: share }, ...(live ? [{ label: '共同作者', icon: 'coauthors', items: people().map(p => ({ label: `${p.name}${p.me ? ' (您)' : ''}`, hint: roleLabel(p.role || 'editor'), disabled: p.me, onSelect: () => live?.follow(p.session) })) }] : [])];
    return [];
  }
  const shareItems = () => [
    { label: '邀请人员…', icon: 'invitePeople', disabled: !editor(), onSelect: share },
    // Only the owner makes links to a document on Puter (the room refuses anyone else).
    { label: '复制链接', icon: 'link', disabled: !editor() || readOnly() || (!!live && !live.local && !live.canManage), onSelect: async () => {
      try { await ensureShared(); const url = await live.inviteLink('editor'); await navigator.clipboard?.writeText(url); toast('已复制链接：任何打开此链接的人都可以编辑'); }
      catch (e) { error(e); }
    } },
    ...(live ? [{ label: '管理访问权限…', icon: 'coauthors', onSelect: share }] : []),
    { separator: true },
  ];

  /**
   * Whether this tab has changes to a shared document that it does not save itself (a guest's, another owner tab's)
   * and that have not reached the room: they are nowhere else yet. The browser keeps them for the next visit to the
   * document from here, which the person may never make.
   */
  const undelivered = () => !!live && doc.writes === false && live.pending > 0;

  return {
    avatars, banner, attach, share, ensureShared, extendTab, extendMenu, shareItems,
    get live() { return live; },
    get undelivered() { return undelivered(); },
    /** Send those changes now (before leaving the document); resolves whether none are left. */
    async deliver() {
      if (undelivered()) await live.deliver();
      return !undelivered();
    },
    commands: {
      share,
      /** Who is in the document, for the title bar: [{ name, color, role, me }]. */
      collaborators: () => people().map(({ session, name, color, role, me }) => ({ session, name, color, role, me: !!me })),
      coauthoringStatus: () => (live ? { status: live.status, pending: live.pending, role: live.role, saves: !!live.saves } : null),
    },
    refresh() { renderChip(); },
    destroy() {
      destroyed = true; dialog?.close();
      narrow?.removeEventListener?.('change', onNarrow);
      doc.removeEventListener?.('path', onPath);
      // A room joined from an invitation whose session never began (the editor closed while opening, or could
      // not open the document) is left here; a session that began leaves it when it ends.
      if (!live && doc.collab?.client) doc.collab.client.close().catch(() => {});
      live?.destroy(); live = null;
    },
  };
}
