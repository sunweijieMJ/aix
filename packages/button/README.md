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

### 多语言支持

Button 组件内置了多语言支持。组件包含特有文案（`loadingText`、`clickMe`、`submitButton`）以及继承的公共文案（`confirm`、`cancel`、`add` 等）。

```vue
<template>
  <div>
    <!-- 使用 Button 组件特有文案 -->
    <Button type="primary">{{ t.clickMe }}</Button>
    <Button type="primary" :loading="true">{{ t.loadingText }}</Button>
    <Button type="primary">{{ t.submitButton }}</Button>

    <!-- 使用公共文案 -->
    <Button type="default">{{ t.confirm }}</Button>
    <Button type="default">{{ t.cancel }}</Button>
    <Button type="link">{{ t.add }}</Button>
  </div>
</template>

<script setup>
import { Button, buttonLocale } from '@aix/button';
import { useLocale } from '@aix/hooks';

// 获取多语言文案
const { t } = useLocale(buttonLocale);

// t.value 包含：
// - Button 特有文案：loadingText, clickMe, submitButton
// - 公共文案：confirm, cancel, add, save, delete, edit 等
</script>
```

## 📖 API

### Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `type` | `"primary"` \| `"default"` \| `"dashed"` \| `"text"` \| `"link"` | `default` | - | 按钮类型 |
| `size` | `"small"` \| `"medium"` \| `"large"` | `medium` | - | 按钮尺寸 |
| `disabled` | `boolean` | `false` | - | 是否禁用 |
| `loading` | `boolean` | `false` | - | 是否加载中 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `click` | `MouseEvent` | - |

### Slots

| 插槽名 | 说明 |
|--------|------|
| `default` | - |

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
