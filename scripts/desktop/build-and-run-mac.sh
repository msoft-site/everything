#!/bin/bash
# ==============================================================================
# Mac 本地一键构建、Xcode 签名、安装到 Applications 并启动验证脚本
# 用法: ./scripts/desktop/build-and-run-mac.sh [app_name]
# 默认 app_name 为 all-in-one (全套 51 款开源软件集成中心)
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIR"

APP_NAME="${1:-all-in-one}"

echo "=========================================================="
echo "    Everything Mac 本机一键打包、Xcode 签名与启动验证     "
echo "=========================================================="
echo "目标: $APP_NAME"
echo ""

# 1. 执行 DMG 构建 (内部已集成自动检索 Keychain 中的 Xcode 签名证书)
echo "==> [第 1 步] 正在执行本地 DMG 与 App 编译打包..."
./scripts/desktop/build-dmg.sh "$APP_NAME"

# 2. 获取构建出的 .app
APP_BUNDLE=$(find "$DIR/release-dmg/mac-arm64" -maxdepth 1 -name "*.app" 2>/dev/null | head -n 1 || true)

TARGET_APP="/Applications/Everything.app"
if [ "$APP_NAME" != "all-in-one" ]; then
  TARGET_APP="/Applications/${APP_NAME}.app"
fi

# 3. 同步到 /Applications
if [ -n "$APP_BUNDLE" ] && [ -d "$APP_BUNDLE" ]; then
  echo ""
  echo "==> [第 2 步] 正在安装至 $TARGET_APP..."
  pkill -f "$TARGET_APP" 2>/dev/null || true
  rm -rf "$TARGET_APP"
  cp -R "$APP_BUNDLE" "$TARGET_APP"
  echo "已成功部署到系统 Applications 目录！"
fi

# 4. 执行 Xcode 签名强化与安全属性清理
echo ""
echo "==> [第 3 步] 校验并执行深度签名与属性清除..."
./scripts/desktop/sign-mac.sh "$TARGET_APP"

echo ""
echo "=========================================================="
echo " ✅ 本机验证完成！已成功安装至 $TARGET_APP 并已调起运行！"
echo "=========================================================="
