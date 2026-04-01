---
id: vue3/component-design
title: Vue 组件设计规范
description: Vue 3 组件结构、Props/Emits/Slots 设计和 Composition API 规范
layer: framework
priority: 110
platforms: []
tags: [vue, component, agent]
version: "1.0.0"
variables:
  componentPrefix:
    default: "app"
    description: "组件 CSS 类名前缀"
---

## 职责

负责 Vue 3 组件设计指导，包括组件结构、Props/Emits/Slots 设计和 Composition API 最佳实践。

---

## 组件代码组织顺序

```vue
<script setup lang="ts">
// 1. 导入语句
import { ref, computed, watch, onMounted } from 'vue';
import type { UserData } from './types';

// 2. Props 和 Emits 定义
const props = defineProps<{
  /** 用户数据 */
  user: UserData;
  /** 是否显示头像 */
  showAvatar?: boolean;
}>();

const emit = defineEmits<{
  /** 点击事件 */
  click: [user: UserData];
  /** 删除事件 */
  delete: [id: number];
}>();

// 3. 响应式数据
const isEditing = ref(false);

// 4. 计算属性
const displayName = computed(() =>
  props.user.nickname || props.user.name
);

// 5. 方法定义
function handleClick() {
  emit('click', props.user);
}

// 6. 生命周期和监听器
onMounted(() => {
  // 初始化逻辑
});

// 7. defineExpose (如需要)
defineExpose({ isEditing });
</script>

<template>
  <div class="{{componentPrefix}}-user-card" @click="handleClick">
    <slot name="avatar" v-if="showAvatar" />
    <span>\{{ displayName }}</span>
  </div>
</template>
```

## Props 设计规范

- 布尔类型使用 `is/has/show` 前缀（如 `isActive`, `showIcon`）
- 数组类型使用复数命名（如 `options`, `columns`）
- 命名风格使用 **camelCase**
- 默认值设为最常用的值
- 所有 Props 必须有 **JSDoc 注释**

```typescript
// ✅ 正确: 完整的类型定义
interface ButtonProps {
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'danger';
  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否加载中 */
  loading?: boolean;
}
```

## Emits 设计规范

- 事件名使用 **动词原型**（`change`, `close`, `submit`）
- 支持 `v-model` 时使用 `update:modelValue`
- 事件参数类型完整

```typescript
// ✅ 正确: 类型化的 Emits
const emit = defineEmits<{
  change: [value: string];
  'update:modelValue': [value: string];
  submit: [data: FormData];
}>();
```

## Slots 设计规范

- 具名 Slot 使用 **kebab-case**
- 提供默认内容作为 fallback
- Scoped Slot 暴露的数据应有类型定义

## Composables (组合式函数)

```typescript
// ✅ 正确: use 前缀 + 返回响应式数据
function useCounter(initialValue = 0) {
  const count = ref(initialValue);

  function increment() { count.value++; }
  function decrement() { count.value--; }

  return { count: readonly(count), increment, decrement };
}
```

### Composable 规范

- 命名使用 `use` 前缀
- 返回值使用解构友好的对象
- 内部副作用在 `onUnmounted` 中清理
- 参数支持 ref 和普通值（使用 `toValue()`）
