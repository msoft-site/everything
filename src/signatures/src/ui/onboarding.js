/**
 * First-run onboarding: one decision (set up, sample documents, or skip) and
 * one setting (the name signers see). Gated on an empty account; closing at
 * any point marks onboarding done.
 */

import { el, clear, append, fieldId } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { store } from '../lib/store.js';

export function shouldOnboard(store) {
  return !store.settings.onboarded && !store.settings.sampleData && store.listDocs().length === 0;
}

export function openOnboarding() {
  const body = el('div');

  const markDone = () => {
    if (!store.settings.onboarded) {
      store.updateSettings({ onboarded: true }).catch(() => {});
    }
  };
  const modal = openModal({ title: '欢迎使用', content: body, onClose: markDone });

  const skipBtn = () => el('button.btn.btn-ghost.btn-block', {
    type: 'button', style: { marginTop: '10px' },
    onclick: () => { markDone(); modal.close(); },
  }, '暂先跳过');

  /* Step 0: welcome */
  function renderWelcome() {
    clear(body);
    append(body, [
      el('div.empty', { style: { padding: '10px 8px 4px' } },
        el('div.empty-icon', {
          html: icon('signature', 30),
          style: { background: 'var(--accent-wash)', color: 'var(--accent-strong)' },
        }),
        el('h3', { style: { fontSize: '19px' } }, '高效完成文件签署'),
        el('p', {}, '上传 PDF 文件，放置签名表单域，并通过邮件发送私密签署链接。所有数据均安全保存在本地。')
      ),
      el('button.btn.btn-primary.btn-block', {
        type: 'button', style: { padding: '13px' },
        onclick: renderName,
      }, '设置我的账户'),
      el('button.btn.btn-ghost.btn-block', {
        type: 'button', style: { marginTop: '10px', border: '1px dashed var(--hairline-strong)' },
        html: icon('sparkle', 15, 2),
        onclick: useSampleData,
      }, ' 体验示例文件'),
      skipBtn(),
    ]);
  }

  async function useSampleData(e) {
    // currentTarget, not target: the button holds an icon, and a click that
    // lands on the icon reports the <svg>. Held in a local because
    // currentTarget is null once we await.
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      // Imported lazily: pdf-lib only loads when sample PDFs are generated.
      const { sampleDataset } = await import('../lib/sample.js');
      await store.importDataset(await sampleDataset(store));
    } catch (err) {
      console.error(err);
      toast('无法加载示例文件，请检查您的网络连接', { icon: 'wifiOff' });
      btn.disabled = false;
      return;
    }
    modal.close();
    toast('示例文件已加载，您随时可以在顶部提示横幅中清除它们', { icon: 'sparkle' });
  }

  /* Step 1: the name signers see */
  function renderName() {
    clear(body);
    const nameId = fieldId('fullname');
    const input = el('input.input', {
      id: nameId, type: 'text', autocomplete: 'name', maxLength: 80,
      value: store.settings.fullName || '',
      placeholder: '例如：张三',
    });
    append(body, [
      el('h3.onboard-h', {}, '签署方将看到您的姓名'),
      el('p.onboard-p', {}, '该姓名将显示在签署邮件通知及签名凭证中。您可以随时在“设置”中修改。'),
      el('div.field', {}, el('label', { for: nameId }, '您的全名'), input),
      el('button.btn.btn-primary.btn-block', {
        type: 'button', style: { padding: '13px' },
        onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          const fullName = input.value.trim();
          await store.updateSettings({ fullName, onboarded: true }).catch(() => {});
          modal.close();
          toast('设置完成！请上传 PDF 文件开始签署', { icon: 'check' });
        },
      }, '开始发起签署'),
      skipBtn(),
    ]);
    setTimeout(() => input.focus(), 50);
  }

  renderWelcome();
}
