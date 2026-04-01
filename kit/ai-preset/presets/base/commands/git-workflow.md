---
id: commands/git-workflow
title: Git 速查
description: Git 常用操作速查（规范详见 base/git-workflow）
resourceType: command
layer: base
priority: 300
platforms: [claude]
tags: [command, git]
version: "1.1.0"
---

# Git 操作速查

> 提交规范、分支策略、PR 模板等详见 `base/git-workflow`

## 功能开发流程

```bash
# 1. 拉取最新主干
git checkout main && git pull origin main

# 2. 创建功能分支
git checkout -b feat/user-profile

# 3. 开发 → 提交
git add <files>
git commit -m "feat(user): 添加用户资料页面"

# 4. 推送 → 创建 PR → Review → 合并 → 删除分支
git push origin feat/user-profile
```

## 常用命令

```bash
git stash                          # 暂存当前修改
git stash pop                      # 恢复暂存
git reset --soft HEAD~1            # 撤销提交（保留修改）
git log --oneline --graph -20      # 查看近 20 条提交
git rebase main                    # 变基到主分支
git cherry-pick <sha>              # 摘取特定提交
git diff --stat main               # 查看与主干的差异统计
```
