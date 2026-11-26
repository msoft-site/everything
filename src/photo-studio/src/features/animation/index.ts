// Frame animation: the Timeline panel under the canvas, frame commands,
// playback, onion skins, tweening, animated exports (GIF, PNG, WebP), video
// rendering and importing video frames as layers.
import type { Editor } from '../../editor';
import { commands, contributeMenu, registerCommand, registerOverlay, registerPanel, type Command, type MenuItem } from '../../app/registry';
import { recordsSettings, settingsDialog } from '../action-settings';
import { allLayers } from '../../model/document';
import { newPixelLayer } from '../../model/pixel-layer';
import { gridFromImage, type TileGrid } from '../../model/tiles';
import {
  adoptFrameLayers,
  createAnimation,
  defaultOnion,
  deleteFrames,
  delayLabel,
  duplicateFrames,
  frameDocument,
  framesFromLayers,
  loopLabel,
  matchLayersAcrossFrames,
  maxDelay,
  onionBlends,
  reverseFrames,
  setFrameDelay,
  syncAnimation,
  tweenFrames,
  type AnimationUnify,
} from '../../model/animation';
import { animationOf, hasAnimation, selectFrame, selectedFrames, setSelectedFrames } from './state';
import { isPlaying, onPlaybackChange, playbackUpdate, stop, togglePlay } from './playback';
import { compositeFrame, frameImage } from './render';
import { timelinePanel } from './panel';
import { lazy, lazyRun } from '../../app/lazy';
import { installVideo, videoCommands, videoFrames, videoPlaybackModule, videoTimelineMenu } from './video';
import { hasTimeline, isVideoPlaying, timelineOf } from './video-state';

// Exporters and the video importer load on first use.
const exporting = lazy(() => import('./export'));
const videoImport = lazy(() => import('./video-import'));

export const delayPresets = [0, 100, 200, 500, 1000, 2000, 5000, 10000];

const docOpen = (e: Editor) => e.hasDocument;
const frameCount = (e: Editor) => animationOf(e)?.frames.length ?? 0;

/** Open the Timeline panel. */
export function showTimeline(e: Editor) {
  if (!e.dock.isVisible('timeline')) e.dock.show('timeline');
}

function ensureAnimation(e: Editor) {
  if (!hasAnimation(e)) e.command('Create Frame Animation', (d) => (d.animation = createAnimation(d)));
}

async function tweenDialog(e: Editor, arg?: unknown) {
  const anim = animationOf(e)!;
  const sel = selectedFrames(e);
  const pair = sel.length === 2 && sel[1] === sel[0] + 1;
  const options: [string, string][] = [];
  if (pair) options.push(['selection', '所选帧']);
  else {
    if (anim.current > 0) options.push(['previous', '上一帧']);
    if (anim.current < anim.frames.length - 1) options.push(['next', '下一帧']);
  }
  if (!options.length) {
    e.message('请选择相邻的一帧或两帧进行过渡。');
    return;
  }
  const v = await settingsDialog(
    e,
    'animation.tween',
    arg,
    '过渡',
    [
      { name: 'with', label: '过渡方式', type: 'select', value: options[0][0], options },
      { name: 'count', label: '要添加的帧数', type: 'number', value: 5, min: 1, max: 200, step: 1 },
      { name: 'layers', label: '图层', type: 'select', value: 'all', options: [['all', '所有图层'], ['selected', '所选图层']] },
      { name: 'position', label: '位置', type: 'checkbox', value: 'yes' },
      { name: 'opacity', label: '不透明度', type: 'checkbox', value: 'yes' },
      { name: 'effects', label: '效果', type: 'checkbox', value: 'yes' },
    ],
    '过渡',
    '新帧将在两个帧之间对图层进行插值过渡。',
  );
  if (!v) return;
  const count = Math.max(1, Math.min(200, Math.round(Number(v.count) || 1)));
  const from = v.with === 'selection' ? sel[0] : v.with === 'previous' ? anim.current - 1 : anim.current;
  const ids = new Set<string>();
  if (v.layers === 'selected') for (const l of allLayers(e.selectedLayers)) ids.add(l.id);
  e.command('过渡', (d) => {
    if (!tweenFrames(d, from, count, { position: v.position === 'yes', opacity: v.opacity === 'yes', effects: v.effects === 'yes', layers: v.layers === 'selected' ? ids : undefined }))
      throw new Error('帧数过多。');
  });
  setSelectedFrames(e, Array.from({ length: count + 2 }, (_, k) => from + k));
  e.update();
}

async function onionSettings(e: Editor, arg?: unknown) {
  const o = animationOf(e)!.onion ?? defaultOnion;
  const blendLabels: Record<string, string> = { multiply: '正片叠底', normal: '正常', darken: '变暗', lighten: '变亮', difference: '差值' };
  const v = await settingsDialog(
    e,
    'animation.onion-settings',
    arg,
    '洋葱皮',
    [
      // Shows the current state; checked before onion skins were ever set up.
      { name: 'enabled', label: '显示洋葱皮', type: 'checkbox', value: animationOf(e)!.onion?.enabled === false ? 'no' : 'yes' },
      { name: 'before', label: '前面的帧数', type: 'number', value: o.before, min: 0, max: 8, step: 1 },
      { name: 'after', label: '后面的帧数', type: 'number', value: o.after, min: 0, max: 8, step: 1 },
      { name: 'opacity', label: '不透明度 (%)', type: 'number', value: Math.round(o.opacity * 100), min: 5, max: 100, step: 1 },
      { name: 'blend', label: '混合模式', type: 'select', value: o.blend ?? 'multiply', options: onionBlends.map((b) => [b, blendLabels[b] || b]) },
    ],
    '确定',
    '打开时间轴时，相邻帧将以半透明方式叠加在画布上。',
  );
  if (!v) return;
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : lo)));
  e.command('洋葱皮设置', (d) => {
    const blend = onionBlends.find((b) => b === v.blend) ?? 'multiply';
    d.animation!.onion = { enabled: v.enabled === 'yes', before: clamp(Number(v.before), 0, 8), after: clamp(Number(v.after), 0, 8), opacity: clamp(Number(v.opacity), 5, 100) / 100, ...(blend === 'multiply' ? {} : { blend }) };
  });
}

async function flattenFrames(e: Editor) {
  const doc = e.doc;
  const anim = doc.animation!;
  const assets = e.assets;
  // Each frame becomes tiles as soon as it is rendered, so only one frame's
  // image is held at a time; the tiles are kept until the layers join the
  // document.
  const grids: TileGrid[] = [];
  const release = assets.tiles.hold(() => grids.flatMap((g) => Object.values(g.tiles)));
  try {
    for (let i = 0; i < anim.frames.length; i++) {
      e.message(`正在渲染第 ${i + 1} 帧（共 ${anim.frames.length} 帧）…`);
      const img = await compositeFrame(e, frameDocument(doc, i), assets);
      grids.push(gridFromImage(assets.tiles, { width: img.width, height: img.height, data: img.data }));
    }
  } finally {
    release();
  }
  const layers = grids.map((grid, i) => newPixelLayer(`第 ${i + 1} 帧`, doc, grid));
  e.command('将帧拼合为图层', (d) => {
    d.layers.push(...layers);
    adoptFrameLayers(d, d.layers.slice(-layers.length));
  });
  e.selected = layers[anim.current]?.id ?? e.selected;
  e.update();
  e.message(`已将 ${layers.length} 帧拼合为图层。`);
}

async function customDelay(e: Editor, arg?: unknown) {
  const anim = animationOf(e)!;
  const v = await settingsDialog(e, 'animation.delay-custom', arg, '帧延迟', [{ name: 'seconds', label: '延迟时间（秒）', type: 'number', value: anim.frames[anim.current].delay / 1000, min: 0, max: maxDelay / 1000, step: 0.01 }], '确定');
  if (!v) return;
  const ms = Number(v.seconds) * 1000;
  if (!Number.isFinite(ms)) return;
  const frames = selectedFrames(e);
  e.command('帧延迟', (d) => setFrameDelay(d, frames, ms));
}

async function customLoop(e: Editor, arg?: unknown) {
  const anim = animationOf(e)!;
  const v = await settingsDialog(e, 'animation.loop-custom', arg, '循环', [{ name: 'plays', label: '播放动画次数', type: 'number', value: anim.loop || 1, min: 1, max: 65535, step: 1 }], '确定');
  if (!v) return;
  const n = Math.max(1, Math.min(65535, Math.round(Number(v.plays) || 1)));
  e.command('循环', (d) => (d.animation!.loop = n));
}

function unifyCommand(key: keyof AnimationUnify, label: string): Command {
  return {
    id: `animation.unify-${key}`,
    label,
    menu: 'animation.unify',
    enabled: hasAnimation,
    checked: (e) => !!animationOf(e)?.unify?.[key],
    run: (e) =>
      e.command(label, (d) => {
        const u = { ...d.animation!.unify };
        if (u[key]) delete u[key];
        else u[key] = true;
        if (Object.keys(u).length) d.animation!.unify = u;
        else delete d.animation!.unify;
      }),
  };
}

/** Menu of the Timeline panel (frame animation or video timeline). */
export function timelineMenu(e?: Editor): MenuItem[] {
  if (e && hasTimeline(e)) return videoTimelineMenu();
  return [
    'animation.new-frame', 'animation.delete-frames', 'animation.delete', '-',
    'animation.select-all', 'animation.play', '-',
    'animation.tween', 'animation.reverse', '-',
    { label: '帧延迟', id: 'animation.delay', items: [] },
    { label: '循环', id: 'animation.loop', items: [] },
    '-',
    'animation.frames-from-layers', 'animation.flatten-frames', 'animation.match-layers',
    { label: '编辑应用于所有帧', id: 'animation.unify', items: [] },
    '-', 'animation.onion', 'animation.onion-settings', '-',
    'animation.create', 'timeline.create', 'timeline.convert-to-video', '-',
    'file.export-animation', 'file.render-video', 'file.import-video-frames',
  ];
}

export function installAnimation(e: Editor) {
  e.documentHooks.push((doc, before) => syncAnimation(doc, before));
  e.onUpdate(playbackUpdate);
  // Onion skins hide while playing.
  onPlaybackChange(() => e.overlay());
  installVideo(e);
  // Dialog commands record the settings they were confirmed with.
  for (const id of ['animation.tween', 'animation.onion-settings', 'animation.delay-custom', 'animation.loop-custom', 'timeline.settings', 'timeline.convert-to-frames', 'timeline.transitions', 'layer.video-interpret']) recordsSettings(id);
  const animated = hasAnimation;
  const many = (e: Editor) => frameCount(e) > 1;
  // Playback, stepping and onion skins also drive the video timeline.
  const timed = (e: Editor) => animated(e) || hasTimeline(e);
  const step = (how: 'first' | 'previous' | 'next' | 'last', frames: (e: Editor) => void) => async (e: Editor) => {
    if (hasTimeline(e)) await (await videoCommands()).step(e, how);
    else frames(e);
  };
  registerCommand(
    {
      id: 'animation.create',
      label: '创建帧动画',
      enabled: (e) => docOpen(e) && !hasAnimation(e) && !hasTimeline(e),
      description: '从当前文档状态开始创建帧动画',
      run: (e) => {
        ensureAnimation(e);
        showTimeline(e);
      },
    },
    {
      id: 'animation.new-frame',
      label: '新建帧',
      enabled: (e) => docOpen(e) && !hasTimeline(e),
      description: '复制所选帧',
      run: (e) => {
        ensureAnimation(e);
        const frames = selectedFrames(e);
        e.command('新建帧', (d) => duplicateFrames(d, frames));
        const cur = animationOf(e)!.current;
        setSelectedFrames(e, Array.from({ length: frames.length }, (_, k) => cur + k), cur);
        showTimeline(e);
        e.update();
      },
    },
    {
      id: 'animation.delete-frames',
      label: '删除帧',
      enabled: many,
      run: (e) => {
        const frames = selectedFrames(e);
        if (frames.length >= frameCount(e)) {
          e.message('动画至少需要保留一帧；如需移除请使用“删除动画”。');
          return;
        }
        stop(e, false);
        e.command(frames.length > 1 ? '删除多个帧' : '删除帧', (d) => deleteFrames(d, frames));
        setSelectedFrames(e, [animationOf(e)!.current]);
        e.update();
      },
    },
    {
      id: 'animation.delete',
      label: '删除动画',
      enabled: animated,
      description: '删除所有帧；图层将保留当前帧的状态',
      run: (e) => {
        stop(e, false);
        e.command('删除动画', (d) => delete d.animation);
      },
    },
    {
      id: 'animation.select-all',
      label: '选择全部帧',
      enabled: many,
      recordable: false,
      run: (e) => {
        setSelectedFrames(e, animationOf(e)!.frames.map((_, i) => i));
        e.update();
      },
    },
    {
      id: 'animation.select-frame',
      label: '选择帧',
      hidden: true,
      enabled: animated,
      run: (e, arg) => selectFrame(e, Math.round(Number(arg)) - 1),
    },
    { id: 'animation.first', label: '第一帧', enabled: timed, recordable: false, run: step('first', (e) => selectFrame(e, 0)) },
    { id: 'animation.previous', label: '上一帧', enabled: timed, recordable: false, run: step('previous', (e) => selectFrame(e, Math.max(0, animationOf(e)!.current - 1))) },
    {
      id: 'animation.next',
      label: '下一帧',
      enabled: timed,
      recordable: false,
      run: step('next', (e) => selectFrame(e, Math.min(frameCount(e) - 1, animationOf(e)!.current + 1))),
    },
    { id: 'animation.last', label: '最后一帧', enabled: timed, recordable: false, run: step('last', (e) => selectFrame(e, frameCount(e) - 1)) },
    {
      id: 'animation.play',
      label: '播放动画',
      enabled: (e) => many(e) || (hasTimeline(e) && timelineOf(e)!.duration > 1),
      checked: (e) => isPlaying(e) || isVideoPlaying(e),
      recordable: false,
      run: async (e) => {
        if (hasTimeline(e)) (await videoPlaybackModule()).toggleVideo(e);
        else togglePlay(e);
      },
    },
    {
      id: 'animation.reverse',
      label: '反转帧',
      enabled: many,
      description: '反转所选帧或全部帧的顺序',
      run: (e) => {
        const frames = selectedFrames(e);
        e.command('反转帧', (d) => reverseFrames(d, frames));
      },
    },
    { id: 'animation.tween', label: '过渡…', enabled: many, description: '添加对位置、不透明度和效果进行插值的帧', run: (e, arg) => tweenDialog(e, arg) },
    {
      id: 'animation.frames-from-layers',
      label: '从图层创建帧',
      enabled: (e) => docOpen(e) && e.doc.layers.length > 1 && !hasTimeline(e),
      description: '每个顶层图层生成一帧，最底层在最前',
      run: (e) => {
        stop(e, false);
        e.command('从图层创建帧', (d) => framesFromLayers(d));
        setSelectedFrames(e, [0]);
        showTimeline(e);
        e.update();
      },
    },
    { id: 'animation.flatten-frames', label: '将帧拼合为图层', enabled: animated, description: '为每帧的合成图像创建一个新图层', run: (e) => flattenFrames(e) },
    {
      id: 'animation.match-layers',
      label: '将图层状态应用于所有帧',
      enabled: (e) => many(e) && e.selectedIds.size > 0,
      description: '将所选图层在当前帧中的位置、可见性、不透明度和样式复制到每一帧',
      run: (e) => {
        const ids = allLayers(e.selectedLayers).map((l) => l.id);
        e.command('将图层状态应用于所有帧', (d) => matchLayersAcrossFrames(d, ids));
      },
    },
    unifyCommand('position', '位置'),
    unifyCommand('visibility', '可见性'),
    unifyCommand('style', '图层样式'),
    {
      id: 'animation.onion',
      label: '洋葱皮',
      enabled: timed,
      checked: (e) => !!(animationOf(e)?.onion ?? timelineOf(e)?.onion)?.enabled,
      run: async (e) => {
        if (hasTimeline(e)) return (await videoCommands()).toggleVideoOnion(e);
        e.command('洋葱皮', (d) => (d.animation!.onion = { ...(d.animation!.onion ?? defaultOnion), enabled: !d.animation!.onion?.enabled }));
      },
    },
    { id: 'animation.onion-settings', label: '洋葱皮设置…', enabled: timed, run: async (e, arg) => (hasTimeline(e) ? (await videoCommands()).videoOnionSettings(e, arg) : onionSettings(e, arg)) },
    ...delayPresets.map(
      (ms, i): Command => ({
        id: `animation.delay-${ms}`,
        label: delayLabel(ms),
        menu: 'animation.delay',
        order: i,
        enabled: animated,
        checked: (e) => selectedFrames(e).every((f) => animationOf(e)!.frames[f].delay === ms),
        run: (e) => {
          const frames = selectedFrames(e);
          e.command('帧延迟', (d) => setFrameDelay(d, frames, ms));
        },
      }),
    ),
    { id: 'animation.delay-custom', label: '其他…', menu: 'animation.delay', order: 99, enabled: animated, run: (e, arg) => customDelay(e, arg) },
    ...([1, 3, 0] as const).map(
      (n, i): Command => ({
        id: `animation.loop-${n === 0 ? 'forever' : n === 1 ? 'once' : n}`,
        label: loopLabel(n),
        menu: 'animation.loop',
        order: i,
        enabled: animated,
        checked: (e) => animationOf(e)?.loop === n,
        run: (e) => e.command('循环', (d) => (d.animation!.loop = n)),
      }),
    ),
    { id: 'animation.loop-custom', label: '其他…', menu: 'animation.loop', order: 99, enabled: animated, checked: (e) => ![0, 1, 3].includes(animationOf(e)?.loop ?? 0), run: (e, arg) => customLoop(e, arg) },
    { id: 'file.export-animation', label: '导出动画…', enabled: animated, recordable: false, description: '从时间轴帧导出动画 GIF、PNG 或 WebP', ...lazyRun(exporting, (m, e) => m.exportAnimation(e)) },
    { id: 'file.render-video', label: '渲染视频…', enabled: timed, recordable: false, description: '将动画或视频时间轴渲染为 WebM 视频或 PNG 图像序列', ...lazyRun(exporting, (m, e) => m.renderVideo(e)) },
    { id: 'file.import-video-frames', label: '将视频帧导入图层…', recordable: false, description: '将视频的各帧作为图层打开，支持生成帧动画', ...lazyRun(videoImport, (m, e, arg) => m.importVideoFrames(e, arg)) },
  );
  // With an animation, Export GIF writes its frames.
  const gif = commands.get('file.export-gif');
  if (gif) registerCommand({ ...gif, run: async (e, arg) => (hasAnimation(e) ? (await exporting()).exportAnimation(e, 'gif') : gif.run(e, arg)) });
  registerPanel(timelinePanel(timelineMenu));
  contributeMenu('window', ['window.panel.timeline'], 'window.contextual-taskbar');
  registerOverlay('animation-onion', onionOverlay);
}

/** Neighboring frames drawn faintly over the canvas (farthest first). */
function onionOverlay(e: Editor) {
  if (hasTimeline(e)) return videoOnionOverlay(e);
  const anim = animationOf(e);
  const o = anim?.onion;
  if (!anim || !o?.enabled || isPlaying() || !e.dock?.isVisible('timeline') || e.displayDoc !== e.doc) return '';
  const parts: string[] = [];
  const add = (index: number, k: number, count: number) => {
    if (index < 0 || index >= anim.frames.length) return;
    const img = frameImage(e, e.doc, index, undefined, true);
    if (!img) return;
    const opacity = o.opacity * (1 - (k - 1) / Math.max(1, count));
    parts.push(`<image class="onion-skin" href="${img.url}" x="0" y="0" width="${e.doc.width}" height="${e.doc.height}" preserveAspectRatio="none" opacity="${opacity.toFixed(3)}" style="mix-blend-mode:${o.blend ?? 'multiply'}"/>`);
  };
  for (let k = o.before; k >= 1; k--) add(anim.current - k, k, o.before);
  for (let k = o.after; k >= 1; k--) add(anim.current + k, k, o.after);
  return parts.length ? `<g class="onion-skins" pointer-events="none">${parts.join('')}</g>` : '';
}

/** Onion skins of the video timeline: the frames around the current time. */
function videoOnionOverlay(e: Editor) {
  const tl = timelineOf(e)!;
  const o = tl.onion;
  if (!o?.enabled || isVideoPlaying() || !e.dock?.isVisible('timeline') || e.displayDoc !== e.doc) return '';
  const frames = videoFrames.loaded;
  if (!frames) {
    // Draw again once the frame decoder has loaded.
    void videoFrames().then(() => e.overlay());
    return '';
  }
  const parts: string[] = [];
  const add = (t: number, k: number, count: number) => {
    if (t < 0 || t >= tl.duration) return;
    const img = frames.timeImage(e, e.doc, t);
    if (!img) return;
    const opacity = o.opacity * (1 - (k - 1) / Math.max(1, count));
    parts.push(`<image class="onion-skin" href="${img.url}" x="0" y="0" width="${e.doc.width}" height="${e.doc.height}" preserveAspectRatio="none" opacity="${opacity.toFixed(3)}" style="mix-blend-mode:${o.blend ?? 'multiply'}"/>`);
  };
  for (let k = o.before; k >= 1; k--) add(tl.current - k, k, o.before);
  for (let k = o.after; k >= 1; k--) add(tl.current + k, k, o.after);
  return parts.length ? `<g class="onion-skins" pointer-events="none">${parts.join('')}</g>` : '';
}
