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
| **2** | 部署后冒烟测试 | `workflow_dispatch`（手动/API） | 提供部署 URL，冒烟测试失败自动修复 |
| **3** | Sentry 错误联动 | 线上错误超阈值 | 生产异常自动创建修复 PR |
| **4** | 定时质量巡检 | 工作日 Cron 定时 | lint / type-check / test |

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

| 名称 | 类型 | 阶段 | 必须 | 说明 |
|------|------|------|------|------|
| `ANTHROPIC_API_KEY` | Secret | 1-4 | 是 | Claude API 密钥 |
| `SENTINEL_PAT` | Secret | 1-4 | 是 | GitHub PAT（需 `contents:write` 权限，用于推送分支。使用 PAT 确保推送后 CI 自动触发，`GITHUB_TOKEN` 推送的提交不触发 workflow） |
| `ANTHROPIC_BASE_URL` | Secret | 1-4 | 否 | 自定义 API 端点（代理 / 私有部署时使用） |
| `SENTINEL_ENABLED` | Variable | 1-4 | 否 | 总开关，设为 `false` 可全局关闭 |
| `SENTINEL_REVIEWERS` | Variable | 3 | 否 | PR 审查者（逗号分隔） |

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
| Node.js 版本 | Workflow 中的 Node.js 版本 | `22` |
| 允许路径 | AI 允许修改的文件路径模式（bash regex） | `^src/` |
| Reviewers | PR 审查者（逗号分隔） | - |
| 部署 URL | Phase 2 待测试的部署环境 URL | 必填（`workflow_dispatch` 输入） |
| 冒烟测试命令 | Phase 2 测试命令 | `pnpm test:smoke` |
| Owner / Repo | Phase 3 仓库信息（自动从 git remote 读取） | - |
| Cron 表达式 | Phase 4 定时触发 | `0 18 * * 5` |
| 检查项 | Phase 4 检查项目 | lint, typecheck, test |
| 自定义检查命令 | Phase 4 可覆盖每项检查的执行命令 | `<pm> run lint` 等 |
| Claude 模型 | 高级选项 | `claude-sonnet-4-6` |
| 最大轮次 | 高级选项 | `20` |
| PR 每日上限 | 高级选项 | `5` |

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
  type Phase,          // 1 | 2 | 3 | 4
  type Platform,       // 'github'
  type PackageManager, // 'pnpm' | 'npm' | 'yarn'
  type ScheduledCheck, // 'lint' | 'typecheck' | 'test'
  type PhaseConfig,

  // 常量
  PHASE_CONFIGS,
  VALID_PLATFORMS,
  DEFAULT_PACKAGE_MANAGER,  // 'pnpm'
  DEFAULT_MODEL,            // 'claude-sonnet-4-6'
  DEFAULT_MAX_TURNS,        // 20
  DEFAULT_PR_DAILY_LIMIT,   // 5
  DEFAULT_CRON,             // '0 18 * * 5'
  DEFAULT_SMOKE_TEST_CMD,   // 'pnpm test:smoke'
  ALL_SCHEDULED_CHECKS,     // ['lint', 'typecheck', 'test']

  // 平台适配器
  type PlatformAdapter,
  createPlatformAdapter,
  GitHubAdapter,

  // 工具
  renderTemplate,
  parseGitRemote,
} from '@kit/sentinel';

// 示例：安装 Phase 1 + 2
const result = await install({
  phases: [1, 2],
  target: '/path/to/repo',
  platform: 'github',
  yes: true,
  dryRun: false,
  nodeVersion: '22',
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

console.log('输出的文件:', result.outputFiles);
console.log('创建的 Labels:', result.labels);
console.log('CLAUDE.md 已更新:', result.claudeMdPatched);
console.log('Secrets 检查:', result.secretsOk ? '通过' : '缺失');
```

### InstallConfig 完整参考

| 字段 | 类型 | 必须 | 默认值 | 说明 |
|------|------|------|--------|------|
| `phases` | `Phase[]` | 是 | - | 选择安装的阶段列表 (`[1]`, `[1,4]` 等) |
| `target` | `string` | 是 | - | 目标仓库目录绝对路径 |
| `yes` | `boolean` | 是 | - | 跳过交互确认 |
| `dryRun` | `boolean` | 是 | `false` | 干跑模式，不实际写入文件 |
| `platform` | `Platform` | 是 | `'github'` | CI 平台 |
| `nodeVersion` | `string` | 是 | `'22'` | Workflow 中使用的 Node.js 版本 |
| `packageManager` | `PackageManager` | 是 | `'pnpm'` | 包管理器（自动检测 lockfile） |
| `allowedPaths` | `string[]` | 否 | `['^src/']` | AI 允许修改的文件路径模式（bash regex） |
| `reviewers` | `string` | 否 | - | PR 审查者（逗号分隔） |
| `deployWorkflow` | `string` | 否 | `'Deploy Production'` | Phase 2: 部署 workflow 名称（预留字段，当前模板未使用） |
| `smokeTestCmd` | `string` | 否 | `'pnpm test:smoke'` | Phase 2: 冒烟测试命令 |
| `owner` | `string` | 否 | 自动读取 git remote | Phase 3: 仓库 owner |
| `repo` | `string` | 否 | 自动读取 git remote | Phase 3: 仓库名称 |
| `cronExpression` | `string` | 否 | `'0 18 * * 5'` | Phase 4: Cron 定时表达式 |
| `checks` | `ScheduledCheck[]` | 否 | `['lint','typecheck','test']` | Phase 4: 定时检查项 |
| `customCommands` | `Record<string, string>` | 否 | - | Phase 4: 自定义检查命令（key 为检查项名） |
| `model` | `string` | 否 | `'claude-sonnet-4-6'` | Claude 模型 |
| `maxTurns` | `number` | 否 | `20` | Claude 最大轮次 |
| `prDailyLimit` | `number` | 否 | `5` | 每日 PR 创建上限 |

### InstallResult 返回值

| 字段 | 类型 | 说明 |
|------|------|------|
| `outputFiles` | `string[]` | 已输出的文件路径列表（workflow + worker 等） |
| `labels` | `string[]` | 已创建的 GitHub labels |
| `claudeMdPatched` | `boolean` | 是否修改了目标仓库的 CLAUDE.md |
| `secretsOk` | `boolean` | Secrets/Variables 检查是否通过 |

---

## 各阶段工作流程

### Phase 1: Issue 标签触发

```
开发者在 Issue 上打 `sentinel` 标签
  → 检查每日 PR 限额
  → 评论 Issue（开始修复）
  → 截断 Issue body（≤5000 字符）
  → 创建修复分支
  → Claude Code 分析 Issue 并修改代码
  → 仅 git add 白名单目录下的文件
  → 类型检查 + Lint 验证
  → 文件白名单硬校验（非法修改则清理分支）
  → 使用 SENTINEL_PAT 推送分支
  → 创建 PR（关联 Issue，Closes #N）
  → 评论 Issue（PR 链接 / 无修改 / 执行失败）
```

### Phase 2: 部署后冒烟测试

```
手动触发 / API 调用（提供部署 URL）
  → 检查每日 PR 限额
  → 安装 Playwright 浏览器
  → 运行冒烟测试
  → 测试失败 → Claude Code 分析失败原因并修复
  → 类型检查 + Lint 验证
  → 文件白名单硬校验
  → 创建带 `sentinel,post-deploy,urgent` 标签的 PR
  → 修复失败时创建紧急 Issue
```

### Phase 3: Sentry 错误联动

```
线上错误 → Sentry Webhook → Cloudflare Worker
  → HMAC-SHA256 签名验证
  → KV 去重（24h TTL）
  → 获取 resolved stacktrace（source-mapped）
  → GitHub repository_dispatch 事件
  → 检查每日 PR 限额 + 重复 PR 检查
  → 堆栈信息为空 → 创建分析 Issue，跳过修复
  → Claude Code 分析堆栈并修复
  → 类型检查 + Lint 验证
  → 文件白名单硬校验
  → 创建带 `sentinel,sentry` 标签的 PR
  → 修复失败时创建 Issue
```

> Phase 3 需额外部署 Cloudflare Worker 并配置 Sentry Integration，详见下方 [Phase 3 部署指南](#phase-3-部署指南)

### Phase 4: 定时质量巡检

```
Cron 定时触发 / 手动触发（可选择检查项）
  → 依次运行检查项: lint → type-check → test
  → 发现问题 → 汇总报告
  → Claude Code 分析报告并修复
  → 类型检查 + Lint + 测试验证
  → 文件白名单硬校验
  → 创建带 `sentinel,maintenance` 标签的 PR
  → 修复失败时创建 Issue
```

---

## Phase 3 部署指南

Phase 3（Sentry 错误联动）需要部署 Cloudflare Worker 作为中间层，将 Sentry 告警转发到 GitHub Actions。安装器会自动生成 `workers/sentry-webhook.ts` 和 `workers/wrangler.toml`，但还需要手动完成以下三步。

### 步骤一：部署 Cloudflare Worker

```bash
# 1. 安装 Wrangler CLI
npm install -g wrangler

# 2. 登录 Cloudflare
wrangler login

# 3. 创建 KV namespace（用于错误去重，24h TTL）
#    若已存在可跳过，用 wrangler kv namespace list 查看
wrangler kv namespace create SENTRY_DEDUP

# 4. 将返回的 KV namespace ID 填入 workers/wrangler.toml 的 id 字段
#    例如: id = "6364696df27f49a0b0e4e55886e7d3ba"

# 5. 进入 workers/ 目录
cd workers

# 6. 配置 Worker Secrets（首次会提示创建 Worker，选 Yes）
wrangler secret put SENTRY_CLIENT_SECRET  # Sentry Integration 的 Client Secret
wrangler secret put SENTRY_AUTH_TOKEN      # Sentry Integration 的 Token
wrangler secret put GITHUB_PAT             # GitHub PAT（需 repo 权限）

# 7. 部署 Worker
#    首次部署会提示注册 workers.dev 子域名，选 Yes 并输入子域名
wrangler deploy
```

> 部署完成后 Worker 地址为: `https://sentry-webhook.<子域名>.workers.dev`
>
> **注意**: `GITHUB_PAT` 必须使用 Personal Access Token，不能使用 `GITHUB_TOKEN`。因为 `GITHUB_TOKEN` 触发的 `repository_dispatch` 事件不会启动 Workflows。参见 [GitHub 文档](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#triggering-a-workflow-from-a-workflow)。

### 步骤二：创建 Sentry Internal Integration

1. 进入 **Sentry → Settings → Developer Settings**
2. 点击 **Create New Integration → Internal Integration**
3. 配置如下：

| 字段 | 值 |
|------|-----|
| Name | 自定义（如 `Sentinel Webhook`） |
| Webhook URL | 步骤一部署的 Worker 地址 |

4. **Permissions（权限）**：

| 资源 | 权限 |
|------|------|
| Issue & Event | Read |
| Project | Read |
| 其他 | No Access |

5. **Webhooks（事件订阅）**：勾选 `issue`
6. 保存后获取 **Client Secret** 和 **Token**

> 这两个值对应步骤一中 `wrangler secret put` 的 `SENTRY_CLIENT_SECRET` 和 `SENTRY_AUTH_TOKEN`。如果步骤一中填入了错误的值，重新执行 `wrangler secret put` 覆盖即可。

### 步骤三：配置 Sentry Alert Rule

1. 进入 Sentry 项目 → **Alerts → Create Alert Rule**
2. Alert 类型选择 **Issues**
3. 配置触发条件，例如：
   - **When**: An event is captured by Sentry
   - **Then**: A new issue is created
4. **Actions**: Send a notification via `<你的 Integration 名称>`
5. 保存 Alert Rule

### 验证

```bash
# 1. 在终端启动 Worker 日志监控
cd workers
wrangler tail

# 2. 在 Sentry Alert Rule 页面点击 "Send Test Notification"

# 3. 检查 wrangler tail 输出，确认收到请求

# 4. 检查 GitHub 仓库的 Actions 页面，确认触发了 sentry-issue workflow
```

---

## 安全机制

| 机制 | 说明 |
|------|------|
| **AI 修，人审核** | AI 只创建 PR，合并权始终在人 |
| **最小改动原则** | 只改必要代码，不做额外重构 |
| **文件权限控制** | 仅允许修改 `--allowed-paths` 指定的目录（默认 `src/`），禁止修改测试、配置、CI 文件 |
| **文件白名单硬校验** | 每次修复后用 git diff 校验修改文件是否在白名单内，违规则清理分支、拒绝创建 PR |
| **修复后验证** | Claude 修改完成后自动运行 type-check + lint（Phase 4 还会运行 test），验证不通过则不创建 PR |
| **仅 add 白名单文件** | `git add` 只添加白名单目录下的文件，即使 Claude 修改了其他文件也不会被提交 |
| **每日 PR 限额** | 每天最多创建 N 个 sentinel PR（默认 5，各阶段独立计数） |
| **重复 PR 检查** | Phase 3 创建 PR 前检查是否已有同一 Sentry 错误的开放 PR |
| **总开关** | `SENTINEL_ENABLED` 变量设为 `false` 即可全局关闭 |
| **Sentry 去重** | 相同错误 24 小时内不重复触发（Worker KV 存储） |
| **Sentry 签名验证** | Worker 使用 HMAC-SHA256 验证 Sentry webhook 签名 |
| **Claude 工具限制** | Claude 仅允许使用 `Edit,Write,Read,Glob,Grep` 工具，禁止执行任意命令 |
| **执行超时** | Phase 1/3: 30 分钟，Phase 2: 45 分钟，Phase 4: 60 分钟 |

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
    ├── sentry-webhook.ts     # Cloudflare Worker（Sentry → GitHub）
    └── wrangler.toml         # Wrangler 配置（Worker 名称、KV 绑定）
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
