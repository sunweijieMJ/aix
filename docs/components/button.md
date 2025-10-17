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

### 点击事件

按钮点击事件。

<div class="demo-block">
  <Button type="primary" @click="handleClick">Click Me</Button>
</div>

```vue
<template>
  <Button type="primary" @click="handleClick">Click Me</Button>
</template>

<script setup>
const handleClick = (event) => {
  console.log('Button clicked!', event);
};
</script>
```

## API

<<< @/../docs/api/button.md

::: tip 提示
API 文档由 vue-docgen-api 自动生成。如果需要更新，请运行 `pnpm docs:gen`。
:::
