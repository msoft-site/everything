// Reading View: the slide show played inside the window rather than full
// screen, under the window's own title bar, with a status bar at the bottom
// for moving through the slides and switching views. Escape returns to the
// view it was opened from.
import { el, icon, openMenu } from "../ui.js";

// The bar that replaces the show's controls. `show` opens a slide by index,
// `close` ends the reading view, `switchTo` closes it into another view.
export function readingBar({
  previous,
  next,
  counter,
  count,
  current,
  show,
  close,
  switchTo,
  titleOf,
}) {
  counter.classList.add("reading-counter");
  const menuButton = el(
    "button",
    {
      type: "button",
      class: "reading-menu btn icon-btn",
      "aria-label": "阅读视图菜单",
      "aria-haspopup": "menu",
      title: "菜单",
      onclick: (e) =>
        openMenu({
          anchor: e.currentTarget,
          label: "阅读视图",
          align: "center",
          items: [
            // As the bar's buttons: through the slide's builds first.
            {
              label: "下一张",
              icon: "ChevronRight",
              disabled: next.disabled,
              onSelect: () => next.click(),
            },
            {
              label: "上一张",
              icon: "ChevronLeft",
              disabled: previous.disabled,
              onSelect: () => previous.click(),
            },
            {
              label: "转到幻灯片",
              icon: "o:seeAllSlides",
              items: Array.from({ length: count }, (_, i) => ({
                label: `${i + 1}. ${titleOf(i) || "无标题"}`,
                checked: i === current(),
                onSelect: () => show(i),
              })),
            },
            { separator: true },
            {
              label: "编辑幻灯片",
              icon: "o:normalView",
              onSelect: () => switchTo("normal"),
            },
            { label: "结束阅读视图", icon: "X", onSelect: close },
          ],
        }),
    },
    icon("o:more", 16),
  );
  const viewButton = (id, label, name) =>
    el(
      "button",
      {
        type: "button",
        class: "status-view",
        "aria-label": label,
        title: label,
        "aria-pressed": String(id === "reading"),
        onclick: () => (id === "reading" ? null : switchTo(id)),
      },
      icon(`o:${name}`, 16),
    );
  return el(
    "div",
    {
      class: "presenter-controls reading-bar",
      role: "toolbar",
      "aria-label": "阅读视图",
    },
    el("div", { class: "reading-left" }, counter),
    el("div", { class: "reading-center" }, previous, menuButton, next),
    el(
      "div",
      { class: "reading-right" },
      viewButton("normal", "普通", "normalViewSmall"),
      viewButton("sorter", "幻灯片浏览", "slideSorter"),
      viewButton("reading", "阅读视图", "readingViewSmall"),
      viewButton("show", "幻灯片放映", "slideShowSmall"),
    ),
  );
}

// The reading view's dialog covers the window below its title bar.
export function placeReadingDialog(dialog) {
  const header = document.querySelector(".editor-header");
  const top = header ? Math.round(header.getBoundingClientRect().bottom) : 0;
  dialog.classList.add("reading-view");
  dialog.setAttribute("aria-label", "阅读视图");
  dialog.style.setProperty("--reading-top", `${top}px`);
}
