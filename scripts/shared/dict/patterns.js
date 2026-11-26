const EXTRA_PATTERNS = [
  // Checkmarks: "✓RGB Color" -> "✓ RGB 颜色"
  (s, t) => { const m = s.match(/^[✓✔]\s*(.+)$/); if (!m) return null; const b = t(m[1].trim()); return b ? '✓ ' + b : null; },
  // Trailing shortcut without space: "Black & White…Ctrl+Alt+Shift+B" -> "黑白… Ctrl+Alt+Shift+B"
  (s, t) => {
    const m = s.match(/^(.+?)(Ctrl\+[\w+\\]+|Shift\+[\w+\\]+|Alt\+[\w+\\]+|\\\b)$/);
    if (!m) return null;
    const b = t(m[1].trim());
    return b ? b + ' ' + m[2] : null;
  },
  // Tooltip hints: "Shift+V or right-click for the other tools in this slot"
  (s) => {
    const m = s.match(/^(?:Shift\+([A-Za-z0-9]+)\s+or\s+)?right-click for the other tools in this slot$/i);
    if (!m) return null;
    return m[1] ? ('按 Shift+' + m[1] + ' 或右键单击查看此组中的其他工具') : '右键单击查看此组中的其他工具';
  },
  // "Move Tool (V)" -> "移动工具 (V)"
  (s, t) => {
    const m = s.match(/^(.+?)\s+Tool\s*\(([A-Z0-9])\)$/i);
    if (!m) return null;
    const b = t(m[1]) || t(m[1] + ' Tool');
    return b ? ((b.endsWith('工具') ? b : (b + '工具')) + ' (' + m[2] + ')') : null;
  },
  // "Arc Tool, in toolbar" -> "弧形工具，位于工具栏"
  (s, t) => { const m = s.match(/^(.+), in toolbar$/); if (!m) return null; const b = t(m[1]) || (t(m[1] + ' Tool')); return b ? b + '，位于工具栏' : null; },
  // "Foo Tool" -> "Foo工具"
  (s, t) => { const m = s.match(/^(.+) Tool$/); if (!m) return null; const b = t(m[1]); return b ? (b.endsWith('工具') ? b : b + '工具') : null; },
  (s) => { const m = s.match(/^Welcome back, (.+)$/); return m ? '欢迎回来，' + m[1] : null; },
  (s) => { const m = s.match(/^Photo print (\d+) × (\d+)$/); return m ? (m[1] + ' × ' + m[2] + ' 照片打印') : null; },
  (s) => { const m = s.match(/^Camera frame (\d+:\d+)$/); return m ? ('相机画幅 ' + m[1]) : null; },
  (s) => {
    const m = s.match(/^(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*(in|px|mm|cm)\s*@\s*(\d+)\s*ppi$/i);
    if (!m) return null;
    return m[1] + ' × ' + m[2] + ' ' + ({in:'英寸',px:'像素',mm:'毫米',cm:'厘米'}[m[3].toLowerCase()] || m[3]) + ' @ ' + m[4] + ' ppi';
  },
  (s) => { const m = s.match(/^Slot (\d+) power$/); return m ? ('插槽 ' + m[1] + ' 电源') : null; },
  (s) => { const m = s.match(/^Slot (\d+): empty\. Press Enter to choose an effect\.$/); return m ? ('插槽 ' + m[1] + '：空。按 Enter 选择效果。') : null; },
  (s) => { const m = s.match(/^Choose effect for slot (\d+)$/); return m ? ('为插槽 ' + m[1] + ' 选择效果') : null; },
  (s) => { const m = s.match(/^(Input|Output):\s*([0-9.-]+\s*dB)$/); return m ? ((m[1] === 'Input' ? '输入：' : '输出：') + m[2]) : null; },
  // Music studio patterns
  (s) => { const m = s.match(/^Step (\d+),\s*(on|off),\s*velocity\s*(\d+%)$/i); return m ? ('步进 ' + m[1] + '，' + (m[2].toLowerCase() === 'on' ? '开启' : '关闭') + '，力度 ' + m[3]) : null; },
  (s) => { const m = s.match(/^Step (\d+),\s*(on|off)$/i); return m ? ('步进 ' + m[1] + '，' + (m[2].toLowerCase() === 'on' ? '开启' : '关闭')) : null; },
  (s, t) => { const m = s.match(/^Mute (.+?) \(click\)\. Solo: Ctrl\+click or right-click$/i); return m ? ('静音 ' + (t(m[1]) || m[1]) + ' (点击)。独奏: Ctrl+点击或右键点击') : null; },
  (s, t) => { const m = s.match(/^(.+?): click to select, double-click or Enter for the editor, right-click for options$/i); return m ? ((t(m[1]) || m[1]) + '：点击选择，双击或按 Enter 打开编辑器，右键单击打开选项') : null; },
  (s, t) => { const m = s.match(/^Mixer insert:\s*(.+?)\.\s*Drag or scroll to change$/i); return m ? ('混音插槽：' + (t(m[1]) || m[1]) + '。拖动或滚动以调整') : null; },
  (s, t) => { const m = s.match(/^Channels playing through this insert:\s*(.*)$/i); return m ? ('通过此插槽播放的通道：' + m[1]) : null; },
  (s) => { const m = s.match(/^Inputs:\s*(.*)$/i); return m ? ('输入：' + m[1]) : null; },
  (s) => { const m = s.match(/^Width:\s*(\d+%)$/i); return m ? ('立体声宽度：' + m[1]) : null; },
  (s, t) => { const m = s.match(/^(.+?)\s+sends here\.\s*Click to remove the send\.$/i); return m ? ((t(m[1]) || m[1]) + ' 发送至此。点击移除发送。') : null; },
  (s, t) => { const m = s.match(/^Send level to (.+?):\s*(.+)$/i); return m ? ('发送至 ' + (t(m[1]) || m[1]) + ' 的电平：' + m[2]) : null; },
  (s) => { const m = s.match(/^Send level:\s*(.+)$/i); return m ? ('发送电平：' + m[1]) : null; },
  (s, t) => { const m = s.match(/^Send (.+?) to (.+)$/i); return m ? ('将 ' + (t(m[1]) || m[1]) + ' 发送至 ' + (t(m[2]) || m[2])) : null; },
  (s, t) => { const m = s.match(/^Click to send (.+?) here$/i); return m ? ('点击将 ' + (t(m[1]) || m[1]) + ' 发送至此') : null; },
  (s, t) => { const m = s.match(/^Remove send to (.+)$/i); return m ? ('移除发送至 ' + (t(m[1]) || m[1])) : null; },
  (s) => { const m = s.match(/^(\d+) of (\d+) effect slots used$/i); return m ? ('已使用 ' + m[1] + '/' + m[2] + ' 个效果插槽') : null; },
  (s) => { const m = s.match(/^(\d+)\s+effects?$/i); return m ? (m[1] + ' 个效果器') : null; },
  (s) => { const m = s.match(/^(\d+)\s+steps$/i); return m ? (m[1] + ' 步') : null; },
  (s) => { const m = s.match(/^(\d+)\s+bars$/i); return m ? (m[1] + ' 小节') : null; },
  (s, t) => { const m = s.match(/^Channel rack,\s*(.+)$/i); return m ? ('通道机架，' + (t(m[1]) || m[1])) : null; },
  (s) => { const m = s.match(/^Pattern (\d+),\s*unused$/i); return m ? ('样式 ' + m[1] + '，未使用') : null; },
  (s) => { const m = s.match(/^Pattern (\d+)$/i); return m ? ('样式 ' + m[1]) : null; },
  (s, t) => { const m = s.match(/^Insert (\d+),\s*(.+)$/i); return m ? ('插槽 ' + m[1] + '，' + (t(m[2]) || m[2])) : null; },
  (s, t) => { const m = s.match(/^(.+?)\.\s*Double-click or F2 to rename\.$/i); return m ? ((t(m[1]) || m[1]) + '。双击或按 F2 重命名。') : null; },
  (s, t) => { const m = s.match(/^(.+?)\s+volume:\s*(.+)$/i); return m ? ((t(m[1]) || m[1]) + ' 音量：' + m[2]) : null; },
  (s, t) => { const m = s.match(/^(.+?)\s+volume$/i); return m ? ((t(m[1]) || m[1]) + ' 音量') : null; },
  (s, t) => { const m = s.match(/^(.+?)\s+pan$/i); return m ? ((t(m[1]) || m[1]) + ' 声相') : null; },
  (s, t) => { const m = s.match(/^(.+?)\s+mixer insert$/i); return m ? ((t(m[1]) || m[1]) + ' 混音插槽') : null; },
  (s, t) => { const m = s.match(/^Mute (.+)$/i); return m ? ('静音 ' + (t(m[1]) || m[1])) : null; },
  (s, t) => { const m = s.match(/^Solo (.+)$/i); return m ? ('独奏 ' + (t(m[1]) || m[1])) : null; },
  (s, t) => { const m = s.match(/^Select (.+)$/i); return m ? ('选择 ' + (t(m[1]) || m[1])) : null; },
  (s, t) => { const m = s.match(/^(.+?):\s*(on|off)$/i); return m ? ((t(m[1]) || m[1]) + '：' + (m[2].toLowerCase() === 'on' ? '开启' : '关闭')) : null; },
  (s) => { const m = s.match(/^Pattern:\s*(.+?)\.\s*Select pattern$/i); return m ? ('样式：' + m[1] + '。选择样式') : null; },
  (s) => { const m = s.match(/^Send Insert (\d+) to (.+)$/i); return m ? ('将插入通道 ' + m[1] + ' 发送至 ' + m[2]) : null; },
  (s) => { const m = s.match(/^Send level from (.+?) to (.+)$/i); return m ? ('从 ' + m[1] + ' 到 ' + m[2] + ' 的发送电平') : null; },
  (s) => { const m = s.match(/^Insert (\d+)\.\s*Double-click or F2 to rename\.$/i); return m ? ('插入通道 ' + m[1] + '。双击或按 F2 重命名。') : null; },
  (s) => { const m = s.match(/^Insert (\d+)\s+volume:\s*(.+)$/i); return m ? ('插入通道 ' + m[1] + ' 音量：' + m[2]) : null; },
  (s) => { const m = s.match(/^Insert (\d+)\s+volume$/i); return m ? ('插入通道 ' + m[1] + ' 音量') : null; },
  (s) => { const m = s.match(/^Mute Insert (\d+)$/i); return m ? ('静音插入通道 ' + m[1]) : null; },
  (s) => { const m = s.match(/^Solo Insert (\d+)$/i); return m ? ('独奏插入通道 ' + m[1]) : null; },
  (s) => { const m = s.match(/^Insert (\d+),\s*Insert (\d+)$/i); return m ? ('插入通道 ' + m[1]) : null; },
  (s) => { const m = s.match(/^Insert (\d+)\s+selected$/i); return m ? ('已选择插入通道 ' + m[1]) : null; },
  (s) => { const m = s.match(/^Insert (\d+)$/i); return m ? ('插入通道 ' + m[1]) : null; },
  (s) => { const m = s.match(/^Channel:\s*(.+?)\.\s*Choose the channel to edit$/i); return m ? ('通道：' + m[1] + '。选择要编辑的通道') : null; },
  (s, t) => { const m = s.match(/^Tool:\s*(.+)$/i); if (!m) return null; const b = t(m[1]) || m[1]; return '工具：' + b; },
  (s) => { const m = s.match(/^Scale highlight:\s*(.+)$/i); return m ? ('调式高亮：' + (m[1] === 'off' ? '关闭' : m[1])) : null; },
  (s) => { const m = s.match(/^Piano roll:\s*(.+?)\s+in\s+(.+)$/i); return m ? ('钢琴卷帘：' + m[1] + ' (' + m[2] + ')') : null; },
  (s) => { const m = s.match(/^Clip source:\s*(.+?)\.\s*Change source$/i); return m ? ('剪辑源：' + m[1] + '。更改源') : null; },
  (s) => { const m = s.match(/^Project:\s*(.+?)\.\s*Edited\.\s*Open project settings$/i); return m ? ('项目：' + m[1] + '。已编辑。打开项目设置') : null; },
  (s) => { const m = s.match(/^(\d+)\s+notes that do not fit the steps\.\s*Press Enter to open in the piano roll$/i); return m ? (m[1] + ' 个超出步进的音符。按 Enter 在钢琴卷帘中打开') : null; },
  (s) => { const m = s.match(/^Track (\d+):\s*Track (\d+)$/i); return m ? ('音轨 ' + m[1] + '：音轨 ' + m[2]) : null; },
  (s, t) => { const m = s.match(/^Track (\d+):\s*(.+)$/i); return m ? ('音轨 ' + m[1] + '：' + (t(m[2]) || m[2])) : null; },
  (s) => { const m = s.match(/^Track (\d+)$/i); return m ? ('音轨 ' + m[1]) : null; },
  (s, t) => { const m = s.match(/^(.+?):\s*click to select, double-click to rename, right-click for options$/i); return m ? ((t(m[1]) || m[1]) + '：点击选择，双击重命名，右键单击打开选项') : null; },
  (s, t) => { const m = s.match(/^(.+?),\s*(\d+)\s*clips?$/i); return m ? ((t(m[1]) || m[1]) + '，' + m[2] + ' 个剪辑') : null; },
  (s) => { const m = s.match(/^(\d+)\s*clips?\s*in the playlist$/i); return m ? ('播放列表中的 ' + m[1] + ' 个剪辑') : null; },
  (s) => { const m = s.match(/^Swing:\s*(\d+%)$/i); return m ? ('摇摆感：' + m[1]) : null; },
  (s) => { const m = s.match(/^Master:\s*(.+)$/i); return m ? ('主通道：' + m[1]) : null; },
  (s) => { const m = s.match(/^Account:\s*(.+)$/i); return m ? ('账号：' + m[1]) : null; },
  (s) => { const m = s.match(/^Volume:\s*(.+)$/i); return m ? ('音量：' + m[1]) : null; },
  (s) => { const m = s.match(/^Pan:\s*(.+)$/i); return m ? ('声相：' + m[1]) : null; },
  (s) => { const m = s.match(/^fx\s*(\d+)$/i); return m ? ('效果 ' + m[1]) : null; },
  (s) => { const m = s.match(/^(\d+)\s+Kick$/i); return m ? (m[1] + ' 底鼓') : null; },
  (s) => { const m = s.match(/^Project:\s*(.+?)\.\s*\.?\s*Open project settings$/i); return m ? ('项目：' + m[1] + '。打开项目设置') : null; },
  // Video Studio template patterns
  (s, t) => {
    const m = s.match(/^(\d+:\d+)\s+([^,]+),\s*new project$/i);
    if (!m) return null;
    const b = t(m[2]) || m[2];
    return m[1] + ' ' + b + '，新建项目';
  },
  (s, t) => {
    const m = s.match(/^(.+?)\s*·\s*(\d{2}:\d{2})(?:\s*·\s*(\d+)\s*slots?)?$/i);
    if (!m) return null;
    const cat = t(m[1].trim()) || m[1].trim();
    return cat + '  ·  ' + m[2] + (m[3] ? '  ·  ' + m[3] + ' 个卡槽' : '');
  },
  (s, t) => {
    const m = s.match(/^(\d+:\d+)\s+([^,]+),\s*([^,]+),\s*(\d{2}:\d{2})(?:,\s*(\d+)\s*slots?)?\.\s*(.*)$/i);
    if (!m) return null;
    const name = t(m[2].trim()) || m[2].trim();
    const cat = t(m[3].trim()) || m[3].trim();
    const slots = m[5] ? (', ' + m[5] + ' 个卡槽') : '';
    const desc = t(m[6].trim()) || m[6].trim();
    return m[1] + ' ' + name + '，' + cat + '，' + m[4] + slots + '。' + desc;
  },
  (s) => { const m = s.match(/^Auto saved:\s*(.*)$/i); return m ? ('自动保存于: ' + m[1]) : null; },
  (s, t) => { const m = s.match(/^Project name:\s*(.+?)\.\s*Rename$/i); return m ? ('项目名称：' + (t(m[1]) || m[1]) + '。重命名') : null; },
  (s, t) => { const m = s.match(/^Timeline:\s*(.+?)\.\s*Switch or add timelines$/i); return m ? ('时间轴：' + (t(m[1]) || m[1]) + '。切换或添加时间轴') : null; },
  (s) => { const m = s.match(/^Project (\d+) - Video Studio editor$/i); return m ? ('项目 ' + m[1] + ' - 视频剪辑工作室编辑器') : null; },
  (s) => { const m = s.match(/^Project (\d+)$/i); return m ? ('项目 ' + m[1]) : null; },
  (s) => { const m = s.match(/^Timeline (\d+)$/i); return m ? ('时间轴 ' + m[1]) : null; },
  (s, t) => { const m = s.match(/^Lock (.+)$/i); return m ? ('锁定 ' + (t(m[1]) || m[1])) : null; },
  (s, t) => { const m = s.match(/^Hide (.+)$/i); return m ? ('隐藏 ' + (t(m[1]) || m[1])) : null; },
  (s, t) => { const m = s.match(/^(.+?)\s+options$/i); return m ? ((t(m[1]) || m[1]) + ' 选项') : null; },
  // 3D Studio HUD and statistics patterns
  (s, t) => {
    const m = s.match(/^Collection\s*\|\s*(.+?)\s*\|\s*Verts:(\d+)\s*\|\s*Faces:(\d+)\s*\|\s*Tris:(\d+)\s*\|\s*Objects:(\d+\/\d+)$/i);
    if (!m) return null;
    return '集合 | ' + (t(m[1]) || m[1]) + ' | 顶点:' + m[2] + ' | 面:' + m[3] + ' | 三角面:' + m[4] + ' | 物体:' + m[5];
  },
  (s, t) => {
    const m = s.match(/^\((.+?)\)\s*Collection\s*\|\s*(.+)$/i);
    if (!m) return null;
    return '(' + m[1] + ') 集合 | ' + (t(m[2]) || m[2]);
  },
  // CAD patterns
  (s) => { const m = s.match(/^Drawing(\d+)$/i); return m ? ('图纸' + m[1]) : null; },
  (s) => { const m = s.match(/^Close Drawing(\d+)$/i); return m ? ('关闭图纸' + m[1]) : null; },
  (s, t) => { const m = s.match(/^Layer:\s*(.+)$/i); return m ? ('图层：' + (t(m[1]) || m[1])) : null; },
  // Parametric patterns
  (s) => { const m = s.match(/^Part(\d+)$/i); return m ? ('零件' + m[1]) : null; },
  (s) => { const m = s.match(/^Part(\d+),\s*rename part$/i); return m ? ('零件' + m[1] + '，重命名零件') : null; },
  (s) => { const m = s.match(/^Share Part(\d+)$/i); return m ? ('分享零件' + m[1]) : null; },
  (s) => { const m = s.match(/^Rebuild took (.+?) \((.+?) including transfer\)$/i); return m ? ('重建耗时 ' + m[1] + ' (含传输 ' + m[2] + ')') : null; },
  (s) => { const m = s.match(/^Saved to (.+)$/i); return m ? ('已保存至 ' + m[1]) : null; },
  (s) => { const m = s.match(/^Signed in as (.+)$/i); return m ? ('已登录为 ' + m[1]) : null; },
  (s) => { const m = s.match(/^Colour\s*(#[0-9a-fA-F]{6})$/i); return m ? ('颜色 ' + m[1]) : null; },
  (s) => { const m = s.match(/^(\d+(?:\.\d+)?)\s*ms$/i); return m ? (m[1] + ' 毫秒') : null; },
  (s) => {
    const m = s.match(/^(A[0-5])\s*\((\d+)\s*[x×]\s*(\d+)\s*mm\)$/i);
    return m ? (m[1] + ' (' + m[2] + ' × ' + m[3] + ' 毫米)') : null;
  },
  // Circuits patterns
  (s) => { const m = s.match(/^Close (.+\.(?:sch|pcb))$/i); return m ? ('关闭 ' + m[1]) : null; },
  (s) => { const m = s.match(/^\.\s*(.+\.(?:sch|pcb))$/i); return m ? ('. ' + m[1]) : null; },
  (s) => { const m = s.match(/^Schematic (.+\.sch)$/i); return m ? ('原理图 ' + m[1]) : null; },
  (s) => { const m = s.match(/^Board (.+\.pcb)$/i); return m ? ('印制板 ' + m[1]) : null; },
  (s) => { const m = s.match(/^(\d+)\s*pins?$/i); return m ? (m[1] + ' 个引脚') : null; },
  (s) => { const m = s.match(/^(\d+(?:\.\d+)?)\s*mil$/i); return m ? (m[1] + ' 密尔') : null; },
  (s) => { const m = s.match(/^Grid:\s*(\d+(?:\.\d+)?)mil$/i); return m ? ('网格: ' + m[1] + ' 密尔') : null; },
  (s) => { const m = s.match(/^X:\s*(\d+(?:\.\d+)?)mil\s+Y:\s*(\d+(?:\.\d+)?)mil$/i); return m ? ('X: ' + m[1] + ' 密尔  Y: ' + m[2] + ' 密尔') : null; },
  (s) => { const m = s.match(/^Pads without a pin \(left unconnected\):\s*(.+)$/i); return m ? ('无引脚的焊盘（悬空不连接）：' + m[1]) : null; },
  (s) => { const m = s.match(/^Pin list:\s*(.+)$/i); return m ? ('引脚列表：' + m[1]) : null; },
  (s) => { const m = s.match(/^Electrical rules check:\s*(\d+)\s*errors?,\s*(\d+)\s*warnings?$/i); return m ? ('电气规则检查：' + m[1] + ' 错误，' + m[2] + ' 警告') : null; },
  // Building Design patterns
  (s) => { const m = s.match(/^Level\s+(\d+)$/i); return m ? ('标高 ' + m[1]) : null; },
  (s) => { const m = s.match(/^Scale\s+1\s*:\s*(\d+)$/i); return m ? ('比例 1 : ' + m[1]) : null; },
  (s) => { const m = s.match(/^Detail Level:\s*(Coarse|Medium|Fine)$/i); return m ? ('详细程度：' + ({Coarse:'粗略',Medium:'中等',Fine:'精细'})[m[1]]) : null; },
  (s, t) => { const m = s.match(/^Visual Style:\s*(.+)$/i); return m ? ('视觉样式：' + (t(m[1]) || m[1])) : null; },
  (s) => { const m = s.match(/^Saved (.+) to Puter\.$/i); return m ? ('已保存 ' + m[1] + ' 到本地。') : null; },
  (s) => { const m = s.match(/^Saved (.+)\.$/i); return m ? ('已保存 ' + m[1] + '。') : null; },
  (s) => { const m = s.match(/^Opened (.+)\.$/i); return m ? ('已打开 ' + m[1] + '。') : null; },
  (s) => { const m = s.match(/^Downloaded (.+)\.$/i); return m ? ('已下载 ' + m[1] + '。') : null; },
  (s) => { const m = s.match(/^(\d+(?:\.\d+)?) x (\d+(?:\.\d+)?) (px|in|mm|pt|cm)$/); if (!m) return null; return m[1] + ' × ' + m[2] + ' ' + ({px:'像素',in:'英寸',mm:'毫米',pt:'点',cm:'厘米'})[m[3]]; },
  (s, t) => { const m = s.match(/^(.+?) (\d+(?:\.\d+)?) x (\d+(?:\.\d+)?) (px|in|mm|pt|cm)$/); if (!m) return null; const b = t(m[1]); return b ? b + '，' + m[2] + ' × ' + m[3] + ' ' + ({px:'像素',in:'英寸',mm:'毫米',pt:'点',cm:'厘米'})[m[4]] : null; },
  // Shortcuts dialog patterns
  (s, t) => { const m = s.match(/^Add a shortcut for (.+)$/i); return m ? ('为 ' + (t(m[1]) || m[1]) + ' 添加快捷键') : null; },
  (s, t) => { const m = s.match(/^Change shortcut (.+?) for (.+)$/i); return m ? ('更改 ' + (t(m[2]) || m[2]) + ' 的快捷键 ' + m[1]) : null; },
  (s, t) => { const m = s.match(/^Remove (.+?) from (.+)$/i); return m ? ('从 ' + (t(m[2]) || m[2]) + ' 中移除 ' + m[1]) : null; },
  (s, t) => { const m = s.match(/^Reset (.+?) to its default$/i); return m ? ('重置 ' + (t(m[1]) || m[1]) + ' 为默认快捷键') : null; },
  (s) => { const m = s.match(/^Auto saved:\s*(.+)$/i); return m ? ('已自动保存：' + m[1]) : null; },
  (s) => { const m = s.match(/^(\d+)\s*x\s*(\d+),\s*Original,\s*(\d+)\s*fps$/i); return m ? (m[1] + ' × ' + m[2] + '，原始，' + m[3] + ' fps') : null; },
  // Meetings / calendar date patterns
  (s) => {
    const days = { Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四', Fri: '周五', Sat: '周六', Sun: '周日', Monday: '星期一', Tuesday: '星期二', Wednesday: '星期三', Thursday: '星期四', Friday: '星期五', Saturday: '星期六', Sunday: '星期日' };
    const months = { Jan: '1月', Feb: '2月', Mar: '3月', Apr: '4月', May: '5月', Jun: '6月', Jul: '7月', Aug: '8月', Sep: '9月', Oct: '10月', Nov: '11月', Dec: '12月', January: '1月', February: '2月', March: '3月', April: '4月', June: '6月', July: '7月', August: '8月', September: '9月', October: '10月', November: '11月', December: '12月' };
    let m = s.match(/^(?:([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))\s*•\s*)?(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*([A-Za-z]+)\s*(\d+)(?:,\s*(\d{4}))?$/i);
    if (m) {
      const time = m[1] ? (m[1] + ' • ') : '';
      const day = days[m[2]] || m[2];
      const month = months[m[3]] || m[3];
      const year = m[5] ? (m[5] + '年 ') : '';
      return `${time}${year}${month}${m[4]}日 ${day}`;
    }
    return null;
  },
  // CAD patterns
  (s) => { const m = s.match(/^Spacing\s+(\d+(?:\.\d+)?)$/i); return m ? ('间距 ' + m[1]) : null; },
  (s, t) => { const m = s.match(/^Text style:\s*(.+)$/i); return m ? ('文字样式：' + (t(m[1]) || m[1])) : null; },
  (s, t) => { const m = s.match(/^Dimension style:\s*(.+)$/i); return m ? ('标注样式：' + (t(m[1]) || m[1])) : null; },
  (s) => { const m = s.match(/^Text height:\s*(\d+(?:\.\d+)?)$/i); return m ? ('文字高度：' + m[1]) : null; },
  (s) => { const m = s.match(/^Sample:\s*(.+)$/i); return m ? ('示例：' + m[1]) : null; },
  (s) => { const m = s.match(/^Scale\s+1\s*:\s*([0-9.]+)$/i); return m ? ('比例 1 : ' + m[1]) : null; },
  (s) => { const m = s.match(/^Command:\s*(.+)$/i); return m ? ('命令：' + m[1]) : null; },
  // Teamchat patterns
  (s) => { const m = s.match(/^You:\s*(.+?)\.\s*Status,\s*notifications,\s*and\s*settings$/i); return m ? ('您：' + m[1] + '。状态、通知与设置') : null; },
  (s) => { const m = s.match(/^Hi\s+(.+?)\.\s*Teamchat keeps your team's conversations in channels, threads, and direct messages\.\s*Where would you like to start\?$/i); return m ? ('你好 ' + m[1] + '。团队聊天通过频道、话题和私信让团队沟通井然有序。你想从哪里开始？') : null; },
  // Calendar date & recurrence patterns
  (s) => {
    const days = { Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四', Fri: '周五', Sat: '周六', Sun: '周日', Monday: '周一', Tuesday: '周二', Wednesday: '周三', Thursday: '周四', Friday: '周五', Saturday: '周六', Sunday: '周日' };
    const months = { Jan: '1月', Feb: '2月', Mar: '3月', Apr: '4月', May: '5月', Jun: '6月', Jul: '7月', Aug: '8月', Sep: '9月', Oct: '10月', Nov: '11月', Dec: '12月', January: '1月', February: '2月', March: '3月', April: '4月', June: '6月', July: '7月', August: '8月', September: '9月', October: '10月', November: '11月', December: '12月' };
    const ords = { first: '第一个', second: '第二个', third: '第三个', fourth: '第四个', last: '最后一个' };
    let m = s.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})(?:,\s*(selected))?$/i);
    if (m) {
      const d = days[m[1]] || m[1];
      const mo = months[m[2]] || m[2];
      const sel = m[5] ? ' (已选)' : '';
      return `${m[4]}年${mo}${m[3]}日 ${d}${sel}`;
    }
    m = s.match(/^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i);
    if (m) {
      const mo = months[m[1]] || m[1];
      return `${m[2]}年${mo}`;
    }
    m = s.match(/^Weekly on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i);
    if (m) {
      return '每' + (days[m[1]] || m[1]);
    }
    m = s.match(/^Monthly on the (first|second|third|fourth|last)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i);
    if (m) {
      return '每月' + (ords[m[1].toLowerCase()] || m[1]) + (days[m[2]] || m[2]);
    }
    m = s.match(/^Annually on ([A-Za-z]+)\s+(\d{1,2})$/i);
    if (m) {
      return '每年' + (months[m[1]] || m[1]) + m[2] + '日';
    }
    return null;
  },
  // Video studio effect and filter patterns
  (s, t) => {
    let m = s.match(/^Add (.+) effect$/i);
    if (m) {
      const name = t(m[1]) || m[1];
      return '添加' + name + '特效';
    }
    m = s.match(/^Add (.+) filter$/i);
    if (m) {
      const name = t(m[1]) || m[1];
      return '添加' + name + '滤镜';
    }
    m = s.match(/^Switch to angle (\d+)$/i);
    if (m) {
      return '切换到机位 ' + m[1];
    }
    m = s.match(/^Auto saved:\s*$/i);
    if (m) {
      return '自动保存：';
    }
    m = s.match(/^Events\s*·\s*(.+)$/i);
    if (m) {
      return '活动 · ' + m[1];
    }
    m = s.match(/^(\d+:\d+)\s+long$/i);
    if (m) {
      return '时长 ' + m[1];
    }
    m = s.match(/^(\d+:\d+)\s+aspect ratio$/i);
    if (m) {
      return m[1] + ' 画幅比例';
    }
    m = s.match(/^Add (.+) transition$/i);
    if (m) {
      const name = t(m[1]) || m[1];
      return '添加' + name + '转场';
    }
    m = s.match(/^Search (.+)$/i);
    if (m) {
      const name = t(m[1]) || m[1];
      return '搜索' + name;
    }
    m = s.match(/^(.+) categories$/i);
    if (m) {
      const name = t(m[1]) || m[1];
      return name + '分类';
    }
    m = s.match(/^Add (.+) graphic, animated$/i);
    if (m) {
      const name = t(m[1]) || m[1];
      return '添加' + name + '图形（动态）';
    }
    m = s.match(/^Add (.+) graphic$/i);
    if (m) {
      const name = t(m[1]) || m[1];
      return '添加' + name + '图形';
    }
    m = s.match(/^Add (.+) to favorites$/i);
    if (m) {
      const name = t(m[1]) || m[1];
      return '将' + name + '添加到收藏';
    }
    m = s.match(/^Add (.+) to timeline$/i);
    if (m) {
      const name = t(m[1]) || m[1];
      return '将 ' + name + ' 添加到时间轴';
    }
    m = s.match(/^Add (.+) text$/i);
    if (m) {
      const name = t(m[1]) || m[1];
      return '添加 ' + name + ' 文本';
    }
    m = s.match(/^Preview (.+)$/i);
    if (m) {
      const name = t(m[1]) || m[1];
      return '试听 ' + name;
    }
    m = s.match(/^(.+?)\s*·\s*(\d{2}:\d{2})\s*·\s*(\d+)\s*BPM$/i);
    if (m) {
      const mood = t(m[1]) || m[1];
      return mood + ' · ' + m[2] + ' · ' + m[3] + ' BPM';
    }
    return null;
  },
];

