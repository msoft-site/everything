// Canadian French for embeds, Google Workspace, and document import.
import { addTranslations } from "../i18n.js";

addTranslations({
  // Entry points
  "Import document": "导入文档",
  "Embed content": "嵌入内容",
  "Google Workspace": "Google Workspace",
  "Import Google Sheet as table": "将 Google 表格导入为表格",
  "Refresh from Google Sheets": "从 Google 表格刷新",
  "Open live embed": "打开实时嵌入",
  Embed: "嵌入",
  "Embedded content": "嵌入内容",
  Embeds: "嵌入内容",
  "Images, documents (PDF, Word, PowerPoint, Excel), files, text, and links":
    "图像、文档（PDF、Word、PowerPoint、Excel）、文件、文本和链接",
  // Embed dialog
  "Embed properties": "嵌入属性",
  "Link to embed": "嵌入链接",
  Title: "标题",
  Optional: "选填",
  "Ready to embed": "准备嵌入",
  "This link cannot be embedded. Add it as a link card instead.":
    "无法嵌入此链接。将其添加为链接卡。",
  "Embeds show a preview card on the board. Choose Open live or press Enter to load the interactive content; it closes when you select something else, scroll away, or press Escape.":
    "嵌入在板上显示预览卡。选择“打开直播”或按“Enter”键加载互动内容；当您选择其他内容、滚动或按 Esc 键时，它会关闭。",
  "People who view this board need access to the Google file itself. Google shows a sign-in or access request to anyone without permission.":
    "查看此板的人需要访问 Google 文件本身。 Google 未经许可向任何人显示登录或访问请求。",
  "Supported services": "支持的服务",
  "Google Docs, Sheets, Slides, Forms, Drawings, Drive files and folders, and Calendar; YouTube; Vimeo; Microsoft Forms and Office viewer links; Figma; Loom; and Miro boards.":
    "Google 文档、表格、幻灯片、表单、绘图、云端硬盘文件和文件夹以及日历； YouTube;视频； Microsoft Forms 和 Office 查看器链接；菲格玛；织布机；和米罗板。",
  "YouTube; Vimeo; Microsoft Forms and Office viewer links; Figma; Loom; and Miro boards.":
    "YouTube;视频； Microsoft Forms 和 Office 查看器链接；菲格玛；织布机；和米罗板。",
  "Google Docs, Sheets, Slides, Forms, Drawings, Drive files and folders, and Calendar.":
    "Google 文档、表格、幻灯片、表单、绘图、云端硬盘文件和文件夹以及日历。",
  "Embedded content and Google Workspace integrations are turned off.":
    "嵌入式内容和 Google Workspace 集成已关闭。",
  "Other secure (HTTPS) web pages can be embedded if they allow it.":
    "如果允许，可以嵌入其他安全 (HTTPS) 网页。",
  "Your organization allows only these services.":
    "您的组织仅允许这些服务。",
  "Add link card": "添加链接卡",
  "Save changes": "保存更改",
  "Enter a valid http or https link.":
    "输入有效的 http 或 https 链接。",
  "Add link": "添加链接",
  "Embed it as live content or add a link card.":
    "将其嵌入为实时内容或添加链接卡。",
  "Link card": "链接卡",
  "Import as table": "导入为表格",
  "Import as sticky notes": "导入为便签",
  "Import as frames": "作为画框导入",
  // Live embeds
  "Open live": "打开实时内容",
  "Live embed": "实时嵌入",
  "Open in new tab": "在新标签页中打开",
  Close: "关闭",
  "Close live embed": "关闭实时嵌入",
  "Select an embed first.": "请先选择一个嵌入项。",
  "This embed link is no longer supported.":
    "不再支持此嵌入链接。",
  "Your organization has turned off Google Workspace integrations.":
    "您的组织已关闭 Google Workspace 集成。",
  "Your organization has turned off embedded content.":
    "您的组织已关闭嵌入内容。",
  "This board’s organization has turned off Google Workspace integrations.":
    "该委员会的组织已关闭 Google Workspace 集成。",
  "This board’s organization has turned off embedded content.":
    "该委员会的组织已关闭嵌入内容。",
  // Providers
  "Web page": "网页",
  "Microsoft Office viewer": "Microsoft Office 查看器",
  "Google Calendar": "Google 日历",
  "Google Drawings": "Google 绘图",
  // Link card titles; brand names stay as they are.
  "Zoom meeting": "Zoom 会议",
  "Zoom recording": "Zoom 录像",
  "Microsoft Teams meeting": "Microsoft Teams 会议",
  "Jira issue": "Jira 问题",
  "Trello board": "Trello 看板",
  "Trello card": "Trello 卡片",
  "Linear issue": "Linear 问题",
  "GitHub issue": "GitHub 问题",
  "GitHub pull request": "GitHub 拉取请求",
  "GitLab issue": "GitLab 问题",
  "GitLab merge request": "GitLab 合并请求",
  "Google Drive file": "Google 云端硬盘文件",
  "Google Drive folder": "Google 云端硬盘文件夹",
  // Import dialog
  "Add the content of a PDF, PowerPoint (.pptx), Word (.docx), Excel (.xlsx), CSV, text, or Markdown file as editable objects in a new frame.":
    "将 PDF、PowerPoint (.pptx)、Word (.docx)、Excel (.xlsx)、CSV、文本或 Markdown 文件的内容添加为新画框中的可编辑对象。",
  "Choose file": "选择文件",
  "Attach without importing": "附加而不导入",
  "Choose a file smaller than 10 MB.":
    "选择小于 10 MB 的文件。",
  "No file chosen": "未选择文件",
  "PDF options": "PDF 选项",
  "Pages to import": "要导入的页面",
  pages: "页",
  "Also extract text as sticky notes":
    "还可以将文本提取为便签",
  "Table options": "表选项",
  Sheet: "工作表",
  "All sheets": "所有工作表",
  "Split large ranges into several tables":
    "将大范围拆分为多个表",
  "Import only the first 20 rows and 12 columns": "仅导入前 20 行和 12 列",
  "Board tables hold up to 20 rows, 12 columns, and 2,000 characters per cell.":
    "白板表格最多支持 20 行、12 列，且每个单元格最多 2,000 个字符。",
  "Keep the original file as an attachment":
    "保留原始文件作为附件",
  "Import progress": "导入进度",
  Import: "导入",
  Cancel: "取消",
  "Cancel import": "取消导入",
  Done: "完成",
  PDF: "PDF",
  PowerPoint: "PowerPoint",
  Word: "Word",
  Excel: "Excel",
  CSV: "CSV",
  Text: "文本",
  Markdown: "Markdown",
  "Reading file…": "正在读取文件...",
  "Reading sheets…": "正在读取工作表...",
  "Loading the PDF reader…": "正在加载 PDF 阅读器...",
  "Extracting content…": "正在提取内容...",
  "Rendering pages…": "渲染页面...",
  "Placing content…": "放置内容...",
  "Downloading from Google…": "正在从 Google 下载...",
  Imported: "已导入",
  nothing: "无",
  Skipped: "已跳过",
  Frames: "画框",
  "Sticky notes": "便签",
  Images: "图片",
  Tables: "数据表格",
  Attachments: "附件",
  "Import complete. Undo removes it.": "导入完成。可撤销以将其移除。",
  "Nothing was imported.": "未导入任何内容。",
  "Import cancelled. The board is unchanged.": "导入已取消，白板未发生变化。",
  "Could not import this document.": "无法导入该文档。",
  "An import is already in progress.": "导入已在进行中。",
  "Import one document at a time. The first document is ready to import.": "每次仅支持导入一个文档。第一个文档已准备好导入。",
  "Speaker notes": "演讲者笔记",
  Slide: "幻灯片",
  Document: "文档",
  // Skipped content
  "Images in unsupported formats": "格式不受支持的图像",
  "Images larger than 5 MB": "大于 5 MB 的图像",
  "Images beyond the 100 MB one import can add":
    "一次导入可添加超过 100 MB 的图像",
  "Images that could not be read": "无法读取的图像",
  "Charts that could not be read": "无法读取的图表",
  "Images with more than 40 million pixels":
    "4000万像素以上的图像",
  "Original file larger than 10 MB (not attached)":
    "原始文件大于10 MB（未附加）",
  "Content beyond the edge of the board": "超出板边缘的内容",
  "Objects beyond the board limit of 5,000":
    "超过 5,000 个棋盘限制的物体",
  "Cells shortened to 2,000 characters":
    "单元格缩短至 2,000 个字符",
  "Sticky notes shortened to 20,000 characters":
    "便签长度缩短至 20,000 个字符",
  "Rows beyond the imported range": "超出导入范围的行",
  "Columns beyond the imported range": "超出导入范围的列",
  "Rows or columns beyond 1,000 rows and 120 columns":
    "超过 1,000 行和 120 列的行或列",
  "Rows or columns beyond 5,000 rows and 500 columns":
    "超过 5,000 行和 500 列的行或列",
  "Empty sheets": "空工作表",
  "Pages beyond the imported range": "超出导入范围的页面",
  "Paragraphs beyond 40 on a page": "每页段落超过 40 段",
  "Pages too detailed to import as images":
    "页面太详细而无法导入为图像",
  // Errors
  "A board can contain up to 5,000 objects.":
    "一个板最多可以包含 5,000 个对象。",
  "Choose a PDF, PowerPoint, Word, Excel, CSV, text, or Markdown file.":
    "选择 PDF、PowerPoint、Word、Excel、CSV、文本或 Markdown 文件。",
  "Older Office formats (.doc, .ppt, .xls) are not supported. Save the file as .docx, .pptx, or .xlsx and import it again.":
    "不支持旧版 Office 格式（.doc、.ppt、.xls）。将文件另存为 .docx、.pptx 或 .xlsx，然后再次导入。",
  "Choose a document smaller than 50 MB.":
    "选择小于 50 MB 的文档。",
  "Choose a PDF smaller than 50 MB.": "选择小于 50 MB 的 PDF。",
  "Choose a CSV file smaller than 5 MB.":
    "选择小于 5 MB 的 CSV 文件。",
  "Choose a Markdown file smaller than 20 MB.":
    "选择小于 20 MB 的 Markdown 文件。",
  "Choose a text file smaller than 2 MB.":
    "选择小于 2 MB 的文本文件。",
  "This document holds more than 2 MB of text.":
    "本文档包含超过 2 MB 的文本。",
  "Choose a sheet to import.": "选择要导入的工作表。",
  "Could not read this file.": "无法读取该文件。",
  "Could not read this workbook.": "无法阅读该工作簿。",
  "This workbook has no sheets to import.":
    "该工作簿没有要导入的工作表。",
  "This browser cannot open compressed Office files. Update your browser and try again.":
    "此浏览器无法打开压缩的 Office 文件。更新您的浏览器并重试。",
  "This file is damaged or is not a supported document.":
    "该文件已损坏或不是受支持的文档。",
  "This file expands beyond the import size limit.":
    "此文件超出了导入大小限制。",
  "This file contains too many parts to import.":
    "该文件包含太多无法导入的部分。",
  "Large ZIP64 archives are not supported.":
    "不支持大型 ZIP64 存档。",
  "Password-protected documents are not supported.":
    "不支持受密码保护的文档。",
  "This document uses an unsupported compression.":
    "本文档使用不受支持的压缩。",
  "A part of this file is too large to import.":
    "该文件的一部分太大而无法导入。",
  "A part of this document is too large to import.":
    "该文档的一部分太大而无法导入。",
  "This document contains unsupported XML declarations.":
    "本文档包含不受支持的 XML 声明。",
  "This document is damaged or is not a supported format.":
    "该文档已损坏或不是受支持的格式。",
  "This document is incomplete.": "该文档不完整。",
  "XML parsing is unavailable in this browser.":
    "XML 解析在此浏览器中不可用。",
  "This is not a PowerPoint presentation.":
    "这不是 PowerPoint 演示文稿。",
  "This is not a Word document.": "这不是 Word 文档。",
  "This is not an Excel workbook.": "这不是 Excel 工作簿。",
  "This file type is not supported.":
    "不支持此文件类型。",
  "Could not load the PDF reader. Check your connection and try again.":
    "无法加载 PDF 阅读器。检查您的连接并重试。",
  "Password-protected PDFs are not supported.":
    "不支持受密码保护的 PDF。",
  "This PDF is damaged or is not supported.":
    "此 PDF 已损坏或不受支持。",
  // Google Workspace
  "Google Docs, Sheets, Slides, Forms, or Drive link":
    "Google 文档、表格、幻灯片、表单或云端硬盘链接",
  "Add as": "添加为",
  "Editable table from Google Sheets":
    "Google 表格中的可编辑表格",
  "Google Doc outline as sticky notes":
    "Google 文档大纲作为便签",
  "Google Slides as frames": "Google 幻灯片作为画框",
  "Large sheets": "大型工作表",
  "Split into several tables": "分成几张表",
  "Imports need the file shared with “Anyone with the link” or published to the web. Tables imported from Google Sheets can be refreshed later.":
    "导入需要与“知道链接的任何人”共享文件或发布到网络。从 Google Sheets 导入的表格可以稍后刷新。",
  "Add to board": "添加到白板",
  "Paste a link to a Google Docs, Sheets, or Slides file.":
    "粘贴指向 Google 文档、表格或幻灯片文件的链接。",
  "Paste a link to a Google Sheets spreadsheet.":
    "粘贴指向 Google 表格电子表格的链接。",
  "Paste a link to a Google Docs document.":
    "粘贴指向 Google 文档文档的链接。",
  "Paste a link to a Google Slides presentation.":
    "粘贴指向 Google 幻灯片演示文稿的链接。",
  "Google did not share this file. Set sharing to “Anyone with the link” or publish it to the web, then try again.":
    "谷歌没有共享这个文件。将共享设置为“知道链接的任何人”或将其发布到网络，然后重试。",
  "This Google file wasn’t found. It may have been deleted, or the link is wrong.":
    "找不到此 Google 文件。可能已被删除，或者链接错误。",
  "This sheet tab no longer exists. It may have been deleted from the spreadsheet.":
    "该工作表选项卡不再存在。它可能已从电子表格中删除。",
  "Could not reach Google. Check your connection and try again.":
    "无法连接到 Google。检查您的连接并重试。",
  "This Google file is too large to import.":
    "此 Google 文件太大，无法导入。",
  "This Google link is not supported.":
    "不支持此 Google 链接。",
  "Use the presentation’s sharing link rather than a published link.":
    "使用演示文稿的共享链接而不是已发布的链接。",
  "Select a table imported from Google Sheets.": "请选择一个从 Google 表格导入的数据表。",
  "Refreshing from Google Sheets…": "正在从 Google 表格刷新...",
  "This table is already up to date.": "该表已经是最新的。",
  "Table refreshed from Google Sheets. Undo restores the previous cells.":
    "表格从 Google 表格刷新。撤消可恢复之前的单元格。",
  "Could not refresh this table.":
    "无法刷新此表。",
  "Invalid embed.": "嵌入无效。",
  "Invalid table source.": "表源无效。",
});
