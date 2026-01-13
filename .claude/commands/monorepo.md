---
name: monorepo
description: Monorepo 操作清单，包管理和构建
---

# Monorepo 操作清单

## 包管理

### 添加依赖

```bash
# 为特定包添加依赖
pnpm add {dependency} --filter @aix/{package}

# 添加开发依赖
pnpm add -D {dependency} --filter @aix/{package}

# 添加根依赖
pnpm add -w {dependency}

# 添加 workspace 依赖
pnpm add @aix/{package-a} --filter @aix/{package-b}
```

### 删除依赖

```bash
# 删除特定包的依赖
pnpm remove {dependency} --filter @aix/{package}
```

### 更新依赖

```bash
# 更新特定包的依赖
pnpm update {dependency} --filter @aix/{package}

# 更新所有依赖
pnpm update -r
```

## 构建管理

### 构建命令

```bash
# 构建所有包
pnpm build

# 构建特定包
pnpm build --filter @aix/{package}

# 构建包及其依赖
pnpm build --filter @aix/{package}...

# 构建受影响的包
pnpm build --filter ...[origin/master]
```

### 清理

```bash
# 清理所有构建产物
pnpm clean

# 清理特定包
pnpm clean --filter @aix/{package}

# 清理 node_modules
rm -rf node_modules packages/*/node_modules
pnpm install
```

## Turborepo 操作

### 缓存管理

```bash
# 清除缓存
turbo clean

# 禁用缓存运行
turbo build --no-cache

# 强制重新构建
turbo build --force
```

### 并发控制

```bash
# 限制并发数
turbo build --concurrency=4

# 无限制并发
turbo build --concurrency=100
```

## 包依赖

### 查看依赖关系

```bash
# 查看包依赖树
pnpm list --depth=Infinity

# 查看特定包的依赖
pnpm list --filter @aix/{package}

# 查看为什么安装了某个包
pnpm why {package}
```

### 依赖问题排查

```bash
# 检查重复依赖
pnpm dedupe

# 验证依赖完整性
pnpm audit

# 修复安全问题
pnpm audit --fix
```

## Workspace 管理

### Workspace Protocol

```json
{
  "dependencies": {
    "@aix/button": "workspace:*",
    "@aix/theme": "workspace:^"
  }
}
```

- `workspace:*`: 使用当前版本
- `workspace:^`: 使用兼容版本
- `workspace:~`: 使用补丁版本

### 发布注意事项

发布前，workspace 协议会被替换为实际版本：
- `workspace:*` → 当前版本（如 `1.0.0`）
- `workspace:^` → 兼容版本（如 `^1.0.0`）

## 常见问题

### 问题 1: 包构建失败

```bash
# 清理并重新构建
pnpm clean
pnpm install
pnpm build
```

### 问题 2: 类型定义找不到

```bash
# 确保依赖包已构建
pnpm build --filter @aix/{dependency-package}

# 重新构建当前包
pnpm build --filter @aix/{current-package}
```

### 问题 3: 循环依赖

检查 package.json 的 dependencies，避免 A → B → A 的循环依赖。

## 快速命令

```bash
# 开发模式
pnpm dev

# 构建所有包
pnpm build

# 运行测试
pnpm test

# 运行 lint
pnpm lint

# 类型检查
pnpm type-check

# 查看 Storybook
pnpm storybook:dev

# 查看文档
pnpm docs:dev
```

## 相关 Skills

| Skill | 功能 | 示例 |
|-------|------|------|
| `/package-creator` | 快速创建新组件包 | `/package-creator Select --description="下拉选择器"` |

## 相关 Agents

- `@project-structure` - Monorepo 项目结构完整指南

## 相关文档

- [project-structure.md](../agents/project-structure.md) - 项目结构和 Monorepo 管理完整指南
- [Turborepo 文档](https://turbo.build/repo/docs)
- [pnpm Workspace](https://pnpm.io/workspaces)
