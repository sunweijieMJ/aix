# @aix/theme

AIX 设计系统的主题包，提供 CSS 变量、SCSS Mixins 和主题定制功能。

## ✨ 特性

- 🎨 **CSS 变量**：基于 CSS 自定义属性的主题系统
- 🌓 **亮暗主题**：内置亮色和暗色主题支持
- 📏 **尺寸系统**：统一的尺寸规范和变量
- 🔧 **SCSS Mixins**：实用的样式混入工具
- 🎯 **TypeScript**：完整的类型定义支持
- 📦 **零依赖**：纯 CSS/SCSS 实现

## 📦 安装

```bash
pnpm add @aix/theme
npm install @aix/theme
yarn add @aix/theme
```

## 🔨 使用

### 基础用法

在您的项目入口文件中导入主题：

```typescript
// main.ts
import '@aix/theme';
```

或在组件中导入：

```vue
<style>
@import '@aix/theme';

.my-component {
  color: var(--colorText);
  background: var(--colorBgContainer);
}
</style>
```

### 导入特定模块

```typescript
// 只导入 CSS 变量
import '@aix/theme/vars';

// 只导入亮色主题
import '@aix/theme/vars/light';

// 只导入暗色主题
import '@aix/theme/vars/dark';

// 只导入尺寸变量
import '@aix/theme/vars/size';
```

### 使用 SCSS Mixins

```scss
@use '@aix/theme/mixins' as *;

.text-truncate {
  @include ellipsis();
}

.multi-line-truncate {
  @include ellipsis(3);
}
```

## 📖 CSS 变量

### 颜色变量

```css
/* 主题色 */
--colorPrimary: #1890ff;
--colorPrimaryHover: #40a9ff;
--colorPrimaryActive: #096dd9;

/* 文本颜色 */
--colorText: rgba(0, 0, 0, 0.88);
--colorTextSecondary: rgba(0, 0, 0, 0.65);
--colorTextLight: #ffffff;

/* 背景颜色 */
--colorBgContainer: #ffffff;
--colorBgLayout: #f5f5f5;
--colorBorder: #d9d9d9;

/* 链接颜色 */
--colorLink: #1890ff;
--colorLinkHover: #40a9ff;
--colorLinkActive: #096dd9;
```

### 尺寸变量

```css
/* 字体大小 */
--fontSizeXS: 12px;
--fontSize: 14px;
--fontSizeLG: 16px;

/* 间距 */
--paddingXXS: 4px;
--paddingXS: 8px;
--padding: 12px;
--paddingSM: 16px;
--paddingLG: 20px;

/* 圆角 */
--borderRadiusSM: 4px;
--borderRadius: 6px;
--borderRadiusLG: 8px;
```

## 🌓 主题切换

### 亮色主题（默认）

```typescript
import '@aix/theme/vars/light';
```

### 暗色主题

```typescript
import '@aix/theme/vars/dark';
```

### 动态切换主题

```vue
<script setup>
import { ref, watch } from 'vue';

const isDark = ref(false);

watch(isDark, (dark) => {
  if (dark) {
    import('@aix/theme/vars/dark');
  } else {
    import('@aix/theme/vars/light');
  }
});
</script>

<template>
  <button @click="isDark = !isDark">
    切换到{{ isDark ? '亮色' : '暗色' }}主题
  </button>
</template>
```

## 🔧 SCSS Mixins

### ellipsis

文本溢出省略号

```scss
@use '@aix/theme/mixins' as *;

// 单行省略
.single-line {
  @include ellipsis();
}

// 多行省略
.multi-line {
  @include ellipsis(3); // 显示 3 行
}
```

## 🎨 自定义主题

### 覆盖 CSS 变量

```css
:root {
  /* 自定义主题色 */
  --colorPrimary: #ff6b6b;
  --colorPrimaryHover: #ff8787;
  --colorPrimaryActive: #ff5252;

  /* 自定义字体 */
  --fontSize: 16px;

  /* 自定义圆角 */
  --borderRadius: 8px;
}
```

### 在组件中使用

```vue
<template>
  <div class="custom-card">
    <h3>自定义卡片</h3>
    <p>使用主题变量</p>
  </div>
</template>

<style scoped>
.custom-card {
  padding: var(--padding);
  border-radius: var(--borderRadius);
  background: var(--colorBgContainer);
  color: var(--colorText);
  border: 1px solid var(--colorBorder);
}

.custom-card h3 {
  color: var(--colorPrimary);
  font-size: var(--fontSizeLG);
}
</style>
```

## 📝 完整变量列表

查看 [src/vars](./src/vars) 目录了解所有可用的 CSS 变量。

## 🤝 与组件库集成

AIX Theme 是 AIX 组件库的基础，所有组件都使用这些主题变量，确保一致的视觉体验。

```vue
<script setup>
import { Button } from '@aix/button';
import '@aix/theme';
</script>

<template>
  <!-- Button 组件自动使用主题变量 -->
  <Button type="primary">主要按钮</Button>
</template>
```

## 📄 License

MIT
