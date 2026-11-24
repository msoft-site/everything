import { locate, paragraphFormat, runFormat } from './model.js';
import { physicalAlignment } from './rtl-paragraph.js';
import { effectiveStyleId } from './styles.js';
import { listKind, levelFor } from './numbering.js';
import { directRun, directParagraph } from './home-editing.js';
import { visibleParagraphBorders } from './paragraph-borders.js';
import { advancedFind } from './advanced-search.js';

/**
 * Reveal Formatting and the Style Inspector: the effective formatting at the selection, grouped as Font,
 * Paragraph and Section, each value marked as direct formatting or coming from styles and defaults.
 * Also the "similar formatting" condition used by Select → Select All Text With Similar Formatting.
 */

const pt = n => `${Math.round(n * 100) / 100} 磅`;
const inches = twips => `${Math.round(twips / 1440 * 100) / 100} 英寸`;
const yes = value => value ? '是' : '否';
const caps = { normal: '无', caps: '全部大写', smallCaps: '小型大写字母' };
const strikes = { none: '无', single: '单删除线', double: '双删除线' };
const lineRules = { auto: '多倍', exact: '固定值', atLeast: '最小值' };

/** The paragraph and run at the start of the selection. */
function anchor(model) {
  const [start, end] = model.range;
  const { index } = locate(model.paragraphs, start);
  return { p: model.paragraphs[index], run: start === end ? model.typingRun() : model.formatAt(start, 'forward') };
}

/**
 * Sections of { title, entries: [{ label, value, direct, target }] }. `target` names the dialog that edits
 * the value ('font', 'paragraph', 'tabs', 'borders', 'numbering', 'page', 'style').
 */
export function revealFormatting(model, { styleName = id => model.styles.definitions[id]?.name || id || '默认' } = {}) {
  const { p, run } = anchor(model);
  const f = runFormat(run), direct = model.stylesEnabled ? directRun(model, run, p) : {};
  const format = paragraphFormat(p, model.numbering, model.pageSettings), directP = model.stylesEnabled ? directParagraph(model, p) : {};
  const runEntry = (label, value, keys, target = 'font') => ({ label, value, direct: keys.some(k => Object.hasOwn(direct, k)), target });
  const paraEntry = (label, value, keys, target = 'paragraph') => ({ label, value, direct: keys.some(k => Object.hasOwn(directP, k)), target });
  const font = [
    runEntry('字体', f.fontAscii || '默认', ['fontAscii', 'fontHAnsi']),
    runEntry('字号', pt(f.fontSize), ['fontSize']),
    runEntry('字形', [f.bold && '加粗', f.italic && '倾斜'].filter(Boolean).join(' ') || '常规', ['bold', 'italic']),
    runEntry('颜色', f.color === 'auto' ? '自动' : `#${f.color}`, ['color']),
    runEntry('下划线', f.underlineStyle === 'none' ? '无' : f.underlineStyle, ['underline', 'underlineStyle', 'underlineColor']),
    runEntry('删除线', strikes[f.strikethrough] || f.strikethrough, ['strikethrough']),
    runEntry('字母大小写', caps[f.capitalization] || f.capitalization, ['capitalization']),
    runEntry('位置', f.verticalAlign === 'baseline' ? (f.baselineShift ? `${f.baselineShift > 0 ? '上升' : '下降'} ${pt(Math.abs(f.baselineShift))}` : '标准') : f.verticalAlign === 'superscript' ? '上标' : '下标', ['verticalAlign', 'baselineShift']),
    runEntry('间距', f.characterSpacing ? `${f.characterSpacing > 0 ? '加宽' : '紧缩'} ${pt(Math.abs(f.characterSpacing))}` : '标准', ['characterSpacing']),
    runEntry('缩放', `${f.textScale}%`, ['textScale']),
    runEntry('字距调整', f.kerning ? `从 ${pt(f.kerning)} 起` : '关闭', ['kerning']),
    runEntry('突出显示', f.highlight === 'none' ? '无' : f.highlight, ['highlight'], 'font'),
    runEntry('隐藏', yes(f.vanish), ['vanish']),
    { label: '字符样式', value: run.styleId ? styleName(run.styleId) : '默认字符', direct: false, target: 'style' },
  ];
  if (f.textOutline || f.textShadow) font.push(runEntry('文本效果', [f.textOutline && '轮廓', f.textShadow && '阴影'].filter(Boolean).join('，'), ['textOutline', 'textShadow'], 'effects'));
  const styleId = effectiveStyleId(p, model.styles);
  const special = format.firstLine > 0 ? `首行缩进 ${inches(format.firstLine)}` : format.firstLine < 0 ? `悬挂缩进 ${inches(-format.firstLine)}` : '无';
  const paragraph = [
    { label: '段落样式', value: styleId ? styleName(styleId) : '默认段落', direct: false, target: 'style' },
    paraEntry('对齐方式', { left: '左对齐', center: '居中', right: '右对齐', both: '两端对齐' }[physicalAlignment(format.alignment, format.bidi)] || format.alignment, ['alignment']),
    paraEntry('大纲级别', format.outlineLevel === 9 ? '正文文本' : `${format.outlineLevel + 1} 级`, ['outlineLevel']),
    paraEntry('缩进', `左 ${inches(format.indentLeft)}，右 ${inches(format.indentRight)}`, ['indentLeft', 'indentRight']),
    paraEntry('特殊缩进', special, ['firstLine']),
    paraEntry('段落间距', `段前 ${pt(format.spaceBefore)}，段后 ${pt(format.spaceAfter)}`, ['spaceBefore', 'spaceAfter']),
    paraEntry('行距', format.lineRule === 'auto' ? (format.lineSpacing === 1 ? '单倍行距' : `多倍行距 ${Math.round(format.lineSpacing * 100) / 100} 行`) : `${lineRules[format.lineRule]} ${pt(format.lineSpacing)}`, ['lineSpacing', 'lineRule']),
    paraEntry('换行和分页', [format.widowControl && '孤行控制', format.keepNext && '与下段同页', format.keepLines && '段中不分页', format.pageBreakBefore && '段前分页'].filter(Boolean).join('，') || '无', ['widowControl', 'keepNext', 'keepLines', 'pageBreakBefore']),
    paraEntry('制表位', format.tabs.length ? format.tabs.map(t => `${inches(t.position)} ${t.alignment}`).join('，') : '默认制表位', ['tabs'], 'tabs'),
    paraEntry('边框', visibleParagraphBorders(format.paragraphBorders) ? '自定义' : '无', ['paragraphBorders'], 'borders'),
    paraEntry('底纹', format.paragraphShading === 'auto' ? '无' : format.paragraphShading === 'foreground' ? '自动' : `#${format.paragraphShading}`, ['paragraphShading'], 'borders'),
  ];
  if (format.mirrorIndents) paragraph.push(paraEntry('对称缩进', '是', ['mirrorIndents']));
  if (format.bidi) paragraph.push(paraEntry('文字方向', '从右向左', ['bidi']));
  if (p.list) {
    let value = '列表';
    try { const level = levelFor(model.numbering, p.list); value = `${listKind(model.numbering, p.list) === 'bullet' ? '项目符号' : '编号'}，级别 ${p.list.level + 1}${level.format === 'bullet' ? ` (${level.text})` : ''}`; } catch { /* keep the generic label */ }
    paragraph.push({ label: '项目符号和编号', value, direct: !!p.list.direct, target: 'numbering' });
  }
  const page = model.sectionPageSettings;
  const section = [
    { label: '纸张', value: `${inches(page.width)} × ${inches(page.height)} (${page.orientation === 'landscape' ? '横向' : '纵向'})`, direct: false, target: 'page' },
    { label: '页边距', value: `上 ${inches(page.top)}，下 ${inches(page.bottom)}，左 ${inches(page.left)}，右 ${inches(page.right)}`, direct: false, target: 'page' },
    { label: '分栏', value: String(page.columns?.count || 1), direct: false, target: 'page' },
  ];
  return [{ title: '字体', entries: font }, { title: '段落', entries: paragraph }, { title: '节', entries: section }];
}

/** The Style Inspector summary: paragraph and character styles plus whether direct formatting is present. */
export function styleInspection(model) {
  const { p, run } = anchor(model);
  const direct = model.stylesEnabled ? directRun(model, run, p) : {}, directP = model.stylesEnabled ? directParagraph(model, p) : {};
  return { paragraphStyle: effectiveStyleId(p, model.styles) || '', characterStyle: run.styleId || '', directParagraph: Object.keys(directP), directText: Object.keys(direct).filter(k => !['boldCs', 'italicCs', 'fontSizeCs'].includes(k)) };
}

const SIMILAR_KEYS = ['fontAscii', 'fontSize', 'bold', 'italic', 'underline', 'strikethrough', 'color', 'highlight', 'capitalization', 'verticalAlign'];

/** The formatting condition "similar formatting" means for the selection: style plus the main font properties. */
export function similarFormatCondition(model) {
  const { p, run } = anchor(model);
  const f = runFormat(run);
  const condition = Object.fromEntries(SIMILAR_KEYS.map(key => [key, key === 'underline' ? f.underlineStyle !== 'none' : f[key]]));
  condition.paragraphStyle = effectiveStyleId(p, model.styles) || '';
  condition.characterStyle = run.styleId || '';
  return condition;
}

/** Every stretch of text with formatting similar to the selection, in document order. */
export function similarFormattingRanges(model) {
  return advancedFind(model.paragraphs, '', { format: similarFormatCondition(model) }, { styles: model.styles, numbering: model.numbering });
}
