---
id: commands/test
title: 组件测试清单
description: 组件测试清单，覆盖 Props/Emits/Slots
resourceType: command
layer: framework
priority: 300
platforms: [claude]
tags: [command, testing]
version: "1.0.0"
---

# 组件测试清单

## 基础测试

- [ ] 组件能正常挂载和销毁
- [ ] 默认渲染状态正确

## Props 测试

- [ ] 所有 Props 都有测试用例
- [ ] 测试 Props 默认值
- [ ] 测试必填 Props 缺失的情况
- [ ] 测试 Props 更新时的响应

## Emits 测试

- [ ] 所有 Events 都有测试用例
- [ ] 测试 Event 触发时机
- [ ] 测试 Event 参数正确性

## Slots 测试

- [ ] 默认插槽渲染
- [ ] 具名插槽渲染
- [ ] 作用域插槽数据传递

## 用户交互测试

- [ ] 点击事件
- [ ] 键盘事件（Enter, Escape, Arrow keys）
- [ ] 焦点进入和离开

## 状态测试

- [ ] 禁用状态（disabled）
- [ ] 加载状态（loading）
- [ ] 错误状态（error）
- [ ] 空状态（empty）

## 可访问性测试

- [ ] ARIA 属性正确
- [ ] 键盘导航支持
- [ ] 焦点管理合理

## 覆盖率目标

- [ ] 语句/分支/函数/行覆盖率 ≥ 80%

## 快速命令

```bash
pnpm test
pnpm test:coverage
pnpm test:watch
```
