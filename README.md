# AIX Vue 组件库

> 基于 Vue 3 + TypeScript 的企业级组件库 Monorepo，使用 Turborepo 编排、Rollup 构建、Vitest 测试，提供 Storybook 交互文档和 VitePress 使用文档。

## 快速开始

### 创建新组件（推荐）

使用脚手架命令快速创建组件包：

```bash
pnpm gen <component-name>
```

该命令会自动生成标准的组件目录结构，包括 `src/`、`__test__/`、`stories/`、`package.json`、`tsconfig.json`、`rollup.config.js` 等文件。

### 手动创建组件

如需手动创建，请按以下步骤操作：

1. 在 `packages/` 下创建新的组件目录
2. 添加 `package.json` 和 `tsconfig.json`
3. 创建 `rollup.config.js` 并引用根配置:

   ```javascript
   import { createRollupConfig } from '../../rollup.config.js';

   export default createRollupConfig(import.meta.dirname);
   ```

4. 在 `src/index.ts` 导出组件:

   ```typescript
   import type { App } from 'vue';
   import YourComponent from './YourComponent.vue';

   export { YourComponent };

   export default {
     install(app: App) {
       app.component('AixYourComponent', YourComponent);
     },
   };
   ```

## 文档系统

本项目提供两套独立的文档系统：

- **📚 VitePress 文档**: 官方使用文档、API 参考、教程
  - 开发: `pnpm docs:dev`
  - 构建: `pnpm docs:build`
  - 输出: `dist/docs/`

- **📖 Storybook**: 组件开发文档、交互式演示
  - 开发: `pnpm storybook:dev`
  - 构建: `pnpm storybook:build`
  - 输出: `dist/storybook/`

## 使用文档

- [功能清单](#功能清单)
- [目录结构](#目录结构)
- [开发环境](#开发环境)
- [常用脚本](#常用脚本)
- [打包发布](#打包发布)

## 功能清单

- [x] `button` 按钮组件
- [x] `code-editor` 代码编辑器
- [x] `hooks` 公共 Composables
- [x] `icons` 图标组件
- [x] `pdf-viewer` PDF 查看器
- [x] `popper` 弹出层组件
- [x] `rich-text-editor` 富文本编辑器
- [x] `subtitle` 字幕组件
- [x] `theme` 主题系统
- [x] `video` 视频播放器

## 目录结构

```md
├── apps/                        # 应用（不发布到 npm）
│   ├── client/                  #   组件 Demo 预览应用
│   └── server/                  #   后端 API 服务
│
├── packages/                    # 组件包（发布到 npm @aix/*）
│   ├── button/                  #   按钮组件
│   ├── code-editor/             #   代码编辑器组件
│   ├── hooks/                   #   公共 Composables
│   ├── icons/                   #   图标组件
│   ├── pdf-viewer/              #   PDF 查看器组件
│   ├── popper/                  #   弹出层组件
│   ├── rich-text-editor/        #   富文本编辑器组件
│   ├── subtitle/                #   字幕组件
│   ├── theme/                   #   主题系统（CSS Variables）
│   └── video/                   #   视频播放器组件
│
├── internal/                    # monorepo 内部基础设施
│   ├── eslint-config/           #   ESLint 共享配置
│   ├── mcp-server/              #   MCP Server 配置
│   ├── stylelint-config/        #   Stylelint 共享配置
│   └── typescript-config/       #   TypeScript 共享配置
│
├── kit/                         # 独立工具包（发布到 npm @kit/*）
│   ├── ai-preset/               #   AI 编码预设管理
│   ├── i18n-tools/              #   国际化自动化工具
│   ├── sentinel/                #   AI Sentinel 工作流
│   ├── tracker/                 #   前端埋点数据采集
│   └── visual-testing/          #   视觉回归测试
│
├── docs/                        # VitePress 文档源码
├── scripts/                     # 脚本工具
│   ├── docs/                    #   文档生成脚本
│   ├── gen/                     #   组件包脚手架生成器
│   ├── husky/                   #   Git Hooks 脚本
│   ├── link/                    #   Yalc 本地联调脚本
│   └── publish/                 #   npm 发布脚本
│
├── typings/                     # 全局 TypeScript 类型声明
│
├── .cspell.json                 # CSpell 拼写检查配置
├── .markdownlint-cli2.mjs       # Markdownlint 配置
├── commitlint.config.ts         # Git 提交信息规范配置
├── eslint.config.ts             # ESLint 代码检查配置
├── prettier.config.js           # Prettier 代码格式化配置
├── stylelint.config.mjs         # Stylelint 样式检查配置
├── rollup.config.js             # 共享 Rollup 构建配置
├── tsup.config.ts               # tsup 构建配置（工具包）
├── turbo.json                   # Turborepo 任务编排配置
├── tsconfig.json                # TypeScript 根配置
├── vitest.config.ts             # Vitest 测试框架配置
├── vitest.setup.ts              # Vitest 测试环境初始化
├── vitest.config.ts             # Vitest 测试框架配置
├── vitest.setup.ts              # Vitest 测试环境初始化
├── pnpm-workspace.yaml          # pnpm Workspace 配置
└── package.json                 # 根 package.json
```

## 开发环境

<p align="left">
    <a href="https://npmjs.com/package/node"><img src="https://img.shields.io/badge/node-%3E%3D22-green" alt="node"></a>
    <a href="https://npmjs.com/package/npm"><img src="https://img.shields.io/badge/pnpm-%3E%3D10.14.0-blue" alt="pnpm"></a>
</p>

> `pnpm`安装依赖，`typescript` 编写代码。

- 全局安装 `pnpm`

  ```bash
  npm i pnpm -g
  ```

- 使用 `eslint`， `stylelint` 校验代码，`prettier` 格式化代码。需要安装相关的 `vscode` 插件

  - `eslint`: [https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint&ssr=false#review-details]
  - `stylelint`: [https://marketplace.visualstudio.com/items?itemName=stylelint.vscode-stylelint&ssr=false#review-details]
  - `prettier`: [https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode&ssr=false#review-details]
  - `i18n-ally`: [https://marketplace.visualstudio.com/items?itemName=lokalise.i18n-ally&ssr=false#review-details]
  - `css-modules`: [https://marketplace.visualstudio.com/items?itemName=clinyong.vscode-css-modules&ssr=false#review-details]
  - `css-variables`: [https://marketplace.visualstudio.com/items?itemName=vunguyentuan.vscode-css-variables&ssr=false#review-details]
  - `markdownlint`: [https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint&ssr=false#review-details]
  - `nvm`: [https://marketplace.visualstudio.com/items?itemName=henrynguyen5-vsc.vsc-nvm&ssr=false#review-details]

## 常用脚本

### 开发

```bash
pnpm i                    # 安装依赖
pnpm dev                  # 启动所有包的 dev 模式
pnpm gen <name>           # 脚手架创建新组件包
```

### 代码质量

```bash
pnpm lint                 # ESLint + Stylelint 校验
pnpm type-check           # TypeScript 类型检查
pnpm format               # Prettier 格式化
pnpm cspell               # 拼写检查
pnpm lint:md              # Markdown 格式校验
```

### 测试

```bash
pnpm test                 # 运行所有测试
pnpm test:unit            # 仅单元测试
pnpm test:stories         # 仅 Storybook 测试
pnpm test:ui              # 测试 UI 面板
pnpm test:coverage        # 测试覆盖率报告
```

### 文档

```bash
pnpm storybook:dev        # 启动 Storybook（端口 6006）
pnpm docs:dev             # 启动 VitePress 文档
pnpm docs:gen             # 从源码生成 API 文档并同步到 VitePress
pnpm build:docs-all       # 构建 Storybook + VitePress
```

### 提交

```bash
pnpm commit               # 交互式规范化提交（czg）
```

## 打包发布

### 构建输出

每个组件包构建后会生成三个目录：

| 目录 | 格式 | 用途 |
|------|------|------|
| `es/` | ESM | 现代构建工具（Vite/Webpack），支持 Tree-shaking |
| `lib/` | CJS | Node.js / 传统工具兼容 |
| `dist/` | UMD | 浏览器全局变量 |

### 构建命令

- 构建单个包

  ```bash
  cd packages/xxx
  pnpm build
  ```

- 构建指定包

  ```bash
  pnpm build:filter @aix/button
  ```

- 构建所有包

  ```bash
  pnpm build
  ```

### 发布流程

使用 `pnpm pre` 一站式完成发布，脚本基于 changeset 管理版本，流程包括：工作区检查 → npm 登录验证 → 选择发布模式 → 创建变更集 → 更新版本号 → 构建 → 发布 → Git 提交打标签。

```bash
pnpm pre
```

### 本地联调

使用 Yalc 进行本地联调：

```bash
pnpm link:setup     # 初始化 Yalc 链接
pnpm link:publish   # 发布到本地 Yalc
pnpm link:push      # 推送更新到链接的项目
```

## CI/CD 自动化

项目配置了完整的 GitLab CI/CD 流程：

### Pipeline 阶段

1. **代码质量检查**: ESLint、Stylelint、TypeScript 类型检查、拼写检查
2. **单元测试**: Vitest 运行所有测试用例
3. **组件构建**: Rollup 构建所有组件包（ESM/CJS/UMD）
4. **文档构建**: Storybook 和 VitePress 文档
5. **自动部署**: 部署到 GitLab Pages 或独立服务器

### 本地验证

在提交代码前，可分步验证：

```bash
pnpm lint && pnpm type-check && pnpm test && pnpm build
```
