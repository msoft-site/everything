/**
 * The name a word processor shows for a style. DOCX files store many built-in style names in lowercase
 * ("heading 1", "footnote text") and shows them capitalized, and shows some under newer names
 * ("annotation text" as Comment Text). Custom names, and any name with a capital, show as written.
 */
const RENAMED = {
  'annotation text': '批注文字',
  'annotation reference': '批注引用',
  'annotation subject': '批注主题',
  'table of figures': '图表目录',
  'table of authorities': '引文目录',
  'toa heading': '引文目录标题',
  'html preformatted': 'HTML 预设格式',
  'html code': 'HTML 代码',
  'html address': 'HTML 地址',
  'no list': '无列表',
  'normal (web)': '普通(网页)',
};

const CHINESE_STYLES = {
  'normal': '正文',
  'heading 1': '标题 1',
  'heading 2': '标题 2',
  'heading 3': '标题 3',
  'heading 4': '标题 4',
  'heading 5': '标题 5',
  'heading 6': '标题 6',
  'heading 7': '标题 7',
  'heading 8': '标题 8',
  'heading 9': '标题 9',
  'title': '标题',
  'subtitle': '副标题',
  'subtle emphasis': '微弱强调',
  'emphasis': '强调',
  'intense emphasis': '明显强调',
  'strong': '加粗',
  'quote': '引用',
  'intense quote': '明显引用',
  'subtle reference': '微弱参考',
  'intense reference': '明显参考',
  'book title': '书籍标题',
  'list paragraph': '列表段落',
  'body text': '正文文本',
  'body text 2': '正文文本 2',
  'body text 3': '正文文本 3',
  'body text indent': '正文首行缩进',
  'header': '页眉',
  'footer': '页脚',
  'page number': '页码',
  'footnote text': '脚注文本',
  'endnote text': '尾注文本',
  'footnote reference': '脚注引用',
  'endnote reference': '尾注引用',
  'caption': '题注',
  'table of figures': '图表目录',
  'table of authorities': '引文目录',
  'toa heading': '引文目录标题',
  'index 1': '索引 1',
  'index 2': '索引 2',
  'index 3': '索引 3',
  'index heading': '索引标题',
  'annotation text': '批注文字',
  'annotation reference': '批注引用',
  'annotation subject': '批注主题',
  'no list': '无列表',
  'normal (web)': '普通(网页)',
  'table normal': '普通表格',
  'table grid': '网格型',
};

export function styleDisplayName(name) {
  const value = String(name ?? '').trim();
  if (!value) return '';
  const lower = value.toLowerCase();
  if (Object.hasOwn(CHINESE_STYLES, lower)) return CHINESE_STYLES[lower];
  if (Object.hasOwn(RENAMED, lower)) return RENAMED[lower];
  const toc = /^toc (\d)$/i.exec(lower);
  if (toc) return `目录 ${toc[1]}`;
  if (value !== lower) return value;
  return value.replace(/(^|[\s(])(\p{L})/gu, (_, gap, letter) => gap + letter.toLocaleUpperCase());
}
