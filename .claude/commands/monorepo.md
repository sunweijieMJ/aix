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
pnpm build:filter @aix/<pkg>                  # 单包构建（不是 build --filter，见下）
pnpm build:filter @aix/<pkg>...               # 单包 + 依赖链构建
pnpm build:filter ...[origin/master]          # 受影响包构建

# 清理
pnpm clean                                    # 清理所有构建产物
pnpm clean --filter @aix/<pkg>                # 单包清理（clean 无预置 filter，这样写没问题）

# 质量门禁
pnpm type-check
pnpm lint
pnpm test
pnpm test --filter @aix/<pkg>                 # test 无预置 filter，可以这样写
```

> ⚠️ **复合脚本 + `--filter` 是本仓最容易踩的坑**。pnpm 把额外参数追加到脚本字符串末尾：
>
> | 想做的事 | 错误写法 | 实际发生 | 正确写法 |
> |---------|---------|---------|---------|
> | 单包构建 | `pnpm build --filter @aix/button` | `build` 自带 `--filter=!./apps/*`，两个 filter 取**并集**，实测构建 7 个包 | `pnpm build:filter @aix/button` |
> | 单包类型检查 | `pnpm type-check --filter @aix/button` | 展开成 `turbo type-check && pnpm type-check:root --filter ...`，`tsc` 收到 `--filter` 直接报错 | `pnpm exec turbo type-check --filter @aix/button` |
> | 单包 lint | `pnpm lint --filter @aix/button` | 同上，`eslint` 收到 `--filter` 报错 | `pnpm exec turbo lint --filter @aix/button` |
>
> 机制：pnpm 把额外参数追加到**整个脚本字符串末尾**，所以 `A && B` 里只有 `B` 收到参数。
> 判断方法：`node -e "console.log(require('./package.json').scripts['<name>'])"`
> ——脚本里有 `&&` 或已有 `--filter` 的，一律不要再追加 `--filter`。
>
> `turbo` 不在 PATH 上，直接敲 `turbo` 会 command not found，走 `pnpm exec turbo`。

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
pnpm exec turbo clean                                   # 清缓存
pnpm exec turbo build --no-cache                        # 禁用缓存
pnpm exec turbo build --force                           # 强制重建
pnpm exec turbo build --concurrency=4                   # 限制并发
```

## 常见问题处理

- **构建失败** → `pnpm clean && pnpm install && pnpm build`
- **类型找不到** → 先构建依赖包 `pnpm build:filter @aix/<dep>`
- **循环依赖** → 检查 package.json 的 dependencies 链路

## 相关工具

| 类型 | 名称 | 用途 |
|------|------|------|
| Skill | `/package-creator` | 新建组件包 |
| Agent | `@project-structure` | Monorepo 完整指南（SSOT）|
