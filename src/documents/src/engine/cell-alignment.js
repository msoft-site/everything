export const CELL_ALIGNMENTS = Object.freeze({ top: '顶端对齐', center: '居中对齐', bottom: '底端对齐' });

export function checkedCellAlignment(value) {
  if (typeof value !== 'string' || !Object.hasOwn(CELL_ALIGNMENTS, value)) throw new Error('单元格对齐方式请选择顶端对齐、居中对齐或底端对齐。');
  return value;
}
