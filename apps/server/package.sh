#!/bin/bash

# 在出现错误、未定义变量和管道故障时退出
set -euo pipefail

# 日志函数
log_info() { echo -e "\033[0;32m[INFO]\033[0m $*"; }
log_warn() { echo -e "\033[0;33m[WARN]\033[0m $*"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }

# 错误处理
handle_error() {
    log_error "An error occurred on line $1"
    exit 1
}

# 设置错误处理
trap 'handle_error $LINENO' ERR

# 创建构建信息
create_build_info() {
    log_info "Creating build info..."

    {
        echo "git_branch=${gitBranch}"
        echo "git_hash=${gitHash}"
        echo "build_at=${dateTime}"
        echo "server_docker_name=${serverImageName}"
    } > server_build_info.sh
}

# 检查必需工具
check_requirements() {
    local required_tools="docker git pnpm"
    for tool in $required_tools; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log_error "Required tool not found: $tool"
            exit 1
        fi
    done
}

# 代码质量检查
check_code_quality() {
    log_info "Running code quality checks..."

    # TypeScript 类型检查
    log_info "Type checking..."
    if ! pnpm run type-check; then
        log_error "Type check failed"
        return 1
    fi
    log_info "✓ Type check passed"

    # ESLint 检查
    log_info "Linting..."
    if ! pnpm run lint; then
        log_error "Linting failed"
        return 1
    fi
    log_info "✓ Linting passed"

    # 代码格式检查
    log_info "Format checking..."
    if ! pnpm run format; then
        log_error "Format check failed (run 'pnpm run format' to fix)"
        return 1
    fi
    log_info "✓ Format check passed"

    # 运行测试
    log_info "Running tests..."
    if ! pnpm test; then
        log_error "Tests failed"
        return 1
    fi
    log_info "✓ All tests passed"

    log_info "✓ All code quality checks passed!"
}

# 构建应用
build_app() {
    log_info "Building TypeScript application..."

    # 先安装依赖（如果需要）
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        pnpm install --frozen-lockfile
    fi

    # 执行构建
    pnpm build
}

# 构建Docker镜像
build_docker_image() {
    log_info "Building Docker image for $platformArch..."
    local build_cmd="docker build"

    if [ "$platformArch" = "arm64" ]; then
        build_cmd+=" --platform linux/arm64"
    elif [ "$platformArch" = "amd64" ]; then
        build_cmd+=" --platform linux/amd64"
    fi

    $build_cmd -f "$DOCKERFILE_PATH" -t "${serverImageName}" \
        --build-arg BASE_IMAGE="${BASE_IMAGE}" .
}

# 保存Docker镜像
save_docker_image() {
    log_info "Saving Docker image..."
    local saved_image_name="${imageTagName}.tar"

    docker tag "${serverImageName}" "${imageTagName}"
    docker save "${imageTagName}" -o "${saved_image_name}"

    # 计算MD5
    local md5=$(md5sum "${saved_image_name}" | awk '{ print $1 }')
    log_info "Docker image MD5: ${md5}"

    # 补充 Docker MD5 信息到构建信息文件
    echo "server_docker_md5=${md5}" >> server_build_info.sh

    # 移动文件到部署目录
    mv "${saved_image_name}" "base_node_server/"
    mv server_build_info.sh "base_node_server/"
}

# 准备部署文件
prepare_deployment_files() {
    log_info "Preparing deployment files..."
    mkdir -p base_node_server
}

# 主函数
main() {
    local start_time=$(date +%s)

    # 检查依赖
    check_requirements

    # 平台选择
    echo "请选择目标运行平台:"
    echo "1) amd64 (默认)"
    echo "2) arm64"
    read -p "请输入选项 [1]: " platform_choice
    platform_choice=${platform_choice:-1}

    case "$platform_choice" in
        1)
            platformArch="amd64"
            BASE_IMAGE="node:22-alpine"
            ;;
        2)
            platformArch="arm64"
            BASE_IMAGE="node:22-alpine"
            ;;
        *)
            log_error "无效的选项: $platform_choice"
            log_error "请选择 1(amd64) 或 2(arm64)"
            exit 1
            ;;
    esac

    # 定义变量
    DOCKERFILE_PATH="./Dockerfile"
    gitBranch=$(git rev-parse --abbrev-ref HEAD)
    gitHash=$(git rev-parse --short HEAD)
    dateTime=$(date "+%Y-%m-%d_%H-%M-%S")
    packagePrefix='base-node-server'
    imagePrefix='base-node'
    imageTag="${gitHash}-${platformArch}"
    serverImageName="${packagePrefix}:${imageTag}"
    imageTagName="${imagePrefix}:${imageTag}"
    packageName="${packagePrefix}_${imageTag}_${dateTime}.tar.gz"

    log_info "Building package: ${packageName}"
    log_info "Platform: ${platformArch}"
    log_info "Git branch: ${gitBranch}"
    log_info "Git hash: ${gitHash}"

    # 执行构建步骤
    check_code_quality  # 新增：代码质量检查
    build_app
    create_build_info
    prepare_deployment_files
    build_docker_image
    save_docker_image

    # 创建部署包
    log_info "Creating deployment package..."
    tar -czf "${packageName}" base_node_server

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log_info "Successfully completed in ${duration} seconds!"
    log_info "Deployment package created: ${packageName}"
    log_info "Docker image saved in deployment package"

    # 清理临时文件
    rm -rf base_node_server
}

# 执行主函数
main "$@"
