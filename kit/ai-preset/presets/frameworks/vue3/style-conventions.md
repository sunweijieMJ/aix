---
id: vue3/style-conventions
title: Vue 样式规范
description: CSS 变量、BEM 命名和样式组织规范
layer: framework
priority: 140
platforms: []
tags: [vue, css, style]
version: "1.0.0"
variables:
  componentPrefix:
    default: "app"
    description: "组件 CSS 类名前缀"
---

## CSS 变量使用规范

### 颜色必须使用变量

```scss
// ✅ 正确: 使用 CSS 变量
.{{componentPrefix}}-button {
  color: var(--{{componentPrefix}}-color-primary);
  background: var(--{{componentPrefix}}-bg-primary);
  border-radius: var(--{{componentPrefix}}-border-radius);
}

// ❌ 错误: 硬编码颜色值（禁止!）
.{{componentPrefix}}-button {
  color: #1890ff;
  background: rgba(24, 144, 255, 0.1);
}
```

## 样式命名规范

### BEM + 命名空间

```scss
// Block: {{componentPrefix}}-组件名
// Element: __元素名
// Modifier: --修饰符

.{{componentPrefix}}-button {
  // Block 样式

  &__icon {
    // Element 样式
  }

  &__text {
    // Element 样式
  }

  &--primary {
    // Modifier 样式
  }

  &--disabled {
    // Modifier 样式
  }
}
```

### 选择器规范

- **禁止**标签选择器（`div`, `span`），必须使用 class
- **禁止**过深嵌套（最多 **3 层**）
- class 统一使用 `.{{componentPrefix}}-` 前缀

## 样式组织

### 单文件组件样式

```vue
<style lang="scss">
.{{componentPrefix}}-user-card {
  display: flex;
  padding: var(--{{componentPrefix}}-spacing-md);
  border-radius: var(--{{componentPrefix}}-border-radius);

  &__avatar {
    width: 40px;
    height: 40px;
  }

  &__content {
    flex: 1;
    margin-left: var(--{{componentPrefix}}-spacing-sm);
  }

  &--compact {
    padding: var(--{{componentPrefix}}-spacing-xs);
  }
}
</style>
```

### 盒模型

```scss
// 全局设置 border-box
*,
*::before,
*::after {
  box-sizing: border-box;
}
```

### 响应式

```scss
// 使用 CSS 变量定义断点
@media (max-width: 768px) {
  .{{componentPrefix}}-layout {
    flex-direction: column;
  }
}
```
