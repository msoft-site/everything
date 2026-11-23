/**
 * What a new help desk starts with: one group, a few macros, the standard
 * notification triggers, service level targets and a help center outline.
 * Everything here can be edited or removed in Admin.
 */
import { randomId } from '../shared/ids.js';
import { DEFAULT_SLA } from '../shared/rules.js';

export function defaultConfig() {
  const general = randomId(8);
  const start = randomId(8);
  const faq = randomId(8);
  return {
    groups: [{ id: 'support', name: '客服支持', desc: '负责解答请求的所有人员' }],
    fields: [],
    views: [],
    sla: structuredClone(DEFAULT_SLA),
    kb: {
      categories: [{ id: general, name: '常规', desc: '基础知识与常见问题解答', order: 0 }],
      sections: [
        { id: start, categoryId: general, name: '快速上手', order: 0 },
        { id: faq, categoryId: general, name: '常见问题', order: 1 },
      ],
    },
    macros: [
      {
        id: randomId(8),
        title: '询问更多详情',
        active: true,
        actions: [{ field: 'status', value: 'pending' }],
        comment: {
          public: true,
          html: '<p>{{requester.first_name}}，您好：</p><p>感谢您联系我们。您能否提供更多细节，例如您的操作步骤以及看到的任何错误提示？这将帮助我们快速定位原因。</p><p>祝好，<br>{{agent.first_name}}</p>',
        },
      },
      {
        id: randomId(8),
        title: '关闭并致谢',
        active: true,
        actions: [{ field: 'status', value: 'solved' }],
        comment: {
          public: true,
          html: '<p>{{requester.first_name}}，您好：</p><p>很高兴能帮到您。我将把此请求标记为已解决。如果还有其他问题，只需直接回复，我们会继续为您跟进。</p><p>祝好，<br>{{agent.first_name}}</p>',
        },
      },
      {
        id: randomId(8),
        title: '升级为紧急',
        active: true,
        actions: [{ field: 'priority', value: 'urgent' }, { field: 'add_tags', value: 'escalated' }],
        comment: { public: false, html: '<p>已升级。需要今日处理。</p>' },
      },
    ],
    triggers: [
      {
        id: randomId(8),
        title: '向请求人确认收到新请求',
        active: true,
        event: 'created',
        conditions: { all: [{ field: 'actor', op: 'is', value: 'customer' }], any: [] },
        actions: [
          {
            field: 'notify_requester',
            // No text from the request is repeated here: anyone can submit the
            // form with any address, so this mail must not carry their words.
            subject: '我们已收到您的请求',
            body: '您好，\n\n感谢您联系 {{desk.name}}。我们已收到您的请求，客服人员将尽快回复。您可以通过下方链接跟进处理进度。',
          },
        ],
      },
      {
        id: randomId(8),
        title: '有公开回复时向请求人发送邮件',
        active: true,
        event: 'any',
        conditions: { all: [{ field: 'actor', op: 'is', value: 'agent' }, { field: 'comment', op: 'is', value: 'public' }], any: [] },
        actions: [{ field: 'notify_requester', subject: '回复：{{ticket.subject}}', body: '{{comment.text}}' }],
      },
      {
        id: randomId(8),
        title: '标记紧急词汇',
        active: false,
        event: 'created',
        conditions: { all: [], any: [{ field: 'subject', op: 'contains', value: 'urgent' }, { field: 'subject', op: 'contains', value: 'outage' }] },
        actions: [{ field: 'priority', value: 'urgent' }, { field: 'add_tags', value: 'urgent_words' }],
      },
    ],
  };
}

export const CONFIG_KINDS = ['groups', 'macros', 'views', 'fields', 'triggers', 'sla', 'kb'];
