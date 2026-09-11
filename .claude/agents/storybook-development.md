---
name: storybook-development
description: Storybook 开发指导，包括 Story 编写、Controls 配置、文档生成和最佳实践
tools: Read, Grep, Glob
model: inherit
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
├── .storybook/                  # Storybook 全局配置（只有这三个文件）
│   ├── main.ts                 # 框架 / addons / vite（含 workspace 源码别名与 dev proxy）
│   ├── preview.ts              # 全局 locale + theme context、工具栏同步
│   └── vitest.setup.ts         # addon-vitest 的 setup，story play 在浏览器里跑时用
├── packages/
│   ├── button/stories/Button.stories.ts
│   ├── ai-chat/stories/         # 38 个 story，本仓最完整的参考
│   └── theme/src/vars/index.css # 主题 CSS 变量，被 preview.ts 全局引入
└── package.json
```

> stories glob 是 `../packages/**/*.stories.@(js|jsx|ts|tsx|mdx)`——**任意深度**，
> 不限于 `packages/*/stories/`。

### Storybook 配置文件

> ⚠️ 本仓是 **Storybook 10.5**。网上大量 SB6/7 教程里的
> `addon-essentials` / `addon-interactions` / `docs: { autodocs: 'tag' }` /
> `parameters.actions.argTypesRegex` **在本版本均已移除**，照抄会直接报错或静默失效。
> 配置以 `.storybook/main.ts` 和 `.storybook/preview.ts` 实际内容为准，下面只讲要点。

#### `.storybook/main.ts` 要点

| 项 | 本仓实际值 |
|----|-----------|
| framework | `@storybook/vue3-vite`，且 `options.docgen: false` |
| addons | `addon-links`、`addon-docs`、`addon-vitest`（**仅此三个**）|
| stories glob | `../packages/**/*.stories.@(js\|jsx\|ts\|tsx\|mdx)` |
| workspace 别名 | `createWorkspaceAlias()` 把 `@aix/*` 指向**源码**而非构建产物，保证热更新 |
| dev proxy | `/proxy-dify`、`/proxy-deepseek`，密钥在 proxy 侧注入，不进前端 bundle |

没有 `addon-a11y`。无障碍检查走 [accessibility](accessibility.md) agent 与
`/a11y-checker` skill，不要在 story 里写 `parameters.a11y` 期待它生效。

#### `.storybook/preview.ts` 要点

preview 通过 `setup()` 安装了两个**全局 context**，story 里直接可用，不需要自己再包 provider：

```typescript
import { createLocale } from '../packages/hooks/src';
import { createTheme } from '../packages/theme/src';
import '../packages/theme/src/vars/index.css';   // 主题 CSS 变量，全局注入

const { localeContext, install: installLocale } = createLocale('zh-CN');
const { themeContext, install: installTheme } = createTheme({
  initialMode: 'light', persist: true, watchSystem: false,
});
setup((app) => { app.use({ install: installLocale }); app.use({ install: installTheme }); });
```

decorator 会把 Storybook 工具栏的 `globals.locale` / `globals.theme` 同步到这两个
context，所以**切换工具栏即可验证多语言与暗色主题**——这是本仓 story 最该覆盖的两个维度。

> 类型从 `@storybook/vue3-vite` 导入（`Preview`、`setup`）；story 文件里的
> `Meta` / `StoryObj` 从 `@storybook/vue3` 导入。

---

## ✍️ Story 编写规范

### 1. 基本结构

```typescript
// packages/button/stories/Button.stories.ts
import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';        // SB10 路径，不是 '@storybook/test'
import Button from '../src/Button.vue';     // 直接指向 SFC，避免过包入口

// Meta 配置
const meta: Meta<typeof Button> = {
  title: 'Components/Button',       // 分组/组件名，命名见下方说明
  component: Button,
  tags: ['autodocs'],               // 自动生成文档（SB8+ 就是打在 meta 上的 tag，
                                    // 不再是 main.ts 里的 docs.autodocs）
  parameters: {
    docs: { description: { component: 'AIX Button 组件……' } },
  },
  args: {
    onClick: fn(),                  // 用 fn() spy；argTypesRegex 在 SB8 已移除
  },
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
      description: '点击事件',       // spy 在上面的 args 里用 fn() 提供
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

## 🔧 插件与全局能力

本仓只装了 `addon-links` / `addon-docs` / `addon-vitest` 三个 addon。
SB6/7 时代的 `addon-essentials`（Actions / Viewport / Backgrounds 打包在内）
与 `addon-a11y` **都没装**，对应写法一律不生效：

| 想做的事 | ❌ 过时写法 | ✅ 本仓做法 |
|---------|-----------|-----------|
| 记录事件 | `argTypes: { onClick: { action: 'clicked' } }` | `args: { onClick: fn() }`（`from 'storybook/test'`）|
| 自动绑定所有 on* | `parameters.actions.argTypesRegex` | SB8 已移除，逐个用 `fn()` |
| 切换语言 | 自己包 provider | 工具栏 locale 下拉（preview.ts 已接 `createLocale`）|
| 切换主题 | `parameters.backgrounds` | 工具栏 theme 下拉（preview.ts 已接 `createTheme`）|
| 响应式验证 | `parameters.viewport` | 浏览器窗口，或 `@kit/visual-testing` 的响应式探测 |
| 无障碍检查 | `parameters.a11y` | [accessibility](accessibility.md) agent / `/a11y-checker` skill |

### 交互测试（addon-vitest）

`addon-vitest` 让 story 的 `play` 函数在**真实 Chromium**里跑（根 `vitest.config.ts` 的
`storybook` project，playwright browser mode，`testTimeout: 60_000`）：

```typescript
import { expect, userEvent, waitFor } from 'storybook/test';

export const Interaction: Story = {
  play: async ({ canvas, step }) => {
    await step('点击提交', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '提交' }));
      await waitFor(() => expect(canvas.getByText('已提交')).toBeInTheDocument());
    });
  },
};
```

```bash
pnpm test:stories    # 只跑 story 交互测试（--project storybook）
pnpm test:unit       # 只跑单测（--project '!storybook'）
pnpm test            # turbo 编排的包级测试，不含 storybook project
```

> `play` 里的异步时序坑不少（滚动容器禁指针、监听器装配晚于首帧、ResizeObserver
> 合帧）。写不稳的交互测试前先看 `packages/ai-chat/stories/` 里的真实用例。

## 🎯 最佳实践

### 1. Story 命名规范

#### `meta.title` 的分组

侧边栏结构完全由 `title` 决定。本仓现有 52 个 story 的实际分布：

| 前缀 | 数量 | 用于 |
|------|------|------|
| `AI Chat/…` | 38 | ai-chat。多数再分一层：`组件`(20) / `场景演示`(13) / `调试工具`(2)，另有 3 个直挂 `AI Chat/<名称>` |
| `Components/<名称>` | 10 | 通用组件（Popper 再套一层 `Components/Popper/<名称>`）|
| `Media/<名称>` | 3 | audio / subtitle / video |
| `Button`（无前缀） | 1 | **历史遗留，不要跟随** |

新增 story 挑一个已有顶层分组挂进去，不要发明新前缀，也不要像 Button 那样裸挂在根。
组件数量多的包（如 ai-chat）可以再加一层子分组。

```typescript
// ✅ 正确
title: 'Components/Select'
title: 'Components/Popper/Tooltip'
title: 'AI Chat/组件/ModelSelector'

// ❌ 错误
title: 'Select'              // 裸挂根部，侧边栏会散
title: '组件/Select'          // 自造前缀，和现有分组对不上
```

#### 导出名

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

顶层分组用**已有的那四个**（见上文 `meta.title` 分组表），不要新造：

```typescript
title: 'Components/Select'            // 通用组件
title: 'Components/Popper/Tooltip'    // 同一包内多组件，再套一层包名
title: 'Media/VideoPlayer'            // 音视频
title: 'AI Chat/组件/Bubble'          // ai-chat 的子组件
title: 'AI Chat/场景演示/工具调用'     // ai-chat 的场景演示
```

同一个包里既有"组件"又有"完整场景演示"时，按 ai-chat 的做法再分一层子分组
（`组件` / `场景演示` / `调试工具`），而不是新开一个顶层前缀。

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

## 🧪 视觉测试与还原度校验

Chromatic **没有接入**（`pnpm chromatic` 不存在）。本仓用自研的 `@kit/visual-testing`，
两条独立流程：

| 流程 | 命令 | 基线 | 回答的问题 |
|------|------|------|-----------|
| **视觉回归** | `visual-test test` | 上一次截图 | 什么变了 |
| **设计还原度** | `visual-test fidelity` | Figma 节点树 + 位图 | 离设计差在哪个属性 |

它从 Storybook 的 `/index.json` **自动发现所有 story**，不需要逐个配置测试目标——
这意味着 story 写得全，视觉覆盖就自动跟上。`fidelity` 输出的是「选择器 + 期望值 +
实际值」的结构化差异清单，专门给 AI 自检回路消费（读报告 → 改代码 → 重跑）。

它还带两项静态比对覆盖不到的探测：

- **响应式健壮性**：在更窄视口重新测量，抓写死宽度、横向溢出、内容裁切
- **交互反馈**：真实 hover 每个可交互元素，报告 hover 后毫无视觉变化的

详见 `kit/visual-testing/README.md`；实现在 `kit/visual-testing/src/core/fidelity/`。
（该 README 里指向的 `docs/fidelity-architecture.md` 目前是空的，别照它找。）

> 组件级的交互断言不要用独立 Playwright 脚本去访问 6006 端口——用 story 的 `play`
> 函数，由 `addon-vitest` 在真实浏览器里跑（见上文「交互测试」）。

---

## 📋 Story 编写清单

### 必需的 Stories

- [ ] **Default** - 默认状态
- [ ] **主要 Props 变体** - type / size / variant 等枚举的全覆盖
- [ ] **状态变体** - disabled / loading / error / empty
- [ ] **Slots 用法** - 默认插槽 + 具名插槽

### 建议补充

- [ ] **暗色主题** - 工具栏切 theme 验证，不要只在亮色下看
- [ ] **多语言** - 工具栏切 locale 验证，尤其是文案变长后的布局
- [ ] **交互测试** - 关键链路用 `play` 覆盖
- [ ] **边界数据** - 超长文本、空数据、大量数据

### 文档要求

- [ ] `meta.parameters.docs.description.component` 写清组件用途
- [ ] 每个 Prop / Event 在 `argTypes` 里有 `description`
- [ ] 枚举型 Prop 在 `argTypes.table.defaultValue` 标出默认值

---

## 🚀 运行 Storybook

```bash
pnpm storybook:dev              # 开发模式，端口 6006
pnpm storybook:build            # 构建静态站点 → dist/storybook
pnpm storybook:preview          # 本地预览构建产物（npx serve dist/storybook -p 6006）

pnpm test:stories               # 跑 story 的 play 交互测试
pnpm build:docs-all             # storybook:build + docs:build，一次出全部文档产物
```

> 产物目录是 **`dist/storybook`**（由 `--output-dir` 指定），不是 Storybook 默认的
> `storybook-static`。

### 部署

由 `.github/workflows/deploy-docs.yml` 负责，不要手动 `vercel` / `netlify` 推。
GitHub Pages 场景需要 `/aix` 前缀，`main.ts` 通过 `DEPLOY_TARGET=github` 环境变量
切换 `base`。

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
