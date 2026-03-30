---
id: base/testing
title: 测试规范
description: 测试策略、测试用例编写和质量保证
layer: base
priority: 30
platforms: []
tags: [testing, quality, agent]
version: "1.0.0"
---

## 职责

负责测试策略制定、测试用例编写和质量保证。

---

## 测试金字塔

```
    /\
   /E2E\     ← 少量端到端测试
  /______\
 /        \
/Integration\ ← 适量集成测试
/____________\
/            \
/  Unit Tests  \ ← 大量单元测试
/________________\
```

## 测试规范

### 命名规范

```typescript
// 文件命名: <source-file>.test.ts
// describe: 被测模块/函数/组件名
// it/test: "should + 预期行为" 或中文描述

describe('formatDate', () => {
  it('should format date to YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-01-01'))).toBe('2026-01-01');
  });

  it('should return empty string for invalid date', () => {
    expect(formatDate(null)).toBe('');
  });
});
```

### AAA 模式

```typescript
it('should calculate total price', () => {
  // Arrange - 准备数据
  const items = [{ price: 10, quantity: 2 }, { price: 20, quantity: 1 }];

  // Act - 执行操作
  const total = calculateTotal(items);

  // Assert - 验证结果
  expect(total).toBe(40);
});
```

### Mock 原则

- **最小 Mock**: 只 mock 必须 mock 的外部依赖
- **真实优先**: 优先使用真实实现，其次用测试替身
- **Mock 层级**: 优先 stub > spy > mock
- **清理**: 每个测试用例后清理 mock 状态

### 覆盖率目标

| 层级 | 覆盖率 | 说明 |
|------|--------|------|
| 工具函数 | ≥ 90% | 纯函数易测试，应高覆盖 |
| 业务逻辑 | ≥ 80% | 核心逻辑必须覆盖 |
| UI 组件 | ≥ 70% | 关键交互必须覆盖 |
| 整体目标 | ≥ 80% | 项目整体覆盖率 |

## E2E 测试

### 工具选型

| 工具 | 优势 | 适用场景 |
|------|------|---------|
| **Playwright**（推荐） | 多浏览器、自动等待、Codegen、Trace Viewer | 通用首选 |
| **Cypress** | 交互式调试、丰富生态 | 已有 Cypress 基础的项目 |

### E2E 测试范围

E2E 测试数量少但价值高，聚焦**核心用户流程**：

- 登录 → 首页 → 核心操作 → 退出
- 关键表单提交（创建、编辑）
- 支付/下单等不可逆流程
- 权限拦截（未登录 → 跳转登录页）

```typescript
// Playwright 示例
import { test, expect } from '@playwright/test';

test('用户登录流程', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill('test@example.com');
  await page.getByLabel('密码').fill('password123');
  await page.getByRole('button', { name: '登录' }).click();

  // 验证跳转到首页
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByText('欢迎')).toBeVisible();
});
```

### E2E 注意事项

- E2E 测试**不替代**单元测试，只覆盖关键路径
- 使用独立的测试数据库 / 测试环境
- 避免依赖第三方服务（Mock 外部 API）
- CI 中 E2E 可单独阶段运行，失败不阻塞快速反馈

## 快照测试

### 适用场景

```typescript
// ✅ 适合: 稳定的纯展示组件
it('should match snapshot', () => {
  const wrapper = mount(Badge, { props: { type: 'success', text: '已通过' } });
  expect(wrapper.html()).toMatchSnapshot();
});
```

### 不适用场景

- 包含动态数据（时间戳、随机 ID）的组件
- 频繁迭代的组件（每次改动都要更新快照）
- 逻辑复杂的交互组件（快照不能验证行为）

### 快照原则

- 快照文件提交到 Git，CR 时 review 快照变更
- 单个快照不超过 **50 行**（太大的快照无人 review）
- 更新快照前确认变更是预期的（`pnpm test -u` 不要盲目执行）
