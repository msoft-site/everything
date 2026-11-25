// The Format Background pane: the fill behind a slide (or, in Slide Master
// view, behind a layout or master) as a solid color, a gradient with its
// stops, a picture or texture stretched or tiled, or a preset pattern; hiding
// the master's artwork; and Reset Background and Apply to All.
//
// Edits apply as they are made, each an undoable step (a burst of changes to
// one control merges into one).
import { el, button } from "../ui.js";
import { P } from "../model.js";
import { masterInfo, masterOfSlide } from "./engine.js";
import { TEXTURES, textureBytes, textureSwatch } from "./textures.js";
import { nativePatternPaths } from "../../lib/pptx-preview/src/pattern-cells.ts";

export const PATTERNS = [
  "pct5",
  "pct10",
  "pct20",
  "pct25",
  "pct30",
  "pct40",
  "pct50",
  "pct60",
  "pct70",
  "pct75",
  "pct80",
  "pct90",
  "horz",
  "vert",
  "ltHorz",
  "ltVert",
  "dkHorz",
  "dkVert",
  "narHorz",
  "narVert",
  "dashHorz",
  "dashVert",
  "cross",
  "dnDiag",
  "upDiag",
  "ltDnDiag",
  "ltUpDiag",
  "dkDnDiag",
  "dkUpDiag",
  "wdDnDiag",
  "wdUpDiag",
  "dashDnDiag",
  "dashUpDiag",
  "diagCross",
  "smCheck",
  "lgCheck",
  "smGrid",
  "lgGrid",
  "dotGrid",
  "smConfetti",
  "lgConfetti",
  "horzBrick",
  "diagBrick",
  "solidDmnd",
  "openDmnd",
  "dotDmnd",
  "plaid",
  "sphere",
  "weave",
  "divot",
  "shingle",
  "wave",
  "trellis",
  "zigZag",
];
const PATTERN_NAMES = {
  pct5: "5%",
  pct10: "10%",
  pct20: "20%",
  pct25: "25%",
  pct30: "30%",
  pct40: "40%",
  pct50: "50%",
  pct60: "60%",
  pct70: "70%",
  pct75: "75%",
  pct80: "80%",
  pct90: "90%",
  horz: "横线",
  vert: "竖线",
  ltHorz: "浅色横线",
  ltVert: "浅色竖线",
  dkHorz: "深色横线",
  dkVert: "深色竖线",
  narHorz: "浅色水平线",
  narVert: "浅色垂直线",
  dashHorz: "虚线水平线",
  dashVert: "虚线垂直线",
  cross: "十字线",
  dnDiag: "下斜线",
  upDiag: "上斜线",
  ltDnDiag: "浅色下斜线",
  ltUpDiag: "浅色上斜线",
  dkDnDiag: "深色下斜线",
  dkUpDiag: "深色上斜线",
  wdDnDiag: "粗下斜线",
  wdUpDiag: "粗上斜线",
  dashDnDiag: "虚线下斜线",
  dashUpDiag: "虚线上斜线",
  diagCross: "网格斜线",
  smCheck: "小棋盘",
  lgCheck: "大棋盘",
  smGrid: "小网格",
  lgGrid: "大网格",
  dotGrid: "点网格",
  smConfetti: "小彩条",
  lgConfetti: "大彩条",
  horzBrick: "水平砖形",
  diagBrick: "对角砖形",
  solidDmnd: "实心菱形",
  openDmnd: "空心菱形",
  dotDmnd: "点菱形",
  plaid: "花呢格",
  sphere: "球体",
  weave: "织物",
  divot: "草皮",
  shingle: "屋顶板",
  wave: "波浪",
  trellis: "棚架",
  zigZag: "锯齿形",
};
const KINDS = [
  ["solid", "纯色填充"],
  ["gradient", "渐变填充"],
  ["image", "图片或纹理填充"],
  ["pattern", "图案填充"],
];
const GRADIENT_TYPES = [
  ["linear", "线性"],
  ["circle", "射线"],
  ["rect", "矩形"],
  ["shape", "路径"],
];
const ALIGNMENTS = [
  ["tl", "左上"],
  ["t", "上"],
  ["tr", "右上"],
  ["l", "左"],
  ["ctr", "居中"],
  ["r", "右"],
  ["bl", "左下"],
  ["b", "下"],
  ["br", "右下"],
];
const MIRRORS = [
  ["none", "无"],
  ["x", "水平"],
  ["y", "垂直"],
  ["xy", "全部"],
];
const EMU_PER_PT = 12700;

const THEME_KEYS = {
  dk1: "dark1",
  lt1: "light1",
  dk2: "dark2",
  lt2: "light2",
  hlink: "hyperlink",
  folHlink: "followedHyperlink",
};

let uid = 0;

export function createBackgroundPane(host) {
  // host: {
  //   pres(), target(), slides(), masterView(),
  //   mutateTarget(fn(target), options), mutateDeck(fn),
  //   colorField(target), imageButtons(target), resolved(target),
  //   colorInput(label, value, onchange, options), pickImage(handler),
  //   readImage(file), afterPicture(target),
  // }
  // The stop being edited, kept while the pane is drawn again.
  const state = { stop: 0, kind: null, part: null };

  const pres = () => host.pres();

  function masterPartOf(target) {
    const kind = P.getTemplateKind(target);
    const part = P.getSlidePartName(target);
    if (kind === "master") return part;
    if (kind === "layout") return P.getLayoutMasterPartName(pres(), part);
    return masterOfSlide(pres(), target);
  }
  // The theme colors and color map the target's colors resolve through.
  function context(target) {
    const info = masterInfo(pres(), masterPartOf(target));
    const theme = info
      ? Object.fromEntries(
          Object.entries(info.colors).map(([k, v]) => [
            THEME_KEYS[k] || k,
            (v || "#000000").toUpperCase(),
          ]),
        )
      : P.getPresentationTheme(pres());
    let clrMap = null;
    try {
      clrMap = P.getEffectiveColorMap(target);
    } catch {}
    return { theme, clrMap };
  }
  const layoutOf = (target) => {
    const kind = P.getTemplateKind(target);
    if (kind === "layout")
      return P.findSlideLayoutByPartName(pres(), P.getSlidePartName(target));
    if (kind === "slide") return P.getSlideLayout(target);
    return null;
  };
  // The fill the target shows, its own or inherited: { kind, own, ... }.
  function effective(target) {
    const own = P.getSlideBackground(target).kind !== "inherit";
    const resolved = host.resolved(target);
    const kind =
      resolved.kind === "inherit" || !resolved.kind ? "solid" : resolved.kind;
    const ctx = context(target);
    const layout = layoutOf(target);
    const kindOfTarget = P.getTemplateKind(target);
    let gradient = null,
      pattern = null,
      picture = null;
    if (kind === "gradient") {
      gradient = P.getSlideBackgroundGradientFill(target, ctx);
      if (!gradient && layout && kindOfTarget === "slide")
        gradient = P.getSlideLayoutBackgroundGradientFill(layout, ctx);
      if (!gradient && layout)
        gradient = P.getSlideMasterBackgroundGradientFill(pres(), layout, ctx);
    } else if (kind === "pattern") {
      pattern = P.getSlideBackgroundPatternFill(pres(), target, ctx.clrMap);
      if (!pattern && layout && kindOfTarget === "slide")
        pattern = P.getSlideLayoutBackgroundPatternFill(
          pres(),
          layout,
          ctx.clrMap,
        );
      if (!pattern && layout)
        pattern = P.getSlideMasterBackgroundPatternFill(
          pres(),
          layout,
          ctx.clrMap,
        );
    } else if (kind === "image") {
      picture = P.getSlideBackgroundPictureFill(target);
      if (!picture && layout && kindOfTarget === "slide")
        picture = P.getSlideLayoutBackgroundPictureFill(layout);
      if (!picture && layout)
        picture = P.getSlideMasterBackgroundPictureFill(pres(), layout);
    }
    return { own, kind, resolved, gradient, pattern, picture, ctx };
  }

  const coalesce = (what, target) =>
    `background:${what}:${P.getSlidePartName(target)}`;
  const edit = (what, fn) =>
    host.mutateTarget((target) => fn(target), {
      coalesce: what ? coalesce(what, host.target()) : null,
    });

  const hex = (c, fallback = "#ffffff") =>
    /^#?[0-9a-f]{6}$/i.test(c || "")
      ? `#${String(c).replace("#", "").toLowerCase()}`
      : fallback;
  const colorWithAlpha = (color, transparency) =>
    transparency > 0
      ? `${hex(color).toUpperCase()}/alpha=${Math.round((1 - transparency) * 100000)}`
      : hex(color).toUpperCase();

  // ---- Controls -----------------------------------------------------------

  function slider(
    label,
    value,
    commit,
    { min = 0, max = 100, unit = "%" } = {},
  ) {
    const id = `bg-range-${++uid}`;
    const out = el(
      "span",
      { class: "bg-range-value" },
      `${Math.round(value)}${unit}`,
    );
    const input = el("input", {
      type: "range",
      id,
      min,
      max,
      value: Math.round(value),
      "aria-label": label,
      oninput: (e) => (out.textContent = `${e.target.value}${unit}`),
      onchange: (e) => commit(Number(e.target.value)),
    });
    return el(
      "div",
      { class: "field bg-range" },
      el("label", { for: id }, label),
      el("div", { class: "bg-range-row" }, input, out),
    );
  }
  function number(
    label,
    value,
    commit,
    { min = -1000, max = 1000, step = 1 } = {},
  ) {
    const id = `bg-num-${++uid}`;
    return el(
      "div",
      { class: "field bg-number" },
      el("label", { for: id }, label),
      el("input", {
        type: "number",
        id,
        class: "input",
        value: Math.round(value * 100) / 100,
        min,
        max,
        step,
        onchange: (e) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) commit(Math.max(min, Math.min(max, n)));
        },
      }),
    );
  }
  function select(label, options, value, commit) {
    const id = `bg-select-${++uid}`;
    const node = el(
      "select",
      { id, class: "input", onchange: (e) => commit(e.target.value) },
      ...options.map(([v, text]) => el("option", { value: v }, text)),
    );
    node.value = value;
    return el("div", { class: "field" }, el("label", { for: id }, label), node);
  }
  function check(label, checked, commit, disabled = false) {
    return el(
      "label",
      { class: "bg-check" },
      el("input", {
        type: "checkbox",
        checked: checked || null,
        disabled: disabled || null,
        onchange: (e) => commit(e.target.checked),
      }),
      label,
    );
  }

  // ---- Fill kinds -----------------------------------------------------------

  function switchTo(kind, now) {
    state.stop = 0;
    if (kind === "solid")
      return edit(null, (t) =>
        P.setSlideBackground(t, hex(now.resolved.color).toUpperCase()),
      );
    if (kind === "gradient")
      return edit(null, (t) =>
        P.setSlideBackgroundGradient(t, defaultGradient(now)),
      );
    if (kind === "pattern")
      return edit(null, (t) =>
        P.setSlideBackgroundPattern(t, {
          preset: "pct20",
          foreground: "scheme:tx1",
          background: "scheme:bg1",
        }),
      );
    if (kind === "image") return applyTexture("paper", false);
  }

  function defaultGradient(now) {
    const base = hex(now.resolved.color, "#ffffff");
    return {
      stops: [
        { offset: 0, color: base.toUpperCase() },
        { offset: 1, color: "scheme:bg2" },
      ],
      angleDeg: 90,
    };
  }

  function solidSection(now) {
    const opacity = now.resolved.opacity ?? 1;
    return el(
      "div",
      { class: "bg-section" },
      slider("透明度", (1 - opacity) * 100, (v) =>
        edit("solid-alpha", (t) =>
          P.setSlideBackground(t, colorWithAlpha(now.resolved.color, v / 100)),
        ),
      ),
    );
  }

  // Gradient presets from the theme's colors: light and dark washes.
  function gradientPresets(now) {
    const colors = now.ctx.theme || {};
    const accents = [1, 2, 3, 4, 5, 6].map((n) => `accent${n}`);
    const presets = [
      [
        "浅色渐变",
        [
          ["scheme:bg1", 0],
          ["scheme:bg2", 1],
        ],
        { angleDeg: 90 },
      ],
      [
        "深色渐变",
        [
          ["scheme:tx2", 0],
          ["scheme:tx1", 1],
        ],
        { angleDeg: 90 },
      ],
      ...accents.slice(0, 4).map((a, i) => [
        `Soft ${["first", "second", "third", "fourth"][i]} accent`,
        [
          [`scheme:${a}/lumMod=20000/lumOff=80000`, 0],
          [`scheme:${a}/lumMod=60000/lumOff=40000`, 1],
        ],
        { angleDeg: 90 },
      ]),
      [
        "光晕",
        [
          ["scheme:bg1", 0],
          ["scheme:accent1/lumMod=40000/lumOff=60000", 1],
        ],
        {
          path: "circle",
          focus: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
        },
      ],
      [
        "黄昏",
        [
          ["scheme:accent1", 0],
          ["scheme:accent2", 1],
        ],
        { angleDeg: 45 },
      ],
    ];
    const swatch = (stops, opts) => {
      const css = stops
        .map(([c, pos]) => `${cssColor(c, colors)} ${pos * 100}%`)
        .join(",");
      return opts.path
        ? `radial-gradient(circle, ${css})`
        : `linear-gradient(${(opts.angleDeg ?? 90) + 90}deg, ${css})`;
    };
    return el(
      "div",
      { class: "bg-presets", role: "group", "aria-label": "预设渐变" },
      ...presets.map(([name, stops, opts]) =>
        el("button", {
          type: "button",
          class: "bg-preset",
          title: name,
          "aria-label": name,
          style: `background:${swatch(stops, opts)}`,
          onclick: () => {
            state.stop = 0;
            edit(null, (t) =>
              P.setSlideBackgroundGradient(t, {
                stops: stops.map(([color, offset]) => ({ color, offset })),
                ...opts,
              }),
            );
          },
        }),
      ),
    );
  }

  function gradientSection(now) {
    const g = now.gradient || defaultGradient(now);
    const stops = g.stops.map((s) => ({
      offset: s.offset,
      color: hex(s.color, "#808080"),
      opacity: s.opacity ?? 1,
    }));
    const type = g.path || "linear";
    state.stop = Math.min(state.stop, stops.length - 1);
    const current = stops[state.stop];
    const write = (what, change) =>
      edit(what, (t) => {
        const next = change({
          stops: stops.map((s) => ({ ...s })),
          type,
          angle: g.angleDeg ?? 90,
        });
        const sorted = next.stops
          .map((s, i) => ({ ...s, i }))
          .sort((a, b) => a.offset - b.offset);
        if (next.select !== undefined)
          state.stop = sorted.findIndex((s) => s.i === next.select);
        P.setSlideBackgroundGradient(t, {
          stops: sorted.map(({ offset, color, opacity }) => ({
            offset,
            color: color.toUpperCase(),
            ...(opacity < 1 ? { opacity } : {}),
          })),
          ...(next.type === "linear"
            ? { angleDeg: next.angle }
            : {
                path: next.type,
                focus: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
              }),
        });
      });
    const bar = el("div", {
      class: "bg-stops-bar",
      style: `background:linear-gradient(90deg, ${stops
        .map((s) => `${s.color} ${s.offset * 100}%`)
        .join(",")})`,
    });
    const handles = stops.map((s, i) =>
      el("button", {
        type: "button",
        class: `bg-stop ${i === state.stop ? "active" : ""}`,
        role: "radio",
        "aria-checked": String(i === state.stop),
        "aria-label": `Stop ${i + 1} of ${stops.length}, at ${Math.round(s.offset * 100)}%`,
        style: `left:${s.offset * 100}%;--stop:${s.color}`,
        tabindex: i === state.stop ? 0 : -1,
        onclick: () => {
          state.stop = i;
          host.rerender();
        },
        onkeydown: (e) => {
          const step = e.shiftKey ? 0.1 : 0.01;
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const delta = e.key === "ArrowLeft" ? -step : step;
            write("stop-pos", (n) => {
              n.stops[i].offset = Math.max(
                0,
                Math.min(1, n.stops[i].offset + delta),
              );
              n.select = i;
              return n;
            });
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            removeStop();
          }
        },
      }),
    );
    const removeStop = () => {
      if (stops.length <= 2) return;
      write(null, (n) => {
        n.stops.splice(state.stop, 1);
        n.select = Math.max(0, state.stop - 1);
        return n;
      });
    };
    return el(
      "div",
      { class: "bg-section" },
      gradientPresets(now),
      select("类型", GRADIENT_TYPES, type, (v) =>
        write(null, (n) => ({ ...n, type: v })),
      ),
      type === "linear" &&
        number(
          "角度 (°)",
          g.angleDeg ?? 90,
          (v) =>
            write("angle", (n) => ({ ...n, angle: ((v % 360) + 360) % 360 })),
          { min: 0, max: 359.9 },
        ),
      el(
        "div",
        { class: "field" },
        el("span", { class: "bg-label" }, "渐变光圈"),
        el(
          "div",
          {
            class: "bg-stops",
            role: "radiogroup",
            "aria-label": "渐变光圈",
          },
          bar,
          ...handles,
        ),
        el(
          "div",
          { class: "bg-stop-buttons" },
          button(
            "添加光圈",
            "Plus",
            () =>
              write(null, (n) => {
                const a = n.stops[state.stop],
                  b = n.stops[state.stop + 1] || n.stops[state.stop - 1];
                n.stops.push({
                  offset: b ? (a.offset + b.offset) / 2 : 0.5,
                  color: a.color,
                  opacity: a.opacity,
                });
                n.select = n.stops.length - 1;
                return n;
              }),
            "secondary small",
            { "aria-label": "添加渐变光圈" },
          ),
          button("删除光圈", "Minus", removeStop, "secondary small", {
            "aria-label": "删除渐变光圈",
            disabled: stops.length <= 2 || null,
          }),
        ),
      ),
      host.colorInput("光圈颜色", current.color, (c) =>
        write("stop-color", (n) => {
          n.stops[state.stop].color = c;
          n.select = state.stop;
          return n;
        }),
      ),
      number(
        "光圈位置 (%)",
        current.offset * 100,
        (v) =>
          write("stop-pos", (n) => {
            n.stops[state.stop].offset = v / 100;
            n.select = state.stop;
            return n;
          }),
        { min: 0, max: 100 },
      ),
      slider("光圈透明度", (1 - current.opacity) * 100, (v) =>
        write("stop-alpha", (n) => {
          n.stops[state.stop].opacity = 1 - v / 100;
          n.select = state.stop;
          return n;
        }),
      ),
    );
  }

  async function applyTexture(id, keepOptions = true) {
    const bytes = await textureBytes(id);
    const now = effective(host.target());
    const t = keepOptions ? (now.picture?.transparency ?? 0) : 0;
    return edit(null, (target) => {
      P.setSlideBackgroundPicture(target, bytes, {
        tile: { scaleX: 1, scaleY: 1, align: "tl", flip: "none" },
        transparency: t,
      });
      host.afterPicture(target);
    });
  }

  function pictureSection(now) {
    const pic = now.picture || {
      tile: null,
      stretch: { left: 0, top: 0, right: 0, bottom: 0 },
      transparency: 0,
    };
    const own = now.own && P.getSlideBackground(host.target()).kind === "image";
    const set = (what, options) =>
      edit(what, (t) => {
        if (!P.setSlideBackgroundPictureOptions(t, options)) return host.skip;
      });
    const tile = pic.tile;
    return el(
      "div",
      { class: "bg-section" },
      el("span", { class: "bg-label" }, "纹理"),
      el(
        "div",
        { class: "bg-textures", role: "group", "aria-label": "纹理" },
        ...TEXTURES.map((tx) =>
          el("button", {
            type: "button",
            class: "bg-texture",
            title: tx.name,
            "aria-label": `${tx.name} texture`,
            style: `background-image:url(${textureSwatch(tx.id)})`,
            onclick: () => applyTexture(tx.id).catch(host.fail),
          }),
        ),
      ),
      slider("图片透明度", pic.transparency * 100, (v) =>
        set("pic-alpha", { transparency: v / 100 }),
      ),
      check(
        "将图片平铺为纹理",
        !!tile,
        (on) =>
          set(
            null,
            on
              ? { tile: { scaleX: 1, scaleY: 1, align: "tl", flip: "none" } }
              : { tile: null, stretch: {} },
          ),
        !own,
      ),
      own &&
        (tile
          ? el(
              "div",
              { class: "bg-grid" },
              number("X 偏移量 (pt)", tile.offsetX / EMU_PER_PT, (v) =>
                set("tile", { tile: { ...tile, offsetX: v * EMU_PER_PT } }),
              ),
              number("Y 偏移量 (pt)", tile.offsetY / EMU_PER_PT, (v) =>
                set("tile", { tile: { ...tile, offsetY: v * EMU_PER_PT } }),
              ),
              number(
                "缩放比例 X (%)",
                tile.scaleX * 100,
                (v) => set("tile", { tile: { ...tile, scaleX: v / 100 } }),
                { min: 1, max: 1000 },
              ),
              number(
                "缩放比例 Y (%)",
                tile.scaleY * 100,
                (v) => set("tile", { tile: { ...tile, scaleY: v / 100 } }),
                { min: 1, max: 1000 },
              ),
              select("对齐方式", ALIGNMENTS, tile.align, (v) =>
                set(null, { tile: { ...tile, align: v } }),
              ),
              select("镜像类型", MIRRORS, tile.flip, (v) =>
                set(null, { tile: { ...tile, flip: v } }),
              ),
            )
          : el(
              "div",
              { class: "bg-grid" },
              ...[
                ["left", "左侧偏移量 (%)"],
                ["right", "右侧偏移量 (%)"],
                ["top", "顶部偏移量 (%)"],
                ["bottom", "底部偏移量 (%)"],
              ].map(([edge, label]) =>
                number(
                  label,
                  pic.stretch[edge] * 100,
                  (v) =>
                    set("stretch", {
                      stretch: { ...pic.stretch, [edge]: v / 100 },
                    }),
                  { min: -100, max: 100 },
                ),
              ),
            )),
    );
  }

  function patternSwatch(preset, fg, bg) {
    const paths = nativePatternPaths(preset);
    const svg = paths
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="24" height="24" shape-rendering="crispEdges"><rect width="8" height="8" fill="${bg}"/><path d="${paths.foreground}" fill="${fg}"/>${paths.half ? `<path d="${paths.half}" fill="${fg}" opacity=".5"/>` : ""}</svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="24" height="24"><rect width="8" height="8" fill="${bg}"/><circle cx="4" cy="4" r="2" fill="${fg}"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  function patternSection(now) {
    const p = now.pattern || {
      preset: "pct20",
      foreground: "#000000",
      background: "#ffffff",
    };
    const fg = hex(p.foreground, "#000000"),
      bg = hex(p.background, "#ffffff");
    const write = (what, change) =>
      edit(what, (t) =>
        P.setSlideBackgroundPattern(t, {
          preset: p.preset,
          foreground: fg.toUpperCase(),
          background: bg.toUpperCase(),
          ...change,
        }),
      );
    return el(
      "div",
      { class: "bg-section" },
      el(
        "div",
        { class: "bg-patterns", role: "radiogroup", "aria-label": "图案" },
        ...PATTERNS.map((preset) =>
          el("button", {
            type: "button",
            role: "radio",
            class: `bg-pattern ${preset === p.preset ? "active" : ""}`,
            "aria-checked": String(preset === p.preset),
            "aria-label": PATTERN_NAMES[preset] || preset,
            title: PATTERN_NAMES[preset] || preset,
            style: `background-image:${patternSwatch(preset, fg, bg)}`,
            onclick: () => write(null, { preset }),
          }),
        ),
      ),
      host.colorInput("图案前景", fg, (c) =>
        write("pattern-fg", { foreground: c.toUpperCase() }),
      ),
      host.colorInput("图案背景", bg, (c) =>
        write("pattern-bg", { background: c.toUpperCase() }),
      ),
    );
  }

  // ---- The pane ---------------------------------------------------------

  function render() {
    const target = host.target();
    if (!target) return el("div");
    const now = effective(target);
    const part = P.getSlidePartName(target);
    if (state.part !== part) {
      state.part = part;
      state.stop = 0;
    }
    const kindOfTarget = P.getTemplateKind(target);
    const hidesArt = /\sshowMasterSp="(0|false)"/.test(
      P.getSlideXmlString(target).slice(0, 600),
    );
    const name = `bg-fill-${++uid}`;
    const kinds = el(
      "div",
      { class: "bg-kinds", role: "radiogroup", "aria-label": "填充" },
      ...KINDS.map(([kind, label]) =>
        el(
          "label",
          { class: "bg-kind" },
          el("input", {
            type: "radio",
            name,
            value: kind,
            checked: now.kind === kind || null,
            onchange: () => switchTo(kind, now)?.catch?.(host.fail),
          }),
          label,
        ),
      ),
    );
    const section =
      now.kind === "gradient"
        ? gradientSection(now)
        : now.kind === "image"
          ? pictureSection(now)
          : now.kind === "pattern"
            ? patternSection(now)
            : solidSection(now);
    return el(
      "section",
      { class: "bg-pane", id: "format-background", "aria-label": "填充" },
      el("h3", {}, "填充"),
      kinds,
      host.colorField(target),
      host.imageButtons(target),
      section,
      kindOfTarget !== "master" &&
        check("隐藏背景图形", hidesArt, (on) =>
          edit(null, (t) => P.setTemplateShowsMasterShapes(t, !on)),
        ),
      el(
        "div",
        { class: "bg-actions" },
        button(
          "重置背景",
          null,
          () =>
            edit(null, (t) => {
              if (P.getTemplateKind(t) === "master")
                P.setSlideBackground(t, "scheme:bg1");
              else if (P.getSlideBackground(t).kind === "inherit")
                return host.skip;
              else P.clearSlideBackground(t);
              host.afterPicture(t);
            }),
          "secondary",
          { disabled: (!now.own && kindOfTarget !== "master") || null },
        ),
        kindOfTarget === "slide" &&
          button(
            "全部应用",
            null,
            () => {
              const source = P.getSlidePartName(target);
              host.mutateDeck(() => {
                const all = host.slides();
                const from = all.find((s) => P.getSlidePartName(s) === source);
                if (!from) return host.skip;
                for (const s of all) {
                  if (s === from) continue;
                  P.copySlideBackground(from, s);
                  P.setTemplateShowsMasterShapes(s, !hidesArt);
                }
              });
            },
            "secondary",
          ),
      ),
    );
  }

  return { render, PATTERNS };
}

// A theme color spec as CSS, through the theme's colors (approximate tints).
function cssColor(spec, theme) {
  const [head, ...mods] = spec.replace("scheme:", "").split("/");
  const slot =
    { bg1: "light1", tx1: "dark1", bg2: "light2", tx2: "dark2" }[head] || head;
  const base = theme?.[slot] || "#888888";
  const lumMod =
    Number(mods.find((m) => m.startsWith("lumMod="))?.split("=")[1] ?? 100000) /
    100000;
  const lumOff =
    Number(mods.find((m) => m.startsWith("lumOff="))?.split("=")[1] ?? 0) /
    100000;
  if (lumMod === 1 && !lumOff) return base;
  // Mix toward white by the offset: close enough for a swatch.
  return `color-mix(in srgb, ${base} ${Math.round(lumMod * 100)}%, white ${Math.round(lumOff * 100)}%)`;
}
