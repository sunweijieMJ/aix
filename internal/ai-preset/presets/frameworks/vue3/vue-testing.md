---
id: vue3/vue-testing
title: Vue 组件测试
description: Vue 3 组件测试的最佳实践和模式
layer: framework
priority: 150
platforms: []
tags: [vue, testing]
version: "1.0.0"
---

## Vue 组件测试

### 测试工具栈

- **Vitest**: 测试运行器（兼容 Jest API）
- **Vue Test Utils**: 组件挂载和交互
- **@testing-library/vue**: 以用户视角测试（可选）

### 组件挂载

```typescript
import { mount, shallowMount } from '@vue/test-utils';
import UserCard from './UserCard.vue';

describe('UserCard', () => {
  const defaultProps = {
    user: { id: 1, name: '张三', avatar: '' },
  };

  it('should render user name', () => {
    const wrapper = mount(UserCard, { props: defaultProps });
    expect(wrapper.text()).toContain('张三');
  });

  it('should emit click event', async () => {
    const wrapper = mount(UserCard, { props: defaultProps });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
    expect(wrapper.emitted('click')![0]).toEqual([defaultProps.user]);
  });
});
```

### 测试覆盖范围

| 类型 | 必须测试 | 可选测试 |
|------|---------|---------|
| Props | 各种合法值渲染 | 默认值、边界值 |
| Emits | 触发条件和参数 | 多次触发 |
| Slots | 默认插槽和具名插槽 | Scoped Slot 数据 |
| 交互 | 点击、输入等用户操作 | 键盘导航 |
| 状态 | 条件渲染、加载状态 | 错误状态 |

### Composable 测试

```typescript
import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('should increment count', () => {
    const { count, increment } = useCounter(0);
    expect(count.value).toBe(0);
    increment();
    expect(count.value).toBe(1);
  });
});
```

### 测试注意事项

- `mount` 渲染子组件，`shallowMount` 不渲染（更快）
- 异步操作后使用 `await nextTick()` 或 `await flushPromises()`
- Mock 路由: `global: { stubs: { RouterLink: true } }`
- Mock Store: 直接 mock composable 函数
