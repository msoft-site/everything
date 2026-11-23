import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, '.cf-deploy-dist');

const BACK_BUTTON_HTML = `
<!-- Everything Floating Back Button -->
<a href="/" id="everything-back-home" style="position:fixed;bottom:16px;left:16px;z-index:999999;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);color:#38bdf8;border:1px solid #334155;border-radius:9999px;padding:6px 14px;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-decoration:none;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;gap:6px;transition:all 0.2s;" onmouseover="this.style.background='#1e293b';this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(15,23,42,0.85)';this.style.transform='none'">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
  <span>返回软件中心</span>
</a>
`;

async function main() {
  console.log('🚀 开始全量编译 51 款应用并打包上线 Cloudflare Pages...');
  
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }
  
  // 1. 拷贝聚合主页
  fs.copyFileSync(
    path.join(ROOT_DIR, 'scripts/docker/portal.html'),
    path.join(DIST_DIR, 'index.html')
  );

  const apps = fs.readdirSync(SRC_DIR).filter(name => {
    const p = path.join(SRC_DIR, name);
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'package.json'));
  });

  console.log(`📋 共发现 ${apps.length} 款待构建应用`);

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

      console.log(`[${idx}/${apps.length}] 正在编译 ${currentApp}...`);

      try {
        // 检查是否有 worker 配置
        const hasWorker = fs.existsSync(path.join(appDir, 'vite.worker.config.js'));
        const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));

        // 安装依赖 (如果 node_modules 不存在)
        if (!fs.existsSync(path.join(appDir, 'node_modules'))) {
          execSync('npm install --prefer-offline --no-audit', { cwd: appDir, stdio: 'pipe', timeout: 60000 });
        }

        // 构建 worker (如果有)
        if (hasWorker || (pkg.scripts && pkg.scripts['build:worker'])) {
          try {
            execSync('npx vite build --config vite.worker.config.js', { cwd: appDir, stdio: 'pipe', timeout: 60000 });
          } catch (e) {
            // ignore worker error if any
          }
        }

        // 构建前端 bundle
        execSync(`npx vite build --base=/app/${currentApp}/`, { cwd: appDir, stdio: 'pipe', timeout: 120000 });

        if (fs.existsSync(appDist) && fs.existsSync(path.join(appDist, 'index.html'))) {
          // 注入返回主页按钮
          let html = fs.readFileSync(path.join(appDist, 'index.html'), 'utf8');
          if (!html.includes('everything-back-home')) {
            html = html.replace('</body>', `${BACK_BUTTON_HTML}</body>`);
            fs.writeFileSync(path.join(appDist, 'index.html'), html, 'utf8');
          }

          // 复制到目标目录
          if (fs.existsSync(targetDist)) {
            fs.rmSync(targetDist, { recursive: true, force: true });
          }
          fs.mkdirSync(path.dirname(targetDist), { recursive: true });
          execSync(`cp -r "${appDist}" "${targetDist}"`);

          console.log(`  ✓ [${currentApp}] 编译成功并已组织就绪`);
          successCount++;
        } else {
          console.warn(`  ⚠️ [${currentApp}] 未生成 dist 产物`);
          failCount++;
        }
      } catch (err) {
        console.error(`  ❌ [${currentApp}] 编译异常:`, err.message);
        failCount++;
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
  await Promise.all(workers);

  console.log(`\n==================================================`);
  console.log(`🎉 编译全部结束！成功: ${successCount}, 失败: ${failCount}`);
  console.log(`==================================================\n`);

  // 清理测试目录以确保符合 Cloudflare Pages 限制
  execSync('find .cf-deploy-dist -type d \\( -name "tests" -o -name "test" -o -name "docs" -o -name "node_modules" -o -name ".git" -o -name "coverage" \\) -exec rm -rf {} + 2>/dev/null || true');

  console.log('🚀 正在部署到 Cloudflare Pages...');
  const deployCmd = `npx wrangler pages deploy .cf-deploy-dist --project-name everything --branch main`;
  execSync(deployCmd, {
    stdio: 'inherit',
    env: process.env
  });

  console.log('✅ 全部部署完成！线上地址: https://everything-cti.pages.dev');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
