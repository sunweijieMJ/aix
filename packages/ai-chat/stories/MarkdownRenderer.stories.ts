import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, waitFor } from 'storybook/test';
import { h, ref, onMounted, onUnmounted } from 'vue';
import { MarkdownRenderer } from '../src';
import { fullReportMarkdown } from './fullReportMarkdown';

/**
 * MarkdownRenderer 组件展示 Markdown 内容。
 *
 * **注意**：本组件依赖可选依赖 `markdown-it`。
 * 本 Storybook 环境已安装 `markdown-it`，以下 story 均为**富文本渲染**效果
 * （标题、粗体、列表、代码块等）。业务项目未安装 `markdown-it` 时，
 * 组件会自动降级为纯文本渲染（直接显示原始 Markdown 语法字符串）。
 */
const meta: Meta<typeof MarkdownRenderer> = {
  title: 'AI Chat/MarkdownRenderer',
  component: MarkdownRenderer,
  parameters: {
    docs: {
      description: {
        component:
          'Markdown 渲染器。依赖可选包 `markdown-it`：安装后渲染为富文本（本 Storybook 即为富文本效果）；未安装时自动降级为纯文本，直接显示原始 Markdown 字符串。',
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
/** 代码块：安装 highlight.js 后自动语法高亮（块固化后上色，流式期先纯码避免逐帧重高亮） */
export const CodeOnly: Story = {
  args: {
    content:
      "```javascript\nconst greet = (name) => `Hello, ${name}!`\nconsole.log(greet('World'))\n```",
  },
  play: async ({ canvasElement }) => {
    // highlight.js 已安装 → 代码块上色：code 带 hljs 类、且至少出现一个 token span
    await waitFor(() => {
      expect(canvasElement.querySelector('code.hljs')).toBeTruthy();
      expect(
        canvasElement.querySelector('.hljs-keyword, .hljs-title, .hljs-string, .hljs-built_in'),
      ).toBeTruthy();
    });
  },
};

/**
 * 代码高亮展示：安装 highlight.js 后，多语言代码块自动语法上色。
 * 默认注入 github 亮色主题；暗色模式可在入口手动 `import 'highlight.js/styles/github-dark.css'` 覆盖。
 */
export const CodeHighlight: Story = {
  args: {
    content: [
      '### TypeScript',
      '```typescript',
      'interface User {',
      '  id: string',
      '  name: string',
      '}',
      'const greet = (u: User): string => `Hello, ${u.name}!`',
      '```',
      '',
      '### Python',
      '```python',
      'def fib(n: int) -> int:',
      '    return n if n < 2 else fib(n - 1) + fib(n - 2)',
      '```',
      '',
      '### JSON',
      '```json',
      '{ "name": "@aix/ai-chat", "highlight": true }',
      '```',
      '',
      '### Bash',
      '```bash',
      'pnpm add highlight.js',
      '```',
    ].join('\n'),
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      // 4 个代码块均上色（带 hljs 类），且至少出现一个 token span
      expect(canvasElement.querySelectorAll('code.hljs').length).toBeGreaterThanOrEqual(4);
      expect(
        canvasElement.querySelector('.hljs-keyword, .hljs-string, .hljs-built_in, .hljs-number'),
      ).toBeTruthy();
    });
  },
};

/** 空内容 */
export const Empty: Story = {
  args: { content: '' },
};

const liveDemoContent = fullReportMarkdown;

/**
 * **流式输出实况**：逐字喂入一篇全要素长文，直观查看防闪烁整修的全套效果——
 * - 表格（5 列 ×4 行）：表头一出现即渲染成表（合成分隔行），数据行逐行长出，全程无裸竖线、无突变；
 * - 粗体 / 斜体 / 删除线 / 行内代码 / 链接 / 图片：未闭合期间隐定界符留文本，闭合后整体变样式；
 * - 行内公式 `$..$` 与块级公式 `$$..$$`、`\[..\]`：块级残片以 latex 代码块逐字可见，
 *   闭合后切换为 KaTeX（FLIP 高度过渡）；
 * - 代码块：内含 `$$` 与 `|` 字符，验证代码区遮蔽（不被误当公式/表格整修）；
 * - mermaid：流式期为代码块逐字显示，块固化后切换成流程图；
 * - 有序/嵌套列表、引用、分隔线、多级标题等常规块。
 * 点「重新播放」可反复观看。
 */
export const StreamingLive: Story = {
  render: () => ({
    components: { MarkdownRenderer },
    setup() {
      const content = ref('');
      const streaming = ref(true);
      let timer: ReturnType<typeof setInterval> | null = null;
      const start = () => {
        if (timer) clearInterval(timer);
        content.value = '';
        streaming.value = true;
        let i = 0;
        timer = setInterval(() => {
          i += 2;
          content.value = liveDemoContent.slice(0, i);
          if (i >= liveDemoContent.length) {
            streaming.value = false;
            if (timer) clearInterval(timer);
            timer = null;
          }
        }, 20);
      };
      onMounted(start);
      onUnmounted(() => {
        if (timer) clearInterval(timer);
      });
      return { content, streaming, start };
    },
    template: `
      <div style="max-width:680px">
        <button type="button" style="margin-bottom:12px;padding:4px 12px;cursor:pointer" @click="start">▶ 重新播放</button>
        <MarkdownRenderer :content="content" :streaming="streaming" />
      </div>`,
  }),
  play: async ({ canvasElement }) => {
    // 表格在分隔行真实到达前就应已成表（合成分隔行生效）
    await waitFor(() => expect(canvasElement.querySelector('table')).toBeTruthy(), {
      timeout: 10000,
    });
    // 流式结束后全要素就位：粗体 / 图片 / 引用 / KaTeX 公式 / 代码块 / mermaid 流程图
    await waitFor(() => expect(canvasElement.querySelector('strong')).toBeTruthy(), {
      timeout: 10000,
    });
    await waitFor(() => expect(canvasElement.querySelector('img')).toBeTruthy(), {
      timeout: 10000,
    });
    await waitFor(() => expect(canvasElement.querySelector('blockquote')).toBeTruthy(), {
      timeout: 15000,
    });
    await waitFor(() => expect(canvasElement.querySelector('.katex')).toBeTruthy(), {
      timeout: 18000,
    });
    await waitFor(() => expect(canvasElement.querySelectorAll('pre').length).toBeGreaterThan(0), {
      timeout: 18000,
    });
    await waitFor(() => expect(canvasElement.querySelector('.aix-md-mermaid svg')).toBeTruthy(), {
      timeout: 25000,
    });
  },
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

/**
 * 数学公式（KaTeX）：支持 `$...$` / `$$...$$` 与 OpenAI 系 `\(...\)` / `\[...\]` 定界符。
 * 需安装 `katex` + `@vscode/markdown-it-katex` 并在应用入口引入 `katex/dist/katex.min.css`。
 */
export const Math: Story = {
  args: {
    content: [
      '质能方程 $E = mc^2$ 是物理学基石。',
      '',
      '欧拉-拉格朗日方程（`\\[...\\]` 块级定界符）：',
      '',
      '\\[ \\frac{\\partial \\mathcal{L}}{\\partial q} - \\frac{d}{dt}\\left( \\frac{\\partial \\mathcal{L}}{\\partial \\dot{q}} \\right) = 0 \\]',
      '',
      '正态分布概率密度（`$$...$$` 块级）：',
      '',
      '$$ f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}} $$',
    ].join('\n'),
  },
};

/**
 * 自定义 markdown 渲染器（`markdownRenderers` 扩展点）：覆盖内置 `fence`，把代码块换成带语言标签的卡片。
 */
export const CustomRenderers: Story = {
  args: {
    content: '普通段落，下面是代码块：\n\n```ts\nconst a = 1;\nconst b = 2;\n```',
    markdownRenderers: {
      fence: ({ token }) =>
        h(
          'div',
          { style: 'border:1px dashed var(--aix-colorPrimary);border-radius:6px;padding:8px' },
          [
            h(
              'div',
              { style: 'font-size:12px;opacity:.6;margin-bottom:4px' },
              `语言：${token.info || 'text'}`,
            ),
            h('pre', { style: 'margin:0' }, token.content),
          ],
        ),
    },
  },
};

/**
 * 原始 HTML（`allowHtml`）：开启后块级 HTML 经 DOMPurify 消毒渲染，危险属性/脚本被去除。
 * 需安装 `dompurify`；默认关闭时原始 HTML 转义为文本。
 */
export const AllowHtml: Story = {
  args: {
    allowHtml: true,
    content:
      '后端下发的 HTML 卡片：\n\n<div style="padding:8px;border:1px solid var(--aix-colorBorder);border-radius:6px">这是 <strong>HTML</strong> 卡片，<img src="x" onerror="alert(1)"> 中的危险属性已被消毒。</div>',
  },
};

/**
 * 内置图片骨架：图片 markdown 渲染为「shimmer 骨架 → 加载完成平滑过渡出图」，
 * 不再突然撑开页面；加载失败渲染占位框 + alt 文案（不裂图）。
 * 已加载过的 URL 有缓存（虚拟列表滚动复现不再闪骨架）。
 * 业务可经 `markdownRenderers.image` 整体覆盖。
 */
export const Images: Story = {
  args: {
    content: [
      '多图加载演示（注意骨架 → 出图的平滑过渡）：',
      '',
      '![风景](https://picsum.photos/seed/aix-demo-1/640/240.jpg)',
      '',
      '![城市](https://picsum.photos/seed/aix-demo-2/640/200.jpg)',
      '',
      '失败占位演示（404 地址不裂图）：',
      '',
      '![不存在的图片](https://example.com/not-exist.png)',
    ].join('\n'),
  },
  play: async ({ canvasElement }) => {
    // 三个图片位均渲染为骨架组件容器（成功与否都不裸奔）
    await waitFor(() => expect(canvasElement.querySelectorAll('.aix-md-image').length).toBe(3), {
      timeout: 5000,
    });
  },
};

const mermaidContent = `下面是发布流程：

\`\`\`mermaid
graph TD
  A[提交代码] --> B{CI 通过?}
  B -- 是 --> C[发布 npm]
  B -- 否 --> D[修复问题]
  D --> A
\`\`\`
`;

/**
 * Mermaid 流程图：装了可选依赖 \`mermaid\` 后，\`\`\`mermaid 围栏自动渲染为图表；
 * 未安装时维持代码块展示（静默降级）。语法错误的图表也回落为代码块（虚线边框提示）。
 */
export const Mermaid: Story = {
  args: { content: mermaidContent },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.aix-md-mermaid svg')).toBeTruthy(), {
      timeout: 5000,
    });
  },
};

/**
 * Mermaid 流式演示：源码逐字输出期间按代码块展示（保留打字机反馈），
 * 流式结束后平滑切换为图表（FLIP 高度过渡）。
 */
export const MermaidStreaming: Story = {
  render: () => ({
    components: { MarkdownRenderer },
    setup() {
      const content = ref('');
      const streaming = ref(true);
      let i = 0;
      const timer = setInterval(() => {
        content.value = mermaidContent.slice(0, (i += 6));
        if (i >= mermaidContent.length) {
          streaming.value = false;
          clearInterval(timer);
        }
      }, 50);
      onUnmounted(() => clearInterval(timer));
      return { content, streaming };
    },
    template: '<MarkdownRenderer :content="content" :streaming="streaming" />',
  }),
  play: async ({ canvasElement }) => {
    // 流式结束后应成图
    await waitFor(() => expect(canvasElement.querySelector('.aix-md-mermaid svg')).toBeTruthy(), {
      timeout: 10000,
    });
  },
};
