import { el, fieldId } from '../ui/dom.js';
import { TAB_LEADERS } from '../engine/tab-leaders.js';
import { normalizeTabStops, sameValue } from '../engine/paragraph-geometry.js';
import { field, group, distance, openFormatDialog, UNITS } from './format-dialog-kit.js';

export const TAB_KINDS = [['left', '左对齐'], ['center', '居中'], ['right', '右对齐'], ['decimal', '小数点对齐'], ['bar', '竖线对齐']];
const LEADERS = Object.entries(TAB_LEADERS).filter(([value]) => value !== 'heavy');

/**
 * The Tabs dialog: the selection's custom stops in a list, the default stop interval, and Set, Clear and
 * Clear All. Stops apply to every selected paragraph in one undo step; the default interval is a
 * document setting (w:defaultTabStop). Positions are measured from the text margin.
 */
export function openTabsDialog({ tabs: initial, defaultTabStop, unit = 'in', apply, onClose }) {
  const u = UNITS[unit] || UNITS.in;
  let stops = (initial || []).map(t => ({ ...t, leader: t.leader || 'none' }));
  const cleared = [];
  let changed = false;
  const format = twips => `${Number((twips / u.twips).toFixed(u.digits))} ${u.label}`;
  const position = el('input.input', { type: 'text', inputMode: 'decimal', 'aria-label': `制表位位置 (${u.label})`, autocomplete: 'off', placeholder: `例如 1.5` });
  const list = el('div.fmt-listbox', { role: 'listbox', 'aria-label': '制表位', tabindex: 0 });
  const interval = distance('默认制表位', defaultTabStop, { unit, min: 1 / 1440, required: true });
  const name = fieldId('fmt-tab-kind'), leaderName = fieldId('fmt-tab-leader');
  const radios = (groupName, choices, value) => choices.map(([v, label]) => el('label.ed-check', {}, el('input', { type: 'radio', name: groupName, value: v, checked: v === value }), label));
  const kinds = radios(name, TAB_KINDS, 'left'), leaders = radios(leaderName, LEADERS, 'none');
  const chosen = nodes => nodes.map(n => n.firstChild).find(r => r.checked)?.value;
  const choose = (nodes, value) => { for (const n of nodes) n.firstChild.checked = n.firstChild.value === value; };
  const clearedNote = el('p.field-hint', { 'aria-live': 'polite' });
  const mixedNote = el('p.field-hint', { hidden: initial !== null }, '所选内容各段落的制表位不同。设置或清除制表位将应用于所选的每个段落。');

  // A typed unit counts ("2.54 cm" in an inch dialog is one inch); without one, the dialog's unit applies.
  const UNIT_TWIPS = { in: 1440, '″': 1440, '"': 1440, cm: 1440 / 2.54, mm: 144 / 2.54, pt: 20 };
  const readPosition = () => {
    const typed = /\s*(in|cm|mm|pt|″|")$/i.exec(position.value.trim());
    const raw = position.value.trim().slice(0, typed ? -typed[0].length : undefined).replace(',', '.');
    const number = Number(raw);
    if (!raw || !Number.isFinite(number)) throw new Error('请输入制表位位置。');
    const twips = Math.round(number * (typed ? UNIT_TWIPS[typed[1].toLowerCase()] : u.twips));
    if (Math.abs(twips) > 31680) throw new Error('制表位位置必须在边距 22 英寸以内。');
    return twips;
  };
  function render(selected = null) {
    list.replaceChildren(...stops.map((stop, i) => {
      const item = el('div.fmt-listbox-item', { role: 'option', id: fieldId('fmt-tab-stop'), 'aria-selected': String(stop.position === selected), dataset: { index: i },
        onclick: () => pick(i) }, format(stop.position), el('span.fmt-listbox-meta', {}, `${TAB_KINDS.find(([k]) => k === stop.alignment)?.[1] || stop.alignment}${stop.leader && stop.leader !== 'none' ? ` · ${TAB_LEADERS[stop.leader]}` : ''}`));
      return item;
    }));
    if (!stops.length) list.append(el('div.fmt-listbox-empty', {}, '无自定义制表位'));
    const active = list.querySelector('[aria-selected="true"]');
    if (active) list.setAttribute('aria-activedescendant', active.id); else list.removeAttribute('aria-activedescendant');
    clearedNote.textContent = cleared.length ? `待清除的制表位: ${cleared.map(format).join(', ')}` : '';
  }
  function pick(i) {
    const stop = stops[i]; if (!stop) return;
    position.value = String(Number((stop.position / u.twips).toFixed(u.digits)));
    choose(kinds, stop.alignment); choose(leaders, stop.leader || 'none');
    render(stop.position);
  }
  list.addEventListener('keydown', e => {
    const current = Number(list.querySelector('[aria-selected="true"]')?.dataset.index ?? -1);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); pick(Math.max(0, Math.min(stops.length - 1, (current < 0 ? -1 : current) + (e.key === 'ArrowDown' ? 1 : -1)))); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clear(); }
  });
  function set() {
    const at = readPosition();
    const stop = { position: at, alignment: chosen(kinds), leader: chosen(leaders) };
    const next = [...stops.filter(s => s.position !== at), stop];
    normalizeTabStops(next.map(s => ({ ...s, leader: s.leader === 'none' ? undefined : s.leader })));
    stops = next.sort((a, b) => a.position - b.position);
    const index = cleared.indexOf(at); if (index >= 0) cleared.splice(index, 1);
    changed = true; render(at); position.focus(); position.select();
  }
  function clear() {
    let at; try { at = readPosition(); } catch { return; }
    if (!stops.some(s => s.position === at)) { modal.fail(`在 ${format(at)} 处没有制表位。`); return; }
    stops = stops.filter(s => s.position !== at); cleared.push(at); changed = true;
    if (stops[0]) pick(0); else { position.value = ''; render(); }
  }
  const setButton = el('button.btn.btn-outline', { type: 'button', onclick: () => { try { set(); modal.form.querySelector('.field-error').hidden = true; } catch (e) { modal.fail(e.message); } } }, '设置');
  const clearButton = el('button.btn.btn-outline', { type: 'button', onclick: clear }, '清除');
  const clearAll = el('button.btn.btn-outline', { type: 'button', onclick: () => { cleared.push(...stops.map(s => s.position)); stops = []; changed = true; render(); } }, '全部清除');
  // Enter sets the stop typed in the field; with the field empty there is nothing to set, and Enter is OK.
  position.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && position.value.trim()) { e.preventDefault(); setButton.click(); } });
  render();
  if (stops[0]) pick(0);

  const body = el('div.fmt-tabs-layout', {},
    el('div.fmt-tabs-stops', {}, field(`制表位位置 (${u.label})`, position), list, mixedNote),
    el('div.fmt-tabs-options', {},
      field(`默认制表位 (${u.label})`, interval),
      group('对齐方式', el('div.fmt-radios', { role: 'radiogroup', 'aria-label': '对齐方式' }, ...kinds)),
      group('前导符', el('div.fmt-radios', { role: 'radiogroup', 'aria-label': '前导符' }, ...leaders)),
      el('div.row', {}, setButton, clearButton, clearAll)),
  );
  const modal = openFormatDialog({ title: '制表位', className: 'fmt-tabs-dialog', onClose, body: [body, clearedNote],
    submit: () => {
      // Pending text in the position field is set, as the dialog's OK does on desktop word processors.
      if (position.value.trim() && !stops.some(s => { try { return s.position === readPosition(); } catch { return false; } })) set();
      const tabs = changed ? normalizeTabStops(stops.map(s => ({ position: s.position, alignment: s.alignment, ...(s.leader !== 'none' ? { leader: s.leader } : {}), ...(s.numberingOnly ? { numberingOnly: true } : {}) }))) : undefined;
      const interval_ = interval.read();
      if (!interval_ || interval_ < 1) throw new Error('请输入大于零的默认制表位间距。');
      if (tabs === undefined && interval_ === defaultTabStop) return true;
      if (tabs !== undefined && sameValue(tabs, initial) && interval_ === defaultTabStop) return true;
      return apply(tabs, interval_);
    } });
  position.focus();
  return modal;
}
