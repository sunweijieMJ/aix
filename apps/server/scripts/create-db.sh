#!/bin/bash

# 创建数据库脚本
# 用于创建开发、测试、生产环境的数据库

set -e

echo "🗄️  Creating PostgreSQL databases..."

# 数据库前缀（从 src/constants/project.ts 中的 DB_PREFIX）
DB_PREFIX="base_node"

# 检测 PostgreSQL 连接方式
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-base-node-postgres}"

# 检查是否使用 Docker
if docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    echo "📦 使用 Docker 容器: ${POSTGRES_CONTAINER}"

    # 创建开发数据库
    echo "Creating ${DB_PREFIX}_dev..."
    docker exec ${POSTGRES_CONTAINER} psql -U postgres -c "CREATE DATABASE ${DB_PREFIX}_dev;" 2>/dev/null || echo "  ✓ ${DB_PREFIX}_dev already exists"

    # 创建测试数据库
    echo "Creating ${DB_PREFIX}_test..."
    docker exec ${POSTGRES_CONTAINER} psql -U postgres -c "CREATE DATABASE ${DB_PREFIX}_test;" 2>/dev/null || echo "  ✓ ${DB_PREFIX}_test already exists"

    # 创建生产数据库
    echo "Creating ${DB_PREFIX}_prod..."
    docker exec ${POSTGRES_CONTAINER} psql -U postgres -c "CREATE DATABASE ${DB_PREFIX}_prod;" 2>/dev/null || echo "  ✓ ${DB_PREFIX}_prod already exists"

elif command -v psql &> /dev/null; then
    echo "🖥️  使用本地 PostgreSQL"

    # 默认使用 postgres 用户
    PG_USER="${POSTGRES_USER:-postgres}"
    PG_HOST="${POSTGRES_HOST:-localhost}"
    PG_PORT="${POSTGRES_PORT:-5432}"

    # 创建开发数据库
    echo "Creating ${DB_PREFIX}_dev..."
    PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -c "CREATE DATABASE ${DB_PREFIX}_dev;" 2>/dev/null || echo "  ✓ ${DB_PREFIX}_dev already exists"

    # 创建测试数据库
    echo "Creating ${DB_PREFIX}_test..."
    PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -c "CREATE DATABASE ${DB_PREFIX}_test;" 2>/dev/null || echo "  ✓ ${DB_PREFIX}_test already exists"

    # 创建生产数据库
    echo "Creating ${DB_PREFIX}_prod..."
    PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -c "CREATE DATABASE ${DB_PREFIX}_prod;" 2>/dev/null || echo "  ✓ ${DB_PREFIX}_prod already exists"
else
    echo "❌ 未找到 PostgreSQL"
    echo ""
    echo "请选择以下方式之一："
    echo "1. 启动 Docker 容器: docker start ${POSTGRES_CONTAINER}"
    echo "2. 安装 psql 客户端: brew install libpq"
    exit 1
fi

echo ""
echo "✅ All databases created successfully!"
echo ""
echo "📝 环境变量配置："
echo "   .env.development: DB_NAME=${DB_PREFIX}_dev"
echo "   .env.test:        DB_NAME=${DB_PREFIX}_test"
echo "   .env.production:  DB_NAME=${DB_PREFIX}_prod"

