// Top bar Scene and View Layer selectors: browse (switch), rename, new (menu of the creation
// types) and delete, like the data-block selectors of the property editor.
import { h, type Child } from '../ui/h';
import { icon } from '../ui/icons';
import { textField } from '../ui/widgets';
import { openMenu, type MenuItem } from '../ui/menu';
import { topbarSceneWidgets } from '../ui/shell';
import { app } from '../app/app';
import { allScenes, renameScene, scenesByName } from './scenes';
import { activeLayerIndex, ensureViewLayers, uniqueLayerName } from './viewlayers';
import { sceneNewMenu, switchScene, switchViewLayer, viewLayerAddMenu } from './ops';
import './scenes.css';

function browseButton(cls: string, iconName: string, tip: string, items: () => MenuItem[], title: string): Child {
  return h(
    'button',
    {
      class: `tbid-browse ${cls}`,
      'data-tip': tip,
      'aria-label': tip.split('\n')[0],
      onpointerdown: (e: PointerEvent) => {
        e.preventDefault();
        const list = items();
        openMenu(list.length > 10 ? [{ search: true }, ...list] : list, e.currentTarget as HTMLElement, { title });
      },
    },
    icon(iconName),
    icon('down_arrow_hlt', 'tiny'),
  );
}

function iconButton(cls: string, iconName: string, tip: string, onDown: (e: PointerEvent) => void, disabled = false): Child {
  return h(
    'button',
    {
      class: { 'tbid-btn': true, [cls]: true, disabled },
      'data-tip': tip,
      'aria-label': tip.split('\n')[0],
      disabled,
      onpointerdown: (e: PointerEvent) => {
        e.preventDefault();
        if (!disabled) onDown(e);
      },
    },
    icon(iconName),
  );
}

function sceneSelector(): Child {
  const doc = app.doc;
  const count = allScenes(doc).length;
  return h(
    'div',
    { class: 'tb-scene tb-id tb-id-scene' },
    browseButton(
      'tbid-scene-browse',
      'scene_data',
      '场景\n浏览此工程中的场景并选择要显示的场景',
      () => scenesByName(app.doc).map((s) => ({ label: s.name, icon: 'scene_data', active: s === app.doc.scene, action: () => switchScene(s.id!) })),
      '场景列表',
    ),
    textField('scene-name', doc.scene.name, (v) => {
      renameScene(app.doc, app.doc.scene, v);
      app.pushUndo('重命名场景');
      app.changed('doc');
    }, { className: 'tbid-name' }),
    iconButton('tbid-scene-new', 'duplicate', '新建场景\n添加新场景（空白、复制设置、关联或完整复制）', (e) => openMenu(sceneNewMenu(), e.currentTarget as HTMLElement, { title: '新建场景' })),
    iconButton('tbid-scene-delete', 'x', count > 1 ? '删除场景\n移除当前活动场景' : '删除场景\n工程必须包含至少一个场景', () => app.run('scene.delete'), count < 2),
  );
}

function viewLayerSelector(): Child {
  const sc = app.doc.scene;
  const layers = ensureViewLayers(sc);
  const act = layers[activeLayerIndex(sc)];
  return h(
    'div',
    { class: 'tb-scene tb-id tb-id-layer' },
    browseButton(
      'tbid-layer-browse',
      'view_layer',
      '视图层\n浏览场景的视图层并选择活动视图层',
      () => ensureViewLayers(app.doc.scene).map((l, i) => ({ label: l.name, icon: 'view_layer', active: i === app.doc.scene.active_view_layer, action: () => switchViewLayer(i) })),
      '视图层列表',
    ),
    textField('view-layer-name', act.name, (v) => {
      const n = v.trim().slice(0, 63);
      if (!n) return app.changed('ui');
      act.name = uniqueLayerName(app.doc.scene, n, act);
      app.pushUndo('重命名视图层');
      app.changed('doc');
    }, { className: 'tbid-name' }),
    iconButton('tbid-layer-add', 'duplicate', '添加视图层\n添加视图层（新建、复制设置或禁用所有集合）', (e) => openMenu(viewLayerAddMenu(), e.currentTarget as HTMLElement, { title: '添加视图层' })),
    iconButton('tbid-layer-remove', 'x', layers.length > 1 ? '移除视图层\n移除当前活动视图层' : '移除视图层\n场景必须包含至少一个视图层', () => app.run('scene.view_layer_remove'), layers.length < 2),
  );
}

topbarSceneWidgets.push(sceneSelector, viewLayerSelector);
