---
title: CodeEditor 代码编辑器
outline: deep
---

<script setup>
import { ref, computed } from 'vue'
import { CodeEditor } from '@aix/code-editor'

const basic = ref(`function greet(name) {\n  return \`Hello, \${name}!\`;\n}\n\ngreet('AIX');`)

const language = ref('python')
const snippets = {
  python: 'def greet(name):\n    return f"Hello, {name}!"\n\n\nprint(greet("AIX"))',
  json: '{\n  "name": "@aix/code-editor",\n  "private": false\n}',
  sql: 'select id, name\nfrom students\nwhere grade = 3\norder by name;',
}
const langCode = computed({
  get: () => snippets[language.value],
  set: (value) => (snippets[language.value] = value),
})

const themed = ref('const theme = "dark";\nconsole.log(theme);')
const editorTheme = ref('dark')

const editorRef = ref()
const stat = ref('')
function readStat() {
  const api = editorRef.value
  if (!api) return
  const { line, col } = api.getCursorPosition()
  stat.value = `共 ${api.getLineCount()} 行，光标在 ${line}:${col}，选中「${api.getSelection() || '无'}」`
}
</script>

<style>
.code-editor-demo {
  display: block;
  padding: 0;
}
</style>

# CodeEditor 代码编辑器

基于 [CodeMirror 6](https://codemirror.net/) 的代码编辑器，20 种语言的语法高亮、行号、折叠、括号匹配与
语法校验开箱可用，编辑器实例通过 `ref` 暴露给业务做编程式操作。

## 何时使用

- 需要让用户在页面里写代码或改配置：在线判题、规则脚本、JSON / YAML 配置编辑
- 需要只读地展示一段带高亮的代码，且希望保留选中、折叠、行号
- 需要拿到编辑器实例做插入片段、替换选区、统计行数这类操作

只是展示一小段代码不必用它，Markdown 的围栏代码块更轻。要编辑的是富文本而不是代码，用
[RichTextEditor 富文本编辑器](/components/rich-text-editor)。

## 安装

```bash
pnpm add @aix/code-editor
```

组件样式与主题变量需要在应用入口各引入一次：

```ts
import '@aix/code-editor/style';
import '@aix/theme/style';
```

## 代码演示

### 基础用法

`v-model` 绑定内容，`language` 决定高亮规则。行号、折叠、当前行高亮、括号匹配、语法校验默认全开。

<ClientOnly>
<div class="demo-block code-editor-demo">
  <CodeEditor v-model="basic" language="javascript" height="180px" />
</div>
</ClientOnly>

```vue
<template>
  <CodeEditor v-model="code" language="javascript" height="180px" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { CodeEditor } from '@aix/code-editor';

const code = ref('function greet(name) {\n  return `Hello, ${name}!`;\n}');
</script>
```

### 切换语言

`language` 支持 20 种取值，完整清单见 API 表。切换时高亮规则会即时重建。

<ClientOnly>
<div class="demo-block code-editor-demo">
  <div style="display: flex; gap: 8px; margin-bottom: 12px;">
    <button v-for="lang in ['python', 'json', 'sql']" :key="lang" @click="language = lang">{{ lang }}</button>
  </div>
  <CodeEditor v-model="langCode" :language="language" height="160px" />
</div>
</ClientOnly>

```vue
<template>
  <CodeEditor v-model="code" :language="language" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { CodeLanguage } from '@aix/code-editor';

const language = ref<CodeLanguage>('python');
const code = ref('def greet(name):\n    return f"Hello, {name}!"');
</script>
```

### 明暗主题

`theme` 只控制编辑器自身的配色，与 `@aix/theme` 的亮暗模式相互独立，需要联动时自行把主题模式映射过来。

<ClientOnly>
<div class="demo-block code-editor-demo">
  <div style="margin-bottom: 12px;">
    <button @click="editorTheme = editorTheme === 'dark' ? 'light' : 'dark'">当前：{{ editorTheme }}</button>
  </div>
  <CodeEditor v-model="themed" language="javascript" :theme="editorTheme" height="120px" />
</div>
</ClientOnly>

```vue
<template>
  <CodeEditor v-model="code" :theme="mode === 'dark' ? 'dark' : 'light'" />
</template>

<script setup lang="ts">
import { useTheme } from '@aix/theme';

const { mode } = useTheme();
</script>
```

### 只读与编程式操作

`readonly` 保留光标与选中、禁止修改，`disabled` 则完全不可交互。实例上的 `getSelection` /
`getCursorPosition` / `insert` 等方法可直接调用。

<ClientOnly>
<div class="demo-block code-editor-demo">
  <CodeEditor ref="editorRef" v-model="basic" language="javascript" readonly height="140px" />
  <div style="display: flex; gap: 8px; align-items: center; margin-top: 12px;">
    <button @click="readStat">读取状态</button>
    <span style="font-size: 13px; color: var(--vp-c-text-2);">{{ stat || '选中一段代码后点左边' }}</span>
  </div>
</div>
</ClientOnly>

```vue
<template>
  <CodeEditor ref="editorRef" v-model="code" readonly />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { CodeEditor } from '@aix/code-editor';

const editorRef = ref<InstanceType<typeof CodeEditor>>();

function insertSnippet() {
  editorRef.value?.insert('console.log("hi");');
}
</script>
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

## 类型定义

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

```typescript
/** Lint 配置选项 */
export interface CodeEditorLintConfig {
  /**
   * 检查延迟（毫秒），文档变更后等待多久执行 lint
   * @default 750
   */
  delay?: number;
}

/** 支持的编程语言 */
export type CodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'html'
  | 'css'
  | 'python'
  | 'java'
  | 'go'
  | 'rust'
  | 'cpp'
  | 'php'
  | 'sql'
  | 'yaml'
  | 'xml'
  | 'markdown'
  | 'sass'
  | 'vue'
  | 'angular'
  | 'liquid'
  | 'wast';

/** 编辑器主题 */
export type CodeEditorTheme = 'light' | 'dark';
```
