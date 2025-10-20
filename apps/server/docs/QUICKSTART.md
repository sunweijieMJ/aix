# 快速开始

## 🚀 5分钟快速启动

### 1. 环境准备

确保已安装：
- Node.js 22+
- pnpm 
- PostgreSQL 数据库

### 2. 安装依赖

```bash
cd server
pnpm install
```

### 3. 创建数据库

```bash
# 方式1：使用脚本（推荐）
./scripts/create-db.sh

# 方式2：手动创建
psql -U postgres -c "CREATE DATABASE base_node_dev;"
psql -U postgres -c "CREATE DATABASE base_node_test;"
```

**注意**：数据库名称必须与 `.env` 文件中的 `DB_NAME` 一致。

### 4. 配置环境变量

参考环境变量配置说明，默认使用内存缓存和本地 PostgreSQL。

### 5. 启动服务

#### 方式 1: 一键启动（推荐）

```bash
# 自动检查并启动 PostgreSQL，创建数据库，启动服务
pnpm dev
```

#### 方式 2: 手动启动

```bash
# 启动 PostgreSQL（如果使用 Docker）
docker start base-node-postgres  # 或你的 PostgreSQL 容器名

# 启动开发服务（热重载）
pnpm start
```

#### 其他命令

```bash
# 生产模式
pnpm build
pnpm prod

# 运行测试
pnpm test

# 创建数据库
pnpm db:create

# 停止 PostgreSQL
pnpm db:stop
```

### 6. 访问服务

- **API 基础地址**: `http://localhost:3001/local/v1`
- **API 文档**: `http://localhost:3001/local/v1/docs`
- **健康检查**: `http://localhost:3001/health`
- **性能指标**: `http://localhost:3001/metrics`

## 📝 快速示例

### 注册用户

```bash
curl -X POST http://localhost:3001/local/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@example.com",
    "password": "Admin123!"
  }'
```

### 登录获取 Token

```bash
curl -X POST http://localhost:3001/local/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Admin123!"
  }'
```

响应：
```json
{
  "code": 0,
  "message": "Login successful",
  "result": {
    "token": "eyJhbGc...",
    "user": { ... },
    "expiresIn": 86400
  }
}
```

### 创建配置（需要认证）

```bash
curl -X PUT http://localhost:3001/local/v1/config/app.theme \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "value": {
      "color": "blue",
      "mode": "dark"
    }
  }'
```

### 获取配置

```bash
curl http://localhost:3001/local/v1/config/app.theme \
  -H "Authorization: Bearer <your-token>"
```

## 🐳 Docker 快速启动

### 使用 Docker Compose

```bash
# 启动所有服务（包括 PostgreSQL 和 Redis）
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 单独构建镜像

```bash
# 构建镜像
docker build -t base-node-server .

# 运行容器
docker run -d -p 3001:3001 \
  --name base-node-server \
  -e NODE_ENV=production \
  base-node-server
```

## ⚙️ 环境变量配置

### 最小配置

```bash
# .env.development
NODE_ENV=development
PORT=3001
DB_NAME=base_node_dev
DB_USER=postgres
DB_PASSWORD=password
```

### 完整配置

参考项目根目录的 `.env.example` 文件（需手动创建）。

## 📊 验证安装

### 1. 健康检查

```bash
curl http://localhost:3001/health
```

应返回：
```json
{
  "status": "healthy",
  "timestamp": "2025-10-11T08:00:00.000Z",
  "uptime": 123.456,
  "checks": {
    "database": "healthy",
    "cache": "healthy"
  }
}
```

### 2. 运行测试

```bash
pnpm test
```

应显示：
```
✓ Test Files  8 passed (8)
✓ Tests  121 passed (121)
```

### 3. 查看日志

开发模式下，日志会实时输出到控制台。生产模式日志保存在 `logs/` 目录。

## 🔧 常见问题

### 数据库连接失败

**问题**: `Database connection error: ECONNREFUSED`

**解决方案**:
1. 确认 PostgreSQL 已启动
2. 检查数据库配置（用户名、密码、端口）
3. 检查防火墙设置

### 端口被占用

**问题**: `Error: listen EADDRINUSE: address already in use :::3001`

**解决方案**:
1. 更改端口：修改 `.env.development` 中的 `PORT` 变量
2. 或关闭占用端口的进程：
   ```bash
   # macOS/Linux
   lsof -ti:3001 | xargs kill -9
   ```

### 测试失败

**解决方案**:
1. 清除 node_modules: `rm -rf node_modules && pnpm install`
2. 清除缓存: `pnpm store prune`
3. 检查 Node 版本: `node -v` (需要 22+)

## 📚 下一步

- 📖 阅读 [架构文档](./ARCHITECTURE.md) 了解系统设计
- 🔐 查看 [认证指南](./AUTH.md) 配置 JWT 认证
- 💾 参考 [Redis 指南](./REDIS.md) 启用分布式缓存
- 📊 学习 [监控指南](./MONITORING.md) 配置系统监控
- 🧪 查看 [测试指南](./TESTING.md) 编写单元测试

## 💡 提示

- 开发时使用 Memory 缓存，生产环境建议使用 Redis
- 定期备份数据库
- 生产环境务必修改 `JWT_SECRET`
- 启用 HTTPS（生产环境）
- 配置日志级别（生产环境使用 `info` 或 `warn`）

---

**遇到问题?** 查看 [故障排查](./TROUBLESHOOTING.md) 或提交 Issue。
