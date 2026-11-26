/**
 * AI assistance through local AI service. Requests run against the
 * signed-in user's own account.
 */
export function createAi() {
  return {
    available() {
      return typeof puter !== 'undefined' && Boolean(puter.ai?.chat);
    },
    async ask(prompt) {
      const res = await puter.ai.chat(prompt);
      if (typeof res === 'string') return res;
      const content = res?.message?.content;
      if (Array.isArray(content)) return content.map((c) => c.text || '').join('');
      return String(content ?? res?.text ?? res ?? '');
    },
  };
}

export const ASSIST_ACTIONS = [
  { id: 'summarize', label: '总结此页面', prompt: (text) => `Summarize these notes in a few short bullet points in Chinese. Reply in plain text, one bullet per line starting with "- ".\n\n${text}` },
  { id: 'actions', label: '查找行动项', prompt: (text) => `List the action items and to-dos found in these notes in Chinese. Reply in plain text, one per line starting with "- ". If there are none, reply "未找到行动项。"\n\n${text}` },
  { id: 'questions', label: '建议后续跟进问题', prompt: (text) => `Suggest up to five follow-up questions about these notes in Chinese. Reply in plain text, one per line starting with "- ".\n\n${text}` },
  { id: 'rewrite', label: '更清晰地重写所选内容', needsSelection: true, prompt: (text) => `Rewrite this text in Chinese so it is clearer and more concise. Keep the meaning. Reply with the rewritten text only.\n\n${text}` },
  { id: 'proofread', label: '修改所选内容的错别字与语法', needsSelection: true, prompt: (text) => `Correct the spelling, grammar and typos of this text. Reply with the corrected text only.\n\n${text}` },
];
