# Claude Code 配置指南

> 本项目的 Claude Code 完整配置，包括 Agents、Skills、Commands 和 Hooks

---

## 四层工具体系

| 层级 | 职责 | 触发方式 | 复杂度 |
|------|------|----------|--------|
| **Commands** | 快速提示/清单 | `/command-name` 手动调用 | 简单 |
| **Skills** | 代码生成/自动化 | Claude 自动发现，根据任务匹配 | 复杂 |
| **Agents** | 深度指导/规范 | Task 工具 `subagent_type` 参数 | 深入 |
| **Hooks** | 自动化规则 | 事件驱动，自动执行 | 确定性 |

**工作机制:**
- **Commands**: 用户输入 `/component` 等命令，Claude 读取对应 `.md` 文件作为提示
- **Skills**: Claude 根据任务自动匹配 `.claude/skills/` 中的能力描述
- **Agents**: Claude 通过 Task 工具调用专业子代理处理复杂任务
- **Hooks**: `settings.json` 中配置，在特定事件时自动执行 shell 命令

**使用原则:**
- **日常开发**: 优先使用 Skills（快速自动化）
- **查看清单**: 使用 Commands（快速提醒）
- **学习规范**: 使用 Agents（深度指导）
- **强制规则**: Hooks 自动执行

---

## Skills - 代码生成和自动化

Skills 是命令式工具，用于快速完成组件库开发任务。

### 完整 Skills 列表

| Skill | 文件 | 功能 | 使用场景 |
|-------|------|------|----------|
| `/package-creator` | `package-creator/SKILL.md` | 快速创建新组件包，生成标准目录结构和配置 | 新建组件包 |
| `/component-generator` | `component-generator/SKILL.md` | 智能组件生成，支持基础组件开发 | 生成组件代码 |
| `/figma-to-component` | `figma-to-component/SKILL.md` | 从 Figma 设计稿生成 Vue 组件，支持动态颜色映射 | 设计稿还原 |
| `/story-generator` | `story-generator/SKILL.md` | 生成 Storybook story 文件 | 编写 story |
| `/docs-generator` | `docs-generator/SKILL.md` | 从组件提取 API 生成文档 | 生成 API 文档 |
| `/test-generator` | `test-generator/SKILL.md` | 自动生成组件测试模板 | 编写测试 |
| `/coverage-analyzer` | `coverage-analyzer/SKILL.md` | 测试覆盖率分析，支持 CI 集成和趋势对比 | 覆盖率检查 |
| `/code-optimizer` | `code-optimizer/SKILL.md` | 自动检测并修复性能/类型/包体积问题 | 代码优化 |
| `/a11y-checker` | `a11y-checker/SKILL.md` | 自动化无障碍检查，ARIA/键盘/焦点管理 | 无障碍检查 |

### 建议工作流（非自动编排）

> ⚠️ Claude Code Skills 系统**不支持** skill 间显式调用。下方箭头仅表示**人/模型自行**在上游 skill 完成后接续调用下游 skill 的建议工作流，不是技术依赖。

```
figma-to-component ──► component-generator    # 提取设计数据后，手动调用组件生成器产出代码
coverage-analyzer  ──► test-generator         # 覆盖率不足时，手动调用测试生成器补测试
```

**Skill 内置选项**（不是 Skill 间编排，是同一 Skill 的可选参数）：

```
component-generator --with-story    # 同时生成 Story（内置功能）
component-generator --with-test     # 同时生成测试（内置功能）
test-generator      --with-story    # 同时生成 Story（内置功能）
```

### 命名规范

| 类型 | 命名模式 | 示例 |
|------|----------|------|
| 生成类 | `/xxx-generator` | `/component-generator`, `/story-generator`, `/docs-generator`, `/test-generator` |
| 分析类 | `/xxx-analyzer` | `/coverage-analyzer` |
| 检查类 | `/xxx-checker` | `/a11y-checker` |
| 创建类 | `/xxx-creator` | `/package-creator` |
| 优化类 | `/xxx-optimizer` | `/code-optimizer` |

### 使用说明

Skills 根据任务自动匹配，也可以通过描述任务来触发：

```bash
# 示例 1: 创建新组件包
"帮我创建一个 Select 组件包"  → 自动使用 /package-creator

# 示例 2: 生成组件
"生成一个 Dropdown 组件"  → 自动使用 /component-generator

# 示例 3: 生成 Story
"为 Button 组件生成 story"  → 自动使用 /story-generator

# 示例 4: 生成文档
"生成 Button 组件的 API 文档"  → 自动使用 /docs-generator
```

### 典型工作流

> ⚠️ **以下命令为意图描述，不是可执行 CLI**。Skills 通过 description 自然语言匹配触发，`--xxx` 风格参数仅作示意，实际使用时用自然语言描述意图即可（例如"用 package-creator 创建 Select 包，描述为下拉选择器"）。

```bash
# 完整组件开发流程（意图描述）
/package-creator Select --description="下拉选择器"  # 1. 创建包结构
/component-generator Select --package=select --with-story  # 2. 生成组件代码
/story-generator packages/select/src/Select.vue  # 3. 完善 story
/test-generator packages/select  # 4. 生成测试
/coverage-analyzer packages/select  # 5. 检查覆盖率
/a11y-checker packages/select  # 6. 无障碍检查
/docs-generator packages/select  # 7. 生成文档
pnpm test && pnpm build  # 8. 测试和构建（真实命令）
pnpm changeset  # 9. 创建 changeset（真实命令）
```

---

## Commands - 快速提示和清单

Commands 是轻量级提示命令，用于快速查看清单和最佳实践。

### 完整 Commands 列表

| Command | 文件 | 功能 | 使用场景 |
|---------|------|------|----------|
| `/component` | `component.md` | 组件开发清单，Props/Emits/样式规范检查 | 组件开发时 |
| `/story` | `story.md` | Storybook story 编写清单 | 编写 story 时 |
| `/test` | `test.md` | 组件测试清单，覆盖 Props/Emits/Slots | 编写测试时 |
| `/release` | `release.md` | 发布流程清单，版本管理和 npm 发布 | 发布前检查 |
| `/monorepo` | `monorepo.md` | Monorepo 操作清单，包管理和构建 | Monorepo 操作时 |
| `/review-pr` | `review-pr.md` | PR 审查清单，代码质量和规范检查 | 代码审查时 |

### 使用示例

```bash
/component        # 查看组件开发清单
/story            # 查看 story 编写清单
/test             # 查看测试清单
/release          # 查看发布流程
/monorepo         # 查看 monorepo 操作清单
```

---

## Agents - 深度指导

Agents 提供专业领域的深度指导，Claude 根据任务内容自动选择合适的 Agent。

### 完整 Agents 列表

#### 核心 Agents (日常必用)

| Agent | 文件 | 职责 | 适用场景 |
|-------|------|------|----------|
| `component-design` | `component-design.md` | 组件库设计完整指南，设计原则/Props/Emits/Slots/样式规范 | 组件设计和开发 |
| `coding-standards` | `coding-standards.md` | 编码规范，TypeScript/Vue/CSS 变量/BEM 命名 | 代码风格检查 |

#### 专业 Agents (按需使用)

| Agent | 文件 | 职责 | 适用场景 |
|-------|------|------|----------|
| `project-structure` | `project-structure.md` | Monorepo 项目结构完整指南，目录组织/包管理/依赖管理/构建配置 | 架构设计/Monorepo 操作 |
| `npm-publishing` | `npm-publishing.md` | npm 发布流程，changesets/版本策略/发布检查 | 发布准备 |
| `storybook-development` | `storybook-development.md` | Storybook 开发，story 编写/交互测试/视觉回归 | Storybook 开发 |
| `testing` | `testing.md` | 测试策略，单元测试/组件测试/Mock/覆盖率 | 测试编写 |
| `code-review` | `code-review.md` | 代码审查，质量检查/API 设计审查 | 代码审查 |
| `figma-extraction-guide` | `figma-extraction-guide.md` | Figma MCP 技术专家，设计数据提取 | Figma 设计还原 |
| `accessibility` | `accessibility.md` | 无障碍（A11y）完整指南，ARIA/键盘导航/焦点管理 | 无障碍开发 |
| `performance` | `performance.md` | 性能优化指南，渲染优化/虚拟滚动/懒加载/包体积 | 性能优化 |

#### Team Agents (并行协作角色)

用于 Agent Team 多人协作场景，每个角色有明确的文件所有权隔离。**Team agent 不会自动触发**，必须通过 Task 工具显式 `subagent_type: team-xxx` 调用。

| Agent | 文件 | 职责 | 文件所有权 | 约束类型 |
|-------|------|------|-----------|---------|
| `team-designer` | `team-designer.md` | 组件架构师（只读规划角色），整体架构设计与任务拆解 | 只读，不写任何文件 | 🔒 **硬约束**（`tools: Read, Grep, Glob` 由 Claude Code 工具机制强制） |
| `team-tester` | `team-tester.md` | 测试工程师，单元测试与无障碍测试 | `packages/<name>/__test__/` | ⚠️ **软约束**（frontmatter `tools` 含 Edit/Write，路径范围靠 prompt 自律） |
| `team-storyteller` | `team-storyteller.md` | Story 文档工程师，Storybook Story 与组件文档 | `packages/<name>/stories/` + `docs/components/` | ⚠️ **软约束**（同上，靠 prompt 自律） |

> **关键差异**：`team-designer` 的只读由 Claude Code 工具白名单**真正强制**；`team-tester` / `team-storyteller` 一旦授予 Edit/Write 权限即全局可写，文件路径范围**无法通过 frontmatter 限制**，必须在派发 prompt 中显式声明边界。这是 Claude Code 当前的能力限制，已在三个 team agent 顶部明确标注。
>
> **coder / optimizer / fixer 由 `general-purpose` agent 承担**，文件所有权约束为 `packages/<name>/src/`。
> **重要**：`general-purpose` 不会自动读取本文件中的隔离规则，**派发任务时必须在 prompt 中显式写明文件所有权边界**，例如：
>
> ```
> 你是 coder 角色，只能修改 packages/button/src/ 下的文件。
> 禁止动 __test__/、stories/、docs/、其他包及配置文件。
> ```
>
> 派发模板见 [team-designer.md "派发任务时的文件所有权约束" 章节](agents/team-designer.md)。

### Agent 依赖关系

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AIX Agents 依赖关系图                              │
└─────────────────────────────────────────────────────────────────────────────┘

核心 Agents (Core Layer)
━━━━━━━━━━━━━━━━━━━━━━━━━
┌───────────────────┐      ┌───────────────────┐
│  component-design │◄─────│  coding-standards │
│  (组件设计完整指南) │      │  (编码规范/SSOT)   │
└────────┬──────────┘      └────────┬──────────┘
         │                          │
         │  引用 CSS 变量/BEM 规范    │
         └──────────────────────────┘

专业 Agents (Specialized Layer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     testing     │     │   storybook-    │     │  code-review    │
│   (测试策略)     │     │   development   │     │   (代码审查)     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         ├───────────────────────┼───────────────────────┤
         │                       │                       │
         ▼                       ▼                       ▼
    ┌──────────┐           ┌──────────┐           ┌──────────┐
    │component-│           │ coding-  │           │component-│
    │ design   │           │standards │           │ design + │
    │          │           │          │           │ coding-  │
    │          │           │          │           │standards │
    └──────────┘           └──────────┘           └──────────┘

无障碍 Agent (Cross-cutting Concern)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────┐
│       accessibility         │
│    (无障碍完整指南/A11y)      │
└──────────────┬──────────────┘
               │
     ┌─────────┼─────────┐
     ▼         ▼         ▼
┌─────────┐┌─────────┐┌─────────┐
│component││ testing ││ coding- │
│-design  ││         ││standards│
└─────────┘└─────────┘└─────────┘

工具 Agents (Infrastructure Layer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌──────────────────────────────────┐    ┌──────────────────┐
│        project-structure         │    │  npm-publishing  │
│  (项目结构 + Monorepo 管理)       │    │   (npm 发布)     │
└────────────────┬─────────────────┘    └────────┬─────────┘
                 │                                │
                 │    ┌───────────────────────────┘
                 │    │
                 ▼    ▼
          ┌──────────────────────┐
          │   project-structure  │
          │   (Monorepo 管理)    │
          └──────────────────────┘

外部集成 Agents (Integration Layer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────┐
│  figma-extraction-guide │
│     (Figma MCP 专家)     │
└───────────┬─────────────┘
            │
            ├─────────────────────────────┐
            ▼                             ▼
     ┌──────────────┐              ┌──────────────┐
     │ component-   │              │   coding-    │
     │   design     │              │  standards   │
     │ (组件实现)   │              │ (CSS 变量)   │
     └──────────────┘              └──────────────┘

依赖方向说明
━━━━━━━━━━━
  A ──▶ B  表示 A 引用/依赖 B
  A ◄── B  表示 A 被 B 引用

独立 Agents (无依赖)
━━━━━━━━━━━━━━━━━━━
  • project-structure - 项目结构和 Monorepo 管理完整指南
```

### 使用说明

Agents 通过 Task 工具自动调用，你只需描述任务，Claude 会自动选择合适的 Agent：

```bash
# 示例 1: 直接描述任务，Claude 自动匹配 Agent
"帮我创建 Dropdown 组件"  → Claude 自动使用 component-design agent

# 示例 2: 询问规范问题
"Props 定义有什么规范?"  → Claude 自动使用 component-design agent

# 示例 3: CSS 样式问题
"CSS 变量怎么使用?"  → Claude 自动使用 coding-standards agent

# 示例 4: Monorepo 操作
"如何在包之间添加依赖?"  → Claude 自动使用 project-structure agent
```

> **技术细节**: Agents 是 Task 工具的 `subagent_type` 参数，Claude 根据任务内容自动选择。

---

## Hooks - 自动化规则

Hooks 是自动化执行机制，在特定事件触发时自动运行，配置在 `settings.json` 中。

### 当前配置

| Hook | 触发时机 | 作用 | 命令 |
|------|----------|------|------|
| `SessionStart` | 会话开始 | 显示欢迎信息、包数量、分支、规范提醒 | `printf` 输出信息 |
| `SessionEnd` | 会话结束 | 显示 Git 状态提醒，避免遗漏提交 | `git status --short` |

> 所有 hook 均设置了 `timeout: 5`（秒）防止阻塞。
>
> **降噪说明**：原 `UserPromptSubmit`（每轮 `git status` 注入上下文）与 `PostToolUse(Write|Edit)`（每个写文件打印 ✅）已移除：
> - 前者会在多轮对话中重复注入相同信息，浪费上下文；
> - 后者与 Write/Edit 工具自身的路径反馈重复，多文件场景下刷屏。
>
> 如需保留写文件反馈，可参考下方"Hook 配置示例"中的 `PostToolUse(Write|Edit)` 模板按需启用。

### 可用的 Hook 事件

| 事件 | 触发时机 | 适用场景 |
|------|----------|----------|
| `PreToolUse` | 工具调用前 | 阻止危险操作、参数校验 |
| `PostToolUse` | 工具调用后 | 自动格式化、通知确认 |
| `UserPromptSubmit` | 提交提示时 | 显示状态、规范提醒 |
| `SessionStart` | 会话开始 | 初始化、欢迎信息 |
| `SessionEnd` | 会话结束 | 清理、状态保存 |
| `Notification` | 发送通知时 | 自定义通知 |

### Hook 配置示例

```json
{
  "hooks": {
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
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '\"✅ 文件已写入: \" + (.tool_input.file_path // \"unknown\")' 2>/dev/null || true",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### 安全原则

```bash
# ✅ 安全：只读命令
git status --short || true
pnpm type-check || true
pnpm test || true

# ❌ 危险：修改操作 (禁止在 Hook 中使用)
rm -rf dist/
git reset --hard
git push  # 自动推送
```

**关键点:**
- 使用 `|| true` 避免阻塞会话
- 使用 `printf` 替代 `echo` (跨平台兼容)
- 设置 `timeout` 防止长时间执行
- 只运行只读命令，不修改文件或仓库状态

---

## MCP 服务器配置

MCP (Model Context Protocol) 服务器扩展 Claude 的能力。

### 项目级 vs 用户级

| 层级 | 配置文件 | 用途 |
|------|---------|------|
| **项目级** | `.mcp.json`（仓库根目录） | 项目自带、需要随仓库分发的 MCP server |
| **用户级** | `~/.claude.json` 或 IDE 设置 | 个人开发环境的通用 MCP（figma / context7 / chrome-devtools 等），由开发者自行启用，不强制 |

> 项目级 server 需要在 `.claude/settings.json` 的 `enabledMcpjsonServers` 中显式启用才生效。

### 当前项目级 MCP server

| 服务器 | NPM 包 | 功能 |
|--------|--------|------|
| `aix` | `@aix/mcp-server` | AIX 组件库专用 MCP，提供组件元数据查询等能力 |

### 完整 `.mcp.json`

```json
{
  "mcpServers": {
    "aix": {
      "command": "npx",
      "args": ["@aix/mcp-server@latest"]
    }
  }
}
```

### 在 `settings.json` 中启用

```json
{
  "enabledMcpjsonServers": ["aix"]
}
```

### 常用用户级 MCP（按需自行配置，不在仓库中）

| 服务器 | 用途 | 安装方式（示例） |
|--------|------|----------------|
| `context7` | 第三方库文档查询 | `claude mcp add context7 -- npx -y @upstash/context7-mcp` |
| `figma` | Figma 设计稿读取 | 需 `FIGMA_API_KEY`，参考 [figma-developer-mcp](https://www.npmjs.com/package/figma-developer-mcp) |
| `chrome-devtools` | 浏览器 DevTools 联动 | 参见对应 MCP 文档 |

> 若需要把 figma 等 server 升级为项目级（团队成员共享配置），请同时更新 `.mcp.json`、`enabledMcpjsonServers` 和本节描述，并提供 `.env.example` 模板。

---

## Permissions 权限配置

Permissions 控制 Claude 可以自动执行哪些命令（无需确认），配置在 `settings.json` 的 `permissions` 字段。

### 当前允许的命令（完整清单）

> 以下表格按分类列出 `settings.json` 中 `permissions.allow` 的全部条目，与 `settings.json` 保持一致。变更权限时需同步更新本表格。

| 分类 | 命令 | 说明 |
|------|------|------|
| **开发构建** | `pnpm dev*`, `pnpm build*`, `pnpm clean*`, `pnpm install*` | 开发、构建、清理和安装依赖 |
| **代码质量** | `pnpm lint*`, `pnpm type-check*`, `pnpm cspell*`, `pnpm format*` | ESLint、TypeScript、拼写检查和格式化 |
| **测试** | `pnpm test*` | 单元测试 |
| **文档** | `pnpm storybook*`, `pnpm docs*` | Storybook 和文档 |
| **版本管理** | `pnpm changeset*`, `pnpm commit*` | Changesets 和交互式提交 |
| **工具链** | `pnpm gen*`, `pnpm link*`, `turbo *`, `npx tsc *`, `npx vue-tsc *` | 生成、链接、Turbo 任务和类型检查 |
| **Git 只读** | `git status*`, `git diff*`, `git log*`, `git branch*`, `git fetch*`, `git show *`, `git stash*` | 状态/历史查询 |
| **Git 写操作** | `git add *`, `git commit *`, `git push *`, `git pull*`, `git checkout *`, `git merge *`, `git rebase *`, `git mv *`, `git rm *` | 仓库修改（带参数）|

### 禁止的命令（deny）

> 即使 allow 中允许 `git checkout *`，下方 deny 优先级更高，破坏性子模式仍会被拦截。

| 命令 | 原因 |
|------|------|
| `git checkout --*` / `git checkout .` / `git checkout -- .` | 会覆盖工作目录未提交的修改 |
| `git reset --hard*` | 不可逆的硬重置 |
| `git clean -f*` | 强制删除未跟踪文件 |
| `git push --force*` / `git push -f*` | 强制推送可能覆盖远端历史 |
| `git branch -D*` | 强制删除分支 |

### 安全说明

- **allow**: 列出的命令 Claude 可以直接执行，无需用户确认
- **deny** 优先级高于 allow，即便 `git checkout *` 在 allow 中，破坏性形式仍被拦截
- pnpm 命令使用 `pnpm cmd*` 格式（无空格），同时覆盖基础命令和冒号子命令（如 `pnpm test` 和 `pnpm test:unit`）
- git 写操作使用 `git cmd *` 格式（有空格），要求必须带参数，防止意外执行 bare 命令
- 未列出的命令需要用户手动确认
- ⚠️ `git commit *` / `git push *` 允许在 allow 中是**有意设计**（个人开发场景），但请遵循 [全局 CLAUDE.md](../../CLAUDE.md) 的「禁止未经确认的提交」规则

---

## Git 提交规范

### 提交格式

```bash
type: subject
type(scope): subject

# 示例
feat: 添加 Select 组件
fix(button): 修复样式问题
docs: 更新组件 API 文档
```

### 字段说明

- **type**: `feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `chore` / `build` / `ci` / `revert`
- **scope**: 可选，修改范围（如组件名）
- **subject**: 简要描述（不超过 72 字符，不以 `.` 结尾，推荐中文）

### 提交流程

```bash
pnpm commit  # 交互式提交 (推荐)
# 或
git commit -m "feat: 简要描述"
```

---

## 问题诊断决策树

```
问题 → 能自动修复?
        ├─ 是 → Skills (自动修复)
        └─ 否 → 知道解决方案?
                ├─ 是 → 手动修复
                └─ 否 → Commands (快速索引)
                        └─ 仍不清楚? → Agents (深度学习)
```

### 常见场景速查

| 场景 | 首选工具 | 备选 |
|------|----------|------|
| 创建新组件包 | `/package-creator` | project-structure agent |
| 生成组件代码 | `/component-generator` | component-design agent |
| 编写 Story | `/story-generator` | storybook-development agent |
| 生成文档 | `/docs-generator` | component-design agent |
| TypeScript 类型错误 | `pnpm type-check` | coding-standards agent |
| Vue 组件问题 | `/component` → `pnpm lint` | component-design agent |
| 样式/CSS 问题 | coding-standards agent | `pnpm lint` |
| 测试覆盖率不足 | `/coverage-analyzer` | testing agent |
| 代码提交前 | `/review-pr` → `pnpm type-check` | coding-standards agent |
| 发布准备 | `/release` → `pnpm changeset` | npm-publishing agent |

---

## 快速开始

```bash
# 1. 查看可用工具
ls .claude/skills
ls .claude/agents
ls .claude/commands

# 2. 使用 Command 查看清单
/component
/story
/release

# 3. 直接描述任务，Claude 自动选择 Skill 或 Agent
"帮我创建一个 Select 组件包"       # → 自动使用 package-creator skill
"为 Button 组件生成 story"        # → 自动使用 story-generator skill
"Props 定义有什么规范?"           # → 自动查阅 component-design agent
"CSS 变量怎么使用?"              # → 自动查阅 coding-standards agent
```

---

## 自定义扩展

### 新增 Command

在 `commands/` 目录创建 `.md` 文件:

```markdown
---
description: 命令描述 (必需)
---

# 命令标题

命令内容...
```

### 新增 Skill

在 `skills/` 目录创建 `<name>/SKILL.md` 文件:

```markdown
---
name: skill-name
description: Skill 功能描述
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "1.0.0"
  category: development
---

# Skill 标题

## 功能概述
...

## 使用方式
...

## 执行流程
...
```

### 新增 Agent

在 `agents/` 目录创建 `.md` 文件:

```markdown
---
name: agent-name
description: Agent 职责描述
tools: Read, Grep, Glob
model: inherit
---

# Agent 标题

## 职责
...

## 规范详情
...
```

### 新增 Hook

在 `settings.json` 的 `hooks` 字段中添加配置:

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "ToolName",  // 可选，仅 PreToolUse/PostToolUse 使用
        "hooks": [
          {
            "type": "command",
            "command": "your-command || true",
            "timeout": 10  // 可选，单位秒
          }
        ]
      }
    ]
  }
}
```

---

## 相关文档

- [AIX 组件库 README](../../README.md)
- [Rollup 构建配置](../../rollup.config.js)
- [Turborepo 配置](../../turbo.json)
- [Changesets 文档](https://github.com/changesets/changesets)
