import { setup as setupChatUI } from '@aix/chat-ui';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { Bubble, BubbleContent } from '../src/components/Bubble';

// 初始化 chat-ui（使用完整预设以支持所有渲染器示例）
// 注意：setup 只需调用一次，多次调用会被忽略
setupChatUI({ preset: 'full' });

const meta: Meta<typeof Bubble> = {
  title: 'Chat/Bubble',
  component: Bubble,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'AI 聊天消息气泡组件，支持用户和 AI 两种角色，支持 Markdown 渲染。',
      },
    },
  },
  argTypes: {
    role: {
      control: 'select',
      options: ['user', 'assistant', 'system'],
      description: '消息角色',
    },
    content: {
      control: 'text',
      description: '消息内容',
    },
    placement: {
      control: 'select',
      options: ['start', 'end'],
      description: '对齐位置',
    },
    variant: {
      control: 'select',
      options: ['outlined', 'filled', 'borderless'],
      description: '样式变体',
    },
    enableMarkdown: {
      control: 'boolean',
      description: '启用 Markdown 渲染',
    },
    loading: {
      control: 'boolean',
      description: '加载状态',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 用户消息
 */
export const UserMessage: Story = {
  args: {
    role: 'user',
    content: 'Hello, AI! How are you today?',
    placement: 'end',
  },
};

/**
 * AI 消息
 */
export const AssistantMessage: Story = {
  args: {
    role: 'assistant',
    content:
      "Hello! I'm doing great, thank you for asking. How can I help you today?",
    placement: 'start',
  },
};

/**
 * Markdown 渲染
 */
export const MarkdownMessage: Story = {
  args: {
    role: 'assistant',
    content: `## Code Example

Here's a simple JavaScript function:

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\`

**Key features:**
- Uses template literals
- Returns a greeting string
- Simple and clean`,
    placement: 'start',
    enableMarkdown: true,
  },
};

/**
 * 不同样式变体
 */
export const Variants: Story = {
  render: () => ({
    components: { Bubble },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 600px;">
        <Bubble role="user" content="Outlined variant" placement="end" variant="outlined" />
        <Bubble role="assistant" content="Filled variant (default)" placement="start" variant="filled" />
        <Bubble role="user" content="Borderless variant" placement="end" variant="borderless" />
      </div>
    `,
  }),
};

/**
 * 对话示例
 */
export const Conversation: Story = {
  render: () => ({
    components: { Bubble },
    template: `
      <div style="display: flex; flex-direction: column; gap: 12px; max-width: 700px; padding: 20px;">
        <Bubble
          role="user"
          content="Can you explain what React hooks are?"
          placement="end"
        />
        <Bubble
          role="assistant"
          placement="start"
          :enableMarkdown="true"
          content="# React Hooks

React Hooks are functions that let you use state and other React features in functional components.

## Common Hooks:

1. **useState** - Manages component state
2. **useEffect** - Handles side effects
3. **useContext** - Consumes context values

\`\`\`jsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
\`\`\`"
        />
        <Bubble
          role="user"
          content="That's helpful, thank you!"
          placement="end"
        />
      </div>
    `,
  }),
};

/**
 * 加载动画 - 三个点错开跳动
 * 参考 ant-design/x 的加载效果
 */
export const LoadingAnimation: Story = {
  args: {
    role: 'assistant',
    placement: 'start',
    loading: true,
  },
};

/**
 * 打字动画 - 光标闪烁效果
 * 在内容加载时显示闪烁的光标
 */
export const TypingAnimation: Story = {
  args: {
    role: 'assistant',
    content: 'This is a message with typing cursor',
    placement: 'start',
    loading: true,
    typing: true,
  },
};

/**
 * 动画效果组合演示
 */
export const AnimationShowcase: Story = {
  render: () => ({
    components: { Bubble },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 700px; padding: 20px;">
        <h3 style="margin: 0 0 8px 0;">加载动画（无内容时）</h3>
        <Bubble
          role="assistant"
          placement="start"
          :loading="true"
        />

        <h3 style="margin: 16px 0 8px 0;">打字光标动画（有内容时）</h3>
        <Bubble
          role="assistant"
          content="AI is typing a response..."
          placement="start"
          :loading="true"
          :typing="true"
        />

        <h3 style="margin: 16px 0 8px 0;">完成状态</h3>
        <Bubble
          role="assistant"
          content="This is the complete message without any animation."
          placement="start"
        />
      </div>
    `,
  }),
};

// =============================================================================
// 智能渲染器示例 (使用 @aix/chat-ui 的 ContentRenderer)
// =============================================================================

/**
 * 智能渲染器 - 自动检测内容类型
 *
 * BubbleContent 默认启用 useSmartRenderer，会自动检测并渲染：
 * - Markdown 文本
 * - 代码块（带语法高亮）
 * - LaTeX 数学公式
 * - ECharts 图表
 * - Mermaid 流程图
 */
export const SmartRenderer: Story = {
  render: () => ({
    components: { Bubble },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 800px; padding: 20px;">
        <h3 style="margin: 0;">智能渲染器自动检测内容类型</h3>
        <p style="color: #666; margin: 0 0 16px 0;">
          BubbleContent 默认启用 useSmartRenderer，自动识别 Markdown、代码、LaTeX、图表等内容
        </p>

        <Bubble
          role="assistant"
          placement="start"
          content="这是一段普通的 **Markdown** 文本，支持 *斜体*、\`行内代码\` 和 [链接](https://example.com)。"
        />

        <Bubble
          role="assistant"
          placement="start"
          :content="codeContent"
        />
      </div>
    `,
    setup() {
      const codeContent = `下面是一个 TypeScript 代码示例：

\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
}

function greetUser(user: User): string {
  return \`Hello, \${user.name}!\`;
}
\`\`\`

代码会自动高亮显示。`;
      return { codeContent };
    },
  }),
};

/**
 * LaTeX 数学公式渲染
 *
 * 使用 chat-ui 的 latexPlugin 渲染数学公式
 * 需要在 Storybook 预览中初始化: setup({ preset: 'standard' }) 或 'full'
 */
export const LatexRendering: Story = {
  render: () => ({
    components: { Bubble },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 800px; padding: 20px;">
        <h3 style="margin: 0;">LaTeX 数学公式渲染</h3>

        <Bubble
          role="user"
          placement="end"
          content="请解释一下欧拉公式"
        />

        <Bubble
          role="assistant"
          placement="start"
          :content="latexContent"
        />

        <Bubble
          role="assistant"
          placement="start"
          :content="complexLatex"
        />
      </div>
    `,
    setup() {
      const latexContent = `欧拉公式是数学中最优美的公式之一：

$$e^{i\\pi} + 1 = 0$$

这个公式将五个最重要的数学常数联系在一起：
- $e$ - 自然对数的底
- $i$ - 虚数单位
- $\\pi$ - 圆周率
- $1$ - 乘法单位元
- $0$ - 加法单位元`;

      const complexLatex = `**更一般的欧拉公式**：

$$e^{ix} = \\cos(x) + i\\sin(x)$$

**积分示例**：

$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

**矩阵示例**：

$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} ax + by \\\\ cx + dy \\end{pmatrix}$$`;

      return { latexContent, complexLatex };
    },
  }),
};

/**
 * ECharts 图表渲染
 *
 * 使用 chat-ui 的 chartPlugin 渲染 ECharts 图表
 * 需要在 Storybook 预览中初始化: setup({ preset: 'full' })
 */
export const ChartRendering: Story = {
  render: () => ({
    components: { Bubble },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 900px; padding: 20px;">
        <h3 style="margin: 0;">ECharts 图表渲染</h3>

        <Bubble
          role="user"
          placement="end"
          content="请给我展示一下销售数据的柱状图"
        />

        <Bubble
          role="assistant"
          placement="start"
          :content="barChartContent"
        />

        <Bubble
          role="assistant"
          placement="start"
          :content="pieChartContent"
        />
      </div>
    `,
    setup() {
      const barChartContent = `这是本季度各产品的销售数据：

\`\`\`echarts
{
  "title": { "text": "季度销售数据", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "xAxis": {
    "type": "category",
    "data": ["产品A", "产品B", "产品C", "产品D", "产品E"]
  },
  "yAxis": { "type": "value", "name": "销售额(万)" },
  "series": [{
    "name": "销售额",
    "type": "bar",
    "data": [120, 200, 150, 80, 170],
    "itemStyle": { "color": "#5470c6" }
  }]
}
\`\`\``;

      const pieChartContent = `市场份额分布如下：

\`\`\`echarts
{
  "title": { "text": "市场份额", "left": "center" },
  "tooltip": { "trigger": "item" },
  "series": [{
    "name": "市场份额",
    "type": "pie",
    "radius": "60%",
    "data": [
      { "value": 335, "name": "产品A" },
      { "value": 310, "name": "产品B" },
      { "value": 234, "name": "产品C" },
      { "value": 135, "name": "产品D" },
      { "value": 148, "name": "产品E" }
    ]
  }]
}
\`\`\``;

      return { barChartContent, pieChartContent };
    },
  }),
};

/**
 * Mermaid 流程图渲染
 *
 * 使用 chat-ui 的 mermaidPlugin 渲染流程图、时序图等
 * 需要在 Storybook 预览中初始化: setup({ preset: 'full' })
 */
export const MermaidDiagram: Story = {
  render: () => ({
    components: { Bubble },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 900px; padding: 20px;">
        <h3 style="margin: 0;">Mermaid 图表渲染</h3>

        <Bubble
          role="user"
          placement="end"
          content="请画一个用户登录的流程图"
        />

        <Bubble
          role="assistant"
          placement="start"
          :content="flowchartContent"
        />

        <Bubble
          role="assistant"
          placement="start"
          :content="sequenceContent"
        />
      </div>
    `,
    setup() {
      const flowchartContent = `用户登录流程如下：

\`\`\`mermaid
flowchart TD
    A[用户访问登录页] --> B{是否已登录?}
    B -->|是| C[跳转到首页]
    B -->|否| D[显示登录表单]
    D --> E[用户输入账号密码]
    E --> F{验证是否通过?}
    F -->|是| G[创建会话]
    G --> C
    F -->|否| H[显示错误信息]
    H --> D
\`\`\``;

      const sequenceContent = `API 请求时序图：

\`\`\`mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant B as 后端
    participant D as 数据库

    U->>F: 点击登录按钮
    F->>B: POST /api/login
    B->>D: 查询用户信息
    D-->>B: 返回用户数据
    B->>B: 验证密码
    B-->>F: 返回 JWT Token
    F->>F: 存储 Token
    F-->>U: 显示登录成功
\`\`\``;

      return { flowchartContent, sequenceContent };
    },
  }),
};

/**
 * 思维导图渲染
 *
 * 使用 chat-ui 的 mindmapPlugin 渲染思维导图
 */
export const MindmapRendering: Story = {
  render: () => ({
    components: { Bubble },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 900px; padding: 20px;">
        <h3 style="margin: 0;">思维导图渲染</h3>

        <Bubble
          role="user"
          placement="end"
          content="请帮我整理一下前端技术栈的知识体系"
        />

        <Bubble
          role="assistant"
          placement="start"
          :content="mindmapContent"
        />
      </div>
    `,
    setup() {
      const mindmapContent = `前端技术栈知识体系：

\`\`\`mindmap
{
  "name": "前端技术栈",
  "children": [
    {
      "name": "HTML/CSS",
      "children": [
        { "name": "HTML5 语义化" },
        { "name": "CSS3 动画" },
        { "name": "Flexbox/Grid" },
        { "name": "响应式设计" }
      ]
    },
    {
      "name": "JavaScript",
      "children": [
        { "name": "ES6+ 语法" },
        { "name": "TypeScript" },
        { "name": "异步编程" },
        { "name": "模块化" }
      ]
    },
    {
      "name": "框架",
      "children": [
        { "name": "Vue 3" },
        { "name": "React" },
        { "name": "Angular" }
      ]
    },
    {
      "name": "工程化",
      "children": [
        { "name": "Vite/Webpack" },
        { "name": "ESLint/Prettier" },
        { "name": "单元测试" },
        { "name": "CI/CD" }
      ]
    }
  ]
}
\`\`\``;

      return { mindmapContent };
    },
  }),
};

/**
 * 流式渲染演示
 *
 * 演示 AI 响应的流式渲染效果
 */
export const StreamingDemo: Story = {
  render: () => ({
    components: { Bubble },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 800px; padding: 20px;">
        <h3 style="margin: 0;">流式渲染演示</h3>
        <p style="color: #666; margin: 0 0 16px 0;">
          点击按钮模拟 AI 流式响应
        </p>

        <div style="margin-bottom: 16px;">
          <button
            @click="startStreaming"
            :disabled="isStreaming"
            style="padding: 8px 16px; cursor: pointer;"
          >
            {{ isStreaming ? '正在生成...' : '开始流式响应' }}
          </button>
          <button
            @click="reset"
            style="padding: 8px 16px; margin-left: 8px; cursor: pointer;"
          >
            重置
          </button>
        </div>

        <Bubble
          role="user"
          placement="end"
          content="请介绍一下 Vue 3 的新特性"
        />

        <Bubble
          v-if="streamContent"
          role="assistant"
          placement="start"
          :content="streamContent"
          :loading="isStreaming"
        />
      </div>
    `,
    setup() {
      const streamContent = ref('');
      const isStreaming = ref(false);

      const fullContent = `## Vue 3 新特性

### 1. Composition API
组合式 API 是 Vue 3 最重要的新特性：

\`\`\`typescript
import { ref, computed, onMounted } from 'vue';

export function useCounter() {
  const count = ref(0);
  const double = computed(() => count.value * 2);

  function increment() {
    count.value++;
  }

  return { count, double, increment };
}
\`\`\`

### 2. 更好的 TypeScript 支持
Vue 3 使用 TypeScript 重写，提供了更好的类型推断。

### 3. 性能提升
- 更小的包体积
- 更快的虚拟 DOM
- 更好的 Tree-shaking`;

      const startStreaming = () => {
        streamContent.value = '';
        isStreaming.value = true;

        let index = 0;
        const timer = setInterval(() => {
          if (index < fullContent.length) {
            // 模拟不均匀的流式输出
            const chunkSize = Math.floor(Math.random() * 5) + 1;
            streamContent.value += fullContent.slice(index, index + chunkSize);
            index += chunkSize;
          } else {
            clearInterval(timer);
            isStreaming.value = false;
          }
        }, 30);
      };

      const reset = () => {
        streamContent.value = '';
        isStreaming.value = false;
      };

      return { streamContent, isStreaming, startStreaming, reset };
    },
  }),
};

/**
 * 混合内容渲染
 *
 * 演示单条消息中包含多种内容类型
 */
export const MixedContent: Story = {
  render: () => ({
    components: { Bubble },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 900px; padding: 20px;">
        <h3 style="margin: 0;">混合内容渲染</h3>
        <p style="color: #666; margin: 0 0 16px 0;">
          单条消息中包含文本、代码、公式和图表
        </p>

        <Bubble
          role="assistant"
          placement="start"
          :content="mixedContent"
        />
      </div>
    `,
    setup() {
      const mixedContent = `## 数据分析报告

### 1. 算法说明

我们使用了 **线性回归** 模型进行预测。模型公式为：

$$y = \\beta_0 + \\beta_1 x_1 + \\beta_2 x_2 + \\epsilon$$

其中 $\\beta_0$ 是截距，$\\beta_1, \\beta_2$ 是回归系数。

### 2. 代码实现

\`\`\`python
import numpy as np
from sklearn.linear_model import LinearRegression

# 准备数据
X = np.array([[1, 2], [3, 4], [5, 6]])
y = np.array([1, 2, 3])

# 训练模型
model = LinearRegression()
model.fit(X, y)

# 预测
predictions = model.predict(X)
\`\`\`

### 3. 结果可视化

\`\`\`echarts
{
  "title": { "text": "预测结果对比", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "legend": { "top": "10%" },
  "xAxis": { "type": "category", "data": ["样本1", "样本2", "样本3"] },
  "yAxis": { "type": "value" },
  "series": [
    { "name": "实际值", "type": "line", "data": [1, 2, 3] },
    { "name": "预测值", "type": "line", "data": [1.1, 1.9, 3.1], "lineStyle": { "type": "dashed" } }
  ]
}
\`\`\`

模型的 $R^2$ 得分为 **0.98**，表现良好。`;

      return { mixedContent };
    },
  }),
};

/**
 * 禁用智能渲染器
 *
 * 使用传统渲染方式（Markdown 或纯文本）
 */
export const DisableSmartRenderer: Story = {
  render: () => ({
    components: { BubbleContent },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 800px; padding: 20px;">
        <h3 style="margin: 0;">禁用智能渲染器</h3>
        <p style="color: #666; margin: 0 0 16px 0;">
          设置 useSmartRenderer=false 使用传统渲染方式
        </p>

        <div style="padding: 16px; background: #f5f5f5; border-radius: 8px;">
          <h4 style="margin: 0 0 8px 0;">使用传统 Markdown 渲染器：</h4>
          <BubbleContent
            :content="content"
            :enableMarkdown="true"
            :useSmartRenderer="false"
          />
        </div>

        <div style="padding: 16px; background: #f5f5f5; border-radius: 8px;">
          <h4 style="margin: 0 0 8px 0;">纯文本渲染：</h4>
          <BubbleContent
            :content="content"
            :enableMarkdown="false"
            :useSmartRenderer="false"
          />
        </div>
      </div>
    `,
    setup() {
      const content = `这是一段 **Markdown** 内容。

包含 \`代码\` 和列表：
- 项目 1
- 项目 2`;

      return { content };
    },
  }),
};
