import { addTranslations } from "../i18n.js";

// Canadian French for every planning string.
addTranslations({
  Tasks: "任务",
  tasks: "任务",
  task: "任务",
  Task: "任务",
  "Task card": "任务卡片",
  "Task details": "任务详情",
  "Task timeline": "任务时间轴",
  "Sticky note with status, owner, and dates": "带状态、负责人与日期的便签",
  "To do": "待办",
  "In progress": "进行中",
  Blocked: "已阻塞",
  // Core strings already translate these for other uses; a task's status
  // and priority are feminine.
  "task|Done": "已完成",
  "priority|None": "没有任何",
  "dependency|None": "没有任何",
  "one|{count} done": "{count} 项已完成",
  "{count} done": "{count} 项已完成",
  Low: "Basse",
  Medium: "Moyenne",
  High: "Haute",
  Status: "Statut",
  Assignee: "Responsable",
  Unassigned: "未分配",
  "On this board": "在这个板上",
  "Not on this board": "不在这个板上",
  "Not on this board, so they are not notified and cannot open it. Share the board with them first.": "该成员未在此白板上，因此无法接收通知或打开。请先向其共享此白板。",
  Start: "开始",
  Due: "截止时间",
  "Start date": "开始日期",
  "Due date": "截止日期",
  Priority: "优先级",
  Mixed: "Mixte",
  Frame: "画框",
  "No frame": "无框",
  Close: "Fermer",
  Jira: "Jira",
  "Jira status": "吉拉状态",
  ID: "ID",
  Yes: "Oui",
  Overdue: "En retard",
  "Blocked by": "受阻于",
  Predecessors: "前置任务",
  "Blocked by other tasks": "受阻于其他任务",
  "Make task": "设为任务",
  "Remove task details": "移除任务详情",
  "Task details added.": "已添加任务详情。",
  "Task details removed.": "已移除任务详情。",
  "{count} selected object": "{count} 个选中对象",
  "{count} selected objects": "{count} 个选中对象",
  "{count} task": "{count} 个任务",
  "{count} tasks": "{count} 个任务",
  "Task details apply to every selected sticky note, shape, or text. Each change can be undone.": "任务详情将应用于每个选中的便签、形状或文本。所有更改均可撤销。",
  "You can view these task details but not change them.":
    "您可以查看这些任务详细信息，但不能更改它们。",
  "The start date must be on or before the due date.":
    "开始日期必须在截止日期当天或之前。",
  "Enter a valid date, with a year from 100 to 9999.":
    "输入有效日期，年份范围为 100 到 9999。",
  "This selection is protected.": "此选择区域受保护。",
  "Select sticky notes, shapes, or text to plan tasks.": "选择sticky notes, shapes, or text to plan tasks.",
  "Send to Jira": "发送至吉拉",
  "Send selected tasks to Jira": "将选定的任务发送到 Jira",
  "Refresh Jira status": "刷新 Jira 状态",
  "Jira issues created": "创建的 Jira 问题",
  "Not created": "未创建",
  "Not sent yet": "尚未发送",
  "Send to Jira again to create them.":
    "再次发送至 Jira 以创建它们。",
  "They are not linked to their tasks because the board was closed, locked, or became read-only.":
    "他们没有与其任务相关联，因为面板已关闭、锁定或变为只读。",
  "Not linked because their tasks were deleted or linked by someone else meanwhile":
    "未链接，因为他们的任务同时被其他人删除或链接",
  "Jira did not accept the request.": "Jira 没有接受该请求。",
  "Jira refused the integration account. Check its email and API token in Organization settings.":
    "Jira 拒绝了集成帐户。在组织设置中检查其电子邮件和 API 令牌。",
  "Jira says": "吉拉 说",
  "Not found in Jira, so not updated":
    "在 Jira 中找不到，因此未更新",
  "The others are up to date.": "其他的都是最新的。",
  "Jira status updated": "Jira 状态已更新",
  "Jira status is up to date.": "Jira 状态是最新的。",
  "No tasks are linked to Jira.": "没有任务链接到 Jira。",
  "Could not reach Jira.": "无法联系 Jira。",
  "Jira took too long. Send to Jira again to create the rest.":
    "吉拉花了太长时间。再次发送至 Jira 以创建其余部分。",
  "Select tasks that are not linked to Jira yet.": "选择tasks that are not linked to Jira yet.",
  "Select tasks first.": "选择tasks first.",
  "Jira sync is available on organization boards. Share this board on your organization's server to use it.":
    "组织白板支持 Jira 同步功能。请将此白板共享至组织服务器后使用。",
  "Join an organization to send tasks to Jira.":
    "加入组织以将任务发送到 Jira。",
  "Jira sync is available to organization members.":
    "Jira 同步可供组织成员使用。",
  "This board is not on your organization's server, so it cannot use the organization's Jira connection.":
    "此白板不在您组织的服务器上，因此无法使用组织的 Jira 连接。",
  "Jira is not set up for your organization. Ask an administrator to enable it in organization settings.":
    "没有为您的组织设置 Jira。请管理员在组织设置中启用它。",
  "Jira is not set up for your organization.":
    "没有为您的组织设置 Jira。",
  "Select items to send to Jira.": "选择items to send to Jira.",
  "Tasks are created in your organization's Jira project.":
    "任务将在您组织的 Jira 项目中创建。",
  "planning|Summary": "概括",
  Completion: "Avancement",
  "Completion (%)": "完成率(%)",
  "Tasks per assignee": "每个受让人的任务",
  Measure: "Mesure",
  Value: "Valeur",
  Assigned: "已分配",
  "All statuses": "所有状态",
  Everyone: "Tout le monde",
  "All frames": "所有帧",
  "All tasks": "所有任务",
  "Group by": "分组依据",
  "No grouping": "没有分组",
  "Sort by": "排序方式",
  "Due date, earliest first": "截止日期，最早的在前",
  "Due date, latest first": "截止日期，最新的在前",
  "Task name": "任务名称",
  "Overdue only": "仅限逾期",
  "Blocked only": "仅被阻止",
  "{count} task shown": "显示 {count} 任务",
  "{count} tasks shown": "显示 {count} 任务",
  "Showing {shown} of {total} tasks.": "显示 {shown} 个任务（共 {total} 个）。",
  "Show more tasks": "显示more tasks",
  "No tasks match these filters.": "没有任务与这些过滤器匹配。",
  "No tasks yet. Select sticky notes, shapes, or text and choose Task details, or add a task card.":
    "还没有任务。选择便签、形状或文本，然后选择任务详细信息，或添加任务卡。",
  "Show on board": "白板上显示",
  "Untitled task": "无标题任务",
  "Planning views": "规划意见",
  List: "Liste",
  Timeline: "Chronologie",
  "Timeline chart": "时间线图",
  "Task preview": "任务预览",
  Lanes: "Couloirs",
  Lane: "Couloir",
  Days: "Jours",
  to: "au",
  Today: "Aujourd’hui",
  "Show as table": "显示为表格",
  "Place on board as timeline": "按照时间线放置在白板上",
  "Timeline placed on the board. Bars link to their tasks.":
    "时间线放置在黑板上。链接到他们的任务吧。",
  "It does not update by itself; select it and choose Refresh timeline when tasks change.":
    "它不会自行更新；选择它并选择任务更改时刷新时间线。",
  "Refresh timeline": "刷新时间线",
  "Timeline refreshed from the board’s tasks.":
    "时间表根据白板的任务进行了刷新。",
  "Select a timeline placed from the Tasks view.": "选择a timeline placed from the Tasks view.",
  "This dependency would make these tasks wait for each other in a loop, so none of them could start.":
    "这种依赖性将使这些任务在循环中相互等待，因此它们都无法启动。",
  "Tasks hidden from participants are left out.":
    "对参与者隐藏的任务被排除在外。",
  "These tasks are hidden from participants, so they are not placed on the board.":
    "这些任务对参与者隐藏，因此不会放置在黑板上。",
  "Add start or due dates to tasks first.": "添加start or due dates to tasks first.",
  "Add start or due dates to tasks to see them on the timeline.": "添加start or due dates to tasks to see them on the timeline.",
  "task has no dates and is not shown.":
    "任务没有日期并且不显示。",
  "tasks have no dates and are not shown.":
    "任务没有日期并且不会显示。",
  "Use the arrow keys to move between bars. Press Enter to show a task on the board.":
    "使用箭头键在条之间移动。按 Enter 键可在板上显示任务。",
  "Lines connect tasks to the tasks they block.":
    "线将任务与它们阻止的任务连接起来。",
  "This task is no longer on the board.":
    "该任务不再出现在面板上。",
  "Export CSV": "导出 CSV",
  "Export Excel": "导出Excel",
  "Update task status when a task moves into a frame named after a status (Kanban)":
    "当任务移动到以状态命名的画框（看板）时更新任务状态",
  "Kanban status sync is on for this board.":
    "此板的看板状态同步已打开。",
  "Kanban status sync is off.":
    "看板状态同步已关闭。",
  "Turn on Kanban status sync": "打开看板状态同步",
  "Turn off Kanban status sync":
    "关闭看板状态同步",
  "Status updated": "状态已更新",
  "Statuses updated": "状态已更新",
  Dependency: "依赖项",
  "Start blocks end": "开始块结束",
  "Start depends on end": "开始取决于结束",
  "Invalid task details.": "任务详细信息无效。",
  "Invalid task dependency.": "无效的任务依赖性。",
  "Invalid planning settings.": "计划设置无效。",
});
