/**
 * Check Accessibility: a pane listing issues by severity with Go To and quick fixes, and a summary
 * for the status bar. Fixes are ordinary edits, one undo step each.
 */
import { el } from '../ui/dom.js';
import { promptDialog } from '../ui/modal.js';
import { checkAccessibility, summarize, RULES } from '../lib/accessibility.js';
import { sidePane, button, hint, preference, reveal } from './review-ui.js';

const KEEP_RUNNING = preference('documents:accessibility-live', true);
const SEVERITY = { error: '错误', warning: '警告', tip: '提示' };
const FIX_LABEL = { altText: '添加说明…', headerRow: '将首行设为标题行', autoColor: '使用自动颜色', clearHighlight: '清除突出显示', removeEmpty: '删除空段落', collapseBlanks: '替换为单个空格', deleteRow: '删除行' };

export function createAccessibilityPane({ editor, pkg, error, onState = () => {} }) {
  // The body last checked and its edit count then: a package reopened in place (a design change) has a new body,
  // whose count starts again.
  let issues = [], checkedBody = null, checkedRevision = -1, timer = null;
  const checked = body => body === checkedBody && body.revision === checkedRevision;
  // Quick fixes are edits: none is offered where the document cannot change (a preview, Viewing mode).
  let fixesShown = null;
  const canFix = () => { const engine = editor(); return !!engine && !pkg()?.readOnly && !engine.readOnly && !engine.viewOnly; };
  const pane = sidePane({ title: '辅助功能', label: '辅助功能窗格', className: 'rv-accessibility-pane', onOpen: () => run(true), onClose: () => editor()?.focus() });
  const summaryLine = el('p.rv-status', { role: 'status' });
  const list = el('div.rv-groups');
  const live = el('input', { type: 'checkbox', checked: KEEP_RUNNING.get(), onchange: () => { KEEP_RUNNING.set(live.checked); schedule(); onState(); } });
  pane.body.append(summaryLine, list, el('label.rv-check', {}, live, '在工作时保持检查'), hint('检查文档正文中的图片、表格、标题、颜色对比度、超链接及间距。'));

  const headingLevel = p => { const level = p.format?.outlineLevel; return Number.isInteger(level) && level < 9 ? level + 1 : null; };
  function run(force = false) {
    const engine = editor(); if (!engine) return issues;
    const body = engine.session.body;
    if (!force && checked(body)) return issues;
    checkedBody = body; checkedRevision = body.revision;
    issues = checkAccessibility({ paragraphs: body.paragraphs, tables: body.tables, pageSettings: body.pageSettings }, { headingLevel });
    if (pane.isOpen) render();
    onState();
    return issues;
  }
  function render() {
    fixesShown = canFix();
    const counts = summarize(issues);
    summaryLine.textContent = issues.length ? `${counts.errors} 处错误 · ${counts.warnings} 处警告 · ${counts.tips} 处提示` : '未发现辅助功能问题。残障人士应能顺利阅读本文档。';
    list.replaceChildren(...Object.entries(SEVERITY).map(([severity, title]) => {
      const own = issues.filter(i => i.severity === severity);
      if (!own.length) return null;
      const byRule = new Map();
      for (const issue of own) { if (!byRule.has(issue.rule)) byRule.set(issue.rule, []); byRule.get(issue.rule).push(issue); }
      return el('section.rv-section', {}, el('h3.rv-section-title', {}, `${title} (${own.length})`),
        ...[...byRule].map(([rule, items]) => el('details.rv-rule', { open: items.length <= 6 },
          el('summary', {}, `${RULES[rule].title} (${items.length})`),
          el('p.rv-why', {}, RULES[rule].why),
          ...items.map(issue => el('div.rv-item.rv-issue', { dataset: { rule } },
            el('button.rv-issue-target', { type: 'button', onclick: () => reveal(editor(), issue.start, issue.end) }, issue.detail),
            issue.fix && fixesShown ? button(FIX_LABEL[issue.fix.kind] || '修复', () => fix(issue)) : null)))));
    }).filter(Boolean));
  }
  function schedule() {
    clearTimeout(timer);
    if (pane.isOpen || KEEP_RUNNING.get()) timer = setTimeout(() => run(), 600);
  }

  /**
   * The issue as the document stands now. The list can predate the latest edits (it is rechecked a
   * moment after typing), so its offsets may be stale: check again and take the same issue nearest
   * to where it was. null when it is gone.
   */
  function current(issue) {
    const engine = editor(); if (!engine) return null;
    if (checked(engine.session.body)) return issue;
    run(true);
    return issues.filter(i => i.rule === issue.rule && i.fix?.kind === issue.fix.kind && i.detail === issue.detail)
      .reduce((best, i) => !best || Math.abs(i.start - issue.start) < Math.abs(best.start - issue.start) ? i : best, null);
  }
  async function fix(found) {
    const engine = editor(); if (!engine || !canFix()) return;
    const { kind } = found.fix;
    engine.finishComposition();
    if (engine.session.path !== null) engine.editStory(null);
    let issue = current(found);
    if (!issue) { engine.focus(); return; }
    const at = (start, end = start) => engine.model.select(start, end);
    const tableCell = cellId => { const index = engine.model.paragraphs.findIndex(p => p.cellId === cellId); let offset = 0; for (let i = 0; i < index; i++) offset += engine.model.paragraphs[i].runs.reduce((n, r) => n + r.text.length, 0) + 1; return offset; };
    try {
      if (kind === 'altText') {
        const text = await promptDialog({ title: '图片说明', label: '说明', multiline: true, confirmLabel: '应用', hint: '用一两句话描述图片展示的内容及其重要性。' });
        if (!text || editor() !== engine || !(issue = current(issue))) return;
        engine.execute(() => { at(issue.start, issue.end); engine.model.setImageProperties({ alt: text }); });
      } else if (kind === 'headerRow') engine.execute(() => { at(tableCell(issue.fix.cellId)); engine.model.setTableHeaderRows(1); });
      else if (kind === 'deleteRow') engine.execute(() => { at(tableCell(issue.fix.cellId)); engine.model.deleteTablePart('row'); });
      else if (kind === 'autoColor') engine.execute(() => { at(issue.start, issue.end); engine.model.setRunFormat({ color: 'auto' }); });
      else if (kind === 'clearHighlight') engine.execute(() => { at(issue.start, issue.end); engine.model.setRunFormat({ highlight: 'none', shading: 'auto' }); });
      else if (kind === 'collapseBlanks') engine.execute(() => { const blank = engine.model.text.slice(issue.start, issue.end); at(issue.start, issue.end); engine.model.replace(blank[0] === '\t' ? '\t' : ' '); });
      else if (kind === 'removeEmpty') engine.execute(() => {
        // Keep one blank paragraph's worth of space by removing all but the first.
        const ids = new Set(issue.fix.paragraphs.slice(1));
        for (let i = engine.model.paragraphs.length - 1; i >= 0; i--) {
          if (!ids.has(engine.model.paragraphs[i].id)) continue;
          let offset = 0; for (let k = 0; k < i; k++) offset += engine.model.paragraphs[k].runs.reduce((n, r) => n + r.text.length, 0) + 1;
          at(offset - 1, offset);
          engine.model.replace('');
        }
      });
    } catch (e) { error(e); }
    engine.focus();
    run(true);
  }

  return {
    pane,
    open() { pane.open(); run(true); },
    changed() { schedule(); },
    /**
     * For the status bar: { errors, warnings, tips, label, checking } or null while not checked. Until this
     * document is first checked (a moment after it opens) it reports no result: `checking` is true.
     */
    summary() {
      if (!KEEP_RUNNING.get() && !pane.isOpen) return null;
      const engine = editor(); if (!engine) return null;
      const body = engine.session.body;
      if (!checked(body)) schedule();
      // Switched to or from Viewing mode with the pane open: its quick fixes follow.
      if (pane.isOpen && fixesShown !== null && canFix() !== fixesShown) render();
      if (body !== checkedBody) return { errors: 0, warnings: 0, tips: 0, label: '辅助功能: 正在检查…', checking: true, open: () => this.open() };
      const counts = summarize(issues);
      const label = !issues.length ? '辅助功能: 一切就绪' : counts.errors ? `辅助功能: 有 ${counts.errors} 处错误待修复` : '辅助功能: 建议查看';
      return { ...counts, label, open: () => this.open() };
    },
    get issues() { return run(); },
    destroy() { clearTimeout(timer); pane.destroy(); },
  };
}
