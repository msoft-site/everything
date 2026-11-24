/**
 * Restrict Editing: formatting restrictions (allowed styles), editing restrictions (read only,
 * tracked changes, comments, filling in forms) with per-region exceptions for everyone or named
 * people, and enforcement with an optional password (documentProtection, §17.15.1.29; permStart/
 * permEnd, §17.13.7). Also Lock Tracking and the Always Open Read-Only recommendation.
 */
import { el } from '../ui/dom.js';
import { openModal, confirmDialog, promptDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { engineApi } from '../lib/engine-api.js';
import { sidePane, section, button, hint, preference, reveal } from './review-ui.js';

const EDIT_LABELS = { readOnly: '未作任何更改(只读)', trackedChanges: '修订', comments: '批注', forms: '填写窗体' };
const EXPLAIN = {
  readOnly: '此文档已被保护，以防无意中进行编辑。',
  trackedChanges: '此文档已被保护: 所有更改均作为修订记录。',
  comments: '此文档已被保护: 你只能添加批注。',
  forms: '此文档已被保护: 你只能填写窗体域。',
  none: '此文档中的格式设置已限制为允许的样式。',
};
const EXTRA_EDITORS = preference('documents:restrict-editors', []);
const HIGHLIGHT = preference('documents:restrict-highlight', true);
const REGION_TINT = 'rgba(255, 214, 92, .32)', DRAFT_TINT = 'rgba(120, 160, 230, .22)';

/** Password and confirmation; resolves the password ('' for none) or null when cancelled. */
export function passwordDialog({ title, intro, confirmLabel = '确定', requireMatch = true, allowEmpty = true, check }) {
  return new Promise(resolve => {
    let done = false;
    const finish = value => { if (!done) { done = true; resolve(value); } };
    const first = el('input.input', { type: 'password', autocomplete: 'new-password', 'aria-label': '密码' });
    const second = el('input.input', { type: 'password', autocomplete: 'new-password', 'aria-label': '重新输入密码' });
    const problem = el('p.field-error', { role: 'alert', hidden: true });
    const confirm = el('button.btn.btn-primary', { type: 'submit' }, confirmLabel);
    const content = el('form.ed-dialog-body', { onsubmit: async e => {
      e.preventDefault();
      const value = first.value;
      const fail = message => { problem.textContent = message; problem.hidden = false; first.focus(); };
      if (!value && !allowEmpty) return fail('请输入密码。');
      if (requireMatch && value !== second.value) return fail('两次输入的密码不一致。');
      if (check) {
        confirm.disabled = true; confirm.textContent = '检查中…';
        // Let the button repaint before the hash runs.
        await new Promise(r => setTimeout(r, 30));
        const ok = await check(value).catch(err => { fail(err.message); return null; });
        confirm.disabled = false; confirm.textContent = confirmLabel;
        if (ok === null) return;
        if (!ok) return fail('密码不正确。');
      }
      finish(value); modal.close();
    } },
      intro ? el('p.field-hint', {}, intro) : null,
      el('label.field', {}, el('span.field-label', {}, requireMatch ? '新密码(可选)' : '密码'), first),
      requireMatch ? el('label.field', {}, el('span.field-label', {}, '重新输入密码以确认'), second) : null,
      problem,
      requireMatch ? hint('密码可防止他人意外关闭保护。这不是加密: 文档仍可被读取。') : null,
      el('div.modal-actions', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), confirm));
    const modal = openModal({ title, content, onClose: () => finish(null) });
    first.focus();
  });
}

export function createRestrictEditing({ editor, pkg, error, author, onChange = () => {} }) {
  let readOnlyView = false; // Opened read-only as the author recommended: not saved in the file.
  const settings = () => pkg()?.reviewSettings || {};
  const protection = () => settings().protection || null;
  const enforced = () => !!protection()?.enforcement || readOnlyView;
  const user = () => ({ name: author() || '', email: author() || '' });
  const api = () => engineApi();
  const setSettings = patch => { const p = pkg(); if (!p) return; p.reviewSettings = { ...p.reviewSettings, ...patch }; editor()?.onChange?.(); };

  /** Install (or remove) the editor's guard for the current protection. */
  function applyGuard() {
    const engine = editor(); if (!engine || !api()) return;
    const active = readOnlyView ? { edit: 'readOnly', enforcement: true } : protection();
    engine.session.guard = api().protectionGuard(active && { ...active, lockedStyles: settings().lockedStyles || [] }, user(), { contentControlRanges: api().contentControlRanges });
    const locked = !!active?.enforcement && active.edit === 'trackedChanges';
    if (locked && !engine.session.body.trackChanges) { engine.session.body.trackChanges = true; engine.session.revision++; }
    // Locked tracking records formatting changes too, whatever the document's Track formatting setting.
    engine.session.body.trackFormatting = locked || !settings().doNotTrackFormatting;
    onChange();
  }

  /* ---- The pane ---- */
  const pane = sidePane({ title: '限制编辑', label: '限制编辑窗格', className: 'rv-restrict-pane', onOpen: () => { render(); queueMicrotask(onChange); }, onClose: () => { onChange(); editor()?.focus(); } });
  let draft = { formatting: false, edit: 'readOnly', editing: false };
  function syncDraft() {
    const p = protection();
    draft = { formatting: !!p?.formatting, editing: !!p && p.edit !== 'none', edit: p && p.edit !== 'none' ? p.edit : draft.edit || 'readOnly' };
  }
  const regions = () => { const engine = editor(); return engine && api() ? api().permissionRanges(engine.session.body.paragraphs, engine.session.body.tables) : []; };
  const myRegions = () => regions().filter(r => api().permissionApplies(r, user()));
  const editorsList = () => [...new Set([...EXTRA_EDITORS.get(), ...regions().map(r => r.ed).filter(Boolean)])];

  let renderedSignature = '';
  /** Rebuild the pane when what it shows changed (or when forced). */
  function render(force = true) {
    if (!pane.isOpen) return;
    const engine = editor();
    const signature = JSON.stringify([enforced(), protection(), settings().lockedStyles, regions(), engine?.model.range, engine?.session.path, editorsList(), !!pkg()?.readOnly, HIGHLIGHT.get()]);
    if (!force && signature === renderedSignature) return;
    renderedSignature = signature;
    // A control is known by its label: its own, the <label> around it (a checkbox has no text of its own), or its text.
    const nameOf = n => n.getAttribute('aria-label') || n.closest('label')?.textContent || n.textContent;
    const focused = pane.body.contains(document.activeElement) ? nameOf(document.activeElement) : null;
    pane.body.replaceChildren(enforced() ? enforcedView() : setupView(engine));
    // Keep keyboard focus on the control that was focused before the rebuild.
    if (focused) [...pane.body.querySelectorAll('button, input, select')].find(n => nameOf(n) === focused)?.focus({ preventScroll: true });
  }

  function setupView(engine) {
    syncDraft();
    const readOnly = !!pkg()?.readOnly;
    const formattingBox = el('input', { type: 'checkbox', checked: draft.formatting, disabled: readOnly, onchange: () => { draft.formatting = formattingBox.checked; saveDraft(); } });
    const editingBox = el('input', { type: 'checkbox', checked: draft.editing, disabled: readOnly, onchange: () => { draft.editing = editingBox.checked; saveDraft(); render(); } });
    const kind = el('select.input', { 'aria-label': '允许的编辑类型', disabled: !draft.editing || readOnly, onchange: () => { draft.edit = kind.value; saveDraft(); render(); } },
      ...Object.entries(EDIT_LABELS).map(([value, label]) => el('option', { value, selected: value === draft.edit }, label)));
    const [a, b] = engine?.model.range || [0, 0];
    const selectionRegions = regions().filter(r => r.start <= a && b <= r.end || a < r.end && b > r.start);
    const allows = who => selectionRegions.some(r => who === 'everyone' ? r.edGrp === 'everyone' : (r.ed || '').toLowerCase() === who.toLowerCase());
    const exceptionRow = (who, label) => {
      const box = el('input', { type: 'checkbox', checked: allows(who), disabled: readOnly || engine?.session.path !== null || a === b && !allows(who),
        onchange: () => toggleException(who, box.checked) });
      return el('label.rv-check', {}, box, label);
    };
    const exceptions = draft.editing && ['readOnly', 'comments'].includes(draft.edit) ? section('例外项(可选)',
      hint('选择文档的各部分并选取允许自由编辑的人员。'),
      exceptionRow('everyone', '每个人'),
      ...editorsList().map(name => exceptionRow(name, name)),
      el('div.rv-actions', {}, button('更多用户…', async () => {
        const names = await promptDialog({ title: '添加用户', label: '用户名或电子邮件地址', hint: '多个用户请用逗号或分号分隔。', confirmLabel: '添加' });
        if (!names) return;
        EXTRA_EDITORS.set([...new Set([...EXTRA_EDITORS.get(), ...names.split(/[;,]/).map(s => s.trim()).filter(Boolean)])]);
        render();
      })),
      regionList()) : null;
    const start = button('是，启动强制保护', () => startEnforcing(), { primary: true, small: false, disabled: readOnly || !draft.formatting && !draft.editing });
    return el('div', {},
      section('1. 格式设置限制', el('label.rv-check', {}, formattingBox, '限制对选定的样式进行格式设置'), button('设置…', () => chooseStyles(), { disabled: readOnly })),
      section('2. 编辑限制', el('label.rv-check', {}, editingBox, '仅允许在文档中进行此类编辑:'), kind),
      exceptions,
      section('3. 启动强制保护', hint('准备好应用这些设置了吗? 以后可以将其关闭。'), start),
      readOnly ? hint('此文档以只读方式打开。') : null);
  }
  function regionList() {
    const list = regions();
    if (!list.length) return null;
    const engine = editor();
    return el('div.rv-list.rv-regions', { role: 'list', 'aria-label': '可编辑区域' }, ...list.map(r => el('div.rv-item', { role: 'listitem' },
      el('button.rv-issue-target', { type: 'button', onclick: () => reveal(engine, r.start, r.end) }, `${r.edGrp === 'everyone' ? '每个人' : r.ed || r.edGrp}: “${engine.session.body.text.slice(r.start, Math.min(r.end, r.start + 40)).replace(/\n/g, ' ')}${r.end - r.start > 40 ? '…' : ''}”`),
      // Regions are the body's: leave a header, footer or note being edited, so the body loses the region (one undo step).
      button('删除', () => { engine.finishComposition(); if (engine.session.path !== null) engine.editStory(null); engine.execute(() => api().removePermissionRanges(engine.session.body, [r.id])); render(); }))));
  }
  function saveDraft() {
    // Unenforced choices are kept in the file (enforcement off), as word processors do.
    const next = draft.formatting || draft.editing ? { edit: draft.editing ? draft.edit : 'none', formatting: draft.formatting, enforcement: false } : null;
    const current = protection();
    if (JSON.stringify(next) === JSON.stringify(current && { edit: current.edit, formatting: current.formatting, enforcement: current.enforcement })) return;
    setSettings({ protection: next });
  }
  function toggleException(who, on) {
    const engine = editor(); if (!engine) return;
    engine.finishComposition();
    const [a, b] = engine.model.range;
    if (on) engine.execute(() => api().addPermissionRange(engine.model, a, b, who === 'everyone' ? { edGrp: 'everyone' } : { ed: who }));
    else {
      const ids = regions().filter(r => (r.start <= a && b <= r.end || a < r.end && b > r.start) && (who === 'everyone' ? r.edGrp === 'everyone' : (r.ed || '').toLowerCase() === who.toLowerCase())).map(r => r.id);
      engine.execute(() => api().removePermissionRanges(engine.model, ids));
    }
    render();
  }
  function chooseStyles() {
    const engine = editor(); if (!engine) return;
    const styles = Object.values(engine.model.styles.definitions || {}).filter(s => ['paragraph', 'character'].includes(s.type)).sort((x, y) => String(x.name).localeCompare(String(y.name)));
    const locked = new Set(settings().lockedStyles || []);
    const boxes = styles.map(s => ({ id: s.id, input: el('input', { type: 'checkbox', checked: !locked.has(s.id) }), label: s.name || s.id }));
    const modal = openModal({ title: '格式设置限制', content: el('form.ed-dialog-body', { onsubmit: e => {
      e.preventDefault();
      setSettings({ lockedStyles: boxes.filter(b => !b.input.checked).map(b => b.id) });
      modal.close(); render();
    } },
      hint('勾选的样式可以使用。启用限制后不允许直接设置格式。'),
      el('div.rv-style-list', {}, ...boxes.map(b => el('label.rv-check', {}, b.input, b.label))),
      el('div.rv-actions', {}, button('全选', () => boxes.forEach(b => { b.input.checked = true; })), button('全不选', () => boxes.forEach(b => { b.input.checked = false; }))),
      el('div.modal-actions', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, '确定'))) });
  }

  async function startEnforcing(choice = null) {
    const engine = editor(); if (!engine || pkg()?.readOnly) return false;
    const edit = choice?.edit ?? (draft.editing ? draft.edit : 'none'), formatting = choice?.formatting ?? draft.formatting;
    const password = await passwordDialog({ title: choice?.title || '启动强制保护', intro: choice?.intro || '输入密码以防他人解除保护，或者留空。' });
    if (password === null) return false;
    const verifier = password ? await api().createPasswordVerifier(password) : null;
    engine.finishComposition();
    setSettings({ protection: { edit, formatting, enforcement: true, ...(verifier || {}) } });
    // Earlier edits cannot be undone past the point protection began.
    engine.session.history = []; engine.session.future = [];
    applyGuard(); render();
    toast(edit === 'trackedChanges' && !formatting ? '已锁定修订跟踪' : '已启用保护');
    return true;
  }
  async function stopEnforcing({ title = '停止保护' } = {}) {
    const p = protection(); if (!p?.enforcement) { if (readOnlyView) { readOnlyView = false; applyGuard(); render(); } return true; }
    if (api().hasPassword(p)) {
      const ok = await passwordDialog({ title, requireMatch: false, allowEmpty: false, confirmLabel: '解除保护', check: value => api().verifyPassword(value, p) });
      if (ok === null) return false;
    } else if (!await confirmDialog({ title, message: '关闭对此文档的保护?', confirmLabel: '停止保护', danger: false })) return false;
    setSettings({ protection: { edit: p.edit, formatting: p.formatting, enforcement: false } });
    applyGuard(); render();
    return true;
  }

  function nextRegion() {
    const engine = editor(); if (!engine) return;
    const list = myRegions(); if (!list.length) { toast('没有你可以编辑的区域。', { icon: 'info' }); return; }
    const [, b] = engine.model.range;
    const next = list.find(r => r.start > b) || list[0];
    reveal(engine, next.start, next.end); engine.focus();
  }
  function enforcedView() {
    const p = readOnlyView ? { edit: 'readOnly' } : protection();
    const mine = myRegions();
    const highlight = el('input', { type: 'checkbox', checked: HIGHLIGHT.get(), onchange: () => { HIGHLIGHT.set(highlight.checked); onChange(); } });
    return el('div', {},
      section('你的权限', el('p.rv-status', {}, readOnlyView ? '你已按作者建议以只读方式打开此文档。' : EXPLAIN[p.edit] || EXPLAIN.readOnly),
        p.formatting && p.edit !== 'none' ? el('p.rv-status', {}, EXPLAIN.none) : null,
        ['readOnly', 'comments', 'forms'].includes(p.edit) && mine.length ? el('div', {}, hint('你可以在突出显示的区域中进行编辑。'),
          el('div.rv-actions', {}, button('查找我可以编辑的下一个区域', () => nextRegion(), { primary: true }), button('显示我可以编辑的所有区域', () => { const engine = editor(); if (mine.length) reveal(engine, mine[0].start, mine.at(-1).end); })),
          el('label.rv-check', {}, highlight, '突出显示我可以编辑的区域')) : null),
      el('div.rv-actions', {}, button(readOnlyView ? '仍然编辑' : '停止保护', () => stopEnforcing(), { small: false })));
  }

  return {
    pane, applyGuard, startEnforcing, stopEnforcing, nextRegion,
    open({ focus = true } = {}) { pane.open({ focus }); render(); },
    refresh() { if (pane.isOpen) render(false); },
    get enforced() { return enforced(); },
    get protection() { return readOnlyView ? { edit: 'readOnly', enforcement: true } : protection(); },
    get trackingLocked() { const p = protection(); return !!p?.enforcement && p.edit === 'trackedChanges'; },
    /** Tints for permission regions (yellow when enforced, blue while setting up). */
    tints() {
      const engine = editor(); if (!engine || engine.session.path !== null || !api()) return [];
      if (enforced()) return HIGHLIGHT.get() ? myRegions().map(r => ({ start: r.start, end: r.end, fill: REGION_TINT })) : [];
      return pane.isOpen ? regions().map(r => ({ start: r.start, end: r.end, fill: DRAFT_TINT })) : [];
    },
    /** File > Always Open Read-Only. */
    get alwaysReadOnly() { return !!settings().writeProtection?.recommended; },
    toggleAlwaysReadOnly() {
      if (pkg()?.readOnly) return;
      // The setting also holds the password to modify the document (§17.15.1.93), which stays.
      const current = settings().writeProtection, recommended = !current?.recommended;
      setSettings({ writeProtection: recommended || current?.hashValue || current?.hash ? { ...current, recommended } : null });
      toast(recommended ? '此文档将建议以只读方式打开' : '已关闭只读建议');
    },
    /** On opening a document whose author recommends read-only, ask how to open it. */
    async offerReadOnly() {
      if (!settings().writeProtection?.recommended || pkg()?.readOnly) return;
      const readOnly = await confirmDialog({ title: '以只读方式打开?', message: '除非你需要更改，否则作者建议以只读方式打开此文档。', confirmLabel: '以只读方式打开', cancelLabel: '编辑', danger: false });
      if (readOnly) { readOnlyView = true; applyGuard(); pane.open({ focus: false }); render(); }
    },
    destroy() { pane.destroy(); },
  };
}
