// The Assistant: describe an edit in words and get a plan of real commands to
// review and run as one undo step, or ask how to do something. The panel,
// catalog, model conversation and runner load on first use; this module only
// registers the panel and commands.
import './assistant.css';
import type { Editor } from '../../editor';
import { contributeMenu, registerCommand, registerPanel } from '../../app/registry';
import { lazy, lazyPanel } from '../../app/lazy';
import { ASSISTANT_MODELS, assistantSettings, saveAssistantSettings } from './settings';

const panel = lazy(() => import('./panel'));
const controller = lazy(() => import('./controller'));

/** Show the Assistant panel and focus its composer; with text, send it. */
export async function openAssistant(e: Editor, text?: string) {
  e.dock.show('assistant');
  const m = await panel();
  // The panel body mounts with the drawer; wait a frame for it.
  for (let i = 0; i < 20 && !e.root.querySelector('.assistant-panel .ast-input'); i++) await new Promise((r) => setTimeout(r, 25));
  const el = e.root.querySelector<HTMLElement>('.assistant-panel');
  if (text?.trim()) {
    m.submit(e, text);
    if (el) m.focusComposer(el);
  } else if (el) m.focusComposer(el);
}

export function installAssistant(e: Editor) {
  registerPanel(
    lazyPanel(
      {
        id: 'assistant',
        title: '智能助手',
        icon: 'assistant',
        location: 'strip',
        menu: () => ['assistant.ask', 'assistant.clear', '-', { label: '模型', id: 'assistant.models', items: ASSISTANT_MODELS.map((m) => `assistant.model-${m.id}`) }, 'assistant.see-image'],
      },
      lazy(async () => {
        const m = await panel();
        return { mount: m.mountAssistant, update: m.updateAssistant };
      }),
    ),
  );
  registerCommand(
    {
      id: 'assistant.ask',
      label: '描述编辑需求…',
      shortcut: 'Mod+Alt+Shift+D',
      recordable: false,
      description: '用文字描述修改需求；智能助手将使用原生命令规划步骤供您审阅并运行（本地智能引擎）。',
      run: (ed, arg) => openAssistant(ed, arg && typeof arg === 'object' && typeof (arg as { prompt?: unknown }).prompt === 'string' ? (arg as { prompt: string }).prompt : undefined),
      prefetch: panel.prefetch,
    },
    {
      id: 'assistant.clear',
      label: '清空会话',
      recordable: false,
      description: '清除当前文档的助手会话记录',
      run: async (ed) => (await controller()).clearConversation(ed),
    },
    {
      id: 'assistant.see-image',
      label: '分享图像预览',
      recordable: false,
      description: '每次请求时发送可见图像的小尺寸预览，以便智能助手查看',
      checked: () => assistantSettings.seeImage,
      run: (ed) => {
        assistantSettings.seeImage = !assistantSettings.seeImage;
        saveAssistantSettings();
        ed.dock?.update();
      },
    },
    ...ASSISTANT_MODELS.map((m) => ({
      id: `assistant.model-${m.id}`,
      label: `${m.label} (${m.note})`,
      recordable: false,
      description: `为智能助手使用 ${m.label}`,
      checked: () => assistantSettings.model === m.id,
      run: (ed: Editor) => {
        assistantSettings.model = m.id;
        saveAssistantSettings();
        ed.dock?.update();
        ed.message(`智能助手现在使用 ${m.label}。`);
      },
    })),
  );
  // Listed directly in the Window menu (next to Scripts) rather than in Window → Panels.
  for (const [id, title] of [['assistant', '智能助手'], ['generations', '生成历史记录']])
    registerCommand({ id: `window.panel.${id}`, label: title, recordable: false, checked: (ed) => !!ed.dock?.isVisible(id), run: (ed) => ed.dock.show(id, true) });
  contributeMenu('edit', ['assistant.ask'], 'edit.edit-with-prompt');
  contributeMenu('window', ['window.panel.assistant', 'window.panel.generations'], 'window.panel.scripts');
  // A closed document's conversation goes with it.
  e.closeHooks.push((s) => controller.loaded?.forgetSession(s.id));
}
