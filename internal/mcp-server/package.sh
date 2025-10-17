#!/bin/bash

# MCP Server 生产环境构建和启动脚本
# 用于生产环境的构建、数据提取和服务启动

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PACKAGES_DIR="$PROJECT_ROOT/packages"
DATA_DIR="$SCRIPT_DIR/data"
NODE_ENV="${NODE_ENV:-production}"

# 显示使用帮助
show_help() {
    echo "MCP Server 生产环境构建和启动脚本"
    echo ""
    echo "用法: $0 [选项] <命令>"
    echo ""
    echo "命令:"
    echo "  build       构建 MCP Server"
    echo "  extract     提取组件数据"
    echo "  start       启动 MCP Server"
    echo "  restart     重启 MCP Server"
    echo "  stop        停止 MCP Server"
    echo "  status      查看服务状态"
    echo "  logs        查看服务日志"
    echo "  clean       清理构建文件和缓存"
    echo "  all         执行完整的构建、提取和启动流程"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示此帮助信息"
    echo "  -v, --verbose  显示详细输出"
    echo "  -d, --daemon   后台运行服务"
    echo "  --data-dir     指定数据目录 (默认: $DATA_DIR)"
    echo "  --packages-dir 指定包目录 (默认: $PACKAGES_DIR)"
    echo ""
    echo "环境变量:"
    echo "  NODE_ENV       环境模式 (默认: production)"
    echo "  MCP_PORT       服务端口 (默认: 不使用端口，使用 stdio)"
    echo ""
    echo "示例:"
    echo "  $0 all                    # 完整构建和启动"
    echo "  $0 build                  # 仅构建"
    echo "  $0 extract -v             # 详细模式提取数据"
    echo "  $0 start -d               # 后台启动服务"
    echo "  $0 --data-dir ./custom-data extract  # 使用自定义数据目录"
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."

    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装或不在 PATH 中"
        exit 1
    fi

    # 检查 pnpm
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm 未安装或不在 PATH 中"
        exit 1
    fi

    # 检查 Node.js 版本
    NODE_VERSION=$(node --version | sed 's/v//')
    REQUIRED_VERSION="22.0.0"
    if ! node -e "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION') ? 0 : 1)" 2>/dev/null; then
        log_warning "建议使用 Node.js >= $REQUIRED_VERSION，当前版本: $NODE_VERSION"
    fi

    log_success "依赖检查完成"
}

# 构建项目
build_project() {
    log_info "开始构建 MCP Server..."

    cd "$SCRIPT_DIR"

    # 安装依赖
    log_info "安装依赖..."
    pnpm install --prod=false

    # 构建项目
    log_info "构建项目..."
    pnpm build

    log_success "构建完成"
}

# 提取组件数据
extract_data() {
    log_info "开始提取组件数据..."

    cd "$SCRIPT_DIR"

    # 确保构建文件存在
    if [ ! -f "dist/cli.js" ]; then
        log_warning "构建文件不存在，开始构建..."
        build_project
    fi

    # 提取数据
    local extract_cmd="node dist/cli.js extract --packages=\"$PACKAGES_DIR\" --output=\"$DATA_DIR\""
    if [ "$VERBOSE" = true ]; then
        extract_cmd="$extract_cmd --verbose"
    fi

    log_info "执行: $extract_cmd"
    eval $extract_cmd

    log_success "数据提取完成"
}

# 启动服务
start_service() {
    log_info "启动 MCP Server..."

    cd "$SCRIPT_DIR"

    # 确保数据存在
    if [ ! -f "$DATA_DIR/components-index.json" ]; then
        log_warning "组件数据不存在，开始提取..."
        extract_data
    fi

    # 设置环境变量
    export NODE_ENV="$NODE_ENV"

    # 启动服务
    local start_cmd="node dist/cli.js serve --data=\"$DATA_DIR\""

    if [ "$DAEMON_MODE" = true ]; then
        log_info "后台模式启动服务..."
        nohup $start_cmd > "$DATA_DIR/server.log" 2>&1 &
        local PID=$!
        echo $PID > "$DATA_DIR/server.pid"
        log_success "服务已在后台启动，PID: $PID"
        log_info "日志文件: $DATA_DIR/server.log"
        log_info "PID 文件: $DATA_DIR/server.pid"
    else
        log_info "前台模式启动服务..."
        eval $start_cmd
    fi
}

# 停止服务
stop_service() {
    log_info "停止 MCP Server..."

    local PID_FILE="$DATA_DIR/server.pid"

    if [ -f "$PID_FILE" ]; then
        local PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            rm -f "$PID_FILE"
            log_success "服务已停止 (PID: $PID)"
        else
            log_warning "进程不存在 (PID: $PID)"
            rm -f "$PID_FILE"
        fi
    else
        log_warning "PID 文件不存在，尝试通过进程名停止..."
        pkill -f "mcp-server" || log_warning "未找到运行中的 MCP Server 进程"
    fi
}

# 重启服务
restart_service() {
    log_info "重启 MCP Server..."
    stop_service
    sleep 2
    start_service
}

# 查看服务状态
show_status() {
    log_info "检查 MCP Server 状态..."

    local PID_FILE="$DATA_DIR/server.pid"

    if [ -f "$PID_FILE" ]; then
        local PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            log_success "服务正在运行 (PID: $PID)"

            # 显示资源使用情况
            if command -v ps &> /dev/null; then
                local PS_OUTPUT=$(ps -p "$PID" -o pid,ppid,%cpu,%mem,etime,cmd --no-headers 2>/dev/null || echo "")
                if [ -n "$PS_OUTPUT" ]; then
                    echo "进程信息:"
                    echo "PID    PPID   CPU%  MEM%  ELAPSED  COMMAND"
                    echo "$PS_OUTPUT"
                fi
            fi

            return 0
        else
            log_error "PID 文件存在但进程不在运行 (PID: $PID)"
            rm -f "$PID_FILE"
            return 1
        fi
    else
        log_warning "服务未运行或 PID 文件不存在"
        return 1
    fi
}

# 查看日志
show_logs() {
    local LOG_FILE="$DATA_DIR/server.log"

    if [ -f "$LOG_FILE" ]; then
        log_info "显示服务日志..."
        tail -n 50 "$LOG_FILE"
    else
        log_warning "日志文件不存在: $LOG_FILE"
    fi
}

# 清理文件
clean_project() {
    log_info "清理构建文件和缓存..."

    cd "$SCRIPT_DIR"

    # 停止服务
    stop_service 2>/dev/null || true

    # 清理构建文件
    rm -rf dist/
    rm -rf node_modules/.cache/
    rm -rf "$DATA_DIR/.cache/"
    rm -f "$DATA_DIR/server.log"
    rm -f "$DATA_DIR/server.pid"

    log_success "清理完成"
}

# 完整流程
run_all() {
    log_info "开始完整的构建和启动流程..."

    check_dependencies
    build_project
    extract_data
    start_service

    log_success "完整流程执行完成"
}

# 解析命令行参数
VERBOSE=false
DAEMON_MODE=false
COMMAND=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -d|--daemon)
            DAEMON_MODE=true
            shift
            ;;
        --data-dir)
            DATA_DIR="$2"
            shift 2
            ;;
        --packages-dir)
            PACKAGES_DIR="$2"
            shift 2
            ;;
        build|extract|start|restart|stop|status|logs|clean|all)
            COMMAND="$1"
            shift
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

# 检查命令
if [ -z "$COMMAND" ]; then
    log_error "请指定命令"
    show_help
    exit 1
fi

# 确保数据目录存在
mkdir -p "$DATA_DIR"

# 执行命令
case $COMMAND in
    build)
        check_dependencies
        build_project
        ;;
    extract)
        check_dependencies
        extract_data
        ;;
    start)
        check_dependencies
        start_service
        ;;
    restart)
        restart_service
        ;;
    stop)
        stop_service
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    clean)
        clean_project
        ;;
    all)
        run_all
        ;;
    *)
        log_error "未知命令: $COMMAND"
        show_help
        exit 1
        ;;
esac
