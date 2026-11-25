// Equations: typed as TeX-style math with palettes of structures and
// symbols, drawn by our own layout (src/insert/math) and placed as an SVG
// picture with a PNG stand-in. The source travels in the picture's object
// data and alt text, so double-clicking it opens it for editing again.
import { el, dialog } from "../ui.js";
import { renderMathSvg, browserMeasure } from "./math/layout.js";
import { PLACEHOLDER } from "./math/parse.js";
import { SYMBOLS, SYMBOL_PALETTE } from "./math/symbols.js";
import { svgToPng, svgDataUrl } from "./util.js";

const P_ = PLACEHOLDER;
// Structures, by group: [label, source]. ⬚ marks a slot to fill in.
export const STRUCTURES = [
  [
    "分式",
    [
      ["竖式分数", `\\frac{${P_}}{${P_}}`],
      ["小分数", `\\tfrac{${P_}}{${P_}}`],
      ["横式分数", `${P_}/${P_}`],
      ["dy/dx", "\\frac{dy}{dx}"],
      ["偏导数", `\\frac{\\partial ${P_}}{\\partial ${P_}}`],
    ],
  ],
  [
    "上下标",
    [
      ["上标", `${P_}^{${P_}}`],
      ["下标", `${P_}_{${P_}}`],
      ["带下标和上标", `${P_}_{${P_}}^{${P_}}`],
      ["x 平方", "x^2"],
      ["e^{-iωt}", "e^{-i\\omega t}"],
    ],
  ],
  [
    "根式",
    [
      ["平方根", `\\sqrt{${P_}}`],
      ["带根指数的根式", `\\sqrt[${P_}]{${P_}}`],
      ["立方根", `\\sqrt[3]{${P_}}`],
      ["二次根式公式", "\\sqrt{a^2+b^2}"],
    ],
  ],
  [
    "积分",
    [
      ["积分", `\\int ${P_}\\,d${P_}`],
      ["定积分", `\\int_{${P_}}^{${P_}} ${P_}\\,d${P_}`],
      ["二重积分", `\\iint ${P_}\\,dA`],
      ["三重积分", `\\iiint ${P_}\\,dV`],
      ["曲线积分", `\\oint ${P_}\\,d${P_}`],
    ],
  ],
  [
    "大型运算符",
    [
      ["求和", `\\sum_{${P_}}^{${P_}} ${P_}`],
      ["乘积", `\\prod_{${P_}}^{${P_}} ${P_}`],
      ["并集", `\\bigcup_{${P_}} ${P_}`],
      ["交集", `\\bigcap_{${P_}} ${P_}`],
      ["k 项求和", "\\sum_{k=0}^{n} a_k"],
    ],
  ],
  [
    "括号",
    [
      ["圆括号", `\\left(${P_}\\right)`],
      ["方括号", `\\left[${P_}\\right]`],
      ["大括号", `\\left\\{${P_}\\right\\}`],
      ["绝对值", `\\left|${P_}\\right|`],
      ["范数", `\\left\\|${P_}\\right\\|`],
      ["尖括号", `\\left\\langle ${P_}\\right\\rangle`],
      ["向下取整", `\\left\\lfloor ${P_}\\right\\rfloor`],
      ["向上取整", `\\left\\lceil ${P_}\\right\\rceil`],
      ["条件分支", `\\begin{cases} ${P_} & ${P_} \\\\ ${P_} & ${P_} \\end{cases}`],
      ["二项式", `\\binom{${P_}}{${P_}}`],
    ],
  ],
  [
    "函数",
    [
      ["正弦", `\\sin ${P_}`],
      ["余弦", `\\cos ${P_}`],
      ["正切", `\\tan ${P_}`],
      ["自然对数", `\\ln ${P_}`],
      ["带底对数", `\\log_{${P_}} ${P_}`],
      ["指数函数", `\\exp ${P_}`],
      ["反正弦", `\\arcsin ${P_}`],
      ["双曲正弦", `\\sinh ${P_}`],
    ],
  ],
  [
    "重音符",
    [
      ["帽子", `\\hat{${P_}}`],
      ["横线", `\\bar{${P_}}`],
      ["向量", `\\vec{${P_}}`],
      ["一点", `\\dot{${P_}}`],
      ["两点", `\\ddot{${P_}}`],
      ["波浪号", `\\tilde{${P_}}`],
      ["上划线", `\\overline{${P_}}`],
      ["下划线", `\\underline{${P_}}`],
      ["上方箭头", `\\overrightarrow{${P_}}`],
      ["上花括号", `\\overbrace{${P_}}`],
      ["下花括号", `\\underbrace{${P_}}`],
    ],
  ],
  [
    "极限和对数",
    [
      ["极限", `\\lim_{${P_}\\to ${P_}} ${P_}`],
      ["趋于无穷大极限", `\\lim_{n\\to\\infty} ${P_}`],
      ["最大值", `\\max_{${P_}} ${P_}`],
      ["最小值", `\\min_{${P_}} ${P_}`],
      ["对数", `\\log ${P_}`],
    ],
  ],
  [
    "运算符",
    [
      ["定义为", "\\coloneqq"],
      ["按定义等于", "\\triangleq"],
      ["箭头上方标注", `\\overset{${P_}}{\\rightarrow}`],
      ["箭头下方标注", `\\underset{${P_}}{\\rightarrow}`],
      ["Delta 等于", "\\overset{\\Delta}{=}"],
    ],
  ],
  [
    "矩阵",
    [
      [
        "2 × 2 矩阵",
        `\\begin{matrix} ${P_} & ${P_} \\\\ ${P_} & ${P_} \\end{matrix}`,
      ],
      [
        "2 × 2 圆括号矩阵",
        `\\begin{pmatrix} ${P_} & ${P_} \\\\ ${P_} & ${P_} \\end{pmatrix}`,
      ],
      [
        "2 × 2 方括号矩阵",
        `\\begin{bmatrix} ${P_} & ${P_} \\\\ ${P_} & ${P_} \\end{bmatrix}`,
      ],
      [
        "行列式",
        `\\begin{vmatrix} ${P_} & ${P_} \\\\ ${P_} & ${P_} \\end{vmatrix}`,
      ],
      [
        "3 × 3 矩阵",
        `\\begin{pmatrix} ${P_} & ${P_} & ${P_} \\\\ ${P_} & ${P_} & ${P_} \\\\ ${P_} & ${P_} & ${P_} \\end{pmatrix}`,
      ],
      [
        "列向量",
        `\\begin{pmatrix} ${P_} \\\\ ${P_} \\\\ ${P_} \\end{pmatrix}`,
      ],
      ["单位矩阵", "\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}"],
    ],
  ],
];

// Well-known formulas offered from the Equation button.
export const BUILT_IN_EQUATIONS = [
  ["圆的面积", "A=\\pi r^2"],
  ["一元二次方程求根公式", "x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}"],
  ["勾股定理", "a^2+b^2=c^2"],
  ["二项式定理", "(x+a)^n=\\sum_{k=0}^{n}\\binom{n}{k}x^k a^{n-k}"],
  ["欧拉公式", "e^{i\\pi}+1=0"],
  [
    "泰勒展开式",
    "e^x=1+\\frac{x}{1!}+\\frac{x^2}{2!}+\\frac{x^3}{3!}+\\cdots",
  ],
  [
    "傅里叶级数",
    "f(x)=a_0+\\sum_{n=1}^{\\infty}\\left(a_n\\cos\\frac{n\\pi x}{L}+b_n\\sin\\frac{n\\pi x}{L}\\right)",
  ],
  [
    "高斯积分",
    "\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx=\\sqrt{\\pi}",
  ],
  ["三角恒等式", "\\sin^2\\theta+\\cos^2\\theta=1"],
];

const PX = 64; // pixels per em in the stored drawing
const DEFAULT_PT = 28;

export function createEquationFeatures(ctx) {
  const { P } = ctx;
  const isEquation = (obj) =>
    !!obj &&
    P.getShapeKind(obj) === "picture" &&
    P.getShapeObjectData(obj)?.type === "equation";
  const current = () => {
    const obj = ctx.currentShape();
    return isEquation(obj) ? obj : null;
  };

  function render(source, color, px = PX) {
    return renderMathSvg(source, {
      size: px,
      color,
      measure: browserMeasure(),
    });
  }

  /** The equation dialog; resolves to the source, or null. */
  async function editDialog(initial = "", { title = "公式" } = {}) {
    const input = el("textarea", {
      class: "input equation-input",
      rows: 3,
      spellcheck: "false",
      autocapitalize: "off",
      "aria-label": "Equation (TeX-style)",
      "aria-describedby": "equation-help",
      value: initial,
    });
    const preview = el("div", {
      class: "equation-preview",
      role: "img",
      "aria-label": "预览",
    });
    const help = el(
      "p",
      { class: "equation-help", id: "equation-help" },
      "输入数学公式，如 x^2、\\frac{a}{b}、\\sqrt{x} 或 \\alpha，也可选取结构。按 Tab 键可移动至下一个空位置。",
    );
    const update = () => {
      const value = input.value;
      const { svg } = render(value || PLACEHOLDER, "#111111", 40);
      preview.replaceChildren(
        el("img", {
          src: svgDataUrl(svg),
          alt: value ? `公式预览：${value}` : "空公式",
        }),
      );
    };
    // Inserting a template selects its first slot, so typing fills it.
    const insert = (snippet) => {
      const start = input.selectionStart,
        end = input.selectionEnd;
      const before = input.value.slice(0, start);
      // A selection replaces the first slot of a structure placed around it.
      const selected = input.value.slice(start, end);
      let text = snippet;
      if (selected && text.includes(PLACEHOLDER))
        text = text.replace(PLACEHOLDER, selected);
      const needsSpace = /\\[a-zA-Z]+$/.test(before) && /^[a-zA-Z]/.test(text);
      input.value =
        before + (needsSpace ? " " : "") + text + input.value.slice(end);
      const base = start + (needsSpace ? 1 : 0);
      const slot = text.indexOf(PLACEHOLDER);
      input.focus();
      if (slot >= 0) input.setSelectionRange(base + slot, base + slot + 1);
      else input.setSelectionRange(base + text.length, base + text.length);
      update();
    };
    input.addEventListener("input", update);
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || e.shiftKey) return;
      const next = input.value.indexOf(PLACEHOLDER, input.selectionEnd);
      const first = next >= 0 ? next : input.value.indexOf(PLACEHOLDER);
      if (first < 0) return;
      e.preventDefault();
      input.setSelectionRange(first, first + 1);
    });
    const thumb = (source) => {
      const node = el("span", {
        class: "equation-thumb",
        "aria-hidden": "true",
      });
      node.innerHTML = render(source, "currentColor", 18).svg;
      return node;
    };
    const tabs = el("div", {
      class: "equation-tabs",
      role: "tablist",
      "aria-label": "调色板",
    });
    const panel = el("div", { class: "equation-palette", role: "tabpanel" });
    const groups = [
      ...STRUCTURES.map(([label, items]) => [
        label,
        items.map(([name, source]) => [name, source, thumb(source)]),
      ]),
      ...SYMBOL_PALETTE.map(([label, names]) => [
        label,
        names
          .filter((n) => SYMBOLS[n])
          .map((n) => [
            `\\${n}`,
            `\\${n} `,
            el(
              "span",
              { class: "equation-glyph", "aria-hidden": "true" },
              SYMBOLS[n].glyph,
            ),
          ]),
      ]),
    ];
    const show = (index) => {
      [...tabs.children].forEach((t, i) => {
        t.setAttribute("aria-selected", String(i === index));
        t.tabIndex = i === index ? 0 : -1;
      });
      const [, items] = groups[index];
      panel.replaceChildren(
        ...items.map(([name, source, art]) =>
          el(
            "button",
            {
              type: "button",
              class: "equation-item",
              title: name,
              "aria-label": name,
              onclick: () => insert(source),
            },
            art,
          ),
        ),
      );
    };
    groups.forEach(([label], i) =>
      tabs.append(
        el(
          "button",
          {
            type: "button",
            role: "tab",
            class: "equation-tab",
            onclick: () => show(i),
            onkeydown: (e) => {
              const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
              if (!step) return;
              e.preventDefault();
              const next = (i + step + groups.length) % groups.length;
              show(next);
              tabs.children[next].focus();
            },
          },
          label,
        ),
      ),
    );
    show(0);
    const body = el(
      "form",
      { class: "dialog-body equation-dialog" },
      tabs,
      panel,
      input,
      help,
      preview,
    );
    update();
    const response = dialog({
      title,
      body,
      confirm: initial ? "更新" : "插入",
    });
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    const ok = await response;
    const value = input.value.trim();
    return ok && value ? value.replaceAll(PLACEHOLDER, "") || null : null;
  }

  async function pictureFor(source, color, pt) {
    const { svg, width, height } = render(source, color);
    const png = await svgToPng(svg, width * 2, height * 2);
    // An em of the drawing is the equation's font size on the slide.
    const emu = (px) => Math.round((px / PX) * (pt / 72) * 914400);
    return {
      svg: new TextEncoder().encode(svg),
      png,
      w: emu(width),
      h: emu(height),
    };
  }

  /**
   * An equation drawn and ready to place: its source, colour, size (points)
   * and picture. Drawing is asynchronous, so it is done before the edit
   * that places it.
   */
  async function prepareEquation(source, color = "#000000", pt = DEFAULT_PT) {
    return { source, color, pt, pic: await pictureFor(source, color, pt) };
  }
  /**
   * Places a prepared equation on `slide` with its top left at (x, y), or
   * centered when no position is given; within an edit. Returns the shape.
   */
  function placeEquation(slide, prepared, at = null) {
    const { source, color, pt, pic } = prepared;
    const size = ctx.currentSize();
    const shape = P.addSlideVectorPicture(
      slide,
      { png: pic.png, svg: pic.svg },
      {
        x: Math.round(at ? at.x : (size.cx - pic.w) / 2),
        y: Math.round(at ? at.y : (size.cy - pic.h) / 2),
        w: pic.w,
        h: pic.h,
        name: `公式 ${P.getSlideShapes(slide).length + 1}`,
      },
    );
    P.setShapeObjectData(shape, {
      type: "equation",
      source,
      color,
      pt,
      w: pic.w,
    });
    P.setShapeDescription(shape, `公式：${source}`);
    return shape;
  }

  async function insertEquation(initial = "") {
    ctx.commitText();
    const source = initial || (await editDialog(""));
    if (!source) return;
    const prepared = await prepareEquation(source, ctx.inkColor(), DEFAULT_PT);
    await ctx.mutateSlide(ctx.slide(), (slide) => {
      const shape = placeEquation(slide, prepared);
      ctx.selectIds([P.getShapeId(shape)]);
    });
  }

  async function editEquation(obj = current()) {
    if (!isEquation(obj)) return false;
    const data = P.getShapeObjectData(obj);
    const source = await editDialog(data.source || "", {
      title: "编辑公式",
    });
    if (!source || source === data.source) return true;
    await redraw(obj, { ...data, source });
    return true;
  }

  async function redraw(obj, data) {
    const pic = await pictureFor(
      data.source,
      data.color || "#000000",
      data.pt || DEFAULT_PT,
    );
    await ctx.mutateShape(obj, (target, slide) => {
      const b = P.getShapeBounds(target);
      // Keep the equation's scale: the new drawing grows from the same corner
      // at the size the current one was shown.
      const old = P.getShapeObjectData(target);
      const scale = old?.w ? b.w / old.w : 1;
      P.setShapeVectorPicture(target, { png: pic.png, svg: pic.svg });
      P.setShapeBounds?.(target, {
        x: b.x,
        y: b.y,
        w: Math.round(pic.w * scale),
        h: Math.round(pic.h * scale),
      });
      P.setShapeObjectData(target, { ...data, type: "equation", w: pic.w });
      P.setShapeDescription(target, `公式：${data.source}`);
      ctx.pruneMedia(slide);
    });
  }

  const tab = () => ({
    id: "equation",
    label: "公式",
    contextual: true,
    visible: () => !!current() && ctx.selectedShapes().length === 1,
    groups: [
      {
        id: "equation-edit",
        label: "公式",
        icon: "equation",
        items: [
          {
            type: "large",
            id: "equation-edit-button",
            label: "Edit\nEquation",
            icon: "equation",
            title: "编辑公式",
            run: () => editEquation().catch(ctx.fail),
          },
          {
            type: "large",
            id: "equation-color",
            label: "颜色",
            icon: "textColor",
            title: "公式颜色",
            menu: () =>
              ctx.colorItems((hex) => {
                const obj = current();
                if (obj)
                  redraw(obj, {
                    ...P.getShapeObjectData(obj),
                    color: hex,
                  }).catch(ctx.fail);
              }),
          },
        ],
      },
    ],
  });

  const menu = () => [
    {
      label: "插入新公式",
      icon: "o:equation",
      onSelect: () => insertEquation().catch(ctx.fail),
    },
    { separator: true },
    ...BUILT_IN_EQUATIONS.map(([label, source]) => ({
      label,
      onSelect: () => insertEquation(source).catch(ctx.fail),
    })),
  ];

  return {
    insertEquation,
    prepareEquation,
    placeEquation,
    editEquation,
    isEquation,
    tab,
    menu,
    editDialog,
    svgDataUrl,
  };
}
