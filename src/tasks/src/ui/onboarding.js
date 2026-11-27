/**
 * First-run onboarding: one decision (start fresh / sample data / skip).
 * Gated on an empty dataset; closing at any point marks onboarding done.
 */

import { el } from '../lib/dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { store } from '../lib/store.js';
import { sampleDataset } from '../lib/sample.js';
import { openTaskForm } from './taskform.js';

export function shouldOnboard(store) {
  return !store.settings.onboarded && !store.settings.sampleData && store.tasks.length === 0;
}

export function openOnboarding() {
  const markDone = () => {
    if (!store.settings.onboarded) store.updateSettings({ onboarded: true }).catch(() => {});
  };

  const body = el('div', {},
    el('div.empty', { style: { padding: '10px 8px 4px' } },
      el('div.empty-icon', {
        html: icon('checkBig', 30),
        style: { background: 'var(--accent-wash)', color: 'var(--accent)' },
      }),
      el('h3', { style: { fontSize: '19px' } }, '井然有序，从今天开始'),
      el('p', {}, '支持个人与共享清单、循环提醒、优先级管理和子任务。所有数据安全保存在本地存储中，隐私完全由您掌控。')
    ),
    el('button.btn.btn-primary.btn-block', {
      type: 'button', style: { padding: '13px' },
      onclick: () => {
        markDone();
        modal.close();
        openTaskForm({});
      },
    }, '创建我的第一条任务'),
    el('button.btn.btn-ghost.btn-block', {
      type: 'button', style: { marginTop: '10px', border: '1px dashed var(--hairline-strong)' },
      html: icon('sparkle', 15, 2),
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await store.importAll(sampleDataset());
        } catch (err) {
          console.error(err);
          if (!err.quota) {
            toast('无法加载示例数据，请检查网络连接', { icon: 'wifiOff' });
            btn.disabled = false;
            return;
          }
          modal.close();
          toast(err.message, { icon: 'cloud', duration: 5000 });
          return;
        }
        modal.close();
        toast('已加载示例数据', { icon: 'sparkle' });
      },
    }, ' 体验示例数据'),
    el('button.btn.btn-ghost.btn-block', {
      type: 'button', style: { marginTop: '10px' },
      onclick: () => { markDone(); modal.close(); },
    }, '暂时跳过')
  );

  const modal = openModal({ title: '欢迎使用待办事项', content: body, onClose: markDone });
}
