---
name: component-development
description: Vue组件库开发指导，包括组件设计原则、开发流程、Storybook使用和文档编写
---

# 组件开发规范

## 职责
专门负责Vue组件库开发指导，包括组件设计原则、开发流程、Storybook故事编写、文档规范和最佳实践。

## 🎯 组件设计原则

### 1. 单一职责原则
- **功能聚焦**: 每个组件只负责一个明确的功能
- **职责清晰**: 组件的作用和边界要明确定义
- **可测试性**: 单一职责使组件更容易测试

### 2. 可复用性原则
- **通用设计**: 组件应该具有通用性，可在不同项目中使用
- **配置灵活**: 通过Props提供灵活的配置选项
- **插槽支持**: 使用插槽提供内容定制能力
- **主题支持**: 使用CSS变量支持主题定制

### 3. 组合优于继承
- **组合模式**: 通过组合小组件构建复杂功能
- **Hooks复用**: 使用Composition API实现逻辑复用
- **插槽组合**: 使用具名插槽和作用域插槽

### 4. 渐进增强原则
- **基础功能**: 提供核心功能
- **可选功能**: 通过Props开启高级功能
- **默认值合理**: Props默认值应该满足常见场景

## 📦 组件目录结构

### 标准组件结构
```
packages/button/
├── __test__/                   # 测试文件
│   └── Button.test.ts         # 组件单元测试
├── src/                        # 源代码
│   ├── Button.vue             # 组件实现
│   └── index.ts               # 组件导出
├── stories/                    # Storybook故事
│   └── Button.stories.ts      # 组件故事
├── package.json                # 包配置
├── rollup.config.js            # 构建配置
├── tsconfig.json               # TypeScript配置
└── README.md                   # 组件文档
```

### 文件命名规范
- **组件文件**: PascalCase.vue (如 `Button.vue`, `DatePicker.vue`)
- **导出文件**: `index.ts`
- **测试文件**: 组件名.test.ts (如 `Button.test.ts`)
- **故事文件**: 组件名.stories.ts (如 `Button.stories.ts`)
- **文档文件**: `README.md`

## 🛠️ 组件开发流程

### 1. 创建组件结构
```bash
# 使用自动生成脚本(推荐)
pnpm gen

# 或手动创建
mkdir -p packages/button/{src,__test__,stories}
cd packages/button
touch package.json tsconfig.json rollup.config.js README.md
touch src/Button.vue src/index.ts
touch __test__/Button.test.ts
touch stories/Button.stories.ts
```

### 2. 实现组件
```vue
<!-- packages/button/src/Button.vue -->
<template>
  <button
    :class="buttonClass"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="aix-button__loading">
      <!-- 加载图标 -->
    </span>
    <span class="aix-button__content">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

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

const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
  disabled: false,
  loading: false,
});

const emit = defineEmits<ButtonEmits>();

const buttonClass = computed(() => [
  'aix-button',
  `aix-button--${props.type}`,
  `aix-button--${props.size}`,
  {
    'aix-button--disabled': props.disabled,
    'aix-button--loading': props.loading,
  },
]);

const handleClick = (event: MouseEvent): void => {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
};
</script>

<style scoped lang="scss">
.aix-button {
  display: inline-flex;
  align-items: center;
  gap: var(--buttonGap);
  padding: var(--buttonPadding);
  // ... 更多样式
}
</style>
```

### 3. 导出组件
```typescript
// packages/button/src/index.ts
import type { App } from 'vue';
import Button from './Button.vue';

// 命名导出
export { Button };

// 导出类型
export type { ButtonProps, ButtonEmits } from './Button.vue';

// 默认导出Vue插件
export default {
  install(app: App) {
    app.component('AixButton', Button);
  },
};
```

### 4. 配置包文件
```json
// packages/button/package.json
{
  "name": "@aix/button",
  "version": "0.0.1",
  "description": "Aix Button Component",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./dist/style.css": "./dist/style.css"
  },
  "files": ["dist"],
  "scripts": {
    "dev": "rollup -c -w",
    "build": "rollup -c && vue-tsc --declaration --emitDeclarationOnly",
    "clean": "rimraf dist",
    "test": "vitest"
  },
  "peerDependencies": {
    "vue": "^3.5.22"
  },
  "devDependencies": {
    "@aix/theme": "workspace:*"
  }
}
```

```javascript
// packages/button/rollup.config.js
import { createRollupConfig } from '../../rollup.config.js';

export default createRollupConfig(import.meta.dirname);
```

## 📖 Storybook故事编写

### 基础Story结构
```typescript
// packages/button/stories/Button.stories.ts
import type { Meta, StoryObj } from '@storybook/vue3';
import Button from '../src/Button.vue';

const meta = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['primary', 'default', 'dashed', 'text', 'link'],
      description: '按钮类型',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'default' },
      },
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
      description: '按钮尺寸',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'medium' },
      },
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    loading: {
      control: 'boolean',
      description: '是否加载中',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    onClick: {
      action: 'clicked',
      description: '点击事件',
      table: {
        type: { summary: '(event: MouseEvent) => void' },
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 默认按钮
 */
export const Default: Story = {
  args: {
    type: 'default',
  },
  render: (args) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Default Button</Button>',
  }),
};

/**
 * 主要按钮
 */
export const Primary: Story = {
  args: {
    type: 'primary',
  },
  render: (args) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Primary Button</Button>',
  }),
};

/**
 * 不同尺寸
 */
export const Sizes: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 12px; align-items: center;">
        <Button type="primary" size="small">Small</Button>
        <Button type="primary" size="medium">Medium</Button>
        <Button type="primary" size="large">Large</Button>
      </div>
    `,
  }),
};

/**
 * 禁用状态
 */
export const Disabled: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 12px;">
        <Button type="primary" disabled>Primary</Button>
        <Button type="default" disabled>Default</Button>
        <Button type="text" disabled>Text</Button>
      </div>
    `,
  }),
};

/**
 * 加载状态
 */
export const Loading: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 12px;">
        <Button type="primary" loading>Loading</Button>
        <Button type="default" loading>Loading</Button>
      </div>
    `,
  }),
};
```

### Story编写最佳实践

#### 1. argTypes完整性
```typescript
argTypes: {
  // ✅ 正确：完整的argTypes定义
  type: {
    control: 'select',              // 控件类型
    options: ['primary', 'default'], // 可选值
    description: '按钮类型',         // 描述
    table: {
      type: { summary: 'string' },  // 类型总结
      defaultValue: { summary: 'default' }, // 默认值
    },
  },

  // ❌ 错误：缺少描述和table信息
  size: {
    control: 'select',
    options: ['small', 'medium', 'large'],
  },
}
```

#### 2. Story覆盖全面
```typescript
// ✅ 正确：覆盖所有主要场景
export const AllTypes: Story = {...};      // 所有类型
export const AllSizes: Story = {...};      // 所有尺寸
export const Disabled: Story = {...};      // 禁用状态
export const Loading: Story = {...};       // 加载状态
export const WithIcon: Story = {...};      // 带图标
export const LongText: Story = {...};      // 长文本

// ❌ 错误：只有单一Story
export const Primary: Story = {...};
```

#### 3. 交互式Story
```typescript
// ✅ 使用play函数添加交互测试
export const Clickable: Story = {
  render: () => ({
    components: { Button },
    template: '<Button type="primary">Click Me</Button>',
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button');

    await userEvent.click(button);
    await expect(button).toHaveFocus();
  },
};
```

## 📝 组件文档编写

### README.md模板
```markdown
# Button 按钮

按钮用于触发一个操作，如提交表单、删除数据等。

## 基本用法

\`\`\`vue
<template>
  <aix-button type="primary">Primary Button</aix-button>
  <aix-button type="default">Default Button</aix-button>
</template>
\`\`\`

## 按钮类型

支持 `primary`、`default`、`dashed`、`text`、`link` 五种类型。

\`\`\`vue
<template>
  <aix-button type="primary">Primary</aix-button>
  <aix-button type="default">Default</aix-button>
  <aix-button type="dashed">Dashed</aix-button>
  <aix-button type="text">Text</aix-button>
  <aix-button type="link">Link</aix-button>
</template>
\`\`\`

## 按钮尺寸

支持 `small`、`medium`、`large` 三种尺寸。

\`\`\`vue
<template>
  <aix-button size="small">Small</aix-button>
  <aix-button size="medium">Medium</aix-button>
  <aix-button size="large">Large</aix-button>
</template>
\`\`\`

## 禁用状态

\`\`\`vue
<template>
  <aix-button disabled>Disabled Button</aix-button>
</template>
\`\`\`

## 加载状态

\`\`\`vue
<template>
  <aix-button loading>Loading...</aix-button>
</template>
\`\`\`

## API

### Props

| 属性名 | 说明 | 类型 | 默认值 |
|--------|------|------|--------|
| type | 按钮类型 | `'primary' \| 'default' \| 'dashed' \| 'text' \| 'link'` | `'default'` |
| size | 按钮尺寸 | `'small' \| 'medium' \| 'large'` | `'medium'` |
| disabled | 是否禁用 | `boolean` | `false` |
| loading | 是否加载中 | `boolean` | `false` |

### Events

| 事件名 | 说明 | 参数 |
|--------|------|------|
| click | 点击按钮时触发 | `(event: MouseEvent) => void` |

### Slots

| 插槽名 | 说明 |
|--------|------|
| default | 按钮内容 |

## 主题定制

可以通过CSS变量定制按钮样式：

\`\`\`css
:root {
  --buttonPrimaryBg: #1890ff;
  --buttonPrimaryBgHover: #40a9ff;
  --buttonPrimaryColor: #ffffff;
  /* 更多变量... */
}
\`\`\`

## 无障碍性

- 使用原生 `<button>` 标签
- 支持键盘导航（Tab、Enter）
- 禁用状态正确设置 `disabled` 属性
```

### 文档检查清单
- [ ] 基本用法示例
- [ ] 所有Props的使用示例
- [ ] API表格（Props、Events、Slots）
- [ ] 主题定制说明
- [ ] 无障碍性说明

## 🎨 组件样式开发

### 使用CSS变量
```scss
.aix-button {
  // ✅ 正确：所有样式值使用CSS变量
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

    &:hover:not(.aix-button--disabled) {
      background-color: var(--buttonPrimaryBgHover);
      border-color: var(--buttonPrimaryBorderHover);
    }
  }

  // ❌ 错误：硬编码样式值
  &--wrong {
    background-color: #1890ff;
    padding: 4px 15px;
  }
}
```

### BEM命名规范
```scss
// ✅ 正确：遵循BEM命名
.aix-button {
  // Block

  &__loading {
    // Element: Block__Element
  }

  &__loading-icon {
    // Element: Block__Element
  }

  &__content {
    // Element: Block__Element
  }

  &--primary {
    // Modifier: Block--Modifier
  }

  &--disabled {
    // Modifier: Block--Modifier
  }

  &--small {
    // Modifier: Block--Modifier
  }
}

// ❌ 错误：不遵循BEM
.button-primary-disabled {
  // 应该是 .aix-button.aix-button--primary.aix-button--disabled
}
```

### 样式隔离
```vue
<style scoped lang="scss">
// ✅ 使用scoped隔离样式
.aix-button {
  // 组件样式
}
</style>

<!-- ❌ 错误：不使用scoped -->
<style lang="scss">
.button {
  // 可能污染全局样式
}
</style>
```

## 🧪 组件测试开发

### 基础测试结构
```typescript
// packages/button/__test__/Button.test.ts
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../src';

describe('Button 组件', () => {
  describe('渲染测试', () => {
    it('应该正确渲染默认按钮', () => {
      const wrapper = mount(Button, {
        slots: {
          default: '点击我',
        },
      });

      expect(wrapper.text()).toBe('点击我');
      expect(wrapper.classes()).toContain('aix-button');
      expect(wrapper.classes()).toContain('aix-button--default');
    });
  });

  describe('Props测试', () => {
    it('应该支持 type 属性', () => {
      const wrapper = mount(Button, {
        props: { type: 'primary' },
      });

      expect(wrapper.classes()).toContain('aix-button--primary');
    });

    it('应该支持 disabled 属性', () => {
      const wrapper = mount(Button, {
        props: { disabled: true },
      });

      expect(wrapper.classes()).toContain('aix-button--disabled');
      expect(wrapper.attributes('disabled')).toBeDefined();
    });
  });

  describe('事件测试', () => {
    it('应该正确触发 click 事件', async () => {
      const onClick = vi.fn();
      const wrapper = mount(Button, {
        attrs: {
          onClick,
        },
      });

      await wrapper.trigger('click');
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('禁用状态下不应触发 click 事件', async () => {
      const onClick = vi.fn();
      const wrapper = mount(Button, {
        props: { disabled: true },
        attrs: {
          onClick,
        },
      });

      await wrapper.trigger('click');
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
```

## 📋 组件开发检查清单

### 代码实现
- [ ] Props接口定义完整，包含JSDoc注释
- [ ] Emits接口定义完整
- [ ] 提供合理的默认值
- [ ] 使用TypeScript严格类型
- [ ] 样式使用CSS变量
- [ ] 遵循BEM命名规范
- [ ] 使用scoped样式隔离

### 导出配置
- [ ] 提供命名导出（`export { Button }`）
- [ ] 提供类型导出（`export type { ButtonProps }`）
- [ ] 提供install方法
- [ ] 全局组件名使用Aix前缀
- [ ] package.json配置正确
- [ ] rollup.config.js配置正确

### Storybook故事
- [ ] 创建stories文件
- [ ] Meta配置完整（title、component、tags）
- [ ] argTypes文档完整
- [ ] 覆盖所有主要状态
- [ ] 提供交互式示例
- [ ] 使用autodocs标签

### 组件文档
- [ ] 创建README.md
- [ ] 基本用法示例
- [ ] Props、Events、Slots API表格
- [ ] 主题定制说明
- [ ] 无障碍性说明

### 测试覆盖
- [ ] 创建测试文件
- [ ] 渲染测试
- [ ] Props测试（所有Props）
- [ ] 事件测试（所有Events）
- [ ] 插槽测试（所有Slots）
- [ ] 状态组合测试
- [ ] 无障碍性测试

### 无障碍性
- [ ] 使用语义化HTML标签
- [ ] 添加必要的ARIA属性
- [ ] 支持键盘导航
- [ ] 正确的焦点管理
- [ ] 禁用状态处理

## 🚀 组件开发工作流

### 1. 开发阶段
```bash
# 启动开发模式（自动编译）
cd packages/button
pnpm dev

# 启动Storybook
pnpm preview
```

### 2. 测试阶段
```bash
# 运行测试
pnpm test

# 运行测试UI
pnpm test:ui

# 运行测试覆盖率
pnpm test:coverage
```

### 3. 构建阶段
```bash
# 构建组件
pnpm build

# 类型检查
pnpm type-check

# 代码检查
pnpm lint
```

### 4. 文档阶段
```bash
# 编写README.md
# 编写Storybook stories
# 生成API文档

# 构建Storybook静态站点
pnpm build:storybook
```

## 💡 最佳实践

### 1. Props设计
- 提供合理的默认值
- 使用字面量类型而不是string
- 布尔Props以is、has、show开头
- 避免过多的Props（<10个）

### 2. 事件设计
- 事件名使用小写和连字符
- v-model使用`update:modelValue`
- 提供事件参数类型定义

### 3. 插槽设计
- 提供默认插槽
- 使用作用域插槽传递数据
- 文档说明插槽用途

### 4. 样式设计
- 所有样式值使用CSS变量
- 遵循BEM命名规范
- 使用scoped隔离样式
- 提供主题定制能力

### 5. 无障碍性
- 使用语义化标签
- 添加ARIA属性
- 支持键盘导航
- 测试屏幕阅读器兼容性

通过遵循这些组件开发规范，可以创建出高质量、易用、可维护的Vue组件库。
