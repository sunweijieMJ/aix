---
id: commands/monorepo
title: Monorepo 操作清单
description: Monorepo 操作清单，包管理和构建
resourceType: command
layer: base
priority: 300
platforms: [claude]
tags: [command, monorepo]
version: "1.0.0"
---

# Monorepo 操作清单

## 包管理

```bash
# 为特定包添加依赖
pnpm add {dependency} --filter @scope/{package}

# 添加开发依赖
pnpm add -D {dependency} --filter @scope/{package}

# 添加根依赖
pnpm add -w {dependency}

# 添加 workspace 依赖
pnpm add @scope/{package-a} --filter @scope/{package-b}
```

## 构建命令

```bash
# 构建所有包
pnpm build

# 构建特定包
pnpm build --filter @scope/{package}

# 构建包及其依赖
pnpm build --filter @scope/{package}...
```

## 清理

```bash
# 清理所有构建产物
pnpm clean

# 清理 node_modules
rm -rf node_modules packages/*/node_modules
pnpm install
```

## Workspace Protocol

```json
{
  "dependencies": {
    "@scope/utils": "workspace:*"
  }
}
```

- `workspace:*`: 使用当前版本
- `workspace:^`: 使用兼容版本

## 常见问题排查

```bash
# 包构建失败 → 清理重建
pnpm clean && pnpm install && pnpm build

# 类型定义找不到 → 先构建依赖包
pnpm build --filter @scope/{dependency-package}

# 依赖问题 → 检查和修复
pnpm dedupe && pnpm audit
```
