import { escape } from "../model.js";
import { busy } from "../accessibility/busy.js";
import { searchIndex, searchWords, matchesWord } from "../libraries.js";
import { keepPaginationFocus } from "../paging.js";
import { addTranslations, t, language } from "../i18n.js";
import { authoredTextHTML } from "../accessibility/object-content.js";
import {
  createAuthoredField,
  trimmedFieldContent,
} from "../facilitation/authored-field.js";

// The organization library: templates members share, which administrators
// approve before everyone sees them. Using one makes a new board from it.
export function createOrganizationLibrary({
  org,
  modal,
  toast,
  icon,
  refresh = () => {},
  useBoard,
  canInsert = () => false,
  insertBoard,
  shareable,
  includeSharedMedia,
}) {
  const date = (at) =>
    at
      ? new Date(at).toLocaleDateString(language === "fr" ? "fr-CA" : "fr-CA", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "";
  // Categories the app fills in are saved in English and shown in the
  // reader's language; ones people type stay as written.
  const DEFAULT_CATEGORIES = new Set(["General", "Migrated from Miro"]);
  const category = (value) =>
    DEFAULT_CATEGORIES.has(value)
      ? `<span>${escape(t(value))}</span>`
      : `<span data-user-content>${escape(value)}</span>`;
  function open() {
    modal(
      "Organization library",
      `<p class="dialog-copy">${t("Templates shared across your organization. Content a member shares appears for everyone once an administrator approves it.")}</p><label class="search">${icon("search")}<input id="org-library-search" type="search" aria-label="${t("Search the library")}" placeholder="${t("Search the library")}" autocomplete="off"></label><div class="admin-pagination"><p id="org-library-status" class="dialog-copy" role="status">${t("Loading…")}</p><div id="org-library-pages" hidden><button type="button" class="secondary" id="org-library-prev" aria-label="${t("Previous page")}">${t("Previous")}</button><button type="button" class="secondary" id="org-library-next" aria-label="${t("Next page")}">${t("Next")}</button></div></div><p id="org-library-error" class="dialog-copy" role="alert" hidden></p><div id="org-library-list" class="org-library-list"></div>`,
      (d) => {
        const list = d.querySelector("#org-library-list"),
          status = d.querySelector("#org-library-status"),
          error = d.querySelector("#org-library-error"),
          search = d.querySelector("#org-library-search"),
          previous = d.querySelector("#org-library-prev"),
          next = d.querySelector("#org-library-next"),
          pages = d.querySelector("#org-library-pages");
        // A failed action keeps its explanation in the dialog until the
        // next one, rather than in a notification that fades.
        const report = (message = "") => {
          error.textContent = message && t(message);
          error.hidden = !message;
        };
        let items = [],
          canPublish = false,
          page = 0,
          navigation = 0;
        const pageSize = 50,
          pendingItems = new Set();
        const render = () => {
          const focused = document.activeElement;
          const focusedItem =
            list.contains(focused) && focused.closest("[data-item]");
          const focusedAction =
            focusedItem &&
            [
              "data-library-insert",
              "data-library-use",
              "data-library-approve",
              "data-library-remove",
            ].find((attribute) => focused.hasAttribute(attribute));
          const scrollTop = list.scrollTop;
          // On an open board people can edit, a template goes into it; a
          // new board from it stays available.
          const inserting = canInsert();
          // Every word must match, ignoring case, accents and apostrophe
          // styles, as in the built-in template search.
          const words = searchWords(search.value);
          const shown = items.filter((i) => {
            const index = searchIndex(
              [
                i.name,
                i.description,
                i.category,
                DEFAULT_CATEGORIES.has(i.category) ? t(i.category) : "",
                i.createdByName,
              ].join(" "),
            );
            return words.every((word) => matchesWord(index, word));
          });
          page = Math.min(
            page,
            Math.max(0, Math.ceil(shown.length / pageSize) - 1),
          );
          const start = page * pageSize;
          status.textContent =
            shown.length > pageSize
              ? t("Showing library items {from}–{to} of {total}.")
                  .replace("{from}", start + 1)
                  .replace("{to}", Math.min(start + pageSize, shown.length))
                  .replace("{total}", shown.length)
              : !items.length
                ? t("Nothing has been shared to the library yet.")
                : shown.length
                  ? `${shown.length} ${t(shown.length === 1 ? "item" : "物品")}`
                  : t("No library items match your search.");
          list.innerHTML = shown
            .slice(start, start + pageSize)
            .map((i) => {
              const pending = i.status !== "approved";
              return `<div class="revision-row" data-item="${escape(i.id)}"><div><strong data-user-content>${escape(i.name)}</strong><small>${category(i.category)} · ${t("Shared by")} <span data-user-content>${escape(i.createdByName || "")}</span> · <span class="nowrap">${escape(date(i.created))}</span>${pending ? ` · <span class="badge">${t("Awaiting approval")}</span>` : ""}</small>${i.description ? `<small data-user-content>${authoredTextHTML({ text: i.description, lang: i.descriptionLang, textRuns: i.descriptionRuns })}</small>` : ""}</div>${inserting ? `<button type="button" class="secondary" data-library-insert aria-label="${escape(t("Insert into board"))}: ${escape(i.name)}">${t("Insert into board")}</button>` : ""}<button type="button" class="secondary" data-library-use aria-label="${escape(t(inserting ? "New board" : "新板"))}: ${escape(i.name)}">${t(inserting ? "New board" : "新板")}</button>${pending && canPublish ? `<button type="button" class="secondary" data-library-approve>${t("Approve")}</button>` : ""}${i.canRemove ? `<button type="button" class="text-btn" data-library-remove>${t("Remove")}</button>` : ""}</div>`;
            })
            .join("");
          for (const row of list.querySelectorAll("[data-item]"))
            if (pendingItems.has(row.dataset.item))
              for (const button of row.querySelectorAll("button"))
                button.disabled = true;
          list.scrollTop = scrollTop;
          previous.disabled = page === 0;
          next.disabled = start + pageSize >= shown.length;
          pages.hidden = shown.length <= pageSize;
          keepPaginationFocus(focused, previous, next, search);
          if (focusedAction) {
            const row = list.querySelector(
              `[data-item="${CSS.escape(focusedItem.dataset.item)}"]`,
            );
            const target =
              row?.querySelector(`[${focusedAction}]:not(:disabled)`) ||
              row?.querySelector("button:not(:disabled)") ||
              search;
            target.focus({ preventScroll: true });
          }
          refresh();
        };
        const load = async () => {
          try {
            const result = await org.request("library.list");
            if (!d.isConnected) return;
            canPublish = !!result.canPublish;
            // Items awaiting approval come first for administrators.
            items = (result.items || []).sort(
              (a, b) =>
                (a.status === "approved") - (b.status === "approved") ||
                (b.created || 0) - (a.created || 0),
            );
            render();
          } catch (error) {
            if (d.isConnected) status.textContent = t(error.message);
          }
        };
        search.oninput = () => {
          page = 0;
          navigation++;
          list.scrollTop = 0;
          render();
        };
        previous.onclick = () => {
          page--;
          navigation++;
          list.scrollTop = 0;
          render();
        };
        next.onclick = () => {
          page++;
          navigation++;
          list.scrollTop = 0;
          render();
        };
        list.addEventListener("click", async (e) => {
          const button = e.target.closest("button");
          const row = button?.closest("[data-item]");
          if (!row || button.disabled) return;
          const item = items.find((i) => i.id === row.dataset.item);
          if (!item || pendingItems.has(item.id)) return;
          if (
            button.matches("[data-library-remove]") &&
            !button.dataset.confirm
          ) {
            // Removing has no undo, so it takes a second press.
            button.dataset.confirm = "true";
            button.textContent = t("Confirm removal");
            button.classList.add("danger");
            // The renamed button keeps focus, so say what it now asks.
            status.textContent = t("Confirm removal");
            return;
          }
          report();
          const startedNavigation = navigation;
          const hadFocus = document.activeElement === button;
          pendingItems.add(item.id);
          const done = busy(button);
          for (const action of row.querySelectorAll("button"))
            action.disabled = true;
          try {
            if (button.matches("[data-library-insert]")) {
              const { board } = await org.request("library.get", {
                id: item.id,
              });
              if (insertBoard(board)) d.close();
            } else if (button.matches("[data-library-use]")) {
              const { board } = await org.request("library.get", {
                id: item.id,
              });
              await useBoard(board, item.name);
              d.close();
            } else if (button.matches("[data-library-approve]")) {
              await org.request("library.approve", { id: item.id });
              item.status = "approved";
              toast("Approved for everyone in the organization.");
            } else {
              await org.request("library.remove", { id: item.id });
              items = items.filter((i) => i !== item);
              toast("Removed from the library.");
            }
          } catch (failure) {
            if (d.isConnected) report(failure.message);
            else toast(failure.message);
          } finally {
            pendingItems.delete(item.id);
            if (button.isConnected) done();
            if (d.isConnected) {
              const restore =
                hadFocus &&
                startedNavigation === navigation &&
                (document.activeElement === button ||
                  document.activeElement === document.body);
              render();
              if (restore)
                (
                  list.querySelector(
                    `[data-item="${CSS.escape(item.id)}"] button`,
                  ) || search
                ).focus();
            }
          }
        });
        search.focus();
        load();
      },
    );
  }
  // Shares the open board as a template.
  function share() {
    const board = shareable();
    if (!board) return toast("Open a board to share it.");
    modal(
      "Share to organization library",
      `<form id="org-library-share"><p class="dialog-copy">${t(org.isAdmin ? "Everyone in your organization can use it right away." : "您组织中的每个人都可以立即使用它。")}</p><label class="field">${t("Name")}<input id="org-library-name" required maxlength="120" value="${escape(board.title)}"></label><label class="field">${t("Category")}<input id="org-library-category" maxlength="60" placeholder="${t("General")}"></label><div class="field"><span id="org-library-description-label">${t("Description (optional)")}</span><div id="org-library-description"></div></div><p id="org-library-share-error" class="dialog-copy" role="alert" hidden></p><div class="dialog-footer"><button class="primary">${t("Share template")}</button></div></form>`,
      (d) => {
        const form = d.querySelector("form");
        const description = createAuthoredField(
          d.querySelector("#org-library-description"),
          { text: "", lang: language },
          { maxLength: 500 },
        );
        description.style.minHeight = "3em";
        d.addEventListener("close", () => description.destroy(), {
          once: true,
        });
        d.querySelector("#org-library-name").select();
        form.onsubmit = async (e) => {
          e.preventDefault();
          const button = form.querySelector(".primary"),
            error = d.querySelector("#org-library-share-error");
          if (button.disabled) return;
          error.hidden = true;
          const done = busy(button);
          try {
            const media = includeSharedMedia?.(board);
            if (media) await media;
            const content = trimmedFieldContent(description);
            const { item } = await org.request("library.submit", {
              name: d.querySelector("#org-library-name").value.trim(),
              category:
                d.querySelector("#org-library-category").value.trim() ||
                "General",
              description: content.text,
              ...(content.text && content.lang
                ? { descriptionLang: content.lang }
                : {}),
              ...(content.textRuns?.length
                ? { descriptionRuns: content.textRuns }
                : {}),
              board: JSON.stringify(board),
            });
            description.destroy();
            d.close();
            toast(
              item.status === "approved"
                ? "Shared to the organization library."
                : "共享到组织库。",
            );
          } catch (failure) {
            // The form stays open, so its explanation stays with it.
            error.textContent = t(failure.message);
            error.hidden = false;
          } finally {
            done();
          }
        };
      },
    );
  }
  return { open, share };
}

addTranslations({
  "Showing library items {from}–{to} of {total}.":
    "显示 {total} 的库项目 {from}–{to}。",
  "Templates shared across your organization. Content a member shares appears for everyone once an administrator approves it.":
    "在整个组织内共享的模板。一旦管理员批准，成员共享的内容就会向所有人显示。",
  "Search the library": "搜索图书馆",
  "Nothing has been shared to the library yet.":
    "尚未向图书馆共享任何内容。",
  "No library items match your search.":
    "没有与您的搜索匹配的库项目。",
  item: "élément",
  items: "éléments",
  "Shared by": "分享者",
  "Awaiting approval": "等待批准",
  Approve: "Approuver",
  "Confirm removal": "确认删除",
  "Approved for everyone in the organization.":
    "已获得组织中每个人的批准。",
  "Removed from the library.": "从图书馆中删除。",
  "Open a board to share it.": "打开一个板来分享它。",
  "Share to organization library":
    "分享到组织库",
  "Everyone in your organization can use it right away.":
    "您组织中的每个人都可以立即使用它。",
  "An administrator approves it before others see it.":
    "管理员在其他人看到之前批准它。",
  General: "Général",
  "Migrated from Miro": "从米罗迁移",
  "Description (optional)": "说明（可选）",
  "Share template": "分享模板",
  "Shared to the organization library.":
    "共享到组织库。",
  "Shared. An administrator will review it.":
    "共享。管理员将对其进行审核。",
});
