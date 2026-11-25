// The library screen's own pieces: the rail of sections down its side, the
// box that writes a presentation from a description, the strip of themes a
// new deck can start in, and what this device remembers about the
// presentations listed (which are pinned, and when each was last opened).
// main.js lays them out with the template cards and the list.
import "./start-screen.css";
import { el, icon, button } from "../ui.js";
import { lucide } from "../draw/draw-icons.js";
import { SLIDE_COUNTS, DEFAULT_SLIDE_COUNT } from "./deck-from-prompt.js";

export { libraryMeta, libraryKey } from "./library-meta.js";

/* ---------- The rail ---------- */

/**
 * The sections down the library's side. `sections` is [{ id, label, icon,
 * run, action? }], an action (such as Open) not being a place to show as
 * current; `current` is the one showing.
 */
export function homeRail(sections, current = "home") {
  return el(
    "nav",
    { class: "home-rail", "aria-label": "库区域" },
    ...sections.map((s) =>
      el(
        "button",
        {
          type: "button",
          class: "home-rail-item",
          "data-section": s.id,
          "aria-current": s.id === current ? "page" : null,
          onclick: (e) => {
            // Open is an action; the others are places on the screen.
            if (!s.action)
              for (const b of e.currentTarget.parentElement.children)
                b.toggleAttribute("aria-current", b === e.currentTarget);
            if (!s.action) e.currentTarget.setAttribute("aria-current", "page");
            s.run();
          },
        },
        lucide(s.icon, 22),
        el("span", {}, s.label),
      ),
    ),
  );
}

/* ---------- Describe your presentation ---------- */

/**
 * The box that writes a deck from a description. `themes` is [{ key, name }];
 * `create(description, { slides, theme, signal, onProgress })` does the work
 * and resolves once the deck is open (or throws). `available()` says whether
 * the AI can be reached.
 */
export function promptBox({ themes, theme, create, available }) {
  const field = el("textarea", {
    class: "home-prompt-input",
    rows: 2,
    maxlength: 4000,
    placeholder:
      "描述您的演示文稿：主题、受众以及必须涵盖的内容",
    "aria-label": "描述您的演示文稿",
  });
  const slides = el(
    "select",
    { class: "home-prompt-select", "aria-label": "幻灯片数量" },
    ...SLIDE_COUNTS.map((n) =>
      el(
        "option",
        { value: String(n), selected: n === DEFAULT_SLIDE_COUNT },
        `${n} 张幻灯片`,
      ),
    ),
  );
  const palette = el(
    "select",
    { class: "home-prompt-select", "aria-label": "主题" },
    ...themes.map((t) =>
      el("option", { value: t.key, selected: t.key === theme }, t.name),
    ),
  );
  const status = el("p", {
    class: "home-prompt-status",
    role: "status",
    "aria-live": "polite",
  });
  let controller = null;
  const go = button(
    "创建",
    "Sparkles",
    () => run(),
    "primary home-prompt-go",
  );
  const stop = button("停止", null, () => controller?.abort(), "secondary", {
    hidden: true,
  });
  function busy(on) {
    box.classList.toggle("busy", on);
    field.readOnly = on;
    slides.disabled = palette.disabled = on;
    go.hidden = on;
    stop.hidden = !on;
  }
  async function run() {
    const description = field.value.trim();
    if (!description) {
      status.textContent = "请先描述您需要的演示文稿。";
      field.focus();
      return;
    }
    if (!available()) {
      status.textContent =
        "AI 服务不可用。请检查您的连接并重新加载。";
      return;
    }
    controller = new AbortController();
    busy(true);
    const count = Number(slides.value);
    status.textContent = "正在编写大纲…";
    try {
      await create(description, {
        slides: count,
        theme: palette.value,
        signal: controller.signal,
        onProgress: ({ slides: done }) => {
          status.textContent = `正在编写第 ${Math.min(done + 1, count + 1)} 张幻灯片（共 ${count + 1} 张）…`;
        },
      });
      if (box.isConnected) status.textContent = "";
    } catch (e) {
      status.textContent = e?.stopped
        ? "已停止。"
        : e?.message || "无法编写演示文稿，请重试。";
    } finally {
      controller = null;
      if (box.isConnected) busy(false);
    }
  }
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      run();
    }
  });
  const box = el(
    "form",
    {
      class: "home-prompt",
      "aria-label": "使用 AI 编写演示文稿",
      onsubmit: (e) => {
        e.preventDefault();
        run();
      },
    },
    el(
      "label",
      { class: "home-prompt-label" },
      lucide("Sparkles", 16),
      "描述您的演示文稿",
    ),
    field,
    el(
      "div",
      { class: "home-prompt-bar" },
      slides,
      palette,
      el("span", { class: "home-prompt-spacer" }),
      stop,
      go,
    ),
    status,
  );
  return box;
}

/* ---------- Themes ---------- */

/**
 * A strip of themes a new deck can start in: [{ key, name, preview }], the
 * preview a picture of a title slide in it. `pick(key)` starts the deck.
 */
export function themeStrip(themes, pick) {
  return el(
    "section",
    { class: "home-themes", "aria-label": "从主题开始" },
    el("h2", { class: "home-themes-title" }, "主题"),
    el(
      "div",
      { class: "home-themes-row" },
      ...themes.map((t) =>
        el(
          "button",
          {
            type: "button",
            class: "home-theme",
            "data-theme-key": t.key,
            "aria-label": `基于 ${t.name} 主题的新建演示文稿`,
            onclick: () => pick(t.key),
          },
          el(
            "span",
            { class: "home-theme-preview" },
            t.preview
              ? el("img", {
                  src: t.preview,
                  alt: "",
                  loading: "lazy",
                  draggable: "false",
                })
              : icon("Palette", 24),
          ),
          el("span", { class: "home-theme-name" }, t.name),
        ),
      ),
    ),
  );
}

/** The "Recent" and "Pinned" switch over the list. */
export function libraryFilter(current, choose) {
  const make = (id, label) =>
    el(
      "button",
      {
        type: "button",
        class: "library-filter-btn",
        "aria-pressed": String(current === id),
        "data-filter": id,
        onclick: () => choose(id),
      },
      label,
    );
  return el(
    "div",
    { class: "library-filter", role: "group", "aria-label": "显示" },
    make("recent", "最近"),
    make("pinned", "已固定"),
  );
}

export { lucide };
