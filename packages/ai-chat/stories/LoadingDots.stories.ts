import type { Meta, StoryObj } from '@storybook/vue3';
import { LoadingDots } from '../src';

/**
 * 共享「进度指示」组件：三点跳动，语义是「结构已知、正在等待过程性结果」——
 * 用于 Bubble 消息级 loading、ToolUseBlock 工具调用中、ThoughtChainBlock 首个 step 未到达。
 * 与结构骨架（Skeleton）不同：骨架回答「这里将会是什么形状」，本组件回答「系统正在做事」。
 */
const meta: Meta<typeof LoadingDots> = {
  title: 'AI Chat/LoadingDots',
  tags: ['autodocs'],
  component: LoadingDots,
};
export default meta;
type Story = StoryObj<typeof LoadingDots>;

export const Default: Story = {
  render: () => ({
    components: { LoadingDots },
    template: `<LoadingDots />`,
  }),
};
