#!/bin/bash

# 开发环境停止脚本

echo "🛑 停止开发环境..."

# 停止 PostgreSQL 容器（可选）
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-base-node-postgres}"

if docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    echo "📦 停止 PostgreSQL 容器: ${POSTGRES_CONTAINER}"
    docker stop ${POSTGRES_CONTAINER}
    echo "✅ PostgreSQL 容器已停止"
else
    echo "ℹ️  PostgreSQL 容器未运行"
fi

echo ""
echo "✅ 开发环境已停止"

