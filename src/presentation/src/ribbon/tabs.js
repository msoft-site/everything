// The ribbon's tabs, groups and commands. Everything here is declarative:
// each command calls into `api`,
// the editor's command surface built in main.js, and asks it whether the
// command is available. A command appears only when the app can carry it out.
const M = (api) => api.modKey;

export function buildTabs(api) {
  const text = () => api.textTarget();
  const sel = () => api.selection();
  const one = () => sel().length === 1;
  const some = () => sel().length > 0;
  const shapeSel = () => api.selectionKind() === "shape";
  const pictureSel = () => api.selectionKind() === "picture";
  const tableSel = () => api.selectionKind() === "table";
  const fmt = () => api.textFormat();
  const keep = { keepFocus: true };

  const clipboard = {
    id: "clipboard",
    label: "剪贴板",
    icon: "paste",
    items: [
      {
        type: "large",
        id: "paste",
        label: "粘贴",
        icon: "paste",
        title: `粘贴 (${M(api)}+V)`,
        description: "将剪贴板中的内容添加到幻灯片中。",
        split: true,
        run: () => api.paste(),
        menu: () => api.pasteMenu(),
        menuLabel: "粘贴选项",
      },
      {
        type: "stack",
        items: [
          {
            type: "small",
            id: "cut",
            label: "剪切",
            icon: "cut",
            title: `剪切 (${M(api)}+X)`,
            enabled: some,
            run: () => api.cut(),
          },
          {
            type: "small",
            id: "copy",
            label: "复制",
            icon: "copy",
            title: `复制 (${M(api)}+C)`,
            enabled: some,
            run: () => api.copy(),
          },
          {
            type: "toggle",
            id: "format-painter",
            label: "格式刷",
            ariaLabel: "格式刷",
            icon: "formatPainter",
            title: `格式刷 (${M(api)}+Shift+C，然后 ${M(api)}+Shift+V)`,
            description:
              "复制所选内容的格式并应用到下一个单击的对象。双击可应用到多个对象。",
            enabled: () => one() || api.formatPainterActive(),
            pressed: () => api.formatPainterActive(),
            run: () => api.formatPainter(),
          },
        ],
      },
    ],
  };
  const slides = {
    id: "slides",
    label: "幻灯片",
    icon: "newSlide",
    items: [
      {
        type: "large",
        id: "new-slide",
        label: "新建\n幻灯片",
        icon: "newSlide",
        title: `新建幻灯片 (${api.newSlideKeys})`,
        description: "在当前幻灯片后添加新幻灯片。",
        split: true,
        run: () => api.newSlide(),
        menu: () => api.newSlideMenu(),
        menuLabel: "新建幻灯片版式",
      },
      {
        type: "large",
        id: "layout",
        label: "版式",
        icon: "layout",
        title: "版式",
        description: "为所选幻灯片选择不同的版式。",
        menu: () => api.layoutMenu(),
        enabled: () => api.canChangeLayout(),
      },
      {
        type: "large",
        id: "reset",
        label: "重置",
        icon: "resetSlide",
        title: "重置",
        description:
          "将幻灯片占位符的位置、大小和格式重置为其版式默认值。",
        enabled: () => api.canResetSlide(),
        run: () => api.resetSlide(),
      },
      {
        type: "large",
        id: "section",
        label: "节",
        icon: "section",
        title: "节",
        description: "将幻灯片划分为各个节进行组织。",
        menu: () => api.sectionMenu(),
      },
    ],
  };
  const font = {
    id: "font",
    label: "字体",
    icon: "textColor",
    items: [
      {
        type: "stack",
        rows: 2,
        items: [
          {
            type: "row",
            items: [
              {
                type: "combo",
                id: "font-name",
                label: "字体",
                width: 134,
                listWidth: 220,
                enabled: () => !!text(),
                value: () => fmt().font || "",
                options: () => api.fontList(),
                optionStyle: (name) => ({
                  fontFamily: api.fontPreviewFamily(name),
                }),
                commit: (value) => api.applyText({ font: value }),
              },
              {
                type: "combo",
                id: "font-size",
                label: "字号",
                width: 50,
                enabled: () => !!text(),
                value: () =>
                  fmt().size ? Math.round(fmt().size * 10) / 10 : "",
                options: () => api.fontSizes(),
                commit: (value) => {
                  const n = parseFloat(value);
                  if (!Number.isFinite(n) || n < 1 || n > 4000) return false;
                  return api.applyText({ size: n });
                },
              },
              {
                type: "small",
                id: "font-grow",
                label: "增大字号",
                showLabel: false,
                icon: "fontGrow",
                title: `增大字号 (${M(api)}+Shift+>)`,
                enabled: () => !!text(),
                run: () => api.stepTextSize(1),
                ...keep,
              },
              {
                type: "small",
                id: "font-shrink",
                label: "减小字号",
                showLabel: false,
                icon: "fontShrink",
                title: `减小字号 (${M(api)}+Shift+<)`,
                enabled: () => !!text(),
                run: () => api.stepTextSize(-1),
                ...keep,
              },
              { type: "divider" },
              {
                type: "small",
                id: "clear-formatting",
                label: "清除所有格式",
                showLabel: false,
                icon: "clearFormat",
                title: "清除所有格式 (Ctrl+空格)",
                description:
                  "清除所选内容的所有格式，仅保留常规无格式文本。",
                enabled: () => !!text(),
                run: () => api.clearFormatting(),
                ...keep,
              },
              {
                type: "small",
                id: "font-dialog",
                label: "字体设置",
                showLabel: false,
                icon: "fontDialog",
                title: `字体… (${api.modKey === "⌘" ? "⌘+T" : "Ctrl+Shift+F"})`,
                description:
                  "一次性设置所有字体属性：样式、下划线、效果和字符间距。",
                visible: () => !!api.fontDialog,
                enabled: () => !!text(),
                run: () => api.fontDialog(),
              },
            ],
          },
          {
            type: "row",
            items: [
              toggle("bold", "Bold", "bold", `${M(api)}+B`),
              toggle("italic", "Italic", "italic", `${M(api)}+I`),
              toggle("underline", "Underline", "underline", `${M(api)}+U`),
              toggle("strike", "Strikethrough", "strike"),
              {
                type: "toggle",
                id: "superscript",
                label: "上标",
                showLabel: false,
                icon: "superscript",
                title: "上标",
                enabled: () => !!text(),
                pressed: () => (fmt().baseline || 0) > 0,
                run: () => api.toggleBaseline(30),
                ...keep,
              },
              {
                type: "toggle",
                id: "subscript",
                label: "下标",
                showLabel: false,
                icon: "subscript",
                title: "下标",
                enabled: () => !!text(),
                pressed: () => (fmt().baseline || 0) < 0,
                run: () => api.toggleBaseline(-25),
                ...keep,
              },
              {
                type: "small",
                id: "char-spacing",
                label: "字符间距",
                showLabel: false,
                icon: "charSpacing",
                title: "字符间距",
                description:
                  "增大或减小字符之间的间距。",
                enabled: () => !!text(),
                menu: () => api.charSpacingMenu(),
              },
              {
                type: "small",
                id: "change-case",
                label: "更改大小写",
                showLabel: false,
                icon: "changeCase",
                title: "更改大小写",
                description:
                  "将所选文本更改为大写、小写或其他大小写格式。",
                enabled: () => !!text(),
                menu: () => api.changeCaseMenu(),
              },
              { type: "divider" },
              {
                type: "color",
                id: "highlight",
                label: "文本突出显示颜色",
                showLabel: false,
                icon: "highlight",
                title: "文本突出显示颜色",
                description:
                  "用鲜明的颜色突出显示文本，使其醒目。",
                enabled: () => !!text(),
                color: () => api.lastColor("highlight"),
                run: () => api.applyLastColor("highlight"),
                menu: () => api.colorMenu("highlight"),
                menuLabel: "突出显示颜色",
                ...keep,
              },
              {
                type: "color",
                id: "font-color",
                label: "字体颜色",
                showLabel: false,
                icon: "textColor",
                title: "字体颜色",
                description: "更改文本的颜色。",
                enabled: () => !!text(),
                color: () => api.lastColor("text"),
                run: () => api.applyLastColor("text"),
                menu: () => api.colorMenu("text"),
                menuLabel: "字体颜色",
                ...keep,
              },
            ],
          },
        ],
      },
    ],
  };
  function toggle(key, label, icon, shortcut) {
    return {
      type: "toggle",
      id: key,
      label,
      showLabel: false,
      icon,
      title: shortcut ? `${label} (${shortcut})` : label,
      enabled: () => !!text(),
      pressed: () => api.textToggleState(key),
      run: () => api.toggleText(key),
      ...keep,
    };
  }
  const paragraph = {
    id: "paragraph",
    label: "段落",
    icon: "alignLeft",
    items: [
      {
        type: "stack",
        rows: 2,
        items: [
          {
            type: "row",
            items: [
              {
                type: "toggle",
                id: "bullets",
                label: "项目符号",
                showLabel: false,
                icon: "bullets",
                title: "项目符号",
                enabled: () => api.canList(),
                pressed: () => api.listStyle() === "bullet",
                run: () => api.toggleList("bullet"),
                split: true,
                menu: () => api.bulletMenu(),
                menuLabel: "项目符号样式",
                ...keep,
              },
              {
                type: "toggle",
                id: "numbering",
                label: "编号",
                showLabel: false,
                icon: "numbering",
                title: "编号",
                enabled: () => api.canList(),
                pressed: () => api.listStyle() === "number",
                run: () => api.toggleList("number"),
                split: true,
                menu: () => api.numberingMenu(),
                menuLabel: "编号样式",
                ...keep,
              },
              { type: "divider" },
              {
                type: "small",
                id: "indent-less",
                label: "减少列表缩进量",
                showLabel: false,
                icon: "indentLess",
                title: "减少列表缩进量 (Shift+Tab)",
                enabled: () => api.canList(),
                run: () => api.indent(-1),
                ...keep,
              },
              {
                type: "small",
                id: "indent-more",
                label: "增加列表缩进量",
                showLabel: false,
                icon: "indentMore",
                title: "增加列表缩进量 (Tab)",
                enabled: () => api.canList(),
                run: () => api.indent(1),
                ...keep,
              },
              { type: "divider" },
              {
                type: "small",
                id: "line-spacing",
                label: "行距",
                showLabel: false,
                icon: "lineSpacing",
                title: "行距",
                description:
                  "选择文本行与行之间的间距。",
                enabled: () => api.canList(),
                menu: () => api.lineSpacingMenu(),
              },
              {
                type: "small",
                id: "columns",
                label: "分栏",
                showLabel: false,
                icon: "columns",
                title: "添加或删除分栏",
                description: "将文本拆分为两栏或多栏。",
                enabled: () => api.canColumns(),
                menu: () => api.columnsMenu(),
              },
              {
                type: "small",
                id: "paragraph-dialog",
                label: "段落设置",
                showLabel: false,
                icon: "paragraph",
                title: `段落… (${api.modKey === "⌘" ? "⌥⌘M" : "Ctrl+Alt+M"})`,
                description:
                  "段落的对齐方式、缩进量、行距和制表位。",
                visible: () => !!api.paragraphDialog,
                enabled: () => api.canList(),
                run: () => api.paragraphDialog(),
              },
            ],
          },
          {
            type: "row",
            items: [
              align("left", "Align Left", "alignLeft", `${M(api)}+L`),
              align("center", "Center", "alignCenter", `${M(api)}+E`),
              align("right", "Align Right", "alignRight", `${M(api)}+R`),
              align("justify", "Justify", "justify", `${M(api)}+J`),
              { type: "divider" },
              {
                type: "small",
                id: "text-direction",
                label: "文本方向",
                showLabel: false,
                icon: "textDirection",
                title: "文本方向",
                description:
                  "将文本方向更改为竖排、堆叠或旋转。",
                enabled: () => api.canColumns(),
                menu: () => api.textDirectionMenu(),
              },
              {
                type: "small",
                id: "align-text",
                label: "对齐文本",
                showLabel: false,
                icon: "alignText",
                title: "对齐文本",
                description: "更改文本在文本框内的对齐方式。",
                enabled: () => !!text(),
                menu: () => api.alignTextMenu(),
              },
              {
                type: "small",
                id: "convert-smartart",
                label: "转换为 SmartArt",
                showLabel: false,
                icon: "smartArtConvert",
                title: "转换为 SmartArt 图形",
                description:
                  "将文本转换为流程图或层次结构等图表。",
                visible: () => !!api.canConvertToSmartArt,
                enabled: () => !!api.canConvertToSmartArt?.(),
                menu: () => api.convertToSmartArtMenu?.(),
              },
            ],
          },
        ],
      },
    ],
  };
  function align(value, label, icon, shortcut) {
    return {
      type: "toggle",
      id: `align-${value}`,
      label,
      showLabel: false,
      icon,
      title: `${label} (${shortcut})`,
      enabled: () => !!text(),
      pressed: () => !!text() && api.alignment() === value,
      run: () => api.setAlignment(value),
      ...keep,
    };
  }
  const insertShapesGroup = (largeLabels = true) => ({
    id: "drawing-insert",
    // As on PowerPoint for Mac's Home tab: Insert, then Drawing beside it.
    label: "插入",
    icon: "shapes",
    items: [
      {
        type: "large",
        id: "picture",
        label: "图片",
        icon: "picture",
        title: "图片",
        description: "从您的设备插入图片。",
        split: true,
        run: () => api.insertPicture(),
        menu: () => api.pictureMenu(),
        menuLabel: "图片来源",
      },
      {
        type: "large",
        id: "shapes",
        label: "形状",
        icon: "shapes",
        title: "形状",
        description:
          "绘制形状：选择一个形状，然后在幻灯片上单击或拖动。",
        menu: () => api.shapesMenu(),
        menuWidth: 300,
      },
      {
        type: "large",
        id: "text-box",
        label: "文本\n框",
        ariaLabel: "文本框",
        icon: "textBox",
        title: "文本框",
        description: "绘制文本框：在幻灯片上单击或拖动。",
        pressed: () => api.drawingTool() === "text",
        run: () => api.startDrawing("text"),
      },
    ],
  });
  const drawing = {
    id: "drawing",
    label: "绘图",
    icon: "arrange",
    items: [
      {
        type: "large",
        id: "arrange",
        label: "排列",
        icon: "arrange",
        title: "排列",
        description: "排列、组合、对齐和旋转对象。",
        enabled: some,
        menu: () => api.arrangeMenu(),
      },
      {
        type: "large",
        id: "quick-styles",
        label: "快速\n样式",
        icon: "quickStyles",
        title: "快速样式",
        description: "为形状或线条选择视觉样式。",
        enabled: () => api.canStyleShape(),
        menu: () => api.quickStylesMenu(),
        menuWidth: 340,
      },
      {
        type: "stack",
        items: [
          {
            type: "color",
            id: "shape-fill",
            label: "形状填充",
            icon: "shapeFill",
            title: "形状填充",
            description:
              "使用纯色、渐变、图片或纹理填充所选形状。",
            enabled: () => api.canFill(),
            color: () => api.lastColor("fill"),
            run: () => api.applyLastColor("fill"),
            menu: () => api.colorMenu("fill"),
            menuLabel: "填充颜色",
          },
          {
            type: "color",
            id: "shape-outline",
            label: "形状轮廓",
            icon: "shapeOutline",
            title: "形状轮廓",
            description:
              "选择形状轮廓的颜色、粗细和线型。",
            enabled: () => api.canOutline(),
            color: () => api.lastColor("line"),
            run: () => api.applyLastColor("line"),
            menu: () => api.colorMenu("line"),
            menuLabel: "轮廓颜色",
          },
          {
            type: "small",
            id: "shape-effects",
            label: "形状效果",
            icon: "shapeEffects",
            title: "形状效果",
            description:
              "为形状应用视觉效果，例如阴影。",
            enabled: () => api.canEffects(),
            menu: () => api.effectsMenu(),
          },
        ],
      },
    ],
  };
  const editing = {
    id: "editing",
    label: "编辑",
    icon: "find",
    items: [
      {
        type: "stack",
        items: [
          {
            type: "small",
            id: "find",
            label: "查找",
            icon: "find",
            title: `查找 (${M(api)}+F)`,
            run: () => api.find(),
          },
          {
            type: "small",
            id: "replace",
            label: "替换",
            icon: "replace",
            title: `替换 (${M(api)}+H)`,
            run: () => api.replace(),
          },
          {
            type: "small",
            id: "select",
            label: "选择",
            icon: "select",
            title: "选择",
            menu: () => api.selectMenu(),
          },
        ],
      },
    ],
  };
  const designer = {
    id: "designer",
    label: "设计器",
    icon: "designer",
    items: [
      {
        type: "large",
        id: "designer",
        label: "设计\n灵感",
        icon: "designer",
        title: "设计灵感",
        description:
          "向 AI 助手获取此幻灯片的设计建议。",
        visible: () => api.hasAssistant(),
        run: () => api.designIdeas(),
      },
      {
        type: "large",
        id: "new-slide-prompt",
        label: "根据提示词\n新建幻灯片",
        icon: "newSlidePrompt",
        title: "根据提示词新建幻灯片",
        description:
          "描述幻灯片内容，AI 助手将在当前幻灯片之后草拟生成。",
        visible: () => api.hasAssistant(),
        run: () => api.newSlideFromPrompt(),
      },
    ],
  };

  const home = {
    id: "home",
    label: "开始",
    groups: [
      clipboard,
      slides,
      font,
      paragraph,
      insertShapesGroup(),
      drawing,
      editing,
      designer,
    ].map((g, i) => ({ ...g, priority: [6, 5, 9, 8, 4, 3, 1, 2][i] })),
  };

  const insert = {
    id: "insert",
    label: "插入",
    groups: [
      {
        id: "insert-slides",
        label: "幻灯片",
        icon: "newSlide",
        items: [
          {
            type: "large",
            id: "insert-new-slide",
            label: "新建\n幻灯片",
            icon: "newSlide",
            title: `新建幻灯片 (${api.newSlideKeys})`,
            split: true,
            run: () => api.newSlide(),
            menu: () => api.newSlideMenu(),
            menuLabel: "新建幻灯片版式",
          },
        ],
      },
      {
        id: "tables",
        label: "表格",
        icon: "table",
        items: [
          {
            type: "large",
            id: "table",
            label: "表格",
            icon: "table",
            title: "表格",
            description: "向幻灯片中添加表格。",
            menu: () => api.tableMenu(),
            menuWidth: 220,
          },
        ],
      },
      {
        id: "images",
        label: "图像",
        icon: "pictures",
        items: [
          {
            type: "large",
            id: "insert-pictures",
            label: "图片",
            icon: "pictures",
            title: "图片",
            description: "从您的设备插入图片。",
            split: true,
            run: () => api.insertPicture(),
            menu: () => api.pictureMenu(),
            menuLabel: "图片来源",
          },
          {
            type: "large",
            id: "screenshot",
            label: "屏幕截图",
            icon: "screenshot",
            title: "屏幕截图",
            description:
              "插入窗口或屏幕（或其一部分）的屏幕截图。",
            visible: () => !!api.screenshot,
            split: true,
            run: () => api.screenshot?.(),
            menu: () => api.screenshotMenu?.() ?? [],
            menuLabel: "屏幕截图选项",
          },
          {
            type: "large",
            id: "photo-album",
            label: "相册",
            icon: "photoAlbum",
            title: "相册",
            description:
              "创建一个每张幻灯片包含一张图片的相册演示文稿。",
            visible: () => !!api.photoAlbum,
            run: () => api.photoAlbum?.(),
          },
        ],
      },
      {
        id: "illustrations",
        label: "插图",
        icon: "shapes",
        items: [
          {
            type: "large",
            id: "insert-shapes",
            label: "形状",
            icon: "shapes",
            title: "形状",
            menu: () => api.shapesMenu(),
            menuWidth: 300,
          },
          {
            type: "large",
            id: "icons",
            label: "图标",
            icon: "icons",
            title: "图标",
            description: "插入图标以直观地传达信息。",
            visible: () => !!api.insertIcons,
            run: () => api.insertIcons?.(),
          },
          {
            type: "large",
            id: "smartart",
            label: "SmartArt",
            icon: "smartArt",
            title: "SmartArt",
            description:
              "插入 SmartArt 图形以直观地传达信息。",
            visible: () => !!api.insertSmartArt,
            run: () => api.insertSmartArt?.(),
          },
          {
            type: "large",
            id: "chart",
            label: "图表",
            icon: "chart",
            title: "图表",
            description: "添加图表以说明和比较数据。",
            visible: () => !!api.insertChart,
            run: () => api.insertChart?.(),
          },
        ],
      },
      {
        id: "links",
        label: "链接",
        icon: "link",
        items: [
          {
            type: "large",
            id: "insert-zoom",
            label: "缩放",
            icon: "zoomSlide",
            title: "缩放",
            description:
              "在幻灯片放映中跳转到某张幻灯片或某个节并返回。",
            visible: () => !!api.insertZoomMenu,
            menu: () => api.insertZoomMenu?.() ?? [],
          },
          {
            type: "large",
            id: "link",
            label: "链接",
            icon: "link",
            title: `链接 (${M(api)}+K)`,
            description: "创建指向网页或其他幻灯片的链接。",
            enabled: () => api.canLink(),
            run: () => api.insertLink(),
          },
          {
            type: "large",
            id: "action",
            label: "动作",
            icon: "action",
            title: "动作",
            description:
              "在放映时单击所选对象可跳转到幻灯片或网页。",
            enabled: () => api.canLink(),
            split: !!api.actionSettings,
            run: () => api.actionSettings?.(),
            menu: () => [
              ...api.actionMenu(),
              ...(api.actionButtonsMenu
                ? [
                    { separator: true },
                    { label: "动作按钮", items: api.actionButtonsMenu() },
                  ]
                : []),
            ],
          },
        ],
      },
      {
        id: "comments",
        label: "批注",
        icon: "newComment",
        items: [
          {
            type: "large",
            id: "insert-comment",
            label: "批注",
            icon: "newComment",
            title: `新建批注 (${M(api)}+Shift+M)`,
            visible: () => !!api.newComment,
            run: () => api.newComment?.(),
          },
        ],
      },
      {
        id: "text",
        label: "文本",
        icon: "textBox",
        items: [
          {
            type: "large",
            id: "insert-text-box",
            label: "文本\n框",
            icon: "textBox",
            title: "文本框",
            pressed: () => api.drawingTool() === "text",
            run: () => api.startDrawing("text"),
          },
          {
            type: "large",
            id: "header-footer",
            label: "页眉和\n页脚",
            icon: "headerFooter",
            title: "页眉和页脚",
            description:
              "向幻灯片添加日期、幻灯片编号或页脚文本。",
            visible: () => !!api.headerFooter,
            run: () => api.headerFooter?.(),
          },
          {
            type: "large",
            id: "wordart",
            label: "艺术字",
            icon: "wordArt",
            title: "艺术字",
            description: "向幻灯片添加装饰性艺术字文本。",
            menu: () => api.wordArtMenu(),
            menuWidth: 300,
          },
          {
            type: "stack",
            items: [
              {
                type: "small",
                id: "date-time",
                label: "日期和时间",
                icon: "dateTime",
                title: "日期和时间",
                description: "插入当前日期或时间。",
                enabled: () => api.canInsertField(),
                menu: () => api.dateTimeMenu(),
              },
              {
                type: "small",
                id: "slide-number",
                label: "幻灯片编号",
                icon: "slideNumber",
                title: "幻灯片编号",
                description: "插入幻灯片编号。",
                enabled: () => api.canInsertField(),
                run: () => api.insertSlideNumber(),
              },
            ],
          },
          {
            type: "large",
            id: "object",
            label: "对象",
            icon: "object",
            title: "对象",
            description: "在演示文稿中嵌入文件，显示为图标。",
            visible: () => !!api.insertObject,
            run: () => api.insertObject?.(),
          },
        ],
      },
      {
        id: "symbols",
        label: "符号",
        icon: "symbol",
        items: [
          {
            type: "large",
            id: "equation",
            label: "公式",
            icon: "equation",
            title: "公式",
            description: "编写数学公式，或插入常用公式。",
            visible: () => !!api.insertEquation,
            split: true,
            run: () => api.insertEquation?.(),
            menu: () => api.equationMenu?.() ?? [],
            menuLabel: "公式",
          },
          {
            type: "large",
            id: "symbol",
            label: "符号",
            icon: "symbol",
            title: "符号",
            description: "添加键盘上没有的字符。",
            enabled: () => api.canInsertField(),
            run: () => api.insertSymbol(),
          },
        ],
      },
      {
        id: "media",
        label: "媒体",
        icon: "video",
        visible: () => !!api.insertVideo,
        items: [
          {
            type: "large",
            id: "video",
            label: "视频",
            icon: "video",
            title: "视频",
            description: "从您的设备插入视频。",
            split: true,
            run: () => api.insertVideo?.(),
            menu: () => api.videoMenu?.() ?? [],
            menuLabel: "视频来源",
          },
          {
            type: "large",
            id: "audio",
            label: "音频",
            icon: "audio",
            title: "音频",
            description: "从您的设备插入音频，或录制音频。",
            split: true,
            run: () => api.insertAudio?.(),
            menu: () => api.audioMenu?.() ?? [],
            menuLabel: "音频来源",
          },
        ],
      },
    ],
  };

  const design = {
    id: "design",
    label: "设计",
    groups: [
      {
        id: "themes",
        label: "主题",
        icon: "themes",
        // The gallery narrows first and folds last, on the narrowest screens.
        priority: 10,
        items: [
          {
            type: "gallery",
            id: "themes",
            label: "主题",
            columns: 7,
            minColumns: 2,
            panelColumns: 4,
            itemClass: "theme-thumb",
            showLabels: false,
            items: () => api.themeChoices(),
            sections: (choices) =>
              api.themeSections?.(choices) ?? [{ label: null, items: choices }],
            selected: () => api.currentTheme(),
            choose: (choice) =>
              api.chooseTheme?.(choice.id) ?? api.applyTheme(choice.id),
            contextMenu: (choice) => api.themeContextMenu?.(choice) ?? [],
            footer: () => api.themeGalleryFooter(),
          },
        ],
      },
      {
        id: "variants",
        label: "变体",
        icon: "variants",
        visible: () => api.variantChoices().length > 0,
        items: [
          {
            type: "gallery",
            id: "variants",
            label: "变体",
            columns: 4,
            minColumns: 2,
            itemClass: "variant-thumb",
            showLabels: false,
            items: () => api.variantChoices(),
            selected: () => api.currentVariant(),
            choose: (choice) => api.applyVariant(choice.id),
            footer: () => api.variantFooter(),
          },
        ],
      },
      {
        id: "theme-parts",
        label: "主题",
        icon: "colors",
        visible: () => !!api.themeColorsMenu,
        items: [
          {
            type: "stack",
            items: [
              {
                type: "small",
                id: "theme-colors",
                label: "颜色",
                showLabel: true,
                icon: "colors",
                title: "颜色",
                description:
                  "更改主题颜色，或创建自定义配色方案。",
                menu: () => api.themeColorsMenu(),
                menuLabel: "主题颜色",
              },
              {
                type: "small",
                id: "theme-fonts",
                label: "字体",
                showLabel: true,
                icon: "fonts",
                title: "字体",
                description: "更改主题的标题和正文字体。",
                menu: () => api.themeFontsMenu(),
                menuLabel: "主题字体",
              },
              {
                type: "small",
                id: "theme-effects",
                label: "效果",
                showLabel: true,
                icon: "effects",
                title: "效果",
                description:
                  "更改遵循主题的形状底纹和轮廓样式。",
                menu: () => api.themeEffectsMenu(),
                menuLabel: "主题效果",
              },
            ],
          },
          {
            type: "large",
            id: "background-styles",
            label: "背景\n样式",
            icon: "backgroundStyles",
            title: "背景样式",
            description:
              "从主题中为所有幻灯片选择背景，或右键单击以应用于所选幻灯片。",
            menu: () => api.backgroundStylesMenu(),
            menuLabel: "背景样式",
          },
        ],
      },
      {
        id: "customize",
        label: "自定义",
        icon: "slideSize",
        items: [
          {
            type: "large",
            id: "slide-size",
            label: "幻灯片\n大小",
            icon: "slideSize",
            title: "幻灯片大小",
            description: "更改此演示文稿中幻灯片的大小。",
            menu: () => api.slideSizeMenu(),
          },
          {
            type: "large",
            id: "format-background",
            label: "设置背景\n格式",
            icon: "formatBackground",
            title: "设置背景格式",
            description: "调整幻灯片的背景。",
            run: () => api.formatBackground(),
          },
          {
            type: "check",
            id: "hide-background-graphics-design",
            label: "隐藏背景图形",
            visible: () => !!api.backgroundGraphicsHidden,
            checked: () => api.backgroundGraphicsHidden(),
            commit: (on) => api.setBackgroundGraphicsHidden(on),
          },
        ],
      },
      {
        id: "design-ideas",
        label: "设计器",
        icon: "designer",
        visible: () => api.hasAssistant(),
        items: [
          {
            type: "large",
            id: "design-designer",
            label: "设计\n灵感",
            icon: "designer",
            title: "设计灵感",
            description:
              "向 AI 助手获取此幻灯片的设计建议。",
            run: () => api.designIdeas(),
          },
        ],
      },
    ],
  };

  const transitions = {
    id: "transitions",
    label: "切换",
    groups: [
      {
        id: "preview",
        label: "预览",
        icon: "previewTransition",
        items: [
          {
            type: "large",
            id: "preview-transition",
            label: "预览",
            icon: "previewTransition",
            title: "预览切换效果",
            description: "播放当前幻灯片的切换效果。",
            enabled: () => api.canPreviewTransition(),
            run: () => api.previewTransition(),
          },
        ],
      },
      {
        id: "transition-gallery",
        label: "切换到此幻灯片",
        icon: "previewTransition",
        collapsible: false,
        items: [
          {
            type: "gallery",
            id: "transition-gallery",
            label: "切换",
            columns: 9,
            panelColumns: 8,
            itemClass: "transition-choice",
            items: () => api.transitionChoices(),
            sections: (choices) => api.transitionSections(choices),
            selected: () => api.currentTransition(),
            choose: (choice) => api.setTransition(choice.id),
          },
          {
            type: "large",
            id: "effect-options",
            label: "效果\n选项",
            icon: "effectOptions",
            title: "效果选项",
            description:
              "更改切换效果的方向或其他选项。",
            enabled: () => api.transitionOptions().length > 0,
            menu: () => api.transitionOptionsMenu(),
          },
        ],
      },
      {
        id: "timing",
        label: "计时",
        icon: "duration",
        items: [
          {
            type: "stack",
            items: [
              {
                type: "small",
                id: "transition-sound",
                label: "声音",
                icon: "transitionSound",
                title: "切换声音",
                description:
                  "切换到此幻灯片时播放声音，或停止正在播放的声音。",
                visible: () => !!api.transitionSoundMenu,
                dynamicLabel: () => api.transitionSoundLabel?.() || "Sound",
                menuWidth: 220,
                menu: () => api.transitionSoundMenu?.(),
              },
              {
                type: "spin",
                id: "transition-duration",
                label: "持续时间",
                icon: "duration",
                width: 66,
                min: 0.01,
                max: 59,
                step: 0.25,
                format: (n) => `${n.toFixed(2)}`,
                enabled: () => api.currentTransition() !== "none",
                value: () => api.transitionDuration(),
                commit: (n) => api.setTransitionDuration(n),
              },
              {
                type: "small",
                id: "apply-to-all",
                label: "全部应用",
                icon: "applyToAll",
                title: "全部应用",
                description:
                  "将此幻灯片的切换效果和计时应用到所有幻灯片。",
                enabled: () => api.canApplyTransitionToAll?.() ?? true,
                run: () => api.applyTransitionToAll(),
              },
            ],
          },
          {
            type: "stack",
            items: [
              { type: "label", label: "换片方式" },
              {
                type: "check",
                id: "advance-on-click",
                label: "单击鼠标时",
                checked: () => api.advanceOnClick(),
                commit: (on) => api.setAdvanceOnClick(on),
              },
              {
                type: "row",
                items: [
                  {
                    type: "check",
                    id: "advance-after-on",
                    label: "在此之后",
                    checked: () => api.advanceAfter() != null,
                    commit: (on) =>
                      api.setAdvanceAfter(
                        on ? (api.advanceAfter() ?? 0) : null,
                      ),
                  },
                  {
                    type: "spin",
                    id: "advance-after",
                    label: "在此之后自动换片",
                    ariaLabel: "Advance after (seconds)",
                    showLabel: false,
                    width: 84,
                    min: 0,
                    max: 86399,
                    step: 1,
                    format: (n) => api.formatSeconds(n),
                    parse: (s) => api.parseSeconds(s),
                    value: () => api.advanceAfter() ?? 0,
                    commit: (n) => api.setAdvanceAfter(n),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const slideShow = {
    id: "slideshow",
    label: "幻灯片放映",
    groups: [
      {
        id: "start",
        label: "开始放映幻灯片",
        icon: "playFromStart",
        items: [
          {
            type: "large",
            id: "play-from-start",
            label: "从头\n开始放映",
            icon: "playFromStart",
            title: "从头开始放映 (F5)",
            description: "从第一张幻灯片开始放映。",
            run: () => api.present({ from: "beginning" }),
          },
          {
            type: "large",
            id: "play-from-current",
            label: "从当前\n幻灯片放映",
            icon: "playFromCurrent",
            title: "从当前幻灯片放映 (Shift+F5)",
            description: "从当前所在的幻灯片开始放映。",
            run: () => api.present({ from: "current" }),
          },
          {
            type: "large",
            id: "presenter-view",
            label: "演讲者\n视图",
            icon: "presenterView",
            title: "演讲者视图 (Alt+F5)",
            description:
              "在屏幕上呈现备注、下一张幻灯片、计时器和工具，而观众只能看到幻灯片。",
            visible: () => !!api.presenterView,
            run: () => api.presenterView?.(),
          },
          {
            type: "large",
            id: "custom-show",
            label: "自定义\n放映",
            icon: "customShow",
            title: "自定义幻灯片放映",
            description:
              "放映指定的幻灯片集合，或创建和修改自定义放映。",
            visible: () => !!api.customShowMenu,
            menu: () => api.customShowMenu?.(),
          },
        ],
      },
      {
        id: "set-up",
        label: "设置",
        icon: "setUpShow",
        items: [
          {
            type: "large",
            id: "set-up-show",
            label: "设置\n幻灯片放映",
            icon: "setUpShow",
            title: "设置幻灯片放映",
            description:
              "选择放映运行方式：演讲者全屏、窗口中或展台展出，放映哪些幻灯片以及如何换片。",
            visible: () => !!api.setUpShow,
            run: () => api.setUpShow?.(),
          },
          {
            type: "large",
            id: "hide-slide",
            label: "隐藏\n幻灯片",
            icon: "hideSlide",
            title: "隐藏幻灯片",
            description:
              "隐藏所选幻灯片；放映时将跳过这些幻灯片。",
            pressed: () => api.slideHidden(),
            run: () => api.toggleHideSlide(),
          },
          {
            type: "large",
            id: "rehearse",
            label: "排练\n计时",
            icon: "rehearse",
            title: "排练计时",
            description:
              "排练演示文稿，同时计时器记录每张幻灯片的停留时间。",
            visible: () => !!api.rehearse,
            run: () => api.rehearse?.(),
          },
          {
            type: "large",
            id: "record-show",
            label: "录制",
            icon: "recordShow",
            title: "录制幻灯片放映",
            description:
              "放映时录制旁白、摄像头和墨迹。选择从何处开始录制、清除录制或导出视频。",
            visible: () => !!api.recordShowMenu,
            split: true,
            menuLabel: "录制选项",
            run: () => api.recordFromCurrent?.(),
            menu: () => api.recordShowMenu?.(),
          },
          {
            type: "stack",
            items: [
              {
                type: "check",
                id: "play-narrations",
                label: "播放旁白",
                visible: () => !!api.setPlayNarrations,
                checked: () => api.playNarrations?.() ?? true,
                commit: (on) => api.setPlayNarrations?.(on),
              },
              {
                type: "check",
                id: "use-timings",
                label: "使用排练计时",
                visible: () => !!api.setUseTimings,
                checked: () => api.useTimings?.() ?? true,
                commit: (on) => api.setUseTimings?.(on),
              },
              {
                type: "check",
                id: "show-media-controls",
                label: "显示媒体控件",
                visible: () => !!api.setShowMediaControls,
                checked: () => api.showMediaControls?.() ?? true,
                commit: (on) => api.setShowMediaControls?.(on),
              },
            ],
          },
        ],
      },
      {
        id: "captions",
        label: "字幕与辅听字幕",
        icon: "subtitles",
        items: [
          {
            type: "stack",
            items: [
              {
                type: "check",
                id: "always-subtitles",
                label: "始终使用字幕",
                visible: () => !!api.setAlwaysSubtitles,
                checked: () => api.alwaysSubtitles?.() ?? false,
                commit: (on) => api.setAlwaysSubtitles?.(on),
              },
              {
                type: "small",
                id: "subtitle-settings",
                label: "字幕设置",
                icon: "subtitleSettings",
                title: "字幕设置",
                description:
                  "选择您的语音语言以及实时字幕显示的位置。",
                visible: () => !!api.subtitleSettingsMenu,
                menu: () => api.subtitleSettingsMenu?.(),
              },
            ],
          },
        ],
      },
    ],
  };

  const review = {
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
            description: "检查演示文稿中文字的拼写。",
            run: () => api.spelling(),
          },
          {
            type: "large",
            id: "thesaurus",
            label: "同义词库",
            icon: "thesaurus",
            title: "同义词库",
            visible: () => !!api.thesaurus,
            run: () => api.thesaurus?.(),
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
              "查找残障人士可能难以阅读的内容。",
            run: () => api.checkAccessibility(),
          },
          {
            type: "large",
            id: "alt-text",
            label: "替代\n文本",
            icon: "altText",
            title: "替代文本",
            description:
              "为使用屏幕阅读器的用户描述所选图片或对象。",
            enabled: () => one(),
            run: () => api.altText(),
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
            id: "language",
            label: "语言",
            icon: "language",
            title: "语言",
            description: "选择所选文本的校对语言。",
            menu: () => api.languageMenu(),
          },
        ],
      },
      {
        id: "review-comments",
        label: "批注",
        icon: "newComment",
        visible: () => !!api.newComment,
        items: [
          {
            type: "large",
            id: "new-comment",
            label: "新建\n批注",
            icon: "newComment",
            title: "新建批注",
            run: () => api.newComment?.(),
          },
          {
            type: "large",
            id: "delete-comment",
            label: "删除",
            icon: "deleteComment",
            title: "删除批注",
            enabled: () => !!api.canDeleteComment?.(),
            menu: () => api.deleteCommentMenu?.(),
          },
          {
            type: "large",
            id: "previous-comment",
            label: "上一条",
            icon: "previousComment",
            title: "上一条批注",
            enabled: () => !!api.hasComments?.(),
            run: () => api.stepComment?.(-1),
          },
          {
            type: "large",
            id: "next-comment",
            label: "下一条",
            icon: "nextComment",
            title: "下一条批注",
            enabled: () => !!api.hasComments?.(),
            run: () => api.stepComment?.(1),
          },
          {
            type: "large",
            id: "show-comments",
            label: "显示\n批注",
            icon: "showComments",
            title: "显示批注",
            pressed: () => !!api.commentsOpen?.(),
            run: () => api.toggleComments?.(),
          },
        ],
      },
    ],
  };

  const viewTab = {
    id: "view",
    label: "视图",
    groups: [
      {
        id: "presentation-views",
        label: "演示文稿视图",
        icon: "normalView",
        items: [
          view("normal", "普通", "normalView"),
          view("outline", "大纲视图", "outlineView"),
          view("sorter", "幻灯片浏览", "slideSorter"),
          view("notesPage", "备注页", "notesPage"),
          view("reading", "阅读视图", "readingView"),
        ],
      },
      {
        id: "master-views",
        label: "母版视图",
        icon: "slideMaster",
        visible: () => !!api.masterView,
        items: [
          {
            type: "large",
            id: "slide-master",
            label: "幻灯片\n母版",
            icon: "slideMaster",
            title: "幻灯片母版",
            description:
              "编辑幻灯片母版及其版式，所有幻灯片的外观均由此决定。",
            run: () => api.masterView?.("slide"),
          },
          {
            type: "large",
            id: "handout-master",
            label: "讲义\n母版",
            icon: "handoutMaster",
            title: "讲义母版",
            description:
              "编辑打印讲义的页眉、页脚和版面布局。",
            run: () => api.masterView?.("handout"),
          },
          {
            type: "large",
            id: "notes-master",
            label: "备注\n母版",
            icon: "notesMaster",
            title: "备注母版",
            description: "编辑备注页在打印时的外观。",
            run: () => api.masterView?.("notes"),
          },
        ],
      },
      {
        id: "show",
        label: "显示",
        icon: "ruler",
        items: [
          {
            type: "stack",
            items: [
              {
                type: "check",
                id: "show-ruler",
                label: "标尺",
                checked: () => api.showing("ruler"),
                commit: (on) => api.show("ruler", on),
              },
              {
                type: "check",
                id: "show-gridlines",
                label: "网格线",
                checked: () => api.showing("gridlines"),
                commit: (on) => api.show("gridlines", on),
              },
              {
                type: "check",
                id: "show-guides",
                label: "参考线",
                checked: () => api.showing("guides"),
                commit: (on) => api.show("guides", on),
              },
            ],
          },
          {
            type: "large",
            id: "notes",
            label: "备注",
            icon: "notesPane",
            title: "备注",
            description: "显示或隐藏幻灯片下方的备注窗格。",
            pressed: () => api.showing("notes"),
            run: () => api.show("notes", !api.showing("notes")),
          },
          {
            type: "small",
            id: "grid-settings",
            label: "网格设置",
            icon: "gridlines",
            showLabel: true,
            title: "网格和参考线",
            description:
              "设置网格间距、对齐方式以及显示的参考线。",
            visible: () => !!api.gridDialog,
            run: () => api.gridDialog(),
          },
        ],
      },
      {
        id: "zoom",
        label: "缩放",
        icon: "zoom",
        items: [
          {
            type: "large",
            id: "zoom",
            label: "缩放",
            icon: "zoom",
            title: "缩放",
            menu: () => api.zoomMenu(),
          },
          {
            type: "large",
            id: "fit-to-window",
            label: "适应\n窗口",
            icon: "fitWindow",
            title: `适应窗口 (${M(api)}+0)`,
            run: () => api.fitToWindow(),
          },
        ],
      },
      {
        id: "color-mode",
        label: "颜色/灰度",
        icon: "color",
        items: [
          {
            type: "stack",
            items: [
              colorMode("color", "彩色", "color"),
              colorMode("grayscale", "灰度", "grayscale"),
              colorMode("blackwhite", "黑白", "blackScreen"),
            ],
          },
        ],
      },
      {
        id: "panes",
        label: "窗格",
        icon: "formatPane",
        items: [
          {
            type: "stack",
            items: [
              {
                type: "toggle",
                id: "view-thumbnails",
                label: "幻灯片缩略图",
                icon: "normalView",
                pressed: () => api.showing("thumbnails"),
                run: () => api.show("thumbnails", !api.showing("thumbnails")),
              },
              {
                type: "toggle",
                id: "view-format-pane",
                label: "设置对象格式",
                icon: "formatPane",
                pressed: () => api.showing("formatPane"),
                run: () => api.show("formatPane", !api.showing("formatPane")),
              },
              {
                type: "toggle",
                id: "view-assistant",
                label: "AI 助手",
                icon: "Sparkles",
                title: `AI 助手 (${M(api)}+J)`,
                visible: () => api.hasAssistant(),
                pressed: () => api.showing("assistant"),
                run: () => api.show("assistant", !api.showing("assistant")),
              },
            ],
          },
        ],
      },
    ],
  };
  function view(id, label, icon) {
    return {
      type: "large",
      id: `view-${id}`,
      label,
      icon,
      title: label,
      visible: () => api.supportsView(id),
      pressed: () => api.currentView() === id,
      run: () => api.setView(id),
    };
  }
  function colorMode(id, label, icon) {
    return {
      type: "toggle",
      id: `color-mode-${id}`,
      label,
      icon,
      pressed: () => api.colorMode() === id,
      run: () => api.setColorMode(id),
    };
  }

  // ---- Contextual tabs ----
  const arrangeGroup = {
    id: "format-arrange",
    label: "排列",
    icon: "arrange",
    items: [
      {
        type: "stack",
        items: [
          {
            type: "small",
            id: "bring-forward",
            label: "上移一层",
            icon: "bringForward",
            title: `上移一层 (${M(api)}+Shift+])`,
            split: true,
            run: () => api.order("forward"),
            menu: () => api.orderMenu("forward"),
          },
          {
            type: "small",
            id: "send-backward",
            label: "下移一层",
            icon: "sendBackward",
            title: `下移一层 (${M(api)}+Shift+[)`,
            split: true,
            run: () => api.order("backward"),
            menu: () => api.orderMenu("backward"),
          },
          {
            type: "small",
            id: "selection-pane",
            label: "选择窗格",
            icon: "selectionPane",
            title: "选择窗格",
            description:
              "查看幻灯片上的所有对象；选择、显示、隐藏及调整其顺序。",
            pressed: () => api.selectionPaneOpen(),
            run: () => api.toggleSelectionPane(),
          },
        ],
      },
      {
        type: "stack",
        items: [
          {
            type: "small",
            id: "align",
            label: "对齐",
            icon: "align",
            title: "对齐对象",
            menu: () => api.alignMenu(),
          },
          {
            type: "small",
            id: "group",
            label: "组合",
            icon: "group",
            title: "组合对象",
            menu: () => api.groupMenu(),
          },
          {
            type: "small",
            id: "rotate",
            label: "旋转",
            icon: "rotate",
            title: "旋转对象",
            menu: () => api.rotateMenu(),
          },
        ],
      },
    ],
  };
  const sizeGroup = {
    id: "format-size",
    label: "大小",
    icon: "size",
    items: [
      {
        type: "stack",
        rows: 2,
        items: [
          {
            type: "spin",
            id: "shape-height",
            label: "高度",
            ariaLabel: "Shape Height",
            icon: "sizeHeight",
            showLabel: false,
            width: 80,
            min: 0.01,
            max: 200,
            step: 0.1,
            format: (n) => `${n.toFixed(2)}″`,
            parse: (s) => parseFloat(s),
            value: () => api.size("h"),
            commit: (n) => api.setSize("h", n),
          },
          {
            type: "spin",
            id: "shape-width",
            label: "宽度",
            ariaLabel: "Shape Width",
            icon: "sizeWidth",
            showLabel: false,
            width: 80,
            min: 0.01,
            max: 200,
            step: 0.1,
            format: (n) => `${n.toFixed(2)}″`,
            parse: (s) => parseFloat(s),
            value: () => api.size("w"),
            commit: (n) => api.setSize("w", n),
          },
        ],
      },
      {
        type: "small",
        id: "format-pane",
        label: "设置对象格式",
        showLabel: false,
        icon: "formatPane",
        title: "设置对象格式",
        description: "打开“设置格式”窗格以微调所选对象。",
        run: () => api.show("formatPane", true),
      },
    ],
  };
  const shapeFormat = {
    id: "shape-format",
    label: "形状格式",
    contextual: true,
    visible: () =>
      shapeSel() ||
      (some() &&
        !pictureSel() &&
        !tableSel() &&
        !["chart", "smartart"].includes(api.selectionKind())),
    groups: [
      {
        id: "insert-shapes",
        label: "插入形状",
        icon: "shapes",
        items: [
          {
            type: "large",
            id: "format-shapes",
            label: "形状",
            icon: "shapes",
            title: "形状",
            menu: () => api.shapesMenu(),
            menuWidth: 300,
          },
          {
            type: "stack",
            items: [
              {
                type: "small",
                id: "change-shape",
                label: "编辑形状",
                icon: "editShape",
                title: "更改形状",
                description:
                  "更改该图形的形状，并保持其格式不变。",
                enabled: () => api.canChangeShape(),
                menu: () => api.changeShapeMenu(),
                menuWidth: 300,
              },
              {
                type: "small",
                id: "merge-shapes",
                label: "合并形状",
                icon: "mergeShapes",
                title: "合并形状",
                description:
                  "将所选形状合并为新形状：结合、组合、拆分、相交或剪除。",
                visible: () => !!api.mergeShapesMenu,
                enabled: () => !!api.canMergeShapes?.(),
                menu: () => api.mergeShapesMenu(),
              },
              {
                type: "small",
                id: "format-text-box",
                label: "文本框",
                icon: "textBox",
                pressed: () => api.drawingTool() === "text",
                run: () => api.startDrawing("text"),
              },
            ],
          },
        ],
      },
      {
        id: "shape-styles",
        label: "形状样式",
        icon: "quickStyles",
        collapsible: false,
        items: [
          {
            type: "gallery",
            id: "shape-styles",
            label: "形状样式",
            columns: 6,
            panelColumns: 7,
            itemClass: "style-thumb",
            showLabels: false,
            enabled: () => api.canStyleShape(),
            items: () => api.shapeStyleChoices(),
            sections: (choices) =>
              api.shapeStyleSections?.(choices) ?? [
                { label: null, items: choices },
              ],
            choose: (choice) => api.applyShapeStyle(choice.id),
          },
          {
            type: "stack",
            items: [
              {
                type: "color",
                id: "format-shape-fill",
                label: "形状填充",
                icon: "shapeFill",
                enabled: () => api.canFill(),
                color: () => api.lastColor("fill"),
                run: () => api.applyLastColor("fill"),
                menu: () => api.colorMenu("fill"),
                menuLabel: "填充颜色",
              },
              {
                type: "color",
                id: "format-shape-outline",
                label: "形状轮廓",
                icon: "shapeOutline",
                enabled: () => api.canOutline(),
                color: () => api.lastColor("line"),
                run: () => api.applyLastColor("line"),
                menu: () => api.colorMenu("line"),
                menuLabel: "轮廓颜色",
              },
              {
                type: "small",
                id: "format-shape-effects",
                label: "形状效果",
                icon: "shapeEffects",
                enabled: () => api.canEffects(),
                menu: () => api.effectsMenu(),
              },
            ],
          },
        ],
      },
      {
        id: "wordart-styles",
        label: "艺术字样式",
        icon: "wordArt",
        items: [
          {
            type: "gallery",
            id: "wordart-gallery",
            label: "艺术字样式",
            columns: 4,
            panelColumns: 6,
            itemClass: "style-thumb",
            showLabels: false,
            enabled: () => !!text(),
            items: () => api.wordArtStyleChoices?.() ?? [],
            choose: (choice) => api.applyWordArtStyle(choice.id),
          },
          {
            type: "stack",
            items: [
              {
                type: "color",
                id: "text-fill",
                label: "文本填充",
                icon: "textFill",
                enabled: () => !!text(),
                color: () => api.lastColor("text"),
                run: () => api.applyLastColor("text"),
                menu: () => api.colorMenu("text"),
                menuLabel: "文本填充颜色",
              },
              {
                type: "color",
                id: "text-outline",
                label: "文本轮廓",
                icon: "textOutline",
                visible: () => api.canTextOutline(),
                enabled: () => !!text(),
                color: () => api.lastColor("textOutline"),
                run: () => api.applyLastColor("textOutline"),
                menu: () => api.colorMenu("textOutline"),
                menuLabel: "文本轮廓颜色",
              },
              {
                type: "small",
                id: "text-effects",
                label: "文本效果",
                icon: "textEffects",
                enabled: () => !!text(),
                menu: () => api.textEffectsMenu(),
              },
            ],
          },
        ],
      },
      {
        id: "accessibility-format",
        label: "辅助功能",
        icon: "altText",
        items: [
          {
            type: "large",
            id: "format-alt-text",
            label: "替代\n文本",
            icon: "altText",
            title: "替代文本",
            enabled: () => one(),
            run: () => api.altText(),
          },
        ],
      },
      arrangeGroup,
      sizeGroup,
    ],
  };

  const pictureFormat = {
    id: "picture-format",
    label: "图片格式",
    contextual: true,
    visible: pictureSel,
    groups: [
      {
        id: "adjust",
        label: "调整",
        icon: "corrections",
        items: [
          {
            type: "large",
            id: "corrections",
            label: "更正",
            icon: "corrections",
            title: "更正",
            description: "使图片变亮或变暗。",
            menu: () => api.correctionsMenu(),
            menuWidth: 240,
          },
          {
            type: "large",
            id: "picture-transparency",
            label: "透明度",
            icon: "transparency",
            title: "透明度",
            description: "使图片呈现半透明效果。",
            menu: () => api.transparencyMenu(),
          },
          {
            type: "large",
            id: "picture-color",
            label: "颜色",
            icon: "pictureColor",
            title: "颜色",
            description:
              "更改图片的饱和度和色调，或进行重新着色。",
            visible: () => !!api.pictureColorMenu,
            menu: () => api.pictureColorMenu(),
            menuWidth: 420,
          },
          {
            type: "large",
            id: "artistic-effects",
            label: "艺术\n效果",
            icon: "artisticEffects",
            title: "艺术效果",
            description:
              "使图片呈现素描、绘画等艺术效果。",
            visible: () => !!api.artisticEffectsMenu,
            menu: () => api.artisticEffectsMenu(),
            menuWidth: 300,
          },
          {
            type: "stack",
            items: [
              {
                type: "small",
                id: "change-picture",
                label: "更改图片",
                icon: "changePicture",
                title: "更改图片",
                description:
                  "替换图片，同时保持其大小和位置不变。",
                run: () => api.changePicture(),
              },
              {
                type: "small",
                id: "reset-picture",
                label: "重设图片",
                icon: "resetPicture",
                title: "重设图片",
                description:
                  "放弃对图片所做的格式更改。",
                run: () => api.resetPicture(),
              },
            ],
          },
        ],
      },
      {
        id: "picture-styles",
        label: "图片样式",
        icon: "pictureEffects",
        items: [
          {
            type: "gallery",
            id: "picture-style-gallery",
            label: "图片样式",
            columns: 4,
            panelColumns: 4,
            itemClass: "style-thumb",
            showLabels: false,
            items: () => api.pictureStyleChoices?.() ?? [],
            choose: (choice) => api.applyPictureStyle(choice.id),
          },
          {
            type: "stack",
            items: [
              {
                type: "color",
                id: "picture-border",
                label: "图片边框",
                icon: "pictureBorder",
                enabled: () => api.canOutline(),
                color: () => api.lastColor("line"),
                run: () => api.applyLastColor("line"),
                menu: () => api.colorMenu("line"),
                menuLabel: "边框颜色",
              },
              {
                type: "small",
                id: "picture-effects",
                label: "图片效果",
                icon: "pictureEffects",
                enabled: () => api.canEffects(),
                menu: () => api.effectsMenu(),
              },
            ],
          },
        ],
      },
      {
        id: "picture-accessibility",
        label: "辅助功能",
        icon: "altText",
        items: [
          {
            type: "large",
            id: "picture-alt-text",
            label: "替代\n文本",
            icon: "altText",
            title: "替代文本",
            run: () => api.altText(),
          },
        ],
      },
      { ...arrangeGroup, id: "picture-arrange" },
      {
        id: "picture-size",
        label: "大小",
        icon: "crop",
        items: [
          {
            type: "large",
            id: "crop",
            label: "裁剪",
            icon: "crop",
            title: "裁剪",
            description: "裁剪掉图片不需要的部分。",
            menu: () => api.cropMenu(),
          },
          ...sizeGroup.items,
        ],
      },
    ],
  };

  const tableDesign = {
    id: "table-design",
    label: "表格设计",
    contextual: true,
    visible: tableSel,
    groups: [
      {
        id: "table-style-options",
        label: "表格样式选项",
        icon: "tableStyles",
        items: [
          {
            type: "stack",
            items: [
              tableFlag("firstRow", "Header Row"),
              tableFlag("lastRow", "Total Row"),
              tableFlag("bandRow", "Banded Rows"),
            ],
          },
          {
            type: "stack",
            items: [
              tableFlag("firstCol", "First Column"),
              tableFlag("lastCol", "Last Column"),
              tableFlag("bandCol", "Banded Columns"),
            ],
          },
        ],
      },
      {
        id: "table-styles",
        label: "表格样式",
        icon: "tableStyles",
        collapsible: false,
        items: [
          {
            type: "gallery",
            id: "table-styles",
            label: "表格样式",
            columns: 6,
            panelColumns: 7,
            itemClass: "table-style-thumb",
            showLabels: false,
            items: () => api.tableStyleChoices(),
            selected: () => api.currentTableStyle(),
            choose: (choice) => api.applyTableStyle(choice.id),
          },
          {
            type: "stack",
            items: [
              {
                type: "color",
                id: "table-shading",
                label: "底纹",
                icon: "shading",
                color: () => api.lastColor("cell"),
                run: () => api.applyLastColor("cell"),
                menu: () => api.colorMenu("cell"),
                menuLabel: "底纹颜色",
              },
            ],
          },
        ],
      },
    ],
  };
  function tableFlag(key, label) {
    return {
      type: "check",
      id: `table-${key}`,
      label,
      checked: () => api.tableFlag(key),
      commit: (on) => api.setTableFlag(key, on),
    };
  }
  const tableLayout = {
    id: "table-layout",
    label: "版式",
    contextual: true,
    visible: tableSel,
    groups: [
      {
        id: "rows-columns",
        label: "行和列",
        icon: "insertBelow",
        items: [
          {
            type: "large",
            id: "table-delete",
            label: "删除",
            icon: "deleteTable",
            title: "删除行、列或表格",
            menu: () => api.tableDeleteMenu(),
          },
          tableCommand(
            "insert-above",
            "Insert\nAbove",
            "insertAbove",
            "rowAbove",
          ),
          tableCommand(
            "insert-below",
            "Insert\nBelow",
            "insertBelow",
            "rowBelow",
          ),
          tableCommand("insert-left", "Insert\nLeft", "insertLeft", "colLeft"),
          tableCommand(
            "insert-right",
            "Insert\nRight",
            "insertRight",
            "colRight",
          ),
        ],
      },
      {
        id: "merge",
        label: "合并",
        icon: "mergeCells",
        visible: () => !!api.mergeCells,
        items: [
          {
            type: "large",
            id: "merge-cells",
            label: "合并\n单元格",
            icon: "mergeCells",
            enabled: () => !!api.canMergeCells?.(),
            run: () => api.mergeCells?.(),
          },
          {
            type: "large",
            id: "split-cells",
            label: "拆分\n单元格",
            icon: "splitCells",
            enabled: () => !!api.canSplitCells?.(),
            run: () => api.splitCells?.(),
          },
        ],
      },
      {
        id: "cell-size",
        label: "单元格大小",
        icon: "distributeRows",
        items: [
          {
            type: "stack",
            items: [
              {
                type: "small",
                id: "distribute-rows",
                label: "平均分布各行",
                icon: "distributeRows",
                run: () => api.distributeTable("rows"),
              },
              {
                type: "small",
                id: "distribute-columns",
                label: "平均分布各列",
                icon: "distributeColumns",
                run: () => api.distributeTable("cols"),
              },
            ],
          },
        ],
      },
      {
        id: "table-alignment",
        label: "对齐方式",
        icon: "alignCenter",
        items: [
          {
            type: "stack",
            rows: 2,
            items: [
              {
                type: "row",
                items: [
                  align("left", "Align Left", "alignLeft", `${M(api)}+L`),
                  align("center", "Center", "alignCenter", `${M(api)}+E`),
                  align("right", "Align Right", "alignRight", `${M(api)}+R`),
                ],
              },
              {
                type: "row",
                items: [
                  anchor("top", "Align Top", "valignTop"),
                  anchor("center", "Center Vertically", "valignMiddle"),
                  anchor("bottom", "Align Bottom", "valignBottom"),
                ],
              },
            ],
          },
        ],
      },
      { ...arrangeGroup, id: "table-arrange" },
    ],
  };
  function tableCommand(id, label, icon, where) {
    return {
      type: "large",
      id: `table-${id}`,
      label,
      icon,
      title: label,
      run: () => api.tableInsert(where),
    };
  }
  function anchor(value, label, icon) {
    return {
      type: "toggle",
      id: `anchor-${value}`,
      label,
      showLabel: false,
      icon,
      title: label,
      enabled: () => !!text(),
      pressed: () => api.anchor() === value,
      run: () => api.setAnchor(value),
    };
  }

  // Tabs from other modules join after the tab they name, or with the
  // contextual tabs at the end.
  const extra = api.extraTabs ? api.extraTabs() : [];
  // The Review tab comes from the review module when the editor has one.
  const reviewTab = api.reviewTab ? api.reviewTab(api) : review;
  const tabs = [
    home,
    insert,
    design,
    transitions,
    slideShow,
    reviewTab,
    viewTab,
  ];
  for (const t of extra.filter((t) => !t.contextual)) {
    const at = tabs.findIndex((x) => x.id === t.after);
    tabs.splice(at >= 0 ? at + 1 : tabs.length, 0, t);
  }
  tabs.push(
    shapeFormat,
    pictureFormat,
    tableDesign,
    tableLayout,
    ...extra.filter((t) => t.contextual),
  );
  return tabs;
}
