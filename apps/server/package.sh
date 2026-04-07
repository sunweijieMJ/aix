#!/usr/bin/env bash
# 本地打包脚本：从 monorepo 根目录构建 aix-server Docker 镜像
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

VERSION=$(node -p "require('$SCRIPT_DIR/package.json').version")
IMAGE_NAME="aix-server"

echo "📦 Building Docker image: $IMAGE_NAME:$VERSION"
echo "   Context: $MONOREPO_ROOT"
echo ""

docker build \
  -f "$SCRIPT_DIR/Dockerfile" \
  -t "$IMAGE_NAME:$VERSION" \
  -t "$IMAGE_NAME:latest" \
  "$MONOREPO_ROOT"

echo ""
echo "✅ Build complete:"
echo "   $IMAGE_NAME:$VERSION"
echo "   $IMAGE_NAME:latest"
echo ""
echo "运行示例："
echo "  docker run -d \\"
echo "    -p 3000:3000 \\"
echo "    -v \$(pwd)/storage:/app/storage \\"
echo "    $IMAGE_NAME:latest"
