---
id: commands/tools
title: 工具索引
description: 快速查看所有可用工具的索引，包括 Skills、Commands、Agents
resourceType: command
layer: base
priority: 310
platforms: [claude]
tags: [command, index]
version: "1.0.0"
---

# 工具索引

快速查找项目中所有可用的开发工具。

## 工具分类

### Skills（代码生成）

自动化执行工具，输入参数后直接生成代码或报告。

> 具体可用的 Skills 由框架层和领域层预设提供，使用 `/tools` 命令时会根据项目配置动态列出。

### Commands（快速提示）

快速参考清单，提供常见操作的最佳实践提醒。

| Command | 功能 |
|---------|------|
| `/review-pr` | PR 审查清单 |
| `/git-workflow` | Git 工作流规范 |
| `/quick-fix` | 快速问题修复 |
| `/refactor` | 重构最佳实践 |
| `/optimize` | 性能优化指南 |
| `/security-check` | 安全检查清单 |

### Agents（深度指导）

深度规范文档，提供某个领域的完整指导。

> 具体可用的 Agents 由 base/frameworks/domains 各层预设提供，涵盖编码规范、组件设计、测试策略等主题。

## 决策流程

```
问题 → 能自动修复?
        ├─ 是 → Skills（自动化）
        └─ 否 → 知道解决方案?
                ├─ 是 → 手动修复
                └─ 否 → Commands（快速索引）
                        └─ 仍不清楚? → Agents（深度学习）
```

## 使用原则

- **日常开发**: 优先使用 Skills（快速自动化）
- **查看清单**: 使用 Commands（快速提醒）
- **学习规范**: 使用 Agents（深度指导）
