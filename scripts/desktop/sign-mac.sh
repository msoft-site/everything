#!/bin/bash
# ==============================================================================
# 使用本机 Xcode 开发者签名对 Everything.app 进行签名并验证
# 用法:
#   ./scripts/desktop/sign-mac.sh [/Applications/Everything.app]
# ==============================================================================

set -e

APP_PATH="${1:-/Applications/Everything.app}"

if [ ! -d "$APP_PATH" ]; then
  # 尝试在当前 release-dmg 目录查找
  if [ -d "./release-dmg/mac-arm64/Everything.app" ]; then
    APP_PATH="./release-dmg/mac-arm64/Everything.app"
  else
    echo "错误: 未找到应用: $APP_PATH"
    echo "用法: ./scripts/desktop/sign-mac.sh <Everything.app路径>"
    exit 1
  fi
fi

echo "=========================================================="
echo "         Everything macOS 本机 Xcode 开发者签名工具        "
echo "=========================================================="
echo "目标应用: $APP_PATH"
echo ""

# 1. 检索本机 Keychain 中有效的代码签名证书
echo "==> [1/4] 检索本机 Keychain 中的 Xcode / Apple 开发者证书..."
ALL_CERTS=$(security find-identity -v -p codesigning 2>/dev/null || true)

if [ -z "$ALL_CERTS" ]; then
  echo "警告: 未在钥匙串中检索到有效证书，将使用本地 Ad-hoc 签名 (-)"
  SIGN_IDENTITY="-"
else
  # 优先匹配 Developer ID Application，其次 Apple Development，再次 Mac Developer
  DEV_ID=$(echo "$ALL_CERTS" | grep -E 'Developer ID Application:' | head -n 1 | sed -E 's/.*"([^"]+)".*/\1/' || true)
  APPLE_DEV=$(echo "$ALL_CERTS" | grep -E 'Apple Development:' | head -n 1 | sed -E 's/.*"([^"]+)".*/\1/' || true)
  MAC_DEV=$(echo "$ALL_CERTS" | grep -E 'Mac Developer:' | head -n 1 | sed -E 's/.*"([^"]+)".*/\1/' || true)

  if [ -n "$DEV_ID" ]; then
    SIGN_IDENTITY="$DEV_ID"
  elif [ -n "$APPLE_DEV" ]; then
    SIGN_IDENTITY="$APPLE_DEV"
  elif [ -n "$MAC_DEV" ]; then
    SIGN_IDENTITY="$MAC_DEV"
  else
    # 取找到的第一个有效签名证书
    SIGN_IDENTITY=$(echo "$ALL_CERTS" | grep -E '^\s*[0-9]+\)' | head -n 1 | sed -E 's/.*"([^"]+)".*/\1/' || true)
    if [ -z "$SIGN_IDENTITY" ]; then
      SIGN_IDENTITY="-"
    fi
  fi
fi

echo "==> 选定签名身份: $SIGN_IDENTITY"
echo ""

# 2. 清理下载隔离属性与旧签名
echo "==> [2/4] 清除 Gatekeeper 下载隔离属性与旧签名..."
sudo xattr -cr "$APP_PATH" 2>/dev/null || xattr -cr "$APP_PATH" 2>/dev/null || true

# 确保二进制具备可执行权限
chmod -R +x "$APP_PATH/Contents/MacOS/" 2>/dev/null || true

# 3. 递归深度签名所有框架、dylib 与主程序
echo "==> [3/4] 正在执行深度代码签名..."
if [ "$SIGN_IDENTITY" = "-" ]; then
  codesign --force --deep --sign - "$APP_PATH"
else
  # 使用选定的开发者证书深度签名
  codesign --force --deep --options runtime --sign "$SIGN_IDENTITY" "$APP_PATH"
fi

# 4. 验证签名结果
echo "==> [4/4] 验证签名有效性..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
echo ""
echo "Gatekeeper 安全评估测试:"
spctl -a -t exec -vv "$APP_PATH" 2>&1 || true

echo ""
echo "=========================================================="
echo " 🎉 签名成功！正在启动应用验证..."
echo "=========================================================="
open "$APP_PATH"
