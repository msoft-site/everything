import { addTranslations, t } from "../i18n.js";

// A guided tour of the editor and one-time contextual tips. Progress is a
// per-device preference; nothing here changes boards or history.
export const TOUR_KEY = "whiteboard-tour-v1";
export const TIPS_KEY = "whiteboard-tips-v1";
export const EDITOR_TOUR = [
  {
    target: '[data-action="tool-note"]',
    edits: true,
    title: "Add sticky notes",
    text: "Press N, or choose Sticky note and click the board. Type right away; Tab goes on to the next note, and clicking outside finishes.",
    touch:
      "Choose Sticky note and tap the board. Type right away; tapping outside finishes.",
  },
  {
    target: '.tools [data-action="tool-select"]',
    edits: true,
    title: "Select, move, and connect",
    text: "Drag objects to move them. Hover a selected shape or note and use its blue handles to connect it to another object.",
    touch:
      "Drag objects to move them. Tap a shape or note, then tap one of its blue handles to add a connected object, or drag a handle onto another object to connect them.",
  },
  {
    target: '[data-action="tool-frame"]',
    edits: true,
    title: "Organize with frames",
    text: "Frames group content into sections. They power navigation, presentation, section links, and exports.",
  },
  {
    target: '[data-action="frames"]',
    title: "Navigate large boards",
    text: "Frames and navigation lists every section like a table of contents. The minimap (M) and Find on board (Ctrl/Cmd F) help too.",
    touch:
      "Frames and navigation lists every section like a table of contents. The minimap and Find on board, in the same row, help too.",
  },
  {
    target: '[data-action="comments"]',
    comments: true,
    title: "Discuss asynchronously",
    text: "Pin comments to objects, reply in threads, and mention people with @name so they are notified.",
  },
  {
    target: '[data-action="share"]',
    edits: true,
    title: "Share and collaborate",
    text: "Invite people to edit, comment, or view. Everyone sees live cursors and changes as they happen.",
  },
  {
    target: "[data-timer-access]",
    edits: true,
    title: "Run workshops",
    text: "Use the timer, bring everyone to your view from Participants, and present frames one at a time.",
  },
  {
    target: '[data-action="commands"]',
    title: "Find any command",
    text: "Press Ctrl/Cmd K to search every tool, template, and setting. Open Help and training at any time for guides.",
    touch:
      "Tap the command palette to search every tool, template, and setting. Help and training has guides at any time, beside the zoom controls or under More tools on small screens.",
  },
];
export const TIPS = {
  frame:
    "Tip: drag across the board to draw a frame. Objects inside it move with it.",
  arrow:
    "Tip: start the arrow on an object and end it on another to connect them.",
  pen: "Tip: drawings can be selected, moved, and recolored like any other object.",
  eraser: "Tip: the eraser removes whole drawings. Undo brings them back.",
  comment:
    "Tip: click an object to pin a comment to it, or empty space for a board comment.",
  text: "Tip: text grows as you type. Select words to format them or add links.",
};
function read(key, storage) {
  try {
    return JSON.parse(storage?.getItem(key) || "null");
  } catch {
    return null;
  }
}
function write(key, value, storage) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* Preferences are optional. */
  }
}
// Reading localStorage itself throws where the browser blocks storage.
function localStore() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
export function createOnboarding({
  root = () => document,
  storage = localStore(),
  focusCanvas = () => {},
}) {
  let bubble = null,
    step = 0,
    steps = [],
    previous = null;
  // The tour and tips seen this session, for when storage is unavailable.
  const seenNow = new Set();
  function done() {
    seenNow.add(TOUR_KEY);
    write(TOUR_KEY, { done: true, at: Date.now() }, storage);
  }
  // Escape ends the tour from the canvas or the page too, not only from
  // inside the bubble; a dialog open over the tour takes its own Escape.
  function escapeAnywhere(e) {
    if (e.key !== "Escape" || !bubble || e.defaultPrevented) return;
    const doc = root();
    if (doc.querySelector("dialog[open]") || bubble.contains(e.target)) return;
    if (e.target !== doc.body && e.target.id !== "canvas") return;
    e.preventDefault();
    close(true);
  }
  function close(finished = true) {
    if (!bubble) return;
    root().removeEventListener("keydown", escapeAnywhere, true);
    bubble.remove();
    bubble = null;
    root().querySelector(".tour-target")?.classList.remove("tour-target");
    if (finished) done();
    if (previous?.isConnected) previous.focus();
    else focusCanvas();
  }
  function place({ focus = true, announce = false } = {}) {
    const doc = root();
    doc.querySelector(".tour-target")?.classList.remove("tour-target");
    const current = steps[step];
    const target = doc.querySelector(current.target);
    // Touch screens are told to tap, not given keys and hovering.
    const text = t(
      (current.touch &&
        doc.defaultView.matchMedia?.("(pointer: coarse)").matches &&
        current.touch) ||
        current.text,
    );
    bubble.querySelector("#tour-title").textContent = t(current.title);
    bubble.querySelector("#tour-text").textContent = text;
    bubble.querySelector("#tour-count").textContent =
      `${step + 1} / ${steps.length}`;
    bubble.querySelector("#tour-back").disabled = step === 0;
    bubble.querySelector("#tour-next").textContent = t(
      step === steps.length - 1 ? "Finish" : "结束",
    );
    const view = doc.defaultView;
    const width = Math.min(340, view.innerWidth - 32);
    bubble.style.width = `${width}px`;
    if (target) target.classList.add("tour-target");
    if (target && target.getClientRects().length) {
      // A button in a scrolling strip, such as the canvas navigation on a
      // phone, is brought into view before the bubble points at it.
      target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      const r = target.getBoundingClientRect();
      const below = r.bottom + 12 + 220 < view.innerHeight;
      bubble.style.left = `${Math.max(16, Math.min(view.innerWidth - width - 16, r.left + r.width / 2 - width / 2))}px`;
      bubble.style.top = below ? `${r.bottom + 12}px` : "";
      bubble.style.bottom = below
        ? ""
        : `${Math.max(16, view.innerHeight - r.top + 12)}px`;
    } else {
      bubble.style.left = `${Math.max(16, view.innerWidth / 2 - width / 2)}px`;
      bubble.style.top = "30%";
      bubble.style.bottom = "";
    }
    if (focus) bubble.querySelector("#tour-next").focus();
    // Focus stays on Next, so the new step is announced.
    if (announce)
      bubble.querySelector("#tour-live").textContent =
        `${step + 1} / ${steps.length}. ${t(current.title)}. ${text}`;
  }
  const api = {
    get active() {
      return !!bubble;
    },
    shouldStart() {
      return !seenNow.has(TOUR_KEY) && !read(TOUR_KEY, storage)?.done;
    },
    // Viewers and commenters are shown only what they can do: steps about
    // editing, or commenting for viewers, and controls that are disabled
    // or hidden for them, are left out. When the roles are given, steps
    // about editing and commenting follow them rather than whether their
    // controls are disabled for now, as they are while a shared board
    // connects.
    start(list = EDITOR_TOUR, roles) {
      close(false);
      const { canEdit = true, canComment = true } = roles || {};
      const doc = root();
      steps = list.filter((s) => {
        const el = doc.querySelector(s.target);
        return (
          el &&
          (!el.disabled || (roles && (s.edits || s.comments))) &&
          !el.closest("[hidden]") &&
          (canEdit || !s.edits) &&
          (canComment || !s.comments)
        );
      });
      if (!steps.length) return;
      step = 0;
      // Started from the offer that goes away, focus was on the page; the
      // canvas takes it back when the tour ends.
      previous = doc.activeElement === doc.body ? null : doc.activeElement;
      bubble = doc.createElement("div");
      bubble.className = "tour-bubble panel";
      bubble.setAttribute("role", "dialog");
      bubble.setAttribute("aria-modal", "false");
      bubble.setAttribute("aria-labelledby", "tour-title");
      bubble.setAttribute("aria-describedby", "tour-text");
      bubble.innerHTML = `<div class="tour-head"><h2 id="tour-title"></h2><span id="tour-count" class="tour-count"></span></div><p id="tour-text"></p><div class="tour-actions"><button class="text-btn" id="tour-skip">${t("Skip tour")}</button><button class="secondary" id="tour-back">${t("Back")}</button><button class="primary" id="tour-next">${t("Next")}</button></div><p id="tour-live" class="sr-only" role="status"></p>`;
      doc.body.append(bubble);
      doc.addEventListener("keydown", escapeAnywhere, true);
      bubble.querySelector("#tour-skip").onclick = () => close(true);
      bubble.querySelector("#tour-back").onclick = () => {
        step = Math.max(0, step - 1);
        place({ announce: true });
      };
      bubble.querySelector("#tour-next").onclick = () => {
        if (step === steps.length - 1) close(true);
        else {
          step++;
          place({ announce: true });
        }
      };
      bubble.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          // The arrows step through the tour; they must not also move the
          // selected objects on the canvas.
          e.preventDefault();
          e.stopPropagation();
          if (e.key === "ArrowRight")
            bubble.querySelector("#tour-next").click();
          else if (step) bubble.querySelector("#tour-back").click();
        }
      });
      place();
    },
    close,
    // Follow layout changes without taking focus from where it is.
    reposition() {
      if (bubble) place({ focus: false });
    },
    // Show a one-time contextual tip the first time a tool is chosen.
    tip(key, toast) {
      if (!TIPS[key] || api.active || seenNow.has(key)) return;
      const seen = read(TIPS_KEY, storage) || {};
      if (seen[key]) return;
      seenNow.add(key);
      seen[key] = Date.now();
      write(TIPS_KEY, seen, storage);
      toast(TIPS[key]);
    },
    dismiss: done,
    reset() {
      seenNow.clear();
      write(TOUR_KEY, null, storage);
      write(TIPS_KEY, null, storage);
    },
  };
  return api;
}

addTranslations({
  "Add sticky notes": "添加sticky notes",
  "Press N, or choose Sticky note and click the board. Type right away; Tab goes on to the next note, and clicking outside finishes.":
    "按 N，或选择便签并单击该板。立即输入；按 T​​ab 键转到下一个注释，然后单击外部完成。",
  "Select, move, and connect": "选择、移动和连接",
  "Drag objects to move them. Hover a selected shape or note and use its blue handles to connect it to another object.":
    "拖动对象来移动它们。将鼠标悬停在选定的形状或注释上，然后使用其蓝色手柄将其连接到另一个对象。",
  "Choose Sticky note and tap the board. Type right away; tapping outside finishes.":
    "选择便签并点击面板。立即输入；敲击外部饰面。",
  "Drag objects to move them. Tap a shape or note, then tap one of its blue handles to add a connected object, or drag a handle onto another object to connect them.":
    "拖动对象来移动它们。点击形状或注释，然后点击其蓝色手柄之一以添加连接的对象，或将手柄拖动到另一个对象上以连接它们。",
  "Organize with frames": "用画框组织",
  "Frames group content into sections. They power navigation, presentation, section links, and exports.":
    "画框将内容分组。它们为导航、演示、部分链接和导出提供支持。",
  "Navigate large boards": "浏览大板",
  "Frames and navigation lists every section like a table of contents. The minimap (M) and Find on board (Ctrl/Cmd F) help too.":
    "Cadres et navigation énumère chaque section comme une table des matières. La mini-carte (M) et Rechercher dans le tableau (Ctrl/Cmd F) aident aussi.",
  "Frames and navigation lists every section like a table of contents. The minimap and Find on board, in the same row, help too.":
    "画框和导航像目录一样列出了每个部分。白板上的小地图和“查找”位于同一排，也很有帮助。",
  "Discuss asynchronously": "异步讨论",
  "Pin comments to objects, reply in threads, and mention people with @name so they are notified.":
    "将评论固定到对象、在线程中回复以及使用 @name 提及人员以便他们收到通知。",
  "Share and collaborate": "分享与协作",
  "Invite people to edit, comment, or view. Everyone sees live cursors and changes as they happen.":
    "邀请人们编辑、评论或查看。每个人都可以看到实时光标和发生的变化。",
  "Run workshops": "举办研讨会",
  "Use the timer, bring everyone to your view from Participants, and present frames one at a time.":
    "使用计时器，将每个人带到您的参与者视图中，并一次呈现一帧。",
  "Find any command": "查找任何命令",
  "Press Ctrl/Cmd K to search every tool, template, and setting. Open Help and training at any time for guides.":
    "Appuyez sur Ctrl/Cmd K pour chercher un outil, un modèle ou un paramètre. Ouvrez Aide et formation en tout temps pour consulter les guides.",
  "Tip: drag across the board to draw a frame. Objects inside it move with it.":
    "提示：在板上拖动以绘制画框。里面的物体也随之移动。",
  "Tip: start the arrow on an object and end it on another to connect them.":
    "提示：箭头在一个对象上开始，在另一个对象上结束以连接它们。",
  "Tip: drawings can be selected, moved, and recolored like any other object.":
    "提示：可以像任何其他对象一样选择、移动绘图和重新着色。",
  "Tip: the eraser removes whole drawings. Undo brings them back.":
    "提示：橡皮擦会删除整个绘图。撤消会使它们恢复。",
  "Tip: click an object to pin a comment to it, or empty space for a board comment.":
    "提示：单击某个对象可将评论固定到其上，或空白区域可添加讨论区评论。",
  "Tip: text grows as you type. Select words to format them or add links.":
    "提示：文本随着您的输入而增长。选择单词以设置其格式或添加链接。",
  "Tap the command palette to search every tool, template, and setting. Help and training has guides at any time, beside the zoom controls or under More tools on small screens.":
    "点击命令面板可搜索每个工具、模板和设置。帮助和培训随时在缩放控件旁边或小屏幕上的更多工具下提供指南。",
  "Skip tour": "跳过游览",
  "Getting started": "入门",
  "New here?": "新来的？",
  "Take a one-minute tour": "进行一分钟游览",
  Dismiss: "Fermer",
  "Open a board to take the tour.": "打开看板即可游览。",
  "The tour starts once the board connects.":
    "连接电路板后，游览就开始了。",
  "AI assistant": "AI 助手",
  "Help and training": "帮助与培训",
  "Take the tour": "参观游览",
  "Migrate from Miro": "从米罗迁移",
  Back: "Précédent",
  Next: "Suivant",
  Finish: "Terminer",
});
