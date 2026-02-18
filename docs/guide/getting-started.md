# 快速开始

本节将介绍如何在项目中使用 Aix。

## 安装

### 使用包管理器

我们推荐使用 pnpm 或 npm 安装。

::: code-group

```bash [pnpm]
pnpm add @aix/button @aix/theme
```

```bash [npm]
npm install @aix/button @aix/theme
```

```bash [yarn]
yarn add @aix/button @aix/theme
```

:::

## 完整引入

```typescript
// main.ts
import { createApp } from 'vue';
import App from './App.vue';

// 引入组件
import Button from '@aix/button';
// 引入样式
import '@aix/theme/dist/index.css';

const app = createApp(App);

// 注册组件
app.use(Button);

app.mount('#app');
```

## 按需引入（推荐）

Aix 支持基于 ES modules 的 tree shaking，可以实现按需引入。

```vue
<script setup lang="ts">
import { Button } from '@aix/button';
import '@aix/theme/dist/index.css';
</script>

<template>
  <Button type="primary">按钮</Button>
</template>
```

## TypeScript 支持

Aix 使用 TypeScript 编写，提供完整的类型定义。

```typescript
import { Button } from '@aix/button';
import type { ButtonProps } from '@aix/button';

const props: ButtonProps = {
  type: 'primary',
  size: 'medium',
  disabled: false,
};
```

## 开始使用

现在你已经完成了 Aix 的安装和引入，接下来可以：

- 查看[组件文档](/components/)了解各个组件的用法
- 阅读[主题定制](/guide/theme)了解如何定制主题
- 参考[组件示例](/components/)查看实际应用场景
