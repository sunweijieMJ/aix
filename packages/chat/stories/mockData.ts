/**
 * @fileoverview Mock 数据生成器
 * 用于 Storybook 示例的模拟数据和 API 请求
 */

import type { AgentRequestInfo, AgentCallbacks } from '@aix/chat-sdk';
import type { AgentAction } from '../src/components/AgentActions/types';
import type { SuggestionItem } from '../src/components/Suggestion/types';
import type { WelcomeFeature } from '../src/components/Welcome/types';

// ==================== AI 响应模板 ====================

/** 包含多种格式的 AI 响应示例 */
export const DEMO_RESPONSES: Record<string, string> = {
  default: `你好！我是 AI 助手，我可以帮助你：

- 📝 **回答问题** - 提供准确的信息
- 💻 **编写代码** - 支持多种编程语言
- 📊 **数据分析** - 生成图表和报告
- 🎨 **创意写作** - 写诗、写故事

有什么我可以帮助你的吗？`,

  latex: `## 数学公式演示

欧拉公式是数学中最优美的公式之一：

$$e^{i\\pi} + 1 = 0$$

更一般的形式：

$$e^{ix} = \\cos(x) + i\\sin(x)$$

高斯积分：

$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

矩阵运算：

$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} ax + by \\\\ cx + dy \\end{pmatrix}$$`,

  code: `## 代码示例

下面是一个 TypeScript 实现的快速排序算法：

\`\`\`typescript
function quickSort<T>(arr: T[]): T[] {
  if (arr.length <= 1) return arr;

  const pivot = arr[Math.floor(arr.length / 2)];
  const left = arr.filter(x => x < pivot);
  const middle = arr.filter(x => x === pivot);
  const right = arr.filter(x => x > pivot);

  return [...quickSort(left), ...middle, ...quickSort(right)];
}

// 使用示例
const numbers = [3, 1, 4, 1, 5, 9, 2, 6];
console.log(quickSort(numbers)); // [1, 1, 2, 3, 4, 5, 6, 9]
\`\`\`

时间复杂度：平均 $O(n \\log n)$，最坏 $O(n^2)$`,

  chart: `## 数据可视化

下面是销售数据的可视化图表：

\`\`\`echarts
{
  "title": { "text": "2024年季度销售数据", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "legend": { "top": "10%", "data": ["销售额", "利润"] },
  "xAxis": { "type": "category", "data": ["Q1", "Q2", "Q3", "Q4"] },
  "yAxis": { "type": "value", "name": "金额(万元)" },
  "series": [
    { "name": "销售额", "type": "bar", "data": [320, 450, 380, 520] },
    { "name": "利润", "type": "line", "data": [80, 120, 95, 150], "yAxisIndex": 0 }
  ]
}
\`\`\`

从图表可以看出，Q4 的销售额和利润都达到了年度最高点。`,

  mermaid: `## 系统架构图

下面是一个典型的微服务架构：

\`\`\`mermaid
flowchart TB
    subgraph Client
        A[Web App]
        B[Mobile App]
    end

    subgraph Gateway
        C[API Gateway]
        D[Load Balancer]
    end

    subgraph Services
        E[用户服务]
        F[订单服务]
        G[支付服务]
        H[通知服务]
    end

    subgraph Data
        I[(MySQL)]
        J[(Redis)]
        K[(MongoDB)]
    end

    A --> C
    B --> C
    C --> D
    D --> E
    D --> F
    D --> G
    D --> H
    E --> I
    E --> J
    F --> I
    F --> K
    G --> I
    H --> J
\`\`\`

这个架构支持水平扩展和高可用。`,

  mindmap: `## 前端知识体系

\`\`\`mindmap
{
  "name": "前端技术栈",
  "children": [
    {
      "name": "基础",
      "children": [
        { "name": "HTML5" },
        { "name": "CSS3" },
        { "name": "JavaScript" },
        { "name": "TypeScript" }
      ]
    },
    {
      "name": "框架",
      "children": [
        { "name": "Vue 3" },
        { "name": "React 18" },
        { "name": "Angular" },
        { "name": "Svelte" }
      ]
    },
    {
      "name": "工程化",
      "children": [
        { "name": "Vite" },
        { "name": "Webpack" },
        { "name": "ESLint" },
        { "name": "Prettier" }
      ]
    },
    {
      "name": "测试",
      "children": [
        { "name": "Vitest" },
        { "name": "Cypress" },
        { "name": "Playwright" }
      ]
    }
  ]
}
\`\`\``,

  mixed: `## 综合分析报告

### 1. 问题描述

我们需要优化一个排序算法，使其在大数据集上表现更好。

### 2. 算法分析

快速排序的时间复杂度：

$$T(n) = T(k) + T(n-k-1) + \\Theta(n)$$

其中 $k$ 是分区后左侧元素个数。平均情况下 $k \\approx n/2$，因此：

$$T(n) = 2T(n/2) + \\Theta(n) = O(n \\log n)$$

### 3. 代码实现

\`\`\`typescript
function optimizedSort<T>(arr: T[], compareFn?: (a: T, b: T) => number): T[] {
  const compare = compareFn || ((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  // 小数组使用插入排序
  if (arr.length <= 10) {
    return insertionSort(arr, compare);
  }

  // 大数组使用快速排序
  return quickSort(arr, compare);
}
\`\`\`

### 4. 性能对比

\`\`\`echarts
{
  "title": { "text": "排序算法性能对比", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "legend": { "top": "10%" },
  "xAxis": { "type": "category", "data": ["1K", "10K", "100K", "1M"], "name": "数据量" },
  "yAxis": { "type": "value", "name": "耗时(ms)" },
  "series": [
    { "name": "原始算法", "type": "line", "data": [5, 80, 1200, 15000] },
    { "name": "优化后", "type": "line", "data": [3, 45, 600, 7500] }
  ]
}
\`\`\`

优化后性能提升约 **50%**！`,
};

// ==================== UI 配置数据 ====================

/** 建议提问列表 - 符合 SuggestionItem 接口 */
export const SUGGESTIONS: SuggestionItem[] = [
  { key: 'latex', label: '🔢 展示数学公式' },
  { key: 'code', label: '💻 展示代码高亮' },
  { key: 'chart', label: '📊 展示图表' },
  { key: 'mermaid', label: '📐 展示流程图' },
  { key: 'mindmap', label: '🧠 展示思维导图' },
  { key: 'mixed', label: '📋 展示综合报告' },
];

/** 快捷提问 - 用于 Prompts 组件 */
export const PROMPTS = [
  { key: 'latex', label: '数学公式演示', icon: '🔢' },
  { key: 'code', label: '代码高亮演示', icon: '💻' },
  { key: 'chart', label: '图表可视化', icon: '📊' },
  { key: 'mermaid', label: '流程图演示', icon: '📐' },
  { key: 'mindmap', label: '思维导图', icon: '🧠' },
  { key: 'mixed', label: '综合报告', icon: '📋' },
];

/** Welcome 功能特性 - 符合 WelcomeFeature 接口 */
export const WELCOME_FEATURES: WelcomeFeature[] = [
  {
    key: 'latex',
    icon: '🔢',
    title: 'LaTeX 公式',
    description: '渲染数学公式',
  },
  { key: 'code', icon: '💻', title: '代码高亮', description: '多语言语法高亮' },
  {
    key: 'chart',
    icon: '📊',
    title: 'ECharts 图表',
    description: '数据可视化',
  },
  {
    key: 'mermaid',
    icon: '📐',
    title: 'Mermaid 图',
    description: '流程图、时序图',
  },
];

/** Agent 操作按钮 - 符合 AgentAction 接口 */
export const AGENT_ACTIONS: AgentAction[] = [
  { key: 'latex', label: '数学助手', icon: '🔢' },
  { key: 'code', label: '代码助手', icon: '💻' },
  { key: 'chart', label: '图表助手', icon: '📊' },
  { key: 'mermaid', label: '流程助手', icon: '📐', active: true },
];

// ==================== 思考内容生成 ====================

/** 思考内容模板 */
const THINKING_TEMPLATES: Record<string, string> = {
  latex: `用户询问的是数学公式相关内容，我需要使用 LaTeX 语法来渲染数学表达式。让我组织一下回复内容，包含一些常用的数学公式示例...`,
  code: `用户想看代码示例。我需要展示一个清晰的代码片段，包含语法高亮。让我想想用什么编程语言来演示比较合适...`,
  chart: `用户想要查看图表数据。我需要生成一个 ECharts 配置，展示一个直观的可视化图表。让我准备一些示例数据...`,
  mermaid: `用户想要流程图或架构图。我将使用 Mermaid 语法来绘制，这样可以清晰地展示流程或关系结构...`,
  mindmap: `用户需要思维导图。我会使用树形结构来组织知识点，这样可以帮助理解知识体系的层次关系...`,
  mixed: `用户需要一个综合分析报告。我需要整合多种内容格式：文字说明、数据图表、公式计算等，提供一个完整的分析...`,
};

/**
 * 生成思考内容
 */
export function generateThinkingContent(
  matchedType: string,
  userInput: string,
): string {
  if (THINKING_TEMPLATES[matchedType]) {
    return THINKING_TEMPLATES[matchedType];
  }
  return `让我理解一下用户的问题："${userInput.slice(0, 30)}${userInput.length > 30 ? '...' : ''}"。我来组织一个清晰的回复...`;
}

// ==================== Mock API 请求 ====================

/** 内容类型匹配关键词 */
const CONTENT_TYPE_KEYWORDS: Record<string, string[]> = {
  latex: ['latex', '数学', '公式'],
  code: ['code', '代码', '编程'],
  chart: ['chart', '图表', '可视化', '销售'],
  mermaid: ['mermaid', '流程', '架构', '时序'],
  mindmap: ['mindmap', '思维导图', '知识', '技术栈'],
  mixed: ['mixed', '综合', '报告', '分析'],
};

/**
 * 根据用户输入匹配内容类型
 */
export function matchContentType(userInput: string): {
  type: string;
  response: string;
} {
  const input = userInput.toLowerCase();
  const defaultResponse = DEMO_RESPONSES.default ?? '';

  for (const [type, keywords] of Object.entries(CONTENT_TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => input.includes(keyword))) {
      return { type, response: DEMO_RESPONSES[type] ?? defaultResponse };
    }
  }

  return { type: 'default', response: defaultResponse };
}

/**
 * 模拟 AI API 请求（流式响应）
 * 根据用户输入返回对应的演示内容
 *
 * 注意：useXAgent 传递的是 AgentRequestInfo 类型，包含：
 * - message: string (当前用户消息)
 * - messages: ChatMessage[] (完整消息历史)
 *
 * 优化策略：
 * - 特殊内容（图表、思维导图、mermaid）一次性输出，避免渲染错误
 * - 普通内容逐字符输出，展示打字效果
 * - 使用 <think> 标签包裹思考内容
 */
export async function mockAPIRequest(
  info: AgentRequestInfo,
  callbacks: AgentCallbacks,
): Promise<void> {
  // 使用 message 字段获取当前用户输入
  const userInput = info.message.toLowerCase();
  console.log('[MockAPI] 用户输入:', userInput);

  // 匹配内容类型
  const { type: matchedType, response } = matchContentType(userInput);
  console.log('[MockAPI] 匹配类型:', matchedType);

  // 判断是否为特殊内容（图表、思维导图、mermaid 等需要完整数据才能渲染）
  const isSpecialContent = ['chart', 'mindmap', 'mermaid'].includes(
    matchedType,
  );

  // 生成思考内容
  const thinkingContent = generateThinkingContent(matchedType, userInput);

  // 1. 先发送思考内容（使用特殊标记）
  let thinkingText = '';
  for (let i = 0; i < thinkingContent.length; i++) {
    thinkingText += thinkingContent[i];
    // 使用 <think> 标签包裹思考内容
    callbacks.onUpdate?.(`<think>${thinkingText}</think>`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }

  // 思考完成，开始输出实际内容
  await new Promise((resolve) => setTimeout(resolve, 300));

  // 模拟流式响应
  let currentText = '';

  if (isSpecialContent) {
    // 特殊内容：一次性输出完整内容，避免渲染错误
    callbacks.onUpdate?.(`<think>${thinkingContent}</think>\n\n${response}`);
  } else {
    // 普通内容：逐字符打字效果
    for (let i = 0; i < response.length; i++) {
      currentText += response[i];
      callbacks.onUpdate?.(
        `<think>${thinkingContent}</think>\n\n${currentText}`,
      );
      // 每个字符间隔 20-40ms，模拟真实打字速度
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  callbacks.onSuccess?.(`<think>${thinkingContent}</think>\n\n${response}`);
}

/**
 * 创建自定义 Mock API 请求
 * 可配置延迟、是否包含思考过程等
 */
export function createMockAPIRequest(
  options: {
    /** 思考内容输出延迟 (ms) */
    thinkingDelay?: number;
    /** 内容输出延迟 (ms) */
    contentDelay?: number;
    /** 是否包含思考过程 */
    includeThinking?: boolean;
    /** 自定义响应内容 */
    customResponses?: Record<string, string>;
  } = {},
) {
  const {
    thinkingDelay = 15,
    contentDelay = 25,
    includeThinking = true,
    customResponses = {},
  } = options;

  const responses = { ...DEMO_RESPONSES, ...customResponses };

  return async function (
    info: AgentRequestInfo,
    callbacks: AgentCallbacks,
  ): Promise<void> {
    const userInput = info.message.toLowerCase();
    const { type: matchedType } = matchContentType(userInput);
    const response = responses[matchedType] ?? responses.default ?? '';
    const isSpecialContent = ['chart', 'mindmap', 'mermaid'].includes(
      matchedType,
    );

    if (includeThinking) {
      const thinkingContent = generateThinkingContent(matchedType, userInput);

      // 输出思考内容
      let thinkingText = '';
      for (let i = 0; i < thinkingContent.length; i++) {
        thinkingText += thinkingContent[i];
        callbacks.onUpdate?.(`<think>${thinkingText}</think>`);
        await new Promise((resolve) => setTimeout(resolve, thinkingDelay));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 输出实际内容
      if (isSpecialContent) {
        callbacks.onUpdate?.(
          `<think>${thinkingContent}</think>\n\n${response}`,
        );
      } else {
        let currentText = '';
        for (let i = 0; i < response.length; i++) {
          currentText += response[i];
          callbacks.onUpdate?.(
            `<think>${thinkingContent}</think>\n\n${currentText}`,
          );
          await new Promise((resolve) => setTimeout(resolve, contentDelay));
        }
      }
      callbacks.onSuccess?.(`<think>${thinkingContent}</think>\n\n${response}`);
    } else {
      // 不包含思考过程
      if (isSpecialContent) {
        callbacks.onUpdate?.(response);
      } else {
        let currentText = '';
        for (let i = 0; i < response.length; i++) {
          currentText += response[i];
          callbacks.onUpdate?.(currentText);
          await new Promise((resolve) => setTimeout(resolve, contentDelay));
        }
      }
      callbacks.onSuccess?.(response);
    }
  };
}
