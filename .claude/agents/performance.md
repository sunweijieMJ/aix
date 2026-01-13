---
name: performance
description: 组件库性能优化完整指南，包括 Vue 3 渲染优化、包体积优化、运行时性能和性能测试
---

# 性能优化指南

## 职责

提供组件库性能优化的完整指导，确保组件在各种场景下都有良好的性能表现。

> **相关文档**:
> - [component-design.md](component-design.md) - 组件设计规范
> - [coding-standards.md](coding-standards.md) - 编码规范
> - [testing.md](testing.md) - 测试策略（包含性能测试）

---

## 性能优化原则

### 1. 度量先行
- 先测量，后优化，避免过早优化
- 使用 Performance API、Vue DevTools 定位瓶颈
- 设定明确的性能指标和目标

### 2. 用户感知优先
- 优先优化用户可感知的性能问题
- 首屏加载 > 交互响应 > 后台任务

### 3. 渐进式优化
- 从影响最大的点开始
- 每次优化后验证效果
- 避免过度优化增加复杂度

---

## 1. Vue 3 渲染优化

### 1.1 v-memo 优化列表渲染

`v-memo` 可以跳过子树的重新渲染，适用于大型列表：

```vue
<template>
  <!-- 基础用法：依赖值不变时跳过渲染 -->
  <div
    v-for="item in items"
    :key="item.id"
    v-memo="[item.id, item.selected]"
  >
    <ItemCard :item="item" />
  </div>
</template>
```

**使用场景**：
- 列表项 > 100 个
- 列表项包含复杂子组件
- 只有部分属性会变化

**注意事项**：
```vue
<!-- 正确：明确列出依赖 -->
<div v-memo="[item.id, item.name, item.status]">

<!-- 错误：依赖整个对象（失去优化效果） -->
<div v-memo="[item]">
```

### 1.2 computed 缓存计算结果

```typescript
// 正确：使用 computed 缓存
const filteredItems = computed(() => {
  return props.items.filter(item => item.visible);
});

const sortedItems = computed(() => {
  return [...filteredItems.value].sort((a, b) => a.order - b.order);
});

// 错误：在模板中直接调用方法
// <div>{{ filterItems() }}</div>  // 每次渲染都会执行
```

**链式 computed 优化**：
```typescript
// 分层计算，避免重复计算
const baseItems = computed(() => props.items);
const filteredItems = computed(() => baseItems.value.filter(filterFn));
const sortedItems = computed(() => [...filteredItems.value].sort(sortFn));
const paginatedItems = computed(() => sortedItems.value.slice(start, end));
```

### 1.3 shallowRef / shallowReactive

对于大型数据结构，使用浅响应式：

```typescript
import { shallowRef, shallowReactive, triggerRef } from 'vue';

// 大型列表使用 shallowRef
const largeList = shallowRef<Item[]>([]);

// 更新时手动触发
const updateItem = (index: number, newItem: Item) => {
  largeList.value[index] = newItem;
  triggerRef(largeList); // 手动触发更新
};

// 或者替换整个数组
const replaceList = (newList: Item[]) => {
  largeList.value = newList; // 自动触发更新
};
```

**使用场景**：
- 列表数据 > 1000 条
- 对象层级深（> 3 层）
- 频繁更新的数据

### 1.4 避免不必要的响应式

```typescript
// 正确：静态数据不需要响应式
const COLUMN_CONFIG = [
  { key: 'name', title: '名称' },
  { key: 'age', title: '年龄' },
] as const;

// 正确：使用 markRaw 标记非响应式对象
import { markRaw } from 'vue';

const chartInstance = shallowRef<ECharts | null>(null);
chartInstance.value = markRaw(echarts.init(el));

// 错误：将第三方库实例变成响应式
const chart = ref(echarts.init(el)); // 性能问题！
```

### 1.5 组件缓存 (KeepAlive)

```vue
<template>
  <!-- 缓存切换的组件状态 -->
  <KeepAlive :max="10" :include="['TabA', 'TabB']">
    <component :is="currentTab" />
  </KeepAlive>
</template>

<script setup lang="ts">
// 使用 onActivated/onDeactivated 处理缓存组件
import { onActivated, onDeactivated } from 'vue';

onActivated(() => {
  // 组件被激活时刷新数据
  refreshData();
});

onDeactivated(() => {
  // 组件被缓存时清理定时器
  clearInterval(timer);
});
</script>
```

---

## 2. 虚拟滚动

### 2.1 使用 @vueuse/core 虚拟列表

```vue
<script setup lang="ts">
import { useVirtualList } from '@vueuse/core';

interface Props {
  items: Item[];
  itemHeight?: number;
}

const props = withDefaults(defineProps<Props>(), {
  itemHeight: 48,
});

const { list, containerProps, wrapperProps } = useVirtualList(
  toRef(props, 'items'),
  {
    itemHeight: props.itemHeight,
    overscan: 5, // 预渲染数量
  }
);
</script>

<template>
  <div v-bind="containerProps" class="aix-virtual-list">
    <div v-bind="wrapperProps">
      <div
        v-for="{ data, index } in list"
        :key="data.id"
        class="aix-virtual-list__item"
      >
        <slot :item="data" :index="index">
          {{ data }}
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.aix-virtual-list {
  height: 400px;
  overflow-y: auto;
}
</style>
```

### 2.2 虚拟滚动 Hook

```typescript
// packages/hooks/src/useVirtualScroll.ts
import { ref, computed, onMounted, onUnmounted } from 'vue';

interface UseVirtualScrollOptions {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

export function useVirtualScroll<T>(
  items: Ref<T[]>,
  options: UseVirtualScrollOptions
) {
  const { itemHeight, containerHeight, overscan = 3 } = options;

  const scrollTop = ref(0);
  const containerRef = ref<HTMLElement | null>(null);

  const visibleCount = computed(() =>
    Math.ceil(containerHeight / itemHeight) + overscan * 2
  );

  const startIndex = computed(() =>
    Math.max(0, Math.floor(scrollTop.value / itemHeight) - overscan)
  );

  const endIndex = computed(() =>
    Math.min(items.value.length, startIndex.value + visibleCount.value)
  );

  const visibleItems = computed(() =>
    items.value.slice(startIndex.value, endIndex.value).map((item, i) => ({
      item,
      index: startIndex.value + i,
    }))
  );

  const totalHeight = computed(() => items.value.length * itemHeight);
  const offsetY = computed(() => startIndex.value * itemHeight);

  const handleScroll = (e: Event) => {
    scrollTop.value = (e.target as HTMLElement).scrollTop;
  };

  return {
    containerRef,
    visibleItems,
    totalHeight,
    offsetY,
    handleScroll,
  };
}
```

### 2.3 虚拟滚动使用指南

| 数据量 | 推荐方案 |
|--------|----------|
| < 100 条 | 普通渲染 |
| 100-500 条 | v-memo 优化 |
| 500-2000 条 | 虚拟滚动 |
| > 2000 条 | 虚拟滚动 + 分页加载 |

---

## 3. 懒加载与异步组件

### 3.1 异步组件

```typescript
import { defineAsyncComponent } from 'vue';

// 基础异步组件
const AsyncDialog = defineAsyncComponent(() =>
  import('./Dialog.vue')
);

// 带加载状态的异步组件
const AsyncTable = defineAsyncComponent({
  loader: () => import('./Table.vue'),
  loadingComponent: LoadingSpinner,
  errorComponent: ErrorFallback,
  delay: 200, // 延迟显示 loading
  timeout: 10000, // 超时时间
});

// 条件加载
const HeavyComponent = computed(() => {
  if (shouldLoad.value) {
    return defineAsyncComponent(() => import('./HeavyComponent.vue'));
  }
  return null;
});
```

### 3.2 图片懒加载

```vue
<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core';

interface Props {
  src: string;
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '/placeholder.png',
});

const imgRef = ref<HTMLImageElement | null>(null);
const loaded = ref(false);
const currentSrc = ref(props.placeholder);

const { stop } = useIntersectionObserver(
  imgRef,
  ([{ isIntersecting }]) => {
    if (isIntersecting) {
      currentSrc.value = props.src;
      stop();
    }
  },
  { rootMargin: '100px' } // 提前 100px 加载
);
</script>

<template>
  <img
    ref="imgRef"
    :src="currentSrc"
    :class="{ 'aix-image--loaded': loaded }"
    @load="loaded = true"
  />
</template>
```

### 3.3 组件懒加载策略

```typescript
// 路由级别懒加载
const routes = [
  {
    path: '/dashboard',
    component: () => import('@/views/Dashboard.vue'),
  },
  {
    path: '/settings',
    component: () => import('@/views/Settings.vue'),
  },
];

// 交互触发加载
const showDialog = ref(false);
const DialogComponent = shallowRef<Component | null>(null);

const openDialog = async () => {
  if (!DialogComponent.value) {
    const module = await import('./Dialog.vue');
    DialogComponent.value = module.default;
  }
  showDialog.value = true;
};
```

---

## 4. 防抖与节流

### 4.1 使用 @vueuse/core

```typescript
import { useDebounceFn, useThrottleFn } from '@vueuse/core';

// 防抖：搜索输入
const handleSearch = useDebounceFn((value: string) => {
  emit('search', value);
}, 300);

// 节流：滚动事件
const handleScroll = useThrottleFn((e: Event) => {
  updateScrollPosition(e);
}, 100);

// 带 maxWait 的防抖
const handleInput = useDebounceFn(
  (value: string) => {
    emit('input', value);
  },
  300,
  { maxWait: 1000 } // 最多等待 1 秒
);
```

### 4.2 自定义 Hook

```typescript
// packages/hooks/src/useDebounce.ts
import { ref, watch } from 'vue';

export function useDebouncedRef<T>(value: T, delay = 300) {
  const debouncedValue = ref(value) as Ref<T>;
  let timer: ReturnType<typeof setTimeout>;

  watch(
    () => value,
    (newValue) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        debouncedValue.value = newValue;
      }, delay);
    }
  );

  return debouncedValue;
}
```

### 4.3 使用场景

| 场景 | 方案 | 延迟 |
|------|------|------|
| 搜索输入 | 防抖 | 300-500ms |
| 窗口 resize | 节流 | 100-200ms |
| 滚动事件 | 节流 | 50-100ms |
| 按钮点击 | 防抖 | 300ms |
| 实时保存 | 防抖 | 1000ms |

---

## 5. 包体积优化

### 5.1 Tree-shaking 配置

```json
// package.json
{
  "sideEffects": [
    "*.css",
    "*.scss"
  ],
  "exports": {
    ".": {
      "import": "./dist/index.esm.js",
      "require": "./dist/index.cjs.js",
      "types": "./dist/index.d.ts"
    },
    "./style.css": "./dist/style.css"
  }
}
```

### 5.2 按需导入

```typescript
// 正确：按需导入
import { Button, Input } from '@aix/components';
import { useDebounce } from '@aix/hooks';

// 错误：全量导入
import * as Components from '@aix/components';
```

### 5.3 外部化依赖

```javascript
// rollup.config.js
export default {
  external: [
    'vue',
    '@vueuse/core',
    /^@aix\//,  // 外部化所有 @aix 包
  ],
  output: {
    globals: {
      vue: 'Vue',
    },
  },
};
```

### 5.4 代码分割

```typescript
// 动态导入实现代码分割
const loadModule = async (name: string) => {
  switch (name) {
    case 'chart':
      return import('./modules/chart');
    case 'editor':
      return import('./modules/editor');
    default:
      return null;
  }
};
```

### 5.5 包体积分析

```bash
# 使用 rollup-plugin-visualizer 分析
pnpm add -D rollup-plugin-visualizer
```

```javascript
// rollup.config.js
import { visualizer } from 'rollup-plugin-visualizer';

export default {
  plugins: [
    visualizer({
      filename: 'stats.html',
      open: true,
      gzipSize: true,
    }),
  ],
};
```

**体积目标**：

| 组件类型 | 目标体积 (gzip) |
|----------|----------------|
| 基础组件 (Button, Input) | < 3KB |
| 中型组件 (Select, Table) | < 10KB |
| 复杂组件 (DatePicker, Editor) | < 20KB |
| 完整组件库 | < 50KB |

---

## 6. 运行时性能

### 6.1 事件处理优化

```vue
<template>
  <!-- 正确：事件委托 -->
  <ul @click="handleClick">
    <li v-for="item in items" :key="item.id" :data-id="item.id">
      {{ item.name }}
    </li>
  </ul>
</template>

<script setup lang="ts">
const handleClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  const id = target.dataset.id;
  if (id) {
    emit('select', id);
  }
};
</script>
```

### 6.2 避免内存泄漏

```typescript
// 正确：清理副作用
import { onUnmounted, onDeactivated } from 'vue';

const timer = ref<number | null>(null);
const observer = ref<IntersectionObserver | null>(null);

onMounted(() => {
  timer.value = window.setInterval(tick, 1000);
  observer.value = new IntersectionObserver(callback);
});

// 组件卸载时清理
onUnmounted(() => {
  if (timer.value) {
    clearInterval(timer.value);
  }
  if (observer.value) {
    observer.value.disconnect();
  }
});

// KeepAlive 组件失活时也要清理
onDeactivated(() => {
  if (timer.value) {
    clearInterval(timer.value);
  }
});
```

### 6.3 Web Worker 处理耗时任务

```typescript
// worker.ts
self.onmessage = (e: MessageEvent) => {
  const { data, type } = e.data;

  if (type === 'sort') {
    const sorted = heavySort(data);
    self.postMessage({ type: 'sorted', data: sorted });
  }
};

// 组件中使用
const worker = new Worker(new URL('./worker.ts', import.meta.url));

const sortLargeData = (data: Item[]) => {
  return new Promise<Item[]>((resolve) => {
    worker.onmessage = (e) => {
      if (e.data.type === 'sorted') {
        resolve(e.data.data);
      }
    };
    worker.postMessage({ type: 'sort', data });
  });
};
```

### 6.4 requestAnimationFrame 优化动画

```typescript
// 使用 RAF 优化频繁更新
const updatePosition = (x: number, y: number) => {
  requestAnimationFrame(() => {
    element.style.transform = `translate(${x}px, ${y}px)`;
  });
};

// 批量 DOM 更新
const batchUpdate = (updates: (() => void)[]) => {
  requestAnimationFrame(() => {
    updates.forEach(update => update());
  });
};
```

---

## 7. CSS 性能优化

### 7.1 避免复杂选择器

```scss
// 正确：简单选择器
.aix-button { }
.aix-button--primary { }
.aix-button__icon { }

// 错误：复杂选择器（性能差）
.aix-container > .aix-content > .aix-list > .aix-item > .aix-button { }
div.aix-button[type="primary"]:not(:disabled):hover { }
```

### 7.2 使用 CSS 变量优化主题切换

```scss
// 使用 CSS 变量，切换主题只需修改变量
:root {
  --aix-color-primary: rgb(19 194 194);
  --aix-color-bg: rgb(255 255 255);
}

[data-theme="dark"] {
  --aix-color-primary: rgb(54 207 207);
  --aix-color-bg: rgb(20 20 20);
}

// 组件中使用变量
.aix-button {
  background: var(--aix-color-primary);
  color: var(--aix-color-bg);
}
```

### 7.3 减少重排重绘

```scss
// 正确：使用 transform 和 opacity（仅触发合成）
.aix-modal {
  transform: translateY(-20px);
  opacity: 0;
  transition: transform 0.3s, opacity 0.3s;
}

.aix-modal--visible {
  transform: translateY(0);
  opacity: 1;
}

// 避免：直接修改 top/left（触发重排）
.aix-modal {
  top: -20px;
  transition: top 0.3s;
}
```

### 7.4 使用 will-change 提示

```scss
// 对于即将动画的元素
.aix-drawer {
  will-change: transform;
}

// 动画结束后移除
.aix-drawer--idle {
  will-change: auto;
}
```

---

## 8. 性能测试与监控

### 8.1 性能测试用例

```typescript
// __tests__/performance/Button.perf.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { Button } from '../src';

describe('Button Performance', () => {
  it('应该在 16ms 内完成渲染', async () => {
    const start = performance.now();

    const wrapper = mount(Button, {
      props: { type: 'primary' },
      slots: { default: 'Click me' },
    });

    await wrapper.vm.$nextTick();

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(16); // 60fps = 16.67ms
  });

  it('应该高效处理大量点击事件', async () => {
    const wrapper = mount(Button);
    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      await wrapper.trigger('click');
    }

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100); // 100 次点击 < 100ms
  });
});
```

### 8.2 渲染性能测试

```typescript
// __tests__/performance/List.perf.test.ts
describe('List Performance', () => {
  const generateItems = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
    }));

  it('应该高效渲染 1000 条数据', async () => {
    const items = generateItems(1000);
    const start = performance.now();

    const wrapper = mount(VirtualList, {
      props: { items, itemHeight: 40 },
    });

    await wrapper.vm.$nextTick();

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms
  });

  it('滚动时应该保持 60fps', async () => {
    const items = generateItems(10000);
    const wrapper = mount(VirtualList, {
      props: { items, itemHeight: 40 },
    });

    const container = wrapper.find('.virtual-list-container');
    const frameTimings: number[] = [];

    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      await container.trigger('scroll', { target: { scrollTop: i * 100 } });
      await wrapper.vm.$nextTick();
      frameTimings.push(performance.now() - start);
    }

    const avgFrameTime = frameTimings.reduce((a, b) => a + b) / frameTimings.length;
    expect(avgFrameTime).toBeLessThan(16.67); // 60fps
  });
});
```

### 8.3 内存泄漏测试

```typescript
// __tests__/performance/memory.test.ts
describe('Memory Leak', () => {
  it('组件卸载后不应该有内存泄漏', async () => {
    const initialHeap = (performance as any).memory?.usedJSHeapSize;

    for (let i = 0; i < 100; i++) {
      const wrapper = mount(HeavyComponent, {
        props: { data: generateLargeData() },
      });
      await wrapper.vm.$nextTick();
      wrapper.unmount();
    }

    // 强制垃圾回收（仅 Chrome DevTools）
    if (global.gc) global.gc();

    const finalHeap = (performance as any).memory?.usedJSHeapSize;
    const heapGrowth = finalHeap - initialHeap;

    // 内存增长应该很小
    expect(heapGrowth).toBeLessThan(10 * 1024 * 1024); // < 10MB
  });
});
```

### 8.4 Vue DevTools 性能分析

```typescript
// 开发环境启用性能追踪
if (import.meta.env.DEV) {
  app.config.performance = true;
}
```

### 8.5 Performance API 监控

```typescript
// packages/utils/src/performance.ts
export function measureRender(name: string, fn: () => void) {
  performance.mark(`${name}-start`);
  fn();
  performance.mark(`${name}-end`);
  performance.measure(name, `${name}-start`, `${name}-end`);

  const measure = performance.getEntriesByName(name)[0];
  console.log(`[Perf] ${name}: ${measure.duration.toFixed(2)}ms`);

  // 清理标记
  performance.clearMarks(`${name}-start`);
  performance.clearMarks(`${name}-end`);
  performance.clearMeasures(name);

  return measure.duration;
}

// 使用
measureRender('TableRender', () => {
  renderTable(data);
});
```

---

## 9. 性能检查清单

### 渲染性能

- [ ] 大型列表（> 100 项）使用虚拟滚动
- [ ] 列表项使用 `v-memo` 优化
- [ ] 计算属性使用 `computed` 缓存
- [ ] 大型数据使用 `shallowRef`
- [ ] 第三方库实例使用 `markRaw`

### 组件优化

- [ ] 重型组件使用异步加载
- [ ] 图片使用懒加载
- [ ] 频繁切换的组件使用 `KeepAlive`
- [ ] 正确清理副作用（定时器、监听器）

### 事件处理

- [ ] 搜索输入使用防抖（300ms）
- [ ] 滚动/resize 使用节流（100ms）
- [ ] 列表事件使用事件委托

### 包体积

- [ ] 配置 `sideEffects` 支持 Tree-shaking
- [ ] 使用按需导入
- [ ] 外部化公共依赖
- [ ] 包体积符合目标（基础组件 < 3KB）

### CSS 性能

- [ ] 避免复杂选择器
- [ ] 动画使用 `transform/opacity`
- [ ] 合理使用 `will-change`

### 监控测试

- [ ] 有渲染性能测试用例
- [ ] 有内存泄漏测试
- [ ] 开发环境启用性能追踪

---

## 10. 常见性能问题与解决方案

### 问题 1: 列表渲染卡顿

```typescript
// 原因：渲染大量 DOM 节点
// 解决：虚拟滚动 + v-memo

// 之前
<div v-for="item in items" :key="item.id">
  <ComplexCard :item="item" />
</div>

// 之后
<VirtualList :items="items" :item-height="80">
  <template #default="{ item }">
    <ComplexCard :item="item" v-memo="[item.id, item.updated]" />
  </template>
</VirtualList>
```

### 问题 2: 输入框响应慢

```typescript
// 原因：每次输入都触发搜索
// 解决：防抖

const searchValue = ref('');
const debouncedSearch = useDebounceFn((value: string) => {
  emit('search', value);
}, 300);

watch(searchValue, debouncedSearch);
```

### 问题 3: 内存持续增长

```typescript
// 原因：未清理副作用
// 解决：在 onUnmounted 中清理

onMounted(() => {
  window.addEventListener('resize', handleResize);
  timer = setInterval(tick, 1000);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  clearInterval(timer);
});
```

### 问题 4: 首屏加载慢

```typescript
// 原因：加载了不需要的组件
// 解决：路由懒加载 + 异步组件

// 路由懒加载
{
  path: '/heavy',
  component: () => import('@/views/HeavyPage.vue'),
}

// 异步组件
const HeavyDialog = defineAsyncComponent(() =>
  import('./HeavyDialog.vue')
);
```

### 问题 5: 动画卡顿

```scss
// 原因：动画触发重排
// 解决：使用 transform

// 之前（触发重排）
.modal {
  top: 100px;
  transition: top 0.3s;
}

// 之后（仅合成层）
.modal {
  transform: translateY(100px);
  transition: transform 0.3s;
}
```

---

## 11. 性能优化工具

### 开发工具

| 工具 | 用途 |
|------|------|
| Vue DevTools | 组件性能分析、Timeline |
| Chrome DevTools Performance | 运行时性能分析 |
| Chrome DevTools Memory | 内存泄漏检测 |
| Lighthouse | 页面性能评分 |

### 构建工具

| 工具 | 用途 |
|------|------|
| rollup-plugin-visualizer | 包体积分析 |
| source-map-explorer | Source Map 分析 |
| bundlesize | 包体积 CI 检查 |

### 运行时监控

| 工具 | 用途 |
|------|------|
| Performance API | 自定义性能测量 |
| PerformanceObserver | 性能监控 |
| web-vitals | Core Web Vitals |

---

## 相关文档

- [component-design.md](./component-design.md) - 组件设计规范
- [coding-standards.md](./coding-standards.md) - 编码规范
- [testing.md](./testing.md) - 测试策略
- [code-review.md](./code-review.md) - 代码审查
