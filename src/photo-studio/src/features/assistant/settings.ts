// Assistant settings kept in this browser: the model and whether the model
// may see a small preview of the image. Light: menus read it at startup.
export const ASSISTANT_MODELS: { id: string; label: string; note: string }[] = [
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: '能力最强' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: '能力全面，消耗适中' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: '响应更快' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: '极速响应，消耗极低' },
];
export const DEFAULT_ASSISTANT_MODEL = ASSISTANT_MODELS[0].id;
const KEY = 'photo-studio-assistant';

export const assistantSettings = { model: DEFAULT_ASSISTANT_MODEL, seeImage: true };
try {
  const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') as Partial<typeof assistantSettings>;
  if (typeof v.model === 'string' && ASSISTANT_MODELS.some((m) => m.id === v.model)) assistantSettings.model = v.model;
  if (typeof v.seeImage === 'boolean') assistantSettings.seeImage = v.seeImage;
} catch {
  /* Settings are optional. */
}
export function saveAssistantSettings() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(assistantSettings));
  } catch {
    /* Settings are optional. */
  }
}
export const modelLabel = (id: string) => ASSISTANT_MODELS.find((m) => m.id === id)?.label ?? id;
/** What a request sends, as the panel and the start screen say it. */
export const sentNote = (hasDocument: boolean) =>
  `向本地智能服务发送你的需求${hasDocument ? `、文档尺寸与图层列表${assistantSettings.seeImage ? '及低清图像预览' : ''}` : ''}。`;
