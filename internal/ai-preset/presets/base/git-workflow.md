---
id: base/git-workflow
title: Git 工作流
description: Git 提交规范、分支策略、PR 规范和发布流程
layer: base
priority: 5
platforms: []
tags: [git, workflow]
version: "1.0.0"
---

## Git 提交规范

### 提交格式

```
type(scope): subject

body (可选)

footer (可选)
```

### Type 类型

| type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 添加用户登录功能` |
| `fix` | 修复 Bug | `fix(button): 修复点击态样式问题` |
| `docs` | 文档变更 | `docs: 更新 API 文档` |
| `style` | 代码格式（不影响功能） | `style: 格式化代码` |
| `refactor` | 重构（非新功能/非修复） | `refactor: 重构用户模块` |
| `perf` | 性能优化 | `perf: 优化列表渲染性能` |
| `test` | 添加/修改测试 | `test: 添加登录测试用例` |
| `chore` | 构建/工具变更 | `chore: 更新依赖版本` |
| `ci` | CI/CD 变更 | `ci: 添加自动部署流程` |

### 规范要点

- **subject 推荐使用中文**，清晰表达变更内容
- scope 可选，表示影响范围
- subject 不超过 50 字
- body 说明动机和对比
- 不要把多个不相关的变更放在同一个 commit

## 分支策略

### 主干开发模式（推荐中小项目）

```
main (生产分支)
 ├── feat/user-login       # 功能分支
 ├── fix/button-style      # 修复分支
 └── chore/upgrade-deps    # 杂项分支
```

### GitFlow 模式（大型项目 / 多版本维护）

```
main ──────────────────────────── 生产环境
 │
develop ───────────────────────── 开发集成
 ├── feature/user-module        # 功能开发
 ├── release/v1.2.0             # 发布准备
 └── hotfix/critical-bug        # 紧急修复
```

### 分支命名规范

| 类型 | 格式 | 示例 |
|------|------|------|
| 功能 | `feat/<描述>` 或 `feature/<描述>` | `feat/user-login` |
| 修复 | `fix/<描述>` | `fix/button-click-style` |
| 发布 | `release/v<版本>` | `release/v1.2.0` |
| 热修复 | `hotfix/<描述>` | `hotfix/login-crash` |
| 杂项 | `chore/<描述>` | `chore/upgrade-deps` |

### 分支规则

- 功能分支从 `main`（或 `develop`）拉取，完成后合并回去
- 分支名使用 **kebab-case**，全小写
- 分支生命周期不超过 **1 周**（长期分支及时同步主干）
- 合并前必须通过 CI（lint + test + build）
- 合并后删除源分支

## Pull Request 规范

### PR 标题

```
type(scope): 描述

# 示例
feat(user): 添加用户登录和注册功能
fix(table): 修复分页跳转后滚动位置异常
```

### PR 描述模板

```markdown
## 变更内容
- 简要说明做了什么、为什么做

## 变更类型
- [ ] 新功能 (feat)
- [ ] Bug 修复 (fix)
- [ ] 重构 (refactor)
- [ ] 文档 (docs)

## 测试说明
- 描述如何验证变更

## 截图 (UI 变更时必须)
| Before | After |
|--------|-------|
|        |       |

## 关联 Issue
closes #123
```

### PR 规则

- 单个 PR 变更不超过 **400 行**（超过应拆分）
- 不混合不同目的的变更（功能 + 重构应分开 PR）
- 至少 **1 人** Code Review 后合并
- CI 全部通过后方可合并
- 合并策略：功能分支用 **Squash Merge**，发布分支用 **Merge Commit**

## 发布流程

### 语义化版本 (SemVer)

```
MAJOR.MINOR.PATCH

1.0.0 → 1.0.1  (patch: bug 修复)
1.0.0 → 1.1.0  (minor: 新增功能，向后兼容)
1.0.0 → 2.0.0  (major: 破坏性变更)
```

### 发布清单

- [ ] 所有测试通过
- [ ] CHANGELOG 已更新
- [ ] 版本号已更新
- [ ] 构建产物验证通过
- [ ] 创建 Git Tag（`v1.2.0`）
- [ ] 合并到 main 分支

### Tag 规范

```bash
# 正式版本
git tag -a v1.2.0 -m "release: v1.2.0"

# 预发布版本
git tag -a v1.2.0-beta.1 -m "pre-release: v1.2.0-beta.1"
```

### CHANGELOG 格式

```markdown
## [1.2.0] - 2026-03-30

### 新增
- 用户登录功能 (#123)
- 表格排序支持 (#124)

### 修复
- 修复按钮点击态样式问题 (#125)

### 变更
- 调整默认主题色 (#126)
```
