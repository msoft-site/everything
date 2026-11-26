/** Section and notebook colors: a light-mode and dark-mode tone for each. */
export const SECTION_COLORS = [
  { id: 'blue', label: '蓝色', light: '#3a7bd5', dark: '#6ea4ef' },
  { id: 'yellow', label: '黄色', light: '#f5b335', dark: '#f7c55e' },
  { id: 'green', label: '绿色', light: '#1e9a50', dark: '#4cc27c' },
  { id: 'red', label: '红色', light: '#d9483b', dark: '#ef7a6f' },
  { id: 'purple', label: '紫色', light: '#8a4fc7', dark: '#b88ae6' },
  { id: 'cyan', label: '青色', light: '#1aa3b8', dark: '#4fcbdc' },
  { id: 'orange', label: '橙色', light: '#ec7a2c', dark: '#f39d5f' },
  { id: 'magenta', label: '洋红色', light: '#c43e8e', dark: '#e57ab9' },
  { id: 'mist', label: '蓝雾色', light: '#8aa7d6', dark: '#a6bde3' },
  { id: 'lavender', label: '薰衣草色', light: '#ae9ad6', dark: '#c4b5e3' },
  { id: 'tan', label: '黄褐色', light: '#c6a37a', dark: '#d8bc9b' },
  { id: 'lime', label: '柠檬绿', light: '#a6c43a', dark: '#c1db66' },
  { id: 'apple', label: '苹果绿', light: '#68b354', dark: '#8ccc7c' },
  { id: 'teal', label: '水鸭青', light: '#2a8a8a', dark: '#5cb5b5' },
  { id: 'chalk', label: '红粉笔色', light: '#d98b84', dark: '#e6aaa5' },
  { id: 'silver', label: '银灰色', light: '#9aa0a6', dark: '#b6bbc0' },
];

export const COLOR_BY_ID = new Map(SECTION_COLORS.map((c) => [c.id, c]));

/** Picks the next color in the palette after the ones already used. */
export function nextColor(used = []) {
  const counts = new Map(SECTION_COLORS.map((c) => [c.id, 0]));
  for (const id of used) if (counts.has(id)) counts.set(id, counts.get(id) + 1);
  let best = SECTION_COLORS[0].id;
  let min = Infinity;
  for (const c of SECTION_COLORS.slice(0, 8)) {
    if (counts.get(c.id) < min) {
      min = counts.get(c.id);
      best = c.id;
    }
  }
  return best;
}

/** Page background colors (View > Page Color). */
export const PAGE_COLORS = [
  { id: 'blue', label: '蓝色', light: '#dce9f8', dark: '#1d2a3a' },
  { id: 'yellow', label: '黄色', light: '#fff6cc', dark: '#3a3420' },
  { id: 'green', label: '绿色', light: '#e0f2e0', dark: '#1f3324' },
  { id: 'red', label: '红色', light: '#fbe0dd', dark: '#3d2422' },
  { id: 'purple', label: '紫色', light: '#ece2f6', dark: '#2f2540' },
  { id: 'cyan', label: '青色', light: '#d9f2f5', dark: '#1b3438' },
  { id: 'orange', label: '橙色', light: '#fde7d6', dark: '#3d2b1c' },
  { id: 'magenta', label: '洋红色', light: '#f8def0', dark: '#3b2133' },
  { id: 'mist', label: '蓝雾色', light: '#e8eef8', dark: '#252c38' },
  { id: 'lavender', label: '薰衣草色', light: '#f0ecf8', dark: '#2c2938' },
  { id: 'tan', label: '黄褐色', light: '#f5ece0', dark: '#352e25' },
  { id: 'lime', label: '柠檬绿', light: '#f0f6d8', dark: '#2d3320' },
  { id: 'apple', label: '苹果绿', light: '#e4f3df', dark: '#24321f' },
  { id: 'teal', label: '水鸭青', light: '#dbeeee', dark: '#1e3232' },
  { id: 'chalk', label: '红粉笔色', light: '#f8e9e8', dark: '#352727' },
  { id: 'silver', label: '银灰色', light: '#eeeff0', dark: '#2a2b2d' },
];

/** Text and highlight colors offered in Home > Font. */
export const FONT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#c0c0c0', '#ffffff',
  '#c00000', '#e8590c', '#f2c200', '#2b8a3e', '#0b7285', '#1c5fd4',
  '#7e2fa8', '#c2255c', '#8b5a2b', '#5c940d', '#1864ab', '#5f3dc4',
];

export const HIGHLIGHT_COLORS = [
  '#fff176', '#a5f3a1', '#81e6f8', '#f9a8d4', '#93c5fd', '#fdba74',
  '#c4b5fd', '#d1d5db', '#fde047', '#86efac', '#fca5a5', '#e5e7eb',
];
