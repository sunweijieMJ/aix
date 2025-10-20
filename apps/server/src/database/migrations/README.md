# 数据库迁移管理

## 概述

本项目使用自定义的迁移管理系统来管理数据库架构的版本控制。

## 使用方法

### 1. 创建迁移

在 `index.ts` 中添加新的迁移对象:

```typescript
{
  version: 2,  // 递增的版本号
  name: 'add_user_avatar',  // 迁移名称
  up: `
    ALTER TABLE users ADD COLUMN avatar VARCHAR(255);
  `,
  down: `
    ALTER TABLE users DROP COLUMN avatar;
  `
}
```

### 2. 运行迁移

迁移会在服务启动时自动执行。你也可以手动运行:

```typescript
import { migrationManager } from './migrationManager';
import { migrations } from './index';

// 运行所有待执行的迁移
await migrationManager.runPendingMigrations(migrations);
```

### 3. 回滚迁移

```typescript
// 回滚最后一个迁移
await migrationManager.rollback(migrations, 1);

// 回滚最后3个迁移
await migrationManager.rollback(migrations, 3);
```

### 4. 查看迁移状态

```typescript
const status = await migrationManager.getStatus(migrations);
console.log(status);
```

## 最佳实践

1. **永不修改已执行的迁移** - 如果迁移已经在生产环境执行，创建新的迁移来修改
2. **始终提供回滚脚本** - `down` 字段应该能够完全撤销 `up` 的操作
3. **小步迭代** - 每个迁移应该只做一件事
4. **版本号递增** - 使用整数版本号，按顺序递增
5. **命名规范** - 使用描述性的名称，如 `add_column_xxx`, `create_table_xxx`

## 迁移文件模板

```typescript
{
  version: X,
  name: 'descriptive_name',
  up: `
    -- 向上迁移SQL
    -- 创建表、添加列、创建索引等
  `,
  down: `
    -- 向下迁移SQL（回滚）
    -- 删除表、删除列、删除索引等
  `
}
```

## 注意事项

- 迁移在事务中执行，失败会自动回滚
- `schema_migrations` 表会自动创建，用于跟踪已执行的迁移
- PostgreSQL特定的SQL语法
