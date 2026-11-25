// The Set Up Slide Show dialog: how the show runs (presented by a speaker,
// browsed in a window, or at a kiosk), its options, which slides it shows
// and how it advances. Saved in the file's show properties.
import "../export/export.css";
import { el } from "../ui.js";
import {
  openModal,
  radioGroup,
  checkField,
  selectField,
  nextId,
} from "../export/modal.js";
import { showPrefs } from "./prefs.js";

function colorField(label, value) {
  const id = nextId("show-color");
  const input = el("input", {
    type: "color",
    id,
    class: "show-color-input",
    value: value || "#FF0000",
  });
  return {
    wrap: el(
      "div",
      { class: "file-field show-color-field" },
      el("label", { for: id }, label),
      input,
    ),
    input,
  };
}

/**
 * ctx: { P, pres(), mutate(fn), customShows() }
 * Resolves true when the setup was saved.
 */
export function openSetUpShowDialog(ctx) {
  const { P } = ctx;
  const pres = ctx.pres();
  const setup = P.getSlideShowSetup(pres);
  const count = P.getSlides(pres).length;
  const shows = ctx.customShows();

  const type = radioGroup(
    "放映类型",
    nextId("show-type"),
    [
      ["present", "演讲者放映 (全屏幕)"],
      ["browse", "个人浏览 (窗口)"],
      ["kiosk", "展台浏览 (全屏幕)"],
    ],
    setup.showType,
  );
  const scrollbar = checkField("显示滚动条", setup.showScrollbar);
  scrollbar.wrap.classList.add("show-setup-indent");

  const loop = checkField(
    "循环放映，按 Esc 键终止",
    setup.loop || setup.showType === "kiosk",
  );
  const noNarration = checkField(
    "放映时不加旁白",
    !setup.showNarration,
  );
  const noAnimation = checkField(
    "放映时不加动画",
    !setup.showAnimation,
  );
  const mediaControls = checkField(
    "显示媒体控件",
    setup.showMediaControls,
  );
  const pen = colorField("绘图笔颜色", setup.penColor || "#E81224");
  const laser = colorField(
    "激光指针颜色",
    setup.laserColor || "#FF0000",
  );

  const sel = setup.selection;
  const fromInput = el("input", {
    type: "number",
    class: "input show-setup-number",
    min: 1,
    max: count,
    value: sel.kind === "range" ? sel.start : 1,
    "aria-label": "起始幻灯片",
  });
  const toInput = el("input", {
    type: "number",
    class: "input show-setup-number",
    min: 1,
    max: count,
    value: sel.kind === "range" ? Math.min(sel.end, count) : count,
    "aria-label": "终止幻灯片",
  });
  const customSelect = selectField(
    "自定义放映",
    shows.length
      ? shows.map((s) => [String(s.id), s.name || `自定义放映 ${s.id + 1}`])
      : [["", "无自定义放映", true]],
    sel.kind === "custom" ? String(sel.id) : String(shows[0]?.id ?? ""),
    { "aria-label": "自定义放映" },
  );
  customSelect.wrap.querySelector("label").hidden = true;
  const slides = radioGroup(
    "放映幻灯片",
    nextId("show-slides"),
    [
      ["all", "全部"],
      [
        "range",
        "从",
        el(
          "span",
          { class: "show-setup-range" },
          fromInput,
          el("span", {}, "到"),
          toInput,
        ),
      ],
      ...(shows.length ? [["custom", "自定义放映", customSelect.wrap]] : []),
    ],
    sel.kind === "custom" && !shows.length ? "all" : sel.kind,
  );
  const advance = radioGroup(
    "推进幻灯片",
    nextId("show-advance"),
    [
      ["manual", "手动"],
      ["timings", "如果存在排练时间，则使用它"],
    ],
    setup.useTimings ? "timings" : "manual",
  );
  const presenter = checkField(
    "存在第二台显示器时使用演示者视图",
    !!showPrefs.usePresenterView,
  );

  function sync() {
    const kind = type.value();
    scrollbar.input.disabled = kind !== "browse";
    // A kiosk loops and advances by itself.
    loop.input.disabled = kind === "kiosk";
    if (kind === "kiosk") {
      loop.input.checked = true;
      advance.set("timings");
    }
    advance.inputs.forEach((i) => (i.disabled = kind === "kiosk"));
    const which = slides.value();
    fromInput.disabled = toInput.disabled = which !== "range";
    customSelect.input.disabled = which !== "custom";
  }
  [...type.inputs, ...slides.inputs].forEach((i) =>
    i.addEventListener("change", sync),
  );
  // Typing in the range picks it.
  for (const input of [fromInput, toInput])
    input.addEventListener("focus", () => {
      slides.set("range");
      sync();
    });
  sync();

  const error = el("p", {
    class: "show-setup-error",
    role: "alert",
    hidden: true,
  });
  const body = el(
    "div",
    { class: "dialog-body show-setup" },
    el(
      "div",
      { class: "show-setup-columns" },
      el(
        "div",
        {},
        type.wrap,
        scrollbar.wrap,
        el(
          "fieldset",
          { class: "file-radios" },
          el("legend", {}, "放映选项"),
          loop.wrap,
          noNarration.wrap,
          noAnimation.wrap,
          mediaControls.wrap,
          pen.wrap,
          laser.wrap,
        ),
      ),
      el(
        "div",
        {},
        slides.wrap,
        advance.wrap,
        el(
          "fieldset",
          { class: "file-radios" },
          el("legend", {}, "多显示器"),
          presenter.wrap,
        ),
      ),
    ),
    error,
  );

  return new Promise((resolve) => {
    let saved = false;
    const modal = openModal({
      title: "设置幻灯片放映",
      className: "show-setup-dialog",
      body,
      onClose: () => resolve(saved),
      actions: [
        { label: "取消", kind: "secondary", onClick: () => true },
        {
          label: "确定",
          kind: "primary",
          onClick: async () => {
            const which = slides.value();
            let selection = { kind: "all" };
            if (which === "range") {
              const start = Math.round(Number(fromInput.value));
              const end = Math.round(Number(toInput.value));
              if (!(start >= 1 && end >= start && end <= count)) {
                error.textContent = `请输入 1 到 ${count} 之间的幻灯片编号，且起始编号不能大于终止编号。`;
                error.hidden = false;
                fromInput.focus();
                return false;
              }
              selection = { kind: "range", start, end };
            } else if (which === "custom" && customSelect.input.value !== "")
              selection = {
                kind: "custom",
                id: Number(customSelect.input.value),
              };
            const kind = type.value();
            const patch = {
              showType: kind,
              showScrollbar: scrollbar.input.checked,
              loop: kind === "kiosk" || loop.input.checked,
              showNarration: !noNarration.input.checked,
              showAnimation: !noAnimation.input.checked,
              showMediaControls: mediaControls.input.checked,
              useTimings: kind === "kiosk" || advance.value() === "timings",
              penColor: pen.input.value.toUpperCase(),
              laserColor: laser.input.value.toUpperCase(),
              selection,
            };
            showPrefs.usePresenterView = presenter.input.checked;
            saved = await ctx.mutate(() =>
              P.setSlideShowSetup(ctx.pres(), patch),
            );
            return true;
          },
        },
      ],
    });
    modal.dialog
      .querySelector(`input[name="${type.inputs[0].name}"]:checked`)
      ?.focus();
  });
}
