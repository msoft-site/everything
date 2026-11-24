/**
 * Hyphenation: automatic, manual and none, with the document's hyphenation options.
 * Every change goes through the editor's transactions, so undo, saving and read-only rules apply.
 *
 * - Automatic hyphenation is a document setting (w:autoHyphenation); layout splits words at line
 *   ends without changing the text. The options set the zone, the consecutive-line limit and
 *   whether words in capitals are hyphenated.
 * - Manual hyphenation walks the words automatic hyphenation would split, and stores each break
 *   the user accepts as a soft hyphen in the text: one undo step per accepted hyphen.
 * - A paragraph can opt out (w:suppressAutoHyphens) from the context menu.
 */
import { el, isComposing } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { recallUnit } from '../lib/units.js';
import { paragraphFormat } from '../engine/model.js';
import { setHyphenationSettings } from '../engine/hyphenation-settings.js';
import '../styles/hyphenation.css';

const TWIPS = { in: 1440, cm: 1440 / 2.54 };

export function createHyphenation({ editor, pkg, error, onChange = () => {}, commands: base = {} }) {
  const ready = () => { const engine = editor(); return engine && !pkg()?.readOnly ? engine : null; };
  const settings = () => editor()?.model.pageSettings || null;
  let modal = null;

  function apply(patch) {
    const engine = ready(); if (!engine) return false;
    engine.finishComposition();
    const ok = engine.execute(() => setHyphenationSettings(engine.model, patch));
    engine.focus();
    return ok;
  }

  /** Whether the selected paragraphs opt out of automatic hyphenation: true, false or null when mixed. */
  function suppressed() {
    const model = editor()?.model; if (!model) return false;
    const values = model.selectedParagraphs.map(p => !!paragraphFormat(p, model.numbering).suppressAutoHyphens);
    return values.every(v => v === values[0]) ? values[0] ?? false : null;
  }
  function toggleSuppressed() {
    const engine = ready(); if (!engine) return;
    engine.finishComposition();
    engine.setParagraphFormat({ suppressAutoHyphens: suppressed() !== true });
  }

  function options() {
    const engine = ready(); if (!engine) return;
    engine.finishComposition();
    modal?.close();
    const current = settings(), unit = recallUnit();
    const unitLabel = unit === 'cm' ? '厘米' : '英寸';
    const automatic = el('input', { type: 'checkbox', checked: current.autoHyphenation });
    const caps = el('input', { type: 'checkbox', checked: !current.doNotHyphenateCaps });
    const zone = el('input.input', { type: 'number', min: 0, max: unit === 'cm' ? 55.88 : 22, step: unit === 'cm' ? 0.01 : 0.01, required: true,
      value: String(+(current.hyphenationZone / TWIPS[unit]).toFixed(2)), 'aria-label': `断字区 (${unitLabel})` });
    const limit = el('input.input', { type: 'number', min: 0, max: 32767, step: 1, placeholder: '无限制', value: current.consecutiveHyphenLimit ? String(current.consecutiveHyphenLimit) : '', 'aria-label': '连续连字符限制' });
    const message = el('p.field-error', { role: 'alert', hidden: true });
    const content = el('form.ed-dialog-body.ed-hyphenation', { onsubmit: e => {
      e.preventDefault();
      for (const input of [zone, limit]) if (!input.checkValidity()) { input.reportValidity(); return; }
      const patch = { autoHyphenation: automatic.checked, doNotHyphenateCaps: !caps.checked,
        hyphenationZone: Math.round(Number(zone.value) * TWIPS[unit]), consecutiveHyphenLimit: limit.value === '' ? 0 : Number(limit.value) };
      const engine = ready(); if (!engine) return;
      let failure = null;
      engine.execute(() => setHyphenationSettings(engine.model, patch), e => { failure = e; }, undefined, true);
      if (failure) { message.textContent = failure.message; message.hidden = false; return; }
      modal.close(); editor()?.focus();
    } },
    el('label.ed-check', {}, automatic, '自动断字'),
    el('label.ed-check', {}, caps, '大写字母单词断字'),
    el('label.field', {}, el('span.field-label', {}, `断字区 (${unitLabel})`), zone,
      el('span.field-hint', {}, '仅当将单词移至下一行会在页边留下超出此间距的空间时，才对单词进行断字。')),
    el('label.field', {}, el('span.field-label', {}, '连续连字符限制'), limit,
      el('span.field-hint', {}, '留空或设为 0 表示无限制。')),
    message,
    el('div.row.row-end', {},
      el('button.btn.btn-ghost', { type: 'button', onclick: () => { modal.close(); manual(); } }, '人工…'),
      el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'),
      el('button.btn.btn-primary', { type: 'submit' }, '确定')));
    modal = openModal({ title: '断字', content, onClose: () => { modal = null; queueMicrotask(() => editor()?.focus()); } });
    automatic.focus();
  }

  /** Walk the words automatic hyphenation would split and insert the breaks the user accepts. */
  async function manual() {
    const engine = ready(); if (!engine) return;
    engine.finishComposition();
    modal?.close();
    let candidates;
    try { candidates = await import('../engine/manual-hyphenation.js'); } catch (e) { error(e); return; }
    if (editor() !== engine) return;
    // Manual hyphenation works on the body text, not a header, footer or note being edited.
    if (engine.session.path !== null) { try { engine.editStory(null); } catch (e) { error(e); return; } }
    const [selectionStart] = engine.model.range;
    let from = 0, candidate = null, chosen = 0, accepted = 0;
    const word = el('div.ed-hyphen-word', { role: 'radiogroup', 'aria-label': '断字位置' });
    const status = el('p.field-hint', { 'aria-live': 'polite' });
    const yes = el('button.btn.btn-primary', { type: 'button', onclick: () => step(true) }, '是');
    const no = el('button.btn.btn-ghost', { type: 'button', onclick: () => step(false) }, '否');
    const cancel = el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消');
    const render = () => {
      if (!candidate) {
        word.replaceChildren();
        status.textContent = accepted ? `断字完成。已添加 ${accepted} 个连字符。` : '断字完成。没有需要断字的单词。';
        yes.hidden = no.hidden = true; cancel.textContent = '关闭'; cancel.focus();
        return;
      }
      const parts = []; let at = 0;
      for (const point of candidate.points) {
        parts.push(el('span.ed-hyphen-part', {}, candidate.text.slice(at, point)));
        const option = el('button.ed-hyphen-point', { type: 'button', role: 'radio', 'aria-checked': String(point === chosen), title: `在“${candidate.text.slice(0, point)}”后断字`,
          'aria-label': `${candidate.text.slice(0, point)}-${candidate.text.slice(point)}`, tabIndex: point === chosen ? 0 : -1,
          onclick: () => { chosen = point; render(); word.querySelector('[aria-checked="true"]')?.focus(); },
          onkeydown: e => {
            if (isComposing(e) || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            e.preventDefault();
            const index = candidate.points.indexOf(chosen) + (e.key === 'ArrowRight' ? 1 : -1);
            if (candidate.points[index]) { chosen = candidate.points[index]; render(); word.querySelector('[aria-checked="true"]')?.focus(); }
          } }, '-');
        parts.push(option); at = point;
      }
      parts.push(el('span.ed-hyphen-part', {}, candidate.text.slice(at)));
      word.replaceChildren(...parts);
      status.textContent = '选择单词断字位置，然后单击“是”添加连字符或单击“否”跳过该单词。';
      yes.hidden = no.hidden = false;
    };
    const next = () => {
      const current = editor();
      if (current !== engine || pkg()?.readOnly) { candidate = null; return; }
      try { candidate = candidates.nextHyphenationCandidate(engine, from); } catch (e) { error(e); candidate = null; }
      if (candidate) {
        chosen = candidate.proposed;
        engine.model.select(candidate.start, candidate.end); engine.syncInput?.(); engine.revealCaret?.(); engine.paint?.(); onChange();
      }
    };
    const step = accept => {
      if (!candidate) return;
      if (accept) {
        const at = candidate.start + chosen;
        const ok = engine.execute(() => { engine.model.select(at, at); return engine.model.replace('­'); });
        if (ok) { accepted++; from = candidate.end + 1; } else from = candidate.end;
      } else from = candidate.end;
      next(); render();
      if (candidate) yes.focus();
    };
    modal = openModal({ title: '人工断字', content: el('div.ed-dialog-body.ed-hyphenation-manual', {},
      el('p.field-label', {}, '断字位置:'), word, status, el('div.row.row-end', {}, cancel, no, yes)),
      onClose: () => {
        modal = null;
        const current = editor();
        if (current === engine && !accepted && candidate) { current.model.select(selectionStart); current.syncInput?.(); onChange(); }
        queueMicrotask(() => editor()?.focus());
      } });
    next(); render();
    (candidate ? yes : cancel).focus();
  }

  const commands = {
    /** Layout ▸ Hyphenation menu items. */
    hyphenationItems() {
      const current = settings(), disabled = !ready();
      return [
        { label: '无', radio: true, checked: !!current && !current.autoHyphenation, disabled, onSelect: () => apply({ autoHyphenation: false }) },
        { label: '自动', radio: true, checked: !!current?.autoHyphenation, disabled, onSelect: () => apply({ autoHyphenation: true }) },
        { label: '人工…', disabled, onSelect: () => manual() },
        { separator: true },
        { label: '断字选项…', icon: 'hyphenation', disabled, onSelect: () => options() },
      ];
    },
    hyphenationOptions: options,
    manualHyphenation: manual,
    hyphenationActive: () => !!settings()?.autoHyphenation,
    setAutoHyphenation: on => apply({ autoHyphenation: !!on }),
    toggleParagraphHyphenation: toggleSuppressed,
  };
  /**
   * The Layout tab's Page Setup group shows the Hyphenation button (layout-tab.js sets
   * `pageSetupHasHyphenation`). Until it does, a small group of its own keeps the command reachable.
   */
  function extendTab(tabId, { menuButton, when }) {
    if (tabId !== 'layout' || base.pageSetupHasHyphenation) return [];
    const button = menuButton('断字', 'hyphenation', () => commands.hyphenationItems(), { size: 'small', text: '断字' });
    when(button, () => !!ready());
    return [{ id: 'hyphenation', label: '断字', icon: 'hyphenation', priority: 4, after: 'pageSetup', items: [button] }];
  }
  /** Tools ▸ Hyphenation… */
  function extendMenu(menuId) {
    if (menuId !== 'tools') return [];
    return [{ label: '断字…', icon: 'hyphenation', disabled: !ready(), onSelect: () => options() }];
  }
  /** Do Not Hyphenate for the selected paragraphs. */
  function contextMenuItems(context) {
    if (context !== 'text' || !ready() || editor()?.model.selectedImage) return [];
    const value = suppressed();
    return [{ label: '取消断字', checked: value === true, onSelect: toggleSuppressed }];
  }
  return { commands, extendTab, extendMenu, contextMenuItems, destroy() { modal?.close(); } };
}
