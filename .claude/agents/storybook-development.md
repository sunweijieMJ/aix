---
name: storybook-development
description: Storybook 开发指导，包括 Story 编写、Controls 配置、文档生成和最佳实践
---

# Storybook 开发指导

## 职责

指导 Vue 组件库的 Storybook 开发，包括 Story 编写规范、Controls 配置、文档生成和视觉测试。

> **通用规范参考**: 编码规范详见 [coding-standards.md](coding-standards.md)

## 🎯 Storybook 的作用

### 1. 组件展示
- **可视化开发**: 独立开发和调试组件
- **实时预览**: 即时查看 Props 变化效果
- **状态展示**: 展示组件的所有状态和变体

### 2. 组件文档
- **API 文档**: 自动生成 Props/Emits/Slots 文档
- **使用示例**: 提供真实的使用案例
- **交互文档**: 通过 Controls 动态调整参数

### 3. 视觉测试
- **视觉回归**: 检测 UI 变化
- **多设备预览**: 响应式设计验证
- **无障碍测试**: 可访问性检查

---

## 📁 Storybook 项目结构

### Monorepo 结构

```
aix/
├── .storybook/               # Storybook 全局配置
│   ├── main.ts              # 主配置
│   ├── preview.ts           # 预览配置
│   └── theme.ts             # 自定义主题
├── packages/
│   ├── button/
│   │   └── stories/
│   │       └── Button.stories.ts
│   ├── select/
│   │   └── stories/
│   │       └── Select.stories.ts
│   └── theme/
│       └── src/
│           └── index.css    # 主题样式
└── package.json
```

### Storybook 配置文件

#### .storybook/main.ts

```typescript
import type { StorybookConfig } from '@storybook/vue3-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  // Stories 文件位置
  stories: ['../packages/*/stories/**/*.stories.@(js|jsx|mjs|ts|tsx)'],

  // 插件
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-links',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
  ],

  // 框架
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },

  // Vite 配置
  async viteFinal(config) {
    return mergeConfig(config, {
      resolve: {
        alias: {
          '@aix/theme': '../packages/theme/src',
        },
      },
    });
  },

  docs: {
    autodocs: 'tag',
  },
};

export default config;
```

#### .storybook/preview.ts

```typescript
import type { Preview } from '@storybook/vue3';
import '@aix/theme'; // 导入主题样式

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    viewport: {
      viewports: {
        mobile: {
          name: 'Mobile',
          styles: { width: '375px', height: '667px' },
        },
        tablet: {
          name: 'Tablet',
          styles: { width: '768px', height: '1024px' },
        },
        desktop: {
          name: 'Desktop',
          styles: { width: '1440px', height: '900px' },
        },
      },
    },
  },

  // 全局装饰器
  decorators: [
    (story) => ({
      components: { story },
      template: '<div style="padding: 20px;"><story /></div>',
    }),
  ],
};

export default preview;
```

---

## ✍️ Story 编写规范

### 1. 基本结构

```typescript
// packages/button/stories/Button.stories.ts
import type { Meta, StoryObj } from '@storybook/vue3';
import { Button } from '../src';

// Meta 配置
const meta: Meta<typeof Button> = {
  title: 'Components/Button',        // Storybook 中的路径
  component: Button,                 // 组件
  tags: ['autodocs'],               // 自动生成文档
  argTypes: {                       // 参数配置
    type: {
      control: 'select',
      options: ['primary', 'default', 'danger'],
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

// 默认 Story
export const Default: Story = {
  args: {
    type: 'default',
    size: 'medium',
    disabled: false,
  },
  render: (args) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Button</Button>',
  }),
};
```

### 2. Story 类型

#### A. 单一状态 Story

```typescript
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
```

#### B. 多状态对比 Story

```typescript
export const Types: Story = {
  render: () => ({
    components: { Button },
    template: `
      <div style="display: flex; gap: 16px;">
        <Button type="default">Default</Button>
        <Button type="primary">Primary</Button>
        <Button type="danger">Danger</Button>
      </div>
    `,
  }),
};

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
```

#### C. 交互 Story

```typescript
export const WithClick: Story = {
  render: (args) => ({
    components: { Button },
    setup() {
      const handleClick = () => {
        alert('Button clicked!');
      };
      return { args, handleClick };
    },
    template: '<Button v-bind="args" @click="handleClick">Click Me</Button>',
  }),
};
```

#### D. 复杂场景 Story

```typescript
export const FormExample: Story = {
  render: () => ({
    components: { Button },
    setup() {
      const handleSubmit = () => {
        console.log('Form submitted');
      };
      const handleCancel = () => {
        console.log('Form cancelled');
      };
      return { handleSubmit, handleCancel };
    },
    template: `
      <div style="display: flex; gap: 16px;">
        <Button type="primary" @click="handleSubmit">提交</Button>
        <Button type="default" @click="handleCancel">取消</Button>
      </div>
    `,
  }),
};
```

---

## 🎮 Controls 配置

### 1. Control 类型

#### 文本类型

```typescript
argTypes: {
  label: {
    control: 'text',
    description: '按钮文本',
  },
}
```

#### 数字类型

```typescript
argTypes: {
  max: {
    control: { type: 'number', min: 0, max: 100, step: 1 },
    description: '最大值',
  },
}
```

#### 布尔类型

```typescript
argTypes: {
  disabled: {
    control: 'boolean',
    description: '是否禁用',
  },
}
```

#### 选择类型

```typescript
argTypes: {
  type: {
    control: 'select',
    options: ['primary', 'default', 'danger'],
    description: '按钮类型',
  },
}
```

#### 单选类型

```typescript
argTypes: {
  size: {
    control: 'radio',
    options: ['small', 'medium', 'large'],
    description: '尺寸',
  },
}
```

#### 多选类型

```typescript
argTypes: {
  features: {
    control: 'check',
    options: ['sortable', 'filterable', 'searchable'],
    description: '功能特性',
  },
}
```

#### 颜色选择

```typescript
argTypes: {
  color: {
    control: 'color',
    description: '颜色',
  },
}
```

#### 日期选择

```typescript
argTypes: {
  date: {
    control: 'date',
    description: '日期',
  },
}
```

#### 对象类型

```typescript
argTypes: {
  style: {
    control: 'object',
    description: '自定义样式',
  },
}
```

### 2. 禁用 Control

```typescript
argTypes: {
  // 隐藏不需要的 control
  internalState: {
    table: {
      disable: true,
    },
  },

  // 只读 control
  id: {
    control: false,
    description: '组件 ID (只读)',
  },
}
```

---

## 📖 文档配置

### 1. 自动文档生成

```typescript
const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],  // 启用自动文档
  parameters: {
    docs: {
      description: {
        component: '按钮组件，支持多种类型和尺寸。',
      },
    },
  },
};
```

### 2. Story 描述

```typescript
export const Primary: Story = {
  args: {
    type: 'primary',
  },
  parameters: {
    docs: {
      description: {
        story: '主要按钮，用于主要操作。',
      },
    },
  },
};
```

### 3. 代码示例

```typescript
export const Example: Story = {
  parameters: {
    docs: {
      source: {
        code: `
<template>
  <Button type="primary" @click="handleClick">
    点击我
  </Button>
</template>

<script setup>
const handleClick = () => {
  console.log('Button clicked!');
};
</script>
        `,
      },
    },
  },
};
```

---

## 🎨 复杂组件 Story 示例

### 1. Form 组件

```typescript
// packages/form/stories/Form.stories.ts
import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { Form, FormItem } from '../src';

const meta: Meta<typeof Form> = {
  title: 'Components/Form',
  component: Form,
  tags: ['autodocs'],
  subcomponents: { FormItem },
};

export default meta;
type Story = StoryObj<typeof Form>;

export const Basic: Story = {
  render: () => ({
    components: { Form, FormItem },
    setup() {
      const formData = ref({
        username: '',
        email: '',
      });

      const handleSubmit = () => {
        console.log('Form data:', formData.value);
      };

      return { formData, handleSubmit };
    },
    template: `
      <Form :model="formData" @submit="handleSubmit">
        <FormItem label="用户名" prop="username">
          <input v-model="formData.username" />
        </FormItem>
        <FormItem label="邮箱" prop="email">
          <input v-model="formData.email" type="email" />
        </FormItem>
        <button type="submit">提交</button>
      </Form>
    `,
  }),
};
```

### 2. Table 组件

```typescript
// packages/table/stories/Table.stories.ts
import type { Meta, StoryObj } from '@storybook/vue3';
import { Table } from '../src';

const meta: Meta<typeof Table> = {
  title: 'Components/Table',
  component: Table,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Table>;

const mockData = [
  { id: 1, name: 'Alice', age: 25, city: 'Beijing' },
  { id: 2, name: 'Bob', age: 30, city: 'Shanghai' },
  { id: 3, name: 'Charlie', age: 28, city: 'Guangzhou' },
];

const columns = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: '姓名', width: 120 },
  { key: 'age', title: '年龄', width: 80 },
  { key: 'city', title: '城市', width: 120 },
];

export const Basic: Story = {
  args: {
    data: mockData,
    columns: columns,
  },
};

export const WithPagination: Story = {
  args: {
    data: mockData,
    columns: columns,
    pagination: {
      total: 100,
      pageSize: 10,
      current: 1,
    },
  },
};
```

### 3. Dialog 组件

```typescript
// packages/dialog/stories/Dialog.stories.ts
import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { Dialog } from '../src';

const meta: Meta<typeof Dialog> = {
  title: 'Components/Dialog',
  component: Dialog,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Dialog>;

export const Basic: Story = {
  render: (args) => ({
    components: { Dialog },
    setup() {
      const visible = ref(false);

      const open = () => {
        visible.value = true;
      };

      const close = () => {
        visible.value = false;
      };

      return { args, visible, open, close };
    },
    template: `
      <div>
        <button @click="open">打开对话框</button>
        <Dialog v-bind="args" v-model:visible="visible">
          <template #header>
            <h3>对话框标题</h3>
          </template>
          <p>对话框内容</p>
          <template #footer>
            <button @click="close">取消</button>
            <button @click="close">确定</button>
          </template>
        </Dialog>
      </div>
    `,
  }),
};
```

---

## 🔧 插件使用

### 1. Actions

记录用户交互事件：

```typescript
argTypes: {
  onClick: { action: 'clicked' },
  onChange: { action: 'changed' },
  onSubmit: { action: 'submitted' },
}
```

### 2. Viewport

测试响应式布局：

```typescript
export const Responsive: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile',
    },
  },
};
```

### 3. Accessibility (a11y)

检查可访问性：

```typescript
export const Accessible: Story = {
  parameters: {
    a11y: {
      config: {
        rules: [
          {
            id: 'color-contrast',
            enabled: true,
          },
        ],
      },
    },
  },
};
```

### 4. Backgrounds

测试不同背景：

```typescript
export const OnDarkBackground: Story = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#333' },
        { name: 'light', value: '#fff' },
      ],
    },
  },
};
```

---

## 🎯 最佳实践

### 1. Story 命名规范

```typescript
// ✅ 正确：描述性名称
export const Default: Story = {};
export const Primary: Story = {};
export const Disabled: Story = {};
export const WithIcon: Story = {};
export const SizeComparison: Story = {};

// ❌ 错误：模糊的名称
export const Story1: Story = {};
export const Test: Story = {};
```

### 2. 组织 Stories

```typescript
// 按功能组织
const meta: Meta = {
  title: 'Components/Button',  // 基础组件
};

const meta: Meta = {
  title: 'Form/Button',  // 表单类组件
};

const meta: Meta = {
  title: 'Examples/LoginForm',  // 示例场景
};
```

### 3. 使用参数装饰器

```typescript
// 全局装饰器 (.storybook/preview.ts)
decorators: [
  (story) => ({
    components: { story },
    template: '<div class="story-wrapper"><story /></div>',
  }),
];

// Story 级装饰器
export const Decorated: Story = {
  decorators: [
    () => ({
      template: '<div style="border: 2px solid red;"><story /></div>',
    }),
  ],
};
```

### 4. 复用 Args

```typescript
const defaultArgs = {
  type: 'default',
  size: 'medium',
  disabled: false,
};

export const Default: Story = {
  args: defaultArgs,
};

export const Primary: Story = {
  args: {
    ...defaultArgs,
    type: 'primary',
  },
};
```

---

## 🧪 视觉测试

### 1. Chromatic

```bash
# 安装
pnpm add -D chromatic

# 运行视觉测试
pnpm chromatic --project-token=<token>
```

### 2. Snapshot 测试

```typescript
// packages/button/__tests__/Button.stories.test.ts
import { test } from '@playwright/test';

test('Button story snapshots', async ({ page }) => {
  await page.goto('http://localhost:6006/?path=/story/components-button--default');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('button-default.png');
});
```

---

## 📋 Story 编写清单

### 必需的 Stories

- [ ] Default - 默认状态
- [ ] 所有 Props 变体 - 每个 Props 的不同值
- [ ] States - 不同状态 (hover, active, disabled)
- [ ] Sizes - 所有尺寸对比
- [ ] Types - 所有类型对比

### 可选的 Stories

- [ ] With Icon - 带图标
- [ ] Loading - 加载状态
- [ ] Error - 错误状态
- [ ] Complex Scenario - 复杂场景示例
- [ ] Responsive - 响应式布局

### 文档要求

- [ ] Component description - 组件描述
- [ ] Props documentation - Props 文档
- [ ] Events documentation - 事件文档
- [ ] Slots documentation - 插槽文档
- [ ] Usage examples - 使用示例

---

## 🚀 运行 Storybook

### 开发模式

```bash
# 启动 Storybook
pnpm storybook:dev

# 指定端口
pnpm storybook:dev --port 6007
```

### 构建

```bash
# 构建静态站点
pnpm storybook:build

# 预览构建结果
pnpm http-server storybook-static
```

### 部署

```bash
# 部署到 Vercel
vercel storybook-static

# 部署到 Netlify
netlify deploy --dir=storybook-static
```

---

## 📚 相关文档

- [component-design.md](./component-design.md) - 组件开发规范
- [testing.md](./testing.md) - 测试策略
- [Storybook 官方文档](https://storybook.js.org/docs/vue/get-started/introduction)

---

## 💡 常见问题

### Q1: 如何在 Story 中使用 CSS 变量？

**A:** 在 `.storybook/preview.ts` 中导入主题样式：
```typescript
import '@aix/theme';
```

### Q2: 如何测试组件的不同状态？

**A:** 为每个状态创建独立的 Story：
```typescript
export const Default: Story = { args: { disabled: false } };
export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = { args: { loading: true } };
```

### Q3: 如何在 Story 中使用 Composition API？

**A:** 在 `render` 函数的 `setup` 中使用：
```typescript
render: () => ({
  components: { Button },
  setup() {
    const count = ref(0);
    const increment = () => count.value++;
    return { count, increment };
  },
  template: '<Button @click="increment">{{ count }}</Button>',
});
```

### Q4: 如何组织大型项目的 Stories？

**A:** 使用分类和命名约定：
```
Components/
  ├── Form/
  │   ├── Button
  │   ├── Input
  │   └── Select
  ├── Layout/
  │   ├── Container
  │   └── Grid
  └── Feedback/
      ├── Dialog
      └── Message
```
