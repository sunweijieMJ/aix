# @aix/button

这是一个 Vue 3 示例组件。

## 特性

- 🎨 **多种类型**：支持 primary、default、dashed、text、link 五种按钮类型
- 📏 **三种尺寸**：small、medium、large 灵活选择
- 🔄 **加载状态**：内置加载动画，优雅的异步操作反馈
- 🚫 **禁用状态**：完整的禁用状态支持
- 🎯 **TypeScript**：完整的类型定义，提供最佳开发体验
- 🌈 **主题定制**：基于 Ant Design 色彩体系，易于定制

## 安装

```bash
pnpm add @aix/button
# 或
npm install @aix/button
# 或
yarn add @aix/button
```

## 使用

### 基础用法

```vue
<template>
  <Button type="primary">主要按钮</Button>
  <Button>默认按钮</Button>
  <Button type="dashed">虚线按钮</Button>
  <Button type="text">文本按钮</Button>
  <Button type="link">链接按钮</Button>
</template>

<script setup>
import { Button } from '@aix/button';
</script>
```

### 不同尺寸

```vue
<template>
  <Button type="primary" size="small">小尺寸</Button>
  <Button type="primary" size="medium">中等尺寸</Button>
  <Button type="primary" size="large">大尺寸</Button>
</template>
```

### 禁用状态

```vue
<template>
  <Button type="primary" disabled>禁用按钮</Button>
  <Button disabled>禁用按钮</Button>
</template>
```

### 加载状态

```vue
<template>
  <Button type="primary" :loading="loading" @click="handleClick">
    提交
  </Button>
</template>

<script setup>
import { ref } from 'vue';
import { Button } from '@aix/button';

const loading = ref(false);

const handleClick = async () => {
  loading.value = true;
  try {
    await someAsyncOperation();
  } finally {
    loading.value = false;
  }
};
</script>
```

### 点击事件

```vue
<template>
  <Button type="primary" @click="handleClick">点击我</Button>
</template>

<script setup>
import { Button } from '@aix/button';

const handleClick = (event: MouseEvent) => {
  console.log('按钮被点击了', event);
};
</script>
```

### 多语言支持

按钮上的文字来自 `<slot />`，由业务侧提供，组件不参与。组件自己渲染的文案只有一处：
loading 态加载图标的无障碍标签（`loadingText`），供屏幕阅读器播报。

默认跟随 `@aix/hooks` 的全局语言（未配置时为 `zh-CN`），无需任何接入代码：

```vue
<template>
  <!-- 屏幕阅读器读到 "加载中"；语言切到 en-US 时读到 "Loading" -->
  <Button type="primary" :loading="true">提交</Button>
</template>

<script setup lang="ts">
import { Button } from '@aix/button';
</script>
```

需要改这句文案时，在应用入口做覆盖：

```ts
import { createApp } from 'vue';
import { createLocale } from '@aix/hooks';
import App from './App.vue';

const app = createApp(App);
app.use(
  createLocale('zh-CN', {
    messages: {
      button: { 'zh-CN': { loadingText: '处理中' } },
    },
  }),
);
app.mount('#app');
```

语言包也可以单独导入（自定义 `useLocale` 场景）：

```ts
import { buttonLocale, buttonZhCN, buttonEnUS } from '@aix/button';
import type { ButtonLocale } from '@aix/button';
```

| 文案 key | zh-CN | en-US | 用途 |
|----------|-------|-------|------|
| `loadingText` | 加载中 | Loading | loading 态加载图标的 `aria-label` |

## API

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `type` | `"primary" \| "default" \| "dashed" \| "text" \| "link"` | `'default'` | - | 按钮类型 |
| `htmlType` | `"button" \| "submit" \| "reset"` | `'button'` | - | 原生 button 元素的 type 属性（type 名称已被风格类型占用） 注意：默认值为 'button'，与原生默认的 'submit' 不同， 避免按钮放入 form 后意外触发表单提交；需要提交表单时显式传入 'submit' |
| `size` | `"small" \| "medium" \| "large"` | `'medium'` | - | 按钮尺寸 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `loading` | `boolean` | `false` | - | 是否加载中，加载中时按钮不可点击并显示加载动画 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `click` | `MouseEvent` | 点击按钮时触发 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| `default` | - |
## 类型定义

```typescript
export interface ButtonProps {
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';
  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否加载中 */
  loading?: boolean;
}

export interface ButtonEmits {
  (e: 'click', event: MouseEvent): void;
}
```
