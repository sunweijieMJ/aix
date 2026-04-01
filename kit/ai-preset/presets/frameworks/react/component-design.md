---
id: react/component-design
title: React 组件设计规范
description: React 函数组件、Hooks 和 Props 设计
layer: framework
priority: 110
platforms: []
tags: [react, component, agent]
version: "1.0.0"
---

## 职责

负责 React 组件设计指导，包括函数组件结构、Hooks 规范和 Props 设计。

---

## 组件结构

```tsx
// 1. 导入语句
import { useState, useCallback, useMemo } from 'react';
import type { FC } from 'react';
import type { UserCardProps } from './types';

// 2. 组件定义
export const UserCard: FC<UserCardProps> = ({ user, showAvatar = true, onEdit }) => {
  // 3. Hooks
  const [isEditing, setIsEditing] = useState(false);

  // 4. 计算/派生值
  const displayName = useMemo(
    () => user.nickname || user.name,
    [user.nickname, user.name],
  );

  // 5. 事件处理
  const handleClick = useCallback(() => {
    onEdit?.(user);
  }, [user, onEdit]);

  // 6. 渲染
  return (
    <div className="user-card" onClick={handleClick}>
      {showAvatar && <Avatar src={user.avatar} />}
      <span>{displayName}</span>
    </div>
  );
};
```

## Props 设计规范

```typescript
// ✅ 正确: interface 定义 Props
interface ButtonProps {
  /** 按钮类型 */
  variant?: 'primary' | 'secondary' | 'danger';
  /** 按钮尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否禁用 */
  disabled?: boolean;
  /** 子元素 */
  children: React.ReactNode;
  /** 点击回调 */
  onClick?: (event: React.MouseEvent) => void;
}
```

- Props interface 命名：`<Component>Props`
- 布尔类型使用 `is/has/show` 前缀
- 回调函数使用 `on` 前缀 (`onClick`, `onChange`)
- children 使用 `React.ReactNode` 类型
- 所有 Props 必须有 JSDoc 注释

## Hooks 规范

### 自定义 Hook 命名

```typescript
// ✅ use 前缀 + 描述性名称
function useLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : defaultValue;
  });

  const setStoredValue = useCallback((newValue: T) => {
    setValue(newValue);
    localStorage.setItem(key, JSON.stringify(newValue));
  }, [key]);

  return [value, setStoredValue] as const;
}
```

### Hooks 规则

- **调用顺序固定**：不在条件/循环中调用 Hook
- **依赖数组完整**：useEffect/useMemo/useCallback 的依赖不遗漏
- **清理副作用**：useEffect 返回清理函数
- **避免过度优化**：不需要 memo 的地方不用 useMemo/useCallback

## 状态管理

- 局部状态用 `useState`
- 跨组件共享用 Context 或 Zustand/Jotai
- 服务端状态用 React Query / SWR
- 避免 prop drilling 超过 3 层
