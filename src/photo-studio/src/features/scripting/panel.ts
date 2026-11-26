// The Scripts panel: installed scripts with their File → Scripts toggle,
// shortcut, run and edit buttons, and the output of recent runs.
import './scripting.css';
import type { Editor } from '../../editor';
import { escapeXML } from '../../model/assets';
import { svg } from '../../app/icons';
import { formatShortcut } from '../../app/shortcuts';
import { listScripts, scriptSelection, updateScript } from './store';
import { clearScriptLog, onScriptLog, scriptLog } from './run';
import { openScriptEditor } from './code-editor';
import { keepFocus } from '../../ui/keep-focus';

export function mount(e: Editor, el: HTMLElement) {
  el.classList.add('scripts-panel');
  el.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest('[data-clear-log]')) return clearScriptLog();
    const row = t.closest<HTMLElement>('[data-script]');
    if (!row) return;
    const id = row.dataset.script!;
    scriptSelection.id = id;
    // Run Script works for every installed script; File → Scripts lists only those turned on.
    if (t.closest('[data-run]')) void e.runCommand('scripts.run-selected');
    else if (t.closest('[data-edit]')) openScriptEditor(e, id);
    // Each row's name is a button: a script chosen from the keyboard keeps the focus.
    keepFocus(el, () => update(e, el));
  });
  el.addEventListener('dblclick', (ev) => {
    const row = (ev.target as HTMLElement).closest<HTMLElement>('[data-script]');
    const t = ev.target as HTMLElement;
    if (row && (!t.closest('button,input') || t.closest('[data-script-select]'))) openScriptEditor(e, row.dataset.script!);
  });
  el.addEventListener('change', (ev) => {
    const box = (ev.target as HTMLElement).closest<HTMLInputElement>('[data-enable]');
    if (box) void updateScript(box.dataset.enable!, { enabled: box.checked });
  });
  // Output arrives while the panel is open (drawn once per frame). The dock
  // mounts the panel once and takes it out of the page while its drawer is
  // closed: output written meanwhile is drawn when it shows again (update).
  let frame = 0;
  onScriptLog(() => {
    if (!el.isConnected) return;
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      renderLog(el);
    });
  });
}

// The log entries each panel last drew (count and newest line).
const drawn = new WeakMap<HTMLElement, [number, object | undefined]>();
function renderLog(el: HTMLElement, force = false) {
  const log = el.querySelector<HTMLElement>('.scripts-log-lines');
  if (!log) return;
  const was = drawn.get(el);
  if (!force && was && was[0] === scriptLog.length && was[1] === scriptLog.at(-1)) return;
  drawn.set(el, [scriptLog.length, scriptLog.at(-1)]);
  const lines = scriptLog.slice(-60);
  log.innerHTML = lines.length
    ? lines.map((l) => `<div class="log-${l.level}"><span class="muted">${escapeXML(l.script)}:</span> ${escapeXML(l.text)}</div>`).join('')
    : '<div class="muted">脚本输出与错误信息将在此处显示。</div>';
  log.scrollTop = log.scrollHeight;
}

// Edits refresh visible panels; the list only changes with the scripts.
const shown = new WeakMap<HTMLElement, string>();
export function update(e: Editor, el: HTMLElement) {
  const scripts = listScripts();
  const key = JSON.stringify([scriptSelection.id, scripts.map((s) => [s.id, s.name, s.description, s.enabled, s.shortcut])]);
  if (shown.get(el) === key && el.querySelector('.scripts-list')) return renderLog(el);
  shown.set(el, key);
  void e;
  const rows = scripts
    .map(
      (s) => `<div class="script-row ${s.id === scriptSelection.id ? 'selected' : ''} ${s.enabled ? '' : 'off'}" data-script="${s.id}" role="listitem" title="${escapeXML(s.description || s.name)}">
        <input type="checkbox" data-enable="${s.id}" ${s.enabled ? 'checked' : ''} aria-label="在“文件 → 脚本”中列出 ${escapeXML(s.name)}" title="在“文件 → 脚本”中列出（附带快捷键）并提供给脚本事件">
        <button type="button" class="script-text" data-script-select="${s.id}" aria-pressed="${s.id === scriptSelection.id}"><span class="script-title">${escapeXML(s.name)}</span>${s.description ? `<small>${escapeXML(s.description)}</small>` : ''}</button>
        ${s.shortcut ? `<kbd>${escapeXML(formatShortcut(s.shortcut))}</kbd>` : ''}
        <button class="icon-button" data-run aria-label="运行 ${escapeXML(s.name)}" title="运行">${svg('play', 13)}</button>
        <button class="icon-button" data-edit aria-label="编辑 ${escapeXML(s.name)}" title="编辑脚本">${svg('pen-line', 13)}</button>
      </div>`,
    )
    .join('');
  el.innerHTML = `<div class="scripts-list" role="list" aria-label="已安装的脚本">${rows || '<p class="scripts-empty muted">未安装任何脚本。您可以新建脚本，或从 .js 文件导入安装。</p>'}</div>
    <div class="scripts-log"><div class="scripts-log-head"><span>输出</span><button class="icon-button" data-clear-log aria-label="清空输出" title="清空输出">${svg('trash-2', 12)}</button></div><div class="scripts-log-lines" aria-live="polite"></div></div>
    <div class="layer-footer"><button data-command="scripts.run-selected" aria-label="运行所选脚本" title="运行所选脚本" ${scriptSelection.id ? '' : 'disabled'}>${svg('play', 14)}</button><button data-command="scripts.new" aria-label="新建脚本" title="编写新脚本">${svg('plus', 14)}</button><button data-command="scripts.install" aria-label="从文件安装脚本" title="从 .js 文件安装脚本">${svg('upload', 14)}</button><button data-command="file.script-events" aria-label="脚本事件" title="事件脚本管理器（在特定事件触发脚本或操作）">${svg('zap', 14)}</button><button data-command="scripts.delete" aria-label="删除脚本" title="删除所选脚本" ${scriptSelection.id ? '' : 'disabled'}>${svg('trash-2', 14)}</button></div>`;
  renderLog(el, true);
}
