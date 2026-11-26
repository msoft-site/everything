import { addTranslations, language } from "./i18n.js";
import { SHAPES, SHAPE_FAMILIES } from "./shapes.js";
import { fold } from "./search-fold.js";
// French labels for the specialist shape families and the content library.
// Kept locally too, so search matches both languages in either interface.
const FRENCH = {
  Rectangle: "矩形",
  Ellipse: "椭圆",
  Diamond: "菱形",
  Triangle: "三角形",
  Parallelogram: "平行四边形",
  Hexagon: "六边形",
  Star: "星形",
  Cylinder: "圆柱体",
  Terminator: "终结符",
  Process: "流程",
  "Start or end": "开始或结束",
  Decision: "判定",
  "Input or output": "输入或输出",
  Database: "数据库",
  Preparation: "准备",
  "Basic shape": "基本形状",
  "Sticky note": "便签",
  Text: "Texte",
  Document: "文档",
  "Multiple documents": "多个文档",
  "Predefined process": "预定义流程",
  "Manual input": "手动输入",
  "Manual operation": "手动操作",
  Delay: "延迟",
  Display: "显示",
  "Off-page connector": "离页连接器",
  Or: "或",
  "Summing junction": "求和点",
  "Internal storage": "内部存储",
  Merge: "合并",
  Cloud: "云端",
  Server: "服务器",
  Queue: "队列",
  "User or actor": "用户或演员",
  "Mobile device": "移动设备",
  Laptop: "Ordinateur portable",
  "Browser window": "浏览器窗口",
  Firewall: "防火墙",
  "Load balancer": "负载均衡器",
  API: "API",
  Container: "容器",
  "Data store": "数据存储",
  Touchpoint: "接触点",
  "Pain point": "痛点",
  "Positive emotion": "积极情绪",
  "Neutral emotion": "中性情绪",
  "Negative emotion": "负面情绪",
  "Lane header": "车道标头",
  "Start event": "开始活动",
  "Intermediate event": "中间事件",
  "End event": "结束活动",
  Task: "任务",
  Subprocess: "子流程",
  "Exclusive gateway": "专属网关",
  "Parallel gateway": "并行网关",
  "Inclusive gateway": "普惠网关",
  "Data object": "数据对象",
  Class: "类",
  Note: "便签",
  Package: "包",
  Button: "按钮",
  "Text input": "文字输入",
  Checkbox: "复选框",
  "Radio button": "单选按钮",
  "Selected radio button": "选定的单选按钮",
  Toggle: "开关",
  Dropdown: "下拉菜单",
  "Search bar": "搜索栏",
  "Navigation bar": "导航栏",
  "Tab bar": "标签栏",
  Card: "卡片",
  "Image placeholder": "图片占位符",
  Avatar: "Avatar",
  "Modal dialog": "模态对话框",
  "Mobile phone frame": "手机边框",
  "Tablet frame": "平板电脑画框",
  Slider: "滑块",
  "Progress bar": "进度条",
  Pagination: "分页",
  "Text placeholder": "文本占位符",
  Flowchart: "流程图",
  Architecture: "架构",
  "Data flow": "数据流",
  "Service blueprint": "服务蓝图",
  "Journey map": "旅程地图",
  BPMN: "BPMN",
  UML: "UML",
  Wireframe: "线框图",
  "Basic shapes": "基本形状",
  "Architecture and data flow": "架构和数据流",
  "Service blueprint and journey": "服务蓝图与历程",
  "Data (input or output)": "数据（输入或输出）",
  Extract: "提取",
  Actor: "参与者",
  "Text and notes": "文字和注释",
  "Search shapes": "搜索形状",
  "Shape families": "塑造家庭",
  "No shapes found.": "没有找到形状。",
  All: "全部",
  Templates: "模板",
  Components: "组件",
  "Icons and stickers": "图标与贴纸",
  "Library sections": "图书馆部分",
  "Template categories": "模板分类",
  Playbooks: "演练方案",
  Playbook: "演练方案",
  "Search components": "搜索组件",
  "Component groups": "组件组",
  "No components found.": "未找到任何组件。",
  "Search icons": "搜索图标",
  "Icon categories": "图标类别",
  "Icon color": "图标颜色",
  "No icons found.": "没有找到图标。",
  "Insert component": "插入元件",
  "Insert icon": "插入图标",
  "Insert sticker": "插入贴纸",
  "Open a board to insert components and icons.": "打开白板以插入组件和图标。",
  "Template library, components, and icons": "模板库、组件与图标",
  "Saved {date}": "已保存 {date}",
  "No templates found in this category.":
    "此类别中未找到模板。",
  "Search all categories": "搜索所有类别",
};
addTranslations(FRENCH);
// Search matching ignores case and accents, and treats typed and curly
// apostrophes and the œ and æ ligatures alike, as French text uses them.
export { fold };
// Library search: hyphens and slashes separate words, so "mind-map" reads
// as "mind map", and each text is also kept without spaces, so "mindmap"
// or "kickoff" finds "mind map" or "kick-off".
const searchable = (value) => fold(value).replace(/[-‐‑/_]+/g, " ");
export const searchIndex = (value) => {
  const text = searchable(value);
  return { text, joined: text.replace(/\s+/g, "") };
};
export const searchWords = (query) =>
  searchable(query).split(/\s+/).filter(Boolean);
// A word matches as typed, run together, or without a plural ending
// ("retrospectives", "user stories", "cartes mentales", "tableaux"). Words of one or two
// letters, such as "PI" or "UX", match only at the start of a word, not
// inside "prioritization".
export function matchesWord({ text, joined }, word) {
  if (word.length <= 2) return ` ${text}`.includes(` ${word}`);
  if (text.includes(word) || (word.length >= 6 && joined.includes(word)))
    return true;
  if (word.length <= 3) return false;
  // "stories" and "activities" end in -y once singular.
  const singular = [
    word.replace(/(?<=[^s])[sx]$/, ""),
    word.replace(/ies$/, "y"),
  ];
  return singular.some((form) => form !== word && text.includes(form));
}
// Names sort as people read them: "Board 2" before "Board 10", with the
// interface language's collation.
// One collator per language: comparing with options builds one each time.
const collators = new Map();
export const compareNames = (a, b) => {
  if (!collators.has(language))
    collators.set(language, new Intl.Collator(language, { numeric: true }));
  return collators.get(language).compare(String(a), String(b));
};
const names = new Map(SHAPES.map((s) => [s.key, s]));
// Library entries with display names; the same key can appear in several
// families under a domain name.
export function shapeFamilies(change = false) {
  const families = SHAPE_FAMILIES.map((family) => ({
    ...family,
    shapes: family.shapes.map(({ key, name }) => ({
      key,
      name: name || names.get(key).name,
      hint: names.get(key).hint,
    })),
  }));
  if (change)
    families.unshift({
      id: "text",
      name: "Text and notes",
      shapes: [
        { key: "note", name: "Sticky note" },
        { key: "text", name: "Text" },
      ],
    });
  return families;
}
// Matches every word in English or French names, hints and family names.
export function searchShapes(query = "", family = "", change = false) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return shapeFamilies(change)
    .filter((f) => !family || f.id === family)
    .map((f) => ({
      ...f,
      shapes: f.shapes.filter((s) => {
        const text = fold(
          [s.key, s.name, s.hint || "", f.name]
            .flatMap((v) => [v, translate(v)])
            .join(" "),
        );
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((f) => f.shapes.length);
}
const translate = (value) => FRENCH[value] || value;
// Inline SVG for an icon library entry, drawn like the interface icons.
export function iconSvg(node) {
  const body = node
    .map(
      ([tag, attrs]) =>
        `<${tag} ${Object.entries(attrs)
          .map(([k, v]) => `${k}="${String(v).replace(/"/g, "")}"`)
          .join(" ")}/>`,
    )
    .join("");
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
