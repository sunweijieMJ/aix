---
id: commands/quick-fix
title: 快速修复
description: 快速修复常见问题的诊断和解决方案
resourceType: command
layer: base
priority: 300
platforms: [claude]
tags: [command, debugging]
version: "1.0.0"
---

# 快速问题修复指南

## 快速索引表

| 问题类型 | 常见错误 | 快速解决 |
|---------|---------|---------|
| **TypeScript** | Property does not exist | 运行 `pnpm type-check`，补全类型定义 |
| **TypeScript** | Type is not assignable | 检查类型定义 → 类型守卫或断言 |
| **TypeScript** | Cannot find module | 检查 tsconfig.json paths 配置 |
| **API** | Network Error | 检查后端服务 → CORS 配置 |
| **API** | 401 Unauthorized | 检查 Token → 重新登录 |
| **路由** | 404 Not Found | 检查路由 path 配置 |
| **路由** | 403 Forbidden | 检查权限 roles 配置 |
| **样式** | 硬编码颜色 | 改用 CSS 变量 `var(--xxx)` |
| **构建** | Build 失败 | `pnpm type-check` → 修复类型错误 |
| **测试** | 测试失败 | 运行单个测试查看具体错误 |
| **性能** | 页面加载慢 | 路由懒加载 + 图片懒加载 |
| **性能** | 页面卡顿 | 检查大列表渲染和不必要的重计算 |

## TypeScript 类型错误

```bash
# 快速检查
pnpm type-check
pnpm lint
```

| 错误 | 修复 |
|------|------|
| Property does not exist | 补全 interface 定义 |
| Type 'any' is not assignable | 使用明确类型替代 any |
| Cannot find module '@/xxx' | 检查 tsconfig paths 和文件是否存在 |

## 构建问题

```bash
# 清理重建
pnpm clean && pnpm install && pnpm build

# 类型定义找不到 → 先构建依赖包
pnpm build --filter @scope/{dependency-package}
```

## 依赖问题

```bash
pnpm dedupe        # 检查重复依赖
pnpm audit         # 安全审计
rm -rf node_modules && pnpm install  # 重装依赖
```
