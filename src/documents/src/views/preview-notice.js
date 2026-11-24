import { el } from '../ui/dom.js';

const names = {
  'right-to-left section columns or line numbers': '从右到左分栏或行号',
  vanish: '隐藏文字',
  rPrChange: '修订的文字格式更改',
  pPrChange: '修订的段落格式更改',
  ins: '修订的插入内容',
  del: '修订的删除内容',
  oMathPara: '公式段落',
  'page story blocks not yet implemented': '尚不支持的页眉或页脚块',
  mirrorMargins: '对称页边距',
  useAnsiKerningPairs: 'ANSI 字体字距微调兼容性',
  'suppressTopSpacing line-spacing compatibility': '首行间距兼容性',
  'suppressBottomSpacing line-spacing compatibility': '末行间距兼容性',
  'suppressSpacingAtTopOfPage line-spacing compatibility': '页首间距兼容性',
  'right-to-left gutters or vertical page text': '从右到左装订线或竖排页面文字',
  moveFrom: '修订的移动源文字',
  moveTo: '修订的移动目标文字',
  'tables with bidiVisual': '从右到左表格布局',
  'tables with ins': '修订的表格行插入',
  'tables with del': '修订的表格行删除',
  'tables with tcFitText': '适应单元格宽度的文字',
  'tables with cell spacing': '表格单元格间距',
  'paragraph borders with This paragraph border style is not supported yet.': '段落边框样式',
};

export function previewFeatureLabels(issues = []) {
  return [...new Set(issues.filter(issue => typeof issue === 'string' && issue.trim()).map(issue => {
    let text = issue.trim();
    // Some readers wrap another UnsupportedDocumentError. Keep its reason,
    // without repeating the generic read-only explanation inside a list item.
    for (let i = 0; i < 4; i++) {
      const cleaned = text.replace(/This document contains ([\s\S]*?), which this first editor version cannot edit yet\. The original file has not been changed\./g, '$1');
      if (cleaned === text) break;
      text = cleaned;
    }
    if (/^page borders \(/i.test(text) && text.includes('paragraph border style is not supported yet.')) return '页面边框样式';
    return names[text] || text.charAt(0).toUpperCase() + text.slice(1);
  }))];
}

export function previewNotice(pkg) {
  const features = previewFeatureLabels(pkg.previewIssues);
  return [
    el('p', {}, '某些功能仅作近似显示。此文档为只读模式；下载将保留原始文件。'),
    features.length ? el('details.preview-features', {},
      el('summary', {}, `检测到不支持的功能 (${features.length})`),
      el('ul', { tabindex: features.length > 8 ? 0 : null, 'aria-label': '检测到不支持的功能' }, features.map(feature => el('li', {}, feature))),
    ) : el('p', {}, '查看器未能确定导致无法完整预览的具体功能。'),
  ];
}

export function pictureFontNotice(pkg) {
  const fonts = [...new Set(pkg.missingPictureFonts || [])];
  if (fonts.length > 4) return [el('details.preview-features', { 'data-picture-font-warning': '' },
    el('summary', {}, `图片中不可用的字体 (${fonts.length})`),
    el('p', {}, '这些图片中的文字可能显示不同。'),
    el('ul', { tabindex: 0, 'aria-label': '图片中不可用的字体' }, fonts.map(font => el('li', {}, font))),
  )];
  return fonts.length ? [el('p', { 'data-picture-font-warning': '' },
    `图片中不可用的字体：${fonts.join('、')}。这些图片中的文字可能显示不同。`)] : [];
}

export function scriptFontNotice(fonts = []) {
  const unique = [...new Set(fonts)];
  if (!unique.length) return [];
  const help = '可通过字体菜单访问已安装字体或加载字体文件。';
  if (unique.length > 4) return [el('details.preview-features', { 'data-script-font-warning': '' },
    el('summary', {}, `近似上标和下标字体 (${unique.length})`),
    el('p', {}, `缺少准确上标或下标尺寸与位置所需的字体度量数据。${help}`),
    el('ul', { tabindex: 0, 'aria-label': '近似上下标字体' }, unique.map(font => el('li', {}, font))),
  )];
  return [el('p', { 'data-script-font-warning': '' },
    `${unique.join('、')} 的上标或下标尺寸与位置为近似值。${help}`)];
}

/** The pictures an imported Markdown file or web page held, which the import leaves out. */
/** A Markdown file whose formatting took too long to read opened as its lines of text (markdownHtmlOffThread). */
export function plainMarkdownNotice(plain) {
  return plain ? [el('p', { 'data-plain-markdown': '' }, '此 Markdown 文件读取时间过长，已作为纯文本打开：标题、列表和着重号按原样显示。')] : [];
}

export function omittedPictureNotice(count = 0) {
  if (!count) return [];
  return [el('p', { 'data-omitted-pictures': '' },
    `此文件中的 ${count} 张图片未导入：Markdown 和网页中的图片不会自动导入。您可以通过“插入”>“图片”进行添加。`)];
}
