---
name: project-structure
description: AIX 组件库 Monorepo 项目结构指导，包括目录组织、包管理和构建配置
tools: Read, Grep, Glob
model: inherit
---

# AIX 组件库项目结构

> **AIX 组件库 Monorepo 架构管理完整指南**

## 📚 目录

- [项目结构概览](#项目结构概览)
- [pnpm Workspaces](#pnpm-workspaces)
- [Turborepo 构建系统](#turborepo-构建系统)
- [包管理](#包管理)
- [依赖管理](#依赖管理)
- [构建优化](#构建优化)
- [版本管理](#版本管理)
- [常见问题](#常见问题)

---

## 项目结构概览

### 📁 目录结构

```
aix/
├── .changeset/              # Changesets 配置
├── .claude/                 # Claude Code 配置
├── .husky/                  # Git hooks
├── .storybook/              # Storybook 全局配置
├── docs/                    # VitePress 文档
│   ├── .vitepress/         # VitePress 配置
│   └── components/         # 组件文档
├── apps/                    # 应用，不发布
│   ├── client/
│   └── server/
├── internal/                # monorepo 内部基础设施（@kit/*，mcp-server 例外）
│   ├── eslint-config/      # ESLint 共享配置
│   ├── prettier-config/    # Prettier 共享配置
│   ├── stylelint-config/   # Stylelint 共享配置
│   ├── typescript-config/  # TypeScript 共享配置
│   ├── vitest-config/      # Vitest 共享基座（createVueConfig / createNodeConfig）
│   └── mcp-server/         # MCP Server（有意发布为 @aix/mcp-server）
├── kit/                     # 独立工具包 (@kit/*)
│   ├── ai-preset/          # AI 编码预设管理
│   ├── create-app/         # 应用模版脚手架
│   ├── i18n-runtime/       # 国际化运行时
│   ├── i18n-tools/         # 国际化自动化工具
│   ├── publish/            # 发布工具
│   ├── sdk/                # SDK
│   ├── sentinel/           # AI Sentinel 工作流
│   ├── tracker/            # 前端埋点数据采集
│   └── visual-testing/     # 视觉回归 + 设计还原度校验
├── packages/                # 组件包（发布到 @aix/*，共 13 个）
│   ├── ai-chat/            # AI 对话组件
│   ├── audio/              # 语音 SDK
│   ├── button/             # 按钮组件
│   ├── code-editor/        # 代码编辑器
│   ├── flow-graph/         # 流程图
│   ├── hooks/              # 公共 Composables
│   ├── icons/              # 图标组件
│   ├── pdf-viewer/         # PDF 查看器
│   ├── popper/             # 弹层定位
│   ├── rich-text-editor/   # 富文本编辑器
│   ├── subtitle/           # 字幕组件
│   ├── theme/              # 主题系统（CSS 变量）
│   └── video/              # 视频播放器
├── scripts/                 # 构建/发布/生成脚本
│   ├── gen/                # 组件包生成器（pnpm gen）
│   ├── publish/            # 本地发布（pnpm pre）
│   └── publish-lint/       # 发布形态体检（pnpm lint:publish）
├── package.json             # 根 package.json
├── pnpm-workspace.yaml      # pnpm workspace 配置
├── turbo.json               # Turborepo 配置
├── rollup.config.js         # Rollup 共享配置
├── vitest.config.ts         # Vitest 配置
└── tsconfig.json            # TypeScript 根配置
```

### 📦 包分类

| 类型 | 目录 | 包名前缀 | 发布 | 说明 |
|------|------|---------|------|------|
| **组件包** | `packages/button/` | `@aix/` | ✅ | 单个 UI 组件 |
| **工具包** | `packages/hooks/` | `@aix/` | ✅ | Composables、工具函数、指令 |
| **主题包** | `packages/theme/` | `@aix/` | ✅ | CSS 变量、主题样式 |
| **内部包** | `internal/eslint-config/` | `@kit/` | ✅ | ESLint、TypeScript、Stylelint 配置 |
| **工具包** | `kit/tracker/` | `@kit/` | ✅ | 独立工具（埋点、国际化、测试等） |
| **文档** | `docs/` | - | ❌ | VitePress 文档站点 |
| **应用** | `apps/*` | - | ❌ | 示例项目和工作台 |

### 📦 标准包结构

每个组件包遵循统一结构：

```
packages/button/
├── src/
│   ├── Button.vue          # 主组件（<Pascal>.vue，不是 index.vue）
│   ├── index.ts            # 具名导出 + default install 插件
│   ├── types.ts            # 对外 Props/Emits 接口（带 @default JSDoc）
│   ├── locale/             # 多语言（接入 useLocale 的包才有）
│   └── components/         # 内部子组件（多组件包才有）
├── stories/Button.stories.ts
├── __test__/Button.test.ts
├── package.json
├── tsconfig.json           # noEmit 检查配置，include stories/ 与 __test__/
├── tsconfig.build.json     # 声明产出，只 include src/
├── rollup.config.js
├── vitest.config.ts        # 必需，缺失则该包测试被根口径静默跳过
├── eslint.config.ts
└── stylelint.config.ts
```

> 由 `pnpm gen` 生成，模板在 `scripts/gen/templates/`。不要手写。

### 🎨 特殊包

#### theme 包

提供 CSS 变量和样式基础：

```
packages/theme/
├── src/
│   ├── vars/               # CSS 变量定义（token 的事实来源）
│   │   ├── base-tokens.css
│   │   ├── semantic-tokens-light.css
│   │   ├── semantic-tokens-dark.css
│   │   └── index.css       # 变量总入口
│   ├── core/               # 主题运行时（createTheme 等）
│   ├── vue/                # Vue 集成
│   ├── cli.ts              # 主题 CLI
│   └── theme-types.ts
└── package.json
```

> 查 token 是否存在一律 `grep -r "--aix-<name>" packages/theme/src/vars/`。
> Token 名是 **camelCase**（`--aix-colorPrimary`），拼错不报错、只会静默失效。

#### hooks 包

可复用的 Vue Composition API：

```
packages/hooks/
├── src/
│   ├── use-namespace/      # BEM class 生成，全库 35 个文件在用
│   ├── use-locale/         # 多语言
│   ├── use-click-outside/
│   ├── use-controllable/
│   ├── use-resize-observer/
│   ├── ...                 # 每个 hook 一个 kebab-case 目录
│   └── index.ts            # 统一出口
└── package.json
```

> 命名是 **kebab-case 目录**（`use-click-outside/`），不是扁平的 `useClickOutside.ts`。
> `AixLocaleMessagesMap` 必须直接声明在 `src/index.ts`——TS 模块增强只能合并目标模块中
> 直接声明的接口，从子模块 re-export 会导致业务侧 `declare module '@aix/hooks'` 无法合并。

### 📊 包依赖关系

```
theme (无依赖)
  ↑
  ├── button (依赖 theme)
  ├── popper (依赖 theme)
  └── video  (依赖 theme)

hooks (无依赖)
  ↑
  ├── button       (依赖 hooks)
  └── pdf-viewer   (依赖 hooks)
```

**依赖原则：**
- theme 包无依赖（只提供 CSS）
- hooks 包无 UI 依赖（只依赖 Vue）
- 组件包可依赖 theme 和 hooks
- 避免循环依赖

---

## pnpm Workspaces

### 配置文件

**pnpm-workspace.yaml**:

```yaml
packages:
  - 'apps/*'
  - 'internal/*'
  - 'kit/*'
  - 'packages/*'
```

### 常用命令

#### 1. 安装依赖

```bash
# 安装所有包的依赖
pnpm install

# 只安装根目录依赖
pnpm install --filter . eslint

# 为指定包安装依赖
pnpm --filter @aix/button add vue

# 为所有组件包安装依赖
pnpm --filter "@aix/*" add -D vitest
```

#### 2. 运行脚本

```bash
# 运行单个包的脚本
pnpm --filter @aix/button dev
pnpm --filter @aix/button build
pnpm --filter @aix/button test

# 运行多个包的脚本
pnpm --filter "@aix/{button,input}" build

# 运行所有包的脚本
pnpm -r build                    # 递归运行所有包
pnpm --parallel -r test          # 并行运行所有包的测试
```

#### 3. 包之间的依赖

```bash
# 添加 workspace 依赖
pnpm --filter @aix/popper add @aix/theme@workspace:^
pnpm --filter @aix/button add @aix/hooks@workspace:^

# 查看包依赖关系
pnpm list --depth 0
pnpm --filter @aix/button list
```

#### 4. 清理

```bash
# 清理所有 node_modules
pnpm -r exec rm -rf node_modules
pnpm install

# 清理构建产物
pnpm -r exec rm -rf dist

# 清理测试覆盖率
pnpm -r exec rm -rf coverage
```

### workspace 协议

**使用 `workspace:^` 引用内部包**:

```json
// packages/button/package.json
{
  "name": "@aix/button",
  "dependencies": {
    "@aix/hooks": "workspace:^",
    "@aix/theme": "workspace:^"
  }
}
```

**发布时自动替换**:

```json
// 发布后自动替换为具体版本
{
  "name": "@aix/button",
  "dependencies": {
    "@aix/hooks": "^1.0.0",
    "@aix/theme": "^1.0.0"
  }
}
```

---

## Turborepo 构建系统

### 配置文件

**turbo.json**:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [
    "**/.env.*local", "internal/typescript-config/*.json", "tsconfig.json",
    "typings/**/*.d.ts", "pnpm-workspace.yaml", ".browserslistrc", "pnpm-lock.yaml"
  ],
  "remoteCache": { "signature": true },
  "tasks": {
    "build":      { "dependsOn": ["^build"], "outputs": ["**/dist/**", "**/lib/**", "**/es/**"], "cache": true },
    "type-check": { "dependsOn": ["^build"], "outputs": [], "cache": true },
    "test":       { "dependsOn": ["^build"], "outputs": [], "cache": true },
    "lint":       { "outputs": [], "cache": true },
    "dev":        { "cache": false, "persistent": true },
    "clean":      { "cache": false }
  }
}
```

> **Turbo 2 的顶层 key 是 `tasks`，不是 `pipeline`**（`pipeline` 在 Turbo 2 已废弃）。
> 产物目录是 `es/` + `lib/`，不是 `dist/`。每个任务都显式声明了 `inputs`（见实际文件），
> 漏声明会导致改了某文件缓存却没失效。

### 任务依赖

```mermaid
graph TD
    A[build @aix/hooks] --> B[build @aix/button]
    A --> C[build @aix/pdf-viewer]
    A --> D[build @aix/video]
    F[build @aix/theme] --> B
    F --> C
    F --> D
```

**`^build` 表示先构建依赖包**:

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],                          // 先构建依赖包
      "outputs": ["**/dist/**", "**/lib/**", "**/es/**"]
    }
  }
}
```

### 常用命令

```bash
# 构建所有包（按依赖顺序）
pnpm build

# 构建指定包及其依赖
pnpm build:filter @aix/button      # 注意：不能写 pnpm build --filter，见下方警告

# 并行运行测试
pnpm test

# 类型检查
pnpm type-check

# Lint 检查
pnpm lint

# 运行各包的 clean 脚本（清构建产物，不是清 turbo 缓存）
pnpm clean

# 清 turbo 缓存
rm -rf .turbo
```

> ⚠️ **`pnpm build --filter @aix/x` 是错的**：`build` 脚本自带 `--filter=!./apps/*`，
> 两个 filter 会被 turbo 取**并集**，实测构建 7 个包而非 1 个。单包构建用 `pnpm build:filter`。
> `test` / `lint` / `clean` 没有预置 filter，`--filter` 可正常使用。

### 缓存机制

Turborepo 会缓存任务输出，加速构建：

```bash
# 首次构建（慢）
$ pnpm build
>>> @aix/hooks:build: cache miss, executing...
>>> @aix/button:build: cache miss, executing...
Time: 15s

# 再次构建（快）
$ pnpm build
>>> @aix/hooks:build: cache hit, replaying output...
>>> @aix/button:build: cache hit, replaying output...
Time: 0.5s
```

**禁用缓存**:

```bash
# 强制重新构建
pnpm build --force

# 配置中禁用缓存
{
  "tasks": {
    "dev": {
      "cache": false  // 开发模式不缓存
    }
  }
}
```

---

## 包管理

### 创建新包

#### 1. 使用脚本创建

```bash
# 创建新的组件包（包名必须 kebab-case，会被 validators.ts 强校验）
pnpm gen tooltip -d "文字提示"
pnpm gen tooltip --dry-run        # 先预览文件清单，不写盘

# 生成的结构（19 个文件，含 --i18n 时）
packages/tooltip/
├── src/
│   ├── Tooltip.vue          # 主组件（不是 index.vue）
│   ├── index.ts             # 具名导出 + default install 插件
│   ├── types.ts             # Props/Emits，带 @default JSDoc
│   ├── useTooltip.ts        # composable（--no-composables 可关）
│   ├── index.scss           # 样式（--no-scss 可关）
│   └── locale/              # 多语言（--i18n）
├── __test__/Tooltip.test.ts
├── stories/Tooltip.stories.ts
├── package.json
├── tsconfig.json            # noEmit 检查配置
├── tsconfig.build.json      # 声明产出配置
├── rollup.config.js
├── vitest.config.ts         # 必需，根 vitest projects 靠它发现包
├── eslint.config.ts
├── stylelint.config.ts
└── README.md
```

> 构建用 **rollup**（`rollup.config.js`），不是 vite——包里没有 `vite.config.ts`。
> 生成器实现见 `scripts/gen/`，模板在 `scripts/gen/templates/*.eta`，是新建包的单一事实来源。

#### 2. 手动创建

**package.json 模板**:

```json
{
  "name": "@aix/tooltip",
  "version": "0.0.0",
  "description": "Tooltip component for AIX",
  "type": "module",
  "main": "./lib/index.cjs",
  "module": "./es/index.js",
  "types": "./es/index.d.ts",
  "style": "./es/index.css",
  "sideEffects": ["*.css", "*.scss", "*.sass"],
  "exports": {
    ".": {
      "import": { "types": "./es/index.d.ts", "default": "./es/index.js" },
      "require": { "types": "./lib/index.d.cts", "default": "./lib/index.cjs" }
    },
    "./style": { "types": "./es/style.d.ts", "default": "./es/index.css" },
    "./package.json": "./package.json"
  },
  "files": ["es", "lib"]
  "scripts": {
    "dev": "vite",
    "build": "vite build && vue-tsc --declaration --emitDeclarationOnly --outDir dist",
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  },
  "keywords": ["vue", "component", "tooltip", "aix"],
  "license": "MIT",
  "peerDependencies": {
    "vue": "^3.5.31"
  },
  "dependencies": {
    "@aix/hooks": "workspace:^",
    "@aix/theme": "workspace:^"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0",
    "vue-tsc": "^1.8.0"
  }
}
```

### 删除包

```bash
# 1. 删除包目录
rm -rf packages/tooltip

# 2. 更新依赖它的包
# 在其他包的 package.json 中移除 @aix/tooltip

# 3. 重新安装依赖
pnpm install

# 4. 重新构建
pnpm build
```

### 重命名包

```bash
# 1. 更新 package.json 的 name 字段
# packages/tooltip/package.json
{
  "name": "@aix/popover"  // 修改包名
}

# 2. 更新所有引用该包的地方
# 搜索并替换 "@aix/tooltip" → "@aix/popover"

# 3. 重新安装依赖
pnpm install

# 4. 重新构建
pnpm build
```

---

## 依赖管理

### 依赖类型

| 类型 | 字段 | 说明 | 示例 |
|------|------|------|------|
| **生产依赖** | `dependencies` | 运行时必需 | `vue`, `@aix/hooks` |
| **开发依赖** | `devDependencies` | 开发时必需 | `vite`, `vitest` |
| **对等依赖** | `peerDependencies` | 宿主项目提供 | `vue`, `react` |
| **可选依赖** | `optionalDependencies` | 可选安装 | 很少使用 |

### 依赖原则

#### 1. 组件包依赖

```json
{
  "name": "@aix/button",
  "peerDependencies": {
    "vue": "^3.5.31"  // Vue 由宿主项目提供
  },
  "dependencies": {
    "@aix/hooks": "workspace:^",  // 内部依赖
    "@aix/theme": "workspace:^"
  },
  "devDependencies": {
    "vue": "^3.5.31",       // 开发时需要 Vue
    "vite": "^5.0.0",      // 构建工具
    "vitest": "^1.0.0"     // 测试工具
  }
}
```

#### 2. 工具包依赖

```json
{
  "name": "@aix/hooks",
  "peerDependencies": {
    "vue": "^3.5.31"
  },
  "dependencies": {
    // 通常没有依赖
  },
  "devDependencies": {
    "vue": "^3.5.31",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

#### 3. 主题包依赖

```json
{
  "name": "@aix/theme",
  "dependencies": {
    // 纯 CSS 包，通常没有依赖
  },
  "devDependencies": {
    "vite": "^5.0.0"  // 构建 CSS
  }
}
```

### 依赖版本管理

#### 统一版本

**根 package.json 管理公共依赖**:

```json
{
  "devDependencies": {
    "vue": "^3.5.31",
    "vite": "^5.0.0",
    "vitest": "^1.0.0",
    "typescript": "^5.9.3"
  }
}
```

#### 版本范围

```json
{
  "dependencies": {
    "vue": "^3.5.31",      // 主版本锁定，允许次版本和补丁版本更新
    "lodash": "~4.17.0",  // 次版本锁定，只允许补丁版本更新
    "dayjs": "1.11.10"    // 精确版本，不允许更新
  }
}
```

### 依赖检查

```bash
# 检查过期依赖
pnpm outdated

# 检查过期依赖（递归）
pnpm -r outdated

# 更新依赖
pnpm update

# 更新依赖（递归）
pnpm -r update
```

---

## 构建优化

### Rollup 配置

**根配置（共享）**:

根 `rollup.config.js` 导出 `createRollupConfig(dirname, formats)`，产出
`es/`（ESM）与 `lib/`（CJS，含 `.d.cts`）。具体实现以该文件为准。

**包配置（引用）**:

```javascript
// packages/button/rollup.config.js
import { createRollupConfig } from '../../rollup.config.js';

// 必须显式传 ['esm', 'cjs']：省略第二参数会默认追加 UMD，
// 产出不发布的 dist/ 死产物
export default createRollupConfig(import.meta.dirname, ['esm', 'cjs']);
```

### 并行构建

```bash
# Turborepo 自动并行构建（依赖包先构建）
pnpm build

# 手动控制并行度
pnpm build --concurrency=4
```

### 增量构建

```bash
# 只构建修改的包及其依赖者
pnpm --filter @aix/button build
```

### 构建产物

每个包的构建产物:

```
packages/button/dist/
├── index.esm.js         # ESM 格式 (import)
├── index.cjs.js         # CJS 格式 (require)
├── index.d.ts           # TypeScript 类型定义
├── style.css            # 样式文件
└── Button.vue.d.ts      # 组件类型定义
```

### 类型生成

```bash
# 生成类型定义
pnpm --filter @aix/button exec vue-tsc --declaration --emitDeclarationOnly

# 自动化类型生成（在 package.json 中）
{
  "scripts": {
    "build": "vite build && vue-tsc --declaration --emitDeclarationOnly --outDir dist"
  }
}
```

---

## 版本管理

### Changesets 工作流

AIX 使用 Changesets 管理版本和 changelog。

#### 1. 添加 Changeset

```bash
# 当你修改了代码后，添加 changeset
pnpm changeset

# 交互式选择
? Which packages would you like to include?
  ◉ @aix/button
  ◯ @aix/popper
  ◯ @aix/video

? What kind of change is this for @aix/button?
  ◯ major (1.0.0 -> 2.0.0) - Breaking change
  ◉ minor (1.0.0 -> 1.1.0) - New feature
  ◯ patch (1.0.0 -> 1.0.1) - Bug fix

? Please enter a summary for this change:
  Add loading state support
```

#### 2. 生成 Changeset 文件

```markdown
<!-- .changeset/cool-lions-jump.md -->
---
'@aix/button': minor
---

Add loading state support
```

#### 3. 版本提升

```bash
# 应用所有 changesets，更新版本号和 CHANGELOG
pnpm changeset version

# 结果：
# - 更新 packages/button/package.json 版本号
# - 生成 packages/button/CHANGELOG.md
# - 删除 .changeset/*.md 文件
```

#### 4. 发布

```bash
# 构建所有包
pnpm build

# 发布到 npm
pnpm changeset publish

# 推送 git tags
git push --follow-tags
```

### 版本策略

| 变更类型 | 版本提升 | 示例 |
|---------|---------|------|
| **Breaking Change** | Major | `1.0.0 -> 2.0.0` |
| **New Feature** | Minor | `1.0.0 -> 1.1.0` |
| **Bug Fix** | Patch | `1.0.0 -> 1.0.1` |

### 预发布版本

```bash
# 进入 pre-release 模式
pnpm changeset pre enter alpha

# 添加 changeset
pnpm changeset

# 版本提升（生成 1.0.0-alpha.0）
pnpm changeset version

# 发布预发布版本
pnpm changeset publish --tag alpha

# 退出 pre-release 模式
pnpm changeset pre exit
```

---

## 常见问题

### Q1: 如何添加新的组件包？

```bash
pnpm gen tooltip -d "文字提示"   # 唯一正确姿势
pnpm install                     # 让 workspace 识别新包
```

不要手动创建包目录——手写的 `package.json` / `tsconfig` 一定会和
`scripts/gen/templates/` 漂移，且极易漏掉 `vitest.config.ts`（漏了测试会被静默跳过）。

### Q2: 如何解决依赖冲突？

```bash
# 1. 查看依赖树
pnpm list vue

# 2. 统一版本（在根 package.json）
{
  "pnpm": {
    "overrides": {
      "vue": "^3.5.31"
    }
  }
}

# 3. 重新安装
pnpm install
```

### Q3: 如何调试依赖包？

```bash
# 方法 1: 使用 pnpm link
cd packages/hooks
pnpm link --global

cd packages/button
pnpm link --global @aix/hooks

# 方法 2: 使用 pnpm --filter 在 dev 模式
pnpm --filter @aix/button dev
pnpm --filter @aix/hooks dev  # 在另一个终端
```

### Q4: 如何处理循环依赖？

```bash
# 检测循环依赖
pnpm list --depth Infinity | grep -E "deduped"

# 解决方案：
# 1. 提取公共代码到独立包
# 2. 使用 devDependencies 而不是 dependencies
# 3. 重新设计包结构

# 示例：
# ❌ 错误
@aix/button depends on @aix/input
@aix/input depends on @aix/button

# ✅ 正确
@aix/button depends on @aix/hooks
@aix/input depends on @aix/hooks
```

### Q5: 构建缓存不更新怎么办？

```bash
# 清除 Turborepo 缓存
pnpm turbo clean

# 清除所有构建产物
pnpm -r exec rm -rf dist

# 强制重新构建
pnpm build --force

# 清除 node_modules 并重新安装
pnpm -r exec rm -rf node_modules
pnpm install
```

### Q6: 如何优化安装速度？

```bash
# 1. 使用 pnpm store 缓存
pnpm config set store-dir ~/.pnpm-store

# 2. 使用 --frozen-lockfile（CI 环境）
pnpm install --frozen-lockfile

# 3. 使用 --prefer-offline
pnpm install --prefer-offline

# 4. 配置 .npmrc
# .npmrc
shamefully-hoist=true
strict-peer-dependencies=false
```

### Q7: 如何跨包共享配置？

```bash
# 1. 创建内部配置包
internal/tsconfig/
├── base.json
├── vue.json
└── package.json

# 2. 子包继承配置
// packages/button/tsconfig.json
{
  "extends": "@kit/typescript-config/vue.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  }
}
```

---

## 最佳实践

### 1. 包设计原则

- ✅ **单一职责**: 每个包只做一件事
- ✅ **最小依赖**: 尽量减少依赖数量
- ✅ **独立构建**: 每个包可以独立构建和测试
- ✅ **按需加载**: 支持 Tree-shaking

### 2. 依赖管理原则

- ✅ **使用 workspace:^**: 内部包使用 workspace 协议
- ✅ **统一版本**: 公共依赖在根 package.json 统一管理
- ✅ **对等依赖**: Vue、React 等框架使用 peerDependencies
- ❌ **避免重复**: 不在多个包中重复安装相同依赖

### 3. 构建优化原则

- ✅ **增量构建**: 只构建修改的包
- ✅ **并行构建**: 利用 Turborepo 并行能力
- ✅ **缓存利用**: 充分利用 Turborepo 缓存
- ✅ **按需引入**: 支持按需引入和 Tree-shaking

### 4. 版本管理原则

- ✅ **语义化版本**: 严格遵循 SemVer
- ✅ **Changelog**: 使用 Changesets 自动生成
- ✅ **原子提交**: 每个 changeset 对应一个功能或修复
- ✅ **CI/CD**: 自动化版本发布流程

---

## 📚 相关文档

- [pnpm Workspaces 文档](https://pnpm.io/workspaces)
- [Turborepo 文档](https://turbo.build/repo/docs)
- [Changesets 文档](https://github.com/changesets/changesets)
- [component-design.md](./component-design.md) - 组件设计规范
- [npm-publishing.md](./npm-publishing.md) - npm 发布流程
