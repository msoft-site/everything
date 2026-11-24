import { SHAPES } from "./shapes.js";
export let language = "zh-CN";
try {
  language =
    localStorage.getItem("whiteboard-language") === "en" ? "en" : "zh-CN";
} catch {}
export function setLanguage(value) {
  language = value === "en" ? "en" : "zh-CN";
  try {
    localStorage.setItem("whiteboard-language", language);
  } catch {}
  document.documentElement.lang = language;
}
// Without a prototype, text such as "constructor" is never a translation.
const pairs = {
  __proto__: null,
  "Move selection": "移动所选内容",
  "In frame": "在画框内",
  Group: "组合",
  Contains: "包含",
  "visible object": "个可见对象",
  "visible objects": "个可见对象",
  "Mind map parent": "思维导图父节点",
  "Content language": "内容语言",
  "Whole comment": "整条评论",
  "Selected text": "所选文本",
  "The comment text changed. Reopen Content language to select the passage again.":
    "评论文本已更改。请重新打开“内容语言”以再次选择段落。",
  "Apply to": "应用于",
  "Language tag": "语言标签",
  "Selected text or next typed text":
    "所选文本或接下来输入的文本",
  "Whole object": "整个对象",
  "Whole field": "整个字段",
  "Select complete characters to set their language.":
    "请选择完整的字符以设置其语言。",
  "Apply language": "应用语言",
  "Enter a language tag, such as en, fr-CA, or es. Leave empty to inherit the surrounding language.":
    "输入语言标签，例如 zh-CN、en 或 es。留空则继承上下文语言。",
  "Enter a valid language tag, such as en or fr-CA.":
    "请输入有效的语言标签，例如 zh-CN 或 en。",
  "Select multiple objects": "选择多个对象",
  "Turn on Select multiple objects, then click objects to add or remove them. Choose Done to use the selection.":
    "开启“选择多个对象”，然后点击对象进行添加或移除。选择“完成”以使用所选内容。",
  "Start horizontal position": "起点水平位置",
  "Start vertical position": "起点垂直位置",
  "End horizontal position": "终点水平位置",
  "End vertical position": "终点垂直位置",
  "Choose an object for each end, or select Free endpoint and enter its position in board pixels.":
    "为每一端选择一个对象，或选择“自由端点”并输入其白板像素位置。",
  "The endpoints exceed the board limits. Choose closer positions.":
    "端点超出白板范围，请选择更近的位置。",
  "Extend selection": "扩展选择",
  "Turn on Extend selection, then click another cell to select a range.":
    "开启“扩展选择”，然后点击另一个单元格以选择范围。",
  "Set export region": "设置导出区域",
  "Use region": "使用此区域",
  "Enter the top-left position and size of the export region in board pixels.":
    "以白板像素为单位输入导出区域的左上角位置和尺寸。",
  "Move pin": "移动标记",
  "Horizontal position": "水平位置",
  "Vertical position": "垂直位置",
  "Set the pin position in board pixels.":
    "以白板像素为单位设置标记位置。",
  "This pin moved. Close and reopen Move pin to use its current position.":
    "此标记已移动。请关闭并重新打开“移动标记”以使用其当前位置。",
  Position: "位置",
  "Horizontal distance": "水平距离",
  "Vertical distance": "垂直距离",
  "Apply move": "应用移动",
  "Select objects that can be moved.":
    "请选择可移动的对象。",
  "Move exceeds the board limits. Enter a smaller distance.":
    "移动距离超出白板范围，请输入较小的距离。",
  "Move the selection and its contents by a distance in board pixels. Positive values move right or down; negative values move left or up.":
    "按白板像素距离移动所选内容及其包含项。正值向右或向下移动；负值向左或向上移动。",
  "Enable letter and symbol shortcuts":
    "启用字母和符号快捷键",
  "Turn off shortcuts such as N, Shift + N, and ? to avoid accidental actions. Ctrl/Cmd and Alt/Option shortcuts remain available. This preference is saved on this device and shared with other open tabs.":
    "关闭 N、Shift + N 和 ? 等快捷键以避免误操作。Ctrl/Cmd 和 Alt/Option 快捷键仍然可用。此偏好设置保存在当前设备上，并与其他打开的标签页共享。",
  "Image proportions are too extreme to replace.":
    "图片比例过于极端，无法替换。",
  "Replace image": "替换图片",
  "Replace from board": "从白板替换",
  "Upload from device": "从设备上传",
  "Image URL": "图片 URL",
  "Load image": "加载图片",
  "Images on this board": "此白板上的图片",
  "Find an image": "查找图片",
  "Previous images": "上一组图片",
  "Next images": "下一组图片",
  "Replacement preview": "替换预览",
  "Choose a replacement image.": "选择要替换的图片。",
  "Loading image…": "正在加载图片…",
  "Ready to replace. Undo restores the previous image.":
    "已准备好替换。撤销可恢复上一张图片。",
  "This image is already in place.": "当前已是此图片。",
  "No other images on this board.": "此白板上没有其他图片。",
  "Image replaced. Undo restores it.":
    "图片已替换。撤销可恢复原图。",
  "Replacement closed because the image changed or is no longer editable.":
    "由于图片已更改或不再可编辑，替换已关闭。",
  "Keep the image’s size, position, rotation, mask, links, and comments. The replacement fills its current area; use Crop image to adjust it.":
    "保留图片的尺寸、位置、旋转角度、遮罩、链接和评论。替换图片将填充当前区域；可使用“裁剪图片”进行调整。",
  "Enter an HTTP or HTTPS image URL.":
    "请输入 HTTP 或 HTTPS 图片 URL。",
  "This image could not be loaded. Download it and choose Upload from device.":
    "无法加载此图片。请将其下载后选择“从设备上传”。",
  "Loading timed out. Try again or upload from device.":
    "加载超时。请重试或从设备上传。",
  "Clear content": "清除内容",
  "Clear content (Ctrl/Cmd Backspace)":
    "清除内容 (Ctrl/Cmd Backspace)",
  "Clear content of sticky notes and shapes":
    "清除便签和形状的内容",
  "Select sticky notes or shapes to clear.":
    "请选择要清除内容的便签或形状。",
  "The selected content is already empty.":
    "所选内容已为空。",
  "Content cleared. Undo restores it.":
    "内容已清除。撤销可恢复。",
  "Select object in group": "选择组合内的对象",
  "Select whole group": "选择整个组合",
  "Select an object inside a group first.":
    "请先选择组合内的一个对象。",
  "Inside group · Double-click to edit · Escape selects the group":
    "在组合内 · 双击进行编辑 · 按 Escape 选择整个组合",
  "Double-click an object to select it within this group.":
    "双击对象即可在此组合内选中它。",
  "Lock group": "锁定组合",
  "Select a group member or edit the focused object":
    "选择组合成员或编辑当前聚焦的对象",
  "Select a group member / whole group":
    "选择组合成员 / 整个组合",
  "Selection settings": "选择设置",
  "Precise selection": "精确选择",
  "Precise selection: enclose at least 90% of each object.":
    "精确选择：框住每个对象至少 90% 的区域。",
  "Select objects when at least 90% is inside the selection box. Turn off to select touched objects. Tables and mind map nodes always require 90% coverage.":
    "当对象至少有 90% 位于选择框内时将其选中。关闭后碰触即选中。表格和思维导图节点始终需要 90% 的覆盖率。",
  "Hold the mouse or your finger still for a moment, then drag to use precise selection over background objects. Hold Shift while dragging to add to your selection. Escape cancels.":
    "按住鼠标或手指停留片刻，然后拖动即可在背景对象上方使用精确选择。拖动时按住 Shift 键可添加到所选内容。按 Escape 取消。",
  "Filter selection": "筛选所选内容",
  "Choose the object type to keep selected.":
    "选择要保持选中的对象类型。",
  "Groups stay together. Frames keep their contents; mind map nodes keep their branches.":
    "组合保持整体。画框保留其内容；思维导图节点保留其分支。",
  "The selection changed. Choose a type again.":
    "所选内容已更改，请重新选择类型。",
  "This link is no longer on the board.": "此链接已不在白板上。",
  "The attachment is still downloading. Try again shortly.":
    "附件仍在下载中，请稍后重试。",
  "These objects are no longer on the board.":
    "这些对象已不在白板上。",
  "Connection lines": "连接线",
  Drawings: "手绘",
  Images: "图片",
  Tables: "表格",
  Links: "链接",
  Attachments: "附件",
  "Mind map nodes": "思维导图节点",
  Groups: "组合",
  Frames: "画框",
  "Object dimensions": "对象尺寸",
  "Show dimensions and matching-size guides":
    "显示尺寸和等尺寸参考线",
  "See the selection’s width and height in board pixels. Resize near another object’s width or height to match its size.":
    "查看所选内容的宽度和高度（白板像素）。调整大小接近另一个对象的宽度或高度时可匹配其尺寸。",
  "Matching sizes uses Snap to objects. Hold Alt/Option to bypass snapping. Exact numeric dimensions stay precise.":
    "尺寸匹配使用“吸附到对象”。按住 Alt/Option 可跳过吸附。精确数值尺寸始终保持准确。",
  "Grid and snapping": "网格与吸附",
  "Canvas grid": "画布网格",
  "No grid": "无网格",
  "Line grid": "线条网格",
  "Dot grid": "点状网格",
  "Snap to grid": "吸附到网格",
  "New objects, moves, and resize edges snap to the visible grid. Object alignment guides take priority.":
    "新建对象、移动和调整边缘大小将吸附到可见网格。对象对齐参考线优先。",
  "Hold Ctrl/Cmd or Alt/Option during a gesture to bypass grid snapping. Keyboard nudges and exact dimensions stay precise.":
    "操作时按住 Ctrl/Cmd 或 Alt/Option 可跳过网格吸附。键盘微调和精确尺寸始终保持准确。",
  Follow: "跟随",
  Following: "正在跟随",
  "Following you": "正在跟随您",
  "one|{count} following you": "{count} 人正在跟随您",
  "{count} following you": "{count} 人正在跟随您",
  "Stop following": "停止跟随",
  "Bring to me": "带到我的视图",
  "Bring everyone to me": "将所有人带到我的视图",
  "Live navigation": "实时导航",
  Live: "实时",
  "Not live yet": "尚未实时连接",
  "Live cursors off": "实时光标已关闭",
  "Others’ cursors and changes in progress cannot be shown right now. Their saved edits still appear.":
    "目前无法显示其他人的光标和正在进行的更改。他们已保存的编辑仍会显示。",
  "Board access": "白板访问权限",
  "Find a participant": "查找参与者",
  "Show collaborator cursors": "显示协作者光标",
  "No other participants are on this board.":
    "此白板上没有其他参与者。",
  "{count} participants": "{count} 位参与者",
  "{name} joined": "{name} 已加入",
  "{count} people joined": "{count} 人已加入",
  "{name} left": "{name} 已离开",
  "{count} people left": "{count} 人已离开",
  "Being edited by {names}": "{names} 正在编辑",
  "{count} participant": "{count} 位参与者",
  "{count} participants, including you": "包括您共有 {count} 位参与者",
  "{count} participant, including you": "包括您共有 {count} 位参与者",
  "{count} person": "{count} 人",
  "{count} people": "{count} 人",
  "Find a person": "查找人员",
  "{name} mentioned you in a comment.":
    "{name} 在评论中提及了您。",
  "{count} with new messages": "{count} 个包含新消息",
  "New messages": "新消息",
  Someone: "有人",
  "Open discussion": "打开讨论",
  "Click to add the shape · Drag to draw it at a size":
    "点击添加形状 · 拖动绘制指定大小",
  "Align and distribute": "对齐与分布",
  "Share this board?": "分享此白板？",
  "Sharing moves this board into your Puter account, so the people you invite can open it and work on it with you. It stays a shared board from then on; Duplicate still makes a personal copy.":
    "分享会将此白板移至您的 Puter 账户中，以便受邀人员打开并与您协作。此后它将保持为共享白板；“复制”仍可创建个人副本。",
  "Clear search": "清除搜索",
  "Vertical alignment": "垂直对齐",
  "Align text top": "文本顶端对齐",
  "Align text middle": "文本垂直居中",
  "Align text bottom": "文本底端对齐",
  "and {count} more": "以及另外 {count} 个",
  "Show removed people": "显示已移除的人员",
  "No one matches your search.": "没有匹配搜索条件的人员。",
  "{count} selected note": "{count} 张所选便签",
  "{count} selected notes": "{count} 张所选便签",
  "{count} tag": "{count} 个标签",
  "{count} tags": "{count} 个标签",
  "{count} note": "{count} 张便签",
  "{count} notes": "{count} 张便签",
  "{count} cluster": "{count} 个聚类",
  "{count} clusters": "{count} 个聚类",
  "{count} extra copy": "{count} 个额外副本",
  "{count} extra copies": "{count} 个额外副本",
  "{count} guide": "{count} 篇指南",
  "{count} guides": "{count} 篇指南",
  "No participants match your search.":
    "没有匹配搜索条件的参与者。",
  "Invited you to follow": "邀请您跟随视图",
  Presenting: "正在演示",
  "Others are following": "其他人正在跟随",
  Dismiss: "关闭",
  "Follow a participant’s view. Pan, zoom, click the board, or press Escape to stop.":
    "跟随参与者的视图。平移、缩放、点击白板或按 Escape 即可停止跟随。",
  "Cannot follow a circular chain.":
    "无法进行循环跟随。",
  "Following stopped because the live view is unavailable.":
    "由于实时视图不可用，已停止跟随。",
  "Following stopped to avoid a loop.":
    "为避免循环跟随，已停止跟随。",
  "Asked participants to follow you.":
    "已邀请参与者跟随您。",
  "Asked {name} to follow you.": "已邀请 {name} 跟随您。",
  "A live connection is needed to bring participants to your view.":
    "需要实时连接才能将参与者带到您的视图。",
  "Could not send the follow request. Try again.":
    "无法发送跟随请求，请重试。",

  "Workshop timer": "研讨计时器",
  Timer: "计时器",
  Minimize: "最小化",
  "Time remaining": "剩余时间",
  Minutes: "分钟",
  Seconds: "秒",
  min: "分钟",
  "Start timer": "开始计时",
  "Pause timer": "暂停计时",
  "Resume timer": "继续计时",
  "Reset timer": "重置计时",
  "Play a chime on this device": "在此设备上播放提示音",
  "Invalid workshop timer.": "研讨计时器无效。",
  "The timer can run for up to 24 hours.":
    "计时器最长可运行 24 小时。",
  "Set a timer from 1 second to 24 hours.":
    "设置 1 秒到 24 小时之间的计时器。",
  "Time’s up.": "时间到。",
  Ready: "就绪",
  "Counting down": "正在倒计时",
  Paused: "已暂停",
  "The timer is shared with everyone on this board. Editors can control it.":
    "计时器与此白板上的所有人共享。编辑者可以控制它。",
  "The timer keeps counting when minimized or when you leave this board.":
    "最小化或离开此白板时，计时器仍会继续计时。",

  "selected note": "张所选便签",
  tag: "个标签",
  Tags: "标签",
  tags: "个标签",
  Tag: "标签",
  "All tags": "所有标签",
  "Tag name": "标签名称",
  "Tag color": "标签颜色",
  "Current color": "当前颜色",
  "Create tag": "创建标签",
  "Edit tag": "编辑标签",
  "Save tag": "保存标签",
  "Search tags": "搜索标签",
  "No matching tags.": "没有匹配的标签。",
  "No matching tags. Press Enter to create “{name}”.":
    "没有匹配的标签。按 Enter 创建“{name}”。",
  "Find tagged notes": "查找带此标签的便签",
  "Delete tag from board": "从白板删除标签",
  "selected notes": "张所选便签",
  "This selection is protected.": "所选内容受保护。",
  "This tag changed. Reopen its settings.":
    "此标签已更改，请重新打开其设置。",
  "A sticky note can have up to 8 tags.":
    "每张便签最多可添加 8 个标签。",
  "A board can contain up to 1,000 tags.":
    "每个白板最多可包含 1,000 个标签。",
  "Invalid board tag.": "白板标签无效。",
  "Enter a tag name.": "请输入标签名称。",
  "A tag with this name already exists.":
    "已存在同名标签。",
  "This tag is also used on content hidden from you.":
    "此标签也用于对您隐藏的内容。",
  "Unlock tagged objects before changing this tag.":
    "修改此标签前，请先解锁带此标签的对象。",
  "Tags apply to selected sticky notes. Renaming, recoloring, or deleting a tag affects the whole board. Up to 8 tags per note.":
    "标签应用于所选便签。重命名、更改颜色或删除标签会影响整个白板。每张便签最多 8 个标签。",
  "Column width": "列宽",
  "Row height": "行高",
  "Fit columns to text": "列宽适应文本",
  "Fit rows to text": "行高适应文本",
  "Equal column widths": "统一列宽",
  "Equal row heights": "统一行高",
  "Resize column": "调整列宽",
  "Resize row": "调整行高",
  "Enter a valid row height or column width.":
    "请输入有效的行高或列宽。",
  "Collapse branch": "折叠分支",
  "Expand branch": "展开分支",
  "Mind map branches": "思维导图分支",
  "hidden node": "个隐藏节点",
  "hidden comment": "条隐藏评论",
  "hidden nodes": "个隐藏节点",
  "hidden comments": "条隐藏评论",
  "{count} hidden node": "{count} 个隐藏节点",
  "{count} hidden comment": "{count} 条隐藏评论",
  "{count} hidden nodes": "{count} 个隐藏节点",
  "{count} hidden comments": "{count} 条隐藏评论",
  "hidden in collapsed branches": "隐藏在折叠的分支中",
  "Ctrl or Cmd + Enter to finish. Escape to cancel.":
    "按 Ctrl 或 Cmd + Enter 完成。按 Escape 取消。",
  "Moving a child without reassignment, or resizing it, switches to manual layout.":
    "移动子节点而不重新分配父节点，或者调整其大小，将切换为手动布局。",
  "Add child node": "添加子节点",
  "Release to attach to": "松开以连接到",
  "Hold Ctrl/Cmd to move without reassigning":
    "按住 Ctrl/Cmd 可移动而不重新分配父节点",
  "Moving branch without reassigning":
    "正在移动分支（不重新分配父节点）",
  "Drag onto another node to move this branch · Hold Ctrl/Cmd to move freely":
    "拖到另一个节点上以移动此分支 · 按住 Ctrl/Cmd 自由移动",
  "Create mind map branches": "创建思维导图分支",
  "Add child above": "在上方添加子节点",
  "Add child to the right": "在右侧添加子节点",
  "Add child below": "在下方添加子节点",
  "Add child to the left": "在左侧添加子节点",
  "Add sibling node": "添加同级节点",
  "Central idea": "中心主题",
  "New idea": "新想法",
  "Untitled node": "未命名节点",
  "Unlock “{name}” first: the mind map’s layout moves it.":
    "请先解锁“{name}”：思维导图布局会移动它。",
  "Mind map controls": "思维导图控制项",
  "Move mind map branch": "移动思维导图分支",
  "Move branch earlier": "前移分支",
  "Move branch later": "后移分支",
  "Select a mind map node first.":
    "请先选择一个思维导图节点。",
  "Layout nodes": "排列节点",
  "Branch direction": "分支方向",
  "Branch lines": "分支线条",
  "Keep current directions": "保持当前方向",
  "Automatically lay out new branches":
    "自动排列新分支",
  "Find parent node": "查找父节点",
  "Make a separate mind map": "拆分为独立思维导图",
  "This mind map changed. Reopen its controls.":
    "此思维导图已更改，请重新打开其控制项。",
  "A branch cannot be moved inside itself.":
    "不能将分支移动到其自身内部。",
  "The mind map is too large. Move it closer to the center or split a branch.":
    "思维导图过大。请将其移近中心或拆分分支。",
  "Tab adds a child · Enter adds a sibling · Shift+Enter adds a line · Arrow keys navigate nodes":
    "Tab 添加子节点 · Enter 添加同级节点 · Shift+Enter 换行 · 方向键浏览节点",

  "Object link": "对象链接",
  "Edit cell": "编辑单元格",
  "Select one table first.": "请先选择一个表格。",
  "Insert row above": "在上方插入行",
  "Insert row below": "在下方插入行",
  "Delete selected rows": "删除所选行",
  "Insert column left": "在左侧插入列",
  "Insert column right": "在右侧插入列",
  "Delete selected columns": "删除所选列",
  "Clear cells": "清除单元格内容",
  "Use latest value": "使用最新值",
  "This table is protected.": "此表格受保护。",
  "This table changed. Reopen its properties before applying these edits.":
    "此表格已更改。应用这些修改前，请重新打开其属性。",
  "Keep at least one row and one column.":
    "请至少保留一行和一列。",
  "Cell draft kept. Reopen the cell to review it.":
    "已保留单元格草稿。请重新打开单元格进行查看。",
  "This cell changed or is protected. Your draft is kept; copy it or use the latest value.":
    "此单元格已更改或受保护。您的草稿已保留；请复制草稿或使用最新值。",
  "Arrows select cells · Shift extends selection · Enter edits · Tab moves · Escape cancels":
    "方向键选择单元格 · Shift 扩展选择 · Enter 编辑 · Tab 移动 · Escape 取消",
  "Object links": "对象链接",
  "Open object link": "打开对象链接",
  "Copy link to object": "复制对象链接",
  "Copy link to this object": "复制此对象的链接",
  "Object link copied.": "已复制对象链接。",
  "Unable to create a link to this object.":
    "无法创建指向此对象的链接。",
  "No objects found.": "未找到对象。",
  "Only people with board access can open this link.":
    "仅拥有白板访问权限的人员可以打开此链接。",
  "This link opens a board saved on this device.":
    "此链接将打开保存在当前设备上的白板。",
  "Click a destination object on the canvas, choose one below, or enter a website URL.":
    "点击画布上的目标对象，在下方选择一个对象，或输入网站 URL。",
  "Link destination": "链接目标",
  "Find destination object": "查找目标对象",
  "No object link.": "无对象链接。",
  "The linked object is no longer on this board.":
    "链接的对象已不在当前白板上。",
  "The linked part of the board is not shown yet.":
    "白板中链接的部分尚未显示。",
  "Choose a valid frame.": "请选择有效的画框。",
  "Another board is still being shared. Try again in a moment.":
    "另一个白板仍在分享中，请稍后重试。",
  "Someone locked this object while you were editing it.":
    "您编辑此对象时，有人将其锁定了。",
  "{name} deleted this object while you were editing it.":
    "您编辑此对象时，{name} 将其删除了。",
  "This object was deleted by someone else while you were editing it.":
    "您编辑此对象时，其他人将其删除了。",
  "Copy text": "复制文本",
  "Text copied.": "文本已复制。",
  "Could not copy the text.": "无法复制文本。",
  "This board changed in another tab. Reload to see the latest copy.":
    "此白板已在其他标签页中更改。请重新加载以查看最新版本。",
  "This board changed in another tab. Your changes here are kept in Version history. Reload to see the latest copy.":
    "此白板已在其他标签页中更改。您在此处的修改已保存在“版本历史”中。请重新加载以查看最新版本。",
  "Unsaved changes from another tab":
    "来自其他标签页的未保存更改",
  "This board was deleted in another tab.":
    "此白板已在其他标签页中被删除。",
  "Not saved": "未保存",
  "Someone locked this object while you were moving it.":
    "您移动此对象时，有人将其锁定了。",
  "This object changed. Open it again to edit it.":
    "此对象已更改，请重新打开以进行编辑。",
  "This object changed or is protected. Reopen its link settings.":
    "此对象已更改或受保护，请重新打开其链接设置。",
  "Choose a different object.": "请选择其他对象。",
  "This board is unavailable on this device. Check your boards or Trash.":
    "此白板在当前设备上不可用。请检查您的白板列表或回收站。",
  "Go to linked object": "前往链接的对象",
  "Invalid object link.": "对象链接无效。",

  Comments: "评论",
  Comment: "评论",
  "Comment (C)": "评论 (C)",
  "Add comment": "添加评论",
  "Board comments": "白板评论",
  "Close comments": "关闭评论",
  "Search comments": "搜索评论",
  "Show comments": "显示评论",
  "Open comments": "未解决的评论",
  "Unread comments": "未读评论",
  "Resolved comments": "已解决的评论",
  "All comments": "所有评论",
  "New comment": "新评论",
  "Show pins": "显示标记",
  Discussion: "讨论",
  "Write a comment": "写下评论",
  "Write a reply": "写下回复",
  "Enter adds a new line · Post comment sends":
    "按 Enter 换行 · 点击“发布评论”发送",
  "Enter to post · Shift+Enter for a new line":
    "按 Enter 发布 · 按 Shift+Enter 换行",
  "Cancel edit": "取消编辑",
  "Post comment": "发布评论",
  "Resolve discussion": "解决讨论",
  "Reopen discussion": "重新打开讨论",
  "Discussion resolved": "讨论已解决",
  "Discussion reopened": "讨论已重新打开",
  "Comment posted": "评论已发布",
  "Reply posted": "回复已发布",
  "Comment saved": "评论已保存",
  "{name} replied": "{name} 回复了",
  "{name} mentioned you": "{name} 提及了您",
  "{count} new messages in this discussion":
    "此讨论中有 {count} 条新消息",
  "No comments to show.": "暂无可显示的评论。",
  "{count} discussion": "{count} 个讨论",
  "{count} discussions": "{count} 个讨论",
  "Deleted comment": "已删除的评论",
  "Comment deleted": "评论已删除",
  "Edit comment": "编辑评论",
  "Delete comment": "删除评论",
  "Restore comment": "恢复评论",
  "Save comment": "保存评论",
  Reply: "回复",
  Edited: "已编辑",
  Resolved: "已解决",
  Open: "未解决",
  "Draft comment": "评论草稿",
  You: "您",
  "Show or hide comment pins": "显示或隐藏评论标记",
  "This discussion is no longer available.":
    "此讨论已不可用。",
  "This comment changed. Reopen it before editing.":
    "此评论已更改。编辑前请重新打开。",
  "This discussion has reached its reply limit.":
    "此讨论已达到回复数量上限。",
  "This board has reached its comment limit.":
    "此白板已达到评论数量上限。",
  "This comment's time is not valid.":
    "此评论的时间无效。",
  "Only the author can edit this comment.":
    "只有作者本人可以编辑此评论。",
  "Invalid comment thread.": "评论讨论串无效。",
  "Invalid comment message.": "评论消息无效。",
  "Mouse, trackpad, and touch": "鼠标、触控板与触屏",
  "Navigation mode": "导航模式",
  "Auto-detect": "自动检测",
  Mouse: "鼠标",
  Trackpad: "触控板",
  Touch: "触屏",
  "Auto-detect recognizes wheel steps and smooth scrolling. Choose a device if scrolling feels wrong.":
    "自动检测可识别滚轮步进和平滑滚动。如果滚动体验异常，请手动选择设备。",
  "Scroll to zoom. Right-drag, middle-drag, or Space-drag to pan.":
    "滚动滚轮进行缩放。按住右键、中键或空格键拖动以平移视图。",
  "Scroll with two fingers to pan. Pinch or Ctrl/Cmd-scroll to zoom. Shift-scroll pans horizontally.":
    "双指滚动平移视图。双指捏合或按住 Ctrl/Cmd 滚动进行缩放。按住 Shift 滚动可水平平移。",
  "Drag to pan and pinch to zoom. Tap an object to select it, then drag it to move. Hold for a moment, then drag to select several objects. Drawing tools still draw with one finger.":
    "拖动平移视图，双指捏合缩放。轻触对象将其选中，然后拖动进行移动。长按片刻后拖动可选择多个对象。绘图工具仍使用单指绘制。",
  "This preference is saved on this device and shared with other open tabs.":
    "此偏好设置保存在当前设备上，并与其他打开的标签页共享。",

  Minimap: "小地图",
  minimap: "小地图",
  "Minimap (M)": "小地图 (M)",
  "Close minimap": "关闭小地图",
  "Fit board": "适应白板全貌",
  "Navigate board": "浏览白板",
  "Zoom in or out": "放大或缩小",
  "Fit board / zoom to selection": "适应白板 / 缩放至所选内容",
  "Click to jump or drag the visible area. Arrow keys pan; plus and minus zoom; Home fits the board; Escape closes the minimap.":
    "点击跳转或拖动可视区域。方向键平移；加号和减号缩放；Home 适应白板全貌；Escape 关闭小地图。",
  "Crop image": "裁剪图片",
  "Select one image.": "请选择一张图片。",
  "Invalid image crop.": "图片裁剪无效。",
  "This crop exceeds the board size limits.":
    "此裁剪超出白板尺寸限制。",
  "This image has no editable area.": "此图片没有可编辑区域。",
  "Cropping closed because the image changed or is no longer editable.":
    "由于图片已更改或不再可编辑，裁剪已关闭。",
  "Move crop area": "移动裁剪区域",
  "Crop top left": "裁剪左上角",
  "Crop top": "裁剪顶部",
  "Crop top right": "裁剪右上角",
  "Crop right": "裁剪右侧",
  "Crop bottom right": "裁剪右下角",
  "Crop bottom": "裁剪底部",
  "Crop bottom left": "裁剪左下角",
  "Crop left": "裁剪左侧",
  "Reset original": "重置为原始尺寸",
  "Aspect ratio": "纵横比",
  Freeform: "自由比例",
  Original: "原始比例",
  Oval: "椭圆形",
  Shape: "形状",
  Left: "左",
  Right: "右",
  Up: "上",
  Down: "下",
  Top: "顶部",
  "Exact crop (pixels)": "精确裁剪（像素）",
  "Apply crop": "应用裁剪",
  pixels: "像素",
  "Drag the area or its handles. Arrow keys adjust by a pixel; Shift adjusts by ten. Alt/Option bypasses snapping.":
    "拖动区域或其控制柄。方向键每次调整 1 像素；按住 Shift 每次调整 10 像素。按住 Alt/Option 可跳过吸附。",
  "Auto height": "自动高度",
  "Automatic text height": "文本自动高度",
  "Adjust height to fit the text. Resize to change its width.":
    "自动调整高度以适应文本。调整大小以更改其宽度。",
  "Height adjusts to the text. Change the width to rewrap it.":
    "高度随文本自动调整。更改宽度可重新换行。",
  "Drag the corner horizontally to change text width. Alt/Option bypasses snapping.":
    "水平拖动边角以更改文本宽度。按住 Alt/Option 可跳过吸附。",
  "Text exceeds the board height limit. Widen the box or split the text into separate boxes.":
    "文本超出白板高度限制。请加宽文本框或将文本拆分到多个文本框中。",
  "Command palette": "Palette de commandes",
  "Command palette (Ctrl/Cmd K)": "Palette de commandes (Ctrl/Cmd K)",
  "Search commands and boards": "Rechercher des commandes et des tableaux",
  "Commands and boards": "Commandes et tableaux",
  "No matching commands or boards. Try another word.":
    "Aucune commande ni aucun tableau correspondant. Essayez un autre mot.",
  "This command is no longer available.":
    "Cette commande n’est plus disponible.",
  "↑ ↓ to navigate · Enter to run · Esc to close":
    "↑ ↓ pour naviguer · Entrée pour exécuter · Échap pour fermer",
  "Keyboard shortcut": "Raccourci clavier",
  "Recent boards": "Tableaux récents",
  Create: "Créer",
  Edit: "Modifier",
  Arrange: "Organiser",
  Navigate: "Naviguer",
  Board: "Tableau",
  Help: "Aide",
  "Zoom to selection": "Zoom sur la sélection",
  "Nothing to undo.": "Rien à annuler.",
  "Nothing to redo.": "Rien à rétablir.",
  "Select shapes, notes, or text boxes.":
    "Sélectionnez des formes, des notes ou des zones de texte.",
  "Select an object with editable text.":
    "Sélectionnez un objet avec du texte modifiable.",
  "Select at least two objects or groups.":
    "Sélectionnez au moins deux objets ou groupes.",
  "Select at least three objects or groups.":
    "Sélectionnez au moins trois objets ou groupes.",
  "Select a group first.": "Sélectionnez d’abord un groupe.",
  "Auto-fit": "Ajustement auto",
  "Auto-fit text": "Ajuster automatiquement le texte",
  "Maximum font size": "Taille maximale de police",
  "Shrink text to fit. The font size is the maximum.":
    "Réduire le texte pour qu’il tienne. La taille de police est le maximum.",
  "Some text does not fit at the minimum size. Enlarge the object or shorten the text.":
    "Une partie du texte ne tient pas à la taille minimale. Agrandissez l’objet ou raccourcissez le texte.",
  "Quick diagram creation": "Création rapide de diagramme",
  "Quick connect top": "Connexion rapide en haut",
  "Quick connect right": "Connexion rapide à droite",
  "Quick connect bottom": "Connexion rapide en bas",
  "Quick connect left": "Connexion rapide à gauche",
  "Click to add a connected object or connect a nearby one. Drag to choose another target. Escape cancels.":
    "Cliquez pour ajouter un objet connecté ou relier un objet proche. Faites glisser pour choisir une autre cible. Échap annule.",
  "Add connected object": "Ajouter un objet connecté",
  "Connect to": "Connecter à",
  "Select one shape, sticky note, or text box.":
    "Sélectionnez une forme, une note adhésive ou une zone de texte.",
  Shapes: "Formes",
  "Shapes (S)": "Formes (S)",
  "Change shape": "Changer de forme",
  Diamond: "Losange",
  Triangle: "Triangle",
  Parallelogram: "Parallélogramme",
  Hexagon: "Hexagone",
  Star: "Étoile",
  Cylinder: "Cylindre",
  Terminator: "Terminaison",
  Process: "Processus",
  "Start or end": "Début ou fin",
  Decision: "Décision",
  "Input or output": "Entrée ou sortie",
  Database: "Base de données",
  Preparation: "Préparation",
  "Basic shape": "Forme simple",
  "Invalid shape.": "Forme non valide.",
  // Board validation, shown when an imported or migrated board is rejected.
  "The board contains an invalid object.":
    "Le tableau contient un objet non valide.",
  "Invalid object rotation.": "Rotation d’objet non valide.",
  "Unsupported image format.": "Format d’image non pris en charge.",
  "Invalid drawing.": "Dessin non valide.",
  "Invalid content language.": "Langue du contenu non valide.",
  "Invalid text highlight.": "Surlignage de texte non valide.",
  "Invalid font family.": "Police non valide.",
  "Invalid font size.": "Taille de police non valide.",
  "Invalid text style.": "Style de texte non valide.",
  "Invalid text color.": "Couleur de texte non valide.",
  "Invalid text alignment.": "Alignement du texte non valide.",
  "Invalid text formatting.": "Mise en forme du texte non valide.",
  "Invalid text list.": "Liste de texte non valide.",
  "Invalid object tags.": "Étiquettes d’objet non valides.",
  "Invalid table.": "Tableau de données non valide.",
  "Invalid table dimensions.": "Dimensions du tableau de données non valides.",
  "Invalid attachment.": "Pièce jointe non valide.",
  "Object dimensions must be positive.":
    "Les dimensions de l’objet doivent être positives.",
  "Invalid object relationship.": "Relation entre objets non valide.",
  "Invalid object lock.": "Verrouillage d’objet non valide.",
  "Invalid frame order.": "Ordre des cadres non valide.",
  "Invalid mind map node.": "Nœud de carte mentale non valide.",
  "Invalid mind map collapse state.":
    "État replié de la carte mentale non valide.",
  "Invalid frame membership.": "Appartenance à un cadre non valide.",
  "Invalid connector.": "Connecteur non valide.",
  "A board can contain at most 5,000 objects.":
    "Un tableau peut contenir au maximum 5 000 objets.",
  "Bulk sticky notes": "Notes adhésives en série",
  "The table is too tall. Use a smaller font or fewer lines.":
    "La table est trop haute. Utilisez une police plus petite ou moins de lignes.",
  "Paste spreadsheet": "Coller des cellules",
  "Choose how to add these cells. Blank cells keep their positions.":
    "Choisissez comment ajouter ces cellules. Les cellules vides conservent leur position.",
  Ideas: "Idées",
  "One sticky note per line. Empty lines are skipped.":
    "Une note adhésive par ligne. Les lignes vides sont ignorées.",
  "Paste as": "Coller en tant que",
  "Sticky notes": "Notes adhésives",
  "Plain text": "Texte brut",
  "Sticky color": "Couleur des notes",
  "Cluster sticky notes": "Regrouper les notes adhésives",
  "Cluster by": "Regrouper par",
  Color: "Couleur",
  "One named cluster": "Un regroupement nommé",
  "Cluster name": "Nom du regroupement",
  Cluster: "Regroupement",
  "Create clusters": "Créer les regroupements",
  "No tag": "Sans étiquette",
  notes: "notes",
  clusters: "regroupements",
  "extra copies": "copies supplémentaires",
  "extra copy": "copie supplémentaire",
  note: "note",
  cluster: "regroupement",
  "Select sticky notes first.": "Sélectionnez d’abord des notes adhésives.",
  "Choose a clustering method.": "Choisissez une méthode de regroupement.",
  "The cluster name changed. Reopen clustering.":
    "Le nom du regroupement a changé. Rouvrez le regroupement.",
  "The selected notes changed. Reopen clustering.":
    "Les notes sélectionnées ont changé. Rouvrez le regroupement.",
  "Select sticky notes outside a mind map.":
    "Sélectionnez des notes adhésives qui ne font pas partie d’une carte mentale.",
  "Enter a cluster name of up to 200 characters.":
    "Saisissez un nom de regroupement de 200 caractères maximum.",
  "These clusters would exceed the board limit of 5,000 objects.":
    "Ces regroupements dépasseraient la limite de 5 000 objets du tableau.",
  "These clusters would exceed the board geometry limit.":
    "Ces regroupements dépasseraient les limites géométriques du tableau.",
  "The notes changed. Review the updated clusters and try again.":
    "Les notes ont changé. Vérifiez les regroupements actualisés, puis réessayez.",
  "Selected notes move into editable frames. Notes leave their previous groups and frames; other objects stay in place. Notes with several tags are copied into each matching cluster.":
    "Les notes sélectionnées sont déplacées dans des cadres modifiables. Elles quittent leurs groupes et cadres précédents ; les autres objets restent en place. Les notes portant plusieurs étiquettes sont copiées dans chaque regroupement correspondant.",
  Yellow: "Jaune",
  Red: "Rouge",
  Lime: "Vert citron",
  Cyan: "Cyan",
  Pink: "Rose",
  Gray: "Gris",
  Violet: "Violet",
  "Dark green": "Vert foncé",
  "Dark blue": "Bleu foncé",
  "Dark gray": "Gris foncé",
  Black: "Noir",
  Green: "Vert",
  Blue: "Bleu",
  Purple: "Violet",
  Peach: "Pêche",
  White: "Blanc",
  // Sticky note colors, which name clusters grouped by color.
  Butter: "Beurre",
  Sage: "Sauge",
  Lilac: "Lilas",
  Cells: "Cellules",
  "Content preview": "Aperçu du contenu",
  "Cluster preview": "Aperçu des regroupements",
  "Add to board": "Ajouter au tableau",
  "Paste up to 50 rows and 100 columns at a time.":
    "Collez jusqu’à 50 lignes et 100 colonnes à la fois.",
  "Tables support up to 20 rows, 12 columns, and 2,000 characters per cell.":
    "Les tables acceptent jusqu’à 20 lignes, 12 colonnes et 2 000 caractères par cellule.",
  "Paste up to 1 million characters at a time.":
    "Collez jusqu’à 1 million de caractères à la fois.",
  "Check the quotes in the pasted spreadsheet cells.":
    "Vérifiez les guillemets dans les cellules collées.",
  "Paste one spreadsheet range at a time.":
    "Collez une plage de cellules à la fois.",
  "Use up to 20,000 characters per sticky note.":
    "Utilisez jusqu’à 20 000 caractères par note adhésive.",
  "Copy as image": "Copier en tant qu’image",
  "Copy as image (Ctrl/Cmd Shift C)":
    "Copier en tant qu’image (Ctrl/Cmd Maj C)",
  "Copy image": "Copier l’image",
  "Download PNG": "Télécharger le PNG",
  "Image of selected objects": "Image des objets sélectionnés",
  "Clipboard access is unavailable. Download the PNG or try copying again.":
    "L’accès au presse-papiers est indisponible. Téléchargez le PNG ou réessayez de copier.",
  "Could not copy the image. Use Copy as image to try again.":
    "Impossible de copier l’image. Utilisez Copier en tant qu’image pour réessayer.",
  "Image copied. Paste it into another app or board.":
    "Image copiée. Collez-la dans une autre application ou un tableau.",
  "An image copy is already in progress.":
    "Une copie d’image est déjà en cours.",
  "Select objects to copy as an image.":
    "Sélectionnez les objets à copier en tant qu’image.",
  "Copying selection as an image…": "Copie de la sélection en tant qu’image…",
  "Could not prepare the image. Please try again.":
    "Impossible de préparer l’image. Veuillez réessayer.",
  "Your browser cannot copy images here. Download the PNG instead.":
    "Votre navigateur ne peut pas copier d’images ici. Téléchargez le PNG.",

  "Connection line formatting": "Mise en forme des lignes de connexion",
  "Copy style": "Copier le style",
  "Font family": "Police de caractères",
  "Paste style": "Coller le style",
  "Copy style (Ctrl/Cmd Alt/Option C)":
    "Copier le style (Ctrl/Cmd Alt/Option C)",
  "Paste style (Ctrl/Cmd Alt/Option V)":
    "Coller le style (Ctrl/Cmd Alt/Option V)",
  "Select one object with a copyable style.":
    "Sélectionnez un objet dont le style peut être copié.",
  "Style copied. Select objects and paste style.":
    "Style copié. Sélectionnez des objets et collez le style.",
  "Copy a style first.": "Copiez d’abord un style.",
  "The copied style does not apply to this selection.":
    "Le style copié ne s’applique pas à cette sélection.",
  "This style is already applied.": "Ce style est déjà appliqué.",
  "Style pasted.": "Style collé.",
  Path: "Tracé",
  Straight: "Droit",
  Elbow: "Coudé",
  Curved: "Courbe",
  Stroke: "Trait",
  Solid: "Continu",
  Dashed: "Tirets",
  Dotted: "Pointillé",
  Thickness: "Épaisseur",
  Start: "Début",
  End: "Fin",
  None: "Aucun",
  Arrowhead: "Pointe de flèche",
  "Filled triangle": "Triangle plein",
  "Open triangle": "Triangle vide",
  "Filled diamond": "Losange plein",
  "Open diamond": "Losange vide",
  "Open circle": "Cercle vide",
  "Bar (one)": "Barre (un)",
  "Crow's foot (many)": "Patte d’oie (plusieurs)",
  Dot: "Point",
  "Connection endpoints": "Extrémités de connexion",
  "Free endpoint": "Extrémité libre",
  "Start object": "Objet de départ",
  "End object": "Objet d’arrivée",
  "Drag either round handle to reconnect. Hold Alt/Option to detach, or Shift for a straight angle.":
    "Faites glisser une poignée ronde pour reconnecter. Maintenez Alt/Option pour détacher, ou Maj pour un angle droit.",
  "Choose two different objects.": "Choisissez deux objets différents.",
  "Drag between objects to connect · Alt/Option for a free endpoint":
    "Reliez les objets par glissement · Alt/Option pour une extrémité libre",
  "Invalid line style.": "Style de ligne invalide.",
  "Invalid line thickness.": "Épaisseur de ligne invalide.",

  "Open to rename": "Ouvrir pour renommer",
  "Only people who can edit this board rename it.":
    "Seules les personnes qui peuvent modifier ce tableau le renomment.",
  "Share board": "Partager le tableau",
  "Shared board": "Tableau partagé",
  Participants: "Participants",
  Editing: "Modification",
  "Join shared board": "Rejoindre un tableau partagé",
  "Board link": "Lien du tableau",
  "Join board": "Rejoindre le tableau",
  "Sign in with Puter to join this board.":
    "Connectez-vous à Puter pour rejoindre ce tableau.",
  "Paste the link you were given to open the board.":
    "Collez le lien que vous avez reçu pour ouvrir le tableau.",
  "You were invited to a shared board. Choose Join board to open it.":
    "Vous avez reçu une invitation à un tableau partagé. Choisissez Rejoindre le tableau pour l’ouvrir.",
  "Choose Join board to open this shared board.":
    "Choisissez Rejoindre le tableau pour ouvrir ce tableau partagé.",
  "Can edit": "Peut modifier",
  "Can view": "Peut consulter",
  "View only": "Lecture seule",
  "Comment only": "Commentaires uniquement",
  "You can now edit this board.": "Vous pouvez maintenant modifier ce tableau.",
  "You can now manage this board's participants and run its facilitation.":
    "Vous pouvez maintenant gérer les participants de ce tableau et en animer les activités.",
  "You can still edit this board, but no longer manage its participants or facilitation.":
    "Vous pouvez toujours modifier ce tableau, mais vous n’en gérez plus les participants ni l’animation.",
  "You can now comment on this board, but not change its content.":
    "Vous pouvez maintenant commenter ce tableau, mais pas modifier son contenu.",
  "You can now only view this board.":
    "Vous ne pouvez plus que consulter ce tableau.",
  Owner: "Propriétaire",
  Removed: "Retiré",
  "Access for": "Accès pour",
  "Link access": "Accès par lien",
  "Create invitation": "Créer une invitation",
  "Copy link": "Copier le lien",
  "Link copied.": "Lien copié.",
  "Copy the selected link.": "Copiez le lien sélectionné.",
  "This board is read-only.": "Ce tableau est en lecture seule.",
  "This board is read-only for you. Ask the owner or a facilitator for access to edit or comment.":
    "Ce tableau est en lecture seule pour vous. Demandez au propriétaire ou à un animateur l’accès pour le modifier ou le commenter.",
  "This board's content is read-only for you. Choose Comment (C) to discuss it.":
    "Le contenu de ce tableau est en lecture seule pour vous. Choisissez Commentaire (C) pour en discuter.",
  "Only the owner or a facilitator can invite new participants.":
    "Seuls le propriétaire du tableau ou un animateur peuvent inviter de nouveaux participants.",
  "Anyone signed in with this invitation can join.":
    "Toute personne connectée disposant de cette invitation peut rejoindre le tableau.",
  "Create an invitation to share this access.":
    "Créez une invitation pour partager cet accès.",
  "Changes are shared as you type. Escape to finish.":
    "Les modifications sont partagées pendant la saisie. Échap pour terminer.",
  "Preparing collaboration…": "Préparation de la collaboration…",
  "Starting collaboration…": "Démarrage de la collaboration…",
  "Sharing failed · try again": "Échec du partage · réessayez",
  "Shared, but the copy in Puter could not be updated.":
    "Partagé, mais la copie dans Puter n’a pas pu être mise à jour.",
  "The collaboration server bundle could not load.":
    "Le module du serveur de collaboration n’a pas pu être chargé.",
  "Invalid collaboration server bundle.":
    "Module du serveur de collaboration non valide.",
  "Could not create a restricted collaboration credential.":
    "Impossible de créer un identifiant de collaboration restreint.",
  "Connecting to shared board…": "Connexion au tableau partagé…",
  "Still connecting to the shared board. Try again in a moment.":
    "Connexion au tableau partagé en cours. Réessayez dans un instant.",
  "Some images or files have not downloaded from the shared board yet. Try again in a moment.":
    "Certaines images ou certains fichiers du tableau partagé ne sont pas encore téléchargés. Réessayez dans un instant.",
  "Some images or files of this shared board are not on this device yet. Open the board to download them, then try again.":
    "Certaines images ou certains fichiers de ce tableau partagé ne sont pas encore sur cet appareil. Ouvrez le tableau pour les télécharger, puis réessayez.",
  "Sharing update could not finish. Reopen this board to retry.":
    "La mise à jour du partage n’a pas abouti. Rouvrez ce tableau pour réessayer.",
  "Saving shared changes…": "Enregistrement des modifications partagées…",
  "Access changed · unsent changes stay on this device":
    "Accès modifié · les modifications non envoyées restent sur cet appareil",
  "Saved · live": "Enregistré · en direct",
  "Text you were typing when the board closed was put back.":
    "Le texte que vous saisissiez à la fermeture du tableau a été rétabli.",
  "Saved · board full, no live presence":
    "Enregistré · tableau complet, sans présence en direct",
  "Saved · periodic sync": "Enregistré · synchronisation périodique",
  "Connected · periodic sync": "Connecté · synchronisation périodique",
  "This board needs a newer version of the app · reload":
    "Ce tableau nécessite une version plus récente de l’application · rechargez",
  "Showing {shown} of {total} matching objects. Search for a frame's name to list everything it holds, or search to narrow the list.":
    "Affichage de {shown} objets sur {total} correspondants. Cherchez le nom d’un cadre pour lister tout ce qu’il contient, ou cherchez pour réduire la liste.",
  "Showing the first {shown} of {total} matching objects. Search to narrow the list.":
    "Affichage des {shown} premiers objets sur {total} correspondants. Cherchez pour réduire la liste.",
  "Offline · changes saved on this device":
    "Hors ligne · modifications enregistrées sur cet appareil",
  "Uploading images · waiting for the board's server":
    "Envoi des images · en attente du serveur du tableau",
  "This board has reached its 1 GB limit for images and files.":
    "Ce tableau a atteint sa limite de 1 Go pour les images et les fichiers.",
  "An image or file could not be saved to the shared board.":
    "Une image ou un fichier n’a pas pu être enregistré sur le tableau partagé.",
  "Some changes could not be saved because they conflicted with the shared board.":
    "Certaines modifications n’ont pas pu être enregistrées, car elles étaient en conflit avec le tableau partagé.",
  "Board unavailable · local changes retained":
    "Tableau indisponible · modifications locales conservées",
  "Access changed · local changes retained":
    "Accès modifié · modifications locales conservées",
  "Local recovery failed. Keep this tab open.":
    "La récupération locale a échoué. Gardez cet onglet ouvert.",
  "Could not connect · local copy available":
    "Connexion impossible · copie locale disponible",
  "Connection lost. Changes are saved on this device and sync when it returns.":
    "Connexion perdue. Les modifications sont enregistrées sur cet appareil et se synchroniseront à son retour.",
  "Back online · changes synced":
    "De nouveau en ligne · modifications synchronisées",
  "The shared board cannot be reached. Changes stay on this device.":
    "Le tableau partagé est inaccessible. Les modifications restent sur cet appareil.",
  "Shared board available again · changes synced":
    "Tableau partagé de nouveau disponible · modifications synchronisées",
  "Cannot reach the shared board · retrying · view only":
    "Tableau partagé injoignable · nouvel essai · lecture seule",
  "Cannot reach the shared board. It is view only until it reconnects.":
    "Tableau partagé injoignable. Il reste en lecture seule jusqu’à la reconnexion.",
  "Setting up sharing…": "Configuration du partage…",
  "Uploading the board…": "Envoi du tableau…",
  "Uploading images · {count} left, waiting for the board's server…":
    "Envoi des images · encore {count}, en attente du serveur du tableau…",
  "This can take a few seconds. You can close this and look around; editing resumes once sharing is ready.":
    "Cela peut prendre quelques secondes. Vous pouvez fermer cette fenêtre et explorer le tableau ; la modification reprendra une fois le partage prêt.",
  "Sharing is ready. Select Share board to invite people.":
    "Le partage est prêt. Sélectionnez Partager le tableau pour inviter des personnes.",
  "Invalid board invitation.": "Invitation au tableau non valide.",
  "Invalid Whiteboard server address.":
    "Adresse de serveur Whiteboard non valide.",
  "The collaboration server is still starting. Try Share again shortly.":
    "Le serveur de collaboration démarre encore. Réessayez Partager dans un instant.",
  "Your Puter account changed. Reopen the shared board.":
    "Votre compte Puter a changé. Rouvrez le tableau partagé.",
  "Could not synchronize this board.": "Impossible de synchroniser ce tableau.",
  "Could not reach the shared board. Check your connection and try again.":
    "Impossible de joindre le tableau partagé. Vérifiez votre connexion et réessayez.",
  "The server did not acknowledge this edit.":
    "Le serveur n’a pas confirmé cette modification.",

  "Find on board": "Rechercher dans le tableau",
  "Find on board (Ctrl/Cmd F)": "Rechercher dans le tableau (Ctrl/Cmd F)",
  "Search this board": "Rechercher dans ce tableau",
  "Close search": "Fermer la recherche",
  "All content": "Tout le contenu",
  "Content type": "Type de contenu",
  "Previous result": "Résultat précédent",
  "Next result": "Résultat suivant",
  "Result {n} of {count}": "Résultat {n} sur {count}",
  "Previous page": "Page précédente",
  "Next page": "Page suivante",
  "Select on board": "Sélectionner sur le tableau",
  "Show results": "Afficher les résultats",
  "Search text, links, file names, and table cells.":
    "Recherchez du texte, des liens, des noms de fichiers et des cellules.",
  "Enter: next result · Shift+Enter: previous · Escape: close":
    "Entrée : suivant · Maj+Entrée : précédent · Échap : fermer",
  "Untitled object": "Objet sans titre",
  Attachment: "Pièce jointe",
  Drawing: "Dessin",
  "Adding files…": "Ajout des fichiers…",
  "Files added.": "Fichiers ajoutés.",
  "Drop content here": "Déposez le contenu ici",
  "Images, files, text, and links": "Images, fichiers, texte et liens",
  "Copy, cut, or paste objects": "Copier, couper ou coller des objets",
  "Ctrl or Cmd + C / X / V": "Ctrl ou Cmd + C / X / V",
  "This selection is too large to copy. Export a board file instead.":
    "Cette sélection est trop volumineuse pour être copiée. Exportez un fichier de tableau.",
  "This selection is too large to paste.":
    "Cette sélection est trop volumineuse pour être collée.",
  "This clipboard content is not supported.":
    "Ce contenu du presse-papiers n’est pas pris en charge.",
  "Paste up to 20,000 characters at a time.":
    "Collez jusqu’à 20 000 caractères à la fois.",
  "This text is at its length limit, so the end of what was added was left out.":
    "Ce texte a atteint sa longueur maximale : la fin de ce qui a été ajouté a été omise.",
  "Could not read this file.": "Impossible de lire ce fichier.",
  "This image could not be read.": "Cette image n’a pas pu être lue.",
  "Add up to 20 files and 50 MB at a time.":
    "Ajoutez jusqu’à 20 fichiers et 50 Mo à la fois.",
  "Could not decode an image.": "Impossible de décoder une image.",
  "Choose an image with fewer than 40 million pixels.":
    "Choisissez une image de moins de 40 millions de pixels.",
  "A board can contain up to 5,000 objects.":
    "Un tableau peut contenir jusqu’à 5 000 objets.",
  "Could not add these files.": "Impossible d’ajouter ces fichiers.",
  "Could not copy these objects. Your board is unchanged.":
    "Impossible de copier ces objets. Votre tableau est inchangé.",
  "Could not paste this content.": "Impossible de coller ce contenu.",
  "Choose a tool, then click the canvas. Double-click an object to edit its text. Drag a corner to resize. Paste text, links, or images, or drop files onto the canvas.":
    "Choisissez un outil, puis cliquez sur le tableau. Double-cliquez sur un objet pour modifier son texte. Faites glisser un coin pour le redimensionner. Collez du texte, des liens ou des images, ou déposez des fichiers sur le tableau.",
  "Editing text": "Modification du texte",
  Done: "Terminé",
  "Text formatting": "Mise en forme du texte",
  Bold: "Gras",
  Italic: "Italique",
  Underline: "Souligné",
  Strikethrough: "Barré",
  Lists: "Listes",
  "Text links": "Liens du texte",
  "Insert or edit text link": "Insérer ou modifier un lien dans le texte",
  "Link URL": "Adresse du lien",
  "Apply link": "Appliquer le lien",
  "Edit link": "Modifier le lien",
  Previous: "Précédent",
  Next: "Suivant",
  "Remove link": "Supprimer le lien",
  "Open link in new tab": "Ouvrir le lien dans un nouvel onglet",
  "The selected text changed. Select it again.":
    "Le texte sélectionné a changé. Sélectionnez-le à nouveau.",
  "Select one text object.": "Sélectionnez un objet contenant du texte.",
  "Ctrl/Cmd + Alt/Option + K": "Ctrl/Cmd + Alt/Option + K",
  "List formatting": "Mise en forme des listes",
  "Bulleted list": "Liste à puces",
  "Numbered list": "Liste numérotée",
  "Increase indent": "Augmenter le retrait",
  "Decrease indent": "Diminuer le retrait",
  "In lists, Tab changes indent, Shift+Enter continues an item, and Enter on an empty item exits the list.":
    "Dans une liste, Tab change le retrait, Maj+Entrée continue un élément et Entrée sur un élément vide quitte la liste.",
  "Indent / outdent a list item":
    "Augmenter / diminuer le retrait d’un élément de liste",
  "Move between the selection or its text and its toolbar":
    "Passer de la sélection ou de son texte à sa barre d’outils, et inversement",
  "Selection tools": "Outils de la sélection",
  Undone: "Action annulée",
  Redone: "Action rétablie",
  "Nothing to undo": "Rien à annuler",
  "Nothing to redo": "Rien à rétablir",
  "Brought to front": "Mis au premier plan",
  "Sent to back": "Mis à l’arrière-plan",
  "Brought forward": "Avancé d’un plan",
  "Sent backward": "Reculé d’un plan",
  Ungrouped: "Groupe dissocié",
  "{count} object grouped": "{count} objet groupé",
  "{count} objects grouped": "{count} objets groupés",
  "Out of the frame": "Hors du cadre",
  Size: "Taille",
  "Connects to": "Relié à",
  "Attached to": "Attaché à",
  "Connected from": "Relié depuis",
  "open discussion": "discussion ouverte",
  "open discussions": "discussions ouvertes",
  "one|and {count} more": "et {count} autre",
  "and {count} more": "et {count} autres",
  "Continue a list item on a new line":
    "Continuer un élément de liste sur une nouvelle ligne",
  "Tab / Shift + Tab": "Tab / Maj + Tab",
  "Shift + Enter": "Maj + Entrée",
  "Shift + C": "Maj + C",
  "Shift + N": "Maj + N",
  "Space / right / middle + drag":
    "Espace / clic droit / clic central + glisser",
  "Ctrl/Cmd + Plus/Minus": "Ctrl/Cmd + Plus/Moins",
  "Arrow keys": "Touches fléchées",
  "Alt / Option + drag": "Alt / Option + glisser",
  "Alt / Option + Arrow keys": "Alt / Option + touches fléchées",
  "Alt / Option during drag": "Alt / Option pendant le glissement",
  Escape: "Échap",
  "Shift + resize": "Maj + redimensionnement",
  "Ctrl/Cmd + Alt/Option + Shift + Plus/Minus":
    "Ctrl/Cmd + Alt/Option + Maj + Plus/Moins",
  Enter: "Entrée",
  "Ctrl/Cmd + Shift + Down / Up": "Ctrl/Cmd + Maj + Bas / Haut",
  "Ctrl/Cmd + Alt/Option + Shift + K": "Ctrl/Cmd + Alt/Option + Maj + K",
  "Ctrl/Cmd + Alt/Option + Shift + C": "Ctrl/Cmd + Alt/Option + Maj + C",
  "Ctrl/Cmd + Alt/Option + Shift + H": "Ctrl/Cmd + Alt/Option + Maj + H",
  "Moved to the trash.": "Placé dans la corbeille.",
  "Deleted {date}": "Supprimé le {date}",
  "Version history (Ctrl/Cmd Alt/Option Shift H)":
    "Historique des versions (Ctrl/Cmd Alt/Option Maj H)",
  "Ctrl or Cmd + Z": "Ctrl ou Cmd + Z",
  "Ctrl or Cmd + D": "Ctrl ou Cmd + D",
  "Ctrl or Cmd + Shift + L": "Ctrl ou Cmd + Maj + L",
  "Ctrl/Cmd + Shift + C": "Ctrl/Cmd + Maj + C",
  "Ctrl or Cmd + [ / ]": "Ctrl ou Cmd + [ / ]",
  "Ctrl or Cmd + Shift + [ / ]": "Ctrl ou Cmd + Maj + [ / ]",
  "Page Down / Page Up": "Page suivante / Page précédente",
  "A or L / P / E / F": "A ou L / P / E / F",
  "Ctrl/Cmd + Backspace": "Ctrl/Cmd + Retour arrière",
  "Delete / Backspace": "Suppr / Retour arrière",
  Find: "Rechercher",
  Delete: "Supprimer",
  Share: "Partager",
  View: "Affichage",
  Selection: "Sélection",
  Insert: "Insérer",
  "Previous results": "Résultats précédents",
  "Next results": "Résultats suivants",
  "Selected objects": "Objets sélectionnés",
  "Selected region": "Zone sélectionnée",
  Row: "Ligne",
  Column: "Colonne",
  "Highlight text": "Surligner le texte",
  "Remove highlight": "Supprimer le surlignage",
  "No highlight": "Sans surlignage",
  "Text color": "Couleur du texte",
  "Custom color": "Couleur personnalisée",
  "Automatic text color": "Couleur du texte automatique",
  "Text alignment": "Alignement du texte",
  "Align text left": "Texte à gauche",
  "Align text center": "Texte centré",
  "Align text right": "Texte à droite",
  "Font size": "Taille du texte",
  Mixed: "Mixte",
  "Object properties": "Propriétés de l’objet",
  "Edit text on canvas": "Modifier le texte sur le tableau",
  "Finish editing": "Terminer la modification",
  "Cancel text edit": "Annuler la modification du texte",
  "Ctrl or Cmd + Enter to finish. Escape to cancel. Enter adds a new line.":
    "Ctrl ou Cmd + Entrée pour terminer. Échap pour annuler. Entrée ajoute une ligne.",
  "Board library": "Bibliothèque de tableaux",
  "Recovered board": "Tableau récupéré",
  "Space + drag": "Espace + glisser",
  "Ctrl or Cmd + scroll": "Ctrl ou Cmd + défilement",
  "Shift or Ctrl/Cmd + click": "Maj ou Ctrl/Cmd + clic",
  "Ctrl or Cmd + Shift + Z or Ctrl or Cmd + Y":
    "Ctrl ou Cmd + Maj + Z ou Ctrl ou Cmd + Y",
  "Ctrl or Cmd + S": "Ctrl ou Cmd + S",
  "Shift + Arrow keys": "Maj + touches fléchées",
  "Move selected objects by 10": "Déplacer les objets sélectionnés de 10",
  "Arrow keys with nothing selected": "Touches fléchées sans sélection",
  "Ctrl/Cmd + B / I / U": "Ctrl/Cmd + B / I / U",
  "Bold, italic, or underline while typing":
    "Gras, italique ou souligné pendant la saisie",
  "Ctrl or Cmd + A": "Ctrl ou Cmd + A",
  "Select all objects": "Sélectionner tous les objets",
  "Ctrl or Cmd + G / Shift + G": "Ctrl ou Cmd + G / Maj + G",
  "Group / ungroup selection": "Grouper / dissocier la sélection",
  "Show these shortcuts": "Afficher ces raccourcis",
  "Fullscreen is unavailable. Presentation remains open.":
    "Le plein écran est indisponible. La présentation reste ouverte.",
  "Could not restore this version.": "Impossible de restaurer cette version.",
  "Could not export this board.": "Impossible d’exporter ce tableau.",
  "This area is too large for a readable PDF at this scale. Choose a smaller scale, or export frames or a selected region.":
    "Cette zone est trop grande pour un PDF lisible à cette échelle. Choisissez une échelle plus petite, ou exportez des cadres ou une région sélectionnée.",
  "Too many PDF pages. Export fewer frames at a time.":
    "Trop de pages PDF. Exportez moins de cadres à la fois.",
  "Too many PDF pages. Fit each area on one page, or export fewer frames at a time.":
    "Trop de pages PDF. Mettez chaque zone sur une seule page, ou exportez moins de cadres à la fois.",
  "Choose a file smaller than 500 MB.":
    "Choisissez un fichier de moins de 500 Mo.",

  "Whiteboard home": "Accueil Whiteboard",
  "Personal workspace": "Espace personnel",
  "All boards": "Tous les tableaux",
  Favorites: "Favoris",
  Trash: "Corbeille",
  Appearance: "Apparence",
  Preferences: "Préférences",
  System: "Système",
  Light: "Clair",
  Dark: "Sombre",
  "Powered by Puter": "Propulsé par Puter",
  Workspace: "Espace de travail",
  "Keyboard shortcuts": "Raccourcis clavier",
  "Start with a little inspiration": "Un peu d’inspiration pour commencer",
  "Make it your own": "À votre image",
  "Blank board": "Tableau vierge",
  "A fresh start": "Un nouveau départ",
  "Mind map": "Carte mentale",
  "Your boards": "Vos tableaux",
  "Favorite boards": "Tableaux favoris",
  "New board": "Nouveau tableau",
  "Search boards": "Rechercher des tableaux",
  "Search your boards": "Rechercher dans vos tableaux",
  "Sort boards": "Trier les tableaux",
  "Last edited": "Dernière modification",
  Name: "Nom",
  "Grid view": "Vue en grille",
  "List view": "Vue en liste",
  "Board layout": "Affichage des tableaux",
  Location: "Emplacement",
  "Fill color": "Couleur de remplissage",
  Border: "Bordure",
  "Text style": "Style du texte",
  "Import board file": "Importer un tableau",
  "A world of possibility": "Un monde de possibilités",
  "No boards found": "Aucun tableau trouvé",
  "Keep your best ideas close": "Gardez vos meilleures idées à portée de main",
  "Your next idea starts here": "Votre prochaine idée commence ici",
  "Trash is empty": "La corbeille est vide",
  "Boards you move to the trash wait here until you restore them or delete them permanently.":
    "Les tableaux mis à la corbeille attendent ici jusqu’à ce que vous les restauriez ou les supprimiez définitivement.",
  "Try different words.": "Essayez d’autres mots.",
  "Star a board to find it here.":
    "Ajoutez un tableau aux favoris pour le retrouver ici.",
  "Create a board or choose a template above.":
    "Créez un tableau ou choisissez un modèle ci-dessus.",
  "Untitled board": "Tableau sans titre",
  "Back to boards": "Retour aux tableaux",
  "Board name": "Nom du tableau",
  "Saved on this device": "Enregistré sur cet appareil",
  "Save to Puter": "Enregistrer sur Puter",
  "Saved to Puter · Save again":
    "Enregistré sur Puter · Enregistrer de nouveau",
  "Save shared changes now":
    "Enregistrer les modifications partagées maintenant",
  "On this device": "Sur cet appareil",
  "Boards stay in this browser until you sign in.":
    "Les tableaux restent dans ce navigateur tant que vous n’êtes pas connecté.",
  "Open from Puter": "Ouvrir depuis Puter",
  "Not on this device yet": "Pas encore sur cet appareil",
  "Export board": "Exporter le tableau",
  "Drawing tools": "Outils de création",
  Select: "Sélectionner",
  Pan: "Déplacer la vue",
  "Sticky note": "Note adhésive",
  Text: "Texte",
  Rectangle: "Rectangle",
  Ellipse: "Ellipse",
  Arrow: "Flèche",
  Draw: "Dessiner",
  Eraser: "Gomme",
  Frame: "Cadre",
  "Add image": "Ajouter une image",
  "Personal board": "Tableau personnel",
  "Board objects": "Objets du tableau",
  "Zoom out": "Zoom arrière",
  "Zoom in": "Zoom avant",
  "Reset zoom to 100 percent": "Rétablir le zoom à 100 %",
  "Fit board to screen": "Ajuster le tableau à l’écran",
  "Butter color": "Couleur beurre",
  "Sticky note color": "Couleur des notes adhésives",
  "Frame format": "Format du cadre",
  Custom: "Personnalisé",
  "Slide 16:9": "Diapositive 16:9",
  "Slide 4:3": "Diapositive 4:3",
  "Square 1:1": "Carré 1:1",
  Phone: "Téléphone",
  Tablet: "Tablette",
  Desktop: "Ordinateur",
  "Sage color": "Couleur sauge",
  "Blue color": "Couleur bleue",
  "Lilac color": "Couleur lilas",
  "Peach color": "Couleur pêche",
  "White color": "Couleur blanche",
  "Drawing color": "Couleur du dessin",
  "Graphite color": "Couleur graphite",
  "Red color": "Couleur rouge",
  "Green color": "Couleur verte",
  "Orange color": "Couleur orange",
  "Purple color": "Couleur violette",
  "Edit selected object": "Modifier l’objet sélectionné",
  "Duplicate selection": "Dupliquer la sélection",
  "Duplicate left": "Dupliquer à gauche",
  "Duplicate right": "Dupliquer à droite",
  "Duplicate above": "Dupliquer au-dessus",
  "Duplicate below": "Dupliquer en dessous",
  "Drag a copy": "Faire glisser une copie",
  "Duplicate in a direction": "Dupliquer dans une direction",
  "The duplicate would be outside the board limits.":
    "La copie serait en dehors des limites du tableau.",
  "Bring to front": "Mettre au premier plan",
  "Delete selection": "Supprimer la sélection",
  "Select and move · Double-click to edit · Space to pan":
    "Sélectionner et déplacer · Double-clic pour modifier · Espace pour naviguer",
  "Select objects to read them · Space to pan":
    "Sélectionnez des objets pour les lire · Espace pour naviguer",
  "Select objects to read them · Comment (C) to discuss · Space to pan":
    "Sélectionnez des objets pour les lire · Commentaire (C) pour en discuter · Espace pour naviguer",
  "Drag to move around your board":
    "Faites glisser pour vous déplacer dans le tableau",
  "Draw freely on the canvas": "Dessinez librement sur le tableau",
  "Drag across drawings to erase them":
    "Faites glisser sur les dessins pour les effacer",
  "This drawing is full. Draw again to continue.":
    "Ce dessin est plein. Dessinez de nouveau pour continuer.",
  "Click to add a sticky note · Drag to draw one at a size":
    "Cliquez pour ajouter une note adhésive · Glissez pour en dessiner une à la taille voulue",
  "Click to add text · Drag to set its width":
    "Cliquez pour ajouter du texte · Glissez pour fixer sa largeur",
  "Click to add a rectangle · Drag to draw one at a size":
    "Cliquez pour ajouter un rectangle · Glissez pour en dessiner un à la taille voulue",
  "Click to add an ellipse · Drag to draw one at a size":
    "Cliquez pour ajouter une ellipse · Glissez pour en dessiner une à la taille voulue",
  "Click to add a frame · Drag to draw one around objects":
    "Cliquez pour ajouter un cadre · Glissez pour en dessiner un autour d’objets",
  "Click the canvas to add a comment":
    "Cliquez sur le tableau pour ajouter un commentaire",
  "Drag across the board to choose the area to export":
    "Faites glisser sur le tableau pour choisir la zone à exporter",
  "Drag from start to end": "Faites glisser du début à la fin",
  "Your text": "Votre texte",
  "Close dialog": "Fermer la fenêtre",
  Width: "Largeur",
  Height: "Hauteur",
  "Save changes": "Enregistrer les modifications",
  "Take your ideas with you": "Emportez vos idées",
  "Export a visual snapshot or a fully editable backup.":
    "Exportez une image ou une sauvegarde modifiable.",
  "PNG image": "Image PNG",
  "JPEG image": "Image JPEG",
  "PDF document": "Document PDF",
  "Whiteboard file": "Fichier Whiteboard",
  "Import it later and keep creating": "Importez-le plus tard pour continuer",
  "Board options": "Options du tableau",
  "Move to trash": "Mettre à la corbeille",
  "Move this board to the trash?": "Mettre ce tableau à la corbeille?",
  "Boards in the trash can be restored from there.":
    "Les tableaux dans la corbeille peuvent être restaurés à partir de là.",
  "The copy saved in Puter is kept.":
    "La copie enregistrée sur Puter est conservée.",
  Duplicate: "Dupliquer",
  "Save name": "Enregistrer le nom",
  "Board name saved. You changed it while saving. Save again to update the name.":
    "Le nom du tableau est enregistré. Vous l’avez modifié pendant l’enregistrement. Enregistrez de nouveau pour mettre le nom à jour.",
  "This board changed in another tab. Your name draft is kept. Save again to rename the latest copy.":
    "Ce tableau a changé dans un autre onglet. Votre nom est conservé. Enregistrez de nouveau pour renommer la dernière copie.",
  "Your name draft is kept here.": "Votre nom est conservé ici.",
  "This board is in the trash. Your name draft is kept here.":
    "Ce tableau est dans la corbeille. Votre nom est conservé ici.",
  "Keep board": "Conserver le tableau",
  "Delete board": "Mettre à la corbeille",
  "Restore board": "Restaurer le tableau",
  "Saving…": "Enregistrement…",
  "Saved locally": "Enregistré localement",
  "Storage full": "Stockage plein",
  "Saving to Puter…": "Enregistrement sur Puter…",
  "Saved to Puter": "Enregistré sur Puter",
  "Cloud save failed": "Échec de l’enregistrement dans le nuage",
  "Newer copy in Puter": "Copie plus récente sur Puter",
  "A newer copy of this board is saved in Puter.":
    "Une copie plus récente de ce tableau est enregistrée sur Puter.",
  "Open newer copy": "Ouvrir la copie plus récente",
  "copy on this device": "copie sur cet appareil",
  "Opened the copy from Puter. The edits made on this device are kept as their own board.":
    "La copie de Puter est ouverte. Les modifications faites sur cet appareil sont conservées dans un tableau à part.",
  "Could not open the copy in Puter.":
    "Impossible d’ouvrir la copie sur Puter.",
  "The cloud board index is invalid. Your files remain in Puter.":
    "L’index des tableaux dans le nuage est invalide. Vos fichiers restent dans Puter.",
  "Invalid board identifier.": "Identifiant de tableau invalide.",
  "The AI request failed.": "La demande à l’IA a échoué.",
  "Could not move this board to the trash.":
    "Impossible de mettre ce tableau à la corbeille.",
  // Added to the names of duplicated and imported boards.
  copy: "copie",
  imported: "importé",
  "Could not save the copy on this device.":
    "Impossible d’enregistrer la copie sur cet appareil.",
  "Could not save this change on this device.":
    "Impossible d’enregistrer cette modification sur cet appareil.",
  "Could not save locally. Export your board to keep a copy.":
    "Enregistrement local impossible. Exportez votre tableau pour en conserver une copie.",
  "Cloud save failed. Your local copy is safe. Use Save to Puter to retry.":
    "Échec de l’enregistrement sur Puter. Votre copie locale est conservée. Réessayez avec Enregistrer sur Puter.",
  "Board imported.": "Tableau importé.",
  "A newer local copy was kept.":
    "La copie locale plus récente a été conservée.",
  Language: "Langue",
  "More tools": "Autres outils",
  Link: "Lien",
  Table: "Tableau de données",
  "File attachment": "Pièce jointe",
  "Add link": "Ajouter un lien",
  "Add table": "Ajouter un tableau de données",
  "Attach file": "Joindre un fichier",
  "Add content": "Ajouter du contenu",
  "Open link": "Ouvrir le lien",
  "Select a link card first.": "Sélectionnez d’abord une carte de lien.",
  "Download attachment": "Télécharger la pièce jointe",
  "Import contents": "Importer le contenu",
  "Files added. To add a document’s contents to the board, open its file card and choose Import contents.":
    "Fichiers ajoutés. Pour ajouter le contenu d’un document au tableau, ouvrez sa carte de fichier et choisissez Importer le contenu.",
  URL: "Adresse URL",
  Label: "Libellé",
  Rows: "Lignes",
  Columns: "Colonnes",
  "Add row": "Ajouter une ligne",
  "Add column": "Ajouter une colonne",
  "Remove last row": "Supprimer la dernière ligne",
  "Remove last column": "Supprimer la dernière colonne",
  "Table cells": "Cellules du tableau",
  "File name": "Nom du fichier",
  "Choose a file smaller than 10 MB.":
    "Choisissez un fichier de moins de 10 Mo.",
  "Enter a valid http or https link.":
    "Saisissez une adresse http ou https valide.",
  "Group selection": "Grouper la sélection",
  "Ungroup selection": "Dissocier la sélection",
  "Connect selected objects": "Relier les objets sélectionnés",
  "Select exactly two objects to connect.":
    "Sélectionnez exactement deux objets à relier.",
  "Select at least two objects to group.":
    "Sélectionnez au moins deux objets à grouper.",
  "Already grouped.": "Déjà groupés.",
  "Organize selection": "Organiser la sélection",
  "Lock selection": "Verrouiller la sélection",
  "Lock frame": "Verrouiller le cadre",
  "Unlock selection": "Déverrouiller la sélection",
  "Lock or unlock selection": "Verrouiller ou déverrouiller la sélection",
  "Unlock all objects": "Déverrouiller tous les objets",
  "Protected selection": "Sélection protégée",
  "More options": "Plus d’options",
  "Unlock to move, edit, or delete.":
    "Déverrouillez pour déplacer, modifier ou supprimer.",
  "Unlock protected objects before changing this selection.":
    "Déverrouillez les objets protégés avant de modifier cette sélection.",
  "Workshop content hidden from you was left out of the copy.":
    "Le contenu d’atelier qui vous est masqué n’a pas été inclus dans la copie.",
  "Hidden object": "Objet masqué",
  "Choose a visible object.": "Choisissez un objet visible.",
  "Hidden objects cannot be cut. Copy the selection instead.":
    "Les objets masqués ne peuvent pas être coupés. Copiez plutôt la sélection.",
  "Hidden objects cannot be copied.":
    "Les objets masqués ne peuvent pas être copiés.",
  "Selection locked.": "Sélection verrouillée.",
  "Selection unlocked.": "Sélection déverrouillée.",
  "All objects unlocked.": "Tous les objets sont déverrouillés.",
  "No locked objects.": "Aucun objet verrouillé.",
  "Frame locked. Its contents remain editable.":
    "Cadre verrouillé. Son contenu reste modifiable.",
  Locked: "Verrouillé",
  "Rotated selections keep their proportions. Alt/Option bypasses snapping.":
    "Les sélections pivotées conservent leurs proportions. Alt/Option désactive l’alignement.",
  "Rotate selection": "Faire pivoter la sélection",
  "Angle (degrees)": "Angle (degrés)",
  "Rotate by (degrees)": "Rotation relative (degrés)",
  "Reset angle": "Réinitialiser l’angle",
  "Apply rotation": "Appliquer la rotation",
  "Select shapes, text, images, cards, or drawings to rotate.":
    "Sélectionnez des formes, du texte, des images, des cartes ou des dessins à faire pivoter.",
  "Drag the rotation handle below the left corner. Hold Shift to snap to 15° steps. Escape cancels.":
    "Faites glisser la poignée de rotation sous le coin gauche. Maintenez Maj pour des pas de 15°. Échap annule.",
  "Enter a valid angle.": "Saisissez un angle valide.",
  "This rotation exceeds the board limits.":
    "Cette rotation dépasse les limites du tableau.",
  "Keep proportions when resizing rotated objects together.":
    "Conservez les proportions pour redimensionner ensemble des objets pivotés.",
  "Resize selection": "Redimensionner la sélection",
  "Resize frame": "Redimensionner le cadre",
  "Frame contents stay in place.": "Le contenu du cadre reste en place.",
  "Resize objects and their spacing together.":
    "Redimensionnez ensemble les objets et leur espacement.",
  "Keep proportions": "Conserver les proportions",
  "Scale text with objects": "Redimensionner le texte avec les objets",
  "Apply size": "Appliquer les dimensions",
  "Select objects with a resizable area.":
    "Sélectionnez des objets ayant une surface redimensionnable.",
  "Drag the corner to resize. Shift toggles proportions; Alt/Option bypasses snapping.":
    "Faites glisser le coin pour redimensionner. Maj inverse le maintien des proportions ; Alt/Option désactive temporairement l’alignement magnétique.",
  "Size adjusted to keep content readable. Review and apply again.":
    "Dimensions ajustées pour garder le contenu lisible. Vérifiez puis appliquez à nouveau.",
  "Toggle proportions while resizing":
    "Inverser le maintien des proportions pendant le redimensionnement",
  "Enter valid dimensions.": "Saisissez des dimensions valides.",
  "This size exceeds the board limits.":
    "Ces dimensions dépassent les limites du tableau.",
  "Keep text between 8 and 100 pixels.":
    "Gardez le texte entre 8 et 100 pixels.",
  "Text stays between 8 and 100 pixels, so this selection cannot be resized further.":
    "Le texte reste entre 8 et 100 pixels : cette sélection ne peut pas être redimensionnée davantage.",
  "The selection changed. Select it again.":
    "La sélection a changé. Sélectionnez-la à nouveau.",
  "Snap to objects": "Alignement magnétique",
  "Snapping on. Hold Alt/Option to bypass.":
    "Alignement magnétique activé. Maintenez Alt/Option pour le désactiver temporairement.",
  "Snapping off.": "Alignement magnétique désactivé.",
  "Added by": "Ajoutée par",
  "Show sticky note authors": "Afficher les auteurs des notes adhésives",
  "Hide sticky note authors": "Masquer les auteurs des notes adhésives",
  "Sticky notes show who added them.":
    "Les notes adhésives indiquent qui les a ajoutées.",
  "Sticky note authors hidden.": "Auteurs des notes adhésives masqués.",
  "After a pen, fingers only move the board":
    "Après le stylet, les doigts ne font que déplacer le tableau",
  "After a pen, fingers only move the board.":
    "Après le stylet, les doigts ne font que déplacer le tableau.",
  "Fingers draw and select, even after a pen.":
    "Les doigts dessinent et sélectionnent, même après le stylet.",
  "Pen in use: one finger moves the board and two zoom. You can change this in Preferences.":
    "Stylet utilisé : un doigt déplace le tableau, deux doigts zooment. Vous pouvez changer cela dans les Préférences.",
  "Temporarily bypass snapping":
    "Désactiver temporairement l’alignement magnétique",
  "Cancel the current move or resize":
    "Annuler le déplacement ou le redimensionnement en cours",
  "Create frame around selection": "Créer un cadre autour de la sélection",
  "Move into frame": "Placer dans un cadre",
  "No frame": "Aucun cadre",
  "Align left": "Aligner à gauche",
  "Align top": "Aligner en haut",
  "Align right": "Aligner à droite",
  "Align bottom": "Aligner en bas",
  "Center vertically": "Centrer verticalement",
  "Distribute horizontally": "Répartir horizontalement",
  "Distribute vertically": "Répartir verticalement",
  "Send to back": "Mettre à l’arrière-plan",
  "Bring forward": "Avancer d’un plan",
  "Send backward": "Reculer d’un plan",
  Alignment: "Alignement",
  Spacing: "Espacement",
  "Layer order": "Ordre des plans",
  "Group and organize": "Grouper et organiser",
  "Select at least three objects or groups to distribute evenly.":
    "Sélectionnez au moins trois objets ou groupes pour les répartir uniformément.",
  "Send backward / bring forward": "Reculer / avancer d’un plan",
  "Send to back / bring to front": "Mettre à l’arrière-plan / au premier plan",
  "Center horizontally": "Centrer horizontalement",
  "Save as reusable content": "Enregistrer comme contenu réutilisable",
  "Frames and navigation": "Cadres et navigation",
  "Add a frame to organize content and create presentation slides.":
    "Ajoutez un cadre pour organiser le contenu et créer des diapositives.",
  "Go to frame": "Aller au cadre",
  "Add frame": "Ajouter un cadre",
  "Present from this frame": "Présenter à partir de ce cadre",
  "Export selected frames": "Exporter les cadres sélectionnés",
  "The frames were added without their agenda steps: the agenda holds at most 60 steps.":
    "Les cadres ont été ajoutés sans leurs étapes : l’ordre du jour compte au plus 60 étapes.",
  "Move frame earlier": "Avancer le cadre",
  "Move frame later": "Reculer le cadre",
  "Copy link to frame": "Copier le lien du cadre",
  "Showing frame {number} of {count}":
    "Affichage du cadre {number} sur {count}",
  "Search frames": "Rechercher des cadres",
  "No frames match your search.":
    "Aucun cadre ne correspond à votre recherche.",
  "Arrow keys move between frames. Alt and the up or down arrow move a frame earlier or later.":
    "Les touches fléchées passent d’un cadre à l’autre. Alt et la flèche vers le haut ou vers le bas déplacent un cadre plus tôt ou plus tard.",
  "Arrow keys move between frames.":
    "Les touches fléchées passent d’un cadre à l’autre.",
  "Frames can be reordered once the facilitator shows every frame.":
    "Les cadres pourront être réordonnés quand l’animateur affichera tous les cadres.",
  Section: "Section",
  Presentation: "Présentation",
  Present: "Présenter",
  "Present board": "Présenter le tableau",
  "Start presentation": "Démarrer la présentation",
  "Choose frames in presentation order.":
    "Choisissez les cadres dans l’ordre de présentation.",
  "This board has no frames, so it presents as one slide. Add frames to make slides.":
    "Ce tableau n’a pas de cadres : il se présente en une seule diapositive. Ajoutez des cadres pour créer des diapositives.",
  "Present selection": "Présenter la sélection",
  "Previous slide": "Diapositive précédente",
  "Next slide": "Diapositive suivante",
  "Exit presentation": "Quitter la présentation",
  Fullscreen: "Plein écran",
  "Selected content": "Contenu sélectionné",
  "Entire board": "Tableau entier",
  "Export scope": "Zone à exporter",
  "Selected objects or region": "Objets ou région sélectionnés",
  "Export region": "Région d’exportation",
  "Defined frames": "Cadres définis",
  "Export format": "Format d’exportation",
  Export: "Exporter",
  "Select objects or draw a region first.":
    "Sélectionnez des objets ou dessinez une région.",
  "Add a frame before exporting sections.":
    "Ajoutez un cadre avant d’exporter des sections.",
  "PDFs include a board overview and readable detail pages for large areas. Images export one region at a time.":
    "Les PDF comprennent une vue d’ensemble et des pages de détail lisibles pour les grandes zones. Les images exportent une région à la fois.",
  "Select export region": "Sélectionner une région à exporter",
  "Region selected. Open Export to use it, or press Escape to clear it.":
    "Zone sélectionnée. Ouvrez Exporter pour l’utiliser, ou appuyez sur Échap pour l’effacer.",
  "Export region cleared.": "Zone d’exportation effacée.",
  "Clear export region": "Effacer la zone d’exportation",
  "Clear region": "Effacer la région",
  "Version history": "Historique des versions",
  "Create checkpoint": "Créer un point de restauration",
  "Checkpoint name": "Nom du point de restauration",
  Checkpoint: "Point de restauration",
  "Restore version": "Restaurer cette version",
  "Before restoration": "Avant la restauration",
  "Board edit": "Modification du tableau",
  "Before deletion": "Avant la suppression",
  "No saved versions yet.": "Aucune version enregistrée pour le moment.",
  "The 30 most recent versions are kept on this device, and one for each quarter hour of the last 30 days (up to 200 more), within 50 MB; when space runs short, the last version of each day is kept before the others. Pictures shared by several versions are stored once. Named checkpoints and the version saved before each restoration are kept apart from these: the newest 100, within another 50 MB.":
    "Les 30 versions les plus récentes sont conservées sur cet appareil, ainsi qu’une par quart d’heure des 30 derniers jours (jusqu’à 200 de plus), dans une limite de 50 Mo ; quand la place manque, la dernière version de chaque jour est conservée avant les autres. Les images communes à plusieurs versions ne sont stockées qu’une fois. Les points de restauration nommés et la version enregistrée avant chaque restauration sont conservés à part : les 100 plus récents, dans une limite de 50 Mo supplémentaires.",
  "Version restored.": "Version restaurée.",
  "Checkpoint saved.": "Point de restauration enregistré.",
  "Could not save the checkpoint. Export a backup.":
    "Impossible d’enregistrer le point de restauration. Exportez une sauvegarde.",
  "Could not save a recovery version. Export a backup.":
    "Impossible d’enregistrer une version de récupération. Exportez une sauvegarde.",
  "Template library": "Bibliothèque de modèles",
  "Browse all templates": "Parcourir tous les modèles",
  "Search templates": "Rechercher des modèles",
  "All categories": "Toutes les catégories",
  "Use template": "Utiliser ce modèle",
  "Insert into board": "Insérer dans le tableau",
  "My reusable content": "Mon contenu réutilisable",
  "No reusable content yet. Select objects on a board, then choose Save as reusable content from the right-click menu or More options.":
    "Aucun contenu réutilisable. Sélectionnez des objets dans un tableau, puis choisissez Enregistrer comme contenu réutilisable dans le menu contextuel ou Plus d’options.",
  "Reusable content saved.": "Contenu réutilisable enregistré.",
  "Could not save this content on this device.":
    "Impossible d’enregistrer ce contenu sur cet appareil.",
  "Delete template": "Supprimer le modèle",
  "Confirm delete": "Confirmer la suppression",
  "Confirm remove": "Confirmer le retrait",
  "Use arrow keys or Space to navigate slides. Press Escape to exit.":
    "Utilisez les touches fléchées ou Espace pour naviguer. Appuyez sur Échap pour quitter.",
  "Swipe left or right, or use the buttons, to change slides.":
    "Balayez vers la gauche ou la droite, ou utilisez les boutons, pour changer de diapositive.",
  Objects: "Objets",
  "{count} board found": "{count} tableau trouvé",
  "{count} boards found": "{count} tableaux trouvés",
  "{count} object": "{count} objet",
  "{count} objects": "{count} objets",
  Deleted: "Suppression",
  "{count} object selected": "{count} objet sélectionné",
  "{count} objects selected": "{count} objets sélectionnés",
  "{count} object deleted": "{count} objet supprimé",
  "{count} objects deleted": "{count} objets supprimés",
  "Search objects": "Rechercher des objets",
  "Select an object to move it with the arrow keys. Press Enter to edit.":
    "Sélectionnez un objet, déplacez-le avec les flèches, puis appuyez sur Entrée pour le modifier.",
  "Your board is empty. Add a note or shape to get started.":
    "Votre tableau est vide. Ajoutez une note ou une forme.",
  "Canvas objects": "Objets du tableau",
  "Arrow keys, Home and End move between objects.":
    "Les touches fléchées, Début et Fin passent d’un objet à l’autre.",
  "Arrow keys, Home and End move between objects. Page Down and Page Up move to the next or previous frame.":
    "Les touches fléchées, Début et Fin passent d’un objet à l’autre. Page suivante et Page précédente passent au cadre suivant ou précédent.",
  "Whiteboard canvas. Use Board objects to select and edit objects with the keyboard.":
    "Tableau blanc. Utilisez Objets du tableau pour sélectionner et modifier les objets au clavier.",
  "Undo (Ctrl/Cmd Z)": "Annuler (Ctrl/Cmd Z)",
  "Redo (Ctrl/Cmd Shift Z)": "Rétablir (Ctrl/Cmd Maj Z)",
  "Choose a tool, then click the canvas. Double-click an object to edit its text. Drag a corner to resize.":
    "Choisissez un outil, puis cliquez sur le tableau. Double-cliquez sur un objet pour modifier son texte. Faites glisser un coin pour le redimensionner.",
  "Select / pan": "Sélectionner / naviguer",
  "Sticky note / text": "Note adhésive / texte",
  "Rectangle / ellipse": "Rectangle / ellipse",
  "Arrow / draw / eraser / frame": "Flèche / dessin / gomme / cadre",
  "Move around the canvas": "Naviguer dans le tableau",
  "Zoom toward the pointer": "Zoomer vers le pointeur",
  "Select multiple objects": "Sélectionner plusieurs objets",
  "Move selected objects": "Déplacer les objets sélectionnés",
  "Edit the focused object": "Modifier l’objet actif",
  Undo: "Annuler",
  Copy: "Copier",
  Cut: "Couper",
  Paste: "Coller",
  "Select all": "Tout sélectionner",
  "Select none": "Tout désélectionner",
  "Shift + drag": "Maj + glisser",
  "Move straight across or down":
    "Déplacer en ligne droite, horizontalement ou verticalement",
  "Elsewhere, Tab or Ctrl/Cmd+D goes on to a new sticky note.":
    "Ailleurs, Tab ou Ctrl/Cmd+D passe à une nouvelle note adhésive.",
  "Right-click / Shift + F10": "Clic droit / Maj + F10",
  "Open the menu of the selection or board":
    "Ouvrir le menu de la sélection ou du tableau",
  "Object actions": "Actions sur l’objet",
  "Board actions": "Actions du tableau",
  "The clipboard is empty.": "Le presse-papiers est vide.",
  "Your browser did not allow access to the clipboard. Press Ctrl/Cmd+C to copy.":
    "Votre navigateur n’a pas autorisé l’accès au presse-papiers. Appuyez sur Ctrl/Cmd+C pour copier.",
  "Your browser did not allow access to the clipboard. Press Ctrl/Cmd+X to cut.":
    "Votre navigateur n’a pas autorisé l’accès au presse-papiers. Appuyez sur Ctrl/Cmd+X pour couper.",
  "Your browser did not allow access to the clipboard. Press Ctrl/Cmd+V to paste.":
    "Votre navigateur n’a pas autorisé l’accès au presse-papiers. Appuyez sur Ctrl/Cmd+V pour coller.",
  Redo: "Rétablir",
  "Delete selection": "Supprimer la sélection",
  "Keyboard-only? Use Board objects to select an object. Tool shortcuts add objects in the center of your view.":
    "Au clavier : utilisez Objets du tableau pour sélectionner un objet. Les raccourcis ajoutent les objets au centre de la vue.",
  "Drag to move this object. Use the corner handle to resize images.":
    "Faites glisser cet objet pour le déplacer. Utilisez la poignée d’angle pour redimensionner les images.",
  "Choose a file smaller than 20 MB.":
    "Choisissez un fichier de moins de 20 Mo.",
  "Choose an image smaller than 5 MB.":
    "Choisissez une image de moins de 5 Mo.",
  "Choose an image smaller than 30 MB.":
    "Choisissez une image de moins de 30 Mo.",
  "This image could not be made small enough to add.":
    "Cette image n’a pas pu être réduite suffisamment pour être ajoutée.",
  "Choose a PNG, JPEG, WebP, GIF, or BMP image.":
    "Choisissez une image PNG, JPEG, WebP, GIF ou BMP.",
  "Could not open image.": "Impossible d’ouvrir l’image.",
  "Could not import this file.": "Impossible d’importer ce fichier.",
  "Could not open cloud board.":
    "Impossible d’ouvrir le tableau dans le nuage.",
  "Puter could not load. Check your connection and try again.":
    "Puter n’a pas pu être chargé. Vérifiez votre connexion et réessayez.",
  "Could not connect to Puter.": "Connexion à Puter impossible.",
  "Could not connect. Please try again.":
    "Connexion impossible. Veuillez réessayer.",
  "Export failed. Please try again.":
    "L’exportation a échoué. Veuillez réessayer.",
  "This is not a supported Whiteboard file.":
    "Ce fichier Whiteboard n’est pas pris en charge.",
  "Your browser storage is unavailable.":
    "Le stockage de votre navigateur est indisponible.",
  "Enable site storage and reload to start creating safely.":
    "Activez le stockage du site et rechargez la page pour commencer.",
  Reload: "Recharger",
  Close: "Fermer",
  Create: "Créer",
  Cancel: "Annuler",
  Save: "Enregistrer",
  "Select objects first.": "Sélectionnez d’abord des objets.",
  "Select one object first.": "Sélectionnez d’abord un seul objet.",
  "Trash is empty.": "La corbeille est vide.",
  "Board moved to Trash.": "Tableau déplacé dans la corbeille.",
  "Board restored.": "Tableau restauré.",
  "Delete permanently": "Supprimer définitivement",
  "Delete this board permanently?": "Supprimer ce tableau définitivement ?",
  "This removes the board and its recovery versions from this device. It cannot be undone.":
    "Le tableau et ses versions de récupération sont retirés de cet appareil. Cette action est irréversible.",
  "Keep in trash": "Garder dans la corbeille",
  "Board deleted permanently.": "Tableau supprimé définitivement.",
  "Could not delete this board from this device.":
    "Impossible de supprimer ce tableau de cet appareil.",
  "Could not delete this content on this device.":
    "Impossible de supprimer ce contenu sur cet appareil.",
  "Reduce the selection to one region for image export.":
    "Choisissez une seule région pour exporter une image.",
  "Choose at least one frame.": "Choisissez au moins un cadre.",
  "The presented frames are no longer available.":
    "Les cadres présentés ne sont plus disponibles.",
  "No templates found.": "Aucun modèle trouvé.",
  "No matching objects.": "Aucun objet correspondant.",
  "This board is too spread out to show whole. Showing the part with the most objects.":
    "Ce tableau est trop étendu pour être affiché en entier. Affichage de la partie qui contient le plus d’objets.",
  "Remove from frame": "Retirer du cadre",
  "Board edit saved": "Modification enregistrée",
  "action|Open": "Ouvrir",
  "key|Shift": "Maj",
  "key|Enter": "Entrée",
  "key|Backspace": "Retour arrière",
  "key|Delete": "Suppr",
  "key|Minus": "Moins",
  "key|Up": "Haut",
  "key|Down": "Bas",
  "notification|Reply": "Réponse",
  "results|Top": "Premiers",
  "Invite people to edit, comment on, or view this board. Invitation links expire after seven days.":
    "Invitez des personnes à modifier, commenter ou consulter ce tableau. Les liens d’invitation expirent après sept jours.",
  "Copy the board's link to send it to people who already have access to it.":
    "Copiez le lien du tableau pour l’envoyer à des personnes qui y ont déjà accès.",
  "Creating link…": "Création du lien…",
  "Reset link": "Réinitialiser le lien",
  "The link now gives the chosen access. Links copied earlier keep the access they had.":
    "Le lien donne désormais l’accès choisi. Les liens copiés auparavant conservent leur accès.",
  "Earlier links no longer work. People already on the board keep access.":
    "Les anciens liens ne fonctionnent plus. Les personnes déjà sur le tableau conservent leur accès.",
  "Anyone signed in with it can join.":
    "Toute personne connectée qui l’utilise peut se joindre.",
  "Members of the organization signed in with it can join.":
    "Les membres de l’organisation connectés qui l’utilisent peuvent se joindre.",
  "Anyone signed in with it can join. People outside the organization join as guests with “{role}” access, the most your organization gives guests.":
    "Toute personne connectée qui l’utilise peut se joindre. Les personnes de l’extérieur de l’organisation se joignent comme invités avec l’accès « {role} », le plus élevé que votre organisation accorde aux invités.",
  "Anyone signed in with it can join. People outside the organization join as guests.":
    "Toute personne connectée qui l’utilise peut se joindre. Les personnes de l’extérieur de l’organisation se joignent comme invités.",
  "It opens for people who already have access.":
    "Il s’ouvre pour les personnes qui ont déjà accès.",
  "Your organization has turned off Miro imports.":
    "Votre organisation a désactivé les importations depuis Miro.",
  Planning: "Planification",
  "This export is too large. Export fewer frames at a time.":
    "Cette exportation est trop volumineuse. Exportez moins de cadres à la fois.",
  "This feature could not load. Check your connection and try again.":
    "Cette fonction n’a pas pu se charger. Vérifiez votre connexion et réessayez.",
};
// Feature modules register their own French strings next to their code.
// Existing entries win so a module cannot silently change shared labels.
export function addTranslations(entries) {
  for (const [english, french] of Object.entries(entries))
    if (!Object.hasOwn(pairs, english)) pairs[english] = french;
}
const types = {
  __proto__: null,
  note: "便签",
  text: "文本",
  rect: "矩形",
  ellipse: "椭圆",
  arrow: "箭头",
  pen: "手绘",
  frame: "画框",
  image: "图片",
  table: "数据表格",
  link: "链接",
  file: "附件",
  embed: "嵌入",
};
// A context tells apart words that translate differently, such as "Open" as
// a state and as an action: t("Open", "action") uses the "action|Open" entry.
export function t(text, context) {
  // Anything other than text, such as a missing error message, passes
  // through as it does in English.
  if (language === "en" || typeof text !== "string") return text;
  if (context && pairs[`${context}|${text}`])
    return pairs[`${context}|${text}`];
  if (pairs[text]) return pairs[text];
  let m;
  if (
    (m = text.match(
      /^(Select|Pan|Sticky note|Text|Rectangle|Ellipse|Arrow|Draw|Frame) \((\w)\)$/,
    ))
  )
    return `${pairs[m[1]] || m[1]} (${m[2]})`;
  if ((m = text.match(/^Edit (.+)$/)) && types[m[1]])
    return `编辑：${types[m[1]]}`;
  if ((m = text.match(/^(\d+) results?$/)))
    return `${m[1]} 个结果`;
  if ((m = text.match(/^(\d+) selected$/))) return `已选择 ${m[1]} 项`;
  if (
    (m = text.match(
      /^(All boards|Favorites|Your boards|Favorite boards) (\d+)$/,
    ))
  )
    return `${pairs[m[1]] || m[1]} ${m[2]}`;
  // The favorite star is a toggle: its name stays put and its pressed state
  // says whether the board is a favorite.
  if ((m = text.match(/^(Open|Favorite|Options for|Restore or delete) (.+)$/)))
    return `${{ Open: "打开", Favorite: "收藏：", "Options for": "选项：", "Restore or delete": "恢复或删除" }[m[1]] || m[1]} ${m[2]}`;
  if ((m = text.match(/^(\d+) objects/)))
    return text.replace(`${m[1]} objects`, `${m[1]} 个对象`);
  return text;
}
// The message for a count, with {count} filled in: `one` where the language
// takes its singular, 1 in English and 0 or 1 in French, `other` elsewhere.
// A singular that English writes like its plural, such as "{count} done",
// is translated from its "one|" entry.
const pluralRules = {};
// Compares names as people read them in the language, "person2" before
// "person10"; one collator serves a whole sort of hundreds of names.
export const nameOrder = () =>
  new Intl.Collator(language === "fr" ? "fr-CA" : "en-CA", { numeric: true })
    .compare;
// Whether the language writes a count in the singular: 1 in English, 0
// and 1 in French.
export function singular(count) {
  const locale = language === "fr" ? "fr-CA" : "en-CA";
  pluralRules[locale] ??= new Intl.PluralRules(locale);
  return pluralRules[locale].select(count) === "one";
}
export function plural(count, one, other) {
  const single = singular(count);
  return t(single ? one : other, single ? "one" : undefined).replace(
    "{count}",
    count,
  );
}
// A label and what it names, as "Label: value". French sets the colon apart
// with a space.
export const labelled = (label, value) =>
  `${label}${language === "fr" ? " : " : ": "}${value}`;
const sources = new WeakMap();
const attributeSources = new WeakMap();
// The language of the last pass over the whole page. English text needs no
// translation, so once a whole pass has rendered the page in English (which
// restores it after French), further passes have nothing to do and return
// at once: this runs on each draw.
let renderedLanguage = null;
// In French every pass walks the page, so a pass runs only once the page
// has changed since the last one; the observer ignores the pass's own
// writes, which it takes before they are delivered.
let changed = true,
  observer = null,
  observed = null;
// A write of the value already there, as a paint makes each frame for the
// zoom label or a control's name, changes nothing to translate.
const realChange = (r) =>
  r.type === "attributes"
    ? r.oldValue !== r.target.getAttribute(r.attributeName)
    : r.type === "characterData"
      ? r.oldValue !== r.target.data
      : !(
          r.addedNodes.length === 1 &&
          r.removedNodes.length === 1 &&
          r.addedNodes[0].nodeType === 3 &&
          r.removedNodes[0].nodeType === 3 &&
          r.addedNodes[0].data === r.removedNodes[0].data
        );
function watchPage() {
  const Observer = document.defaultView?.MutationObserver;
  if (observed === document.body || typeof Observer !== "function") return;
  observer?.disconnect();
  observer = new Observer((records) => {
    if (records.some(realChange)) changed = true;
  });
  observed = document.body;
  changed = true;
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    characterDataOldValue: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ["aria-label", "title", "placeholder"],
  });
}
export function translateUI(root = document.body) {
  if (document.documentElement.lang !== language)
    document.documentElement.lang = language;
  const whole = root === document.body;
  if (whole) {
    watchPage();
    // Changes made just now are still on their way to the observer.
    if (
      renderedLanguage === language &&
      (language !== "fr" ||
        (observer && !changed && !observer.takeRecords().some(realChange)))
    )
      return;
    renderedLanguage = language;
  } else if (language !== "fr" && renderedLanguage === language) return;
  const skipped =
    "[data-user-content],textarea,script,style,.board-info h3,#board-outline";
  if (root.closest?.(skipped)) return;
  // Reject excluded subtrees once instead of checking every text node's
  // ancestors; this runs on each draw.
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    (node) =>
      node.nodeType === 3
        ? NodeFilter.FILTER_ACCEPT
        : node.matches(skipped)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP,
  );
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const source = sources.get(node);
    const raw =
      source && source.rendered === node.textContent
        ? source.original
        : node.textContent;
    const value = raw.trim();
    const output = raw.replace(value, () => t(value));
    if (output !== node.textContent) node.textContent = output;
    sources.set(node, { original: raw, rendered: output });
  }
  root.querySelectorAll("[aria-label],[title],[placeholder]").forEach((el) => {
    const attributes = attributeSources.get(el) || {};
    // A title on user content, such as a board card's full name, is the
    // content itself.
    const user =
      el.hasAttribute("title") && !!el.closest("[data-user-content]");
    for (const attr of ["aria-label", "title", "placeholder"])
      if (el.hasAttribute(attr) && !(user && attr === "title")) {
        const current = el.getAttribute(attr);
        const source = attributes[attr];
        const original =
          source?.rendered === current ? source.original : current;
        const rendered = t(original);
        if (rendered !== current) el.setAttribute(attr, rendered);
        attributes[attr] = { original, rendered };
      }
    attributeSources.set(el, attributes);
  });
  // The pass's own writes are not changes to translate again.
  if (whole) {
    observer?.takeRecords();
    changed = false;
  }
}
// What kind of object this is, in words people use rather than the type
// names stored in board files.
const englishTypes = {
  __proto__: null,
  note: "Sticky note",
  text: "Text",
  rect: "Rectangle",
  ellipse: "Ellipse",
  arrow: "Arrow",
  pen: "Drawing",
  frame: "Frame",
  image: "Image",
  link: "Link",
  table: "Table",
  file: "Attachment",
  embed: "Embedded content",
};
export const objectKind = (i) =>
  i.type === "rect" && i.shape
    ? t(SHAPES.find((s) => s.key === i.shape)?.name || "Rectangle")
    : (language === "fr" ? types : englishTypes)[i.type] || i.type;
// An object's kind as a label of its own, as over a search result:
// "Sticky note", in French "Note adhésive", after "Locked · " when locked.
export const kindLabel = (i) => {
  const kind = objectKind(i);
  return `${i.locked ? `${t("Locked")} · ` : ""}${kind.charAt(0).toLocaleUpperCase(language)}${kind.slice(1)}`;
};
// The title of an object's properties dialog.
export const editTitle = (i) =>
  language === "fr"
    ? `Modifier : ${objectKind(i)}`
    : `Edit ${objectKind(i).toLowerCase()}`;
export function objectNameContent(i) {
  const value = i.text || i.alt || i.fileName;
  if (value || !i.cells) return value || "";
  const text = i.cells.flat().filter(Boolean).join(" · ");
  let end = Math.min(300, text.length);
  const previous = text.charCodeAt(end - 1),
    next = text.charCodeAt(end);
  if (
    previous >= 0xd800 &&
    previous <= 0xdbff &&
    next >= 0xdc00 &&
    next <= 0xdfff
  )
    end--;
  return text.slice(0, end);
}
// An untitled frame is named by its place in the frame order, "Frame 3",
// as new frames are, so that it can be told apart and searched for.
export const untitledFrame = (n) => `${t("Frame")} ${n + 1}`;
// "Sticky note: Idea", or in French "note adhésive : Idée", with the space
// French sets before a colon. The kind stays as written, since the name is
// also used within sentences.
export const objectName = (i) =>
  `${i.locked ? `${t("Locked")} · ` : ""}${labelled(
    objectKind(i),
    objectNameContent(i) ||
      (language === "fr" ? "Objet sans titre" : "Untitled object"),
  )}`;
