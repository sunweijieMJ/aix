#!/bin/bash

# ============================================
# 开发环境启动脚本
# 自动检查并启动 PostgreSQL，然后启动服务
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 确保在正确的目录执行
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SERVER_DIR"

echo -e "${BLUE}🚀 启动 AIX Server 开发环境...${NC}"
echo -e "${BLUE}📂 当前目录: $(pwd)${NC}"
echo ""

# 检查 PostgreSQL 容器
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-base-node-postgres}"

if docker ps -a --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    echo -e "${GREEN}📦 检测到 PostgreSQL 容器: ${POSTGRES_CONTAINER}${NC}"

    if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
        echo -e "${YELLOW}🔄 启动 PostgreSQL 容器...${NC}"
        docker start ${POSTGRES_CONTAINER}
        echo -e "${YELLOW}⏳ 等待 PostgreSQL 启动...${NC}"
        sleep 3
        echo -e "${GREEN}✅ PostgreSQL 容器已启动${NC}"
    else
        echo -e "${GREEN}✅ PostgreSQL 容器已在运行${NC}"
    fi
else
    echo -e "${RED}❌ 未找到 PostgreSQL 容器: ${POSTGRES_CONTAINER}${NC}"
    echo ""
    echo -e "${YELLOW}请先创建 PostgreSQL 容器：${NC}"
    echo ""
    echo -e "${BLUE}# 快速创建（推荐）${NC}"
    echo -e "${GREEN}pnpm db:create${NC}"
    echo ""
    echo -e "${BLUE}# 或手动创建${NC}"
    echo "docker run --name ${POSTGRES_CONTAINER} \\"
    echo "  -e POSTGRES_PASSWORD=password \\"
    echo "  -p 5432:5432 \\"
    echo "  -d postgres:alpine"
    echo ""
    echo -e "${BLUE}# 或使用 docker-compose${NC}"
    echo -e "${GREEN}docker-compose up -d${NC}"
    echo ""
    exit 1
fi

# 检查数据库是否存在
echo ""
echo -e "${BLUE}🗄️  检查数据库...${NC}"

# 检查数据库连接
if ! docker exec ${POSTGRES_CONTAINER} pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${YELLOW}⏳ 等待数据库就绪...${NC}"
    sleep 2
fi

# 检查并创建数据库
if ! docker exec ${POSTGRES_CONTAINER} psql -U postgres -lqt | cut -d \| -f 1 | grep -qw base_node_dev; then
    echo -e "${YELLOW}📝 创建开发数据库...${NC}"
    docker exec ${POSTGRES_CONTAINER} psql -U postgres -c "CREATE DATABASE base_node_dev;" > /dev/null
    docker exec ${POSTGRES_CONTAINER} psql -U postgres -c "CREATE DATABASE base_node_test;" > /dev/null
    echo -e "${GREEN}✅ 数据库创建成功${NC}"
else
    echo -e "${GREEN}✅ 数据库已存在${NC}"
fi

echo ""
echo -e "${GREEN}🎯 启动服务...${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# 启动服务（使用 pnpm start）
exec pnpm start
