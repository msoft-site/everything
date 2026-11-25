import { el, icon, button } from './lib/ui.js';

/**
 * The Signatures panel and the document message bar: every certificate signature in the PDF
 * with its validity, signer, time, reason, and certificate details, like a desktop PDF
 * reader's Signature panel. Statuses come from verifySignatures (core/digital-signature.js).
 */
const STATUS = {
  valid: { glyph: 'Check', tone: 'good', label: '签名有效' },
  'valid-unknown-identity': {
    glyph: 'Info',
    tone: 'unknown',
    label: '签名有效，但签名者身份未知',
  },
  modified: {
    glyph: 'Info',
    tone: 'bad',
    label: '文档在签名后被修改',
  },
  invalid: { glyph: 'X', tone: 'bad', label: '签名无效' },
  unsupported: { glyph: 'Info', tone: 'unknown', label: '无法验证签名' },
};

const when = (date) =>
  date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';

/** One sentence for the bar above the document, from all of its signatures. */
export function signatureSummary(reports) {
  if (!reports.length) return null;
  const count = reports.length === 1 ? '该签名' : `全部 ${reports.length} 个签名`;
  // A certification signature (the author's) makes the whole document certified.
  const signed = reports.some((r) => r.certification) ? '已认证' : '已签名';
  if (reports.some((r) => r.status === 'invalid'))
    return { tone: 'bad', text: '至少有一个签名无效。' };
  if (reports.some((r) => r.status === 'modified'))
    return {
      tone: 'bad',
      text: '至少有一个签名存在问题：文档在签名后被修改。',
    };
  if (reports.some((r) => r.status === 'unsupported'))
    return { tone: 'unknown', text: '至少有一个签名无法验证。' };
  if (reports.every((r) => r.status === 'valid'))
    return {
      tone: 'good',
      text: `${signed}，且${count}有效。`,
    };
  return {
    tone: 'unknown',
    text: `${signed}。${count}有效，但签名者的身份在此设备上不受信任。`,
  };
}

export function createSignaturesPanel({ onGoTo, onValidate }) {
  const list = el('ol', { class: 'signature-list', 'aria-label': '签名列表' });
  const empty = el('p', { class: 'panel-empty muted' }, '此 PDF 没有证书签名。');
  const validate = button('验证全部', 'RefreshCw', () => onValidate(), 'btn panel-action');
  const root = el('div', { class: 'signatures-panel' }, validate, empty, list);

  function details(report) {
    const rows = [
      ['签名者', [report.signer?.name, report.signer?.email].filter(Boolean).join(' · ')],
      ['组织', report.signer?.organization],
      ['时间', when(report.signingTime)],
      ['原因', report.reason],
      ['位置', report.location],
      ['联系方式', report.contactInfo],
      ['字段', report.fieldName],
      ['外观', report.invisible ? '不可见' : ''],
      [
        '证书',
        report.chain?.length
          ? report.chain
              .map((cert) => cert.commonName || cert.subject || '')
              .filter(Boolean)
              .join(' → ')
          : '',
      ],
      [
        '版本',
        report.revision && report.totalRevisions
          ? `第 ${report.revision} 版（共 ${report.totalRevisions} 版）`
          : '',
      ],
      ['认证', report.certification ? `级别 ${report.certification.level}` : ''],
      [
        '证书有效期',
        report.chain?.[0]
          ? `${when(new Date(report.chain[0].validFrom))} 至 ${when(new Date(report.chain[0].validTo))}`
          : '',
      ],
      ['吊销状态', report.revocation],
    ].filter(([, value]) => value);
    const changes = [
      ...(report.modifications?.allowed || []).map((text) => el('li', {}, text)),
      ...(report.modifications?.disallowed || []).map((text) => el('li', { class: 'bad' }, text)),
    ];
    const problems = [...(report.errors || []), ...(report.warnings || [])];
    return el(
      'details',
      { class: 'signature-details' },
      el('summary', {}, '详细信息'),
      el('dl', {}, ...rows.flatMap(([term, value]) => [el('dt', {}, term), el('dd', {}, value)])),
      changes.length > 0 && el('p', { class: 'signature-subhead' }, '签名后的更改'),
      changes.length > 0 && el('ul', { class: 'signature-changes' }, ...changes),
      problems.length > 0 &&
        el('ul', { class: 'signature-problems' }, ...problems.map((text) => el('li', {}, text))),
    );
  }

  return {
    el: root,
    show(reports) {
      empty.hidden = reports.length > 0;
      validate.hidden = !reports.length;
      list.replaceChildren(
        ...reports.map((report, i) => {
          const status = STATUS[report.status] || STATUS.unsupported;
          const signer = report.signer?.name || report.fieldName || `签名 ${i + 1}`;
          // The author's certification and a document timestamp are named for what they are.
          const action =
            report.kind === 'certification'
              ? '认证'
              : report.kind === 'timestamp'
                ? '盖时间戳'
                : '签名';
          return el(
            'li',
            { class: `signature-item tone-${status.tone}` },
            el(
              'div',
              { class: 'signature-head' },
              el(
                'span',
                { class: 'signature-status', 'aria-hidden': 'true' },
                icon(status.glyph, 14),
              ),
              el(
                'div',
                { class: 'signature-text' },
                el(
                  'span',
                  { class: 'signature-title' },
                  `版本 ${report.revision ?? i + 1}：由 ${signer} ${action}`,
                ),
                el('span', { class: 'signature-state' }, report.summary || status.label),
              ),
            ),
            // An invisible signature shows nowhere on the page.
            Number.isInteger(report.page) &&
              !report.invisible &&
              button(
                `转到第 ${report.page + 1} 页的签名`,
                null,
                () => onGoTo(report),
                'text-btn signature-go',
              ),
            details(report),
          );
        }),
      );
    },
  };
}

/** The message bar above the pages for a signed PDF. */
export function createSignatureBar({ onOpenPanel }) {
  const text = el('span', { class: 'signature-bar-text' });
  const glyph = el('span', { class: 'signature-bar-icon', 'aria-hidden': 'true' });
  const root = el(
    'div',
    { class: 'signature-bar', role: 'status', hidden: true },
    glyph,
    text,
    button('签名面板', null, () => onOpenPanel(), 'text-btn'),
  );
  return {
    el: root,
    show(reports) {
      const summary = signatureSummary(reports);
      root.hidden = !summary;
      if (!summary) return;
      root.className = `signature-bar tone-${summary.tone}`;
      glyph.replaceChildren(icon(summary.tone === 'good' ? 'Check' : 'Info', 15));
      text.textContent = summary.text;
    },
  };
}
