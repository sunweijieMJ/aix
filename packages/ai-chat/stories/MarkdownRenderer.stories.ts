import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, waitFor } from 'storybook/test';
import { MarkdownRenderer } from '../src';

/**
 * MarkdownRenderer 组件展示 Markdown 内容。
 *
 * **注意**：本组件依赖可选依赖 `markdown-it`。
 * 当前环境未安装 `markdown-it`，组件将**降级为纯文本渲染**（直接显示原始 Markdown 语法字符串）。
 * 安装 `markdown-it` 后，将自动渲染为富文本（标题、粗体、列表、代码块等）。
 */
const meta: Meta<typeof MarkdownRenderer> = {
  title: 'AI Chat/MarkdownRenderer',
  component: MarkdownRenderer,
  parameters: {
    docs: {
      description: {
        component:
          'Markdown 渲染器。依赖可选包 `markdown-it`：安装后渲染为富文本；**未安装时降级为纯文本**，直接显示原始 Markdown 字符串。',
      },
    },
  },
  args: {
    content: '',
  },
};
export default meta;
type Story = StoryObj<typeof MarkdownRenderer>;

const sampleMarkdown = `# 这是一级标题

## 这是二级标题

这是一段普通文本，包含 **粗体** 和 *斜体* 内容。

### 无序列表

- 第一项：Vue 3 Composition API
- 第二项：TypeScript 严格模式
- 第三项：Vite 极速构建

### 有序列表

1. 安装依赖：\`pnpm install\`
2. 启动开发服务：\`pnpm dev\`
3. 构建生产包：\`pnpm build\`

### 代码块

\`\`\`typescript
const count = ref(0)
const increment = () => count.value++
\`\`\`

### 引用

> 这是一段引用文字，通常用于展示重要提示或摘录。

---

末尾分隔线上方是完整的 Markdown 示例内容。
`;

/**
 * 默认：含标题、粗体、列表、代码块等完整 Markdown 语法
 *
 * 安装 markdown-it 后将渲染为富文本；未安装时降级显示原始文本。
 */
export const Default: Story = {
  args: { content: sampleMarkdown },
  parameters: {
    docs: {
      description: {
        story:
          '完整 Markdown 示例，含一级/二级/三级标题、粗体、斜体、无序/有序列表、代码块、引用和分隔线。安装 `markdown-it` 后将渲染为富文本。',
      },
    },
  },
  play: async ({ canvas }) => {
    // 无论富文本还是降级纯文本，内容文本都应出现（异步加载渲染器后断言）
    await waitFor(() => expect(canvas.getByText(/这是一级标题/)).toBeInTheDocument());
  },
};

/** 纯文本：无 Markdown 语法，降级与富文本效果一致 */
export const PlainText: Story = {
  args: { content: '这是一段没有任何 Markdown 语法的纯文本内容，两种模式下显示效果相同。' },
};

/** 仅代码块 */
export const CodeOnly: Story = {
  args: {
    content:
      "```javascript\nconst greet = (name) => `Hello, ${name}!`\nconsole.log(greet('World'))\n```",
  },
};

/** 空内容 */
export const Empty: Story = {
  args: { content: '' },
};

/**
 * 流式防闪烁（`streaming` = true）：演示「半截」Markdown 的整修。
 * 输出途中常出现未闭合的代码围栏（``` 未配对）或未闭合的链接（`[文字` 还没打完），
 * 开启 streaming 后：未闭合代码块会被临时收尾以代码块形式呈现，末行未闭合链接残片被暂时隐去，
 * 避免露出裸 ``` / 裸中括号。token 补全后自然恢复。完整文本（非流式）应保持 streaming=false 原样渲染。
 */
export const Streaming: Story = {
  args: {
    streaming: true,
    content: '正在生成代码：\n\n```ts\nconst x = 1\nconst y = 2',
  },
  play: async ({ canvas }) => {
    // 整修后内容可正常呈现（富文本或纯文本降级均不应抛错）
    await waitFor(() => expect(canvas.getByText(/正在生成代码/)).toBeTruthy());
  },
};
