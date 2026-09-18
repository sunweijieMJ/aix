---
title: CodeEditor 代码编辑器
outline: deep
---

# CodeEditor 代码编辑器

基于 [CodeMirror 6](https://codemirror.net/) 的代码编辑器组件，提供语法高亮、代码折叠、括号匹配等专业代码编辑能力。

## 特性

- 支持 20+ 种编程语言语法高亮（JavaScript、TypeScript、Python、Go、Rust 等）
- 明暗双主题切换
- 行号显示、代码折叠、当前行高亮、括号匹配
- 支持 `v-model` 双向绑定
- 只读 / 禁用模式
- 可配置 Tab 缩进大小
- 支持自定义 CodeMirror 扩展，按需扩展功能
- 通过 `expose` 暴露丰富的编程式操作接口（撤销/重做、插入文本、获取选中等）

## 安装

```bash
pnpm add @aix/code-editor
```

组件样式与主题变量需要在应用入口各引入一次：

```ts
import '@aix/code-editor/style';
import '@aix/theme/style';
```

## API

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

**CodeEditor** — 代码编辑器：基于 CodeMirror 6，支持多语言高亮、行号、折叠与 lint。

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `modelValue` | `string` | - | - | 编辑器内容（v-model 双向绑定） |
| `language` | `'javascript' \| 'typescript' \| 'json' \| 'html' \| 'css' \| 'python' \| 'java' \| 'go' \| 'rust' \| 'cpp' \| 'php' \| 'sql' \| 'yaml' \| 'xml' \| 'markdown' \| 'sass' \| 'vue' \| 'angular' \| 'liquid' \| 'wast'` | `'javascript'` | - | 编程语言 |
| `theme` | `'light' \| 'dark'` | `'light'` | - | 编辑器配色主题，与 @aix/theme 的亮暗模式各自独立，需自行联动 |
| `readonly` | `boolean` | `false` | - | 是否只读（保留光标，不可编辑） |
| `disabled` | `boolean` | `false` | - | 是否禁用（完全不可交互） |
| `placeholder` | `string` | - | - | 占位文本 |
| `lineNumbers` | `boolean` | `true` | - | 是否显示行号 |
| `foldGutter` | `boolean` | `true` | - | 是否启用代码折叠 |
| `highlightActiveLine` | `boolean` | `true` | - | 是否高亮当前行 |
| `bracketMatching` | `boolean` | `true` | - | 是否启用括号匹配 |
| `tabSize` | `number` | `2` | - | Tab 缩进大小 |
| `height` | `string` | - | - | 编辑器固定高度（CSS 值，如 '400px'） |
| `minHeight` | `string` | `'100px'` | - | 编辑器最小高度 |
| `maxHeight` | `string` | - | - | 编辑器最大高度 |
| `lint` | `boolean` | `true` | - | 是否启用语法校验 |
| `lintOptions` | `CodeEditorLintConfig` | - | - | 语法校验配置 |
| `extensions` | `Extension[]` | - | - | 用户自定义 CodeMirror 扩展 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:modelValue` | `value: string` | 内容变化（v-model） |
| `change` | `value: string` | 内容变化 |
| `focus` | `view: EditorView` | 获得焦点 |
| `blur` | `view: EditorView` | 失去焦点 |
| `ready` | `view: EditorView` | 编辑器就绪 |

### Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `editorView` | `Ref<EditorView \| null>` | EditorView 实例 |
| `isFocused` | `Ref<boolean>` | 是否获得焦点 |
| `getValue` | `() => string` | 获取编辑器内容 |
| `setValue` | `(value: string) => void` | 设置编辑器内容 |
| `focus` | `() => void` | 聚焦编辑器 |
| `blur` | `() => void` | 取消聚焦 |
| `getSelection` | `() => string` | 获取选中文本 |
| `replaceSelection` | `(text: string) => void` | 替换选中内容 |
| `insert` | `(text: string) => void` | 在光标位置插入文本 |
| `undo` | `() => void` | 撤销 |
| `redo` | `() => void` | 重做 |
| `getLineCount` | `() => number` | 获取总行数 |
| `getCursorPosition` | `() => { line: number; col: number }` | 获取光标位置 |
| `diagnosticCount` | `Ref<number>` | 当前诊断（错误/警告）数量 |
