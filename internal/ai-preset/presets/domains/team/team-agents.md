---
id: team/team-agents
title: Team Agent 协作规范
description: 多 Agent 协作模式，包含架构师、测试工程师和文档工程师角色
layer: domain
priority: 250
platforms: [claude]
tags: [team, agent]
version: "1.0.0"
---

## 职责

负责 Claude Code Agent Team 多角色协作的规范指导。

> **注意**：Team Agent 功能依赖 Claude Code 的 Agent 文件所有权隔离和 Plan 模式等专属能力，不适用于其他 AI 平台。

---

## 角色定义

### 架构师 (team-designer)

- **模式**: Plan 模式（只读，不直接编辑代码）
- **职责**: 整体架构设计、文件规划、API 设计
- **工具**: Read, Grep, Glob（只读工具）
- **交付物**: 设计文档 + Todo 清单

### 测试工程师 (team-tester)

- **文件所有权**: `__test__/`, `__tests__/`, `*.test.ts`, `*.spec.ts`
- **职责**: 编写单元测试和无障碍测试
- **原则**: 不修改测试目标的源码

### 文档工程师 (team-storyteller)

- **文件所有权**: `stories/`, `*.stories.ts`, `*.mdx`
- **职责**: 编写 Storybook Story 和组件文档
- **原则**: 不修改组件源码

## 协作原则

### 文件所有权隔离

```
架构师:    只读所有文件，输出设计文档
测试工程师:  只写 __test__/ 和 *.test.ts
文档工程师:  只写 stories/ 和 *.stories.ts
主开发者:    写源码（src/），不写测试和文档
```

- 不同 Agent 不编辑同一文件
- 通过 Task 工具协调工作分配
- Agent 之间通过 SendMessage 通信

### 典型工作流

```
1. 主开发者创建 Team，定义任务
2. 架构师分析需求，输出设计方案（Plan 模式）
3. 主开发者实现源码
4. 测试工程师并行编写测试
5. 文档工程师并行编写 Story
6. 全部完成后 doctor 检查
```
