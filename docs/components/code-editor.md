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

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `modelValue` | `string` | — | 编辑器内容（`v-model` 双向绑定） |
| `language` | `CodeLanguage` | `'javascript'` | 编程语言，见下方支持列表 |
| `theme` | `'light' \| 'dark'` | `'light'` | 编辑器主题 |
| `readonly` | `boolean` | `false` | 是否只读（保留光标，不可编辑） |
| `disabled` | `boolean` | `false` | 是否禁用（完全不可交互） |
| `placeholder` | `string` | — | 占位文本 |
| `lineNumbers` | `boolean` | `true` | 是否显示行号 |
| `foldGutter` | `boolean` | `true` | 是否启用代码折叠 |
| `highlightActiveLine` | `boolean` | `true` | 是否高亮当前行 |
| `bracketMatching` | `boolean` | `true` | 是否启用括号匹配 |
| `tabSize` | `number` | `2` | Tab 缩进大小 |
| `height` | `string` | — | 编辑器固定高度（CSS 值，如 `'400px'`） |
| `minHeight` | `string` | `'100px'` | 编辑器最小高度 |
| `maxHeight` | `string` | — | 编辑器最大高度 |
| `extensions` | `Extension[]` | — | 用户自定义 CodeMirror 扩展 |

### 支持的语言 (`CodeLanguage`)

`'javascript'` | `'typescript'` | `'json'` | `'html'` | `'css'` | `'python'` | `'java'` | `'go'` | `'rust'` | `'cpp'` | `'php'` | `'sql'` | `'yaml'` | `'xml'` | `'markdown'` | `'sass'` | `'vue'` | `'angular'` | `'liquid'` | `'wast'`

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:modelValue` | `(value: string)` | 内容变化时触发（`v-model`） |
| `change` | `(value: string)` | 内容变化时触发 |
| `focus` | `(view: EditorView)` | 获得焦点时触发 |
| `blur` | `(view: EditorView)` | 失去焦点时触发 |
| `ready` | `(view: EditorView)` | 编辑器初始化完成时触发 |

### Expose Methods

通过模板引用 (`ref`) 可以访问以下方法和属性：

| 名称 | 类型 | 说明 |
|------|------|------|
| `editorView` | `Ref<EditorView \| null>` | CodeMirror EditorView 实例 |
| `isFocused` | `Ref<boolean>` | 当前是否获得焦点 |
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
