---
name: release
description: 发布流程清单，版本管理和 npm 发布
---

# 发布流程清单

## 发布前检查

- [ ] 所有测试通过（`pnpm test`）
- [ ] 类型检查通过（`pnpm type-check`）
- [ ] 代码检查通过（`pnpm lint`）
- [ ] 构建成功（`pnpm build`）
- [ ] Storybook 正常（`pnpm storybook:build`）
- [ ] 文档正常（`pnpm docs:build`）

## 变更记录

- [ ] 创建 changeset（`pnpm changeset`）
- [ ] Changeset 类型正确（major/minor/patch）
- [ ] Changeset 描述清晰
- [ ] Changeset 包含所有变更

## 版本管理

- [ ] 版本号符合语义化版本规范
- [ ] CHANGELOG 已更新
- [ ] package.json 版本已更新
- [ ] Git 标签已创建

## 发布检查

- [ ] npm 凭证配置正确
- [ ] package.json 的 `publishConfig` 正确
- [ ] `.npmignore` 或 `files` 字段正确
- [ ] README.md 完整

## 发布命令

```bash
# 1. 创建 changeset
pnpm changeset

# 2. 更新版本（会自动生成 CHANGELOG）
pnpm changeset version

# 3. 构建所有包
pnpm build

# 4. 发布到 npm
pnpm changeset publish

# 5. 推送到 Git
git push --follow-tags
```

## 发布后验证

- [ ] npm 上的包可以正常安装
- [ ] 包的版本号正确
- [ ] 包的内容完整
- [ ] README 在 npm 上显示正常

## 回滚方案

```bash
# 如果发布出现问题，可以废弃版本
npm deprecate @aix/{package}@{version} "版本有问题，请使用 x.x.x"

# 或发布修复版本
pnpm changeset
# 选择 patch
pnpm changeset version
pnpm build
pnpm changeset publish
```

## 快速命令

```bash
# 查看当前版本
pnpm changeset status

# 查看变更
pnpm changeset

# 发布预发布版本
pnpm changeset pre enter next
pnpm changeset version
pnpm changeset publish --tag next
pnpm changeset pre exit
```

## 相关 Agents

- `@npm-publishing` - npm 发布完整指南
- `@project-structure` - Monorepo 项目结构

## 相关文档

- [Changesets 文档](https://github.com/changesets/changesets)
- [语义化版本](https://semver.org/lang/zh-CN/)
