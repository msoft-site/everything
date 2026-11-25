// Comments: threads anchored to a slide or to an object on it, with replies,
// @mentions, resolve and reopen, shown in the Comments pane and as markers
// on the slide that can be dragged to where they belong. They live in the
// file as threaded comment parts (see lib/pptx comment-threads.ts) and never
// appear in the slide show, a print or an export: the markers are drawn over
// the editor's canvas only.
import {
  el,
  icon,
  iconButton,
  openMenu,
  dialog,
  toast,
  MOD_KEY,
} from "../ui.js";
import { P } from "../model.js";
import {
  currentReviewer,
  rememberGuestName,
  storedGuestName,
  mentionCandidates,
  mentionQuery,
  filterMentions,
  splitMentions,
  personHue,
  relativeTime,
  samePerson,
  initialsOf,
} from "./people.js";

const PREFS_KEY = "presentation:comments";
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return {
      markup: p.markup !== false,
      filter: ["all", "unresolved", "resolved"].includes(p.filter)
        ? p.filter
        : "all",
      scope: p.scope === "deck" ? "deck" : "slide",
    };
  } catch {
    return { markup: true, filter: "all", scope: "slide" };
  }
}

// The thread as it is written back: the reader's own fields are left out.
const toInput = (t) => ({
  id: t.id,
  author: t.author,
  created: t.created,
  text: t.text,
  status: t.status,
  shapeId: t.shapeId,
  pos: t.pos,
  replies: t.replies.map((r) => ({
    id: r.id,
    author: r.author,
    created: r.created,
    text: r.text,
  })),
});

export function createComments(env, host) {
  const prefs = loadPrefs();
  const savePrefs = () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  };
  const state = {
    // The thread in focus: { part, id }.
    active: null,
    // A new comment being written: { part, shapeId, pos }.
    composing: null,
    // A comment or reply being edited: { id, replyId }.
    editing: null,
    // Unsent text, by field.
    drafts: new Map(),
  };

  // Threads per slide, read once per revision of the deck.
  let cache = { pres: null, revision: -1, map: new Map() };
  function threadsOf(slide) {
    const pres = env.pres();
    const revision = env.revision();
    if (cache.pres !== pres || cache.revision !== revision)
      cache = { pres, revision, map: new Map() };
    const part = P.getSlidePartName(slide);
    if (!cache.map.has(part)) {
      let list = [];
      try {
        list = P.getSlideCommentThreads(slide);
      } catch {}
      cache.map.set(part, list);
    }
    return cache.map.get(part);
  }
  const invalidate = () =>
    (cache = { pres: null, revision: -1, map: new Map() });
  const slides = () => (env.pres() ? P.getSlides(env.pres()) : []);
  const slideByPart = (part) =>
    slides().find((s) => P.getSlidePartName(s) === part) || null;
  const currentPart = () =>
    env.pres() ? P.getSlidePartName(env.slide()) : null;
  const passes = (t) =>
    prefs.filter === "all" ||
    (prefs.filter === "resolved") === (t.status !== "active");
  // Every visible thread in reading order: by slide, then as stored.
  function allThreads({ filtered = true } = {}) {
    const out = [];
    slides().forEach((s, index) => {
      for (const t of threadsOf(s))
        if (!filtered || passes(t))
          out.push({ slide: s, index, part: P.getSlidePartName(s), thread: t });
    });
    return out;
  }
  const people = () => {
    try {
      return env.pres() ? P.getCommentPeople(env.pres()) : [];
    } catch {
      return [];
    }
  };
  const me = () => currentReviewer(env.account());
  // A guest gives a name the first time they comment.
  async function ensureReviewer() {
    const known = me();
    if (known) return known;
    const input = el("input", {
      class: "input",
      value: storedGuestName() || "访客",
      maxlength: 80,
      "aria-label": "您的姓名",
      autofocus: true,
    });
    const ok = await dialog({
      title: "您的姓名",
      body: el(
        "form",
        { class: "dialog-body" },
        el(
          "p",
          { class: "helper" },
          "批注会显示其作者。登录以使用您的用户名，或输入要显示的名称。",
        ),
        el("label", {}, "姓名", input),
      ),
      confirm: "继续",
    });
    const name = input.value.trim();
    if (!ok || !name) return null;
    rememberGuestName(name);
    return me();
  }
  const author = (who) => ({
    name: who.name,
    userId: who.userId,
    initials: who.initials || initialsOf(who.name),
    providerId: who.providerId || "None",
  });

  // Changes one slide's threads in one undoable step. `change` gets the
  // threads as written and returns the new list, or null for no change.
  async function writeSlide(part, change) {
    const target = slideByPart(part);
    if (!target) return false;
    let renamed = null;
    const ok = await env.mutateSlide(target, (s) => {
      // Legacy comments become threads of their own once anything changes.
      const list = P.getSlideCommentThreads(s).map((t) => {
        if (!t.legacy) return toInput(t);
        const id = P.newCommentGuid();
        if (state.active?.id === t.id) renamed = id;
        return { ...toInput(t), id };
      });
      const next = change(list);
      if (!next) return env.SKIP;
      P.setSlideCommentThreads(s, next);
      // The slide redraws before this edit is counted; it reads afresh.
      invalidate();
    });
    if (ok && renamed && state.active)
      state.active = { ...state.active, id: renamed };
    invalidate();
    refreshAll();
    return ok;
  }

  // ---- Commands ----------------------------------------------------------

  async function newComment() {
    if (!env.pres()) return;
    if (env.blocksEdits()) return env.blockedEdit();
    env.commitText?.();
    const s = env.slide();
    const shape = env.currentShape();
    const size = env.size();
    let pos = null,
      shapeId = null;
    if (shape) {
      shapeId = String(P.getShapeId(shape));
      const b = env.slideBounds(shape);
      if (b)
        pos = {
          x: Math.min(b.x + b.w, size.cx * 0.97),
          y: Math.max(0, b.y),
        };
    }
    if (!pos) {
      const n = threadsOf(s).length;
      pos = { x: size.cx * (0.02 + (n % 12) * 0.035), y: size.cy * 0.03 };
    }
    state.composing = { part: P.getSlidePartName(s), shapeId, pos };
    state.drafts.delete("new");
    host.open("comments", { focus: false });
    refreshAll();
    host.el.querySelector('[data-focus-key="new"]')?.focus();
  }

  async function post(text) {
    const value = text.trim();
    if (!value || !state.composing) return;
    const who = await ensureReviewer();
    if (!who) return;
    const { part, shapeId, pos } = state.composing;
    const id = P.newCommentGuid();
    const ok = await writeSlide(part, (list) => [
      ...list,
      {
        id,
        author: author(who),
        created: new Date().toISOString(),
        text: value,
        status: "active",
        shapeId,
        pos,
        replies: [],
      },
    ]);
    if (ok) {
      state.composing = null;
      state.drafts.delete("new");
      state.active = { part, id };
      refreshAll();
      focusThread(id);
    }
  }

  async function reply(entry, text) {
    const value = text.trim();
    if (!value) return;
    const who = await ensureReviewer();
    if (!who) return;
    const ok = await writeSlide(entry.part, (list) =>
      list.map((t) =>
        t.id === entry.thread.id
          ? {
              ...t,
              // A reply to a resolved thread opens it again.
              status: "active",
              replies: [
                ...t.replies,
                {
                  id: P.newCommentGuid(),
                  author: author(who),
                  created: new Date().toISOString(),
                  text: value,
                },
              ],
            }
          : t,
      ),
    );
    if (ok) {
      state.drafts.delete(`reply:${entry.thread.id}`);
      refreshAll();
      host.el
        .querySelector(
          `[data-focus-key="reply:${CSS.escape(entry.thread.id)}"]`,
        )
        ?.focus();
    }
  }

  const setStatus = (entry, status) =>
    writeSlide(entry.part, (list) =>
      list.map((t) => (t.id === entry.thread.id ? { ...t, status } : t)),
    );

  async function saveEdit(entry, replyId, text) {
    const value = text.trim();
    if (!value) return;
    const ok = await writeSlide(entry.part, (list) =>
      list.map((t) => {
        if (t.id !== entry.thread.id) return t;
        if (!replyId) return { ...t, text: value };
        return {
          ...t,
          replies: t.replies.map((r) =>
            r.id === replyId ? { ...r, text: value } : r,
          ),
        };
      }),
    );
    if (ok) {
      state.editing = null;
      state.drafts.delete(`edit:${entry.thread.id}:${replyId || ""}`);
      refreshAll();
    }
  }

  async function deleteThread(entry) {
    const ok = await writeSlide(entry.part, (list) =>
      list.filter((t) => t.id !== entry.thread.id),
    );
    if (ok && state.active?.id === entry.thread.id) state.active = null;
    refreshAll();
  }
  async function deleteReply(entry, replyId) {
    await writeSlide(entry.part, (list) =>
      list.map((t) =>
        t.id === entry.thread.id
          ? { ...t, replies: t.replies.filter((r) => r.id !== replyId) }
          : t,
      ),
    );
  }
  async function deleteOnSlide(part = currentPart()) {
    if (!part) return;
    await writeSlide(part, (list) => (list.length ? [] : null));
    if (state.active?.part === part) state.active = null;
    refreshAll();
  }
  async function deleteAll() {
    const total = allThreads({ filtered: false }).length;
    if (!total) return;
    const ok = await dialog({
      title: "删除所有批注",
      body: el(
        "div",
        { class: "dialog-body" },
        el(
          "p",
          {},
          `是否从演示文稿的每张幻灯片中删除全部 ${total} 条批注及其回复？`,
        ),
      ),
      confirm: "全部删除",
      danger: true,
    });
    if (!ok) return;
    await env.mutate(() => {
      const n = P.clearAllCommentThreads(env.pres());
      if (!n) return env.SKIP;
      invalidate();
    });
    state.active = null;
    invalidate();
    refreshAll();
  }

  function activeEntry() {
    if (!state.active) return null;
    const s = slideByPart(state.active.part);
    const thread = s && threadsOf(s).find((t) => t.id === state.active.id);
    return thread ? { slide: s, part: state.active.part, thread } : null;
  }

  // Previous / Next walk every visible thread of the deck in order.
  async function step(direction) {
    const list = allThreads();
    if (!list.length) {
      toast("此演示文稿中没有批注。");
      return;
    }
    let at = state.active
      ? list.findIndex(
          (e) =>
            e.part === state.active.part && e.thread.id === state.active.id,
        )
      : -1;
    let next;
    if (at < 0) {
      // From the current slide: its first (or, backwards, the last before).
      const here = env.index();
      next =
        direction > 0
          ? list.findIndex((e) => e.index >= here)
          : list.findLastIndex((e) => e.index <= here);
      if (next < 0) next = direction > 0 ? 0 : list.length - 1;
    } else {
      next = at + direction;
      if (next >= list.length || next < 0) {
        next = direction > 0 ? 0 : list.length - 1;
        toast(
          direction > 0
            ? "从第一条批注继续。"
            : "从最后一条批注继续。",
        );
      }
    }
    await activate(list[next], { focus: true });
  }

  async function activate(entry, { focus = false, select = true } = {}) {
    if (!entry) return;
    state.active = { part: entry.part, id: entry.thread.id };
    if (P.getSlidePartName(env.slide()) !== entry.part)
      await env.chooseSlide(entry.slide);
    if (select && entry.thread.shapeId) {
      const shape = P.findShapeById(env.slide(), Number(entry.thread.shapeId));
      if (shape) env.showObjects(entry.part, [P.getShapeId(shape)]);
    }
    if (!host.isOpen("comments")) host.open("comments", { focus: false });
    refreshAll();
    if (focus) focusThread(entry.thread.id);
  }
  function focusThread(id) {
    const card = host.el.querySelector(
      `.comment-thread[data-thread-id="${CSS.escape(id)}"]`,
    );
    card?.scrollIntoView({ block: "nearest" });
    card?.focus({ preventScroll: true });
  }

  function deleteMenu() {
    const entry = activeEntry();
    const here = currentPart() ? threadsOf(env.slide()).length : 0;
    const total = allThreads({ filtered: false }).length;
    return [
      {
        label: "删除批注",
        icon: "o:deleteComment",
        disabled: !entry,
        onSelect: () => entry && deleteThread(entry),
      },
      {
        label: "删除此幻灯片上的所有批注",
        disabled: !here,
        onSelect: () => deleteOnSlide(),
      },
      {
        label: "删除此演示文稿中的所有批注",
        disabled: !total,
        danger: true,
        onSelect: () => deleteAll(),
      },
    ];
  }

  function showMenu() {
    return [
      {
        label: "批注窗格",
        checked: host.isOpen("comments"),
        onSelect: () => host.toggle("comments"),
      },
      {
        label: "显示标记",
        checked: prefs.markup,
        onSelect: () => setMarkup(!prefs.markup),
      },
    ];
  }
  function setMarkup(on) {
    prefs.markup = on;
    savePrefs();
    renderMarkers();
    env.syncToolbar();
  }

  // ---- The pane ----------------------------------------------------------

  function filterMenu(anchor) {
    const pick = (key, value) => () => {
      prefs[key] = value;
      savePrefs();
      refreshAll();
    };
    openMenu({
      anchor,
      label: "筛选批注",
      align: "end",
      items: [
        { header: "显示" },
        {
          label: "所有批注",
          checked: prefs.filter === "all",
          onSelect: pick("filter", "all"),
        },
        {
          label: "未解决的批注",
          checked: prefs.filter === "unresolved",
          onSelect: pick("filter", "unresolved"),
        },
        {
          label: "已解决的批注",
          checked: prefs.filter === "resolved",
          onSelect: pick("filter", "resolved"),
        },
        { separator: true },
        {
          label: "仅此幻灯片",
          checked: prefs.scope === "slide",
          onSelect: pick("scope", "slide"),
        },
        {
          label: "所有幻灯片",
          checked: prefs.scope === "deck",
          onSelect: pick("scope", "deck"),
        },
      ],
    });
  }

  host.register("comments", {
    title: "批注",
    tools: () => [
      iconButton("筛选批注", "SlidersHorizontal", (e) =>
        filterMenu(e.currentTarget),
      ),
      iconButton("新建批注", "o:newComment", () => newComment(), {
        "data-tip-title": `新建批注 (${MOD_KEY}+Shift+M)`,
      }),
    ],
    render: renderPane,
    onClose: () => {
      state.composing = null;
      renderMarkers();
      env.syncToolbar();
    },
    onOpen: () => {
      renderMarkers();
      env.syncToolbar();
    },
  });

  function avatar(person, small = false) {
    return el(
      "span",
      {
        class: `comment-avatar ${small ? "small" : ""}`,
        "aria-hidden": "true",
        style: `--hue:${personHue(person?.name)}`,
      },
      person?.initials || initialsOf(person?.name),
    );
  }
  function richText(text) {
    const names = people().map((p) => p.name);
    const mine = me()?.name;
    return splitMentions(text, names).map((piece) =>
      piece.mention
        ? el(
            "span",
            {
              class: `comment-mention ${piece.mention === mine ? "me" : ""}`,
            },
            piece.text,
          )
        : piece.text,
    );
  }

  // A text box with @mention suggestions.
  function mentionBox({
    key,
    placeholder,
    label,
    onSubmit,
    onCancel,
    rows = 2,
  }) {
    const listId = `mentions-${key.replace(/[^a-z0-9]/gi, "")}`;
    const area = el("textarea", {
      class: "input comment-input",
      rows,
      placeholder,
      "aria-label": label,
      "data-focus-key": key,
      "aria-autocomplete": "list",
      "aria-controls": listId,
      "aria-expanded": "false",
      value: state.drafts.get(key) || "",
    });
    const list = el("ul", {
      class: "mention-list",
      id: listId,
      role: "listbox",
      "aria-label": "提及人员",
      hidden: true,
    });
    let options = [],
      chosen = 0,
      query = null;
    const close = () => {
      list.hidden = true;
      area.setAttribute("aria-expanded", "false");
      area.removeAttribute("aria-activedescendant");
      query = null;
    };
    const pick = (person) => {
      if (!query) return;
      const before = area.value.slice(0, query.start);
      const after = area.value.slice(area.selectionStart);
      const insert = `@${person.name} `;
      area.value = before + insert + after;
      const caret = before.length + insert.length;
      area.setSelectionRange(caret, caret);
      state.drafts.set(key, area.value);
      close();
      area.focus();
      area.dispatchEvent(new Event("input"));
    };
    const show = () => {
      list.replaceChildren(
        ...options.map((p, i) =>
          el(
            "li",
            {
              id: `${listId}-${i}`,
              role: "option",
              "aria-selected": String(i === chosen),
              class: i === chosen ? "active" : "",
              onpointerdown: (e) => {
                e.preventDefault();
                pick(p);
              },
            },
            avatar(p, true),
            el("span", {}, p.name),
          ),
        ),
      );
      list.hidden = !options.length;
      area.setAttribute("aria-expanded", String(!!options.length));
      if (options.length)
        area.setAttribute("aria-activedescendant", `${listId}-${chosen}`);
    };
    area.addEventListener("input", () => {
      state.drafts.set(key, area.value);
      query = mentionQuery(area.value, area.selectionStart);
      if (!query) return close();
      options = filterMentions(mentionCandidates(people(), me()), query.query);
      chosen = 0;
      show();
    });
    area.addEventListener("keydown", (e) => {
      if (!list.hidden && options.length) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          chosen =
            (chosen + (e.key === "ArrowDown" ? 1 : -1) + options.length) %
            options.length;
          show();
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          pick(options[chosen]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
          return;
        }
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSubmit(area.value);
      } else if (e.key === "Escape" && onCancel) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    });
    area.addEventListener("blur", () => setTimeout(close, 120));
    return { area, node: el("div", { class: "mention-box" }, area, list) };
  }

  function anchorLabel(entry) {
    const id = entry.thread.shapeId;
    if (!id) return null;
    const shape = P.findShapeById(entry.slide, Number(id));
    return shape ? env.shapeLabel(shape) : "已删除的对象";
  }

  function threadCard(entry) {
    const t = entry.thread;
    const resolved = t.status !== "active";
    const active =
      state.active?.part === entry.part && state.active?.id === t.id;
    const mine = me();
    const editingThis = state.editing?.id === t.id;
    const onLabel = anchorLabel(entry);
    const more = (replyId, person, text) => (e) => {
      e.stopPropagation();
      openMenu({
        anchor: e.currentTarget,
        label: replyId ? "回复选项" : "批注选项",
        align: "end",
        items: [
          {
            label: "编辑",
            icon: "Pencil",
            disabled: !samePerson(person, mine) || env.blocksEdits(),
            onSelect: () => {
              state.editing = { id: t.id, replyId };
              state.drafts.set(`edit:${t.id}:${replyId || ""}`, text);
              refreshAll();
              host.el
                .querySelector(
                  `[data-focus-key="edit:${CSS.escape(t.id)}:${replyId || ""}"]`,
                )
                ?.focus();
            },
          },
          {
            label: "复制文本",
            icon: "Copy",
            onSelect: () =>
              navigator.clipboard?.writeText(text).catch(() => {}),
          },
          { separator: true },
          replyId
            ? {
                label: "删除回复",
                icon: "Trash2",
                danger: true,
                onSelect: () => deleteReply(entry, replyId),
              }
            : {
                label: "删除会话",
                icon: "Trash2",
                danger: true,
                onSelect: () => deleteThread(entry),
              },
        ],
      });
    };
    const body = (replyId, person, text) => {
      if (
        editingThis &&
        (state.editing.replyId || null) === (replyId || null)
      ) {
        const key = `edit:${t.id}:${replyId || ""}`;
        const box = mentionBox({
          key,
          label: "编辑批注",
          placeholder: "",
          onSubmit: (value) => saveEdit(entry, replyId, value),
          onCancel: () => {
            state.editing = null;
            refreshAll();
          },
        });
        return el(
          "div",
          { class: "comment-edit" },
          box.node,
          el(
            "div",
            { class: "comment-actions" },
            el(
              "button",
              {
                type: "button",
                class: "btn secondary small",
                onclick: () => {
                  state.editing = null;
                  refreshAll();
                },
              },
              "取消",
            ),
            el(
              "button",
              {
                type: "button",
                class: "btn primary small",
                onclick: () => saveEdit(entry, replyId, box.area.value),
              },
              "保存",
            ),
          ),
        );
      }
      return el("p", { class: "comment-text" }, richText(text));
    };
    const head = (person, created, replyId, text) =>
      el(
        "div",
        { class: "comment-head" },
        avatar(person, !!replyId),
        el(
          "div",
          { class: "comment-who" },
          el("span", { class: "comment-name" }, person.name || "未知"),
          el(
            "time",
            {
              class: "comment-time",
              datetime: created || null,
              title: created ? new Date(created).toLocaleString() : null,
            },
            relativeTime(created),
          ),
        ),
        !replyId &&
          iconButton(
            resolved ? "重新打开批注讨论" : "解决批注讨论",
            resolved ? "RotateCcw" : "CircleCheck",
            (e) => {
              e.stopPropagation();
              setStatus(entry, resolved ? "active" : "resolved");
            },
            {
              class: "btn icon-btn comment-resolve",
              disabled: env.blocksEdits() || null,
            },
          ),
        iconButton(
          replyId ? "回复选项" : "批注选项",
          "MoreHorizontal",
          more(replyId, person, text),
          { class: "btn icon-btn comment-more", ...MENU },
        ),
      );
    const replyKey = `reply:${t.id}`;
    const replyBox =
      !resolved &&
      !env.blocksEdits() &&
      mentionBox({
        key: replyKey,
        label: "回复",
        placeholder: "回复…",
        rows: 1,
        onSubmit: (value) => reply(entry, value),
      });
    const total = 1 + t.replies.length;
    return el(
      "article",
      {
        class: `comment-thread ${active ? "active" : ""} ${resolved ? "resolved" : ""}`,
        "data-thread-id": t.id,
        tabindex: -1,
        "aria-label": `Comment by ${t.author.name || "unknown"}${resolved ? ", resolved" : ""}${t.replies.length ? `, ${t.replies.length} repl${t.replies.length === 1 ? "y" : "ies"}` : ""}`,
        onclick: (e) => {
          if (e.target.closest("button, textarea, a, .mention-list")) return;
          activate(entry);
        },
        onfocusin: () => {
          if (!active) {
            state.active = { part: entry.part, id: t.id };
            renderMarkers();
            host.el
              .querySelectorAll(".comment-thread.active")
              .forEach((n) => n.classList.remove("active"));
            host.el
              .querySelector(
                `.comment-thread[data-thread-id="${CSS.escape(t.id)}"]`,
              )
              ?.classList.add("active");
          }
        },
      },
      resolved &&
        el("span", { class: "comment-badge" }, icon("Check", 12), "已解决"),
      onLabel &&
        el(
          "button",
          {
            type: "button",
            class: "comment-anchor text-button",
            onclick: (e) => {
              e.stopPropagation();
              activate(entry);
            },
          },
          icon("o:select", 12),
          `位于 ${onLabel}`,
        ),
      head(t.author, t.created, null, t.text),
      body(null, t.author, t.text),
      t.replies.length > 0 &&
        el(
          "ol",
          { class: "comment-replies", "aria-label": `${total - 1} 条回复` },
          t.replies.map((r) =>
            el(
              "li",
              { class: "comment-reply" },
              head(r.author, r.created, r.id, r.text),
              body(r.id, r.author, r.text),
            ),
          ),
        ),
      replyBox &&
        el(
          "div",
          { class: "comment-reply-box" },
          replyBox.node,
          el(
            "button",
            {
              type: "button",
              class: "btn primary small comment-post",
              "aria-label": "发布回复",
              "data-tip-title": `发布 (${MOD_KEY}+Enter)`,
              onclick: () => reply(entry, replyBox.area.value),
            },
            icon("SendHorizontal", 14),
          ),
        ),
    );
  }

  function composer() {
    const c = state.composing;
    const target = slideByPart(c.part);
    const shape =
      c.shapeId && target && P.findShapeById(target, Number(c.shapeId));
    const box = mentionBox({
      key: "new",
      label: "新建批注",
      placeholder: "开启讨论。键入 @ 可提及某人。",
      rows: 3,
      onSubmit: (value) => post(value),
      onCancel: () => {
        state.composing = null;
        refreshAll();
      },
    });
    box.area.dataset.autofocus = "";
    const who = me();
    return el(
      "article",
      { class: "comment-thread composing active" },
      shape &&
        el(
          "span",
          { class: "comment-anchor" },
          icon("o:select", 12),
          `位于 ${env.shapeLabel(shape)}`,
        ),
      el(
        "div",
        { class: "comment-head" },
        avatar(who || { name: "访客", initials: "?" }),
        el(
          "div",
          { class: "comment-who" },
          el("span", { class: "comment-name" }, who?.name || "您"),
        ),
      ),
      box.node,
      el(
        "div",
        { class: "comment-actions" },
        el(
          "button",
          {
            type: "button",
            class: "btn secondary small",
            onclick: () => {
              state.composing = null;
              refreshAll();
            },
          },
          "取消",
        ),
        el(
          "button",
          {
            type: "button",
            class: "btn primary small",
            "data-tip-title": `发布 (${MOD_KEY}+Enter)`,
            onclick: () => post(box.area.value),
          },
          "发布",
        ),
      ),
    );
  }

  function renderPane() {
    const wrap = el("div", { class: "comments-pane" });
    if (!env.pres()) return wrap;
    const part = currentPart();
    if (state.composing && state.composing.part !== part)
      state.composing = null;
    const filterNote = {
      all: null,
      unresolved: "显示未解决的批注",
      resolved: "显示已解决的批注",
    }[prefs.filter];
    if (filterNote || prefs.scope === "deck")
      wrap.append(
        el(
          "p",
          { class: "comment-filter-note" },
          [filterNote, prefs.scope === "deck" ? "(所有幻灯片)" : null]
            .filter(Boolean)
            .join(" "),
        ),
      );
    if (state.composing) wrap.append(composer());
    const entries =
      prefs.scope === "deck"
        ? allThreads()
        : allThreads().filter((e) => e.part === part);
    let lastIndex = -1;
    for (const entry of entries) {
      if (prefs.scope === "deck" && entry.index !== lastIndex) {
        lastIndex = entry.index;
        wrap.append(
          el(
            "h3",
            { class: "comment-slide-heading" },
            el(
              "button",
              {
                type: "button",
                class: "text-button",
                onclick: () => env.chooseSlide(entry.slide),
              },
              `幻灯片 ${entry.index + 1}`,
            ),
          ),
        );
      }
      wrap.append(threadCard(entry));
    }
    if (!entries.length && !state.composing) {
      const anywhere = allThreads().length;
      wrap.append(
        el(
          "div",
          { class: "review-empty" },
          icon("o:comment", 32),
          el(
            "p",
            {},
            prefs.scope === "deck" || !anywhere
              ? prefs.filter === "all"
                ? "暂无批注。"
                : "没有符合筛选条件的批注。"
              : "此幻灯片上没有批注。",
          ),
          !env.blocksEdits() &&
            el(
              "button",
              {
                type: "button",
                class: "btn secondary",
                onclick: () => newComment(),
              },
              icon("o:newComment", 16),
              el("span", {}, "新建批注"),
            ),
        ),
      );
    }
    return wrap;
  }

  // ---- Markers on the slide ----------------------------------------------

  function markerPoint(thread, i, slide, size) {
    let p = thread.pos;
    if (!p && thread.shapeId) {
      const shape = P.findShapeById(slide, Number(thread.shapeId));
      const b = shape && env.slideBounds(shape);
      if (b) p = { x: b.x + b.w, y: b.y };
    }
    if (!p) p = { x: size.cx * (0.02 + i * 0.035), y: size.cy * 0.03 };
    return {
      x: Math.max(0, Math.min(size.cx * 0.97, p.x)),
      y: Math.max(0, Math.min(size.cy * 0.95, p.y)),
    };
  }
  function renderMarkers() {
    const canvas = document.querySelector("#slide-canvas");
    if (!canvas) return;
    canvas.querySelectorAll(".comment-marker").forEach((n) => n.remove());
    if (!prefs.markup || !env.pres()) return;
    const s = env.slide();
    const part = P.getSlidePartName(s);
    const size = env.size();
    const list = threadsOf(s);
    const shown = list.filter(passes);
    shown.forEach((t, i) => {
      const at = markerPoint(t, i, s, size);
      const active = state.active?.part === part && state.active?.id === t.id;
      const marker = el(
        "button",
        {
          type: "button",
          class: `comment-marker ${active ? "active" : ""} ${t.status !== "active" ? "resolved" : ""}`,
          "data-thread-id": t.id,
          "aria-label": `来自 ${t.author.name || "未知用户"} 的批注: ${t.text.slice(0, 80)}${t.replies.length ? ` (${t.replies.length} 条回复)` : ""}。可拖动或使用方向键移动。`,
          style: `left:${(at.x / size.cx) * 100}%;top:${(at.y / size.cy) * 100}%;--hue:${personHue(t.author.name)}`,
        },
        el(
          "span",
          { class: "comment-marker-initials", "aria-hidden": "true" },
          t.author.initials || "?",
        ),
        t.replies.length > 0 &&
          el(
            "span",
            { class: "comment-marker-count", "aria-hidden": "true" },
            String(t.replies.length + 1),
          ),
      );
      attachDrag(marker, { part, thread: t, slide: s, at });
      canvas.append(marker);
    });
  }
  function movePos(entry, pos) {
    return writeSlide(entry.part, (list) =>
      list.map((t) => (t.id === entry.thread.id ? { ...t, pos } : t)),
    );
  }
  function attachDrag(marker, entry) {
    let suppress = false;
    marker.addEventListener("click", (e) => {
      e.stopPropagation();
      if (suppress) {
        suppress = false;
        return;
      }
      activate({ ...entry }, { focus: true, select: false });
    });
    marker.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (env.blocksEdits()) return;
      const canvas = marker.parentElement;
      const rect = canvas.getBoundingClientRect();
      const size = env.size();
      const box = marker.getBoundingClientRect();
      const grab = { x: e.clientX - box.left, y: e.clientY - box.top };
      const start = { x: e.clientX, y: e.clientY };
      let moved = false,
        pos = entry.at;
      marker.setPointerCapture?.(e.pointerId);
      const move = (ev) => {
        if (
          !moved &&
          Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4
        )
          return;
        moved = true;
        marker.classList.add("dragging");
        const x = Math.max(
          0,
          Math.min(rect.width, ev.clientX - rect.left - grab.x),
        );
        const y = Math.max(
          0,
          Math.min(rect.height, ev.clientY - rect.top - grab.y),
        );
        pos = { x: (x / rect.width) * size.cx, y: (y / rect.height) * size.cy };
        marker.style.left = `${(x / rect.width) * 100}%`;
        marker.style.top = `${(y / rect.height) * 100}%`;
      };
      const up = () => {
        marker.removeEventListener("pointermove", move);
        marker.removeEventListener("pointerup", up);
        marker.removeEventListener("pointercancel", up);
        marker.classList.remove("dragging");
        if (moved) {
          suppress = true;
          state.active = { part: entry.part, id: entry.thread.id };
          movePos(entry, pos);
        }
      };
      marker.addEventListener("pointermove", move);
      marker.addEventListener("pointerup", up);
      marker.addEventListener("pointercancel", up);
    });
    marker.addEventListener("keydown", (e) => {
      const d = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[e.key];
      if (!d || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (env.blocksEdits()) return env.blockedEdit();
      const size = env.size();
      const stepX = size.cx * (e.shiftKey ? 0.05 : 0.01);
      const stepY = size.cy * (e.shiftKey ? 0.05 : 0.01);
      entry.at = {
        x: Math.max(0, Math.min(size.cx * 0.97, entry.at.x + d[0] * stepX)),
        y: Math.max(0, Math.min(size.cy * 0.95, entry.at.y + d[1] * stepY)),
      };
      state.active = { part: entry.part, id: entry.thread.id };
      const id = entry.thread.id;
      movePos(entry, entry.at).then(() =>
        document
          .querySelector(`.comment-marker[data-thread-id="${CSS.escape(id)}"]`)
          ?.focus(),
      );
    });
  }

  // ---- Thumbnails and the status bar ---------------------------------------

  function decorateThumb(thumb, slide) {
    let count = 0;
    try {
      count = threadsOf(slide).filter((t) => t.status === "active").length;
    } catch {}
    let badge = thumb.querySelector(".slide-comment-badge");
    if (!count) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = el("span", {
        class: "slide-comment-badge",
        "aria-hidden": "true",
      });
      thumb.append(badge);
    }
    badge.replaceChildren(icon("o:comment", 12), String(count));
    const label = thumb.getAttribute("aria-label") || "";
    if (!/ 条批注$/.test(label))
      thumb.setAttribute(
        "aria-label",
        `${label}，${count} 条批注`,
      );
  }
  function syncStatus() {
    document
      .querySelector("#status-comments")
      ?.setAttribute("aria-pressed", String(host.isOpen("comments")));
  }

  function refreshAll() {
    host.refresh("comments");
    renderMarkers();
    syncStatus();
    env.syncToolbar();
  }

  return {
    newComment,
    deleteMenu,
    showMenu,
    step,
    renderMarkers,
    decorateThumb,
    syncStatus,
    invalidate,
    refresh: () => {
      host.refresh("comments");
      renderMarkers();
      syncStatus();
    },
    hasComments: () => allThreads().length > 0,
    canDelete: () => allThreads({ filtered: false }).length > 0,
    isOpen: () => host.isOpen("comments"),
    toggle: () => host.toggle("comments"),
    markup: () => prefs.markup,
    setMarkup,
    threadsOf,
  };
}

const MENU = { "aria-haspopup": "menu" };
