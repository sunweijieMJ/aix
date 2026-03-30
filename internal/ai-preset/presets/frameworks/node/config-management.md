---
id: node/config-management
title: 配置管理规范
description: 环境变量、配置校验和多环境管理
layer: framework
priority: 150
platforms: []
tags: [node, config, env]
version: "1.0.0"
---

## 职责

负责 Node.js 服务端配置管理和环境变量规范指导。

---

## 核心原则

- 配置与代码**严格分离**（不在代码中硬编码配置值）
- 所有环境变量在启动时**立即校验**（fail-fast）
- 敏感配置（密钥、密码）**只通过环境变量**注入，不进入代码仓库
- 提供类型安全的配置访问方式

## 环境变量规范

### 命名规范

```bash
# 格式: [APP_PREFIX]_[MODULE]_[KEY]
# 全大写 UPPER_SNAKE_CASE

# 数据库
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp
DB_USER=postgres
DB_PASSWORD=secret

# Redis
REDIS_URL=redis://localhost:6379

# 应用
APP_PORT=3000
APP_ENV=development      # development | staging | production
APP_LOG_LEVEL=info

# 第三方服务
JWT_SECRET=xxx
JWT_EXPIRES_IN=30m
SMTP_HOST=smtp.example.com
SMTP_PORT=465
OSS_ACCESS_KEY=xxx
OSS_SECRET_KEY=xxx
```

### .env 文件管理

| 文件 | 用途 | Git 追踪 |
|------|------|---------|
| `.env.example` | 配置模板（不含真实值） | ✅ 提交 |
| `.env` | 本地开发配置 | ❌ 禁止提交 |
| `.env.test` | 测试环境配置 | ❌ 禁止提交 |
| `.env.production` | 生产配置 | ❌ 禁止提交 |

```bash
# .env.example — 提交到仓库作为配置文档
APP_PORT=3000
APP_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=
DB_USER=
DB_PASSWORD=

JWT_SECRET=
```

## 配置校验（Zod）

```typescript
import { z } from 'zod';

// 定义配置 schema
const envSchema = z.object({
  // 应用
  APP_PORT: z.coerce.number().default(3000),
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // 数据库
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少 32 字符'),
  JWT_EXPIRES_IN: z.string().default('30m'),

  // 可选配置
  REDIS_URL: z.string().url().optional(),
  SMTP_HOST: z.string().optional(),
});

// 启动时校验（fail-fast）
function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ 环境变量校验失败:');
    for (const [key, errors] of Object.entries(result.error.flatten().fieldErrors)) {
      console.error(`  ${key}: ${errors?.join(', ')}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
```

## 类型安全配置

```typescript
// config/index.ts — 统一配置入口
import { env } from './env';

export const config = {
  app: {
    port: env.APP_PORT,
    env: env.APP_ENV,
    isProd: env.APP_ENV === 'production',
    isDev: env.APP_ENV === 'development',
  },

  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    url: `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`,
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },

  redis: env.REDIS_URL ? { url: env.REDIS_URL } : undefined,
} as const;
```

### 使用配置

```typescript
// ✅ 正确: 通过 config 对象访问
import { config } from '@/config';

app.listen(config.app.port);
const token = jwt.sign(payload, config.jwt.secret);

// ❌ 错误: 直接读取 process.env
app.listen(process.env.PORT);
const token = jwt.sign(payload, process.env.JWT_SECRET!); // 无校验、无类型
```

## 多环境配置

### 按环境加载

```typescript
import dotenv from 'dotenv';

// 按优先级加载: .env.local > .env.{env} > .env
const envFile = process.env.APP_ENV || 'development';
dotenv.config({ path: `.env.${envFile}` });
dotenv.config(); // 兜底
```

### 环境差异化

```typescript
// 通过 config 统一收敛环境差异
export const config = {
  cors: {
    origin: env.APP_ENV === 'production'
      ? ['https://example.com']
      : ['http://localhost:3000', 'http://localhost:5173'],
  },

  log: {
    level: env.APP_LOG_LEVEL,
    // 生产环境不输出 debug
    prettyPrint: env.APP_ENV === 'development',
  },
};
```

## 规范要点

- **禁止**在代码中硬编码数据库密码、API Key 等敏感信息
- **禁止** `.env` 文件提交到 Git（`.gitignore` 必须包含）
- **必须**提供 `.env.example` 作为配置文档
- **必须**在应用启动时校验所有必需的环境变量
- `process.env` 只在配置模块中读取，其他模块通过 `config` 对象访问
- 配置变更需要重启服务（不支持热更新是合理的）
- 生产环境敏感配置通过 CI/CD 的 Secret 管理注入
