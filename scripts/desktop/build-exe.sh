#!/bin/bash
# ==============================================================================
# Build Windows EXE Installer (64-bit x64 only, no 32-bit legacy)
# Usage: ./scripts/desktop/build-exe.sh [app_name]
# Example: ./scripts/desktop/build-exe.sh spreadsheet
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIR"

APP_NAME="$1"

if [ -z "$APP_NAME" ]; then
  echo "=========================================================="
  echo "      Everything Windows EXE (64位 x64) 构建工具         "
  echo "=========================================================="
  echo "用法: ./scripts/desktop/build-exe.sh <应用名称>"
  echo "例如:"
  echo "  ./scripts/desktop/build-exe.sh spreadsheet    # 电子表格"
  echo "  ./scripts/desktop/build-exe.sh documents      # 文档编辑器"
  echo "  ./scripts/desktop/build-exe.sh photo-studio   # 图像工作室"
  echo "  ./scripts/desktop/build-exe.sh sudoku         # 数独"
  echo "  ./scripts/desktop/build-exe.sh all-in-one     # 构建包含所有 51 款软件的整合中心"
  echo "=========================================================="
  exit 1
fi

BUILD_DIR="$DIR/.desktop-build/$APP_NAME"
OUTPUT_DIR="$DIR/release-exe"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$OUTPUT_DIR"

echo "==> [1/4] 准备构建前端静态产物..."

if [ "$APP_NAME" = "all-in-one" ]; then
  echo "正在打包聚合中心..."
  mkdir -p "$BUILD_DIR/dist/app"
  cp scripts/docker/portal.html "$BUILD_DIR/dist/index.html"
  for d in src/*/; do
    app=$(basename "$d")
    mkdir -p "$BUILD_DIR/dist/app/$app"
    if [ -d "$d/dist" ]; then
      cp -r "$d/dist/"* "$BUILD_DIR/dist/app/$app/" 2>/dev/null || true
    else
      cp -r "$d/"* "$BUILD_DIR/dist/app/$app/" 2>/dev/null || true
    fi
  done
  DISPLAY_TITLE="Everything"
else
  APP_SRC="$DIR/src/$APP_NAME"
  if [ ! -d "$APP_SRC" ]; then
    echo "错误: 未找到应用目录 $APP_SRC"
    exit 1
  fi
  cd "$APP_SRC"
  if [ -f "package.json" ]; then
    npm install --prefer-offline --no-audit
    npm run build 2>/dev/null || true
  fi
  cd "$DIR"
  mkdir -p "$BUILD_DIR/dist"
  if [ -d "$APP_SRC/dist" ]; then
    cp -r "$APP_SRC/dist/"* "$BUILD_DIR/dist/"
  else
    cp -r "$APP_SRC/"* "$BUILD_DIR/dist/"
  fi
  DISPLAY_TITLE="$APP_NAME"
fi

echo "==> [2/4] 配置 Electron 打包环境..."
cp scripts/desktop/main.template.js "$BUILD_DIR/main.js"

# 生成临时 package.json
cat << EOF > "$BUILD_DIR/package.json"
{
  "name": "$APP_NAME",
  "version": "1.0.0",
  "description": "$DISPLAY_TITLE - Everything 中文版",
  "main": "main.js",
  "build": {
    "appId": "com.everything.$APP_NAME",
    "productName": "$DISPLAY_TITLE",
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ]
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "$DISPLAY_TITLE"
    }
  }
}
EOF

# 如果有 icon 则复制
if [ -f "$DIR/src/$APP_NAME/icon-128.png" ]; then
  cp "$DIR/src/$APP_NAME/icon-128.png" "$BUILD_DIR/icon.png"
elif [ -f "$DIR/assets/everything.png" ]; then
  cp "$DIR/assets/everything.png" "$BUILD_DIR/icon.png"
fi

echo "==> [3/4] 安装 electron & electron-builder 打包工具..."
cd "$BUILD_DIR"
npm install electron electron-builder --save-dev --prefer-offline --no-audit

echo "==> [4/4] 正在针对 Windows (x64) 架构生成可执行 EXE 安装包 (NSIS)..."
npx electron-builder --win nsis --x64 --config.directories.output="$OUTPUT_DIR"

echo "=========================================================="
echo " 构建成功！"
echo " EXE 安装包位置: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"/*.exe 2>/dev/null || true
echo "=========================================================="
