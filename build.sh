#!/bin/bash
# ==============================================================================
# Everything 构建与部署总调度脚本 (Master Build & Deployment CLI)
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
BOLD="\033[1m"
NC="\033[0m"

echo -e "${BLUE}${BOLD}================================================================"
echo "          Everything 中文全套软件构建与部署中心"
echo -e "================================================================${NC}"
echo "请选择您要执行的构建任务："
echo ""
echo -e "  ${BOLD}1)${NC} 构建 Docker 镜像 (部署到 NAS / 私有服务器直接访问)"
echo -e "  ${BOLD}2)${NC} 构建 macOS DMG 安装包 (仅适配 Apple Silicon ARM64 架构)"
echo -e "  ${BOLD}3)${NC} 构建 Windows EXE 安装程序 (仅适配 64位 x64 架构)"
echo -e "  ${BOLD}4)${NC} 交互式部署到 Cloudflare Pages (引导授权并在全球 CDN 上线)"
echo -e "  ${BOLD}q)${NC} 退出"
echo ""
read -p "请输入选项 [1-4]: " OPTION

case "$OPTION" in
  1)
    echo -e "${GREEN}==> 启动 Docker 构建...${NC}"
    ./scripts/docker/build-docker.sh
    ;;
  2)
    echo ""
    read -p "请输入要打包的应用名称 (例如 spreadsheet, documents, 或输入 all-in-one 打包聚合版): " APP
    ./scripts/desktop/build-dmg.sh "${APP:-all-in-one}"
    ;;
  3)
    echo ""
    read -p "请输入要打包的应用名称 (例如 spreadsheet, documents, 或输入 all-in-one 打包聚合版): " APP
    ./scripts/desktop/build-exe.sh "${APP:-all-in-one}"
    ;;
  4)
    echo -e "${GREEN}==> 启动 Cloudflare 部署向导...${NC}"
    ./scripts/deploy/deploy-cloudflare.sh
    ;;
  q|Q)
    echo "退出。"
    exit 0
    ;;
  *)
    echo "无效输入。"
    exit 1
    ;;
esac
