# @kit/stylelint-config

内部共享的 Stylelint 配置包，为项目提供统一的 CSS/SCSS 代码质量检查和样式规范。

## 📦 安装

```json
{
  "devDependencies": {
    "@kit/stylelint-config": "^1.0.0"
  }
}
```

## 🚀 使用

### 基础配置 (base)

适用于通用 SCSS 项目的基础 Stylelint 配置。

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

| 规则集 | 说明 |
|--------|------|
| `stylelint-config-standard-scss` | SCSS 官方标准配置 |
| `stylelint-config-property-sort-order-smacss` | SMACSS 属性排序规则 |

**集成的插件**

| 插件 | 说明 |
|------|------|
| `stylelint-scss` | SCSS 特定规则 |
| `stylelint-order` | CSS 属性排序规则 |

**关键规则**

| 规则 | 值 | 说明 |
|------|------|------|
| `max-nesting-depth` | 15 | 限制 SCSS 嵌套深度 |
| `selector-max-id` | 6 | 限制 ID 选择器数量 |
| `selector-max-compound-selectors` | 15 | 限制复合选择器数量 |
| `color-function-notation` | modern | 使用现代颜色函数语法 |
| `alpha-value-notation` | number | 透明度使用数字表示 |

**忽略的文件类型**

```
node_modules, dist, coverage, *.css
```

### vue-app 配置特性

在 base 配置基础上增加：

**Vue 支持**

| 特性 | 说明 |
|------|------|
| `stylelint-config-recommended-vue` | Vue 官方推荐配置 |
| Vue SFC `<style>` 标签 | 完整支持 |
| `:deep()`, `:global()` | 支持 Vue 伪类 |
| `v-bind()` | 支持 CSS 函数 |

**文件类型处理**

```javascript
overrides: [
  {
    files: ['**/*.vue'],
    customSyntax: 'postcss-html',
  },
  {
    files: ['**/*.scss'],
    customSyntax: 'postcss-scss',
  },
]
```

## 📋 规则说明

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
| `scss/dollar-variable-pattern` | `/$/, { ignore: 'global' }` | SCSS 变量命名 |
| `scss/at-mixin-pattern` | `^[a-zA-Z-0-9]+$` | Mixin 命名规则 |
| `scss/percent-placeholder-pattern` | `^[a-zA-Z-0-9]+$` | 占位符命名规则 |
| `scss/at-rule-no-unknown` | 忽略 SCSS 指令 | 允许 `@use`, `@forward` 等 |

### 函数和值规则

| 规则 | 值 | 说明 |
|------|------|------|
| `function-no-unknown` | 忽略特定函数 | 允许 `v-bind`, `env`, `constant` 等 |
| `color-function-notation` | modern | 使用 `rgb(0 0 0)` 而非 `rgb(0, 0, 0)` |
| `alpha-value-notation` | number | 使用 `0.5` 而非 `50%` |

## 🎯 使用场景

### 1. Vue 组件库（推荐使用 vue-app）

```javascript
// stylelint.config.js
import vueAppConfig from '@kit/stylelint-config/vue-app.js';

export default vueAppConfig;
```

**支持的样式**

```vue
<style lang="scss" scoped>
.button {
  color: v-bind(color);

  :deep(.inner) {
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
    'max-nesting-depth': 5,
    'selector-class-pattern': '^[a-z][a-zA-Z0-9]+$',
  },
};
```

## 🔧 开发工具集成

### VS Code

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

```json
{
  "lint-staged": {
    "*.{css,scss,vue}": ["stylelint --fix"]
  }
}
```

## 📝 代码示例

### 正确的代码

```scss
// 属性按 SMACSS 顺序排列
.button {
  display: flex;
  position: relative;
  width: 100px;
  height: 40px;
  padding: 8px 16px;
  margin: 0;
  color: rgb(0 0 0);
  background-color: rgb(255 255 255 / 0.9);
  border-radius: 4px;
  transition: all 0.3s;
}
```

### 错误的代码

```scss
.button {
  color: red;           // 属性顺序混乱
  display: flex;
  width: 100px;
  background-color: rgba(255, 255, 255, 0.9);  // 旧的颜色函数语法
}
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
