---
description: 发布流程清单，版本管理和 npm 发布
---

# 发布流程清单

> 📌 本清单是**快速勾选项**，npm 发布完整流程、版本策略、CHANGELOG 规范详见 [@npm-publishing](../agents/npm-publishing.md)（SSOT）。

## 发布前检查

- [ ] `pnpm build` 成功（必须先构建：下面几项都依赖产物）
- [ ] `pnpm test` 全部通过
- [ ] `pnpm type-check` 通过
- [ ] `pnpm lint` 通过
- [ ] **`pnpm lint:publish --strict` 通过** ← 发布形态门禁，最容易在这里暴露问题
- [ ] `pnpm storybook:build` 成功
- [ ] `pnpm docs:build` 成功

> `lint:publish --strict` 校验 package.json 字段自洽性（publint）与类型在
> node10 / node16-cjs / node16-esm / bundler 四种解析模式下能否被正确解析（attw）。
> CI 的 `check-quality.yml` 和 `release-packages.yml` **都会跑它**，漏跑只是把问题
> 推迟到用户侧。新包和改过 `exports` 的包尤其要看。

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

**本仓的正式发布走 GitHub Actions 手动触发**，不在本地跑 publish：

```
1. 本地：pnpm changeset            提交 changeset 并合入
2. Actions → Release Packages → Run workflow → "Create Version PR"
3. 审查并合入自动生成的 "Version Packages" PR（版本号 + CHANGELOG）
4. Actions → Release Packages → Run workflow → "Publish to npm"
```

workflow（`.github/workflows/release-packages.yml`）内部会先跑
`pnpm test && pnpm type-check && pnpm lint && pnpm lint:publish --strict`，
发布成功后自动 `git push --follow-tags`。

> ⚠️ 这个 workflow 带 `workflow_dispatch`，**可以绕过 PR 门禁直接发布**，
> 所以它自己也跑一遍全套质量检查。不要在本地手动 `pnpm changeset publish`
> 绕开这条路径——registry 凭证在 CI secrets 里。

本地只做这一步：

```bash
pnpm changeset           # 创建 changeset（描述本次变更 + bump 类型）
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
