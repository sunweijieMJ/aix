#!/usr/bin/env bash
# 本地打包脚本：从 monorepo 根目录构建 aix-server Docker 镜像
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 日志函数
log_info()  { echo -e "\033[0;32m[INFO]\033[0m $*"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }

# 检查必需工具
check_requirements() {
    for tool in docker git; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log_error "Required tool not found: $tool"
            exit 1
        fi
    done
}

# 构建 Docker 镜像
build_docker_image() {
    log_info "Building Docker image: ${imageTag}..."
    docker build \
        -f "$SCRIPT_DIR/Dockerfile" \
        -t "${imageTag}" \
        -t "${imageName}:latest" \
        "$MONOREPO_ROOT"
}

# 主函数
main() {
    check_requirements

    # 读取版本（纯 bash，无需 Node.js）
    local version
    version=$(grep '"version"' "$SCRIPT_DIR/package.json" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')

    local gitBranch gitHash
    gitBranch=$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD)
    gitHash=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD)

    imageName="aix-server"
    imageTag="${imageName}:${version}"

    log_info "=========================================="
    log_info "构建信息:"
    log_info "  分支:   ${gitBranch}"
    log_info "  Hash:   ${gitHash}"
    log_info "  版本:   ${version}"
    log_info "  镜像:   ${imageTag}"
    log_info "  Context: ${MONOREPO_ROOT}"
    log_info "=========================================="

    build_docker_image

    log_info "=========================================="
    log_info "构建完成！"
    log_info "  ${imageTag}"
    log_info "  ${imageName}:latest"
    log_info ""
    log_info "运行示例:"
    log_info "  docker run -d \\"
    log_info "    -p 3000:3000 \\"
    log_info "    -v \$(pwd)/storage:/app/storage \\"
    log_info "    ${imageName}:latest"
    log_info "=========================================="
}

main "$@"
