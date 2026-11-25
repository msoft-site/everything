import { fold } from "../libraries.js";
import { escape } from "../model.js";
import {
  t as translate,
  addTranslations,
  singular,
  language,
} from "../i18n.js";
import { createMiroClient } from "./miro-client.js";
import { formatIssue, reportTotals } from "./miro-convert.js";
import {
  loadInventory,
  summarizeInventory,
  planPhases,
  createLog,
  parseLog,
  parseDomains,
  parseEmailMap,
  runMigration,
  rollbackBoards,
  rollbackTargets,
  logEntry,
  logToCSV,
  logToJSON,
  inventoryToCSV,
} from "./miro-plan.js";

addTranslations({
  "Migrate from Miro": "从 Miro 迁移",
  "Copy boards, frames, sticky notes, shapes, connectors, images, docs, mind maps, groups, tags, and member roles from Miro. Miro's API does not provide comments or the cells of tables: tables are kept as links to the Miro board, and each report says what was not copied. Start with a dry run to review the report; nothing is saved until you migrate.":
    "从 Miro 复制白板、画框、便签、形状、连接线、图片、文档、思维导图、组合、标签和成员角色。Miro API 不提供评论或表格单元格内容：表格保留为 Miro 白板链接，报告中会列出未复制的项。建议先进行演练测试以查看报告；在正式迁移前不会保存任何内容。",
  "Miro access token": "Miro 访问令牌",
  "Use a token with boards:read access (and organizations:read for directory data). It stays in this browser tab and is never saved.":
    "将令牌与boards:read 访问权限（以及organizations:read 目录数据）结合使用。它保留在此浏览器选项卡中并且永远不会保存。",
  "Keep the token in memory until this page is closed":
    "将令牌保留在内存中，直到该页面关闭",
  "Miro organization ID (optional)":
    "Miro 组织 ID（可选）",
  "Enterprise plans only. Adds teams and member email addresses.":
    "仅企业计划。添加团队和成员电子邮件地址。",
  "Organization email domains": "组织电子邮件域",
  "Separate domains with commas. People with other addresses are marked as guests.":
    "用逗号分隔域。具有其他地址的人被标记为访客。",
  "Owner and email options": "所有者和电子邮件选项",
  "User email mapping (optional)":
    "用户电子邮件映射（可选）",
  "One person per line: Miro user ID, email address.":
    "每行一人：Miro 用户 ID、电子邮件地址。",
  "Fallback owner email": "后备所有者电子邮件",
  "Used when a board owner’s email address is unknown.":
    "当白板所有者的电子邮件地址未知时使用。",
  "Load boards": "加载白板",
  "Miro boards": "Miro 白板",
  "Group phases by": "阶段分组依据",
  Team: "团队",
  Owner: "所有者",
  "Board count": "白板数量",
  "Boards per phase": "每阶段白板数",
  Phase: "阶段",
  "All boards ({count})": "所有白板 ({count})",
  "Phase {n}: {label} ({count})": "阶段{n}：{label} ({count})",
  "No team": "没有团队",
  "Unknown owner": "所有者不明",
  Batch: "批次",
  "Filter boards": "过滤板",
  "Select shown": "选择所展示项",
  "Clear selection": "清除选择",
  "{selected} of {total} boards selected":
    "已选择 {selected} 板（共 {total} 个板）",
  "Showing {shown} of {total} boards. Refine the filter to see more.":
    "显示 {shown} 板，共 {total} 板。细化过滤器以查看更多内容。",
  "No boards match this filter.": "没有板与此过滤器匹配。",
  "Import as template": "作为模板导入",
  "unsupported resource URL": "不支持的资源 URL",
  "missing resource URL": "缺少资源 URL",
  "file too large": "文件太大",
  "too many redirects": "重定向太多",
  "empty download": "空下载",
  "larger than 5 MB": "大于 5 MB",
  "larger than 10 MB": "大于 10 MB",
  "board over 100 MB": "主板超过 100 MB",
  "unsupported format": "不支持的格式",
  "unreadable image": "无法读取的图像",
  "more than 40 million pixels": "超过4000万像素",
  "no downloader": "没有下载器",
  "missing image URL": "缺少图片网址",
  "Migration stopped. Boards already migrated are kept in the log.":
    "迁移停止了。已迁移的板保留在日志中。",
  "Rollback stopped. Boards not rolled back yet are kept in the log.":
    "回滚停止。尚未回滚的板保留在日志中。",
  "The migration log could not be loaded from local storage. Close and reopen this dialog to try again before migrating or rolling back.":
    "无法从本地存储加载迁移日志。关闭并重新打开此对话框以在迁移或回滚之前重试。",
  "Templates are saved to an organization library.":
    "模板保存到组织库中。",
  "Migrate again even if already migrated":
    "即使已经迁移，也要再次迁移",
  "Dry run": "试运行",
  "Migrate selected": "迁移选定的",
  "Confirm migration of {count} board":
    "确认 {count} 板的迁移",
  "Confirm migration of {count} boards":
    "确认 {count} 板的迁移",
  "Roll back phase": "回滚阶段",
  "Confirm rollback of {count} board":
    "确认 {count} 板回滚",
  "Confirm rollback of {count} boards":
    "确认 {count} 板回滚",
  "Download CSV report": "下载 CSV 报告",
  "Download JSON report": "下载 JSON 报告",
  "Download inventory": "下载库存",
  "Migration progress": "迁移进度",
  "Migration results": "迁移结果",
  "Enter a Miro access token.": "输入 Miro 访问令牌。",
  "Check email mapping lines: {lines}":
    "检查电子邮件映射行：{lines}",
  "Without organization domains, guest users cannot be identified.":
    "如果没有组织域，就无法识别来宾用户。",
  "Listing boards: {loaded} found": "列表板：{loaded} 已找到",
  "Reading the organization directory…":
    "正在阅读组织目录...",
  "Reading members: {loaded} of {total} boards":
    "阅读会员： {total} 委员会的 {loaded}",
  "{boards}, {users} ({guests}, {unresolved}), {teams}, {items}.":
    "{boards}、{users}（{guests}、{unresolved}）、{teams}、{items}。",
  "{count} board": "{count} 板",
  "{count} boards": "{count} 板",
  "{count} person": "{count} 人",
  "{count} people": "{count} 人",
  "{count} without email": "{count} 没有电子邮件",
  "{count} team": "{count} 团队",
  "{count} teams": "{count} 团队",
  "The organization directory is unavailable (Enterprise plan and organizations:read are required). Some owner emails may be missing.":
    "组织目录不可用（需要企业计划和组织：读取）。某些所有者的电子邮件可能会丢失。",
  "The board's members could not be read from Miro. Load the boards again, then migrate it.":
    "无法从 Miro 读取白板成员。请重新加载白板后再行迁移。",
  "Members could not be read": "会员无法读取",
  "Finishing the migration that was stopped…":
    "完成已停止的迁移...",
  "{count} board could not be read completely.":
    "{count} 板无法完全读取。",
  "{count} boards could not be read completely.":
    "{count} 板无法完全读取。",
  "Miro asked to slow down. Retrying in {seconds} s.":
    "米罗要求放慢速度。在 {seconds} 秒后重试。",
  "Miro could not be reached. Retrying in {seconds} s.":
    "无法联系到米罗。在 {seconds} 秒后重试。",
  "Board {index} of {total}": "{total} 的主板 {index}",
  "Reading board content": "阅读板内容",
  "Converting and copying images": "转换和复制图像",
  "Saving board": "省电板",
  "Select at least one board.": "选择at least one board.",
  "Migration cancelled. Completed boards remain in the log.":
    "迁移已取消。已完成的板保留在日志中。",
  "Dry run complete: {ok} ready, {failed} with errors.":
    "试运行完成：{ok} 准备就绪，{failed} 有错误。",
  "Migration complete: {migrated} migrated, {failed} failed, {skipped} already migrated.":
    "迁移完成： {migrated} 已迁移， {failed} 失败， {skipped} 已迁移。",
  "Rollback complete: {done} board removed, {failed} failed.":
    "回滚完成：{done} 板已移除，{failed} 失败。",
  "Rollback complete: {done} boards removed, {failed} failed.":
    "回滚完成：{done} 板已移除，{failed} 失败。",
  "Nothing to roll back in this phase.":
    "在此阶段没有什么可以回滚的。",
  "Rolling back {index} of {total}": "回滚 {total} 的 {index}",
  "The saved migration log could not be read. A new log will be started.":
    "无法读取保存的迁移日志。将开始一个新的日志。",
  "Ready to migrate": "准备迁移",
  Migrated: "Migré",
  Failed: "Échec",
  "Rolled back": "回滚",
  Pending: "En attente",
  "Already migrated": "已经迁移",
  "Not migrated": "未迁移",
  "Owner email unknown": "所有者电子邮件未知",
  "{count} item": "{count} 项目",
  "{count} items": "{count} 项目",
  "{count} guest": "{count} 客人",
  "{count} guests": "{count} 客人",
  "{converted} of {source} objects converted, {skipped} skipped, {warnings} warnings":
    "已转换 {converted} 个 {source} 对象，跳过 {skipped}，{warnings} 警告",
  "Report details": "报告详情",
  Warnings: "Avertissements",
  "Owner email unresolved; ownership assigned to {email}.":
    "业主电子邮件未解决；所有权分配给 {email}。",
  "Owner email unresolved; assign an owner after migration.":
    "业主电子邮件未解决；迁移后指定所有者。",
  "Saved only on this device, so its Miro owner and members were not added. An organization administrator can migrate it to a shared board that keeps their roles.":
    "仅保存在此设备上，因此不会添加其 Miro 所有者和成员。组织管理员可以将其迁移到保留其角色的共享板。",
  "{count} Miro member has no email address and was not added. Map their Miro user IDs to email addresses and migrate the board again to include them.":
    "{count} Miro 会员没有电子邮件地址，未添加。将他们的 Miro 用户 ID 映射到电子邮件地址，并再次迁移板以将其包括在内。",
  "{count} Miro members have no email address and were not added. Map their Miro user IDs to email addresses and migrate the board again to include them.":
    "{count} Miro 会员没有电子邮件地址，因此未被添加。将他们的 Miro 用户 ID 映射到电子邮件地址，并再次迁移板以将其包括在内。",
  "The Miro owner {email} is a guest here, so they are a facilitator and ownership stays with you until you transfer it to a member.":
    "Miro 所有者 {email} 是这里的客人，因此他们是协调者，并且所有权保留在您手中，直到您将其转让给会员为止。",
  "The Miro owner {email} is deactivated here, so they are a facilitator and ownership stays with you until you transfer it to a member.":
    "Miro 所有者 {email} 在此被停用，因此他们是协调者，所有权仍归您所有，直到您将其转让给会员为止。",
  "In Miro, everyone in the board's team could view it. Share it with those people here if they still need it.":
    "在 Miro 中，白板团队的全体成员均可查看。若仍有需要，请在此处与这些成员共享。",
  "In Miro, everyone in the board's team could comment on it. Share it with those people here if they still need it.":
    "在 Miro 中，白板团队的全体成员均可评论。若仍有需要，请在此处与这些成员共享。",
  "In Miro, everyone in the board's team could edit it. Share it with those people here if they still need it.":
    "在 Miro 中，白板团队的全体成员均可编辑。若仍有需要，请在此处与这些成员共享。",
  "In Miro, anyone with the link could view it. It is not shared by link here; turn link sharing on if it is still needed.":
    "在 Miro 中，任何知道链接的人都可以查看它。这里不通过链接分享；如果仍然需要，请打开链接共享。",
  "In Miro, anyone with the link could comment on it. It is not shared by link here; turn link sharing on if it is still needed.":
    "在 Miro 中，任何知道链接的人都可以对其发表评论。这里不通过链接分享；如果仍然需要，请打开链接共享。",
  "In Miro, anyone with the link could edit it. It is not shared by link here; turn link sharing on if it is still needed.":
    "在 Miro 中，任何知道链接的人都可以对其进行编辑。这里不通过链接分享；如果仍然需要，请打开链接共享。",
  "Object type": "对象类型",
  "In Miro": "在米罗",
  Converted: "Converti",
  "…and {count} more": "…还有 {count} 更多",
  "Sticky notes": "便签",
  Shapes: "Formes",
  Frames: "Cadres",
  Images: "Images",
  Cards: "Cartes",
  "App cards": "应用卡",
  Documents: "Documents",
  Embeds: "集成",
  "Link previews": "链接预览",
  Connectors: "Connecteurs",
  Tags: "Étiquettes",
  Docs: "Documents Miro",
  "Mind map nodes": "思维导图节点",
  "Not copied from Miro. Open the link to see it on the Miro board.":
    "不是从米罗复制的。打开链接即可在 Miro 板上查看它。",
  Assignee: "Responsable",
  Due: "截止时间",
  Status: "Statut",
  "Image not migrated": "图像未迁移",
  Document: "Document",
  "Miro could not be reached. Check the connection.":
    "无法联系到米罗。检查连接。",
  "The Miro access token was rejected. Create a new token and try again.":
    "Miro 访问令牌被拒绝。创建一个新令牌并重试。",
  "The Miro token does not have permission for this request.":
    "Miro 令牌无权执行此请求。",
  "The Miro resource was not found.": "未找到 Miro 资源。",
  "Miro rate limits were exceeded. Try again later.":
    "超出了 Miro 速率限制。稍后再试。",
  "Miro returned an error ({status}).": "米罗返回错误 ({status})。",
  "The board could not be created.": "无法创建白板。",
  "The migration log could not be saved. The run was stopped so no board is left untracked.":
    "无法保存迁移日志。运行已停止，因此没有一块板未被跟踪。",
  "The board could not be migrated ({reason}), and the shared board created for it ({room}) could not be removed. Remove it from Organization boards.":
    "无法迁移该板 ({reason})，并且无法删除为其创建的共享板 ({room})。将其从组织板上删除。",
  "The migration log could not be saved, so the run was stopped. The board copied from {name} ({id}) is not in the saved log; download the report to keep a record of it.":
    "迁移日志无法保存，因此停止运行。从 {name} ({id}) 复制的板不在保存的日志中；下载报告以保留记录。",
  "The migration log could not be saved. The rollback was stopped so no board is left untracked.":
    "无法保存迁移日志。回滚已停止，因此没有未跟踪的板。",
  "The migration log could not be read.":
    "无法读取迁移日志。",
  "Miro item type {type} could not be copied. A placeholder linking to it on the Miro board was added in its place.":
    "无法复制 Miro 项目类型 {type}。在 Miro 板上链接到它的占位符已添加到其位置。",
  "Miro's API does not provide the cells of tables, so a table was not copied. A placeholder linking to it on the Miro board was added in its place.":
    "Miro API 未提供数据表格的单元格内容，因此表格未完整复制。已添加指向 Miro 白板的占位链接。",
  "Miro's API does not provide comments, so comments on this board were not copied. Review them in Miro.":
    "Miro API 未提供评论内容，因此此白板上的评论未复制。请直接在 Miro 中查看。",
  "Miro did not list this board's groups, so its objects were copied ungrouped.":
    "Miro 未提供此白板的组合关系，因此各对象已作为独立对象复制。",
  "Miro did not list this board's mind maps, so they were not copied.":
    "Miro 未提供此白板的思维导图数据，因此未复制思维导图。",
  "Miro did not list which objects carry some tags, so those tags may be missing from objects.":
    "Miro 没有列出哪些对象带有一些标签，因此对象中可能缺少这些标签。",
  "Part of a group was not copied; the objects that were copied stay grouped.":
    "组的一部分未被复制；复制的对象保持分组。",
  "An object belonged to more than one group and was kept in the first.":
    "一个对象属于多个组并被保留在第一个组中。",
  "A mind map node's parent was not found, so the node starts its own mind map.":
    "思维导图节点的父节点未找到，该节点已作为新导图的根节点。",
  "Miro gave no position for a mind map, so it was laid out automatically.":
    "米罗没有给出思维导图的位置，所以它是自动布局的。",
  "The object is outside the supported board area.":
    "对象位于受支持的板区域之外。",
  "The object could not be converted: {reason}":
    "无法转换对象：{reason}",
  "Shape {shape} was approximated as {target}.":
    "形状 {shape} 近似为 {target}。",
  "Unknown shape {shape} became a rectangle.":
    "未知形状{shape} 变成了矩形。",
  "Text was shortened to 20,000 characters.":
    "文本被缩短至 20,000 个字符。",
  "Rotation is not supported for this object type.":
    "此对象类型不支持旋转。",
  "This board was migrated to another device. Roll it back on that device.":
    "该板已迁移到另一台设备。将其回滚到该设备上。",
  "A shape without a fill became white and was placed behind other objects.":
    "没有填充的形状变成白色并放置在其他对象后面。",
  "Image {title} could not be copied ({reason}). A placeholder was added.":
    "无法复制图像 {title} ({reason})。添加了一个占位符。",
  "Document {title} was added as a link; its file was not copied.":
    "文档 {title} 已作为链接添加；它的文件未被复制。",
  "Document {title} could not be copied ({reason}). A link was added instead.":
    "无法复制文档 {title} ({reason})。相反，添加了一个链接。",
  "Link {url} is not a web address. A text card was added.":
    "链接 {url} 不是网址。添加了文本卡。",
  "Only the first 8 tags were kept on an object.":
    "对象上仅保留前 8 个标签。",
  "Tags are kept only on sticky notes, so this object's tags were added to its text.":
    "标签仅在便签上支持，此对象的标签已追加到其文本中。",
  "An object referenced a tag that is not on the board.":
    "对象引用了不在板上的标签。",
  "Only the first 1,000 board tags were kept.":
    "仅保留前 1,000 个板标签。",
  "Tag {name} duplicated another tag and was merged.":
    "标签 {name} 重复了另一个标签并被合并。",
  "A tag without a usable name was skipped.":
    "没有可用名称的标签被跳过。",
  "A frame inside another frame kept its position but is no longer nested.":
    "另一个画框内的画框保持其位置，但不再嵌套。",
  "Frames here have no background color, so this frame's background ({color}) is not shown.":
    "此处的画框不支持背景颜色，因此该画框的背景色 ({color}) 未显示。",
  "An object's parent was not found; its position may be approximate.":
    "对象的父级未找到，其显示位置可能为近似值。",
  "A connector attached to a frame now has a free endpoint.":
    "连接到画框的连接器现在有一个空闲端点。",
  "A connector endpoint was not migrated and is now free.":
    "连接器端点未迁移，现在免费。",
  "Connectors from an object to itself are not supported.":
    "不支持从对象到自身的连接器。",
  "Neither connector endpoint could be placed.":
    "两个连接器端点都无法放置。",
  "Several connector captions were combined into one.":
    "多个连接器标题被合并为一个。",
  "Line end {cap} was approximated.":
    "行末端 {cap} 已近似。",
  "This board has {count} objects after conversion, more than 20 boards of 5,000 objects hold. Split it in Miro (for example by frame) and migrate the parts.":
    "此板转换后有{count}个物体，可容纳20多块板5000个物体。在 Miro 中将其拆分（例如按帧）并迁移各个部分。",
  "This board has {count} objects, more than the 5,000 a board holds, so it was migrated as {parts} boards. Each frame, group and mind map is kept whole on one of them.":
    "该板具有 {count} 对象，比板所容纳的 5,000 个对象还要多，因此它被迁移为 {parts} 板。每个画框、组和思维导图都完整地保存在其中一个上。",
  "{count} connectors joined objects now on different boards; each stays on the board of its start, with a free end.":
    "{count} 连接器现在连接不同板上的对象；每个都停留在其开始的棋盘上，并有一个自由的结束。",
  "{title} ({n} of {total})": "{title}（{n} 的 {total}）",
  "as {parts} boards": "作为 {parts} 板",
  "The converted board is about {size} MB; boards over 100 MB may not open or export.":
    "转换后的板子约为{size} MB；超过 100 MB 的板可能无法打开或导出。",
  "The converted board failed validation: {reason}":
    "转换后的板未通过验证：{reason}",
});

const TYPE_LABELS = {
  sticky_note: "Sticky notes",
  text: "Text",
  shape: "Shapes",
  frame: "Frames",
  image: "Images",
  card: "Cards",
  app_card: "App cards",
  document: "Documents",
  embed: "Embeds",
  preview: "Link previews",
  connector: "Connectors",
  tag: "Tags",
  doc_format: "Docs",
  mindmap_node: "Mind map nodes",
  group: "Groups",
  table: "Tables",
  data_table_format: "Tables",
};
const STATUS_LABELS = {
  pending: "Pending",
  migrated: "Migrated",
  failed: "Failed",
  "rolled-back": "回滚",
  skipped: "Already migrated",
  "dry-run": "试运行",
};
const ROW_LIMIT = 200;
const ISSUE_LIMIT = 20;

function browserDownload(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Dependencies (all functions are supplied by the host; none call Puter here):
//   modal(title, html, onReady), toast(message), t(text), fetch(url, init)
//   createBoard(board, { ownerEmail, members, source, asTemplate, signal })
//     resolves to { id }; deleteBoard(id); saveLog(json); loadLog() resolves
//   to the saved JSON text or object (or null); optional download(name, text,
//   type) and sleep(ms, signal).
const LOG_UNAVAILABLE =
  "The migration log could not be loaded from local storage. Close and reopen this dialog to try again before migrating or rolling back.";
// A count in the language's digit grouping.
const num = (count) =>
  Number(count || 0).toLocaleString(language === "fr" ? "fr-CA" : "fr-CA");
// The one-line summary of a loaded inventory, as "3 boards, 5 people (2
// guests, 0 without email), 2 teams, 3,702 items."
export function inventorySummaryText(summary) {
  const t = translate;
  const counted = (count, one, many) =>
    t(singular(count) ? one : many).replace("{count}", num(count));
  return t("{boards}, {users} ({guests}, {unresolved}), {teams}, {items}.")
    .replace(
      "{boards}",
      counted(summary.boards, "{count} board", "{count} boards"),
    )
    .replace(
      "{users}",
      counted(summary.users, "{count} person", "{count} people"),
    )
    .replace(
      "{guests}",
      counted(summary.guests, "{count} guest", "{count} guests"),
    )
    .replace(
      "{unresolved}",
      t("{count} without email").replace("{count}", num(summary.unresolved)),
    )
    .replace("{teams}", counted(summary.teams, "{count} team", "{count} teams"))
    .replace(
      "{items}",
      counted(summary.items, "{count} item", "{count} items"),
    );
}
export function createMiroMigration(deps) {
  const t = deps.t || translate;
  // A message with its {placeholders} filled; counts group their digits
  // for the language, as in "Confirm migration of 2,500 boards".
  const fmt = (text, params = {}) =>
    t(text).replace(/\{(\w+)\}/g, (_, key) =>
      typeof params[key] === "number" ? num(params[key]) : (params[key] ?? ""),
    );
  // The singular message where the language takes it: 1, and 0 in French.
  const counted = (count, one, many) =>
    fmt(singular(count) ? one : many, { count });
  const download = deps.download || browserDownload;
  // Held only for this page when the user opts in; never written to storage.
  let rememberedToken = "";
  // A run keeps going briefly after its dialog closes, until the board it
  // is saving is created and logged. A dialog opened meanwhile reads the log
  // only after that, so it never copies the board again or loses its entry.
  let running = null;
  const track = (work) => {
    const settled = work.then(
      () => {},
      () => {},
    );
    running = settled;
    settled.then(() => {
      if (running === settled) running = null;
    });
    return work;
  };

  // Translates a message, including Miro errors that name a status code and
  // a stopped run that names the board it could not log. Report issues use
  // it too, so their reasons read in the same language.
  function messageText(message) {
    const m = /^Miro returned an error \((\d+)\)\.$/.exec(message);
    if (m) return fmt("Miro returned an error ({status}).", { status: m[1] });
    const left =
      /^The board could not be migrated \((.*)\), and the shared board created for it \(([^()]*)\) could not be removed\. Remove it from Organization boards\.$/s.exec(
        message,
      );
    if (left)
      return fmt(
        "The board could not be migrated ({reason}), and the shared board created for it ({room}) could not be removed. Remove it from Organization boards.",
        { reason: t(`${left[1]}.`).replace(/\.$/, ""), room: left[2] },
      );
    // Warnings about a saved board's owner and members name a person or a
    // count.
    const owner =
      /^Owner email unresolved; ownership assigned to (.+)\.$/s.exec(message);
    if (owner)
      return fmt("Owner email unresolved; ownership assigned to {email}.", {
        email: owner[1],
      });
    const host =
      /^The Miro owner (.+) is (a guest|deactivated) here, so they are a facilitator and ownership stays with you until you transfer it to a member\.$/s.exec(
        message,
      );
    if (host)
      return fmt(
        host[2] === "a guest"
          ? "The Miro owner {email} is a guest here, so they are a facilitator and ownership stays with you until you transfer it to a member."
          : "Miro 所有者 {email} 是这里的客人，因此他们是协调者，并且所有权保留在您手中，直到您将其转让给会员为止。",
        { email: host[1] },
      );
    const unnamed =
      /^(\d+) Miro members? (?:has|have) no email address and (?:was|were) not added\./.exec(
        message,
      );
    if (unnamed)
      return counted(
        Number(unnamed[1]),
        "{count} Miro member has no email address and was not added. Map their Miro user IDs to email addresses and migrate the board again to include them.",
        "{count} Miro members have no email address and were not added. Map their Miro user IDs to email addresses and migrate the board again to include them.",
      );
    const u =
      /^The migration log could not be saved, so the run was stopped\. The board copied from (.*) \(([^()]*)\) is not in the saved log; download the report to keep a record of it\.$/s.exec(
        message,
      );
    return u
      ? fmt(
          "The migration log could not be saved, so the run was stopped. The board copied from {name} ({id}) is not in the saved log; download the report to keep a record of it.",
          { name: u[1], id: u[2] },
        )
      : t(message);
  }
  const errorText = (error) => messageText(error?.message || String(error));

  function open() {
    deps.modal(
      t("Migrate from Miro"),
      `<form id="miro-connect" class="miro-migration">
        <p class="dialog-copy">${t("Copy boards, frames, sticky notes, shapes, connectors, images, docs, mind maps, groups, tags, and member roles from Miro. Miro's API does not provide comments or the cells of tables: tables are kept as links to the Miro board, and each report says what was not copied. Start with a dry run to review the report; nothing is saved until you migrate.")}</p>
        <label class="field">${t("Miro access token")}<input id="miro-token" type="password" autocomplete="off" spellcheck="false" aria-describedby="miro-token-help" required></label>
        <p class="dialog-copy" id="miro-token-help">${t("Use a token with boards:read access (and organizations:read for directory data). It stays in this browser tab and is never saved.")}</p>
        <label class="check-field"><input type="checkbox" id="miro-remember">${t("Keep the token in memory until this page is closed")}</label>
        <div class="field-row"><label class="field">${t("Miro organization ID (optional)")}<input id="miro-org" autocomplete="off" aria-describedby="miro-org-help"></label>
        <label class="field">${t("Organization email domains")}<input id="miro-domains" placeholder="example.com, example.org" autocomplete="off" aria-describedby="miro-domains-help" value="${escape((deps.domains?.() || []).join(", "))}"></label></div>
        <p class="dialog-copy" id="miro-org-help">${t("Enterprise plans only. Adds teams and member email addresses.")}</p>
        <p class="dialog-copy" id="miro-domains-help">${t("Separate domains with commas. People with other addresses are marked as guests.")}</p>
        <details><summary>${t("Owner and email options")}</summary>
          <label class="field">${t("User email mapping (optional)")}<textarea id="miro-email-map" rows="3" spellcheck="false" aria-describedby="miro-email-map-help"></textarea></label>
          <p class="dialog-copy" id="miro-email-map-help">${t("One person per line: Miro user ID, email address.")}</p>
          <label class="field">${t("Fallback owner email")}<input id="miro-fallback-owner" type="email" autocomplete="off" aria-describedby="miro-fallback-help"></label>
          <p class="dialog-copy" id="miro-fallback-help">${t("Used when a board owner’s email address is unknown.")}</p>
        </details>
        <div class="dialog-footer"><button class="primary" type="submit" id="miro-load">${t("Load boards")}</button></div>
      </form>
      <section id="miro-inventory" aria-labelledby="miro-inventory-heading" hidden>
        <h3 id="miro-inventory-heading" tabindex="-1">${t("Miro boards")}</h3>
        <p class="dialog-copy" id="miro-summary"></p>
        <div class="field-row">
          <label class="field">${t("Group phases by")}<select id="miro-phase-by"><option value="team">${t("Team")}</option><option value="owner">${t("Owner")}</option><option value="count">${t("Board count")}</option></select></label>
          <label class="field">${t("Boards per phase")}<input id="miro-phase-size" type="number" min="1" max="1000" value="50"></label>
          <label class="field">${t("Phase")}<select id="miro-phase"></select></label>
        </div>
        <label class="field">${t("Filter boards")}<input id="miro-filter" type="search" autocomplete="off"></label>
        <div class="dialog-footer"><button type="button" class="secondary" id="miro-select-all">${t("Select shown")}</button><button type="button" class="secondary" id="miro-select-none">${t("Clear selection")}</button></div>
        <p class="dialog-copy" id="miro-selection" role="status" aria-live="polite"></p>
        <div id="miro-board-list" class="slide-choices" role="group" aria-label="${escape(t("Miro boards"))}"></div>
        ${deps.canTemplate?.() === false ? "" : `<label class="check-field"><input type="checkbox" id="miro-template">${t("Import as template")}</label>`}
        <label class="check-field"><input type="checkbox" id="miro-force">${t("Migrate again even if already migrated")}</label>
        <div class="dialog-footer">
          <button type="button" class="secondary" id="miro-dry-run">${t("Dry run")}</button>
          <button type="button" class="primary" id="miro-run">${t("Migrate selected")}</button>
        </div>
        <div class="dialog-footer">
          <button type="button" class="secondary" id="miro-inventory-csv">${t("Download inventory")}</button>
          <button type="button" class="secondary" id="miro-csv">${t("Download CSV report")}</button>
          <button type="button" class="secondary" id="miro-json">${t("Download JSON report")}</button>
          <button type="button" class="secondary" id="miro-rollback">${t("Roll back phase")}</button>
        </div>
      </section>
      <progress id="miro-progress" max="1" value="0" aria-label="${escape(t("Migration progress"))}" hidden></progress>
      <p class="dialog-copy" id="miro-status" role="status" aria-live="polite"></p>
      <p class="dialog-copy" id="miro-error" role="alert"></p>
      <div class="dialog-footer"><button type="button" class="secondary" id="miro-cancel" hidden>${t("Cancel")}</button></div>
      <ul id="miro-results" class="revision-list" aria-label="${escape(t("Migration results"))}"></ul>`,
      (d) => setup(d),
    );
  }

  function setup(d) {
    const $ = (selector) => d.querySelector(selector);
    const state = {
      client: null,
      inventory: null,
      phases: [],
      phaseId: "all",
      selected: new Set(),
      controller: null,
      task: "",
      log: createLog(deps.now),
    };
    const status = (text) => ($("#miro-status").textContent = text);
    const fail = (text) => ($("#miro-error").textContent = text);
    const unreadable = () =>
      fail(
        t(
          "The saved migration log could not be read. A new log will be started.",
        ),
      );
    const waiting = !!running;
    if (waiting) status(t("Finishing the migration that was stopped…"));
    const logReady = Promise.resolve(running)
      .then(() => {
        if (waiting) status("");
        return deps.loadLog?.();
      })
      .then(
        (saved) => {
          if (!saved) return;
          try {
            state.log = parseLog(saved);
          } catch {
            unreadable();
          }
        },
        () => {
          // Migrating now would copy boards again and replace the saved log.
          state.logUnavailable = true;
          fail(t(LOG_UNAVAILABLE));
        },
      )
      .then(() => state.inventory && renderBoards());
    // Unticking the box forgets the token straight away.
    $("#miro-remember").addEventListener("change", (e) => {
      if (!e.target.checked) rememberedToken = "";
    });
    if (rememberedToken) {
      $("#miro-token").value = rememberedToken;
      $("#miro-remember").checked = true;
    }

    const actions = [
      "#miro-load",
      "#miro-dry-run",
      "#miro-run",
      "#miro-rollback",
      "#miro-phase-by",
      "#miro-phase-size",
      "#miro-phase",
    ];
    // The task names a migration or rollback, which change boards; loading
    // boards and dry runs change nothing and pass none.
    function busy(on, max = 1, task = "") {
      state.task = on ? task : "";
      for (const s of actions) if ($(s)) $(s).disabled = on;
      $("#miro-cancel").hidden = !on;
      const progress = $("#miro-progress");
      progress.hidden = !on;
      progress.max = Math.max(1, max);
      progress.value = 0;
      if (on) {
        state.controller = new AbortController();
        fail("");
        $("#miro-cancel").focus();
      } else {
        state.controller = null;
        // Keep focus inside the dialog when the Cancel button disappears.
        if (
          !d.contains(document.activeElement) ||
          !document.activeElement?.offsetParent
        )
          $(state.inventory ? "#miro-run" : "#米罗运行")?.focus();
      }
      return state.controller?.signal;
    }
    const progress = (value, max) => {
      const bar = $("#miro-progress");
      if (max) bar.max = Math.max(1, max);
      bar.value = value;
    };
    $("#miro-cancel").onclick = () => state.controller?.abort();
    // A running migration or rollback is stopped only on purpose: Escape
    // and clicks outside the dialog are ignored, and closing it says what
    // happened. Other work simply stops when the dialog closes.
    d.addEventListener?.("cancel", (e) => {
      if (state.task) e.preventDefault();
    });
    d.addEventListener?.(
      "click",
      (e) => {
        if (state.task && e.target === d) e.stopImmediatePropagation();
      },
      true,
    );
    d.addEventListener?.("close", () => {
      state.controller?.abort();
      if (state.task === "migrate")
        deps.toast?.(
          t("Migration stopped. Boards already migrated are kept in the log."),
        );
      else if (state.task === "rollback")
        deps.toast?.(
          t(
            "Rollback stopped. Boards not rolled back yet are kept in the log.",
          ),
        );
      state.client = null;
    });

    const phaseBoards = () => {
      if (!state.inventory) return [];
      const phase = state.phases.find((p) => p.id === state.phaseId);
      if (!phase) return state.inventory.boards;
      const ids = new Set(phase.boardIds);
      return state.inventory.boards.filter((b) => ids.has(b.id));
    };
    const phaseName = (phase) =>
      phase.label ||
      t(
        phase.by === "owner"
          ? "Unknown owner"
          : phase.by === "count"
            ? "Batch"
            : "批",
      );
    const phaseOf = (id) => {
      const phase = state.phases.find((p) => p.boardIds.includes(id));
      return phase
        ? `${phase.id}: ${phase.label || phase.by}${phase.parts > 1 ? ` (${phase.part}/${phase.parts})` : ""}`
        : "";
    };

    function renderPhases() {
      state.phases = planPhases(state.inventory.boards, {
        by: $("#miro-phase-by").value,
        size: $("#miro-phase-size").value,
      });
      if (!state.phases.some((p) => p.id === state.phaseId))
        state.phaseId = "all";
      $("#miro-phase").innerHTML = [
        `<option value="all">${escape(fmt("All boards ({count})", { count: state.inventory.boards.length }))}</option>`,
        ...state.phases.map(
          (p) =>
            `<option value="${p.id}">${escape(
              fmt("Phase {n}: {label} ({count})", {
                n: p.index,
                label: `${phaseName(p)}${p.parts > 1 ? ` ${p.part}/${p.parts}` : ""}`,
                count: p.boardIds.length,
              }),
            )}</option>`,
        ),
      ].join("");
      $("#miro-phase").value = state.phaseId;
      selectPhase();
    }
    function selectPhase() {
      state.phaseId = $("#miro-phase").value;
      state.selected = new Set(phaseBoards().map((b) => b.id));
      resetRollback();
      renderBoards();
    }
    function shownBoards() {
      const query = fold($("#miro-filter").value.trim());
      return phaseBoards().filter(
        (b) =>
          !query ||
          [b.name, b.ownerEmail, b.owner?.name, b.teamName]
            .filter(Boolean)
            .some((v) => fold(v).includes(query)),
      );
    }
    function renderBoards() {
      const boards = shownBoards(),
        rows = boards.slice(0, ROW_LIMIT);
      $("#miro-board-list").innerHTML = rows.length
        ? rows
            .map((b) => {
              const entry = logEntry(state.log, b.id);
              const meta = [
                b.ownerEmail || t("Owner email unknown"),
                b.teamName,
                b.itemCount != null &&
                  counted(b.itemCount, "{count} item", "{count} items"),
                b.guests &&
                  counted(b.guests, "{count} guest", "{count} guests"),
                b.error && t("Members could not be read"),
                t(STATUS_LABELS[entry?.status] || "Not migrated"),
              ]
                .filter(Boolean)
                .join(" · ");
              return `<label><input type="checkbox" data-board="${escape(b.id)}" ${state.selected.has(b.id) ? "checked" : "检查过"}><span><span data-user-content>${escape(b.name)}</span> <small data-user-content>${escape(meta)}</small></span></label>`;
            })
            .join("") +
          (boards.length > rows.length
            ? `<p class="dialog-copy">${escape(fmt("Showing {shown} of {total} boards. Refine the filter to see more.", { shown: rows.length, total: boards.length }))}</p>`
            : "")
        : `<p class="dialog-copy">${t("No boards match this filter.")}</p>`;
      d.querySelectorAll("[data-board]").forEach((box) => {
        box.onchange = () => {
          if (box.checked) state.selected.add(box.dataset.board);
          else state.selected.delete(box.dataset.board);
          countSelection();
        };
      });
      countSelection();
    }
    function countSelection() {
      // A changed selection asks again with its new count.
      resetRun();
      $("#miro-selection").textContent = fmt(
        "{selected} of {total} boards selected",
        { selected: state.selected.size, total: phaseBoards().length },
      );
    }
    $("#miro-phase-by").onchange = renderPhases;
    $("#miro-phase-size").onchange = renderPhases;
    $("#miro-phase").onchange = selectPhase;
    $("#miro-filter").oninput = renderBoards;
    $("#miro-select-all").onclick = () => {
      // Only the rows on screen: a board past the row limit has no box to
      // untick it with.
      for (const b of shownBoards().slice(0, ROW_LIMIT))
        state.selected.add(b.id);
      renderBoards();
    };
    $("#miro-select-none").onclick = () => {
      state.selected.clear();
      renderBoards();
    };

    $("#miro-connect").onsubmit = async (event) => {
      event.preventDefault();
      fail("");
      const token = $("#miro-token").value.trim();
      if (!token) return fail(t("Enter a Miro access token."));
      const domains = parseDomains($("#miro-domains").value);
      const mapping = parseEmailMap($("#miro-email-map").value);
      if (mapping.invalid.length)
        return fail(
          fmt("Check email mapping lines: {lines}", {
            lines: mapping.invalid.join(", "),
          }),
        );
      rememberedToken = $("#miro-remember").checked ? token : "";
      state.client = createMiroClient({
        fetch: deps.fetch,
        token,
        sleep: deps.sleep,
        // Only a 429 is Miro asking to slow down; a dropped connection or a
        // server error is not.
        onRetry: ({ status: code, delay }) =>
          status(
            fmt(
              code === 429
                ? "Miro asked to slow down. Retrying in {seconds} s."
                : "米罗要求放慢速度。在 {seconds} 秒后重试。",
              { seconds: Math.ceil(delay / 1000) },
            ),
          ),
      });
      const signal = busy(true);
      try {
        const inventory = await loadInventory(state.client, {
          orgId: $("#miro-org").value.trim(),
          domains,
          emailMap: mapping.map,
          signal,
          onProgress: (p) => {
            if (p.stage === "boards")
              status(fmt("Listing boards: {loaded} found", p));
            else if (p.stage === "organization")
              status(t("Reading the organization directory…"));
            else {
              progress(p.loaded, p.total);
              status(fmt("Reading members: {loaded} of {total} boards", p));
            }
          },
        });
        await logReady;
        state.inventory = inventory;
        const summary = summarizeInventory(inventory);
        const notes = [inventorySummaryText(summary)];
        if (inventory.orgId && !inventory.org.members)
          notes.push(
            t(
              "The organization directory is unavailable (Enterprise plan and organizations:read are required). Some owner emails may be missing.",
            ),
          );
        if (!domains.length)
          notes.push(
            t(
              "Without organization domains, guest users cannot be identified.",
            ),
          );
        if (summary.errors)
          notes.push(
            counted(
              summary.errors,
              "{count} board could not be read completely.",
              "{count} boards could not be read completely.",
            ),
          );
        $("#miro-summary").textContent = notes.join(" ");
        $("#miro-inventory").hidden = false;
        busy(false);
        renderPhases();
        status(notes[0]);
        $("#miro-inventory-heading").focus();
      } catch (error) {
        busy(false);
        status("");
        if (!signal.aborted) fail(errorText(error));
      }
    };

    const labels = () => ({
      untitled: t("Untitled board"),
      part: t("{title} ({n} of {total})"),
      assignee: t("Assignee"),
      due: t("Due"),
      status: t("Status"),
      imageUnavailable: t("Image not migrated"),
      document: t("Document"),
      tags: t("Tags"),
      table: t("Table"),
      notCopied: t(
        "Not copied from Miro. Open the link to see it on the Miro board.",
      ),
    });
    const users = () => {
      const result = {};
      for (const b of state.inventory.boards)
        for (const m of b.members)
          result[m.id] = { name: m.name, email: m.email };
      return result;
    };
    function renderResult(result) {
      const li = document.createElement("li");
      li.className = "revision-row";
      const parts = [t(STATUS_LABELS[result.status] || result.status)];
      // A board too large for one becomes several.
      if (result.report?.parts > 1)
        parts.push(fmt("as {parts} boards", { parts: result.report.parts }));
      if (result.report) {
        const totals = reportTotals(result.report);
        parts.push(
          fmt(
            "{converted} of {source} objects converted, {skipped} skipped, {warnings} warnings",
            totals,
          ),
        );
      }
      // A conversion error is worded from its report entry, whose values
      // would otherwise keep the whole message out of translation.
      const first = result.report?.errors?.[0];
      if (result.error)
        parts.push(
          first?.message === result.error
            ? formatIssue(first, messageText)
            : errorText({ message: result.error }),
        );
      // What the person still has to do for a saved board (an owner to
      // assign, people to share it with) is shown here, not only in the log.
      const warnings = result.warnings || [];
      let html = `<div><strong data-user-content>${escape(result.name)}</strong><small data-user-content>${escape(parts.join(" · "))}</small>${
        warnings.length
          ? `<ul class="migration-warnings" aria-label="${escape(t("Warnings"))}" data-user-content>${warnings
              .map((warning) => `<li>${escape(messageText(warning))}</li>`)
              .join("")}</ul>`
          : ""
      }</div>`;
      const report = result.report;
      if (report) {
        const types = Object.keys(report.source);
        const issues = [
          ...report.errors,
          ...(report.notices || []),
          ...report.skipped,
          ...report.warnings,
        ];
        html += `<details><summary>${t("Report details")}</summary><table><thead><tr><th scope="col">${t("Object type")}</th><th scope="col">${t("In Miro")}</th><th scope="col">${t("Converted")}</th></tr></thead><tbody>${types
          .map(
            (type) =>
              `<tr><th scope="row">${escape(TYPE_LABELS[type] ? t(TYPE_LABELS[type]) : type)}</th><td>${report.source[type]}</td><td>${report.converted[type] || 0}</td></tr>`,
          )
          .join("")}</tbody></table>${
          issues.length
            ? `<ul data-user-content>${issues
                .slice(0, ISSUE_LIMIT)
                .map(
                  (issue) =>
                    `<li>${escape(formatIssue(issue, messageText))}</li>`,
                )
                .join("")}${
                issues.length > ISSUE_LIMIT
                  ? `<li>${escape(fmt("…and {count} more", { count: issues.length - ISSUE_LIMIT }))}</li>`
                  : ""
              }</ul>`
            : ""
        }</details>`;
      }
      li.innerHTML = html;
      $("#miro-results").append(li);
    }

    async function migrate(dryRun) {
      const boards = phaseBoards().filter((b) => state.selected.has(b.id));
      if (!boards.length) return fail(t("Select at least one board."));
      await logReady;
      if (!dryRun && state.logUnavailable) return fail(t(LOG_UNAVAILABLE));
      $("#miro-results").innerHTML = "";
      const signal = busy(true, boards.length, dryRun ? "" : "migrate");
      const stages = {
        fetch: "Reading board content",
        items: "Reading board content",
        connectors: "Reading board content",
        convert: "Converting and copying images",
        save: "Saving board",
      };
      try {
        const outcome = await track(
          runMigration({
            client: state.client,
            boards,
            log: state.log,
            createBoard: deps.createBoard,
            deleteBoard: deps.deleteBoard,
            saveLog: deps.saveLog,
            sleep: deps.sleep,
            signal,
            dryRun,
            force: $("#miro-force").checked,
            asTemplate: !!$("#miro-template")?.checked,
            fallbackOwnerEmail: $("#miro-fallback-owner").value.trim(),
            phaseOf,
            users: users(),
            convertOptions: { labels: labels() },
            now: deps.now,
            onProgress: (p) => {
              // Item pages report their own `total`; the bar counts boards.
              progress(p.index - (p.done ? 0 : 1), boards.length);
              if (p.stage)
                status(
                  `${fmt("Board {index} of {total}", p)}: ${p.board.name} · ${t(stages[p.stage] || "Reading board content")}`,
                );
            },
          }),
        );
        outcome.results.forEach(renderResult);
        const n = (s) => outcome.results.filter((r) => r.status === s).length;
        busy(false);
        if (outcome.fatal) {
          fail(messageText(outcome.fatal));
          status(
            t(
              "Migration stopped. Boards already migrated are kept in the log.",
            ),
          );
        } else if (outcome.cancelled)
          status(t("Migration cancelled. Completed boards remain in the log."));
        else if (dryRun)
          status(
            fmt("Dry run complete: {ok} ready, {failed} with errors.", {
              ok: n("dry-run"),
              failed: n("failed"),
            }),
          );
        else {
          const message = fmt(
            "Migration complete: {migrated} migrated, {failed} failed, {skipped} already migrated.",
            {
              migrated: n("migrated"),
              failed: n("failed"),
              skipped: n("skipped"),
            },
          );
          status(message);
          deps.toast?.(message);
        }
      } catch (error) {
        busy(false);
        fail(errorText(error));
      }
      renderBoards();
    }
    $("#miro-dry-run").onclick = () => migrate(true);
    // Every board of the phase starts selected, so one press would copy a
    // whole account: migrating takes a second press that names the count,
    // as rolling back does. A dry run changes nothing and runs at once.
    const run = $("#miro-run");
    function resetRun() {
      delete run.dataset.confirm;
      run.textContent = t("Migrate selected");
    }
    run.onclick = () => {
      const named = phaseBoards()
        .filter((b) => state.selected.has(b.id))
        .map((b) => b.id)
        .join("\n");
      if (named && run.dataset.confirm !== named) {
        run.dataset.confirm = named;
        run.textContent = counted(
          state.selected.size,
          "Confirm migration of {count} board",
          "Confirm migration of {count} boards",
        );
        // A focused button's new name is often not read out, so the
        // confirmation it asks for is announced.
        return status(run.textContent);
      }
      resetRun();
      return migrate(false);
    };

    // Rollback deletes created boards, so it takes a second click.
    const rollback = $("#miro-rollback");
    function resetRollback() {
      delete rollback.dataset.confirm;
      rollback.textContent = t("Roll back phase");
      rollback.classList.remove("danger");
    }
    rollback.onclick = async () => {
      await logReady;
      if (state.logUnavailable) return fail(t(LOG_UNAVAILABLE));
      // All boards covers every migrated row in the log, including boards
      // Miro no longer lists.
      const boardIds =
        state.phaseId === "all" ? undefined : phaseBoards().map((b) => b.id);
      const targets = rollbackTargets(state.log, { boardIds });
      if (!targets.length) {
        resetRollback();
        return status(t("Nothing to roll back in this phase."));
      }
      // The confirmation covers the boards it named; if the phase gained or
      // lost boards since, ask again with the new count.
      const named = targets.join("\n");
      if (rollback.dataset.confirm !== named) {
        rollback.dataset.confirm = named;
        rollback.textContent = counted(
          targets.length,
          "Confirm rollback of {count} board",
          "Confirm rollback of {count} boards",
        );
        rollback.classList.add("danger");
        // A focused button's new name is often not read out, so the
        // confirmation it asks for is announced.
        return status(rollback.textContent);
      }
      resetRollback();
      $("#miro-results").innerHTML = "";
      const signal = busy(true, targets.length, "rollback");
      try {
        const outcome = await track(
          rollbackBoards({
            log: state.log,
            deleteBoard: deps.deleteBoard,
            saveLog: deps.saveLog,
            boardIds,
            signal,
            now: deps.now,
            onProgress: (p) => {
              progress(p.index - 1, p.total);
              status(fmt("Rolling back {index} of {total}", p));
            },
          }),
        );
        outcome.results.forEach(renderResult);
        busy(false);
        if (outcome.fatal) fail(t(outcome.fatal));
        const n = (s) => outcome.results.filter((r) => r.status === s).length;
        status(
          outcome.cancelled || outcome.fatal
            ? t(
                "Rollback stopped. Boards not rolled back yet are kept in the log.",
              )
            : fmt(
                singular(n("rolled-back"))
                  ? "Rollback complete: {done} board removed, {failed} failed."
                  : "回滚完成：{done} 板已移除，{failed} 失败。",
                {
                  done: n("rolled-back"),
                  failed: n("failed"),
                },
              ),
        );
      } catch (error) {
        busy(false);
        fail(errorText(error));
      }
      renderBoards();
    };

    const stamp = () =>
      new Date(deps.now?.() ?? Date.now()).toISOString().slice(0, 10);
    $("#miro-csv").onclick = async () => {
      await logReady;
      download(
        `miro-migration-${stamp()}.csv`,
        logToCSV(state.log),
        "text/csv",
      );
    };
    $("#miro-json").onclick = async () => {
      await logReady;
      download(
        `miro-migration-${stamp()}.json`,
        logToJSON(state.log),
        "application/json",
      );
    };
    $("#miro-inventory-csv").onclick = () =>
      state.inventory &&
      download(
        `miro-inventory-${stamp()}.csv`,
        inventoryToCSV(state.inventory),
        "text/csv",
      );
    $("#miro-token").focus();
  }

  // How a message reads in the interface language, as the dialog shows it.
  return { open, messageText };
}
