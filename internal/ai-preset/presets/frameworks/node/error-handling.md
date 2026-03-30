---
id: node/error-handling
title: 错误处理规范
description: Node.js 错误分类、统一响应和错误中间件
layer: framework
priority: 120
platforms: []
tags: [node, error]
version: "1.0.0"
---

## 错误分类

```typescript
// 基础业务错误类
class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// 常用错误子类
class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(message, 404, 'NOT_FOUND');
  }
}

class ValidationError extends AppError {
  constructor(message: string, public fields?: Record<string, string>) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = '未认证') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = '无权限') {
    super(message, 403, 'FORBIDDEN');
  }
}
```

## 统一错误响应

```typescript
interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

// 全局错误处理中间件
function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
    });
  } else {
    // 未知错误不暴露细节
    console.error('Unhandled error:', err);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
}
```

## 规范要点

- **不要吞掉错误**：catch 块必须记录或重新抛出
- **区分操作错误和编程错误**：操作错误（网络超时、无效输入）正常处理，编程错误（类型错误、空引用）应崩溃
- **错误日志分级**：操作错误 → warn，编程错误 → error
- **敏感信息过滤**：生产环境不返回堆栈跟踪和内部细节
