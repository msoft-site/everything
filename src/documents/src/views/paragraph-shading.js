import { openColorPalette } from '../ui/color-palette.js';
import { TEXT_COLORS } from './text-color.js';

export const paragraphShadingLabel = value => value === null ? '多种' : value === 'auto' ? '无填充' : value === 'foreground' ? '自动前景色' : '#' + value;

export function openParagraphShading(value, apply, options = {}) {
  return openColorPalette({ ...options, label: '底纹', value, choices: TEXT_COLORS,
    reset: { value: 'auto', label: '无颜色' }, extra: [{ value: 'foreground', label: '自动前景色' }],
    custom: true, customLabel: '段落填充', onPick: apply });
}
