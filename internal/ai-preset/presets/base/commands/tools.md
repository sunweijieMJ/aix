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

## Skills（代码生成）

| Skill | 功能 |
|-------|------|
| `/component-generator` | 生成 Vue 组件 |
| `/store-generator` | 生成 Pinia Store |
| `/page-assembler` | 页面拼装器 |
| `/api-generator` | 自定义 API 生成 |
| `/architecture-designer` | PRD → 架构设计 |
| `/figma-to-component` | Figma → 组件 |
| `/test-coverage-checker` | 测试覆盖率检查 |
| `/implementation-validator` | 代码一致性校验 |
| `/code-optimizer` | 代码优化 |

## Commands（快速提示）

| Command | 功能 |
|---------|------|
| `/review-pr` | PR 审查清单 |
| `/git-workflow` | Git 工作流规范 |
| `/quick-fix` | 快速问题修复 |
| `/refactor` | 重构最佳实践 |
| `/optimize` | 性能优化指南 |
| `/security-check` | 安全检查清单 |

## Agents（深度指导）

| Agent | 功能 |
|-------|------|
| `@coding-standards` | 编码规范 |
| `@common-patterns` | 通用开发模式 |
| `@component-design` | 组件设计规范 |
| `@api-development` | API 接口规范 |
| `@testing` | 测试策略 |
| `@code-review` | 代码审查 |

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
