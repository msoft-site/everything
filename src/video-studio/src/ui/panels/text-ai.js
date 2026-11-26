/**
 * Write with AI: ask 本地智能引擎 for titles, hooks, captions or calls to action
 * (from a description or from the project's transcript) and add the one you
 * like as a text clip.
 */
import { h, announce } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { emptyState } from './common.js';
import { toast } from '../dialog.js';
import { aiAvailable } from '../../media/tts.js';
import { parseJsonArray, transcriptText, transcriptWords } from '../../media/transcript.js';
import { errorMessage } from '../../media/transcribe.js';

export const WRITE_KINDS = [
  { id: 'title', label: '视频标题', ask: 'short video titles (at most 7 words each)', preset: 'title-bold' },
  { id: 'hook', label: '开场吸睛语', ask: 'one-line opening hooks that make people keep watching (at most 12 words)', preset: 'title-bold' },
  { id: 'caption', label: '画面字幕', ask: 'short on-screen caption lines (at most 10 words)', preset: 'subtitle' },
  { id: 'cta', label: '行动呼吁 (CTA)', ask: 'short end-screen calls to action (at most 8 words), without platform names', preset: 'plain' },
  { id: 'chapters', label: '章节标题', ask: 'chapter titles for sections of the video (at most 5 words)', preset: 'minimal' },
];

const TONES = ['亲切', '醒目', '风趣', '专业', '沉稳', '戏剧感'];

/** The chat prompt for a request. */
export function writePrompt({ kind, tone, topic, transcript, count = 6 }) {
  const k = WRITE_KINDS.find((x) => x.id === kind) || WRITE_KINDS[0];
  return [
    `Write ${count} ${k.ask} for a video.`,
    tone ? `Tone: ${tone.toLowerCase()}.` : '',
    topic ? `The video is about: ${topic}` : '',
    transcript ? `Here is what is said in the video:\n"""${transcript.slice(0, 6000)}"""` : '',
    'No hashtags, no quotes around lines, no numbering, no emoji unless it really helps.',
    'Reply with only a JSON array of strings.',
  ].filter(Boolean).join('\n');
}

export function textAiPanel(ctx, { chat = (p) => puter.ai.chat(p) } = {}) {
  const { store, actions } = ctx;
  let kind = 'title';
  let tone = '亲切';
  let results = [];
  let busy = false;
  const topic = h('textarea.input.ai-topic', { rows: 3, maxlength: 600, placeholder: '视频关于什么？例如：周末里斯本美食之旅', 'aria-label': '视频主题描述' });
  const kindSel = h('select.select', { 'aria-label': '生成类型' }, WRITE_KINDS.map((k) => h('option', { value: k.id }, k.label)));
  kindSel.addEventListener('change', () => (kind = kindSel.value));
  const toneSel = h('select.select', { 'aria-label': '语气' }, TONES.map((t) => h('option', { value: t }, t)));
  toneSel.addEventListener('change', () => (tone = toneSel.value));
  const useTranscript = h('input', { type: 'checkbox' });
  const transcriptRow = h('label.check-row', useTranscript, h('span', '使用视频转录文本'));
  const go = h('button.btn.primary.block', { type: 'button' }, icon('magic', 16), '生成文案');
  // Not a live region: new suggestions are announced once (announce()), not read out twice.
  const list = h('div.ai-results', { role: 'list', 'aria-label': '建议列表' });

  async function run() {
    if (busy) return;
    const transcript = useTranscript.checked ? transcriptText(transcriptWords(store.project)) : '';
    if (!topic.value.trim() && !transcript) {
      toast('请先描述视频，或勾选使用转录文本。', { kind: 'info' });
      topic.focus();
      return;
    }
    busy = true;
    go.disabled = true;
    list.replaceChildren(h('p.asset-hint', '正在生成...'));
    try {
      const reply = await chat(writePrompt({ kind, tone, topic: topic.value.trim(), transcript }));
      results = parseJsonArray(reply).map((x) => x.trim()).filter(Boolean).slice(0, 12);
      render();
      announce(`${results.length} 条建议`);
    } catch (err) {
      console.error(err);
      list.replaceChildren(h('p.asset-hint', errorMessage(err, '未能生成文案建议。')));
    } finally {
      busy = false;
      go.disabled = false;
    }
  }
  go.addEventListener('click', run);

  function render() {
    const k = WRITE_KINDS.find((x) => x.id === kind) || WRITE_KINDS[0];
    list.replaceChildren(...results.map((line) => {
      const b = h('button.ai-line', { type: 'button', 'aria-label': `将“${line}”添加为文本` }, h('span', line), icon('plus', 14));
      b.addEventListener('click', () => {
        actions.addText(k.preset, { text: line });
        announce('已添加文本');
      });
      // The list item holds the button: a button with the item's role stops being a button.
      return h('div.ai-line-item', { role: 'listitem' }, b);
    }));
  }

  const form = h('div.cap-form.ai-form',
    h('p.asset-hint', '从本地智能引擎获取文案灵感，点击即可在播放头位置添加。'),
    h('div.field', h('span.field-label', '类型'), kindSel),
    h('div.field', h('span.field-label', '语气'), toneSel),
    topic,
    transcriptRow,
    go,
    list,
  );
  return {
    get el() {
      transcriptRow.hidden = !transcriptWords(store.project).length;
      if (!aiAvailable(ctx) && !ctx.textAiChat) {
        const btn = ctx.account?.onSignIn ? h('button.btn.primary', { type: 'button', onclick: () => ctx.account.onSignIn() }, icon('cloud', 16), '登录') : null;
        return emptyState('user', '登录以使用 AI 写作', '文案生成功能依托本地智能引擎，需要登录账户。', btn);
      }
      return form;
    },
  };
}
