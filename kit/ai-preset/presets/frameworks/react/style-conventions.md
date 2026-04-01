---
id: react/style-conventions
title: React 样式规范
description: CSS Modules、Tailwind CSS 和 CSS-in-JS 的使用规范
layer: framework
priority: 140
platforms: []
tags: [react, css, style]
version: "1.0.0"
---

## 职责

负责 React 项目样式方案选型和编写规范指导。

---

## 方案选型

| 方案 | 适用场景 | 优势 | 劣势 |
|------|---------|------|------|
| **CSS Modules** | 通用项目 | 零运行时、天然隔离、学习成本低 | 动态样式不便 |
| **Tailwind CSS** | 快速开发、设计系统项目 | 原子化、一致性强、无需命名 | 类名长、学习曲线 |
| **CSS-in-JS** (styled-components) | 高度动态的组件库 | 动态样式、主题能力强 | 运行时开销、SSR 复杂 |

**推荐**：优先 CSS Modules 或 Tailwind CSS，避免重运行时的 CSS-in-JS 方案。

## CSS Modules

### 基本用法

```tsx
import styles from './UserCard.module.scss';

export function UserCard({ user, isActive }: UserCardProps) {
  return (
    <div className={`${styles.card} ${isActive ? styles.active : ''}`}>
      <img className={styles.avatar} src={user.avatar} alt={user.name} />
      <span className={styles.name}>{user.name}</span>
    </div>
  );
}
```

```scss
// UserCard.module.scss
.card {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-radius: 8px;
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--color-bg-hover);
  }
}

.active {
  border: 1px solid var(--color-primary);
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.name {
  margin-left: 12px;
  font-size: 14px;
}
```

### classnames 工具

```tsx
import cn from 'classnames';
import styles from './Button.module.scss';

export function Button({ variant = 'default', size = 'md', disabled, children }: ButtonProps) {
  return (
    <button
      className={cn(
        styles.button,
        styles[variant],     // styles.primary / styles.danger
        styles[`size-${size}`], // styles['size-sm'] / styles['size-lg']
        { [styles.disabled]: disabled },
      )}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
```

### 命名规范

```scss
// ✅ 正确: camelCase（CSS Modules 中推荐）
.userCard { }
.avatarImage { }
.isActive { }

// ❌ 错误: BEM 在 CSS Modules 中不必要（隔离已由模块保证）
.user-card__avatar--active { }
```

## Tailwind CSS

### 基本用法

```tsx
export function UserCard({ user, isActive }: UserCardProps) {
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg px-4 py-3 transition-colors hover:bg-gray-50',
      isActive && 'border border-blue-500',
    )}>
      <img className="size-10 rounded-full" src={user.avatar} alt={user.name} />
      <span className="text-sm text-gray-900">{user.name}</span>
    </div>
  );
}
```

### 组件抽取原则

```tsx
// ✅ 正确: 重复的样式组合抽取为组件，而非 @apply
function Badge({ children, variant = 'default' }: BadgeProps) {
  const variantStyles = {
    default: 'bg-gray-100 text-gray-700',
    success: 'bg-green-100 text-green-700',
    danger: 'bg-red-100 text-red-700',
  };

  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', variantStyles[variant])}>
      {children}
    </span>
  );
}

// ❌ 避免: 过度使用 @apply（失去原子化优势）
// .badge { @apply inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium; }
```

### 自定义设计令牌

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'var(--color-primary-50)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
        },
      },
      spacing: {
        'page-x': 'var(--spacing-page-x)',
      },
    },
  },
};
```

## 通用样式规范

### CSS 变量优先

```scss
// ✅ 正确: 使用 CSS 变量（无论哪种方案都适用）
.card {
  color: var(--color-text);
  background-color: var(--color-bg);
  border-radius: var(--radius-md);
}

// ❌ 错误: 硬编码颜色值
.card {
  color: #333;
  background: white;
}
```

### 响应式

```scss
// Mobile-first: 默认移动端，向上适配
.container {
  padding: 16px;

  @media (min-width: 768px) {
    padding: 24px;
  }

  @media (min-width: 1024px) {
    padding: 32px;
    max-width: 1200px;
    margin: 0 auto;
  }
}
```

### 暗色模式

```scss
// 通过 CSS 变量 + data 属性切换
:root {
  --color-bg: #ffffff;
  --color-text: #1a1a1a;
}

[data-theme='dark'] {
  --color-bg: #1a1a1a;
  --color-text: #f5f5f5;
}
```

## 规范要点

- **禁止**内联 style（除非真正需要动态计算的值如 `width: ${percent}%`）
- **禁止**全局样式污染（不在组件中写无作用域的全局 CSS）
- **禁止**使用 `!important`（设计问题不要用优先级暴力覆盖）
- z-index 统一管理，定义层级常量（dropdown: 1000, modal: 2000, toast: 3000）
- 动画使用 `transform` / `opacity`，避免触发 layout（width, height, top, left）
- 颜色值使用 CSS 变量或设计令牌，不硬编码
