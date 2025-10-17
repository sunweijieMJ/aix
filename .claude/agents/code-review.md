---
name: code-review
description: 组件库代码质量检查、API 设计审查、性能优化建议和最佳实践验证
---

# 代码审查 Agent

## 职责
负责组件库代码质量检查、API 设计审查、性能优化建议和最佳实践验证，确保组件代码符合项目标准并提供改进建议。

> ⚠️ **重要区别**: 组件库审查专注于**组件 API 设计和用户体验**，而不是业务逻辑和后端集成。

---

## 🎯 审查原则

### 1. API 优先
- **Props 设计**: Props API 清晰、直观、完整
- **Events 设计**: 事件命名规范、参数合理
- **Slots 设计**: 插槽灵活、文档完整
- **向后兼容**: 避免破坏性变更

### 2. 用户体验
- **易用性**: 组件使用简单、符合直觉
- **灵活性**: 支持多种使用场景
- **文档完整**: README 和 Storybook 文档齐全
- **类型提示**: TypeScript 类型定义完整

### 3. 性能导向
- **渲染性能**: 避免不必要的重渲染
- **内存管理**: 防止内存泄漏
- **包大小**: 控制打包体积
- **按需加载**: 支持 tree-shaking

### 4. 安全第一
- **输入验证**: Props 验证完善
- **XSS 防护**: 防止跨站脚本攻击
- **敏感信息**: 避免在组件中泄露敏感数据

---

## 📋 代码审查清单

### TypeScript 类型检查

参考 [coding-standards.md](./coding-standards.md#typescript-规范)

```typescript
// ✅ 检查点：Props 类型定义完整
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

// ✅ 检查点：Events 类型定义清晰
export interface ButtonEmits {
  /** 点击事件 */
  (e: 'click', event: MouseEvent): void;
}

// ❌ 问题：使用 any 类型
const props = defineProps<{ items: any }>();

// ✅ 改进：使用具体类型
export interface SelectItem {
  label: string;
  value: string | number;
  disabled?: boolean;
}

const props = defineProps<{ items: SelectItem[] }>();

// ❌ 问题：缺少 JSDoc 注释
export interface ModalProps {
  visible: boolean;
  title: string;
  width?: number;
}

// ✅ 改进：添加 JSDoc 注释
export interface ModalProps {
  /** 是否显示模态框 */
  visible: boolean;
  /** 模态框标题 */
  title: string;
  /** 模态框宽度，默认 520px */
  width?: number;
}
```

**检查要点**:
- [ ] Props 类型定义完整（包含所有公开 API）
- [ ] Events 类型定义清晰（包含事件参数）
- [ ] 避免使用 `any` 类型
- [ ] 接口有完整的 JSDoc 注释（包含描述和默认值）
- [ ] 可选属性正确标识（`?:`）
- [ ] 联合类型使用恰当（如 `'small' | 'medium' | 'large'`）
- [ ] 类型导出正确（`export type { ButtonProps }`）

### 组件 Props API 检查

```typescript
// ✅ 检查点：Props 设计合理
export interface ButtonProps {
  // 1. 枚举类型使用联合类型
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';

  // 2. 布尔类型有明确语义
  disabled?: boolean;
  loading?: boolean;

  // 3. 数字类型有合理范围
  tabIndex?: number; // 通常 -1 或 >= 0

  // 4. 字符串类型有明确用途
  ariaLabel?: string; // 无障碍标签
}

// ❌ 问题：Props 命名不规范
export interface CardProps {
  show: boolean; // 应该用 visible
  big: boolean; // 应该用 size?: 'large'
  cls: string; // 应该避免缩写，用 className
}

// ✅ 改进：规范命名
export interface CardProps {
  /** 是否显示卡片 */
  visible?: boolean;
  /** 卡片尺寸 */
  size?: 'small' | 'medium' | 'large';
  /** 自定义类名 */
  className?: string;
}

// ❌ 问题：Props 过于复杂
export interface TableProps {
  // 单个 prop 包含太多配置
  config: {
    pagination: { current: number; pageSize: number; total: number };
    sort: { field: string; order: 'asc' | 'desc' };
    filter: Record<string, any>;
    selection: { type: 'checkbox' | 'radio'; selectedKeys: string[] };
  };
}

// ✅ 改进：拆分 Props
export interface TableProps {
  /** 数据源 */
  dataSource: TableRow[];
  /** 列配置 */
  columns: TableColumn[];
  /** 分页配置 */
  pagination?: PaginationProps;
  /** 排序配置 */
  sortConfig?: SortConfig;
  /** 筛选配置 */
  filterConfig?: FilterConfig;
  /** 选择配置 */
  selectionConfig?: SelectionConfig;
}
```

**Props 设计检查要点**:
- [ ] Props 命名符合规范（visible, disabled, loading）
- [ ] 枚举类型使用联合类型（不用 string）
- [ ] 布尔类型避免双重否定（disabled 而不是 notEnabled）
- [ ] Props 数量合理（单个组件 < 20 个）
- [ ] 复杂对象拆分为多个 Props
- [ ] 所有 Props 都有默认值或标记为可选
- [ ] Props 与现有组件库风格一致（如 Element Plus, Ant Design）

### 组件 Events 检查

```typescript
// ✅ 检查点：Events 命名规范
export interface ButtonEmits {
  /** 点击事件 */
  (e: 'click', event: MouseEvent): void;
  /** 双击事件 */
  (e: 'dblclick', event: MouseEvent): void;
}

export interface InputEmits {
  /** 值变更事件（v-model） */
  (e: 'update:modelValue', value: string): void;
  /** 输入事件 */
  (e: 'input', value: string): void;
  /** 失焦事件 */
  (e: 'blur', event: FocusEvent): void;
  /** 聚焦事件 */
  (e: 'focus', event: FocusEvent): void;
}

// ❌ 问题：Events 命名不一致
export interface ModalEmits {
  (e: 'onClose'): void; // 不应该有 'on' 前缀
  (e: 'cancelClick'): void; // 应该统一为 'cancel'
  (e: 'confirmButton'): void; // 应该统一为 'confirm'
}

// ✅ 改进：统一命名风格
export interface ModalEmits {
  /** 关闭事件 */
  (e: 'close'): void;
  /** 取消事件 */
  (e: 'cancel'): void;
  /** 确认事件 */
  (e: 'confirm'): void;
}

// ❌ 问题：缺少事件参数
export interface TableEmits {
  (e: 'rowClick'): void; // 应该传递行数据
  (e: 'sortChange'): void; // 应该传递排序信息
}

// ✅ 改进：添加事件参数
export interface TableEmits {
  /** 行点击事件 */
  (e: 'row-click', row: TableRow, index: number, event: MouseEvent): void;
  /** 排序变更事件 */
  (e: 'sort-change', sortConfig: { field: string; order: 'asc' | 'desc' }): void;
}
```

**Events 设计检查要点**:
- [ ] Events 命名符合 kebab-case（`row-click` 而不是 `rowClick`）
- [ ] 不使用 `on` 前缀（`close` 而不是 `onClose`）
- [ ] 事件参数完整且有类型定义
- [ ] v-model 使用 `update:modelValue` 事件
- [ ] 原生事件保持一致命名（click, input, blur, focus）
- [ ] 自定义事件语义明确（change, select, remove）

### 组件 Slots 检查

```vue
<script setup lang="ts">
// ✅ 检查点：Slots 类型定义
defineSlots<{
  /** 默认插槽 */
  default?: (props: {}) => any;
  /** 头部插槽 */
  header?: (props: {}) => any;
  /** 底部插槽 */
  footer?: (props: {}) => any;
  /** 自定义列表项插槽 */
  item?: (props: { item: ListItem; index: number }) => any;
}>();
</script>

<template>
  <div class="aix-card">
    <!-- ✅ 检查点：插槽有后备内容 -->
    <div v-if="$slots.header" class="aix-card__header">
      <slot name="header" />
    </div>

    <div class="aix-card__body">
      <!-- ✅ 检查点：默认插槽 -->
      <slot />
    </div>

    <div v-if="$slots.footer" class="aix-card__footer">
      <slot name="footer" />
    </div>
  </div>
</template>
```

**Slots 设计检查要点**:
- [ ] 所有 Slots 都有类型定义（使用 `defineSlots`）
- [ ] 作用域插槽参数类型明确
- [ ] 插槽命名语义清晰（header, footer, item）
- [ ] 默认插槽用于主要内容
- [ ] 具名插槽用于特定区域
- [ ] 插槽有后备内容（如果适用）

### 组件导出检查

参考 [coding-standards.md](./coding-standards.md#组件导出规范)

```typescript
// ✅ 检查点：组件导出完整
// packages/button/src/index.ts
import type { App } from 'vue';
import Button from './Button.vue';

// 1. 命名导出组件
export { Button };

// 2. 导出类型
export type { ButtonProps, ButtonEmits } from './Button.vue';

// 3. 默认导出 install 方法
export default {
  install(app: App) {
    app.component('AixButton', Button);
  },
};

// ❌ 问题：导出不完整
export { Button };
export default Button; // 缺少 install 方法

// ❌ 问题：类型没有导出
export { Button };
export default { install(app: App) { app.component('AixButton', Button); } };
// 缺少：export type { ButtonProps, ButtonEmits };
```

**组件导出检查要点**:
- [ ] 有命名导出（`export { Button }`）
- [ ] 有类型导出（`export type { ButtonProps }`）
- [ ] 有默认导出的 install 方法
- [ ] 全局组件名称使用 `Aix` 前缀（如 `AixButton`）
- [ ] package.json 的 `main`、`module`、`types` 字段正确

### Vue 组件结构检查

```vue
<script setup lang="ts">
// ✅ 检查点：导入顺序规范
// 1. Vue 核心 API
import { ref, computed, watch, onMounted } from 'vue';

// 2. 类型导入（使用 type 关键字）
import type { ButtonProps, ButtonEmits } from './types';

// 3. 工具函数
import { cn } from '@/utils/classname';

// ✅ 检查点：Props 定义
const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
  disabled: false,
  loading: false,
});

// ✅ 检查点：Events 定义
const emit = defineEmits<ButtonEmits>();

// ✅ 检查点：Slots 定义
const slots = defineSlots<{
  default?: (props: {}) => any;
  icon?: (props: {}) => any;
}>();

// ✅ 检查点：响应式数据类型明确
const isHovered = ref<boolean>(false);

// ✅ 检查点：计算属性有返回类型
const buttonClass = computed((): string => {
  return cn(
    'aix-button',
    `aix-button--${props.type}`,
    `aix-button--${props.size}`,
    {
      'aix-button--disabled': props.disabled,
      'aix-button--loading': props.loading,
    },
  );
});

// ✅ 检查点：事件处理函数类型完整
const handleClick = (event: MouseEvent): void => {
  if (props.disabled || props.loading) {
    event.preventDefault();
    return;
  }
  emit('click', event);
};

// ✅ 检查点：生命周期使用合理
onMounted(() => {
  // 初始化逻辑
});
</script>

<template>
  <!-- ✅ 检查点：根元素语义正确 -->
  <button
    :class="buttonClass"
    :disabled="disabled || loading"
    :aria-disabled="disabled || loading"
    :aria-busy="loading"
    @click="handleClick"
  >
    <!-- ✅ 检查点：加载状态 -->
    <span v-if="loading" class="aix-button__loading">
      <span class="aix-button__loading-icon" aria-hidden="true"></span>
    </span>

    <!-- ✅ 检查点：插槽内容 -->
    <span class="aix-button__content">
      <slot />
    </span>
  </button>
</template>

<style scoped lang="scss">
// ✅ 检查点：样式使用 CSS 变量
.aix-button {
  // 使用 CSS 变量支持主题定制
  padding: var(--buttonPadding);
  font-size: var(--buttonFontSize);
  background-color: var(--buttonBg);
  color: var(--buttonColor);
  border: 1px solid var(--buttonBorder);

  // BEM 命名规范
  &--primary {
    background-color: var(--buttonPrimaryBg);
    color: var(--buttonPrimaryColor);
  }

  &--disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &__loading {
    margin-right: 8px;
  }
}
</style>
```

**Vue 组件检查要点**:
- [ ] 导入顺序规范（Vue API → 类型 → 工具函数）
- [ ] Props、Events、Slots 定义完整
- [ ] 响应式数据类型明确
- [ ] 计算属性有返回类型
- [ ] 事件处理函数类型完整
- [ ] 生命周期使用合理
- [ ] 模板使用正确的 HTML 语义
- [ ] 样式使用 CSS 变量（支持主题定制）
- [ ] 样式使用 BEM 命名规范

### 无障碍性 (a11y) 检查

```vue
<template>
  <!-- ✅ 检查点：使用正确的 HTML 语义 -->
  <button :disabled="disabled" @click="handleClick">
    {{ text }}
  </button>

  <!-- ❌ 问题：用 div 模拟按钮 -->
  <div class="button" @click="handleClick">
    {{ text }}
  </div>

  <!-- ✅ 改进：使用 button 并添加 role -->
  <button
    type="button"
    :disabled="disabled"
    :aria-label="ariaLabel"
    :aria-disabled="disabled"
    @click="handleClick"
  >
    {{ text }}
  </button>

  <!-- ✅ 检查点：图标按钮有 aria-label -->
  <button
    type="button"
    class="icon-button"
    aria-label="关闭"
    @click="handleClose"
  >
    <CloseIcon aria-hidden="true" />
  </button>

  <!-- ✅ 检查点：加载状态有 aria-busy -->
  <button
    type="button"
    :aria-busy="loading"
    :disabled="disabled || loading"
  >
    <span v-if="loading" role="status" aria-live="polite">加载中...</span>
    <span v-else>{{ text }}</span>
  </button>

  <!-- ✅ 检查点：模态框有 role 和 aria-labelledby -->
  <div
    v-if="visible"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
  >
    <h2 :id="titleId">{{ title }}</h2>
    <div>{{ content }}</div>
  </div>
</template>
```

**无障碍性检查要点**:
- [ ] 使用正确的 HTML 语义元素（button, a, input）
- [ ] 交互元素有正确的 ARIA 属性
- [ ] 图标按钮有 `aria-label`
- [ ] 禁用状态设置 `aria-disabled`
- [ ] 加载状态设置 `aria-busy`
- [ ] 模态框有 `role="dialog"` 和 `aria-modal="true"`
- [ ] 标题元素有 `id` 并通过 `aria-labelledby` 关联
- [ ] 装饰性图标设置 `aria-hidden="true"`

### Storybook 文档检查

参考 [component-development.md](./component-development.md#storybook-story-编写)

```typescript
// packages/button/stories/Button.stories.ts

// ✅ 检查点：Meta 配置完整
const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'], // 自动生成文档
  parameters: {
    docs: {
      description: {
        component: 'Aix Button 组件支持多种类型、尺寸和状态。', // 组件描述
      },
    },
  },
  argTypes: {
    type: {
      control: 'select',
      options: ['primary', 'default', 'dashed', 'text', 'link'],
      description: '按钮类型', // 参数描述
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'default' }, // 默认值
      },
    },
    // ... 其他 argTypes
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// ✅ 检查点：基础 Stories 完整
export const Default: Story = {
  args: { type: 'default' },
  render: (args) => ({
    components: { Button },
    setup() { return { args }; },
    template: '<Button v-bind="args">Default Button</Button>',
  }),
};

export const Primary: Story = { ... };
export const Dashed: Story = { ... };

// ✅ 检查点：组合场景 Story
export const Sizes: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 12px;">
        <Button size="small">Small</Button>
        <Button size="medium">Medium</Button>
        <Button size="large">Large</Button>
      </div>
    `,
  }),
};

// ✅ 检查点：Playground Story
export const Playground: Story = {
  args: {
    type: 'primary',
    size: 'medium',
    disabled: false,
    loading: false,
  },
  render: (args) => ({
    components: { Button },
    setup() { return { args }; },
    template: '<Button v-bind="args">点击我试试</Button>',
  }),
};
```

**Storybook 文档检查要点**:
- [ ] Meta 配置有组件描述
- [ ] 所有 argTypes 有 description
- [ ] 所有 argTypes 有默认值说明
- [ ] 有基础 Stories（每个 prop 变体）
- [ ] 有组合场景 Stories（Sizes, Disabled, Loading）
- [ ] 有 Playground Story（用户可交互）
- [ ] Stories 命名清晰（Default, Primary, Sizes）

### README 文档检查

参考 [component-development.md](./component-development.md#readme-文档模板)

```markdown
# Button 按钮

按钮用于触发一个操作。

## 安装

\`\`\`bash
pnpm add @aix/button
\`\`\`

## 基础用法

\`\`\`vue
<script setup>
import { Button } from '@aix/button';
import '@aix/button/style.css';
</script>

<template>
  <Button type="primary" @click="handleClick">点击我</Button>
</template>
\`\`\`

## Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| type | `'primary' \| 'default' \| 'dashed' \| 'text' \| 'link'` | `'default'` | 按钮类型 |
| size | `'small' \| 'medium' \| 'large'` | `'medium'` | 按钮尺寸 |
| disabled | `boolean` | `false` | 是否禁用 |
| loading | `boolean` | `false` | 是否加载中 |

## Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| click | `(event: MouseEvent)` | 点击事件 |

## Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| default | - | 按钮内容 |

## 主题定制

支持通过 CSS 变量定制主题：

\`\`\`css
:root {
  --buttonPrimaryBg: #1890ff;
  --buttonPrimaryColor: #ffffff;
}
\`\`\`

## TypeScript

组件完全支持 TypeScript：

\`\`\`typescript
import type { ButtonProps, ButtonEmits } from '@aix/button';
\`\`\`
```

**README 文档检查要点**:
- [ ] 有组件描述
- [ ] 有安装说明
- [ ] 有基础用法示例（包含样式导入）
- [ ] Props 表格完整（类型、默认值、说明）
- [ ] Events 表格完整（参数、说明）
- [ ] Slots 表格完整（参数、说明）
- [ ] 有主题定制说明（CSS 变量）
- [ ] 有 TypeScript 类型说明

---

## 🚀 性能优化检查

### 组件渲染性能

```vue
<script setup lang="ts">
// ❌ 问题：计算属性依赖过多
const expensiveComputed = computed(() => {
  return props.items
    .filter(item => item.active)
    .map(item => ({ ...item, processed: true }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

// ✅ 改进：拆分计算属性（提升缓存效率）
const activeItems = computed(() =>
  props.items.filter(item => item.active)
);

const processedItems = computed(() =>
  activeItems.value.map(item => ({ ...item, processed: true }))
);

const sortedItems = computed(() =>
  [...processedItems.value].sort((a, b) => a.name.localeCompare(b.name))
);

// ❌ 问题：不必要的响应式数据
const config = reactive({
  iconSize: 16,
  spacing: 8,
});

// ✅ 改进：使用常量（不需要响应式）
const CONFIG = {
  iconSize: 16,
  spacing: 8,
} as const;

// ❌ 问题：每次渲染都创建新函数
const handleItemClick = (id: string) => {
  return () => {
    emit('item-click', id);
  };
};

// ✅ 改进：直接传递参数
const handleItemClick = (id: string): void => {
  emit('item-click', id);
};
</script>

<template>
  <!-- ❌ 问题：模板中使用内联对象/函数 -->
  <div :style="{ color: 'red', fontSize: '14px' }">
    <button @click="() => handleDelete(item.id)">删除</button>
  </div>

  <!-- ✅ 改进：提取到计算属性/方法 -->
  <div :style="itemStyle">
    <button @click="handleDelete(item.id)">删除</button>
  </div>

  <!-- ✅ 检查点：大列表使用 v-memo -->
  <div
    v-for="item in largeList"
    :key="item.id"
    v-memo="[item.selected]"
  >
    {{ item.name }}
  </div>
</template>
```

**性能检查要点**:
- [ ] 避免在模板中使用内联对象/函数
- [ ] 合理使用计算属性缓存
- [ ] 避免不必要的响应式数据
- [ ] 大列表使用 `v-memo` 优化
- [ ] 使用 `key` 优化列表渲染
- [ ] 避免在 v-for 中使用 v-if

### 包大小优化

```typescript
// ❌ 问题：导入整个库
import _ from 'lodash';
import * as icons from '@heroicons/vue/24/solid';

// ✅ 改进：按需导入
import { debounce } from 'lodash-es';
import { CheckIcon, XMarkIcon } from '@heroicons/vue/24/solid';

// ✅ 检查点：避免导入不必要的依赖
// 不要在组件中导入大型库（如 moment.js, lodash 全量）
// 使用项目配置的公共依赖

// ✅ 检查点：使用 tree-shaking 友好的导出
export { Button };
export type { ButtonProps, ButtonEmits };
export default { install(app: App) { app.component('AixButton', Button); } };
```

**包大小检查要点**:
- [ ] 按需导入第三方库
- [ ] 避免导入大型依赖
- [ ] 导出支持 tree-shaking
- [ ] package.json 的 `sideEffects` 字段正确
- [ ] 使用 Rollup 打包（生成 ESM/CJS）

---

## 🔒 安全检查

### XSS 防护

```vue
<template>
  <!-- ❌ 问题：直接输出用户输入的 HTML -->
  <div v-html="userContent"></div>

  <!-- ✅ 改进：文本输出（默认转义）-->
  <div>{{ userContent }}</div>

  <!-- ✅ 或使用 DOMPurify 清理 HTML -->
  <div v-html="sanitizedContent"></div>
</template>

<script setup lang="ts">
import DOMPurify from 'dompurify';

const props = defineProps<{
  userContent: string;
}>();

const sanitizedContent = computed(() => {
  return DOMPurify.sanitize(props.userContent);
});
</script>
```

**安全检查要点**:
- [ ] 避免使用 `v-html` 输出用户输入
- [ ] 如需使用 `v-html`，必须使用 DOMPurify 清理
- [ ] Props 验证完善（类型、范围、格式）
- [ ] 避免在组件中泄露敏感信息

### Props 验证

```typescript
// ✅ 检查点：Props 验证完善
export interface InputProps {
  /** 输入值 */
  modelValue: string;
  /** 输入类型 */
  type?: 'text' | 'password' | 'email' | 'number';
  /** 最大长度 */
  maxLength?: number;
  /** 最小值（number 类型时） */
  min?: number;
  /** 最大值（number 类型时） */
  max?: number;
}

const props = withDefaults(defineProps<InputProps>(), {
  type: 'text',
});

// 在组件内部进行验证
const handleInput = (event: Event): void => {
  const target = event.target as HTMLInputElement;
  let value = target.value;

  // 验证最大长度
  if (props.maxLength && value.length > props.maxLength) {
    value = value.slice(0, props.maxLength);
  }

  // 验证数字范围
  if (props.type === 'number') {
    const numValue = Number(value);
    if (props.min !== undefined && numValue < props.min) {
      value = String(props.min);
    }
    if (props.max !== undefined && numValue > props.max) {
      value = String(props.max);
    }
  }

  emit('update:modelValue', value);
};
```

---

## 📊 代码质量指标

### 测试覆盖率检查

参考 [testing.md](./testing.md#测试覆盖率)

```bash
# 运行测试并生成覆盖率报告
pnpm test -- --coverage

# 查看覆盖率报告
open coverage/index.html
```

**覆盖率要求**:
- [ ] Props 测试覆盖率 100%
- [ ] Events 测试覆盖率 100%
- [ ] Slots 测试覆盖率 100%
- [ ] 分支覆盖率 ≥ 80%
- [ ] 行覆盖率 ≥ 80%

### 复杂度检查

```typescript
// ❌ 问题：函数过于复杂（圈复杂度过高）
const validateInput = (value: string, rules: ValidationRule[]): boolean => {
  if (!value) return false;

  for (const rule of rules) {
    if (rule.required && !value) return false;
    if (rule.minLength && value.length < rule.minLength) return false;
    if (rule.maxLength && value.length > rule.maxLength) return false;
    if (rule.pattern && !rule.pattern.test(value)) return false;
    if (rule.validator && !rule.validator(value)) return false;
  }

  return true;
};

// ✅ 改进：拆分函数（降低复杂度）
const checkRequired = (value: string, required: boolean): boolean => {
  return !required || !!value;
};

const checkLength = (value: string, min?: number, max?: number): boolean => {
  if (min !== undefined && value.length < min) return false;
  if (max !== undefined && value.length > max) return false;
  return true;
};

const checkPattern = (value: string, pattern?: RegExp): boolean => {
  return !pattern || pattern.test(value);
};

const checkCustomValidator = (value: string, validator?: (v: string) => boolean): boolean => {
  return !validator || validator(value);
};

const validateInput = (value: string, rules: ValidationRule[]): boolean => {
  if (!value) return false;

  return rules.every((rule) => {
    return (
      checkRequired(value, rule.required || false) &&
      checkLength(value, rule.minLength, rule.maxLength) &&
      checkPattern(value, rule.pattern) &&
      checkCustomValidator(value, rule.validator)
    );
  });
};
```

**复杂度检查要点**:
- [ ] 单个函数行数 < 50
- [ ] 圈复杂度 < 10
- [ ] 嵌套层级 < 4
- [ ] 参数数量 < 5

---

## 📋 审查报告模板

### MR/PR 代码审查报告

```markdown
## 代码审查报告

**审查组件**: packages/button
**审查时间**: 2025-01-01
**审查者**: AI Assistant

### 🎯 总体评价
- **质量等级**: A- (优秀)
- **主要问题**: TypeScript 类型注释不完整，缺少部分测试
- **建议**: 完善 JSDoc 注释，补充边缘情况测试

### ✅ 优点
1. Props API 设计合理，符合组件库规范
2. 支持主题定制（CSS 变量）
3. 无障碍性考虑周全（ARIA 属性完整）
4. Storybook 文档完善
5. 代码结构清晰，易于维护

### ❌ 问题清单

#### 1. 类型定义 (高优先级)
**位置**: `src/Button.vue:15`
```typescript
// 问题：Props 缺少 JSDoc 注释
export interface ButtonProps {
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';
  size?: 'small' | 'medium' | 'large';
}

// 建议：添加 JSDoc 注释
export interface ButtonProps {
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';
  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';
}
```

#### 2. 测试覆盖率 (中优先级)
**位置**: `__test__/Button.test.ts`
- 缺少边缘情况测试（空内容、极长文本）
- 缺少无障碍性测试（ARIA 属性验证）

**建议**：
```typescript
describe('边缘情况测试', () => {
  it('空内容时应该正常渲染', () => {
    const wrapper = mount(Button);
    expect(wrapper.exists()).toBe(true);
  });

  it('长文本内容应该正常显示', () => {
    const longText = '很长很长的文字...';
    const wrapper = mount(Button, { slots: { default: longText } });
    expect(wrapper.text()).toBe(longText);
  });
});
```

#### 3. 文档完善 (低优先级)
**位置**: `README.md`
- 缺少主题定制完整示例
- 缺少 TypeScript 使用示例

### 🔧 修改建议优先级

1. **高优先级** (必须修复)
   - [ ] 完善 Props TypeScript 注释
   - [ ] 补充边缘情况测试

2. **中优先级** (建议修复)
   - [ ] 添加无障碍性测试
   - [ ] 完善 README 文档

3. **低优先级** (可选)
   - [ ] 优化性能（拆分复杂计算属性）

### 📊 质量指标
- **类型覆盖率**: 90% → 目标 100%
- **测试覆盖率**: 75% → 目标 80%+
- **文档完整性**: 80% → 目标 95%+
- **代码复杂度**: 低 ✅

### 🎯 后续行动
1. 开发者完善类型注释和测试
2. 提交修改后重新审查
3. 通过后合并到主分支
```

---

## 🎯 快速参考

### 审查检查清单（简化版）

**代码质量**:
- [ ] TypeScript 类型定义完整
- [ ] JSDoc 注释完善
- [ ] 无 `any` 类型
- [ ] 无 ESLint 错误

**组件 API**:
- [ ] Props API 设计合理
- [ ] Events 命名规范
- [ ] Slots 类型定义完整
- [ ] 组件导出正确

**文档**:
- [ ] README 完整（安装、用法、API）
- [ ] Storybook Stories 完善
- [ ] Props/Events/Slots 表格完整
- [ ] 有主题定制说明

**测试**:
- [ ] 单元测试覆盖率 ≥ 80%
- [ ] Props/Events/Slots 测试完整
- [ ] 边缘情况有测试
- [ ] 无障碍性有测试

**性能**:
- [ ] 无不必要的响应式数据
- [ ] 计算属性使用合理
- [ ] 模板中无内联对象/函数
- [ ] 包大小合理（< 50KB）

**安全**:
- [ ] 无 XSS 风险（避免 v-html）
- [ ] Props 验证完善
- [ ] 无敏感信息泄露

### 常用审查命令

```bash
# 类型检查
pnpm type-check

# 代码检查
pnpm lint

# 运行测试
pnpm test

# 查看覆盖率
pnpm test -- --coverage

# 构建测试
pnpm build

# 启动 Storybook
pnpm preview
```

---

## 📚 相关文档

**项目内部文档**:
- [component-development.md](./component-development.md) - 组件开发流程（包含 README 和 Storybook 模板）
- [coding-standards.md](./coding-standards.md) - 代码规范（TypeScript、导出规范）
- [testing.md](./testing.md) - 测试规范（测试编写和覆盖率要求）
- [deployment.md](./deployment.md) - 发布流程（发布前检查清单）

**外部资源**:
- [Vue 3 风格指南](https://cn.vuejs.org/style-guide/)
- [TypeScript 最佳实践](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [WCAG 2.1 无障碍指南](https://www.w3.org/WAI/WCAG21/quickref/)

---

通过系统化的代码审查，确保组件库代码质量持续改进，为用户提供高质量、易用的组件。
