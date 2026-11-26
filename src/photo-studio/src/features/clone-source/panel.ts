// Clone Source panel: five source slots, the active source's offset, scale,
// rotation and flips, and the source overlay settings.
import type { Editor } from '../../editor';
import { registerCommand, registerPanel, type Panel } from '../../app/registry';
import { svg } from '../../app/icons';
import { escapeXML } from '../../model/assets';
import { identityCloneTransform, type CloneTransform } from '../../imaging/retouch/clone-transform';
import { SOURCE_COUNT, activeSource, cloneSourceChanged, cloneState, onCloneSourceChange, type OverlaySettings } from './state';
import './clone-source.css';

const transformOf = (): CloneTransform => activeSource() ?? cloneState.pending;
const round = (v: number, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d);
const num = (key: string, label: string, title: string, unit: string, attrs: string) =>
  `<label class="cs-field" title="${title}"><span>${label}</span><input type="number" data-cs="${key}" aria-label="${title}" ${attrs}><span class="cs-unit">${unit}</span></label>`;

const clonePanel: Panel = {
  id: 'clone-source',
  title: '仿制源',
  icon: 'copy-plus',
  location: 'strip',
  hidden: true,
  mount: (e, el) => {
    el.classList.add('clone-source-panel');
    el.innerHTML = `<div class="cs-slots" role="radiogroup" aria-label="仿制源">${Array.from({ length: SOURCE_COUNT }, (_, i) => `<button type="button" role="radio" class="cs-slot" data-slot="${i}" aria-label="仿制源 ${i + 1}">${svg('stamp', 16)}<span>${i + 1}</span></button>`).join('')}</div>
<p class="cs-source" aria-live="polite"></p>
<div class="cs-grid">
${num('offsetX', 'X', '水平偏移 X', 'px', 'step="1"')}${num('offsetY', 'Y', '垂直偏移 Y', 'px', 'step="1"')}
${num('scaleW', 'W', '宽度缩放', '%', 'min="1" max="1000" step="1"')}${num('scaleH', 'H', '高度缩放', '%', 'min="1" max="1000" step="1"')}
${num('rotation', '∠', '旋转角度', '°', 'min="-360" max="360" step="0.1"')}
<div class="cs-buttons"><button type="button" class="icon-button toggle" data-cs-toggle="link" title="锁定宽度和高度" aria-label="锁定宽度和高度">${svg('link', 15)}</button><button type="button" class="icon-button toggle" data-cs-toggle="flipH" title="水平翻转" aria-label="水平翻转">${svg('flip-horizontal-2', 15)}</button><button type="button" class="icon-button toggle" data-cs-toggle="flipV" title="垂直翻转" aria-label="垂直翻转">${svg('flip-vertical-2', 15)}</button><button type="button" class="icon-button" data-cs-act="reset" title="重置变换" aria-label="重置变换">${svg('rotate-ccw', 15)}</button></div>
</div>
<fieldset class="cs-overlay"><legend><label><input type="checkbox" data-ov="show"> 显示叠加</label></legend>
<label class="cs-field"><span>不透明度</span><input type="number" min="0" max="100" step="1" data-ov="opacity" aria-label="叠加不透明度"><span class="cs-unit">%</span></label>
<label class="cs-field"><span>混合模式</span><select data-ov="blend" aria-label="叠加混合模式"><option value="normal">正常</option><option value="darken">变暗</option><option value="lighten">变亮</option><option value="difference">差值</option></select></label>
<div class="cs-checks"><label><input type="checkbox" data-ov="clipped"> 剪贴</label><label><input type="checkbox" data-ov="autoHide"> 自动隐藏</label><label><input type="checkbox" data-ov="invert"> 反相</label></div>
</fieldset>
<p class="hint">按住 Alt 键（Option 键）并使用仿制图章或修复画笔单击以设置选定仿制源。源可以来自任何打开的文档。</p>`;
    el.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const slot = t.closest<HTMLElement>('[data-slot]');
      if (slot) {
        cloneState.active = Number(slot.dataset.slot);
        cloneSourceChanged();
        e.overlay();
        return;
      }
      const toggle = t.closest<HTMLElement>('[data-cs-toggle]')?.dataset.csToggle;
      if (toggle === 'link') cloneState.linkScale = !cloneState.linkScale;
      else if (toggle === 'flipH' || toggle === 'flipV') transformOf()[toggle] = !transformOf()[toggle];
      else if (t.closest('[data-cs-act="reset"]')) Object.assign(transformOf(), identityCloneTransform());
      else if (t.closest('[data-cs-act="clear"]')) cloneState.sources[cloneState.active] = undefined;
      else return;
      cloneSourceChanged();
      e.overlay();
    });
    el.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement;
      const ov = t.dataset.ov as keyof OverlaySettings | undefined;
      if (ov) {
        const o = cloneState.overlay as Record<string, unknown>;
        if (t.type === 'checkbox') o[ov] = t.checked;
        else if (ov === 'opacity') o.opacity = Math.max(0, Math.min(100, Number(t.value) || 0));
        else o[ov] = t.value;
        cloneSourceChanged();
        e.overlay();
        return;
      }
      const key = t.dataset.cs;
      const v = Number(t.value);
      if (!key || t.value.trim() === '' || !Number.isFinite(v)) return;
      const tr = transformOf();
      const src = activeSource();
      if (key === 'offsetX' || key === 'offsetY') {
        if (!src) return;
        const o = src.offset ?? [0, 0];
        src.offset = key === 'offsetX' ? [v, o[1]] : [o[0], v];
      } else if (key === 'scaleW' || key === 'scaleH') {
        const s = Math.max(1, Math.min(1000, v));
        if (cloneState.linkScale) tr.scaleW = tr.scaleH = s;
        else tr[key] = s;
      } else if (key === 'rotation') tr.rotation = Math.max(-360, Math.min(360, v));
      cloneSourceChanged();
      e.overlay();
    });
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.target as HTMLElement).matches('input')) (ev.target as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
    });
  },
  update: (_e, el) => sync(el),
  menu: () => ['clone-source.reset-all', 'clone-source.clear-all'],
};

function setValue(el: HTMLInputElement | HTMLSelectElement | null, v: string) {
  if (el && document.activeElement !== el) el.value = v;
}
function sync(el: HTMLElement) {
  const src = activeSource();
  const t = transformOf();
  for (const b of el.querySelectorAll<HTMLElement>('[data-slot]')) {
    const i = Number(b.dataset.slot);
    const s = cloneState.sources[i];
    b.setAttribute('aria-checked', String(i === cloneState.active));
    b.classList.toggle('set', !!s);
    b.title = s ? `源 ${i + 1}: ${s.docName}${s.layerName ? ` — ${s.layerName}` : ''} (${Math.round(s.point[0])}, ${Math.round(s.point[1])})` : `源 ${i + 1}: 未设置`;
  }
  el.querySelector('.cs-source')!.innerHTML = src
    ? `<span>${escapeXML(src.docName)}${src.layerName ? ` — ${escapeXML(src.layerName)}` : ''}</span><span class="cs-point">${Math.round(src.point[0])}, ${Math.round(src.point[1])}</span><button type="button" class="link-button" data-cs-act="clear">清除</button>`
    : '<span class="muted">未设置源</span>';
  const off = src?.offset;
  for (const k of ['offsetX', 'offsetY'] as const) {
    const input = el.querySelector<HTMLInputElement>(`[data-cs="${k}"]`)!;
    input.disabled = !src;
    setValue(input, off ? round(k === 'offsetX' ? off[0] : off[1], 0) : '');
    input.placeholder = src ? '—' : '';
  }
  setValue(el.querySelector(`[data-cs="scaleW"]`), round(t.scaleW));
  setValue(el.querySelector(`[data-cs="scaleH"]`), round(t.scaleH));
  setValue(el.querySelector(`[data-cs="rotation"]`), round(t.rotation));
  const pressed = (k: string, v: boolean) => el.querySelector(`[data-cs-toggle="${k}"]`)!.setAttribute('aria-pressed', String(v));
  pressed('link', cloneState.linkScale);
  pressed('flipH', t.flipH);
  pressed('flipV', t.flipV);
  const o = cloneState.overlay;
  for (const k of ['show', 'clipped', 'autoHide', 'invert'] as const) el.querySelector<HTMLInputElement>(`[data-ov="${k}"]`)!.checked = o[k];
  setValue(el.querySelector('[data-ov="opacity"]'), String(o.opacity));
  setValue(el.querySelector('[data-ov="blend"]'), o.blend);
  el.querySelector('.cs-overlay')!.classList.toggle('off', !o.show);
}

export function installClonePanel(e: Editor) {
  registerPanel(clonePanel);
  onCloneSourceChange(() => {
    const el = document.getElementById('panel-clone-source');
    if (el?.isConnected) sync(el);
  });
  registerCommand(
    {
      id: 'clone-source.reset-all',
      label: '重置所有变换',
      recordable: false,
      run: (e) => {
        for (const s of cloneState.sources) if (s) Object.assign(s, identityCloneTransform());
        cloneState.pending = identityCloneTransform();
        cloneSourceChanged();
        e.overlay();
      },
    },
    {
      id: 'clone-source.clear-all',
      label: '清除所有仿制源',
      recordable: false,
      enabled: () => cloneState.sources.some(Boolean),
      run: (e) => {
        cloneState.sources.fill(undefined);
        cloneSourceChanged();
        e.overlay();
      },
    },
  );
  void e;
}
