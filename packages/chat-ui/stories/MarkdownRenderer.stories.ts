/**
 * @fileoverview MarkdownRenderer Stories
 * 展示 Markdown 渲染器的各种用法
 */

import type { Meta, StoryObj } from '@storybook/vue3';
import { MarkdownRenderer, setup } from '../src';

// 确保初始化
setup({ preset: 'standard' });

const meta: Meta<typeof MarkdownRenderer> = {
  title: 'ChatUI/MarkdownRenderer',
  component: MarkdownRenderer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'MarkdownRenderer 用于渲染 Markdown 内容，支持 GFM (GitHub Flavored Markdown)，包括表格、任务列表、删除线等扩展语法。',
      },
    },
  },
  argTypes: {
    data: {
      control: 'object',
      description: 'Markdown 数据',
      table: {
        type: { summary: 'MarkdownData | string' },
      },
    },
    streaming: {
      control: 'boolean',
      description: '是否正在流式输出',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// 创建 mock block
const createBlock = (id: string) => ({
  id,
  type: 'markdown' as const,
  raw: '',
  status: 'complete' as const,
});

/**
 * 标题
 */
export const Headings: Story = {
  args: {
    block: createBlock('h-1'),
    data: {
      raw: `# 一级标题
## 二级标题
### 三级标题
#### 四级标题
##### 五级标题
###### 六级标题`,
      html: '', // Will be parsed
    },
    streaming: false,
  },
};

/**
 * 文本格式
 */
export const TextFormatting: Story = {
  args: {
    block: createBlock('text-1'),
    data: {
      raw: `**粗体文本** 用于强调重要内容

*斜体文本* 用于术语或引用

~~删除线~~ 表示已删除或过时的内容

\`行内代码\` 用于显示代码片段

**_粗斜体_** 可以组合使用

上标: x<sup>2</sup> + y<sup>2</sup> = z<sup>2</sup>

下标: H<sub>2</sub>O 是水的化学式`,
      html: '',
    },
    streaming: false,
  },
};

/**
 * 列表
 */
export const Lists: Story = {
  args: {
    block: createBlock('list-1'),
    data: {
      raw: `## 无序列表

- 项目 1
- 项目 2
  - 嵌套项目 2.1
  - 嵌套项目 2.2
    - 深层嵌套 2.2.1
- 项目 3

## 有序列表

1. 第一步：准备工作
2. 第二步：执行操作
   1. 子步骤 2.1
   2. 子步骤 2.2
3. 第三步：验证结果

## 任务列表

- [x] 已完成的任务
- [x] 另一个完成的任务
- [ ] 待办任务
- [ ] 未来计划`,
      html: '',
    },
    streaming: false,
  },
};

/**
 * 链接和图片
 */
export const LinksAndImages: Story = {
  args: {
    block: createBlock('link-1'),
    data: {
      raw: `## 链接

[普通链接](https://example.com)

[带标题的链接](https://example.com "鼠标悬停显示")

<https://example.com> 自动链接

[引用链接][ref]

[ref]: https://example.com "引用链接示例"

## 图片

![Vue Logo](https://vuejs.org/logo.svg)

[![可点击的图片](https://vuejs.org/logo.svg)](https://vuejs.org)`,
      html: '',
    },
    streaming: false,
  },
};

/**
 * 引用
 */
export const Blockquotes: Story = {
  args: {
    block: createBlock('quote-1'),
    data: {
      raw: `> 这是一段引用文本。
> 可以跨越多行。
>
> 还可以包含多个段落。

> **注意**: 引用中可以使用 *Markdown* 格式
>
> - 列表项 1
> - 列表项 2

> 嵌套引用
> > 这是第二层引用
> > > 这是第三层引用`,
      html: '',
    },
    streaming: false,
  },
};

/**
 * 表格
 */
export const Tables: Story = {
  args: {
    block: createBlock('table-1'),
    data: {
      raw: `## 基础表格

| 功能 | 描述 | 状态 |
|------|------|------|
| 文本渲染 | 支持纯文本显示 | ✅ |
| Markdown | 支持 GFM 语法 | ✅ |
| 代码高亮 | 支持多种语言 | ✅ |
| LaTeX | 数学公式渲染 | ✅ |

## 对齐方式

| 左对齐 | 居中 | 右对齐 |
|:-------|:----:|-------:|
| 文本 | 文本 | 文本 |
| 较长的文本 | 较长的文本 | 较长的文本 |

## 复杂表格

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| \`setup()\` | \`options?: SetupOptions\` | \`void\` | 初始化 chat-ui |
| \`installPlugin()\` | \`plugin: ChatUIPlugin\` | \`void\` | 安装插件 |
| \`ContentParser.parse()\` | \`content: string\` | \`ContentBlock[]\` | 解析内容 |`,
      html: '',
    },
    streaming: false,
  },
};

/**
 * 代码块
 */
export const CodeBlocks: Story = {
  args: {
    block: createBlock('code-1'),
    data: {
      raw: `## 行内代码

使用 \`npm install\` 或 \`pnpm add\` 安装依赖。

## 代码块

\`\`\`javascript
// JavaScript 示例
function greet(name) {
  console.log(\`Hello, \${name}!\`);
}
\`\`\`

\`\`\`typescript
// TypeScript 示例
interface User {
  name: string;
  age: number;
}

const user: User = {
  name: 'Alice',
  age: 25
};
\`\`\`

\`\`\`python
# Python 示例
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
\`\`\``,
      html: '',
    },
    streaming: false,
  },
};

/**
 * 分隔线
 */
export const HorizontalRules: Story = {
  args: {
    block: createBlock('hr-1'),
    data: {
      raw: `## 第一部分

这是第一部分的内容。

---

## 第二部分

这是第二部分的内容。

***

## 第三部分

使用不同的分隔符。

___

结束。`,
      html: '',
    },
    streaming: false,
  },
};

/**
 * 完整文档示例
 */
export const FullDocument: Story = {
  args: {
    block: createBlock('full-1'),
    data: {
      raw: `# @aix/chat-ui 使用指南

> AI 聊天 UI 渲染组件库，支持多种内容类型的渲染。

## 快速开始

### 安装

\`\`\`bash
pnpm add @aix/chat-ui
\`\`\`

### 基本用法

\`\`\`typescript
import { setup, ContentRenderer } from '@aix/chat-ui';

// 初始化（在应用启动时调用一次）
setup({ preset: 'standard' });
\`\`\`

在模板中使用：

\`\`\`vue
<template>
  <ContentRenderer :content="content" />
</template>
\`\`\`

## 功能特性

| 特性 | 说明 |
|------|------|
| 自动检测 | 智能识别内容类型 |
| 流式渲染 | 支持打字机效果 |
| 插件系统 | 可扩展自定义渲染器 |
| 主题支持 | 亮色/暗色主题 |

## 支持的内容类型

- [x] 纯文本
- [x] Markdown
- [x] 代码块（语法高亮）
- [x] LaTeX 公式
- [x] 图表
- [ ] Mermaid 流程图（规划中）

## 注意事项

> **重要**: 必须在使用组件前调用 \`setup()\` 初始化。

更多信息请参考 [官方文档](https://example.com)。`,
      html: '',
    },
    streaming: false,
  },
};

/**
 * AI 对话风格
 * 模拟真实 AI 助手的回复格式
 */
export const AIConversationStyle: Story = {
  args: {
    block: createBlock('ai-1'),
    data: {
      raw: `我来帮你解释 Vue 3 的 **组合式 API**（Composition API）。

## 什么是组合式 API？

组合式 API 是 Vue 3 引入的一种新的代码组织方式，它让我们可以：

1. **更好地复用逻辑** - 通过组合式函数（Composables）
2. **更灵活的代码组织** - 相关代码放在一起
3. **更好的类型推断** - 配合 TypeScript 使用

## 基本示例

\`\`\`vue
<script setup>
import { ref, computed, onMounted } from 'vue';

// 响应式状态
const count = ref(0);

// 计算属性
const doubled = computed(() => count.value * 2);

// 方法
function increment() {
  count.value++;
}

// 生命周期
onMounted(() => {
  console.log('组件已挂载');
});
</script>
\`\`\`

## 与选项式 API 对比

| 方面 | 选项式 API | 组合式 API |
|------|-----------|-----------|
| 代码组织 | 按选项分类 | 按功能分类 |
| 逻辑复用 | Mixins | Composables |
| TypeScript | 需要额外配置 | 原生支持 |

> 💡 **建议**：新项目推荐使用组合式 API + \`<script setup>\` 语法。

希望这个解释对你有帮助！还有什么问题吗？`,
      html: '',
    },
    streaming: false,
  },
};

/**
 * 交互式 Playground
 */
export const Playground: Story = {
  args: {
    block: createBlock('playground-1'),
    data: {
      raw: `# 标题

在下方的 **Controls** 面板中编辑 Markdown 内容。

- 列表项 1
- 列表项 2

\`代码\` 和 [链接](https://example.com)`,
      html: '',
    },
    streaming: false,
  },
};
