import { parseHex } from './color';
import type { ColorStop, SolidGradient } from './gradient';

// Original preset gradients designed for this project. Basics resolve the
// current foreground/background colors at render time.
const opaque = [
  { location: 0, opacity: 1 },
  { location: 1, opacity: 1 },
];
function make(name: string, colors: (string | [string, number])[], smoothness = 100): SolidGradient {
  const colorStops: ColorStop[] = colors.map((c, i) => {
    const [hex, loc] = Array.isArray(c) ? c : [c, i / (colors.length - 1)];
    return { location: loc, color: parseHex(hex), midpoint: 50 };
  });
  return { kind: 'solid', name, colorStops, opacityStops: opaque.map((s) => ({ ...s })), smoothness };
}

export type GradientFolder = { name: string; gradients: SolidGradient[] };
export const gradientPresets: GradientFolder[] = [
  {
    name: '基础',
    gradients: [
      {
        kind: 'solid', name: '前景色到背景色', smoothness: 100,
        colorStops: [{ location: 0, color: 'foreground' }, { location: 1, color: 'background' }],
        opacityStops: opaque.map((s) => ({ ...s })),
      },
      {
        kind: 'solid', name: '前景色到透明', smoothness: 100,
        colorStops: [{ location: 0, color: 'foreground' }, { location: 1, color: 'foreground' }],
        opacityStops: [{ location: 0, opacity: 1 }, { location: 1, opacity: 0 }],
      },
      make('黑、白', ['#000000', '#ffffff']),
    ],
  },
  {
    name: '暖色',
    gradients: [
      make('日出', ['#2b1055', ['#a83d6e', 0.38], ['#f5874f', 0.72], '#ffd88a']),
      make('余烬', ['#1a0400', ['#7a1405', 0.35], ['#e04e12', 0.7], '#ffc04a']),
      make('大漠黄昏', ['#3d2c4f', ['#b0605a', 0.5], '#e8b27a']),
      make('气泡水蜜桃', ['#ff9a8b', ['#ffb98f', 0.55], '#fff1c9']),
    ],
  },
  {
    name: '冷色',
    gradients: [
      make('泻湖', ['#04394f', ['#0b7f8a', 0.45], ['#38c3b5', 0.75], '#b8f3e2']),
      make('冰川', ['#e9f6ff', ['#9ccbea', 0.5], '#3a6f9e']),
      make('深海', ['#00040f', ['#06264d', 0.5], '#1b6f9c']),
      make('北极光', ['#071a2b', ['#14806e', 0.35], ['#52e39a', 0.6], ['#6a4fc9', 0.85], '#1b1238']),
    ],
  },
  {
    name: '鲜艳',
    gradients: [
      make('棱镜', ['#ff3b5c', ['#ffa62b', 0.2], ['#f7f052', 0.38], ['#39d98a', 0.58], ['#2f8cff', 0.78], '#a14bff'], 0),
      make('霓虹之夜', ['#ff2fd0', ['#7a2bff', 0.5], '#18e0ff']),
      make('柑橘波普', ['#fff35c', ['#ffb321', 0.5], '#ff5f2e']),
      make('浆果飞溅', ['#4a0d3b', ['#b3185b', 0.45], '#ff7aa8']),
    ],
  },
  {
    name: '自然',
    gradients: [
      make('苔藓', ['#1f2a12', ['#4d6b26', 0.55], '#a9c46a']),
      make('砂岩', ['#7b4a2c', ['#c8915e', 0.4], ['#e6c49a', 0.7], '#a86b45']),
      make('暴风雨天空', ['#2a2f3a', ['#5a6475', 0.5], '#b9c2cf']),
      make('红铜金箔', ['#3b1d0e', ['#9c4f1c', 0.4], ['#d8893b', 0.6], '#6b3517']),
    ],
  },
];
export function findGradientPreset(name: string): SolidGradient | undefined {
  for (const f of gradientPresets) for (const g of f.gradients) if (g.name === name) return g;
  return undefined;
}
