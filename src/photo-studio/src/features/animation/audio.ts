// Audio track commands on the video timeline. Registration is eager (menus,
// the Timeline panel and the command search see every command); decoding,
// mixing and the commands themselves load on first use.
import type { Editor } from '../../editor';
import { registerCommand, type Command } from '../../app/registry';
import { lazy, lazyRun } from '../../app/lazy';
import { findAudioClip } from '../../model/audio-timeline';
import { hasAnimation } from './state';
import { hasTimeline, selectedAudioClips, selectedAudioTrack, timelineOf, videoLayerOf, videoView } from './video-state';

export const audioCommands = lazy(() => import('./audio-commands'));
/** Clip commands act on the selected audio clips while any is selected. */
export const audioSelected = (e: Editor) => hasTimeline(e) && selectedAudioClips(e).length > 0;
const linkedSelected = (e: Editor) => audioSelected(e) && selectedAudioClips(e).some((id) => findAudioClip(timelineOf(e)!, id)?.clip.link);
const canAdd = (e: Editor) => e.hasDocument && !hasAnimation(e) && !e.doc.layers.some((l) => l.artboard);
const trackFlag = (e: Editor, flag: 'muted' | 'solo') => hasTimeline(e) && !!selectedAudioTrack(e)?.[flag];

/** Panel menu entries for audio (after the clip entries). */
export const audioMenu = () => [
  'timeline.audio-add', 'timeline.audio-track-new', 'timeline.audio-track-rename', 'timeline.audio-track-delete', 'timeline.audio-track-mute', 'timeline.audio-track-solo', '-',
  'timeline.audio-settings', 'timeline.audio-duplicate', 'timeline.audio-unlink', 'timeline.audio-delete', 'timeline.audio-scrub',
];
/** Context menu of an audio clip. */
export const audioClipMenu = () => ['timeline.split', 'timeline.trim-start', 'timeline.trim-end', '-', 'timeline.audio-settings', 'timeline.audio-duplicate', 'timeline.audio-unlink', 'timeline.audio-delete'];
/** Context menu of an audio track header. */
export const audioTrackMenu = () => ['timeline.audio-add', 'timeline.audio-track-rename', 'timeline.audio-track-mute', 'timeline.audio-track-solo', '-', 'timeline.audio-track-new', 'timeline.audio-track-delete'];

export function installAudio() {
  const m = audioCommands;
  const flag = (id: string, label: string, which: 'muted' | 'solo', description: string): Command => ({
    id,
    label,
    enabled: hasTimeline,
    checked: (e) => trackFlag(e, which),
    description,
    ...lazyRun(m, (x, e, arg) => x.toggleTrack(e, which, arg)),
  });
  registerCommand(
    { id: 'timeline.audio-add', label: '添加音频…', recordable: false, enabled: canAdd, description: '在播放头位置添加音频文件（WAV、MP3、AAC、Ogg、Opus 或 FLAC）作为剪辑', ...lazyRun(m, (x, e, arg) => x.addAudio(e, arg)) },
    { id: 'timeline.audio-track-new', label: '新建音频轨道', enabled: hasTimeline, ...lazyRun(m, (x, e) => x.newTrack(e)) },
    { id: 'timeline.audio-track-delete', label: '删除音频轨道', enabled: (e) => !!timelineOf(e)?.audio?.length, description: '删除所选音频轨道及其剪辑', ...lazyRun(m, (x, e, arg) => x.deleteTrack(e, arg)) },
    { id: 'timeline.audio-track-rename', label: '重命名音频轨道…', enabled: hasTimeline, ...lazyRun(m, (x, e, arg) => x.renameTrack(e, arg)) },
    flag('timeline.audio-track-mute', '静音音频轨道', 'muted', '静音所选音频轨道'),
    flag('timeline.audio-track-solo', '独奏音频轨道', 'solo', '仅播放独奏轨道'),
    { id: 'timeline.audio-set', label: '音频设置', hidden: true, enabled: hasTimeline, ...lazyRun(m, (x, e, arg) => x.setAudio(e, arg)) },
    { id: 'timeline.audio-settings', label: '音频剪辑设置…', enabled: (e) => audioSelected(e) && selectedAudioClips(e).length === 1, description: '所选音频剪辑的增益与淡入淡出', ...lazyRun(m, (x, e) => x.clipSettings(e)) },
    { id: 'timeline.audio-delete', label: '删除音频剪辑', enabled: audioSelected, ...lazyRun(m, (x, e) => x.deleteClips(e)) },
    { id: 'timeline.audio-duplicate', label: '复制音频剪辑', enabled: audioSelected, description: '紧随其后复制所选音频剪辑', ...lazyRun(m, (x, e) => x.duplicateClips(e)) },
    { id: 'timeline.audio-unlink', label: '取消链接音频', enabled: linkedSelected, description: '允许视频图层的声音独立移动', ...lazyRun(m, (x, e) => x.unlinkClips(e)) },
    {
      id: 'timeline.audio-scrub',
      label: '音频拖动试听',
      enabled: hasTimeline,
      recordable: false,
      checked: (e) => hasTimeline(e) && videoView(e).scrubAudio,
      description: '拖动播放头时播放简短声音片段',
      run: (e) => {
        videoView(e).scrubAudio = !videoView(e).scrubAudio;
        e.update();
      },
    },
    { id: 'layer.video-mute', label: '静音视频声音', enabled: (e) => !!videoLayerOf(e)?.video.audio, checked: (e) => !!videoLayerOf(e)?.video.muted, description: '静音所选视频图层的声音', ...lazyRun(m, (x, e, arg) => x.toggleVideoMute(e, arg)) },
    // The same for a given video layer (the audio properties bar names the
    // layer of the selected linked clip, whatever layers are selected).
    { id: 'timeline.audio-video-mute', label: '静音视频声音', hidden: true, enabled: hasTimeline, ...lazyRun(m, (x, e, arg) => x.toggleVideoMute(e, arg)) },
  );
}
