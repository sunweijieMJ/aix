---
id: react/react-coding-standards
title: React 编码规范
description: JSX 规范、组件组织和 React 特有模式
layer: framework
priority: 120
platforms: []
tags: [react, coding]
version: "1.0.0"
---

## JSX 规范

```tsx
// ✅ 正确: 条件渲染
{isLoggedIn && <UserMenu />}
{status === 'error' ? <ErrorView /> : <SuccessView />}

// ❌ 错误: 使用 && 时左侧可能为 0
{count && <Badge count={count} />}  // count=0 时渲染 "0"
// ✅ 修复
{count > 0 && <Badge count={count} />}
```

### 列表渲染

```tsx
// ✅ 正确: 使用稳定的 key
{items.map(item => (
  <ListItem key={item.id} data={item} />
))}

// ❌ 错误: 使用 index 作为 key（列表会增删时）
{items.map((item, index) => (
  <ListItem key={index} data={item} />
))}
```

## 文件组织

```
src/components/UserCard/
├── UserCard.tsx        # 组件实现
├── UserCard.test.tsx   # 测试
├── types.ts            # Props 类型
├── hooks.ts            # 组件专用 hooks（可选）
└── index.ts            # 导出
```

### 导入规范

```typescript
// 1. React
import { useState, useEffect } from 'react';

// 2. 第三方库
import { useQuery } from '@tanstack/react-query';

// 3. 内部模块
import { useAuth } from '@/hooks/useAuth';

// 4. 相对路径
import type { UserCardProps } from './types';
```

## 性能模式

```tsx
// React.memo: 仅当 Props 频繁不变时使用
const ExpensiveList = React.memo(({ items }: Props) => {
  return items.map(item => <Item key={item.id} data={item} />);
});

// useCallback: 传给子组件的回调
const handleSubmit = useCallback((data: FormData) => {
  submit(data);
}, [submit]);

// useMemo: 昂贵计算
const sortedItems = useMemo(
  () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
  [items],
);
```
