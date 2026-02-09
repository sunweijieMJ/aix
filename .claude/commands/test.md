---
description: 组件测试清单，覆盖 Props/Emits/Slots
---

# 组件测试清单

## 基础测试

- [ ] 组件能正常挂载和销毁
- [ ] 默认渲染状态正确
- [ ] 快照测试（Snapshot）

## Props 测试

- [ ] 所有 Props 都有测试用例
- [ ] 测试 Props 默认值
- [ ] 测试 Props 类型校验
- [ ] 测试必填 Props 缺失的情况
- [ ] 测试 Props 更新时的响应

## Emits 测试

- [ ] 所有 Events 都有测试用例
- [ ] 测试 Event 触发时机
- [ ] 测试 Event 参数正确性
- [ ] 测试 Event 回调执行

## Slots 测试

- [ ] 默认插槽渲染
- [ ] 具名插槽渲染
- [ ] 作用域插槽数据传递
- [ ] 插槽内容替换

## 用户交互测试

- [ ] 点击事件
- [ ] 键盘事件（Enter, Escape, Arrow keys）
- [ ] 鼠标悬停和移出
- [ ] 焦点进入和离开
- [ ] 表单输入和验证

## 状态测试

- [ ] 禁用状态（disabled）
- [ ] 加载状态（loading）
- [ ] 错误状态（error）
- [ ] 成功状态（success）
- [ ] 空状态（empty）

## 边界情况测试

- [ ] 空数据
- [ ] 大量数据
- [ ] 特殊字符输入
- [ ] 极限值（最大/最小）
- [ ] 异步操作完成前后

## 可访问性测试

- [ ] ARIA 属性正确
- [ ] 键盘导航支持
- [ ] 焦点管理合理
- [ ] 屏幕阅读器友好
- [ ] 对比度符合 WCAG 标准

## 性能测试

- [ ] 无不必要的重渲染
- [ ] 无内存泄漏
- [ ] 大数据渲染优化
- [ ] 防抖/节流正确实现

## 集成测试

- [ ] 与其他组件配合使用
- [ ] 全局状态管理（如 Pinia）
- [ ] 路由跳转（如需要）
- [ ] 异步数据加载

## 覆盖率目标

- [ ] 语句覆盖率（Statements）≥ 80%
- [ ] 分支覆盖率（Branches）≥ 80%
- [ ] 函数覆盖率（Functions）≥ 80%
- [ ] 行覆盖率（Lines）≥ 80%

## 快速命令

```bash
# 运行单元测试
pnpm test

# 运行测试覆盖率
pnpm test:coverage

# 监听模式
pnpm test:watch

# 运行指定文件
pnpm test Button.test.ts

# UI 模式
pnpm test:ui
```

## 测试工具

- **Vitest**: 单元测试框架
- **@vue/test-utils**: Vue 组件测试工具
- **jsdom**: DOM 环境模拟
- **@testing-library/vue**: 用户行为测试
- **vitest-axe**: 可访问性测试

## 示例测试

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Button from '../Button.vue';

describe('Button', () => {
  it('renders default slot content', () => {
    const wrapper = mount(Button, {
      slots: {
        default: 'Click me',
      },
    });
    expect(wrapper.text()).toBe('Click me');
  });

  it('emits click event', async () => {
    const wrapper = mount(Button);
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeTruthy();
  });

  it('is disabled when disabled prop is true', () => {
    const wrapper = mount(Button, {
      props: {
        disabled: true,
      },
    });
    expect(wrapper.element).toBeDisabled();
  });
});
```

## 相关 Skills

| Skill | 功能 | 示例 |
|-------|------|------|
| `/test-generator` | 自动生成测试模板 | `/test-generator packages/button` |
| `/coverage-analyzer` | 测试覆盖率分析 | `/coverage-analyzer packages/button` |

## 相关 Agents

- `@testing` - 测试策略完整指南

## 相关资源

- [Vitest 文档](https://vitest.dev/)
- [@vue/test-utils 文档](https://test-utils.vuejs.org/)
- [Testing Library 文档](https://testing-library.com/docs/vue-testing-library/intro/)
- [组件库测试策略](../agents/testing.md)
