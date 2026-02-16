# @aix/server

轻量级 Hono API 服务器模板

## 特性

- ⚡️ **Hono** - 超轻量 Web 框架（13KB）
- 📖 **OpenAPI 3.1** - 自动生成 API 文档
- 🎨 **Swagger UI** - 交互式 API 文档界面
- 🔒 **JWT 认证** - 简单的用户认证示例
- 🎯 **TypeScript** - 完整类型支持
- 🔥 **热重载** - 开发环境自动重载
- 📝 **统一响应** - 标准化 API 响应格式
- 🛡️ **错误处理** - 全局错误拦截

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，修改配置。

### 开发

```bash
pnpm dev
```

服务器将在 `http://localhost:3000` 启动

### 构建

```bash
pnpm build
```

### 生产运行

```bash
pnpm prod
```

## API 端点

### 📖 API 文档

**Swagger UI（推荐）**
```
GET /docs
```
访问 `http://localhost:3000/docs` 查看交互式 API 文档

**OpenAPI JSON**
```
GET /openapi.json
```

### 根路由

```
GET /
```

返回 API 信息和可用端点

### 健康检查

```
GET /health
```

返回服务器健康状态

### 认证

#### 登录

```
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

#### 获取用户信息

```
GET /api/auth/me
Authorization: Bearer {token}
```

## 项目结构

```
src/
├── index.ts              # 入口文件
├── types.ts              # 类型定义
├── middleware/           # 中间件
│   ├── logger.ts         # 日志中间件
│   └── error.ts          # 错误处理
├── routes/               # 路由
│   ├── health.ts         # 健康检查
│   └── auth.ts           # 认证路由
└── utils/                # 工具函数
    ├── response.ts       # 响应工具
    └── env.ts            # 环境变量
```

## 扩展

### 添加新路由

1. 在 `src/routes/` 创建新文件
2. 在 `src/index.ts` 中注册路由

示例：

```typescript
// src/routes/users.ts
import { Hono } from 'hono'
import { success } from '../utils/response'

const users = new Hono()

users.get('/', (c) => {
  return c.json(success([]))
})

export default users
```

```typescript
// src/index.ts
import users from './routes/users'

app.route('/api/users', users)
```

### 添加数据库

推荐使用：
- **Prisma** - ORM，支持多种数据库
- **Drizzle** - 轻量级 ORM
- **SQLite** - 简单文件数据库

### 添加验证

已集成 Zod，使用 `@hono/zod-validator`：

```typescript
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const schema = z.object({
  name: z.string(),
  age: z.number().min(0),
})

app.post('/api/users', zValidator('json', schema), (c) => {
  const data = c.req.valid('json')
  // data 已通过验证
})
```

## 与旧版本对比

| 功能 | 旧版本 (Koa) | 新版本 (Hono) |
|------|-------------|--------------|
| 代码量 | 6000+ 行 | ~300 行 |
| 依赖数量 | 14 个 | 5 个 |
| 数据库 | PostgreSQL | 无（按需添加） |
| 缓存 | Redis/Memory | 无 |
| 队列 | BullMQ | 无 |
| 监控 | Prometheus | 无 |
| 启动时间 | ~2s | ~100ms |

## License

MIT
