import type { Meta, StoryObj } from '@storybook/vue3';
import { expect } from 'storybook/test';
import { BubbleList } from '../src';
import type { ChatMessage, RoleConfig } from '../src';
import { textBlock } from '../src/utils/helpers';

const roles: Record<string, RoleConfig> = {
  user: { placement: 'end', variant: 'filled' },
  ai: { placement: 'start', variant: 'filled' },
};

const baseMessages: ChatMessage[] = [
  { id: '1', role: 'user', content: [textBlock('你好！请介绍一下你自己。')], status: 'local' },
  {
    id: '2',
    role: 'ai',
    content: [
      textBlock(
        '你好！我是 AI 助手，可以帮你回答问题、写代码、分析数据等。有什么我可以帮到你的吗？',
      ),
    ],
    status: 'success',
  },
  {
    id: '3',
    role: 'user',
    content: [textBlock('帮我解释一下什么是 Vue 3 的 Composition API？')],
    status: 'local',
  },
  {
    id: '4',
    role: 'ai',
    content: [
      textBlock(
        'Vue 3 的 Composition API 是一套基于函数的 API，允许你按逻辑关注点组织组件代码，而不是按选项（data/methods/computed）拆分。核心是 setup() 函数或 <script setup> 语法糖，配合 ref、reactive、computed、watch 等响应式工具使用。',
      ),
    ],
    status: 'success',
  },
  { id: '5', role: 'user', content: [textBlock('能举个简单的例子吗？')], status: 'local' },
  {
    id: '6',
    role: 'ai',
    content: [
      textBlock(
        '当然！一个最简单的计数器示例：\n\nconst count = ref(0)\nconst increment = () => count.value++\n\n这样就封装了状态和操作逻辑，可以轻松复用。',
      ),
    ],
    status: 'success',
  },
];

const meta: Meta<typeof BubbleList> = {
  title: 'AI Chat/BubbleList',
  tags: ['autodocs'],
  component: BubbleList,
  args: {
    items: baseMessages,
    roles,
    autoScroll: true,
  },
  // BubbleList 使用 virtua 虚拟滚动，需要外层提供高度
  render: (args) => ({
    components: { BubbleList },
    setup: () => ({ args }),
    template: `<div style="height:360px"><BubbleList v-bind="args" /></div>`,
  }),
};
export default meta;
type Story = StoryObj<typeof BubbleList>;

/** 默认：6 条 user/ai 交替消息 */
export const Default: Story = {};

/**
 * 流式接收态：末条消息 status 为 updating，展示已到达的增量文本。
 * 注意：status='loading' 是「已发请求、等待首个 chunk」的占位态（仅显示跳动圆点、不渲染 content）；
 * 真正边接收边显示文本的流式态是 'updating'。
 */
export const Streaming: Story = {
  args: {
    items: [
      ...baseMessages.slice(0, 5),
      {
        id: '6',
        role: 'ai',
        content: [textBlock('当然！一个最简单的计数器示例：\nconst count = ref(0)')],
        status: 'updating',
      },
    ],
  },
};

/** 等待首个 chunk 的纯占位态：末条 status 为 loading，仅显示跳动圆点 */
export const Loading: Story = {
  args: {
    items: [...baseMessages.slice(0, 5), { id: '6', role: 'ai', content: [], status: 'loading' }],
  },
};

/** 少量消息：只有 2 条 */
export const FewMessages: Story = {
  args: {
    items: [
      { id: '1', role: 'user', content: [textBlock('你好！')], status: 'local' },
      {
        id: '2',
        role: 'ai',
        content: [textBlock('你好！有什么我可以帮你的吗？')],
        status: 'success',
      },
    ],
  },
};

/** 出错态：末条 AI 消息 status 为 error，由组件渲染错误提示 + 重试按钮 */
export const WithError: Story = {
  args: {
    items: [
      { id: '1', role: 'user', content: [textBlock('请帮我做个复杂分析')], status: 'local' },
      { id: '2', role: 'ai', content: [], status: 'error' },
    ],
  },
  play: async ({ canvas }) => {
    // 出错气泡应由组件呈现重试按钮（而非把错误文案塞进 content）。
    // 真实 virtua 列表异步渲染（ResizeObserver 测量后才挂载项），用 findByRole 等待渲染完成。
    const retry = await canvas.findByRole('button', { name: '重试' });
    await expect(retry).toBeInTheDocument();
  },
};
