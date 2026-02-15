# CLAUDE.md - AI 开发助手快速指南

## Git 提交规则
- **提交格式**: `type: subject` 或 `type(scope): subject`
- **语言**: commit subject 推荐使用中文
- **示例**: `feat: 添加用户登录功能` 或 `fix(button): 修复点击态样式问题`
- **AI 标识**: 提交代码时不要添加 Co-Authored-By 签名，改为在 commit 末尾添加：🤖 Generated with AI

> 本文档专为 AI 助手设计，提供组件库项目快速概览和文档导航。人类开发者请查看 [README.md](README.md)

## AI 编程流程化操作系统

**项目配置了完整的 Skills，实现组件库开发的智能化工作流！**

### 智能工作流

```bash
# 1. 创建新组件包
/package-creator button

# 2. 组件开发 (从 Figma 或纯代码)
/figma-to-component     # 有 Figma 设计稿
/component-generator    # 无设计稿，纯代码生成

# 3. Storybook Story 编写
/story-generator

# 4. 测试编写与覆盖率分析
/test-generator
/coverage-analyzer

# 5. 文档生成
/docs-generator

# 6. 代码优化与无障碍检查
/code-optimizer
/a11y-checker

# 7. 质量检查
pnpm type-check && pnpm cspell && pnpm lint
```

### 核心 Skills

| Skill | 说明 | 分类 |
|-------|------|------|
| **package-creator** | 创建新组件包脚手架 | Scaffold |
| **component-generator** | 智能组件代码生成 | Development |
| **figma-to-component** | Figma 设计稿 → Vue 组件 | Development |
| **story-generator** | 自动生成 Storybook Stories | Documentation |
| **docs-generator** | API 文档自动生成 | Documentation |
| **test-generator** | 自动生成测试用例模板 | Quality |
| **coverage-analyzer** | 测试覆盖率分析 | Quality |
| **code-optimizer** | 性能/类型/包体积优化 | Quality |
| **a11y-checker** | 无障碍合规检查 | Quality |

---

## Commands 和 Hooks

### Commands (快速提示)

| Command | 说明 | 使用场景 |
|---------|------|---------|
| `/component` | 组件开发清单 | Props/Emits/样式规范检查 |
| `/story` | Storybook Story 编写清单 | Story 编写规范 |
| `/test` | 组件测试清单 | 覆盖 Props/Emits/Slots |
| `/release` | 发布流程清单 | 版本管理和 npm 发布 |
| `/monorepo` | Monorepo 操作清单 | 包管理和构建 |
| `/review-pr` | PR 审查清单 | 代码审查前快速查看 |

### Hooks (自动化规则)

- `UserPromptSubmit` - 提交前自动显示 Git 状态
- `SessionStart` - 会话开始时显示组件库概览
- `PostToolUse (Write)` - 写文件后显示文件名确认
- `SessionEnd` - 会话结束时显示 Git 状态

### Skills vs Agents vs Commands

| 维度 | Skills | Agents | Commands |
|------|--------|--------|----------|
| **定位** | 代码生成器 | 规范指导者 | 快速清单 |
| **输入** | 任务描述 + 参数 | 规范问题 | 无 |
| **输出** | 生成代码文件 | 规范解答/指导 | 提示内容 |
| **适用场景** | "帮我生成 X" | "X 有什么规范?" | "查看 X 清单" |

---

## Agent Team 协作模式

支持多 Agent 并行协作开发，已配置 3 个 teammate 角色。

### 团队场景

| 场景 | 触发方式 | 团队编制 |
|------|---------|---------|
| 开发新组件 | "开发新组件 X" | designer → coder → tester + storyteller |
| 优化老组件 | "优化组件 X" | analyzer → optimizer + tester |
| 修复多包 Bug | "修复 bug" | fixer-1 + fixer-2 + fixer-3 |

### Teammate 角色

| 角色 | Agent 文件 | 文件所有权 |
|------|-----------|-----------|
| designer (架构师) | team-designer.md | 只读，负责架构设计与任务拆解 |
| tester | team-tester.md | `__test__/` |
| storyteller | team-storyteller.md | `stories/` + `docs/` |
| coder/optimizer/fixer | 不需专属 agent，用 general-purpose | `src/` |

---

## 3 分钟项目速读

### 核心技术栈
- **框架**: Vue 3 (Composition API + `<script setup>`)
- **语言**: TypeScript (严格类型检查)
- **构建**: Rollup (ESM/CJS 双格式输出) + Turbo (monorepo 编排)
- **测试**: Vitest + Vue Test Utils (jsdom 环境)
- **样式**: Sass + PostCSS + CSS Variables
- **文档**: Storybook + VitePress
- **包管理**: pnpm (workspace 协议)
- **代码质量**: ESLint + Stylelint + Prettier + CSpell + Commitlint

### 项目定位
Vue 3 组件库 Monorepo，强调**类型安全**、**样式隔离**、**Tree-shaking** 和**开发规范**。发布到 npm，供业务项目引用。

---

## 核心架构决策

### 1. Monorepo 架构

```
aix/
├── packages/          # 组件包 (发布到 npm @aix/*)
│   ├── button/        # 按钮组件
│   ├── hooks/         # 公共 Composables
│   ├── icons/         # 图标组件
│   ├── pdf-viewer/    # PDF 查看器
│   ├── subtitle/      # 字幕组件
│   ├── theme/         # 主题系统 (CSS Variables)
│   └── video/         # 视频播放器
├── apps/              # 应用 (不发布)
│   ├── client/        # 组件 Demo 预览
│   └── server/        # 后端 API 服务
├── internal/          # 内部共享配置 (不发布)
│   ├── eslint-config/
│   ├── stylelint-config/
│   ├── typescript-config/
│   └── mcp-server/
├── rollup.config.js   # 共享 Rollup 配置
└── turbo.json         # Turbo 任务编排
```

**关键规则**:
- 组件包以 `@aix/` 为 scope 发布
- 包间依赖使用 `workspace:*` 协议
- `internal/` 下的包不发布，仅在仓库内共享
- 每个组件包独立 `rollup.config.js`，继承根配置

### 2. 构建输出格式

| 格式 | 目录 | 用途 |
|------|------|------|
| **ESM** | `es/` | 现代打包工具 (Vite/Webpack)，支持 Tree-shaking |
| **CJS** | `lib/` | Node.js / 传统工具兼容 |

**类型声明**: `vue-tsc` 生成 `.d.ts` 到 `es/` 目录

### 3. 主题系统

所有组件样式基于 `@aix/theme` 包的 CSS Variables：
```scss
// 正确: 使用 CSS 变量
.aix-button {
  color: var(--aix-color-primary);
  border-radius: var(--aix-border-radius);
}

// 错误: 硬编码颜色值
.aix-button {
  color: #1890ff;    // 禁止!
  border-radius: 4px; // 禁止!
}
```

### 4. 组件包结构规范

```
packages/<name>/
├── src/
│   ├── index.vue        # 组件主文件
│   ├── index.ts         # 导出入口
│   └── types.ts         # 类型定义
├── __test__/            # 测试文件
├── stories/             # Storybook Stories
├── rollup.config.js     # 构建配置
├── package.json
└── tsconfig.json
```

---

## 关键目录速查

| 目录 | 职责 | 注意事项 |
|------|------|---------|
| `packages/*/src/` | 组件源代码 | 每个包独立发布 |
| `packages/*/es/` | ESM 构建产物 | 自动生成，禁止修改 |
| `packages/*/lib/` | CJS 构建产物 | 自动生成，禁止修改 |
| `packages/*/__test__/` | 组件测试 | Vitest + Vue Test Utils |
| `packages/*/stories/` | Storybook Stories | 组件文档与示例 |
| `packages/theme/` | 主题 CSS Variables | 所有组件共享的样式变量 |
| `packages/hooks/` | 公共 Composables | 可复用的 Vue Composition API |
| `apps/client/` | Demo 预览应用 | 模拟外部项目引用组件 |
| `internal/` | 共享工程配置 | ESLint/Stylelint/TSConfig |
| `.claude/agents/` | AI Agent 专业文档 | 详细开发规范 |
| `.claude/skills/` | Claude Code Skills | 自动化代码生成 |

---

## AI Agent 导航

### 核心 Agent

| Agent | 适用场景 | 文档链接 |
|-------|---------|---------|
| **component-design** | 组件 API 设计、Props/Emits/Slots 规范 | [查看文档](.claude/agents/component-design.md) |
| **coding-standards** | TypeScript/Vue/CSS 编码规范 | [查看文档](.claude/agents/coding-standards.md) |
| **project-structure** | Monorepo 架构、目录组织 | [查看文档](.claude/agents/project-structure.md) |

### 专业 Agent

| Agent | 适用场景 | 文档链接 |
|-------|---------|---------|
| **testing** | 测试策略、用例编写 | [查看文档](.claude/agents/testing.md) |
| **storybook-development** | Story 编写、文档生成 | [查看文档](.claude/agents/storybook-development.md) |
| **npm-publishing** | 版本管理、npm 发布流程 | [查看文档](.claude/agents/npm-publishing.md) |
| **accessibility** | 无障碍 (A11y) 合规 | [查看文档](.claude/agents/accessibility.md) |
| **performance** | 渲染优化、包体积优化 | [查看文档](.claude/agents/performance.md) |
| **code-review** | 代码审查、质量检查 | [查看文档](.claude/agents/code-review.md) |
| **figma-extraction-guide** | Figma MCP 设计稿提取 | [查看文档](.claude/agents/figma-extraction-guide.md) |

### Team Agent (并行协作角色)

| Agent | 适用场景 | 文档链接 |
|-------|---------|---------|
| **team-designer** | 组件架构设计、任务拆解（Plan 模式只读） | [查看文档](.claude/agents/team-designer.md) |
| **team-tester** | 组件测试编写（文件所有权: `__test__/`） | [查看文档](.claude/agents/team-tester.md) |
| **team-storyteller** | Story 和文档编写（文件所有权: `stories/` + `docs/`） | [查看文档](.claude/agents/team-storyteller.md) |

---

## 常见开发任务

### 任务 1: 新增组件包

```bash
# 使用 Skill 自动生成
/package-creator <component-name>

# 或手动创建
pnpm gen <component-name>
```

生成后包含: `src/`、`__test__/`、`stories/`、`package.json`、`tsconfig.json`、`rollup.config.js`

### 任务 2: 组件开发

```bash
# 步骤 1: Props/Emits 类型定义 (types.ts)
# 步骤 2: 组件实现 (index.vue)
# 步骤 3: 导出入口 (index.ts)
# 步骤 4: 编写测试 (__test__/)
# 步骤 5: 编写 Story (stories/)
```

**详细指导**: 查看 [component-design.md](.claude/agents/component-design.md)

### 任务 3: 构建与测试

```bash
pnpm build                          # 全量构建
pnpm build:filter -- --filter=@aix/button  # 单包构建
pnpm test                           # 全量测试
pnpm type-check                     # TypeScript 类型检查
pnpm cspell                         # 拼写检查
```

### 任务 4: 本地联调

```bash
pnpm link:setup     # 初始化 Yalc 链接
pnpm link:publish   # 发布到本地 Yalc
pnpm link:push      # 推送更新到链接的项目
```

---

## 重要约定和禁忌

### 禁止事项

| 禁止操作 | 说明 |
|---------|------|
| 修改 `es/`、`lib/`、`dist/` | 构建产物，自动生成 |
| 硬编码颜色值 | 必须使用 `@aix/theme` 的 CSS Variables |
| 组件间直接引用源码 | 必须通过 `workspace:*` 依赖引用 |
| 跳过类型定义 | Props/Emits 必须有完整 TypeScript 类型 |
| 使用标签选择器 | 组件样式必须使用 `.aix-` 前缀的 class |
| 在组件中使用 `scoped` | 组件库使用 BEM + 命名空间隔离，不用 scoped |

### 必须遵守

| 规范 | 说明 |
|------|------|
| Props/Emits 类型定义 | 在 `types.ts` 中定义完整的 TypeScript 接口 |
| 样式命名空间 | 所有 class 使用 `.aix-<component>` 前缀 |
| CSS Variables | 颜色/间距/圆角等使用 `var(--aix-*)` |
| 导出规范 | `index.ts` 统一导出组件和类型 |
| 测试覆盖 | 新组件必须编写单元测试 |
| Story 文档 | 新组件必须编写 Storybook Story |

---

## 快速参考

### 常用命令

```bash
# 开发
pnpm dev                  # 启动所有包的 dev 模式
pnpm storybook:dev        # 启动 Storybook

# 构建
pnpm build                # 全量构建
pnpm build:filter -- --filter=@aix/<name>  # 单包构建

# 质量检查
pnpm lint                 # ESLint 检查
pnpm type-check           # TypeScript 类型检查
pnpm cspell               # 拼写检查
pnpm test                 # 单元测试

# 文档
pnpm docs:dev             # VitePress 文档开发
pnpm storybook:build      # Storybook 构建

# 发布
pnpm commit               # 交互式提交 (czg)
pnpm pre                  # 预发布流程
```

### 关键路径

```bash
# 组件源码
packages/*/src/           # 组件实现
packages/*/types.ts       # 类型定义
packages/theme/           # 主题 CSS Variables

# 测试与文档
packages/*/__test__/      # 单元测试
packages/*/stories/       # Storybook Stories

# 工程配置
rollup.config.js          # 共享 Rollup 配置
turbo.json                # Turbo 任务编排
commitlint.config.ts      # 提交信息规范
.cspell.json              # 拼写检查配置

# Claude Code
.claude/agents/           # Agent 文档
.claude/skills/           # Skills 文档
.claude/commands/         # Commands
```
