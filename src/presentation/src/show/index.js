// Slide Show and Record: the commands of the Slide Show and Record tabs and
// menu, how a show is planned from the file's setup, the session that runs
// beside it (session.js), and what happens when it ends: keeping ink,
// rehearsed timings and recordings.
import "./show.css";
import "./icons.js";
import { el, dialog, toast } from "../ui.js";
import {
  showPrefs,
  SPOKEN_LANGUAGES,
  SUBTITLE_POSITIONS,
  spokenLanguage,
} from "./prefs.js";
import { createShowSession } from "./session.js";
import { openAudienceWindow } from "./audience.js";
import { openSetUpShowDialog } from "./setup-dialog.js";
import { openCustomShowsDialog } from "./custom-shows.js";
import { addInkStroke, MM as INK_MM } from "../draw/ink-model.js";
import { formatClock } from "./rehearse.js";
import {
  addNarration,
  hasNarration,
  isNarration,
  narrationOf,
  removeNarrations,
  setSlideAdvance,
  slideNarrations,
} from "./narration.js";
import {
  CAMERA_SVG,
  addCameraShape,
  cameraShapeKind,
  isCameraShape,
} from "./camera.js";
import { SPEAKER_SVG } from "../insert/media.js";
import { svgToPng } from "../insert/util.js";

/**
 * ctx: { P, doc(), slide(), index(), present(options), mutate(fn),
 *        mutateSlide(slide, fn), fail(e), slideBounds(pres, shape),
 *        picture(slide), title(slide), currentSize(), exportVideo(),
 *        selectedSlides() }
 */
export function createShowFeatures(ctx) {
  const { P } = ctx;
  const pres = () => ctx.doc().pres;
  const run = (fn) => () => Promise.resolve(fn()).catch(ctx.fail);
  const setup = () => {
    try {
      return P.getSlideShowSetup(pres());
    } catch {
      return P.DEFAULT_SLIDE_SHOW_SETUP;
    }
  };
  const customShows = () => {
    try {
      return P.getCustomShows(pres());
    } catch {
      return [];
    }
  };

  // ---- Planning a show ---------------------------------------------------
  /** Runs first, inside the command that starts the show, so a second
   * window for the audience can still be opened. */
  function begin(options = {}) {
    const out = { ...options };
    const quiet = out.reading || out.rehearse || out.record;
    if (
      !quiet &&
      out.presenter === undefined &&
      showPrefs.usePresenterView &&
      globalThis.screen?.isExtended
    )
      out.presenter = true;
    if (out.presenter && out.audience === undefined)
      out.audience = globalThis.screen?.isExtended
        ? openAudienceWindow()
        : undefined;
    return out;
  }
  /** The show's plan: which slides, how it advances, how it shows. */
  function plan(presentation, options = {}) {
    const s = (() => {
      try {
        return P.getSlideShowSetup(presentation);
      } catch {
        return P.DEFAULT_SLIDE_SHOW_SETUP;
      }
    })();
    let selection = null;
    if (options.customShow != null) {
      const show = P.getCustomShows(presentation).find(
        (x) => x.id === options.customShow,
      );
      if (!show) throw Error("The custom slide show was not found.");
      selection = {
        kind: "custom",
        id: show.id,
        slidePartNames: show.slides.map((x) => P.getSlidePartName(x)),
      };
    }
    const practising = !!(options.rehearse || options.record);
    const kiosk = s.showType === "kiosk" && !practising;
    return {
      setup: s,
      selection,
      reading:
        !!options.reading ||
        (s.showType === "browse" && !practising && !options.presenter),
      timing: (base) => ({
        useTimings: practising ? false : kiosk ? true : base.useTimings,
        loop: practising ? false : kiosk ? true : base.loop,
      }),
    };
  }

  // ---- After the show ----------------------------------------------------
  let speakerPng = null;
  async function afterShow(result) {
    try {
      if (result.recording) await saveRecording(result.recording);
      if (result.ink.length) await keepInk(result.ink);
      if (result.rehearsal?.timings.length) await keepTimings(result.rehearsal);
    } catch (error) {
      ctx.fail(error);
    }
  }
  const slideByPart = (presentation, partName) =>
    P.getSlides(presentation).find((s) => P.getSlidePartName(s) === partName);
  async function keepInk(entries) {
    const count = entries.reduce((n, [, strokes]) => n + strokes.length, 0);
    const keep = await dialog({
      title: "保留墨迹注释？",
      body: el(
        "div",
        { class: "dialog-body" },
        el(
          "p",
          {},
          `You drew ${count} ink stroke${count === 1 ? "" : "s"} during the slide show. Keep ${count === 1 ? "it" : "them"} on the slides, where ink can be moved, replayed or deleted like other drawings?`,
        ),
      ),
      actions: [
        { label: "放弃", value: false, kind: "secondary" },
        { label: "保留墨迹", value: true, kind: "primary" },
      ],
    });
    if (!keep) return;
    await ctx.mutate(() => {
      const presentation = pres();
      const width = P.getSlideSize(presentation)?.width || 12192000;
      for (const [partName, strokes] of entries) {
        const slide = slideByPart(presentation, partName);
        if (!slide) continue;
        // As the Draw tab's ink, with when each point was drawn.
        for (const stroke of strokes)
          addInkStroke(
            P,
            slide,
            stroke.points.map(({ x, y }) => ({ x, y })),
            {
              type: stroke.tool === "highlighter" ? "highlighter" : "pen",
              color: stroke.color,
              width: stroke.width / (INK_MM * 12700),
              texture: "solid",
            },
            {
              tolerance: width / 2000,
              times: stroke.points.map((p) => p.t ?? 0),
              start: stroke.start ?? null,
            },
          );
      }
    });
  }
  async function keepTimings({ timings, totalMs }) {
    const keep = await dialog({
      title: "保留新的幻灯片排练时间？",
      body: el(
        "div",
        { class: "dialog-body" },
        el(
          "p",
          {},
          `The rehearsal took ${formatClock(totalMs)}. Keep the times you spent on each slide, so the show moves on by itself at the same pace?`,
        ),
      ),
      actions: [
        { label: "不保留", value: false, kind: "secondary" },
        { label: "保留排练时间", value: true, kind: "primary" },
      ],
    });
    if (!keep) return;
    await ctx.mutate(() => {
      const presentation = pres();
      for (const [partName, ms] of timings) {
        const slide = slideByPart(presentation, partName);
        if (slide) setSlideAdvance(P, slide, Math.round(ms / 10) * 10);
      }
      P.setSlideShowSetup(presentation, { useTimings: true });
    });
    toast(
      `Timings kept on ${timings.length} slide${timings.length === 1 ? "" : "s"}.`,
    );
  }
  async function saveRecording({ segments, cleared }) {
    const recorded = await segments;
    if (!recorded.length && !cleared.length) return;
    speakerPng ??= await svgToPng(SPEAKER_SVG, 128, 128);
    await ctx.mutate(() => {
      const presentation = pres();
      const size = ctx.currentSize();
      for (const partName of cleared) {
        const slide = slideByPart(presentation, partName);
        if (slide) removeNarrations(P, slide);
      }
      for (const r of recorded) {
        const slide = slideByPart(presentation, r.part);
        if (!slide) continue;
        // A recording with the camera takes the place of a live camera on
        // the slide; Reset to Camera puts the camera back.
        let box = null;
        let shape = r.shape;
        const camera =
          r.kind === "video" &&
          P.getSlideShapes(slide).find((x) => isCameraShape(P, x));
        if (camera) {
          const b = P.getShapeBounds(camera);
          if (b) box = { x: b.x, y: b.y, w: b.w, h: b.h };
          shape = cameraShapeKind(P, camera);
          P.removeShape(camera);
        }
        addNarration(
          P,
          slide,
          { ...r, shape, box, poster: r.poster || speakerPng },
          size,
        );
        setSlideAdvance(P, slide, r.durationMs);
      }
      P.setSlideShowSetup(presentation, {
        useTimings: true,
        showNarration: true,
      });
    });
    if (recorded.length)
      toast(
        `Recording saved on ${recorded.length} slide${recorded.length === 1 ? "" : "s"}.`,
      );
  }

  // ---- The session beside a running show ---------------------------------
  let afterLastShow = Promise.resolve();
  function session(show) {
    return createShowSession(
      {
        P,
        slideBounds: ctx.slideBounds,
        customShows,
        isNarration: (shape) => isNarration(P, shape),
        title: () => ctx.doc()?.name,
        playCustomShow: async (id, running) => {
          running.close();
          // The ended show's questions (keep ink?) come first.
          await afterLastShow;
          ctx.present({ customShow: id, from: "beginning" });
        },
        afterShow: (result) => (afterLastShow = afterShow(result)),
      },
      show,
    );
  }

  // ---- Commands ----------------------------------------------------------
  const presenterView = () =>
    ctx.present(begin({ presenter: true, from: "current" }));
  const rehearse = () => ctx.present({ rehearse: true, from: "beginning" });
  const record = (from) => ctx.present({ record: true, from });
  const setUpShow = () =>
    openSetUpShowDialog({ P, pres, mutate: ctx.mutate, customShows });
  const customShowsDialog = () =>
    openCustomShowsDialog({
      P,
      pres,
      mutate: ctx.mutate,
      picture: ctx.picture,
      title: ctx.title,
      play: (id) => ctx.present({ customShow: id, from: "beginning" }),
    });
  const customShowMenu = () => [
    ...customShows().map((s) => ({
      label: s.name || `Custom show ${s.id + 1}`,
      icon: "o:customShow",
      onSelect: run(() => ctx.present({ customShow: s.id, from: "beginning" })),
    })),
    ...(customShows().length ? [{ separator: true }] : []),
    {
      label: "Custom Shows…",
      icon: "o:customShow",
      onSelect: run(customShowsDialog),
    },
  ];
  const setFlag = (key) => (on) =>
    ctx.mutate(() => P.setSlideShowSetup(pres(), { [key]: !!on }));
  const subtitleSettingsMenu = () => [
    {
      label: "讲话语言",
      items: SPOKEN_LANGUAGES.map(([code, name]) => ({
        label: name,
        checked: spokenLanguage() === code,
        onSelect: () => (showPrefs.subtitleLanguage = code),
      })),
    },
    { separator: true },
    ...SUBTITLE_POSITIONS.map(([value, label]) => ({
      label,
      checked: showPrefs.subtitlePosition === value,
      onSelect: () => (showPrefs.subtitlePosition = value),
    })),
  ];
  const slideNarrated = () => {
    try {
      return P.getSlides(pres()).some((s) => hasNarration(P, s));
    } catch {
      return false;
    }
  };
  const clearItems = () => [
    {
      label: "清除当前幻灯片上的录制",
      disabled: !hasNarration(P, ctx.slide()),
      onSelect: run(() => clearRecordings(false)),
    },
    {
      label: "清除所有幻灯片上的录制",
      disabled: !slideNarrated(),
      onSelect: run(() => clearRecordings(true)),
    },
    { separator: true },
    {
      label: "清除当前幻灯片上的旁白和排练时间",
      onSelect: run(() =>
        ctx.mutateSlide(ctx.slide(), (s) => setSlideAdvance(P, s, null)),
      ),
    },
    {
      label: "清除所有幻灯片上的旁白和排练时间",
      onSelect: run(() =>
        ctx.mutate(() =>
          P.getSlides(pres()).forEach((s) => setSlideAdvance(P, s, null)),
        ),
      ),
    },
  ];
  function clearRecordings(all) {
    return ctx.mutate(() => {
      const slides = all ? P.getSlides(pres()) : [ctx.slide()];
      let any = false;
      for (const s of slides) any = removeNarrations(P, s) || any;
      if (!any) return ctx.SKIP;
    });
  }
  let cameraPng = null;
  async function insertCamera(shape = showPrefs.cameraShape) {
    cameraPng ??= await svgToPng(CAMERA_SVG, 320, 320);
    const svg = new TextEncoder().encode(CAMERA_SVG);
    await ctx.mutateSlide(ctx.slide(), (slide) => {
      const picture = addCameraShape(P, slide, {
        png: cameraPng,
        svg,
        size: ctx.currentSize(),
        shape,
      });
      ctx.select?.([P.getShapeId(picture)]);
    });
  }
  // Swaps the recordings on slides for live cameras where they were.
  function resetToCamera(all) {
    return ctx.mutate(async () => {
      cameraPng ??= await svgToPng(CAMERA_SVG, 320, 320);
      const slides = all ? P.getSlides(pres()) : [ctx.slide()];
      let any = false;
      for (const s of slides) {
        if (!hasNarration(P, s)) continue;
        // The camera goes back where a recording with the camera was.
        const video = slideNarrations(P, s).find(
          (x) => P.getShapeMediaKind(x) === "video",
        );
        const b = video && P.getShapeBounds(video);
        const kind = video
          ? P.getShapeObjectData(video)?.shape === "rect"
            ? "rect"
            : "circle"
          : showPrefs.cameraShape;
        removeNarrations(P, s);
        if (!P.getSlideShapes(s).some((x) => isCameraShape(P, x)))
          addCameraShape(P, s, {
            png: cameraPng,
            svg: new TextEncoder().encode(CAMERA_SVG),
            size: ctx.currentSize(),
            shape: kind,
            box: b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null,
          });
        any = true;
      }
      if (!any) return ctx.SKIP;
    });
  }

  // ---- Ribbon --------------------------------------------------------------
  function ribbonApi() {
    return {
      presenterView: run(presenterView),
      customShowMenu,
      setUpShow: run(setUpShow),
      rehearse: run(rehearse),
      recordShowMenu: () => [
        {
          label: "Record from Beginning…",
          icon: "o:recordFromStart",
          onSelect: run(() => record("beginning")),
        },
        {
          label: "Record from Current Slide…",
          icon: "o:recordFromCurrent",
          onSelect: run(() => record("current")),
        },
        { separator: true },
        { label: "清除", items: clearItems() },
        { separator: true },
        {
          label: "Export to Video…",
          icon: "o:exportVideo",
          onSelect: run(() => ctx.exportVideo()),
        },
      ],
      recordFromCurrent: run(() => record("current")),
      useTimings: () => setup().useTimings,
      setUseTimings: setFlag("useTimings"),
      playNarrations: () => setup().showNarration,
      setPlayNarrations: setFlag("showNarration"),
      showMediaControls: () => setup().showMediaControls,
      setShowMediaControls: setFlag("showMediaControls"),
      alwaysSubtitles: () => !!showPrefs.alwaysSubtitles,
      setAlwaysSubtitles: (on) => (showPrefs.alwaysSubtitles = !!on),
      subtitleSettingsMenu,
    };
  }
  function recordTab() {
    return {
      id: "record",
      label: "录制",
      after: "slideshow",
      groups: [
        {
          id: "record-camera",
          label: "摄像头",
          icon: "liveCamera",
          items: [
            {
              type: "large",
              id: "insert-camera",
              label: "Live\nCamera",
              icon: "liveCamera",
              title: "插入实时摄像头",
              description:
                "Place your camera on the slide. It shows you live while you present.",
              run: run(() => insertCamera()),
            },
          ],
        },
        {
          id: "record-start",
          label: "录制",
          icon: "recordFromStart",
          items: [
            {
              type: "large",
              id: "record-from-start",
              label: "From\nBeginning",
              icon: "recordFromStart",
              title: "从头开始录制",
              description:
                "Record your voice, camera and ink as you present, starting with the first slide.",
              run: run(() => record("beginning")),
            },
            {
              type: "large",
              id: "record-from-current",
              label: "From Current\nSlide",
              icon: "recordFromCurrent",
              title: "从当前幻灯片开始录制",
              description: "Record your presentation starting with this slide.",
              run: run(() => record("current")),
            },
          ],
        },
        {
          id: "record-edit",
          label: "编辑",
          icon: "clearRecording",
          items: [
            {
              type: "large",
              id: "clear-recording",
              label: "Clear\nRecording",
              icon: "clearRecording",
              title: "清除录制",
              description: "Remove recorded narrations and timings.",
              menu: clearItems,
            },
            {
              type: "large",
              id: "reset-to-camera",
              label: "Reset to\nCamera",
              icon: "resetToCamera",
              title: "重置为实时摄像头",
              description:
                "Remove recordings and put a live camera where they were.",
              enabled: () => slideNarrated(),
              menu: () => [
                {
                  label: "重置当前幻灯片",
                  disabled: !hasNarration(P, ctx.slide()),
                  onSelect: run(() => resetToCamera(false)),
                },
                {
                  label: "重置所有幻灯片",
                  onSelect: run(() => resetToCamera(true)),
                },
              ],
            },
          ],
        },
        {
          id: "record-save",
          label: "保存",
          icon: "exportVideo",
          items: [
            {
              type: "large",
              id: "export-video",
              label: "Export to\nVideo",
              icon: "exportVideo",
              title: "导出为视频",
              description:
                "Save the presentation, with its recordings and timings, as a video.",
              run: run(() => ctx.exportVideo()),
            },
          ],
        },
      ],
    };
  }

  // ---- Menu bar and shortcuts --------------------------------------------
  function menuItems() {
    return [
      {
        label: "自定义幻灯片放映",
        icon: "o:customShow",
        items: customShowMenu(),
      },
      { separator: true },
      {
        label: "使用演示者视图",
        icon: "o:presenterView",
        shortcut: "Alt+F5",
        onSelect: run(presenterView),
      },
      {
        label: "排练计时",
        icon: "o:rehearse",
        onSelect: run(rehearse),
      },
      {
        label: "录制幻灯片放映",
        icon: "o:recordShow",
        items: ribbonApi().recordShowMenu(),
      },
      { separator: true },
      {
        label: "Set Up Slide Show…",
        icon: "o:setUpShow",
        onSelect: run(setUpShow),
      },
      { separator: true },
      {
        label: "始终使用字幕",
        checked: !!showPrefs.alwaysSubtitles,
        onSelect: () =>
          (showPrefs.alwaysSubtitles = !showPrefs.alwaysSubtitles),
      },
      {
        label: "字幕设置",
        icon: "o:subtitleSettings",
        items: subtitleSettingsMenu(),
      },
    ];
  }
  /** Editor shortcuts: Alt+F5 presenter view; Mod+Shift+Enter and
   * Mod+Enter play from the start and from the current slide; Alt+Enter
   * presenter view. Returns whether the key was used. */
  function onKey(e, { typing }) {
    if (e.key === "F5" && e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      presenterView().catch?.(ctx.fail);
      return true;
    }
    if (typing || e.key !== "Enter") return false;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey) {
      e.preventDefault();
      ctx
        .present({ from: e.shiftKey ? "beginning" : "current" })
        .catch?.(ctx.fail);
      return true;
    }
    if (e.altKey && !mod && !e.shiftKey) {
      e.preventDefault();
      presenterView().catch?.(ctx.fail);
      return true;
    }
    return false;
  }

  return {
    begin,
    plan,
    session,
    ribbonApi,
    recordTab,
    menuItems,
    onKey,
    insertCamera,
    // A slide's narration for video export, with the camera picture's box
    // as fractions of the slide.
    narrationOf: (slide) => {
      const n = narrationOf(P, slide);
      if (!n) return null;
      const size = P.getSlideSize(pres()) || {
        width: 12192000,
        height: 6858000,
      };
      const b = n.bounds;
      return {
        ...n,
        box: b
          ? {
              x: b.x / size.width,
              y: b.y / size.height,
              w: b.w / size.width,
              h: b.h / size.height,
            }
          : null,
      };
    },
    isNarration: (shape) => isNarration(P, shape),
  };
}
