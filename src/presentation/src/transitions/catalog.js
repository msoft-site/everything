// The slide transitions the editor offers, grouped as the gallery shows them,
// with each one's effect options and default duration.
//
// A gallery entry names the file effect it writes (`effect`, plus attributes
// from the chosen option) and recognizes the effects it stands for when a
// deck is read (`matches`). Options are written as partial TransitionOptions
// for lib/pptx `setSlideTransition`; reading compares them after filling in
// the file format's attribute defaults, so an imported `<p:push/>` is "From
// Right" without a `dir` attribute.

const side = (labels = {}) => [
  { id: "u", label: labels.u || "自底部", set: { direction: "u" } },
  { id: "r", label: labels.r || "自左侧", set: { direction: "r" } },
  { id: "l", label: labels.l || "自右侧", set: { direction: "l" } },
  { id: "d", label: labels.d || "自顶部", set: { direction: "d" } },
];
const eight = () => [
  { id: "l", label: "自右侧", set: { direction: "l" } },
  { id: "d", label: "自顶部", set: { direction: "d" } },
  { id: "r", label: "自左侧", set: { direction: "r" } },
  { id: "u", label: "自底部", set: { direction: "u" } },
  { id: "ld", label: "自右上", set: { direction: "ld" } },
  { id: "lu", label: "自右下", set: { direction: "lu" } },
  { id: "rd", label: "自左上", set: { direction: "rd" } },
  { id: "ru", label: "自左下", set: { direction: "ru" } },
];
const cubeSides = () => [
  { id: "l", label: "自右侧", set: { direction: "l" } },
  { id: "d", label: "自顶部", set: { direction: "d" } },
  { id: "r", label: "自左侧", set: { direction: "r" } },
  { id: "u", label: "自底部", set: { direction: "u" } },
];
const leftRight = (first = "r") =>
  first === "r"
    ? [
        { id: "r", label: "向右", set: { direction: "r" } },
        { id: "l", label: "向左", set: { direction: "l" } },
      ]
    : [
        { id: "l", label: "自右侧", set: { direction: "l" } },
        { id: "r", label: "自左侧", set: { direction: "r" } },
      ];
const inverted = (first, second) => [
  { id: "a", label: first, set: { invertX: false } },
  { id: "b", label: second, set: { invertX: true } },
];
const orient = (first = "vert") => {
  const items = [
    { id: "vert", label: "垂直", set: { direction: "vert" } },
    { id: "horz", label: "水平", set: { direction: "horz" } },
  ];
  return first === "vert" ? items : items.reverse();
};

// Attribute defaults the file format gives each effect when an attribute is
// omitted (ECMA-376 pml.xsd and the 2010 extension schema).
const DEFAULTS = {
  push: { direction: "l" },
  wipe: { direction: "l" },
  cover: { direction: "l" },
  pull: { direction: "l" },
  strips: { direction: "lu" },
  split: { orientation: "horz", direction: "out" },
  randomBar: { direction: "horz" },
  blinds: { direction: "horz" },
  checker: { direction: "horz" },
  comb: { direction: "horz" },
  zoom: { direction: "out" },
  warp: { direction: "out" },
  flythrough: { direction: "in", hasBounce: false },
  shred: { pattern: "strip", direction: "in" },
  glitter: { pattern: "diamond", direction: "l" },
  vortex: { direction: "l" },
  prism: { direction: "l", isContent: false, isInverted: false },
  pan: { direction: "l" },
  doors: { direction: "vert" },
  window: { direction: "vert" },
  ripple: { direction: "center" },
  switch: { direction: "r" },
  flip: { direction: "r" },
  gallery: { direction: "l" },
  ferris: { direction: "l" },
  conveyor: { direction: "l" },
  reveal: { direction: "l", thruBlack: false },
  fade: { thruBlack: false },
  cut: { thruBlack: false },
  wheel: { spokes: 4 },
  wheelReverse: { spokes: 4 },
  morph: { morphOption: "byObject" },
};
const PRESET_DEFAULTS = { invertX: false, invertY: false };
const PRESETS = new Set([
  "fallOver",
  "drape",
  "curtains",
  "wind",
  "prestige",
  "fracture",
  "crush",
  "peelOff",
  "pageCurlDouble",
  "pageCurlSingle",
  "airplane",
  "origami",
]);

/** A transition's effect attributes with the format's defaults filled in. */
export function withDefaults(t) {
  if (!t) return t;
  const defaults = PRESETS.has(t.effect)
    ? PRESET_DEFAULTS
    : DEFAULTS[t.effect] || {};
  const out = { ...t };
  for (const [key, value] of Object.entries(defaults))
    if (out[key] === undefined) out[key] = value;
  return out;
}

const is =
  (...effects) =>
  (t) =>
    effects.includes(t.effect);

/** Gallery groups, in order. */
export const TRANSITION_GROUPS = [
  { id: "subtle", label: "细微" },
  { id: "exciting", label: "华丽" },
  { id: "dynamic", label: "动态内容" },
];

// Durations are milliseconds.
export const TRANSITIONS = [
  {
    id: "none",
    label: "无",
    group: "subtle",
    description: "直接显示幻灯片，不使用切换效果。",
    write: { effect: "none" },
    matches: is("none"),
    duration: 0,
  },
  {
    id: "morph",
    label: "平滑",
    group: "subtle",
    description:
      "上一张幻灯片中的对象会平滑移动到当前幻灯片所在位置；仅存在于单张幻灯片中的对象会淡入或淡出。在复制幻灯片并移动、缩放或重新着色时效果最佳。",
    write: { effect: "morph" },
    matches: is("morph"),
    options: [
      { id: "byObject", label: "对象", set: { morphOption: "byObject" } },
      { id: "byWord", label: "单词", set: { morphOption: "byWord" } },
      { id: "byChar", label: "字符", set: { morphOption: "byChar" } },
    ],
    duration: 2000,
  },
  {
    id: "fade",
    label: "淡出",
    group: "subtle",
    description: "上一张幻灯片逐渐淡化消失，同时显示当前幻灯片。",
    write: { effect: "fade" },
    matches: is("fade"),
    options: [
      { id: "smooth", label: "平滑", set: { thruBlack: false } },
      { id: "black", label: "黑屏", set: { thruBlack: true } },
    ],
    duration: 700,
  },
  {
    id: "push",
    label: "推进",
    group: "subtle",
    description: "当前幻灯片滑入并将上一张幻灯片推移出去。",
    write: { effect: "push" },
    matches: is("push"),
    options: side(),
    defaultOption: "u",
    duration: 1000,
  },
  {
    id: "wipe",
    label: "擦除",
    group: "subtle",
    description: "柔和边缘横向扫过，呈现当前幻灯片。",
    write: { effect: "wipe" },
    matches: is("wipe", "strips"),
    options: [
      { id: "l", label: "自右侧", set: { effect: "wipe", direction: "l" } },
      { id: "d", label: "自顶部", set: { effect: "wipe", direction: "d" } },
      { id: "r", label: "自左侧", set: { effect: "wipe", direction: "r" } },
      {
        id: "u",
        label: "自底部",
        set: { effect: "wipe", direction: "u" },
      },
      {
        id: "ld",
        label: "自右上",
        set: { effect: "strips", direction: "ld" },
      },
      {
        id: "lu",
        label: "自右下",
        set: { effect: "strips", direction: "lu" },
      },
      {
        id: "rd",
        label: "自左上",
        set: { effect: "strips", direction: "rd" },
      },
      {
        id: "ru",
        label: "自左下",
        set: { effect: "strips", direction: "ru" },
      },
    ],
    duration: 1000,
  },
  {
    id: "split",
    label: "拆分",
    group: "subtle",
    description: "上一张幻灯片从中间裂开并展现当前幻灯片。",
    write: { effect: "split" },
    matches: is("split"),
    options: [
      {
        id: "vert-out",
        label: "左右向外",
        set: { orientation: "vert", direction: "out" },
      },
      {
        id: "vert-in",
        label: "左右向内",
        set: { orientation: "vert", direction: "in" },
      },
      {
        id: "horz-out",
        label: "上下向外",
        set: { orientation: "horz", direction: "out" },
      },
      {
        id: "horz-in",
        label: "上下向内",
        set: { orientation: "horz", direction: "in" },
      },
    ],
    duration: 1500,
  },
  {
    id: "reveal",
    label: "显示",
    group: "subtle",
    description:
      "上一张幻灯片飘移淡出，随后当前幻灯片就位。",
    write: { effect: "reveal" },
    matches: is("reveal"),
    options: [
      {
        id: "smooth-l",
        label: "自右侧平滑",
        set: { thruBlack: false, direction: "l" },
      },
      {
        id: "smooth-r",
        label: "自左侧平滑",
        set: { thruBlack: false, direction: "r" },
      },
      {
        id: "black-l",
        label: "自右侧黑屏",
        set: { thruBlack: true, direction: "l" },
      },
      {
        id: "black-r",
        label: "自左侧黑屏",
        set: { thruBlack: true, direction: "r" },
      },
    ],
    duration: 2000,
  },
  {
    id: "cut",
    label: "剪切",
    group: "subtle",
    description: "当前幻灯片瞬间替换上一张幻灯片。",
    write: { effect: "cut" },
    matches: is("cut"),
    options: [
      { id: "cut", label: "剪切", set: { thruBlack: false } },
      { id: "black", label: "黑屏", set: { thruBlack: true } },
    ],
    duration: 100,
  },
  {
    id: "randomBar",
    label: "随机线条",
    group: "subtle",
    description: "随机填充当前幻灯片的细线条条纹。",
    write: { effect: "randomBar" },
    matches: is("randomBar"),
    options: orient("vert"),
    duration: 1000,
  },
  {
    id: "shape",
    label: "形状",
    group: "subtle",
    description: "放大或缩小的形状展开并呈现当前幻灯片。",
    write: { effect: "circle" },
    matches: is("circle", "diamond", "plus", "zoom"),
    options: [
      { id: "circle", label: "圆形", set: { effect: "circle" } },
      { id: "diamond", label: "菱形", set: { effect: "diamond" } },
      { id: "plus", label: "加号", set: { effect: "plus" } },
      { id: "in", label: "向内", set: { effect: "zoom", direction: "in" } },
      { id: "out", label: "向外", set: { effect: "zoom", direction: "out" } },
    ],
    duration: 2000,
  },
  {
    id: "uncover",
    label: "揭开",
    group: "subtle",
    description: "上一张幻灯片滑走，揭开显示当前幻灯片。",
    write: { effect: "pull" },
    matches: is("pull"),
    options: eight(),
    duration: 1000,
  },
  {
    id: "cover",
    label: "覆盖",
    group: "subtle",
    description: "当前幻灯片滑入并覆盖在上一张幻灯片之上。",
    write: { effect: "cover" },
    matches: is("cover"),
    options: eight(),
    duration: 1000,
  },
  {
    id: "flash",
    label: "闪光",
    group: "subtle",
    description: "一道闪光切换到当前幻灯片。",
    write: { effect: "flash" },
    matches: is("flash"),
    duration: 1000,
  },
  {
    id: "fallOver",
    label: "跌落",
    group: "exciting",
    description: "上一张幻灯片向后倒下，展示当前幻灯片。",
    write: { effect: "fallOver" },
    matches: is("fallOver"),
    options: inverted("从左侧", "从右侧"),
    duration: 2000,
  },
  {
    id: "drape",
    label: "帘式",
    group: "exciting",
    description: "当前幻灯片如织物般垂落覆盖在上一张幻灯片上。",
    write: { effect: "drape" },
    matches: is("drape"),
    options: inverted("从左侧", "从右侧"),
    duration: 2000,
  },
  {
    id: "curtains",
    label: "窗帘",
    group: "exciting",
    description:
      "上一张幻灯片从中间分开并拉向两侧。",
    write: { effect: "curtains" },
    matches: is("curtains"),
    duration: 2000,
  },
  {
    id: "wind",
    label: "大风",
    group: "exciting",
    description: "上一张幻灯片随风起伏并吹向侧方。",
    write: { effect: "wind" },
    matches: is("wind"),
    options: inverted("Right", "Left"),
    duration: 2000,
  },
  {
    id: "prestige",
    label: "威严",
    group: "exciting",
    description: "上一张幻灯片从顶部边缘抬起离开。",
    write: { effect: "prestige" },
    matches: is("prestige"),
    duration: 2000,
  },
  {
    id: "fracture",
    label: "破碎",
    group: "exciting",
    description: "上一张幻灯片碎裂成碎片并翻滚散落。",
    write: { effect: "fracture" },
    matches: is("fracture"),
    duration: 2000,
  },
  {
    id: "crush",
    label: "压碎",
    group: "exciting",
    description: "上一张幻灯片揉成一团并被抛出。",
    write: { effect: "crush" },
    matches: is("crush"),
    duration: 2000,
  },
  {
    id: "peelOff",
    label: "剥离",
    group: "exciting",
    description: "上一张幻灯片从一角被剥离卷起。",
    write: { effect: "peelOff" },
    matches: is("peelOff"),
    options: inverted("从左侧", "从右侧"),
    duration: 2000,
  },
  {
    id: "pageCurl",
    label: "卷页",
    group: "exciting",
    description: "上一张幻灯片像书页一样翻卷翻过。",
    write: { effect: "pageCurlDouble" },
    matches: is("pageCurlDouble", "pageCurlSingle"),
    options: [
      {
        id: "double-l",
        label: "双向向左",
        set: { effect: "pageCurlDouble", invertX: false },
      },
      {
        id: "double-r",
        label: "双向向右",
        set: { effect: "pageCurlDouble", invertX: true },
      },
      {
        id: "single-l",
        label: "单向向左",
        set: { effect: "pageCurlSingle", invertX: false },
      },
      {
        id: "single-r",
        label: "单向向右",
        set: { effect: "pageCurlSingle", invertX: true },
      },
    ],
    duration: 2000,
  },
  {
    id: "airplane",
    label: "飞机",
    group: "exciting",
    description: "上一张幻灯片折叠成纸飞机飞走。",
    write: { effect: "airplane" },
    matches: is("airplane"),
    options: inverted("Right", "Left"),
    duration: 2000,
  },
  {
    id: "origami",
    label: "折纸",
    group: "exciting",
    description: "上一张幻灯片折叠成纸鸟飞走。",
    write: { effect: "origami" },
    matches: is("origami"),
    options: inverted("Right", "Left"),
    duration: 2000,
  },
  {
    id: "dissolve",
    label: "溶解",
    group: "exciting",
    description: "上一张幻灯片化作微粒逐渐转变为当前幻灯片。",
    write: { effect: "dissolve" },
    matches: is("dissolve"),
    duration: 1200,
  },
  {
    id: "checker",
    label: "棋盘",
    group: "exciting",
    description: "方块逐一翻转呈现当前幻灯片。",
    write: { effect: "checker" },
    matches: is("checker"),
    options: [
      { id: "horz", label: "自左侧", set: { direction: "horz" } },
      { id: "vert", label: "自顶部", set: { direction: "vert" } },
    ],
    duration: 1600,
  },
  {
    id: "blinds",
    label: "百叶窗",
    group: "exciting",
    description: "百叶条像百叶窗一样翻转。",
    write: { effect: "blinds" },
    matches: is("blinds"),
    options: orient("vert"),
    duration: 1600,
  },
  {
    id: "clock",
    label: "时钟",
    group: "exciting",
    description: "指针旋转扫过揭开当前幻灯片。",
    write: { effect: "wheel", spokes: 1 },
    matches: is("wheel", "wheelReverse", "wedge"),
    options: [
      {
        id: "cw",
        label: "顺时针",
        set: { effect: "wheel", spokes: 1 },
      },
      {
        id: "ccw",
        label: "逆时针",
        set: { effect: "wheelReverse", spokes: 1 },
      },
      { id: "wedge", label: "楔入", set: { effect: "wedge" } },
    ],
    duration: 2000,
  },
  {
    id: "ripple",
    label: "涟漪",
    group: "exciting",
    description: "上一张幻灯片泛起水波涟漪，呈现当前幻灯片。",
    write: { effect: "ripple" },
    matches: is("ripple"),
    options: [
      { id: "center", label: "居中", set: { direction: "center" } },
      { id: "lu", label: "自左上", set: { direction: "lu" } },
      { id: "ru", label: "自右上", set: { direction: "ru" } },
      { id: "ld", label: "自左下", set: { direction: "ld" } },
      { id: "rd", label: "自右下", set: { direction: "rd" } },
    ],
    duration: 1400,
  },
  {
    id: "honeycomb",
    label: "蜂巢",
    group: "exciting",
    description: "六边形蜂巢网格在幻灯片上展开。",
    write: { effect: "honeycomb" },
    matches: is("honeycomb"),
    duration: 3000,
  },
  {
    id: "glitter",
    label: "闪烁",
    group: "exciting",
    description: "闪烁的微小瓦片翻转铺展至整张幻灯片。",
    write: { effect: "glitter" },
    matches: is("glitter"),
    options: [
      ["diamond", "菱形"],
      ["hexagon", "六边形"],
    ].flatMap(([pattern, name]) =>
      [
        ["r", "从左侧"],
        ["d", "从顶部"],
        ["l", "从右侧"],
        ["u", "从底部"],
      ].map(([direction, where]) => ({
        id: `${pattern}-${direction}`,
        label: `${name} ${where}`,
        set: { pattern, direction },
      })),
    ),
    defaultOption: "diamond-r",
    duration: 2500,
  },
  {
    id: "vortex",
    label: "涡流",
    group: "exciting",
    description:
      "幻灯片在瓦片漩涡中盘旋散开并重新聚集。",
    write: { effect: "vortex" },
    matches: is("vortex"),
    options: side(),
    defaultOption: "r",
    duration: 3000,
  },
  {
    id: "shred",
    label: "撕裂",
    group: "exciting",
    description: "上一张幻灯片被裁切成碎片并转变为当前幻灯片。",
    write: { effect: "shred" },
    matches: is("shred"),
    options: [
      {
        id: "strip-in",
        label: "条纹向内",
        set: { pattern: "strip", direction: "in" },
      },
      {
        id: "strip-out",
        label: "条纹向外",
        set: { pattern: "strip", direction: "out" },
      },
      {
        id: "rect-in",
        label: "粒子向内",
        set: { pattern: "rectangle", direction: "in" },
      },
      {
        id: "rect-out",
        label: "粒子向外",
        set: { pattern: "rectangle", direction: "out" },
      },
    ],
    duration: 2000,
  },
  {
    id: "switch",
    label: "开关",
    group: "exciting",
    description: "两张幻灯片前后交换位置。",
    write: { effect: "switch" },
    matches: is("switch"),
    options: leftRight("r"),
    duration: 1250,
  },
  {
    id: "flip",
    label: "翻转",
    group: "exciting",
    description: "幻灯片翻转过来，显示背面的当前幻灯片。",
    write: { effect: "flip" },
    matches: is("flip"),
    options: leftRight("r"),
    duration: 1250,
  },
  {
    id: "gallery",
    label: "画廊",
    group: "exciting",
    description: "幻灯片像画廊墙上的画作一样滑过。",
    write: { effect: "gallery" },
    matches: is("gallery"),
    options: leftRight("l"),
    duration: 1600,
  },
  {
    id: "cube",
    label: "立方体",
    group: "exciting",
    description: "幻灯片附在旋转立方体的各个面上。",
    write: { effect: "prism" },
    matches: (t) => t.effect === "prism" && !t.isContent && !t.isInverted,
    options: cubeSides(),
    duration: 1250,
  },
  {
    id: "doors",
    label: "门",
    group: "exciting",
    description: "上一张幻灯片像双扇门一样向两侧推开。",
    write: { effect: "doors" },
    matches: is("doors"),
    options: orient("vert"),
    duration: 1400,
  },
  {
    id: "box",
    label: "框",
    group: "exciting",
    description: "幻灯片附在旋转方盒的内壁上。",
    write: { effect: "prism", isInverted: true },
    matches: (t) => t.effect === "prism" && !t.isContent && !!t.isInverted,
    options: cubeSides(),
    duration: 1600,
  },
  {
    id: "comb",
    label: "梳理",
    group: "exciting",
    description: "上一张幻灯片的梳齿依次交错滑开。",
    write: { effect: "comb" },
    matches: is("comb"),
    options: orient("horz"),
    duration: 1000,
  },
  {
    id: "zoom",
    label: "缩放",
    group: "exciting",
    description: "视角放大或缩小以进入当前幻灯片。",
    write: { effect: "warp", direction: "in" },
    matches: is("warp", "newsflash"),
    options: [
      { id: "in", label: "向内", set: { effect: "warp", direction: "in" } },
      { id: "out", label: "向外", set: { effect: "warp", direction: "out" } },
      {
        id: "rotate",
        label: "缩放并旋转",
        set: { effect: "newsflash" },
      },
    ],
    duration: 1000,
  },
  {
    id: "random",
    label: "随机",
    group: "exciting",
    description: "每次放映时随机挑选不同的切换效果。",
    write: { effect: "random" },
    matches: is("random"),
    duration: 2000,
  },
  {
    id: "pan",
    label: "平移",
    group: "dynamic",
    description:
      "幻灯片背景保持静止，内容平滑横向滑过。",
    write: { effect: "pan" },
    matches: is("pan"),
    options: side(),
    defaultOption: "u",
    duration: 1000,
  },
  {
    id: "ferris",
    label: "摩天轮",
    group: "dynamic",
    description: "内容如摩天轮般旋转回环滑走。",
    write: { effect: "ferris" },
    matches: is("ferris"),
    options: leftRight("l"),
    duration: 2000,
  },
  {
    id: "conveyor",
    label: "传送带",
    group: "dynamic",
    description: "内容像在传送带上一样滑出，新内容到达。",
    write: { effect: "conveyor" },
    matches: is("conveyor"),
    options: leftRight("l"),
    duration: 2000,
  },
  {
    id: "rotate",
    label: "旋转",
    group: "dynamic",
    description: "内容绕轴旋转展示下一张幻灯片。",
    write: { effect: "prism", isContent: true },
    matches: (t) => t.effect === "prism" && !!t.isContent && !t.isInverted,
    options: cubeSides(),
    duration: 1250,
  },
  {
    id: "window",
    label: "窗口",
    group: "dynamic",
    description: "内容如百叶窗扇般打开进入下一内容。",
    write: { effect: "window" },
    matches: is("window"),
    options: orient("vert"),
    duration: 1250,
  },
  {
    id: "orbit",
    label: "轨道",
    group: "dynamic",
    description: "当前内容环绕滑出，下一内容环绕滑入。",
    write: { effect: "prism", isContent: true, isInverted: true },
    matches: (t) => t.effect === "prism" && !!t.isContent && !!t.isInverted,
    options: cubeSides(),
    duration: 1250,
  },
  {
    id: "flythrough",
    label: "飞过",
    group: "dynamic",
    description: "当前内容掠过视野，下一内容飞入。",
    write: { effect: "flythrough" },
    matches: is("flythrough"),
    options: [
      { id: "in", label: "向内", set: { direction: "in", hasBounce: false } },
      {
        id: "in-bounce",
        label: "弹跳向内",
        set: { direction: "in", hasBounce: true },
      },
      { id: "out", label: "向外", set: { direction: "out", hasBounce: false } },
      {
        id: "out-bounce",
        label: "弹跳向外",
        set: { direction: "out", hasBounce: true },
      },
    ],
    duration: 1000,
  },
];

const BY_ID = new Map(TRANSITIONS.map((entry) => [entry.id, entry]));
export const transitionEntry = (id) => BY_ID.get(id) || null;

/** The effect tokens any entry can play. */
export const PLAYABLE_EFFECTS = new Set([
  "none",
  "fade",
  "push",
  "wipe",
  "strips",
  "split",
  "reveal",
  "cut",
  "randomBar",
  "circle",
  "diamond",
  "plus",
  "zoom",
  "pull",
  "cover",
  "flash",
  ...PRESETS,
  "dissolve",
  "checker",
  "blinds",
  "wheel",
  "wheelReverse",
  "wedge",
  "ripple",
  "honeycomb",
  "glitter",
  "vortex",
  "shred",
  "switch",
  "flip",
  "gallery",
  "prism",
  "doors",
  "comb",
  "warp",
  "newsflash",
  "random",
  "pan",
  "ferris",
  "conveyor",
  "window",
  "flythrough",
  "morph",
]);

// An option that names its own effect replaces the entry's whole effect.
const written = (entry, option) =>
  option?.set?.effect
    ? { ...option.set }
    : { ...entry.write, ...(option?.set || {}) };
const optionMatches = (option, t, entry) => {
  const full = withDefaults(written(entry, option));
  const actual = withDefaults(t);
  return Object.keys(full).every((key) => {
    const want = full[key],
      have = actual[key];
    if (typeof want === "boolean") return !!have === want;
    return have === want;
  });
};

/**
 * The gallery entry and option a transition read from a deck stands for.
 * `{ id: "other" }` is a transition no entry knows (kept as authored).
 */
export function identifyTransition(t) {
  if (!t || t.effect === "none") return { id: "none", option: null };
  const entry = TRANSITIONS.find(
    (candidate) => candidate.id !== "none" && candidate.matches(t),
  );
  if (!entry) return { id: "other", option: null };
  const option = entry.options?.find((o) => optionMatches(o, t, entry));
  return { id: entry.id, option: option?.id ?? null };
}

/** The default option of an entry. */
export const defaultOption = (entry) =>
  entry.options?.find((o) => o.id === entry.defaultOption) ||
  entry.options?.[0] ||
  null;

// Effect attributes a transition carries; everything else (timing, sound) is
// kept when the effect changes.
const EFFECT_KEYS = [
  "effect",
  "direction",
  "orientation",
  "thruBlack",
  "invertX",
  "invertY",
  "spokes",
  "pattern",
  "isContent",
  "isInverted",
  "hasBounce",
  "morphOption",
];
export const stripEffect = (t) => {
  const out = { ...(t || {}) };
  for (const key of EFFECT_KEYS) delete out[key];
  return out;
};

/** Speed token that best describes a duration, for readers without p14:dur. */
export const speedFor = (ms) =>
  ms <= 500 ? "fast" : ms <= 750 ? "med" : "slow";

/**
 * The TransitionOptions for choosing `id` (and an option) on a slide whose
 * current transition is `current`: the entry's effect with its default
 * duration, keeping the slide's advance timing and sound.
 */
export function transitionFor(id, optionId, current) {
  const entry = transitionEntry(id);
  if (!entry) return null;
  const keep = stripEffect(current);
  if (id === "none") return clean({ ...keep, effect: "none" });
  const option =
    entry.options?.find((o) => o.id === optionId) || defaultOption(entry);
  // A slide that already has a transition keeps its timing when the effect
  // changes; one taking its first transition gets the effect's own duration.
  const timed =
    !!current?.effect &&
    (current.effect !== "none" ||
      current.durationMs !== undefined ||
      current.speed !== undefined);
  const durationMs = timed ? current.durationMs : entry.duration;
  const speed = timed
    ? (current.speed ??
      (durationMs === undefined ? "fast" : speedFor(durationMs)))
    : speedFor(durationMs);
  return clean({ ...keep, ...written(entry, option), durationMs, speed });
}

// Drop false defaults that only make the XML noisier.
function clean(t) {
  const out = {};
  for (const [key, value] of Object.entries(t)) {
    if (value === undefined) continue;
    if (
      value === false &&
      [
        "thruBlack",
        "invertX",
        "invertY",
        "isContent",
        "isInverted",
        "hasBounce",
      ].includes(key)
    )
      continue;
    out[key] = value;
  }
  return out;
}

/** Duration of a transition in ms: the authored one, else its speed. */
export const transitionDurationMs = (t) =>
  t?.durationMs ?? { fast: 500, med: 750, slow: 1000 }[t?.speed ?? "fast"];
