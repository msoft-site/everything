// Charts in the editor: Insert Chart, the data sheet, the Chart Design and
// Format tabs, and the chart section of the Format pane. The editor hands
// in what this needs (`h`); everything here edits the chart through the
// engine's ChartSpec, which keeps the chart part and its embedded workbook
// in step.
import "./charts.css";
import "./chart-icons.js";
import { el, dialog, button, closeMenu } from "../ui.js";
import { colorMenuItems } from "../color-palette.js";
import {
  CHART_TYPES,
  chartType,
  detectChartType,
  isXYKind,
  sampleSpec,
  switchRowColumn,
  canSwitchRowColumn,
  cleanSpec,
} from "./chart-data.js";
import {
  CHART_STYLES,
  COLOR_PALETTES,
  ERROR_BARS,
  QUICK_LAYOUTS,
  TRENDLINES,
  applyChartStyle,
  applyPalette,
  applyQuickLayout,
  elementState,
  errorBarState,
  hasAxes,
  labelPositions,
  paletteColors,
  setElement,
  setErrorBars,
  setTrendline,
  supportsDataTable,
  supportsErrorBars,
  supportsTrendline,
  themeContext,
  valueAxisVertical,
} from "./chart-styles.js";
import { chooseChartType } from "./chart-type-dialog.js";
import { openChartSheet } from "./chart-sheet.js";
import {
  chartFormatSection,
  chartElements,
  elementLabel,
} from "./chart-format.js";
import { chartImage } from "./chart-render.js";

const svgNode = (markup) => {
  const t = document.createElement("template");
  t.innerHTML = markup;
  return t.content.firstChild;
};

export function createChartTools(h) {
  const { P } = h;
  let element = "chartArea";
  let elementOwner = null;
  let sheet = null;

  const isChart = (obj) => {
    try {
      return !!obj && P.isChartShape(obj);
    } catch {
      return false;
    }
  };
  const specOf = (obj) => {
    try {
      return obj ? P.getShapeChartSpec(obj) : null;
    } catch {
      return null;
    }
  };
  const selectedChart = () => {
    const list = h.selection();
    return list.length === 1 && isChart(list[0]) ? list[0] : null;
  };
  const ctx = () => themeContext(h.theme());
  const keyOf = (obj) =>
    `${P.getSlidePartName(P.getShapeSlide(obj))}#${P.getShapeId(obj)}`;
  // Applies `fn` to the chart's definition as one undoable edit.
  function update(obj, fn, coalesce = null) {
    if (!obj) return Promise.resolve(false);
    return h.mutateShape(
      obj,
      (target) => {
        const spec = specOf(target);
        if (!spec) return h.skip;
        const next = cleanSpec(fn(spec));
        if (JSON.stringify(next) === JSON.stringify(spec)) return h.skip;
        P.setChartSpec({ shape: target, spec }, next);
      },
      coalesce ? { coalesce: `${coalesce}:${keyOf(obj)}` } : undefined,
    );
  }
  const updateSelected = (fn, coalesce) =>
    update(selectedChart(), fn, coalesce);

  /* ---------- Insert ---------- */
  async function insert() {
    h.commitText();
    const theme = h.theme();
    const size = h.slideSize();
    const choice = await chooseChartType({
      title: "插入图表",
      confirm: "插入",
      theme,
      accents: themeContext(theme).accents,
      aspect: 3 / 2,
    });
    if (!choice) return;
    const w = Math.round(size.cx * 0.62),
      hgt = Math.round(Math.min(size.cy * 0.68, w / 1.5));
    const x = Math.round((size.cx - w) / 2),
      y = Math.round((size.cy - hgt) / 2 + size.cy * 0.04);
    let inserted = null;
    const ok = await h.mutateSlide(h.slide(), (target) => {
      const shape = P.addSlideChart(target, {
        spec: choice.spec,
        x,
        y,
        w,
        h: hgt,
      });
      P.renameShape(shape, `Chart ${P.getShapeId(shape)}`);
      inserted = P.getShapeId(shape);
      h.selectIds([inserted]);
    });
    if (ok && inserted != null) {
      h.selectTab?.("chart-design");
      editData();
    }
  }

  /* ---------- Data ---------- */
  function editData(obj = selectedChart()) {
    if (!obj) return;
    const part = P.getSlidePartName(P.getShapeSlide(obj));
    const id = P.getShapeId(obj);
    if (sheet?.open) {
      if (sheet.key === `${part}#${id}`) {
        sheet.panel.focus();
        return;
      }
      sheet.close();
    }
    const target = () => {
      const s = P.getSlides(h.pres()).find(
        (x) => P.getSlidePartName(x) === part,
      );
      const shape = s ? P.findShapeById(s, id) : null;
      return isChart(shape) ? shape : null;
    };
    const opened = openChartSheet({
      title: `图表数据 — ${P.getShapeName?.(obj) || "图表"}`,
      target,
      read: specOf,
      write: (spec) => update(target(), () => spec, "chart-data"),
      seriesColor: (i) => {
        const spec = specOf(target());
        const s = spec?.series[i];
        return s?.color || ctx().accents[i % 6];
      },
    });
    if (!opened) return;
    opened.key = `${part}#${id}`;
    opened.onClose = () => {
      if (sheet === opened) sheet = null;
    };
    sheet = opened;
  }
  async function changeType(obj = selectedChart()) {
    const spec = specOf(obj);
    if (!spec) return;
    const theme = h.theme();
    const choice = await chooseChartType({
      title: "更改图表类型",
      confirm: "确定",
      spec,
      current: detectChartType(spec) || "column-clustered",
      theme,
      accents: themeContext(theme).accents,
      aspect: aspectOf(obj),
    });
    if (choice) update(obj, () => choice.spec);
  }
  function aspectOf(obj) {
    try {
      const b = P.getShapeBounds?.(obj) || P.getShapeTransform?.(obj);
      if (b?.w && b?.h) return b.w / b.h;
      if (b?.cx && b?.cy) return b.cx / b.cy;
    } catch {}
    return 3 / 2;
  }
  async function selectData(obj = selectedChart()) {
    let spec = specOf(obj);
    if (!spec) return;
    const xy = isXYKind(spec.kind);
    const list = el("ul", {
      class: "chart-series-list",
      role: "listbox",
      "aria-label": "系列",
    });
    const cats = el("textarea", {
      class: "input chart-category-input",
      rows: 5,
      "aria-label": "类别标签，每行一个",
    });
    let chosen = 0;
    // Choosing a series marks it in place: a click in its name box must
    // leave the box there, focused, to type in.
    const choose = (i) => {
      chosen = i;
      [...list.children].forEach((item, j) => {
        item.tabIndex = j === chosen ? 0 : -1;
        item.setAttribute("aria-selected", String(j === chosen));
      });
      up.disabled = chosen <= 0;
      down.disabled = chosen >= spec.series.length - 1;
    };
    const draw = () => {
      list.replaceChildren(
        ...spec.series.map((s, i) =>
          el(
            "li",
            {
              role: "option",
              class: "chart-series-item",
              onclick: () => choose(i),
            },
            el("span", {
              class: "chart-sheet-swatch",
              style: `background:${s.color || ctx().accents[i % 6]}`,
              "aria-hidden": "true",
            }),
            el("input", {
              class: "input",
              value: s.name,
              "aria-label": `Name of series ${i + 1}`,
              onfocus: () => choose(i),
              onchange: (e) => {
                spec = cleanSpec({
                  ...spec,
                  series: spec.series.map((x, j) =>
                    j === i ? { ...x, name: e.target.value } : x,
                  ),
                });
              },
            }),
          ),
        ),
      );
      cats.value = spec.categories.join("\n");
      cats.disabled = xy;
      swap.disabled = !canSwitchRowColumn(spec.kind);
      remove.disabled = spec.series.length <= 1;
      choose(chosen);
    };
    const move = (d) => {
      const s = [...spec.series];
      const j = chosen + d;
      if (j < 0 || j >= s.length) return;
      [s[chosen], s[j]] = [s[j], s[chosen]];
      spec = { ...spec, series: s };
      chosen = j;
      draw();
    };
    const add = button(
      "Add",
      "o:plus",
      () => {
        const n = Math.max(
          spec.categories.length,
          spec.series[0]?.values.length || 0,
        );
        spec = cleanSpec({
          ...spec,
          series: [
            ...spec.series,
            {
              name: `Series ${spec.series.length + 1}`,
              values: Array(n).fill(null),
              ...(xy ? { xValues: spec.series[0]?.xValues || [] } : {}),
              ...(spec.kind === "bubble"
                ? { bubbleSizes: Array(n).fill(1) }
                : {}),
            },
          ],
        });
        chosen = spec.series.length - 1;
        draw();
      },
      "secondary",
    );
    const remove = button(
      "Remove",
      "o:minus",
      () => {
        if (spec.series.length <= 1) return;
        spec = { ...spec, series: spec.series.filter((_, i) => i !== chosen) };
        chosen = Math.max(0, chosen - 1);
        draw();
      },
      "secondary",
    );
    const up = button("上移", "ChevronUp", () => move(-1), "secondary");
    const down = button("下移", "ChevronDown", () => move(1), "secondary");
    const swap = button(
      "Switch Row/Column",
      "o:switchRowColumn",
      () => {
        readCategories();
        spec = switchRowColumn(spec);
        chosen = 0;
        draw();
      },
      "secondary",
    );
    const blanks = el(
      "select",
      { class: "input", "aria-label": "空单元格显示为" },
      ...[
        ["gap", "空距"],
        ["zero", "零"],
        ["span", "用直线连接数据点"],
      ].map(([v, l]) =>
        el(
          "option",
          { value: v, selected: (spec.dispBlanksAs || "gap") === v },
          l,
        ),
      ),
    );
    const readCategories = () => {
      if (xy) return;
      const lines = cats.value.split("\n");
      spec = cleanSpec({ ...spec, categories: lines });
    };
    const body = el(
      "form",
      { class: "dialog-body chart-select-data" },
      el("div", { class: "chart-select-top" }, swap),
      el(
        "div",
        { class: "chart-select-cols" },
        el(
          "div",
          {},
          el("h3", {}, "系列"),
          list,
          el("div", { class: "chart-select-actions" }, add, remove, up, down),
        ),
        el(
          "div",
          {},
          el(
            "h3",
            {},
            xy ? "X 值来自数据表" : "水平(分类)轴标签",
          ),
          cats,
        ),
      ),
      el("label", {}, "空单元格显示为", blanks),
    );
    draw();
    const ok = await dialog({ title: "选择数据", body, confirm: "确定" });
    if (!ok) return;
    readCategories();
    spec = cleanSpec({
      ...spec,
      dispBlanksAs: blanks.value === "gap" ? undefined : blanks.value,
    });
    const final = spec;
    update(obj, () => final);
  }

  /* ---------- Chart Design menus ---------- */
  function addElementMenu() {
    const spec = specOf(selectedChart());
    if (!spec) return [];
    const vertical = valueAxisVertical(spec);
    const radio = (el2, value, label) => ({
      label,
      checked: elementState(spec, el2) === value,
      onSelect: () => updateSelected((s) => setElement(s, el2, value)),
    });
    const toggle = (el2, label) => ({
      label,
      checked: !!elementState(spec, el2),
      onSelect: () =>
        updateSelected((s) => setElement(s, el2, !elementState(s, el2))),
    });
    const more = (id, label = "More Options…") => ({
      label,
      onSelect: () => formatElement(id),
    });
    const axes = hasAxes(spec) && spec.kind !== "radar";
    const lineKinds =
      spec.kind === "line" || spec.series.some((s) => s.chartKind === "line");
    const items = [];
    if (axes)
      items.push(
        {
          label: "坐标轴",
          icon: "o:chartColumn",
          items: [
            toggle(
              "categoryAxis",
              vertical ? "主要横坐标轴" : "主要纵坐标轴",
            ),
            toggle(
              "valueAxis",
              vertical ? "主要纵坐标轴" : "主要横坐标轴",
            ),
            { separator: true },
            more("valueAxis", "More Axis Options…"),
          ],
        },
        {
          label: "坐标轴标题",
          icon: "o:textBox",
          items: [
            toggle(
              "categoryAxisTitle",
              vertical ? "主要横坐标轴" : "主要纵坐标轴",
            ),
            toggle(
              "valueAxisTitle",
              vertical ? "主要纵坐标轴" : "主要横坐标轴",
            ),
          ],
        },
      );
    items.push({
      label: "图表标题",
      icon: "o:textBox",
      items: [
        radio("title", "none", "无"),
        radio("title", "above", "图表上方"),
        radio("title", "overlay", "居中覆盖"),
        { separator: true },
        more("title", "More Title Options…"),
      ],
    });
    items.push({
      label: "数据标签",
      icon: "o:chartBar",
      items: [
        radio("dataLabels", "none", "无"),
        ...labelPositions(spec).map(([v, l]) => radio("dataLabels", v, l)),
        { separator: true },
        more(
          spec.series.length ? "series:0" : "chartArea",
          "More Data Label Options…",
        ),
      ],
    });
    if (supportsDataTable(spec))
      items.push({
        label: "数据表",
        icon: "o:table",
        items: [
          radio("dataTable", "none", "无"),
          radio("dataTable", "keys", "显示图例键标"),
          radio("dataTable", "plain", "无图例键标"),
        ],
      });
    if (supportsErrorBars(spec)) {
      const state = errorBarState(spec);
      items.push({
        label: "误差线",
        icon: "o:chartLine",
        items: [
          {
            label: "无",
            checked: state === "none",
            onSelect: () => updateSelected((s) => setErrorBars(s, "none")),
          },
          ...ERROR_BARS.map(([id, label]) => ({
            label,
            checked: state === id,
            onSelect: () => updateSelected((s) => setErrorBars(s, id)),
          })),
          { separator: true },
          more(
            spec.series.length ? "series:0" : "chartArea",
            "More Error Bars Options…",
          ),
        ],
      });
    }
    if (axes)
      items.push({
        label: "网格线",
        icon: "o:gridlines",
        items: vertical
          ? [
              toggle("valueMajorGrid", "主主要水平网格线"),
              toggle("categoryMajorGrid", "主主要垂直网格线"),
              toggle("valueMinorGrid", "主次要水平网格线"),
              toggle("categoryMinorGrid", "主次要垂直网格线"),
            ]
          : [
              toggle("categoryMajorGrid", "主主要水平网格线"),
              toggle("valueMajorGrid", "主主要垂直网格线"),
              toggle("categoryMinorGrid", "主次要水平网格线"),
              toggle("valueMinorGrid", "主次要垂直网格线"),
            ],
      });
    items.push({
      label: "图例",
      icon: "o:bullets",
      items: [
        radio("legend", "none", "无"),
        radio("legend", "r", "靠右"),
        radio("legend", "t", "靠上"),
        radio("legend", "l", "靠左"),
        radio("legend", "b", "靠下"),
        { separator: true },
        more("legend", "More Legend Options…"),
      ],
    });
    if (lineKinds || spec.kind === "area")
      items.push({
        label: "线条",
        icon: "o:chartLine",
        items: [
          {
            label: "无",
            checked: !spec.dropLines && !spec.hiLowLines,
            onSelect: () =>
              updateSelected((s) =>
                setElement(
                  setElement(s, "dropLines", false),
                  "hiLowLines",
                  false,
                ),
              ),
          },
          toggle("dropLines", "垂直线"),
          ...(lineKinds ? [toggle("hiLowLines", "高低点连线")] : []),
        ],
      });
    if (lineKinds)
      items.push({
        label: "涨/跌柱线",
        icon: "o:chartColumn",
        items: [
          radio("upDownBars", false, "None"),
          radio("upDownBars", true, "Up/Down Bars"),
        ],
      });
    if (supportsTrendline(spec)) {
      const target = (id) =>
        spec.series.length === 1
          ? { onSelect: () => updateSelected((s) => setTrendline(s, id, 0)) }
          : {
              items: [
                {
                  label: "所有系列",
                  onSelect: () => updateSelected((s) => setTrendline(s, id)),
                },
                ...spec.series.map((x, i) => ({
                  label: x.name || `Series ${i + 1}`,
                  onSelect: () => updateSelected((s) => setTrendline(s, id, i)),
                })),
              ],
            };
      items.push({
        label: "趋势线",
        icon: "o:chartLine",
        items: [
          {
            label: "无",
            checked: !spec.series.some((s) => s.trendline),
            onSelect: () => updateSelected((s) => setTrendline(s, "none")),
          },
          ...TRENDLINES.map(([id, label]) => ({ label, ...target(id) })),
        ],
      });
    }
    return items;
  }
  // A grid of pictures inside a menu, for Quick Layout and Change Colors.
  function pictureMenu(label, choices, columns = 4) {
    const grid = el("div", {
      class: "chart-menu-grid",
      role: "group",
      "aria-label": label,
      "data-arrow-keys": "",
      style: `grid-template-columns:repeat(${columns}, auto)`,
    });
    for (const c of choices)
      grid.append(
        el(
          "button",
          {
            type: "button",
            role: "menuitem",
            tabindex: -1,
            class: "chart-menu-choice",
            "aria-label": c.label,
            title: c.label,
            onclick: () => {
              closeMenu();
              c.onSelect();
            },
          },
          c.render(),
        ),
      );
    grid.addEventListener("keydown", (e) => {
      const all = [...grid.querySelectorAll("button")];
      const at = all.indexOf(document.activeElement);
      if (at < 0) return;
      const step = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: columns,
        ArrowUp: -columns,
      }[e.key];
      if (!step) return;
      const next = all[at + step];
      if (next) {
        e.preventDefault();
        e.stopPropagation();
        next.focus();
      }
    });
    return [{ custom: grid }];
  }
  const thumb = (spec, alt) => {
    const url = chartImage(spec, {
      theme: h.theme(),
      aspect: 4 / 3,
      width: 3200400,
    });
    return url
      ? el("img", {
          src: url,
          alt: "",
          class: "chart-thumb-img",
          "aria-hidden": "true",
        })
      : el("span", { class: "chart-thumb-img", "aria-hidden": "true" }, alt);
  };
  // Previews are drawn at a small, fixed sample so they stay quick.
  const previewBase = (spec) => ({
    ...spec,
    title: spec.title !== undefined ? spec.title || "图表标题" : undefined,
  });
  function quickLayoutMenu() {
    const spec = specOf(selectedChart());
    if (!spec) return [];
    return pictureMenu(
      "Quick Layout",
      QUICK_LAYOUTS.map((l) => ({
        label: l.label,
        render: () => thumb(applyQuickLayout(previewBase(spec), l.id), l.label),
        onSelect: () => updateSelected((s) => applyQuickLayout(s, l.id)),
      })),
      4,
    );
  }
  function colorsMenu() {
    const spec = specOf(selectedChart());
    if (!spec) return [];
    const c = ctx();
    const rows = [];
    let group = null;
    for (const p of COLOR_PALETTES) {
      if (p.group !== group) {
        group = p.group;
        rows.push({ header: group });
      }
      const colors = paletteColors(p, c, 4);
      rows.push({
        custom: el(
          "button",
          {
            type: "button",
            role: "menuitem",
            tabindex: -1,
            class: "menu-item chart-palette-item",
            "aria-label": p.label,
            onclick: () => {
              closeMenu();
              updateSelected((s) => applyPalette(s, p.id, ctx()));
            },
          },
          el(
            "span",
            { class: "chart-palette", "aria-hidden": "true" },
            ...colors.map((col) => el("span", { style: `background:${col}` })),
          ),
          el("span", {}, p.label),
        ),
      });
    }
    return rows;
  }
  function styleChoices() {
    const obj = selectedChart();
    const spec = specOf(obj);
    if (!spec) return [];
    const c = ctx();
    const version = JSON.stringify([
      spec.kind,
      spec.series.length,
      spec.series.map((s) => s.color),
      h.theme()?.accent1,
    ]);
    return CHART_STYLES.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      version,
      render: () => thumb(applyChartStyle(previewBase(spec), s.id, c), s.label),
    }));
  }

  /* ---------- Format ---------- */
  function formatElement(id) {
    element = id;
    elementOwner = selectedChart() ? keyOf(selectedChart()) : null;
    h.showFormatPane();
    h.refresh();
  }
  function currentElement(obj) {
    if (!obj || elementOwner !== keyOf(obj)) return "chartArea";
    return element;
  }
  function inspector(obj) {
    if (!isChart(obj)) return null;
    const spec = specOf(obj);
    if (!spec)
      return [
        el(
          "p",
          { class: "helper" },
          "This chart uses a kind of chart the editor can show but not change.",
        ),
      ];
    const nodes = chartFormatSection({
      spec,
      element: currentElement(obj),
      choose: (id) => formatElement(id),
      update: (fn, key) => update(obj, fn, key),
      h: h.fields,
      ctx: ctx(),
    });
    nodes.push(
      el("h3", {}, "Data"),
      el(
        "div",
        { class: "arrange-buttons" },
        button("编辑数据", "o:editData", () => editData(obj), "secondary"),
        button(
          "Change Chart Type",
          "o:changeChartType",
          () => changeType(obj),
          "secondary",
        ),
      ),
    );
    return nodes;
  }
  function formatTitle(obj) {
    if (!isChart(obj)) return null;
    const spec = specOf(obj);
    return spec
      ? `Format ${elementLabel(spec, currentElement(obj))}`
      : "设置图表格式";
  }

  /* ---------- Tabs ---------- */
  const enabled = () => !!specOf(selectedChart()) && !h.readOnly();
  function tabs() {
    const visible = () => !!selectedChart();
    const design = {
      id: "chart-design",
      label: "图表设计",
      contextual: true,
      visible,
      groups: [
        {
          id: "chart-layouts",
          label: "图表布局",
          icon: "chartElement",
          items: [
            {
              type: "large",
              id: "chart-add-element",
              label: "Add Chart\nElement",
              icon: "chartElement",
              title: "添加图表元素",
              description:
                "Add or remove titles, labels, gridlines, a legend and more.",
              enabled,
              menu: () => addElementMenu(),
              menuWidth: 240,
            },
            {
              type: "large",
              id: "chart-quick-layout",
              label: "Quick\nLayout",
              icon: "quickLayout",
              title: "快速布局",
              description: "Change the overall layout of the chart's elements.",
              enabled,
              menu: () => quickLayoutMenu(),
            },
          ],
        },
        {
          id: "chart-styles",
          label: "图表样式",
          icon: "chartStyles",
          collapsible: false,
          items: [
            {
              type: "large",
              id: "chart-change-colors",
              label: "Change\nColors",
              icon: "chartColors",
              title: "更改颜色",
              description: "Choose a set of colors for the chart's data.",
              enabled,
              menu: () => colorsMenu(),
              menuWidth: 260,
            },
            {
              type: "gallery",
              id: "chart-style-gallery",
              label: "图表样式",
              columns: 4,
              panelColumns: 4,
              itemClass: "chart-style-thumb",
              showLabels: false,
              enabled,
              items: () => styleChoices(),
              choose: (choice) =>
                updateSelected((s) => applyChartStyle(s, choice.id, ctx())),
            },
          ],
        },
        {
          id: "chart-data",
          label: "数据",
          icon: "editData",
          items: [
            {
              type: "large",
              id: "chart-switch",
              label: "Switch Row/\nColumn",
              icon: "switchRowColumn",
              title: "切换行/列",
              description: "Swap what is plotted as series and as categories.",
              enabled: () =>
                enabled() && canSwitchRowColumn(specOf(selectedChart())?.kind),
              run: () => updateSelected((s) => switchRowColumn(s)),
            },
            {
              type: "large",
              id: "chart-select-data",
              label: "Select\nData",
              icon: "selectData",
              title: "选择数据",
              description:
                "Rename, add, remove and reorder the chart's series and categories.",
              enabled,
              run: () => selectData(),
            },
            {
              type: "large",
              id: "chart-edit-data",
              label: "Edit\nData",
              icon: "editData",
              title: "编辑数据",
              description: "Open the data sheet to change the chart's numbers.",
              enabled,
              run: () => editData(),
            },
          ],
        },
        {
          id: "chart-type",
          label: "类型",
          icon: "changeChartType",
          items: [
            {
              type: "large",
              id: "chart-change-type",
              label: "Change\nChart Type",
              icon: "changeChartType",
              title: "更改图表类型",
              description: "Show the data as a different kind of chart.",
              enabled,
              run: () => changeType(),
            },
          ],
        },
      ],
    };
    const format = {
      id: "chart-format",
      label: "格式",
      contextual: true,
      visible,
      groups: [
        {
          id: "chart-current-selection",
          label: "当前所选内容",
          icon: "select",
          items: [
            {
              type: "stack",
              items: [
                {
                  type: "combo",
                  id: "chart-element-select",
                  label: "图表元素",
                  width: 190,
                  enabled,
                  value: () => {
                    const obj = selectedChart();
                    const spec = specOf(obj);
                    return spec ? elementLabel(spec, currentElement(obj)) : "";
                  },
                  options: () =>
                    chartElements(specOf(selectedChart())).map((e) => e.label),
                  commit: (label) => {
                    const found = chartElements(specOf(selectedChart())).find(
                      (e) => e.label === label,
                    );
                    if (!found) return false;
                    element = found.id;
                    elementOwner = keyOf(selectedChart());
                    h.refresh();
                  },
                },
                {
                  type: "small",
                  id: "chart-format-selection",
                  label: "设置所选内容格式",
                  icon: "formatPane",
                  enabled,
                  run: () => formatElement(currentElement(selectedChart())),
                },
                {
                  type: "small",
                  id: "chart-reset-style",
                  label: "重置以匹配样式",
                  icon: "resetPicture",
                  enabled,
                  run: () => resetElement(),
                },
              ],
            },
          ],
        },
        {
          id: "chart-shape-styles",
          label: "形状样式",
          icon: "shapeFill",
          items: [
            {
              type: "stack",
              items: [
                {
                  type: "color",
                  id: "chart-element-fill",
                  label: "形状填充",
                  icon: "shapeFill",
                  enabled,
                  color: () => elementPaint("fill"),
                  run: () => applyLastPaint("fill"),
                  menu: () => paintMenu("fill"),
                  menuLabel: "填充颜色",
                },
                {
                  type: "color",
                  id: "chart-element-outline",
                  label: "形状轮廓",
                  icon: "shapeOutline",
                  enabled,
                  color: () => elementPaint("outline"),
                  run: () => applyLastPaint("outline"),
                  menu: () => paintMenu("outline"),
                  menuLabel: "轮廓颜色",
                },
              ],
            },
          ],
        },
      ],
    };
    return [design, format];
  }
  // The fill and outline of the element chosen in the Format tab.
  const PAINT = {
    chartArea: { fill: "chartAreaFill", outline: "chartAreaStrokeColor" },
    plotArea: { fill: "plotAreaFill", outline: "plotAreaStrokeColor" },
    legend: { fill: "legend.fill", outline: "legend.strokeColor" },
    valueAxis: { outline: "valueAxisLineColor" },
    categoryAxis: { outline: "categoryAxisLineColor" },
    gridlines: { outline: "valueAxisMajorGridlineColor" },
  };
  function paintKey(which) {
    const obj = selectedChart();
    const id = currentElement(obj);
    if (id.startsWith("series:"))
      return {
        series: Number(id.slice(7)),
        field: which === "fill" ? "color" : "lineColor",
      };
    const field = PAINT[id]?.[which];
    return field ? { field } : null;
  }
  function elementPaint(which) {
    const spec = specOf(selectedChart());
    const k = paintKey(which);
    if (!spec || !k) return null;
    if (k.series != null) return spec.series[k.series]?.[k.field] || null;
    if (k.field.startsWith("legend."))
      return spec.legend?.[k.field.slice(7)] || null;
    return spec[k.field] || null;
  }
  // The colour last picked for a fill or an outline, which the button's face
  // applies again.
  const lastPaint = { fill: null, outline: null };
  function applyLastPaint(which) {
    const color = lastPaint[which];
    if (!color) return;
    applyPaint(which, color);
  }
  function applyPaint(which, value) {
    const k = paintKey(which);
    if (!k) return;
    updateSelected((spec) => {
      if (k.series != null)
        return {
          ...spec,
          series: spec.series.map((s, i) => {
            if (i !== k.series) return s;
            const next = { ...s };
            if (value === undefined) delete next[k.field];
            else next[k.field] = value;
            return next;
          }),
        };
      if (k.field.startsWith("legend.")) {
        const legend = { position: "r", ...(spec.legend || {}) };
        if (value === undefined) delete legend[k.field.slice(7)];
        else legend[k.field.slice(7)] = value;
        return { ...spec, legend };
      }
      const out = { ...spec };
      if (value === undefined) delete out[k.field];
      else out[k.field] = value;
      return out;
    });
  }
  function paintMenu(which) {
    const k = paintKey(which);
    if (!k)
      return [
        {
          label:
            "This element has no " + (which === "fill" ? "fill" : "outline"),
          disabled: true,
          onSelect: () => {},
        },
      ];
    const apply = (value) => applyPaint(which, value);
    return colorMenuItems({
      theme: h.theme(),
      current: elementPaint(which),
      onPick: (value, hex) => {
        lastPaint[which] = hex.toUpperCase();
        apply(hex.toUpperCase());
      },
      automatic: {
        label: "自动",
        icon: "o:resetPicture",
        onSelect: () => apply(undefined),
      },
      none: {
        label: which === "fill" ? "无填充" : "无轮廓",
        icon: "Ban",
        onSelect: () => apply(null),
      },
    });
  }
  function resetElement() {
    const obj = selectedChart();
    const id = currentElement(obj);
    updateSelected((spec) => {
      if (id.startsWith("series:")) {
        const i = Number(id.slice(7));
        return {
          ...spec,
          series: spec.series.map((s, j) => {
            if (j !== i) return s;
            const {
              color,
              lineColor,
              lineWidthEmu,
              lineDash,
              markerFill,
              markerStrokeColor,
              markerSizePt,
              pointColors,
              ...rest
            } = s;
            return isXYKind(spec.kind) && lineColor === null
              ? { ...rest, lineColor }
              : rest;
          }),
        };
      }
      const out = { ...spec };
      const fields =
        {
          chartArea: [
            "chartAreaFill",
            "chartAreaStrokeColor",
            "chartAreaStrokeWidthEmu",
            "textStyle",
            "roundedCorners",
          ],
          plotArea: [
            "plotAreaFill",
            "plotAreaStrokeColor",
            "plotAreaStrokeWidthEmu",
          ],
          title: ["titleStyle"],
          valueAxis: ["valueAxisLineColor", "valueAxisLabelStyle"],
          categoryAxis: ["categoryAxisLineColor", "categoryAxisLabelStyle"],
          gridlines: [
            "valueAxisMajorGridlineColor",
            "valueAxisMinorGridlineColor",
            "valueAxisMajorGridlineWidthEmu",
          ],
        }[id] || [];
      for (const f of fields) delete out[f];
      if (id === "legend" && out.legend) {
        const { fill, strokeColor, strokeWidthEmu, textStyle, ...rest } =
          out.legend;
        out.legend = rest;
      }
      return out;
    });
  }

  return {
    isChart,
    insert,
    editData,
    selectData: (obj) => selectData(obj),
    changeType,
    tabs,
    inspector,
    formatTitle,
    // The editor changed: the data sheet follows its chart.
    sync: () => sheet?.sync(),
    closeSheet: () => sheet?.close(),
  };
}

export { CHART_TYPES, chartType, sampleSpec };
