---
id: node/logging
title: 日志规范
description: 结构化日志、日志级别策略和日志最佳实践
layer: framework
priority: 140
platforms: []
tags: [node, logging, observability]
version: "1.0.0"
---

## 职责

负责 Node.js 服务端日志规范和可观测性指导。

---

## 日志级别

| 级别 | 用途 | 示例 |
|------|------|------|
| **error** | 需要立即处理的错误 | 数据库连接失败、未捕获异常 |
| **warn** | 潜在问题，不影响主流程 | 接口超时重试成功、参数兼容性转换 |
| **info** | 关键业务流程节点 | 用户登录、订单创建、支付完成 |
| **debug** | 开发调试信息 | SQL 查询内容、请求/响应详情 |

### 级别选择原则

```typescript
// error: 流程中断，需要人工介入
logger.error('数据库连接失败', { host, port, error });

// warn: 异常但自动恢复
logger.warn('缓存未命中，回退到数据库查询', { key, duration });

// info: 业务里程碑
logger.info('用户登录成功', { userId, loginMethod: 'password' });

// debug: 仅开发环境
logger.debug('SQL 查询', { query, params, duration: '12ms' });
```

### 环境配置

| 环境 | 最低级别 | 说明 |
|------|---------|------|
| 开发 | `debug` | 全量输出 |
| 测试 | `info` | 过滤调试信息 |
| 生产 | `info` | 只记录业务和错误 |

## 结构化日志

### 日志格式（JSON）

```typescript
// ✅ 正确: 结构化 JSON，便于 ELK/Loki 等工具检索
{
  "level": "info",
  "message": "用户登录成功",
  "timestamp": "2026-03-30T10:15:30.123Z",
  "service": "user-service",
  "requestId": "req-a1b2c3d4",
  "context": {
    "userId": "user-123",
    "loginMethod": "password",
    "ip": "192.168.1.1"
  }
}

// ❌ 错误: 纯文本拼接，无法结构化检索
console.log(`[INFO] 用户 ${userId} 登录成功，IP: ${ip}`);
```

### 日志工具选型

| 工具 | 特点 | 推荐场景 |
|------|------|---------|
| **Pino** | 高性能、JSON 原生、低开销 | 生产推荐 |
| **Winston** | 功能丰富、多 transport | 复杂日志管道 |

### Pino 配置示例

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // 生产环境不美化，开发环境可选 pino-pretty
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty' },
  }),
});
```

## 请求日志中间件

```typescript
// Express 请求日志中间件
function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] as string || generateId();

  // 注入 requestId 到请求上下文
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'info';

    logger[level]({
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id,
      ip: req.ip,
    }, `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });

  next();
}
```

## 错误日志

```typescript
// ✅ 正确: 记录完整的错误上下文
logger.error({
  requestId,
  error: {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error instanceof AppError ? error.code : undefined,
  },
  context: {
    userId: req.user?.id,
    method: req.method,
    path: req.originalUrl,
    body: sanitize(req.body), // 脱敏后的请求体
  },
}, '请求处理失败');

// ❌ 错误: 只记录 message，丢失上下文
logger.error(error.message);
```

## 脱敏规则

```typescript
const SENSITIVE_FIELDS = ['password', 'token', 'authorization', 'cookie', 'secret'];

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) {
      result[key] = '***';
    }
  }
  return result;
}
```

## 规范要点

- **禁止** `console.log` 出现在生产代码中（使用 ESLint 规则 `no-console`）
- **禁止**记录密码、Token、Cookie 等敏感信息
- 每条日志必须携带 `requestId`（便于链路追踪）
- 错误日志必须包含 `stack trace` 和业务上下文
- 日志文件按天滚动，保留 **30 天**
- 慢查询（> 1s）单独记录 warn 级别日志
- 第三方 API 调用记录请求和响应耗时
