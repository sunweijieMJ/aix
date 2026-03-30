---
id: node/api-design
title: API 设计规范
description: Node.js 端 RESTful API 设计、参数校验和响应格式
layer: framework
priority: 130
platforms: []
tags: [node, api, agent]
version: "1.0.0"
---

## 职责

负责 Node.js 服务端 API 设计规范和参数校验指导。

---

## 路由设计

```typescript
// 资源路由
router.get('/users', listUsers);           // 列表
router.get('/users/:id', getUser);         // 详情
router.post('/users', createUser);         // 创建
router.put('/users/:id', updateUser);      // 全量更新
router.patch('/users/:id', patchUser);     // 部分更新
router.delete('/users/:id', deleteUser);   // 删除

// 嵌套资源（最多 2 层）
router.get('/users/:userId/orders', listUserOrders);
```

## 参数校验

```typescript
import { z } from 'zod';

// 使用 Zod 定义校验 schema
const CreateUserSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
  role: z.enum(['admin', 'user']).default('user'),
});

// 校验中间件
function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: '参数校验失败',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}

router.post('/users', validate(CreateUserSchema), createUser);
```

## 响应格式

```typescript
// 成功响应
res.status(200).json({ code: 0, data: user, message: 'ok' });

// 列表响应（带分页）
res.status(200).json({
  code: 0,
  data: users,
  pagination: { page: 1, pageSize: 20, total: 100 },
});

// 创建成功
res.status(201).json({ code: 0, data: newUser });

// 无内容
res.status(204).end();
```

## 安全要点

- 所有输入必须校验（不信任客户端）
- 分页限制 `pageSize` 最大值（防止大查询）
- 批量操作限制数量
- 幂等性：PUT/DELETE 操作保证幂等
- Rate Limiting：高频接口限流
