# @kit/stylelint-config

内部共享的 Stylelint 配置包，为项目提供统一的 CSS/SCSS 代码质量检查和样式规范。

## 📦 安装

此包为内部包，通过 workspace 协议安装：

```json
{
  "devDependencies": {
    "@kit/stylelint-config": "workspace:*",
    "postcss": "^8.0.0",
    "postcss-html": "^1.0.0",
    "postcss-scss": "^4.0.0"
  }
}
```

> **注意**：需要额外安装 `postcss`, `postcss-html`, `postcss-scss` 以支持不同的文件格式。

## 🚀 使用

### 基础配置 (base)

适用于通用 SCSS 项目的基础 Stylelint 配置。

在项目根目录创建 `stylelint.config.js`：

```javascript
import baseConfig from '@kit/stylelint-config/base.js';

export default baseConfig;
```

或使用 CommonJS：

```javascript
module.exports = require('@kit/stylelint-config/base.js');
```

### Vue 应用配置 (vue-app)

适用于 Vue 3 组件库和应用开发，包含 Vue SFC 支持。

```javascript
import vueAppConfig from '@kit/stylelint-config/vue-app.js';

export default vueAppConfig;
```

## ⚙️ 配置说明

### base 配置特性

**扩展的规则集**
- ✅ `stylelint-config-standard-scss`: SCSS 官方标准配置
- ✅ `stylelint-config-property-sort-order-smacss`: SMACSS 属性排序规则

**集成的插件**
- `stylelint-scss`: SCSS 特定规则
- `stylelint-order`: CSS 属性排序规则

**关键规则**
- `max-nesting-depth: 15`: 限制 SCSS 嵌套深度
- `selector-max-id: 6`: 限制 ID 选择器数量
- `selector-max-compound-selectors: 15`: 限制复合选择器数量
- `color-function-notation: 'modern'`: 使用现代颜色函数语法
- `alpha-value-notation: ['number']`: 透明度使用数字表示

**命名规范**
```scss
// ✅ 正确
.myComponent { }
#myId { }
.el-button { }  // 允许 el- 前缀
.mz-card { }    // 允许 mz- 前缀

// ❌ 错误
.my_component { }
#123id { }
```

**忽略的文件类型**
```
node_modules, dist, coverage, *.css
```

### vue-app 配置差异

相比 base 配置，增加了：

**Vue 支持**
- ✅ `stylelint-config-recommended-vue`: Vue 官方推荐配置
- ✅ 支持 Vue SFC 中的 `<style>` 标签
- ✅ 支持 `:deep()`, `:global()` 等 Vue 伪类
- ✅ 支持 `v-bind()` CSS 函数

**文件类型处理**
```javascript
overrides: [
  {
    files: ['**/*.vue'],
    customSyntax: 'postcss-html',  // Vue SFC 语法
  },
  {
    files: ['**/*.scss'],
    customSyntax: 'postcss-scss',  // SCSS 语法
  },
]
```

## 📋 规则详解

### 选择器规则

| 规则 | 值 | 说明 |
|------|------|------|
| `selector-id-pattern` | `^[a-zA-Z][a-zA-Z0-9_-]+$\|^el-\|^mz-` | ID 选择器命名规则 |
| `selector-class-pattern` | `^[a-zA-Z][a-zA-Z0-9_-]+$\|^el-\|^mz-` | 类选择器命名规则 |
| `selector-max-id` | 6 | 最多 6 个 ID 选择器 |
| `selector-max-compound-selectors` | 15 | 最多 15 个复合选择器 |
| `selector-pseudo-class-no-unknown` | 忽略 `global`, `deep` | 允许 Vue 伪类 |
| `selector-pseudo-element-no-unknown` | 忽略 `v-deep` | 允许 Vue 深度选择器 |

### SCSS 规则

| 规则 | 值 | 说明 |
|------|------|------|
| `scss/dollar-variable-pattern` | `/$/, { ignore: 'global' }` | SCSS 变量命名（忽略警告）|
| `scss/at-mixin-pattern` | `^[a-zA-Z-0-9]+$` | Mixin 命名规则 |
| `scss/percent-placeholder-pattern` | `^[a-zA-Z-0-9]+$` | 占位符命名规则 |
| `scss/at-rule-no-unknown` | 忽略 SCSS 指令 | 允许 `@use`, `@forward` 等 |

### 函数和值规则

| 规则 | 值 | 说明 |
|------|------|------|
| `function-no-unknown` | 忽略特定函数 | 允许 `v-bind`, `env`, `constant` 等 |
| `color-function-notation` | `modern` | 使用 `rgb(0 0 0)` 而非 `rgb(0, 0, 0)` |
| `alpha-value-notation` | `number` | 使用 `0.5` 而非 `50%` |

### 字体规则

| 规则 | 值 | 说明 |
|------|------|------|
| `font-family-no-missing-generic-family-keyword` | 忽略特定字体 | 允许 `iconfont`, `Source Han Sans SC` 等 |

### At-Rule 规则

允许的 SCSS 和 CSS at-rules：
```
@use, @forward, @function, @if, @for, @each, @else,
@error, @include, @extend, @mixin, @at-root, @tailwind
```

## 🎯 使用场景

### 1. Vue 组件库（推荐使用 vue-app）

```javascript
// stylelint.config.js
import vueAppConfig from '@kit/stylelint-config/vue-app.js';

export default vueAppConfig;
```

**支持的样式**
```vue
<template>
  <div class="button">{{ label }}</div>
</template>

<style lang="scss" scoped>
.button {
  color: v-bind(color);  // ✅ 支持 v-bind

  :deep(.inner) {        // ✅ 支持 :deep
    margin: 0;
  }
}
</style>
```

### 2. 纯 SCSS 项目（使用 base）

```javascript
// stylelint.config.js
import baseConfig from '@kit/stylelint-config/base.js';

export default baseConfig;
```

### 3. 自定义扩展

```javascript
// stylelint.config.js
import vueAppConfig from '@kit/stylelint-config/vue-app.js';

export default {
  ...vueAppConfig,
  rules: {
    ...vueAppConfig.rules,
    // 覆盖规则
    'max-nesting-depth': 5,
    'selector-class-pattern': '^[a-z][a-zA-Z0-9]+$',
  },
};
```

## 🔧 集成开发工具

### VS Code

安装 Stylelint 扩展并在 `.vscode/settings.json` 中配置：

```json
{
  "stylelint.enable": true,
  "stylelint.validate": ["css", "scss", "vue"],
  "editor.codeActionsOnSave": {
    "source.fixAll.stylelint": "explicit"
  },
  "css.validate": false,
  "scss.validate": false
}
```

### package.json 脚本

```json
{
  "scripts": {
    "lint:style": "stylelint \"**/*.{css,scss,vue}\"",
    "lint:style:fix": "stylelint \"**/*.{css,scss,vue}\" --fix"
  }
}
```

### Git Hooks

使用 husky 在提交前自动检查：

```json
{
  "lint-staged": {
    "*.{css,scss,vue}": [
      "stylelint --fix"
    ]
  }
}
```

## 📝 代码示例

### ✅ 正确的代码

```scss
// 属性按 SMACSS 顺序排列
.button {
  // 布局属性
  display: flex;
  position: relative;

  // 盒模型属性
  width: 100px;
  height: 40px;
  padding: 8px 16px;
  margin: 0;

  // 视觉属性
  color: rgb(0 0 0);              // 现代颜色函数
  background-color: rgb(255 255 255 / 0.9);  // alpha 使用数字
  border-radius: 4px;

  // 动画属性
  transition: all 0.3s;

  &:hover {
    background-color: rgb(240 240 240);
  }
}

// SCSS 变量和 mixin
$primary-color: #1890ff;

@mixin flexCenter {
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### ❌ 错误的代码

```scss
.button {
  // ❌ 属性顺序混乱
  color: red;
  display: flex;
  width: 100px;

  // ❌ 旧的颜色函数语法
  background-color: rgba(255, 255, 255, 0.9);

  // ❌ 不合规的命名
  .inner_content { }
}

// ❌ 不合规的变量命名
$Primary_Color: #1890ff;

// ❌ 不合规的 mixin 命名
@mixin flex_center { }
```

## 🆚 配置对比

| 特性 | base | vue-app |
|------|------|---------|
| SCSS 标准规则 | ✅ | ✅ |
| 属性排序 | ✅ | ✅ |
| Vue SFC 支持 | ❌ | ✅ |
| Vue 伪类 (`:deep`, `:global`) | ❌ | ✅ |
| `v-bind()` 函数 | ❌ | ✅ |
| 适用场景 | 纯 SCSS 项目 | Vue 组件库/应用 |

## 🔍 常见问题

### Q: 为什么属性会自动排序？

A: 配置使用了 SMACSS 属性排序规则，按照布局 → 盒模型 → 视觉 → 其他的顺序组织属性，提升代码可读性。

### Q: 如何禁用某个规则？

```scss
/* stylelint-disable selector-max-id */
#my-special-id {
  color: red;
}
/* stylelint-enable selector-max-id */
```

或者在单行禁用：

```scss
#my-id { color: red; } /* stylelint-disable-line selector-max-id */
```

### Q: 如何支持 Tailwind CSS？

配置已内置支持 `@tailwind` 指令，可以直接使用：

```scss
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## 📄 License

MIT
