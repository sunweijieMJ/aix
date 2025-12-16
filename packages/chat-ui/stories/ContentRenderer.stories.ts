/**
 * @fileoverview ContentRenderer Stories
 * 展示 AI 聊天内容渲染器的各种用法
 */

import type { Meta, StoryObj } from '@storybook/vue3';
import { ref, onMounted, onUnmounted } from 'vue';
import { ContentRenderer, setup } from '../src';

// 确保初始化
setup({ preset: 'standard' });

const meta: Meta<typeof ContentRenderer> = {
  title: 'ChatUI/ContentRenderer',
  component: ContentRenderer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'ContentRenderer 是核心渲染组件，自动检测内容类型并选择合适的渲染器显示。支持纯文本、Markdown、代码块、LaTeX 公式等多种格式。',
      },
    },
  },
  argTypes: {
    content: {
      control: 'text',
      description: '要渲染的内容',
      table: {
        type: { summary: 'string' },
      },
    },
    type: {
      control: 'select',
      options: [
        undefined,
        'text',
        'markdown',
        'code',
        'latex',
        'chart',
        'mermaid',
      ],
      description: '强制指定内容类型（可选，默认自动检测）',
      table: {
        type: { summary: 'ContentType' },
      },
    },
    streaming: {
      control: 'boolean',
      description: '是否处于流式输出状态',
      table: {
        type: { summary: 'boolean | StreamingConfig' },
        defaultValue: { summary: 'false' },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 纯文本渲染
 */
export const PlainText: Story = {
  args: {
    content: '这是一段普通的纯文本内容，没有任何格式化。',
  },
};

/**
 * Markdown 渲染
 */
export const Markdown: Story = {
  args: {
    content: `# Markdown 示例

这是一个 **Markdown** 渲染示例，支持以下格式：

## 文本格式
- **粗体文本**
- *斜体文本*
- ~~删除线~~
- \`行内代码\`

## 列表
1. 有序列表项 1
2. 有序列表项 2
3. 有序列表项 3

## 链接和图片
[访问链接](https://example.com)

## 引用
> 这是一段引用文本
> 可以有多行

## 表格
| 功能 | 支持 |
|------|------|
| 标题 | ✅ |
| 列表 | ✅ |
| 代码 | ✅ |
| 表格 | ✅ |
`,
  },
};

/**
 * 代码块渲染
 */
export const CodeBlock: Story = {
  args: {
    content: `\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

async function fetchUser(id: number): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }
  return response.json();
}

// 使用示例
const user = await fetchUser(123);
console.log(user.name);
\`\`\``,
  },
};

/**
 * LaTeX 公式
 */
export const LaTeX: Story = {
  args: {
    content: `$$
\\begin{aligned}
E &= mc^2 \\\\
\\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\
\\int_{-\\infty}^{\\infty} e^{-x^2} dx &= \\sqrt{\\pi}
\\end{aligned}
$$`,
  },
};

/**
 * 混合内容
 * 同时包含多种类型的内容块
 */
export const MixedContent: Story = {
  args: {
    content: `# 快速排序算法

快速排序是一种高效的排序算法，平均时间复杂度为 $O(n \\log n)$。

## 算法实现

\`\`\`python
def quicksort(arr):
    if len(arr) <= 1:
        return arr

    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]

    return quicksort(left) + middle + quicksort(right)

# 使用示例
numbers = [3, 6, 8, 10, 1, 2, 1]
print(quicksort(numbers))  # [1, 1, 2, 3, 6, 8, 10]
\`\`\`

## 复杂度分析

| 情况 | 时间复杂度 |
|------|------------|
| 最好 | $O(n \\log n)$ |
| 平均 | $O(n \\log n)$ |
| 最坏 | $O(n^2)$ |

> **提示**：选择好的 pivot 可以避免最坏情况的发生。
`,
  },
};

/**
 * 流式输出模拟
 * 模拟 AI 实时生成内容的效果
 */
export const StreamingDemo: Story = {
  render: () => ({
    components: { ContentRenderer },
    setup() {
      const content = ref('');
      const streaming = ref(true);
      let intervalId: ReturnType<typeof setInterval>;

      const fullContent = `# AI 正在思考...

让我来帮你解释一下 **Vue 3 的响应式原理**：

## 核心概念

Vue 3 使用 \`Proxy\` 替代了 Vue 2 的 \`Object.defineProperty\`，带来了以下优势：

1. **更好的性能** - 不需要递归遍历对象
2. **更完整的拦截** - 可以监听数组下标和对象新增属性
3. **更简洁的代码** - 减少了边界情况处理

\`\`\`javascript
import { reactive, ref } from 'vue';

// 使用 reactive 创建响应式对象
const state = reactive({
  count: 0,
  user: { name: 'Vue' }
});

// 使用 ref 创建响应式基础类型
const count = ref(0);
\`\`\`

希望这个解释对你有帮助！`;

      let charIndex = 0;

      onMounted(() => {
        intervalId = setInterval(() => {
          if (charIndex < fullContent.length) {
            // 每次添加 1-3 个字符，模拟真实的流式效果
            const step = Math.floor(Math.random() * 3) + 1;
            content.value = fullContent.slice(0, charIndex + step);
            charIndex += step;
          } else {
            streaming.value = false;
            clearInterval(intervalId);
          }
        }, 30);
      });

      onUnmounted(() => {
        if (intervalId) clearInterval(intervalId);
      });

      return { content, streaming };
    },
    template: `
      <div style="padding: 16px; background: var(--colorBgLayout); border-radius: 8px;">
        <div style="margin-bottom: 8px; font-size: 12px; color: var(--colorTextSecondary);">
          {{ streaming ? '🔄 AI 正在输出...' : '✅ 输出完成' }}
        </div>
        <ContentRenderer
          :content="content"
          :streaming="{ hasNextChunk: streaming }"
        />
      </div>
    `,
  }),
};

/**
 * 错误处理
 * 展示渲染器错误时的降级显示
 */
export const ErrorHandling: Story = {
  render: () => ({
    components: { ContentRenderer },
    setup() {
      return {};
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <h4 style="margin: 0 0 8px 0; color: var(--colorText);">空内容处理</h4>
          <ContentRenderer content="" />
        </div>
        <div>
          <h4 style="margin: 0 0 8px 0; color: var(--colorText);">正常内容</h4>
          <ContentRenderer content="这是正常的内容" />
        </div>
      </div>
    `,
  }),
};

/**
 * 所有内置类型展示
 */
export const AllTypes: Story = {
  render: () => ({
    components: { ContentRenderer },
    template: `
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <section>
          <h3 style="margin: 0 0 8px 0; font-size: 14px; color: var(--colorText);">📝 纯文本</h3>
          <ContentRenderer content="这是一段普通的纯文本，会被渲染为简单的文本格式。" />
        </section>

        <section>
          <h3 style="margin: 0 0 8px 0; font-size: 14px; color: var(--colorText);">📖 Markdown</h3>
          <ContentRenderer content="**粗体** 和 *斜体* 以及 [链接](https://example.com)" />
        </section>

        <section>
          <h3 style="margin: 0 0 8px 0; font-size: 14px; color: var(--colorText);">💻 代码块</h3>
          <ContentRenderer content="\`\`\`js\nconst hello = 'world';\nconsole.log(hello);\n\`\`\`" />
        </section>

        <section>
          <h3 style="margin: 0 0 8px 0; font-size: 14px; color: var(--colorText);">📐 LaTeX 公式</h3>
          <ContentRenderer content="$$E = mc^2$$" />
        </section>
      </div>
    `,
  }),
};

/**
 * 主题切换示例
 * 点击右上角的主题切换按钮（太阳/月亮图标），查看组件在不同主题下的效果
 */
export const ThemeDemo: Story = {
  render: () => ({
    components: { ContentRenderer },
    setup() {
      const content = `# 主题演示

点击右上角工具栏的 **主题按钮**（太阳☀️/月亮🌙 图标）切换主题。

## 代码示例

\`\`\`typescript
import { ContentRenderer } from '@aix/chat-ui';

// 主题由 @aix/theme 统一控制
// 组件自动响应主题变化
<ContentRenderer content={content} />
\`\`\`

## 特性说明

- ✅ 使用 CSS 变量，无需重新渲染组件
- ✅ 自动响应全局主题变化
- ✅ 支持亮色/暗色主题

> 主题状态通过 \`@aix/theme\` 统一管理，所有组件自动适配。
`;
      return { content };
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <div style="padding: 16px; background: var(--colorBgContainer); border: 1px solid var(--colorBorder); border-radius: 8px;">
          <ContentRenderer :content="content" />
        </div>

        <div style="padding: 16px; background: var(--colorPrimaryBg); border: 1px solid var(--colorPrimaryBorder); border-radius: 8px;">
          <h4 style="margin: 0 0 12px 0; font-size: 14px; color: var(--colorPrimaryText);">
            💡 开发提示
          </h4>
          <div style="font-size: 13px; color: var(--colorText); line-height: 1.8;">
            <p style="margin: 0 0 8px 0;">组件直接使用主题变量，无需 theme prop：</p>
            <pre style="margin: 0; padding: 12px; background: var(--colorBgElevated); border-radius: 4px; overflow-x: auto; font-size: 12px;"><code>// 在样式中使用主题变量
color: var(--colorText);
background: var(--colorBgContainer);
border: 1px solid var(--colorBorder);</code></pre>
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * 交互式 Playground
 */
export const Playground: Story = {
  args: {
    content:
      '# 标题\n\n在这里输入内容试试...\n\n- 支持 **Markdown**\n- 支持 `代码`\n- 支持公式 $E=mc^2$',
    streaming: false,
  },
};
