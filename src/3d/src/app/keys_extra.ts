// Additional default-keymap bindings and the small operators behind them (editor type switching,
// subdivision levels, pies for orientation / falloff, toolbar popup, local view removal, …).
import { Vector3 } from 'three';
import { app, registerOperators } from './app';
import { addKeys, keymaps, keyLabel } from './keymap';
import { activeTools } from './prefs';
import { editorTypes, type EditorTypeId } from '../ui/screen';
import { openMenu, openPie, promptText, closeMenus, type MenuItem, type PieItem } from '../ui/menu';
import { currentOrientation, customOrientations, setOrientation } from '../ops/orientations';
import { BUILTIN_ORIENTATIONS } from '../ops/orientation_list';
import { activeView3D } from '../editors/view3d/view3d';
import { toolsFor, setActiveTool } from '../editors/view3d/toolbar';
import { newModifier } from '../eval/modifiers';
import { uid } from '../data/defaults';
import { renderContext } from '../render/context';

const objectMode = () => app.doc.mode === 'OBJECT';
const editMesh = () => app.doc.mode === 'EDIT' && app.activeObject?.type === 'MESH';

// Shift+F1…F12 editor types; repeated presses cycle through related editors
const SPACE_KEYS: Record<string, EditorTypeId[]> = {
  F1: ['FILE_BROWSER'],
  F2: ['CLIP_EDITOR' as EditorTypeId],
  F3: ['SHADER', 'GEOMETRY', 'COMPOSITOR'],
  F4: ['CONSOLE'],
  F5: ['VIEW_3D'],
  F6: ['GRAPH' as EditorTypeId, 'DRIVERS' as EditorTypeId],
  F7: ['PROPERTIES'],
  F8: ['SEQUENCE_EDITOR' as EditorTypeId],
  F9: ['OUTLINER'],
  F10: ['IMAGE_EDITOR', 'UV'],
  F11: ['TEXT'],
  F12: ['DOPESHEET' as EditorTypeId, 'TIMELINE', 'NLA' as EditorTypeId],
};

registerOperators([
  {
    idname: 'screen.space_type_set_or_cycle',
    label: '循环切换空间类型',
    description: '设置鼠标下方区域的编辑器类型，或在相关编辑器之间循环切换',
    props: [{ id: 'key', label: '按键', type: 'string', default: 'F5' }],
    poll: () => !!(app.hoverArea ?? app.activeArea),
    exec: (_ctx, p) => {
      const area = (app.hoverArea ?? app.activeArea) as unknown as { type: EditorTypeId; setType(t: EditorTypeId): void };
      const list = (SPACE_KEYS[p.key as string] ?? []).filter((t) => editorTypes.has(t));
      if (!list.length) return 'CANCELLED';
      const i = list.indexOf(area.type);
      area.setType(list[i < 0 ? 0 : (i + 1) % list.length]);
    },
    undo: false,
  },
  {
    idname: 'object.subdivision_set',
    label: '设置细分级别',
    description: '设置表面细分级别（1 到 5）',
    props: [
      { id: 'level', label: '级别', type: 'int', default: 1, min: -100, max: 100 },
      { id: 'relative', label: '相对', type: 'bool', default: false },
    ],
    poll: () => app.selectedObjects().some((o) => o.type === 'MESH'),
    exec: (_ctx, p) => {
      const level = p.level as number;
      for (const ob of app.selectedObjects()) {
        if (ob.type !== 'MESH') continue;
        let mod = ob.modifiers.find((m) => m.type === 'SUBSURF');
        if (!mod) {
          if (p.relative) continue;
          mod = newModifier('SUBSURF', uid('md'), ob.modifiers);
          ob.modifiers.push(mod);
        }
        const cur = (mod.levels as number) ?? 1;
        mod.levels = Math.max(0, p.relative ? cur + level : level);
      }
    },
  },
  {
    idname: 'view3d.localview_remove_from',
    label: '从局部视图移除',
    description: '将选中物体移出局部视图',
    poll: () => !!activeView3D()?.localView,
    exec: () => {
      const v = activeView3D()!;
      for (const ob of app.selectedObjects()) v.localView!.delete(ob.id);
      if (!v.localView!.size) app.run('view3d.localview');
      renderContext?.engine.requestDraw();
    },
    undo: false,
  },
  {
    idname: 'wm.toolbar',
    label: '工具栏',
    description: '在弹出菜单中显示当前模式的工具栏工具',
    poll: () => !!activeView3D(),
    invoke: () => {
      const tools = toolsFor(app.doc.mode).filter(Boolean) as { id: string; label: string; icon: string; shortcut?: string }[];
      // inside the popup, single keys pick tools (the Toolbar Popup keymap)
      const popupKey = (id: string) => (keymaps['Toolbar Popup'] ?? []).find((k) => !k.inactive && k.op === 'wm.tool_set_by_id' && k.props?.name === id);
      openMenu(
        tools.map((t) => {
          const k = popupKey(t.id);
          return { label: t.label, icon: t.icon, shortcut: k ? keyLabel(k) : t.shortcut, active: activeTools[app.doc.mode] === t.id, action: () => setActiveTool(t.id) };
        }),
        { x: app.pointer.x, y: app.pointer.y },
        {
          title: '工具栏',
          typeSpace: true,
          onType: (ch) => {
            const key = ch === ' ' ? 'SPACE' : ch.toUpperCase();
            const k = (keymaps['Toolbar Popup'] ?? []).find((x) => !x.inactive && x.key === key && !x.ctrl && !x.alt && !!x.shift === (ch !== ch.toLowerCase() && ch !== ' '));
            if (!k?.op || !app.poll(k.op)) return;
            closeMenus();
            app.run(k.op, k.props ?? {});
          },
        },
      );
      return 'CANCELLED';
    },
    undo: false,
  },
  {
    idname: 'wm.batch_rename',
    label: '批量重命名',
    description: '重命名选中物体：在名称中查找并替换文本',
    poll: () => app.selectedObjects().length > 0,
    invoke: () => {
      promptText('查找', '', (find) => {
        if (!find) return;
        promptText('替换', '', (rep) => app.run('wm.batch_rename', { find, replace: rep ?? '' }, { invoke: false }));
      });
      return 'CANCELLED';
    },
    props: [
      { id: 'find', label: '查找', type: 'string', default: '' },
      { id: 'replace', label: '替换', type: 'string', default: '' },
    ],
    exec: (ctx, p) => {
      const find = p.find as string;
      if (!find) return 'CANCELLED';
      let n = 0;
      for (const ob of app.selectedObjects()) {
        if (!ob.name.includes(find)) continue;
        let name = ob.name.split(find).join(p.replace as string) || ob.name;
        const taken = new Set(Object.values(ctx.doc.objects).filter((o) => o !== ob).map((o) => o.name));
        const stem = name;
        for (let i = 1; taken.has(name); i++) name = `${stem}.${String(i).padStart(3, '0')}`;
        ob.name = name;
        n++;
      }
      app.report('INFO', `已重命名 ${n} / ${app.selectedObjects().length} 个物体`);
    },
  },
  {
    idname: 'screen.time_jump',
    label: '按步长跳转时间',
    description: '按场景的时间跳转步长向前或向后跳转（默认为 1 秒）',
    props: [{ id: 'backward', label: '向后', type: 'bool', default: false }],
    exec: (ctx, p) => {
      const sc = ctx.doc.scene;
      const delta = sc.time_jump_delta ?? 1;
      const step = Math.max(1, Math.round(sc.time_jump_unit === 'FRAMES' ? delta : delta * (sc.render.fps / (sc.render.fps_base || 1))));
      app.setFrame(ctx.doc.scene.frame_current + (p.backward ? -step : step));
    },
    undo: false,
  },
  {
    idname: 'object.transfer_mode',
    label: '传递模式',
    description: '将当前模式切换到鼠标下方的物体',
    poll: () => app.doc.mode !== 'OBJECT' && !!activeView3D(),
    invoke: () => {
      const v = activeView3D()!;
      const r = v.el.getBoundingClientRect();
      const hit = v.pick(app.pointer.x - r.left, app.pointer.y - r.top, 4);
      const target = hit ? app.doc.objects[hit.id] : undefined;
      const mode = app.doc.mode;
      if (!target || target.id === app.activeObject?.id || target.type !== app.activeObject?.type) return 'CANCELLED';
      app.run('object.mode_set', { mode: 'OBJECT' });
      for (const o of Object.values(app.doc.objects)) o.select = false;
      target.select = true;
      app.doc.scene.active_object = target.id;
      app.run('object.mode_set', { mode });
      return 'FINISHED';
    },
  },
  {
    idname: 'pose.constraints_clear',
    label: '清除姿态约束',
    description: '清除选中骨骼的所有约束',
    poll: () => app.doc.mode === 'POSE',
    exec: () => {
      for (const pb of Object.values(app.activeObject?.pose ?? {})) if (pb.select) pb.constraints = [];
    },
  },
  {
    idname: 'curve.tilt_clear',
    label: '清除倾斜',
    description: '清除选中控制点的倾斜角',
    poll: () => app.doc.mode === 'EDIT' && app.activeObject?.type === 'CURVE',
    exec: () => {
      const cu = app.doc.curves[app.activeObject!.data!];
      for (const sp of cu.splines) {
        for (const b of sp.bezier_points) if (b.select_control_point) b.tilt = 0;
        for (const q of sp.points) if (q.select) q.tilt = 0;
      }
    },
  },
  {
    idname: 'armature.align',
    label: '对齐骨骼',
    description: '将选中骨骼对齐到活动骨骼（或其父骨骼）',
    poll: () => app.doc.mode === 'EDIT' && app.activeObject?.type === 'ARMATURE',
    exec: () => {
      const arm = app.doc.armatures[app.activeObject!.data!];
      const act = arm.bones.find((b) => b.name === arm.active_bone);
      if (!act) return 'CANCELLED';
      const dir = new Vector3(...act.tail).sub(new Vector3(...act.head)).normalize();
      for (const b of arm.bones) {
        if (!b.select || b === act) continue;
        const len = new Vector3(...b.tail).distanceTo(new Vector3(...b.head));
        b.tail = new Vector3(...b.head).addScaledVector(dir, len).toArray() as [number, number, number];
        b.roll = act.roll;
      }
    },
  },
  {
    idname: 'view3d.gizmo_toggle',
    label: '切换操控器',
    description: '显示或隐藏视口操控器',
    poll: () => !!activeView3D(),
    exec: () => {
      const v = activeView3D()!;
      v.showGizmos = !v.showGizmos;
      v.drawSvg();
      app.changed('ui');
    },
    undo: false,
  },
]);

export function orientationPie() {
  const cur = currentOrientation();
  // W E S N NW NE SW SE: the built-in orientations in order, then the first custom one
  const items: (PieItem | null)[] = BUILTIN_ORIENTATIONS.map(([o, label, ic]) => ({ label, icon: ic, active: cur === o, action: () => setOrientation(o) }));
  const custom = customOrientations()[0];
  items.push(custom ? { label: custom.name, icon: 'orientation_local', active: cur === custom.name, action: () => setOrientation(custom.name) } : null);
  openPie('变换坐标系', items, app.pointer.x, app.pointer.y, 'COMMA');
}

export function falloffPie() {
  const ts = app.doc.scene.tool_settings;
  const FALLOFF_LABELS: Record<string, string> = {
    SMOOTH: '平滑',
    SPHERE: '球状',
    ROOT: '根号',
    INVERSE_SQUARE: '平方反比',
    SHARP: '尖锐',
    LINEAR: '线性',
    CONSTANT: '恒定',
    RANDOM: '随机',
  };
  const items = (['SMOOTH', 'SPHERE', 'ROOT', 'INVERSE_SQUARE', 'SHARP', 'LINEAR', 'CONSTANT', 'RANDOM'] as const).map((f) => ({
    label: FALLOFF_LABELS[f],
    active: ts.proportional_edit_falloff === f,
    action: () => {
      ts.proportional_edit_falloff = f;
      app.pushUndo('衰减编辑曲线');
      app.changed('ui', 'doc');
    },
  }));
  openPie('衰减编辑曲线', items, app.pointer.x, app.pointer.y, 'O');
}


// keys that pick a tool while the toolbar popup is open
addKeys('Toolbar Popup', [
  { key: 'SPACE', op: 'wm.tool_set_by_id', props: { name: 'builtin.cursor' } },
  { key: 'W', op: 'wm.tool_set_by_id', props: { name: 'builtin.select' } },
  { key: 'L', op: 'wm.tool_set_by_id', props: { name: 'builtin.select_lasso' } },
  { key: 'T', op: 'wm.tool_set_by_id', props: { name: 'builtin.transform' } },
  { key: 'M', op: 'wm.tool_set_by_id', props: { name: 'builtin.measure' } },
]);

addKeys('Window', [
  ...Object.keys(SPACE_KEYS).map((k) => ({ key: k, shift: true, op: 'screen.space_type_set_or_cycle', props: { key: k } })),
  { key: 'SPACE', shift: true, op: 'wm.toolbar' },
  { key: 'F2', ctrl: true, op: 'wm.batch_rename' },
  { key: 'F4', op: 'wm.call_menu', props: { name: 'TOPBAR_MT_file_context_menu' } },
  { key: 'S', ctrl: true, alt: true, op: 'wm.save_mainfile', props: { incremental: true } },
]);

addKeys('Frames', [
  { key: 'RIGHT_ARROW', ctrl: true, op: 'screen.time_jump', props: { backward: false } },
  { key: 'LEFT_ARROW', ctrl: true, op: 'screen.time_jump', props: { backward: true } },
  // Alt + mouse wheel steps through frames anywhere
  { key: 'WHEELDOWNMOUSE', alt: true, op: 'screen.frame_offset', props: { delta: 1 } },
  { key: 'WHEELUPMOUSE', alt: true, op: 'screen.frame_offset', props: { delta: -1 } },
  // media keys of keyboards that have them
  { key: 'MEDIA_PLAY', op: 'screen.animation_play' },
  { key: 'MEDIA_STOP', op: 'screen.animation_cancel' },
  { key: 'MEDIA_LAST', op: 'screen.keyframe_jump', props: { next: true } },
  { key: 'MEDIA_FIRST', op: 'screen.keyframe_jump', props: { next: false } },
]);

addKeys('3D View', [
  { key: 'SLASH', op: 'view3d.localview' },
  { key: 'SLASH', alt: true, op: 'view3d.localview_remove_from' },
  { key: 'NUMPAD_SLASH', alt: true, op: 'view3d.localview_remove_from' },
  { key: 'NUMPAD_PLUS', shift: true, op: 'view3d.dolly', props: { delta: 1 } },
  { key: 'NUMPAD_MINUS', shift: true, op: 'view3d.dolly', props: { delta: -1 } },
  { key: 'EQUAL', shift: true, ctrl: true, op: 'view3d.dolly', props: { delta: 1 } },
  { key: 'MINUS', shift: true, ctrl: true, op: 'view3d.dolly', props: { delta: -1 } },
  { key: 'HOME', ctrl: true, op: 'view3d.view_all', props: { use_all_regions: true } },
  { key: 'NUMPAD_PERIOD', ctrl: true, op: 'view3d.view_selected', props: { use_all_regions: true } },
  { key: 'Z', shift: true, op: 'view3d.toggle_shading', props: { type: 'WIREFRAME' } },
  { key: 'ACCENT_GRAVE', ctrl: true, op: 'view3d.gizmo_toggle' },
  { key: 'COMMA', action: orientationPie },
  { key: 'O', shift: true, action: falloffPie, when: () => app.doc.mode === 'OBJECT' || app.doc.mode === 'EDIT' },
  ...(['ONE', 'THREE', 'SEVEN'] as const).map((k) => ({ key: `NUMPAD_${k === 'ONE' ? 1 : k === 'THREE' ? 3 : 7}`, shift: true, ctrl: true, op: 'view3d.view_axis', props: { type: k === 'ONE' ? 'BACK' : k === 'THREE' ? 'LEFT' : 'BOTTOM', align_active: true } })),
]);

addKeys('Object Mode', [
  { key: 'DEL', shift: true, op: 'object.delete', when: objectMode },
  { key: 'PERIOD', ctrl: true, action: toggleOrigins, when: objectMode },
  ...['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].map((k, i) => ({ key: k, ctrl: true, op: 'object.subdivision_set', props: { level: i, relative: false }, when: objectMode })),
  { key: 'Q', alt: true, op: 'object.transfer_mode', when: () => app.doc.mode !== 'OBJECT' },
]);

addKeys('Mesh', [
  { key: 'J', op: 'mesh.vert_connect_path', when: editMesh },
  { key: 'N', shift: true, ctrl: true, op: 'mesh.normals_make_consistent', props: { inside: true }, when: editMesh },
  { key: 'T', shift: true, ctrl: true, op: 'mesh.quads_convert_to_tris', props: { quad_method: 'BEAUTY', ngon_method: 'BEAUTY' }, when: editMesh },
  ...(['ONE', 'TWO', 'THREE'] as const).map((k, i) => ({ key: k, ctrl: true, op: 'mesh.select_mode', props: { type: ['VERT', 'EDGE', 'FACE'][i], use_expand: true }, when: editMesh })),
  ...(['ONE', 'TWO', 'THREE'] as const).map((k, i) => ({ key: k, shift: true, ctrl: true, op: 'mesh.select_mode', props: { type: ['VERT', 'EDGE', 'FACE'][i], use_extend: true, use_expand: true }, when: editMesh })),
  { key: 'Q', alt: true, op: 'object.transfer_mode', when: editMesh },
]);

addKeys('Pose', [{ key: 'P', shift: true, op: 'pose.select_hierarchy', props: { direction: 'PARENT' }, when: () => app.doc.mode === 'POSE' }, { key: 'C', ctrl: true, alt: true, op: 'pose.constraints_clear', when: () => app.doc.mode === 'POSE' }]);
addKeys('Armature', [{ key: 'T', alt: true, op: 'curve.tilt_clear', when: () => app.doc.mode === 'EDIT' && app.activeObject?.type === 'CURVE' }, { key: 'A', ctrl: true, alt: true, op: 'armature.align', when: () => app.doc.mode === 'EDIT' && app.activeObject?.type === 'ARMATURE' }]);

function toggleOrigins() {
  const ts = app.doc.scene.tool_settings;
  ts.use_transform_data_origin = !ts.use_transform_data_origin;
  app.report('INFO', `仅影响原点: ${ts.use_transform_data_origin ? '开启' : '关闭'}`);
  app.changed('ui', 'doc');
}

registerOperators([
  {
    idname: 'collection.objects_add_active',
    label: '将选中项添加到活动物体集合',
    description: '将选中物体添加到活动物体所在的集合中',
    poll: () => objectMode() && !!app.activeObject && app.selectedObjects().length > 1,
    exec: (ctx) => {
      const act = app.activeObject!;
      const cols = Object.values(ctx.doc.collections).filter((c) => c.objects.includes(act.id) && c.id !== ctx.doc.scene.collection);
      const target = cols[0] ?? ctx.doc.collections[ctx.doc.scene.collection];
      for (const ob of app.selectedObjects()) if (!target.objects.includes(ob.id)) target.objects.push(ob.id);
    },
  },
  {
    idname: 'collection.objects_remove_active',
    label: '从活动集合移除选中项',
    description: '从活动物体所在的集合中移除选中物体（物体仍会保留在其他集合链接中）',
    poll: () => objectMode() && !!app.activeObject,
    exec: (ctx) => {
      const act = app.activeObject!;
      const cols = Object.values(ctx.doc.collections).filter((c) => c.objects.includes(act.id));
      for (const ob of app.selectedObjects()) {
        if (ob === act) continue;
        for (const c of cols) {
          const remaining = Object.values(ctx.doc.collections).filter((x) => x !== c && x.objects.includes(ob.id));
          if (remaining.length) c.objects = c.objects.filter((x) => x !== ob.id);
        }
      }
    },
  },
]);

addKeys('Object Mode', [
  { key: 'G', shift: true, ctrl: true, op: 'collection.objects_add_active', when: objectMode },
  { key: 'G', shift: true, alt: true, op: 'collection.objects_remove_active', when: objectMode },
  { key: 'G', shift: true, ctrl: true, alt: true, op: 'collection.objects_remove_all', when: objectMode },
]);
