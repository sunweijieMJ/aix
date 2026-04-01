---
id: react/react-testing
title: React 测试规范
description: React 组件测试和 Testing Library 最佳实践
layer: framework
priority: 130
platforms: []
tags: [react, testing]
version: "1.0.0"
---

## React Testing Library

### 基本模式

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { UserCard } from './UserCard';

describe('UserCard', () => {
  const defaultProps = {
    user: { id: 1, name: '张三', avatar: '' },
  };

  it('should render user name', () => {
    render(<UserCard {...defaultProps} />);
    expect(screen.getByText('张三')).toBeInTheDocument();
  });

  it('should call onEdit when clicked', () => {
    const onEdit = vi.fn();
    render(<UserCard {...defaultProps} onEdit={onEdit} />);
    fireEvent.click(screen.getByText('张三'));
    expect(onEdit).toHaveBeenCalledWith(defaultProps.user);
  });
});
```

### 查询优先级

1. `getByRole` — 最接近用户感知
2. `getByLabelText` — 表单元素
3. `getByText` — 非交互元素
4. `getByTestId` — 最后手段

### 异步测试

```tsx
it('should load data', async () => {
  render(<UserList />);

  // 等待加载完成
  expect(await screen.findByText('张三')).toBeInTheDocument();

  // 验证加载状态消失
  expect(screen.queryByText('加载中...')).not.toBeInTheDocument();
});
```

### Hook 测试

```tsx
import { renderHook, act } from '@testing-library/react';
import { useCounter } from './useCounter';

it('should increment', () => {
  const { result } = renderHook(() => useCounter(0));
  act(() => result.current.increment());
  expect(result.current.count).toBe(1);
});
```
