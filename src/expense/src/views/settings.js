import { el, clear, append, field } from '../ui/dom.js';
import { icon, CATEGORY_ICON_CHOICES } from '../ui/icons.js';
import { store } from '../lib/store.js';
import { applyTheme, currentTheme } from '../ui/theme.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { CURRENCIES } from '../lib/currencies.js';
import { DEFAULT_OCR_MODEL } from '../lib/ocr.js';
import { exportJSONFile } from '../lib/export.js';
import { catDot, catColor } from '../ui/common.js';
import { wipeSampleData } from '../lib/sample.js';
import { openOnboarding } from '../ui/onboarding.js';
import { openCapture } from '../ui/capture.js';

/** Inside the Puter desktop the host owns the session, so no sign-out is offered. */
export function canSignOut(sdk = globalThis.puter) {
  return sdk?.env !== 'app';
}

export async function confirmSignOut() {
  const ok = await confirmDialog({ title: '确认退出登录？', message: '您的数据已保存在本地独立存储中，可随时重新登录。', confirmLabel: '退出登录', danger: false });
  if (!ok) return;
  try { puter.auth.signOut(); } catch { /* ignore */ }
  location.reload();
}

export function settingsView() {
  const root = el('section.view', { 'aria-labelledby': 'set-title' });
  root.append(el('div.page-head', {}, el('div', {}, el('h1.page-title', { id: 'set-title' }, '系统设置'))));
  const content = el('div');
  root.append(content);

  function render() {
    clear(content);
    const s = store.settings;

    /* Appearance */
    const theme = currentTheme();
    const themeSeg = el('div.segmented.block', { role: 'radiogroup', 'aria-label': '外观主题' },
      [['system', '跟随系统', 'monitor'], ['light', '明亮', 'sun'], ['dark', '暗黑', 'moon']].map(([v, label, ic]) =>
        el('button', { type: 'button', role: 'radio', 'aria-checked': theme === v, html: icon(ic, 15, 2), onclick: () => { applyTheme(v); store.updateSettings({ theme: v }).catch(() => {}); render(); } }, label)));

    content.append(
      el('h2.section-title', {}, '外观风格'),
      el('div.settings-list', {}, el('div.settings-row', {}, el('div.grow', {}, el('div.title', {}, '主题风格'), el('div.sub', {}, '系统默认自动跟随当前设备模式')), themeSeg)),

      el('h2.section-title', {}, '费用报销管理'),
      el('div.settings-list', {},
        el('div.settings-row', {},
          el('div.grow', {}, el('div.title', {}, '本位币种'), el('div.sub', {}, '汇总统计与财务报表均以此币种核算')),
          el('div.select-wrap', {}, el('select.select', { 'aria-label': '本位币种', style: { width: 'auto' }, onchange: (e) => store.updateSettings({ baseCurrency: e.target.value }).then(() => toast('币种已更新')).catch(() => toast('无法保存设置', { icon: 'wifiOff' })) },
            CURRENCIES.map((c) => el('option', { value: c.code, selected: c.code === s.baseCurrency }, `${c.code} (${c.name})`))))),
        el('button.settings-row.clickable', { type: 'button', onclick: openCategories },
          el('span', { html: icon('layers', 20, 1.8) }),
          el('div.grow', {}, el('div.title', {}, '支出分类管理'), el('div.sub', {}, `当前共 ${store.categories.length} 个支出分类`)),
          el('span', { html: icon('chevR', 18), style: { color: 'var(--ink-3)' } }))),

      el('h2.section-title', {}, 'AI 智能票据识别'),
      el('div.settings-list', {},
        el('div.settings-row', {},
          el('div.grow', {}, el('div.title', {}, '自动识别发票与收据'), el('div.sub', {}, '上传票据凭证时自动执行 OCR 识别。关闭后需手动录入字段。')),
          switchEl(s.autoOcr, (v) => store.updateSettings({ autoOcr: v }).then(render))),
        el('div.settings-row', {},
          el('div.grow', {}, el('div.title', {}, '视觉识别模型'), el('div.sub', {}, '内置多模态视觉模型，留空则默认使用系统推荐模型')),
          el('input.input', { type: 'text', value: s.ocrModel === DEFAULT_OCR_MODEL ? '' : s.ocrModel, placeholder: DEFAULT_OCR_MODEL, 'aria-label': '视觉识别模型', style: { maxWidth: '220px' },
            onchange: (e) => store.updateSettings({ ocrModel: e.target.value.trim() || DEFAULT_OCR_MODEL }).then(() => toast('模型设置已保存')).catch(() => toast('无法保存设置', { icon: 'wifiOff' })) }))),

      el('h2.section-title', {}, '数据备份与迁移'),
      el('div.settings-list', {},
        el('button.settings-row.clickable', { type: 'button', onclick: async () => {
          try { exportJSONFile(await store.exportAll()); } catch (err) { console.error(err); toast('导出失败', { icon: 'wifiOff' }); }
        } }, el('span', { html: icon('fileDown', 20, 1.8) }), el('div.grow', {}, el('div.title', {}, '导出备份数据'), el('div.sub', {}, '导出全部支出记录与报表配置（JSON 格式）'))),
        el('button.settings-row.clickable', { type: 'button', onclick: importBackup }, el('span', { html: icon('fileUp', 20, 1.8) }), el('div.grow', {}, el('div.title', {}, '从备份恢复数据'), el('div.sub', {}, '使用先前备份的 JSON 文件替换当前数据'))),
        s.sampleData
          ? el('button.settings-row.clickable', { type: 'button', onclick: async () => {
            const ok = await confirmDialog({ title: '清空演示数据？', message: '将移除所有演示费用记录，开始记录您的真实业务支出。', confirmLabel: '清空演示数据' });
            if (!ok) return;
            try { await wipeSampleData(store); location.hash = '#/'; openOnboarding({ onCapture: () => openCapture() }); } catch (err) { console.error(err); toast('清空失败', { icon: 'wifiOff' }); }
          } }, el('span', { html: icon('sparkle', 20, 1.8) }), el('div.grow', {}, el('div.title', {}, '清空示例演示数据'), el('div.sub', {}, '开启全新空白工作环境')))
          : el('button.settings-row.clickable', { type: 'button', onclick: async () => {
            const ok = await confirmDialog({ title: '确认清除所有数据？', message: '应用中的全部支出明细、凭证与报表将被永久删除，不可恢复。', confirmLabel: '全部清除' });
            if (!ok) return;
            try { await store.wipeAll({ keepSettings: { onboarded: true } }); toast('所有数据已清除', { icon: 'trash' }); location.hash = '#/'; } catch (err) { console.error(err); toast('清除失败', { icon: 'wifiOff' }); }
          } }, el('span', { html: icon('trash', 20, 1.8), style: { color: 'var(--critical)' } }), el('div.grow', {}, el('div.title', { style: { color: 'var(--critical)' } }, '清空所有数据'), el('div.sub', {}, '此操作无法撤销，请谨慎执行')))),

      el('h2.section-title', {}, '当前账户'),
      el('div.settings-list', {},
        el('div.settings-row', {}, el('span.user-avatar', { 'aria-hidden': 'true' }, (store.user?.username || '管').charAt(0).toUpperCase()),
          el('div.grow', {}, el('div.title', {}, store.user?.username || '本地管理员'), el('div.sub', {}, store.user?.email || '已连接本地运行环境')),
          canSignOut() && el('button.btn.btn-outline.btn-sm', { type: 'button', html: icon('logout', 14, 2.2), onclick: confirmSignOut }, '退出登录'))),

      el('p.small.muted', { style: { textAlign: 'center', margin: '8px 0 24px' } }, '费用报销所有数据均存储在本地隔离空间中，100% 独立安全运作。')
    );
  }

  function switchEl(on, onChange) {
    const btn = el('button.switch', { type: 'button', role: 'switch', 'aria-checked': String(!!on), onclick: () => { const next = btn.getAttribute('aria-checked') !== 'true'; btn.setAttribute('aria-checked', String(next)); onChange(next).catch(() => toast('无法保存设置', { icon: 'wifiOff' })); } });
    return btn;
  }

  function importBackup() {
    const input = el('input', { type: 'file', accept: 'application/json,.json', className: 'visually-hidden' });
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      let data;
      try { data = JSON.parse(await f.text()); } catch { toast('该文件不是有效的备份文件', { icon: 'warn' }); return; }
      if (data?.app !== 'expenses') { toast('该备份文件与费用报销应用不匹配', { icon: 'warn' }); return; }
      const ok = await confirmDialog({ title: '确认恢复此备份？', message: '当前所有支出记录、报表与对账单将被覆盖。', confirmLabel: '确认恢复', danger: false });
      if (!ok) return;
      try { await store.importAll(data); toast('备份已成功恢复'); location.hash = '#/'; } catch (err) { console.error(err); toast('恢复失败', { icon: 'wifiOff' }); }
    };
    document.body.append(input);
    input.click();
    setTimeout(() => input.remove(), 60000);
  }

  function openCategories() {
    const list = el('div.list');
    const draw = () => {
      clear(list);
      append(list, store.categories.map((c) => el('div.list-row.static', {},
        catDot(c),
        el('div.grow', {}, el('div.title', {}, c.name)),
        el('button.icon-btn', { type: 'button', html: icon('pencil', 17, 2), 'aria-label': `编辑 ${c.name}`, onclick: () => openCategoryForm(c, draw) }),
        el('button.icon-btn.danger', { type: 'button', html: icon('trash', 17, 2), 'aria-label': `删除 ${c.name}`, onclick: async () => {
          if (store.categories.length <= 1) { toast('请至少保留一个支出分类', { icon: 'info' }); return; }
          const ok = await confirmDialog({ title: `删除分类 “${c.name}”？`, message: '此分类下的支出记录将转为未分类状态。', confirmLabel: '删除分类' });
          if (!ok) return;
          try { await store.deleteCategory(c.id); draw(); render(); } catch (err) { console.error(err); toast('无法删除分类', { icon: 'wifiOff' }); }
        } }))));
    };
    draw();
    openModal({ title: '支出分类管理', content: el('div', {}, list, el('div.row.end', {}, el('button.btn.btn-primary', { type: 'button', html: icon('plus', 15, 2.2), onclick: () => openCategoryForm(null, () => { draw(); render(); }) }, '新建分类'))) });
  }

  function openCategoryForm(cat, done) {
    let iconName = cat?.icon || 'tag';
    let slot = cat?.slot || ((store.categories.length % 8) + 1);
    const name = el('input.input', { type: 'text', value: cat?.name || '', placeholder: '分类名称（如：餐饮、交通）', maxlength: 40, required: true });
    const iconGrid = el('div.icon-grid', { role: 'radiogroup', 'aria-label': '分类图标' });
    const colorRow = el('div.swatches', { role: 'radiogroup', 'aria-label': '标签颜色' });
    const drawPickers = () => {
      clear(iconGrid); clear(colorRow);
      append(iconGrid, CATEGORY_ICON_CHOICES.map((n) => el('button.icon-pick', { type: 'button', role: 'radio', 'aria-checked': n === iconName, 'aria-label': n, html: icon(n, 18, 1.9), onclick: () => { iconName = n; drawPickers(); } })));
      append(colorRow, Array.from({ length: 8 }, (_, i) => i + 1).map((n) => el('button.swatch', { type: 'button', role: 'radio', 'aria-checked': n === slot, 'aria-label': `颜色 ${n}`, style: { background: catColor({ slot: n }) }, onclick: () => { slot = n; drawPickers(); } })));
    };
    drawPickers();
    const form = el('form', { onsubmit: async (e) => {
      e.preventDefault();
      if (!name.value.trim()) { name.focus(); return; }
      try {
        if (cat) await store.updateCategory(cat.id, { name: name.value.trim(), icon: iconName, slot });
        else await store.addCategory({ name: name.value.trim(), icon: iconName, slot });
        modal.close(); done?.(); toast(cat ? '分类已更新' : '分类已添加');
      } catch (err) { console.error(err); toast('无法保存分类', { icon: 'wifiOff' }); }
    } },
      field('分类名称', name),
      el('div.field', {}, el('span.field-label', {}, '选择图标'), iconGrid),
      el('div.field', {}, el('span.field-label', {}, '选择颜色'), colorRow),
      el('div.row.end', {}, el('button.btn.btn-ghost', { type: 'button', onclick: () => modal.close() }, '取消'), el('button.btn.btn-primary', { type: 'submit' }, cat ? '保存修改' : '立即添加')));
    const modal = openModal({ title: cat ? '编辑分类' : '新建分类', content: form });
  }

  const onChange = () => render();
  store.addEventListener('change', onChange);
  root.destroy = () => store.removeEventListener('change', onChange);
  render();
  return root;
}
