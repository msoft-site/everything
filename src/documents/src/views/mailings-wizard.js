/**
 * The Step-by-Step Mail Merge pane: six steps from choosing the kind of document to finishing the
 * merge, each offering the commands for that step and a short explanation. It drives the same
 * Mailings controller (`mm`) as the ribbon.
 */
import { el } from '../ui/dom.js';
import { radios, button } from './mailings-ui.js';
import { DOCUMENT_TYPES } from '../engine/docx-mail-merge.js';

const STEPS = ['文档类型', '正在启动文档', '选择收件人', '编写文档', '预览', '完成合并'];

export function createWizard(mm) {
  let step = 0, shown = false;
  const title = el('h2', {}, '邮件合并');
  const progress = el('ol.mm-steps', { 'aria-label': '步骤' });
  const content = el('div.mm-step-body');
  const back = button('上一步', () => go(step - 1), 'btn-ghost');
  const next = button('下一步', () => go(step + 1), 'btn-primary');
  const pane = el('aside.mm-pane', { 'aria-label': '邮件合并', hidden: true },
    el('div.canvas-panel-heading', {}, title, el('button.icon-btn', { type: 'button', 'aria-label': '关闭邮件合并窗格', onclick: () => hide() }, '✕')),
    progress, content, el('div.mm-pane-foot', {}, back, next));
  pane.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); hide(); } });

  const section = (heading, ...children) => el('section.mm-step-section', {}, el('h3', {}, heading), ...children);
  const action = (label, run, attrs = {}) => button(label, run, 'btn-outline mm-step-action', attrs);
  const para = text => el('p.mm-step-text', {}, text);

  function body() {
    const state = mm.state(), records = mm.records(), type = state.type;
    const typeName = DOCUMENT_TYPES.find(t => t[0] === type)?.[1] || '信函';
    switch (step) {
      case 0: {
        const choice = radios('文档类型', DOCUMENT_TYPES.map(([id, label]) => [id, label, {
          formLetters: '个性化信函，每位收件人一份。', email: '每位收件人一封电子邮件。', envelopes: '带有收件人地址的信封。',
          mailingLabels: '地址标签，每页多个。', catalog: '列出所有收件人的单个文档，例如名录。' }[id]]), type || 'formLetters', value => mm.startMerge(value, { quiet: true }));
        return [section('选择文档类型', choice)];
      }
      case 1: return [section('正在启动文档',
        para(type === 'mailingLabels' ? '标签按表格排版，每个单元格对应一个标签。选择标签纸张以设置新的标签文档，或者如果此文档已经是标签表，则保留此文档。'
          : type === 'envelopes' ? '信封使用的页面大小与信封相同。选择尺寸以将此文档设置为信封。'
            : `此文档是 ${typeName} 模板。键入每位收件人共享的正文，然后添加可变信息的字段。`),
        type === 'mailingLabels' ? action('标签选项…', () => mm.startMerge('mailingLabels')) : null,
        type === 'envelopes' ? action('信封选项…', () => mm.startMerge('envelopes')) : null)];
      case 2: return [section('选择收件人',
        para(records.length ? `已选择 ${records.length} 位收件人${state.source?.name ? `（来自 ${state.source.name}）` : ''}。列表保存在此文档中。` : '键入新列表，或使用现有的电子表格或逗号分隔文件。'),
        state.external && !state.list ? para(`此文档曾链接到 ${state.external}，但无法在此打开。请选择其他列表使用。`) : null,
        action('键入新列表…', () => mm.typeNewList()),
        action('使用现有列表…', () => mm.useExistingList()),
        state.list ? action('编辑收件人列表…', () => mm.editRecipients()) : null)];
      case 3: return [section('编写文档',
        para(type === 'mailingLabels' ? '排版第一个标签，然后更新其他标签以与其匹配。' : '单击各个项目所属的位置，然后将其插入。'),
        action('地址块…', () => mm.addressBlock()), action('问候语…', () => mm.greetingLine()),
        action('插入合并字段…', () => mm.insertFieldDialog()), action('匹配字段…', () => mm.matchFields()),
        type === 'mailingLabels' ? action('更新所有标签', () => mm.updateLabels()) : null)];
      case 4: {
        const status = records.length ? `收件人 ${Math.min(state.activeRecord || 1, records.length)} / ${records.length}` : '未选择收件人';
        return [section('预览',
          para(records.length ? '字段显示该收件人的详细信息。移动到列表中以检查每一项。' : '请选择收件人以在此预览。'),
          el('div.mm-nav', {}, button('◀', () => mm.goToRecord((state.activeRecord || 1) - 1), 'btn-ghost', { 'aria-label': '上一位收件人', disabled: !records.length || (state.activeRecord || 1) <= 1 }),
            el('span.mm-nav-label', { role: 'status' }, status),
            button('▶', () => mm.goToRecord((state.activeRecord || 1) + 1), 'btn-ghost', { 'aria-label': '下一位收件人', disabled: !records.length || (state.activeRecord || 1) >= records.length })),
          action('查找收件人…', () => mm.findRecipient(), { disabled: !records.length }),
          action('排除此收件人', () => mm.excludeCurrent(), { disabled: !records.length }),
          action('编辑收件人列表…', () => mm.editRecipients(), { disabled: !state.list }))];
      }
      default: return [section('完成合并',
        para('合并到新文档以审阅或编辑每份副本、打印或通过电子邮件发送。'),
        action('编辑单个文档…', () => mm.finish('document'), { disabled: !records.length }),
        action('打印…', () => mm.finish('print'), { disabled: !records.length }),
        type === 'email' ? action('发送电子邮件…', () => mm.finish('email'), { disabled: !records.length }) : null,
        action('检查错误…', () => mm.checkErrors()))];
    }
  }
  function render() {
    if (!shown) return;
    progress.replaceChildren(...STEPS.map((name, i) => el('li', { class: i === step ? 'is-current' : i < step ? 'is-done' : '', 'aria-current': i === step ? 'step' : null },
      el('button', { type: 'button', onclick: () => go(i) }, el('span.mm-step-number', {}, String(i + 1)), el('span', {}, name)))));
    // A control is known by its text, or a radio button (which has none) by its group's label and its value.
    const keyOf = n => (n.type === 'radio' ? `radio:${n.closest('[role="radiogroup"]')?.getAttribute('aria-label')}:${n.value}` : n.getAttribute('aria-label') || n.closest('label')?.textContent || n.textContent);
    const focused = pane.contains(document.activeElement) ? keyOf(document.activeElement) : null;
    content.replaceChildren(el('p.mm-step-count', {}, `第 ${step + 1} 步，共 ${STEPS.length} 步`), ...body().flat().filter(Boolean));
    back.disabled = step === 0; next.textContent = step === STEPS.length - 1 ? '完成' : '下一步';
    if (focused) [...content.querySelectorAll('button, input, select')].find(n => keyOf(n) === focused)?.focus();
  }
  function go(to) {
    if (to >= STEPS.length) { hide(); return; }
    step = Math.max(0, to);
    if (step === 0 && !mm.state().type) mm.startMerge('formLetters', { quiet: true });
    if (step === 4 && mm.records().length && !mm.state().preview) mm.setPreview(true);
    render();
    content.querySelector('button, input')?.focus({ preventScroll: true });
  }
  function show() { shown = true; pane.hidden = false; if (!mm.state().type) mm.startMerge('formLetters', { quiet: true }); render(); content.querySelector('button, input')?.focus(); mm.layoutChanged?.(); }
  function hide() { shown = false; pane.hidden = true; mm.layoutChanged?.(); mm.focusDocument?.(); }
  return { pane, show, hide, toggle: () => (shown ? hide() : show()), refresh: render, get shown() { return shown; } };
}
