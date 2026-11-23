#!/bin/bash
# ==============================================================================
# Cloudflare Pages 交互式一键部署脚本 (Interactive Cloudflare Deployment)
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIR"

# 终端彩色输出
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
BOLD="\033[1m"
NC="\033[0m"

echo -e "${BLUE}${BOLD}================================================================${NC}"
echo -e "${GREEN}${BOLD}     Everything 中文全套应用 - Cloudflare Pages 一键部署工具     ${NC}"
echo -e "${BLUE}${BOLD}================================================================${NC}"
echo ""
echo "本脚本将引导您将【单个应用】或【51款应用整合门户】一键部署到免费高速的 Cloudflare Pages。"
echo ""

# 1. 检查 Node.js / npm
if ! command -v npm &> /dev/null; then
  echo -e "${RED}[错误] 本机未检测到 npm，请先安装 Node.js (推荐 v20 或 v22)。${NC}"
  exit 1
fi

# 2. 检查并引导登录 Wrangler (Cloudflare CLI)
echo -e "${YELLOW}[步骤 1/4] 检查 Cloudflare CLI (Wrangler)...${NC}"
if ! command -v npx &> /dev/null; then
  echo -e "${RED}[错误] 未检测到 npx 命令。${NC}"
  exit 1
fi

echo -e "正在验证 Cloudflare 账号登录状态..."
if ! npx wrangler whoami &> /dev/null; then
  echo -e "${YELLOW}您尚未登录 Cloudflare 账号。即将为您唤起浏览器登录授权...${NC}"
  echo "提示：浏览器打开后，点击 Authorize 登录即可回到此处。"
  npx wrangler login
else
  echo -e "${GREEN}✓ Cloudflare 账号已登录！${NC}"
fi

# 3. 交互式选择部署目标
echo ""
echo -e "${YELLOW}[步骤 2/4] 选择您想要部署的内容：${NC}"
echo "----------------------------------------------------"
echo -e "  ${BOLD}0)${NC} 【推荐】聚合门户中心（包含全部 51 款中文软件，带美观导航菜单）"
echo -e "  ${BOLD}1)${NC} 电子表格 (Spreadsheet - 替代 Excel)"
echo -e "  ${BOLD}2)${NC} 文档编辑 (Documents - 替代 Word)"
echo -e "  ${BOLD}3)${NC} 演示文稿 (Presentation - 替代 PPT)"
echo -e "  ${BOLD}4)${NC} 白板 (Whiteboard - 替代 Miro)"
echo -e "  ${BOLD}5)${NC} PDF 编辑器 (PDF - 替代 Acrobat)"
echo -e "  ${BOLD}6)${NC} 图像工作室 (Photo Studio - 替代 Photoshop)"
echo -e "  ${BOLD}7)${NC} 待办事项 (Tasks - 替代 Todoist)"
echo -e "  ${BOLD}8)${NC} 团队聊天 (Teamchat - 替代 Slack)"
echo -e "  ${BOLD}9)${NC} 输入其他任意应用目录名 (如 crm, notes, chess, cad...)"
echo "----------------------------------------------------"
read -p "请输入序号 [默认 0]: " CHOICE
CHOICE="${CHOICE:-0}"

DEPLOY_TARGET="all-in-one"
PROJECT_DEFAULT="everything-suite"

case "$CHOICE" in
  0)
    DEPLOY_TARGET="all-in-one"
    PROJECT_DEFAULT="everything-suite"
    ;;
  1)
    DEPLOY_TARGET="spreadsheet"
    PROJECT_DEFAULT="everything-spreadsheet"
    ;;
  2)
    DEPLOY_TARGET="documents"
    PROJECT_DEFAULT="everything-documents"
    ;;
  3)
    DEPLOY_TARGET="presentation"
    PROJECT_DEFAULT="everything-presentation"
    ;;
  4)
    DEPLOY_TARGET="whiteboard"
    PROJECT_DEFAULT="everything-whiteboard"
    ;;
  5)
    DEPLOY_TARGET="pdf"
    PROJECT_DEFAULT="everything-pdf"
    ;;
  6)
    DEPLOY_TARGET="photo-studio"
    PROJECT_DEFAULT="everything-photo-studio"
    ;;
  7)
    DEPLOY_TARGET="tasks"
    PROJECT_DEFAULT="everything-tasks"
    ;;
  8)
    DEPLOY_TARGET="teamchat"
    PROJECT_DEFAULT="everything-teamchat"
    ;;
  9)
    read -p "请输入 src/ 下的具体应用目录名称 (例如: crm): " CUSTOM_APP
    if [ ! -d "src/$CUSTOM_APP" ]; then
      echo -e "${RED}[错误] 未找到目录 src/$CUSTOM_APP${NC}"
      exit 1
    fi
    DEPLOY_TARGET="$CUSTOM_APP"
    PROJECT_DEFAULT="everything-$CUSTOM_APP"
    ;;
  *)
    echo -e "${RED}输入无效，退出。${NC}"
    exit 1
    ;;
esac

read -p "请输入 Cloudflare Pages 项目名称 [默认: $PROJECT_DEFAULT]: " CF_PROJECT_NAME
CF_PROJECT_NAME="${CF_PROJECT_NAME:-$PROJECT_DEFAULT}"

# 4. 构建静态文件
echo ""
echo -e "${YELLOW}[步骤 3/4] 正在构建目标前端产物 (${DEPLOY_TARGET})...${NC}"

BUILD_OUTPUT="$DIR/.cf-deploy-dist"
rm -rf "$BUILD_OUTPUT"
mkdir -p "$BUILD_OUTPUT"

if [ "$DEPLOY_TARGET" = "all-in-one" ]; then
  echo "正在组织 51 款应用静态文件至聚合目录..."
  mkdir -p "$BUILD_OUTPUT/app"
  cp scripts/docker/portal.html "$BUILD_OUTPUT/index.html"

  for d in src/*/; do
    app=$(basename "$d")
    echo "打包 $app ..."
    target_dir="$BUILD_OUTPUT/app/$app"
    mkdir -p "$target_dir"
    if [ -f "$d/package.json" ]; then
      (cd "$d" && npm install --prefer-offline --no-audit > /dev/null 2>&1 && npm run build > /dev/null 2>&1 || true)
      if [ -d "$d/dist" ]; then
        cp -r "$d/dist/"* "$target_dir/" 2>/dev/null || true
      else
        cp -r "$d/"* "$target_dir/" 2>/dev/null || true
      fi
    else
      cp -r "$d/"* "$target_dir/" 2>/dev/null || true
    fi
  done
else
  APP_DIR="$DIR/src/$DEPLOY_TARGET"
  cd "$APP_DIR"
  if [ -f "package.json" ]; then
    echo "正在构建 $DEPLOY_TARGET ..."
    npm install --prefer-offline --no-audit
    npm run build
  fi
  cd "$DIR"

  if [ -d "$APP_DIR/dist" ]; then
    cp -r "$APP_DIR/dist/"* "$BUILD_OUTPUT/"
  else
    cp -r "$APP_DIR/"* "$BUILD_OUTPUT/"
  fi
fi

# 5. 执行 Wrangler Pages 部署
echo ""
echo -e "${YELLOW}[步骤 4/4] 正在推送到 Cloudflare Pages 全球网络...${NC}"
npx wrangler pages deploy "$BUILD_OUTPUT" --project-name "$CF_PROJECT_NAME"

echo ""
echo -e "${GREEN}${BOLD}================================================================${NC}"
echo -e "${GREEN}${BOLD}                   🎉 部署成功！                                ${NC}"
echo -e "${GREEN}${BOLD}================================================================${NC}"
echo -e "您的应用已成功上线到 Cloudflare Pages！"
echo -e "访问地址通常为: ${BOLD}https://${CF_PROJECT_NAME}.pages.dev${NC}"
echo -e "您还可以在 Cloudflare 控制台中随时绑定自己的专属域名 (Custom Domain)。"
echo "================================================================"
