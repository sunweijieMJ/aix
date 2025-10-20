# 故障排查指南

## 🔍 常见问题

### 数据库相关

#### 1. 数据库连接失败

**问题**: `Database connection error: ECONNREFUSED`

**可能原因**:
- PostgreSQL 服务未启动
- 数据库配置错误
- 防火墙阻止连接

**解决方案**:

```bash
# 1. 检查 PostgreSQL 是否运行
# macOS
brew services list | grep postgresql

# Linux
sudo systemctl status postgresql

# 2. 启动 PostgreSQL
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql

# 3. 测试连接
psql -h localhost -U postgres -d base_node_dev

# 4. 检查配置
cat .env.development | grep DB_
```

#### 2. 数据库不存在

**问题**: `database "base_node_dev" does not exist`

**原因**: 首次运行项目时，数据库尚未创建。

**解决方案**:

```bash
# 方式1：使用脚本（推荐）
cd server
./scripts/create-db.sh

# 方式2：手动创建
psql -U postgres -c "CREATE DATABASE base_node_dev;"
psql -U postgres -c "CREATE DATABASE base_node_test;"

# 方式3：使用 Docker
docker exec -it postgres psql -U postgres -c "CREATE DATABASE base_node_dev;"
```

**详细说明**: 参见 [数据库配置文档](./DATABASE.md)

#### 3. 数据库权限错误

**问题**: `permission denied for database`

**解决方案**:

```sql
-- 1. 以超级用户连接
psql -U postgres

-- 2. 授予权限
GRANT ALL PRIVILEGES ON DATABASE base_node_dev TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
```

#### 3. 数据库迁移失败

**问题**: `Migration failed`

**解决方案**:

```bash
# 1. 删除数据库（开发环境）
dropdb base_node_dev

# 2. 重新创建
createdb base_node_dev

# 3. 重启服务（自动运行迁移）
pnpm start
```

### 缓存相关

#### 4. Redis 连接失败

**问题**: `Redis connection error: ECONNREFUSED`

**解决方案**:

```bash
# 1. 检查 Redis 是否运行
redis-cli ping
# 应返回: PONG

# 2. 启动 Redis
# macOS
brew services start redis

# Docker
docker run -d -p 6379:6379 redis:latest

# 3. 检查端口
lsof -i:6379

# 4. 临时使用 Memory 缓存
# 修改 .env.development
CACHE_TYPE=memory
```

#### 5. Redis 认证失败

**问题**: `NOAUTH Authentication required`

**解决方案**:

```bash
# 1. 查找 Redis 密码
# 查看 redis.conf
grep "requirepass" /usr/local/etc/redis.conf

# 2. 配置环境变量
# .env.development
REDIS_PASSWORD=your-redis-password

# 3. 测试连接
redis-cli -a your-redis-password ping
```

### 认证相关

#### 6. JWT Token 无效

**问题**: `Invalid or expired token`

**可能原因**:
- Token 已过期
- JWT_SECRET 不匹配
- Token 被列入黑名单

**解决方案**:

```bash
# 1. 检查 Token 是否过期
# 访问 https://jwt.io/ 解码 token

# 2. 重新登录获取新 token
curl -X POST http://localhost:3001/local/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}'

# 3. 检查 JWT_SECRET 配置
cat .env.development | grep JWT_SECRET
```

#### 7. 密码强度不符合要求

**问题**: `Password must contain at least one uppercase letter`

**要求**:
- 至少 8 个字符
- 包含大写字母
- 包含小写字母
- 包含数字

**示例**:
- ✅ `Password123`
- ✅ `Admin123!`
- ❌ `password` (缺少大写和数字)
- ❌ `Pass1` (太短)

### 端口相关

#### 8. 端口被占用

**问题**: `Error: listen EADDRINUSE: address already in use :::3001`

**解决方案**:

```bash
# 1. 查找占用端口的进程
# macOS/Linux
lsof -ti:3001

# 2. 结束进程
lsof -ti:3001 | xargs kill -9

# 3. 或更改端口
# .env.development
PORT=3002
```

### 测试相关

#### 9. 测试失败

**问题**: Tests failed

**解决方案**:

```bash
# 1. 清除依赖
rm -rf node_modules
pnpm install

# 2. 清除缓存
pnpm store prune

# 3. 单独运行失败的测试
pnpm test tests/auth/service.test.ts

# 4. 查看详细日志
pnpm test -- --reporter=verbose
```

#### 10. 测试数据库污染

**问题**: 测试相互影响

**解决方案**:

```bash
# 使用独立的测试数据库
# .env.test
DB_NAME=base_node_test
```

### 性能相关

#### 11. 响应速度慢

**可能原因**:
- 数据库查询慢
- 缓存未命中
- 网络延迟

**排查步骤**:

```bash
# 1. 查看监控指标
curl http://localhost:3001/metrics

# 2. 查看缓存命中率
curl http://localhost:3001/api/cache/stats

# 3. 检查数据库慢查询
# PostgreSQL
psql -U postgres -d base_node_dev -c "
  SELECT query, mean_exec_time, calls 
  FROM pg_stat_statements 
  ORDER BY mean_exec_time DESC 
  LIMIT 10;
"

# 4. 启用 Redis 缓存
# .env.development
CACHE_TYPE=redis
```

#### 12. 内存占用过高

**解决方案**:

```bash
# 1. 查看内存使用
curl http://localhost:3001/system/info

# 2. 清除缓存
curl -X DELETE http://localhost:3001/api/cache/clear

# 3. 配置内存限制（生产环境）
# package.json
"prod": "node --max-old-space-size=512 dist/index.js"
```

### 构建和部署

#### 13. 构建失败

**问题**: `Build failed`

**解决方案**:

```bash
# 1. 清除构建产物
rm -rf dist

# 2. 检查 TypeScript 错误
pnpm build

# 3. 检查依赖版本
pnpm outdated

# 4. 更新依赖（谨慎）
pnpm update
```

#### 14. Docker 构建失败

**问题**: Docker build error

**解决方案**:

```bash
# 1. 清除 Docker 缓存
docker system prune -a

# 2. 重新构建
docker build --no-cache -t base-node-server .

# 3. 检查 Dockerfile
cat Dockerfile

# 4. 查看构建日志
docker build -t base-node-server . --progress=plain
```

### 日志相关

#### 15. 日志文件过大

**解决方案**:

```bash
# 1. 配置日志轮转
# 使用 logrotate 或 pm2

# 2. 限制日志级别（生产环境）
# .env.production
LOG_LEVEL=info

# 3. 手动清理
rm -rf logs/*.log

# 4. 禁用文件日志（临时）
# .env.development
LOG_FILE_ENABLED=false
```

## 🛠️ 调试技巧

### 启用调试模式

```bash
# 1. 设置日志级别
LOG_LEVEL=debug pnpm start

# 2. 查看详细错误堆栈
NODE_ENV=development pnpm start

# 3. 使用 Node 调试器
node --inspect dist/index.js
```

### 使用日志

```typescript
import { createLogger } from './utils/logger';
const logger = createLogger('MODULE_NAME');

logger.debug('Debug info', { data });
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error occurred', error);
```

### 监控健康状态

```bash
# 详细健康检查
curl http://localhost:3001/health/detailed | jq

# 监控指标
curl http://localhost:3001/metrics | jq

# 系统信息
curl http://localhost:3001/system/info | jq
```

## 📊 性能优化

### 数据库优化

```sql
-- 1. 创建索引
CREATE INDEX idx_config_path ON local_configs(path);

-- 2. 分析查询
EXPLAIN ANALYZE SELECT * FROM local_configs WHERE path = 'app.theme';

-- 3. 清理无用数据
VACUUM ANALYZE local_configs;
```

### 缓存优化

```bash
# 1. 监控缓存命中率
watch -n 1 'curl -s http://localhost:3001/api/cache/stats | jq .result.hitRate'

# 2. 调整 TTL
# .env.development
CACHE_TTL=600  # 10分钟

# 3. 预热缓存
curl http://localhost:3001/local/v1/config
```

## 🔐 安全建议

### 生产环境检查清单

- [ ] 修改 JWT_SECRET
- [ ] 启用 HTTPS
- [ ] 配置 CORS
- [ ] 启用限流
- [ ] 设置强密码策略
- [ ] 禁用 Swagger（可选）
- [ ] 配置防火墙
- [ ] 定期备份数据库
- [ ] 监控异常登录
- [ ] 使用 Helmet 安全头

### 安全配置

```bash
# .env.production
NODE_ENV=production
JWT_SECRET=<strong-random-secret>  # 至少 32 字符
SWAGGER_ENABLED=false
RATE_LIMIT_MAX=100
ENABLE_HELMET=true
```

## 📞 获取帮助

### 收集信息

遇到问题时，请收集以下信息：

```bash
# 1. 系统信息
node -v
pnpm -v
psql --version

# 2. 服务信息
curl http://localhost:3001/health/detailed

# 3. 日志
tail -n 100 logs/error.log

# 4. 配置（删除敏感信息）
cat .env.development | grep -v PASSWORD
```

### 联系方式

- 📖 查看 [文档](./README.md)
- 🐛 提交 [Issue](../../issues)
- 💬 加入讨论组

---

**提示**: 大部分问题都可以通过重启服务解决。如果问题持续存在，请查看日志文件或提交 Issue。
