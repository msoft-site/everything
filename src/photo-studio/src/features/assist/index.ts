// Assisted editing: Generate Image and Edit with Prompt (本地智能引擎, only when
// invoked), Upscale (Enhanced Upscale offline, optional AI detail layer), Mask
// All Objects and Harmonize. Denoise and Sharpen Details are filters (see the
// filter catalog). Dialog modules load on first use.
import type { Editor } from '../../editor';
import { registerCommand, type Command } from '../../app/registry';
import { escapeXML } from '../../model/assets';
import { propertySections } from '../panels/properties';
import { deferRecording } from '../filters/record';
import { canHarmonize } from './harmonize-math';
import './assist.css';

const KIND_LABEL = { generate: '通过提示词生成', edit: '通过提示词编辑', upscale: 'AI 放大（生成式）', fill: 'AI 填充', expand: 'AI 扩展', recompose: 'AI 重新构图（生成式）', reflection: '移除反光（生成式）', rotate: '旋转对象（生成式）' } as const;

export function installAssist(e: Editor) {
  void e;
  const lazy = <M,>(load: () => Promise<M>, pick: (m: M) => Command['run']): Command['run'] => async (ed, arg) => pick(await load())(ed, arg);
  const generate = () => import('./generate');
  registerCommand(
    { id: 'edit.generate-image', label: '生成图像…', enabled: (ed) => ed.hasDocument, run: lazy(generate, (m) => m.generateImageDialog), recordable: false, description: '使用本地智能引擎根据文本提示词创建新图层。' },
    { id: 'edit.edit-with-prompt', label: '通过提示词编辑…', enabled: (ed) => ed.hasDocument, run: lazy(generate, (m) => m.editWithPromptDialog), recordable: false, description: '使用本地智能引擎通过描述编辑内容来更改选区或图层。' },
    { id: 'image.upscale', label: '图像放大…', shortcut: 'Mod+Alt+Shift+U', enabled: (ed) => ed.hasDocument, run: lazy(() => import('./upscale'), (m) => m.upscaleDialog), description: '通过边缘增强技术放大整张图像（支持离线运行）；可选 AI 细节图层。' },
    { id: 'layer.mask-all-objects', label: '蒙版所有对象…', enabled: (ed) => ed.hasDocument, run: lazy(() => import('./objects'), (m) => m.maskAllObjectsDialog), description: '查找每个不同的对象并为其创建带蒙版的图层、组或保存的选区。' },
    { id: 'layer.harmonize', label: '协调…', enabled: (ed) => ed.hasDocument && canHarmonize(ed.layer), run: lazy(() => import('./harmonize'), (m) => m.harmonizeDialog), description: '将图层的颜色和色调与其下方的图层进行匹配。' },
  );
  // Dialogs record their confirmed settings; the AI commands are never recorded.
  for (const id of ['image.upscale', 'layer.mask-all-objects', 'layer.harmonize']) deferRecording(id);
  // Properties: how an assisted layer was made.
  propertySections.push((_e, l) => {
    const g = l.generated;
    if (!g) return '';
    return `<div class="assist-generated"><small>${KIND_LABEL[g.kind]}${g.model ? ` · ${escapeXML(g.model)}` : ''}${g.style ? ` · ${escapeXML(g.style)} style` : ''}</small>${g.kind === 'upscale' || !g.prompt ? '' : `<q>${escapeXML(g.prompt)}</q>`}</div>`;
  });
}
