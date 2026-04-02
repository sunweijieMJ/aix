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

::: warning 自动生成的 API 文档
以下 API 文档由 `pnpm docs:gen` 从组件源码自动生成。请勿手动编辑此部分。

如需更新 API 文档，请：
1. 修改组件源码中的 JSDoc 注释
2. 运行 `pnpm docs:gen` 生成到 README.md
3. 运行 `pnpm docs:sync` 同步到此文档
:::

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `modelValue` | `string` | - | - | 编辑器内容（v-model 双向绑定） |
| `language` | `CodeLanguage` | `'javascript'` | - | 编程语言 |
| `theme` | `CodeEditorTheme` | `'light'` | - | 主题 |
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
| `extensions` | `Array<Extension>` | - | - | 用户自定义 CodeMirror 扩展 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:modelValue` | `string` | 内容变化（v-model） |
| `change` | `string` | 内容变化 |
| `focus` | `EditorView` | 获得焦点 |
| `blur` | `EditorView` | 失去焦点 |
| `ready` | `EditorView` | 编辑器就绪 |
