#!/bin/bash
# ==============================================================================
# Build macOS DMG Installer (Apple Silicon ARM64 only)
# Usage: ./scripts/desktop/build-dmg.sh [app_name]
# Example: ./scripts/desktop/build-dmg.sh spreadsheet
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIR"

APP_NAME="$1"

if [ -z "$APP_NAME" ]; then
  echo "=========================================================="
  echo "      Everything macOS DMG (Apple Silicon) 构建工具       "
  echo "=========================================================="
  echo "用法: ./scripts/desktop/build-dmg.sh <应用名称>"
  echo "例如:"
  echo "  ./scripts/desktop/build-dmg.sh spreadsheet    # 电子表格"
  echo "  ./scripts/desktop/build-dmg.sh documents      # 文档编辑器"
  echo "  ./scripts/desktop/build-dmg.sh photo-studio   # 图像工作室"
  echo "  ./scripts/desktop/build-dmg.sh sudoku         # 数独"
  echo "  ./scripts/desktop/build-dmg.sh all-in-one     # 构建包含所有 51 款软件的整合中心"
  echo "=========================================================="
  exit 1
fi

BUILD_DIR="$DIR/.desktop-build/$APP_NAME"
OUTPUT_DIR="$DIR/release-dmg"

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
  rm -rf "$BUILD_DIR/dist/app/whiteboard/tmp" 2>/dev/null || true
  find "$BUILD_DIR/dist" -xtype l -delete 2>/dev/null || true
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
    "mac": {
      "category": "public.app-category.productivity",
      "identity": null,
      "gatekeeperAssess": false,
      "hardenedRuntime": false,
      "target": [
        {
          "target": "dmg",
          "arch": ["arm64"]
        }
      ]
    },
    "dmg": {
      "contents": [
        { "x": 130, "y": 220 },
        { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
      ]
    }
  }
}
EOF

# 如果有 512x512 icon 则优先使用，以符合 macOS / Windows 要求
if [ -f "$DIR/src/$APP_NAME/public/icon-512.png" ]; then
  cp "$DIR/src/$APP_NAME/public/icon-512.png" "$BUILD_DIR/icon.png"
elif [ -f "$DIR/src/$APP_NAME/public/icons/icon-512.png" ]; then
  cp "$DIR/src/$APP_NAME/public/icons/icon-512.png" "$BUILD_DIR/icon.png"
elif [ -f "$DIR/assets/icons/icon-512.png" ]; then
  cp "$DIR/assets/icons/icon-512.png" "$BUILD_DIR/icon.png"
elif [ -f "$DIR/src/$APP_NAME/icon-128.png" ]; then
  cp "$DIR/src/$APP_NAME/icon-128.png" "$BUILD_DIR/icon.png"
fi

echo "==> [3/4] 安装 electron & electron-builder 打包工具..."
cd "$BUILD_DIR"
npm install electron electron-builder --save-dev --prefer-offline --no-audit

echo "==> [4/4] 正在针对 Apple Silicon (arm64) 架构生成 DMG 安装包..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  npx electron-builder --mac dmg --arm64 --config.directories.output="$OUTPUT_DIR"
else
  # 在 Linux 环境下生成 macOS arm64 应用包并制成 DMG
  npx electron-builder --mac dir --arm64 --config.directories.output="$OUTPUT_DIR"
  APP_BUNDLE=$(find "$OUTPUT_DIR/mac-arm64" -maxdepth 1 -name "*.app" | head -n 1)
  if [ -d "$APP_BUNDLE" ]; then
    STAGE_DIR=$(mktemp -d)
    cp -r "$APP_BUNDLE" "$STAGE_DIR/"
    ln -sf /Applications "$STAGE_DIR/Applications"
    genisoimage -D -V "$DISPLAY_TITLE" -no-pad -r -apple -o "$OUTPUT_DIR/${DISPLAY_TITLE}-1.0.0-arm64.dmg" "$STAGE_DIR"
    rm -rf "$STAGE_DIR"
  fi
fi

echo "=========================================================="
echo " 构建成功！"
echo " DMG 安装包位置: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"/*.dmg 2>/dev/null || true
echo "=========================================================="
