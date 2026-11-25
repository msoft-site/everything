// The Font, Paragraph, Tabs and Columns dialogs. Each reads the current
// settings, lets them be changed together, and hands back only what changed,
// so text that mixes formats keeps whatever was left alone.
import { el } from "../ui.js";
import {
  IN,
  PT,
  checkField,
  colorButton,
  cssColor,
  formatDialog,
  numberField,
  segmented,
  selectField,
  tabs,
} from "./controls.js";

export const UNDERLINE_STYLES = [
  ["none", "（无）"],
  ["words", "仅字"],
  ["sng", "单线"],
  ["dbl", "双线"],
  ["heavy", "粗线"],
  ["dotted", "点线"],
  ["dottedHeavy", "粗点线"],
  ["dash", "虚线"],
  ["dashHeavy", "粗虚线"],
  ["dashLong", "长虚线"],
  ["dashLongHeavy", "粗长虚线"],
  ["dotDash", "点划线"],
  ["dotDashHeavy", "粗点划线"],
  ["dotDotDash", "双点划线"],
  ["dotDotDashHeavy", "粗双点划线"],
  ["wavy", "波浪线"],
  ["wavyHeavy", "粗波浪线"],
  ["wavyDbl", "双波浪线"],
];

const underlineToken = (u) =>
  u === true ? "sng" : !u || u === "none" ? "none" : u;
const strikeToken = (s) =>
  s === true ? "sngStrike" : !s || s === "noStrike" ? "noStrike" : s;

// The colour the sample is drawn in: its own, or the theme's text colour.
const previewInk = (f, theme) =>
  cssColor(f.color, theme) || cssColor("scheme:tx1", theme);
// The sample stands on the theme's light or dark background, whichever its
// colour reads against, as it would on a slide: on the window's own surface
// dark text all but vanished in dark mode.
const luma = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function previewPaper(f, theme) {
  const ink = previewInk(f, theme);
  if (!ink) return "";
  const papers = [
    cssColor("scheme:bg1", theme) || "#FFFFFF",
    cssColor("scheme:tx1", theme) || "#000000",
  ];
  const gap = (paper) => Math.abs(luma(paper) - luma(ink));
  return gap(papers[0]) >= gap(papers[1]) ? papers[0] : papers[1];
}

// CSS that approximates a format for the preview.
function previewStyle(f, theme) {
  const u = underlineToken(f.underline);
  const s = strikeToken(f.strike);
  const deco = [u !== "none" && "underline", s !== "noStrike" && "line-through"]
    .filter(Boolean)
    .join(" ");
  const color = previewInk(f, theme) || "currentColor";
  return [
    `font-family:"${f.font || "Arial"}", system-ui`,
    `font-size:${Math.max(8, Math.min(48, f.size || 18))}px`,
    `font-weight:${f.bold ? 700 : 400}`,
    `font-style:${f.italic ? "italic" : "normal"}`,
    `color:${color}`,
    deco && `text-decoration:${deco}`,
    deco && u === "dbl" && "text-decoration-style:double",
    deco && u.startsWith("wavy") && "text-decoration-style:wavy",
    deco &&
      (u.startsWith("dot") || u.startsWith("dash")) &&
      `text-decoration-style:${u.startsWith("dot") ? "dotted" : "dashed"}`,
    f.underlineColor &&
      `text-decoration-color:${cssColor(f.underlineColor, theme)}`,
    f.cap === "all" && "text-transform:uppercase",
    f.cap === "small" && "font-variant:small-caps",
    f.spc && `letter-spacing:${(f.spc / 100) * 1.333}px`,
    f.baseline && `vertical-align:${f.baseline * 100}%`,
    f.baseline && "font-size:75%",
  ]
    .filter(Boolean)
    .join(";");
}

/**
 * The Font dialog. `format` is the selection's current format, `sample`
 * the text it shows, `fonts` the font list. Resolves to the changes, or
 * null when cancelled.
 */
export async function fontDialog({ format, sample, fonts, theme, tab = 0 }) {
  const f = { ...format };
  const changes = {};
  const set = (key, value) => {
    f[key] = value;
    changes[key] = value;
    updatePreview();
  };
  const previewText = el(
    "span",
    {},
    (sample || "").trim().slice(0, 60) || "示例文本",
  );
  const preview = el(
    "div",
    { class: "fmt-font-preview", "aria-label": "预览", role: "img" },
    previewText,
  );
  function updatePreview() {
    previewText.style.cssText = previewStyle(f, theme);
    preview.style.background = previewPaper(f, theme);
    preview.setAttribute(
      "aria-label",
      `预览：${f.font || "默认字体"}，${f.size ? `${f.size} 磅` : "默认字号"}${f.bold ? "，加粗" : ""}${f.italic ? "，倾斜" : ""}`,
    );
  }
  const fontId = "fmt-font-family";
  const fontList = el(
    "datalist",
    { id: `${fontId}-list` },
    ...fonts.map((name) => el("option", { value: name })),
  );
  const fontInput = el("input", {
    id: fontId,
    class: "input",
    list: `${fontId}-list`,
    value: f.font || "",
    autocomplete: "off",
    spellcheck: "false",
    onchange: (e) => {
      const v = e.target.value.trim();
      if (v) set("font", v);
    },
  });
  const styleValue = f.bold
    ? f.italic
      ? "bold-italic"
      : "bold"
    : f.italic
      ? "italic"
      : "regular";
  const fontTab = () => {
    const strike = strikeToken(f.strike);
    let strikeBox, doubleBox, superBox, subBox, smallBox, allBox;
    const effects = el(
      "fieldset",
      { class: "fmt-fieldset" },
      el("legend", {}, "效果"),
      el(
        "div",
        { class: "fmt-check-grid" },
        (strikeBox = checkField({
          label: "删除线",
          checked: strike === "sngStrike",
          onChange: (on) => {
            if (on) doubleBox.querySelector("input").checked = false;
            set("strike", on ? "sngStrike" : "noStrike");
          },
        })),
        (smallBox = checkField({
          label: "小型大写字母",
          checked: f.cap === "small",
          onChange: (on) => {
            if (on) allBox.querySelector("input").checked = false;
            set("cap", on ? "small" : "none");
          },
        })),
        (doubleBox = checkField({
          label: "双删除线",
          checked: strike === "dblStrike",
          onChange: (on) => {
            if (on) strikeBox.querySelector("input").checked = false;
            set("strike", on ? "dblStrike" : "noStrike");
          },
        })),
        (allBox = checkField({
          label: "全部大写",
          checked: f.cap === "all",
          onChange: (on) => {
            if (on) smallBox.querySelector("input").checked = false;
            set("cap", on ? "all" : "none");
          },
        })),
        (superBox = checkField({
          label: "上标",
          checked: (f.baseline || 0) > 0,
          onChange: (on) => {
            if (on) subBox.querySelector("input").checked = false;
            const n = on ? 30 : 0;
            offset.querySelector("input").value = String(n);
            set("baseline", n / 100);
          },
        })),
        checkField({
          label: "均衡字符高度",
          checked: !!f.normalizeHeight,
          onChange: (on) => set("normalizeHeight", on),
        }),
        (subBox = checkField({
          label: "下标",
          checked: (f.baseline || 0) < 0,
          onChange: (on) => {
            if (on) superBox.querySelector("input").checked = false;
            const n = on ? -25 : 0;
            offset.querySelector("input").value = String(n);
            set("baseline", n / 100);
          },
        })),
      ),
    );
    const offset = numberField({
      label: "偏移",
      value: Math.round((f.baseline || 0) * 100),
      unit: "%",
      min: -100,
      max: 100,
      step: 1,
      places: 0,
      onCommit: (n) => {
        superBox.querySelector("input").checked = n > 0;
        subBox.querySelector("input").checked = n < 0;
        set("baseline", n / 100);
      },
    });
    effects.append(offset);
    return el(
      "div",
      { class: "fmt-stack" },
      el(
        "div",
        { class: "fmt-row fmt-font-row" },
        el(
          "div",
          { class: "fmt-field fmt-grow" },
          el("label", { for: fontId }, "字体"),
          fontInput,
          fontList,
        ),
        selectField({
          label: "字形",
          value: styleValue,
          options: [
            ["regular", "常规"],
            ["italic", "倾斜"],
            ["bold", "加粗"],
            ["bold-italic", "加粗倾斜"],
          ],
          onChange: (v) => {
            set("bold", v.startsWith("bold"));
            set("italic", v.endsWith("italic"));
          },
        }),
        numberField({
          label: "字号",
          value: f.size ?? "",
          unit: "pt",
          min: 1,
          max: 4000,
          step: 1,
          places: 1,
          onCommit: (n) => set("size", n),
        }),
      ),
      el(
        "div",
        { class: "fmt-row" },
        colorButton({
          label: "字体颜色",
          value: f.color,
          theme,
          automatic: { label: "自动", value: "scheme:tx1" },
          onPick: (v) => set("color", v),
        }),
        selectField({
          label: "下划线线型",
          value: underlineToken(f.underline),
          options: UNDERLINE_STYLES,
          onChange: (v) => set("underline", v === "none" ? false : v),
        }),
        colorButton({
          label: "下划线颜色",
          value: f.underlineColor ?? null,
          theme,
          automatic: { label: "与文字相同", value: null },
          onPick: (v) => set("underlineColor", v),
        }),
      ),
      effects,
    );
  };
  const spacingTab = () => {
    const spc = f.spc || 0;
    let mode = spc > 0 ? "expanded" : spc < 0 ? "condensed" : "normal";
    let amount = Math.abs(spc) / 100;
    const by = numberField({
      label: "磅值",
      value: amount,
      unit: "pt",
      min: 0,
      max: 1584,
      step: 0.1,
      places: 1,
      disabled: mode === "normal",
      onCommit: (n) => {
        amount = n;
        apply();
      },
    });
    const apply = () => {
      by.querySelector("input").disabled = mode === "normal";
      set(
        "spc",
        mode === "normal"
          ? 0
          : Math.round((mode === "expanded" ? 1 : -1) * amount * 100),
      );
    };
    const kern = f.kern;
    let kernOn = kern !== undefined && kern > 0;
    let kernAt = kernOn ? kern / 100 : 12;
    const kernSize = numberField({
      label: "磅及以上",
      value: kernAt,
      unit: "pt",
      min: 1,
      max: 4000,
      step: 1,
      disabled: !kernOn,
      onCommit: (n) => {
        kernAt = n;
        set("kern", Math.round(kernAt * 100));
      },
    });
    return el(
      "div",
      { class: "fmt-stack" },
      el(
        "div",
        { class: "fmt-row" },
        selectField({
          label: "间距",
          value: mode,
          options: [
            ["normal", "标准"],
            ["expanded", "加宽"],
            ["condensed", "紧缩"],
          ],
          onChange: (v) => {
            mode = v;
            if (v !== "normal" && amount === 0) {
              amount = 1;
              by.querySelector("input").value = "1";
            }
            apply();
          },
        }),
        by,
      ),
      el(
        "div",
        { class: "fmt-row" },
        checkField({
          label: "字体微调",
          checked: kernOn,
          onChange: (on) => {
            kernOn = on;
            kernSize.querySelector("input").disabled = !on;
            set("kern", on ? Math.round(kernAt * 100) : 0);
          },
        }),
        kernSize,
      ),
    );
  };
  const t = tabs(
    [
      { id: "font", label: "字体", render: fontTab },
      { id: "spacing", label: "字符间距", render: spacingTab },
    ],
    { label: "字体设置", initial: tab },
  );
  updatePreview();
  const ok = await formatDialog({
    title: "字体",
    body: el("div", { class: "fmt-stack" }, t.node, preview),
    wide: true,
  });
  return ok && Object.keys(changes).length ? changes : null;
}

/** Line spacing as the Paragraph dialog names it. */
function lineSpacingRule(lineSpacing) {
  if (!lineSpacing) return { rule: "single", at: 1 };
  if (lineSpacing.kind === "pts")
    return { rule: "exactly", at: lineSpacing.value };
  const v = lineSpacing.value;
  if (Math.abs(v - 1) < 0.001) return { rule: "single", at: 1 };
  if (Math.abs(v - 1.5) < 0.001) return { rule: "onehalf", at: 1.5 };
  if (Math.abs(v - 2) < 0.001) return { rule: "double", at: 2 };
  return { rule: "multiple", at: v };
}

/**
 * The Paragraph dialog. `paragraph` holds the first paragraph's settings:
 * { align, marL, indent, spaceBefore, spaceAfter, lineSpacing, tabs,
 * defaultTab } (EMU and points). Resolves to the changes or null.
 */
export async function paragraphDialog({ paragraph }) {
  const p = { ...paragraph };
  const changes = {};
  const set = (key, value) => {
    p[key] = value;
    changes[key] = value;
  };
  const special =
    (p.indent || 0) > 0 ? "first" : (p.indent || 0) < 0 ? "hanging" : "none";
  let specialMode = special;
  let specialBy = Math.abs(p.indent || 0) / IN;
  // Before text is where wrapped lines start; a first-line indent moves
  // the first line from there.
  const beforeText = (p.marL || 0) / IN;
  const by = numberField({
    label: "度量值",
    value: specialBy,
    unit: "in",
    min: 0,
    max: 20,
    step: 0.1,
    disabled: specialMode === "none",
    onCommit: (n) => {
      specialBy = n;
      writeIndent();
    },
  });
  const writeIndent = () => {
    by.querySelector("input").disabled = specialMode === "none";
    set(
      "indent",
      specialMode === "none"
        ? 0
        : Math.round((specialMode === "first" ? 1 : -1) * specialBy * IN),
    );
  };
  const { rule, at } = lineSpacingRule(p.lineSpacing);
  let lineRule = rule;
  let lineAt = at;
  const atField = numberField({
    label: "设置值",
    value: lineAt,
    unit: lineRule === "exactly" ? "pt" : "",
    min: 0,
    max: lineRule === "exactly" ? 1584 : 9.99,
    step: lineRule === "exactly" ? 1 : 0.1,
    disabled: lineRule !== "exactly" && lineRule !== "multiple",
    onCommit: (n) => {
      lineAt = n;
      writeLine();
    },
  });
  const writeLine = () => {
    const input = atField.querySelector("input");
    input.disabled = lineRule !== "exactly" && lineRule !== "multiple";
    atField
      .querySelector(".fmt-unit")
      ?.replaceChildren(lineRule === "exactly" ? "pt" : "");
    const value =
      lineRule === "single"
        ? null
        : lineRule === "onehalf"
          ? { kind: "pct", value: 1.5 }
          : lineRule === "double"
            ? { kind: "pct", value: 2 }
            : lineRule === "exactly"
              ? { kind: "pts", value: Math.max(0, lineAt) }
              : { kind: "pct", value: Math.max(0, lineAt) };
    set("lineSpacing", value);
  };
  const tabsButton = el(
    "button",
    {
      type: "button",
      class: "btn secondary",
      onclick: async () => {
        const result = await tabsDialog({
          tabs: p.tabs || [],
          defaultTab: p.defaultTab ?? IN,
        });
        if (!result) return;
        set("tabs", result.tabs);
        set("defaultTab", result.defaultTab);
      },
    },
    "Tabs…",
  );
  const body = el(
    "div",
    { class: "fmt-stack" },
    el(
      "fieldset",
      { class: "fmt-fieldset" },
      el("legend", {}, "常规"),
      selectField({
        label: "对齐方式",
        value: p.align || "left",
        options: [
          ["left", "左对齐"],
          ["center", "居中"],
          ["right", "右对齐"],
          ["justify", "两端对齐"],
          ["distribute", "分散对齐"],
        ],
        onChange: (v) => set("align", v),
      }),
    ),
    el(
      "fieldset",
      { class: "fmt-fieldset" },
      el("legend", {}, "缩进"),
      el(
        "div",
        { class: "fmt-row" },
        numberField({
          label: "文本前",
          value: beforeText,
          unit: "in",
          min: 0,
          max: 20,
          step: 0.1,
          onCommit: (n) => set("marL", Math.round(n * IN)),
        }),
        selectField({
          label: "特殊格式",
          value: specialMode,
          options: [
            ["none", "（无）"],
            ["first", "首行缩进"],
            ["hanging", "悬挂缩进"],
          ],
          onChange: (v) => {
            specialMode = v;
            if (v !== "none" && specialBy === 0) {
              specialBy = 0.5;
              by.querySelector("input").value = "0.5";
            }
            writeIndent();
          },
        }),
        by,
      ),
    ),
    el(
      "fieldset",
      { class: "fmt-fieldset" },
      el("legend", {}, "间距"),
      el(
        "div",
        { class: "fmt-row" },
        numberField({
          label: "段前",
          value: p.spaceBefore || 0,
          unit: "pt",
          min: 0,
          max: 1584,
          step: 1,
          onCommit: (n) => set("spaceBefore", n),
        }),
        numberField({
          label: "段后",
          value: p.spaceAfter || 0,
          unit: "pt",
          min: 0,
          max: 1584,
          step: 1,
          onCommit: (n) => set("spaceAfter", n),
        }),
      ),
      el(
        "div",
        { class: "fmt-row" },
        selectField({
          label: "行距",
          value: lineRule,
          options: [
            ["single", "单倍行距"],
            ["onehalf", "1.5 倍行距"],
            ["double", "2 倍行距"],
            ["exactly", "固定值"],
            ["multiple", "多倍行距"],
          ],
          onChange: (v) => {
            lineRule = v;
            const input = atField.querySelector("input");
            if (v === "exactly") {
              lineAt = lineAt < 4 ? 18 : lineAt;
              input.max = "1584";
              input.step = "1";
            } else {
              lineAt =
                v === "multiple"
                  ? lineAt > 9.99
                    ? 1.2
                    : lineAt
                  : { single: 1, onehalf: 1.5, double: 2 }[v];
              input.max = "9.99";
              input.step = "0.1";
            }
            input.value = String(lineAt);
            writeLine();
          },
        }),
        atField,
      ),
    ),
    el("div", { class: "fmt-row fmt-end" }, tabsButton),
  );
  const ok = await formatDialog({ title: "段落", body, wide: true });
  return ok && Object.keys(changes).length ? changes : null;
}

/** The Tabs dialog: tab stops and the default spacing. */
export async function tabsDialog({ tabs: initial, defaultTab }) {
  let stops = initial.map((t) => ({ ...t }));
  let spacing = defaultTab / IN;
  let position = 1;
  let align = "l";
  // A plain list: each stop is read out with its Clear button, which a
  // listbox's options could not hold.
  const list = el("ul", { class: "fmt-tab-list", "aria-label": "制表位" });
  const label = (a) =>
    ({ l: "左对齐", ctr: "居中", r: "右对齐", dec: "小数点对齐" })[a];
  const render = () => {
    stops.sort((a, b) => a.pos - b.pos);
    list.replaceChildren(
      ...stops.map((stop, i) =>
        el(
          "li",
          {},
          el("span", {}, `${(stop.pos / IN).toFixed(2)}″`),
          el("span", { class: "muted" }, label(stop.align)),
          el(
            "button",
            {
              type: "button",
              class: "btn icon-btn small",
              "aria-label": `清除位于 ${(stop.pos / IN).toFixed(2)} 英寸处的制表位`,
              title: "清除",
              onclick: () => {
                stops.splice(i, 1);
                render();
              },
            },
            "×",
          ),
        ),
      ),
    );
    if (!stops.length)
      list.append(el("li", { class: "helper" }, "尚无制表位。"));
  };
  render();
  const body = el(
    "div",
    { class: "fmt-stack" },
    el(
      "div",
      { class: "fmt-stack" },
      numberField({
        label: "制表位位置",
        value: position,
        unit: "in",
        min: 0,
        max: 50,
        step: 0.25,
        onCommit: (n) => (position = n),
      }),
      el(
        "div",
        { class: "fmt-field" },
        el("span", { class: "fmt-label" }, "对齐方式"),
        segmented({
          label: "对齐方式",
          value: align,
          options: [
            ["l", "左对齐"],
            ["ctr", "居中"],
            ["r", "右对齐"],
            ["dec", "小数点对齐"],
          ],
          onChange: (v) => (align = v),
        }),
      ),
    ),
    el(
      "div",
      { class: "fmt-row" },
      el(
        "button",
        {
          type: "button",
          class: "btn secondary",
          onclick: () => {
            const pos = Math.round(position * IN);
            stops = stops.filter((s) => Math.abs(s.pos - pos) > 100);
            if (stops.length < 32) stops.push({ pos, align });
            render();
          },
        },
        "设置",
      ),
      el(
        "button",
        {
          type: "button",
          class: "btn secondary",
          onclick: () => {
            stops = [];
            render();
          },
        },
        "全部清除",
      ),
    ),
    list,
    el(
      "p",
      { class: "helper" },
      "在带有制表位的段落中键入时，按 Tab 键可移动到下一个制表位。",
    ),
    numberField({
      label: "默认制表位",
      value: spacing,
      unit: "in",
      min: 0.1,
      max: 10,
      step: 0.25,
      onCommit: (n) => (spacing = n),
    }),
  );
  const ok = await formatDialog({ title: "制表位", body });
  return ok ? { tabs: stops, defaultTab: Math.round(spacing * IN) } : null;
}

/** The Columns dialog. Resolves to { count, gapEmu } or null. */
export async function columnsDialog({ count = 1, gapEmu = 0 }) {
  let n = count;
  let gap = gapEmu / IN;
  const body = el(
    "div",
    { class: "fmt-row" },
    numberField({
      label: "栏数",
      value: n,
      min: 1,
      max: 16,
      step: 1,
      places: 0,
      onCommit: (v) => (n = Math.round(v)),
    }),
    numberField({
      label: "间距",
      value: gap,
      unit: "in",
      min: 0,
      max: 20,
      step: 0.1,
      onCommit: (v) => (gap = v),
    }),
  );
  const ok = await formatDialog({ title: "分栏", body });
  return ok ? { count: n, gapEmu: Math.round(gap * IN) } : null;
}

export { PT };
