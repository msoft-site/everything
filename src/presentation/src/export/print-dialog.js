// Print: a preview of the pages beside the settings that shape them, then
// the browser's own print dialog (where the printer and copies are chosen).
// The pages are the same layouts the PDF export writes, so "Save as PDF"
// here gives exactly what the preview shows.

import { el, iconButton } from "../ui.js";
import {
  openModal,
  selectField,
  textField,
  checkField,
  radioGroup,
  progressLine,
} from "./modal.js";
import {
  layoutPages,
  HANDOUT_COUNTS,
  defaultOrientation,
} from "./page-layout.js";
import { pageElement, measureText } from "./render.js";
import { exportPdf } from "./document-export.js";

// Settings stay as they were left for the rest of the session.
let remembered = null;
const DEFAULTS = {
  range: "all",
  custom: "",
  layout: "slides",
  perPage: 6,
  order: "horizontal",
  paper: "slide",
  orientation: "auto",
  colorMode: "color",
  scaleToFit: true,
  frame: false,
  includeHidden: false,
  header: "",
  footer: "",
  date: false,
  pageNumbers: true,
  slideNumbers: false,
};

const PT_TO_PX = 96 / 72;
let printRequest = 0;

export function createPrintDialog(
  ctx,
  { gather, slideSize, documentInfo, baseName },
) {
  function layoutFor(settings, slides) {
    const { slideWidth, slideHeight } = slideSize();
    const orientation =
      settings.orientation === "auto"
        ? defaultOrientation(
            settings.layout,
            settings.perPage,
            slideWidth / slideHeight,
          )
        : settings.orientation;
    return layoutPages(slides, {
      ...settings,
      perPage: Number(settings.perPage),
      orientation,
      slideWidth,
      slideHeight,
      measure: measureText,
      headerFooter:
        settings.layout === "slides"
          ? null
          : {
              header: settings.header,
              footer: settings.footer,
              date: settings.date ? new Date().toLocaleDateString() : "",
              pageNumbers: settings.pageNumbers,
            },
    });
  }

  // Prints pages through the browser. A newer request, or leaving the
  // presentation, cancels one still waiting for its pictures.
  async function printPages(settings) {
    const target = ctx.doc();
    const request = ++printRequest;
    const slides = gather(settings);
    if (!slides.length) {
      ctx.toast(
        settings.range === "all" && !settings.includeHidden
          ? "There are no visible slides to print."
          : "There are no slides to print in that range.",
      );
      return false;
    }
    const pages = layoutFor(settings, slides);
    const { width, height } = pages[0];
    const print = el(
      "div",
      { id: "print-slides", class: `print-${settings.layout}` },
      el(
        "style",
        { media: "print" },
        `@page { size: ${width}pt ${height}pt; margin: 0; }`,
      ),
      ...pages.map((page) =>
        pageElement(page, (i) => slides[i].src, {
          colorMode: settings.colorMode,
          alts: (i) => slides[i].alt,
          className: "print-page",
        }),
      ),
    );
    document.querySelector("#print-slides")?.remove();
    document.body.append(print);
    await Promise.all(
      [...print.querySelectorAll("img")].map((img) =>
        img.decode().catch(() => {}),
      ),
    );
    if (ctx.doc() !== target || request !== printRequest) {
      print.remove();
      return false;
    }
    if (!print.isConnected) return false;
    window.print();
    setTimeout(() => print.remove(), 1000);
    return true;
  }

  async function open() {
    const target = ctx.doc();
    if (!target) return;
    await ctx.settled();
    if (ctx.doc() !== target) return;
    ctx.refreshFields?.();
    const settings = { ...DEFAULTS, ...remembered };
    const selectedCount = ctx.selectedSlides().length;

    const range = radioGroup(
      "Slides",
      "print-range",
      [
        ["all", "All slides"],
        ["current", "Current slide"],
        ["selected", `Selected slides (${selectedCount})`],
        ["custom", "幻灯片编号"],
      ],
      settings.range,
    );
    const custom = textField("幻灯片编号", settings.custom, {
      placeholder: "e.g. 1-3, 5",
      "aria-label": "要打印的幻灯片编号",
    });
    const layout = selectField(
      "版式",
      [
        ["slides", "整页幻灯片"],
        ["notes", "备注页"],
        ["outline", "大纲"],
        ["handouts", "讲义"],
      ],
      settings.layout,
    );
    const perPage = selectField(
      "每页幻灯片数",
      HANDOUT_COUNTS.map((n) => [
        n,
        n === 3 ? "3, with lines for notes" : `${n}`,
      ]),
      settings.perPage,
    );
    const order = selectField(
      "顺序",
      [
        ["horizontal", "Across, then down"],
        ["vertical", "Down, then across"],
      ],
      settings.order,
    );
    const paper = selectField(
      "纸张",
      [
        ["slide", "幻灯片大小"],
        ["letter", "信纸"],
        ["a4", "A4"],
        ["legal", "法律用纸"],
        ["a3", "A3"],
      ],
      settings.paper,
    );
    const orientation = radioGroup(
      "Orientation",
      "print-orientation",
      [
        ["auto", "自动"],
        ["portrait", "纵向"],
        ["landscape", "横向"],
      ],
      settings.orientation,
    );
    orientation.wrap.classList.add("inline");
    const color = selectField(
      "输出",
      [
        ["color", "颜色"],
        ["grayscale", "灰度"],
        ["bw", "纯黑白"],
      ],
      settings.colorMode,
    );
    const scaleToFit = checkField("根据纸张调整大小", settings.scaleToFit);
    const frame = checkField("幻灯片加框", settings.frame);
    const includeHidden = checkField(
      "打印隐藏幻灯片",
      settings.includeHidden,
    );
    const slideNumbers = checkField(
      "讲义幻灯片下方显示幻灯片编号",
      settings.slideNumbers,
    );
    const header = textField("页眉", settings.header, { maxlength: 200 });
    const footer = textField("页脚", settings.footer, { maxlength: 200 });
    const date = checkField("日期", settings.date);
    const pageNumbers = checkField("页码", settings.pageNumbers);
    const headerFooter = el(
      "fieldset",
      { class: "file-group print-header-footer" },
      el("legend", {}, "页眉和页脚"),
      header.wrap,
      footer.wrap,
      date.wrap,
      pageNumbers.wrap,
    );

    const pageLabel = el("span", { class: "print-page-label", role: "status" });
    const stage = el("div", {
      class: "print-preview-stage",
      role: "img",
      "aria-label": "打印预览",
    });
    let pageIndex = 0;
    let pages = [];
    let slides = [];
    const prev = iconButton("上一页", "ChevronLeft", () =>
      showPage(pageIndex - 1),
    );
    const next = iconButton("下一页", "ChevronRight", () =>
      showPage(pageIndex + 1),
    );
    const preview = el(
      "section",
      { class: "print-preview", "aria-label": "预览" },
      stage,
      el("div", { class: "print-preview-nav" }, prev, pageLabel, next),
    );
    const progress = progressLine();
    const settingsPane = el(
      "div",
      { class: "print-settings" },
      range.wrap,
      custom.wrap,
      layout.wrap,
      perPage.wrap,
      order.wrap,
      paper.wrap,
      orientation.wrap,
      color.wrap,
      scaleToFit.wrap,
      frame.wrap,
      includeHidden.wrap,
      slideNumbers.wrap,
      headerFooter,
      el(
        "p",
        { class: "muted export-note" },
        "Choose the printer and number of copies in the next step.",
      ),
      progress.wrap,
    );
    const body = el(
      "form",
      {
        class: "dialog-body print-body",
        onsubmit: (e) => {
          e.preventDefault();
          doPrint();
        },
      },
      preview,
      settingsPane,
    );

    function read() {
      return {
        range: range.value(),
        custom: custom.input.value,
        layout: layout.input.value,
        perPage: Number(perPage.input.value),
        order: order.input.value,
        paper: paper.input.value,
        orientation: orientation.value(),
        colorMode: color.input.value,
        scaleToFit: scaleToFit.input.checked,
        frame: frame.input.checked,
        includeHidden: includeHidden.input.checked,
        header: header.input.value,
        footer: footer.input.value,
        date: date.input.checked,
        pageNumbers: pageNumbers.input.checked,
        slideNumbers: slideNumbers.input.checked,
      };
    }
    function showPage(n) {
      if (!pages.length) {
        stage.replaceChildren(
          el(
            "p",
            { class: "muted print-empty" },
            "Nothing to print with these settings.",
          ),
        );
        pageLabel.textContent = "无页面";
        prev.disabled = next.disabled = true;
        return;
      }
      pageIndex = Math.max(0, Math.min(pages.length - 1, n));
      const page = pages[pageIndex];
      const s = read();
      const node = pageElement(page, (i) => slides[i].src, {
        colorMode: s.colorMode,
        alts: (i) => slides[i].alt,
      });
      const box = stage.getBoundingClientRect();
      const availableW = Math.max(120, box.width - 24);
      const availableH = Math.max(120, box.height - 24);
      const scale = Math.min(
        availableW / (page.width * PT_TO_PX),
        availableH / (page.height * PT_TO_PX),
      );
      const holder = el("div", {
        class: "print-sheet",
        style: `width:${page.width * PT_TO_PX * scale}px;height:${page.height * PT_TO_PX * scale}px`,
      });
      node.style.transform = `scale(${scale})`;
      node.style.transformOrigin = "0 0";
      holder.append(node);
      stage.replaceChildren(holder);
      pageLabel.textContent = `Page ${pageIndex + 1} of ${pages.length}`;
      prev.disabled = pageIndex === 0;
      next.disabled = pageIndex >= pages.length - 1;
    }
    let pending = 0;
    function refresh() {
      const s = read();
      custom.wrap.hidden = s.range !== "custom";
      const handouts = s.layout === "handouts";
      perPage.wrap.hidden = !handouts;
      order.wrap.hidden = !handouts || Number(s.perPage) === 1;
      slideNumbers.wrap.hidden = !handouts;
      headerFooter.hidden = s.layout === "slides";
      const slideOnSlidePaper = s.layout === "slides" && s.paper === "slide";
      orientation.inputs.forEach((i) => (i.disabled = slideOnSlidePaper));
      scaleToFit.input.disabled = slideOnSlidePaper;
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        try {
          slides = gather(s);
          pages = layoutFor(s, slides);
        } catch {
          slides = [];
          pages = [];
        }
        showPage(pageIndex);
        pdfButton.disabled = !pages.length;
      });
    }
    let busy = false;
    let controller = null;
    const modal = openModal({
      title: "打印",
      className: "print-dialog",
      body,
      actions: [
        {
          label: "取消",
          onClick: () => {
            if (busy) {
              controller?.abort();
              return false;
            }
            return true;
          },
        },
        { label: "另存为 PDF", onClick: () => savePdf() },
        { label: "打印", kind: "primary", onClick: () => doPrint() },
      ],
      onClose: () => {
        remembered = read();
        controller?.abort();
        cancelAnimationFrame(pending);
      },
    });
    const [, pdfButton, printButton] = modal.buttons;
    body.addEventListener("change", refresh);
    body.addEventListener("input", refresh);
    const resize = new ResizeObserver(() => showPage(pageIndex));
    resize.observe(stage);
    modal.dialog.addEventListener("close", () => resize.disconnect());
    stage.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "PageDown")
        showPage(pageIndex + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") showPage(pageIndex - 1);
    });
    refresh();
    printButton.focus();

    async function doPrint() {
      const s = read();
      if (s.range === "custom" && !s.custom.trim()) {
        ctx.toast("Enter the slide numbers to print.");
        custom.input.focus();
        return;
      }
      let ok;
      try {
        remembered = s;
        modal.close(true);
        ok = await printPages(s);
      } catch (e) {
        ctx.fail(e);
      }
      return ok;
    }
    async function savePdf() {
      if (busy) return;
      const s = read();
      busy = true;
      controller = new AbortController();
      printButton.disabled = pdfButton.disabled = true;
      progress.show("Drawing pages…");
      try {
        const { slideWidth, slideHeight } = slideSize();
        const orientationValue =
          s.orientation === "auto"
            ? defaultOrientation(s.layout, s.perPage, slideWidth / slideHeight)
            : s.orientation;
        const blob = await exportPdf({
          ...s,
          orientation: orientationValue,
          slides: gather(s),
          slideWidth,
          slideHeight,
          dpi: 220,
          info: documentInfo(),
          headerFooter:
            s.layout === "slides"
              ? null
              : {
                  header: s.header,
                  footer: s.footer,
                  date: s.date ? new Date().toLocaleDateString() : "",
                  pageNumbers: s.pageNumbers,
                },
          signal: controller.signal,
          progress: (f) =>
            progress.set(f, `Drawing pages… ${Math.round(f * 100)}%`),
        });
        remembered = s;
        await ctx.download(blob, `${baseName()}.pdf`, "PDF downloaded.");
        modal.close(true);
      } catch (e) {
        if (e?.name === "AbortError") ctx.toast("导出已停止。");
        else ctx.fail(e);
      } finally {
        busy = false;
        if (modal.dialog.isConnected) {
          progress.hide();
          refresh();
        }
      }
    }
  }

  return { open, printPages };
}
