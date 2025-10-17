# @aix/button

一个功能完整、高度可定制的 Vue 3 按钮组件。

## ✨ 特性

- 🎨 **多种类型**：支持 primary、default、dashed、text、link 五种按钮类型
- 📏 **三种尺寸**：small、medium、large 灵活选择
- 🔄 **加载状态**：内置加载动画，优雅的异步操作反馈
- 🚫 **禁用状态**：完整的禁用状态支持
- 🎯 **TypeScript**：完整的类型定义，提供最佳开发体验
- 🌈 **主题定制**：基于 Ant Design 色彩体系，易于定制

## 📦 安装

```bash
pnpm add @aix/button
# 或
npm install @aix/button
# 或
yarn add @aix/button
```

## 🔨 使用

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

## 📖 API

### Props

| 属性名 | 说明 | 类型 | 可选值 | 默认值 |
|--------|------|------|--------|--------|
| type | 按钮类型 | `string` | `'primary'` \| `'default'` \| `'dashed'` \| `'text'` \| `'link'` | `'default'` |
| size | 按钮尺寸 | `string` | `'small'` \| `'medium'` \| `'large'` | `'medium'` |
| disabled | 是否禁用 | `boolean` | - | `false` |
| loading | 是否加载中 | `boolean` | - | `false` |

### Events

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| click | 点击按钮时触发 | `(event: MouseEvent) => void` |

### Slots

| 插槽名 | 说明 |
|--------|------|
| default | 按钮内容 |

## 🎨 样式定制

### CSS 类名

组件使用标准的 CSS 类名，您可以通过覆盖以下类来自定义样式：

```css
/* 基础样式 */
.aix-button { }

/* 类型样式 */
.aix-button--primary { }
.aix-button--default { }
.aix-button--dashed { }
.aix-button--text { }
.aix-button--link { }

/* 尺寸样式 */
.aix-button--small { }
.aix-button--medium { }
.aix-button--large { }

/* 状态样式 */
.aix-button--disabled { }
.aix-button--loading { }
```

## 📝 类型定义

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

## 📄 License

MIT
