# @kit/prettier-config

内部共享的 Prettier 配置包，为项目提供统一的代码格式化规范。

## 特性

- **统一格式化** - 所有子项目共享同一套 Prettier 规则
- **Vue 优化** - 针对 Vue SFC 模板格式化优化
- **现代宽屏适配** - printWidth 100，减少不必要的折行
- **TypeScript 友好** - 提供完整类型声明

## 安装

```json
{
  "devDependencies": {
    "@kit/prettier-config": "workspace:^"
  }
}
```

## 使用

### 方式一：配置文件 re-export（推荐）

在项目根目录创建 `prettier.config.js`：

```javascript
export { default } from '@kit/prettier-config';
```

### 方式二：package.json 引用

```json
{
  "prettier": "@kit/prettier-config"
}
```

### 方式三：扩展配置

```javascript
import base from '@kit/prettier-config';

export default {
  ...base,
  printWidth: 120, // 局部覆盖
};
```

## 规则说明

| 规则 | 值 | 说明 |
|------|-----|------|
| `semi` | `true` | 语句末尾添加分号 |
| `singleQuote` | `true` | 使用单引号 |
| `endOfLine` | `'auto'` | 跨平台自动选择行尾符 |
| `trailingComma` | `'all'` | 多行结构尾随逗号，减少 diff 噪音 |
| `bracketSpacing` | `true` | 对象字面量括号内添加空格 |
| `tabWidth` | `2` | 缩进 2 个空格 |
| `useTabs` | `false` | 使用空格缩进 |
| `printWidth` | `100` | 每行最大宽度，适配组件库长类型声明 |
| `htmlWhitespaceSensitivity` | `'ignore'` | Vue 模板格式化更美观 |
| `vueIndentScriptAndStyle` | `false` | Vue SFC 中 script/style 不额外缩进 |

## 注意事项

### .prettierignore

Prettier 不支持从配置包继承 ignore 规则，`.prettierignore` 文件需保留在各项目根目录。

### 与 ESLint 配合

`@kit/eslint-config` 已集成 `eslint-config-prettier`，会自动禁用与 Prettier 冲突的 ESLint 规则，无需额外配置。

## package.json 脚本

```json
{
  "scripts": {
    "format": "prettier . --write",
    "format:check": "prettier . --check"
  }
}
```
