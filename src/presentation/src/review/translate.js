// The Translate pane: the selected text, or every text on the slide,
// translated by local AI into the language chosen. Insert puts the
// translation in place of the selection, or of each object's text for the
// whole slide (marking it with the new language for proofing).
import { el, icon, toast } from "../ui.js";
import { aiAvailable, askJson } from "./ai.js";

export const TRANSLATE_LANGUAGES = [
  ["ar-SA", "阿拉伯语"],
  ["zh-CN", "中文(简体)"],
  ["zh-TW", "中文(繁体)"],
  ["cs-CZ", "捷克语"],
  ["da-DK", "丹麦语"],
  ["nl-NL", "荷兰语"],
  ["en-US", "英语"],
  ["fi-FI", "芬兰语"],
  ["fr-FR", "法语"],
  ["de-DE", "德语"],
  ["el-GR", "希腊语"],
  ["he-IL", "希伯来语"],
  ["hi-IN", "印地语"],
  ["hu-HU", "匈牙利语"],
  ["id-ID", "印度尼西亚语"],
  ["it-IT", "意大利语"],
  ["ja-JP", "日语"],
  ["ko-KR", "韩语"],
  ["nb-NO", "挪威语"],
  ["fa-IR", "波斯语"],
  ["pl-PL", "波兰语"],
  ["pt-BR", "葡萄牙语(巴西)"],
  ["pt-PT", "葡萄牙语(葡萄牙)"],
  ["ro-RO", "罗马尼亚语"],
  ["ru-RU", "俄语"],
  ["es-ES", "西班牙语"],
  ["sv-SE", "瑞典语"],
  ["th-TH", "泰语"],
  ["tr-TR", "土耳其语"],
  ["uk-UA", "乌克兰语"],
  ["vi-VN", "越南语"],
];
const PREF = "presentation:translate-to";

const SYSTEM =
  "You translate presentation text. Answer only with JSON of the form " +
  '{"detected": string, "translations": string[]} where "detected" is the English name of the source language and "translations" has one entry per input string, in order. ' +
  "Keep line breaks, list structure, numbers, names and placeholders like {0} as they are. Do not add explanations.";

export function createTranslate(env, host) {
  let to = "fr-FR";
  try {
    const saved = localStorage.getItem(PREF);
    if (TRANSLATE_LANGUAGES.some(([c]) => c === saved)) to = saved;
  } catch {}
  const state = {
    scope: "selection",
    items: [],
    result: null,
    detected: "",
    loading: false,
    error: null,
    request: 0,
  };

  // What would be translated: [{ part, id, text, kind }].
  const gather = () =>
    state.scope === "slide" ? env.slideTexts() : env.selectionTexts();

  async function translate() {
    const items = gather().filter((i) => i.text.trim());
    state.items = items;
    state.result = null;
    state.error = null;
    if (!items.length) {
      state.error =
        state.scope === "slide"
          ? "此幻灯片没有要翻译的文本。"
          : "请选择要翻译的文本或包含文本的对象。";
      host.refresh("translate");
      return;
    }
    if (!aiAvailable()) {
      state.error =
        "翻译功能需要 AI 服务，当前不可用。";
      host.refresh("translate");
      return;
    }
    const request = ++state.request;
    state.loading = true;
    host.refresh("translate");
    const name = TRANSLATE_LANGUAGES.find(([c]) => c === to)?.[1] || to;
    try {
      const data = await askJson(
        SYSTEM,
        `Translate into ${name}.\n${JSON.stringify(items.map((i) => i.text))}`,
        { maxTokens: 4000 },
      );
      if (request !== state.request) return;
      const list = Array.isArray(data?.translations) ? data.translations : [];
      if (
        list.length !== items.length ||
        list.some((t) => typeof t !== "string")
      )
        throw new Error("翻译返回不完整。请重试。");
      state.result = list;
      state.detected = typeof data.detected === "string" ? data.detected : "";
    } catch (e) {
      if (request !== state.request) return;
      state.error = e.message || "翻译失败。";
    }
    state.loading = false;
    host.refresh("translate");
  }

  async function insert() {
    if (!state.result) return;
    if (env.blocksEdits()) return env.blockedEdit();
    const ok = await env.replaceTexts(
      state.items.map((item, i) => ({ ...item, text: state.result[i] })),
      to,
    );
    if (ok) toast("已插入翻译。");
  }
  async function copy() {
    if (!state.result) return;
    try {
      await navigator.clipboard.writeText(state.result.join("\n\n"));
      toast("已复制翻译。");
    } catch {
      toast("无法复制翻译。");
    }
  }

  function render() {
    const wrap = el("div", { class: "translate-pane" });
    const select = el(
      "select",
      {
        class: "input",
        "aria-label": "翻译为",
        "data-focus-key": "translate-to",
        onchange: (e) => {
          to = e.target.value;
          try {
            localStorage.setItem(PREF, to);
          } catch {}
          state.result = null;
          host.refresh("translate");
        },
      },
      TRANSLATE_LANGUAGES.map(([code, name]) =>
        el("option", { value: code, selected: code === to || null }, name),
      ),
    );
    select.value = to;
    const scope = (value, label) =>
      el(
        "label",
        { class: "check-field" },
        el("input", {
          type: "radio",
          name: "translate-scope",
          value,
          checked: state.scope === value,
          onchange: () => {
            state.scope = value;
            state.result = null;
            host.refresh("translate");
          },
        }),
        el("span", {}, label),
      );
    wrap.append(
      el(
        "label",
        { class: "review-field" },
        el("span", { class: "review-label" }, "源语言"),
        el(
          "span",
          {},
          state.detected ? `${state.detected} (detected)` : "检测语言",
        ),
      ),
      el(
        "label",
        { class: "review-field" },
        el("span", { class: "review-label" }, "目标语言"),
        select,
      ),
      el(
        "fieldset",
        { class: "review-choices" },
        el("legend", { class: "review-label" }, "翻译"),
        scope("selection", "所选文本"),
        scope("slide", "此幻灯片上的所有文本"),
      ),
      el(
        "button",
        {
          type: "button",
          class: "btn primary",
          "data-autofocus": "",
          disabled: state.loading || null,
          onclick: translate,
        },
        icon("o:translate", 16),
        el("span", {}, state.loading ? "正在翻译…" : "翻译"),
      ),
    );
    if (state.error)
      wrap.append(
        el("p", { class: "review-status", role: "status" }, state.error),
      );
    if (state.result) {
      const out = el("div", {
        class: "translate-results",
        "aria-live": "polite",
      });
      state.items.forEach((item, i) =>
        out.append(
          el(
            "div",
            { class: "translate-item" },
            el("p", { class: "translate-source" }, item.text),
            el("p", { class: "translate-target", lang: to }, state.result[i]),
          ),
        ),
      );
      wrap.append(
        out,
        el(
          "div",
          { class: "review-footer" },
          el(
            "button",
            { type: "button", class: "btn secondary small", onclick: copy },
            "复制",
          ),
          el(
            "button",
            { type: "button", class: "btn primary small", onclick: insert },
            "插入",
          ),
        ),
      );
    }
    return wrap;
  }

  host.register("translate", { title: "翻译工具", render });
  return {
    open() {
      state.scope = env.selectionTexts().some((i) => i.text.trim())
        ? "selection"
        : "slide";
      state.result = null;
      state.error = null;
      state.detected = "";
      host.open("translate");
    },
    state,
  };
}
