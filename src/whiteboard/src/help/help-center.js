import { escape } from "../model.js";
import { fold, searchTerms } from "../search-fold.js";
import { addTranslations, plural, t, language } from "../i18n.js";
import {
  createAuthoredField,
  trimmedFieldContent,
} from "../facilitation/authored-field.js";

// Role-based guides available offline in English and French. Each entry is
// [English, French]; the interface language chooses which one is shown.
export const GUIDES = [
  {
    "role": "start",
    "title": [
      "Create your first board",
      "创建第一个白板"
    ],
    "body": [
      "Choose New board or a template from the library. Add sticky notes (N), text (T), shapes (S), arrows (A), and frames (F) from the toolbar, or drop images and files onto the board. Everything saves automatically; the status next to the board name shows when changes are saved.",
      "从库中选择“新建白板”或模板。从工具栏中添加便签 (N)、文本 (T)、形状 (S)、箭头 (A) 和画框 (F)，或将图像和文件拖放到白板上。所有内容都会自动保存；白板名称旁的状态会显示何时已保存更改。"
    ]
  },
  {
    "role": "start",
    "title": [
      "Move around large boards",
      "在大型白板中浏览移动"
    ],
    "body": [
      "Pan with Space and drag, the Pan tool (H), or two fingers. Zoom with Ctrl/Cmd and the wheel, pinch, or the zoom controls. Frames and navigation works like a table of contents, the minimap (M) shows the whole board, and Find on board (Ctrl/Cmd F) searches text, tables, links, and files.",
      "按住空格键并拖动、使用平移工具 (H) 或双指滑动画布进行平移。使用 Ctrl/Cmd + 滚轮、双指捏合或缩放控件进行缩放。“画框与导航”类似于目录，小地图 (M) 可以显示整个白板，“在白板中查找”(Ctrl/Cmd+F) 支持搜索文本、表格、链接和文件。"
    ]
  },
  {
    "role": "start",
    "title": [
      "Use the keyboard",
      "使用键盘快捷键"
    ],
    "body": [
      "Every tool has a shortcut, and Ctrl/Cmd K opens the command palette. Board objects lists every object so you can select and edit without a mouse. Tab moves between controls; Enter edits the selected object; arrow keys nudge it; Escape cancels.",
      "每个工具都有快捷键，Ctrl/Cmd+K 可以打开命令面板。“白板对象”列出每个对象，方便无需鼠标进行选择和编辑。Tab 键在各控件之间切换；Enter 键编辑所选对象；方向键微调位置；Esc 键取消。"
    ]
  },
  {
    "role": "participant",
    "title": [
      "Join a board and collaborate live",
      "加入白板并实时协作"
    ],
    "body": [
      "Open the invitation link and sign in. You see other people's cursors, selections, and edits as they happen. Your role decides what you can do: editors change content, commenters add comments, reactions, and votes, and viewers follow along, send live reactions, and raise their hand.",
      "打开邀请链接并登录。您可以实时看到其他协作者的光标、选区和编辑动态。您的角色决定了您的权限：编辑者可修改内容，评论者可添加评论、反应和投票，查看者可跟随浏览、发送实时反应并举手。"
    ]
  },
  {
    "role": "participant",
    "title": [
      "Comment, mention, and get notified",
      "评论、提及与接收通知"
    ],
    "body": [
      "Choose Comment (C) and click an object or empty space. Reply in the thread, resolve it when done, and type @ followed by a name to mention someone. Mentions and replies appear under Notifications in the library and, if you verified your email, by email.",
      "选择“评论”(C) 并点击对象或空白区域。在讨论串中回复，完成后标记解决，输入 @ 加上名字即可提及协作者。提及和回复会显示在库中的“通知”下，如果您已验证电子邮箱，也会通过邮件发送通知。"
    ]
  },
  {
    "role": "participant",
    "title": [
      "Vote, react, and raise your hand",
      "投票、反应与举手"
    ],
    "body": [
      "During a dot vote, a banner shows how many votes you have left. Click an object in the vote, or its Vote button, to vote, and the ✓ button under it to take a vote back; with the keyboard, choose the banner or open Facilitation, then Voting, and use the list. Answer polls in Facilitation, then Poll. To react to an object, select it and choose Add a reaction under it; choosing the same reaction again removes it. On a shared board, Live reactions and raise hand, in the row above the board, sends a reaction that floats up for everyone, and Raise hand puts your hand up for the facilitator until you choose it again. Commenters and editors vote, answer polls, and react to objects; viewers can send live reactions and raise their hand.",
      "在点投票期间，横幅会显示您剩余的投票数。点击参与投票的对象或其“投票”按钮即可投票，点击其下方的 ✓ 按钮可撤回投票；使用键盘时，选择横幅或打开“主持”>“投票”并使用列表。在“主持”>“问卷”中回答问卷调查。要对对象做出反应，选中它并在下方选择“添加反应”；再次选择同一反应可将其取消。在共享白板上，白板上方一行的“实时反应与举手”可发送向上漂浮的实时表情，点击“举手”可向主持人提示举手，再次点击取消。评论者和编辑者可以投票、回答问卷并对对象做出反应；查看者可以发送实时反应和举手。"
    ]
  },
  {
    "role": "participant",
    "title": [
      "Work offline or on a weak connection",
      "离线或弱网环境下工作"
    ],
    "body": [
      "Your changes are kept on this device first and sent when the connection returns. The status beside the board name tells you when changes are waiting, live, or saved. Do not clear browser storage while changes are waiting.",
      "您的更改会先保存在本设备上，待网络连接恢复后自动同步。白板名称旁的状态会提示更改是处于等待同步、实时同步还是已保存状态。在更改等待同步期间，请勿清空浏览器本地缓存。"
    ]
  },
  {
    "role": "participant",
    "title": [
      "Recover earlier work",
      "恢复历史版本与已删除内容"
    ],
    "body": [
      "Open More tools, then Version history. Restore a whole version, open it as a copy, restore selected objects or one frame, or recover objects deleted since. Restoring saves a new version, so nothing is lost.",
      "从白板菜单中选择“版本历史”，即可按日期浏览过去的版本、比较更改、将白板恢复到较早的时间点，或者将某个历史版本另存为新的白板。如果不小心删除了对象，请使用撤销 (Ctrl/Cmd+Z)，或者打开回收站找回已删除的白板。"
    ]
  },
  {
    "role": "facilitator",
    "title": [
      "Prepare a workshop",
      "准备工作坊与演示"
    ],
    "body": [
      "Start from a facilitation playbook or template. Each step is a frame in order, so Frames and navigation and presentation mode walk through the agenda. Lock the frames and instructions you do not want moved, and add a timer.",
      "使用画框将白板划分为各个活动环节。在“主持”中设置议程，按顺序引导参与者体验。使用锁定功能固定背景元素和说明文本，防止工作坊期间意外移动。"
    ]
  },
  {
    "role": "facilitator",
    "title": [
      "Guide attention during a session",
      "在会话期间引导视线"
    ],
    "body": [
      "From Participants, bring one person or everyone to your view, or follow someone. Presentation mode shows selected frames without exposing the rest of the board. The shared timer keeps everyone on time.",
      "在“协作者”列表中，您可以将某个人或所有人的视角引导至您的视图，或者跟随某位协作者。演示模式会按顺序展示选定的画框，而不会提前剧透白板的其他部分。共享计时器可确保所有人的进度保持同步。"
    ]
  },
  {
    "role": "facilitator",
    "title": [
      "Invite people with the right role",
      "分配正确角色并邀请协作"
    ],
    "body": [
      "Share board creates invitations as facilitator, editor, commenter, or viewer. Guests from outside your organization are marked in the participant list, and their access can expire. Link opens can point to one section. Board settings let you open the board to your organization or to anyone with the link, when your organization allows it.",
      "共享白板时可以创建主持人、编辑者、评论者或查看者邀请。组织外部的访客会在协作者列表中标注，并且他们的访问权限可以设置过期时间。链接可以精确定位到单个区域。白板设置还允许向全组织开放或对拥有链接的任何人开放。"
    ]
  },
  {
    "role": "facilitator",
    "title": [
      "Capture and share results",
      "沉淀并导出分享成果"
    ],
    "body": [
      "Group sticky notes by color, tag, or AI themes. Export frames as PDF, PowerPoint slides, images, SVG, or spreadsheets. PDF exports of large boards split across pages with an overview of the page grid.",
      "按颜色、标签或智能建议对便签进行分组归类。可将画框导出为 PDF、PowerPoint 幻灯片、高分辨率图片、SVG 或电子表格。大型白板的 PDF 导出支持跨多页分页，并提供页面网格概览。"
    ]
  },
  {
    "role": "facilitator",
    "title": [
      "Run a dot vote or a poll",
      "发起点投票或问卷调查"
    ],
    "body": [
      "Open Facilitation, then Voting. Choose the votable objects (all sticky notes, the selection, or the objects in chosen frames), votes per person, and a time limit, and whether votes are anonymous or results stay hidden until you reveal them, then choose Start voting. Participants select Vote on highlighted objects or use the list. For a question with set answers, use Poll. End voting to see the results, select the top results, or export them as CSV or JSON.",
      "打开“主持”，然后选择“投票”。选择参与投票的对象（所有便签、当前选区或选定画框内的对象）、每人的投票额度和持续时间，并设置是否匿名或隐藏结果直到揭晓，然后点击“开始投票”。参与者可在高亮对象上点击投票或通过列表投票。预设选项的问题可使用“问卷”。结束投票后即可查看结果排行，并支持导出为 CSV 或 JSON。"
    ]
  },
  {
    "role": "facilitator",
    "title": [
      "Collect ideas privately or anonymously",
      "私密或匿名收集想法"
    ],
    "body": [
      "In Facilitation, Session, turn on Private mode so each person sees only their own new sticky notes until you choose Reveal all contributions. Turn on Anonymous input so new sticky notes, reactions, and editing indicators do not show who made them. Names are hidden in the app, not encrypted: board owners and organization audit logs still record who made each change.",
      "在“主持”>“会话”中开启私密模式，这样在您选择“公开所有内容”之前，每个人只能看到自己新添加的便签。开启匿名输入后，新便签、反应和编辑指示器均不显示作者姓名。姓名仅在界面中隐藏，白板所有者和组织审计日志仍会合规记录每次修改的作者。"
    ]
  },
  {
    "role": "facilitator",
    "title": [
      "Control what participants change and see",
      "管控协作者的编辑与查看权限"
    ],
    "body": [
      "In Facilitation, Session, Participant access keeps the board Open, Locked (participants add sticky notes, vote, and react, but do not change others' work), or Frozen (no content changes; voting, reactions, and comments continue). Stage frames hides chosen frames and reveals them one at a time. Lock objects, or hide them from participants, from the selection toolbar.",
      "在“主持”>“会话”中，协作者权限可设为“开放”、“锁定”（参与者可添加便签、投票和反应，但不能修改他人的内容）或“冻结”（禁止修改任何内容；投票、反应和评论依然有效）。分步显示画框可按需逐个显示指定画框。还可以从选区工具栏锁定对象或对参与者隐藏。"
    ]
  },
  {
    "role": "facilitator",
    "title": [
      "Follow an agenda and review the workshop",
      "按议程推进并复盘工作坊"
    ],
    "body": [
      "In Facilitation, Agenda, each frame becomes a step, in frame order; Edit agenda steps sets each step's duration and instructions. Start agenda, then move with Next step and Previous step. Start workshop session in Session to record attendance and contributions; Summary then shows participation, activity over time, and the most reacted and voted objects, and Export summary as CSV saves them.",
      "在“主持”>“议程”中，每个画框都会按顺序转化为一个环节；“编辑议程环节”可设置每个环节的持续时间与指引说明。点击“开始议程”，然后使用“下一环节”和“上一环节”推进。在“会话”中开启工作坊会话以记录出勤与互动；“复盘”随后会展示参与度、时间线活动趋势以及最受关注的对象，并支持导出为 CSV。"
    ]
  },
  {
    "role": "admin",
    "title": [
      "Set up your organization",
      "配置您的组织"
    ],
    "body": [
      "Choose Set up an organization in the library. Your local account becomes the account owner. In Organization settings, add your email domains and turn on domain capture so colleagues who verify a work email join automatically, or send invitation links.",
      "在“组织”设置中配置组织名称、品牌标识、默认白板模板以及安全策略。管理成员列表并分配管理员、成员或访客角色。"
    ]
  },
  {
    "role": "admin",
    "title": [
      "Provision people from Google Workspace",
      "从 Google Workspace 同步成员"
    ],
    "body": [
      "Create an API key with the scim scope on the Security tab and give the SCIM base URL to your identity provider or automation. Provisioned people appear as pending until they sign in and verify that email; deactivating them ends their sessions everywhere. The REST API reference lists every endpoint.",
      "在“安全”选项卡中创建具有 scim 权限的 API 密钥，并将 SCIM 基准 URL 提供给您的身份提供商或自动化系统。已同步的人员在登录并验证邮箱后激活；停用人员会立即终止其所有端会话。REST API 参考文档中详细列出了每个端点。"
    ]
  },
  {
    "role": "admin",
    "title": [
      "Send audit logs to Microsoft Sentinel",
      "将审计日志发送至 Microsoft Sentinel"
    ],
    "body": [
      "Create a data collection endpoint and rule with a custom table in Azure Monitor, register an application with the Monitoring Metrics Publisher role on the rule, then enter the tenant, application, secret, endpoint, rule ID, and stream on the Security tab. Send a test event to confirm delivery. Alerts for public sharing, guest access, and permission changes can go to email and Slack.",
      "在 Azure Monitor 中创建包含自定义表的数据收集终结点与规则，为该规则注册具有 Monitoring Metrics Publisher 角色的应用，然后在“安全”选项卡中填入租户、应用、密钥、终结点、规则 ID 及流名称。发送测试事件以确认送达。公开共享、访客访问和权限变更警报可推送到邮件和 Slack。"
    ]
  },
  {
    "role": "admin",
    "title": [
      "Govern sharing, AI, and retention",
      "管控共享、智能功能与数据留存"
    ],
    "body": [
      "Policies control sharing outside the organization, guest access and expiry, public links, which AI features are available, how long audit logs and deleted boards are kept, and an organization-wide legal hold. The worker enforces every policy, not only the interface.",
      "通过策略严格控制组织外共享、访客访问及其有效期、公开链接、允许使用的智能功能、审计日志与已删除白板的保留期限，并支持全组织法务留存。各项策略由服务器端统一强制执行，不仅限于前端界面。"
    ]
  },
  {
    "role": "admin",
    "title": [
      "Monitor adoption",
      "监控系统使用与采用情况"
    ],
    "body": [
      "The Overview tab reports active and inactive people, daily use, boards created, stale and duplicate boards, external sharing, and the largest sessions. Export reports as CSV or JSON, or schedule them by email.",
      "“概览”选项卡展示活跃与非活跃用户、每日使用情况、新建白板数、闲置与重复白板、外部共享分布以及大型会话统计。报告支持导出为 CSV 或 JSON，或设置定期邮件推送。"
    ]
  },
  {
    "role": "admin",
    "title": [
      "Migrate from Miro",
      "从 Miro 迁移"
    ],
    "body": [
      "On the Boards tab, choose Migrate from Miro. Load your Miro boards with an access token, review a dry run, and migrate in phases. Owners and member roles carry over by email, a report lists every board's result, and a phase can be rolled back.",
      "在“白板”选项卡中，选择“从 Miro 迁移”。使用访问令牌加载您的 Miro 白板，先进行预演预览，然后分批迁移。所有者和成员角色通过邮箱无缝保留，迁移报告详细记录每块白板的迁移结果，且支持分步回滚。"
    ]
  },
  {
    "role": "start",
    "title": [
      "Accessibility features",
      "无障碍与辅助功能"
    ],
    "body": [
      "The interface works with a keyboard and screen readers, supports light, dark, and high-contrast system themes, respects reduced motion, and is available in English and French. Board objects gives a text list of the canvas, Find on board reads object text, and frames give large boards a navigable structure.",
      "界面完全支持键盘导航与屏幕阅读器操作，适配系统的明亮、暗黑及高对比度主题，遵循减弱动画偏好设置，并提供简体中文与英文界面。“白板对象”提供画布的全文列表，“在白板中查找”可朗读对象文本，画框为大型白板提供了清晰的导航结构。"
    ]
  }
];
const ROLES = [
  ["all", "All guides"],
  ["start", "Getting started"],
  ["participant", "Participants"],
  ["facilitator", "Facilitators"],
  ["admin", "Administrators"],
];
// Guides are found by the language they are shown in, so every guide found
// shows what was typed: "table" does not bring up guides that only say
// "tableau" in French. Case, accents, and the kind of apostrophe typed do
// not matter.
export function searchGuides(query = "", role = "all", lang = language) {
  const l = lang === "en" ? 0 : 1;
  const words = searchTerms(query);
  return GUIDES.filter((g) => role === "all" || g.role === role)
    .filter((g) => {
      const hay = fold(`${g.title[l]} ${g.body[l]}`);
      return words.every((w) => hay.includes(w));
    })
    .map((g) => ({ role: g.role, title: g.title[l], body: g.body[l] }));
}
export function createHelpCenter({
  modal,
  icon,
  tour,
  shortcuts,
  refresh = () => {},
  org = null,
  toast = () => {},
  feedback = null,
}) {
  return {
    open(role = "all") {
      modal(
        "Help and training",
        `<div class="help-top"><label class="search">${icon("search")}<input id="help-search" type="search" aria-label="${t("Search help")}" placeholder="${t("Search help")}"></label><label class="field">${t("Guides for")}<select id="help-role">${ROLES.map(([v, l]) => `<option value="${v}" ${v === role ? "selected" : ""}>${t(l)}</option>`).join("")}</select></label></div><div class="dialog-footer help-actions"><button class="secondary" id="help-tour">${icon("map")}${t("Take the tour")}</button><button class="secondary" id="help-keys">${icon("keyboard")}${t("Keyboard shortcuts")}</button>${feedback?.available() ? `<button class="secondary" id="help-app-feedback" title="${t("Tell the people who make Whiteboard what to improve")}">${icon("message-square-heart")}${t("Send feedback")}</button>` : ""}</div><p id="help-count" class="sr-only" role="status"></p><div id="help-results" class="help-results"></div>${org?.info?.role ? `<form id="help-feedback" class="policy-form"><fieldset><legend>${t("Rate your experience")}</legend><div class="rating" role="radiogroup" aria-label="${t("How easy is Whiteboard to use?")}">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="help-ease" value="${n}" required> ${n}</label>`).join("")}</div><small>${t("1 is very hard, 5 is very easy. Ratings are anonymous.")}</small><div class="field"><span id="help-comment-label">${t("What would make it better? (optional)")}</span><div id="help-comment"></div></div><div class="dialog-footer"><button class="primary">${t("Send rating")}</button></div></fieldset></form>` : ""}`,
        (d) => {
          d.classList.add("help-dialog");
          const placeholder = d.querySelector("#help-comment");
          const comment =
            placeholder &&
            createAuthoredField(
              placeholder,
              { text: "", lang: language },
              { maxLength: 1000 },
            );
          if (comment) {
            comment.style.minHeight = "3em";
            d.addEventListener("close", () => comment.destroy(), {
              once: true,
            });
          }
          const render = () => {
            const results = searchGuides(
              d.querySelector("#help-search").value,
              d.querySelector("#help-role").value,
            );
            d.querySelector("#help-results").innerHTML = results.length
              ? results
                  .map(
                    (g) =>
                      `<details class="help-guide"><summary>${escape(g.title)}</summary><p data-user-content>${escape(g.body)}</p></details>`,
                  )
                  .join("")
              : `<p>${t("No guides match your search.")}</p>`;
            // The count is announced, not every guide in the list.
            d.querySelector("#help-count").textContent = results.length
              ? plural(results.length, "{count} guide", "{count} guides")
              : t("No guides match your search.");
            refresh();
          };
          d.querySelector("#help-search").oninput = render;
          d.querySelector("#help-role").onchange = render;
          d.querySelector("#help-tour").onclick = () => {
            d.close();
            tour();
          };
          d.querySelector("#help-keys").onclick = () => {
            d.close();
            shortcuts();
          };
          d.querySelector("#help-app-feedback")?.addEventListener(
            "click",
            () => {
              d.close();
              feedback.send();
            },
          );
          d.querySelector("#help-feedback")?.addEventListener(
            "submit",
            async (e) => {
              e.preventDefault();
              // A second press while sending would store the rating twice.
              if (e.target.dataset.busy) return;
              e.target.dataset.busy = "true";
              try {
                const content = trimmedFieldContent(comment);
                await org.request("feedback.submit", {
                  ease: Number(
                    d.querySelector('[name="help-ease"]:checked')?.value,
                  ),
                  comment: content.text,
                  ...(content.text && content.lang
                    ? { lang: content.lang }
                    : {}),
                  ...(content.textRuns?.length
                    ? { textRuns: content.textRuns }
                    : {}),
                  context: "help",
                });
                // The form gives way to a thank-you that keeps focus.
                const thanks = document.createElement("p");
                thanks.className = "dialog-copy";
                thanks.tabIndex = -1;
                thanks.textContent = t("Thank you for your feedback.");
                comment.destroy();
                e.target.replaceWith(thanks);
                thanks.focus();
                toast("Thank you for your feedback.");
              } catch (error) {
                toast(error.message);
              } finally {
                delete e.target.dataset.busy;
              }
            },
          );
          render();
        },
      );
    },
  };
}

addTranslations({
  "Help and training": "帮助与培训",
  "Rate your experience": "评价您的使用体验",
  "How easy is Whiteboard to use?": "Whiteboard 易用性如何？",
  "1 is very hard, 5 is very easy. Ratings are anonymous.": "1 为非常困难，5 为非常容易。评分为匿名进行。",
  "What would make it better? (optional)":
    "有什么可以改进的地方？（可选）",
  "Send feedback": "发送反馈",
  "Send rating": "提交评价",
  "Tell the people who make Whiteboard what to improve":
    "向开发团队提出您的宝贵改进建议",
  "Invalid feedback language.": "无效的反馈语言。",
  "Thank you for your feedback.": "感谢您的反馈与支持！",
  "Search help": "搜索帮助文档",
  guide: "指南",
  guides: "指南",
  "Guides for": "适用对象",
  "All guides": "全部指南",
  "Getting started": "新手入门",
  Participants: "参与者",
  Facilitators: "主持人",
  Administrators: "管理员",
  "Take the tour": "功能导览",
  "Keyboard shortcuts": "快捷键",
  "No guides match your search.":
    "未找到与您搜索匹配的指南。",
});
