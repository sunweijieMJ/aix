# @aix/code-editor

基于 CodeMirror 6 的 Vue 3 代码编辑器组件，支持 20 种编程语言和亮/暗主题。

## 特性

- 🖥️ **多语言支持**：JavaScript、TypeScript、Python、Java、Go、Rust、SQL、HTML、CSS、Vue 等 20 种语言
- 🎨 **主题切换**：内置亮色/暗色主题，自动适配
- ✏️ **丰富编辑功能**：行号、代码折叠、括号匹配、当前行高亮
- 🔗 **双向绑定**：支持 `v-model` 绑定编辑器内容
- 📖 **只读/禁用**：支持只读模式（保留光标）和禁用模式（完全不可交互）
- 🎯 **TypeScript**：完整的类型定义，提供最佳开发体验
- 🔌 **可扩展**：支持传入自定义 CodeMirror 扩展

## 安装

```bash
pnpm add @aix/code-editor
# 或
npm install @aix/code-editor
# 或
yarn add @aix/code-editor
```

## 使用

### 基础用法

```vue
<template>
  <CodeEditor v-model="code" language="javascript" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { CodeEditor } from '@aix/code-editor';

const code = ref('console.log("Hello, World!");');
</script>
```

### 多语言切换

```vue
<template>
  <CodeEditor
    v-model="code"
    :language="lang"
    :line-numbers="true"
    :fold-gutter="true"
    theme="dark"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { CodeEditor } from '@aix/code-editor';

const lang = ref<'javascript' | 'python' | 'go'>('python');
const code = ref('print("Hello, World!")');
</script>
```

### 只读模式

```vue
<template>
  <CodeEditor
    :model-value="code"
    language="json"
    :readonly="true"
    height="300px"
  />
</template>

<script setup lang="ts">
import { CodeEditor } from '@aix/code-editor';

const code = '{ "name": "aix", "version": "1.0.0" }';
</script>
```

### 获取编辑器实例

```vue
<template>
  <CodeEditor ref="editorRef" v-model="code" language="typescript" />
  <button @click="insertText">插入文本</button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { CodeEditor, type CodeEditorExpose } from '@aix/code-editor';

const editorRef = ref<CodeEditorExpose>();
const code = ref('');

const insertText = () => {
  editorRef.value?.insert('// 插入的注释\n');
};
</script>
```

## API

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
## 类型定义

```typescript
/** 支持的编程语言 */
export type CodeLanguage =
  | 'javascript' | 'typescript' | 'json' | 'html' | 'css'
  | 'python' | 'java' | 'go' | 'rust' | 'cpp'
  | 'php' | 'sql' | 'yaml' | 'xml' | 'markdown'
  | 'sass' | 'vue' | 'angular' | 'liquid' | 'wast';

/** 编辑器主题 */
export type CodeEditorTheme = 'light' | 'dark';

export interface CodeEditorProps {
  modelValue?: string;
  language?: CodeLanguage;
  theme?: CodeEditorTheme;
  readonly?: boolean;
  disabled?: boolean;
  placeholder?: string;
  lineNumbers?: boolean;
  foldGutter?: boolean;
  highlightActiveLine?: boolean;
  bracketMatching?: boolean;
  tabSize?: number;
  height?: string;
  minHeight?: string;
  maxHeight?: string;
  extensions?: Extension[];
}

export interface CodeEditorEmits {
  (e: 'update:modelValue', value: string): void;
  (e: 'change', value: string): void;
  (e: 'focus', view: EditorView): void;
  (e: 'blur', view: EditorView): void;
  (e: 'ready', view: EditorView): void;
}
```
