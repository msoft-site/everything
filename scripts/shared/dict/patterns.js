const EXTRA_PATTERNS = [
  // "Arc Tool, in toolbar" -> "弧形工具，位于工具栏"
  (s, t) => { const m = s.match(/^(.+), in toolbar$/); if (!m) return null; const b = t(m[1]) || (t(m[1] + ' Tool')); return b ? b + '，位于工具栏' : null; },
  // "Foo Tool" -> "Foo工具"
  (s, t) => { const m = s.match(/^(.+) Tool$/); if (!m) return null; const b = t(m[1]); return b ? b + '工具' : null; },
  (s) => { const m = s.match(/^Welcome back, (.+)$/); return m ? '欢迎回来，' + m[1] : null; },
  (s) => { const m = s.match(/^(\d+(?:\.\d+)?) x (\d+(?:\.\d+)?) (px|in|mm|pt|cm)$/); if (!m) return null; return m[1] + ' × ' + m[2] + ' ' + ({px:'像素',in:'英寸',mm:'毫米',pt:'点',cm:'厘米'})[m[3]]; },
  (s, t) => { const m = s.match(/^(.+?) (\d+(?:\.\d+)?) x (\d+(?:\.\d+)?) (px|in|mm|pt|cm)$/); if (!m) return null; const b = t(m[1]); return b ? b + '，' + m[2] + ' × ' + m[3] + ' ' + ({px:'像素',in:'英寸',mm:'毫米',pt:'点',cm:'厘米'})[m[4]] : null; },
];
