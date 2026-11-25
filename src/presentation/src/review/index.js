// The Review features: comments, proofing (spelling, thesaurus, AutoCorrect,
// translation, language), accessibility, compare, and the read-only mark.
// main.js gives this module an `env` with what it needs of the editor and
// calls the hooks it returns: mount (after the editor is built), the slide
// and thumbnail hooks, the status bar button, the keyboard handler, the
// edit guard, and the Review tab and Tools menu.
import "./review.css";
import { MOD_KEY, toast } from "../ui.js";
import { P, shapeLabel, visibleSlideShapes } from "../model.js";
import { createPaneHost } from "./pane.js";
import { createComments } from "./comments.js";
import { createSpelling } from "./spelling.js";
import { createThesaurus } from "./thesaurus.js";
import { createTranslate } from "./translate.js";
import { createAccessibility } from "./accessibility.js";
import { createCompare } from "./compare.js";
import { createFinal } from "./final.js";
import { attachAutoCorrect, autoCorrectDialog } from "./autocorrect.js";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createReview(base) {
  const host = createPaneHost({
    onChange: () => {
      comments?.syncStatus();
      base.syncToolbar();
      base.onPaneChange?.();
    },
  });
  const final = createFinal(base);
  // What the panes are given: the editor's surface plus the read-only lock
  // and the text helpers built here.
  const env = {
    ...base,
    blocksEdits: () => final.blocksEdits(),
    blockedEdit: () => final.blockedEdit(),
    shapeLabel: (shape) => shapeLabel(shape, base.pres()),
    selectedWord() {
      const editor = base.editor();
      const text = editor?.selectedText?.().trim() || "";
      if (text && !/\s/.test(text))
        return text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (text) return text.split(/\s+/)[0];
      return "";
    },
    async insertText(value, { replacing } = {}) {
      const editor = base.editor();
      if (editor?.selectedText?.()) return editor.replaceSelection(value);
      const shape = base.currentShape();
      if (shape && replacing && !base.isTable(shape)) {
        const re = new RegExp(
          `(?<![\\p{L}\\p{N}])${escapeRe(replacing)}(?![\\p{L}\\p{N}])`,
          "gu",
        );
        if (!re.test(P.getShapeText(shape) || "")) return false;
        return base.mutateShape(shape, (s) =>
          base.replaceInShape(s, re, value, 0) ? undefined : base.SKIP,
        );
      }
      return false;
    },
    selectionTexts() {
      const editor = base.editor();
      const chosen = editor?.selectedText?.();
      if (chosen?.trim())
        return [{ kind: "editor", text: chosen, label: "所选内容" }];
      if (!base.pres()) return [];
      const ids = new Set(base.selectionIds());
      return visibleSlideShapes(base.slide())
        .filter((s) => ids.has(P.getShapeId(s)) && !base.isTable(s))
        .map(textItem)
        .filter((i) => i.text.trim());
    },
    slideTexts() {
      if (!base.pres()) return [];
      return visibleSlideShapes(base.slide())
        .filter((s) => !base.isTable(s))
        .map(textItem)
        .filter((i) => i.text.trim());
    },
    async replaceTexts(items, language) {
      const editor = base.editor();
      const inEditor = items.find((i) => i.kind === "editor");
      if (inEditor) return editor?.replaceSelection(inEditor.text) ?? false;
      const part = base.pres() && P.getSlidePartName(base.slide());
      const target = P.getSlides(base.pres()).find(
        (s) => P.getSlidePartName(s) === items[0]?.part,
      );
      if (!target) return false;
      return base.mutateSlide(target, (slide) => {
        let changed = false;
        for (const item of items) {
          const shape = P.findShapeById(slide, item.id);
          if (!shape) continue;
          base.setText(shape, item.text);
          if (language) base.setLanguage(shape, language);
          changed = true;
        }
        if (!changed) return base.SKIP;
        void part;
      });
    },
  };
  function textItem(shape) {
    return {
      kind: "shape",
      part: P.getSlidePartName(P.getShapeSlide(shape)),
      id: P.getShapeId(shape),
      label: shapeLabel(shape, base.pres()),
      text: (() => {
        try {
          return P.getShapeText(shape) || "";
        } catch {
          return "";
        }
      })(),
    };
  }

  const comments = createComments(env, host);
  const spelling = createSpelling(env, host);
  const thesaurus = createThesaurus(env, host);
  const translate = createTranslate(env, host);
  const accessibility = createAccessibility(env, host);
  const compare = createCompare(env, host);

  // ---- Ribbon --------------------------------------------------------------

  function tab(api) {
    const one = () => api.selection().length === 1;
    return {
      id: "review",
      label: "审阅",
      groups: [
        {
          id: "proofing",
          label: "校对",
          icon: "spelling",
          items: [
            {
              type: "large",
              id: "spelling",
              label: "拼写检查",
              icon: "spelling",
              title: "拼写检查 (F7)",
              description:
                "检查演示文稿中的文本拼写。",
              pressed: () => host.isOpen("spelling"),
              run: () => spelling.open(),
            },
            {
              type: "large",
              id: "thesaurus",
              label: "同义词库",
              icon: "thesaurus",
              title: "同义词库 (Shift+F7)",
              description: "查找所选字词的其他同义表达。",
              pressed: () => host.isOpen("thesaurus"),
              run: () => thesaurus.open(),
            },
          ],
        },
        {
          id: "accessibility",
          label: "辅助功能",
          icon: "accessibility",
          items: [
            {
              type: "large",
              id: "check-accessibility",
              label: "检查\n辅助功能",
              icon: "accessibility",
              title: "检查辅助功能",
              description:
                "查找可能不方便残障人士阅读的内容。",
              split: true,
              pressed: () => host.isOpen("accessibility"),
              run: () => accessibility.open(),
              menu: () => [
                {
                  label: "检查辅助功能",
                  icon: "o:accessibility",
                  onSelect: () => accessibility.open(),
                },
                {
                  label: "可选文字…",
                  icon: "o:altText",
                  disabled: !one(),
                  onSelect: () => base.altText(),
                },
                {
                  label: "阅读顺序窗格",
                  icon: "o:readingOrder",
                  onSelect: () => accessibility.openReadingOrder(),
                },
              ],
              menuLabel: "辅助功能选项",
            },
            {
              type: "large",
              id: "alt-text",
              label: "可选\n文字",
              icon: "altText",
              title: "可选文字",
              description:
                "为使用屏幕阅读器的人群描述所选图片或对象。",
              enabled: () => one(),
              run: () => base.altText(),
            },
          ],
        },
        {
          id: "language",
          label: "语言",
          icon: "language",
          items: [
            {
              type: "large",
              id: "translate",
              label: "翻译",
              icon: "translate",
              title: "翻译",
              description:
                "将所选文本或幻灯片翻译为其他语言。",
              pressed: () => host.isOpen("translate"),
              run: () => translate.open(),
            },
            {
              type: "large",
              id: "language",
              label: "语言",
              icon: "language",
              title: "语言",
              description: "选择所选文本的校对语言。",
              menu: () => [
                ...base.languageItems(),
                { separator: true },
                {
                  label: "自动更正选项…",
                  icon: "o:autoCorrect",
                  onSelect: () => autoCorrectDialog(),
                },
              ],
            },
          ],
        },
        {
          id: "review-comments",
          label: "批注",
          icon: "newComment",
          items: [
            {
              type: "large",
              id: "new-comment",
              label: "新建\n批注",
              icon: "newComment",
              title: `新建批注 (${MOD_KEY}+Shift+M)`,
              description: "关于所选内容或幻灯片添加批注。",
              run: () => comments.newComment(),
            },
            {
              type: "large",
              id: "delete-comment",
              label: "删除",
              icon: "deleteComment",
              title: "删除批注",
              enabled: () => comments.canDelete(),
              menu: () => comments.deleteMenu(),
            },
            {
              type: "large",
              id: "previous-comment",
              label: "上一条",
              icon: "previousComment",
              title: "上一条批注",
              enabled: () => comments.hasComments(),
              run: () => comments.step(-1),
            },
            {
              type: "large",
              id: "next-comment",
              label: "下一条",
              icon: "nextComment",
              title: "下一条批注",
              enabled: () => comments.hasComments(),
              run: () => comments.step(1),
            },
            {
              type: "large",
              id: "show-comments",
              label: "显示\n批注",
              icon: "showComments",
              title: "显示批注",
              description:
                "打开“批注”窗格，并在幻灯片上显示或隐藏批注标记。",
              split: true,
              pressed: () => comments.isOpen(),
              run: () => comments.toggle(),
              menu: () => comments.showMenu(),
              menuLabel: "显示批注选项",
            },
          ],
        },
        {
          id: "compare",
          label: "比较",
          icon: "compare",
          items: [
            {
              type: "large",
              id: "compare",
              label: "比较",
              icon: "compare",
              title: "比较",
              description:
                "将此演示文稿与另一个版本进行比较，并选择要保留的更改。",
              run: () => compare.start(),
            },
            {
              type: "stack",
              items: [
                {
                  type: "small",
                  id: "accept-all-changes",
                  label: "全部接受",
                  icon: "acceptChange",
                  visible: () => compare.active(),
                  run: () => compare.acceptAll(),
                },
                {
                  type: "toggle",
                  id: "revisions-pane",
                  label: "修订",
                  icon: "showComments",
                  visible: () => compare.active(),
                  pressed: () => host.isOpen("revisions"),
                  run: () => host.toggle("revisions"),
                },
                {
                  type: "small",
                  id: "end-review",
                  label: "结束审阅",
                  icon: "rejectChange",
                  visible: () => compare.active(),
                  run: () => compare.end(),
                },
              ],
            },
          ],
        },
        {
          id: "protect",
          label: "保护",
          icon: "readOnly",
          items: [
            {
              type: "large",
              id: "always-read-only",
              label: "始终以只读\n方式打开",
              icon: "readOnly",
              title: "始终以只读方式打开",
              description:
                "将演示文稿标记为最终版本以便以只读方式打开，防止他人进行更改。",
              pressed: () => final.marked(),
              run: () => final.toggle(),
            },
          ],
        },
      ],
    };
  }

  // The Tools menu of the menu bar.
  function toolsMenu() {
    return [
      {
        label: "拼写检查…",
        icon: "o:spelling",
        shortcut: "F7",
        onSelect: () => spelling.open(),
      },
      {
        label: "同义词库…",
        icon: "o:thesaurus",
        shortcut: "Shift+F7",
        onSelect: () => thesaurus.open(),
      },
      {
        label: "翻译…",
        icon: "o:translate",
        onSelect: () => translate.open(),
      },
      { label: "语言", icon: "o:language", items: base.languageItems() },
      {
        label: "自动更正选项…",
        icon: "o:autoCorrect",
        onSelect: () => autoCorrectDialog(),
      },
      { separator: true },
      {
        label: "检查辅助功能",
        icon: "o:accessibility",
        onSelect: () => accessibility.open(),
      },
      {
        label: "阅读顺序窗格",
        icon: "o:readingOrder",
        onSelect: () => accessibility.openReadingOrder(),
      },
      { separator: true },
      { label: "比较…", icon: "o:compare", onSelect: () => compare.start() },
      {
        label: "批注",
        icon: "o:showComments",
        checked: comments.isOpen(),
        onSelect: () => comments.toggle(),
      },
    ];
  }
  // Items for the File menu.
  function fileMenuItems() {
    return [
      { label: "比较…", icon: "o:compare", onSelect: () => compare.start() },
      {
        label: "标记为最终版本",
        icon: "Lock",
        checked: final.marked(),
        onSelect: () => final.toggle(),
      },
    ];
  }

  // F7, Shift+F7 and Ctrl/Cmd+Shift+M. Returns true when handled.
  function keydown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "F7" && !mod && !e.altKey) {
      e.preventDefault();
      if (e.shiftKey) thesaurus.open();
      else {
        base.commitText?.();
        spelling.open();
      }
      return true;
    }
    if (mod && e.shiftKey && !e.altKey && e.code === "KeyM") {
      e.preventDefault();
      comments.newComment();
      return true;
    }
    // Thesaurus also on Ctrl+Alt+Cmd+R, as desktop editors on a Mac have it.
    if (e.metaKey && e.ctrlKey && e.altKey && e.code === "KeyR") {
      e.preventDefault();
      thesaurus.open();
      return true;
    }
    return false;
  }

  return {
    host,
    comments,
    spelling,
    thesaurus,
    translate,
    accessibility,
    compare,
    final,
    tab,
    toolsMenu,
    fileMenuItems,
    keydown,
    // After the editor is built.
    mount() {
      host.mount(document.querySelector(".editor-split"));
      final.mount();
      comments.invalidate();
      if (host.current()) host.refresh();
    },
    // After the slide area is drawn.
    afterRenderSlide() {
      comments.renderMarkers();
      if (host.current() && host.current() !== "spelling") host.refresh();
      comments.syncStatus();
    },
    decorateThumb: (thumb, slide) => comments.decorateThumb(thumb, slide),
    accessibilityStatus: () => accessibility.statusText(),
    blocksEdits: () => final.blocksEdits(),
    blockedEdit: () => final.blockedEdit(),
    attachEditor: (editor) => attachAutoCorrect(editor),
    newComment: () => comments.newComment(),
    openAccessibility: () => accessibility.open(),
    toast,
  };
}
