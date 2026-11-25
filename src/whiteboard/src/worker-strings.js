// Canadian French for messages the collaboration and organization workers
// return. Screens show them as they arrive, so they load with the app.
// Messages only the SCIM and REST APIs return stay in English for the
// machines that read them.
import { addTranslations } from "./i18n.js";

addTranslations({
  // Access and sign-in
  "Could not verify this collaboration request.":
    "无法验证此协作请求。",
  "Request too large": "请求太大",
  "A JSON request body is required.": "需要 JSON 请求正文。",
  "Invalid JSON request.": "JSON 请求无效。",
  "The board could not synchronize. Please retry.":
    "主板无法同步。请重试。",
  "The shared board's storage is busy. Try again shortly.":
    "共享白板存储正忙，请稍后重试。",
  "This change adds a file that was not uploaded.":
    "此更改添加了一个未上传的文件。",
  "Too much feedback at once. Try again in an hour.":
    "一次反馈太多。一小时后重试。",
  "Sign in to continue.":
    "登录以继续。",
  "Board not found.": "未找到主板。",
  "You no longer have access to this board.":
    "您不再有权访问此板。",
  "Your board access was removed.": "您的白板访问权限已被删除。",
  "Your guest access to this board has expired.":
    "您对该图板的访客访问权限已过期。",
  "Your organization account is deactivated.":
    "您的组织帐户已停用。",
  "Your organization does not allow guest access.":
    "您的组织不允许访客访问。",
  "Your organization only allows its own members on this board.":
    "您的组织只允许自己的成员加入该委员会。",
  "Only members of the organization can change who can open this board.":
    "只有组织的成员才能更改谁可以打开此板。",
  "This invitation has expired or was revoked.":
    "此邀请已过期或已被撤销。",
  "This link is only for members of the organization. Ask the person who shared it for a guest invitation.":
    "此链接仅适用于组织成员。向共享它的人索取访客邀请。",
  "This organization invitation has expired or was revoked.":
    "该组织邀请已过期或已被撤销。",
  "This board has reached its participant limit.":
    "该委员会已达到其参与者限制。",
  "This board has reached its 1 GB limit for images and files.":
    "该主板已达到图像和文件 1 GB 的限制。",
  "This board is archived and read-only.":
    "该板已存档且只读。",
  "This board is under a legal hold and cannot be deleted.":
    "该版块已被合法保留，无法删除。",
  "This board is being permanently deleted.":
    "该版块将被永久删除。",
  "This board is already being created. Please retry sharing.":
    "该板已经被创建。请重试共享。",
  "Commenters can add comments but cannot change board content.":
    "评论者可以添加评论，但不能更改论坛内容。",
  "This change continues another participant's edits.":
    "此更改延续了另一位参与者的编辑内容。",
  "This change spans too many editing sessions.":
    "此更改涉及太多编辑会话。",
  "Invalid collaboration update.": "协作更新无效。",
  "Only organization members can file boards into spaces.":
    "只有组织成员才能将看板归档到空间中。",
  "Choose a space or team that exists.":
    "选择一个现有的空间或团队。",
  "Choose a team for this board first.":
    "首先为该委员会选择一个团队。",
  "Member not found.": "未找到会员。",
  "Your organization does not let guests facilitate boards.":
    "您的组织不允许来宾为白板提供便利。",
  "Your organization lets guests view and comment on boards, not edit them.":
    "您的组织允许访客查看留言板并发表评论，但不能编辑留言板。",
  "Your organization lets guests only view boards.":
    "您的组织仅允许访客查看图板。",
  "Choose a role an invitation can give.":
    "选择邀请可以赋予的角色。",
  "Only a guest's access can be renewed.":
    "仅访客访问权限支持续期。",
  "Invalid role change.": "角色变更无效。",
  "Invalid visibility.": "可见性无效。",
  "Invalid default role.": "默认角色无效。",
  "Only the board owner can manage access.":
    "只有白板所有者才能管理访问权限。",
  "Only the board owner can invite facilitators.":
    "只有白板所有者才能邀请协调员。",
  "Only the board owner can change facilitators.":
    "只有白板所有者才能更换协调人。",
  "Only the board owner can finish creating this board.":
    "只有版块所有者才能完成该版块的创建。",
  "Only the board owner or an administrator can do this.":
    "只有白板所有者或管理员才能执行此操作。",
  "Only the board owner or an administrator can transfer ownership.":
    "只有白板所有者或管理员才能转让所有权。",
  "Only the account owner can transfer boards owned by the account owner or an administrator.":
    "只有帐户所有者才能转移帐户所有者或管理员拥有的讨论区。",
  "Only the board owner or an administrator can connect Slack.":
    "只有论坛所有者或管理员才能连接 Slack。",
  "Your organization has turned off Slack.":
    "您的组织已关闭 Slack。",
  "Only the server owner can create boards.":
    "只有服务器所有者才能创建图板。",
  // Saving and sharing
  "Collaboration request is too large.":
    "协作请求太大。",
  "This change depends on edits that have not arrived yet.":
    "此更改取决于尚未到达的编辑。",
  "Update checksum does not match.":
    "更新校验和不匹配。",
  "Invalid asset.": "无效资产。",
  "Invalid shared asset.": "共享资产无效。",
  "Invalid peer key.": "对等密钥无效。",
  "Invalid identifier.": "标识符无效。",
  "Session belongs to another participant.":
    "会话属于另一个参与者。",
  "Unknown collaboration operation.": "未知的协作操作。",
  "This change was rejected.": "这一改变被拒绝了。",
  "This board could not be shared.": "该板无法共享。",
  "Choose a version.": "选择一个版本。",
  "Choose someone in your organization.":
    "选择您组织中的某个人。",
  // Organization membership and email
  "Only organization members can do this.":
    "只有组织成员才能执行此操作。",
  "Only organization administrators can do this.":
    "只有组织管理员才能执行此操作。",
  "Only organization administrators can place legal holds.":
    "只有组织管理员才能合法保留。",
  "Only the account owner can set up the organization.":
    "只有帐户所有者才能设置组织。",
  "Only the account owner can appoint administrators.":
    "只有帐户所有者才能指定管理员。",
  "Only the account owner can change an administrator.":
    "只有帐户所有者才能更改管理员。",
  "Only the account owner can invite administrators.":
    "只有帐户所有者才能邀请管理员。",
  "The account owner's role cannot change.":
    "账户所有者的角色不可更改。",
  "Invalid organization role.": "组织角色无效。",
  "Invalid account status.": "帐户状态无效。",
  "This user has not signed in yet.":
    "该用户尚未登录。",
  "User not found.": "未找到用户。",
  "Team not found.": "未找到团队。",
  "This team is being changed. Please try again.":
    "这支球队正在改变。请再试一次。",
  "Unknown organization operation.": "未知组织运作。",
  "Join the organization to save preferences.":
    "加入组织以保存首选项。",
  "Enter a valid email address.": "输入有效的电子邮件地址。",
  "That code is not correct.": "该代码不正确。",
  "This code expired. Request a new one.":
    "该代码已过期。请求一份新的。",
  "Too many requests. Try again in a minute.":
    "请求太多。请稍后重试。",
  "Too many attempts. Request a new code.":
    "尝试次数太多。请求新代码。",
  "Too many attempts. Try again in an hour.":
    "尝试次数太多。一小时后重试。",
  "Too many verification emails. Try again in an hour.":
    "验证电子邮件太多。一小时后重试。",
  "This email address is already linked to another account.":
    "该电子邮件地址已链接到另一个帐户。",
  "Your identity provider manages your email address. Ask your administrator to change it.":
    "您的身份提供商管理您的电子邮件地址。请您的管理员更改它。",
  "The verification email could not be sent. Ask your administrator to check the organization's Puter plan.":
    "验证邮件发送失败。请联系管理员检查组织账户配置。",
  "Use an email address in your organization's domain, or ask an administrator for an invitation.":
    "请使用组织域名邮箱，或联系管理员获取邀请。",
  "Verify an email address in your organization's domain, or ask an administrator for an invitation.":
    "请验证组织域名邮箱，或联系管理员获取邀请。",
  // Organization settings
  "Enter valid email domains, such as example.ca.":
    "输入有效的电子邮件域，例如 example.ca。",
  "A domain anyone can register under, such as co.uk, cannot be the organization's. Enter its own domain.":
    "公开注册的通用域名（如 co.uk）不可作为组织专属域名，请输入组织专属域名。",
  "Public email domains such as gmail.com cannot be the organization's: anyone can have an address there.":
    "公共邮箱域名（如 gmail.com）不可作为组织专属域名，任何人均可注册该类地址。",
  "Enter up to ten valid alert email addresses.":
    "输入最多十个有效的警报电子邮件地址。",
  "Enter up to ten valid report email addresses.":
    "输入最多十个有效的报告电子邮件地址。",
  "Enter at least one recipient for scheduled reports.":
    "至少输入一名预定报告的收件人。",
  "Enter a valid HTTPS address.": "输入有效的 HTTPS 地址。",
  "Enter a valid HTTPS webhook URL.": "输入有效的 HTTPS Webhook URL。",
  "Webhooks must use a public internet address.":
    "Webhook 必须使用公共互联网地址。",
  "This administrator invitation was already used.":
    "该管理员邀请已被使用。",
  "Choose an active member of your organization.":
    "选择您组织中的一名活跃成员。",
  "This change is too large to save.":
    "此更改太大，无法保存。",
  "The webhook secret is not available yet.":
    "Webhook 秘密尚不可用。",
  "The SIEM endpoint must use a public internet address.":
    "SIEM 端点必须使用公共互联网地址。",
  "Webhook not found.": "未找到网络钩子。",
  "Enter a Slack incoming webhook URL.":
    "输入 Slack 传入 Webhook URL。",
  "Enter your Jira Cloud site, such as team.atlassian.net.":
    "输入您的 Jira Cloud 站点，例如 team.atlassian.net。",
  "Enter a Jira project key, such as OPS.":
    "输入 Jira 项目密钥，例如 OPS。",
  "Enter the Microsoft Entra tenant ID.":
    "输入 Microsoft Entra 租户 ID。",
  "Enter the application (client) ID.": "输入应用程序（客户端）ID。",
  "Enter the data collection endpoint logs ingestion URL.":
    "输入数据收集端点日志提取 URL。",
  "Enter the data collection rule immutable ID.":
    "输入数据收集规则不可变 ID。",
  "Enter the stream name, such as Custom-WhiteboardAudit.":
    "输入流名称，例如 Custom-WhiteboardAudit。",
  "Enter the bearer token again for the new endpoint.":
    "再次输入新端点的不记名令牌。",
  "Unknown integration secret.": "未知的整合秘密。",
  "Add the SIEM HTTPS endpoint.":
    "添加 SIEM HTTPS 端点。",
  "Add the Sentinel client secret.": "添加 Sentinel 客户端密钥。",
  "Complete the Sentinel connection settings.":
    "完成 Sentinel 连接设置。",
  "The SIEM test failed.": "SIEM 测试失败。",
  "Choose a SIEM destination to send a test event.":
    "选择一个 SIEM 目标来发送测试事件。",
  "The webhook test failed.": "Webhook 测试失败。",
  "Could not reach Slack.": "无法联系 Slack。",
  "Puter enforces multifactor authentication at sign-in, so there is nothing to turn on here.":
    "Puter 在登录时强制执行多因素身份验证，因此此处无需打开任何内容。",
  "Choose at least one scope.": "至少选择一个范围。",
  "Choose a whole number of days for the key to expire.":
    "选择密钥到期的整数天数。",
  "API key not found.": "未找到 API 密钥。",
  "Invalid date range.": "日期范围无效。",
  // Spaces, library, feedback and AI
  "Only organization members can manage spaces.":
    "只有组织成员才能管理空间。",
  "A space with this name already exists.": "具有此名称的空间已存在。",
  "Only organization members can share library content.":
    "只有组织成员才能共享库内容。",
  "Library item not found.": "未找到库项目。",
  "Invalid library description language.":
    "库描述语言无效。",
  "This item is awaiting approval.": "该项目正在等待批准。",
  "This content is too large for the library.":
    "此内容对于图书馆而言太大。",
  "Your library items awaiting approval have reached 250 MB. Share more once an administrator has reviewed them.":
    "您等待批准的库项目已达到 250 MB。管理员审核后分享更多内容。",
  "Library items awaiting approval have reached the organization's 1 GB limit. Share this once an administrator has reviewed them.":
    "待审批的组件库内容已达到组织的 1 GB 上限。待管理员审核后再行共享。",
  "Choose a rating from 1 to 5.": "选择 1 到 5 之间的评级。",
  "Only people in the organization can send feedback.":
    "只有组织中的人员才能发送反馈。",
  "Choose a PNG, JPEG, or WebP photo.":
    "选择 PNG、JPEG 或 WebP 照片。",
  "AI features are available to organization members.":
    "AI 功能可供组织成员使用。",
  "Nothing to send to AI.": "没有什么可以发送给 AI。",
  "Unknown AI task.": "未知的人工智能任务。",
  "Choose events by audit action or prefix, such as board or user.role, or * for every event.":
    "按审核操作或前缀（例如 board 或 user.role）选择事件，或针对每个事件选择 *。",
});
