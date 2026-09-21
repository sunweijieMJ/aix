# Claude Code 配置指南

> 本项目的 Claude Code 完整配置，包括 Agents、Skills、Commands 和 Hooks

---

## 四层工具体系

| 层级 | 职责 | 触发方式 | 性质 |
|------|------|----------|------|
| **Commands** | 快速提示/清单 | `/command-name` 手动调用 | 提示 |
| **Skills** | 代码生成/自动化 | Claude 根据 description 自动匹配 | 提示 |
| **Agents** | 深度指导/规范 | Agent 工具的 `subagent_type` 参数 | 提示 |
| **Hooks** | 会话信息输出 | 事件驱动，自动执行 shell | 确定性 |

**工作机制:**

- **Commands**: 用户输入 `/component` 等命令，Claude 读取对应 `.md` 文件作为提示
- **Skills**: Claude 根据任务自动匹配 `.claude/skills/` 中的能力描述
- **Agents**: Claude 通过 Agent 工具调用专业子代理处理复杂任务
- **Hooks**: `settings.json` 中配置，在特定事件时自动执行 shell 命令

**使用原则:**

- **日常开发**: 优先使用 Skills（快速自动化）
- **查看清单**: 使用 Commands（快速提醒）
- **学习规范**: 使用 Agents（深度指导）

> ⚠️ **前三层都是"提示"，不是"强制"**。它们影响模型的判断，但不构成机制上的拦截——
> 模型仍可能违反其中的规范。真正的强制力来自仓库自己的工具链，与 `.claude/` 无关：
>
> | 约束 | 真正的执行者 |
> |------|------------|
> | 类型完整性 | `pnpm type-check`（CI 门禁）|
> | 硬编码色值 | Stylelint（`pnpm lint`，CI 门禁）——**只拦承载颜色属性上的裸 hex**；`rgb()` / `hsl()` / 命名色**有意不拦**（仓库大量用 `rgb(0 0 0 / .6)` 做蒙层），规则与原因见 `internal/stylelint-config/component-library.js` |
> | class 用 `aix-` 命名空间 | Stylelint 的 `selector-class-pattern`（只管前缀，**不管是否用 `useNamespace` 生成**——那是零强制力的软约定）|
> | 发布形态（exports / files / 类型解析）| `pnpm lint:publish --strict`（CI 门禁）|
> | 测试不退化 | `pnpm test`（CI `test` job）|
> | 覆盖率不退化 | `pnpm test:coverage` + `vitest.config.ts` 的棘轮阈值（CI `coverage` job，**门禁不是 80%**）|
> | commit message 格式 | commitlint + husky |
>
> 本仓当前的 Hooks **只做会话信息输出**（见下方「Hooks」章节），不承担任何规则强制。
> 判断某条规范是否真的被守住，看的是上表，不是 `.claude/` 里写了什么。

---

## Skills - 代码生成和自动化

Skills 是命令式工具，用于快速完成组件库开发任务。

### 完整 Skills 列表

| Skill | 文件 | 功能 | 使用场景 |
|-------|------|------|----------|
| `/package-creator` | `package-creator/SKILL.md` | **封装 `pnpm gen`** 创建新组件包，不手写脚手架 | 新建组件包 |
| `/component-generator` | `component-generator/SKILL.md` | 往已有包里加子组件（useNamespace / useLocale / CSS 变量） | 生成组件代码 |
| `/figma-to-component` | `figma-to-component/SKILL.md` | 从 Figma 设计稿生成 Vue 组件，支持动态颜色映射 | 设计稿还原 |
| `/story-generator` | `story-generator/SKILL.md` | 生成 Storybook story 文件 | 编写 story |
| `/docs-generator` | `docs-generator/SKILL.md` | **驱动 `pnpm docs:gen` 管线**；只手写散文部分，API 表格是机器所有的 | 生成 API 文档 |
| `/test-generator` | `test-generator/SKILL.md` | 生成 Vitest + VTU 测试模板（含 i18n / a11y 维度） | 编写测试 |
| `/coverage-analyzer` | `coverage-analyzer/SKILL.md` | 跑真实覆盖率并解读**棘轮门禁**，定位缺口 | 覆盖率检查 |
| `/code-optimizer` | `code-optimizer/SKILL.md` | 检测性能/类型/a11y/包体积问题并给修复（人工 review） | 代码优化 |
| `/a11y-checker` | `a11y-checker/SKILL.md` | 启发式无障碍检查，ARIA/键盘/焦点管理 | 无障碍检查 |

> ⚠️ Skills 是 prompt 指南，**没有确定性执行引擎**：文中的 `--flag` 不是真实 CLI 参数，
> "自动修复"是模型用 Edit 工具改代码。要确定性的东西找 `pnpm lint` / `type-check` /
> `test` / `lint:publish`（见开头「强制力」表）。

### 建议工作流（非自动编排）

> ⚠️ **没有"skill 自动编排"这种机制**。skill 是加载进上下文的指令文本，不存在声明式的
> 依赖或链式触发；下方箭头表示**模型读完上游 skill 后自行接着调用下游 skill**
> （技术上可行——Skill 工具就在手里——但那是模型的一次主动决定，不是配置声明出来的流程）。

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
>
> `select` 是这个走查里**待新建**的包，本仓当前没有它（现有 13 个包见 `ls packages/`）。

```bash
# 完整组件开发流程
pnpm gen select -d "下拉选择器"        # 1. 创建包（真实命令，package-creator 就是调它）
                                       #    包名必须 kebab-case，Select 会被校验拒绝
/component-generator                   # 2. 往 select 包里加子组件（意图描述）
/story-generator packages/select       # 3. 完善 story（意图描述）
/test-generator packages/select        # 4. 生成测试（意图描述）
/coverage-analyzer packages/select     # 5. 检查覆盖率（意图描述）
/a11y-checker packages/select          # 6. 无障碍检查（意图描述）
/docs-generator packages/select        # 7. 生成文档（意图描述）
pnpm test && pnpm build:filter @aix/select  # 8. 测试和构建（真实命令）
pnpm lint:publish                      # 9. 发布形态体检（真实命令）
pnpm changeset                         # 10. 创建 changeset（真实命令）
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

### 规范写在哪：避免四层各抄一份

同一条规范同时出现在 command 清单、skill 模板和 agent 正文里，是这套配置最大的维护负担——
改一处、漏三处，读者还不知道该信谁。约定如下：

| 内容类型 | 该写在哪 | 其他层怎么做 |
|---------|---------|------------|
| **规范正文**（为什么这样、边界、反例）| 对应的基础层 agent | 只引用，不复制 |
| **勾选清单**（做没做）| `commands/*.md` | 一行一条，末尾指向 agent |
| **可复制的代码模板** | `skills/*/SKILL.md` | 模板本身即规范的体现 |
| **机器可执行的事实**（字段值、目录、命令）| 仓库源码本身 | 文档指过去，不誊抄 |

最后一条最关键：包结构以 `scripts/gen/templates/` 为准、token 以
`packages/theme/src/vars/` 为准、测试基座以 `internal/vitest-config/` 为准、
CI 以 `.github/workflows/` 为准。**文档里誊抄一份 JSON 或 YAML，就等于制造了一个
必然漂移的副本**——本仓已经为此付出过代价（同一份过时的 package.json 曾散落在 5 个文件里）。

### Agent 分层与引用关系

13 个 agent 分四层。箭头 `A ──▶ B` 表示 **A 的内容以 B 为准**（A 引用 B 的规范）。

```
基础层（SSOT，被其他所有 agent 引用）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  coding-standards      TypeScript / Vue / CSS 变量 / BEM / useNamespace / i18n / exports
  component-design      设计原则 / Props / Emits / Slots
  project-structure     Monorepo 结构 / workspace / turbo / pnpm gen

专业层
━━━━━━
  testing               ──▶ coding-standards
  storybook-development ──▶ coding-standards, component-design
  code-review           ──▶ coding-standards, component-design, testing
  performance           ──▶ coding-standards, component-design
  npm-publishing        ──▶ project-structure（exports / files 字段）

横切层
━━━━━━
  accessibility         ──▶ component-design, testing, coding-standards
                        （被 testing / storybook-development / code-review 反向引用）

外部集成层
━━━━━━━━━
  figma-extraction-guide ──▶ coding-standards（CSS 变量映射）, component-design（实现）
                         需用户级 figma MCP，否则不可用

协作角色层（不自动触发，必须显式 subagent_type 调用）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  team-designer ──▶ project-structure, component-design, coding-standards
  team-tester   ──▶ testing, accessibility
  team-storyteller ──▶ storybook-development
```

**改动规则**：基础层三个 agent 是规范的单一真实来源；专业层/横切层如果和它们冲突，
以基础层为准，并回头修专业层。不要在专业层复制一份规范正文。

### 使用说明：这 10 个知识型 agent 主要是被**当文档读**的

先说清楚机制，否则很容易误判它们的作用：

- agent 通过 Agent 工具的 `subagent_type` 调起，跑在**独立上下文**里；
  父会话只拿到它的返回摘要，**agent 正文不会进父会话的上下文**。
- 而这些规范（BEM、CSS 变量、exports 字段、Props 类型）恰恰是**父会话自己动手写代码时**
  要遵守的。所以「派个 subagent 去读规范」对写代码这件事帮助有限。
- 实际上更常用、也更有效的方式是**直接读文件**：`.claude/skills/*` 里对它们的引用
  全都是指向 `agents/*.md` 的相对路径链接——它们一直被当作普通 Markdown 文档在用。

```bash
# 推荐：需要哪条规范就直接读那个文件
Read .claude/agents/coding-standards.md      # CSS 变量 / BEM / exports / i18n
Read .claude/agents/component-design.md      # Props / Emits / Slots 设计
Read .claude/agents/project-structure.md     # Monorepo / catalog / turbo

# 适合派 subagent 的场景：需要独立上下文做大范围探查，只要结论
subagent_type: code-review     "审查这次改动的 API 设计"
subagent_type: team-designer   "设计 XX 组件的架构方案"
```

> ⚠️ **自动匹配目前不可靠**。这 10 个 agent 的 `description` 都是名词短语
> （"……完整指南"），而派发正是靠 description 匹配的；对比 `skills/` 用的是
> `Use when the user asks to...` 触发式描述。指望"问一句 CSS 变量怎么用就自动调起
> coding-standards"是不成立的——要么显式指定 `subagent_type`，要么直接读文件。
>
> 真正需要独立上下文的是 `team-*` 与 `figma-extraction-guide`（后者还需要用户级
> figma MCP）；其余更接近"带目录的规范手册"。

---

## Hooks - 会话信息输出

Hooks 是在特定事件触发时自动执行的 shell 命令，配置在 `settings.json` 中。
**本仓有意只用它做信息输出，不做规则拦截**——规范的强制力交给 lint / type-check /
lint:publish / CI（见开头「四层工具体系」的说明）。

### 当前配置

| Hook | 触发时机 | 作用 | 命令 |
|------|----------|------|------|
| `SessionStart` | 会话开始 | 显示欢迎信息、包数量、分支、规范提醒 | `printf` 输出信息 |
| `SessionEnd` | 会话结束 | 显示 Git 状态提醒，避免遗漏提交 | `git status --short` |

> 所有 hook 均设置了 `timeout: 5`（秒）防止阻塞。
>
> `SessionStart` 的 stdout 会注入模型上下文，每次会话都占 token，加内容前先掂量。
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
| `Stop` | 主回合结束时 | 收尾检查 |
| `SubagentStop` | 子代理结束时 | 汇总子代理产出 |
| `PreCompact` | 上下文压缩前 | 保存关键状态 |

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

### 它跑的是**本地构建产物**，不是 npm 上的包

`.mcp.json` 指向仓库内构建出来的 `internal/mcp-server/dist/cli.js`（配置以该文件实际内容
为准，此处只说明机制）。这样 MCP 查到的组件元数据来自**当前源码**，而不是上一次发布的
`@aix/mcp-server`——对一个组件天天在变的仓库，这是有意的选择。

代价是**它依赖构建产物，而 `internal/*/dist` 被 gitignore**：

```bash
# 新克隆的仓库首次使用前必须构建，否则 MCP server 启动失败
pnpm install
pnpm build:filter @aix/mcp-server
```

> ⚠️ 症状：Claude Code 启动后 `aix` MCP 工具全部不可用 / 连接失败。
> 先确认 `internal/mcp-server/dist/cli.js` 存在。`pnpm install` **不会**自动构建它
> （根 `postinstall` 只跑 `husky`）。
>
> 组件源码改动后，MCP 的数据要重新 `extract` 才会更新——`@aix/mcp-server` 的 `build`
> 脚本包含 `extract` 步骤，重新构建该包即可。

### 在 `settings.json` 中启用

项目级 server 必须在 `enabledMcpjsonServers` 中显式启用（当前已启用 `aix`）。

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
| `git checkout * -- *` | 带 ref 的路径还原（如 `git checkout HEAD -- src/x.ts`）同样覆盖未提交修改，且不匹配上一条的 `--` 前缀 |
| `git checkout -f*` | 强制切换会丢弃工作区改动（`--force` 已被 `git checkout --*` 覆盖，短选项需单列）|
| `git reset --hard*` | 不可逆的硬重置 |
| `git clean -f*` | 强制删除未跟踪文件 |
| `git push --force*` / `git push -f*` | 强制推送可能覆盖远端历史 |
| `git branch -D*` | 强制删除分支 |
| `git stash drop*` / `git stash clear*` | allow 里有 `git stash*`，但 drop/clear 会**不可恢复地丢弃已 stash 的工作** |

### 安全说明

- **allow**: 列出的命令 Claude 可以直接执行，无需用户确认
- **deny** 优先级高于 allow，即便 `git checkout *` 在 allow 中，破坏性形式仍被拦截
- pnpm 命令使用 `pnpm cmd*` 格式（无空格），同时覆盖基础命令和冒号子命令（如 `pnpm test` 和 `pnpm test:unit`）
- git 写操作使用 `git cmd *` 格式（有空格），要求必须带参数，防止意外执行 bare 命令
- 未列出的命令需要用户手动确认
- ⚠️ `git commit *` / `git push *` 允许在 allow 中是**有意设计**（个人开发场景），但请遵循 [项目 CLAUDE.md](../CLAUDE.md) 的「禁止未经确认的提交」规则

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
| 创建新组件包 | `pnpm gen <kebab-name>` | `/package-creator`（同一件事的封装）|
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

- [AIX 组件库 README](../README.md)
- [Rollup 构建配置](../rollup.config.js)
- [Turborepo 配置](../turbo.json)
- [Changesets 文档](https://github.com/changesets/changesets)
