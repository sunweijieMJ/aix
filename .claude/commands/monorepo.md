---
description: Monorepo 操作清单，包管理和构建
---

# Monorepo 操作清单

> 📌 本清单是**快速速查**，Monorepo 架构、workspace 协议、依赖管理、构建编排详见 [@project-structure](../agents/project-structure.md)（SSOT）。

## 常用快速命令

```bash
# 开发 / 构建
pnpm dev                                      # 启动所有包 dev
pnpm build                                    # 全量构建
pnpm build --filter @aix/<pkg>                # 单包构建
pnpm build --filter @aix/<pkg>...             # 单包 + 依赖链构建
pnpm build --filter ...[origin/master]        # 受影响包构建

# 清理
pnpm clean                                    # 清理所有构建产物
pnpm clean --filter @aix/<pkg>                # 单包清理

# 质量门禁
pnpm type-check
pnpm lint
pnpm test
```

## 依赖管理

```bash
# 添加 / 删除依赖
pnpm add <dep> --filter @aix/<pkg>            # 运行时依赖
pnpm add -D <dep> --filter @aix/<pkg>         # 开发依赖
pnpm add -w <dep>                             # 根依赖
pnpm add @aix/<a> --filter @aix/<b>           # workspace 内部依赖
pnpm remove <dep> --filter @aix/<pkg>

# 依赖排查
pnpm list --filter @aix/<pkg>                 # 查依赖树
pnpm why <pkg>                                # 为什么装了它
pnpm dedupe                                   # 去重
```

## workspace 协议速查

| 写法 | 发布时替换为 | 适用 |
|------|--------------|------|
| `workspace:^` | `^x.y.z` | **推荐**（兼容版本）|
| `workspace:~` | `~x.y.z` | 补丁版本 |
| `workspace:*` | `x.y.z`  | 精确版本 |

## Turbo 缓存

```bash
turbo clean                                   # 清缓存
turbo build --no-cache                        # 禁用缓存
turbo build --force                           # 强制重建
turbo build --concurrency=4                   # 限制并发
```

## 常见问题处理

- **构建失败** → `pnpm clean && pnpm install && pnpm build`
- **类型找不到** → 先构建依赖包 `pnpm build --filter @aix/<dep>`
- **循环依赖** → 检查 package.json 的 dependencies 链路

## 相关工具

| 类型 | 名称 | 用途 |
|------|------|------|
| Skill | `/package-creator` | 新建组件包 |
| Agent | `@project-structure` | Monorepo 完整指南（SSOT）|
