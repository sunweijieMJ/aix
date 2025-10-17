---
name: coding-standards
description: Vue组件库编码规范和最佳实践，确保代码风格一致性、类型安全和高质量代码
---

# 编码规范 Agent

## 职责
负责制定和维护Vue组件库编码规范，确保代码风格一致性、类型安全和最佳实践，为AI生成高质量组件代码提供指导。

## 🎯 编码原则

### 1. 类型优先原则
- **严格类型定义**: 所有Props、Emits、变量必须有明确的TypeScript类型
- **避免any类型**: 除非特殊情况，禁止使用 `any` 类型
- **接口完整性**: 所有数据结构都要有对应的TypeScript接口
- **泛型合理使用**: 适当使用泛型提高代码复用性

### 2. 组件化原则
- **单一职责**: 每个组件只负责一个功能
- **可复用性**: 组件设计要考虑在不同项目中复用
- **Props类型化**: 所有Props必须有完整的类型定义和JSDoc注释
- **事件规范**: 使用TypeScript定义组件事件类型

### 3. 可访问性原则
- **语义化HTML**: 使用正确的HTML标签
- **ARIA属性**: 添加必要的ARIA属性支持屏幕阅读器
- **键盘导航**: 支持Tab、Enter、Escape等键盘操作
- **焦点管理**: 正确管理组件焦点状态

### 4. 主题化原则
- **CSS变量**: 所有样式值使用CSS变量，支持主题定制
- **避免硬编码**: 不在组件中硬编码颜色、尺寸等值
- **暗色模式**: 考虑暗色模式支持
- **尺寸变量**: 支持small/medium/large等尺寸变体

## 📝 TypeScript 编码规范

### 接口定义规范
```typescript
// ✅ 正确：完整的Props接口定义，包含JSDoc注释
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

// ✅ 正确：完整的Emits接口定义
export interface ButtonEmits {
  /** 点击事件 */
  (e: 'click', event: MouseEvent): void;
  /** 双击事件 */
  (e: 'dblclick', event: MouseEvent): void;
}

// ❌ 错误：使用any类型
interface BadProps {
  data: any; // 应该定义具体类型
  options: any[]; // 应该定义数组元素类型
}

// ❌ 错误：缺少JSDoc注释
export interface BadButtonProps {
  type?: string;
  size?: string;
}
```

### 函数类型定义规范
```typescript
// ✅ 正确：完整的函数类型定义
const handleClick = (event: MouseEvent): void => {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
};

// ✅ 泛型函数
function createComponent<T extends ButtonProps>(
  props: T
): Component<T> {
  return defineComponent({ props });
}

// ❌ 错误：缺少返回类型
const handleClick = (event: MouseEvent) => {
  emit('click', event);
};
```

### 枚举和常量定义
```typescript
// ✅ 使用const断言定义字符串联合类型
export const BUTTON_TYPES = {
  PRIMARY: 'primary',
  DEFAULT: 'default',
  DASHED: 'dashed',
  TEXT: 'text',
  LINK: 'link',
} as const;

export type ButtonType = typeof BUTTON_TYPES[keyof typeof BUTTON_TYPES];

// ✅ 使用枚举定义数值类型
export enum ComponentSize {
  SMALL = 1,
  MEDIUM = 2,
  LARGE = 3,
}

// ❌ 错误：使用魔术字符串
if (props.type === 'primary') { // 应该使用常量
  // ...
}
```

### 类型守卫和断言
```typescript
// ✅ 类型守卫
function isButtonType(value: unknown): value is ButtonType {
  return typeof value === 'string' &&
    ['primary', 'default', 'dashed', 'text', 'link'].includes(value);
}

// ✅ 类型谓词
function hasSlotContent(slots: Slots, name: string = 'default'): boolean {
  return !!slots[name];
}

// ❌ 错误：过度使用类型断言
const type = props.type as ButtonType; // 应该使用类型守卫
```

## 🎨 Vue 组件编码规范

### Composition API 规范
```vue
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { PropType } from 'vue';

// ==================== 接口定义 ====================
/** 按钮Props定义 */
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

/** 按钮Events定义 */
export interface ButtonEmits {
  /** 点击事件 */
  (e: 'click', event: MouseEvent): void;
}

// ==================== Props 和 Emits ====================
const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
  disabled: false,
  loading: false,
});

const emit = defineEmits<ButtonEmits>();

// ==================== 计算属性 ====================
const buttonClass = computed((): string[] => {
  return [
    'aix-button',
    `aix-button--${props.type}`,
    `aix-button--${props.size}`,
    {
      'aix-button--disabled': props.disabled,
      'aix-button--loading': props.loading,
    },
  ];
});

// ==================== 方法定义 ====================
/**
 * 处理按钮点击
 * @param event - 鼠标事件对象
 */
const handleClick = (event: MouseEvent): void => {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
};

// ==================== 生命周期 ====================
onMounted(() => {
  // 组件挂载后的逻辑
});

// ==================== 暴露方法 ====================
defineExpose({
  // 暴露给父组件的方法和属性
});
</script>
```

### 组件Props规范
```typescript
// ✅ 正确：完整的Props定义，使用字面量类型
interface ButtonProps {
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';
  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';
  /** 是否禁用 */
  disabled?: boolean;
  /** 点击回调 */
  onClick?: (event: MouseEvent) => void;
}

const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
  disabled: false,
});

// ❌ 错误：使用string类型，失去类型提示
interface BadProps {
  type?: string;
  size?: string;
}

// ❌ 错误：缺少默认值
const props = defineProps<ButtonProps>();
```

### 组件事件规范
```typescript
// ✅ 正确：完整的事件定义，带参数类型
interface ButtonEmits {
  /** 点击事件 */
  (e: 'click', event: MouseEvent): void;
  /** 值更新事件（支持v-model） */
  (e: 'update:modelValue', value: string): void;
}

const emit = defineEmits<ButtonEmits>();

// 触发事件
emit('click', event);
emit('update:modelValue', newValue);

// ❌ 错误：使用数组定义，失去类型检查
const emit = defineEmits(['click', 'update:modelValue']);

// ❌ 错误：缺少类型定义
const emit = defineEmits<{
  (e: 'click'): void; // 缺少event参数
}>();
```

### 组件导出规范
```typescript
// src/Button.vue
<script setup lang="ts">
export interface ButtonProps {
  // Props定义
}

export interface ButtonEmits {
  // Events定义
}
// 组件逻辑...
</script>

// src/index.ts
// ✅ 正确：同时提供命名导出和插件导出
import type { App } from 'vue';
import Button from './Button.vue';

// 命名导出组件
export { Button };

// 导出类型
export type { ButtonProps, ButtonEmits } from './Button.vue';

// 默认导出Vue插件
export default {
  install(app: App) {
    app.component('AixButton', Button);
  },
};

// ❌ 错误：只有默认导出，无法按需引入
export default Button;

// ❌ 错误：缺少插件install方法
export { Button };
```

## 📊 组件命名规范

### 组件类名命名
```scss
// ✅ 正确：使用BEM命名，带组件库前缀
.aix-button {
  // 基础样式

  &__loading {
    // 元素样式
  }

  &__content {
    // 元素样式
  }

  &--primary {
    // 修饰符样式
  }

  &--disabled {
    // 状态修饰符
  }
}

// ❌ 错误：直接使用标签选择器
button {
  padding: 8px 16px;
}

// ❌ 错误：缺少前缀，可能冲突
.button {
  padding: 8px 16px;
}

// ❌ 错误：不遵循BEM
.button-loading-icon {
  // 应该是 .aix-button__loading-icon
}
```

### 全局组件命名
```typescript
// ✅ 正确：使用Yt前缀 + PascalCase
app.component('AixButton', Button);
app.component('AixDatePicker', DatePicker);
app.component('AixSelect', Select);

// ❌ 错误：缺少前缀
app.component('Button', Button);

// ❌ 错误：使用kebab-case
app.component('aix-button', Button);
```

### CSS变量命名
```css
/* ✅ 正确：使用--组件名+属性命名 */
:root {
  /* Button 组件变量 */
  --buttonPrimaryBg: #1890ff;
  --buttonPrimaryBgHover: #40a9ff;
  --buttonPrimaryBgActive: #096dd9;
  --buttonPrimaryColor: #ffffff;

  --buttonDefaultBg: #ffffff;
  --buttonDefaultBorder: #d9d9d9;
  --buttonDefaultBorderHover: #40a9ff;

  /* 通用变量 */
  --buttonPadding: 4px 15px;
  --buttonPaddingSM: 0px 7px;
  --buttonPaddingLG: 6px 15px;
  --buttonBorderRadius: 2px;
}

/* ❌ 错误：使用驼峰命名不规范 */
:root {
  --ButtonBg: #ffffff; /* 应该使用buttonDefaultBg */
  --primary-color: #1890ff; /* 应该使用buttonPrimaryBg */
}
```

## 🎨 样式编码规范

### CSS变量使用规范
```scss
// ✅ 正确：所有颜色、尺寸使用CSS变量
.aix-button {
  padding: var(--buttonPadding);
  font-size: var(--buttonFontSize);
  border-radius: var(--buttonBorderRadius);
  background-color: var(--buttonDefaultBg);
  border-color: var(--buttonDefaultBorder);
  color: var(--buttonDefaultColor);

  &--primary {
    background-color: var(--buttonPrimaryBg);
    border-color: var(--buttonPrimaryBorder);
    color: var(--buttonPrimaryColor);

    &:hover {
      background-color: var(--buttonPrimaryBgHover);
    }
  }
}

// ❌ 错误：硬编码颜色值
.aix-button {
  background-color: #1890ff;
  color: #ffffff;
  padding: 4px 15px;
}
```

### SCSS组织规范
```scss
// ✅ 正确：清晰的层级结构，使用CSS变量
.aix-button {
  // 基础样式
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--buttonPadding);
  cursor: pointer;

  // 元素样式
  &__loading {
    display: inline-flex;
    align-items: center;
  }

  &__loading-icon {
    width: var(--buttonIconSize);
    height: var(--buttonIconSize);
    animation: spin 1s linear infinite;
  }

  &__content {
    display: inline-flex;
    align-items: center;
  }

  // 类型修饰符
  &--primary {
    background-color: var(--buttonPrimaryBg);
    color: var(--buttonPrimaryColor);
  }

  &--default {
    background-color: var(--buttonDefaultBg);
    color: var(--buttonDefaultColor);
  }

  // 尺寸修饰符
  &--small {
    padding: var(--buttonPaddingSM);
    font-size: var(--buttonFontSizeSM);
  }

  &--large {
    padding: var(--buttonPaddingLG);
    font-size: var(--buttonFontSizeLG);
  }

  // 状态修饰符
  &--disabled {
    cursor: not-allowed;
    opacity: var(--buttonDisabledOpacity);
  }
}

// 动画定义
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

// ❌ 错误：过深的嵌套
.aix-button {
  .button-wrapper {
    .button-inner {
      .button-content {
        span {
          // 5层嵌套，难以维护
        }
      }
    }
  }
}

// ❌ 错误：不使用CSS变量
.aix-button {
  background-color: #1890ff;
  &:hover {
    background-color: #40a9ff;
  }
}
```

## 🔍 错误处理规范

### Props验证
```typescript
// ✅ 正确：使用TypeScript类型和运行时验证
export interface ButtonProps {
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';
  size?: 'small' | 'medium' | 'large';
}

const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
});

// 运行时验证（可选，用于开发阶段）
if (import.meta.env.DEV) {
  watch(() => props.type, (newType) => {
    const validTypes = ['primary', 'default', 'dashed', 'text', 'link'];
    if (newType && !validTypes.includes(newType)) {
      console.warn(`[Button] Invalid type: ${newType}`);
    }
  }, { immediate: true });
}
```

### 事件处理
```typescript
// ✅ 正确：完善的事件处理
const handleClick = (event: MouseEvent): void => {
  // 状态检查
  if (props.disabled || props.loading) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  try {
    // 触发事件
    emit('click', event);
  } catch (error) {
    console.error('[Button] Click handler error:', error);
  }
};

// ❌ 错误：缺少错误处理
const handleClick = (event: MouseEvent) => {
  emit('click', event);
};
```

## 📋 代码注释规范

### JSDoc注释规范
```typescript
/**
 * 按钮组件Props定义
 */
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
}

/**
 * 处理按钮点击事件
 * @param event - 鼠标事件对象
 */
const handleClick = (event: MouseEvent): void => {
  // 实现...
};
```

### 行内注释规范
```typescript
// ✅ 正确：解释复杂逻辑
const buttonClass = computed(() => {
  // 合并基础类名和修饰符类名
  return [
    'aix-button',
    `aix-button--${props.type}`,
    `aix-button--${props.size}`,
    {
      'aix-button--disabled': props.disabled,
      'aix-button--loading': props.loading,
    },
  ];
});

// ❌ 错误：显而易见的注释
const disabled = false; // 设置禁用状态为false
```

## 📋 编码规范快速检查清单

### TypeScript 类型安全检查
- [ ] 所有Props都有完整的接口定义和JSDoc注释
- [ ] 所有Emits都有完整的类型定义
- [ ] 避免使用 `any` 类型
- [ ] 导出Props和Emits接口供外部使用
- [ ] 函数参数和返回值类型明确
- [ ] 使用类型守卫而不是类型断言

### Vue组件规范检查
- [ ] Props有默认值（使用withDefaults）
- [ ] Emits使用TypeScript定义
- [ ] 计算属性有返回类型注解
- [ ] 事件处理函数有完整的错误处理
- [ ] 使用script setup语法
- [ ] 正确使用defineExpose暴露方法

### 组件导出规范检查
- [ ] 同时提供命名导出和默认导出
- [ ] 导出Props和Emits类型定义
- [ ] 默认导出包含install方法
- [ ] 全局组件名使用Yt前缀

### 样式编码检查
- [ ] 所有颜色使用CSS变量
- [ ] 所有尺寸使用CSS变量
- [ ] 使用BEM命名规范
- [ ] CSS类名使用aix-前缀
- [ ] 使用scoped样式隔离
- [ ] 避免深层嵌套（不超过3层）

### 无障碍性检查
- [ ] 使用语义化HTML标签
- [ ] 添加必要的ARIA属性
- [ ] 支持键盘导航
- [ ] 正确的焦点管理
- [ ] 禁用状态正确处理

### 文档注释检查
- [ ] Props有JSDoc注释和@default标记
- [ ] 公共方法有JSDoc注释
- [ ] 复杂逻辑有行内注释说明
- [ ] 导出的接口有注释说明

## 🛠️ 代码质量工具

### 常用命令
```bash
# ESLint 检查
pnpm lint

# TypeScript 类型检查
pnpm type-check

# Stylelint 样式检查
pnpm lint:style

# 格式化代码
pnpm format

# 拼写检查
pnpm cspell
```

---

通过遵循这些编码规范，可以确保组件库代码的一致性、可读性和可维护性，为用户提供高质量的组件。
