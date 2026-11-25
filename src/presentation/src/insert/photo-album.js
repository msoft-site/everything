// Photo Album: choose several pictures, put them in order, pick a layout,
// captions and a frame, and get new slides with the pictures laid out.
import { el, dialog, iconButton, icon, toast } from "../ui.js";
import { text as textBox } from "../model.js";
import { canvasPng, checkbox, fieldRow, loadImage, pickFiles } from "./util.js";

import {
  ALBUM_LAYOUTS,
  ALBUM_FRAMES,
  albumBoxes,
  containBox,
} from "./geometry.js";
export { ALBUM_LAYOUTS, ALBUM_FRAMES, albumBoxes, containBox };

async function grayscale(bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const g = canvas.getContext("2d");
    g.filter = "grayscale(1)";
    g.drawImage(image, 0, 0);
    return canvasPng(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function createPhotoAlbum(ctx) {
  const { P } = ctx;

  async function photoAlbum() {
    ctx.commitText();
    const items = []; // { file, url, caption }
    let selected = -1;
    let layout = "1";
    let frame = "rect";
    let captions = false;
    let blackAndWhite = false;
    let titleSlide = true;
    const list = el("ul", {
      class: "album-list",
      role: "listbox",
      "aria-label": "相册中的图片",
    });
    const preview = el(
      "div",
      { class: "album-preview" },
      el("p", {}, "添加图片以开始。"),
    );
    const status = el("p", { class: "album-status", role: "status" });
    const albumTitle = el("input", {
      class: "input",
      value: "相册",
      maxlength: 120,
      "aria-label": "相册标题",
    });
    const move = (step) => {
      const to = selected + step;
      if (selected < 0 || to < 0 || to >= items.length) return;
      [items[selected], items[to]] = [items[to], items[selected]];
      selected = to;
      render();
      list.children[selected]?.focus();
    };
    const remove = () => {
      if (selected < 0) return;
      URL.revokeObjectURL(items[selected].url);
      items.splice(selected, 1);
      selected = Math.min(selected, items.length - 1);
      render();
    };
    const up = iconButton("上移", "ArrowUp", () => move(-1));
    const down = iconButton("下移", "ArrowDown", () => move(1));
    const removeButton = el(
      "button",
      { type: "button", class: "btn secondary", onclick: remove },
      "删除",
    );
    function render() {
      list.replaceChildren(
        ...items.map((item, i) =>
          el(
            "li",
            {
              class: `album-item ${i === selected ? "selected" : ""}`,
              role: "option",
              tabindex: i === selected || (selected < 0 && i === 0) ? 0 : -1,
              "aria-selected": String(i === selected),
              onclick: () => {
                selected = i;
                render();
              },
              onkeydown: (e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  if (e.altKey) move(e.key === "ArrowDown" ? 1 : -1);
                  else {
                    selected = Math.max(
                      0,
                      Math.min(
                        items.length - 1,
                        i + (e.key === "ArrowDown" ? 1 : -1),
                      ),
                    );
                    render();
                    list.children[selected]?.focus();
                  }
                } else if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  remove();
                }
              },
            },
            el("span", { class: "album-index" }, `${i + 1}`),
            el("img", { src: item.url, alt: "" }),
            el("input", {
              class: "input album-caption",
              value: item.caption,
              "aria-label": `第 ${i + 1} 张图片的标题`,
              // Typing a caption chooses its picture, keeping the field.
              onclick: (e) => e.stopPropagation(),
              onfocus: () => choose(i),
              oninput: (e) => (item.caption = e.target.value),
            }),
          ),
        ),
      );
      sync();
    }
    function choose(i) {
      if (selected === i) return;
      selected = i;
      [...list.children].forEach((row, n) => {
        row.classList.toggle("selected", n === i);
        row.setAttribute("aria-selected", String(n === i));
        row.tabIndex = n === i ? 0 : -1;
      });
      sync();
    }
    function sync() {
      up.disabled = selected <= 0;
      down.disabled = selected < 0 || selected >= items.length - 1;
      removeButton.disabled = selected < 0;
      const item = items[selected] ?? items[0];
      preview.replaceChildren(
        item
          ? el("img", { src: item.url, alt: `预览：${item.caption}` })
          : el("p", {}, "添加图片以开始。"),
      );
      const perSlide = ALBUM_LAYOUTS.find(([id]) => id === layout)[2];
      status.textContent = items.length
        ? `在 ${Math.ceil(items.length / perSlide)} 张幻灯片上放置 ${items.length} 张图片。`
        : "";
    }
    const add = el(
      "button",
      {
        type: "button",
        class: "btn secondary",
        onclick: async () => {
          const files = await pickFiles("image/png,image/jpeg", {
            multiple: true,
          });
          for (const file of files)
            items.push({
              file,
              url: URL.createObjectURL(file),
              caption: file.name.replace(/\.[^.]+$/, ""),
            });
          if (selected < 0 && items.length) selected = 0;
          render();
        },
      },
      icon("Plus", 16),
      el("span", {}, "添加图片…"),
    );
    const layoutSelect = el(
      "select",
      {
        class: "input",
        "aria-label": "图片版式",
        onchange: (e) => ((layout = e.target.value), render()),
      },
      ...ALBUM_LAYOUTS.map(([id, label]) =>
        el("option", { value: id, selected: id === layout }, label),
      ),
    );
    const frameSelect = el(
      "select",
      {
        class: "input",
        "aria-label": "相框形状",
        onchange: (e) => (frame = e.target.value),
      },
      ...ALBUM_FRAMES.map(([id, label]) => el("option", { value: id }, label)),
    );
    const body = el(
      "div",
      { class: "dialog-body album-dialog" },
      el(
        "div",
        { class: "album-columns" },
        el(
          "section",
          { class: "album-pictures", "aria-label": "图片" },
          el("div", { class: "album-toolbar" }, add, up, down, removeButton),
          list,
          status,
        ),
        el(
          "section",
          { class: "album-side", "aria-label": "预览与选项" },
          preview,
          fieldRow("相册标题", albumTitle),
          checkbox(
            "以标题幻灯片开始",
            titleSlide,
            (on) => (titleSlide = on),
          ),
          fieldRow("图片版式", layoutSelect),
          fieldRow("相框形状", frameSelect),
          checkbox(
            "所有图片下方显示标题",
            captions,
            (on) => (captions = on),
          ),
          checkbox(
            "所有图片以黑白显示",
            blackAndWhite,
            (on) => (blackAndWhite = on),
          ),
        ),
      ),
    );
    render();
    const ok = await dialog({ title: "相册", body, confirm: "创建" });
    const urls = items.map((i) => i.url);
    if (!ok || !items.length) {
      urls.forEach((u) => URL.revokeObjectURL(u));
      return;
    }
    // Read (and scale down) every picture before the edit. One that can't
    // be used (too large, or not a picture after all) is left out of the
    // album rather than losing the others with it.
    const pictures = [];
    const skipped = [];
    try {
      for (const item of items) {
        let image;
        try {
          image = await ctx.readImage(item.file);
        } catch (error) {
          skipped.push({ name: item.file.name, error });
          continue;
        }
        const bytes = blackAndWhite
          ? await grayscale(image.bytes, item.file.type)
          : image.bytes;
        pictures.push({
          ...image,
          bytes,
          caption: item.caption,
          name: item.file.name,
        });
      }
    } finally {
      urls.forEach((u) => URL.revokeObjectURL(u));
    }
    if (!pictures.length) throw skipped[0].error;
    if (skipped.length === 1)
      toast(`已跳过“${skipped[0].name}”：${skipped[0].error.message}`);
    else if (skipped.length)
      toast(
        `${skipped.length} 张图片被跳过：${skipped.map((s) => `“${s.name}”`).join("、")}。图片必须是小于 12 MB 的 PNG 或 JPEG。`,
      );
    const size = ctx.currentSize();
    const [, , perSlide, titled] = ALBUM_LAYOUTS.find(([id]) => id === layout);
    const ink = ctx.inkColor();
    let firstNew = null;
    await ctx.mutate(() => {
      const pres = ctx.pres();
      const before = P.getSlides(pres).length;
      if (titleSlide) {
        const s = P.addBlankSlide(pres);
        const inch = 914400;
        textBox(
          s,
          albumTitle.value.trim() || "相册",
          1,
          size.cy / inch / 2 - 0.9,
          size.cx / inch - 2,
          1.2,
          44,
          ink,
          true,
        );
        P.setShapeAlignment?.(P.getSlideShapes(s).at(-1), "center");
      }
      for (let at = 0; at < pictures.length; at += perSlide) {
        const group = pictures.slice(at, at + perSlide);
        const s = P.addBlankSlide(pres);
        const inch = 914400;
        if (titled)
          textBox(
            s,
            albumTitle.value.trim() || "相册",
            0.6,
            0.35,
            size.cx / inch - 1.2,
            0.9,
            32,
            ink,
            true,
          );
        const cells = albumBoxes(layout, group.length, size, captions);
        group.forEach((picture, i) => {
          const cell = cells[i];
          const b =
            layout === "fit"
              ? containBox(cell, picture.width, picture.height)
              : containBox(cell, picture.width, picture.height);
          const shape = P.addSlideImage(s, picture.bytes, {
            x: Math.round(b.x),
            y: Math.round(b.y),
            w: Math.round(b.w),
            h: Math.round(b.h),
            name: `Picture ${i + 1}`,
          });
          P.setShapeDescription(shape, picture.caption || picture.name);
          applyFrame(shape, frame);
          if (captions && picture.caption) {
            const caption = textBox(
              s,
              picture.caption,
              b.x / inch,
              (b.y + b.h) / inch + 0.05,
              b.w / inch,
              0.4,
              14,
              ink,
            );
            P.setShapeAlignment?.(caption, "center");
          }
        });
        ctx.dedupe(s);
      }
      firstNew = before;
    });
    if (firstNew != null) ctx.goToSlide(firstNew);
  }

  function applyFrame(shape, frame) {
    switch (frame) {
      case "roundRect":
      case "ellipse":
        P.setShapePresetGeometry(shape, frame);
        break;
      case "whiteFrame":
        P.setShapeStroke(shape, { color: "#FFFFFF", widthEmu: 88900 });
        P.setShapeShadow(shape, {
          blurEmu: 50800,
          offsetEmu: 19050,
          opacity: 0.35,
        });
        break;
      case "blackFrame":
        P.setShapeStroke(shape, { color: "#000000", widthEmu: 88900 });
        break;
      case "shadow":
        P.setShapeShadow(shape, {
          blurEmu: 127000,
          offsetEmu: 38100,
          opacity: 0.4,
        });
        break;
    }
  }

  return { photoAlbum };
}
