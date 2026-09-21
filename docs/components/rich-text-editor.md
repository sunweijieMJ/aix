---
title: RichTextEditor 富文本编辑器
outline: deep
---

<script setup>
import { ref } from 'vue'
import { RichTextEditor } from '@aix/rich-text-editor'

const basic = ref('<p>选中这段文字试试工具栏，或者直接输入。</p>')
const enhanced = ref('<p>工具栏上多出了表格、任务列表、对齐、颜色、字号与高亮。</p>')
const readonlyContent = ref('<p>只读态：内容不可编辑，工具栏仍在。</p>')
const disabledContent = ref('<p>禁用态：整块置灰，连选中都不行。</p>')
const formatted = ref('<p>点下面的按钮，看三种输出格式的差异。</p>')
const editorRef = ref()
const output = ref('')

const uploaded = ref('<p>点工具栏里的图片按钮，选一张本地图片。</p>')

// 演示用的“上传”：不连后端，直接读成 Base64 返回
function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function dump(format) {
  const api = editorRef.value
  if (!api) return
  output.value =
    format === 'html' ? api.getHTML() : format === 'text' ? api.getText() : JSON.stringify(api.getJSON())
}
</script>

<style>
.rich-text-editor-demo {
  display: block;
  padding: 0;
}
</style>

# RichTextEditor 富文本编辑器

基于 [Tiptap](https://tiptap.dev/) / [ProseMirror](https://prosemirror.net/) 的富文本编辑器，自带工具栏，
表格、图片、@提及等 14 项增强功能按 prop 开关，内容可输出 HTML / JSON / 纯文本。

## 何时使用

- 业务里需要一块所见即所得的正文编辑区：公告、课程简介、评语、工单描述等
- 需要在编辑器里插入表格、图片、视频，或用 @提及 关联人员
- 需要把编辑结果以 HTML 或 JSON 存库，再原样回显

只展示富文本、不编辑时不要用它，直接渲染 HTML 即可。只需要写代码片段用
[CodeEditor 代码编辑器](/components/code-editor)。需要 Markdown 源码编辑器的场景本组件也不合适——
它的 `markdown` prop 只是输入语法糖（行首 `#` 加空格转标题），存的仍然是富文本。

## 安装

```bash
pnpm add @aix/rich-text-editor
```

组件样式与主题变量需要在应用入口各引入一次：

```ts
import '@aix/rich-text-editor/style';
import '@aix/theme/style';
```

## 代码演示

### 基础用法

`v-model` 绑定内容，默认输出 HTML 字符串。工具栏在不开任何增强 prop 时只有基础格式、列表、引用、代码块与撤销重做。

<ClientOnly>
<div class="demo-block rich-text-editor-demo">
  <RichTextEditor v-model="basic" placeholder="输入点什么…" min-height="160px" />
</div>
</ClientOnly>

```vue
<template>
  <RichTextEditor v-model="content" placeholder="输入点什么…" min-height="160px" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RichTextEditor } from '@aix/rich-text-editor';

const content = ref('<p>选中这段文字试试工具栏。</p>');
</script>
```

### 开启增强功能

14 项增强功能全部是 opt-in 的：传 `true` 用默认配置，传对象可细调。开启后工具栏会自动出现对应按钮。

<ClientOnly>
<div class="demo-block rich-text-editor-demo">
  <RichTextEditor
    v-model="enhanced"
    min-height="180px"
    table
    task-list
    text-align
    text-color
    font-size
    highlight
  />
</div>
</ClientOnly>

```vue
<template>
  <RichTextEditor
    v-model="content"
    table
    task-list
    text-align
    text-color
    font-size
    highlight
  />
</template>
```

### 只读与禁用

`readonly` 只关掉编辑能力，工具栏照常渲染——要一起收掉得再传 `:show-toolbar="false"`。
`disabled` 在不可编辑之外还会把整块编辑区降透明度、屏蔽内容区的指针事件。两者都是普通布尔 prop，不参与 `v-model`。

<ClientOnly>
<div class="demo-block rich-text-editor-demo">
  <RichTextEditor v-model="readonlyContent" readonly :show-toolbar="false" min-height="60px" />
  <RichTextEditor v-model="disabledContent" disabled min-height="60px" />
</div>
</ClientOnly>

```vue
<template>
  <!-- 只读：连工具栏一起收掉 -->
  <RichTextEditor v-model="content" readonly :show-toolbar="false" />

  <!-- 禁用：整块置灰 -->
  <RichTextEditor v-model="content" disabled />
</template>
```

### 输出格式与编程式操作

`outputFormat` 决定 `v-model` 与 `change` 事件抛出的内容形态；需要即时取值时用组件实例暴露的
`getHTML` / `getJSON` / `getText`。

<ClientOnly>
<div class="demo-block rich-text-editor-demo">
  <RichTextEditor ref="editorRef" v-model="formatted" min-height="100px" />
  <div style="display: flex; gap: 8px; margin: 12px 0;">
    <button @click="dump('html')">getHTML</button>
    <button @click="dump('json')">getJSON</button>
    <button @click="dump('text')">getText</button>
  </div>
  <pre style="margin: 0; padding: 12px; overflow-x: auto; border-radius: 6px; background: var(--vp-c-bg-alt); font-size: 12px;">{{ output || '点上面的按钮' }}</pre>
</div>
</ClientOnly>

```vue
<template>
  <RichTextEditor ref="editorRef" v-model="content" output-format="html" />
  <button @click="save">保存</button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RichTextEditor } from '@aix/rich-text-editor';

const content = ref('');
const editorRef = ref<InstanceType<typeof RichTextEditor>>();

function save() {
  console.log(editorRef.value?.getJSON());
}
</script>
```

### 图片与视频上传

`image` / `video` 配置 `upload` 回调或 `server` 地址，回调返回可访问的 URL 即可；不配置时对应的工具栏按钮不出现。
下面这块的 `upload` 不连后端，直接把选中的文件读成 Base64 返回——插入流程和真实上传完全一样，
点工具栏的图片按钮试试。

<ClientOnly>
<div class="demo-block rich-text-editor-demo">
  <RichTextEditor v-model="uploaded" min-height="160px" :image="{ upload: toDataUrl }" />
</div>
</ClientOnly>

```vue
<template>
  <RichTextEditor
    v-model="content"
    :image="{ upload: uploadImage, accept: 'image/*' }"
    :video="{ server: '/api/upload/video' }"
  />
</template>

<script setup lang="ts">
async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  return (await res.json()).url;
}
</script>
```

## 多语言

工具栏按钮的提示文字、链接与表格弹层里的文案全部走语言包，内置 `zh-CN` / `en-US`，默认跟随
`@aix/hooks` 的全局语言。

```ts
import { createLocale } from '@aix/hooks';

// 全局切换
createLocale('en-US');

// 覆盖单条文案，切片名是 'rich-text-editor'
createLocale('zh-CN', { messages: { 'rich-text-editor': { bold: '加粗' } } });
```

语言包也可以单独导入：`richTextEditorLocale` / `richTextEditorZhCN` / `richTextEditorEnUS`。

单个实例可以用 `locale` prop 覆盖全局设置：`<RichTextEditor locale="en-US" />`。

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

## 类型定义

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

```typescript
/** 上传/查询错误信息 */
export interface UploadError {
  /** 错误类型 */
  type: 'size' | 'type' | 'network' | 'server' | 'custom';
  /** 错误消息 */
  message: string;
  /** 原始错误对象 */
  cause?: unknown;
}

/** 请求头配置（对象或函数，函数形式支持动态 token） */
export type HeadersConfig = Record<string, string> | (() => Record<string, string>);

/** 附加表单字段 */
export type ExtraDataConfig =
  Record<string, string | Blob> | ((file: File) => Record<string, string | Blob>);

/** 编辑器内容输出格式 */
export type OutputFormat = 'html' | 'json' | 'text';

/** 表格功能配置 */
export interface TableConfig {
  /** 是否可调整列宽 @default true */
  resizable?: boolean;
}

/** 图片/视频上传的公共配置基类型 */
export interface BaseUploadConfig {
  // ===== 选择/上传方式（三选一，customPicker > upload > server） =====

  /**
   * 自定义选择器：完全替代原生文件选择和上传流程（优先级最��）
   * 由业务方控制 UI（如弹出资源库弹窗），返回资源 URL 或 null（取消）
   */
  customPicker?: () => Promise<string | null>;
  /** 自定义上传回调，返回文件 URL */
  upload?: (file: File) => Promise<string>;
  /** 服务端上传地址（当 upload 未提供时生效） */
  server?: string;

  // ===== server 模式配置 =====

  /** 自定义请求头 */
  headers?: HeadersConfig;
  /** 文件字段名 @default 'file' */
  fieldName?: string;
  /** 附加表单字段 */
  data?: ExtraDataConfig;
  /** 是否携带 cookie @default false */
  withCredentials?: boolean;
  /** 超时时间（ms） */
  timeout?: number;
  /** 从响应 JSON 中提取 URL 的点分路径 @default 'data.url' */
  responsePath?: string;

  // ===== 生命周期钩子 =====

  /** 上传前钩子：返回 false 阻止上传，返回 File 替换文件（可做压缩/重命名） */
  beforeUpload?: (file: File) => boolean | File | Promise<boolean | File>;
  /** 上传成功回调 */
  onSuccess?: (url: string, file: File) => void;
  /** 上传失败回调 */
  onError?: (error: UploadError, file: File) => void;

  // ===== 文件校验 =====

  /** 允许的文件类型 */
  acceptedTypes?: string[];
  /** 最大文件大小（字节） */
  maxSize?: number;
}

/** 图片功能配置（timeout 默认 30000，maxSize 默认 5MB） */
export interface ImageConfig extends BaseUploadConfig {
  /** 是否允许 base64 内联 @default false */
  allowBase64?: boolean;
}

/** 视频功能配置（timeout 默认 60000，maxSize 默认 100MB） */
export interface VideoConfig extends BaseUploadConfig {}

/** 字体大小配置 */
export interface FontSizeConfig {
  /** 可选字号列表 @default ['12px','14px','16px','18px','20px','24px','28px','32px'] */
  sizes?: string[];
}

/** 字体族配置 */
export interface FontFamilyConfig {
  /** 可选字体列表 */
  families?: Array<{ label: string; value: string }>;
}

/** @提及项 */
export interface MentionItem {
  id: string | number;
  label: string;
  [key: string]: unknown;
}

/** @提及配置 */
export interface MentionConfig {
  // ===== 查询方式（二选一，queryItems 优先） =====

  /** 自定义查询回调（优先级最高） */
  queryItems?: (query: string) => Promise<MentionItem[]> | MentionItem[];
  /** 服务端查询地址（当 queryItems 未提供时生效，GET 请求） */
  server?: string;

  // ===== server 模式配置 =====

  /** 自定义请求头 */
  headers?: HeadersConfig;
  /** 查询参数名 @default 'keyword' */
  queryParamName?: string;
  /** 从响应 JSON 中提取列表的点分路径 @default 'data' */
  responsePath?: string;
  /** 将后端返回数据映射为 MentionItem */
  transformResponse?: (data: unknown[]) => MentionItem[];
  /** 查询失败回调 */
  onError?: (error: UploadError) => void;

  // ===== 显示配置 =====

  /** 渲染提及项的标签 */
  renderLabel?: (item: MentionItem) => string;
  /** 触发字符 @default '@' */
  trigger?: string;
}

/** 字符统计配置 */
export interface CharacterCountConfig {
  /** 最大字符数 */
  limit?: number;
  /** 统计模式 @default 'textSize' */
  mode?: 'textSize' | 'nodeSize';
}
```
