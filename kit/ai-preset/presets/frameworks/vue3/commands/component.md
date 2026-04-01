---
id: commands/component
title: 组件开发清单
description: 组件开发清单，Props/Emits/样式规范检查
resourceType: command
layer: framework
priority: 300
platforms: [claude]
tags: [command, vue, component]
version: "1.0.0"
---

# 组件开发清单

## Props 定义

- [ ] Props 使用 `interface` 定义
- [ ] 所有 Props 包含 JSDoc 注释
- [ ] Props 名称使用 camelCase
- [ ] 可选 Props 使用 `?` 标记
- [ ] 提供合理的默认值

## Emits 定义

- [ ] Emits 使用 `interface` 定义
- [ ] 所有 Events 包含 JSDoc 注释
- [ ] Event 参数类型明确

## 样式规范

- [ ] CSS 类名使用 BEM 规范
- [ ] 使用 CSS 变量（`var(--prefix-*)`）
- [ ] 组件前缀正确
- [ ] 避免硬编码颜色和尺寸

## 类型安全

- [ ] 运行 `pnpm type-check` 通过
- [ ] 运行 `pnpm lint` 通过
- [ ] 无 TypeScript 错误

## 测试覆盖

- [ ] 有单元测试文件
- [ ] 测试 Props 渲染
- [ ] 测试 Events 触发
- [ ] 测试覆盖率 > 80%

## 文档完整

- [ ] 有 Storybook story
- [ ] 有 API 文档（Props/Emits/Slots）
- [ ] 有使用示例
- [ ] 有类型定义导出

## 可访问性

- [ ] 键盘导航支持
- [ ] ARIA 属性正确
- [ ] 焦点管理合理

## 快速命令

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
```
