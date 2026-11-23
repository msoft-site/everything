// Getting started: a short, skippable tour of callouts anchored to the main
// areas (playback mode, channel rack, piano roll, playlist, mixer, browser),
// ending with the essential shortcuts. Opened from Help or the alpha notice,
// never automatically. Arrow keys step through it and Escape ends it.

import { h, announce } from '../lib/dom.js';
import { formatKeys } from '../commands/registry.js';

const STEPS = [
  {
    anchor: '.mode-seg',
    title: '样式模式与歌曲模式',
    text: '“样式 (PAT)”模式会在您编写时循环播放当前选中的样式。“歌曲 (SONG)”模式则播放播放列表中的编排内容。',
    keys: [['Space', '播放或停止'], ['L', '切换模式']],
  },
  {
    anchor: '.panel-rack',
    panel: 'rack',
    title: '通道机架',
    text: '每一行代表一件乐器。点击步进格即可编写节拍；编辑时样式会自动循环播放。',
    keys: [['F6', '显示通道机架']],
  },
  {
    anchor: '.panel-pianoRoll',
    panel: 'pianoRoll',
    title: '钢琴卷帘',
    text: '为选中的通道绘制旋律与和弦。音符具有长度、力度和声像属性。',
    keys: [['F7', '显示钢琴卷帘']],
  },
  {
    anchor: '.panel-playlist',
    panel: 'playlist',
    title: '播放列表',
    text: '将样式、音频和自动化片段编排成完整歌曲。可从浏览器中直接拖入样式。',
    keys: [['F5', '显示播放列表']],
  },
  {
    anchor: '.panel-mixer',
    panel: 'mixer',
    title: '混音器',
    text: '每个通道都会输出到一个混音器轨道。在此调节电平、添加效果器并配置发送路由。',
    keys: [['F9', '显示混音器']],
  },
  {
    anchor: '.panel-browser',
    panel: 'browser',
    title: '浏览器',
    text: '汇集乐器、预设、效果器、工程各组成部分及您的文件。单击可试听，双击或拖拽即可添加。',
    keys: [['Alt+F8', '显示浏览器']],
  },
  {
    title: '常用快捷键',
    text: '将鼠标悬停在任意按钮上即可查看其快捷键。完整列表位于“帮助 > 键盘快捷键”。',
    keys: [['Mod+S', '保存'], ['Mod+Z', '撤销'], ['Mod+Shift+Z', '重做'], ['Mod+R', '导出音频'], ['?', '所有快捷键']],
  },
];

let active = null;

export function startTour(app) {
  active?.end();
  const previous = document.activeElement;
  const phonePanel = app.prefs.get('mobilePanel');
  let index = 0;
  const opened = new Set(); // panels the tour opened (desktop), closed when it ends
  const titleId = 'tour-title';
  const ring = h('div.tour-ring', { 'aria-hidden': 'true' });
  const title = h('h2.tour-title', { id: titleId });
  const text = h('p.tour-text');
  const keys = h('dl.tour-keys');
  const counter = h('span.tour-count');
  const back = h('button.btn.sm', { type: 'button', onclick: () => go(index - 1) }, '上一步');
  const next = h('button.btn.sm.primary', { type: 'button', onclick: () => (index === STEPS.length - 1 ? end() : go(index + 1)) }, '下一步');
  const skip = h('button.btn.sm.ghost', { type: 'button', onclick: () => end() }, '跳过导览');
  const pop = h(
    'div.tour',
    { role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': titleId, tabindex: '-1' },
    h('div.tour-head', title, counter),
    text,
    keys,
    h('div.tour-foot', skip, h('div.spacer'), back, next),
  );
  document.body.append(ring, pop);

  const anchorFor = (step) => {
    if (!step.anchor) return null;
    const el = document.querySelector(step.anchor);
    if (!el || el.hidden || el.offsetParent === null) return null;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 ? r : null;
  };

  const place = () => {
    const step = STEPS[index];
    const r = anchorFor(step);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    ring.hidden = !r;
    if (!r) {
      pop.style.left = `${Math.max(8, (vw - pw) / 2)}px`;
      pop.style.top = `${Math.max(8, (vh - ph) / 2)}px`;
      return;
    }
    const pad = 4;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // Prefer below a small anchor, else inside the anchor's top-left area for large panels.
    let left;
    let top;
    if (r.height < vh / 3) {
      left = r.left;
      top = r.bottom + 10;
      if (top + ph > vh - 8) top = r.top - ph - 10;
    } else {
      left = r.left + 16;
      top = r.top + 40;
    }
    pop.style.left = `${Math.round(Math.min(Math.max(8, left), vw - pw - 8))}px`;
    pop.style.top = `${Math.round(Math.min(Math.max(8, top), vh - ph - 8))}px`;
  };

  function go(i) {
    index = Math.max(0, Math.min(STEPS.length - 1, i));
    const step = STEPS[index];
    // On phones one panel shows at a time: switch to the step's panel. On
    // larger screens open a closed panel for its step (closed again at the end).
    if (step.panel && app.root.classList.contains('is-phone')) app.shell?.showMobile?.(step.panel);
    else if (step.panel && app.shell && !app.shell.isVisible(step.panel)) {
      app.shell.show(step.panel, { focus: false });
      if (app.shell.isVisible(step.panel)) opened.add(step.panel);
    }
    title.textContent = step.title;
    text.textContent = step.text;
    keys.replaceChildren(...step.keys.flatMap(([k, label]) => [h('dt', h('kbd.kbd', k === '?' ? '?' : formatKeys(k))), h('dd', label)]));
    counter.textContent = `${index + 1} / ${STEPS.length}`;
    back.disabled = index === 0;
    next.textContent = index === STEPS.length - 1 ? '完成' : '下一步';
    requestAnimationFrame(place);
    place();
    pop.focus({ preventScroll: true });
    announce(`${step.title}。${step.text}`);
  }

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      end();
    } else if (e.key === 'ArrowRight' && !e.target.closest?.('input, textarea')) {
      e.preventDefault();
      if (index < STEPS.length - 1) go(index + 1);
    } else if (e.key === 'ArrowLeft' && !e.target.closest?.('input, textarea')) {
      e.preventDefault();
      go(index - 1);
    }
  };
  pop.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);

  function end() {
    pop.remove();
    ring.remove();
    window.removeEventListener('resize', place);
    active = null;
    // Phones: return to the view the tour started from.
    if (app.root.classList.contains('is-phone') && app.prefs.get('mobilePanel') !== phonePanel) app.shell?.showMobile?.(phonePanel);
    else for (const id of opened) app.shell?.hide?.(id);
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  }
  active = { end };
  go(0);
  return active;
}

/** Adds "Take the tour" to the first-run alpha notice when it is showing. */
export function offerTourFromAlphaNotice(app) {
  const actions = document.querySelector('.alpha-notice .alpha-actions');
  if (!actions || actions.querySelector('.tour-offer')) return;
  const gotIt = actions.querySelector('button');
  actions.prepend(
    h(
      'button.btn.sm.tour-offer',
      {
        type: 'button',
        onclick: () => {
          gotIt?.click();
          startTour(app);
        },
      },
      '开始导览',
    ),
  );
}
