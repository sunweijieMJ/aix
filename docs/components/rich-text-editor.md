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

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `modelValue` | `string \| Record<string, unknown>` | — | 编辑器内容（`v-model` 双向绑定），HTML 字符串或 JSON 对象 |
| `outputFormat` | `'html' \| 'json' \| 'text'` | `'html'` | 内容输出格式 |
| `readonly` | `boolean` | `false` | 是否只读 |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `placeholder` | `string` | `''` | 占位文本 |
| `autofocus` | `boolean` | `false` | 是否自动聚焦 |
| `height` | `string` | — | 编辑器固定高度（CSS 值） |
| `minHeight` | `string` | `'200px'` | 编辑器最小高度 |
| `maxHeight` | `string` | — | 编辑器最大高度 |
| `showToolbar` | `boolean` | `true` | 是否显示工具栏 |
| `extensions` | `AnyExtension[]` | — | 用户自定义 Tiptap 扩展 |
| `locale` | `'zh-CN' \| 'en-US'` | — | 语言覆盖（优先于全局 locale） |

### 增强功能 Props

以下功能全部可选，默认不启用，按需开启：

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `table` | `boolean \| TableConfig` | — | 表格功能 |
| `taskList` | `boolean` | — | 任务列表（可勾选的 TODO 列表） |
| `image` | `ImageConfig` | — | 图片功能（需配置上传方式） |
| `video` | `boolean \| VideoConfig` | — | 视频功能 |
| `textAlign` | `boolean` | — | 文本对齐（左/中/右/两端） |
| `textColor` | `boolean` | — | 文本颜色 + 高亮背景 |
| `fontSize` | `boolean \| FontSizeConfig` | — | 字体大小 |
| `fontFamily` | `boolean \| FontFamilyConfig` | — | 字体族 |
| `superscriptSubscript` | `boolean` | — | 上标 / 下标 |
| `characterCount` | `boolean \| CharacterCountConfig` | — | 字符统计 |
| `mention` | `MentionConfig` | — | @提及功能（需配置查询方式） |
| `highlight` | `boolean` | — | 高亮标记 |
| `markdown` | `boolean` | — | Markdown 输入支持 |

### 增强功能配置类型

#### TableConfig

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `resizable` | `boolean` | `true` | 是否可调整列宽 |

#### ImageConfig

继承自 `BaseUploadConfig`，额外字段：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `allowBase64` | `boolean` | `false` | 是否允许 base64 内联 |

#### VideoConfig

继承自 `BaseUploadConfig`，无额外字段。视频上传超时默认 60000ms，最大文件大小默认 100MB。

#### BaseUploadConfig（图片/视频上传公共配置）

三种上传方式优先级：`customPicker` > `upload` > `server`

| 字段 | 类型 | 说明 |
|------|------|------|
| `customPicker` | `() => Promise<string \| null>` | 自定义选择器，完全替代原生文件选择和上传流程 |
| `upload` | `(file: File) => Promise<string>` | 自定义上传回调，返回文件 URL |
| `server` | `string` | 服务端上传地址 |
| `headers` | `Record<string, string> \| (() => Record<string, string>)` | 自定义请求头 |
| `fieldName` | `string` | 文件字段名，默认 `'file'` |
| `data` | `Record<string, string \| Blob> \| ((file: File) => Record<string, string \| Blob>)` | 附加表单字段 |
| `withCredentials` | `boolean` | 是否携带 cookie，默认 `false` |
| `timeout` | `number` | 超时时间（ms） |
| `responsePath` | `string` | 从响应 JSON 中提取 URL 的点分路径，默认 `'data.url'` |
| `beforeUpload` | `(file: File) => boolean \| File \| Promise<boolean \| File>` | 上传前钩子，返回 `false` 阻止上传 |
| `onSuccess` | `(url: string, file: File) => void` | 上传成功回调 |
| `onError` | `(error: UploadError, file: File) => void` | 上传失败回调 |
| `acceptedTypes` | `string[]` | 允许的文件类型 |
| `maxSize` | `number` | 最大文件大小（字节） |

#### FontSizeConfig

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `sizes` | `string[]` | `['12px','14px','16px','18px','20px','24px','28px','32px']` | 可选字号列表 |

#### FontFamilyConfig

| 字段 | 类型 | 说明 |
|------|------|------|
| `families` | `Array<{ label: string; value: string }>` | 可选字体列表 |

#### MentionConfig

两种查询方式优先级：`queryItems` > `server`

| 字段 | 类型 | 说明 |
|------|------|------|
| `queryItems` | `(query: string) => Promise<MentionItem[]> \| MentionItem[]` | 自定义查询回调 |
| `server` | `string` | 服务端查询地址（GET 请求） |
| `headers` | `HeadersConfig` | 自定义请求头 |
| `queryParamName` | `string` | 查询参数名，默认 `'keyword'` |
| `responsePath` | `string` | 从响应 JSON 中提取列表的点分路径，默认 `'data'` |
| `transformResponse` | `(data: unknown[]) => MentionItem[]` | 将后端返回数据映射为 MentionItem |
| `onError` | `(error: UploadError) => void` | 查询失败回调 |
| `renderLabel` | `(item: MentionItem) => string` | 渲染提及项的标签 |
| `trigger` | `string` | 触发字符，默认 `'@'` |

#### MentionItem

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string \| number` | 唯一标识 |
| `label` | `string` | 显示文本 |

#### CharacterCountConfig

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `limit` | `number` | — | 最大字符数 |
| `mode` | `'textSize' \| 'nodeSize'` | `'textSize'` | 统计模式 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:modelValue` | `(value: string \| Record<string, unknown>)` | 内容变化时触发（`v-model`） |
| `change` | `(value: string \| Record<string, unknown>)` | 内容变化时触发 |
| `focus` | `(event: FocusEvent)` | 获得焦点时触发 |
| `blur` | `(event: FocusEvent)` | 失去焦点时触发 |
| `ready` | `(editor: Editor)` | 编辑器初始化完成时触发 |
| `character-count` | `(count: { characters: number; words: number })` | 字符统计更新（需启用 `characterCount`） |

### Expose Methods

通过模板引用 (`ref`) 可以访问以下方法和属性：

| 名称 | 类型 | 说明 |
|------|------|------|
| `editor` | `Ref<Editor \| null>` | Tiptap Editor 实例（供高级用户直接操作） |
| `getHTML` | `() => string` | 获取 HTML 内容 |
| `getJSON` | `() => Record<string, unknown>` | 获取 JSON 内容 |
| `getText` | `() => string` | 获取纯文本 |
| `setContent` | `(content: string \| Record<string, unknown>) => void` | 设置内容 |
| `clearContent` | `() => void` | 清空内容 |
| `focus` | `(position?: 'start' \| 'end' \| 'all') => void` | 聚焦编辑器 |
| `blur` | `() => void` | 取消聚焦 |
| `insertContent` | `(content: string) => void` | 插入内容 |
| `undo` | `() => void` | 撤销 |
| `redo` | `() => void` | 重做 |
| `getCharacterCount` | `() => number` | 获取字符数（需启用 `characterCount`） |
| `getWordCount` | `() => number` | 获取词数（需启用 `characterCount`） |
| `isEmpty` | `() => boolean` | 判断内容是否为空 |
