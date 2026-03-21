# @aix/code-editor

A Vue 3 CodeEditor component for AIX component library

## 安装

```bash
pnpm add @aix/code-editor
```

## 使用

```vue
<script setup lang="ts">
import { CodeEditor } from '@aix/code-editor';
</script>

<template>
  <CodeEditor>内容</CodeEditor>
</template>
```

## Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| type | `'primary' \| 'default'` | `'default'` | 组件类型 |
| size | `'small' \| 'medium' \| 'large'` | `'medium'` | 组件尺寸 |
| disabled | `boolean` | `false` | 是否禁用 |

## Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| click | `(event: MouseEvent)` | 点击事件 |

## Slots

| 插槽名 | 说明 |
|--------|------|
| default | 默认插槽 |
