// Slide show preferences that belong to this app and the person using it,
// not to the file: live subtitles, presenter view, the notes' text size and
// the camera and microphone chosen for recording.

const KEY = "presentation:show";
const DEFAULTS = {
  alwaysSubtitles: false,
  subtitleLanguage: "",
  subtitlePosition: "bottom", // bottom | top | below | above
  usePresenterView: true,
  notesFontSize: 20,
  cameraShape: "circle", // circle | rect
  cameraOn: true,
  micOn: true,
  cameraId: "",
  micId: "",
};

let cache = null;
function load() {
  if (cache) return cache;
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {}
  cache = { ...DEFAULTS, ...stored };
  return cache;
}

export const showPrefs = new Proxy(
  {},
  {
    get: (_, name) => load()[name],
    set(_, name, value) {
      load()[name] = value;
      try {
        localStorage.setItem(KEY, JSON.stringify(cache));
      } catch {}
      return true;
    },
  },
);

export const SUBTITLE_POSITIONS = [
  ["bottom", "底部 (重叠)"],
  ["top", "顶部 (重叠)"],
  ["below", "幻灯片下方"],
  ["above", "幻灯片上方"],
];

// Languages the browser's speech recognition commonly accepts.
export const SPOKEN_LANGUAGES = [
  ["ar-SA", "阿拉伯语"],
  ["zh-CN", "中文 (简体)"],
  ["zh-TW", "中文 (繁体)"],
  ["da-DK", "丹麦语"],
  ["nl-NL", "荷兰语"],
  ["en-AU", "英语 (澳大利亚)"],
  ["en-CA", "英语 (加拿大)"],
  ["en-IN", "英语 (印度)"],
  ["en-GB", "英语 (英国)"],
  ["en-US", "英语 (美国)"],
  ["fi-FI", "芬兰语"],
  ["fr-CA", "法语 (加拿大)"],
  ["fr-FR", "法语 (法国)"],
  ["de-DE", "德语"],
  ["hi-IN", "印地语"],
  ["it-IT", "意大利语"],
  ["ja-JP", "日语"],
  ["ko-KR", "韩语"],
  ["nb-NO", "挪威语"],
  ["fa-IR", "波斯语"],
  ["pl-PL", "波兰语"],
  ["pt-BR", "葡萄牙语 (巴西)"],
  ["pt-PT", "葡萄牙语 (葡萄牙)"],
  ["ru-RU", "俄语"],
  ["es-MX", "西班牙语 (墨西哥)"],
  ["es-ES", "西班牙语 (西班牙)"],
  ["sv-SE", "瑞典语"],
  ["tr-TR", "土耳其语"],
  ["uk-UA", "乌克兰语"],
];

/** The spoken language for subtitles: the one chosen, else the browser's. */
export function spokenLanguage() {
  const chosen = showPrefs.subtitleLanguage;
  if (chosen) return chosen;
  const browser = (globalThis.navigator?.language || "en-US").toLowerCase();
  return (
    SPOKEN_LANGUAGES.find(([code]) => code.toLowerCase() === browser)?.[0] ||
    SPOKEN_LANGUAGES.find(
      ([code]) => code.slice(0, 2).toLowerCase() === browser.slice(0, 2),
    )?.[0] ||
    "en-US"
  );
}

export const speechRecognitionClass = () =>
  globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
