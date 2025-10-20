# Server 架构文档

## 📋 目录

- [架构概览](#架构概览)
- [技术栈](#技术栈)
- [缓存策略](#缓存策略)
- [项目结构](#项目结构)
- [核心模块](#核心模块)
- [架构优化建议](#架构优化建议)
- [最佳实践](#最佳实践)

---

## 架构概览

本项目是一个基于 **Koa.js** 的配置管理后端服务，采用 **TypeScript** 开发，使用 **PostgreSQL** 作为数据库，**Node-cache** 作为内存缓存。

### 架构特点

✅ **分层架构**: Route → Service → Database Adapter  
✅ **依赖注入**: 使用 Container 模式管理服务依赖  
✅ **类型安全**: 全面使用 TypeScript 类型系统  
✅ **缓存优化**: 数据库查询结果缓存，降低数据库负载  
✅ **监控完善**: 集成 Prometheus + Grafana 监控体系  
✅ **测试覆盖**: 单元测试覆盖核心业务逻辑  

---

## 技术栈

### 核心框架
- **Koa.js 2.x** - 轻量级 Web 框架
- **TypeScript 5.x** - 类型安全的 JavaScript 超集
- **PostgreSQL** - 关系型数据库

### 中间件
- `@koa/router` - 路由管理
- `@koa/cors` - 跨域资源共享
- `koa-bodyparser` - 请求体解析
- `koa-ratelimit` - 请求频率限制

### 缓存
- **node-cache** - 内存缓存（LRU）

### 监控
- **prom-client** - Prometheus 指标采集
- **自定义 HealthManager** - 健康检查
- **自定义 MetricsManager** - 性能指标收集

### 测试
- **Vitest** - 单元测试框架
- **Supertest** - HTTP 测试

### 工具
- **Dotenv** - 环境变量管理
- **ESLint + Prettier** - 代码规范

---

## 缓存策略

### 当前缓存方案：Node-cache (内存缓存)

#### ✅ 优势

1. **性能优异**
   - 纯内存存储，读写速度极快（纳秒级）
   - 无网络开销，本地访问
   - 适合单机部署场景

2. **简单易用**
   - 零配置启动，无需额外服务
   - API 简洁，学习成本低
   - 支持 TTL 自动过期

3. **功能完善**
   - 支持自定义 TTL（Time To Live）
   - 自动内存管理和过期检查
   - 提供统计信息（命中率、键数量等）

4. **成本低**
   - 无额外部署成本
   - 无需维护独立的缓存服务
   - 适合中小型应用

#### ⚠️ 局限性

1. **单机限制**
   - 缓存数据不共享，不适合分布式部署
   - 服务重启后缓存丢失
   - 无法跨进程共享

2. **内存限制**
   - 受 Node.js 进程内存限制
   - 大量缓存可能导致 OOM（内存溢出）
   - 不适合缓存大量数据

3. **功能限制**
   - 无持久化能力
   - 无分布式锁
   - 无发布订阅功能

#### 💡 缓存实现细节

```typescript
// 缓存配置
interface ICacheConfig {
  type: 'memory';           // 缓存类型
  defaultTtl: number;       // 默认过期时间（秒）
  checkPeriod: number;      // 检查周期（秒）
}

// 缓存使用示例
const cacheManager = await getCacheManager();

// 读操作：先查缓存，未命中再查数据库
const cachedData = await cacheManager.get(cacheKey);
if (cachedData) {
  return cachedData; // 缓存命中
}

const dbData = await database.query();
await cacheManager.set(cacheKey, dbData, 300); // 缓存5分钟
return dbData;

// 写操作：清除相关缓存
await database.update(data);
await cacheManager.del(cacheKey); // 缓存失效
```

#### 📊 缓存应用场景

| 场景 | 是否适用 | 说明 |
|------|---------|------|
| 配置数据缓存 | ✅ 适用 | 数据量小，更新频率低 |
| 用户会话缓存 | ⚠️ 有限 | 单机可用，分布式需 Redis |
| API 响应缓存 | ✅ 适用 | 提升响应速度 |
| 数据库查询缓存 | ✅ 适用 | 减少数据库压力 |
| 大文件缓存 | ❌ 不适用 | 内存占用过大 |
| 分布式锁 | ❌ 不适用 | 需要 Redis |

#### 🚀 升级建议（可选）

如果项目需要扩展到**分布式部署**或**大规模缓存**，建议升级到 **Redis**：

**Redis 优势：**
- 支持分布式部署
- 数据持久化
- 更丰富的数据结构（List、Set、Hash等）
- 发布订阅、分布式锁
- 集群模式支持

**迁移成本：**
- 需要部署 Redis 服务
- 修改 `CacheManager` 实现
- 网络延迟会略微增加（仍在毫秒级）

---

## 项目结构

```
server/
├── src/
│   ├── cache/              # 缓存模块
│   │   ├── index.ts        # 缓存管理器（MemoryCacheManager）
│   │   └── middleware.ts   # API 缓存中间件
│   ├── config/             # 配置模块
│   │   ├── env.ts          # 环境变量解析
│   │   ├── app.ts          # 应用配置
│   │   └── index.ts        # 配置导出
│   ├── database/           # 数据库模块
│   │   ├── adapter.ts      # 数据库适配器接口
│   │   ├── pgAdapter.ts    # PostgreSQL 适配器实现
│   │   ├── pgConnection.ts # PostgreSQL 连接池管理
│   │   ├── errorHandler.ts # 数据库错误处理
│   │   └── index.ts        # 数据库导出
│   ├── monitoring/         # 监控模块
│   │   ├── health.ts       # 健康检查管理器
│   │   ├── metrics.ts      # 性能指标管理器
│   │   ├── prometheus.ts   # Prometheus 指标暴露
│   │   ├── middleware.ts   # 监控中间件
│   │   └── routes.ts       # 监控路由
│   ├── routes/             # 路由模块
│   │   ├── localConfig.ts  # 配置管理路由
│   │   └── index.ts        # 路由汇总
│   ├── services/           # 业务逻辑层
│   │   └── localConfigService.ts  # 配置服务（含缓存）
│   ├── middleware/         # 中间件
│   │   ├── response.ts     # 统一响应格式
│   │   └── validator.ts    # 参数校验
│   ├── types/              # 类型定义
│   │   ├── config.ts       # 配置类型
│   │   ├── api.ts          # API 类型
│   │   └── index.ts        # 类型导出
│   ├── utils/              # 工具函数
│   │   ├── container.ts    # 依赖注入容器
│   │   ├── errors.ts       # 自定义错误类
│   │   ├── logger.ts # 日志工厂
│   │   └── validation.ts   # 验证工具
│   └── index.ts            # 应用入口
├── tests/                  # 测试目录
│   ├── cache/              # 缓存测试
│   ├── database/           # 数据库测试
│   ├── services/           # 服务测试
│   └── utils/              # 工具测试
├── docs/                   # 文档目录
│   ├── ARCHITECTURE.md     # 架构文档（本文件）
│   ├── MONITORING.md       # 监控指南
│   └── TESTING.md          # 测试指南
├── data/                   # 数据目录（本地开发）
├── package.json            # 项目配置
├── tsconfig.json           # TypeScript 配置
├── vitest.config.ts        # Vitest 配置
├── .env.example            # 环境变量示例
└── README.md               # 项目说明
```

---

## 核心模块

### 1. 数据库层 (Database)

#### PostgreSQL 连接管理
```typescript
// src/database/pgConnection.ts
- initDatabase(): 初始化连接池和数据库迁移
- getClient(): 获取数据库连接
- transaction(): 事务执行器
- checkDatabaseHealth(): 健康检查
```

**特点：**
- 连接池管理（pg.Pool）
- 自动数据库迁移
- 事务支持（BEGIN/COMMIT/ROLLBACK）
- 连接健康检查

#### 数据库适配器
```typescript
// src/database/pgAdapter.ts
- getAllLocalConfigs(): 获取所有配置
- getLocalConfigByPath(): 根据路径获取配置
- createLocalConfig(): 创建配置
- updateLocalConfig(): 更新配置
- deleteLocalConfig(): 删除配置
```

**特点：**
- CRUD 完整实现
- 类型安全（使用 TypeScript 泛型）
- 统一错误处理

### 2. 缓存层 (Cache)

#### MemoryCacheManager
```typescript
// src/cache/index.ts
- set(key, value, ttl?): 设置缓存
- get(key): 获取缓存
- del(key): 删除缓存
- clear(): 清空缓存
- getStats(): 获取缓存统计
- mset/mget/mdel: 批量操作
```

**特点：**
- 基于 node-cache 实现
- 支持自定义 TTL
- 缓存命中率统计
- 批量操作支持

#### CacheMiddleware
```typescript
// src/cache/middleware.ts
- apiCacheMiddleware(): API 响应缓存
```

**应用场景：**
- 查询接口缓存（GET 请求）
- 降低数据库查询压力

### 3. 业务逻辑层 (Services)

#### ConfigService
```typescript
// src/services/localConfigService.ts
- getAll(): 获取所有配置（带缓存）
- getByPath(path): 根据路径获取（带缓存）
- create(data): 创建配置（清除缓存）
- update(path, data): 更新配置（清除缓存）
- delete(path): 删除配置（清除缓存）
- upsert(path, value): 创建或更新
- clear(): 清空所有配置
```

**缓存策略：**
- **读操作**：先查缓存，未命中再查数据库并缓存（Cache-Aside）
- **写操作**：写入数据库后清除相关缓存（Write-Invalidate）
- **缓存键**：`config:{path}` 或 `config:all`
- **TTL**：300 秒（5 分钟）

### 4. 路由层 (Routes)

#### API 端点
```
POST   /local/v1/config      # 创建配置
GET    /local/v1/config      # 获取所有配置
GET    /local/v1/config/:id  # 获取单个配置
PUT    /local/v1/config/:id  # 更新配置
DELETE /local/v1/config/:id  # 删除配置
DELETE /local/v1/config      # 清空所有配置
```

### 5. 监控模块 (Monitoring)

#### 健康检查
```
GET /health                  # 快速健康检查
GET /health/detailed         # 详细健康检查
GET /health/ready            # 就绪性探针（K8s）
GET /health/live             # 存活性探针（K8s）
```

#### 性能指标
```
GET /metrics                 # JSON 格式指标
GET /metrics/prometheus      # Prometheus 格式指标
GET /metrics/summary         # 指标摘要
GET /metrics/errors          # 错误统计
GET /metrics/response-time   # 响应时间统计
```

#### 系统信息
```
GET /system/info             # 系统信息（应用、资源、配置）
GET /monitoring/dashboard    # 监控仪表板（HTML）
```

### 6. 中间件 (Middleware)

#### 响应格式化
```typescript
// src/middleware/response.ts
统一响应格式：
{
  code: 0,           // 0 成功，非 0 失败
  message: "...",    // 消息
  result: {...}      // 数据
}
```

#### 请求验证
```typescript
// src/middleware/validator.ts
参数校验（path 必填、value 合法性等）
```

#### 监控中间件
```typescript
// src/monitoring/middleware.ts
- metricsMiddleware(): 请求指标收集
- requestLoggingMiddleware(): 请求日志
```

#### 缓存中间件
```typescript
// src/cache/middleware.ts
- apiCacheMiddleware(): API 缓存（GET 请求）
```

### 7. 依赖注入 (Container)

```typescript
// src/utils/container.ts
- register(name, service): 注册服务
- get<T>(name): 获取服务实例
```

**已注册服务：**
- `pgAdapter` - PostgreSQL 适配器
- `configService` - 配置服务

---

## 架构优化建议

### ✅ 已完成的优化

1. **类型安全强化**
   - 移除 `any` 类型
   - 为数据库查询添加泛型约束
   - 统一接口定义

2. **代码简化**
   - 移除 Redis 相关未实现代码
   - 删除过度抽象的数据库方法
   - 统一命名规范（camelCase）

3. **性能优化**
   - 数据库查询结果缓存
   - 批量操作支持（mset/mget/mdel）
   - 连接池优化

4. **监控增强**
   - 集成 Prometheus 指标采集
   - 健康检查完善（liveness/readiness）
   - 性能指标仪表板

5. **测试覆盖**
   - ConfigService 单元测试
   - 数据库连接测试
   - 缓存管理器测试
   - 覆盖率报告

### 🚀 可进一步优化的点

#### 1. 缓存升级（可选）

**场景：** 需要分布式部署或大规模缓存

**方案：** 升级到 Redis

**实现：**
```typescript
// 新增 RedisCacheManager
export class RedisCacheManager implements ICacheManager {
  private client: RedisClient;
  
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttl);
    return true;
  }
  
  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : undefined;
  }
  // ... 其他方法
}
```

**优势：**
- 支持分布式部署
- 数据持久化
- 更丰富的功能

**成本：**
- 需要部署 Redis
- 增加运维复杂度
- 网络延迟

#### 2. 数据库优化

**查询优化：**
```typescript
// 批量查询优化
async getBatchByPaths(paths: string[]): Promise<ILocalConfig[]> {
  const result = await client.query(
    'SELECT * FROM local_configs WHERE path = ANY($1)',
    [paths]
  );
  return result.rows;
}

// 分页查询
async getAllPaginated(page: number, limit: number) {
  const offset = (page - 1) * limit;
  const result = await client.query(
    'SELECT * FROM local_configs ORDER BY id LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return result.rows;
}
```

**索引优化：**
```sql
-- 复合索引（如果有多条件查询）
CREATE INDEX idx_configs_path_updated ON local_configs(path, updated_at DESC);

-- 全文搜索索引（如果需要搜索功能）
CREATE INDEX idx_configs_search ON local_configs USING gin(to_tsvector('english', value));
```

#### 3. API 版本管理

```typescript
// 支持多版本 API
router.get('/local/v1/config', v1Handler);
router.get('/local/v2/config', v2Handler); // 新版本

// 版本弃用提示
if (req.path.includes('/v1/')) {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Wed, 11 Nov 2025 07:28:00 GMT');
}
```

#### 4. 限流优化

```typescript
// 动态限流（根据用户类型）
const dynamicRateLimit = async (ctx, next) => {
  const userType = ctx.state.user?.type || 'guest';
  const limits = {
    admin: 1000,  // 管理员
    user: 100,    // 普通用户
    guest: 10     // 游客
  };
  
  const limit = limits[userType];
  // 应用限流逻辑
  await next();
};
```

#### 5. 安全增强

```typescript
// JWT 认证
import jwt from 'jsonwebtoken';

const authMiddleware = async (ctx, next) => {
  const token = ctx.headers.authorization?.split(' ')[1];
  if (!token) {
    ctx.throw(401, 'Unauthorized');
  }
  
  try {
    ctx.state.user = jwt.verify(token, SECRET);
    await next();
  } catch (error) {
    ctx.throw(401, 'Invalid token');
  }
};

// 数据加密
import crypto from 'crypto';

const encryptValue = (value: string): string => {
  const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
  return cipher.update(value, 'utf8', 'hex') + cipher.final('hex');
};
```

#### 6. 日志聚合

```typescript
// 结构化日志
import winston from 'winston';

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// 链路追踪
import { v4 as uuidv4 } from 'uuid';

app.use(async (ctx, next) => {
  ctx.state.requestId = uuidv4();
  logger.info('Request started', {
    requestId: ctx.state.requestId,
    method: ctx.method,
    url: ctx.url,
  });
  await next();
});
```

#### 7. GraphQL 支持（可选）

```typescript
import { ApolloServer } from 'apollo-server-koa';

const typeDefs = `
  type Config {
    id: ID!
    path: String!
    value: String!
    createdAt: String!
    updatedAt: String!
  }
  
  type Query {
    configs: [Config!]!
    config(path: String!): Config
  }
  
  type Mutation {
    createConfig(path: String!, value: String!): Config!
    updateConfig(path: String!, value: String!): Config!
    deleteConfig(path: String!): Boolean!
  }
`;

const server = new ApolloServer({ typeDefs, resolvers });
server.applyMiddleware({ app });
```

---

## 最佳实践

### 1. 代码规范

- 使用 ESLint + Prettier 统一代码风格
- 遵循 TypeScript 严格模式
- 使用 async/await 处理异步操作
- 避免使用 `any` 类型

### 2. 错误处理

```typescript
// 统一错误处理
app.on('error', (err, ctx) => {
  logger.error('Server error:', err);
  // 发送告警通知
});

// 业务错误使用自定义错误类
throw new AppError('Config not found', 404, ErrorCode.NOT_FOUND);
```

### 3. 数据库操作

- 使用连接池而非单连接
- 使用参数化查询防止 SQL 注入
- 长事务拆分为短事务
- 为频繁查询字段添加索引

### 4. 缓存使用

- 为缓存键使用命名空间（如 `config:`）
- 设置合理的 TTL
- 写操作及时清除缓存
- 监控缓存命中率

### 5. 日志记录

- 为每个模块创建独立 logger
- 区分日志级别（debug/info/warn/error）
- 敏感信息脱敏
- 结构化日志便于检索

### 6. 监控告警

- 设置合理的告警阈值
- 关键指标：响应时间、错误率、数据库连接数
- 定期查看监控仪表板
- 配置告警通知渠道

### 7. 部署建议

- 使用环境变量管理配置
- 容器化部署（Docker）
- 使用 PM2 或 Supervisor 进程守护
- 配置健康检查探针

---

## 总结

### 当前架构评价

**优点：**
- ✅ 架构清晰，分层合理
- ✅ 类型安全，代码质量高
- ✅ 缓存优化，性能良好
- ✅ 监控完善，可观测性强
- ✅ 测试覆盖，代码可靠

**适用场景：**
- ✅ 中小型配置管理系统
- ✅ 单机或少量实例部署
- ✅ 读多写少的场景
- ✅ 对延迟敏感的应用

**不适用场景：**
- ❌ 大规模分布式集群
- ❌ 需要跨服务缓存共享
- ❌ 海量数据存储

### 缓存方案总结

**当前方案（Node-cache）：**
- ✅ 性能优异（纳秒级）
- ✅ 零配置，易部署
- ✅ 适合单机场景
- ❌ 不支持分布式

**升级方案（Redis）：**
- ✅ 支持分布式
- ✅ 数据持久化
- ✅ 功能丰富
- ❌ 需要额外部署

**建议：**
- 当前规模：使用 Node-cache（已实现）
- 需要扩展时：升级到 Redis
- 灵活切换：保持 ICacheManager 接口不变

---

## 相关文档

- [监控指南](./MONITORING.md) - Prometheus + Grafana 配置
- [测试指南](./TESTING.md) - 单元测试和覆盖率
- [README](../README.md) - 快速开始和使用说明

---

**最后更新：** 2025-10-11  
**文档版本：** 1.0.0
