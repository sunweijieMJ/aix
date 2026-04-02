---
title: RichTextEditor 富文本编辑器
outline: deep
---

# RichTextEditor 富文本编辑器

基于 [Tiptap](https://tiptap.dev/) / [ProseMirror](https://prosemirror.net/) 的富文本编辑器组件，提供所见即所得的富文本编辑能力。

## 特性

- 基础格式：加粗、斜体、下划线、删除线、行内代码、代码块、引用、分割线
- 列表：有序列表、无序列表、任务列表（可勾选 TODO）
- 表格：插入表格，支持列宽拖拽调整
- 多媒体：图片上传（自定义上传 / 服务端上传 / Base64 内联）、视频上传
- 文本样式：对齐方式、文字颜色、背景高亮、字体大小、字体族、上标/下标
- 高级功能：@提及、字符统计、Markdown 输入支持、高亮标记
- 支持 `v-model` 双向绑定，输出格式可选 HTML / JSON / 纯文本
- 支持 `v-model` 只读 / 禁用模式
- 支持自定义 Tiptap 扩展
- 工具栏可显示/隐藏
- 多语言支持（zh-CN / en-US）

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
| `modelValue` | `string \| Record` | - | - | 编辑器内容（v-model 双向绑定） HTML 字符串或 JSON 对象 |
| `outputFormat` | `OutputFormat` | `'html'` | - | 内容输出格式 |
| `readonly` | `boolean` | `false` | - | 是否只读 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `placeholder` | `string` | `` | - | 占位文本 |
| `autofocus` | `boolean` | `false` | - | 是否自动聚焦 |
| `height` | `string` | - | - | 编辑器固定高度（CSS 值） |
| `minHeight` | `string` | `'200px'` | - | 编辑器最小高度 |
| `maxHeight` | `string` | - | - | 编辑器最大高度 |
| `showToolbar` | `boolean` | `true` | - | 是否显示 Toolbar |
| `extensions` | `Array<AnyExtension>` | - | - | 用户自定义 Tiptap 扩展（完全开放的扩展接口） |
| `locale` | `"zh-CN" \| "en-US"` | - | - | 语言覆盖（优先于全局 locale） |
| `table` | `boolean \| TableConfig` | - | - | 表格功能 |
| `taskList` | `boolean` | - | - | 任务列表（可勾选的 TODO 列表） |
| `image` | `ImageConfig` | - | - | 图片功能（需配置 upload 回调或 server 地址） |
| `video` | `boolean \| VideoConfig` | - | - | 视频功能 |
| `textAlign` | `boolean` | - | - | 文本对齐（左/中/右/两端） |
| `textColor` | `boolean` | - | - | 文本颜色 + 高亮背景 |
| `fontSize` | `boolean \| FontSizeConfig` | - | - | 字体大小 |
| `fontFamily` | `boolean \| FontFamilyConfig` | - | - | 字体族 |
| `superscriptSubscript` | `boolean` | - | - | 上标/下标 |
| `characterCount` | `boolean \| CharacterCountConfig` | - | - | 字符统计 |
| `mention` | `MentionConfig` | - | - | @提及功能（需配置 queryItems 回调或 server 地址） |
| `highlight` | `boolean` | - | - | 高亮标记 |
| `markdown` | `boolean` | - | - | Markdown 输入支持 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:modelValue` | `string \| Record` | v-model 更新 |
| `change` | `string \| Record` | 内容变化 |
| `focus` | `FocusEvent` | 获得焦点 |
| `blur` | `FocusEvent` | 失去焦点 |
| `ready` | `Editor` | 编辑器就绪 |
| `character-count` | `{ characters: number; words: number; }` | 字符统计更新（需启用 characterCount） |
