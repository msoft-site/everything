import { el } from '../ui/dom.js';
import { openPopover } from '../ui/popover.js';
import { loadFontFile } from '../engine/file-fonts.js';

export function fontFileControls({ onFontsAvailable, onLoaded = () => {}, status }) {
  const notice = status || el('p.field-hint', { role: 'status' });
  const input = el('input', { type: 'file', accept: '.ttf,.otf', multiple: true, hidden: true, 'aria-label': '字体文件' });
  const button = el('button.btn', { type: 'button', onclick: () => input.click() }, '加载字体文件…');
  input.addEventListener('change', async () => {
    const files = [...input.files]; input.value = '';
    if (!files.length) return;
    button.disabled = input.disabled = true;
    notice.textContent = '正在加载字体…';
    const loaded = [], errors = []; let changed = false;
    try {
      for (const file of files) {
        try { const result = await loadFontFile(file); loaded.push(result.family); changed ||= !result.duplicate; }
        catch (error) { errors.push(`${file.name}: ${error.message}`); }
      }
      if (changed) {
        try { await onFontsAvailable?.(); }
        catch { errors.push('字体已加载，但文档无法刷新。请重新打开文档后再试。'); }
      }
      notice.textContent = [loaded.length ? `在本次会话中可用：${[...new Set(loaded)].join('、')}。` : '', ...errors].filter(Boolean).join(' ');
      onLoaded();
    } finally { button.disabled = input.disabled = false; }
  });
  return el('div', {}, button, input, el('p.field-hint', {}, 'TTF 和 OTF 文件在当前浏览器会话中保留在本地设备上，不会添加到 DOCX 中。请根据需要加载常规、加粗和倾斜字体文件。'), status ? null : notice);
}

export function openFontFiles({ anchor, onFontsAvailable }) {
  return openPopover({ anchor, label: '文档字体', content: el('form', { onsubmit: e => e.preventDefault() }, fontFileControls({ onFontsAvailable })) });
}
