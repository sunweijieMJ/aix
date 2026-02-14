---
title: Claude Code 定制化完整指南
description: 深入掌握 Claude Code 的 Agents、Skills、Hooks、Commands、CLAUDE.md 和 Settings 配置，构建团队专属的 AI 开发工作流
outline: deep
---

# Claude Code 定制化完整指南

> 从零开始掌握 Claude Code 的六大定制能力，打造团队专属的智能开发工作流

::: tip 适用版本
本文基于 Claude Code 2.x 编写，内容持续更新。如有变动以 [官方文档](https://docs.anthropic.com/en/docs/claude-code) 为准。
:::

---

## 1. 总览：六大定制能力

Claude Code 提供六种定制机制，覆盖从"项目记忆"到"自动化规则"的完整链路：

```
┌──────────────────────────────────────────────────────────────┐
│                    Claude Code 定制化体系                      │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│  CLAUDE.md   │   Agents     │   Skills     │   Commands      │
│  项目记忆     │   专业子代理  │   代码生成器  │   快速清单      │
│  ────────    │   ────────   │   ────────   │   ────────      │
│  自动加载     │  Task 工具    │  自动匹配     │  /命令 触发     │
│  指令+规范    │  深度指导     │  生成代码     │  提示+清单      │
├──────────────┴──────────────┴──────────────┴─────────────────┤
│                         Hooks                                │
│                     事件驱动自动化                              │
│  ──────────────────────────────────────────────────────────── │
│  SessionStart / UserPromptSubmit / PreToolUse / PostToolUse   │
│  SessionEnd / Notification / Stop / SubagentStop              │
├──────────────────────────────────────────────────────────────┤
│                        Settings                              │
│                   权限 / MCP / 环境变量                        │
└──────────────────────────────────────────────────────────────┘
```

### 六者的区别

| 维度 | CLAUDE.md | Agents | Skills | Commands | Hooks | Settings |
|------|-----------|--------|--------|----------|-------|----------|
| **定位** | 项目指令 | 专业子代理 | 代码生成器 | 快速清单 | 自动化规则 | 配置管理 |
| **触发方式** | 自动加载 | Task 工具调用 | 自动匹配/手动 | `/命令名` | 事件驱动 | 启动时加载 |
| **输出** | 上下文指令 | 指导性回复 | 生成代码文件 | 提示内容 | Shell 执行 | 环境配置 |
| **适用场景** | "项目规范是..." | "X 有什么规范?" | "帮我生成 X" | "查看 X 清单" | "写文件后自动..." | "允许执行 X" |
| **存储位置** | 项目根/`.claude/` | `.claude/agents/` | `.claude/skills/` | `.claude/commands/` | `settings.json` | `settings.json` |
| **技术门槛** | 低 | 中 | 高 | 低 | 中 | 低 |

### 使用决策树

```
                    你想做什么？
                       │
           ┌───────────┼───────────┐
           ▼           ▼           ▼
      约束 Claude    执行任务     自动化流程
      的行为         /生成代码
           │           │           │
           ▼           ▼           ▼
      CLAUDE.md    是否需要       Hooks
      + Settings   深度指导?     (事件触发)
                   /      \
                 是        否
                 │         │
                 ▼         ▼
              Agents    是否生成代码?
                        /      \
                      是        否
                      │         │
                      ▼         ▼
                   Skills    Commands
                 (生成文件)  (查看清单)
```

---

## 2. CLAUDE.md — 项目记忆

### 2.1 什么是 CLAUDE.md

CLAUDE.md 是 Markdown 格式的指令文件，Claude Code 在每次会话开始时**自动加载**到上下文中。你可以在其中写入项目规范、常用命令、架构约定等任何希望 Claude 遵循的规则。

### 2.2 记忆层级

Claude Code 支持多层记忆，从组织到个人、从全局到项目：

| 记忆类型 | 位置 | 用途 | 共享范围 |
|---------|------|------|---------|
| **组织策略** | macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md` | 企业统一规范 | 所有用户 |
| **用户全局** | `~/.claude/CLAUDE.md` | 个人偏好 | 仅自己（所有项目） |
| **用户规则** | `~/.claude/rules/*.md` | 个人模块化规则 | 仅自己（所有项目） |
| **项目共享** | `./CLAUDE.md` 或 `./.claude/CLAUDE.md` | 团队项目规范 | 团队（通过 Git） |
| **项目规则** | `./.claude/rules/*.md` | 模块化项目指令 | 团队（通过 Git） |
| **项目个人** | `./CLAUDE.local.md` | 个人项目偏好 | 仅自己（自动 gitignore） |
| **自动记忆** | `~/.claude/projects/<project>/memory/` | Claude 自动记录 | 仅自己（按项目） |

**优先级**（从高到低）：组织策略 > 命令行参数 > 项目个人 > 项目共享 > 用户全局

### 2.3 编写 CLAUDE.md

#### 快速初始化

```bash
# 使用内置命令自动生成
claude
> /init
```

#### 推荐内容

```markdown
# 项目名称

## 技术栈
- 框架：Vue 3 + TypeScript
- 构建：Rollup
- 测试：Vitest

## 常用命令
- `pnpm build` - 构建所有包
- `pnpm test` - 运行测试
- `pnpm lint` - 代码检查
- `pnpm type-check` - 类型检查

## 编码规范
- 所有 Props 必须使用 TypeScript interface 定义
- CSS 类名使用 BEM 规范，前缀 `.aix-`
- 颜色值必须使用 CSS 变量 `var(--aix-*)`
- 禁止使用 `any` 类型

## 项目结构
- `packages/` - 组件包（发布到 npm）
- `apps/` - 应用（不发布）
- `internal/` - 内部共享配置

## Git 提交规范
- 格式：`type(scope): subject`
- 示例：`feat(button): 添加 loading 状态`
```

#### 最佳实践

- **具体**：`"使用 2 空格缩进"` 优于 `"正确格式化代码"`
- **结构化**：用 Markdown 标题分组，每条规则一个要点
- **定期更新**：项目演进时同步更新 CLAUDE.md
- **使用 `/memory` 命令**：在会话中编辑记忆文件

### 2.4 模块化规则 `.claude/rules/`

对于大型项目，可以将指令拆分为多个文件：

```
.claude/rules/
├── code-style.md       # 代码风格
├── testing.md          # 测试规范
├── security.md         # 安全要求
└── frontend/
    ├── vue.md          # Vue 规范
    └── styles.md       # 样式规范
```

所有 `.md` 文件会被自动递归发现并加载。

#### 路径限定规则

使用 YAML frontmatter 的 `paths` 字段，让规则仅对特定文件生效：

```markdown
---
paths:
  - "packages/**/*.vue"
  - "packages/**/*.ts"
---

# Vue 组件开发规则

- 所有组件使用 `<script setup>` 语法
- Props 使用 `defineProps<Props>()` 定义
```

### 2.5 CLAUDE.md 导入

CLAUDE.md 支持通过 `@path/to/file` 语法导入其他文件：

```markdown
参考 @README.md 了解项目概述
参考 @package.json 了解可用命令

# 额外指令
- Git 工作流 @docs/git-instructions.md
```

- 支持相对路径和绝对路径
- 相对路径基于包含导入语句的文件位置
- 最大导入深度 5 层
- 代码块内的 `@` 不会被当作导入

### 2.6 自动记忆

Claude 会在工作中自动记录学到的内容，存储在 `~/.claude/projects/<project>/memory/` 目录：

```
memory/
├── MEMORY.md          # 索引文件（前 200 行自动加载）
├── debugging.md       # 调试经验
└── patterns.md        # 代码模式
```

- `MEMORY.md` 前 200 行在每次会话开始时加载
- 其他文件按需读取
- 可以直接告诉 Claude："记住我们使用 pnpm 而不是 npm"

```bash
# 强制开启/关闭自动记忆
export CLAUDE_CODE_DISABLE_AUTO_MEMORY=0  # 强制开启
export CLAUDE_CODE_DISABLE_AUTO_MEMORY=1  # 强制关闭
```

---

## 3. Agents — 专业子代理

### 3.1 什么是 Agent

Agent 是存储在 `.claude/agents/` 目录下的 Markdown 文件，提供特定领域的**深度知识和规范指导**。当 Claude 需要专业领域的知识时，会通过 Task 工具调用对应的 Agent。

### 3.2 Agent vs Skill vs Command

```
用户问："帮我创建一个 Button 组件"
  → Skill 响应：直接生成 Button 组件的代码文件

用户问："组件的 Props 定义有什么规范？"
  → Agent 响应：提供 Props 定义的完整规范指导

用户输入：/component
  → Command 响应：显示组件开发检查清单
```

### 3.3 创建 Agent

在 `.claude/agents/` 目录创建 `.md` 文件：

```markdown
---
name: component-design
description: Vue组件库设计完整指南，包括设计原则、API设计、样式规范和最佳实践
tools: Read, Grep, Glob
model: inherit
---

# 组件库设计完整指南

## 职责

提供 Vue 组件库的完整设计指导，包括设计原则、Props/Emits/Slots API 设计、
样式规范和最佳实践。

## 设计原则

### 1. 简洁性原则
- 最小化 API：只暴露必要的 Props 和 Events
- 合理默认值：提供开箱即用的默认配置
...

## Props 定义规范
...

## 样式规范
...
```

#### Frontmatter 字段

| 字段 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `name` | 是 | Agent 名称，也是 `subagent_type` 的值 | `component-design` |
| `description` | 是 | Agent 职责描述，用于自动匹配 | `Vue组件库设计完整指南` |
| `tools` | 否 | 可用的工具列表（省略则继承所有工具） | `Read, Grep, Glob` |
| `disallowedTools` | 否 | 禁止使用的工具（从继承列表中移除） | `Edit, Write` |
| `model` | 否 | 使用的模型 | `sonnet` / `opus` / `haiku` / `inherit` |
| `permissionMode` | 否 | 权限模式 | `default` / `plan` / `acceptEdits` |
| `maxTurns` | 否 | 最大执行轮数 | `20` |
| `skills` | 否 | 预加载的 Skill 列表 | `["component-generator"]` |
| `mcpServers` | 否 | 可用的 MCP 服务器 | `["eslint"]` |
| `hooks` | 否 | 作用域限定的 Hook | — |
| `memory` | 否 | 持久记忆范围 | `user` / `project` / `local` |

#### tools 可用值

Agent 可配置的工具取决于其用途：

- **只读 Agent**：`Read, Grep, Glob` — 适用于规范指导、代码审查
- **全功能 Agent**：省略 `tools` 字段继承所有工具 — 适用于需要修改代码的场景
- **受限 Agent**：使用 `disallowedTools` 移除特定工具 — 更灵活的权限控制

### 3.4 Agent 的调用方式

Agent 通过 Task 工具的 `subagent_type` 参数调用：

```
Claude 内部调用:
Task(subagent_type="component-design", prompt="帮我设计 Select 组件的 API")
```

但你**不需要手动指定**。Claude 会根据你的问题自动选择合适的 Agent：

```bash
# 你只需描述任务
"Props 定义有什么规范?"         → 自动调用 component-design Agent
"CSS 变量怎么使用?"            → 自动调用 coding-standards Agent
"这个组件的测试怎么写?"        → 自动调用 testing Agent
"如何在包之间添加依赖?"       → 自动调用 project-structure Agent
```

### 3.5 AIX 项目中的 Agent

#### 核心 Agent（日常必用）

| Agent | 文件 | 职责 |
|-------|------|------|
| `component-design` | `component-design.md` | 组件设计，Props/Emits/Slots 规范 |
| `coding-standards` | `coding-standards.md` | 编码规范，TypeScript/Vue/CSS |

#### 专业 Agent（按需使用）

| Agent | 文件 | 职责 |
|-------|------|------|
| `project-structure` | `project-structure.md` | Monorepo 架构、目录组织 |
| `testing` | `testing.md` | 测试策略、用例编写 |
| `storybook-development` | `storybook-development.md` | Story 编写、文档生成 |
| `npm-publishing` | `npm-publishing.md` | 版本管理、npm 发布 |
| `accessibility` | `accessibility.md` | 无障碍合规 |
| `performance` | `performance.md` | 性能优化 |
| `code-review` | `code-review.md` | 代码审查 |
| `figma-extraction-guide` | `figma-extraction-guide.md` | Figma 设计稿提取 |

#### Agent 依赖关系

```
核心层
━━━━━
component-design ◄──── coding-standards
       │                      │
       └──────────────────────┘
        (CSS 变量/BEM 规范共享)

专业层
━━━━━
testing ──▶ component-design
storybook ──▶ coding-standards
code-review ──▶ component-design + coding-standards

基础设施层
━━━━━━━━
project-structure（独立）
npm-publishing ──▶ project-structure
```

---

## 4. Skills — 代码生成器

### 4.1 什么是 Skill

Skill 是存储在 `.claude/skills/<name>/SKILL.md` 的自动化代码生成器。与 Agent 提供指导不同，**Skill 直接生成代码文件**。Claude 根据任务描述自动匹配最合适的 Skill，也可以通过 `/<skill-name>` 手动触发。

### 4.2 创建 Skill

在 `.claude/skills/` 目录创建 `<name>/SKILL.md` 文件：

```markdown
---
name: component-generator
description: 根据规范生成Vue组件，适用于组件库开发。支持Props/Emits类型定义、CSS变量
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "1.0.0"
  category: development
---

# 组件生成器 Skill

## 功能概述

为组件库生成符合标准的 Vue 组件，包含完整的 TypeScript 类型定义、
Props/Emits 接口、CSS 变量使用等最佳实践。

## 使用方式

### 基本用法

/component-generator Dropdown --package=components
/component-generator Button --package=button --with-story

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--package` | 目标包名称 | 必需 |
| `--with-story` | 是否生成 Story | false |
| `--with-test` | 是否生成测试 | false |

## 执行流程

### 步骤 1: 收集信息
...
### 步骤 2: 生成代码
...
### 步骤 3: 验证
...
```

#### Frontmatter 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 否 | 显示名（默认使用目录名），用于 `/name` 触发 |
| `description` | 推荐 | 功能描述，用于自动匹配 |
| `argument-hint` | 否 | 自动补全时的参数提示，如 `[component-name]` |
| `disable-model-invocation` | 否 | 设为 `true` 禁止 Claude 自动触发（仅手动 `/` 调用） |
| `user-invocable` | 否 | 设为 `false` 从 `/` 菜单中隐藏 |
| `allowed-tools` | 否 | Skill 激活时允许的工具（无需确认） |
| `model` | 否 | Skill 激活时使用的模型 |
| `context` | 否 | 设为 `fork` 在隔离的子代理中运行 |
| `agent` | 否 | `context: fork` 时使用的子代理类型 |
| `license` | 否 | 许可证 |
| `compatibility` | 否 | 兼容性要求 |
| `metadata` | 否 | 元数据（作者、版本、分类） |

#### 参数替换

Skill 内容支持以下变量替换：

| 变量 | 说明 | 示例 |
|------|------|------|
| `$ARGUMENTS` | 所有参数 | `/skill Button --with-story` → `Button --with-story` |
| `$1`, `$2`, ... | 位置参数 | `/skill Button Select` → `$1=Button`, `$2=Select` |
| `$ARGUMENTS[0]` | 指定位置 | 等同于 `$1` |

#### 动态上下文注入

使用 `` !`command` `` 语法在 Skill 内容发送前执行 Shell 命令，输出替换占位符：

```markdown
当前 Git 状态：
!`git status --short`

请根据以上状态进行操作。
```

### 4.3 Skill 的调用方式

```bash
# 方式 1：手动调用（推荐明确场景）
/component-generator Button --package=button --with-story

# 方式 2：自然语言描述（Claude 自动匹配）
"帮我创建一个 Select 组件包"         → 自动使用 package-creator
"为 Button 组件生成 story"          → 自动使用 story-generator
"检查 pdf-viewer 的测试覆盖率"       → 自动使用 coverage-analyzer
```

### 4.4 AIX 项目中的 Skill

#### 按分类

| 分类 | Skill | 功能 |
|------|-------|------|
| **脚手架** | `/package-creator` | 创建新组件包脚手架 |
| **开发** | `/component-generator` | 智能组件代码生成 |
| **开发** | `/figma-to-component` | Figma 设计稿 → Vue 组件 |
| **文档** | `/story-generator` | 自动生成 Storybook Stories |
| **文档** | `/docs-generator` | API 文档自动生成 |
| **质量** | `/test-generator` | 自动生成测试模板 |
| **质量** | `/coverage-analyzer` | 测试覆盖率分析 |
| **质量** | `/code-optimizer` | 性能/类型/包体积优化 |
| **质量** | `/a11y-checker` | 无障碍合规检查 |

#### Skill 命名规范

| 类型 | 模式 | 示例 |
|------|------|------|
| 生成类 | `/xxx-generator` | `/component-generator`, `/story-generator` |
| 分析类 | `/xxx-analyzer` | `/coverage-analyzer` |
| 检查类 | `/xxx-checker` | `/a11y-checker` |
| 创建类 | `/xxx-creator` | `/package-creator` |
| 优化类 | `/xxx-optimizer` | `/code-optimizer` |

### 4.5 典型工作流

```bash
# 完整组件开发流程
/package-creator Select                               # 1. 创建包结构
/component-generator Select --package=select --with-story  # 2. 生成组件
/story-generator packages/select/src/Select.vue       # 3. 完善 Story
/test-generator packages/select                       # 4. 生成测试
/coverage-analyzer packages/select                    # 5. 检查覆盖率
/a11y-checker packages/select                         # 6. 无障碍检查
/docs-generator packages/select                       # 7. 生成文档
pnpm test && pnpm build                               # 8. 验证
```

---

## 5. Commands — 快速清单

### 5.1 什么是 Command

Command 是存储在 `.claude/commands/` 目录下的轻量级 Markdown 文件。用户通过 `/命令名` 调用，Claude 读取对应文件内容作为上下文提示。Command 不执行任何代码，只提供清单和指引。

::: info 与 Skill 的关系
在最新版本中，Commands 已合并到 Skills 系统中。`.claude/commands/review.md` 和 `.claude/skills/review/SKILL.md` 都会创建 `/review` 命令，效果相同。现有的 `.claude/commands/` 文件继续正常工作。如果同名 Skill 和 Command 都存在，Skill 优先。
:::

### 5.2 创建 Command

在 `.claude/commands/` 目录创建 `.md` 文件：

```markdown
---
description: 组件开发清单，Props/Emits/样式规范检查
---

# 组件开发清单

## Props 定义
- [ ] Props 使用 interface 定义
- [ ] 所有 Props 包含 JSDoc 注释
- [ ] Props 名称使用 camelCase
- [ ] 提供合理的默认值

## 样式规范
- [ ] CSS 类名使用 BEM 规范
- [ ] 使用 CSS 变量（--aix-*）
- [ ] 避免硬编码颜色和尺寸

## 快速命令
pnpm type-check   # 类型检查
pnpm lint          # 代码检查
pnpm test          # 运行测试
```

#### Frontmatter 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `description` | 是 | 命令描述，显示在 `/` 补全列表中 |

### 5.3 使用 Command

```bash
# 在 Claude Code 会话中输入
/component        # 查看组件开发清单
/story            # 查看 Story 编写清单
/test             # 查看测试清单
/release          # 查看发布流程
/monorepo         # 查看 Monorepo 操作
/review-pr        # 查看 PR 审查清单
```

### 5.4 AIX 项目中的 Command

| Command | 功能 | 使用场景 |
|---------|------|---------|
| `/component` | 组件开发清单 | 开发新组件时对照检查 |
| `/story` | Story 编写清单 | 编写 Storybook 时参考 |
| `/test` | 测试清单 | 编写测试时参考 |
| `/release` | 发布流程清单 | 发布前逐项检查 |
| `/monorepo` | Monorepo 操作 | 包管理、构建操作参考 |
| `/review-pr` | PR 审查清单 | 代码审查时逐项检查 |

### 5.5 Command vs Skill

| 维度 | Command | Skill |
|------|---------|-------|
| **输出** | 文本提示/清单 | 代码文件 |
| **触发** | 仅手动 `/命令名` | 自动匹配或手动 |
| **文件结构** | 单个 `.md` | 目录 + `SKILL.md` |
| **复杂度** | 简单（纯文本） | 复杂（执行流程） |
| **适用** | 查看规范、检查清单 | 生成代码、自动化 |

---

## 6. Hooks — 事件驱动自动化

### 6.1 什么是 Hook

Hook 是在特定事件触发时**自动执行的操作**，配置在 `settings.json` 的 `hooks` 字段中。支持三种类型：Shell 命令（确定性执行）、LLM 提示（AI 评估）、子代理（AI + 工具调用）。

### 6.2 可用的 Hook 事件

| 事件 | 触发时机 | 可阻止 | 典型用途 |
|------|---------|--------|---------|
| `SessionStart` | 会话开始/恢复时 | 否 | 显示欢迎信息、项目状态 |
| `UserPromptSubmit` | 用户提交提示时 | 是 | 显示状态、规范提醒 |
| `PreToolUse` | 工具调用前 | 是 | 阻止危险操作、参数校验 |
| `PermissionRequest` | 权限对话框出现时 | 是 | 自动批准/拒绝特定权限 |
| `PostToolUse` | 工具调用成功后 | 否 | 确认通知、触发测试 |
| `PostToolUseFailure` | 工具调用失败后 | 否 | 错误报告、自动修复 |
| `Notification` | 发送通知时 | 否 | 自定义通知 |
| `SubagentStart` | 子代理生成时 | 否 | 记录子任务启动 |
| `SubagentStop` | 子代理完成时 | 是 | 验证子任务完成质量 |
| `Stop` | Claude 准备停止时 | 是 | 验证任务是否全部完成 |
| `TeammateIdle` | 团队队友即将空闲时 | 是 | 自动分配新任务 |
| `TaskCompleted` | 任务标记完成时 | 是 | 验证任务完成质量 |
| `PreCompact` | 上下文压缩前 | 否 | 记录压缩前的状态 |
| `SessionEnd` | 会话终止时 | 否 | 清理、显示 Git 状态 |

### 6.3 Hook 类型

Claude Code 支持三种 Hook 类型：

#### 命令 Hook（`type: "command"`）

最常用，直接执行 Shell 命令：

```json
{
  "type": "command",
  "command": "git status --short || true",
  "timeout": 10
}
```

#### 提示 Hook（`type: "prompt"`）

使用 LLM 评估是否允许操作：

```json
{
  "type": "prompt",
  "prompt": "检查以下操作是否安全: $ARGUMENTS",
  "model": "haiku",
  "timeout": 30
}
```

LLM 返回 `{"ok": true}` 或 `{"ok": false, "reason": "原因"}` 来决定是否允许。

#### 代理 Hook（`type: "agent"`）

生成子代理来验证条件（可使用工具）：

```json
{
  "type": "agent",
  "prompt": "验证所有单元测试通过。运行测试并检查结果。$ARGUMENTS",
  "timeout": 120
}
```

### 6.4 配置示例

#### 完整配置

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "printf '项目: %s\\n分支: %s\\n' \"$(basename $(pwd))\" \"$(git branch --show-current 2>/dev/null)\""
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "git status --short || true"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "printf '文件已写入: %s\\n' \"$CLAUDE_FILE_PATH\"",
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "printf '文件已编辑: %s\\n' \"$CLAUDE_FILE_PATH\"",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "printf 'Git 状态:\\n' && git status --short 2>/dev/null || echo '无 Git 仓库'"
          }
        ]
      }
    ]
  }
}
```

#### PreToolUse 阻止危险操作

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "INPUT=$(cat); CMD=$(echo \"$INPUT\" | jq -r '.tool_input.command // empty'); if echo \"$CMD\" | grep -qE 'rm\\s+-rf|git\\s+reset\\s+--hard|git\\s+push\\s+--force'; then echo '{\"decision\": \"block\", \"reason\": \"危险命令被阻止\"}'; fi"
          }
        ]
      }
    ]
  }
}
```

#### 异步 Hook

对于耗时任务（如测试），可使用异步执行：

```json
{
  "PostToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "command",
          "command": ".claude/hooks/run-tests-async.sh",
          "async": true,
          "timeout": 300
        }
      ]
    }
  ]
}
```

异步 Hook 不会阻塞 Claude 的工作，结果在下一轮对话中返回。

### 6.5 Hook 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | `"command"` / `"prompt"` / `"agent"` |
| `command` | string | command 类型 | 要执行的 Shell 命令 |
| `prompt` | string | prompt/agent | 发送给 LLM 的提示 |
| `matcher` | string | 否 | 工具名匹配（仅 PreToolUse/PostToolUse 等），支持正则，多个工具用竖线分隔如 `"Write\|Edit"` |
| `timeout` | number | 否 | 超时（秒），默认 command=10min, prompt=30s, agent=60s |
| `async` | boolean | 否 | 异步执行（仅 command 类型） |
| `model` | string | 否 | 模型（仅 prompt/agent 类型） |

### 6.6 输入和环境变量

**stdin 输入**：所有 Hook 通过 stdin 接收 JSON 输入，包含 `session_id`、`cwd`、`hook_event_name` 等通用字段，以及事件特定字段（如 `tool_name`、`tool_input`）。

**环境变量**：

| 变量 | 说明 |
|------|------|
| `$CLAUDE_PROJECT_DIR` | 项目根目录 |
| `$CLAUDE_FILE_PATH` | 当前操作的文件路径（PostToolUse Write/Edit 时设置） |
| `$ARGUMENTS` | Hook 输入 JSON 的文本表示（prompt/agent 类型使用） |

**读取 stdin 示例**：

```bash
#!/bin/bash
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
```

### 6.7 安全原则

```bash
# ✅ 安全：只读命令
git status --short || true
pnpm type-check || true
printf '信息: %s\n' "$CLAUDE_FILE_PATH"

# ❌ 危险：修改操作（禁止在 Hook 中使用）
rm -rf dist/
git reset --hard
git push             # 自动推送
```

**关键要点**：
- 使用 `|| true` 防止命令失败阻塞会话
- 使用 `printf` 替代 `echo`（跨平台兼容）
- 设置 `timeout` 防止长时间执行
- 只运行只读命令，不修改文件或仓库状态

### 6.8 调试 Hook

```bash
# 使用 --debug 模式查看 Hook 执行细节
claude --debug

# 输出示例:
# [DEBUG] Executing hooks for PostToolUse:Write
# [DEBUG] Found 1 hook matchers in settings
# [DEBUG] Matched 1 hooks for query "Write"
# [DEBUG] Hook command completed with status 0
```

---

## 7. Settings — 配置管理

### 7.1 配置文件位置

| 文件 | 位置 | 用途 | 共享 |
|------|------|------|------|
| **用户设置** | `~/.claude/settings.json` | 全局个人配置 | 否 |
| **项目设置** | `.claude/settings.json` | 团队共享配置 | 是（Git） |
| **项目个人** | `.claude/settings.local.json` | 个人项目配置 | 否（gitignore） |
| **组织设置** | `/Library/Application Support/ClaudeCode/managed-settings.json` | 企业级配置 | IT 部署 |

**优先级**：组织 > 命令行 > 项目个人 > 项目共享 > 用户全局

### 7.2 权限配置（Permissions）

权限控制 Claude 可以自动执行哪些操作（无需确认）：

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm build:*)",
      "Bash(pnpm test:*)",
      "Bash(pnpm lint:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Read(./.env)"
    ]
  }
}
```

#### 规则语法

| 规则 | 效果 |
|------|------|
| `Bash` | 所有 Bash 命令 |
| `Bash(pnpm test:*)` | 以 `pnpm test:` 开头的命令 |
| `Read(./.env)` | 读取 `.env` 文件 |
| `Edit(src/**)` | 编辑 `src/` 下的文件 |
| `WebFetch(domain:example.com)` | 请求特定域名 |
| `MCP(memory)` | 使用名为 memory 的 MCP 服务器 |
| `WebSearch` | 网页搜索 |

#### 评估顺序

1. **deny 规则**（优先匹配，最高优先级）
2. **ask 规则**（需要确认）
3. **allow 规则**（自动允许）

### 7.3 MCP 服务器配置

MCP（Model Context Protocol）服务器扩展 Claude 的能力，提供外部工具集成。

#### 项目级配置（`.mcp.json`）

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-developer-mcp", "--stdio"],
      "env": {
        "FIGMA_API_KEY": "${FIGMA_API_KEY}"
      }
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    },
    "eslint": {
      "command": "npx",
      "args": ["@eslint/mcp@latest"]
    }
  }
}
```

#### 启用控制（`settings.json`）

```json
{
  "enabledMcpjsonServers": ["figma", "context7", "eslint"]
}
```

#### 常用 MCP 服务器

| 服务器 | NPM 包 | 功能 | 使用场景 |
|--------|--------|------|---------|
| `figma` | `figma-developer-mcp` | Figma 设计稿读取 | 设计稿还原 |
| `context7` | `@upstash/context7-mcp` | 第三方库文档查询 | 获取最新 API |
| `eslint` | `@eslint/mcp@latest` | ESLint 代码检查 | 文件级 lint |
| `playwright` | `@anthropic-ai/mcp-playwright` | 浏览器自动化 | E2E 测试 |
| `memory` | `@anthropic-ai/mcp-memory` | 知识图谱 | 持久化记忆 |

### 7.4 环境变量

在 `settings.json` 的 `env` 字段配置：

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",
    "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "0"
  }
}
```

#### 常用环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | 启用 Agent Team | `"1"` |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | 控制自动记忆 | `"0"` 开启 |
| `ANTHROPIC_MODEL` | 默认模型 | `"claude-sonnet-4-5-20250929"` |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | 最大输出 token | `"32000"` |
| `BASH_DEFAULT_TIMEOUT_MS` | Bash 默认超时 | `"120000"` |
| `MCP_TIMEOUT` | MCP 启动超时 | `"30000"` |

### 7.5 其他配置项

| 配置 | 说明 | 示例 |
|------|------|------|
| `model` | 默认模型 | `"claude-sonnet-4-5-20250929"` |
| `teammateMode` | 团队显示模式 | `"auto"` / `"tmux"` / `"in-process"` |
| `attribution` | 提交/PR 归属标识 | 见下方 |
| `language` | 回复语言 | `"chinese"` |
| `outputStyle` | 输出风格 | `"Explanatory"` |

#### 归属标识配置

```json
{
  "attribution": {
    "commit": "Generated with AI",
    "pr": "Generated with Claude Code"
  }
}
```

### 7.6 完整配置示例

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(pnpm:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "WebSearch"
    ],
    "deny": []
  },
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "enabledMcpjsonServers": ["figma", "context7", "eslint"],
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "printf '项目: %s | 分支: %s\\n' \"$(basename $(pwd))\" \"$(git branch --show-current)\""
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "git status --short || true"
          }
        ]
      }
    ]
  }
}
```

---

## 8. 实战：AIX 组件库配置解析

### 8.1 目录结构

```
.claude/
├── settings.json              # 项目共享配置（Git 管理）
├── settings.local.json        # 个人项目配置（gitignore）
├── agents/                    # 专业子代理（10 个）
│   ├── component-design.md    # 组件设计
│   ├── coding-standards.md    # 编码规范
│   ├── project-structure.md   # 项目结构
│   ├── testing.md             # 测试策略
│   ├── storybook-development.md  # Storybook
│   ├── npm-publishing.md      # npm 发布
│   ├── accessibility.md       # 无障碍
│   ├── performance.md         # 性能优化
│   ├── code-review.md         # 代码审查
│   └── figma-extraction-guide.md  # Figma 提取
├── commands/                  # 快速清单（6 个）
│   ├── component.md           # /component
│   ├── story.md               # /story
│   ├── test.md                # /test
│   ├── release.md             # /release
│   ├── monorepo.md            # /monorepo
│   └── review-pr.md           # /review-pr
└── skills/                    # 代码生成器（9 个）
    ├── package-creator/       # 创建组件包
    ├── component-generator/   # 生成组件
    ├── figma-to-component/    # Figma 转组件
    ├── story-generator/       # 生成 Story
    ├── docs-generator/        # 生成文档
    ├── test-generator/        # 生成测试
    ├── coverage-analyzer/     # 覆盖率分析
    ├── code-optimizer/        # 代码优化
    └── a11y-checker/          # 无障碍检查
```

### 8.2 Hooks 配置

AIX 项目配置了四个 Hook：

```
┌────────────────────┬─────────────────────────────────────────┐
│ SessionStart       │ 显示包数量、分支、未提交文件、快速命令    │
│ UserPromptSubmit   │ 显示 git status（了解当前改动）          │
│ PostToolUse(Write) │ 确认文件写入路径                         │
│ SessionEnd         │ 显示 Git 状态提醒                        │
└────────────────────┴─────────────────────────────────────────┘
```

### 8.3 权限配置

```
允许自动执行的命令:
├── pnpm dev/build/lint/type-check/test/...  (开发构建)
├── npx tsc/vue-tsc                          (类型检查)
├── turbo                                    (任务编排)
└── git status/diff/log/add/commit/push/...  (Git 操作)
```

### 8.4 MCP 服务器

```
figma    → Figma 设计稿读取（需要 FIGMA_API_KEY）
context7 → 第三方库文档查询（无需配置）
eslint   → ESLint 代码检查（无需配置）
```

---

## 9. 最佳实践

### 9.1 新项目配置清单

```bash
# 1. 初始化 CLAUDE.md
claude
> /init

# 2. 配置 settings.json（权限 + Hooks）
vim .claude/settings.json

# 3. 创建核心 Agent（编码规范、组件设计）
vim .claude/agents/coding-standards.md
vim .claude/agents/component-design.md

# 4. 创建常用 Command（开发清单、测试清单）
vim .claude/commands/dev.md
vim .claude/commands/test.md

# 5. 创建高频 Skill（组件生成器、测试生成器）
mkdir -p .claude/skills/component-generator
vim .claude/skills/component-generator/SKILL.md

# 6. 配置 MCP 服务器（按需）
vim .mcp.json
```

### 9.2 选择合适的定制方式

| 需求 | 推荐方式 | 原因 |
|------|---------|------|
| 约束 Claude 的行为 | CLAUDE.md | 自动加载，始终生效 |
| 查看规范清单 | Command | 轻量，手动触发 |
| 生成代码文件 | Skill | 自动化，可复用 |
| 深度规范咨询 | Agent | 专业知识，上下文隔离 |
| 自动执行检查 | Hook | 事件驱动，确定性 |
| 控制权限 | Settings | 安全边界 |

### 9.3 避免的反模式

| 反模式 | 问题 | 正确做法 |
|--------|------|---------|
| CLAUDE.md 过长 | 上下文污染 | 拆分到 rules/ 或 Agent |
| 所有规范写在 CLAUDE.md | 难以维护 | 规范放 Agent，CLAUDE.md 只放关键指令 |
| Hook 执行修改操作 | 不可控 | Hook 只做只读操作 |
| Skill 和 Agent 混淆 | 职责不清 | Skill 生成代码，Agent 提供指导 |
| 权限全开 | 安全风险 | 最小权限原则，按需开放 |

### 9.4 团队协作建议

```
可以提交到 Git（团队共享）:
├── CLAUDE.md                    # 项目规范
├── .claude/settings.json        # 共享配置
├── .claude/agents/*.md          # Agent 文档
├── .claude/commands/*.md        # Command 清单
├── .claude/skills/*/SKILL.md    # Skill 定义
└── .mcp.json                    # MCP 配置

不提交到 Git（个人使用）:
├── CLAUDE.local.md              # 个人项目偏好
├── .claude/settings.local.json  # 个人权限/MCP
└── .env                         # 环境变量（API Key 等）
```

---

## 10. 常见问题

### Q1: Agent 和 Skill 有什么区别？

**Agent** 提供专业领域的指导和知识（如"组件 Props 怎么定义"），**Skill** 直接生成代码文件（如"帮我生成一个 Button 组件"）。Agent 是顾问，Skill 是工具。

### Q2: Command 和 Skill 有什么区别？

**Command** 只显示文本提示/清单（如 `/component` 显示组件开发检查清单），**Skill** 会执行操作并生成代码文件（如 `/component-generator` 生成组件代码）。

### Q3: Hook 可以阻止 Claude 执行某些操作吗？

可以。`PreToolUse` Hook 可以返回 `{"decision": "block", "reason": "原因"}` 来阻止工具调用。`prompt` 和 `agent` 类型的 Hook 也可以通过返回 `{"ok": false, "reason": "原因"}` 来阻止。

### Q4: CLAUDE.md 太长怎么办？

三种方式：
1. 使用 `.claude/rules/` 拆分为模块化规则文件
2. 使用 `@path/to/file` 导入外部文件
3. 将详细规范移到 Agent 文档中，CLAUDE.md 只保留关键指令

### Q5: 如何调试 Hook？

使用 `claude --debug` 启动，可以看到 Hook 的匹配、执行和输出详情。也可以在会话中使用 `Ctrl+O` 切换详细模式。

### Q6: MCP 服务器无法连接怎么办？

1. 检查 `.mcp.json` 配置是否正确
2. 确认 `settings.json` 中 `enabledMcpjsonServers` 包含该服务器
3. 检查环境变量（如 `FIGMA_API_KEY`）是否设置
4. 设置 `MCP_TIMEOUT` 环境变量增加超时时间

### Q7: 如何让 Claude 记住我的偏好？

三种方式：
1. 直接告诉 Claude："记住我们使用 pnpm"（自动记忆）
2. 编辑 `~/.claude/CLAUDE.md`（全局偏好）
3. 编辑 `CLAUDE.local.md`（项目偏好）

### Q8: 如何查看当前加载的记忆文件？

在 Claude Code 会话中输入 `/memory`，可以查看和编辑所有加载的记忆文件。

---

## 附录

### A. 配置文件速查表

```
~/.claude/
├── CLAUDE.md                  # 用户全局记忆
├── settings.json              # 用户全局设置
├── rules/*.md                 # 用户全局规则
└── projects/<project>/
    └── memory/
        ├── MEMORY.md          # 自动记忆索引
        └── *.md               # 自动记忆主题文件

<project>/
├── CLAUDE.md                  # 项目共享记忆
├── CLAUDE.local.md            # 项目个人记忆（gitignore）
├── .mcp.json                  # MCP 服务器配置
└── .claude/
    ├── CLAUDE.md              # 项目共享记忆（替代位置）
    ├── settings.json          # 项目共享设置
    ├── settings.local.json    # 项目个人设置（gitignore）
    ├── rules/*.md             # 项目规则（支持 paths 限定）
    ├── agents/*.md            # Agent 子代理文档
    ├── commands/*.md          # Command 快速清单
    └── skills/*/SKILL.md      # Skill 代码生成器
```

### B. 相关资源

**官方文档**：
- [Claude Code 总览](https://docs.anthropic.com/en/docs/claude-code/overview)
- [CLAUDE.md 记忆管理](https://code.claude.com/docs/en/memory)
- [自定义子代理（Agents）](https://code.claude.com/docs/en/sub-agents)
- [Skills 扩展能力](https://code.claude.com/docs/en/skills)
- [Hooks 参考](https://code.claude.com/docs/en/hooks)
- [Hooks 自动化指南](https://docs.anthropic.com/en/docs/claude-code/hooks-guide)
- [斜杠命令（Commands）](https://code.claude.com/docs/en/slash-commands)
- [Settings 配置](https://code.claude.com/docs/en/settings)
- [MCP 工具集成](https://docs.anthropic.com/en/docs/claude-code/mcp)

**项目资源**：
- [Claude Code GitHub](https://github.com/anthropics/claude-code)
- [Skills 开源仓库](https://github.com/anthropics/skills)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [Agent Team 使用指南](./agent-team) - 分布式并行协作功能

---

**最后更新**: 2026-02-14
**版本**: 1.0.0
**维护者**: AIX 组件库团队
