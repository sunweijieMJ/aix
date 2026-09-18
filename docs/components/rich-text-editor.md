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

## 安装

```bash
pnpm add @aix/rich-text-editor
```

组件样式与主题变量需要在应用入口各引入一次：

```ts
import '@aix/rich-text-editor/style';
import '@aix/theme/style';
```

## API

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

**RichTextEditor** — 富文本编辑器：基于 Tiptap，内置工具栏，表格 / 视频 / 高亮等能力按 prop 开关。

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `modelValue` | `string \| Record<string, unknown>` | - | - | 编辑器内容（v-model 双向绑定） HTML 字符串或 JSON 对象 |
| `outputFormat` | `'html' \| 'json' \| 'text'` | `'html'` | - | 内容输出格式 |
| `readonly` | `boolean` | `false` | - | 是否只读 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `placeholder` | `string` | `''` | - | 占位文本 |
| `autofocus` | `boolean` | `false` | - | 是否自动聚焦 |
| `height` | `string` | - | - | 编辑器固定高度（CSS 值） |
| `minHeight` | `string` | `'200px'` | - | 编辑器最小高度 |
| `maxHeight` | `string` | - | - | 编辑器最大高度 |
| `showToolbar` | `boolean` | `true` | - | 是否显示 Toolbar |
| `extensions` | `AnyExtension[]` | - | - | 用户自定义 Tiptap 扩展（完全开放的扩展接口） |
| `locale` | `'zh-CN' \| 'en-US'` | - | - | 语言覆盖（优先于全局 locale） |
| `table` | `boolean \| TableConfig` | - | - | 开启表格（插入 / 增删行列）；传对象可关掉列宽拖拽 |
| `taskList` | `boolean` | - | - | 开启任务列表（可勾选的 TODO 列表） |
| `image` | `ImageConfig` | - | - | 开启图片插入，须在此配置 upload 回调或 server 地址 |
| `video` | `boolean \| VideoConfig` | - | - | 开启视频插入；上传方式同图片，须配 upload 回调或 server 地址 |
| `textAlign` | `boolean` | - | - | 开启文本对齐（左 / 中 / 右 / 两端） |
| `textColor` | `boolean` | - | - | 开启文本颜色与高亮背景的取色器 |
| `fontSize` | `boolean \| FontSizeConfig` | - | - | 开启字号选择；传对象可换掉可选字号列表 |
| `fontFamily` | `boolean \| FontFamilyConfig` | - | - | 开启字体选择；传对象可换掉可选字体列表 |
| `superscriptSubscript` | `boolean` | - | - | 开启上标 / 下标 |
| `characterCount` | `boolean \| CharacterCountConfig` | - | - | 开启字符与词数统计（结果由 character-count 事件抛出）；传对象可设上限与统计口径 |
| `mention` | `MentionConfig` | - | - | 开启 @提及，须在此配置 queryItems 回调或 server 地址 |
| `highlight` | `boolean` | - | - | 开启高亮标记（荧光笔） |
| `markdown` | `boolean` | - | - | 开启 Markdown 输入语法（如行首 `#` 加空格转标题） |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:modelValue` | `value: string \| Record<string, unknown>` | v-model 更新 |
| `change` | `value: string \| Record<string, unknown>` | 内容变化 |
| `focus` | `event: FocusEvent` | 获得焦点 |
| `blur` | `event: FocusEvent` | 失去焦点 |
| `ready` | `editor: Editor` | 编辑器就绪 |
| `character-count` | `count: { characters: number; words: number }` | 字符统计更新（需启用 characterCount） |

### Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| `editor` | `Ref<Editor \| null>` | Tiptap Editor 实例（供高级用户直接操作） |
| `getHTML` | `() => string` | 获取 HTML 内容 |
| `getJSON` | `() => Record<string, unknown>` | 获取 JSON 内容 |
| `getText` | `() => string` | 获取纯文本 |
| `setContent` | `(content: string \| Record<string, unknown>) => void` | 设置内容 |
| `clearContent` | `() => void` | 清空内容 |
| `focus` | `(position?: 'start' \| 'end' \| 'all') => void` | 聚焦 |
| `blur` | `() => void` | 取消聚焦 |
| `insertContent` | `(content: string) => void` | 插入内容 |
| `undo` | `() => void` | 撤销 |
| `redo` | `() => void` | 重做 |
| `getCharacterCount` | `() => number` | 获取字符数（需启用 characterCount） |
| `getWordCount` | `() => number` | 获取词数（需启用 characterCount） |
| `isEmpty` | `() => boolean` | 判断内容是否为空 |
