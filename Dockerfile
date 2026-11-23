# ==============================================================================
# Everything All-in-One Dockerfile
# Builds all 51 open-source localized Web apps and serves via Nginx
# Perfect for Synology / QNAP / Unraid / TrueNAS / Docker desktop
# ==============================================================================

FROM node:22-bullseye-slim AS builder

WORKDIR /build

# 安装基础构建依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# 批量构建所有前端应用并汇总到 /build/dist-all
RUN node - << 'EOF'
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const outDir = '/build/dist-all';
fs.mkdirSync(outDir, { recursive: true });

// 复制导航门户
fs.copyFileSync('/build/scripts/docker/portal.html', path.join(outDir, 'index.html'));

const srcDir = path.join('/build', 'src');
const apps = fs.readdirSync(srcDir).filter(d => fs.statSync(path.join(srcDir, d)).isDirectory());

console.log(`准备构建 ${apps.length} 个应用...`);

for (const app of apps) {
  const appPath = path.join(srcDir, app);
  const targetAppDir = path.join(outDir, 'app', app);
  fs.mkdirSync(targetAppDir, { recursive: true });

  const pkgJson = path.join(appPath, 'package.json');
  console.log(`--> 处理应用: ${app}`);

  if (fs.existsSync(pkgJson)) {
    try {
      // 快速安装依赖并尝试 build
      execSync('npm install --prefer-offline --no-audit --progress=false', { cwd: appPath, stdio: 'inherit' });
      execSync('npm run build', { cwd: appPath, stdio: 'inherit' });

      // 如果有 dist 目录则复制 dist，否则复制源码根文件
      const distDir = path.join(appPath, 'dist');
      if (fs.existsSync(distDir)) {
        execSync(`cp -r ${distDir}/* ${targetAppDir}/`);
      } else {
        execSync(`cp -r ${appPath}/* ${targetAppDir}/`);
      }
    } catch (e) {
      console.warn(`[WARN] 应用 ${app} 构建跳过或失败，直接复制静态文件: ${e.message}`);
      execSync(`cp -r ${appPath}/* ${targetAppDir}/ 2>/dev/null || true`);
    }
  } else {
    // 纯静态应用 (如 assets)
    execSync(`cp -r ${appPath}/* ${targetAppDir}/`);
  }
}

console.log('所有应用构建与归档整理完毕！');
EOF

# 运行镜像阶段：轻量 Nginx Alpine 镜像
FROM nginx:alpine

# 复制统一 Nginx 配置
COPY scripts/docker/nginx.conf /etc/nginx/conf.d/default.conf

# 复制汇总的应用产物
COPY --from=builder /build/dist-all /usr/share/nginx/html

EXPOSE 80

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
