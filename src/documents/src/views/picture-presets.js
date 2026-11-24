/**
 * Original presets for Picture Format and Shape Format: corrections, color, transparency, picture and
 * shape styles, effects, outlines and fills. Each is plain data the drawing edits in drawing-xml.js
 * write; nothing here touches the document. Lengths are EMU (12700 per point) unless named otherwise.
 */
const PT = 12700;

/** The colours presets use when a document has no theme: an original palette. */
export const FALLBACK_THEME = Object.freeze({ dk1: '000000', lt1: 'FFFFFF', dk2: '1F2A3C', lt2: 'E9EDF2',
  accent1: '3F6FB5', accent2: 'D9822B', accent3: '8A8F98', accent4: 'E3B341', accent5: '4FA3C7', accent6: '5E9E50' });
export const ACCENTS = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
export const THEME_NAMES = { dk1: '深色 1', lt1: '浅色 1', dk2: '深色 2', lt2: '浅色 2', accent1: '主题色 1', accent2: '主题色 2', accent3: '主题色 3', accent4: '主题色 4', accent5: '主题色 5', accent6: '主题色 6' };
/** Tints and shades shown under each theme colour: [label, lumMod, lumOff] in 1/1000 %. */
export const THEME_VARIANTS = [['淡色 80%', 20000, 80000], ['淡色 60%', 40000, 60000], ['淡色 40%', 60000, 40000], ['深色 25%', 75000, 0], ['深色 50%', 50000, 0]];
export const STANDARD_COLORS = [['深红', 'A61B1B'], ['红色', 'E02424'], ['橙色', 'F08C00'], ['黄色', 'F5D000'], ['浅绿', '8BC34A'], ['绿色', '2E9E4F'], ['浅蓝', '3AA0E0'], ['蓝色', '2160C4'], ['深蓝', '17306B'], ['紫色', '7B3FA0']];

/** Resolve a preset colour ({ scheme, lumMod, lumOff } or 'RRGGBB') to RGB hex for previews. */
export function resolveColor(color, theme = FALLBACK_THEME) {
  if (!color) return null;
  if (typeof color === 'string') return color.replace(/^#/, '').toUpperCase();
  const alias = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
  const base = color.rgb ? color.rgb.toUpperCase() : theme[alias[color.scheme] || color.scheme] || FALLBACK_THEME[alias[color.scheme] || color.scheme] || '000000';
  const mod = (color.lumMod ?? 100000) / 100000, off = (color.lumOff ?? 0) / 100000;
  if (mod === 1 && !off) return base;
  // Luminance modulation in HSL, as the colour transforms define it.
  const [r, g, b] = base.match(/../g).map(h => parseInt(h, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const L = Math.min(1, Math.max(0, l * mod + off)), C = (1 - Math.abs(2 * L - 1)) * s, X = C * (1 - Math.abs((h % 2 + 2) % 2 - 1)), m = L - C / 2;
  const [R, G, B] = h < 1 ? [C, X, 0] : h < 2 ? [X, C, 0] : h < 3 ? [0, C, X] : h < 4 ? [0, X, C] : h < 5 ? [X, 0, C] : [C, 0, X];
  return [R, G, B].map(v => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** A theme colour reference when the document has a theme; otherwise the fallback palette's RGB. */
export const themed = (scheme, hasTheme, lumMod, lumOff) => hasTheme ? { scheme, ...(lumMod !== undefined ? { lumMod } : {}), ...(lumOff ? { lumOff } : {}) }
  : resolveColor({ scheme, lumMod, lumOff }, FALLBACK_THEME);

/* ---- Picture corrections and colour (Adjust group) ---- */
export const SHARPEN_PRESETS = [['柔化: 50%', -0.5], ['柔化: 25%', -0.25], ['清晰/柔化: 0%', 0], ['清晰: 25%', 0.25], ['清晰: 50%', 0.5]];
const STEPS = [-0.4, -0.2, 0, 0.2, 0.4];
const pct = v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
/** Brightness × contrast grid (a:lum). */
export const BRIGHTNESS_CONTRAST = STEPS.flatMap(contrast => STEPS.map(brightness => ({ label: `亮度: ${pct(brightness)} 对比度: ${pct(contrast)}`, brightness, contrast })));
export const SATURATION_PRESETS = [['饱和度: 0%', 0], ['饱和度: 33%', 0.33], ['饱和度: 66%', 0.66], ['饱和度: 100%', 1], ['饱和度: 200%', 2], ['饱和度: 300%', 3], ['饱和度: 400%', 4]];
export const TEMPERATURE_PRESETS = [4700, 5300, 5900, 6500, 7200, 7800, 8800].map(k => [`色温: ${k} K`, k]);
/** Recolor presets: blip effects (setBlipEffects patches) built for the document's theme. */
export function recolorPresets(theme = FALLBACK_THEME) {
  const none = { grayscale: false, duotone: null, biLevel: null, luminance: undefined };
  const list = [
    { id: 'none', label: '无重新着色', patch: { ...none } },
    { id: 'grayscale', label: '灰度', patch: { ...none, grayscale: true } },
    { id: 'sepia', label: '褐色', patch: { ...none, duotone: ['3B2A1A', 'F2E6CF'] } },
    { id: 'washout', label: '冲蚀', patch: { ...none, luminance: { brightness: 0.7, contrast: -0.7 } } },
    { id: 'bw25', label: '黑白: 25%', patch: { ...none, biLevel: 0.25 } },
    { id: 'bw50', label: '黑白: 50%', patch: { ...none, biLevel: 0.5 } },
    { id: 'bw75', label: '黑白: 75%', patch: { ...none, biLevel: 0.75 } },
  ];
  const dark = ['dk2', ...ACCENTS].map(name => ({ id: `${name}Dark`, label: `${THEME_NAMES[name]} 深色`, patch: { ...none, duotone: ['000000', resolveColor({ scheme: name }, theme)] } }));
  const light = ['dk2', ...ACCENTS].map(name => ({ id: `${name}Light`, label: `${THEME_NAMES[name]} 浅色`, patch: { ...none, duotone: [resolveColor({ scheme: name }, theme), 'FFFFFF'] } }));
  return { basic: list, dark, light };
}
export const TRANSPARENCY_PRESETS = [0, 0.15, 0.3, 0.5, 0.65, 0.8, 0.95].map(t => [`透明度: ${Math.round(t * 100)}%`, t]);

/* ---- Outlines and lines ---- */
export const LINE_WEIGHTS = [['¼ 磅', 3175], ['½ 磅', 6350], ['¾ 磅', 9525], ['1 磅', 12700], ['1½ 磅', 19050], ['2¼ 磅', 28575], ['3 磅', 38100], ['4½ 磅', 57150], ['6 磅', 76200]];
export const DASHES = [['实线', 'solid'], ['圆点', 'sysDot'], ['方点', 'sysDash'], ['短划线', 'dash'], ['划线-点', 'dashDot'], ['长划线', 'lgDash'], ['长划线-点', 'lgDashDot'], ['长划线-点-点', 'lgDashDotDot']];
export const COMPOUNDS = [['单线', 'sng'], ['双线', 'dbl'], ['粗细型', 'thickThin'], ['细粗型', 'thinThick'], ['三线', 'tri']];
/** Arrow presets: [label, headEnd, tailEnd] with line-end types (§20.1.10.55). */
export const ARROWS = [
  ['无箭头', null, null], ['尾部箭头', null, { type: 'triangle' }], ['起始箭头', { type: 'triangle' }, null], ['双向箭头', { type: 'triangle' }, { type: 'triangle' }],
  ['尾部开放箭头', null, { type: 'arrow' }], ['尾部隐形箭头', null, { type: 'stealth' }], ['尾部菱形', null, { type: 'diamond' }], ['尾部圆形', null, { type: 'oval' }],
  ['双向圆形', { type: 'oval' }, { type: 'oval' }], ['圆形到箭头', { type: 'oval' }, { type: 'triangle' }],
];
export const LINE_END_TYPES = [['无', 'none'], ['箭头', 'triangle'], ['开放箭头', 'arrow'], ['隐形箭头', 'stealth'], ['菱形', 'diamond'], ['椭圆/圆形', 'oval']];

/* ---- Effects ---- */
/** Shadow presets: [label, shadow] (null removes). */
export const SHADOW_PRESETS = [
  ['无阴影', null],
  ['偏移: 右下', { blur: 4 * PT, distance: 3 * PT, direction: 45, alpha: 0.4 }],
  ['偏移: 下', { blur: 4 * PT, distance: 3 * PT, direction: 90, alpha: 0.4 }],
  ['偏移: 左下', { blur: 4 * PT, distance: 3 * PT, direction: 135, alpha: 0.4 }],
  ['偏移: 右', { blur: 4 * PT, distance: 3 * PT, direction: 0, alpha: 0.4 }],
  ['居中阴影', { blur: 5 * PT, distance: 0, direction: 0, alpha: 0.4 }],
  ['偏移: 左', { blur: 4 * PT, distance: 3 * PT, direction: 180, alpha: 0.4 }],
  ['偏移: 右上', { blur: 4 * PT, distance: 3 * PT, direction: 315, alpha: 0.4 }],
  ['偏移: 上', { blur: 4 * PT, distance: 3 * PT, direction: 270, alpha: 0.4 }],
  ['偏移: 左上', { blur: 4 * PT, distance: 3 * PT, direction: 225, alpha: 0.4 }],
  ['柔化: 大', { blur: 12 * PT, distance: 4 * PT, direction: 90, alpha: 0.35 }],
  ['柔化: 宽', { blur: 20 * PT, distance: 0, direction: 0, alpha: 0.45 }],
];
export const REFLECTION_PRESETS = [
  ['无倒影', null],
  ['紧密接触', { blur: 6350, startAlpha: 0.52, endAlpha: 0.003, endPosition: 35000, distance: 0 }],
  ['半接触', { blur: 6350, startAlpha: 0.52, endAlpha: 0.003, endPosition: 55000, distance: 0 }],
  ['全接触', { blur: 6350, startAlpha: 0.52, endAlpha: 0.003, endPosition: 90000, distance: 0 }],
  ['紧密，4 磅偏移', { blur: 6350, startAlpha: 0.52, endAlpha: 0.003, endPosition: 35000, distance: 4 * PT }],
  ['半倒影，4 磅偏移', { blur: 6350, startAlpha: 0.52, endAlpha: 0.003, endPosition: 55000, distance: 4 * PT }],
  ['全倒影，8 磅偏移', { blur: 6350, startAlpha: 0.52, endAlpha: 0.003, endPosition: 90000, distance: 8 * PT }],
];
export const GLOW_SIZES = [5, 8, 11, 18];
export const SOFT_EDGE_PRESETS = [['无柔化边缘', 0], ['1 磅', 1], ['2.5 磅', 2.5], ['5 磅', 5], ['10 磅', 10], ['25 磅', 25], ['50 磅', 50]];
export const BEVEL_PRESETS = [['无棱台', null], ['圆形', { preset: 'circle', width: 6 * PT, height: 6 * PT }], ['角度', { preset: 'angle', width: 6 * PT, height: 6 * PT }], ['深圆形', { preset: 'circle', width: 10 * PT, height: 10 * PT }], ['窄角度', { preset: 'angle', width: 3 * PT, height: 3 * PT }]];
export const ROTATION_3D_PRESETS = [['无旋转', 'orthographicFront'], ['透视: 左', 'perspectiveLeft'], ['透视: 右', 'perspectiveRight']];

/* ---- Picture styles: original frames combining geometry, outline, shadow, glow, soft edges, reflection and bevel ---- */
const white = 'FFFFFF', black = '000000';
export const PICTURE_STYLES = [
  { id: 'simpleWhite', name: '简单白框', geometry: 'rect', outline: { color: white, width: 8 * PT }, effects: { shadow: { blur: 5 * PT, distance: 2 * PT, direction: 45, alpha: 0.35 } } },
  { id: 'simpleBlack', name: '简单黑框', geometry: 'rect', outline: { color: black, width: 6 * PT } },
  { id: 'thin', name: '灰色细线框', geometry: 'rect', outline: { color: '808080', width: PT } },
  { id: 'softShadow', name: '柔化边缘阴影', geometry: 'rect', effects: { shadow: { blur: 12 * PT, distance: 4 * PT, direction: 90, alpha: 0.35 } } },
  { id: 'dropShadow', name: '投影白色边框', geometry: 'rect', outline: { color: white, width: 3 * PT }, effects: { shadow: { blur: 6 * PT, distance: 6 * PT, direction: 45, alpha: 0.45 } } },
  { id: 'centerShadow', name: '居中阴影', geometry: 'rect', effects: { shadow: { blur: 18 * PT, distance: 0, direction: 0, alpha: 0.5 } } },
  { id: 'rounded', name: '圆角矩形', geometry: 'roundRect', effects: { shadow: { blur: 8 * PT, distance: 3 * PT, direction: 90, alpha: 0.3 } } },
  { id: 'roundedFrame', name: '圆角矩形边框', geometry: 'roundRect', outline: { color: white, width: 6 * PT }, effects: { shadow: { blur: 6 * PT, distance: 3 * PT, direction: 45, alpha: 0.4 } } },
  { id: 'oval', name: '椭圆', geometry: 'ellipse' },
  { id: 'ovalBorder', name: '椭圆白色边框', geometry: 'ellipse', outline: { color: white, width: 5 * PT }, effects: { shadow: { blur: 8 * PT, distance: 3 * PT, direction: 90, alpha: 0.35 } } },
  { id: 'softEdge', name: '柔化边缘矩形', geometry: 'rect', effects: { softEdge: { radius: 10 * PT } } },
  { id: 'softOval', name: '柔化边缘椭圆', geometry: 'ellipse', effects: { softEdge: { radius: 12 * PT } } },
  { id: 'glow', name: '主题发光', geometry: 'rect', effects: { glow: { radius: 8 * PT, color: { scheme: 'accent1' }, alpha: 0.5 } } },
  { id: 'reflected', name: '矩形倒影', geometry: 'rect', effects: { reflection: { blur: 6350, startAlpha: 0.5, endAlpha: 0.003, endPosition: 35000, distance: 0 } } },
  { id: 'reflectedRounded', name: '圆角矩形倒影', geometry: 'roundRect', effects: { reflection: { blur: 6350, startAlpha: 0.5, endAlpha: 0.003, endPosition: 35000, distance: 2 * PT } } },
  { id: 'bevel', name: '棱台', geometry: 'rect', bevel: { preset: 'circle', width: 6 * PT, height: 6 * PT } },
  { id: 'double', name: '双黑框', geometry: 'rect', outline: { color: black, width: 6 * PT, compound: 'dbl' } },
  { id: 'snip', name: '剪切对角矩形', geometry: 'snip2DiagRect', outline: { color: '404040', width: 2 * PT } },
  { id: 'hexagon', name: '六边形', geometry: 'hexagon', outline: { color: white, width: 3 * PT }, effects: { shadow: { blur: 6 * PT, distance: 2 * PT, direction: 90, alpha: 0.35 } } },
  { id: 'tilted', name: '倾斜白框', geometry: 'rect', rotation: 357, outline: { color: white, width: 8 * PT }, effects: { shadow: { blur: 8 * PT, distance: 4 * PT, direction: 60, alpha: 0.4 } } },
];

/* ---- Shape styles: theme colours in six treatments ---- */
export const SHAPE_STYLE_COLORS = ['dk1', ...ACCENTS];
export const SHAPE_STYLE_KINDS = [
  { id: 'outline', name: '彩色轮廓', build: (c, t) => ({ fill: { type: 'solid', color: themed('lt1', t) }, outline: { color: themed(c, t), width: PT } }) },
  { id: 'fill', name: '彩色填充', build: (c, t) => ({ fill: { type: 'solid', color: themed(c, t) }, outline: { color: themed(c, t, 50000), width: PT } }) },
  { id: 'light', name: '浅色填充', build: (c, t) => ({ fill: { type: 'solid', color: themed(c, t, 20000, 80000) }, outline: { color: themed(c, t), width: PT } }) },
  { id: 'subtle', name: '细微填充', build: (c, t) => ({ fill: { type: 'solid', color: themed(c, t, 40000, 60000) }, outline: { color: 'none' } }) },
  { id: 'gradient', name: '渐变填充', build: (c, t) => ({ fill: { type: 'gradient', angle: 90, stops: [{ position: 0, color: themed(c, t, 60000, 40000) }, { position: 100000, color: themed(c, t, 100000) }] }, outline: { color: 'none' }, effects: { shadow: { blur: 4 * PT, distance: 2 * PT, direction: 90, alpha: 0.3 } } }) },
  { id: 'intense', name: '强烈填充', build: (c, t) => ({ fill: { type: 'solid', color: themed(c, t) }, outline: { color: themed('lt1', t), width: 1.5 * PT }, effects: { shadow: { blur: 6 * PT, distance: 3 * PT, direction: 90, alpha: 0.45 } } }) },
];
export function shapeStyles(hasTheme) {
  return SHAPE_STYLE_KINDS.flatMap(kind => SHAPE_STYLE_COLORS.map(color => ({ id: `${kind.id}-${color}`, name: `${kind.name}: ${THEME_NAMES[color]}`, kind: kind.id, color, ...kind.build(color, hasTheme) })));
}

/* ---- Fills ---- */
/** Gradient presets from a base colour: [label, (rgb) → setFill gradient]. */
export const GRADIENT_PRESETS = [
  ['线性下移', base => ({ type: 'gradient', angle: 90, stops: [{ position: 0, color: { ...base, lumMod: 40000, lumOff: 60000 } }, { position: 100000, color: base }] })],
  ['线性上移', base => ({ type: 'gradient', angle: 270, stops: [{ position: 0, color: { ...base, lumMod: 40000, lumOff: 60000 } }, { position: 100000, color: base }] })],
  ['线性向右', base => ({ type: 'gradient', angle: 0, stops: [{ position: 0, color: { ...base, lumMod: 40000, lumOff: 60000 } }, { position: 100000, color: base }] })],
  ['线性向左', base => ({ type: 'gradient', angle: 180, stops: [{ position: 0, color: { ...base, lumMod: 40000, lumOff: 60000 } }, { position: 100000, color: base }] })],
  ['对角线渐变', base => ({ type: 'gradient', angle: 45, stops: [{ position: 0, color: { ...base, lumMod: 40000, lumOff: 60000 } }, { position: 100000, color: base }] })],
  ['从中心辐射', base => ({ type: 'gradient', path: 'circle', stops: [{ position: 0, color: { ...base, lumMod: 40000, lumOff: 60000 } }, { position: 100000, color: base }] })],
];
/** Pattern presets (§20.1.10.51 ST_PresetPatternVal). */
export const PATTERN_PRESETS = [['5%', 'pct5'], ['20%', 'pct20'], ['50%', 'pct50'], ['浅色水平线', 'ltHorz'], ['浅色垂直线', 'ltVert'], ['浅色上对角线', 'ltUpDiag'], ['浅色下对角线', 'ltDnDiag'], ['小网格', 'smGrid'], ['大网格', 'lgGrid'], ['小棋盘', 'smCheck'], ['虚线菱形', 'dotDmnd'], ['水平砖形', 'horzBrick'], ['编织', 'weave'], ['波浪', 'wave'], ['锯齿形', 'zigZag'], ['木质木瓦', 'shingle']];

/** Crop aspect ratios: [label, width / height]. */
export const ASPECT_RATIOS = [['正方形 1:1', 1], ['纵向 2:3', 2 / 3], ['纵向 3:4', 3 / 4], ['纵向 4:5', 4 / 5], ['横向 3:2', 3 / 2], ['横向 4:3', 4 / 3], ['横向 5:4', 5 / 4], ['横向 16:9', 16 / 9], ['横向 16:10', 16 / 10]];
/** Compress Pictures resolutions (pixels per inch). */
export const RESOLUTIONS = [['高保真 (保留原图)', 0], ['打印 (220 ppi)', 220], ['Web (150 ppi)', 150], ['电子邮件 (96 ppi)', 96]];
