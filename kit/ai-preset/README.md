# @kit/ai-preset

跨 AI 平台的编码规范管理工具。一次配置，同步生成 Claude / Cursor / Copilot / Codex / Windsurf / Trae / 通义灵码的规则文件。

## 特性

- **7 平台支持** - Claude Code / Cursor / Copilot / Codex / Windsurf / Trae / 通义灵码一键同步
- **三层预设体系** - base（通用）+ framework（框架）+ domain（领域）自由组合
- **文件生命周期** - managed / modified / ejected 三态管理，支持 eject 和 restore
- **非交互模式** - 支持 `--yes` 参数，CI 环境友好
- **增量升级** - `upgrade` 命令自动检测变更，已修改文件提示确认

## 快速开始

```bash
# 直接使用（推荐）
npx @kit/ai-preset init

# 或全局安装
npm install -g @kit/ai-preset
ai-preset init

# 非交互模式（CI 友好）
npx @kit/ai-preset init --platform claude,cursor --framework vue3 --domain component-lib --yes
```

## 核心概念

### 三层预设体系

```
presets/
├── base/          通用基础规则（编码规范、Git、测试、Code Review...）
├── frameworks/    框架规则（Vue 3 / React / Node.js）
└── domains/       领域规则（组件库 / 中后台 / 移动端 / API 服务 / Monorepo / 设计稿还原...）
```

`init` 时选择框架和领域，工具自动组合 **base + framework + domains** 生成完整规则集。

### 多平台适配

| 平台 | 输出格式 |
|------|---------|
| Claude Code | `CLAUDE.md` + `.claude/agents/*.md` |
| Cursor | `.cursor/rules/*.mdc` |
| Windsurf | `.windsurf/rules/*.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| OpenAI Codex | `AGENTS.md` |
| Trae (字节) | `.trae/rules/*.md` |
| 通义灵码 (阿里) | `.lingma/rules/*.md` |

### 文件生命周期

```
managed  →  用户修改  →  modified  →  ai-preset eject  →  ejected
   ↑                                                         │
   └──── ai-preset restore ──────────────────────────────────┘
```

- **managed**: 由工具管理，`upgrade` 时自动更新
- **modified**: 用户手动编辑过，`upgrade` 时会提示确认
- **ejected**: 退出自动管理，`upgrade` 时跳过

## CLI 命令

| 命令 | 说明 |
|------|------|
| `ai-preset init` | 交互式初始化 |
| `ai-preset upgrade` | 升级预设到最新版本 |
| `ai-preset upgrade --rollback` | 从备份恢复上次升级前的状态 |
| `ai-preset add --domain <name>` | 追加领域模块 |
| `ai-preset remove --domain <name>` | 移除领域模块 |
| `ai-preset diff [file]` | 查看本地修改与预设的差异 |
| `ai-preset eject <file>` | 将文件标记为 ejected |
| `ai-preset restore <file>` | 恢复文件为预设版本 |
| `ai-preset list` | 查看已安装的预设和文件状态 |
| `ai-preset doctor` | 健康检查 |

## 模板变量

预设文件支持 Handlebars 模板语法：

```markdown
## 样式规范

所有组件使用 `.{{componentPrefix}}-` 作为 CSS 类名前缀。
```

`init` 时通过交互式问答或 `--prefix` 参数设置变量值。

### 条件渲染

```markdown
{{#if_platform "claude"}}
仅在 Claude 平台生效的内容。
{{/if_platform}}

{{#if_framework "vue3"}}
仅在 Vue 3 项目生效的内容。
{{/if_framework}}
```

## 自定义规则

在 `.ai-preset/config.json` 中配置 `include` 字段，追加项目私有规则：

```json
{
  "include": ["rules/my-custom-rule.md"],
  "exclude": ["base/api-development"]
}
```

自定义规则文件使用标准 frontmatter 格式：

```markdown
---
id: custom/my-rule
title: 自定义规则
description: 项目专属编码规范
layer: domain
priority: 300
platforms: []
tags: [custom]
version: "1.0.0"
---

规则正文内容...
```

## 编程式 API

```typescript
import {
  loadRuleSources,
  resolvePresetNames,
  createAdapter,
  renderTemplate,
} from '@kit/ai-preset';
```

所有核心模块、类型和适配器均通过 `index.ts` 统一导出。

## 项目结构

```
src/
├── core/           核心引擎
│   ├── resolver.ts   预设加载、排序、合并
│   ├── template.ts   Handlebars 模板渲染
│   ├── writer.ts     文件写入（标记区域替换）
│   ├── lock.ts       文件状态追踪 (SHA-256)
│   ├── config.ts     配置持久化
│   ├── detector.ts   AI 平台自动检测
│   └── backup.ts     升级备份与恢复
├── adapters/       平台适配器（7 个）
├── commands/       CLI 命令（9 个）
├── utils/          工具函数
├── cli.ts          CLI 入口
├── index.ts        编程式 API 入口
└── types.ts        类型定义与常量
```

## 开发

```bash
pnpm test          # 运行测试
pnpm build         # 构建
pnpm dev           # 开发模式运行 CLI
```
