import { isVectorGradient } from "../model/vector-gradient";
import { solidRgb } from "../model/vector-stroke";
import { strokeDashPixels } from "../model/vector-stroke";
import { hasMask, drawMask } from "../model/masks";
import {
  allLayers,
  blends,
  blendLabel,
  type Layer,
  type PhotoDocument,
} from "../model/document";
import { Assets, escapeXML } from "../model/assets";
import { icon, button } from "./shell";
import { cachedSourceThumbnail } from "./thumbnails";
import { vectorColorHex } from "../color/vector";
import { supportedStrokePaths } from "../model/vector-stroke";
import { applyPixelMask, rawPixelMaskCoverage } from '../model/pixel-mask';
import { worldPoint } from '../model/transform';
export const number = (
  key: string,
  label: string,
  value: number,
  min?: number,
  max?: number,
) =>
  `<label class="number-field"><span>${label}</span><input data-property="${key}" type="number" aria-label="${label}" value="${key.startsWith("stroke") || key.startsWith('mask') || key.startsWith('pattern') || key.startsWith('gradient') ? value : Math.round(value * 100) / 100}" ${key.startsWith("stroke") || key.startsWith('mask') || key.startsWith('pattern') || key.startsWith('gradient') ? 'step="any"' : ""} ${min !== undefined ? `min="${min}"` : ""} ${max !== undefined ? `max="${max}"` : ""}></label>`;
function sourceImage(l: Layer, assets: Assets, doc?: PhotoDocument) {
  const url = cachedSourceThumbnail(l, assets, doc);
  return `<img ${url ? `src="${escapeXML(url)}"` : `data-source-thumbnail="${escapeXML(l.id)}"`} alt="" loading="lazy" draggable="false">`;
}
export function gradientProperties(l: Layer, doc: PhotoDocument) {
  const fill = l.vector!.fill;
  if (!isVectorGradient(fill)) return "";
  return `<h3>渐变填充</h3><label class="number-field"><span>样式</span><select data-property="gradientStyle" aria-label="渐变样式">${[["linear", "线性"], ["radial", "径向"], ["angle", "角度"], ["reflected", "对称"], ["diamond", "菱形"]].map(([style, name]) => `<option value="${style}" ${(fill.style ?? "linear") === style ? "selected" : ""}>${name}</option>`).join("")}</select></label>
    ${number("gradientAngle", "渐变角度 (°)", fill.angle ?? 0)}${number("gradientScale", "渐变缩放 (%)", fill.scalePercent ?? 100, 0)}${number("gradientSmoothness", "渐变平滑度 (%)", ((fill.interpolationSamples ?? 4096) / 4096) * 100, 0, 100)}
    ${number("gradientOffsetX", "渐变偏移 X (%)", fill.offsetPercent?.x ?? 0)}${number("gradientOffsetY", "渐变偏移 Y (%)", fill.offsetPercent?.y ?? 0)}
    <label class="lock-label"><input type="checkbox" data-property="gradientReverse" ${fill.reverse ? "checked" : ""}> 反向渐变</label><label class="lock-label"><input type="checkbox" data-property="gradientAligned" ${fill.align === false ? "" : "checked"}> 与图层对齐</label>
    <h3>色标</h3>${fill.colorStops.map((stop, i) => `<label class="color-row">色标 ${i + 1}<input type="color" aria-label="色标 ${i + 1}" data-property="gradientColor${i}Color" value="${vectorColorHex({ rgb: solidRgb({ type: "color", color: stop.color })!, space: "document" }, doc)}"></label>${number("gradientColor" + i + "Location", "色标 " + (i + 1) + " 位置 (%)", stop.location * 100, 0, 100)}${number("gradientColor" + i + "Midpoint", "色标 " + (i + 1) + " 中点 (%)", (stop.midpoint ?? 0.5) * 100, 0, 100)}<button class="wide" data-action="gradient-remove-color-${i}" ${fill.colorStops.length <= 1 ? "disabled" : ""}>删除色标 ${i + 1}</button>`).join("")}
    <button class="wide" data-action="gradient-add-color" ${fill.colorStops.length >= 256 ? "disabled" : ""}>添加色标</button>
    <h3>不透明度色标</h3>${fill.opacityStops.map((stop, i) => `${number("gradientOpacity" + i + "OpacityPercent", "不透明度色标 " + (i + 1) + " 不透明度 (%)", stop.opacityPercent, 0, 100)}${number("gradientOpacity" + i + "Location", "不透明度色标 " + (i + 1) + " 位置 (%)", stop.location * 100, 0, 100)}${number("gradientOpacity" + i + "Midpoint", "不透明度色标 " + (i + 1) + " 中点 (%)", (stop.midpoint ?? 0.5) * 100, 0, 100)}<button class="wide" data-action="gradient-remove-opacity-${i}">删除不透明度色标 ${i + 1}</button>`).join("")}
    <button class="wide" data-action="gradient-add-opacity" ${fill.opacityStops.length >= 256 ? "disabled" : ""}>添加不透明度色标</button>`;
}
export function strokeProperties(l: Layer, doc: PhotoDocument) {
  const s = l.vector!.stroke;
  const open = l.vector!.mask.paths.some((p) => p.open),
    available = supportedStrokePaths(l.vector!.mask, {
      enabled: true,
      alignment: s?.alignment ?? (open ? "center" : "inside"),
      lineDashSet: s?.lineDashSet,
    });
  if (!s && !available) return "";
  const select = (
    key: string,
    label: string,
    options: [string, string][],
    value: string,
  ) =>
    `<label class="number-field"><span>${label}</span><select data-property="${key}" aria-label="${label}">${options.map(([v, name]) => `<option value="${v}" ${v === value ? "selected" : ""}>${name}</option>`).join("")}</select></label>`;
  return `<h3>描边</h3><label class="lock-label"><input type="checkbox" data-property="strokeEnabled" ${s?.enabled ? "checked" : ""} ${available ? "" : 'disabled title="描边不可用于这些路径操作"'}> 显示描边</label>${
    s
      ? `<label class="lock-label"><input type="checkbox" data-property="fillEnabled" ${s.fillEnabled ? "checked" : ""}> 显示填充</label><label class="color-row">描边颜色 <input type="color" aria-label="描边颜色" data-property="strokeColor" value="${vectorColorHex(s.color, doc)}"></label>${number("strokeWidth", "描边粗细 (" + s.lineWidth.units.toLowerCase() + ")", s.lineWidth.value, 0)}${number("strokeOpacity", "描边不透明度 (%)", s.opacity * 100, 0, 100)}${!l.vector!.mask.paths.some((p) => p.open) ? select("strokeAlignment", "描边对齐", [["inside", "内部"], ["center", "居中"], ["outside", "外部"]], s.alignment) : ""}${select("strokeCap", "端点", [["butt", "平头"], ["round", "圆头"], ["square", "方头"]], s.cap)}${select("strokeJoin", "连接", [["miter", "斜接"], ["round", "圆角"], ["bevel", "斜角"]], s.join)}${number("strokeMiter", "斜接限制", s.miterLimit, 1)}<label class="number-field"><span>虚线与间隙长度 (像素)</span><input type="text" aria-label="虚线与间隙长度 (像素)" data-property="strokeDashes" value="${strokeDashPixels(s).join(", ")}" placeholder="实线"></label>${number("strokeDashOffset", "虚线偏移 (" + (s.lineDashOffset.units === "None" ? "像素" : s.lineDashOffset.units.toLowerCase()) + ")", s.lineDashOffset.value)}`
      : ""
  }`;
}
export function layerOptions(l?: Layer, locked = l?.locked ?? false) {
  return `<label class="blend-control"><span class="sr-only">混合模式</span><select id="blend" ${!l || locked ? "disabled" : ""}>${blends.map((b) => `<option value="${b}" ${l?.blend === b ? "selected" : ""}>${blendLabel(b)}</option>`).join("")}</select></label><label class="opacity-control">不透明度 <input id="opacity" type="number" min="0" max="100" value="${Math.round((l?.opacity ?? 1) * 100)}" ${!l || locked ? "disabled" : ""}>%</label>`;
}
export function layerList(
  layers: Layer[],
  selected: ReadonlySet<string>,
  assets?: Assets,
  collapsed: ReadonlySet<string> = new Set(),
  depth = 0,
  maskTarget = '',
  doc?: PhotoDocument,
): string {
  return [...layers]
    .reverse()
    .map(
      (l) =>
        `<div class="layer-row ${selected.has(l.id) ? "selected" : ""}" data-row="${escapeXML(l.id)}" draggable="true" role="listitem" style="--depth:${depth}"><button data-visibility="${escapeXML(l.id)}" title="${l.visible ? "隐藏" : "显示"}图层" aria-label="${l.visible ? "隐藏" : "显示"} ${escapeXML(l.name)}">${icon(l.visible ? "eye" : "eye-off")}</button>${l.kind === "group" ? `<button class="group-disclosure" data-collapse="${escapeXML(l.id)}" aria-label="${collapsed.has(l.id) ? "展开" : "折叠"} ${escapeXML(l.name)}" aria-expanded="${!collapsed.has(l.id)}">${icon("chevron-right")}</button>` : '<span class="disclosure-spacer"></span>'}<button class="layer-select" data-layer="${escapeXML(l.id)}" aria-pressed="${selected.has(l.id)}"><span class="layer-thumbnail ${l.kind}" ${l.kind === "solid" ? `style="background:${l.color}"` : ""}>${l.asset && assets ? sourceImage(l, assets, doc) : l.kind === "solid" ? "" : icon(l.kind === "group" ? "folder" : l.kind === "text" ? "type" : l.kind === "paint" ? "paintbrush" : l.kind === "vector" ? "pen-tool" : "image")}</span><span>${escapeXML(l.name)}<small>${l.kind === "group" ? `${allLayers(l.children).length} 个图层` : l.kind}${hasMask(l) ? " · 带蒙版" : ""}</small></span>${l.locked || l.transparencyProtected || Object.values(l.protection ?? {}).some(Boolean) ? `<span title="${l.locked ? "图层已锁定" : "图层部分锁定"}" aria-label="${l.locked ? "图层已锁定" : "图层部分锁定"}">${icon("lock-keyhole")}</span>` : ""}</button>${hasMask(l) ? `<button class="mask-thumbnail ${l.maskDisabled ? "disabled-mask" : ""}" data-mask="${escapeXML(l.id)}" aria-label="编辑 ${escapeXML(l.name)} 的蒙版" aria-pressed="${maskTarget === l.id}" title="编辑图层蒙版"><img src="${maskThumbnail(l, assets, doc)}" alt="" draggable="false"></button>` : ""}</div>${collapsed.has(l.id) ? "" : layerList(l.children, selected, assets, collapsed, depth + 1, maskTarget, doc)}`,
    )
    .join('');
}
export function emptyLayers() {
  return `<div class="empty-layers">${icon('layers-2')}<p>图层将显示在此处</p><button data-action="import">添加图像</button></div>`;
}
export function undoButtons(canUndo: boolean, canRedo: boolean) {
  return (
    button("undo", "撤销", "undo-2", canUndo ? "" : "disabled") +
    button("redo", "重做", "redo-2", canRedo ? "" : "disabled")
  );
}

export function historyPanel(labels: string[], canRedo: boolean) {
  const rows = ["打开文档", ...labels];
  return `<div class="history-entries">${rows.map((label, i) => `<div class="history-row ${i === rows.length - 1 ? "current" : ""}">${icon(i ? "history" : "image")}<span>${escapeXML(label)}</span></div>`).join("")}</div><div class="history-controls">${undoButtons(labels.length > 0, canRedo)}</div><p class="history-note">使用“撤销”与“重做”单步查看历史编辑。</p>`;
}

const thumbnails = new WeakMap<Layer, string>();
function maskThumbnail(l: Layer, assets?: Assets, doc?: PhotoDocument) {
  const old = thumbnails.get(l);
  if (old) return old;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const c = canvas.getContext('2d')!;
  const w = l.kind === 'group' && doc ? doc.width : l.sourceWidth;
  const h = l.kind === 'group' && doc ? doc.height : l.sourceHeight;
  c.scale(32 / w, 32 / h);
  if (l.pixelMask) {
    const plain = { ...l, maskDisabled: false, maskInverted: false,
      ...(l.kind === 'group' ? { transform: { x: 0,y: 0,width: w,height: h,rotation: 0 } } : {}) };
    const render = (base: number) => {
      c.clearRect(0,0,w,h);
      drawMask(c,plain,w,h,undefined,base);
      return c.getImageData(0,0,32,32);
    };
    const black = render(0), white = render(1);
    const samples = l.pixelMask.asset && assets ? assets.coverage(l.pixelMask.asset) : undefined;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const at = (y*32+x)*4, point = worldPoint(plain.transform,(x+.5)/32,(y+.5)/32);
      const raw = rawPixelMaskCoverage(l,samples,...point);
      const basis = raw*(white.data[at+3]-black.data[at+3])/255+black.data[at+3]/255;
      const value = applyPixelMask({...l,maskDisabled:false},basis);
      black.data[at] = black.data[at+1] = black.data[at+2] = Math.round(value*255);
      black.data[at+3] = 255;
    }
    c.resetTransform(); c.putImageData(black,0,0);
    const url = canvas.toDataURL(); thumbnails.set(l,url); return url;
  }
  drawMask(
    c,
    l.kind === 'group' ? { ...l, transform: { x: 0, y: 0, width: w, height: h, rotation: 0 } } : l,
    w,
    h,
    l.maskAsset && assets ? assets.get(l.maskAsset) : undefined,
  );
  c.globalCompositeOperation = 'destination-over';
  c.fillStyle = '#000';
  c.fillRect(0, 0, w, h);
  const url = canvas.toDataURL();
  thumbnails.set(l, url);
  return url;
}
