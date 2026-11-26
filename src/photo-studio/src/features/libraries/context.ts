// What the "+" menu of the Libraries panel can add right now (enabled checks
// for the add commands). Cheap checks only; the capture code is in apply.ts.
import type { Editor } from '../../editor';
import type { ItemType } from './model';

export type AddSource = 'foreground' | 'background' | 'gradient' | 'pattern' | 'layer-style' | 'character-style' | 'paragraph-style' | 'brush' | 'layers' | 'selection';
export const ADD_SOURCES: [AddSource, string, ItemType][] = [
  ['foreground', '前景色', 'color'],
  ['background', '背景色', 'color'],
  ['gradient', '当前渐变', 'gradient'],
  ['pattern', '当前图案', 'pattern'],
  ['layer-style', '选定图层的图层样式', 'layer-style'],
  ['character-style', '文本字符样式', 'character-style'],
  ['paragraph-style', '文本段落样式', 'paragraph-style'],
  ['brush', '当前画笔', 'brush'],
  ['layers', '选定图层为图形', 'graphic'],
  ['selection', '选区为图形', 'graphic'],
];
export function canAdd(e: Editor, src: AddSource): boolean {
  switch (src) {
    case 'foreground':
    case 'background':
    case 'gradient':
    case 'pattern':
    case 'brush':
      return true;
    case 'layer-style':
      return !!e.layer?.style && Object.keys(e.layer.style).length > 0;
    case 'character-style':
    case 'paragraph-style':
      return e.hasDocument && e.layer?.kind === 'text';
    case 'layers':
      return e.hasDocument && e.selectedLayers.length > 0;
    case 'selection':
      return e.hasDocument && !!e.doc.selection;
  }
}
