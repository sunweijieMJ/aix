# Redis 缓存接入指南

## 📋 简介

项目已完整实现 Redis 缓存支持，可以通过简单的配置在 Memory 缓存和 Redis 缓存之间切换。

## 🚀 快速启用 Redis

### 1. 安装 Redis

#### macOS
```bash
brew install redis
brew services start redis
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis-server
```

#### Docker
```bash
docker run --name redis -p 6379:6379 -d redis:latest
```

### 2. 配置应用

#### 方式一：使用预设配置
```bash
# 复制 Redis 配置文件
cp .env.redis .env.development

# 启动服务
pnpm start
```

#### 方式二：手动修改配置
编辑 `.env.development` 文件：

```bash
# 将缓存类型改为 redis
CACHE_TYPE=redis

# Redis 连接配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # 如果有密码则填写
REDIS_DB=0               # Redis 数据库编号
REDIS_KEY_PREFIX=node:   # 缓存键前缀
```

### 3. 验证 Redis 连接

启动服务后，查看日志：

```
✅ 成功连接：
[CACHE] Creating redis cache manager...
[REDIS_CACHE] Redis connecting...
[REDIS_CACHE] Redis connection ready
[CACHE] Cache manager created: redis

❌ 连接失败：
[REDIS_CACHE] Redis connection error
[CACHE] Redis configuration is missing, falling back to memory cache
```

## 🔧 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `CACHE_TYPE` | `memory` | 缓存类型：`memory` 或 `redis` |
| `CACHE_TTL` | `300` | 缓存过期时间（秒） |
| `REDIS_HOST` | `localhost` | Redis 主机地址 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `REDIS_PASSWORD` | `` | Redis 密码（可选） |
| `REDIS_DB` | `0` | Redis 数据库编号 |
| `REDIS_KEY_PREFIX` | `node:` | 缓存键前缀 |

### 缓存策略

#### Memory 缓存 (默认)
- ✅ 无需额外服务
- ✅ 速度极快（纳秒级）
- ⚠️ 单机限制，重启丢失
- ⚠️ 不适合分布式部署

#### Redis 缓存
- ✅ 支持分布式部署
- ✅ 数据持久化
- ✅ 丰富的数据结构
- ⚠️ 需要额外服务
- ⚠️ 网络延迟（毫秒级）

## 📊 功能特性

### 已实现功能

- ✅ 基础缓存操作（get、set、del、has、clear）
- ✅ 批量操作（mget、mset、mdel）
- ✅ TTL 过期时间
- ✅ 键前缀管理
- ✅ 连接重试机制
- ✅ 健康检查
- ✅ 统计信息

### 代码示例

```typescript
import { getCacheManager } from '../cache';

// 获取缓存管理器（自动根据配置选择 Memory 或 Redis）
const cacheManager = await getCacheManager();

// 基础操作
await cacheManager.set('key', { data: 'value' }, 300); // TTL 300秒
const value = await cacheManager.get('key');
await cacheManager.del('key');

// 批量操作
await cacheManager.mset([
  { key: 'key1', value: 'value1', ttl: 300 },
  { key: 'key2', value: 'value2', ttl: 600 },
]);
const values = await cacheManager.mget(['key1', 'key2']);

// 统计信息
const stats = await cacheManager.getStats();
console.log(`命中率: ${stats.hitRate}%`);
```

## 🧪 测试 Redis

### 1. Redis CLI 测试
```bash
# 连接 Redis
redis-cli

# 查看所有键
KEYS *

# 查看带前缀的键
KEYS node:*

# 获取键的值
GET node:config:all

# 清空数据库
FLUSHDB
```

### 2. HTTP API 测试

#### 查看缓存统计
```bash
curl http://localhost:3001/api/cache/stats
```

#### 清除缓存
```bash
curl -X DELETE http://localhost:3001/api/cache/clear
```

### 3. 性能测试

```bash
# 使用 ab 进行压力测试
ab -n 1000 -c 10 http://localhost:3001/local/v1/config

# 查看缓存命中率
curl http://localhost:3001/api/cache/stats | jq '.result.hitRate'
```

## 🔄 缓存切换

### 运行时切换（需重启）

1.Memory → Redis
```bash
# 修改 .env.development
CACHE_TYPE=redis

# 重启服务
pnpm start
```

2.Redis → Memory:
```bash
# 修改 .env.development
CACHE_TYPE=memory

# 重启服务
pnpm start
```

### Docker Compose 部署（Redis + 应用）

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - CACHE_TYPE=redis
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis

volumes:
  redis-data:
```

## 🐛 故障排查

### Redis 连接失败

**问题**: `Redis connection error: ECONNREFUSED`

**解决方案**:
1. 检查 Redis 是否运行：`redis-cli ping`
2. 检查端口是否正确：默认 6379
3. 检查防火墙设置
4. 查看 Redis 日志：`tail -f /var/log/redis/redis-server.log`

### 认证失败

**问题**: `NOAUTH Authentication required`

**解决方案**:
在 `.env.development` 中设置密码：
```bash
REDIS_PASSWORD=your-redis-password
```

### 内存占用过高

**解决方案**:
1. 设置合理的 TTL
2. 定期清理缓存
3. 使用键前缀分类管理
4. 配置 Redis 最大内存：
```bash
# redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

## 📈 监控和维护

### 监控指标

- 缓存命中率
- 内存使用量
- 连接数
- QPS（每秒查询数）
- 响应时间

### 查看实时监控

```bash
# Redis 监控命令
redis-cli INFO stats
redis-cli INFO memory

# 实时查看命令
redis-cli MONITOR
```

### 定期维护

```bash
# 备份 Redis 数据
redis-cli BGSAVE

# 查看慢查询
redis-cli SLOWLOG GET 10

# 优化内存
redis-cli MEMORY PURGE
```

## 🎯 最佳实践

1. **开发环境**: 使用 Memory 缓存，简单快捷
2. **测试环境**: 使用 Redis，模拟生产环境
3. **生产环境**: 使用 Redis 集群，支持高可用
4. **TTL 设置**: 根据数据更新频率设置合理的过期时间
5. **键命名**: 使用统一的前缀和清晰的命名规范
6. **监控告警**: 配置 Redis 监控，及时发现问题

## 📚 相关文档

- [ioredis 文档](https://github.com/redis/ioredis)
- [Redis 官方文档](https://redis.io/documentation)
- [项目架构文档](./docs/ARCHITECTURE.md)

---

**更新时间**: 2025-10-11  
**版本**: 1.0.0
