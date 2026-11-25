// Video and audio: inserting from a file or a recording, the controls that
// play them on the editing canvas, and the Playback tab with trim, fades,
// volume, how they start in a slide show, looping, poster frames and
// bookmarks.
import { el, dialog, toast, icon, iconButton } from "../ui.js";
import {
  bytesUrl,
  canvasPng,
  encodeWav,
  fieldRow,
  fileBytes,
  formatTime,
  parseTime,
  pickFiles,
  svgToPng,
} from "./util.js";

import {
  AUDIO_ACCEPT,
  VIDEO_ACCEPT,
  START_LABELS,
  MAX_BYTES,
  mediaType,
} from "./media-types.js";
export { AUDIO_ACCEPT, VIDEO_ACCEPT, START_LABELS, mediaType };

// A speaker for audio objects, drawn here.
export const SPEAKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="14" fill="#EEF2F7" stroke="#94A3B8" stroke-width="2"/><path d="M14 26h8l12-10v32L22 38h-8z" fill="#2563EB"/><path d="M40 24c3.5 4.5 3.5 11.5 0 16M45 19c6 7.5 6 18.5 0 26" fill="none" stroke="#2563EB" stroke-width="3.5" stroke-linecap="round"/></svg>`;

function loadMedia(url, kind) {
  return new Promise((resolve, reject) => {
    const media = document.createElement(kind === "video" ? "video" : "audio");
    media.preload = "auto";
    media.muted = true;
    media.playsInline = true;
    media.onloadeddata = async () => {
      // Recordings often carry no duration until the end has been read.
      if (!Number.isFinite(media.duration)) {
        await new Promise((done) => {
          const finish = () => {
            media.removeEventListener("durationchange", check);
            done();
          };
          const check = () => Number.isFinite(media.duration) && finish();
          media.addEventListener("durationchange", check);
          media.currentTime = 1e9;
          setTimeout(finish, 3000);
        });
        media.currentTime = 0;
      }
      resolve(media);
    };
    media.onerror = () =>
      reject(
        new Error(
          `此${kind === "video" ? "视频" : "音频"}无法在浏览器中播放。请选择 ${kind === "video" ? "MP4、WebM 或 MOV" : "MP3、WAV、M4A 或 OGG"} 文件。`,
        ),
      );
    media.src = url;
  });
}

function seek(media, time) {
  return new Promise((resolve) => {
    const done = () => {
      media.removeEventListener("seeked", done);
      resolve();
    };
    media.addEventListener("seeked", done);
    media.currentTime = time;
    setTimeout(done, 1500);
  });
}

/** A PNG of the video's frame at `time` seconds, with its pixel size. */
export async function videoFrame(media, time = 0) {
  if (time != null)
    await seek(
      media,
      Math.min(time, Math.max(0, (media.duration || 0) - 0.05)),
    );
  const scale = Math.min(
    1,
    1280 / Math.max(media.videoWidth, media.videoHeight, 1),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(media.videoWidth * scale));
  canvas.height = Math.max(2, Math.round(media.videoHeight * scale));
  canvas.getContext("2d").drawImage(media, 0, 0, canvas.width, canvas.height);
  return {
    png: await canvasPng(canvas),
    width: canvas.width,
    height: canvas.height,
  };
}

export function createMediaFeatures(ctx) {
  const { P } = ctx;
  const urls = new Map();
  const mediaOf = (obj) =>
    obj && P.getShapeKind(obj) === "picture" ? P.getShapeMedia(obj) : null;
  const isMedia = (obj) =>
    !!obj && P.getShapeKind(obj) === "picture" && !!P.getShapeMediaKind(obj);
  const current = () => {
    const obj = ctx.currentShape();
    return isMedia(obj) && ctx.selectedShapes().length === 1 ? obj : null;
  };
  /** A playable URL for a media object's bytes, made once per part. */
  function urlFor(media) {
    const key = `${media.partName}:${media.data.byteLength}`;
    let entry = urls.get(key);
    if (!entry || entry.data !== media.data) {
      if (entry) URL.revokeObjectURL(entry.url);
      entry = {
        url: bytesUrl(media.data, media.contentType),
        data: media.data,
      };
      urls.set(key, entry);
    }
    entry.pres = ctx.pres();
    return entry.url;
  }
  // URLs made for an earlier presentation (another one opened since, or
  // this one restored by undo) give their bytes back once nothing plays them.
  function releaseUrls() {
    const pres = ctx.pres();
    const playing = new Set([...players.values()].map((p) => p.element.src));
    for (const [key, entry] of urls)
      if (entry.pres !== pres && !playing.has(entry.url)) {
        URL.revokeObjectURL(entry.url);
        urls.delete(key);
      }
  }

  async function insertMediaFile(file, kindWanted) {
    const type = mediaType(file);
    if (!type || (kindWanted && type.kind !== kindWanted))
      throw new Error(
        kindWanted === "audio"
          ? "请选择 MP3、WAV、M4A 或 OGG 音频文件。"
          : "请选择 MP4、WebM 或 MOV 视频文件。",
      );
    if (file.size > MAX_BYTES)
      throw new Error(
        "请选择小于 150 MB 的文件；大型媒体文件会导致演示文稿保存和共享变慢。",
      );
    const data = await fileBytes(file);
    const url = bytesUrl(data, type.contentType);
    try {
      const media = await loadMedia(url, type.kind);
      const durationMs = Number.isFinite(media.duration)
        ? Math.round(media.duration * 1000)
        : 0;
      let poster, width, height;
      if (type.kind === "video") {
        ({ png: poster, width, height } = await videoFrame(media, 0));
      } else {
        poster = await svgToPng(SPEAKER_SVG, 128, 128);
        width = height = 1;
      }
      await placeMedia({
        kind: type.kind,
        data,
        contentType: type.contentType,
        extension: type.extension,
        poster,
        width,
        height,
        name: file.name,
        durationMs,
      });
    } finally {
      URL.revokeObjectURL(url);
    }
    if (file.size > 25 * 1024 * 1024)
      toast("Large media makes the file slower to save and share.");
  }

  async function placeMedia(m) {
    ctx.commitText();
    const size = ctx.currentSize();
    let w, h;
    if (m.kind === "video") {
      w = Math.min(size.cx * 0.6, (size.cy * 0.6 * m.width) / m.height);
      h = (w * m.height) / m.width;
    } else w = h = P.inches(0.6);
    const x = Math.round((size.cx - w) / 2),
      y = Math.round((size.cy - h) / 2);
    let id = null;
    await ctx.mutateSlide(ctx.slide(), (slide) => {
      const shape = P.addSlideMedia(
        slide,
        {
          kind: m.kind,
          data: m.data,
          contentType: m.contentType,
          extension: m.extension,
          poster: m.poster,
        },
        {
          x,
          y,
          w: Math.round(w),
          h: Math.round(h),
          name: m.name.replace(/\.[^.]+$/, "") || undefined,
        },
        { durationMs: m.durationMs, start: "inClickSequence" },
      );
      P.setShapeObjectData(shape, { type: "media", durationMs: m.durationMs });
      P.setShapeDescription(shape, m.name);
      id = P.getShapeId(shape);
      ctx.selectIds([id]);
    });
    ctx.ribbonSelect("playback");
  }

  const insertVideo = async () => {
    const [file] = await pickFiles(VIDEO_ACCEPT);
    if (file) await insertMediaFile(file, "video");
  };
  const insertAudio = async () => {
    const [file] = await pickFiles(AUDIO_ACCEPT);
    if (file) await insertMediaFile(file, "audio");
  };

  // ---- Recording -------------------------------------------------------
  async function recordAudio() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    )
      throw new Error("此浏览器无法录制声音。");
    const name = el("input", {
      class: "input",
      value: "录制的声音",
      maxlength: 120,
      "aria-label": "名称",
    });
    const time = el(
      "span",
      { class: "record-time", role: "timer", "aria-live": "off" },
      "00:00.00",
    );
    const status = el(
      "p",
      { class: "record-status", role: "status" },
      "按“录制”以开始。",
    );
    const level = el(
      "div",
      { class: "record-level", "aria-hidden": "true" },
      el("span"),
    );
    let stream = null,
      recorder = null,
      chunks = [],
      blob = null,
      started = 0,
      timer = 0,
      analyser = null,
      audioCtx = null,
      player = null;
    const recordBtn = el(
      "button",
      { type: "button", class: "btn secondary record-btn" },
      icon("o:recordAudio", 16),
      el("span", {}, "录制"),
    );
    const stopBtn = el(
      "button",
      { type: "button", class: "btn secondary", disabled: true },
      icon("Square", 16),
      el("span", {}, "停止"),
    );
    const playBtn = el(
      "button",
      { type: "button", class: "btn secondary", disabled: true },
      icon("Play", 16),
      el("span", {}, "播放"),
    );
    const insert = el(
      "button",
      { type: "button", class: "btn primary", disabled: true },
      "插入",
    );
    const tick = () => {
      time.textContent = formatTime(Date.now() - started);
      if (analyser) {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        level.firstChild.style.width = `${Math.round(peak * 100)}%`;
      }
    };
    const stopStream = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      clearInterval(timer);
      audioCtx?.close().catch(() => {});
      audioCtx = analyser = null;
      level.firstChild.style.width = "0";
    };
    recordBtn.onclick = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        status.textContent =
          "麦克风不可用。请允许访问麦克风并重试。";
        return;
      }
      chunks = [];
      blob = null;
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        releasePlayer();
        blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        stopStream();
        status.textContent = `已录制 ${time.textContent}。可以回放、重新录制或插入。`;
        playBtn.disabled = insert.disabled = false;
        recordBtn.disabled = false;
        stopBtn.disabled = true;
      };
      try {
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        audioCtx.createMediaStreamSource(stream).connect(analyser);
      } catch {}
      recorder.start();
      started = Date.now();
      timer = setInterval(tick, 50);
      status.textContent = "正在录制… 完成后请按“停止”。";
      recordBtn.disabled = playBtn.disabled = insert.disabled = true;
      stopBtn.disabled = false;
      stopBtn.focus();
    };
    stopBtn.onclick = () => recorder?.state === "recording" && recorder.stop();
    // One URL plays the recording back however often Play is pressed; it
    // goes with the recording.
    let playUrl = null;
    const releasePlayer = () => {
      player?.pause();
      player = null;
      if (playUrl) URL.revokeObjectURL(playUrl);
      playUrl = null;
    };
    playBtn.onclick = () => {
      if (!blob) return;
      if (!playUrl) {
        playUrl = URL.createObjectURL(blob);
        player = new Audio(playUrl);
      }
      player.pause();
      player.currentTime = 0;
      player.play().catch(() => {});
    };
    let chosen = false;
    const body = el(
      "div",
      { class: "dialog-body record-dialog" },
      fieldRow("名称", name),
      el("div", { class: "record-row" }, time, level),
      el("div", { class: "record-row" }, recordBtn, stopBtn, playBtn),
      status,
      el("div", { class: "dialog-inline-actions" }, insert),
    );
    insert.onclick = () => {
      chosen = true;
      body.closest("dialog")?.dispatchEvent(new Event("cancel"));
    };
    await dialog({
      title: "录制声音",
      body,
      confirm: null,
      cancel: "取消",
    });
    if (recorder?.state === "recording") recorder.stop();
    stopStream();
    releasePlayer();
    if (!chosen || !blob) return;
    // Recordings become WAV, which every presentation app plays.
    const decodeCtx = new AudioContext();
    let buffer;
    try {
      buffer = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
    } finally {
      decodeCtx.close().catch(() => {});
    }
    const channels = [
      ...Array(Math.min(2, buffer.numberOfChannels)).keys(),
    ].map((c) => buffer.getChannelData(c));
    const data = encodeWav(channels, buffer.sampleRate);
    const label = name.value.trim() || "录制的声音";
    await placeMedia({
      kind: "audio",
      data,
      contentType: "audio/wav",
      extension: "wav",
      poster: await svgToPng(SPEAKER_SVG, 128, 128),
      width: 1,
      height: 1,
      name: `${label}.wav`,
      durationMs: Math.round(buffer.duration * 1000),
    });
  }

  // ---- Options ---------------------------------------------------------
  const durationOf = (obj) =>
    Number(P.getShapeObjectData(obj)?.durationMs) || 0;
  const options = () => {
    const obj = current();
    return obj ? (mediaOf(obj)?.options ?? null) : null;
  };
  function setOptions(change, obj = current()) {
    if (!obj) return;
    return ctx.mutateShape(obj, (target) => {
      const media = P.getShapeMedia(target);
      if (!media) return;
      P.setShapeMediaOptions(target, {
        ...media.options,
        ...change,
        durationMs: durationOf(target),
      });
    });
  }

  async function trimDialog() {
    const obj = current();
    const media = mediaOf(obj);
    if (!media) return;
    const total = durationOf(obj) || 0;
    const player = document.createElement(
      media.kind === "video" ? "video" : "audio",
    );
    player.src = urlFor(media);
    player.preload = "auto";
    player.controls = false;
    player.className = "trim-player";
    let duration = total / 1000;
    const startInput = el("input", {
      class: "input time-input",
      value: formatTime(media.options.trimStart),
      "aria-label": "开始时间",
    });
    const endInput = el("input", {
      class: "input time-input",
      value: formatTime(Math.max(0, total - media.options.trimEnd)),
      "aria-label": "结束时间",
    });
    const scrub = el("input", {
      type: "range",
      min: 0,
      max: 1000,
      value: 0,
      step: 1,
      class: "trim-scrub",
      "aria-label": "位置",
    });
    const clock = el("span", { class: "trim-clock" }, formatTime(0));
    const range = el(
      "div",
      { class: "trim-range", "aria-hidden": "true" },
      el("span"),
    );
    const startMs = () => parseTime(startInput.value) ?? 0;
    const endMs = () => parseTime(endInput.value) ?? duration * 1000;
    const syncRange = () => {
      const d = duration * 1000 || 1;
      const band = range.firstChild;
      band.style.left = `${(startMs() / d) * 100}%`;
      band.style.width = `${Math.max(0, (endMs() - startMs()) / d) * 100}%`;
    };
    player.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(player.duration)) duration = player.duration;
      if (!total) endInput.value = formatTime(duration * 1000);
      syncRange();
    });
    player.addEventListener("timeupdate", () => {
      clock.textContent = formatTime(player.currentTime * 1000);
      scrub.value = String(
        Math.round((player.currentTime / (duration || 1)) * 1000),
      );
      if (player.currentTime * 1000 >= endMs()) player.pause();
    });
    scrub.addEventListener("input", () => {
      player.currentTime = (Number(scrub.value) / 1000) * duration;
    });
    startInput.addEventListener("change", syncRange);
    endInput.addEventListener("change", syncRange);
    const play = iconButton("播放剪裁部分", "o:mediaPlay", () => {
      if (!player.paused) return player.pause();
      if (
        player.currentTime * 1000 < startMs() ||
        player.currentTime * 1000 >= endMs()
      )
        player.currentTime = startMs() / 1000;
      player.play().catch(() => {});
    });
    const body = el(
      "form",
      { class: "dialog-body trim-dialog" },
      media.kind === "video"
        ? player
        : el("div", { class: "trim-audio" }, icon("o:audio", 32)),
      range,
      el("div", { class: "trim-row" }, play, scrub, clock),
      el(
        "div",
        { class: "trim-row" },
        fieldRow("开始时间", startInput),
        el(
          "button",
          {
            type: "button",
            class: "btn secondary",
            onclick: () => (
              (startInput.value = formatTime(player.currentTime * 1000)),
              syncRange()
            ),
          },
          "设为当前时间",
        ),
      ),
      el(
        "div",
        { class: "trim-row" },
        fieldRow("结束时间", endInput),
        el(
          "button",
          {
            type: "button",
            class: "btn secondary",
            onclick: () => (
              (endInput.value = formatTime(player.currentTime * 1000)),
              syncRange()
            ),
          },
          "设为当前时间",
        ),
      ),
    );
    if (media.kind === "audio") body.prepend(player);
    syncRange();
    const ok = await dialog({
      title: media.kind === "video" ? "剪裁视频" : "剪裁音频",
      body,
      confirm: "确定",
    });
    player.pause();
    if (!ok) return;
    const full = Math.round(duration * 1000);
    const start = Math.max(0, Math.min(startMs(), full));
    const end = Math.max(start, Math.min(endMs(), full));
    if (end - start < 100)
      throw new Error(
        "开始和结束之间请至少保留 0.1 秒。",
      );
    await setOptions(
      { trimStart: start, trimEnd: Math.max(0, full - end) },
      obj,
    );
  }

  async function posterFromCurrentFrame() {
    const obj = current();
    const media = mediaOf(obj);
    if (!media || media.kind !== "video") return;
    const player = players.get(keyOf(obj))?.element;
    const source =
      player && player.readyState >= 2
        ? player
        : await loadMedia(urlFor(media), "video");
    const time = player ? null : media.options.trimStart / 1000;
    const { png } = await videoFrame(source, time);
    await ctx.mutateShape(obj, (target, slide) => {
      P.setShapeVectorPicture(target, { png });
      ctx.pruneMedia(slide);
    });
  }
  async function posterFromFile() {
    const obj = current();
    if (!obj) return;
    const [file] = await pickFiles("image/png,image/jpeg");
    if (!file) return;
    const { bytes } = await ctx.readImage(file);
    await ctx.mutateShape(obj, (target, slide) => {
      P.setShapeImage(target, bytes);
      ctx.pruneMedia(slide);
    });
  }

  async function addBookmark() {
    const obj = current();
    const media = mediaOf(obj);
    if (!media) return;
    const player = players.get(keyOf(obj))?.element;
    if (!player) {
      toast("请播放媒体并在需要添加书签的位置暂停。");
      return;
    }
    const time = Math.round(player.currentTime * 1000);
    const bookmarks = [
      ...media.options.bookmarks,
      { name: `书签 ${media.options.bookmarks.length + 1}`, time },
    ].sort((a, b) => a.time - b.time);
    await setOptions({ bookmarks }, obj);
  }
  async function removeBookmark(index) {
    const media = mediaOf(current());
    if (!media) return;
    const bookmarks = media.options.bookmarks.filter((_, i) => i !== index);
    await setOptions({ bookmarks });
  }

  // ---- Playing on the canvas -------------------------------------------
  const players = new Map();
  const keyOf = (obj) =>
    `${P.getSlidePartName(P.getShapeSlide(obj))}#${P.getShapeId(obj)}`;
  function stopAll(except = null) {
    for (const [key, p] of players)
      if (key !== except) {
        p.element.pause();
        p.surface?.remove();
        players.delete(key);
      }
  }
  function playerFor(obj) {
    const key = keyOf(obj);
    let p = players.get(key);
    const media = mediaOf(obj);
    if (!media) return null;
    if (!p) {
      const element = document.createElement(
        media.kind === "video" ? "video" : "audio",
      );
      element.src = urlFor(media);
      element.preload = "auto";
      element.playsInline = true;
      element.className = "media-surface";
      element.setAttribute("aria-hidden", "true");
      p = {
        element,
        kind: media.kind,
        surface: media.kind === "video" ? element : null,
      };
      players.set(key, p);
      element.addEventListener("loadedmetadata", () => {
        const o = mediaOf(obj)?.options ?? media.options;
        element.currentTime = o.trimStart / 1000;
      });
    }
    p.options = media.options;
    p.element.volume = media.options.muted ? 0 : media.options.volume;
    return p;
  }

  function decorate(canvas) {
    canvas.querySelectorAll(".media-bar").forEach((n) => n.remove());
    const slide = ctx.slide();
    const size = ctx.currentSize();
    const visible = new Set(ctx.visibleShapes(slide).map(P.getShapeId));
    const keep = new Set();
    for (const obj of P.getSlideShapes(slide)) {
      if (!isMedia(obj) || !visible.has(P.getShapeId(obj))) continue;
      const b = ctx.slideBounds(obj);
      if (!b) continue;
      const key = keyOf(obj);
      keep.add(key);
      const p = players.get(key);
      const pos = (node, top) => {
        node.style.left = `${(b.x / size.cx) * 100}%`;
        node.style.width = `${(b.w / size.cx) * 100}%`;
        node.style.top = `${(top / size.cy) * 100}%`;
      };
      if (p?.surface) {
        pos(p.surface, b.y);
        p.surface.style.height = `${(b.h / size.cy) * 100}%`;
        if (!p.surface.isConnected) canvas.append(p.surface);
      }
      const selected = ctx.selectedIds().has(P.getShapeId(obj));
      const bar = mediaBar(obj, selected);
      // Under the object, or inside its foot when that would leave the slide.
      const below = b.y + b.h + size.cy * 0.07 < size.cy;
      pos(bar, below ? b.y + b.h : b.y + b.h - size.cy * 0.07);
      canvas.append(bar);
    }
    // Media on another slide, or deleted, stops.
    for (const [key, p] of [...players])
      if (!keep.has(key)) {
        p.element.pause();
        p.surface?.remove();
        players.delete(key);
      }
    releaseUrls();
  }

  function mediaBar(obj, selected) {
    const p = players.get(keyOf(obj));
    const media = mediaOf(obj);
    const playing = p && !p.element.paused;
    const total =
      (durationOf(obj) || 0) -
      (media?.options.trimStart ?? 0) -
      (media?.options.trimEnd ?? 0);
    const time = el(
      "span",
      { class: "media-time" },
      formatTime(
        p ? p.element.currentTime * 1000 - (media?.options.trimStart ?? 0) : 0,
      ),
    );
    const scrub = el("input", {
      type: "range",
      class: "media-scrub",
      min: 0,
      max: 1000,
      step: 1,
      value:
        p && total > 0
          ? Math.round(
              ((p.element.currentTime * 1000 - media.options.trimStart) /
                total) *
                1000,
            )
          : 0,
      "aria-label": "位置",
      oninput: (e) => {
        const player = playerFor(obj);
        player.element.currentTime =
          (media.options.trimStart + (Number(e.target.value) / 1000) * total) /
          1000;
      },
    });
    const play = iconButton(
      playing ? "暂停" : "播放",
      playing ? "o:mediaPause" : "o:mediaPlay",
      (e) => {
        e.stopPropagation();
        toggle(obj);
      },
    );
    const volumeOn = !media?.options.muted && (media?.options.volume ?? 1) > 0;
    const mute = iconButton(
      volumeOn ? "静音" : "取消静音",
      volumeOn ? "o:volume" : "o:mute",
      (e) => {
        e.stopPropagation();
        setOptions({ muted: volumeOn }, obj);
      },
    );
    const bar = el(
      "div",
      {
        class: `media-bar ${selected ? "selected" : ""} ${playing ? "playing" : ""}`,
        role: "group",
        "aria-label": `${media?.kind === "audio" ? "音频" : "视频"}控件`,
        onpointerdown: (e) => e.stopPropagation(),
        onclick: (e) => e.stopPropagation(),
      },
      play,
      scrub,
      time,
      mute,
    );
    if (p) {
      const update = () => {
        if (!bar.isConnected)
          return p.element.removeEventListener("timeupdate", update);
        const at = p.element.currentTime * 1000 - media.options.trimStart;
        time.textContent = formatTime(at);
        if (total > 0) scrub.value = String(Math.round((at / total) * 1000));
        // Stop at the trimmed end.
        if (
          p.element.currentTime * 1000 >=
          (durationOf(obj) || Infinity) - media.options.trimEnd
        ) {
          p.element.pause();
          if (!media.options.loop) ctx.refreshCanvas();
          else p.element.currentTime = media.options.trimStart / 1000;
        }
      };
      p.element.addEventListener("timeupdate", update);
    }
    return bar;
  }

  function toggle(obj) {
    const p = playerFor(obj);
    if (!p) return;
    stopAll(keyOf(obj));
    if (p.element.paused) {
      const o = p.options;
      const end = (durationOf(obj) || Infinity) - o.trimEnd;
      if (
        p.element.currentTime * 1000 < o.trimStart ||
        p.element.currentTime * 1000 >= end - 30
      )
        p.element.currentTime = o.trimStart / 1000;
      p.element.onpause = p.element.onplay = () => ctx.refreshCanvas();
      p.element
        .play()
        .catch(() => toast("This media could not be played in the browser."));
    } else p.element.pause();
    ctx.refreshCanvas();
  }

  // ---- Playback tab ----------------------------------------------------
  const kind = () => (current() ? P.getShapeMediaKind(current()) : null);
  const playbackTab = () => ({
    id: "playback",
    label: "播放",
    contextual: true,
    visible: () => !!current(),
    groups: [
      {
        id: "playback-preview",
        label: "预览",
        icon: "mediaPlay",
        items: [
          {
            type: "large",
            id: "playback-play",
            label: "播放",
            icon: "mediaPlay",
            title: "播放",
            description: "在此处播放所选的视频或音频。",
            run: () => current() && toggle(current()),
          },
        ],
      },
      {
        id: "playback-bookmarks",
        label: "书签",
        icon: "bookmark",
        items: [
          {
            type: "stack",
            items: [
              {
                type: "small",
                id: "playback-add-bookmark",
                label: "添加书签",
                icon: "bookmarkAdd",
                description: "标记当前的播放位置。",
                run: () => addBookmark().catch(ctx.fail),
              },
              {
                type: "small",
                id: "playback-remove-bookmark",
                label: "删除书签",
                icon: "bookmarkRemove",
                enabled: () => !!options()?.bookmarks.length,
                menu: () =>
                  (options()?.bookmarks ?? []).map((b, i) => ({
                    label: `${b.name} (${formatTime(b.time)})`,
                    onSelect: () => removeBookmark(i).catch(ctx.fail),
                  })),
              },
            ],
          },
        ],
      },
      {
        id: "playback-editing",
        label: "编辑",
        icon: "trim",
        items: [
          {
            type: "large",
            id: "playback-trim",
            label: "剪裁",
            icon: "trim",
            title: "剪裁",
            description: "从开头和结尾剪裁时间。",
            run: () => trimDialog().catch(ctx.fail),
          },
          {
            type: "stack",
            items: [
              {
                type: "spin",
                id: "playback-fade-in",
                label: "淡入",
                width: 70,
                min: 0,
                max: 60,
                step: 0.25,
                format: (n) => `${n.toFixed(2)}`,
                value: () => (options()?.fadeIn ?? 0) / 1000,
                commit: (n) => setOptions({ fadeIn: Math.round(n * 1000) }),
              },
              {
                type: "spin",
                id: "playback-fade-out",
                label: "淡出",
                width: 70,
                min: 0,
                max: 60,
                step: 0.25,
                format: (n) => `${n.toFixed(2)}`,
                value: () => (options()?.fadeOut ?? 0) / 1000,
                commit: (n) => setOptions({ fadeOut: Math.round(n * 1000) }),
              },
            ],
          },
        ],
      },
      {
        id: "playback-options",
        label: "选项",
        icon: "settings",
        items: [
          {
            type: "large",
            id: "playback-volume",
            label: "音量",
            icon: "audio",
            title: "音量",
            menu: () =>
              [
                ["低", 0.33],
                ["中", 0.66],
                ["高", 1],
                ["静音", 0],
              ].map(([label, v]) => ({
                label,
                checked:
                  v === 0
                    ? !!options()?.muted
                    : !options()?.muted &&
                      Math.abs((options()?.volume ?? 1) - v) < 0.05,
                onSelect: () =>
                  setOptions(
                    v === 0 ? { muted: true } : { muted: false, volume: v },
                  ).catch(ctx.fail),
              })),
          },
          {
            type: "stack",
            items: [
              {
                type: "combo",
                id: "playback-start",
                label: "开始",
                width: 150,
                value: () =>
                  START_LABELS.find(([v]) => v === options()?.start)?.[1] ?? "",
                options: () => START_LABELS.map(([, l]) => l),
                commit: (label) => {
                  const value = START_LABELS.find(([, l]) => l === label)?.[0];
                  if (!value) return false;
                  setOptions({ start: value });
                },
              },
              {
                type: "check",
                id: "playback-full-screen",
                label: "全屏播放",
                visible: () => kind() === "video",
                checked: () => !!options()?.fullScreen,
                commit: (on) => setOptions({ fullScreen: on }),
              },
              {
                type: "check",
                id: "playback-across-slides",
                label: "跨幻灯片播放",
                visible: () => kind() === "audio",
                checked: () => !!options()?.playAcrossSlides,
                commit: (on) => setOptions({ playAcrossSlides: on }),
              },
            ],
          },
          {
            type: "stack",
            items: [
              {
                type: "check",
                id: "playback-hide",
                label: "播完隐藏",
                checked: () => !!options()?.hideWhileNotPlaying,
                commit: (on) => setOptions({ hideWhileNotPlaying: on }),
              },
              {
                type: "check",
                id: "playback-loop",
                label: "循环播放，直至停止",
                checked: () => !!options()?.loop,
                commit: (on) => setOptions({ loop: on }),
              },
              {
                type: "check",
                id: "playback-rewind",
                label: "播完后快退",
                checked: () => !!options()?.rewind,
                commit: (on) => setOptions({ rewind: on }),
              },
            ],
          },
        ],
      },
      {
        id: "playback-poster",
        label: "标牌框架",
        icon: "pictures",
        visible: () => kind() === "video",
        items: [
          {
            type: "large",
            id: "playback-poster-frame",
            label: "标牌\n框架",
            icon: "posterFrame",
            title: "标牌框架",
            description: "在播放视频之前显示的图像。",
            menu: () => [
              {
                label: "当前帧",
                onSelect: () => posterFromCurrentFrame().catch(ctx.fail),
              },
              {
                label: "文件中的图像…",
                onSelect: () => posterFromFile().catch(ctx.fail),
              },
            ],
          },
        ],
      },
    ],
  });

  // ---- Insert menus ----------------------------------------------------
  const videoMenu = () => [
    {
      label: "Video from File…",
      icon: "o:video",
      onSelect: () => insertVideo().catch(ctx.fail),
    },
  ];
  const audioMenu = () => [
    {
      label: "Audio from File…",
      icon: "o:audio",
      onSelect: () => insertAudio().catch(ctx.fail),
    },
    { separator: true },
    {
      label: "录制音频…",
      icon: "o:recordAudio",
      onSelect: () => recordAudio().catch(ctx.fail),
    },
  ];

  return {
    isMedia,
    insertVideo,
    insertAudio,
    insertMediaFile,
    recordAudio,
    videoMenu,
    audioMenu,
    playbackTab,
    decorate,
    toggle,
    stopAll: () => stopAll(),
    urlFor,
    trimDialog,
  };
}
