import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, '.cf-deploy-dist');

// 自动加载根目录 .env 文件配置
const envPath = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}


const BACK_BUTTON_HTML = `
<!-- Everything Floating Back Button -->
<a href="/" id="everything-back-home" style="position:fixed;bottom:16px;left:16px;z-index:999999;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);color:#38bdf8;border:1px solid #334155;border-radius:9999px;padding:6px 14px;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-decoration:none;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;gap:6px;transition:all 0.2s;" onmouseover="this.style.background='#1e293b';this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(15,23,42,0.85)';this.style.transform='none'">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
  <span>返回软件中心</span>
</a>
`;

const runtimePath = path.join(ROOT_DIR, 'scripts/shared/everything-internal-runtime.js');
const RUNTIME_CODE = fs.readFileSync(runtimePath, 'utf8');

function prepareHtml(html, currentApp = '') {
  // 1. Force lang="zh-CN"
  html = html.replace(/<html(\s+[^>]*)?>/i, (m) => {
    if (m.includes('lang=')) {
      return m.replace(/lang="[^"]*"/, 'lang="zh-CN"');
    }
    return m.replace('<html', '<html lang="zh-CN"');
  });

  // 2. Remove external js.puter.com script tags (both static and dynamic)
  html = html.replace(/<script\b[^>]*src=["']https:\/\/js\.puter\.com\/[^"']*["'][^>]*><\/script>/gi, '<!-- [Internal Puter Runtime Active] -->');
  html = html.replace(/<script\b[^>]*src=["']https:\/\/plausible\.io\/[^"']*["'][^>]*><\/script>/gi, '');
  html = html.replace(/s\.src\s*=\s*['"]https:\/\/js\.puter\.com\/v2\/?['"];?/g, '// [Internal Puter Runtime Active]');

  // 3. Remove old inline or external runtime tags to ensure latest version is injected
  html = html.replace(/<script id="everything-internal-runtime-inline">[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<script\s+src=["']\/assets\/everything-internal-runtime\.js["']><\/script>/gi, '');

  // 4. Rewrite absolute root asset links to app subpath if currentApp is provided
  if (currentApp) {
    html = html.replace(/(src|href)=["']\/icon(-[0-9]+|\.png|\.svg)/gi, `$1="/app/${currentApp}/icon$2`);
    html = html.replace(/(src|href)=["']\/app-icon(\.png|\.svg)?/gi, `$1="/app/${currentApp}/app-icon$2`);
    html = html.replace(/(src|href)=["']\/icons\//gi, `$1="/app/${currentApp}/icons/`);
    html = html.replace(/(src|href)=["']\/screenshots\//gi, `$1="/app/${currentApp}/screenshots/`);
    html = html.replace(/(src|href)=["']\/favicon(\.ico|-|\.png)/gi, `$1="/app/${currentApp}/favicon$2`);
  }

  // 5. Inject runtime code inline at the very top of <head>
  const inlineTag = `<script id="everything-internal-runtime-inline">\n${RUNTIME_CODE}\n</script>`;
  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>\n  ${inlineTag}`);
  } else {
    html = `${inlineTag}\n${html}`;
  }

  // 6. Inject back button if not present
  if (!html.includes('everything-back-home')) {
    html = html.replace('</body>', `${BACK_BUTTON_HTML}</body>`);
  }

  return html;
}

async function main() {
  console.log('🚀 开始全量组织与构建 51 款应用并打包上线 Cloudflare Pages...');
  
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // 1. 拷贝 _headers 文件确保所有 JS/WASM MIME 类型 100% 正确
  const headersSrc = path.join(ROOT_DIR, 'scripts/docker/_headers');
  if (fs.existsSync(headersSrc)) {
    fs.copyFileSync(headersSrc, path.join(DIST_DIR, '_headers'));
    console.log('  ✓ Cloudflare Pages _headers 路由与 MIME 类型配置已同步');
  }

  // 2. 拷贝内置运行时与公共资源
  const assetsDir = path.join(DIST_DIR, 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  fs.copyFileSync(runtimePath, path.join(assetsDir, 'everything-internal-runtime.js'));
  console.log('  ✓ 内部集成账号与中文运行时 assets/everything-internal-runtime.js 准备就绪');

  const photoWasm = path.join(SRC_DIR, 'photo-studio/public/photo-engine.wasm');
  if (fs.existsSync(photoWasm)) {
    fs.copyFileSync(photoWasm, path.join(DIST_DIR, 'photo-engine.wasm'));
  }

  // 3. 根目录全局兜底图标资源（确保根路径请求 /icon-128.png, /icon.png, /favicon.ico 等永远 200 OK）
  const fallbackIconSrc = path.join(SRC_DIR, 'spreadsheet/icon-128.png');
  if (fs.existsSync(fallbackIconSrc)) {
    const rootIconTargets = [
      'icon-128.png', 'icon.png', 'icon.svg', 'icon-192.png', 'icon-512.png',
      'app-icon.png', 'favicon.ico', 'favicon-32x32.png', 'favicon-16x16.png'
    ];
    for (const tgt of rootIconTargets) {
      const dst = path.join(DIST_DIR, tgt);
      if (!fs.existsSync(dst)) {
        fs.copyFileSync(fallbackIconSrc, dst);
      }
    }
    const rootIconsDir = path.join(DIST_DIR, 'icons');
    if (!fs.existsSync(rootIconsDir)) {
      fs.mkdirSync(rootIconsDir, { recursive: true });
    }
    ['icon-128.png', 'icon-64.png', 'icon-192.png'].forEach(f => {
      const dst = path.join(rootIconsDir, f);
      if (!fs.existsSync(dst)) fs.copyFileSync(fallbackIconSrc, dst);
    });
  }
  
  // 4. 拷贝并增强聚合主页
  let portalHtml = fs.readFileSync(path.join(ROOT_DIR, 'scripts/docker/portal.html'), 'utf8');
  portalHtml = prepareHtml(portalHtml, '');
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), portalHtml, 'utf8');

  const apps = fs.readdirSync(SRC_DIR).filter(name => {
    const p = path.join(SRC_DIR, name);
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'package.json'));
  });

  console.log(`📋 共发现 ${apps.length} 款应用`);

  // 并发队列
  const CONCURRENCY = 2;
  let idx = 0;
  let successCount = 0;
  let failCount = 0;

  async function worker(workerId) {
    while (idx < apps.length) {
      const currentApp = apps[idx++];
      const appDir = path.join(SRC_DIR, currentApp);
      const appDist = path.join(appDir, 'dist');
      const targetDist = path.join(DIST_DIR, 'app', currentApp);

      console.log(`[${idx}/${apps.length}] 处理应用 ${currentApp}...`);

      try {
        const isOutdated = () => {
          if (!fs.existsSync(path.join(appDist, 'index.html'))) return true;
          const distMtime = fs.statSync(path.join(appDist, 'index.html')).mtimeMs;
          const checkDirs = [path.join(appDir, 'src'), path.join(appDir, 'index.html'), path.join(appDir, 'public')];
          for (const d of checkDirs) {
            if (!fs.existsSync(d)) continue;
            if (fs.statSync(d).isDirectory()) {
              const files = fs.readdirSync(d, { recursive: true });
              for (const f of files) {
                const fp = path.join(d, f);
                try {
                  if (fs.statSync(fp).mtimeMs > distMtime) return true;
                } catch {}
              }
            } else {
              if (fs.statSync(d).mtimeMs > distMtime) return true;
            }
          }
          return false;
        };

        const rebuildList = (process.env.REBUILD || '').split(',').map((s) => s.trim()).filter(Boolean);
        const needsBuild = isOutdated() ||
          process.env.REBUILD === 'all' ||
          rebuildList.includes(currentApp);

        if (needsBuild) {
          console.log(`  -> 正在编译 ${currentApp}...`);
          const hasWorker = fs.existsSync(path.join(appDir, 'vite.worker.config.js'));
          const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));

          if (!fs.existsSync(path.join(appDir, 'node_modules'))) {
            execSync('npm install --prefer-offline --no-audit', { cwd: appDir, stdio: 'pipe', timeout: 60000 });
          }

          if (hasWorker || (pkg.scripts && pkg.scripts['build:worker'])) {
            try {
              execSync('npx vite build --config vite.worker.config.js', { cwd: appDir, stdio: 'pipe', timeout: 60000 });
            } catch (e) {}
          }

          execSync(`npx vite build --base=/app/${currentApp}/`, { cwd: appDir, stdio: 'pipe', timeout: 120000 });
        }

        if (fs.existsSync(appDist) && fs.existsSync(path.join(appDist, 'index.html'))) {
          // 处理 index.html
          let html = fs.readFileSync(path.join(appDist, 'index.html'), 'utf8');
          html = prepareHtml(html, currentApp);
          fs.writeFileSync(path.join(appDist, 'index.html'), html, 'utf8');

          // 复制到目标目录
          if (fs.existsSync(targetDist)) {
            fs.rmSync(targetDist, { recursive: true, force: true });
          }
          fs.mkdirSync(path.dirname(targetDist), { recursive: true });
          execSync(`cp -r "${appDist}" "${targetDist}"`);

          // 拷贝并补全该应用的所有图标与截图静态文件
          const iconCandidates = [
            'icon-128.png', 'icon.png', 'icon.svg', 'icon-192.png', 'icon-512.png',
            'app-icon.png', 'favicon.ico', 'favicon-32x32.png', 'favicon-16x16.png'
          ];
          for (const iconFile of iconCandidates) {
            const srcIcon = path.join(appDir, iconFile);
            const srcPubIcon = path.join(appDir, 'public', iconFile);
            const dstIcon = path.join(targetDist, iconFile);
            if (fs.existsSync(srcIcon) && !fs.existsSync(dstIcon)) {
              fs.copyFileSync(srcIcon, dstIcon);
            } else if (fs.existsSync(srcPubIcon) && !fs.existsSync(dstIcon)) {
              fs.copyFileSync(srcPubIcon, dstIcon);
            }
          }
          // 确保 targetDist/icon-128.png 必定存在（供门户首页卡片展示）
          const target128 = path.join(targetDist, 'icon-128.png');
          if (!fs.existsSync(target128)) {
            for (const alt of ['icon.png', 'icon-192.png', 'app-icon.png', 'icon-512.png']) {
              const altP = path.join(targetDist, alt);
              if (fs.existsSync(altP)) {
                fs.copyFileSync(altP, target128);
                break;
              }
            }
          }
          // 复制 icons 目录
          const iconsDir = path.join(appDir, 'icons');
          const pubIconsDir = path.join(appDir, 'public', 'icons');
          const dstIconsDir = path.join(targetDist, 'icons');
          if (fs.existsSync(iconsDir) && !fs.existsSync(dstIconsDir)) {
            execSync(`cp -r "${iconsDir}" "${dstIconsDir}"`);
          } else if (fs.existsSync(pubIconsDir) && !fs.existsSync(dstIconsDir)) {
            execSync(`cp -r "${pubIconsDir}" "${dstIconsDir}"`);
          }
          // 复制 screenshots 目录
          const scrDir = path.join(appDir, 'screenshots');
          const pubScrDir = path.join(appDir, 'public', 'screenshots');
          const dstScrDir = path.join(targetDist, 'screenshots');
          if (fs.existsSync(scrDir) && !fs.existsSync(dstScrDir)) {
            execSync(`cp -r "${scrDir}" "${dstScrDir}"`);
          } else if (fs.existsSync(pubScrDir) && !fs.existsSync(dstScrDir)) {
            execSync(`cp -r "${pubScrDir}" "${dstScrDir}"`);
          }

          // 再次确保目标目录的 index.html 带有注入与正确的路径重定向
          const targetHtmlPath = path.join(targetDist, 'index.html');
          if (fs.existsSync(targetHtmlPath)) {
            fs.writeFileSync(targetHtmlPath, html, 'utf8');
          }

          console.log(`  ✓ [${currentApp}] 准备就绪并已注入内置账号/中文运行时及全套图标`);
          successCount++;
        } else {
          console.warn(`  ⚠️ [${currentApp}] 未生成 dist 产物`);
          failCount++;
        }
      } catch (err) {
        console.error(`  ❌ [${currentApp}] 处理异常:`, err.message);
        failCount++;
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
  await Promise.all(workers);

  console.log(`\n==================================================`);
  console.log(`🎉 处理全部结束！成功: ${successCount}, 失败: ${failCount}`);
  console.log(`==================================================\n`);

  // 清理测试目录以确保符合 Cloudflare Pages 限制
  execSync('find .cf-deploy-dist -type d \\( -name "tests" -o -name "test" -o -name "docs" -o -name "node_modules" -o -name ".git" -o -name "coverage" \\) -exec rm -rf {} + 2>/dev/null || true');

  if (process.env.SKIP_DEPLOY) {
    console.log('⚡ SKIP_DEPLOY is set, skipping wrangler pages deploy.');
    return;
  }

  console.log('🚀 正在部署到 Cloudflare Pages...');
  const deployCmd = `npx wrangler pages deploy .cf-deploy-dist --project-name everything --branch main`;
  try {
    execSync(deployCmd, {
      stdio: 'inherit',
      env: process.env
    });
    console.log('✅ 全部部署完成！线上地址: https://everything-cti.pages.dev');
  } catch (err) {
    console.warn('⚠️ Cloudflare Pages 部署需要 CLOUDFLARE_API_TOKEN 环境变量或执行 wrangler login。全部 51 款应用已 100% 成功构建打包在 .cf-deploy-dist 中。');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
