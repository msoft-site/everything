import json
import os

DICT_DIR = '/home/antigravity/msoft-site/everything/scripts/shared/dict'

def update_dict(name, new_entries):
    filepath = os.path.join(DICT_DIR, f'{name}.json')
    data = {}
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except:
            data = {}
    for k, v in new_entries.items():
        data[k] = v
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'Updated {name}.json: total {len(data)} entries')

# 1. 3D Studio
update_dict('3d', {
    "Box": "盒体",
    "Fable": "寓言 (Fable)",
    "admin": "管理员",
    "Clear the recent files list?": "清空最近打开的文件列表？",
    "Clear Recent Files": "清空最近文件",
    "Overwrite the startup file?": "覆盖初始启动文件？",
    "Save Startup File": "保存启动文件",
    "Revert": "恢复",
    "Right-click any menu item to add it here": "右键单击任意菜单项可将其添加到此处",
    "No presets yet": "暂无预设",
    "Delete selected objects?": "删除所选对象？",
    "Load factory default preferences?": "载入出厂默认偏好设置？",
    "Load Factory Preferences": "载入出厂偏好",
    "Load factory settings? Unsaved changes are lost.": "载入出厂初始设置？未保存的更改将丢失。",
    "Load Factory Settings": "载入出厂设置",
    "Purge Unused Data": "清除未使用的孤立数据",
    "Snap To": "吸附至",
    "Dope Sheet": "动画摄影表",
    "F-Curve": "函数曲线",
    "Interpolation": "插值方式",
    "Easing (by strength)": "缓动方式 (按强度)",
    "Dynamic Effects": "动态效果",
    "Other Data-Block Types": "其他数据块类型",
    "Copy to Library": "复制到资产库",
    "Create New Directory": "新建目录",
    "Set Action": "指定动作",
    "Grease Pencil": "蜡笔",
    "Curves": "曲线",
    "Particle": "粒子系统",
    "Armature": "骨架",
    "Vertex": "顶点",
    "Edge": "边",
    "Face": "面",
    "Lattice": "晶格",
    "Presets": "预设",
    "Sort": "排序",
    "Point Cloud": "点云",
    "Tooltips": "工具提示",
    "User Tooltips": "用户工具提示",
    "Areas": "工作区域",
    "Corner Splitting": "边角分割",
    "Text Info Overlay": "文本信息叠加层",
    "Strip": "片段",
    "Mask Display": "蒙版显示",
    "Clip Display": "剪辑显示",
    "Marker Display": "标记显示",
    "Guides": "参考辅助线",
    "Call Menu": "呼出菜单",
    "Open a menu by name at the pointer": "在鼠标指针处按名称打开菜单",
    "Flip (Distortion Free)": "翻转 (无畸变)",
    "Make Regular": "规整化",
    "Show a description when the pointer rests on a control": "指针停留在控件上时显示说明",
    "Drag an area corner to split it or join it with a neighbour": "拖动区域角落可拆分或与邻近区域合并",
    "Show the frame, collection and active object in the top-left corner": "在左上角显示当前帧、集合与活动对象"
})

# 1.1 Parametric
update_dict('parametric', {
    "Parametric": "参数化设计",
    "SolidWorks": "SolidWorks 格式",
    "STEP": "STEP 格式",
    "MMGS": "毫米-克-秒 (MMGS)",
    "CGS": "厘米-克-秒 (CGS)",
    "MKS": "米-千克-秒 (MKS)",
    "IPS": "英寸-磅-秒 (IPS)",
    "mm": "毫米 (mm)"
})

# 2. Teamchat
update_dict('teamchat', {
    "admin": "管理员",
    "AD": "管理员",
    "Muted rows leave the lists until they mention you": "已静音的会话将在有人提及您时重新显示",
    "Group channels and people your own way": "按您喜欢的方式为频道与成员分组",
    "无法加载工作区": "无法加载工作区",
    "该工作区服务器无响应，所有者可能已将其移除。": "该工作区服务器无响应，所有者可能已将其移除。",
    "该链接未指向有效的工作区。": "该链接未指向有效的工作区。",
    "重试进入工作区": "重试进入工作区",
    "您没有该工作区的访问权限": "您没有该工作区的访问权限",
    "跳至消息内容": "跳至消息内容",
    "拖放重要频道或私信至此处": "拖放重要频道或私信至此处",
    "工作区常规沟通交流与日常讨论": "工作区常规沟通交流与日常讨论",
    "跨部门协作沟通与任务进展同步": "跨部门协作沟通与任务进展同步",
    "团队重大通知与公告发布": "团队重大通知与公告发布",
    "这是 #常规交流 频道的开始": "这是 #常规交流 频道的开始",
    "这是 #项目协作 频道的开始": "这是 #项目协作 频道的开始",
    "这是 #全员通知 频道的开始": "这是 #全员通知 频道的开始"
})

# 3. Tasks
update_dict('tasks', {
    "Add a task for today, or check Upcoming for what is ahead": "添加今日待办任务，或查看“即将到来”了解未来计划",
    "Set a due date to add a reminder.": "设置截止日期以添加提醒。",
    "What needs doing?": "有什么需要处理的任务？",
    "Add a task": "添加任务",
    "Task title": "任务标题",
    "Task description": "任务描述",
    "Due date": "截止日期",
    "Priority": "优先级",
    "High priority": "高优先级",
    "Medium priority": "中优先级",
    "Low priority": "低优先级",
    "No priority": "无优先级",
    "Completed": "已完成",
    "Incomplete": "未完成",
    "All tasks": "全部任务",
    "Today": "今天",
    "Tomorrow": "明天",
    "Upcoming": "即将到来",
    "Overdue": "已逾期"
})

# 4. Projects
update_dict('projects', {
    "No projects to search yet.": "暂无项目可供搜索。",
    "Results": "搜索结果",
    "New project": "新建项目",
    "Project name": "项目名称",
    "Project description": "项目描述",
    "Gantt chart": "甘特图",
    "Board view": "看板视图",
    "List view": "列表视图",
    "Timeline view": "时间轴视图",
    "Milestones": "里程碑",
    "Add milestone": "添加里程碑",
    "Assignee": "指派人员",
    "Status": "状态",
    "Not started": "未开始",
    "In progress": "进行中",
    "Under review": "审核中",
    "Done": "已完成",
    "Archived": "已归档"
})

# 5. Wiki
update_dict('wiki', {
    "Ctrl+K": "Ctrl+K 快捷搜索",
    "Ctrl+Alt+N": "Ctrl+Alt+N 新建页面",
    "Quick search": "快速搜索",
    "Add subpage": "添加子页面",
    "New page": "新建页面",
    "Page title": "页面标题",
    "Untitled": "无标题页面",
    "Share": "分享与协作",
    "Version history": "版本历史",
    "Restore this version": "恢复此版本",
    "Trash": "废纸篓",
    "Empty trash": "清空废纸篓",
    "Move page": "移动页面",
    "Export page": "导出页面"
})

# 6. CRM
update_dict('crm', {
    "admin": "管理员",
    "CRM": "客户关系管理 (CRM)",
    "Good morning": "早上好",
    "Good afternoon": "下午好",
    "Good evening": "晚上好",
    "Ctrl K": "Ctrl+K 快捷搜索",
    "An opportunity to move through the pipeline": "推进销售管道中的商机",
    "A person you might sell to": "潜在客户联系人",
    "A meeting, call, email, or note": "会议、通话、邮件或跟进记录",
    "A dated reminder to reach out": "预约跟进提醒",
    "Lead": "销售线索",
    "Contact": "联系人",
    "Account": "客户公司",
    "Deal": "交易商机",
    "Activity": "活动记录",
    "Pipeline": "销售管道",
    "Stage": "阶段",
    "Qualification": "资质评估",
    "Proposal": "方案报价",
    "Negotiation": "商务谈判",
    "Closed Won": "成功成交",
    "Closed Lost": "流失未成",
    "Expected close date": "预计成交日期"
})

# 7. Accounting
update_dict('accounting', {
    "admin": "管理员",
    "account": "账户",
    "account.": "账户。",
    "November": "11月",
    "December": "12月",
    "January": "1月",
    "February": "2月",
    "March": "3月",
    "April": "4月",
    "May": "5月",
    "June": "6月",
    "July": "7月",
    "August": "8月",
    "September": "9月",
    "October": "10月",
    "to": "至",
    "A standard chart of accounts is created for you": "已为您预置标准会计科目表",
    "standard chart of accounts is created for you": "已为您预置标准会计科目表",
    "You can change any of this later in Settings": "您稍后可在“设置”中随时更改这些配置",
    "My Company": "我的企业",
    "Standard reports": "标准财务报表",
    "Home currency": "本位币种",
    "Fiscal year starts in": "会计年度起始月份",
    "Open navigation": "展开导航菜单",
    "Account menu for admin": "管理员账户菜单",
    "Jan": "1月",
    "Feb": "2月",
    "Mar": "3月",
    "Apr": "4月",
    "May": "5月",
    "Jun": "6月",
    "Jul": "7月",
    "Aug": "8月",
    "Sep": "9月",
    "Oct": "10月",
    "Nov": "11月",
    "Dec": "12月",
    "Balance Sheet": "资产负债表",
    "Profit and Loss": "利润表 / 损益表",
    "Cash Flow": "现金流量表",
    "Trial Balance": "科目余额试算平衡表",
    "General Ledger": "总账分类账",
    "Journal Entries": "记账凭证",
    "Chart of Accounts": "会计科目表",
    "Assets": "资产类",
    "Liabilities": "负债类",
    "Equity": "所有者权益类",
    "Revenue": "收入类",
    "Expenses": "费用成本类"
})

# 8. Invoicing
update_dict('invoicing', {
    "admin": "管理员",
    "your first invoice or estimate": "您的第一张发票或报价单",
    "It takes about": "仅需约",
    "minute": "分钟",
    "Will be numbered EST-0001": "编号将为 EST-0001",
    "Valid until": "有效期至",
    "PO / reference": "采购订单号 / 关联编号",
    "Client's language": "客户语言",
    "Taxes": "税率与税费",
    "Nothing is printed about tax.": "发票上不打印税费信息。",
    "Line 1 description": "第 1 行项目描述",
    "Add a work description to line 1": "为第 1 行添加服务或商品描述",
    "Line 1 tax": "第 1 行税率",
    "Line 1 quantity": "第 1 行数量",
    "Line 1 unit": "第 1 行单位",
    "Line 1 rate": "第 1 行单价",
    "Remove line 1": "移除第 1 行",
    "Discount type": "折扣类型",
    "Discount value": "折扣数值",
    "Deposit type": "预付款定金类型",
    "Deposit value": "预付款定金数值",
    "Tax 1 name": "税费 1 名称",
    "Tax 1 rate (%)": "税率 1 (%)",
    "Remove tax 1": "移除税费 1",
    "Tax 2 name": "税费 2 名称",
    "Tax 2 rate (%)": "税率 2 (%)",
    "Remove tax 2": "移除税费 2",
    "Tax 3 name": "税费 3 名称",
    "Tax 3 rate (%)": "税率 3 (%)",
    "Remove tax 3": "移除税费 3",
    "Tax 4 name": "税费 4 名称",
    "Tax 4 rate (%)": "税率 4 (%)",
    "Remove tax 4": "移除税费 4",
    "Tax 5 name": "税费 5 名称",
    "Tax 5 rate (%)": "税率 5 (%)",
    "Remove tax 5": "移除税费 5",
    "Tax note wording": "税费附注文案说明",
    "增值税 (标准 13%)": "增值税 (标准 13%)",
    "增值税 (建筑/交通 9%)": "增值税 (建筑/交通 9%)",
    "增值税 (现代服务 6%)": "增值税 (现代服务 6%)",
    "增值税 (小规模 3%)": "增值税 (小规模 3%)",
    "增值税 (减按 1%)": "增值税 (减按 1%)",
    "人民币 ¥ (CNY)": "人民币 ¥ (CNY)",
    "CNY": "人民币 (CNY ¥)",
    "HKD": "港元 (HKD $)",
    "JPY": "日元 (JPY ¥)",
    "CAD": "加元 (CAD $)",
    "AUD": "澳元 (AUD $)",
    "CHF": "瑞士法郎 (CHF)",
    "SGD": "新加坡元 (SGD $)",
    "EUR": "欧元 (EUR €)",
    "USD": "美元 (USD $)",
    "GBP": "英镑 (GBP £)"
})

# 9. Expense
update_dict('expense', {
    "admin": "管理员",
    "CN": "中国 (CN)",
    "支出分类管理": "支出分类管理",
    "新建分类": "新建分类",
    "编辑分类": "编辑分类",
    "分类名称": "分类名称",
    "选择图标": "选择图标",
    "选择颜色": "选择颜色",
    "保存分类": "保存分类",
    "删除分类": "删除分类",
    "确认删除此分类？": "确认删除此分类？",
    "系统设置": "系统设置",
    "外观风格": "外观风格",
    "费用报销管理": "费用报销管理",
    "本位币种": "本位币种",
    "AI 智能票据识别": "AI 智能票据识别",
    "拍照或上传票据交由 AI 自动识别，汇总生成报销单，并与银行账单对账。数据安全存储在您自己的 本地…": "拍照或上传票据交由 AI 自动识别，汇总生成报销单，并与银行账单对账。数据安全存储在您自己的本地独立设备中。"
})

# 10. POS
update_dict('pos', {
    "admin": "管理员",
    "Add your catalog in the Products tab, or ring up a one-off item below": "在“商品管理”标签页中添加商品目录，或在下方直接收银临时商品",
    "one-off item": "临时商品",
    "Start the day with an opening float to reconcile the drawer tonight": "开工录入备用金，以便今晚交班核对钱箱",
    "Opening float": "开班备用金",
    "Cash drawer": "现金钱箱",
    "Close register": "关班结账 / 交班",
    "Sales summary": "销售汇总",
    "Receipt": "收银小票",
    "Print receipt": "打印小票",
    "Checkout": "收银结账",
    "Subtotal": "小计",
    "Tax": "税费",
    "Total": "合计",
    "Cash": "现金支付",
    "Card": "刷卡支付",
    "Digital Pay": "移动支付",
    "Customer": "客户",
    "Discount": "优惠折扣",
    "Item": "商品项目",
    "Quantity": "数量",
    "Price": "单价"
})

# 11. Email
update_dict('email', {
    "mail": "邮件",
    "admin": "管理员",
    "Compose": "写邮件",
    "Inbox": "收件箱",
    "Sent": "已发送",
    "Drafts": "草稿箱",
    "Trash": "已删除邮件",
    "Spam": "垃圾邮件",
    "Archive": "归档邮件",
    "Starred": "星标邮件",
    "Reply": "回复",
    "Reply all": "全部回复",
    "Forward": "转发",
    "Subject": "主题",
    "To": "收件人",
    "Cc": "抄送",
    "Bcc": "密送",
    "Attach files": "添加附件",
    "Send": "发送"
})

# 12. Signatures
update_dict('signatures', {
    "admin": "管理员",
    "Upload a PDF to place signature fields and send it out for signature": "上传 PDF 并放置签名签署区，发送给对方签署",
    "place signature fields, and send private sign links by email": "放置签名签署区，并通过邮件发送安全私密签署链接",
    "Everything is stored locally": "所有数据均保存在本地独立环境中",
    "Sign document": "签署文档",
    "Prepare document": "准备签署文档",
    "Upload PDF": "上传 PDF 文档",
    "Add signature": "添加签名",
    "Draw signature": "手写签名",
    "Type signature": "输入签名",
    "Upload signature": "上传签名图片",
    "Clear signature": "清除签名",
    "Adopt and sign": "确认并签署",
    "Signature field": "签名签署区",
    "Date field": "日期签署区",
    "Text field": "文本输入区",
    "Audit trail": "审计追踪日志",
    "Download signed PDF": "下载已签署 PDF"
})

print("All target dictionaries updated successfully!")
