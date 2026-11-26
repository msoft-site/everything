// @name 按模式重命名图层
// @description 使用带编号的模式重命名所选图层（或所有图层），或查找并替换图层名称中的文本。
const doc = await studio.documents.active();
if (!doc) return studio.ui.alert('请先打开一个文档。');

const v = await studio.ui.form('按模式重命名图层', [
  { name: 'scope', label: '图层范围', type: 'select', value: 'selected', options: [['selected', '所选图层'], ['all', '所有图层']] },
  { name: 'mode', label: '重命名方式', type: 'select', value: 'pattern', options: [['pattern', '编号模式'], ['replace', '查找和替换']] },
  { name: 'pattern', label: '命名模式 (# 为序号数字，* 为原图层名)', value: '图层 ##' },
  { name: 'start', label: '起始编号', type: 'number', min: 0, max: 100000, step: 1, value: 1 },
  { name: 'find', label: '查找文本 (查找和替换模式)', value: '' },
  { name: 'replace', label: '替换为', value: '' },
  { name: 'regex', label: '查找文本为正则表达式', type: 'checkbox', value: false },
], { submit: '重命名' });
if (!v) return;

let layers = v.scope === 'selected' ? await doc.selectedLayers() : await doc.layers();
// Bottom-most first, so numbers grow upward as the stack is built.
layers = layers.filter((l) => !l.background).reverse();
if (!layers.length) return studio.ui.alert('没有可供重命名的图层。');

let find = null;
if (v.mode === 'replace') {
  if (!v.find) return studio.ui.alert('请输入要查找的文本。');
  try {
    find = v.regex ? new RegExp(v.find, 'g') : new RegExp(v.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  } catch (error) {
    return studio.ui.alert(`That regular expression is not valid: ${error.message}`);
  }
}
let renamed = 0;
for (const [i, layer] of layers.entries()) {
  const name = find
    ? layer.name.replace(find, v.replace)
    // A run of # becomes the number padded to that many digits.
    : v.pattern.replace(/#+/g, (h) => String(v.start + i).padStart(h.length, '0')).replace(/\*/g, layer.name);
  if (name && name !== layer.name) {
    await layer.rename(name);
    renamed++;
  }
}
await studio.app.message(`Renamed ${renamed} layer${renamed === 1 ? '' : 's'}.`);
