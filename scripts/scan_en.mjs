// Usage: node scripts/scan_en.mjs <app> [clickDepth]
// Opens /app/<app>/ from .cf-deploy-dist, clicks through buttons/menus, lists English leftovers.
import { chromium } from "../src/presentation/node_modules/playwright/index.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const app = process.argv[2];
const dist = path.resolve(new URL("../.cf-deploy-dist", import.meta.url).pathname);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".png": "image/png" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = path.join(dist, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const CHROME_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-zygote"];
let browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome", args: CHROME_ARGS });
const found = new Map();
const errors = [];
try {
  let page; let curTag = 'load';
  const open = async () => {
    if (page) await page.close().catch(() => {});
    if (!browser || !browser.isConnected()) {
      browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome", args: CHROME_ARGS });
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (!page || page.isClosed()) {
          page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
          page.on("pageerror", (e) => errors.push(`[${curTag}] ` + String(e.stack || e).split("\n").slice(0, 4).join(" | ")));
        }
        await page.goto(`http://localhost:${port}/app/${app}/`, { waitUntil: "domcontentloaded" });
        break;
      } catch (e) {
        if (page) await page.close().catch(() => {});
        page = null;
        if (attempt === 2) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    await page.waitForTimeout(2000);
    for (const t of (process.argv[4] || "").split(",").filter(Boolean)) {
      try { await page.locator(`text=${t}`).first().click({ timeout: 3000 }); } catch {}
      await page.waitForTimeout(1000);
    }
  };
  await open();
  const collect = async (tag) => {
    const list = await page.evaluate(() => {
      const out = [];
      const IGN = /^(Ctrl|Alt|Shift|Cmd|Option|Del|Esc|Tab|Enter|F\d+|PageUp|PageDown|Home|End)\b[+\w\s'\[\]\\`=.,?\/-]*$|^[A-Z]{2}$|U\+[0-9A-F]{4}|^uni[0-9A-F]{4}|^\.?\s*[a-zA-Z0-9_.-]+(\.[a-zA-Z0-9]+)+$|^[a-z]+$|^(JPEG|JPG|PNG|PDF|SVG|WebP|CMYK|RGB|HSB|iOS|OpenType|GIF|TIFF|PSD|PSB|AVIF|BMP|HEX|Hex|WebGL2?|Pro|API|URL|AI|OCR|PWA|DPI|PPI|ZIP|JSON|HTML|CSS|SVGZ|EPS|Lab|HSL|px|pt|em|in|mm|cm|mil|dB|inf|-inf|SOT(-\d+)?|SOIC|SOP|TSSOP|QFN|DFN|QFP|LQFP|TQFP|DIP(-\d+)?|BGA|SMD|THT|PCB|ERC|DRC|BOM)(\s*\/\s*(SOT(-\d+)?|SOIC|SOP|TSSOP|QFN|DFN|QFP|LQFP|TQFP|DIP(-\d+)?|BGA|SMD|THT))*$|^\d+\/\d+ em$|^\d+(st|nd|rd|th)$|^(Bebas Neue|Dancing Script|Inter|Lato|Lobster|Lora|Merriweather|Montserrat|Open Sans|Oswald|Pacifico|Permanent Marker|Playfair Display|Poppins|Roboto|Roboto Mono|Source Code Pro|Source Serif 4|Noto Sans|Arial|Helvetica|Times New Roman|Courier New|Georgia|Verdana)\b|^[A-Z][a-z]*(acute|macron|tilde|dieresis|grave|dot)$|LongArrow|^[+-]?\d+(?:\.\d+)?\s*dB$|^[\d\s.,x×%@()/\-:+=]*$/;
      const en = (s) => /[A-Za-z]{2,}/.test(s) && !/[\u4e00-\u9fff]/.test(s) && !IGN.test(s.trim());
      const walk = (root) => {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
          const p = n.parentElement; if (!p) continue;
          if (/SCRIPT|STYLE|NOSCRIPT|CODE|PRE|TEXTAREA/.test(p.tagName)) continue;
          if (/material|icon|lucide|fa-/.test(String(p.className))) continue;
          const t = n.nodeValue.trim(); if (t && en(t)) out.push("T|" + t);
        }
        root.querySelectorAll("*").forEach((e) => {
          for (const a of ["title", "aria-label", "placeholder", "alt", "data-tip", "data-tooltip", "data-title", "data-label", "label"]) {
            const v = e.getAttribute && e.getAttribute(a); if (v && en(v)) out.push("A:" + a + "|" + v);
          }
          if (e.shadowRoot) walk(e.shadowRoot);
        });
      };
      walk(document.body);
      return out;
    });
    for (const s of list) if (!found.has(s)) found.set(s, tag);
  };
  await collect("home");
  const depth = Number(process.argv[3] ?? 1);
  // click through visible buttons (limited), collecting after each
  const sel = 'button, [role=menuitem], [role=tab], summary, .menu-item, [data-menu], .tab';
  for (let round = 0; round < depth; round++) {
    const n = await page.locator(sel).count();
    for (let i = 0; i < Math.min(n, 160); i++) {
      const el = page.locator(sel).nth(i);
      try {
        if (!(await el.isVisible())) continue;
        const label = ((await el.innerText({ timeout: 300 })) || (await el.getAttribute("aria-label")) || "").slice(0, 30).replace(/\s+/g, " ");
        curTag = `${round}:${i}:${label}`;
        await el.click({ timeout: 500, trial: false });
        await page.waitForTimeout(150);
        try { await collect(`${round}:${i}:${label}`); } catch (e) { await open(); continue; }
        await page.keyboard.press("Escape");
      } catch (e) { console.log("click error:", String(e).slice(0, 100)); if (/crash|closed/i.test(String(e))) { await open(); } }
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`ERRORS ${errors.length}`); errors.slice(0, 8).forEach((e) => console.log(" ", e.slice(0, 500)));
console.log(`ENGLISH ${found.size}`);
for (const [s, tag] of found) console.log(s, "   <=", tag);
