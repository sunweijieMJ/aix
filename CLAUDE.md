# CLAUDE.md - AI 开发助手快速指南

## Git 提交规则
- **提交格式**: `type: subject` 或 `type(scope): subject`
- **语言**: commit subject 推荐使用中文
- **示例**: `feat: 添加用户登录功能` 或 `fix(button): 修复点击态样式问题`
- **AI 标识**: 提交代码时不要添加 Co-Authored-By 签名，改为在 commit 末尾添加：🤖 Generated with AI

> 本文档专为 AI 助手设计，提供组件库项目快速概览。人类开发者请查看 [README.md](README.md)

## 核心技术栈
- **框架**: Vue 3 (Composition API + `<script setup>`)
- **语言**: TypeScript (严格类型检查)
- **构建**: Rollup (ESM/CJS 双格式输出) + Turbo (monorepo 编排)
- **测试**: Vitest + Vue Test Utils (jsdom 环境)
- **样式**: Sass + PostCSS + CSS Variables
- **文档**: Storybook + VitePress
- **包管理**: pnpm (workspace 协议)
- **代码质量**: ESLint + Stylelint + Prettier + CSpell + Commitlint

**项目定位**: Vue 3 组件库 Monorepo，强调**类型安全**、**样式隔离**、**Tree-shaking** 和**开发规范**。发布到 npm，供业务项目引用。

---

## Monorepo 架构

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
├── internal/          # 内部共享工具包 (发布到 npm @kit/*)
├── rollup.config.js   # 共享 Rollup 配置
└── turbo.json         # Turbo 任务编排
```

**关键规则**:
- `packages/` 以 `@aix/` scope 发布，`internal/` 以 `@kit/` scope 发布
- 包间依赖使用 `workspace:^` 协议
- 每个组件包独立 `rollup.config.js`，继承根配置

## 构建输出

| 格式 | 目录 | 用途 |
|------|------|------|
| **ESM** | `es/` | 现代打包工具，支持 Tree-shaking |
| **CJS** | `lib/` | Node.js / 传统工具兼容 |

类型声明: `vue-tsc` 生成 `.d.ts` 到 `es/` 目录

## 主题系统

所有组件样式基于 `@aix/theme` 包的 CSS Variables：
```scss
// 正确: 使用 CSS 变量
.aix-button {
  color: var(--aix-color-primary);
  border-radius: var(--aix-border-radius);
}

// 错误: 硬编码颜色值（禁止!）
.aix-button { color: #1890ff; }
```

## 组件包结构规范

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

## 重要约定和禁忌

### 禁止事项

| 禁止操作 | 说明 |
|---------|------|
| 修改 `es/`、`lib/`、`dist/` | 构建产物，自动生成 |
| 硬编码颜色值 | 必须使用 `@aix/theme` 的 CSS Variables |
| 组件间直接引用源码 | 必须通过 `workspace:^` 依赖引用 |
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

## 常用命令

```bash
pnpm dev                  # 启动所有包的 dev 模式
pnpm build                # 全量构建
pnpm build:filter -- --filter=@aix/<name>  # 单包构建
pnpm lint                 # ESLint 检查
pnpm type-check           # TypeScript 类型检查
pnpm cspell               # 拼写检查
pnpm test                 # 单元测试
pnpm storybook:dev        # 启动 Storybook
pnpm commit               # 交互式提交 (czg)
```

## 智能工作流

项目配置了完整的 Skills、Agents 和 Commands，支持组件库开发全流程自动化。详见 `.claude/` 目录和 `.claude/README.md`。

<!-- sentinel:start -->
# Sentinel 规范（供 CI 中的 Claude Code 使用）

## 修复原则
- 最小改动原则：只改必要的代码
- 不做额外重构、不添加新功能
- 不修改测试用例来让测试通过
- 不确定时宁可不改，输出分析报告

## 文件权限
- 允许修改: apps/, packages/
- 禁止修改: `tests/**`, `__tests__/**`, `__test__/**`
- 禁止修改: *.config.*, .env*
- 禁止修改: package.json (依赖变更需人工决策)
- 禁止修改: .github/workflows/**

## 修复质量要求
- 修复后代码必须通过 TypeScript 类型检查
- 不引入 any 类型来绕过类型错误
- 保持现有代码风格一致
- 添加必要的注释说明修复原因

<!-- sentinel:end -->
