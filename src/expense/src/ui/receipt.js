/** Receipt files: cached object URLs and a viewer sheet. */

import { el } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';
import { store } from '../lib/store.js';
import { downloadBlob } from '../lib/export.js';

const urls = new Map();
const pending = new Map();

export function isPdf(exp) {
  return /pdf$/i.test(exp?.receiptMime || '') || /\.pdf$/i.test(exp?.receiptPath || '');
}

/** Object URL for an expense's receipt, or null when it has none or fails to load. */
export async function receiptURL(exp) {
  const path = exp?.receiptPath;
  if (!path) return null;
  if (urls.has(path)) return urls.get(path);
  if (pending.has(path)) return pending.get(path);
  const p = (async () => {
    try {
      const raw = await store.readReceipt(path);
      const blob = raw.type ? raw : new Blob([raw], { type: exp.receiptMime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      urls.set(path, url);
      return url;
    } catch {
      return null;
    } finally {
      pending.delete(path);
    }
  })();
  pending.set(path, p);
  return p;
}

export function invalidateReceipt(path) {
  const url = urls.get(path);
  if (url) URL.revokeObjectURL(url);
  urls.delete(path);
}

/** Show a local file before it is uploaded (capture preview). */
export function previewURL(file) {
  return URL.createObjectURL(file);
}

export function openReceiptViewer(exp) {
  const body = el('div.receipt-viewer', {},
    el('div.receipt-loading', { html: icon('spinner', 22, 2), className: 'receipt-loading spin-wrap' }, el('span', {}, '正在加载票据…'))
  );
  const download = el('button.icon-btn', {
    type: 'button', html: icon('download', 19, 2), 'aria-label': '下载票据', title: '下载',
    onclick: async () => {
      const blob = await store.readReceipt(exp.receiptPath).catch(() => null);
      if (blob) downloadBlob(blob, exp.receiptName || `receipt-${exp.id}`);
    },
  });
  const modal = openModal({ title: exp.merchant || '票据', content: body, wide: true, headerActions: download });

  receiptURL(exp).then((url) => {
    body.replaceChildren();
    if (!url) {
      body.append(el('div.empty', {},
        el('div.empty-icon', { html: icon('imageOff', 26) }),
        el('h3', {}, '无法加载此票据'),
        el('p', {}, '该文件可能已从您的 本地驱动器中移动或删除。')
      ));
      return;
    }
    if (isPdf(exp)) {
      body.append(
        el('iframe.receipt-pdf', { src: url, title: '票据 PDF' }),
        el('p.small.muted', { style: { textAlign: 'center', marginTop: '10px' } },
          el('a', { href: url, target: '_blank', rel: 'noopener' }, '在新标签页中打开'))
      );
      return;
    }
    const img = el('img.receipt-img', { src: url, alt: `${exp.merchant || '未知商家'}的票据` });
    const wrap = el('button.receipt-zoom', {
      type: 'button', 'aria-label': '切换缩放', 'aria-pressed': 'false',
      onclick: () => {
        const on = wrap.classList.toggle('zoomed');
        wrap.setAttribute('aria-pressed', String(on));
      },
    }, img);
    body.append(wrap);
  });
  return modal;
}
