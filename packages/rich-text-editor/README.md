# @aix/rich-text-editor

基于 Tiptap 3 的 Vue 3 富文本编辑器组件，支持 14 项可选增强功能。

## 特性

- 📝 **所见即所得**：基于 Tiptap (ProseMirror)，流畅的编辑体验
- 🧩 **14 项增强功能**：表格、任务列表、图片、视频、@提及、Markdown 等按需启用
- 📤 **多种输出格式**：支持 HTML、JSON、纯文本输出
- 🖼️ **图片/视频上传**：支持自定义上传、服务端上传、自定义选择器三种方式
- 👥 **@提及**：支持自定义查询或服务端查询用户列表
- 🎨 **富文本样式**：字体大小、字体族、文本颜色、高亮背景、对齐方式
- 🔗 **双向绑定**：支持 `v-model` 绑定编辑器内容
- 🌐 **国际化**：内置中英文语言包
- 🎯 **TypeScript**：完整的类型定义，提供最佳开发体验
- 🔌 **可扩展**：支持传入自定义 Tiptap 扩展

## 安装

```bash
pnpm add @aix/rich-text-editor
# 或
npm install @aix/rich-text-editor
# 或
yarn add @aix/rich-text-editor
```

组件样式与主题变量需要在应用入口各引入一次：

```ts
import '@aix/rich-text-editor/style';
import '@aix/theme/style';
```

## 使用

### 基础用法

```vue
<template>
  <RichTextEditor v-model="content" placeholder="请输入内容..." />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RichTextEditor } from '@aix/rich-text-editor';

const content = ref('');
</script>
```

### 启用增强功能

```vue
<template>
  <RichTextEditor
    v-model="content"
    :table="true"
    :task-list="true"
    :text-align="true"
    :text-color="true"
    :highlight="true"
    :markdown="true"
    :image="imageConfig"
    :character-count="{ limit: 5000 }"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RichTextEditor, type ImageConfig } from '@aix/rich-text-editor';

const content = ref('');

const imageConfig: ImageConfig = {
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    return data.url;
  },
  maxSize: 5 * 1024 * 1024, // 5MB
};
</script>
```

### @提及功能

```vue
<template>
  <RichTextEditor
    v-model="content"
    :mention="mentionConfig"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RichTextEditor, type MentionConfig } from '@aix/rich-text-editor';

const content = ref('');

const mentionConfig: MentionConfig = {
  queryItems: async (query: string) => {
    const res = await fetch(`/api/users?keyword=${query}`);
    const data = await res.json();
    return data.map((u: any) => ({ id: u.id, label: u.name }));
  },
};
</script>
```

### 获取编辑器实例

```vue
<template>
  <RichTextEditor ref="editorRef" v-model="content" />
  <button @click="getContent">获取 HTML</button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RichTextEditor, type RichTextEditorExpose } from '@aix/rich-text-editor';

const editorRef = ref<RichTextEditorExpose>();
const content = ref('');

const getContent = () => {
  console.log(editorRef.value?.getHTML());
};
</script>
```

## API

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

```typescript
/** 内容输出格式 */
export type OutputFormat = 'html' | 'json' | 'text';

/** 图片功能配置 */
export interface ImageConfig extends BaseUploadConfig {
  /** 是否允许 base64 内联 @default false */
  allowBase64?: boolean;
}

/** 视频功能配置 */
export interface VideoConfig extends BaseUploadConfig {}

/** 上传公共配置 */
export interface BaseUploadConfig {
  /** 自定义选择器（优先级最高） */
  customPicker?: () => Promise<string | null>;
  /** 自定义上传回调，返回文件 URL */
  upload?: (file: File) => Promise<string>;
  /** 服务端上传地址 */
  server?: string;
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
  /** 上传前钩子 */
  beforeUpload?: (file: File) => boolean | File | Promise<boolean | File>;
  /** 上传成功回调 */
  onSuccess?: (url: string, file: File) => void;
  /** 上传失败回调 */
  onError?: (error: UploadError, file: File) => void;
  /** 允许的文件类型 */
  acceptedTypes?: string[];
  /** 最大文件大小（字节） */
  maxSize?: number;
}

/** @提及配置 */
export interface MentionConfig {
  /** 自定义查询回调（优先级最高） */
  queryItems?: (query: string) => Promise<MentionItem[]> | MentionItem[];
  /** 服务端查询地址 */
  server?: string;
  /** 自定义请求头 */
  headers?: HeadersConfig;
  /** 查询参数名 @default 'keyword' */
  queryParamName?: string;
  /** 从响应中提取列表的点分路径 @default 'data' */
  responsePath?: string;
  /** 映射后端返回数据为 MentionItem */
  transformResponse?: (data: unknown[]) => MentionItem[];
  /** 查询失败回调 */
  onError?: (error: UploadError) => void;
  /** 渲染提及项标签 */
  renderLabel?: (item: MentionItem) => string;
  /** 触发字符 @default '@' */
  trigger?: string;
}

/** @提及项 */
export interface MentionItem {
  id: string | number;
  label: string;
  [key: string]: unknown;
}

/** 字符统计配置 */
export interface CharacterCountConfig {
  /** 最大字符数 */
  limit?: number;
  /** 统计模式 @default 'textSize' */
  mode?: 'textSize' | 'nodeSize';
}
```
