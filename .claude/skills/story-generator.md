---
name: story-generator
description: 为组件生成 Storybook story，自动分析 Props 生成常用场景和交互测试
---

# Story 生成器 Skill

## 功能概述

根据组件的 Props/Emits 定义，自动生成 Storybook story 文件，包括：
- 基础 story 配置
- Props 控制器（argTypes）
- 常用场景 story
- 交互测试 story

## 使用方式

```bash
# 方式 1: 为现有组件生成 story
/story-generator packages/button/src/Button.vue

# 方式 2: 生成完整的 story（包含交互测试）
/story-generator packages/select/src/Select.vue --with-interaction

# 方式 3: 交互式模式
/story-generator
```

### 参数说明

| 参数 | 说明 | 默认值 | 示例 |
|------|------|-------|------|
| 组件路径 | 组件文件路径 | 必需 | `packages/button/src/Button.vue` |
| `--with-interaction` | 是否生成交互测试 | `false` | `--with-interaction` |

## 执行流程

### 步骤 1: 读取组件文件

使用 Read 工具读取组件文件，提取：
- Props 定义（类型、默认值、说明）
- Emits 定义
- Slots 定义

### 步骤 2: 分析 Props 类型

根据 Props 类型生成对应的控制器：

```typescript
// string → text 控制器
name?: string;
// argTypes: { name: { control: 'text' } }

// boolean → boolean 控制器
disabled?: boolean;
// argTypes: { disabled: { control: 'boolean' } }

// 联合类型 → select 控制器
type?: 'primary' | 'default' | 'danger';
// argTypes: { type: { control: 'select', options: ['primary', 'default', 'danger'] } }

// number → number 控制器
maxCount?: number;
// argTypes: { maxCount: { control: 'number' } }
```

### 步骤 3: 生成 Story 文件

创建 `stories/{ComponentName}.stories.ts` 文件：

```typescript
import type { Meta, StoryObj } from '@storybook/vue3';
import Button from '../src/Button.vue';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['primary', 'default', 'danger'],
      description: '按钮类型',
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
      description: '按钮尺寸',
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
    },
    onClick: {
      action: 'clicked',
      description: '点击事件',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

// 基础故事
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

// 状态故事
export const Disabled: Story = {
  args: {
    disabled: true,
  },
  render: (args) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Disabled Button</Button>',
  }),
};

// 尺寸对比故事
export const Sizes: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 16px; align-items: center;">
        <Button size="small">Small</Button>
        <Button size="medium">Medium</Button>
        <Button size="large">Large</Button>
      </div>
    `,
  }),
};

// 类型对比故事
export const Types: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 16px; align-items: center;">
        <Button type="default">Default</Button>
        <Button type="primary">Primary</Button>
        <Button type="danger">Danger</Button>
      </div>
    `,
  }),
};
```

### 步骤 4: 生成交互测试（可选）

如果使用 `--with-interaction`，添加交互测试：

```typescript
import { within, userEvent, expect } from '@storybook/test';

export const WithInteraction: Story = {
  args: {
    type: 'primary',
  },
  render: (args) => ({
    components: { Button },
    setup() {
      const handleClick = () => {
        console.log('Button clicked');
      };
      return { args, handleClick };
    },
    template: '<Button v-bind="args" @click="handleClick">Click Me</Button>',
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button');

    // 点击测试
    await userEvent.click(button);
    await expect(button).toBeVisible();

    // 禁用状态测试
    if (!button.disabled) {
      await userEvent.click(button);
    }
  },
};
```

### 步骤 5: 更新或创建 stories 目录

如果 stories 目录不存在，创建它：

```bash
mkdir -p packages/{package-name}/stories
```

### 步骤 6: 展示结果

```
✅ Story 生成成功！

📁 生成的文件:
   - packages/{package}/stories/{ComponentName}.stories.ts

📊 包含的 Story:
   - Default (默认状态)
   - Primary (主要类型)
   - Disabled (禁用状态)
   - Sizes (尺寸对比)
   - Types (类型对比)
   - WithInteraction (交互测试) *可选

💡 下一步:
   1. 运行 Storybook: pnpm storybook:dev
   2. 查看组件文档: http://localhost:6006
   3. 测试交互行为
```

## Story 生成策略

### 1. 基础 Story

为每个主要的 Props 值生成一个 story：
- 默认值 story
- 主要状态 story（如 primary, danger）
- 禁用状态 story

### 2. 对比 Story

如果 Props 有多个可选值，生成对比 story：
- Sizes story（尺寸对比）
- Types story（类型对比）
- Variants story（变体对比）

### 3. 组合 Story

复杂组件可能需要多个 Props 组合：
```typescript
export const ComplexExample: Story = {
  args: {
    type: 'primary',
    size: 'large',
    disabled: false,
    icon: 'search',
  },
  render: (args) => ({
    components: { Component },
    setup() {
      return { args };
    },
    template: '<Component v-bind="args">Complex Example</Component>',
  }),
};
```

## 遵守的规范

### 1. Story 命名规范

- 使用 PascalCase: `Primary`, `Default`, `Disabled`
- 描述性名称: `WithIcon`, `WithLongText`
- 对比类名称: `Sizes`, `Types`, `Variants`

### 2. Story 组织

```typescript
// 1. Meta 配置
const meta: Meta<typeof Component> = { ... };

// 2. 基础 stories（最常用的）
export const Default: Story = { ... };
export const Primary: Story = { ... };

// 3. 状态 stories
export const Disabled: Story = { ... };
export const Loading: Story = { ... };

// 4. 对比 stories
export const Sizes: Story = { ... };
export const Types: Story = { ... };

// 5. 复杂场景 stories
export const ComplexExample: Story = { ... };

// 6. 交互测试 stories
export const WithInteraction: Story = { ... };
```

### 3. ArgTypes 配置

```typescript
argTypes: {
  // Props
  type: {
    control: 'select',
    options: [...],
    description: 'Props 说明',
  },

  // Events
  onClick: {
    action: 'clicked',
    description: 'Event 说明',
  },

  // Slots
  default: {
    control: 'text',
    description: 'Slot 说明',
  },
}
```

## 示例

### 为 Button 组件生成 Story

```bash
# 1. 生成 Story
/story-generator packages/button/src/Button.vue --with-interaction

# 2. 运行 Storybook
pnpm storybook:dev

# 3. 查看结果
# 访问 http://localhost:6006
```

## 相关文档

- [storybook-development.md](../agents/storybook-development.md) - Storybook 开发指导
- [component-design.md](../agents/component-design.md) - 组件设计规范
- [testing.md](../agents/testing.md) - 测试策略
