---
description: 组件开发清单，Props/Emits/样式规范检查
---

# 组件开发清单

> 📌 本清单是**快速勾选项**，规范详情以 [@component-design](../agents/component-design.md) 与 [@coding-standards](../agents/coding-standards.md) 为单一真理源（SSOT）。

## Props 定义

- [ ] Props 使用 `interface` 定义
- [ ] 所有 Props 包含 JSDoc 注释
- [ ] Props 名称使用 camelCase
- [ ] 可选 Props 使用 `?` 标记
- [ ] 提供合理的默认值

## Emits 定义

- [ ] Emits 使用 `interface` 定义
- [ ] 所有 Events 包含 JSDoc 注释
- [ ] Event 名称使用 kebab-case
- [ ] Event 参数类型明确

## 样式规范

- [ ] **不使用** `scoped`（依赖 `.aix-` 命名空间 + BEM 隔离）
- [ ] CSS 类名使用 BEM 规范
- [ ] 使用 CSS 变量（`--aix-*`），无硬编码颜色
- [ ] 组件前缀使用 `aix-`

## 质量门禁

- [ ] `pnpm type-check` 通过
- [ ] `pnpm lint` 通过
- [ ] 单元测试覆盖率 > 80%
- [ ] 有 Storybook story
- [ ] 有 API 文档

## 无障碍 / 性能

- [ ] 键盘导航支持、ARIA 属性正确
- [ ] 无不必要的重渲染、无内存泄漏

## 快速命令

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm storybook:dev
```

## 相关工具

| 类型 | 名称 | 用途 |
|------|------|------|
| Skill | `/component-generator` | 生成组件代码 |
| Skill | `/story-generator` | 生成 Story |
| Skill | `/test-generator` | 生成测试 |
| Agent | `@component-design` | 组件设计规范（SSOT）|
| Agent | `@coding-standards` | 编码规范（SSOT）|
