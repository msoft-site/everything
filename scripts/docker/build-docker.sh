#!/bin/bash
# ==============================================================================
# Build Docker Image for Synology / QNAP / Unraid / Linux Server
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIR"

IMAGE_NAME="everything-suite:latest"
TAR_NAME="everything-suite.tar"

echo "=========================================================="
echo "      Everything 全套中文软件 Docker 镜像构建工具         "
echo "=========================================================="

echo "[1/2] 正在构建 Docker 镜像: ${IMAGE_NAME} ..."
docker build -t "${IMAGE_NAME}" -f Dockerfile .

echo "[2/2] 构建完成！"
echo ""
echo "您可以选择："
echo " 1. 本地直接运行容器测试："
echo "    docker run -d -p 8080:80 --name everything-suite ${IMAGE_NAME}"
echo "    然后在浏览器打开 http://localhost:8080 访问导航中心。"
echo ""
echo " 2. 打包导出为离线文件导入 NAS："
echo "    docker save -o ${TAR_NAME} ${IMAGE_NAME}"
echo "    将生成的 ${TAR_NAME} 上传到群晖/威联通的 Container Station / Docker 页面中即可导入启动！"
echo "=========================================================="
