---
id: component-lib/performance
title: 性能优化规范
description: 渲染优化、包体积优化和运行时性能
layer: domain
priority: 230
platforms: []
tags: [performance, optimization]
version: "1.0.0"
---

## 渲染性能

### 避免不必要的重渲染

```typescript
// ✅ 正确: shallowRef 用于大型对象
const tableData = shallowRef<Row[]>([]);

// ✅ 正确: computed 缓存计算结果
const filteredList = computed(() =>
  list.value.filter(item => item.active)
);

// ❌ 错误: 在 template 中使用会每次渲染都执行的方法
// <div v-for="item in list.filter(i => i.active)" />
```

### v-once / v-memo

```vue
<!-- 静态内容，只渲染一次 -->
<header v-once>
  <h1>\{{ title }}</h1>
</header>

<!-- 仅当 id 变化时重新渲染 -->
<div v-memo="[item.id]">
  \{{ expensiveComputation(item) }}
</div>
```

### 虚拟滚动

列表超过 **100 项**时必须使用虚拟滚动。

## 包体积优化

### Tree-shaking 友好

```typescript
// ✅ 正确: 命名导出，支持 tree-shaking
export { Button } from './button';
export { Input } from './input';

// ❌ 错误: 默认导出整个对象
export default { Button, Input };
```

### 按需导入

```typescript
// ✅ 正确: 按需导入
import { Button } from '@scope/button';

// ❌ 错误: 全量导入
import Components from '@scope/components';
```

### 依赖管理

- **Vue** 必须声明为 `peerDependencies`
- 避免引入大型工具库（如 lodash 全量）
- CSS 与 JS 分离，支持按需加载样式
- 使用 `bundlesize` 或 CI 检查监控包体积

## 运行时性能

- 事件监听器在 `onUnmounted` 中清理
- 大量 DOM 操作使用 `requestAnimationFrame`
- 图片使用懒加载（`loading="lazy"`）
- 防抖/节流高频事件（resize, scroll, input）
