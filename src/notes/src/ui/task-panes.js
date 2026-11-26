import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { formatDay } from '../lib/dates.js';
import { TAG_BY_ID, tagLabel, setTagDoneInHtml, extractTags } from '../data/tags.js';
import { pageText } from '../data/store.js';
import { insertHtml } from '../editor/format.js';
import { blockOf, blocksInRange, editableRoot, textOffset } from '../editor/selection.js';
import { textToHtml } from '../editor/page-editor.js';
import { openDialog, confirmDialog } from './dialog.js';
import { toast } from './toast.js';
import { ASSIST_ACTIONS } from './assist.js';

/**
 * The task pane on the right of the page: Tags Summary, Page Versions and
 * Assist share one slot, so only one is open at a time.
 */
export class TaskPanes {
  constructor(app) {
    this.app = app;
    this.kind = null;
    this.title = h('h2.side-title');
    this.body = h('div.side-body');
    this.el = h('aside.task-pane', { hidden: true, 'aria-labelledby': 'task-pane-title' },
      h('div.side-head', Object.assign(this.title, { id: 'task-pane-title' }), h('button.icon-btn', { type: 'button', 'aria-label': '关闭窗格', onclick: () => this.toggle(this.kind) }, icon('x', 16))),
      this.body,
    );
    this.tagOptions = { scope: 'notebook', group: 'tag', openOnly: false };
  }

  toggle(kind) {
    if (this.kind === kind) {
      this.kind = null;
      this.el.hidden = true;
      this.app.taskPaneKind = null;
      this.app.editor.restoreRange();
      this.app.ribbon.refresh();
      return;
    }
    this.kind = kind;
    this.app.taskPaneKind = kind;
    this.el.hidden = false;
    this.render();
    this.app.ribbon.refresh();
    setTimeout(() => this.el.querySelector('button:not(.icon-btn), select, textarea, input')?.focus(), 0);
  }

  pageChanged() {
    if (this.kind === 'versions' || this.kind === 'assist') this.render();
  }

  render() {
    if (this.kind === 'tags') this.renderTags();
    else if (this.kind === 'versions') this.renderVersions();
    else if (this.kind === 'assist') this.renderAssist();
  }

  // ------------------------------------------------------------ Tags Summary

  scopeValue() {
    const { state } = this.app;
    const s = this.tagOptions.scope;
    if (s === 'page') return state.pageId ? `page:${state.pageId}` : 'all';
    if (s === 'section') return state.sectionId ? `section:${state.sectionId}` : 'all';
    if (s === 'notebook') return state.notebookId ? `notebook:${state.notebookId}` : 'all';
    return 'all';
  }

  async renderTags() {
    this.title.textContent = '标记汇总';
    const o = this.tagOptions;
    const select = (label, key, options) => {
      const sel = h('select.select', { 'aria-label': label }, options.map(([v, l]) => h('option', { value: v, selected: o[key] === v }, l)));
      sel.addEventListener('change', () => {
        o[key] = sel.value;
        this.renderTags();
      });
      return h('label.field', h('span.field-label', label), sel);
    };
    const openOnly = h('input', { type: 'checkbox', checked: o.openOnly });
    openOnly.addEventListener('change', () => {
      o.openOnly = openOnly.checked;
      this.renderTags();
    });
    const list = h('div', { 'aria-busy': 'true' }, h('div.empty-state', h('div.spinner')));
    this.body.replaceChildren(
      h('div', { style: { padding: '0 14px' } },
        select('标记分组依据', 'group', [['tag', '标记名称'], ['section', '分区'], ['title', '页面标题'], ['date', '日期'], ['text', '笔记文本']]),
        select('搜索范围', 'scope', [['page', '当前页面'], ['section', '当前分区'], ['notebook', '当前笔记本'], ['all', '所有笔记本']]),
        h('label.check-row', openOnly, '仅显示未勾选项'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '8px 0 12px' } },
          h('button.btn.small', { type: 'button', onclick: () => this.renderTags() }, icon('sync', 14), '刷新结果'),
          h('button.btn.small', { type: 'button', onclick: () => this.summaryPage() }, icon('newPage', 14), '创建汇总页面'),
        ),
      ),
      list,
    );
    this.app.editor.flush();
    // A slower earlier search (another scope or filter) must not win.
    const token = (this.tagsToken = {});
    let items = await this.app.store.collectTags(this.scopeValue());
    if (token !== this.tagsToken) return;
    if (o.openOnly) items = items.filter((t) => TAG_BY_ID.get(t.tag)?.kind === 'check' && !t.done);
    this.lastTags = items;
    list.removeAttribute('aria-busy');
    if (!items.length) {
      list.replaceChildren(h('div.empty-state', icon('findTags', 28), h('p', '未找到带标记的笔记。')));
      return;
    }
    const keyOf = {
      tag: (t) => tagLabel(t.tag),
      section: (t) => t.section.name,
      title: (t) => t.meta.title || '无标题页面',
      date: (t) => formatDay(t.meta.modified || t.meta.created),
      text: (t) => (t.text[0] || '#').toUpperCase(),
    }[o.group];
    const groups = new Map();
    for (const t of items) {
      const k = keyOf(t);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    const nodes = [];
    // Days go newest first; their labels ("Today", "Friday", "Sep 30") say
    // nothing about their order. Everything else is alphabetical.
    const newest = (group) => Math.max(...group.map((t) => Date.parse(t.meta.modified || t.meta.created) || 0));
    const order = o.group === 'date' ? (a, b) => newest(b[1]) - newest(a[1]) : (a, b) => a[0].localeCompare(b[0]);
    for (const [k, group] of [...groups].sort(order)) {
      nodes.push(h('div.group-label', { role: 'presentation' }, `${k} (${group.length})`));
      for (const t of group) nodes.push(this.tagItem(t));
    }
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', '带标记的笔记');
    list.replaceChildren(...nodes);
  }

  tagItem(t) {
    const def = TAG_BY_ID.get(t.tag);
    const glyph = h('span.tag-glyph', { style: { '--tag-color': def?.color, '--tag-icon': `var(--tagicon-${t.tag})` } });
    const row = h('div.result', { role: 'listitem', style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } });
    if (def?.kind === 'check') {
      const box = h('input', { type: 'checkbox', checked: t.done, 'aria-label': `将“${t.text}”标记为${t.done ? '未完成' : '已完成'}`, style: { marginTop: '2px', accentColor: 'var(--accent)' } });
      box.addEventListener('change', async () => {
        if ((await this.setDone(t, box.checked)) === false) box.checked = !box.checked;
      });
      row.append(box);
    } else row.append(glyph);
    const open = h('button.link-btn', { type: 'button', style: { fontWeight: '400', color: 'var(--text)', textAlign: 'left', flex: '1', textDecoration: t.done ? 'line-through' : 'none' } },
      h('div', t.text || '(空)'),
      h('div.result-path', `${t.meta.title || '无标题页面'} · ${t.section.name}`),
    );
    open.addEventListener('click', () => this.app.openPage(t.meta.id, { find: t.text.slice(0, 60) }));
    row.append(open);
    return row;
  }

  async setDone(t, done) {
    let page;
    try {
      page = await this.app.store.loadPage(t.meta.id);
    } catch {
      // Its section locked, or the page is gone, since the list was made.
      toast("当前无法打开该笔记。请刷新结果后重试。");
      return false;
    }
    if (this.app.state.pageId === page.id) this.app.editor.flush();
    const outline = page.outlines.find((o) => o.id === t.outlineId);
    // The note may have changed since the list was made: find the listed
    // tag again rather than trusting its old position.
    const now = outline ? extractTags([outline]) : [];
    const same = (c) => c.tag === t.tag && c.text === t.text;
    const index = now[t.index] && same(now[t.index]) ? t.index : now.findIndex(same);
    if (index < 0) {
      toast('该笔记已更改。请刷新结果后重试。');
      return false;
    }
    outline.html = setTagDoneInHtml(outline.html, index, done);
    this.app.store.pageChanged(page);
    if (this.app.state.pageId === page.id) await this.app.editor.render();
    t.done = done;
  }

  summaryPage() {
    const items = this.lastTags || [];
    if (!items.length) {
      toast('没有带标记的笔记可汇总。');
      return;
    }
    const groups = new Map();
    for (const t of items) {
      const k = tagLabel(t.tag);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    let html = '';
    for (const [k, list] of groups) {
      html += `<h2>${escape(k)}</h2>`;
      for (const t of list) {
        const done = TAG_BY_ID.get(t.tag)?.kind === 'check' ? ` data-done="${t.done}"` : '';
        html += `<p><span class="nt-tag" data-tag="${t.tag}"${done} contenteditable="false"></span>${escape(t.text)} (<a href="#page=${t.meta.id}">${escape(t.meta.title || '无标题页面')}</a>)</p>`;
      }
    }
    this.app.newPage({ title: '标记汇总', outlines: [{ id: 'o-summary', x: 48, y: 140, w: 640, html }] });
  }

  // ------------------------------------------------------------ Page Versions

  async renderVersions() {
    this.title.textContent = '页面版本';
    const pageId = this.app.state.pageId;
    if (!pageId) {
      this.body.replaceChildren(h('div.empty-state', h('p', '打开页面以查看其历史版本。')));
      return;
    }
    this.body.replaceChildren(h('div.empty-state', h('div.spinner')));
    const versions = await this.app.store.versions(pageId);
    if (pageId !== this.app.state.pageId) return;
    if (!versions.length) {
      this.body.replaceChildren(h('div.empty-state', icon('history', 28), h('p', '暂无早期版本。隔一段时间重新编辑页面时会自动保留版本。')));
      return;
    }
    this.body.replaceChildren(
      h('p.field-hint', { style: { padding: '0 14px 8px' } }, '此页面的早期历史版本。恢复版本也会将当前版本保留为一个版本。'),
      ...versions.map((v) => {
        const when = new Date(v.at);
        const preview = h('button.btn.small', { type: 'button', onclick: () => this.previewVersion(v) }, '预览');
        const restore = h('button.btn.small', { type: 'button', onclick: async () => {
          if (!(await confirmDialog({ title: '恢复此版本？', message: `页面将还原至 ${when.toLocaleString()} 的状态。`, okLabel: '恢复' }))) return;
          let restored;
          try {
            restored = await this.app.store.restoreVersion(pageId, v.at);
          } catch (err) {
            console.error(err);
            toast("无法恢复此版本。请检查网络后重试。", { kind: 'error' });
            return;
          }
          toast(restored ? '版本已恢复' : '该版本已不可用。', { kind: restored ? 'info' : 'error' });
          this.renderVersions();
        } }, '恢复');
        return h('div.result', { style: { display: 'grid', gap: '6px' } },
          h('div.result-title', when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })),
          h('div.result-snippet', pageText(v.page).slice(0, 140) || '(空页面)'),
          h('div', { style: { display: 'flex', gap: '6px' } }, preview, restore),
        );
      }),
    );
  }

  previewVersion(v) {
    openDialog({
      title: `来自于 ${new Date(v.at).toLocaleString()} 的版本`,
      width: 640,
      body: h('div', { style: { whiteSpace: 'pre-wrap', lineHeight: '1.5', maxHeight: '60vh', overflow: 'auto' } }, pageText(v.page) || '(空页面)'),
      actions: [{ label: '关闭', primary: true }],
    });
  }

  // ------------------------------------------------------------ Assist

  renderAssist() {
    this.title.textContent = 'AI 助手';
    const app = this.app;
    const output = h('div', { style: { whiteSpace: 'pre-wrap', lineHeight: '1.5', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: '6px', background: 'var(--bg-input)', minHeight: '80px' }, 'aria-live': 'polite' });
    const outputActions = h('div', { style: { display: 'flex', gap: '6px', margin: '8px 0' }, hidden: true });
    let result = '';
    let lastSelection = null;
    let latest = null;
    const run = async (prompt, label) => {
      // Only the newest request's answer is shown: a slower, earlier one
      // must not replace it (Insert would then put that answer where the
      // newer request's selection was).
      const request = (latest = {});
      output.replaceChildren(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-3)' } }, h('div.spinner'), `${label}...`));
      outputActions.hidden = true;
      try {
        const answer = (await app.ai.ask(prompt)).trim();
        if (request !== latest) return;
        result = answer;
        output.textContent = result || '无回答。';
        // Rewrite and proofread replace the text they were given.
        insert.replaceChildren(icon('plus', 14), lastSelection ? '替换所选内容' : '插入到页面');
        outputActions.hidden = !result;
      } catch (err) {
        if (request !== latest) return;
        output.textContent = `助手无法回答：${err?.message || err?.error?.message || '请求失败'}`;
      }
    };
    const pageTextNow = () => {
      app.editor.flush();
      return app.editor.page ? pageText(app.editor.page).slice(0, 12000) : '';
    };
    const buttons = ASSIST_ACTIONS.map((a) => h('button.btn', { type: 'button', style: { justifyContent: 'flex-start' }, onclick: () => {
      let text;
      if (a.needsSelection) {
        app.editor.restoreRange();
        text = window.getSelection()?.toString();
        if (!text) {
          toast('请先在页面上选择文本。');
          return;
        }
        lastSelection = app.editor.lastRange?.cloneRange();
      } else {
        text = pageTextNow();
        lastSelection = null;
        if (!text.trim()) {
          toast('当前页面暂无文本内容。');
          return;
        }
      }
      run(a.prompt(text), a.label);
    } }, icon('sparkles', 14), a.label));
    const ask = h('textarea.input', { rows: 3, placeholder: '针对此页面提问', 'aria-label': '针对此页面提问' });
    const askBtn = h('button.btn.primary', { type: 'button', onclick: () => {
      const q = ask.value.trim();
      if (!q) return;
      lastSelection = null;
      run(`Answer the question in Chinese using these notes. Reply in plain text.\n\nNotes:\n${pageTextNow()}\n\nQuestion: ${q}`, '正在思考');
    } }, '提问');
    const insert = h('button.btn.small', { type: 'button', onclick: () => {
      if (!result) return;
      if (lastSelection && lastSelection.commonAncestorContainer.isConnected) {
        app.editor.lastRange = withoutNextParagraph(lastSelection);
        app.editor.restoreRange();
        insertHtml(textToHtml(result));
      } else {
        const html = result.split('\n').filter(Boolean).map((l) => `<p>${escape(l)}</p>`).join('');
        const el = app.editor.createOutlineAt(48, app.editor.nextFreeY(), '');
        el.querySelector('.outline-body').innerHTML = html;
      }
      app.editor.markActiveDirty();
      toast('已添加到页面');
    } }, icon('plus', 14), '插入到页面');
    const copy = h('button.btn.small', { type: 'button', onclick: () => navigator.clipboard?.writeText(result).then(() => toast('已复制')) }, icon('copy', 14), '复制');
    outputActions.append(insert, copy);
    this.body.replaceChildren(h('div', { style: { padding: '0 14px 16px', display: 'grid', gap: '8px' } },
      h('p.field-hint', 'AI 助手使用本地 AI 引擎。请核实回答内容后再做参考。'),
      ...buttons,
      h('div.field', { style: { marginTop: '8px' } }, ask, askBtn),
      output,
      outputActions,
    ));
  }
}

/**
 * A triple-clicked paragraph is selected up to the start of the next one;
 * replacing that range would merge the next paragraph into the new text.
 * Ends the range at the end of the last paragraph it really covers.
 */
function withoutNextParagraph(selection) {
  const range = selection.cloneRange();
  const root = editableRoot(range.commonAncestorContainer);
  const end = root && blockOf(range.endContainer, root);
  if (!end || end === blockOf(range.startContainer, root) || textOffset(end, range.endContainer, range.endOffset) > 0) return range;
  const last = blocksInRange(range, root).filter((b) => b !== end && !b.contains(end)).at(-1);
  if (last) range.setEnd(last, last.childNodes.length);
  return range;
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
