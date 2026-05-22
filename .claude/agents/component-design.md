---
name: component-design
description: Vue组件库设计完整指南，包括设计原则、API设计、样式规范和最佳实践
tools: Read, Grep, Glob
model: inherit
---

# 组件库设计完整指南

## 职责

提供 Vue 组件库的完整设计指导，包括设计原则、Props/Emits/Slots API 设计、样式规范和最佳实践。

> **通用规范参考**: CSS 变量、BEM 命名等通用模式详见 [coding-standards.md](coding-standards.md)

---

## 🎯 设计原则

### 1. 简洁性原则
- **最小化 API**: 只暴露必要的 Props 和 Events
- **合理默认值**: 提供开箱即用的默认配置
- **渐进增强**: 简单场景易用，复杂场景可用

### 2. 一致性原则
- **命名一致**: 相似功能使用相同命名
- **行为一致**: 相同 Props 在不同组件中行为一致
- **类型一致**: 相同概念使用相同类型定义

### 3. 无副作用原则
- **纯粹性**: 组件不应有全局副作用
- **可控性**: 所有行为通过 Props 控制
- **可预测性**: 相同的 Props 产生相同的输出

```vue
<!-- ✅ 正确：无副作用 -->
<script setup>
const props = defineProps<{ value: string }>();
const emit = defineEmits<{ (e: 'change', value: string): void }>();
</script>

<!-- ❌ 错误：修改全局状态 -->
<script setup>
import { globalState } from './global';
globalState.value = 'changed'; // 副作用
</script>
```

### 4. 样式隔离原则
- **禁用 scoped**: 组件库**不使用** `<style scoped>`，通过 `.aix-<component>` 命名空间 + BEM 实现隔离
- **命名空间**: 所有 CSS 类使用 `aix-` 前缀
- **CSS 变量**: 使用主题变量，支持主题定制

### 5. 可树摇原则
- **模块化导出**: 每个组件独立导出
- **无默认依赖**: 不自动导入其他组件
- **按需引入**: 支持按需导入单个组件

```typescript
// ✅ 正确：独立导出
export { Button } from './Button.vue';
export { Input } from './Input.vue';

// ❌ 错误：默认全部导入
export * from './components'; // 无法树摇
```

### 6. 类型安全原则
- **完整类型**: 所有 Props/Emits/Slots 有类型定义
- **类型导出**: 导出组件相关的类型定义
- **泛型支持**: 复杂组件支持泛型

---

## 📦 组件分类

| 分类 | 定义 | 特点 | 示例 |
|------|------|------|------|
| 基础组件 | 无业务逻辑的纯 UI 组件 | 高度可复用、可配置、无状态 | Button, Input, Select, Icon |
| 组合组件 | 由多个基础组件组合而成 | 提供特定场景的完整解决方案 | Form, Table, Dialog |
| Hooks | 可复用的逻辑函数 | 无 UI、纯逻辑、可组合 | useClickOutside, useDebounce |

---

## 📦 Props 设计

### 1. Props 类型设计

#### 基础类型

```typescript
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

#### 对象类型

```typescript
interface TableProps {
  /** 表格列配置 */
  columns: Array<{
    key: string;
    title: string;
    width?: number;
    align?: 'left' | 'center' | 'right';
  }>;

  /** 表格数据 */
  data: Array<Record<string, any>>;
}
```

#### 函数类型

```typescript
interface SelectProps {
  /** 选项过滤函数 */
  filterOption?: (inputValue: string, option: SelectOption) => boolean;

  /** 自定义选项渲染 */
  renderOption?: (option: SelectOption) => VNode;
}
```

### 2. Props 命名规范

| 类型 | 规范 | 正确示例 | 错误示例 |
|------|------|----------|----------|
| 布尔类型 | 使用 is/has/show 前缀或直接语义词 | `disabled`, `isActive`, `showIcon` | `disable`, `show` |
| 数组类型 | 使用复数命名 | `options`, `columns`, `items` | `option`, `column` |
| 命名风格 | 使用 camelCase | `modelValue`, `placeholder` | `model_value`, `Placeholder` |

### 3. 默认值设计

```typescript
const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',          // 最常用的类型
  size: 'medium',           // 中等尺寸
  disabled: false,          // 默认可用
  loading: false,           // 默认不加载
});

// 对象/数组使用工厂函数
const props = withDefaults(defineProps<Props>(), {
  options: () => [],        // ✅ 正确
  config: () => ({}),       // ✅ 正确
  // options: [],           // ❌ 错误：引用类型共享
});
```

### 4. Props 验证

```typescript
interface Props {
  /** 数量（1-100） */
  count?: number;
}

// 在组件内部验证
watchEffect(() => {
  if (props.count !== undefined && (props.count < 1 || props.count > 100)) {
    console.warn('count must be between 1 and 100');
  }
});
```

---

## 📢 Emits 设计

### 1. Emits 类型设计

```typescript
interface ButtonEmits {
  /** 点击事件 */
  (e: 'click', event: MouseEvent): void;

  /** 双击事件 */
  (e: 'dblclick', event: MouseEvent): void;
}

interface SelectEmits {
  /** 值变化事件 */
  (e: 'change', value: string | number, option: SelectOption): void;

  /** 选项选中事件 */
  (e: 'select', option: SelectOption): void;
}
```

### 2. Emits 命名规范

| 规范 | 正确示例 | 错误示例 |
|------|----------|----------|
| 使用动词原型 | `change`, `select`, `click` | `changed`, `onClick` |
| 事件阶段 | `before-show`, `after-close` | `showBefore`, `closedAfter` |
| 小写连字符 | `update:model-value` | `updateModelValue` |

### 3. v-model 支持

```typescript
// 单个 v-model
interface Props {
  modelValue?: string;
}
interface Emits {
  (e: 'update:modelValue', value: string): void;
}
// 使用: <Input v-model="inputValue" />

// 多个 v-model
interface Props {
  visible?: boolean;
  title?: string;
}
interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'update:title', value: string): void;
}
// 使用: <Dialog v-model:visible="isVisible" v-model:title="dialogTitle" />
```

### 4. 事件参数设计

```typescript
// ✅ 正确：清晰的参数
interface Emits {
  (e: 'change', value: string, option: SelectOption): void;
  (e: 'submit', data: FormData, isValid: boolean): void;
}

// ❌ 错误：模糊的参数
interface Emits {
  (e: 'change', ...args: any[]): void;
}
```

---

## 🎰 Slots 设计

### 1. Slots 类型设计

```typescript
interface ButtonSlots {
  /** 默认插槽 */
  default?: () => any;

  /** 前置图标插槽 */
  icon?: () => any;
}

interface TableSlots {
  /** 单元格插槽 */
  default?: (props: { row: any; column: TableColumn; rowIndex: number }) => any;

  /** 表头插槽 */
  header?: (props: { column: TableColumn; columnIndex: number }) => any;

  /** 空状态插槽 */
  empty?: () => any;
}
```

### 2. Slots 命名规范

| 名称 | 用途 |
|------|------|
| `default` | 默认内容 |
| `header` / `footer` | 头部/底部 |
| `prefix` / `suffix` | 前缀/后缀 |
| `icon` | 图标 |
| `empty` | 空状态 |
| `loading` | 加载状态 |

### 3. Scoped Slots 示例

```vue
<template>
  <table>
    <tbody>
      <tr v-for="(row, rowIndex) in data" :key="rowIndex">
        <td v-for="column in columns" :key="column.key">
          <slot :row="row" :column="column" :rowIndex="rowIndex">
            {{ row[column.key] }}
          </slot>
        </td>
      </tr>
    </tbody>
  </table>
</template>
```

### 4. 默认内容

```vue
<!-- 提供合理的默认内容 -->
<template>
  <button class="aix-button">
    <slot name="icon"></slot>
    <slot>Button</slot>
  </button>
</template>

<template>
  <div class="aix-empty">
    <slot name="empty">
      <p>暂无数据</p>
    </slot>
  </div>
</template>
```

---

## 🔧 defineExpose 暴露

```typescript
// 定义暴露的类型
export interface InputInstance {
  /** 聚焦 */
  focus: () => void;
  /** 失焦 */
  blur: () => void;
}

// 在组件中使用
<script setup lang="ts">
const inputRef = ref<HTMLInputElement>();

const focus = () => inputRef.value?.focus();
const blur = () => inputRef.value?.blur();

defineExpose<InputInstance>({ focus, blur });
</script>
```

---

## 🎨 样式规范

### 1. CSS 变量使用

```css
.aix-button {
  /* ✅ 正确：使用 CSS 变量 */
  color: var(--aix-color-text);
  background: var(--aix-color-bg);
  border-radius: var(--aix-border-radius);
  padding: var(--aix-padding-md) var(--aix-padding-lg);

  /* ❌ 错误：硬编码值 */
  color: #333;
  background: #fff;
}
```

> 详细的 CSS 变量列表见 [coding-standards.md#css-变量使用规范](coding-standards.md#css-变量使用规范)

### 2. BEM 命名规范

```css
/* 块（Block） */
.aix-button { }

/* 元素（Element） */
.aix-button__icon { }
.aix-button__text { }

/* 修饰符（Modifier） */
.aix-button--primary { }
.aix-button--disabled { }
```

> 详细的 BEM 规范见 [coding-standards.md#bem-命名规范](coding-standards.md#bem-命名规范)

### 3. 响应式设计

```css
.aix-button {
  padding: var(--aix-padding-md);

  @media (max-width: 768px) {
    padding: var(--aix-padding-sm);
  }
}
```

---

## 🧪 测试规范

### 必需的测试用例

```typescript
describe('Button', () => {
  it('renders properly', () => {
    const wrapper = mount(Button, {
      slots: { default: 'Click me' }
    });
    expect(wrapper.text()).toBe('Click me');
  });

  it('emits click event', async () => {
    const wrapper = mount(Button);
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('does not emit when disabled', async () => {
    const wrapper = mount(Button, {
      props: { disabled: true }
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });
});
```

### 覆盖率要求

- Props 测试覆盖率 > 80%
- Events 测试覆盖率 > 80%
- 关键逻辑测试覆盖率 = 100%

---

## ♿ 可访问性

### 1. ARIA 属性

```vue
<template>
  <button
    :aria-label="label"
    :aria-disabled="disabled"
    :aria-pressed="pressed"
  >
    <slot></slot>
  </button>
</template>
```

### 2. 键盘导航

```vue
<script setup>
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    emit('click', e);
  }
};
</script>

<template>
  <div role="button" tabindex="0" @keydown="handleKeydown">
    <slot></slot>
  </div>
</template>
```

---

## 📤 导出规范

### 标准导出模式

```typescript
// src/index.ts
import type { App } from 'vue';
import Button from './Button.vue';

// 命名导出
export { Button };

// 类型导出
export type { ButtonProps, ButtonEmits } from './Button.vue';

// Vue Plugin
export default {
  install(app: App) {
    app.component('AixButton', Button);
  },
};
```

### package.json 配置

```json
{
  "name": "@aix/button",
  "main": "./dist/index.cjs.js",
  "module": "./dist/index.esm.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.esm.js",
      "require": "./dist/index.cjs.js",
      "types": "./dist/index.d.ts"
    },
    "./style.css": "./dist/style.css"
  },
  "files": ["dist"],
  "sideEffects": ["*.css"]
}
```

---

## 🚀 性能优化

### 1. 避免不必要的重渲染

```vue
<script setup>
import { computed } from 'vue';

// ✅ 正确：使用 computed
const classes = computed(() => [
  'aix-button',
  `aix-button--${props.type}`,
  `aix-button--${props.size}`,
]);

// ❌ 错误：每次渲染都创建新数组
const classes = [
  'aix-button',
  `aix-button--${props.type}`,
];
</script>
```

### 2. 大数据场景优化

```vue
<script setup>
// 虚拟滚动
import { useVirtualList } from '@vueuse/core';

const { list, containerProps, wrapperProps } = useVirtualList(
  largeDataSource,
  { itemHeight: 50 }
);
</script>
```

---

## 📋 API 设计检查清单

### Props 设计
- [ ] Props 类型完整（使用 interface 定义）
- [ ] Props 有 JSDoc 注释
- [ ] 必需的 Props 标记为必需
- [ ] 可选的 Props 有合理默认值
- [ ] 使用联合类型限制可选值
- [ ] 布尔类型使用 is/has/show 前缀
- [ ] 数组类型使用复数命名

### Emits 设计
- [ ] Emits 类型完整（使用 interface 定义）
- [ ] Emits 有 JSDoc 注释
- [ ] 事件名使用动词原型
- [ ] 事件参数类型明确
- [ ] 支持 v-model（如果适用）

### Slots 设计
- [ ] Slots 类型完整
- [ ] Slot 名称描述性强
- [ ] Scoped slots 提供完整的 props 类型
- [ ] 提供合理的默认内容

### 样式设计
- [ ] **不使用** `<style scoped>`（通过命名空间 + BEM 隔离）
- [ ] CSS 类名使用 `aix-` 前缀
- [ ] 使用 CSS 变量，无硬编码值
- [ ] 遵循 BEM 命名规范

### 导出设计
- [ ] 组件已命名导出
- [ ] Props/Emits/Slots 类型已导出
- [ ] package.json 配置正确

---

## 🎨 完整组件示例

### Button 组件

```typescript
// packages/button/src/types.ts

export interface ButtonProps {
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'danger';
  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否加载中 */
  loading?: boolean;
  /** 图标 */
  icon?: Component;
  /** HTML 按钮类型 */
  htmlType?: 'button' | 'submit' | 'reset';
}

export interface ButtonEmits {
  /** 点击事件 */
  (e: 'click', event: MouseEvent): void;
}

export interface ButtonSlots {
  /** 默认插槽 - 按钮内容 */
  default?: () => any;
  /** 图标插槽 */
  icon?: () => any;
}

export interface ButtonInstance {
  /** 聚焦到按钮 */
  focus: () => void;
  /** 失焦 */
  blur: () => void;
}
```

```vue
<!-- packages/button/src/Button.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ButtonProps, ButtonEmits, ButtonInstance } from './types';

const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
  disabled: false,
  loading: false,
  htmlType: 'button',
});

const emit = defineEmits<ButtonEmits>();

const buttonRef = ref<HTMLButtonElement>();

const classes = computed(() => [
  'aix-button',
  `aix-button--${props.type}`,
  `aix-button--${props.size}`,
  {
    'aix-button--disabled': props.disabled,
    'aix-button--loading': props.loading,
  },
]);

const handleClick = (e: MouseEvent) => {
  if (props.disabled || props.loading) return;
  emit('click', e);
};

const focus = () => buttonRef.value?.focus();
const blur = () => buttonRef.value?.blur();

defineExpose<ButtonInstance>({ focus, blur });
</script>

<template>
  <button
    ref="buttonRef"
    :class="classes"
    :type="htmlType"
    :disabled="disabled || loading"
    :aria-disabled="disabled || loading"
    @click="handleClick"
  >
    <slot name="icon">
      <component :is="icon" v-if="icon" class="aix-button__icon" />
    </slot>
    <span class="aix-button__text">
      <slot></slot>
    </span>
  </button>
</template>

<style lang="scss">
.aix-button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: var(--aix-padding-sm) var(--aix-padding-md);
  border: 1px solid var(--aix-color-border);
  border-radius: var(--aix-border-radius);
  background: var(--aix-color-bg);
  color: var(--aix-color-text);
  cursor: pointer;
  transition: all 0.2s;
}

.aix-button--primary {
  background: var(--aix-color-primary);
  border-color: var(--aix-color-primary);
  color: var(--aix-color-primary-text);
}

.aix-button--danger {
  background: var(--aix-color-danger);
  border-color: var(--aix-color-danger);
  color: #fff;
}

.aix-button--disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.aix-button--small {
  padding: var(--aix-padding-xs) var(--aix-padding-sm);
  font-size: var(--aix-font-size-sm);
}

.aix-button--large {
  padding: var(--aix-padding-md) var(--aix-padding-lg);
  font-size: var(--aix-font-size-lg);
}
</style>
```

---

## 💡 常见问题

### Q1: Props 应该使用 interface 还是 type？

推荐使用 `interface`，更清晰且支持声明合并。

### Q2: 什么时候使用 v-model？

当组件需要双向绑定时：Input, Select, Checkbox 等表单组件，Dialog 的显示状态。

### Q3: 如何平衡 Props 数量和灵活性？

遵循"简单场景易用，复杂场景可用"原则：基础 Props 满足常用需求，高级 Props 提供灵活定制。

---

## 📚 相关文档

- [storybook-development.md](./storybook-development.md) - Storybook 开发
- [testing.md](./testing.md) - 测试策略
- [coding-standards.md](./coding-standards.md) - 编码规范
