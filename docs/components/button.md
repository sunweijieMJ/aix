---
title: Button 按钮
outline: deep
---

<script setup>
import { Button } from '@aix/button'
</script>

# Button 按钮

按钮用于开始一个即时操作。

## 何时使用

标记了一个（或封装一组）操作命令，响应用户点击行为，触发相应的业务逻辑。

## 安装

```bash
pnpm add @aix/button
```

组件样式与主题变量需要在应用入口各引入一次：

```ts
import '@aix/button/style';
import '@aix/theme/style';
```

组件自己渲染的文案只有一条：加载态给读屏软件用的 `loadingText`（加载中 / Loading），
需要改用 `createLocale(locale, { messages: { button: { loadingText: '处理中' } } })` 覆盖，
语言包也可单独导入 `buttonLocale` / `buttonZhCN` / `buttonEnUS`。

## 代码演示

### 按钮类型

按钮有五种类型：主按钮、次按钮、虚线按钮、文本按钮和链接按钮。

<div class="demo-block">
  <Button type="primary">Primary Button</Button>
  <Button>Default Button</Button>
  <Button type="dashed">Dashed Button</Button>
  <Button type="text">Text Button</Button>
  <Button type="link">Link Button</Button>
</div>

```vue
<template>
  <Button type="primary">Primary Button</Button>
  <Button>Default Button</Button>
  <Button type="dashed">Dashed Button</Button>
  <Button type="text">Text Button</Button>
  <Button type="link">Link Button</Button>
</template>

<script setup>
import { Button } from '@aix/button';
</script>
```

### 按钮尺寸

按钮有大、中、小三种尺寸。

<div class="demo-block">
  <Button type="primary" size="large">Large Button</Button>
  <Button type="primary" size="medium">Medium Button</Button>
  <Button type="primary" size="small">Small Button</Button>
</div>

```vue
<template>
  <Button type="primary" size="large">Large Button</Button>
  <Button type="primary" size="medium">Medium Button</Button>
  <Button type="primary" size="small">Small Button</Button>
</template>
```

### 禁用状态

添加 `disabled` 属性即可让按钮处于不可用状态，同时按钮样式也会改变。

<div class="demo-block">
  <Button type="primary" disabled>Primary Disabled</Button>
  <Button disabled>Default Disabled</Button>
  <Button type="dashed" disabled>Dashed Disabled</Button>
  <Button type="text" disabled>Text Disabled</Button>
  <Button type="link" disabled>Link Disabled</Button>
</div>

```vue
<template>
  <Button type="primary" disabled>Primary Disabled</Button>
  <Button disabled>Default Disabled</Button>
</template>
```

### 加载状态

添加 `loading` 属性即可让按钮处于加载状态，最后两个按钮演示点击后进入加载状态。

<div class="demo-block">
  <Button type="primary" loading>Loading</Button>
  <Button loading>Loading</Button>
</div>

```vue
<template>
  <Button type="primary" loading>Loading</Button>
  <Button loading>Loading</Button>
</template>
```

## API

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

**Button** — 按钮组件

用于触发操作和提交表单。支持多种类型、尺寸和状态。

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `type` | `'primary' \| 'default' \| 'dashed' \| 'text' \| 'link'` | `'default'` | - | 按钮类型 |
| `htmlType` | `'button' \| 'submit' \| 'reset'` | `'button'` | - | 原生 button 元素的 type 属性（type 名称已被风格类型占用）<br>注意：默认值为 'button'，与原生默认的 'submit' 不同，避免按钮放入 form 后意外触发表单提交；需要提交表单时显式传入 'submit' |
| `size` | `'small' \| 'medium' \| 'large'` | `'medium'` | - | 按钮尺寸 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `loading` | `boolean` | `false` | - | 是否加载中，加载中时按钮不可点击并显示加载动画 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `click` | `event: MouseEvent` | 点击按钮时触发 |

### Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `default` | - | 按钮内容 |
