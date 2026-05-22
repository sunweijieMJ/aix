---
description: 发布流程清单，版本管理和 npm 发布
---

# 发布流程清单

> 📌 本清单是**快速勾选项**，npm 发布完整流程、版本策略、CHANGELOG 规范详见 [@npm-publishing](../agents/npm-publishing.md)（SSOT）。

## 发布前检查

- [ ] `pnpm test` 全部通过
- [ ] `pnpm type-check` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm build` 成功
- [ ] `pnpm storybook:build` 成功
- [ ] `pnpm docs:build` 成功

## 变更与版本

- [ ] 创建 changeset（`pnpm changeset`）
- [ ] Bump 类型正确（major / minor / patch）
- [ ] Changeset 描述清晰、覆盖所有变更
- [ ] CHANGELOG 和 package.json 版本已更新
- [ ] Git 标签已创建

## 发布配置

- [ ] npm 凭证可用
- [ ] `publishConfig`、`files`、`exports` 字段正确
- [ ] README.md 完整

## 发布命令

```bash
pnpm changeset           # 1. 创建 changeset
pnpm changeset version   # 2. 更新版本 + CHANGELOG
pnpm build               # 3. 构建
pnpm changeset publish   # 4. 发布到 npm
git push --follow-tags   # 5. 推送 tag
```

## 发布后验证

- [ ] `npm install @aix/<pkg>` 可用
- [ ] 版本号、文件内容、README 显示正常

## 回滚

- [ ] 问题严重 → `npm deprecate @aix/<pkg>@<version> "..."`
- [ ] 可修补 → 走 patch changeset 重新发布

## 相关 Agents

- `@npm-publishing` — 发布流程完整指南（SSOT）
- `@project-structure` — Monorepo 结构（影响 `exports` 字段）
