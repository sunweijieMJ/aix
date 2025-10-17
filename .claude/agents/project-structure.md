---
name: project-structure
description: Vue组件库项目结构解析、目录组织规范和开发指导
---

# 项目结构解析 Agent

## 职责
负责Vue组件库项目结构解析、目录组织规范和开发指导，帮助AI理解组件库的布局和各目录的作用。

## 🏗️ 项目整体架构

### 技术栈
- **前端框架**: Vue 3.5.22 (Composition API)
- **构建工具**: Rollup 4.52.4 + Vite 6.4.0
- **包管理**: pnpm 10.14.0 (Workspace模式)
- **Monorepo**: Turborepo 2.5.8
- **语言**: TypeScript 5.9.3
- **组件展示**: Storybook 8.6.14
- **测试框架**: Vitest 3.2.4
- **样式**: SCSS + PostCSS

### 架构模式
- **Monorepo架构**: 使用pnpm workspace + Turborepo管理多包
- **组件化设计**: 每个组件独立npm包
- **统一构建**: 根目录统一Rollup配置,所有组件共享
- **类型驱动**: TypeScript严格类型检查
- **测试驱动**: 每个组件都有对应的测试用例

## 📁 目录结构详解

```
vue-library/
├── .changeset/                 # Changesets版本管理
├── .claude/                    # Claude AI配置
│   └── agents/                 # AI Agent配置文件
├── .husky/                     # Git hooks配置
│   ├── commit-msg             # 提交信息检查
│   ├── pre-commit             # 提交前检查
│   └── pre-push               # 推送前检查
├── .storybook/                 # Storybook配置
│   ├── main.ts                # Storybook主配置
│   └── preview.ts             # 预览配置
├── internal/                   # 内部工具包
│   ├── eslint-config/         # ESLint配置包
│   ├── mcp-server/            # MCP服务器
│   ├── stylelint-config/      # Stylelint配置包
│   └── typescript-config/     # TypeScript配置包
├── packages/                   # 组件包目录
│   ├── button/                # Button组件
│   │   ├── __test__/          # 测试文件
│   │   ├── src/               # 源代码
│   │   │   ├── Button.vue     # 组件实现
│   │   │   └── index.ts       # 组件导出
│   │   ├── stories/           # Storybook故事
│   │   ├── package.json       # 组件包配置
│   │   ├── rollup.config.js   # 引用根配置
│   │   └── tsconfig.json      # TypeScript配置
│   └── theme/                 # 主题包
│       ├── src/               # 样式源码
│       │   ├── index.scss     # 主样式文件
│       │   ├── mixins/        # SCSS混入
│       │   └── vars/          # CSS变量
│       ├── package.json       # 主题包配置
│       └── rollup.config.js   # 构建配置
├── scripts/                    # 构建和工具脚本
│   ├── commit-msg/            # 提交信息检查脚本
│   ├── pre-commit/            # 提交前检查脚本
│   ├── pre-push/              # 推送前检查脚本
│   ├── pre-publish/           # 发布前检查脚本
│   └── gen.ts                 # 组件生成脚本
├── typings/                    # TypeScript类型声明
│   ├── global.d.ts            # 全局类型
│   ├── suffix.d.ts            # 文件后缀类型
│   └── worker.d.ts            # Worker类型
├── .browserslistrc            # 浏览器兼容性配置
├── .cspell.json               # 拼写检查配置
├── .editorconfig              # 编辑器配置
├── .gitignore                 # Git忽略配置
├── .gitlab-ci.yml             # GitLab CI配置
├── .markdownlint.json         # Markdown检查配置
├── .nvmrc                     # Node版本配置
├── .prettierignore            # Prettier忽略配置
├── commitlint.config.ts       # Commitlint配置
├── eslint.config.ts           # ESLint配置
├── package.json               # 根包配置
├── pnpm-lock.yaml             # 依赖锁文件
├── pnpm-workspace.yaml        # Workspace配置
├── prettier.config.js         # Prettier配置
├── rollup.config.js           # 统一Rollup配置
├── stylelint.config.js        # Stylelint配置
├── tsconfig.json              # TypeScript配置
├── turbo.json                 # Turborepo配置
├── vitest.config.ts           # Vitest配置
└── vitest.setup.ts            # Vitest设置文件
```

## 📂 核心目录详解

### `packages/` - 组件包目录
```
packages/
├── button/                     # 按钮组件
│   ├── __test__/              # 测试文件
│   │   └── Button.test.ts     # 单元测试
│   ├── src/                   # 源代码
│   │   ├── Button.vue         # 组件实现
│   │   └── index.ts           # 组件导出
│   ├── stories/               # Storybook故事
│   │   └── Button.stories.ts  # 组件故事
│   ├── package.json           # 组件包配置
│   ├── rollup.config.js       # 构建配置(引用根配置)
│   └── tsconfig.json          # TypeScript配置
└── theme/                      # 主题包
    ├── src/                   # 样式源码
    │   ├── index.scss         # 主样式文件
    │   ├── mixins/            # SCSS混入
    │   │   ├── ellipsis.scss  # 文本省略
    │   │   └── index.scss     # 混入导出
    │   └── vars/              # CSS变量
    │       ├── dark.css       # 暗色主题
    │       ├── light.css      # 亮色主题
    │       └── size.css       # 尺寸变量
    ├── package.json           # 主题包配置
    ├── rollup.config.js       # 构建配置
    └── stylelint.config.ts    # Stylelint配置
```

**组件包命名规范**:
- 包名: `@aix/组件名` (如 `@aix/button`)
- 目录名: 小写短横线 (如 `button`, `date-picker`)
- 组件名: PascalCase (如 `Button.vue`, `DatePicker.vue`)

**组件包结构要求**:
- 必须包含: `package.json`, `tsconfig.json`, `rollup.config.js`
- 必须包含: `src/index.ts` (组件导出文件)
- 建议包含: `__test__/` (测试文件)
- 建议包含: `stories/` (Storybook故事)
- 建议包含: `README.md` (组件文档)

### `internal/` - 内部工具包
```
internal/
├── eslint-config/              # ESLint配置包
│   ├── base.js                # 基础配置
│   ├── vue-app.js             # Vue应用配置
│   ├── package.json           # 包配置
│   └── index.d.ts             # 类型声明
├── mcp-server/                 # MCP服务器
│   ├── __test__/              # 测试文件
│   ├── examples/              # 示例配置
│   ├── src/                   # 源代码
│   │   ├── cli.ts             # 命令行工具
│   │   ├── config/            # 配置
│   │   ├── extractors/        # 提取器
│   │   ├── mcp-resources/     # MCP资源
│   │   ├── mcp-tools/         # MCP工具
│   │   ├── server/            # 服务器
│   │   └── utils/             # 工具函数
│   ├── package.json           # 包配置
│   ├── tsconfig.json          # TypeScript配置
│   └── tsup.config.ts         # 构建配置
├── stylelint-config/           # Stylelint配置包
│   ├── base.js                # 基础配置
│   ├── vue-app.js             # Vue应用配置
│   └── package.json           # 包配置
└── typescript-config/          # TypeScript配置包
    ├── base.json              # 基础配置
    ├── base-app.json          # 应用配置
    └── package.json           # 包配置
```

**作用**:
- 统一管理项目的配置
- 配置包可复用到其他项目
- 内部包不会发布到npm

### `.storybook/` - Storybook配置
```
.storybook/
├── main.ts                     # Storybook主配置
└── preview.ts                  # 预览配置
```

**作用**:
- 配置Storybook构建和预览
- 配置插件和装饰器
- 组件开发和展示平台

### `scripts/` - 自动化脚本
```
scripts/
├── commit-msg/                 # Git提交信息检查
│   └── index.ts               # 检查脚本
├── pre-commit/                 # 提交前检查
│   └── index.ts               # 检查脚本
├── pre-push/                   # 推送前检查
│   └── index.ts               # 检查脚本
├── pre-publish/                # 发布前检查
│   └── index.ts               # 检查脚本
└── gen.ts                      # 组件生成脚本
```

**作用**:
- 自动化Git工作流
- 代码质量检查
- 组件快速生成

### `typings/` - 类型声明
```
typings/
├── global.d.ts                 # 全局类型声明
├── index.d.ts                  # 类型导出
├── suffix.d.ts                 # 文件后缀类型声明
├── worker.d.ts                 # Worker类型声明
└── audio.d.ts                  # 音频类型声明
```

**作用**:
- 全局类型定义
- 第三方库类型补充
- 资源文件类型声明

## 🔄 文件引用规范

### 组件包引用规范
```typescript
// ✅ 正确：使用workspace协议引用内部包
// package.json
{
  "dependencies": {
    "@aix/theme": "workspace:*"
  }
}

// ✅ 正确：在组件中引用主题
import '@aix/theme';

// ❌ 错误：使用相对路径
import '../../theme/src/index.scss';
```

### 导入顺序规范
```typescript
// 1. Vue相关导入
import { ref, computed, defineComponent } from 'vue';
import type { PropType } from 'vue';

// 2. 第三方库导入
import type { App } from 'vue';

// 3. 项目内部导入
import '@aix/theme';

// 4. 类型导入
import type { ButtonType, ButtonSize } from './types';
```

## 📋 新增组件指导

### 使用自动生成脚本
```bash
# 运行组件生成脚本
pnpm gen

# 根据提示输入组件信息
# - 组件名称 (如: DatePicker)
# - 组件描述
# - 是否需要测试文件
# - 是否需要Storybook故事
```

### 手动创建组件
```bash
# 1. 创建组件目录
mkdir packages/date-picker

# 2. 创建必需文件
cd packages/date-picker
touch package.json tsconfig.json rollup.config.js

# 3. 创建源码目录
mkdir src __test__ stories
touch src/DatePicker.vue src/index.ts
touch __test__/DatePicker.test.ts
touch stories/DatePicker.stories.ts
```

### 组件package.json模板
```json
{
  "name": "@aix/date-picker",
  "version": "0.0.1",
  "description": "Aix DatePicker Component",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./dist/style.css": "./dist/style.css"
  },
  "files": ["dist"],
  "scripts": {
    "dev": "rollup -c -w",
    "build": "rollup -c && vue-tsc --declaration --emitDeclarationOnly",
    "clean": "rimraf dist",
    "test": "vitest"
  },
  "peerDependencies": {
    "vue": "^3.5.22"
  },
  "devDependencies": {
    "@aix/theme": "workspace:*"
  }
}
```

### rollup.config.js模板
```javascript
import { createRollupConfig } from '../../rollup.config.js';

export default createRollupConfig(import.meta.dirname);
```

### src/index.ts模板
```typescript
import type { App } from 'vue';
import DatePicker from './DatePicker.vue';

export { DatePicker };

export default {
  install(app: App) {
    app.component('AixDatePicker', DatePicker);
  },
};
```

## 🎯 开发工作流

### 1. 开发组件
```bash
# 启动开发模式 (所有组件并行编译)
pnpm dev

# 或单独开发某个组件
cd packages/button
pnpm dev
```

### 2. 运行Storybook
```bash
# 启动Storybook开发服务器
pnpm preview
```

### 3. 运行测试
```bash
# 运行所有测试
pnpm test

# 运行测试UI
pnpm test:ui

# 单独测试某个组件
cd packages/button
pnpm test
```

### 4. 代码检查
```bash
# ESLint检查
pnpm lint

# TypeScript类型检查
pnpm type-check

# 格式化代码
pnpm format

# 拼写检查
pnpm cspell

# Markdown检查
pnpm lint:md
```

### 5. 构建组件
```bash
# 构建所有组件
pnpm build

# 构建指定组件
pnpm build:filter @aix/button

# 或进入组件目录构建
cd packages/button
pnpm build
```

### 6. 提交代码
```bash
# 使用交互式提交
pnpm commit

# 或直接git commit (会自动运行检查)
git commit -m "feat: add new component"
```

### 7. 发布组件
```bash
# 1. 创建版本变更
pnpm changeset

# 2. 更新版本号
pnpm changeset version

# 3. 构建所有组件
pnpm build

# 4. 发布到npm
pnpm changeset publish
```

## 🎯 AI编程指导原则

### 1. 目录选择原则
- **新组件** → `packages/组件名/`
- **主题样式** → `packages/theme/src/`
- **工具配置** → `internal/配置包/`
- **类型定义** → `typings/` 或组件内部
- **测试文件** → `packages/组件名/__test__/`
- **Storybook故事** → `packages/组件名/stories/`

### 2. 文件命名原则
- **组件文件**: PascalCase.vue (如 `Button.vue`)
- **导出文件**: `index.ts`
- **测试文件**: 组件名.test.ts (如 `Button.test.ts`)
- **故事文件**: 组件名.stories.ts (如 `Button.stories.ts`)
- **样式文件**: kebab-case.scss (如 `button.scss`)

### 3. 包命名原则
- **作用域**: `@aix/`
- **包名**: 小写短横线 (如 `@aix/date-picker`)
- **组件名**: PascalCase (如 `DatePicker`)
- **全局组件名**: `Aix` + 组件名 (如 `AixDatePicker`)

### 4. 构建配置原则
- **统一配置**: 所有组件使用根目录的`rollup.config.js`
- **引用方式**: `import { createRollupConfig } from '../../rollup.config.js'`
- **输出格式**: ESM (.mjs) + CJS (.cjs) + 类型声明 (.d.ts)
- **样式输出**: 独立的 style.css 文件

### 5. 依赖管理原则
- **公共依赖**: 只在根package.json声明
- **组件依赖**: 只声明peerDependencies (vue)
- **内部依赖**: 使用workspace协议 (`workspace:*`)
- **开发依赖**: 在根package.json统一管理

## 📊 Monorepo最佳实践

### Turborepo任务编排
```json
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

### Workspace依赖管理
```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'internal/*'
```

### 版本管理 (Changesets)
```bash
# 1. 添加变更记录
pnpm changeset

# 2. 选择变更类型
# - major: 破坏性变更
# - minor: 新功能
# - patch: Bug修复

# 3. 更新版本
pnpm changeset version

# 4. 发布
pnpm changeset publish
```

通过遵循这些项目结构和组织原则，可以确保组件库的可维护性和可扩展性，为AI编程提供清晰的指导。
