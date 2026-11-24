import { escape } from "../model.js";
import { busy } from "../accessibility/busy.js";
import { authoredTextHTML } from "../accessibility/object-content.js";
import {
  addTranslations,
  labelled,
  plural,
  t,
  language,
  nameOrder,
} from "../i18n.js";
import {
  boardFilters,
  organizationLink,
  readOrganizationLink,
} from "./client.js";

// A dialog's outcome: shown as an error or a success, not only in words.
const say = (out, text, kind = "") => {
  out.textContent = text;
  if (kind) out.dataset.kind = kind;
  else delete out.dataset.kind;
};
// The unread count shows as a number and is read out with its meaning.
// It counts the notifications listed, so at that many it may be more.
const unreadBadge = (count) =>
  count >= NOTIFICATIONS_SHOWN
    ? `<span aria-hidden="true">${NOTIFICATIONS_SHOWN - 1}+</span><span class="sr-only">${escape(t("More than {count} unread").replace("{count}", NOTIFICATIONS_SHOWN - 1))}</span>`
    : count
      ? `<span aria-hidden="true">${count}</span><span class="sr-only">${escape(plural(count, "{count} unread", "{count} unread"))}</span>`
      : "";
const when = (at) =>
  at
    ? new Date(at).toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
const fill = (text, values) =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, () => value),
    t(text),
  );
// A count with the language's digit grouping: 1,500, not 1500.
const figure = (n) =>
  new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA").format(n);
// Notifications carry their parts, so each person reads them in their own
// language. Older ones keep the English text they were saved with.
const assignmentSuffix = (n) =>
  `${n.due ? ` (${fill("due {date}", { date: when(Date.parse(`${n.due}T12:00:00`)) })})` : ""}${n.more > 0 ? ` ${fill(n.more === 1 ? "and 1 more" : "and {count} more", { count: n.more })}` : ""}`;
function notificationText(n) {
  const who = n.anonymous ? t("A participant") : n.actor?.username;
  if (n.type === "assignment" && typeof n.title === "string" && who)
    return labelled(
      who,
      `${n.titleGenerated === true || (n.titleGenerated === undefined && n.title === "Untitled task") ? t("Untitled task") : n.title}${assignmentSuffix(n)}`,
    );
  if (
    (n.type === "mention" || n.type === "reply") &&
    who &&
    typeof n.excerpt === "string"
  )
    return labelled(who, n.excerpt);
  if (n.type === "alert" && n.label) {
    const target = n.target
      ? language === "fr"
        ? ` « ${n.target} »`
        : ` “${n.target}”`
      : "";
    // Guests who joined a board together come as one alert with how many.
    if (n.count > 0) {
      const label = plural(
        n.count,
        "{count} more guest joined a board",
        "{count} more guests joined a board",
      );
      return target ? labelled(label, target.trim()) : label;
    }
    return labelled(t(n.label), `${n.who || t("Someone")}${target}`);
  }
  // Older alerts carried their time inside the text; it shows beside the
  // notification already.
  return (n.text || "").replace(/ \(\d{4}-\d\d-\d\dT[^)]*\)$/, "");
}
// A notification other servers send, as those of other people's shared
// boards, may carry text ranges this version cannot read; it is shown as
// plain text, or without its text, rather than failing the whole list.
function shownHTML(n) {
  try {
    return notificationHTML(n);
  } catch {
    try {
      return escape(notificationText(n));
    } catch {
      return "";
    }
  }
}
// A notification's time; one the server left out or garbled is not shown
// rather than failing the whole list.
function timeHTML(at) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return `<time datetime="${date.toISOString()}">${escape(date.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" }))}</time>`;
}
// Which board a notification is about, as two from different boards would
// otherwise read the same.
function boardHTML(n) {
  if (typeof n.boardTitle !== "string" || !n.boardTitle.trim()) return "";
  return `<span class="notification-board"><span class="sr-only">${escape(labelled(t("Board"), ""))}</span><span data-user-content>${escape(n.boardTitle)}</span></span>`;
}
function notificationHTML(n) {
  const who = n.anonymous ? t("A participant") : n.actor?.username;
  if (
    n.type === "assignment" &&
    who &&
    typeof n.title === "string" &&
    (n.titleGenerated !== undefined || n.titleLang || n.titleRuns?.length)
  )
    return (
      escape(labelled(who, "")) +
      (n.titleGenerated === true
        ? escape(t("Untitled task"))
        : authoredTextHTML({
            text: n.title,
            lang: n.titleLang,
            textRuns: n.titleRuns,
          })) +
      escape(assignmentSuffix(n))
    );
  if (
    (n.type === "mention" || n.type === "reply") &&
    who &&
    typeof n.excerpt === "string" &&
    (n.excerptLang || n.excerptRuns?.length)
  )
    return (
      escape(labelled(who, "")) +
      authoredTextHTML({
        text: n.excerpt,
        lang: n.excerptLang,
        textRuns: n.excerptRuns,
      })
    );
  return escape(notificationText(n));
}
// How many of the latest notifications the dialog lists and the badge counts,
// from each server asked.
const NOTIFICATIONS_SHOWN = 100;
// How many servers of shared boards are asked for notifications besides the
// organization's: those of the most recently used boards.
const SERVERS_ASKED = 10;
const ROLE_LABEL = {
  owner: "Owner",
  facilitator: "Facilitator",
  editor: "Can edit",
  commenter: "Can comment",
  viewer: "Can view",
};

// Servers' lists, each newest first, as one list newest first. Each list
// keeps its own order, and a notification without a usable time stays
// beside the one listed before it.
function newestFirst(lists) {
  const out = [],
    next = lists.map(() => 0),
    last = lists.map(() => Infinity);
  const at = (list) =>
    Number.isFinite(lists[list][next[list]].at)
      ? lists[list][next[list]].at
      : last[list];
  for (;;) {
    let pick = -1;
    for (let n = 0; n < lists.length; n++)
      if (next[n] < lists[n].length && (pick < 0 || at(n) > at(pick))) pick = n;
    if (pick < 0) return out;
    last[pick] = at(pick);
    out.push(lists[pick][next[pick]++]);
  }
}

// The organization's side of the board library: its boards with advanced
// filters and content search, notifications, joining, and email
// verification for domain capture.
export function createOrganizationHome({
  org,
  modal,
  toast,
  icon,
  refresh = () => {},
  openShared,
  // The servers of shared boards in the library, most recently used first,
  // and a request to one of them.
  sharedServers = () => [],
  request = async () => {
    throw Error("Could not reach the shared board.");
  },
  signedIn = () => true,
  admin,
  library,
  rerender = () => {},
  // Signs in first, from the click, so the Puter popup is not blocked.
  connect = async () => {},
}) {
  // Archived boards stay hidden until someone asks for them.
  let filters = { scope: "mine", sort: "updated", archived: false },
    spaces = [],
    teams = [],
    listsFor = null,
    listsAt = 0;
  // A board being opened from a card or a notification is opened once,
  // however often it is pressed, until it has opened or failed to.
  let opening = false;
  const openOnce = (...args) => {
    if (opening) return;
    opening = true;
    return openShared(...args)
      .catch((error) => toast(error.message))
      .finally(() => (opening = false));
  };
  // Another organization brings its own spaces, teams, and filters.
  let current = org.server;
  org.onChange?.(() => {
    if (org.server === current) return;
    current = org.server;
    counts.clear();
    countedAt = 0;
    filters = { scope: "mine", sort: "updated", archived: false };
    spaces = [];
    teams = [];
    listsFor = null;
  });
  // A mention, reply or assignment is kept by the server hosting the board
  // it is about, which tells anyone signed in about their own: the
  // organization's, and those of boards shared from other people's workers,
  // as with guests and people invited to someone's board. Each is asked at
  // once, and one that fails leaves the others shown.
  const counts = new Map();
  let countedAt = 0;
  function sources() {
    if (!signedIn()) return [];
    const list = org.info
      ? [{ server: org.server, ask: (op, data) => org.request(op, data) }]
      : [];
    const servers = new Set(sharedServers());
    if (org.info) servers.delete(org.server);
    for (const server of [...servers].slice(0, SERVERS_ASKED))
      list.push({ server, ask: (op, data) => request(server, op, data) });
    return list;
  }
  async function gather(asked = sources()) {
    const results = await Promise.allSettled(
      asked.map((source) =>
        source.ask("notifications.list", { limit: NOTIFICATIONS_SHOWN }),
      ),
    );
    const lists = [],
      loaded = [];
    let error = null;
    results.forEach((result, n) => {
      const { server } = asked[n];
      if (result.status === "rejected") {
        error ||= result.reason;
        return;
      }
      const listed = Array.isArray(result.value?.items)
        ? result.value.items.filter(
            (n) => n && typeof n === "object" && !Array.isArray(n),
          )
        : [];
      // Numbers from another server are shown as numbers only.
      counts.set(server, Math.max(0, Number(result.value?.unread) || 0));
      loaded.push({ ...asked[n], listed: listed.length });
      lists.push(listed.map((n) => ({ ...n, server })));
    });
    return {
      items: newestFirst(lists),
      loaded,
      error,
      failed: loaded.length < asked.length,
    };
  }
  // The count shown in the library sidebar last bound.
  let badge = null;
  function showBadge() {
    if (!badge?.isConnected) return;
    const unread = unreadCount();
    badge.innerHTML = unreadBadge(unread);
    badge.hidden = !unread;
  }
  const unreadCount = () =>
    sources().reduce((sum, { server }) => sum + (counts.get(server) || 0), 0);
  // The library asks again at most once a minute, as it is shown often and
  // each server's list is a listing from its quota; a change made here, or
  // opening the list, asks at once.
  async function loadNotifications({ force = false, only } = {}) {
    const asked = sources().filter((s) => !only || s.server === only);
    if (!asked.length) return;
    if (!force && !only && Date.now() - countedAt < 60_000) return showBadge();
    if (!only) countedAt = Date.now();
    // Notifications are optional; the library still works without them.
    await gather(asked);
    showBadge();
  }
  const notificationsButton = () => {
    const unread = unreadCount();
    return `<button class="nav-item" data-org-action="notifications">${icon("bell")}Notifications <span id="org-unread" class="nav-badge" ${unread ? "" : "hidden"}>${unreadBadge(unread)}</span></button>`;
  };
  // Spaces and teams are member data; guests go without. The lists are
  // reused for a minute, so filtering does not ask for them each time, and
  // a failed load is tried again.
  // One request for both lists at a time, which the sidebar and the boards
  // asking together share.
  let loadingLists = null;
  function loadLists() {
    if (
      !org.isMember ||
      (listsFor === org.server && Date.now() - listsAt <= 60_000)
    )
      return Promise.resolve();
    if (loadingLists?.server === org.server) return loadingLists.done;
    const server = org.server;
    const done = Promise.all([
      org
        .request("spaces.list")
        .then((r) => r.spaces)
        .catch(() => null),
      org
        .request("teams.list")
        .then((r) => r.teams)
        .catch(() => null),
    ]).then(([spaceList, teamList]) => {
      if (loadingLists?.done === done) loadingLists = null;
      if (server !== org.server) return;
      spaces = spaceList || spaces;
      teams = teamList || teams;
      if (spaceList && teamList) {
        listsFor = server;
        listsAt = Date.now();
      }
    });
    loadingLists = { server, done };
    return done;
  }
  // The organization's spaces in the sidebar, under its boards, each
  // opening the boards filed in it; the one shown is marked.
  let sidebarSpaces = null,
    // Whether the organization's boards are on screen, and whether their
    // space was chosen in the sidebar.
    boardsShown = false,
    spaceFromSidebar = false,
    choosingSpace = false,
    // The space chosen with the keyboard, which keeps it once its boards show.
    focusSpace = null;
  function showSpaces() {
    if (!sidebarSpaces?.isConnected) return;
    const order = nameOrder(),
      shown = boardsShown && filters.space;
    const html = [...(listsFor === org.server ? spaces : [])]
      .sort((a, b) => order(a.name, b.name))
      .map(
        (s) =>
          `<button class="nav-item nav-space" data-org-space="${escape(s.id)}"${shown === s.id ? ' aria-current="page"' : ""}>${icon("folder")}<span class="nav-name" data-user-content>${escape(s.name)}</span></button>`,
      )
      .join("");
    // Drawn again only when it changes, keeping the keyboard where it was.
    if (sidebarSpaces.dataset.drawn !== html) {
      const focused = sidebarSpaces.contains(document.activeElement)
        ? document.activeElement.dataset.orgSpace
        : null;
      sidebarSpaces.innerHTML = html;
      sidebarSpaces.dataset.drawn = html;
      sidebarSpaces.hidden = !sidebarSpaces.children.length;
      sidebarSpaces.querySelectorAll("[data-org-space]").forEach((el) => {
        el.onclick = () => {
          filters = {
            scope: "organization",
            sort: "updated",
            archived: false,
            space: el.dataset.orgSpace,
          };
          spaceFromSidebar = true;
          focusSpace = el.dataset.orgSpace;
          choosingSpace = true;
          try {
            document.querySelector('[data-filter="organization"]')?.click();
          } finally {
            choosingSpace = false;
          }
        };
      });
      refresh();
      if (focused)
        [...sidebarSpaces.children]
          .find((b) => b.dataset.orgSpace === focused)
          ?.focus();
    }
    if (boardsShown) {
      // One page is current: the space shown, within the organization's
      // boards, or else those boards.
      document
        .querySelector('[data-filter="organization"]')
        ?.setAttribute(
          "aria-current",
          sidebarSpaces.querySelector('[aria-current="page"]')
            ? "true"
            : "page",
        );
      const from = document.activeElement;
      if (
        from === document.body ||
        from?.matches('[data-filter="organization"]')
      )
        api.chosenSpace()?.focus();
    }
  }
  const api = {
    // Spaces or teams changed elsewhere, as in Organization settings: the
    // lists are asked for again, and the sidebar follows.
    forgetLists() {
      listsAt = 0;
      loadLists().then(showSpaces);
    },
    // The space just chosen in the sidebar, for the keyboard to go back to
    // once the library is drawn again; asked once.
    chosenSpace() {
      const id = focusSpace;
      focusSpace = null;
      return id && sidebarSpaces?.isConnected
        ? [...sidebarSpaces.children].find((b) => b.dataset.orgSpace === id)
        : null;
    },
    // Without an organization, Notifications sits with the board library for
    // anyone signed in with shared boards to hear about.
    notificationsItem() {
      return !org.info && sources().length ? notificationsButton() : "";
    },
    // Sidebar markup: the organization's views, or ways to get started.
    sidebar() {
      const info = org.info;
      if (!info)
        return `<div class="workspace-label org-start">Organization</div><nav class="org-start" aria-label="Organization"><button class="nav-item" data-org-action="join">${icon("building-2")}Join an organization</button><button class="nav-item" data-org-action="setup">${icon("plus")}Set up an organization</button></nav>`;
      return `<div class="workspace-label" data-user-content>${escape(info.name || t("Organization"))}</div><nav aria-label="Organization"><button class="nav-item" data-filter="organization">${icon("building-2")}Organization boards</button>${org.isMember ? `<div class="org-spaces" id="org-spaces" role="group" aria-label="${t("Spaces")}" hidden></div>` : ""}${notificationsButton()}${library && org.isMember ? `<button class="nav-item" data-org-action="library">${icon("library")}Organization library</button>` : ""}${!info.user?.emailVerified ? `<button class="nav-item" data-org-action="verify">${icon("mail-check")}Verify your email</button>` : info.role === "guest" && info.policy?.domainCapture ? `<button class="nav-item" data-org-action="verify">${icon("mail-check")}Verify a work email</button>` : ""}${org.isAdmin ? `<button class="nav-item" data-org-action="admin">${icon("settings")}Organization settings</button>` : ""}</nav>`;
    },
    bind(root = document) {
      root.querySelectorAll("[data-org-action]").forEach((el) => {
        el.onclick = () => {
          const action = el.dataset.orgAction;
          if (action === "join") api.joinDialog();
          if (action === "setup") api.setupDialog();
          if (action === "notifications") api.notifications();
          if (action === "verify") api.verifyDialog();
          if (action === "admin") admin?.open();
          if (action === "library") library?.();
        };
      });
      badge = root.querySelector("#org-unread");
      loadNotifications();
      // Organization boards from the sidebar are all of them again, not
      // the space last chosen there.
      root
        .querySelector('[data-filter="organization"]')
        ?.addEventListener("click", () => {
          if (choosingSpace || !spaceFromSidebar) return;
          spaceFromSidebar = false;
          filters = { ...filters, space: undefined };
        });
      // The library is drawn anew; the boards say when they are shown.
      boardsShown = false;
      sidebarSpaces = root.querySelector("#org-spaces");
      showSpaces();
      loadLists().then(showSpaces);
    },
    async renderBoards(grid) {
      if (!org.info) {
        grid.innerHTML = `<div class="empty-state">${icon("building-2")}<h3>${t("Join your organization")}</h3><p>${t("Open the organization link from your administrator, or verify your work email.")}</p></div>`;
        return;
      }
      const member = org.isMember;
      await loadLists();
      boardsShown = grid.isConnected;
      showSpaces();
      grid.classList.add("org-board-grid");
      const option = (value, label, selected, named = false) =>
        `<option value="${value}" ${selected ? "selected" : ""}${named ? " data-user-content" : ""}>${label}</option>`;
      // Spaces and teams are listed by name, as in the admin console.
      const order = nameOrder();
      const [spaceChoices, teamChoices] = [spaces, teams].map((list) =>
        [...list].sort((a, b) => order(a.name, b.name)),
      );
      // Filters beyond the search stay folded away until someone uses them.
      const refined = [
        filters.space,
        filters.team,
        filters.activity,
        filters.type,
        filters.updatedAfter,
        filters.archived !== false,
        (filters.sort || "updated") !== "updated",
      ].filter(Boolean).length;
      // Text being typed in the search while the lists loaded stays, caret
      // and all, rather than going back to the search that was sent; with
      // the keyboard elsewhere, as on Clear filters, the field shows the
      // search the boards are listed for.
      const field = grid.querySelector("#of-query"),
        typing = field && document.activeElement === field ? field : null,
        typed =
          typing && typing.value !== (filters.query || "")
            ? typing.value
            : null,
        caret = typing ? [typing.selectionStart, typing.selectionEnd] : null;
      grid.innerHTML = `<form class="org-filters" id="org-filters" role="search" aria-label="${t("Search organization boards")}"><div class="org-filter-main"><label class="field org-query">${t("Search names and content")}<span class="org-search-box">${icon("search")}<input id="of-query" type="search" value="${escape(filters.query || "")}"></span></label><label class="field org-scope">${t("Show")}<select id="of-scope">${option("mine", t("Boards shared with me"), filters.scope === "mine")}${option("organization", t("All organization boards I can open"), filters.scope === "organization")}</select></label><button class="primary">${icon("search")}${t("Search")}</button></div><details class="org-more" ${refined ? "open" : ""}><summary>${icon("sliders-horizontal")}${t("More filters")}${refined ? `<span class="badge">${refined}</span>` : ""}</summary><div class="org-filter-grid">${member ? `<label class="field">${t("Space")}<select id="of-space"><option value="">${t("Any", "space")}</option>${spaceChoices.map((s) => option(escape(s.id), escape(s.name), filters.space === s.id, true)).join("")}</select></label><label class="field">${t("Team")}<select id="of-team"><option value="">${t("Any")}</option>${teamChoices.map((tm) => option(escape(tm.id), escape(tm.name), filters.team === tm.id, true)).join("")}</select></label>` : ""}<label class="field">${t("Activity")}<select id="of-activity"><option value="">${t("Any")}</option>${option("active", t("Active in 30 days"), filters.activity === "active")}${option("stale", t("No activity in 90 days"), filters.activity === "stale")}${option("unused", t("Empty boards"), filters.activity === "unused")}</select></label><label class="field">${t("Contains")}<select id="of-type"><option value="">${t("Anything")}</option>${[
        ["note", "Sticky notes"],
        ["table", "Tables"],
        ["image", "Images"],
        ["file", "Files"],
        ["frame", "Frames"],
        ["link", "Links"],
      ]
        .map(([v, l]) => option(v, t(l), filters.type === v))
        .join(
          "",
        )}</select></label><label class="field">${t("Updated after")}<input type="date" min="0100-01-01" max="9999-12-31" id="of-after" value="${escape(filters.updatedAfter || "")}"></label><label class="field">${t("Archived", "boards")}<select id="of-archived"><option value="">${t("Hide")}</option>${option("include", t("Include", "archived"), filters.archived === undefined)}${option("only", t("Only archived"), filters.archived === true)}</select></label><label class="field">${t("Sort")}<select id="of-sort">${[
        ["updated", "Last activity"],
        ["created", "Created"],
        ["title", "Name"],
      ]
        .map(([v, l]) => option(v, t(l), (filters.sort || "updated") === v))
        .join(
          "",
        )}</select></label></div>${refined ? `<button type="button" class="text-btn org-clear" id="of-clear">${icon("x")}${t("Clear filters")}</button>` : ""}</details></form><div class="org-results-bar"><p id="org-count" class="org-count" role="status"></p>${member ? `<button type="button" class="secondary" id="of-space-new">${icon("folder-plus")}${t("New space")}</button>` : ""}</div><div id="org-results" class="board-grid"><p class="org-status">${t("Loading…")}</p></div>`;
      const form = grid.querySelector("#org-filters"),
        queryField = form.querySelector("#of-query");
      if (typed !== null) queryField.value = typed;
      if (caret) {
        queryField.focus();
        queryField.setSelectionRange(...caret);
      }
      // Rendering replaces the filters, so the keyboard goes back to the
      // same control once it exists again, unless focus has moved on.
      const refocus = (selector) => {
        const restore = () => {
          if (document.activeElement === document.body)
            grid.querySelector(selector)?.focus();
        };
        const done = api.renderBoards(grid);
        restore();
        return done.then(restore);
      };
      form.onsubmit = (e) => {
        e.preventDefault();
        const from = document.activeElement;
        filters = {
          scope: form.querySelector("#of-scope").value,
          query: form.querySelector("#of-query").value.trim() || undefined,
          content: !!form.querySelector("#of-query").value.trim(),
          space: form.querySelector("#of-space")?.value || undefined,
          team: form.querySelector("#of-team")?.value || undefined,
          activity: form.querySelector("#of-activity").value || undefined,
          type: form.querySelector("#of-type").value || undefined,
          updatedAfter: form.querySelector("#of-after").value || undefined,
          // Archived boards are left out, included, or the only ones.
          archived: {
            "": false,
            include: undefined,
            only: true,
          }[form.querySelector("#of-archived").value],
          sort: form.querySelector("#of-sort").value,
        };
        refocus(
          from?.id && form.contains(from)
            ? `#${from.id}`
            : "#org-filters .org-filter-main .primary",
        );
      };
      const clear = form.querySelector("#of-clear");
      if (clear)
        clear.onclick = () => {
          filters = {
            scope: filters.scope,
            query: filters.query,
            content: filters.content,
            sort: "updated",
            archived: false,
          };
          refocus(".org-more summary");
        };
      const newSpace = grid.querySelector("#of-space-new");
      if (newSpace)
        newSpace.onclick = () =>
          modal(
            "New space",
            `<form><label class="field">${t("Space name")}<input id="space-name" required maxlength="80"></label><p id="space-error" class="dialog-copy" role="alert" hidden></p><div class="dialog-footer"><button class="primary">${t("Create space")}</button></div></form>`,
            (d) => {
              d.querySelector("form").onsubmit = async (e) => {
                e.preventDefault();
                // One space per press: a double click must not create two.
                const button = d.querySelector(".primary"),
                  failure = d.querySelector("#space-error");
                if (button.disabled) return;
                failure.hidden = true;
                const done = busy(button);
                try {
                  const { space } = await org.request("spaces.create", {
                    name: d.querySelector("#space-name").value,
                  });
                  spaces = [...spaces, space];
                  d.close();
                  refocus("#of-space-new");
                } catch (error) {
                  // The form stays open, so its explanation stays with it.
                  failure.textContent = t(error.message);
                  failure.hidden = false;
                } finally {
                  done();
                }
              };
            },
          );
      const results = grid.querySelector("#org-results"),
        count = grid.querySelector("#org-count"),
        spaceName = new Map(spaces.map((s) => [s.id, s.name]));
      const card = (b, n) => {
        const role = t(
          ROLE_LABEL[b.role] ||
            (b.visibility === "organization"
              ? "Open to the organization"
              : b.teamRole && b.teamRole !== "none"
                ? "Open to its team"
                : ""),
        );
        // The name is the title alone; the owner, activity, role, and
        // archived state are read as the description.
        return `<article class="board-card org-card"><button class="board-open" data-org-open="${escape(b.room)}" aria-label="${escape(t("Open", "action") + " " + b.title)}" aria-describedby="org-card-${n}-meta org-card-${n}-role${b.snippet ? ` org-card-${n}-found` : ""}"><div class="board-preview org-preview"><span class="org-preview-icon">${icon(b.visibility === "organization" ? "building-2" : b.visibility === "link" ? "link" : "users")}</span><span>${plural(Number(b.objectCount) || 0, "{count} object", "{count} objects")}</span></div><div class="board-info"><h3 data-user-content title="${escape(b.title)}">${escape(b.title)}</h3><p class="org-meta" id="org-card-${n}-meta"><span data-user-content>${escape(b.ownerName || "")}</span> · ${when(b.lastActivity || b.created)}${spaceName.get(b.space) ? ` · <span data-user-content>${escape(spaceName.get(b.space))}</span>` : ""}</p>${b.snippet ? `<p class="card-found" id="org-card-${n}-found"><span data-user-content>${escape(b.snippet.before)}<mark>${escape(b.snippet.hit)}</mark>${escape(b.snippet.after)}</span></p>` : ""}<p class="card-role" id="org-card-${n}-role">${role ? `<span class="badge">${role}</span>` : ""}${b.archived ? `<span class="badge badge-archived">${icon("archive")}${t("Archived")}</span>` : ""}</p></div></button></article>`;
      };
      // A page of the matching boards. "Show more boards" adds the next
      // page after them, as in the admin console, so an organization's
      // whole directory can be browsed, not only its first 200 boards. The
      // next page follows the last board shown (`after`), so boards edited
      // meanwhile do not shift the rest into it; a board listed already
      // stays listed once.
      const listed = new Set(),
        shownBoards = [];
      const load = async (offset = 0, after) => {
        const page = await org.request("org.boards", {
          ...boardFilters(filters),
          ...(after ? { after } : offset ? { offset } : {}),
        });
        // A newer search, or leaving this view, replaced these results.
        if (!results.isConnected) return false;
        const adding = !!(offset || after);
        if (!adding) {
          listed.clear();
          shownBoards.length = 0;
        }
        const before = listed.size;
        const boards = page.boards.filter((b) => !listed.has(b.room));
        for (const b of boards) listed.add(b.room);
        const shown = listed.size;
        const total = page.total ?? shown;
        // The count is the live region, so each search announces how many
        // boards matched rather than reading out every card.
        count.textContent =
          total > shown
            ? fill("Showing {shown} of {total} boards.", {
                shown: figure(shown),
                total: figure(total),
              })
            : shown
              ? `${figure(shown)} ${t(shown === 1 ? "board" : "boards")}`
              : t("No boards found");
        count.classList.toggle("sr-only", !shown);
        const cards = boards.map((b, n) => card(b, before + n)).join("");
        shownBoards.push(...boards);
        if (adding) results.insertAdjacentHTML("beforeend", cards);
        else
          results.innerHTML =
            cards ||
            `<div class="empty-state">${icon("search")}<h3>${t("No boards found")}</h3><p>${t("Try other filters, or search all organization boards.")}</p></div>`;
        results.querySelectorAll("[data-org-open]").forEach((el, n) => {
          // A board found by what it holds opens with Find on board on the
          // word its card shows, which an object there holds; other words
          // may be in other objects, or in its owner's or space's name.
          const b = shownBoards[n],
            query = b?.snippet?.hit || "";
          el.onclick = () =>
            openOnce(org.server, el.dataset.orgOpen, query ? { query } : {});
        });
        let more = grid.querySelector("#org-more");
        if (total > shown && page.boards.length && page.next !== null) {
          if (!more) {
            more = document.createElement("button");
            more.type = "button";
            more.className = "secondary org-more";
            more.id = "org-more";
            more.textContent = t("Show more boards");
            results.after(more);
          }
          more.onclick = async () => {
            if (more.disabled) return;
            const done = busy(more);
            try {
              if (await load(offset + page.boards.length, page.next))
                results
                  .querySelectorAll(".board-open")
                  [shown]?.focus({ preventScroll: false });
            } catch (error) {
              toast(error.message);
            } finally {
              done();
            }
          };
        } else more?.remove();
        refresh();
        return true;
      };
      try {
        await load();
      } catch (error) {
        if (!results.isConnected) return;
        results.innerHTML = `<p class="org-status" role="alert">${escape(error.message)}</p>`;
      }
      refresh();
    },
    async notifications() {
      modal(
        "Notifications",
        // Email is an organization setting, offered only within one.
        `<div class="notification-tools">${org.info ? `<label class="check-field"><input type="checkbox" id="notify-email" ${org.info.user?.prefs?.emailNotifications === false ? "" : "checked"} ${org.info.user?.emailVerified ? "" : "disabled"}><span>${t("Email me about mentions, replies, and tasks assigned to me")}${org.info.user?.emailVerified ? "" : `<small>${t("Verify your email to receive notifications by email.")}</small>`}</span></label>` : ""}<button class="secondary" id="notify-read">${t("Mark all as read")}</button></div><p id="notify-error" class="dialog-copy" role="alert" hidden></p><p id="notification-count" class="sr-only" role="status"></p><ul id="notification-list" class="notification-list"><li>${t("Loading…")}</li></ul>`,
        async (d) => {
          const list = d.querySelector("#notification-list");
          // A failed change stays explained until the next one, rather than
          // in a notification that fades.
          const report = (message) => {
            const out = d.querySelector("#notify-error");
            out.textContent = message ? t(message) : "";
            out.hidden = !message;
          };
          let loaded = [];
          const load = async () => {
            const asked = sources();
            const result = await gather(asked);
            if (asked.length && !result.loaded.length) throw result.error;
            const { items } = result;
            loaded = result.loaded;
            countedAt = Date.now();
            showBadge();
            // Some servers not answering leaves what the others said, and
            // an error from a change made meanwhile stays.
            const partial = "Some notifications could not be loaded.";
            if (result.failed) report(partial);
            else if (
              d.querySelector("#notify-error").textContent === t(partial)
            )
              report("");
            list.innerHTML =
              items
                .map(
                  // Only a notification about a board opens something, so only it is a
                  // button; the others are read as text, not as unavailable controls.
                  (n) => {
                    const tag = n.board ? "button" : "div";
                    return `<li class="${n.read ? "" : "unread"}"><${tag} class="notification" data-note="${escape(n.id)}">${n.read ? "" : `<span class="sr-only">${t("Unread")}</span>`}<span class="notification-kind">${t({ mention: "Mention", reply: "Reply", alert: "Security alert", assignment: "Assignment" }[n.type] || "Update", "notification")}</span><span data-user-content>${shownHTML(n)}</span>${boardHTML(n)}${timeHTML(n.at)}</${tag}></li>`;
                  },
                )
                .join("") || `<li>${t("You're all caught up.")}</li>`;
            // The count is the live region, so loading the list or marking
            // it read announces how many there are, not every one.
            d.querySelector("#notification-count").textContent = items.length
              ? `${items.length} ${t(items.length === 1 ? "notification" : "notifications")}`
              : t("You're all caught up.");
            // Rows follow the list, so two servers' notifications sharing an
            // id each open their own board.
            list.querySelectorAll("[data-note]").forEach((el, n) => {
              if (el.tagName !== "BUTTON") return;
              const note = items[n];
              el.onclick = async () => {
                if (opening) return;
                opening = true;
                const source = asked.find((s) => s.server === note.server);
                await source
                  ?.ask("notifications.read", { ids: [note.id] })
                  .catch(() => {});
                loadNotifications({ only: note.server });
                d.close();
                opening = false;
                // An assignment goes to its task, a comment to its thread,
                // on the server that told of it.
                if (note.board)
                  openOnce(note.server, note.board, {
                    thread: note.thread,
                    objectId: note.thread ? undefined : note.item,
                  });
              };
            });
            refresh();
          };
          const markRead = d.querySelector("#notify-read");
          markRead.onclick = async () => {
            report("");
            const done = busy(markRead);
            try {
              // Each server listing any is asked. A worker marks a bounded
              // number per request and says when more are left.
              const marked = await Promise.allSettled(
                loaded
                  .filter((source) => source.listed)
                  .map(async (source) => {
                    for (let n = 0; n < 100; n++) {
                      const result = await source.ask("notifications.read", {
                        all: true,
                      });
                      if (!result?.more) break;
                    }
                  }),
              );
              await load();
              const failed = marked.find((r) => r.status === "rejected");
              if (failed) throw failed.reason;
            } catch (error) {
              report(error.message || "Could not update notifications.");
            } finally {
              done();
            }
          };
          const email = d.querySelector("#notify-email");
          if (email)
            email.onchange = async (e) => {
              const box = e.target;
              report("");
              try {
                await org.request("prefs.set", {
                  emailNotifications: box.checked,
                });
              } catch (error) {
                // The box keeps showing what is saved.
                box.checked = !box.checked;
                report(error.message);
                return;
              }
              await org.refresh().catch((error) => toast(error.message));
            };
          try {
            await load();
          } catch (error) {
            list.innerHTML = `<li role="alert">${escape(error.message)}</li>`;
          }
        },
      );
    },
    joinDialog(link = "") {
      const parsed = link ? readOrganizationLink(link) : null;
      modal(
        "Join an organization",
        `<form id="org-join"><label class="field">${t("Organization link")}<input id="org-link" type="url" required value="${escape(link)}" placeholder="https://…#org=…"></label><p class="dialog-copy">${t("Sign in with Puter. If your organization uses domain capture, you can join by verifying your work email instead of an invitation.")}</p><p id="org-join-status" class="dialog-status" role="status"></p><div class="dialog-footer"><button type="button" class="secondary" id="org-join-setup">${t("Set up an organization")}</button><button class="primary">${t("Join organization")}</button></div></form>`,
        (d) => {
          d.querySelector("#org-join-setup").onclick = () => {
            d.close();
            api.setupDialog();
          };
          d.querySelector("#org-join").onsubmit = async (e) => {
            e.preventDefault();
            const button = d.querySelector(".primary"),
              out = d.querySelector("#org-join-status");
            const done = busy(button);
            try {
              await connect();
              const target = readOrganizationLink(
                d.querySelector("#org-link").value,
              );
              if (!target)
                throw Error(
                  t("Paste the organization link your administrator sent you."),
                );
              // Links can come from anyone, so the organization's name and
              // address are shown, with any organization it replaces,
              // before switching.
              if (button.dataset.confirm !== target.server) {
                const { server, info } = await org.preview(target.server);
                const host = new URL(server).host;
                const replaces =
                  org.server && org.server !== server
                    ? ` ${fill("This replaces {name} as your organization.", { name: org.info?.name || new URL(org.server).host })}`
                    : "";
                say(
                  out,
                  `${fill("Join {name} at {host}?", { name: info?.name || t("this organization"), host })}${replaces}`,
                );
                button.dataset.confirm = target.server;
                button.textContent = t("Confirm and join");
                return;
              }
              const previous = { server: org.server, info: org.info };
              await org.use(target.server);
              if (org.isMember && !target.token) {
                d.close();
                toast("You're in the organization.");
                rerender();
                return;
              }
              try {
                await org.join(target.token);
                d.close();
                toast("Welcome to the organization.");
                rerender();
              } catch (error) {
                // A refused invitation keeps the organization in use before;
                // without one, the new organization may admit a verified
                // email, so it stays in use for that.
                if (error.status !== 403 || target.token) {
                  if (previous.server !== org.server)
                    await org.restore(previous);
                  throw error;
                }
                d.close();
                api.verifyDialog(error.message);
              }
            } catch (error) {
              say(out, t(error.message), "error");
            } finally {
              done();
            }
          };
          // A different link needs its own confirmation.
          d.querySelector("#org-link").addEventListener("input", () => {
            const button = d.querySelector("#org-join .primary");
            delete button.dataset.confirm;
            button.textContent = t("Join organization");
            d.querySelector("#org-join-status").textContent = "";
          });
          if (parsed?.token || parsed)
            d.querySelector("#org-join .primary").focus();
        },
      );
    },
    verifyDialog(reason = "") {
      modal(
        "Verify your email",
        `<form id="verify-start">${reason ? `<p class="dialog-copy">${escape(t(reason))}</p>` : ""}<label class="field">${t("Work email")}<input id="verify-email" type="email" required autocomplete="email" value="${escape(org.info?.user?.email || "")}"></label><div class="dialog-footer"><button class="primary">${t("Send code")}</button></div></form><form id="verify-code" hidden><label class="field">${t("Six-digit code")}<input id="verify-value" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code"></label><div class="dialog-footer"><button class="primary">${t("Verify")}</button></div></form><p id="verify-status" class="dialog-status" role="status"></p><p id="verify-error" class="dialog-status" data-kind="error" role="alert" hidden></p>`,
        (d) => {
          const out = d.querySelector("#verify-status"),
            failure = d.querySelector("#verify-error");
          // The dialog stays open, so a refusal stays in it, on the field
          // it concerns, until the next attempt.
          const refuse = (field, error) => {
            say(out, "");
            failure.textContent = t(error.message);
            failure.hidden = false;
            field.setAttribute("aria-invalid", "true");
            field.setAttribute("aria-describedby", "verify-error");
          };
          const clear = () => {
            failure.hidden = true;
            failure.textContent = "";
            for (const field of d.querySelectorAll("[aria-invalid]")) {
              field.removeAttribute("aria-invalid");
              field.removeAttribute("aria-describedby");
            }
          };
          d.querySelector("#verify-start").onsubmit = async (e) => {
            e.preventDefault();
            clear();
            const done = busy(e.submitter);
            try {
              await org.request("email.start", {
                email: d.querySelector("#verify-email").value,
              });
              d.querySelector("#verify-code").hidden = false;
              d.querySelector("#verify-value").focus();
              say(
                out,
                t("We sent a code. It expires in 15 minutes."),
                "success",
              );
            } catch (error) {
              refuse(d.querySelector("#verify-email"), error);
            } finally {
              done();
            }
          };
          let confirming = false;
          d.querySelector("#verify-code").onsubmit = async (e) => {
            e.preventDefault();
            // A code is used once; a double submit must not send it twice.
            if (confirming) return;
            confirming = true;
            clear();
            const done = busy(e.currentTarget.querySelector("button"));
            try {
              const result = await org.request("email.confirm", {
                code: d.querySelector("#verify-value").value,
              });
              await org.refresh();
              d.close();
              toast(
                result.info?.role && result.info.role !== "guest"
                  ? "Email verified. You're in the organization."
                  : "Email verified.",
              );
              rerender();
            } catch (error) {
              refuse(d.querySelector("#verify-value"), error);
            } finally {
              confirming = false;
              done();
            }
          };
        },
      );
    },
    setupDialog() {
      modal(
        "Set up an organization",
        `<form id="org-setup"><p class="dialog-copy">${t("Your Puter account becomes the organization's account owner. Organization boards, audit logs, and settings are stored in this account.")}</p><label class="field">${t("Organization name")}<input id="setup-name" required maxlength="120"></label><label class="field">${t("Email domains (optional)")}<input id="setup-domains"></label><p id="setup-status" class="dialog-status" role="status"></p><div class="dialog-footer"><button class="primary">${t("Create organization")}</button></div></form>`,
        (d) => {
          d.querySelector("#org-setup").onsubmit = async (e) => {
            e.preventDefault();
            const out = d.querySelector("#setup-status"),
              button = d.querySelector(".primary");
            const done = busy(button);
            try {
              await connect();
              await org.setup(
                d.querySelector("#setup-name").value,
                d
                  .querySelector("#setup-domains")
                  .value.split(/[\s,;]+/)
                  .filter(Boolean),
                (message) => say(out, t(message)),
              );
              d.close();
              modal(
                "Organization ready",
                `<p class="dialog-copy">${t("Share this link so people can join. You can create invitations and turn on domain capture in Organization settings.")}</p><label class="field">${t("Organization link")}<input readonly value="${escape(organizationLink(org.server))}"></label>`,
              );
              rerender();
            } catch (error) {
              say(out, t(error.message), "error");
            } finally {
              done();
            }
          };
        },
      );
    },
    // Whether there is anywhere to hear from, as for offering Notifications
    // while a board is open.
    available: () => sources().length > 0,
    // The library's count, asked again when it is shown after a while away;
    // a minute after the last time at the soonest.
    refreshBadge: () => loadNotifications(),
  };
  return api;
}

addTranslations({
  Spaces: "空间",
  "due {date}": "截止日期 {date}",
  Unread: "未读",
  "one|{count} unread": "{count} 条未读",
  "{count} unread": "{count} 条未读",
  "More than {count} unread": "超过 {count} 条未读",
  "and 1 more": "以及另外 1 个",
  "and {count} more": "以及另外 {count} 个",
  Someone: "某人",
  "A participant": "参与者",
  "Anyone with a board’s link was given more access":
    "拥有白板链接的任何人均已获得更多访问权限",
  "A board was opened to anyone with the link":
    "白板已向任何拥有链接的用户开放",
  "A guest joined a board": "访客已加入白板",
  "one|{count} more guest joined a board": "还有 {count} 位访客加入了白板",
  "{count} more guests joined a board":
    "还有 {count} 位访客加入了白板",
  "Board permissions changed": "白板权限已更改",
  "A board was given a new owner": "白板已指定新所有者",
  "An organization role changed": "组织角色已更改",
  "An API key was created": "已创建 API 密钥",
  "Organization policy changed": "组织策略已更改",
  "Join an organization": "加入组织",
  "Set up an organization": "建立组织",
  "Organization boards": "组织白板",
  Notifications: "通知",
  "Organization library": "组织资料库",
  "Showing {shown} of {total} boards.":
    "显示 {total} 个白板中的 {shown} 个。",
  "Show more boards": "显示更多白板",
  "Some notifications could not be loaded.":
    "部分通知未能成功加载。",
  "Could not update notifications.":
    "无法更新通知。",
  "Verify your email": "验证您的邮箱",
  "Verify a work email": "验证工作邮箱",
  "Join your organization": "加入您的组织",
  "Open the organization link from your administrator, or verify your work email.": "打开管理员提供的组织链接，或验证您的工作邮箱。",
  "Search organization boards":
    "搜索组织白板",
  Show: "显示",
  "Boards shared with me": "与我共享的白板",
  "All organization boards I can open":
    "我能打开的所有组织白板",
  "Search names and content": "搜索名称和内容",
  Hide: "隐藏",
  // Archived boards listed with the others.
  "archived|Include": "包含",
  "Empty boards": "空白板",
  Sort: "排序",
  "Last activity": "最近活动",
  Created: "创建时间",
  "Only archived": "仅已归档",
  "More filters": "更多筛选",
  "Clear filters": "清除筛选",
  board: "白板",
  boards: "白板",
  notification: "通知",
  notifications: "通知",
  "Boards your organization shares with you.":
    "您所在组织与您共享的白板。",
  "New space": "新建空间",
  "Space name": "空间名称",
  "Create space": "创建空间",
  objects: "对象",
  Facilitator: "主持人",
  "Can edit": "可编辑",
  "Can comment": "可评论",
  "Can view": "可查看",
  "Open to the organization": "对组织公开",
  "Open to its team": "对其团队公开",
  "No boards found": "未找到白板",
  "Try other filters, or search all organization boards.":
    "请尝试其他筛选条件，或搜索所有组织白板。",
  "Email me about mentions, replies, and tasks assigned to me":
    "当有人提及我、回复我或向我分配任务时发送邮件",
  "Verify your email to receive notifications by email.":
    "验证您的邮箱以接收邮件通知。",
  "Mark all as read": "全部标记为已读",
  Mention: "提及",
  "Security alert": "安全警告",
  Assignment: "任务分配",
  Update: "更新",
  "You're all caught up.": "您已查看全部内容。",
  "Organization link": "组织链接",
  "Sign in with Puter. If your organization uses domain capture, you can join by verifying your work email instead of an invitation.":
    "登录系统。如果您的组织使用域名捕获，可以通过验证工作邮箱直接加入，无需邀请。",
  "Join organization": "加入组织",
  "Join {name} at {host}?": "加入位于 {host} 的 {name}？",
  "This replaces {name} as your organization.":
    "此组织将替换 {name}。",
  "this organization": "此组织",
  "Confirm and join": "确认并加入",
  "Paste the organization link your administrator sent you.":
    "粘贴管理员发送给您的组织链接。",
  "You're in the organization.": "您已成功加入组织。",
  "Welcome to the organization.": "欢迎加入组织。",
  "Work email": "工作邮箱",
  "Send code": "发送验证码",
  "Six-digit code": "6位验证码",
  Verify: "验证",
  "We sent a code. It expires in 15 minutes.":
    "验证码已发送，15分钟内有效。",
  "Email verified. You're in the organization.":
    "邮箱已验证，您已成功加入组织。",
  "Email verified.": "邮箱已验证。",
  "Your Puter account becomes the organization's account owner. Organization boards, audit logs, and settings are stored in this account.":
    "您的账户将成为该组织的主账号。组织的白板、审计日志和设置均保存在此账户中。",
  "Email domains (optional)": "邮箱域名（可选）",
  "Create organization": "创建组织",
  "Organization ready": "组织已就绪",
  "Share this link so people can join. You can create invitations and turn on domain capture in Organization settings.":
    "分享此链接以便成员加入。您也可以在组织设置中创建邀请并开启域名捕获。",
  "Preparing collaboration…": "正在准备协同…",
  "Starting collaboration…": "正在启动协同…",
});
