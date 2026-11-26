// Video timeline and video layer commands. Registration is eager (menus,
// the Timeline panel and the command search see every command); decoding,
// dialogs, playback and the timeline view load on first use.
import type { Editor } from '../../editor';
import { registerCommand, type Command } from '../../app/registry';
import { lazy, lazyRun } from '../../app/lazy';
import { layerBadges, layerNotes } from '../panels/layers';
import { svg } from '../../app/icons';
import { allLayers } from '../../model/document';
import { clipStates, keyProperties, presentTimeline, syncTimeline, videoFrameAt, canAnimate, type KeyProperty } from '../../model/video-timeline';
import { registerPresentation } from '../../renderer/renderer';
import { hasAnimation } from './state';
import { hasTimeline, isVideoLayer, mediaCleanups, timelineOf, videoLayerOf, videoView, type VideoLayer } from './video-state';
import { audioCommands, audioMenu, audioSelected, installAudio } from './audio';

export const videoCommands = lazy(() => import('./video-commands'));
// The frame cache budget comes from Preferences → Performance.
let cacheMb = 512;
export const videoFrames = lazy(() =>
  import('./video-frames').then((m) => {
    m.setCacheLimit(cacheMb);
    return m;
  }),
);
export const videoPlaybackModule = lazy(() => import('./video-playback'));

const docOpen = (e: Editor) => e.hasDocument;
const single = (e: Editor) => hasTimeline(e) && e.selectedIds.size === 1 && !!e.layer;
const someSelected = (e: Editor) => hasTimeline(e) && e.selectedIds.size > 0;
const clipTargets = (e: Editor) => someSelected(e) || audioSelected(e);
/** Layer frame of the selected video layer at the current time. */
function currentFrame(e: Editor, l: VideoLayer) {
  const tl = timelineOf(e)!;
  return videoFrameAt(tl, l, clipStates(e.doc, tl.current).get(l.id)?.content ?? tl.current);
}
const altered = (e: Editor) => {
  const l = videoLayerOf(e);
  return !!l && !!l.video.altered?.[currentFrame(e, l)];
};
const selectedKeyCount = (e: Editor) => {
  const tl = timelineOf(e);
  return tl ? videoView(e).keys.filter((k) => tl.clips[k.id]?.keys?.[k.prop]?.some((x) => x.t === k.t)).length : 0;
};
const keyHold = (e: Editor) => {
  const tl = timelineOf(e)!;
  const keys = videoView(e).keys.flatMap((k) => tl.clips[k.id]?.keys?.[k.prop]?.filter((x) => x.t === k.t) ?? []);
  return keys.length > 0 && keys.every((k) => k.hold);
};
const propLabels: Record<KeyProperty, string> = { position: '位置', opacity: '不透明度', style: '样式' };

/** Panel menu in video timeline mode. */
export function videoTimelineMenu() {
  return [
    'animation.play', 'timeline.loop', '-',
    'timeline.split', 'timeline.trim-start', 'timeline.trim-end', 'timeline.transitions', '-',
    'timeline.animate-position', 'timeline.animate-opacity', 'timeline.animate-style', 'timeline.previous-key', 'timeline.next-key',
    'timeline.key-linear', 'timeline.key-hold', 'timeline.delete-keys', '-',
    'timeline.work-start', 'timeline.work-end', 'timeline.work-clear', '-',
    ...audioMenu(), '-',
    'layer.video-new-file', 'layer.video-new-blank', 'layer.video-mute', '-',
    'animation.onion', 'animation.onion-settings', '-',
    'timeline.settings', 'timeline.convert-to-frames', 'timeline.delete', '-',
    'file.render-video',
  ];
}

export function installVideo(e: Editor) {
  registerPresentation(presentTimeline);
  e.documentHooks.push((doc, before) => syncTimeline(doc, before));
  e.onUpdate((e) => videoPlaybackModule.loaded?.videoPlaybackUpdate(e));
  // A closed document's decoded frames, decoders and sound are freed.
  e.closeHooks.push((s) => mediaCleanups.forEach((fn) => fn(s, e.sessions)));
  cacheMb = e.preferences.videoCacheSize;
  e.preferenceHooks.push((e) => {
    cacheMb = e.preferences.videoCacheSize;
    videoFrames.loaded?.setCacheLimit(cacheMb);
  });
  const cmd = videoCommands;
  installAudio();
  // Clip commands act on the selected audio clips while any is selected.
  const clipRun = (video: (m: typeof import('./video-commands'), e: Editor) => unknown, audio: (m: typeof import('./audio-commands'), e: Editor) => unknown): Pick<Command, 'run' | 'prefetch'> => ({
    run: async (e) => void (audioSelected(e) ? await audio(await audioCommands(), e) : await video(await cmd(), e)),
    prefetch: cmd.prefetch,
  });
  const stopwatch = (prop: KeyProperty): Command => ({
    id: `timeline.animate-${prop}`,
    label: `启用${propLabels[prop]}动画`,
    enabled: (e) => single(e) && canAnimate(e.layer!, prop),
    checked: (e) => !!timelineOf(e)?.clips[e.selected]?.keys?.[prop],
    description: `为图层的${prop === 'style' ? '图层样式' : propLabels[prop]}添加关键帧：在播放头处编辑将添加关键帧`,
    ...lazyRun(cmd, (m, e, arg) => m.toggleStopwatchCommand(e, prop, arg)),
  });
  registerCommand(
    // Timelines
    { id: 'timeline.create', label: '创建视频时间轴', enabled: (e) => docOpen(e) && !hasTimeline(e) && !hasAnimation(e), description: '使用剪辑、关键帧和视频图层随时间制作图层动画', ...lazyRun(cmd, (m, e) => m.createVideoTimeline(e)) },
    { id: 'timeline.convert-to-video', label: '转换为视频时间轴', enabled: hasAnimation, description: '各帧将转换为剪辑范围并保留关键帧', ...lazyRun(cmd, (m, e) => m.convertToVideo(e)) },
    { id: 'timeline.convert-to-frames', label: '转换为帧动画…', enabled: hasTimeline, description: '对时间轴进行采样以生成帧', ...lazyRun(cmd, (m, e, arg) => m.convertToFrames(e, arg)) },
    { id: 'timeline.delete', label: '删除视频时间轴', enabled: hasTimeline, description: '删除剪辑和关键帧；图层保留当前时间状态', ...lazyRun(cmd, (m, e) => m.deleteTimeline(e)) },
    { id: 'timeline.settings', label: '时间轴设置…', enabled: hasTimeline, description: '持续时间与帧率', ...lazyRun(cmd, (m, e, arg) => m.timelineSettings(e, arg)) },
    { id: 'timeline.frame-rate', label: '时间轴帧率', hidden: true, enabled: hasTimeline, ...lazyRun(cmd, (m, e, arg) => m.setFrameRate(e, Number(arg))) },
    { id: 'timeline.go-to', label: '转到时间', hidden: true, recordable: false, enabled: hasTimeline, ...lazyRun(cmd, (m, e, arg) => m.goTo(e, Number(arg))) },
    {
      id: 'timeline.loop',
      label: '循环播放',
      enabled: hasTimeline,
      recordable: false,
      checked: (e) => hasTimeline(e) && videoView(e).loop,
      run: (e) => {
        videoView(e).loop = !videoView(e).loop;
        e.update();
      },
    },
    // Clips
    { id: 'timeline.split', label: '在播放头位置拆分', enabled: clipTargets, description: '在当前时间将所选剪辑拆分为两段', ...clipRun((m, e) => m.splitAtPlayhead(e), (m, e) => m.splitAudio(e)) },
    { id: 'timeline.trim-start', label: '将起点修剪至播放头', enabled: clipTargets, ...clipRun((m, e) => m.trimToPlayhead(e, 'start'), (m, e) => m.trimAudio(e, 'start')) },
    { id: 'timeline.trim-end', label: '将终点修剪至播放头', enabled: clipTargets, ...clipRun((m, e) => m.trimToPlayhead(e, 'end'), (m, e) => m.trimAudio(e, 'end')) },
    { id: 'timeline.transitions', label: '过渡效果…', enabled: single, description: '在剪辑两端添加淡入淡出、带颜色的淡入淡出和交叉淡入淡出', ...lazyRun(cmd, (m, e, arg) => m.transitionsDialog(e, arg)) },
    { id: 'timeline.work-start', label: '设置工作区域起点', enabled: hasTimeline, ...lazyRun(cmd, (m, e) => m.setWorkArea(e, 'start')) },
    { id: 'timeline.work-end', label: '设置工作区域终点', enabled: hasTimeline, ...lazyRun(cmd, (m, e) => m.setWorkArea(e, 'end')) },
    { id: 'timeline.work-clear', label: '清除工作区域', enabled: (e) => !!timelineOf(e)?.work, ...lazyRun(cmd, (m, e) => m.setWorkArea(e, 'clear')) },
    // Keyframes
    ...keyProperties.map(stopwatch),
    { id: 'timeline.toggle-key', label: '添加或删除关键帧', hidden: true, enabled: hasTimeline, ...lazyRun(cmd, (m, e, arg) => m.toggleKeyCommand(e, arg)) },
    { id: 'timeline.previous-key', label: '上一个关键帧', enabled: someSelected, recordable: false, ...lazyRun(cmd, (m, e) => m.gotoKey(e, -1)) },
    { id: 'timeline.next-key', label: '下一个关键帧', enabled: someSelected, recordable: false, ...lazyRun(cmd, (m, e) => m.gotoKey(e, 1)) },
    { id: 'timeline.key-linear', label: '线性插值', enabled: (e) => selectedKeyCount(e) > 0, checked: (e) => selectedKeyCount(e) > 0 && !keyHold(e), ...lazyRun(cmd, (m, e) => m.setKeyInterpolation(e, false)) },
    { id: 'timeline.key-hold', label: '定格插值', enabled: (e) => selectedKeyCount(e) > 0, checked: (e) => selectedKeyCount(e) > 0 && keyHold(e), ...lazyRun(cmd, (m, e) => m.setKeyInterpolation(e, true)) },
    { id: 'timeline.delete-keys', label: '删除关键帧', enabled: (e) => selectedKeyCount(e) > 0, ...lazyRun(cmd, (m, e) => m.deleteSelectedKeys(e)) },
    // Video layers
    { id: 'layer.video-new-file', label: '从文件新建视频图层…', recordable: false, enabled: (e) => !e.hasDocument || !e.doc.layers.some((l) => l.artboard), description: '将视频文件添加为视频时间轴上的图层', ...lazyRun(cmd, (m, e, arg) => m.newVideoLayerFromFile(e, arg)) },
    { id: 'layer.video-new-blank', label: '新建空白视频图层', enabled: (e) => docOpen(e) && !e.doc.layers.some((l) => l.artboard), description: '为时间轴的每一帧创建一个空白帧，支持逐帧绘制', ...lazyRun(cmd, (m, e) => m.newBlankVideoLayer(e)) },
    { id: 'layer.video-insert-frame', label: '插入空白帧', enabled: (e) => !!videoLayerOf(e), ...lazyRun(cmd, (m, e) => m.insertFrame(e)) },
    { id: 'layer.video-duplicate-frame', label: '复制帧', enabled: (e) => !!videoLayerOf(e), ...lazyRun(cmd, (m, e) => m.duplicateVideoFrame(e)) },
    { id: 'layer.video-delete-frame', label: '删除帧', enabled: (e) => (videoLayerOf(e)?.video.frames ?? 0) > 1, ...lazyRun(cmd, (m, e) => m.deleteVideoFrame(e)) },
    { id: 'layer.video-replace', label: '替换素材…', recordable: false, enabled: (e) => !!videoLayerOf(e), ...lazyRun(cmd, (m, e, arg) => m.replaceFootage(e, arg)) },
    { id: 'layer.video-interpret', label: '解释素材…', enabled: (e) => !!videoLayerOf(e), description: '视频图层的帧率、Alpha 通道和循环设置', ...lazyRun(cmd, (m, e, arg) => m.interpretFootage(e, arg)) },
    { id: 'layer.video-show-altered', label: '显示已更改的视频', enabled: hasTimeline, checked: (e) => hasTimeline(e) && !timelineOf(e)!.hideAltered, description: '显示绘制修改过的帧（关闭则显示原始素材）', ...lazyRun(cmd, (m, e) => m.toggleShowAltered(e)) },
    { id: 'layer.video-restore-frame', label: '恢复帧', enabled: altered, description: '放弃对当前帧的绘制更改', ...lazyRun(cmd, (m, e) => m.restoreFrame(e)) },
    { id: 'layer.video-restore-all', label: '恢复所有帧', enabled: (e) => !!videoLayerOf(e)?.video.altered, ...lazyRun(cmd, (m, e) => m.restoreAllFrames(e)) },
    { id: 'layer.video-reload-frame', label: '重新载入帧', enabled: (e) => !!videoLayerOf(e)?.video.footage, description: '再次从原始素材解码当前帧', ...lazyRun(cmd, (m, e) => m.reloadFrame(e)) },
    { id: 'layer.video-rasterize', label: '栅格化', enabled: (e) => hasTimeline(e) && allLayers(e.selectedLayers).some(isVideoLayer), description: '将当前帧保留为普通像素图层', ...lazyRun(cmd, (m, e) => m.rasterizeVideo(e)) },
    { id: 'layer.rasterize-video', label: '视频', enabled: (e) => hasTimeline(e) && allLayers(e.selectedLayers).some(isVideoLayer), description: '将视频图层的当前帧转换为像素', ...lazyRun(cmd, (m, e) => m.rasterizeVideo(e)) },
    { id: 'edit.purge-video-cache', label: '视频缓存', recordable: false, description: '释放内存中保留的已解码视频帧', ...lazyRun(cmd, (m, e) => m.purgeCache(e)) },
  );
  // Layers panel: a film badge and the frame shown.
  layerBadges.push((e, l) => (isVideoLayer(l) && hasTimeline(e) ? `<span class="video-badge" title="视频图层" aria-label="视频图层">${svg('film', 11)}</span>` : ''));
  layerNotes.push((e, l) => {
    if (!isVideoLayer(l) || !hasTimeline(e)) return undefined;
    const k = currentFrame(e, l);
    return `视频 · 第 ${k + 1} 帧（共 ${l.video.frames} 帧）${l.video.altered?.[k] ? ' · 已更改' : ''}`;
  });
}
