---
name: package-creator
description: 快速创建新组件包，生成标准目录结构、配置文件和模板代码
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "1.0.0"
  category: scaffold
---

# 包创建器 Skill

## 功能概述

在 monorepo 中快速创建一个新的组件包，自动生成：
- 标准目录结构
- package.json 配置
- tsconfig.json 配置
- rollup.config.js 配置
- 基础组件文件
- Storybook story 文件（可选）
- 测试文件（可选）

## 使用方式

```bash
# 方式 1: 基础用法
/package-creator Select --description="下拉选择器"

# 方式 2: 完整配置
/package-creator Dropdown --description="下拉菜单组件" --with-story --with-test

# 方式 3: 交互式模式
/package-creator
```

### 参数说明

| 参数 | 说明 | 默认值 | 示例 |
|------|------|-------|------|
| 包名称 | 包名称（kebab-case） | 必需 | `Select`, `DatePicker` |
| `--description` | 包描述 | 必需 | `--description="下拉选择器"` |
| `--with-story` | 是否生成 Storybook story | `true` | `--with-story` |
| `--with-test` | 是否生成测试文件 | `true` | `--with-test` |

## 执行流程

### 步骤 1: 收集信息

解析用户输入或使用 AskUserQuestion 工具询问：

**必需信息:**
- 包名称 (PascalCase，如 `Select`, `DatePicker`)
- 包描述 (用于 package.json 的 description 字段)

**可选信息:**
- `--with-story`: 是否生成 Storybook story（默认 true）
- `--with-test`: 是否生成测试文件（默认 true）

### 步骤 2: 检查包是否已存在

使用 Bash 工具检查目录是否存在：

```bash
ls packages/{package-name}
```

如果已存在，提示用户并退出。

### 步骤 3: 创建目录结构

```
packages/
  └── {package-name}/
      ├── src/
      │   ├── {ComponentName}.vue       # 组件主文件
      │   └── index.ts                  # 导出文件
      ├── __tests__/
      │   └── {ComponentName}.test.ts   # 测试文件
      ├── stories/
      │   └── {ComponentName}.stories.ts  # Story 文件
      ├── package.json
      ├── tsconfig.json
      └── rollup.config.js
```

### 步骤 4: 生成配置文件

#### package.json

```json
{
  "name": "@aix/{package-name}",
  "version": "0.0.1",
  "description": "{description}",
  "type": "module",
  "main": "./dist/index.cjs.js",
  "module": "./dist/index.esm.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.esm.js",
      "require": "./dist/index.cjs.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "dev": "rollup -c -w",
    "build": "pnpm build:js && pnpm build:types",
    "build:js": "rollup -c",
    "build:types": "vue-tsc -p tsconfig.json --declaration --emitDeclarationOnly --outDir dist",
    "lint": "eslint src",
    "test": "vitest"
  },
  "peerDependencies": {
    "vue": "^3.5.31"
  },
  "devDependencies": {
    "@kit/eslint-config": "workspace:^",
    "@kit/typescript-config": "workspace:^"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

#### tsconfig.json

```json
{
  "extends": "@kit/typescript-config/vue.json",
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

#### rollup.config.js

```javascript
import { createRollupConfig } from '../../rollup.config.js';

export default createRollupConfig(import.meta.dirname);
```

### 步骤 5: 生成组件模板

创建基础组件文件、Story 文件和测试文件（参考 component-generator 的模板）。

### 步骤 6: 更新 pnpm workspace

包会自动被 pnpm workspace 识别（因为在 packages/ 目录下）。

### 步骤 7: 安装依赖

```bash
pnpm install
```

### 步骤 8: 构建验证

```bash
cd packages/{package-name}
pnpm build
```

### 步骤 9: 展示结果

```
✅ 组件包创建成功！

📦 包信息:
   名称: @aix/{package-name}
   描述: {description}
   路径: packages/{package-name}/

📁 生成的文件:
   ✓ package.json
   ✓ tsconfig.json
   ✓ rollup.config.js
   ✓ src/{ComponentName}.vue
   ✓ src/index.ts
   ✓ stories/{ComponentName}.stories.ts
   ✓ __tests__/{ComponentName}.test.ts

💡 下一步:
   1. 开发组件: cd packages/{package-name}
   2. 运行 Storybook: pnpm storybook:dev
   3. 运行测试: pnpm test
   4. 构建包: pnpm build
```

## 遵守的规范

### 1. 包命名规范

- 包名称使用 kebab-case: `select`, `date-picker`
- 组件名称使用 PascalCase: `Select`, `DatePicker`
- NPM 包名: `@aix/{package-name}`

### 2. 版本管理

- 初始版本: `0.0.1`
- 使用 changesets 管理版本

### 3. 文件组织

```
packages/{package-name}/
├── src/                  # 源代码
│   ├── *.vue            # 组件文件
│   └── index.ts         # 导出文件
├── __tests__/           # 测试文件
├── stories/             # Storybook stories
├── dist/                # 构建输出（gitignore）
├── package.json
├── tsconfig.json
└── rollup.config.js
```

### 4. 导出规范

```typescript
// src/index.ts
import type { App } from 'vue';
import ComponentName from './ComponentName.vue';

// 默认导出
export { ComponentName };
export default ComponentName;

// Vue Plugin
export const install = (app: App) => {
  app.component('AixComponentName', ComponentName);
};
```

## 示例

### 创建 Select 组件包

```bash
# 1. 创建包
/package-creator Select --description="下拉选择器组件" --with-story --with-test

# 2. 进入包目录
cd packages/select

# 3. 开发组件
# 编辑 src/Select.vue

# 4. 查看 Storybook
pnpm storybook:dev

# 5. 运行测试
pnpm test

# 6. 构建
pnpm build

# 7. 发布
pnpm changeset
pnpm version-packages
pnpm publish
```

## 相关文档

- [project-structure.md](../agents/project-structure.md) - 项目结构和 Monorepo 管理指导
- [component-generator.md](./component-generator.md) - 组件生成器
- [npm-publishing.md](../agents/npm-publishing.md) - npm 发布流程
