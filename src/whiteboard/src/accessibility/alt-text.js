import { escape } from "../model.js";
import { addTranslations, t, language } from "../i18n.js";
import { downscaleDataURL } from "../ai/ai-ui.js";
import { languageAttribute } from "./object-content.js";
import { cropOf, sameCrop } from "../image-crop.js";

function suggestionText(text) {
  const value = text.trim().replace(/^"|"$/g, "");
  let end = Math.min(1000, value.length);
  const previous = value.charCodeAt(end - 1),
    next = value.charCodeAt(end);
  if (
    previous >= 0xd800 &&
    previous <= 0xdbff &&
    next >= 0xdc00 &&
    next <= 0xdfff
  )
    end--;
  return value.slice(0, end);
}

// Alternative text for images and drawings: read by screen readers through the board
// outline and object list, searchable, and kept in exports that support it.
export function createAltText({
  board,
  view = board,
  modal,
  mutate,
  toast,
  ai,
  canEdit,
}) {
  return {
    open(image) {
      if (!image || !["image", "pen"].includes(image.type)) return;
      if (!canEdit(new Set([image.id]))) return;
      const openedBoard = board(),
        openedType = image.type,
        openedSource = image.src,
        openedCrop = structuredClone(cropOf(image)),
        drawing = image.type === "pen",
        blocked = drawing || ai?.availability("summaries");
      // The character count describes the field without being part of its
      // name or announced on every keystroke.
      modal(
        "Alternative text",
        `<form id="alt-form"><p class="dialog-copy">${t(drawing ? "Describe what the drawing shows and why it matters on this board. Leave it empty for purely decorative drawings." : "描述该图显示的内容以及它在该板上的重要性。对于纯粹的装饰图，将其留空。")}</p><label class="field">${t("Alternative text")}<textarea id="alt-text"${languageAttribute(image.lang)} rows="4" maxlength="1000" aria-describedby="alt-count">${escape(image.alt || "")}</textarea><small id="alt-count" aria-hidden="true"></small></label>${ai && !blocked ? `<button type="button" class="secondary" id="alt-suggest">${t("Suggest a description with AI")}</button>` : ""}<p id="alt-status" role="status"></p><div class="dialog-footer"><button class="primary">${t("Save alternative text")}</button></div></form>`,
        (d) => {
          const field = d.querySelector("#alt-text"),
            opened = image.alt || "";
          // A description belongs to the visible content, not its position or
          // label. Keep the draft when a collaborator replaces or crops it.
          const contentChanged = (target) => {
            if (!view()?.items.some((i) => i.id === image.id)) {
              d.querySelector("#alt-status").textContent = t(
                "This object is no longer shown to you.",
              );
              return true;
            }
            const changed =
              board() !== openedBoard ||
              target?.type !== openedType ||
              (!drawing &&
                (target.src !== openedSource ||
                  !sameCrop(cropOf(target), openedCrop)));
            if (changed)
              d.querySelector("#alt-status").textContent = t(
                "This object changed. Open it again to edit it.",
              );
            return changed;
          };
          const current = () => board()?.items.find((i) => i.id === image.id);
          let revision = 0,
            closed = false;
          d.addEventListener("close", () => (closed = true), { once: true });
          const count = () =>
            (d.querySelector("#alt-count").textContent =
              `${field.value.length} / 1000`);
          field.oninput = () => {
            revision++;
            count();
          };
          count();
          field.focus();
          d.querySelector("#alt-suggest")?.addEventListener(
            "click",
            async (e) => {
              const out = d.querySelector("#alt-status"),
                requested = field.value,
                requestedRevision = revision;
              if (contentChanged(current())) return;
              e.target.disabled = true;
              out.textContent = t("Describing the image…");
              try {
                const source = await downscaleDataURL(
                  openedSource,
                  1600,
                  openedCrop,
                );
                if (closed || !d.isConnected || contentChanged(current()))
                  return;
                const text = await ai.ask(
                  "describe",
                  `Write alternative text for this image from a collaborative whiteboard, in ${field.lang || (language === "fr" ? "Canadian French" : "加拿大法语")}. Describe the essential content in one or two plain sentences (at most 300 characters). Transcribe short visible text. Do not start with "Image of". Reply with the text only.`,
                  source,
                );
                if (closed || !d.isConnected || contentChanged(current()))
                  return;
                if (
                  revision !== requestedRevision ||
                  field.value !== requested
                ) {
                  out.textContent = t(
                    "Your description changed while AI was working. It has been kept. Request another suggestion to replace it.",
                  );
                  return;
                }
                field.value = suggestionText(text);
                count();
                out.textContent = t("Review the suggestion before saving.");
                field.focus();
              } catch (error) {
                if (!closed && d.isConnected)
                  out.textContent = t(error.message);
              } finally {
                e.target.disabled = false;
              }
            },
          );
          d.querySelector("#alt-form").onsubmit = (e) => {
            e.preventDefault();
            const value = field.value.trim();
            // The image may have been removed or locked, or access changed,
            // while the dialog was open.
            const target = current();
            if (!target) {
              d.close();
              return toast(
                drawing
                  ? "This drawing is no longer on the board."
                  : "这张图已经不在板上了。",
              );
            }
            if (!canEdit(new Set([target.id]))) return;
            // Nothing changed here: someone else's newer text stays.
            if (value === opened.trim()) return d.close();
            if (contentChanged(target)) return;
            if ((target.alt || "") !== opened)
              return toast("This object changed. Open it again to edit it.");
            mutate(() => {
              if (value) target.alt = value;
              else delete target.alt;
            });
            d.close();
            toast(value ? "Alternative text saved." : "已保存替代文本。");
          };
        },
      );
    },
  };
}

addTranslations({
  "Alternative text": "替代文本",
  "Describe what the image shows and why it matters on this board. Leave it empty for purely decorative images.":
    "描述该图像显示的内容以及为什么它在此板上很重要。对于纯粹的装饰图像，将其留空。",
  "Describe what the drawing shows and why it matters on this board. Leave it empty for purely decorative drawings.":
    "描述该图显示的内容以及它在该板上的重要性。对于纯粹的装饰图，将其留空。",
  "This drawing is no longer on the board.":
    "这张图已经不在板上了。",
  "Select one image or drawing first.": "请先选择一张图片或手绘。",
  "Suggest a description with AI": "使用 AI 建议描述",
  "Save alternative text": "保存替代文本",
  "Describing the image…": "描述图像...",
  "Review the suggestion before saving.":
    "保存前查看建议。",
  "Your description changed while AI was working. It has been kept. Request another suggestion to replace it.":
    "当人工智能工作时，你的描述发生了变化。它已被保留。请求另一个建议来替换它。",
  "Alternative text saved.": "已保存替代文本。",
  "This image is no longer on the board.":
    "该图像不再出现在板上。",
  "This object is no longer shown to you.":
    "该对象不再向您显示。",
  "Marked as decorative.": "标记为装饰性。",
  "Invalid alternative text.": "替代文本无效。",
  Accessibility: "无障碍访问",
  "Show to participants": "向参与者展示",
  "Hide from participants": "对参与者隐藏",
  Workshop: "工作坊",
  "Only facilitators can hide objects.":
    "只有协助者才能隐藏对象。",
  "Up to 500 objects can be hidden.":
    "最多可以隐藏 500 个对象。",
  "Hidden from participants. You still see these objects.":
    "对参与者隐藏。你仍然可以看到这些物体。",
  "Shown to participants.": "向参与者展示。",
  "Objects in a hidden frame stay hidden until the frame is shown.":
    "隐藏画框中的对象将保持隐藏状态，直到该画框显示为止。",
  "Read by screen readers. Leave empty for decorative images. The command palette's Alternative text can suggest one with AI.":
    "由屏幕阅读器朗读。对于纯装饰性图片请留空。命令面板中的“替代文本”功能可使用 AI 自动生成描述建议。",
  "Select one image first.": "选择one image first.",
});
