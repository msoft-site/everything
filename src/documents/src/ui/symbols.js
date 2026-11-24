/**
 * Special characters: a picker of the symbols people reach for most in prose
 * (dashes, quotes, currency, math, arrows, Greek, accented letters). Picking
 * one calls back with the character; the caller inserts it at the caret.
 */

import { el } from './dom.js';
import { openModal } from './modal.js';
import { keyboardGrids } from './gridkeys.js';

export const SYMBOL_GROUPS = [
  ['标点符号', ['—', '–', '…', '‘', '’', '“', '”', '«', '»', '•', '·', '§', '¶', '†', '‡', '′', '″', '¡', '¿']],
  ['货币与标记', ['€', '£', '¥', '¢', '₹', '©', '®', '™', '°', '№', '‰']],
  ['数学符号', ['±', '×', '÷', '≠', '≈', '≤', '≥', '∞', '√', '∑', '∆', 'π', 'µ', '½', '⅓', '¼', '¾', '¹', '²', '³']],
  ['箭头', ['←', '→', '↑', '↓', '↔', '⇐', '⇒', '⇔', '↵']],
  ['希腊字母', ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'σ', 'φ', 'ψ', 'ω', 'Δ', 'Σ', 'Ω']],
  ['拉丁字母', ['à', 'á', 'â', 'ä', 'ã', 'å', 'ç', 'é', 'è', 'ê', 'ë', 'í', 'î', 'ï', 'ñ', 'ó', 'ô', 'ö', 'õ', 'ú', 'û', 'ü', 'ß', 'æ', 'ø', 'œ']],
];

/** Human-readable names for screen readers on the most cryptic glyphs. */
const NAMES = {
  '—': '长破折号', '–': '短破折号', '…': '省略号', '‘': '左单引号', '’': '右单引号',
  '“': '左双引号', '”': '右双引号', '«': '左双尖括号', '»': '右双尖括号',
  '•': '项目符号', '·': '间隔号', '§': '节号', '¶': '段落标记', '†': '短剑号', '‡': '双短剑号',
  '′': '角分符号', '″': '角秒符号', '¡': '倒感叹号', '¿': '倒问号',
  '€': '欧元', '£': '英镑', '¥': '日元/人民币', '¢': '分', '₹': '卢比', '©': '版权所有', '®': '注册商标',
  '™': '商标', '°': '度', '№': '编号', '‰': '千分比', '±': '正负号', '×': '乘号',
  '÷': '除号', '≠': '不等于', '≈': '约等于', '≤': '小于等于', '≥': '大于等于',
  '∞': '无穷大', '√': '平方根', '∑': '求和', '∆': '增量', 'π': '圆周率', 'µ': '微', '½': '二分之一',
  '⅓': '三分之一', '¼': '四分之一', '¾': '四分之三', '¹': '上标 1', '²': '上标 2',
  '³': '上标 3', '←': '向左箭头', '→': '向右箭头', '↑': '向上箭头', '↓': '向下箭头',
  '↔': '左右箭头', '⇐': '向左双箭头', '⇒': '向右双箭头', '⇔': '左右双箭头', '↵': '回车',
};

export function symbolName(ch) {
  return NAMES[ch] || ch;
}

/** openSymbolPicker({ onPick }) -> { close } */
export function openSymbolPicker({ onPick }) {
  let modal = null;
  const content = el('div.symbols', { role: 'group', 'aria-label': '特殊字符' },
    SYMBOL_GROUPS.map(([title, chars]) => el('section.symbol-group', {},
      el('h3', {}, title),
      el('div.symbol-grid', { role: 'group', 'aria-label': title },
        chars.map((ch) => el('button.symbol', {
          type: 'button', title: symbolName(ch), 'aria-label': symbolName(ch),
          onclick: () => { modal?.close(); onPick(ch); },
        }, ch))))));
  keyboardGrids(content);
  modal = openModal({ title: '特殊字符', content, wide: true });
  return modal;
}
