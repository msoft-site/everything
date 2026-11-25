/**
 * The Mailings tab: envelopes, labels and mail merge from start to finish.
 *
 * Mail merge state (document type, recipient list, field matching, preview) lives on the package
 * as `pkg.mailMerge` and is saved with the document (engine/docx-mail-merge.js). Fields are real
 * MERGEFIELD, ADDRESSBLOCK, GREETINGLINE and rule fields inserted through editor transactions
 * (engine/mail-merge-model.js). Previewing replaces the fields' results with a recipient's values
 * without adding undo steps; merging builds a new document from the saved main document.
 */
import { el } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/modal.js';
import * as P from '../lib/puter.js';
import { dialog, button } from './mailings-ui.js';
import { createWizard } from './mailings-wizard.js';
import { openRecipientGrid, openRecipientList, chooseSheet } from './mailings-recipients.js';
import { openAddressBlock, openGreetingLine, openInsertField, openRule, openMatchFields, openFindRecipient, openCheckErrors, askPrompts, openFinish, RULES, mergeFieldInstruction } from './mailings-fields.js';
import { openEnvelopes, openLabels } from './mailings-create.js';
import { DOCUMENT_TYPES } from '../engine/docx-mail-merge.js';

const BLANK = Object.freeze({ type: null, activeRecord: 1, preview: false, subject: '', addressField: '', list: null, mapping: {}, source: null, email: { format: 'html' }, external: null });
const HIGHLIGHT = 'rgba(128, 128, 128, 0.28)';
const RECIPIENT_FILES = ['.csv', '.tsv', '.txt', '.xlsx'];
const sdk = () => (typeof puter !== 'undefined' ? puter : null);

export function createMailings({ editor, pkg, error, onChange = () => {}, markDirty = () => {}, importFile, print, documentTitle = () => '', focus = () => editor()?.focus(), layoutChanged = () => {}, protectedDocument = () => false }) {
  // A document open read-only, or protected against editing, cannot become a main document or change its merge.
  const ready = () => { const engine = editor(); return engine && !pkg()?.readOnly && !protectedDocument() ? engine : null; };
  const fail = e => { error(e); };
  // Highlighting is a view preference for this session, like formatting marks; it is not saved.
  let engineModules = null, answers = {}, highlighted = false, seenSteps = null;
  const modules = async () => (engineModules ||= await Promise.all([import('../engine/merge-fields.js'), import('../engine/mail-merge-model.js'), import('../engine/docx-mail-merge.js'), import('../engine/mail-documents.js'), import('fflate')])
    .then(([fields, model, docx, documents, zip]) => ({ fields, model, docx, documents, zip })));
  // Recipient lists and the merge evaluator are small; load them before the first command needs them.
  let loaded = null; modules().then(m => { loaded = m; mm.refreshUi(); }).catch(() => {});

  const state = () => pkg()?.mailMerge || BLANK;
  // The ribbon's record controls ask at every refresh (each keystroke), about twenty times: the records are worked
  // out once per list, which every change replaces, instead of reading a long list's rows each time.
  let listed = null;
  const records = () => {
    if (!loaded) return [];
    const list = state().list;
    if (listed?.list !== list) listed = { list, value: loaded.fields.mergeRecords(list) };
    return listed.value;
  };
  const mapping = () => {
    const s = state();
    if (Object.keys(s.mapping || {}).length || !s.list || !loaded) return s.mapping || {};
    return loaded.fields.autoMatchFields(s.list.columns);
  };
  function setState(patch) {
    const p = pkg(); if (!p || p.readOnly || protectedDocument()) return;
    const next = { ...BLANK, ...state(), ...patch };
    p.mailMerge = next.type || next.list || Object.keys(next.mapping || {}).length ? next : null;
    markDirty();
    refreshUi();
  }
  /** The body model's merge fields; leaves a header or footer first. */
  function bodyFields(engine) {
    if (engine.session.path !== null) engine.editStory(null);
    return loaded.model.mergeFieldRanges(engine.session.body);
  }

  /* ---- Preview ---- */
  function refreshPreview() {
    const engine = ready(); if (!engine || !loaded) return;
    engine.finishComposition();
    const fields = bodyFields(engine);
    if (!fields.length) return;
    const s = state(), data = records();
    let results;
    if (s.preview && data.length) {
      const start = Math.min(Math.max(1, s.activeRecord || 1), data.length) - 1;
      results = loaded.fields.mergeCopy(fields.map(f => f.code), { data, start, mapping: mapping(), answers }).results;
    } else results = loaded.model.placeholderResults(fields);
    engine.execute(() => loaded.model.applyMergeResults(engine.model, fields, results), null, { record: false }, true);
    refreshHighlight();
  }
  function setPreview(on) {
    if (on && !records().length) { if (state().list) toast('邮件合并中未包含任何收件人', { icon: 'info' }); else error(new Error('请选择收件人以预览合并结果。')); return; }
    setState({ preview: !!on }); refreshPreview();
  }
  function goToRecord(n) {
    const total = records().length; if (!total) return;
    setState({ activeRecord: Math.max(1, Math.min(total, Math.round(n) || 1)), preview: true });
    refreshPreview();
  }
  function refreshHighlight() {
    const engine = editor(); if (!engine?.setRangeTints) return;
    const on = highlighted && loaded && engine.session;
    const fields = on ? loaded.model.mergeFieldRanges(engine.session.body).filter(f => loaded.fields.MERGE_TYPES.has(f.type)) : [];
    engine.setRangeTints(fields.map(f => ({ start: f.range.start, end: Math.max(f.range.end, f.range.start), fill: HIGHLIGHT })).filter(t => t.end > t.start), 'mergeFields');
  }

  /* ---- Fields ---- */
  async function insertField(instruction) {
    const engine = ready(); if (!engine) throw new Error('此文档以只读方式打开。');
    const m = await modules();
    engine.finishComposition();
    if (engine.session.path !== null) throw new Error('合并域只能放在正文中。请先关闭页眉或页脚。');
    if (!engine.execute(() => { m.model.insertMergeField(engine.model, instruction); return true; })) return;
    if (!state().type) setState({ type: 'formLetters' });
    if (state().preview) refreshPreview(); else refreshHighlight();
    // A dialog that inserted the field keeps the page inert until it closes; return to the text after that.
    engine.focus(); setTimeout(() => { if (!document.querySelector('.modal-root:not(.closing)')) engine.focus(); });
  }

  /* ---- Recipients ---- */
  const applyList = (list, extra = {}) => {
    setState({ list, activeRecord: 1, type: state().type || 'formLetters', ...extra });
    if (state().preview) refreshPreview();
  };
  async function typeNewList() {
    const m = await modules();
    openRecipientGrid({ list: state().source?.kind === 'typed' && state().list ? state().list : { ...m.fields.emptyRecipientList(), rows: [] }, title: state().source?.kind === 'typed' && state().list ? '编辑地址列表' : '新建地址列表',
      onSave: list => applyList(list, { source: { kind: 'typed', name: '' }, mapping: {} }) });
  }
  const fileInput = el('input', { type: 'file', accept: RECIPIENT_FILES.join(','), hidden: true, onchange: () => { const file = fileInput.files[0]; fileInput.value = ''; if (file) loadListFile(file); } });
  async function loadListFile(file) {
    try {
      const { readRecipientFile } = await import('../lib/recipient-files.js');
      let list = await readRecipientFile(file);
      if (list.sheets?.length > 1) {
        const sheet = await chooseSheet(list.sheets);
        if (sheet === null) return;
        if (sheet !== list.sheet) list = await readRecipientFile(file, { sheet });
      }
      if (!list.rows.length) throw new Error('该列表包含列名但没有收件人。');
      const { sheets, sheet, ...clean } = list; void sheets; void sheet;
      applyList(clean, { source: { kind: /\.xlsx$/i.test(file.name) ? 'xlsx' : 'csv', name: file.name }, mapping: {} });
      toast(`从 ${file.name} 读取了 ${clean.rows.length} 位收件人`);
      editRecipients();
    } catch (e) { fail(e); }
  }
  async function useExistingList({ cloud = false } = {}) {
    if (!cloud) { fileInput.click(); return; }
    try {
      const picked = await P.pickFile({ accept: RECIPIENT_FILES });
      if (!picked) return;
      const blob = await P.readFile(picked.path);
      await loadListFile(new File([blob], picked.name));
    } catch (e) { fail(e); }
  }
  async function editRecipients() {
    const m = await modules();
    if (!state().list) { error(new Error('请先选择收件人：键入新列表或使用现有列表。')); return; }
    openRecipientList({ state: state(), onApply: (list, map) => { setState({ list, mapping: map, activeRecord: Math.min(state().activeRecord, Math.max(1, m.fields.mergeRecords(list).length)) }); if (state().preview) refreshPreview(); },
      onEditEntries: (list, done) => openRecipientGrid({ list, title: '编辑条目', onSave: done }) });
  }
  function excludeCurrent() {
    const s = state(), data = records(); if (!data.length) return;
    const record = data[Math.min(s.activeRecord, data.length) - 1];
    const list = structuredClone(s.list); list.rows[record.number - 1].included = false;
    setState({ list, activeRecord: Math.min(s.activeRecord, Math.max(1, data.length - 1)) });
    if (records().length) refreshPreview(); else setPreview(false);
  }

  /* ---- Start mail merge ---- */
  async function startMerge(type, { quiet = false } = {}) {
    if (type === 'normal') {
      const s = state();
      if (s.list && !await confirmDialog({ title: '将此文档设为普通文档？', message: '收件人列表和合并设置将从此文档中删除，但域代码仍将保留。', confirmLabel: '删除' })) return;
      if (s.preview) { setState({ preview: false }); refreshPreview(); }
      const p = pkg(); if (p && !p.readOnly) { p.mailMerge = null; markDirty(); refreshUi(); }
      return;
    }
    if (quiet || !['envelopes', 'mailingLabels'].includes(type)) { setState({ type }); return; }
    const m = await modules();
    const engine = ready(); if (!engine) return;
    if (type === 'envelopes') openEnvelopes({ mode: 'merge', onSubmit: async options => {
      const delivery = { field: m.fields.addressBlockInstruction() };
      if (!engine.session.body.text.trim() && !engine.session.body.tables.length && engine.session.path === null) {
        engine.finishComposition();
        if (!engine.execute(() => m.model.insertEnvelope(engine.model, { ...options, delivery }))) return false;
        setState({ type: 'envelopes' }); refreshPreview(); return;
      }
      await openNew(await m.documents.envelopeDocx({ ...options, delivery }, { mailMerge: { ...state(), type: 'envelopes', preview: false } }), 'Envelopes');
    } });
    else openLabels({ mode: 'merge', onSubmit: async (layout, { fontSize }) => {
      const block = m.fields.addressBlockInstruction();
      await openNew(m.documents.labelSheetDocx(layout, i => ({ fields: i ? [{ field: ' NEXT ' }, { field: block }] : [{ field: block }] }), { fontSize, mailMerge: { ...state(), type: 'mailingLabels', preview: false } }), 'Labels');
    } });
  }
  async function openNew(blob, name) {
    if (!importFile) throw new Error('无法在此打开新文档。');
    await importFile(new File([blob], `${name}.docx`, { type: blob.type }));
  }

  /* ---- Create ---- */
  async function envelopes() {
    const m = await modules();
    const engine = ready();
    const selected = engine ? engine.model.text.slice(...engine.model.range).replace(/\v/g, '\n').trim() : '';
    openEnvelopes({ delivery: selected.length < 400 ? selected : '',
      onAdd: options => {
        const e = ready(); if (!e) throw new Error('此文档以只读方式打开。');
        e.finishComposition();
        if (e.session.path !== null) e.editStory(null);
        if (!e.execute(() => m.model.insertEnvelope(e.model, options))) return false;
        toast('信封已作为第一页添加'); e.focus();
      },
      onNew: async options => openNew(await m.documents.envelopeDocx(options), 'Envelope') });
  }
  async function labels() {
    const m = await modules();
    const engine = ready();
    const selected = engine ? engine.model.text.slice(...engine.model.range).replace(/\v/g, '\n').trim() : '';
    openLabels({ address: selected.length < 400 ? selected : '', onNew: async ({ layout, text, single, fontSize }) => {
      const per = layout.columns;
      await openNew(m.documents.labelSheetDocx(layout, i => !single || (Math.floor(i / per) + 1 === single.row && i % per + 1 === single.column) ? { text } : null, { fontSize }), 'Labels');
    } });
  }

  /* ---- Write & insert ---- */
  async function updateLabels() {
    const engine = ready(); if (!engine) return;
    const m = await modules();
    engine.finishComposition(); if (engine.session.path !== null) engine.editStory(null);
    let count = 0;
    if (!engine.execute(() => { count = m.model.updateLabels(engine.model); return count > 0; })) return;
    toast(`Updated ${count} ${count === 1 ? 'label' : 'labels'}`);
    if (state().preview) refreshPreview(); else refreshHighlight();
  }

  /* ---- Check for errors ---- */
  function checkErrors() {
    const engine = editor(); if (!engine || !loaded) return null;
    const fields = loaded.model.mergeFieldRanges(engine.session.body), codes = fields.map(f => f.code), data = records();
    const missing = new Set(), emptyAddress = [], noEmail = [];
    const plan = data.length ? loaded.fields.planMerge(codes, { data, mapping: mapping(), answers, onIssue: issue => { if (issue.type === 'missingField') missing.add(issue.field); } }) : [];
    const blocks = fields.map((f, i) => f.type === 'ADDRESSBLOCK' ? i : -1).filter(i => i >= 0);
    for (const copy of plan) if (blocks.some(i => !String(copy.results[i] ?? '').trim())) emptyAddress.push(data[copy.start].number);
    const s = state();
    if (s.type === 'email') { const column = s.email?.to || mapping().email; for (const r of data) if (!column || !String(r.values[column] ?? '').trim()) noEmail.push(r.number); }
    const covered = new Set(plan.flatMap(c => c.records));
    return { missing: [...missing], emptyAddress, noEmail, skipped: data.length - covered.size, copies: plan.length, noRecipients: !data.length, noFields: !fields.some(f => loaded.fields.MERGE_TYPES.has(f.type)) };
  }

  /* ---- Finish & merge ---- */
  async function prepare(kind) {
    const engine = ready(); if (!engine) throw new Error('This document is open read-only.');
    const m = await modules();
    if (!records().length) throw new Error('Select recipients before finishing the merge.');
    engine.finishComposition();
    const fields = bodyFields(engine);
    const prompts = m.fields.mergePrompts(fields.map(f => f.code));
    const range = await openFinish(kind, mm); if (!range) return null;
    const next = await askPrompts(prompts, answers); if (next === null) return null;
    answers = next;
    return { engine, m, data: records().slice(range.from - 1, range.to), codes: fields.map(f => f.code) };
  }
  /** Apply each planned copy to the document in turn (no undo steps), then restore the preview. */
  async function eachCopy({ engine, m, data, codes }, visit) {
    const plan = m.fields.planMerge(codes, { data, mapping: mapping(), answers });
    try {
      for (const [index, copy] of plan.entries()) {
        const fields = m.model.mergeFieldRanges(engine.session.body);
        engine.execute(() => m.model.applyMergeResults(engine.model, fields, copy.results), null, { record: false }, true);
        await visit(copy, index, plan.length);
      }
    } finally { refreshPreview(); }
    return plan.length;
  }
  async function finish(kind) {
    try {
      const job = await prepare(kind); if (!job) return;
      if (kind === 'document') {
        const bytes = new Uint8Array(await (await job.engine.export(pkg())).arrayBuffer());
        const { parts, copies } = job.m.docx.mergeDocumentParts(job.m.zip.unzipSync(bytes), { data: job.data, mapping: mapping(), answers, type: state().type || 'formLetters' });
        const name = `${(documentTitle() || 'Mail merge').replace(/\.docx$/i, '')} – merged`;
        toast(`Merged ${copies.length} ${copies.length === 1 ? 'document' : 'documents'}`);
        await openNew(new Blob([job.m.zip.zipSync(parts)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), name);
      } else if (kind === 'print') {
        if (job.data.length > 300) throw new Error('Print up to 300 recipients at a time, or merge to a new document and print that.');
        const sheets = [];
        await job.engine.fontRefresh;
        await eachCopy(job, () => { sheets.push(...job.engine.printSheets()); });
        await print(() => sheets);
      } else if (kind === 'email') await sendEmail(job);
    } catch (e) { fail(e); }
  }
  async function sendEmail(job) {
    const s = state(), column = s.email?.to, html = s.email?.format !== 'text';
    const { plainText, documentHtml, emlMessage, emlName, EMAIL_PATTERN } = await import('../lib/mail-messages.js');
    const messages = [], skipped = [];
    await eachCopy(job, copy => {
      const record = job.data[copy.start];
      const to = String(record.values[column] ?? '').trim();
      if (!EMAIL_PATTERN.test(to)) { skipped.push(record.number); return; }
      messages.push({ to, subject: s.subject || '', text: plainText(job.engine.model), html: html ? documentHtml(job.engine.model) : null });
    });
    if (!messages.length) throw new Error(`None of the merged recipients has a valid address in “${column}”.`);
    const p = sdk(), canSend = !!p?.email?.send && P.hasSDK() && await P.isSignedIn().catch(() => false);
    const note = skipped.length ? ` ${skipped.length} without a valid address will be left out.` : '';
    if (canSend) {
      const choice = await chooseDelivery(messages.length, note);
      if (!choice) return;
      if (choice === 'send') { await sendWithPuter(p, messages); return; }
    } else if (skipped.length) toast(`${skipped.length} 位收件人没有有效的电子邮件地址，已忽略`, { icon: 'info', duration: 5000 });
    // Downloadable messages open in any mail client as unsent drafts.
    if (messages.length === 1) P.downloadBlob(new Blob([emlMessage(messages[0])], { type: 'message/rfc822' }), emlName(1, messages[0].to));
    else {
      const files = Object.fromEntries(messages.map((msg, i) => [emlName(i + 1, msg.to), new TextEncoder().encode(emlMessage(msg))]));
      P.downloadBlob(new Blob([job.m.zip.zipSync(files)], { type: 'application/zip' }), `${(documentTitle() || '邮件合并').replace(/\.docx$/i, '')} – messages.zip`);
    }
    toast(`已保存 ${messages.length} 封邮件，可在邮件客户端中打开`);
  }
  function chooseDelivery(count, note) {
    return new Promise(resolve => {
      let choice = null;
      const modal = dialog({ title: '发送电子邮件', submit: `发送 ${count} 封邮件`, body: el('p.modal-text', {}, `每位收件人都将收到来自您的邮箱的单独邮件。${note} 您也可以将其下载为文件，通过其他邮件应用发送。`),
        actions: [button('下载邮件', () => { choice = 'download'; modal.close(); })], onSubmit: () => { choice = 'send'; }, onClose: () => resolve(choice) });
    });
  }
  async function sendWithPuter(p, messages) {
    let sent = 0, failed = 0, retried = false;
    const progress = toast(`正在发送 0 / ${messages.length}…`, { icon: 'info', duration: 600000 });
    for (const message of messages) {
      let body;
      try { body = await p.email.send({ to: message.to, subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) }); }
      catch { failed++; continue; }
      if (body?.code === 'forbidden' && !retried) {
        retried = true;
        try { const user = await P.getUser(); await p.perms?.request?.('permission', { permission: `fs:/${user?.username}/.mail:write`, create: true }); body = await p.email.send({ to: message.to, subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) }); } catch { /* reported below */ }
      }
      if (body?.code === 'too_many_requests') { failed += messages.length - sent - failed; break; }
      const delivered = Array.isArray(body?.delivered) ? body.delivered.map(a => String(a).toLowerCase()) : null;
      if (delivered ? delivered.includes(message.to.toLowerCase()) : !body?.code && !body?.error) sent++; else failed++;
      progress?.update?.(`正在发送 ${sent + failed} / ${messages.length}…`);
    }
    progress?.dismiss?.();
    if (failed) error(new Error(`已发送 ${messages.length} 封邮件中的 ${sent} 封。${failed} 封发送失败；请稍后重试或下载后发送。`));
    else toast(`已发送 ${sent} 封邮件`);
  }

  /* ---- Ribbon, menus and pane ---- */
  const mm = {
    state, setState, records, mapping, insertField: instruction => insertField(instruction), goToRecord, setPreview, refreshPreview,
    startMerge: (type, options) => startMerge(type, options).catch(fail), typeNewList: () => typeNewList().catch(fail), useExistingList: options => useExistingList(options), editRecipients: () => editRecipients().catch(fail),
    addressBlock: () => modules().then(() => openAddressBlock(mm)).catch(fail), greetingLine: () => modules().then(() => openGreetingLine(mm)).catch(fail),
    insertFieldDialog: () => modules().then(() => openInsertField(mm)).catch(fail), matchFields: () => openMatchFields(mm, () => { if (state().preview) refreshPreview(); }),
    updateLabels: () => updateLabels().catch(fail), findRecipient: () => openFindRecipient(mm), excludeCurrent,
    checkErrors: () => modules().then(() => openCheckErrors(mm)).catch(fail), errorReport: checkErrors, finish, refreshUi: () => refreshUi(), layoutChanged, focusDocument: focus,
  };
  const wizard = createWizard(mm);
  function refreshUi() { if (wizard.shown) wizard.refresh(); onChange(); }

  const typeItems = () => [
    ...DOCUMENT_TYPES.map(([id, label]) => ({ label: ['envelopes', 'mailingLabels'].includes(id) ? `${label}…` : label, checked: state().type === id, radio: true, disabled: !ready(), onSelect: () => mm.startMerge(id) })),
    { label: '普通文档', checked: !state().type, radio: true, disabled: !ready(), onSelect: () => mm.startMerge('normal') },
    { separator: true },
    { label: '邮件合并分步向导…', icon: 'mergeWizard', disabled: !ready(), onSelect: () => wizard.show() },
  ];
  const recipientItems = () => [
    { label: '键入新列表…', disabled: !ready(), onSelect: () => mm.typeNewList() },
    { label: '使用现有列表…', hint: 'CSV、TSV 或 Excel 工作簿', disabled: !ready(), onSelect: () => mm.useExistingList() },
    ...(P.canPickFiles() ? [{ label: '从本地存储选择…', disabled: !ready(), onSelect: () => mm.useExistingList({ cloud: true }) }] : []),
    ...(state().list ? [{ separator: true }, { label: '导出列表为 CSV', onSelect: async () => { const { listToCsv } = await import('../lib/recipient-files.js'); P.downloadBlob(new Blob([listToCsv(state().list)], { type: 'text/csv' }), 'Recipients.csv'); } },
      { label: '移除收件人列表', disabled: !ready(), onSelect: () => { if (state().preview) { setState({ preview: false }); refreshPreview(); } setState({ list: null, mapping: {}, source: null, activeRecord: 1 }); } }] : []),
  ];
  const fieldItems = () => {
    const columns = state().list?.columns || [];
    return [...columns.map(c => ({ label: c, disabled: !ready(), onSelect: () => insertField(mergeFieldInstruction(c)).catch(fail) })),
      ...(columns.length ? [{ separator: true }] : [{ label: '请先选择收件人以列出其字段', disabled: true }]),
      { label: '插入合并字段…', disabled: !ready(), onSelect: () => mm.insertFieldDialog() }];
  };
  const ruleItems = () => RULES.map(([id, label]) => ({ label, disabled: !ready(), onSelect: () => modules().then(() => openRule(id, mm)).catch(fail) }));
  const finishItems = () => [
    { label: '编辑单个文档…', disabled: !ready() || !records().length, onSelect: () => finish('document') },
    { label: '打印文档…', disabled: !ready() || !records().length, onSelect: () => finish('print') },
    { label: '发送电子邮件…', disabled: !ready() || !records().length, onSelect: () => finish('email') },
  ];

  function extraTabs(kit) {
    const { command, menuButton, rows, when } = kit;
    const noSteal = (...buttons) => { for (const b of buttons) b.addEventListener('mousedown', e => e.preventDefault()); };
    const has = () => !!ready();
    const hasList = () => !!ready() && !!state().list;
    const hasRecords = () => !!ready() && records().length > 0;
    const envelopesButton = command('信封', 'envelope', () => envelopes().catch(fail), { size: 'large', text: '信封' });
    const labelsButton = command('标签', 'labels', () => labels().catch(fail), { size: 'large', text: '标签' });
    const start = menuButton('开始邮件合并', 'startMerge', typeItems, { text: '开始邮件合并' });
    const select = menuButton('选择收件人', 'selectRecipients', recipientItems, { text: '选择收件人' });
    const edit = command('编辑收件人列表', 'editRecipients', () => mm.editRecipients(), { size: 'large', text: '编辑收件人列表' });
    const highlight = command('高亮合并字段', 'highlightFields', () => { highlighted = !highlighted; refreshHighlight(); onChange(); }, { size: 'large', text: '高亮合并字段', attrs: { 'aria-pressed': 'false' } });
    const address = command('地址块', 'addressBlock', () => mm.addressBlock(), { size: 'large', text: '地址块' });
    const greeting = command('问候语', 'greetingLine', () => mm.greetingLine(), { size: 'large', text: '问候语' });
    const insert = menuButton('插入合并字段', 'mergeField', fieldItems, { text: '插入合并字段' });
    const rules = menuButton('规则', 'rules', ruleItems, { size: 'small', text: '规则' });
    const match = command('匹配字段', 'matchFields', () => mm.matchFields(), { text: '匹配字段' });
    const update = command('更新标签', 'updateLabels', () => mm.updateLabels(), { text: '更新标签' });
    const preview = command('预览结果', 'previewResults', () => setPreview(!state().preview), { size: 'large', text: '预览结果', attrs: { 'aria-pressed': 'false' } });
    const first = command('第一条记录', 'firstRecord', () => goToRecord(1));
    const previous = command('上一条记录', 'previousRecord', () => goToRecord((state().activeRecord || 1) - 1));
    const next = command('下一条记录', 'nextRecord', () => goToRecord((state().activeRecord || 1) + 1));
    const last = command('最后一条记录', 'lastRecord', () => goToRecord(records().length));
    const record = el('input.canvas-spacing.ribbon-number.mm-record', { type: 'number', min: 1, 'aria-label': '转到记录', title: '转到记录', onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); goToRecord(Number(record.value)); focus(); } }, onchange: () => goToRecord(Number(record.value)) });
    const find = command('查找收件人', 'findRecipient', () => mm.findRecipient(), { text: '查找收件人' });
    const check = command('检查错误', 'checkErrors', () => mm.checkErrors(), { text: '检查错误' });
    const finishButton = menuButton('完成并合并', 'finishMerge', finishItems, { text: '完成并合并' });
    // Longer labels take two lines on a wider button.
    for (const b of [edit, highlight, insert]) b.classList.add('ribbon-wide');
    noSteal(envelopesButton, labelsButton, edit, highlight, address, greeting, match, update, preview, first, previous, next, last, find, check);
    for (const b of [envelopesButton, labelsButton, start, select, address, greeting, insert, rules]) when(b, has);
    when(edit, hasList); when(match, hasList); when(find, hasRecords); when(check, has);
    when(update, () => has() && state().type === 'mailingLabels');
    when(highlight, has, () => String(highlighted));
    when(preview, hasRecords, () => String(!!state().preview && hasRecords()));
    const at = () => Math.min(state().activeRecord || 1, records().length);
    when(first, () => hasRecords() && at() > 1); when(previous, () => hasRecords() && at() > 1);
    when(next, () => hasRecords() && at() < records().length); when(last, () => hasRecords() && at() < records().length);
    when(record, () => { if (document.activeElement !== record) record.value = hasRecords() ? String(at()) : ''; record.max = String(records().length || 1); return hasRecords(); });
    when(finishButton, hasRecords);
    const navigator = el('div.mm-ribbon-nav', { role: 'group', 'aria-label': '转到收件人' }, first, previous, record, next, last);
    return [{ id: 'mailings', label: '邮件', after: 'references', groups: [
      { id: 'mailCreate', label: '创建', icon: 'envelope', priority: 4, items: [envelopesButton, labelsButton] },
      { id: 'mailStart', label: '开始邮件合并', icon: 'startMerge', priority: 8, items: [start, select, edit] },
      { id: 'mailFields', label: '编写和插入字段', icon: 'mergeField', priority: 7, items: [highlight, address, greeting, insert, rows([rules], [match], [update])] },
      { id: 'mailPreview', label: '预览结果', icon: 'previewResults', priority: 6, items: [preview, rows([navigator], [find], [check])] },
      { id: 'mailFinish', label: '完成', icon: 'finishMerge', priority: 9, items: [finishButton] },
    ] }];
  }

  /** Menu bar items: the Tools menu carries envelopes, labels and the merge wizard. */
  function extendMenu(id) {
    if (id !== 'tools') return [];
    return [{ separator: true },
      { label: '信封…', icon: 'envelope', disabled: !ready(), onSelect: () => envelopes().catch(fail) },
      { label: '标签…', icon: 'labels', disabled: !ready(), onSelect: () => labels().catch(fail) },
      { label: '邮件合并…', icon: 'mergeWizard', disabled: !ready(), onSelect: () => wizard.show() }];
  }

  return {
    commands: { mailMergeWizard: () => wizard.show(), mailEnvelopes: () => envelopes().catch(fail), mailLabels: () => labels().catch(fail) },
    extraTabs, extendMenu, pane: el('div.mm-pane-host', {}, wizard.pane, fileInput), wizard,
    /** Called on every editor update: keeps highlighting in step with edits, and the preview with undo. */
    refresh() {
      if (highlighted || editor()?.tintLayers?.mergeFields?.length) refreshHighlight();
      // Previewing a record is not an undo step, so undo and redo bring back field results of the record shown
      // when the step was taken: show the current record's again.
      const engine = editor(), steps = engine?.session ? [engine.session, engine.session.history.length, engine.session.future.length] : null;
      const travelled = steps && seenSteps && steps[0] === seenSteps[0] && steps[2] !== seenSteps[2] && steps[1] !== seenSteps[1];
      seenSteps = steps;
      if (travelled && state().preview && loaded) queueMicrotask(() => refreshPreview());
    },
    mm,
  };
}
