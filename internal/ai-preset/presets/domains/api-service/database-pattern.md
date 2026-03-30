---
id: api-service/database-pattern
title: 数据库模式
description: ORM 使用、查询优化和事务管理
layer: domain
priority: 200
platforms: []
tags: [database, orm, agent]
version: "1.0.0"
---

## 职责

负责数据库访问模式和 ORM 使用规范指导。

---

## ORM 使用规范

### Repository 封装

```typescript
// 数据访问封装在 Repository 层
class UserRepository {
  async findById(id: string): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  }

  async findMany(params: ListParams): Promise<PaginatedResult<User>> {
    const [data, total] = await Promise.all([
      db.user.findMany({
        where: params.where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: params.orderBy,
      }),
      db.user.count({ where: params.where }),
    ]);
    return { data, total };
  }

  async create(data: CreateUserDto): Promise<User> {
    return db.user.create({ data });
  }
}
```

### 查询优化

- **Select 指定字段**：不要 `select *`，只查需要的列
- **预加载关联**：N+1 查询使用 `include` / `join`
- **分页必须**：列表查询必须分页，限制 `pageSize` 最大值
- **索引覆盖**：常用查询条件建索引

### 事务管理

```typescript
// 需要原子性的操作使用事务
async function transferBalance(fromId: string, toId: string, amount: number) {
  return db.$transaction(async (tx) => {
    const from = await tx.account.update({
      where: { id: fromId },
      data: { balance: { decrement: amount } },
    });

    if (from.balance < 0) {
      throw new Error('余额不足');
    }

    await tx.account.update({
      where: { id: toId },
      data: { balance: { increment: amount } },
    });
  });
}
```

## 规范要点

- Service 层不直接写 SQL，通过 Repository 封装
- 软删除优先（`deletedAt` 字段）
- 数据库迁移必须可回滚
- 敏感字段（密码、token）不返回给客户端
