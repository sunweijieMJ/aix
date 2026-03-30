---
id: node/node-coding-standards
title: Node.js 编码规范
description: Node.js 异步模式、中间件和模块设计
layer: framework
priority: 110
platforms: []
tags: [node, coding, agent]
version: "1.0.0"
---

## 职责

负责 Node.js 服务端编码规范和异步模式指导。

---

## 异步模式

### async/await 优先

```typescript
// ✅ 正确
async function getUser(id: string): Promise<User> {
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError(`用户 ${id} 不存在`);
  return user;
}

// ❌ 错误: 回调嵌套
function getUser(id: string, callback: (err: Error | null, user?: User) => void) {
  db.user.findUnique({ where: { id } }, (err, user) => {
    if (err) return callback(err);
    callback(null, user);
  });
}
```

### 并发控制

```typescript
// 并行执行无依赖的操作
const [user, orders] = await Promise.all([
  getUser(id),
  getOrders(id),
]);

// 有依赖关系的串行执行
const user = await getUser(id);
const profile = await getProfile(user.profileId);
```

## 中间件模式

```typescript
// Express/Koa 风格中间件
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: '未认证' });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ message: 'Token 无效' });
  }
}
```

## 模块设计

### 分层架构

```
src/
├── routes/          # 路由定义（入口层）
├── controllers/     # 控制器（参数校验、响应构建）
├── services/        # 业务逻辑（核心层）
├── repositories/    # 数据访问（ORM 操作）
├── middlewares/      # 中间件
├── utils/           # 工具函数
└── types/           # 类型定义
```

- **Controller** 不包含业务逻辑
- **Service** 不直接操作 HTTP（不依赖 req/res）
- **Repository** 封装所有数据库操作

## 进程管理

- 优雅退出：监听 `SIGTERM` / `SIGINT`，关闭连接后退出
- 未捕获异常：`process.on('uncaughtException')` 记录后退出
- 健康检查：`/health` 端点返回服务状态
