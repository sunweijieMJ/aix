# @kit/sentinel

AI 自动修复 Workflow 安装工具 —— 将 AI sentinel CI pipelines 安装到业务仓库，实现「发现问题 → AI 分析修复 → 创建 PR → 人工审核合并」的自动化闭环。

## 特性

- **4 阶段渐进式安装** - 从 Issue 标签触发到全自动化巡检，按需接入
- **平台适配层** - 当前支持 GitHub Actions，架构可扩展至 GitLab CI / Jenkins
- **幂等安装** - 重复执行不会产生重复文件或标签
- **干跑模式** - `--dry-run` 预览所有变更，不实际写入
- **CLAUDE.md 注入** - 自动向目标仓库注入修复规范（最小改动、文件权限控制）
- **Secrets 检查** - 安装后自动校验所需的 Secrets/Variables 是否已配置
- **编程 API** - 除 CLI 外还提供完整的 Node.js API，可集成到其他工具中

---

## 安装阶段

通过交互式向导选择需要安装的阶段组合，例如只安装 Phase 1 + 4。

使用 `--yes` 跳过向导时，默认安装 Phase 1（MVP）。

| Phase | 名称 | 触发方式 | 说明 |
|-------|------|---------|------|
| **1** | Issue 标签触发 | Issue 打 `sentinel` 标签 | MVP，手动触发 AI 修复 |
| **2** | 部署后冒烟测试 | 部署 workflow 成功后 | E2E 失败自动修复 |
| **3** | Sentry 错误联动 | 线上错误超阈值 | 生产异常自动创建修复 PR |
| **4** | 定时质量巡检 | 工作日 Cron 定时 | lint / type-check / test / audit |

---

## 快速开始

### 1. 安装依赖

Monorepo 内已配置，无需额外安装。独立使用时：

```bash
pnpm add -D @kit/sentinel
```

### 2. 安装 Workflows

```bash
# 交互式安装（推荐）—— 向导会引导选择阶段、包管理器、路径等配置
npx sentinel install --target /path/to/repo

# 非交互模式 —— 使用默认配置安装 Phase 1
npx sentinel install --target /path/to/repo --yes

# 干跑模式（预览变更，不写入文件）
npx sentinel install --target /path/to/repo --dry-run
```

> 交互式向导支持选择阶段组合、包管理器、允许路径、Reviewers 等全部配置。
> 需要完全可编程的控制请使用[编程 API](#编程-api)。

### 3. 配置 Secrets

安装完成后，根据提示在 GitHub 仓库中配置所需的 Secrets 和 Variables：

| 名称 | 类型 | 阶段 | 说明 |
|------|------|------|------|
| `ANTHROPIC_API_KEY` | Secret | 1-4 | Claude API 密钥 |
| `SENTINEL_PAT` | Secret | 3 | GitHub PAT（用于创建 Issue） |
| `SENTINEL_ENABLED` | Variable | 1-4 | 总开关，设为 `false` 可关闭 |
| `SENTINEL_REVIEWERS` | Variable | 3 | PR 审查者（逗号分隔） |

### 4. 验证安装

```bash
npx sentinel check --target /path/to/repo
```

---

## CLI 命令

### `sentinel install`

安装 sentinel workflows 到目标仓库。默认启动交互式向导，通过 `--yes` 可跳过向导使用默认配置（Phase 1）。

```bash
sentinel install [options]
```

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--target <path>` | 目标仓库目录 | 当前目录 |
| `-y, --yes` | 跳过交互向导，使用默认配置安装 Phase 1 | `false` |
| `--dry-run` | 预览模式，不写入文件 | `false` |

**交互式向导中可配置的选项：**

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| 安装阶段 | 多选 Phase 1-4 | Phase 1 |
| CI 平台 | 当前支持 github | `github` |
| 包管理器 | pnpm / npm / yarn | `pnpm` |
| Node.js 版本 | Workflow 中的 Node.js 版本 | `20` |
| 允许路径 | AI 允许修改的文件路径模式（bash regex） | `^src/` |
| Reviewers | PR 审查者（逗号分隔） | - |
| 部署 workflow | Phase 2 触发条件 | `Deploy Production` |
| 冒烟测试命令 | Phase 2 测试命令 | `pnpm test:smoke` |
| Owner / Repo | Phase 3 仓库信息（自动从 git remote 读取） | - |
| Cron 表达式 | Phase 4 定时触发 | `0 3 * * 1` |
| 检查项 | Phase 4 检查项目 | lint, typecheck, test, audit |
| Claude 模型 | 高级选项 | `claude-sonnet-4-6` |
| 最大轮次 | 高级选项 | `30` |
| PR 每日上限 | 高级选项 | `10` |

### `sentinel check`

检查目标仓库的 sentinel 安装状态。

```bash
sentinel check [options]
```

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--target <path>` | 目标仓库目录 | 当前目录 |
| `--platform <name>` | CI 平台 | `github` |

### `sentinel uninstall`

移除已安装的 sentinel workflows。

```bash
sentinel uninstall [options]
```

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--target <path>` | 目标仓库目录 | 当前目录 |
| `--platform <name>` | CI 平台 | `github` |
| `--yes` | 跳过确认 | `false` |

---

## 编程 API

```typescript
import {
  // 核心函数
  install,
  checkSecrets,
  validateEnvironment,

  // 类型
  type InstallConfig,
  type InstallResult,
  type Phase,
  type Platform,
  type PhaseConfig,

  // 常量
  PHASE_CONFIGS,
  VALID_PLATFORMS,

  // 平台适配器
  type PlatformAdapter,
  createPlatformAdapter,
  GitHubAdapter,

  // 工具
  renderTemplate,
} from '@kit/sentinel';

// 示例：安装 Phase 1 + 2
const result = await install({
  phases: [1, 2],
  target: '/path/to/repo',
  platform: 'github',
  yes: true,
  dryRun: false,
  nodeVersion: '20',
  packageManager: 'pnpm',
  deployWorkflow: 'Deploy Production',
  reviewers: 'alice,bob',
});

// 示例：选择性安装 + 自定义路径（Monorepo）
const monoResult = await install({
  phases: [1, 4],
  target: '/path/to/monorepo',
  platform: 'github',
  yes: true,
  dryRun: false,
  nodeVersion: '22',
  packageManager: 'pnpm',
  allowedPaths: ['^packages/.*/src/', '^internal/.*/src/'],
});

console.log('安装的 Workflows:', result.workflows);
console.log('创建的 Labels:', result.labels);
console.log('CLAUDE.md 已更新:', result.claudeMdPatched);
console.log('Secrets 检查:', result.secretsOk ? '通过' : '缺失');
```

---

## 各阶段工作流程

### Phase 1: Issue 标签触发

```
开发者在 Issue 上打 `sentinel` 标签
  → GitHub Actions 触发
  → 检查每日 PR 限额（≤10）
  → Claude Code 分析 Issue 描述，修复代码
  → 仅允许修改 --allowed-paths 指定的目录
  → 创建 PR，在 Issue 中回复链接
```

### Phase 2: 部署后冒烟测试

```
部署 Workflow 成功
  → 自动运行 E2E 冒烟测试
  → 测试失败 → Claude Code 分析失败原因并修复
  → 创建带 `urgent` 标签的 PR
  → 自动指派 Reviewers
```

### Phase 3: Sentry 错误联动

```
线上错误 → Sentry Webhook → Cloudflare Worker
  → 错误去重（24h TTL，KV 存储）
  → 获取 resolved stacktrace
  → GitHub repository_dispatch 事件
  → Claude Code 分析堆栈并修复
  → 创建带 `sentry` 标签的 PR
```

> Phase 3 需额外部署 Cloudflare Worker，详见 `templates/worker/sentry-webhook.ts`

### Phase 4: 定时质量巡检

```
工作日 Cron 定时触发
  → 依次运行: lint → type-check → test → audit
  → 发现问题 → Claude Code 自动修复
  → 创建带 `maintenance` 标签的 PR
```

---

## 安全机制

| 机制 | 说明 |
|------|------|
| **AI 修，人审核** | AI 只创建 PR，合并权始终在人 |
| **最小改动原则** | 只改必要代码，不做额外重构 |
| **文件权限控制** | 仅允许修改 `--allowed-paths` 指定的目录（默认 `src/`），禁止修改测试、配置、CI 文件 |
| **每日 PR 限额** | 每天最多创建 10 个 sentinel PR |
| **总开关** | `SENTINEL_ENABLED` 变量设为 `false` 即可全局关闭 |
| **Sentry 去重** | 相同错误 24 小时内不重复触发 |
| **执行超时** | 单次修复最长 30 分钟 |

---

## 架构

```
src/
├── cli.ts                    # CLI 入口 (Commander)
├── index.ts                  # 编程 API 导出
├── types/
│   ├── config.ts             # 类型定义 & Phase 配置常量
│   └── index.ts              # 类型重导出
├── core/
│   ├── installer.ts          # 安装编排主流程
│   ├── validator.ts          # 环境预检（Git 仓库、CLI 工具）
│   ├── workflow-writer.ts    # 模板渲染 & 文件写入
│   ├── label-creator.ts      # GitHub Label 创建（去重）
│   ├── secrets-checker.ts    # Secrets/Variables 校验
│   └── claude-md-patcher.ts  # CLAUDE.md 规范注入（幂等）
├── platform/
│   ├── types.ts              # PlatformAdapter 接口
│   ├── github-adapter.ts     # GitHub Actions 实现
│   └── index.ts              # 适配器工厂
├── cli/
│   ├── prompts.ts            # 交互式安装向导（inquirer）
│   ├── preview.ts            # 安装配置预览面板
│   └── commands/
│       ├── install.ts        # sentinel install
│       ├── check.ts          # sentinel check
│       └── uninstall.ts      # sentinel uninstall
└── utils/
    ├── logger.ts             # 彩色日志输出
    ├── template.ts           # __KEY__ 模板变量替换
    ├── file.ts               # 文件 I/O & 模板加载
    ├── git.ts                # Git 操作（isGitRepo, getDefaultBranch, parseGitRemote）
    └── package-manager.ts    # 包管理器命令生成（pnpm/npm/yarn）

templates/
├── github/                   # GitHub Actions Workflow 模板
│   ├── sentinel-issue.yml
│   ├── sentinel-post-deploy.yml
│   ├── sentinel-sentry.yml
│   └── sentinel-scheduled.yml
├── claude-md/
│   └── sentinel-rules.md     # 注入到目标 CLAUDE.md 的修复规范
└── worker/
    └── sentry-webhook.ts     # Cloudflare Worker（Sentry → GitHub）
```

---

## 开发

```bash
# 开发模式（交互式向导）
pnpm dev install --target /tmp/test-repo

# 开发模式（非交互 + 干跑）
pnpm dev install --target /tmp/test-repo --yes --dry-run

# 构建
pnpm build

# 单元测试
pnpm test

# 代码检查
pnpm lint
```

---

## 设计文档

详细设计方案参见 [RFC: AI 自动修复系统](../../docs/rfcs/sentinel-design-draft.md)
