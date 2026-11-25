// The Format pane for a chart: pick an element of the chart (the whole
// chart, its plot, title, legend, axes, gridlines or a series) and set its
// fill, outline, text and options. Every control applies a change to the
// chart definition through `update(fn, key)`.
import { el } from "../ui.js";
import {
  ERROR_BARS,
  TRENDLINES,
  errorBarState,
  hasAxes,
  labelPositions,
  setErrorBars,
  setTrendline,
  supportsErrorBars,
  supportsTrendline,
  valueAxisVertical,
} from "./chart-styles.js";
import { cleanSpec, isXYKind, parseErrorAmounts } from "./chart-data.js";

const PT = 12700;
const pies = (spec) => spec.kind === "pie" || spec.kind === "doughnut";
const kindOf = (spec, s) => s.chartKind || spec.kind;

// The chart's parts a person can format, in the order a chart is read.
export function chartElements(spec) {
  if (!spec) return [];
  const vertical = valueAxisVertical(spec);
  const list = [
    { id: "chartArea", label: "图表区" },
    { id: "plotArea", label: "绘图区" },
  ];
  if (spec.title !== undefined)
    list.push({ id: "title", label: "图表标题" });
  if (spec.legend?.position !== null)
    list.push({ id: "legend", label: "图例" });
  if (hasAxes(spec) && spec.kind !== "radar") {
    list.push({
      id: "categoryAxis",
      label: isXYKind(spec.kind)
        ? "水平(值)轴"
        : vertical
          ? "水平(类别)轴"
          : "垂直(类别)轴",
    });
    list.push({
      id: "valueAxis",
      label: vertical ? "垂直(值)轴" : "水平(值)轴",
    });
    list.push({
      id: "gridlines",
      label: vertical ? "水平网格线" : "垂直网格线",
    });
  }
  spec.series.forEach((s, i) =>
    list.push({ id: `series:${i}`, label: `系列 "${s.name || i + 1}"` }),
  );
  return list;
}
export function elementLabel(spec, id) {
  return chartElements(spec).find((e) => e.id === id)?.label || "图表区";
}

const set = (key, value) => (spec) => {
  const out = { ...spec };
  if (value === undefined) delete out[key];
  else out[key] = value;
  return cleanSpec(out);
};
const setStyle = (key, patch) => (spec) => {
  const next = { ...(spec[key] || {}), ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return set(key, Object.keys(next).length ? next : undefined)(spec);
};
const setSeries = (i, patch) => (spec) =>
  cleanSpec({
    ...spec,
    series: spec.series.map((s, j) => {
      if (j !== i) return s;
      const next = { ...s, ...patch };
      for (const k of Object.keys(patch))
        if (patch[k] === undefined) delete next[k];
      return next;
    }),
  });
const setLegend = (patch) => (spec) => {
  const next = { position: "r", ...(spec.legend || {}), ...patch };
  for (const k of Object.keys(patch))
    if (patch[k] === undefined) delete next[k];
  return set("legend", next)(spec);
};

// The pane's contents for one element. `h` carries the editor's field
// helpers: field, colorInput, numInput.
export function chartFormatSection({ spec, element, choose, update, h, ctx }) {
  const nodes = [];
  const elements = chartElements(spec);
  if (!elements.some((e) => e.id === element)) element = "chartArea";
  nodes.push(
    el("h3", {}, "图表"),
    h.field(
      "图表元素",
      el(
        "select",
        {
          class: "input",
          "aria-label": "图表元素",
          onchange: (e) => choose(e.target.value),
        },
        ...elements.map((e) =>
          el("option", { value: e.id, selected: e.id === element }, e.label),
        ),
      ),
    ),
  );
  const key = (k) => `chart:${element}:${k}`;
  const color = (label, value, apply, { auto = true, none = true } = {}) => {
    const wrap = el("div", { class: "chart-color-row" });
    wrap.append(
      h.colorInput(
        label,
        value || null,
        (c) => update(apply(c.toUpperCase()), key(label)),
        {
          empty: value === null ? "None" : "Automatic",
          fallback: "#808080",
        },
      ),
    );
    const buttons = el("div", { class: "chart-color-actions" });
    if (auto)
      buttons.append(
        el(
          "button",
          {
            type: "button",
            class: "btn text-button",
            "aria-label": `${label}: automatic`,
            onclick: () => update(apply(undefined)),
          },
          "Automatic",
        ),
      );
    if (none)
      buttons.append(
        el(
          "button",
          {
            type: "button",
            class: "btn text-button",
            "aria-label": `${label}: none`,
            onclick: () => update(apply(null)),
          },
          "None",
        ),
      );
    wrap.append(buttons);
    return wrap;
  };
  const check = (label, checked, apply) =>
    el(
      "label",
      { class: "check-field" },
      el("input", {
        type: "checkbox",
        checked: !!checked,
        onchange: (e) => update(apply(e.target.checked)),
      }),
      el("span", {}, label),
    );
  const select = (label, value, options, apply) =>
    h.field(
      label,
      el(
        "select",
        {
          class: "input",
          "aria-label": label,
          onchange: (e) => update(apply(e.target.value)),
        },
        ...options.map(([v, l]) =>
          el("option", { value: v, selected: String(v) === String(value) }, l),
        ),
      ),
    );
  const text = (label, value, apply) =>
    h.field(
      label,
      el("input", {
        class: "input",
        value: value ?? "",
        "aria-label": label,
        onchange: (e) => update(apply(e.target.value)),
      }),
    );
  const optionalNumber = (
    label,
    value,
    apply,
    { min = -1e9, max = 1e9, step = 1 } = {},
  ) =>
    h.field(
      label,
      el("input", {
        type: "number",
        class: "input",
        value: value ?? "",
        min,
        max,
        step,
        placeholder: "自动",
        "aria-label": label,
        onchange: (e) => {
          const raw = e.target.value.trim();
          const n = raw === "" ? undefined : Number(raw);
          if (n !== undefined && !Number.isFinite(n)) return;
          update(apply(n));
        },
      }),
    );
  const textStyle = (styleKey, label) => {
    const style = spec[styleKey] || {};
    return [
      el("h3", {}, label),
      h.numInput(
        `${label} size (pt)`,
        style.sizePt ?? (styleKey === "titleStyle" ? 14 : 10),
        (n) =>
          update(setStyle(styleKey, { sizePt: n }), key(`${styleKey}-size`)),
        6,
        72,
        1,
      ),
      el(
        "div",
        { class: "chart-check-row" },
        check("加粗", style.bold, (on) =>
          setStyle(styleKey, { bold: on || undefined }),
        ),
        check("倾斜", style.italic, (on) =>
          setStyle(styleKey, { italic: on || undefined }),
        ),
      ),
      color(
        `${label} color`,
        style.color,
        (c) => setStyle(styleKey, { color: c ?? undefined }),
        { none: false },
      ),
    ];
  };

  switch (element) {
    case "chartArea":
      nodes.push(
        el("h3", {}, "填充与轮廓"),
        color("图表填充", spec.chartAreaFill, (c) => set("chartAreaFill", c)),
        color("图表轮廓", spec.chartAreaStrokeColor, (c) =>
          set("chartAreaStrokeColor", c),
        ),
        h.numInput(
          "轮廓宽度(pt)",
          (spec.chartAreaStrokeWidthEmu ?? 9525) / PT,
          (n) =>
            update(
              set("chartAreaStrokeWidthEmu", Math.round(n * PT)),
              key("w"),
            ),
          0,
          20,
          0.25,
        ),
        check("圆角", spec.roundedCorners, (on) =>
          set("roundedCorners", on || undefined),
        ),
        ...textStyle("textStyle", "所有文本"),
      );
      if (spec.kind === "doughnut")
        nodes.push(
          h.numInput(
            "圆环图内径大小(%)",
            spec.holeSizePct ?? 50,
            (n) => update(set("holeSizePct", Math.round(n)), key("hole")),
            10,
            90,
            1,
          ),
        );
      if (pies(spec))
        nodes.push(
          h.numInput(
            "第一扇区起始角度(°)",
            spec.firstSliceAngleDeg ?? 0,
            (n) =>
              update(set("firstSliceAngleDeg", Math.round(n)), key("angle")),
            0,
            360,
            1,
          ),
        );
      if (spec.kind === "bar" || spec.kind === "column")
        nodes.push(
          el("h3", {}, "条柱"),
          h.numInput(
            "间隙宽度(%)",
            spec.gapWidthPct ?? 150,
            (n) => update(set("gapWidthPct", Math.round(n)), key("gap")),
            0,
            500,
            5,
          ),
          h.numInput(
            "系列重叠(%)",
            spec.overlapPct ??
              (spec.grouping && spec.grouping !== "clustered" ? 100 : 0),
            (n) => update(set("overlapPct", Math.round(n)), key("overlap")),
            -100,
            100,
            5,
          ),
          check("按要素着色", spec.varyColors, (on) =>
            set("varyColors", on || undefined),
          ),
        );
      if (!pies(spec) && !isXYKind(spec.kind))
        nodes.push(
          select(
            "空单元格显示为",
            spec.dispBlanksAs || "gap",
            [
              ["gap", "空距"],
              ["zero", "零值"],
              ["span", "用直线连接数据点"],
            ],
            (v) => set("dispBlanksAs", v),
          ),
        );
      break;
    case "plotArea":
      nodes.push(
        el("h3", {}, "填充与轮廓"),
        color("绘图区填充", spec.plotAreaFill, (c) => set("plotAreaFill", c)),
        color("绘图区轮廓", spec.plotAreaStrokeColor, (c) =>
          set("plotAreaStrokeColor", c),
        ),
      );
      break;
    case "title":
      nodes.push(
        el("h3", {}, "标题"),
        text("标题文本", spec.title, (v) => set("title", v)),
        check("在图表上重叠显示", spec.titleOverlay, (on) =>
          set("titleOverlay", on || undefined),
        ),
        ...textStyle("titleStyle", "标题文本"),
      );
      break;
    case "legend":
      nodes.push(
        el("h3", {}, "图例"),
        select(
          "图例位置",
          spec.legend?.position || "r",
          [
            ["t", "靠上"],
            ["b", "靠下"],
            ["l", "靠左"],
            ["r", "靠右"],
            ["tr", "右上"],
          ],
          (v) => setLegend({ position: v }),
        ),
        check("在图表上重叠显示", spec.legend?.overlay, (on) =>
          setLegend({ overlay: on || undefined }),
        ),
        color("图例填充", spec.legend?.fill, (c) => setLegend({ fill: c })),
        color("图例轮廓", spec.legend?.strokeColor, (c) =>
          setLegend({ strokeColor: c }),
        ),
        h.numInput(
          "图例文本字号(pt)",
          spec.legend?.textStyle?.sizePt ?? 10,
          (n) =>
            update(
              setLegend({
                textStyle: { ...(spec.legend?.textStyle || {}), sizePt: n },
              }),
              key("size"),
            ),
          6,
          48,
          1,
        ),
      );
      break;
    case "valueAxis": {
      const axis = spec.valueAxis || {};
      const setAxis = (patch) => (s) => {
        const next = { ...(s.valueAxis || {}), ...patch };
        for (const k of Object.keys(next))
          if (next[k] === undefined) delete next[k];
        return set("valueAxis", Object.keys(next).length ? next : undefined)(s);
      };
      nodes.push(
        el("h3", {}, "边界与单位"),
        el(
          "div",
          { class: "field-grid" },
          optionalNumber("最小值", axis.min, (n) => setAxis({ min: n })),
          optionalNumber("最大值", axis.max, (n) => setAxis({ max: n })),
          optionalNumber(
            "主要单位",
            axis.majorUnit,
            (n) => setAxis({ majorUnit: n && n > 0 ? n : undefined }),
            { min: 0, step: 0.1 },
          ),
          optionalNumber(
            "次要单位",
            axis.minorUnit,
            (n) => setAxis({ minorUnit: n && n > 0 ? n : undefined }),
            { min: 0, step: 0.1 },
          ),
        ),
        select(
          "显示单位",
          axis.displayUnits || "",
          [
            ["", "无"],
            ["hundreds", "百"],
            ["thousands", "千"],
            ["millions", "百万"],
            ["billions", "十亿"],
          ],
          (v) => setAxis({ displayUnits: v || undefined }),
        ),
        select(
          "数字格式",
          axis.numberFormat || "",
          [
            ["", "链接到数据"],
            ["General", "常规"],
            ["0", "整数"],
            ["0.0", "1 位小数"],
            ["0.00", "2 位小数"],
            ["#,##0", "千位分隔符"],
            ["0%", "百分比"],
            ["$#,##0", "货币"],
          ],
          (v) =>
            setAxis(
              v
                ? { numberFormat: v, numberFormatSourceLinked: false }
                : {
                    numberFormat: undefined,
                    numberFormatSourceLinked: undefined,
                  },
            ),
        ),
        check("对数刻度", axis.logBase, (on) =>
          setAxis({ logBase: on ? 10 : undefined }),
        ),
        check(
          "逆序值",
          spec.valueAxisOrientation === "maxMin",
          (on) => set("valueAxisOrientation", on ? "maxMin" : undefined),
        ),
        check("隐藏此坐标轴", spec.valueAxisHidden, (on) =>
          set("valueAxisHidden", on || undefined),
        ),
        text("坐标轴标题", spec.valueAxisTitle, (v) =>
          set("valueAxisTitle", v || undefined),
        ),
        color("坐标轴线条", spec.valueAxisLineColor, (c) =>
          set("valueAxisLineColor", c),
        ),
        select(
          "主要刻度线类型",
          spec.valueAxisMajorTickMark || "none",
          [
            ["none", "无"],
            ["out", "外部"],
            ["in", "内部"],
            ["cross", "十字形"],
          ],
          (v) => set("valueAxisMajorTickMark", v),
        ),
        ...textStyle("valueAxisLabelStyle", "坐标轴标签"),
      );
      break;
    }
    case "categoryAxis":
      nodes.push(
        el("h3", {}, "坐标轴选项"),
        check(
          isXYKind(spec.kind)
            ? "逆序值"
            : "逆序类别",
          spec.categoryAxisOrientation === "maxMin",
          (on) => set("categoryAxisOrientation", on ? "maxMin" : undefined),
        ),
        check("隐藏此坐标轴", spec.categoryAxisHidden, (on) =>
          set("categoryAxisHidden", on || undefined),
        ),
        text("坐标轴标题", spec.categoryAxisTitle, (v) =>
          set("categoryAxisTitle", v || undefined),
        ),
        color("坐标轴线条", spec.categoryAxisLineColor, (c) =>
          set("categoryAxisLineColor", c),
        ),
        ...(isXYKind(spec.kind)
          ? []
          : [
              optionalNumber(
                "标签间隔",
                spec.categoryAxisTickLabelSkip,
                (n) =>
                  set(
                    "categoryAxisTickLabelSkip",
                    n && n >= 1 ? Math.round(n) : undefined,
                  ),
                { min: 1, step: 1 },
              ),
            ]),
        select(
          "主要刻度线类型",
          spec.categoryAxisMajorTickMark || "none",
          [
            ["none", "无"],
            ["out", "外部"],
            ["in", "内部"],
            ["cross", "十字形"],
          ],
          (v) => set("categoryAxisMajorTickMark", v),
        ),
        ...textStyle("categoryAxisLabelStyle", "坐标轴标签"),
      );
      break;
    case "gridlines":
      nodes.push(
        el("h3", {}, "网格线"),
        check("主要网格线", spec.valueAxisMajorGridlines ?? true, (on) =>
          set("valueAxisMajorGridlines", on),
        ),
        color(
          "主要网格线颜色",
          spec.valueAxisMajorGridlineColor,
          (c) => set("valueAxisMajorGridlineColor", c),
          { none: false },
        ),
        h.numInput(
          "主要网格线宽度(pt)",
          (spec.valueAxisMajorGridlineWidthEmu ?? 9525) / PT,
          (n) =>
            update(
              set("valueAxisMajorGridlineWidthEmu", Math.round(n * PT)),
              key("gw"),
            ),
          0,
          10,
          0.25,
        ),
        check("次要网格线", spec.valueAxisMinorGridlines, (on) =>
          set("valueAxisMinorGridlines", on),
        ),
        color(
          "次要网格线颜色",
          spec.valueAxisMinorGridlineColor,
          (c) => set("valueAxisMinorGridlineColor", c),
          { none: false },
        ),
        check(
          "跨类别网格线",
          spec.categoryAxisMajorGridlines,
          (on) => set("categoryAxisMajorGridlines", on),
        ),
      );
      break;
    default: {
      const i = Number(element.split(":")[1]);
      const s = spec.series[i];
      if (!s) break;
      const kind = kindOf(spec, s);
      const lineLike =
        kind === "line" || kind === "scatter" || kind === "radar";
      nodes.push(
        el("h3", {}, "系列"),
        text("系列名称", s.name, (v) => setSeries(i, { name: v })),
      );
      if (pies(spec)) {
        nodes.push(
          h.numInput(
            "点分离(%)",
            Math.max(0, ...(s.pointExplosions || [0]).map((v) => v || 0)),
            (n) =>
              update(
                setSeries(i, {
                  pointExplosions:
                    n > 0 ? s.values.map(() => Math.round(n)) : undefined,
                }),
                key("explode"),
              ),
            0,
            100,
            1,
          ),
        );
        const n = Math.max(spec.categories.length, s.values.length);
        nodes.push(el("h3", {}, "扇区颜色"));
        for (let p = 0; p < n; p++)
          nodes.push(
            color(
              `扇区 "${spec.categories[p] ?? p + 1}"`,
              s.pointColors?.[p] ?? undefined,
              (c) => {
                const colors = Array.from(
                  { length: n },
                  (_, j) => s.pointColors?.[j] ?? null,
                );
                colors[p] = c ?? null;
                return setSeries(i, {
                  pointColors: colors.some((v) => v) ? colors : undefined,
                });
              },
              { none: false },
            ),
          );
      } else {
        if (!lineLike || spec.radarStyle === "filled")
          nodes.push(
            color(
              "填充",
              s.color,
              (c) => setSeries(i, { color: c ?? undefined }),
              { none: false },
            ),
          );
        nodes.push(
          color(lineLike ? "线条" : "轮廓", s.lineColor, (c) =>
            setSeries(
              i,
              lineLike && c ? { lineColor: c, color: c } : { lineColor: c },
            ),
          ),
          h.numInput(
            lineLike ? "线条宽度(pt)" : "轮廓宽度(pt)",
            (s.lineWidthEmu ?? (lineLike ? 28575 : 0)) / PT,
            (n) =>
              update(
                setSeries(i, { lineWidthEmu: Math.round(n * PT) }),
                key("lw"),
              ),
            0,
            20,
            0.25,
          ),
          select(
            "短划线类型",
            s.lineDash || "solid",
            [
              ["solid", "实线"],
              ["dash", "虚线"],
              ["sysDot", "圆点"],
              ["sysDash", "方点"],
              ["dashDot", "点划线"],
              ["lgDash", "长划线"],
            ],
            (v) => setSeries(i, { lineDash: v === "solid" ? undefined : v }),
          ),
        );
        if (lineLike && spec.radarStyle !== "filled")
          nodes.push(
            select(
              "数据标记",
              s.markerSymbol || "auto",
              [
                ["auto", "自动"],
                ["none", "无"],
                ["circle", "圆形"],
                ["square", "正方形"],
                ["diamond", "菱形"],
                ["triangle", "三角形"],
                ["x", "X"],
                ["plus", "正偏差"],
                ["star", "星形"],
              ],
              (v) =>
                setSeries(i, { markerSymbol: v === "auto" ? undefined : v }),
            ),
            h.numInput(
              "标记大小",
              s.markerSizePt ?? 5,
              (n) =>
                update(
                  setSeries(i, {
                    markerSizePt: Math.round(Math.max(2, Math.min(72, n))),
                  }),
                  key("ms"),
                ),
              2,
              72,
              1,
            ),
            check("平滑线", s.smooth, (on) =>
              setSeries(i, { smooth: on || undefined }),
            ),
          );
        if (kind === "bar" || kind === "column")
          nodes.push(
            check("以互补色代表负值", s.invertIfNegative, (on) =>
              setSeries(i, { invertIfNegative: on }),
            ),
          );
        if (
          !isXYKind(spec.kind) &&
          spec.kind !== "radar" &&
          spec.series.length > 1
        )
          nodes.push(
            check("在次坐标轴上绘制", s.secondaryAxis, (on) =>
              setSeries(i, { secondaryAxis: on || undefined }),
            ),
          );
      }
      // Labels for this series.
      const dl = s.dataLabels || spec.dataLabels || {};
      const setLabels = (patch) => (sp) => {
        const base = {
          showValue: false,
          showCategory: false,
          showSeriesName: false,
          showPercent: false,
          ...(sp.series[i].dataLabels || sp.dataLabels || {}),
          ...patch,
        };
        if (base.position === "") delete base.position;
        return setSeries(i, { dataLabels: base })(sp);
      };
      nodes.push(
        el("h3", {}, "数据标签"),
        el(
          "div",
          { class: "chart-check-grid" },
          check("值", dl.showValue, (on) => setLabels({ showValue: on })),
          check("类别名称", dl.showCategory, (on) =>
            setLabels({ showCategory: on }),
          ),
          check("系列名称", dl.showSeriesName, (on) =>
            setLabels({ showSeriesName: on }),
          ),
          ...(pies(spec)
            ? [
                check("百分比", dl.showPercent, (on) =>
                  setLabels({ showPercent: on }),
                ),
              ]
            : []),
        ),
      );
      const positions = labelPositions(spec).filter(([v]) => v !== "show");
      if (positions.length)
        nodes.push(
          select(
            "标签位置",
            dl.position || "",
            [["", "自动"], ...positions],
            (v) => setLabels({ position: v }),
          ),
        );
      if (supportsTrendline(spec) && !pies(spec))
        nodes.push(
          el("h3", {}, "分析"),
          select(
            "趋势线",
            s.trendline
              ? s.trendline.forward
                ? "forecast"
                : s.trendline.type
              : "none",
            [["none", "无"], ...TRENDLINES.map(([id, label]) => [id, label])],
            (v) => (sp) => setTrendline(sp, v, i),
          ),
        );
      // Direction, end style and amount of the series' error bars; custom
      // amounts are numbers or a range of the data sheet.
      const errorBarOptions = (bars) => {
        const setBars = (patch) => (sp) => {
          const next = { ...sp.series[i].errorBars, ...patch };
          for (const k of Object.keys(next))
            if (next[k] === undefined) delete next[k];
          return setSeries(i, { errorBars: next })(sp);
        };
        const out = [
          select(
            "误差线方向",
            bars.type,
            [
              ["both", "正负偏差"],
              ["minus", "负偏差"],
              ["plus", "正偏差"],
            ],
            (v) => setBars({ type: v }),
          ),
          check("末端样式", !bars.noEndCap, (on) =>
            setBars({ noEndCap: on ? undefined : true }),
          ),
          select(
            "误差量",
            bars.valueType,
            [
              ["fixedVal", "固定值"],
              ["percentage", "百分比"],
              ["stdDev", "标准偏差"],
              ["stdErr", "标准误差"],
              ["cust", "自定义"],
            ],
            (v) =>
              setBars({
                valueType: v,
                value: undefined,
                ...(v === "cust"
                  ? {
                      plus: bars.plus ?? spec.series[i].values.map(() => 1),
                      minus: bars.minus ?? spec.series[i].values.map(() => 1),
                    }
                  : {
                      plus: undefined,
                      minus: undefined,
                      plusRef: undefined,
                      minusRef: undefined,
                    }),
              }),
          ),
        ];
        if (["fixedVal", "percentage", "stdDev"].includes(bars.valueType))
          out.push(
            h.numInput(
              bars.valueType === "percentage"
                ? "百分比(%)"
                : bars.valueType === "stdDev"
                  ? "标准偏差"
                  : "固定值",
              bars.value ?? (bars.valueType === "percentage" ? 5 : 1),
              (n) =>
                update(
                  setBars({ value: Math.max(0, Number(n) || 0) }),
                  key("eb"),
                ),
              0,
              1e9,
              bars.valueType === "percentage" ? 1 : 0.1,
            ),
          );
        if (bars.valueType === "cust")
          for (const [side, label] of [
            ["plus", "正错误值"],
            ["minus", "负错误值"],
          ])
            out.push(
              text(
                label,
                bars[`${side}Ref`] ??
                  (bars[side] ?? []).map((v) => v ?? "").join(", "),
                (value) => (sp) => {
                  const parsed = parseErrorAmounts(value, sp);
                  if (!parsed) return sp;
                  return setBars({
                    [side]: parsed.values,
                    [`${side}Ref`]: parsed.ref,
                  })(sp);
                },
              ),
            );
        if (bars.valueType === "cust")
          out.push(
            el(
              "p",
              { class: "chart-hint" },
              "输入以逗号分隔的数字，或数据表范围(如 C2:C4)。",
            ),
          );
        return out;
      };
      if (supportsErrorBars(spec)) {
        nodes.push(
          select(
            "误差线",
            s.errorBars ? errorBarState({ series: [s] }) : "none",
            [
              ["none", "无"],
              ...ERROR_BARS.map(([id, label]) => [id, label]),
              ...(s.errorBars && errorBarState({ series: [s] }) === "custom"
                ? [["custom", "自定义"]]
                : []),
            ],
            (v) => (sp) => {
              if (v === "custom") return sp;
              const all = setErrorBars(sp, v);
              return setSeries(i, { errorBars: all.series[i].errorBars })(sp);
            },
          ),
        );
        if (s.errorBars) nodes.push(...errorBarOptions(s.errorBars));
      }
    }
  }
  return nodes;
}
