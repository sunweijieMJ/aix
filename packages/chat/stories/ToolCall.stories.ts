import type { ToolCall } from '@aix/chat-sdk';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { ToolCallUI, ToolCallList } from '../src/components/ToolCall';

const meta: Meta<typeof ToolCallUI> = {
  title: 'Chat/ToolCall',
  component: ToolCallUI,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Tool Call 可视化组件，用于展示 LLM 的函数调用过程和结果。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础用法 - 成功状态
 */
export const Basic: Story = {
  render: () => ({
    components: { ToolCallUI },
    setup() {
      const toolCall: ToolCall = {
        id: 'tc-1',
        name: 'search_web',
        status: 'success',
        args: {
          query: 'Vue 3 Composition API',
          limit: 10,
        },
        result: {
          count: 42,
          items: [
            { title: 'Vue 3 官方文档', url: 'https://vuejs.org' },
            {
              title: 'Composition API RFC',
              url: 'https://github.com/vuejs/rfcs',
            },
          ],
        },
        startTime: Date.now() - 1200,
        endTime: Date.now(),
      };

      return { toolCall };
    },
    template: `
      <div style="max-width: 800px; padding: 20px;">
        <ToolCallUI :tool-call="toolCall" />
      </div>
    `,
  }),
};

/**
 * 工具调用列表
 */
export const ToolCallListExample: Story = {
  render: () => ({
    components: { ToolCallList },
    setup() {
      const toolCalls = ref<ToolCall[]>([
        {
          id: 'tc-1',
          name: 'search_web',
          status: 'success',
          args: { query: 'Vue 3' },
          result: { count: 10, items: ['...'] },
          startTime: Date.now() - 3000,
          endTime: Date.now() - 2500,
        },
        {
          id: 'tc-2',
          name: 'analyze_data',
          status: 'success',
          args: { data: ['item1', 'item2'] },
          result: { summary: 'Analysis complete' },
          startTime: Date.now() - 2000,
          endTime: Date.now() - 1500,
        },
        {
          id: 'tc-3',
          name: 'generate_report',
          status: 'running',
          args: { format: 'pdf' },
          startTime: Date.now() - 1000,
        },
        {
          id: 'tc-4',
          name: 'send_notification',
          status: 'pending',
          args: { message: 'Report ready' },
        },
      ]);

      return { toolCalls };
    },
    template: `
      <div style="max-width: 900px; padding: 20px;">
        <ToolCallList :tool-calls="toolCalls" />
      </div>
    `,
  }),
};

/**
 * 交互式示例
 */
export const Interactive: Story = {
  render: () => ({
    components: { ToolCallList },
    setup() {
      const toolCalls = ref<ToolCall[]>([]);

      const simulateToolCall = async (
        name: string,
        args: Record<string, any>,
        resultFn: () => any,
        duration: number,
      ) => {
        const id = `tc-${Date.now()}`;
        const startTime = Date.now();

        toolCalls.value.push({
          id,
          name,
          status: 'pending',
          args,
        });

        await new Promise((resolve) => setTimeout(resolve, 300));

        const index = toolCalls.value.findIndex((tc) => tc.id === id);
        const currentItem = toolCalls.value[index];
        if (currentItem) {
          toolCalls.value[index] = {
            ...currentItem,
            status: 'running',
            startTime,
          };
        }

        await new Promise((resolve) => setTimeout(resolve, duration));

        const updatedItem = toolCalls.value[index];
        if (updatedItem) {
          toolCalls.value[index] = {
            ...updatedItem,
            status: 'success',
            result: resultFn(),
            endTime: Date.now(),
          };
        }
      };

      const runDemo = async () => {
        toolCalls.value = [];

        await simulateToolCall(
          'search_web',
          { query: 'AI 发展趋势' },
          () => ({ count: 128, articles: ['...'] }),
          1500,
        );

        await simulateToolCall(
          'analyze_sentiment',
          { text: '用户反馈内容...' },
          () => ({ score: 0.85, label: 'positive' }),
          1200,
        );

        await simulateToolCall(
          'generate_summary',
          { max_words: 100 },
          () => ({ summary: '总结内容...' }),
          2000,
        );
      };

      return { toolCalls, runDemo };
    },
    template: `
      <div style="max-width: 900px; padding: 20px;">
        <div style="margin-bottom: 20px;">
          <button
            @click="runDemo"
            style="padding: 8px 16px; background: #1677ff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;"
          >
            运行演示
          </button>
        </div>
        <ToolCallList :tool-calls="toolCalls" />
      </div>
    `,
  }),
};
