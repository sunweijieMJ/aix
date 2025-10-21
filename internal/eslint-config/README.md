# @kit/eslint-config

内部共享的 ESLint 配置包，为项目提供统一的代码质量检查和编码规范。

## 📦 安装

此包为内部包，通过 workspace 协议安装：

```json
{
  "devDependencies": {
    "@kit/eslint-config": "workspace:*"
  }
}
```

## 🚀 使用

### 基础配置 (base)

适用于通用 JavaScript/TypeScript 项目的基础 ESLint 配置。

在项目根目录创建 `eslint.config.js`（ESLint 9+ 扁平化配置）：

```javascript
import { baseConfig } from '@kit/eslint-config/base';

export default [
  ...baseConfig,
  {
    // 项目自定义规则
  }
];
```

### Vue 应用配置 (vue-app)

适用于 Vue 3 组件库和应用开发的完整配置。

```javascript
import { config } from '@kit/eslint-config/vue-app';

export default config;
```

## ⚙️ 配置说明

### base 配置特性

**集成的插件和规则**
- ✅ `@eslint/js`: JavaScript 官方推荐规则
- ✅ `typescript-eslint`: TypeScript 官方推荐规则
- ✅ `eslint-config-prettier`: 禁用与 Prettier 冲突的规则
- ✅ `eslint-plugin-turbo`: Turborepo 相关规则

**忽略目录**
```
node_modules, deploy, build, dist, logs, es, lib, .rollup.cache
```

### vue-app 配置特性

在 base 配置基础上增加：

**Vue 3 支持**
- ✅ Vue 3 官方推荐规则
- ✅ 支持 `<script setup>` 语法
- ✅ 支持多根节点组件
- ✅ 允许单词组件名（如 `Button.vue`）
- ✅ 允许 `v-html` 指令

**TypeScript 集成**
- Vue 文件中的 `<script>` 使用 TypeScript 解析器
- 支持项目引用和类型检查
- 允许 `any` 类型（组件库开发灵活性）
- 允许非空断言和空对象类型

**Import 规则**
- ✅ TypeScript 路径解析支持
- ✅ 别名支持：`@` → `./src`，`~` → `./`
- ✅ Import 自动排序（字母顺序，不区分大小写）
- ✅ 无需强制默认导出

**代码质量规则**
- 生产环境禁用 `console.log`（保留 `warn` 和 `error`）
- 生产环境禁用 `debugger`
- 下划线前缀变量忽略未使用检查（如 `_unused`）
- 灵活的解构和参数配置

## 📋 使用场景

### 1. Vue 组件库

```javascript
// eslint.config.js
import { config } from '@kit/eslint-config/vue-app';

export default config;
```

### 2. TypeScript 库

```javascript
// eslint.config.js
import { baseConfig } from '@kit/eslint-config/base';

export default [
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  },
];
```

### 3. 自定义扩展

```javascript
// eslint.config.js
import { config } from '@kit/eslint-config/vue-app';

export default [
  ...config,
  {
    rules: {
      // 覆盖或新增规则
      'no-console': 'error',
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
    },
  },
  {
    // 特定文件的规则
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
```

## 🔧 集成开发工具

### VS Code

安装 ESLint 扩展并在 `.vscode/settings.json` 中配置：

```json
{
  "eslint.validate": [
    "javascript",
    "typescript",
    "vue",
    "html",
    "markdown"
  ],
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

### package.json 脚本

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

## 📖 规则说明

### TypeScript 规则调整

| 规则 | 设置 | 原因 |
|------|------|------|
| `@typescript-eslint/no-explicit-any` | off | 组件库需要处理各种类型 |
| `@typescript-eslint/no-non-null-assertion` | off | 内部有明确的类型保证 |
| `@typescript-eslint/no-empty-object-type` | off | 常用于接口扩展 |
| `@typescript-eslint/no-unused-vars` | warn | 下划线开头变量忽略 |

### Vue 规则调整

| 规则 | 设置 | 原因 |
|------|------|------|
| `vue/multi-word-component-names` | off | 允许 Button.vue 等单词组件 |
| `vue/no-multiple-template-root` | off | Vue 3 支持多根节点 |
| `vue/no-v-html` | off | 组件库可能需要动态 HTML |

### 通用规则

| 规则 | 设置 | 说明 |
|------|------|------|
| `no-console` | prod: warn | 生产环境警告（保留 warn/error） |
| `no-debugger` | prod: error | 生产环境禁止 |
| `import/order` | error | Import 语句按字母排序 |
| `camelcase` | off | 不强制驼峰命名 |

## 🆚 配置对比

| 特性 | base | vue-app |
|------|------|---------|
| JavaScript/TypeScript | ✅ | ✅ |
| Vue 3 | ❌ | ✅ |
| Import 规则 | ❌ | ✅ |
| 路径别名 | ❌ | ✅ |
| 适用场景 | 通用库 | Vue 组件库/应用 |

## 📄 License

MIT
