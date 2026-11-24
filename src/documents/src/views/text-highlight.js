import { openColorPalette } from '../ui/color-palette.js';
import { HIGHLIGHTS, highlightLabel } from '../engine/backgrounds.js';

const choices = [
  'yellow', 'green', 'cyan', 'magenta', 'blue', 'red', 'white', 'black',
  'darkYellow', 'darkGreen', 'darkCyan', 'darkMagenta', 'darkBlue', 'darkRed', 'lightGray', 'darkGray',
].map(value => ({ value, color: `#${HIGHLIGHTS[value]}`, label: highlightLabel(value) }));

export function openTextHighlight(value, apply, options) {
  return openColorPalette({ ...options, label: '文本突出显示颜色', value, choices,
    reset: { value: 'none', label: '无颜色' }, onPick: apply });
}
