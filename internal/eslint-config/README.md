# @kit/eslint-config

内部共享的 ESLint 配置包，为项目提供统一的代码质量检查和编码规范。

## 安装

```json
{
  "devDependencies": {
    "@kit/eslint-config": "^1.0.0"
  }
}
```

## 使用

### 基础配置 (base)

适用于通用 JavaScript/TypeScript 项目的基础 ESLint 配置。

在项目根目录创建 `eslint.config.js`（ESLint 9+ 扁平化配置）：

```javascript
import { config } from '@kit/eslint-config/base';

export default [
  ...config,
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

## 配置说明

### base 配置特性

**集成的插件和规则**

| 插件 | 说明 |
|------|------|
| `@eslint/js` | JavaScript 官方推荐规则 |
| `typescript-eslint` | TypeScript 官方推荐规则 |
| `eslint-config-prettier` | 禁用与 Prettier 冲突的规则 |
| `eslint-plugin-turbo` | Turborepo 相关规则 |

**忽略目录**

```
node_modules, deploy, build, dist, logs, es, lib, .rollup.cache
```

### vue-app 配置特性

在 base 配置基础上增加：

**Vue 3 支持**

| 特性 | 说明 |
|------|------|
| Vue 3 官方推荐规则 | eslint-plugin-vue |
| `<script setup>` 语法 | 完整支持 |
| 多根节点组件 | 允许 |
| 单词组件名 | 允许（如 `Button.vue`）|
| `v-html` 指令 | 允许 |

**TypeScript 集成**

| 特性 | 说明 |
|------|------|
| Vue 文件解析 | `<script>` 使用 TypeScript 解析器 |
| 项目引用 | 支持 |
| `any` 类型 | 允许（组件库开发灵活性）|
| 非空断言 | 允许 |

**Import 规则**

| 特性 | 说明 |
|------|------|
| 路径解析 | TypeScript 路径解析支持 |
| 别名支持 | `@` → `./src`，`~` → `./` |
| 自动排序 | 字母顺序，不区分大小写 |

## 规则说明

### TypeScript 规则

| 规则 | 设置 | 原因 |
|------|------|------|
| `@typescript-eslint/no-explicit-any` | off | 组件库需要处理各种类型 |
| `@typescript-eslint/no-non-null-assertion` | off | 内部有明确的类型保证 |
| `@typescript-eslint/no-empty-object-type` | off | 常用于接口扩展 |
| `@typescript-eslint/no-unused-vars` | warn | 下划线开头变量忽略 |

### Vue 规则

| 规则 | 设置 | 原因 |
|------|------|------|
| `vue/multi-word-component-names` | off | 允许 Button.vue 等单词组件 |
| `vue/no-multiple-template-root` | off | Vue 3 支持多根节点 |
| `vue/no-v-html` | off | 组件库可能需要动态 HTML |

### 通用规则

| 规则 | 设置 | 说明 |
|------|------|------|
| `no-console` | prod: warn | 生产环境警告（保留 warn/error）|
| `no-debugger` | prod: error | 生产环境禁止 |
| `import/order` | error | Import 语句按字母排序 |
| `no-restricted-syntax` | error | 禁止 label 和 with 语句 |

## 使用场景

### 1. Vue 组件库

```javascript
// eslint.config.js
import { config } from '@kit/eslint-config/vue-app';

export default config;
```

### 2. TypeScript 库

```javascript
// eslint.config.js
import { config } from '@kit/eslint-config/base';

export default [
  ...config,
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
      'no-console': 'error',
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
```

## 开发工具集成

### VS Code

```json
{
  "eslint.validate": ["javascript", "typescript", "vue", "html", "markdown"],
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

## 配置对比

| 特性 | base | vue-app |
|------|------|---------|
| JavaScript/TypeScript | ✅ | ✅ |
| Vue 3 | ❌ | ✅ |
| Import 规则 | ❌ | ✅ |
| 路径别名 | ❌ | ✅ |
| 适用场景 | 通用库 | Vue 组件库/应用 |
