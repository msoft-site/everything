import { el, icon, iconButton, button, formatBytes } from './lib/ui.js';

/**
 * The Attachments panel: files carried inside the PDF, each with Save and Remove, and a
 * button to attach another file.
 */
export function createAttachmentsPanel({ onAdd, onSave, onRemove, canEdit }) {
  const list = el('ul', { class: 'attachment-list', 'aria-label': '附件列表' });
  const empty = el(
    'p',
    { class: 'panel-empty muted' },
    '此 PDF 未包含任何附件。可附加文件随文档一同保存。',
  );
  const addButton = button('附加文件…', 'Plus', () => onAdd(), 'btn panel-action');
  const root = el('div', { class: 'attachments-panel' }, addButton, empty, list);
  let generation = 0;
  return {
    el: root,
    count: 0,
    /** List the attachments PDF.js finds; resolves with their number. */
    async load(pdf, { isCurrent = () => true } = {}) {
      const token = ++generation;
      let entries = [];
      try {
        const found = await pdf.getAttachments();
        if (found) entries = found instanceof Map ? [...found] : Object.entries(found);
      } catch {
        entries = [];
      }
      if (token !== generation || !isCurrent()) return null;
      this.count = entries.length;
      empty.hidden = entries.length > 0;
      addButton.disabled = !canEdit();
      // The rows are drawn again after every change to the PDF. A row button with the focus
      // (Remove, just confirmed, above all) hands it to the same button of the same file, or
      // of the file now in its place, rather than dropping it on the page.
      const rows = () => [...list.children];
      const focusedRow = rows().findIndex((row) => row.contains(document.activeElement));
      const focusedKey = rows()[focusedRow]?.dataset.key;
      const focusedButton =
        focusedRow < 0
          ? -1
          : [...rows()[focusedRow].querySelectorAll('button')].indexOf(document.activeElement);
      list.replaceChildren(
        ...entries.map(([key, info]) =>
          el(
            'li',
            { class: 'attachment-row', 'data-key': key },
            el('span', { class: 'attachment-icon', 'aria-hidden': 'true' }, icon('FileText', 18)),
            el(
              'span',
              { class: 'attachment-text' },
              el(
                'span',
                { class: 'attachment-name', title: info.filename || key },
                info.filename || key,
              ),
              info.description && el('span', { class: 'attachment-meta muted' }, info.description),
            ),
            iconButton(`保存 ${info.filename || key}`, 'Download', () =>
              onSave(key, info.filename || key),
            ),
            iconButton(
              `删除 ${info.filename || key}`,
              'Trash2',
              () => onRemove(key, info.filename || key),
              {
                disabled: !canEdit(),
              },
            ),
          ),
        ),
      );
      if (focusedRow >= 0 && document.activeElement === document.body) {
        const row =
          rows().find((next) => next.dataset.key === focusedKey) ||
          rows()[Math.min(focusedRow, rows().length - 1)];
        const same = row?.querySelectorAll('button')[focusedButton];
        const target =
          (same && !same.disabled && same) ||
          row?.querySelector('button:not(:disabled)') ||
          (!addButton.disabled && addButton);
        target?.focus({ preventScroll: true });
      }
      return entries.length;
    },
  };
}

/**
 * The Layers panel: the PDF's optional content groups with a visibility switch each. The
 * switches change what is shown, not the file, as in desktop PDF readers.
 */
export function createLayersPanel({ onToggle }) {
  const tree = el('ul', { class: 'layer-list', role: 'list', 'aria-label': '图层' });
  const root = el(
    'div',
    { class: 'layers-panel' },
    el('p', { class: 'panel-note muted' }, '显示或隐藏图层仅改变视图效果。'),
    tree,
  );
  let config = null;
  function row(id, depth) {
    const group = config.getGroup(id);
    if (!group) return null;
    const input = el('input', {
      type: 'checkbox',
      'data-id': id,
      checked: group.visible !== false,
      onchange: () => onToggle(id, input.checked),
    });
    return el(
      'li',
      { class: 'layer-row', style: `--depth:${depth}` },
      el('label', {}, input, icon('Layers', 15), el('span', {}, group.name || '未命名图层')),
    );
  }
  function walk(order, depth = 0) {
    const rows = [];
    for (const entry of order || []) {
      if (typeof entry === 'string') rows.push(row(entry, depth));
      else if (entry && typeof entry === 'object') {
        if (entry.name)
          rows.push(el('li', { class: 'layer-heading', style: `--depth:${depth}` }, entry.name));
        rows.push(...walk(entry.order, depth + 1));
      }
    }
    return rows.filter(Boolean);
  }
  return {
    el: root,
    /**
     * Set the switches from the configuration again: switching on a layer of a radio button
     * set (RBGroups) switches the others in the set off.
     */
    sync() {
      for (const input of tree.querySelectorAll('input'))
        input.checked = config?.getGroup(input.dataset.id)?.visible !== false;
    },
    /** Show the layers of a configuration; resolves with whether there are any. */
    show(next) {
      // The list is drawn again after every change to the PDF (an Undo pressed on a switch,
      // say); the focused switch is drawn again with the focus.
      const focusedId = tree.contains(document.activeElement)
        ? document.activeElement.dataset.id
        : null;
      config = next;
      const groups = config ? [...config] : [];
      if (!groups.length) {
        tree.replaceChildren();
        return false;
      }
      const order = config.getOrder?.();
      const rows = order?.length ? walk(order) : groups.map(([id]) => row(id, 0));
      tree.replaceChildren(...rows);
      if (focusedId != null && document.activeElement === document.body)
        [...tree.querySelectorAll('input')]
          .find((input) => input.dataset.id === focusedId)
          ?.focus({ preventScroll: true });
      return true;
    },
  };
}

export { formatBytes };
