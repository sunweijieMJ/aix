---
name: coding-standards
description: 组件库编码规范和最佳实践，包括 TypeScript、Vue、CSS 样式规范，确保代码风格一致性、类型安全和高质量代码
tools: Read, Grep, Glob
model: inherit
---

# 编码规范 Agent

## 职责

负责制定和维护组件库编码规范，确保代码风格一致性、类型安全和最佳实践，为组件开发提供清晰的指导标准。本文档包含 TypeScript 编码规范和 CSS 样式规范（作为单一真实来源）。

> **相关规范参考**:
> - [component-design.md](component-design.md) - 组件设计完整指南（Props/Emits/Slots）

---

## 🎯 编码原则

### 1. 类型优先原则

- **严格类型定义**: 所有变量、函数参数和返回值必须有明确的类型定义
- **避免 any 类型**: 除非特殊情况，禁止使用 `any` 类型
- **接口完整性**: 所有数据结构都要有对应的 TypeScript 接口
- **类型导出**: Props/Emits/Slots 等类型必须导出供用户使用

### 2. 函数式原则

- **纯函数优先**: 组件内部工具函数应该是纯函数
- **副作用控制**: 明确标识和控制副作用
- **无全局副作用**: 组件不应修改全局状态

### 3. 样式隔离原则

- **禁用 scoped**: 组件库**不使用** `<style scoped>`（避免编译生成 hash 属性影响样式覆盖与 Tree-shaking）
- **命名空间隔离**: 所有 CSS 类名使用 `aix-` 前缀 + BEM 命名实现隔离
- **CSS 变量**: 使用 `@aix/theme` 包中定义的 CSS 变量

### 4. 可树摇原则

- **模块化导出**: 每个组件独立导出
- **按需引入**: 支持按需导入单个组件
- **无副作用导入**: 避免导入时执行代码

---

## 📝 TypeScript 编码规范

### 接口定义规范

```typescript
// ✅ 正确：完整的 Props 接口定义
export interface ButtonProps {
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'danger';

  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';

  /** 是否禁用 */
  disabled?: boolean;

  /** 是否加载中 */
  loading?: boolean;
}

// ✅ 正确：完整的 Emits 接口定义
export interface ButtonEmits {
  /** 点击事件 */
  (e: 'click', event: MouseEvent): void;
}

// ❌ 错误：使用 any 类型
interface BadProps {
  data: any;  // 应该定义具体类型
}
```

### 函数类型定义规范

```typescript
// ✅ 正确：完整的函数类型定义
const handleClick = (event: MouseEvent): void => {
  emit('click', event);
};

// ✅ 正确：异步函数
const loadOptions = async (): Promise<SelectOption[]> => {
  // ...
  return options;
};

// ✅ 正确：泛型函数
function mapOptions<T>(items: T[], mapper: (item: T) => SelectOption): SelectOption[] {
  return items.map(mapper);
}
```

### 枚举和常量定义

```typescript
// ✅ 使用 const 断言
export const BUTTON_TYPES = {
  PRIMARY: 'primary',
  DEFAULT: 'default',
  DANGER: 'danger',
} as const;

export type ButtonType = typeof BUTTON_TYPES[keyof typeof BUTTON_TYPES];

// ✅ 使用枚举
export enum ComponentSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}
```

### 类型守卫

```typescript
// ✅ 类型守卫（优于类型断言）
function isSelectOption(obj: unknown): obj is SelectOption {
  return obj !== null &&
         typeof obj === 'object' &&
         'value' in obj &&
         'label' in obj;
}

// ❌ 错误：过度使用类型断言
const option = data as SelectOption;  // 应使用类型守卫
```

---

## 🎨 Vue 组件编码规范

> **CSS 样式规范**: 详见本文档 [CSS 样式编码规范](#-css-样式编码规范) 部分

### 代码组织顺序

```vue
<script setup lang="ts">
// 1. 导入语句
import { ref, computed, watch, onMounted } from 'vue';
import type { Component } from 'vue';

// 2. 接口定义
export interface ButtonProps {
  type?: 'primary' | 'default';
}

export interface ButtonEmits {
  (e: 'click', event: MouseEvent): void;
}

// 3. Props 和 Emits
const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
});

const emit = defineEmits<ButtonEmits>();

// 4. 响应式数据
const isHovered = ref<boolean>(false);
const buttonRef = ref<HTMLButtonElement>();

// 5. 计算属性
const classes = computed((): string[] => [
  'aix-button',
  `aix-button--${props.type}`,
]);

// 6. 方法定义
const handleClick = (event: MouseEvent): void => {
  emit('click', event);
};

// 7. 生命周期和监听器
onMounted(() => {
  // 初始化逻辑
});

watch(() => props.type, (newType) => {
  // 响应 type 变化
});

// 8. 暴露方法（如果需要）
defineExpose({
  focus: () => buttonRef.value?.focus(),
});
</script>

<template>
  <button
    ref="buttonRef"
    :class="classes"
    @click="handleClick"
  >
    <slot></slot>
  </button>
</template>

<style lang="scss">
.aix-button {
  /* 组件样式，通过 .aix- 命名空间 + BEM 隔离 */
}
</style>
```

### 组件命名规范

```typescript
// ✅ 正确：组件名使用 Aix 前缀
export default defineComponent({
  name: 'AixButton',
});

// ❌ 错误：缺少前缀
export default defineComponent({
  name: 'Button',
});
```

---

## 📊 常量定义规范

```typescript
// packages/button/src/constants.ts

// ✅ 正确：大写字母和下划线
export const DEFAULT_SIZE = 'medium';
export const MAX_LENGTH = 100;

// ✅ 对象常量使用 as const
export const SIZE_MAP = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
} as const;

// ❌ 错误：使用小写命名
export const defaultSize = 'medium';  // 应该是 DEFAULT_SIZE
```

---

## 📥 导入规范

### 导入顺序

按以下顺序组织导入语句，每组之间空一行：

```typescript
// 1. Vue 核心
import { ref, computed, watch, onMounted } from 'vue';
import type { Component, VNode } from 'vue';

// 2. 第三方库（如果有）
import dayjs from 'dayjs';

// 3. 本地组件
import { Icon } from '../icon';

// 4. 类型导入（单独分组，使用 type 关键字）
import type { ButtonProps, ButtonEmits } from './types';
import type { SelectOption } from '../select/types';
```

### 类型导入规范

```typescript
// ✅ 正确：类型导入使用 type 关键字
import type { ButtonProps, ButtonEmits } from './Button.vue';
import type { Component } from 'vue';

// ✅ 正确：混合导入时分开写
import { Button } from './Button.vue';
import type { ButtonProps } from './Button.vue';

// ❌ 错误：类型和值混合导入
import { Button, ButtonProps } from './Button.vue';
```

### 相对路径规范

```typescript
// ✅ 正确：同包内使用相对路径
import { Button } from './Button.vue';
import type { ButtonProps } from './types';

// ✅ 正确：跨包引用使用包名
import { Icon } from '@aix/icon';
import type { IconProps } from '@aix/icon';

// ❌ 错误：同包内使用绝对路径
import { Button } from '@aix/button/src/Button.vue';
```

---

## 📤 组件导出规范

### 标准导出模式

```typescript
// src/Button.vue
<script setup lang="ts">
export interface ButtonProps {
  type?: 'primary' | 'default';
}

export interface ButtonEmits {
  (e: 'click', event: MouseEvent): void;
}

// 组件定义...
</script>

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

### 类型导出规范

```typescript
// ✅ 正确：导出所有公开类型
export { Button } from './Button.vue';
export type { ButtonProps, ButtonEmits, ButtonSlots } from './Button.vue';
export type { ButtonInstance } from './types';

// ❌ 错误：没有导出类型
export { Button } from './Button.vue';
// 用户无法使用 ButtonProps 类型
```

### package.json 配置

```json
{
  "name": "@aix/button",
  "type": "module",
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

## 📋 代码注释规范

### JSDoc 注释

所有导出的 Props/Emits/Slots 必须有 JSDoc 注释：

```typescript
/**
 * Button 组件 Props
 */
export interface ButtonProps {
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'danger';

  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';

  /** 是否禁用 */
  disabled?: boolean;

  /**
   * 点击事件处理器
   * @deprecated 使用 @click 事件代替
   */
  onClick?: (event: MouseEvent) => void;
}

/**
 * Button 组件 Emits
 */
export interface ButtonEmits {
  /**
   * 点击事件
   * @param event 鼠标事件对象
   */
  (e: 'click', event: MouseEvent): void;
}
```

### 行内注释

```typescript
// ✅ 正确：解释复杂逻辑
const filterOptions = (options: SelectOption[], query: string) => {
  // 忽略大小写进行模糊匹配
  const lowerQuery = query.toLowerCase();
  return options.filter(opt =>
    opt.label.toLowerCase().includes(lowerQuery)
  );
};

// ❌ 错误：显而易见的注释
const count = options.length;  // 获取选项数量
```

---

## 🎨 CSS 样式编码规范

本节作为 CSS 样式规范的**单一真实来源 (Single Source of Truth)**，供其他文档引用。

### CSS 变量使用规范

组件库在 `packages/theme/src/` 中定义了完整的 CSS 变量系统，所有样式中的颜色**必须**使用这些变量，**禁止硬编码颜色值**。

#### 文本颜色变量

```scss
.aix-button {
  // ✅ 正确：使用 CSS 变量
  color: var(--aix-colorText);              // 普通文本
  color: var(--aix-colorTextSecondary);    // 次要文本
  color: var(--aix-colorTextDisabled);     // 禁用文本

  // ❌ 错误：硬编码颜色
  color: #333;
  color: rgba(0, 0, 0, 0.88);
}
```

#### 背景和边框颜色

```scss
.aix-button {
  // ✅ 背景色
  background: var(--aix-colorBgContainer);
  background: var(--aix-colorBgLayout);
  background: var(--aix-colorBgTextHover);

  // ✅ 边框色
  border: 1px solid var(--aix-colorBorder);
  border: 1px solid var(--aix-colorBorderSecondary);

  // ✅ 主题色
  background: var(--aix-colorPrimary);
  color: var(--aix-colorTextLight);

  // ✅ 状态色
  color: var(--aix-colorSuccess);
  color: var(--aix-colorWarning);
  color: var(--aix-colorError);
}
```

#### 尺寸变量

```scss
.aix-button {
  padding: var(--aix-paddingSM);
  padding: var(--aix-paddingMD);
  border-radius: var(--aix-borderRadius);
  font-size: var(--aix-fontSize);
}
```

### CSS 类名命名规范

所有 CSS 类名**必须**使用 `aix-` 前缀，避免样式污染：

```scss
// ✅ 正确：使用 aix- 前缀
.aix-button { }
.aix-button__icon { }
.aix-button--primary { }

// ❌ 错误：缺少前缀
.button { }
```

### BEM 命名规范

使用 BEM (Block-Element-Modifier) 命名：

```scss
.aix-select {                    // Block
  &__input { }                   // Element
  &__dropdown { }                // Element
  &__option { }                  // Element
  &--disabled { }                // Modifier
  &--open {
    .aix-select__dropdown { }    // 嵌套
  }
}
```

### 选择器规范

**嵌套深度不超过 3 层**：

```scss
// ✅ 正确
.aix-table {
  &__header {
    .aix-table__cell { }         // 2 层
  }
}

// ❌ 错误：嵌套过深
.aix-table .container .header .cell .content { }
```

**禁止直接使用标签选择器**：

```scss
// ❌ 错误
h1 { font-size: 24px; }

// ✅ 正确
.aix-card__title { font-size: 24px; }
```

### 盒模型规范

所有组件样式**必须**使用 `box-sizing: border-box`：

```scss
.aix-button {
  box-sizing: border-box;
  width: 120px;
  padding: 12px 24px;
  border: 1px solid var(--aix-colorBorder);
}
// 总宽度 = 120px ✅
```

### RGB 颜色函数规范

使用新语法 `rgb(r g b / alpha)`，**禁止**旧语法 `rgba(r, g, b, alpha)`：

```scss
// ✅ 正确
color: rgb(0 0 0 / 0.880);
background: rgb(255 255 255 / 0.500);

// ❌ 错误
color: rgba(0, 0, 0, 0.88);
```

### CSS 数值精度规范

小数**必须保留 3 位**：

```scss
// ✅ 正确
.aix-button {
  font-size: 14.375px;
  line-height: 1.429em;
  opacity: 0.880;
  width: 33.333%;
}

// ❌ 错误
.aix-button {
  line-height: 1.42em;     // 应为 1.420em
  opacity: 0.88;           // 应为 0.880
}

// ✅ 整数不加小数点
width: 100px;
margin: 0;
```

### 样式隔离规范（禁用 scoped）

组件库**禁止**使用 `<style scoped>`，依赖 `.aix-<component>` 命名空间 + BEM 命名实现隔离：

```vue
<!-- ✅ 正确：不加 scoped，使用 BEM 命名空间 -->
<style lang="scss">
.aix-button {
  &--primary { }
  &__icon { }
}
</style>

<!-- ❌ 错误：使用 scoped -->
<style scoped>
.aix-button { }
</style>
```

**禁用原因**：
- scoped 会生成 `data-v-xxx` hash 属性，组件库被外部 import 时增加无意义的运行时开销
- 业务侧难以通过普通 class 覆盖样式，必须用 `:deep()`，破坏封装
- 与 Tree-shaking、CSS 提取链路兼容性更好

### :deep() 选择器规范

`:deep()` 内部禁止使用 BEM 后缀：

```scss
// ❌ 错误：编译为 :deep(.aix-select)--open (无效)
:deep(.aix-select) {
  &--open { ... }
}

// ✅ 正确：BEM 变体单独写
:deep(.aix-select) { ... }
:deep(.aix-select--open) { ... }
:deep(.aix-select__dropdown) { ... }

// ✅ 允许：伪类、状态类、子选择器
:deep(.aix-select) {
  &:hover { ... }
  &.is-active { ... }
  .icon { ... }
}
```

### SCSS 组织规范

```scss
// ❌ 禁止定义颜色变量
// $primary-color: #1890ff;

// ✅ 可以定义间距和混入
$spacing-sm: 8px;
$spacing-md: 16px;

@mixin flex-center {
  display: flex;
  justify-content: center;
  align-items: center;
}

// ✅ 组件样式使用 BEM
.aix-button {
  @include flex-center;
  padding: $spacing-md;
  border: 1px solid var(--aix-colorBorder);
  background: var(--aix-colorBgContainer);

  &__icon {
    margin-right: $spacing-sm;
  }

  &--primary {
    background: var(--aix-colorPrimary);
    color: var(--aix-colorWhite);
  }
}
```

---

## 📋 编码规范快速检查清单

### TypeScript 类型安全检查

- [ ] 所有变量都有明确的类型定义，避免使用 `any`
- [ ] 接口定义完整，包含所有必要字段和 JSDoc 注释
- [ ] 函数参数和返回值类型明确
- [ ] 使用类型守卫而不是类型断言
- [ ] 导入类型时使用 `type` 关键字
- [ ] Props/Emits/Slots 类型已导出

### Vue 组件规范检查

- [ ] Props 和 Emits 有完整的类型定义
- [ ] Props/Emits 类型已导出
- [ ] 响应式数据类型明确
- [ ] 计算属性有返回类型注解
- [ ] 组件名称使用 Aix 前缀（AixButton）
- [ ] 使用 `<script setup lang="ts">`
- [ ] 代码组织符合标准顺序

### 样式编码检查（强化）

- [ ] 使用 `packages/theme/src/` 中定义的 CSS 变量
- [ ] 所有颜色值使用 `var(--aix-xxx)` 而非硬编码
- [ ] 所有 CSS 类名使用 `aix-` 前缀
- [ ] **不使用** `<style scoped>`，依赖 `.aix-` 前缀 + BEM 命名空间隔离
- [ ] CSS 数值小数保留 3 位（如 14.375px、1.429em、0.880）
- [ ] 不直接使用标签名选择器（如 `h1`, `p`, `div`）
- [ ] 每个元素都有语义化的 class 名称
- [ ] 样式类名遵循 BEM 命名规范
- [ ] 避免深层嵌套选择器（不超过 3 层）

### 导出规范检查

- [ ] 组件已命名导出
- [ ] Props/Emits/Slots 类型已导出
- [ ] package.json 配置正确（main, module, types, exports）
- [ ] 支持 ESM 和 CJS 两种格式
- [ ] 类型定义文件已生成（.d.ts）
- [ ] sideEffects 配置正确

### 组件库特有检查

- [ ] 组件无全局副作用
- [ ] 样式通过 `.aix-` 命名空间隔离（禁用 scoped）
- [ ] 支持按需引入
- [ ] 支持 Tree-shaking
- [ ] 所有 API 有 JSDoc 注释
- [ ] 有对应的 Storybook story
- [ ] 有单元测试

---

## 🛠️ 代码质量工具

```bash
# ESLint 检查
pnpm lint
pnpm lint --filter @aix/button

# TypeScript 类型检查
pnpm type-check

# Stylelint 样式检查（如果配置了）
pnpm stylelint "packages/**/*.{vue,scss,css}"

# 构建检查
pnpm build --filter @aix/button

# 运行测试
pnpm test --filter @aix/button
```

---

## 📚 相关文档

- [component-design.md](./component-design.md) - 组件设计完整指南
- [testing.md](./testing.md) - 测试策略
- [storybook-development.md](./storybook-development.md) - Storybook 开发

---

通过遵循这些编码规范，可以确保组件库代码的一致性、可读性和可维护性，为高质量的组件开发提供清晰的标准。
