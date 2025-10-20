# 数据库配置

## 📋 概述

项目使用 PostgreSQL 数据库，数据库名称统一使用 `base_node_{env}` 格式：

- **开发环境**: `base_node_dev`
- **测试环境**: `base_node_test`
- **生产环境**: `base_node_prod`

> **提示**: 数据库名称前缀定义在 `src/constants/project.ts` 中的 `PROJECT.DB_PREFIX`，便于统一管理。

## 🚀 快速开始

### 方式 1: 使用脚本（推荐）

```bash
# 进入项目目录
cd server

# 运行数据库创建脚本
./scripts/create-db.sh
```

脚本会自动创建所有环境的数据库。

### 方式 2: 手动创建

```bash
# 使用 psql 命令
psql -U postgres -c "CREATE DATABASE base_node_dev;"
psql -U postgres -c "CREATE DATABASE base_node_test;"
psql -U postgres -c "CREATE DATABASE base_node_prod;"
```

### 方式 3: 使用 Docker

如果使用 Docker Compose 管理 PostgreSQL：

```bash
# 方式 A: 使用 docker-compose
docker compose up -d postgres

# 方式 B: 直接运行容器
docker run --name base-node-postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgres:alpine

# 进入容器创建数据库
docker exec -it base-node-postgres psql -U postgres -c "CREATE DATABASE base_node_dev;"
docker exec -it base-node-postgres psql -U postgres -c "CREATE DATABASE base_node_test;"
```

## 🔧 环境变量配置

确保 `.env` 文件中的数据库配置正确：

```bash
# .env.development
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=base_node_dev      # 对应开发数据库
DB_USER=postgres
DB_PASSWORD=password

# .env.test
DB_NAME=base_node_test     # 对应测试数据库

# .env.production
DB_NAME=base_node_prod     # 对应生产数据库
```

## 🗄️ 数据库结构

项目启动时会自动创建以下表：

### users 表

用户信息表：

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### local_config 表

配置信息表：

```sql
CREATE TABLE local_config (
  id SERIAL PRIMARY KEY,
  path VARCHAR(500) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_local_config_path ON local_config(path);
```

## 🔍 验证

### 检查数据库是否创建成功

```bash
psql -U postgres -l | grep base_node
```

应该看到类似输出：

```
base_node_dev   | postgres | UTF8     | ...
base_node_test  | postgres | UTF8     | ...
base_node_prod  | postgres | UTF8     | ...
```

### 检查表是否创建成功

```bash
psql -U postgres -d base_node_dev -c "\dt"
```

应该看到 `users` 和 `local_config` 表。

## 🛠️ 常见问题

### 数据库已存在错误

如果看到 "database already exists" 错误，说明数据库已经创建，无需再次创建。

### 连接失败

检查：
1. PostgreSQL 服务是否启动
2. 用户名和密码是否正确
3. 端口是否被占用

```bash
# 检查 PostgreSQL 服务
pg_isready -U postgres

# 或使用 Docker
docker ps | grep postgres
```

### 修改数据库名称

如需修改项目的数据库名称前缀：

1. 更新 `src/constants/project.ts` 中的 `DB_PREFIX`
2. 重新创建数据库
3. 更新所有 `.env` 文件中的 `DB_NAME`

## 📚 相关文档

- [快速开始](./QUICKSTART.md) - 项目启动指南
- [故障排查](./TROUBLESHOOTING.md) - 常见问题解决

---

**提示**: 生产环境请务必使用强密码，并限制数据库访问权限。
