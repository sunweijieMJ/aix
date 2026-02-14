# 组件 JSDoc 注释规范

本文档说明如何为组件添加 JSDoc 注释，以便自动生成完善的 API 文档。

## 为什么需要 JSDoc 注释？

AIX 组件库使用 `vue-docgen-api` 自动从组件源码生成 API 文档。通过添加规范的 JSDoc 注释，可以：

- ✅ 自动生成 Props/Events/Slots 的详细说明
- ✅ 提供更好的 IDE 智能提示
- ✅ 减少手动维护文档的工作量
- ✅ 保证文档与代码同步

## Props 注释

在 `types.ts` 中为每个 prop 添加 JSDoc 注释：

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
```

**注意**：
- 使用 `/** */` 而不是 `//`
- 简洁描述功能，无需重复属性名
- 对于复杂 prop，可以添加多行说明

## Events 注释

在组件文件顶部添加 `@event` 注释：

```vue
<script setup lang="ts">
/**
 * 按钮组件
 *
 * @event click - 点击按钮时触发
 */
import type { ButtonProps, ButtonEmits } from './types';

const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
});

const emit = defineEmits<ButtonEmits>();
</script>
```

**格式**：`@event <事件名> - <说明>`

## Slots 注释

**重要**：Slots 注释必须使用 **HTML 注释**放在 `<template>` 中，而不是 `<script>` 中。

### 方法 1: 在 template 顶部（推荐）

```vue
<!--
@slot default 按钮内容
@slot icon 自定义图标
-->
<template>
  <button>
    <slot name="icon" />
    <slot />
  </button>
</template>
```

### 方法 2: 在 slot 标签上方

```vue
<template>
  <button>
    <!-- @slot 自定义图标 -->
    <slot name="icon" />

    <!-- @slot 按钮内容 -->
    <slot />
  </button>
</template>
```

**格式**：`@slot <插槽名> <说明>`（注意：不需要 `-` 连接符）

**注意**：
- ✅ 使用 HTML 注释 `<!-- -->`
- ✅ 放在 `<template>` 中
- ❌ 不要放在 `<script>` 中（不生效）

## 完整示例

以下是一个包含完整注释的组件示例：

```vue
<template>
  <button
    :class="buttonClass"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="button__loading">
      <!-- 加载图标 -->
    </span>
    <span v-if="$slots.icon" class="button__icon">
      <slot name="icon" />
    </span>
    <span class="button__content">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
/**
 * 按钮组件
 *
 * 用于触发操作和提交表单。支持多种类型、尺寸和状态。
 *
 * @event click - 点击按钮时触发
 * @slot default - 按钮内容
 * @slot icon - 自定义图标
 */
import type { ButtonProps, ButtonEmits } from './types';

const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
  disabled: false,
  loading: false,
});

const emit = defineEmits<ButtonEmits>();

const handleClick = (event: MouseEvent) => {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
};
</script>
```

## 类型定义文件

`types.ts` 示例：

```typescript
export interface ButtonProps {
  /**
   * 按钮类型
   * @default 'default'
   */
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';

  /**
   * 按钮尺寸
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large';

  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;

  /**
   * 是否加载中
   * 加载中时按钮不可点击，并显示加载动画
   * @default false
   */
  loading?: boolean;
}

export interface ButtonEmits {
  /** 点击按钮时触发 */
  (e: 'click', event: MouseEvent): void;
}
```

## 文档生成流程

1. **编写组件** - 添加 JSDoc 注释
2. **生成 API** - 运行 `pnpm docs:gen`
   - 从组件提取 API → `packages/*/README.md`
3. **同步文档** - 运行 `pnpm docs:sync`
   - 从 README 注入 API → `docs/components/*.md`

## 常见问题

### Q: 为什么生成的文档中 Events/Slots 说明是 `-`？

A: 需要在组件文件顶部添加 `@event` 和 `@slot` 注释。`vue-docgen-api` 无法从类型定义推断事件和插槽的说明。

### Q: 如何添加更详细的说明？

A: 在 JSDoc 注释中使用多行：

```typescript
/**
 * 按钮类型
 * - primary: 主要按钮
 * - default: 默认按钮
 * - dashed: 虚线按钮
 */
type?: 'primary' | 'default' | 'dashed';
```

### Q: 如何标注默认值？

A: 使用 `@default` 标签：

```typescript
/**
 * 按钮尺寸
 * @default 'medium'
 */
size?: 'small' | 'medium' | 'large';
```

## 参考链接

- [vue-docgen-api 文档](https://github.com/vue-styleguidist/vue-styleguidist/tree/dev/packages/vue-docgen-api)
- [JSDoc 标签参考](https://jsdoc.app/)
