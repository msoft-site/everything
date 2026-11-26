/**
 * Prompts for the generative features: the choices the dialogs offer and
 * the text sent to the image and chat models. Pure functions (tested).
 */

export const PROMPT_MAX = 600;

/** What to generate. `phrase` steers the picture toward art that traces well. */
export const CONTENT_TYPES = [
  { id: 'subject', label: '主体', phrase: 'one isolated subject, centered, on a plain pure white background, no ground shadow, nothing else in the picture' },
  { id: 'scene', label: '场景', phrase: 'a complete scene with a background that fills the whole frame edge to edge' },
  { id: 'icon', label: '图标', phrase: 'a single simple bold icon, centered, on a plain pure white background, very few shapes and colors, no text' },
  { id: 'pattern', label: '图案', phrase: 'a seamless repeating pattern tile: motifs spread evenly over the whole square, edge to edge, motifs that cross an edge continue on the opposite edge, no border, no frame' },
];

/** Visual styles (own wording). */
export const STYLES = [
  { id: 'none', label: '任意风格', phrase: '' },
  { id: 'flat', label: '扁平', phrase: 'flat vector illustration, solid color shapes, no gradients, no texture' },
  { id: 'line', label: '线条艺术', phrase: 'clean black line art with even stroke weight, no fills, no shading' },
  { id: 'geometric', label: '几何', phrase: 'built from simple geometric shapes, circles, triangles and rectangles, crisp edges' },
  { id: 'hand', label: '手绘', phrase: 'hand drawn look with slightly uneven organic outlines, flat colors' },
  { id: 'retro', label: '复古', phrase: 'retro mid-century poster style, limited muted palette, bold simple shapes' },
  { id: 'minimal', label: '极简', phrase: 'minimal design, as few shapes as possible, generous negative space' },
  { id: 'isometric', label: '等轴测', phrase: 'isometric 3D view with flat shaded faces, crisp edges' },
  { id: 'sticker', label: '贴纸', phrase: 'die-cut sticker style with a thick white outline around the subject, bold flat colors' },
  { id: 'papercut', label: '剪纸', phrase: 'layered paper cut-out style, stacked flat layers' },
];

/** Color treatments. `colors` is the most colors the trace keeps (null: by detail). */
export const COLOR_MODES = [
  { id: 'full', label: '全彩', phrase: '', colors: null },
  { id: 'limited', label: '少量色彩', phrase: 'a limited palette of at most five flat colors', colors: 5 },
  { id: 'mono', label: '黑白', phrase: 'black and white only, no gray', colors: 2 },
  { id: 'pastel', label: '柔和粉彩', phrase: 'soft pastel colors', colors: null },
  { id: 'vivid', label: '鲜艳', phrase: 'bright saturated colors with strong contrast', colors: null },
];

export const DETAIL_LABELS = ['低', '中', '高'];

/** Ideas for an empty prompt, per content type (original examples). */
export const PROMPT_IDEAS = {
  subject: ['蜷缩睡着的狐狸', '装满柠檬篮子的复古自行车', '红陶花盆里的仙人掌', '小岩石上的灯塔', '冒着热气的咖啡杯', '纸飞机'],
  scene: ['日落时分宁静的港口小镇', '星空下的露营帐篷', '春天的城市屋顶花园', '松林上方的雪山', '只有一家加油站的沙漠公路'],
  icon: ['挂锁', '带向上箭头的云朵', '购物袋', '树叶', '带心形的地图标注', '齿轮'],
  pattern: ['小草莓和叶子', '海军蓝与珊瑚色几何波浪', '散落的星星和月亮', '热带龟背竹叶', '民间艺术花卉'],
};

export const RECOLOR_IDEAS = ['黄昏时分的秋季森林', '霓虹街机游戏厅', '阳光海滩与海玻璃', '柔和北欧室内风格', '复古旅行海报', '深海生物发光', '糖果屋', '朴素沙漠陶土'];

export const TONES = [
  { id: 'friendly', label: '亲切' },
  { id: 'professional', label: '专业' },
  { id: 'concise', label: '简明' },
  { id: 'playful', label: '生动' },
  { id: 'persuasive', label: '说服力' },
  { id: 'formal', label: '正式' },
];

export const LENGTHS = [
  { id: 'same', label: '大致相同长度' },
  { id: 'shorter', label: '更短' },
  { id: 'longer', label: '更长' },
];

export const TEXT_KINDS = [
  { id: 'headline', label: '主标题', ask: 'a headline of at most 8 words' },
  { id: 'tagline', label: '副标题/标语', ask: 'a short tagline of at most 12 words' },
  { id: 'paragraph', label: '段落', ask: 'one paragraph of 40 to 70 words' },
  { id: 'list', label: '列表', ask: 'a list of 3 to 6 short items, one per line, without bullets or numbers' },
  { id: 'cta', label: '行动呼吁 (CTA)', ask: 'a short call to action of at most 6 words' },
];

export const LANGUAGES = ['阿拉伯语', '简体中文', '繁体中文', '捷克语', '丹麦语', '荷兰语', '英语', '芬兰语', '法语', '德语', '希腊语', '希伯来语', '印地语', '匈牙利语', '印度尼西亚语', '意大利语', '日语', '韩语', '挪威语', '波斯语', '波兰语', '葡萄牙语', '罗马尼亚语', '俄语', '西班牙语', '瑞典语', '泰语', '土耳其语', '乌克兰语', '越南语'];

const find = (list, id) => list.find((x) => x.id === id) || list[0];

/** Clean a user prompt: one line of text, length-limited. */
export function cleanPrompt(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, PROMPT_MAX);
}

/**
 * The image prompt for vector art. reference: { colors: ['#hex'], description }
 * from the selection (style reference).
 */
export function vectorPrompt({ prompt, contentType = 'subject', style = 'none', color = 'full', reference = null }) {
  const p = cleanPrompt(prompt);
  const ct = find(CONTENT_TYPES, contentType);
  const st = find(STYLES, style);
  const cm = find(COLOR_MODES, color);
  const parts = [p ? `${p}.` : 'Something pleasant and simple.', `${ct.phrase}.`];
  if (st.phrase) parts.push(`Style: ${st.phrase}.`);
  if (cm.phrase) parts.push(`Colors: ${cm.phrase}.`);
  if (reference?.description) parts.push(`Match this visual style: ${String(reference.description).slice(0, 400)}.`);
  if (reference?.colors?.length) parts.push(`Use this color palette: ${reference.colors.slice(0, 8).join(', ')}.`);
  parts.push('Vector graphic look: clean flat shapes with crisp edges and no photographic texture, no noise, no text, no watermark, no signature.');
  return parts.join(' ');
}

/** The chat prompt that asks for color palettes: JSON [{ name, colors }]. */
export function palettePrompt(prompt, { count = 4, colors = 5, current = [] } = {}) {
  return [
    `Create ${count} different color palettes inspired by: "${cleanPrompt(prompt)}".`,
    `Each palette has exactly ${colors} colors that work together, ordered from the most dominant to the least, with a range of light and dark values.`,
    current.length ? `They will recolor art whose current colors are ${current.slice(0, 12).join(', ')}; keep enough contrast between light and dark.` : '',
    'Give each palette a short evocative name of at most 3 words.',
    'Reply with only a JSON array like [{"name":"...","colors":["#rrggbb", ...]}] and no other text.',
  ].filter(Boolean).join('\n');
}

/** Normalize parsed palettes: [{ name, colors: ['#rrggbb'] }] with valid colors only. */
export function normalizePalettes(list, max = 8) {
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    const raw = Array.isArray(p) ? p : p?.colors;
    if (!Array.isArray(raw)) continue;
    const colors = raw.map(normalizeHex).filter(Boolean);
    if (colors.length < 2) continue;
    out.push({ name: String((!Array.isArray(p) && p?.name) || `Palette ${out.length + 1}`).slice(0, 40), colors: [...new Set(colors)].slice(0, 12) });
    if (out.length >= max) break;
  }
  return out;
}

/** '#abc', 'ABCDEF', '#AbCdEf' -> '#aabbcc' / '#abcdef', or null. */
export function normalizeHex(v) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v ?? '').trim());
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return `#${s.toLowerCase()}`;
}

/** Prompt to write new text for a frame. */
export function generateTextPrompt({ prompt, kind = 'paragraph', tone = 'friendly', context = '' }) {
  const k = find(TEXT_KINDS, kind);
  const t = find(TONES, tone);
  return [
    `Write ${k.ask} about: ${cleanPrompt(prompt)}`,
    `Tone: ${t.label.toLowerCase()}.`,
    context ? `It goes in a design that also says: """${String(context).slice(0, 800)}"""` : '',
    'Reply with only the text itself: no title, no quotes around it, no explanations, no markdown.',
  ].filter(Boolean).join('\n');
}

/** Prompt to rewrite text. Returns `count` alternatives as a JSON array of strings. */
export function rewritePrompt(text, { tone = 'friendly', length = 'same', instruction = '', count = 3 } = {}) {
  const t = find(TONES, tone);
  const len = { same: 'Keep about the same length.', shorter: 'Make it clearly shorter (about half as long) while keeping the key message.', longer: 'Make it longer and richer (about one and a half times as long).' }[length] || '';
  return [
    `Rewrite the text below in ${count} different ways.`,
    `Tone: ${t.label.toLowerCase()}.`,
    len,
    instruction ? `Also: ${cleanPrompt(instruction)}` : '',
    'Keep the same language as the original, keep line breaks where they separate items, and do not add facts that are not in the original.',
    'Reply with only a JSON array of strings.',
    `Text:\n"""${String(text).slice(0, 6000)}"""`,
  ].filter(Boolean).join('\n');
}

/** Prompt to proofread: JSON { text, changes: [{ from, to, why }] }. */
export function proofreadPrompt(text) {
  return [
    'Proofread the text below: fix spelling, grammar, punctuation and obvious typos only.',
    'Do not change the wording, tone, capitalization style or line breaks otherwise. Keep names and brand words as they are.',
    'Reply with only a JSON object {"text": "<corrected text>", "changes": [{"from": "<original words>", "to": "<corrected words>", "why": "<a few words>"}]}. Use an empty changes list when nothing needs fixing.',
    `Text:\n"""${String(text).slice(0, 6000)}"""`,
  ].join('\n');
}

/** Prompt to translate text, keeping line breaks. */
export function translatePrompt(text, language) {
  return [
    `Translate the text below into ${language}.`,
    'Keep line breaks exactly where they are, keep names, numbers and brand words, and keep the tone natural for printed design.',
    'Reply with only the translation, no notes, no quotes around it.',
    `Text:\n"""${String(text).slice(0, 6000)}"""`,
  ].join('\n');
}

/** Prompt to fit text to a frame: about `target` characters. */
export function fitPrompt(text, target, { lines = 0 } = {}) {
  const now = String(text).length;
  return [
    `Rewrite the text below so it is about ${target} characters long (it is now ${now}).`,
    target < now ? 'Shorten it, keeping the key message and the most important words.' : 'Expand it naturally, adding detail in the same voice without inventing specific facts.',
    lines ? `It must fit in about ${lines} lines.` : '',
    'Keep the same language and tone, keep paragraph breaks where they make sense.',
    'Reply with only the rewritten text, no notes, no quotes around it.',
    `Text:\n"""${String(text).slice(0, 6000)}"""`,
  ].filter(Boolean).join('\n');
}

/** Prompt that describes an image's visual style in a sentence (style reference). */
export const STYLE_DESCRIBE_PROMPT = 'Describe the visual style of this picture in one sentence of at most 35 words for an artist: technique, shapes, line quality, shading and color mood. Do not describe the subject.';

/** A short label for history and layer names: "a fox curled up asleep" -> "A fox curled up asleep". */
export function promptTitle(prompt, max = 48) {
  const p = cleanPrompt(prompt);
  if (!p) return 'Untitled';
  const t = p.length > max ? `${p.slice(0, max - 1).trimEnd()}…` : p;
  return t[0].toUpperCase() + t.slice(1);
}
