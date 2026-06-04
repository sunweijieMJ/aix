import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent } from 'storybook/test';
import { ReasoningBlock } from '../src';
import type { ReasoningBlockProps } from '../src';
import type { BubbleContentInfo, ContentBlock } from '../src/types';

const block = {
  id: 'r1',
  type: 'reasoning',
  text: '先拆解用户意图，再检索相关知识，最后组织回答。',
} as Extract<ContentBlock, { type: 'reasoning' }>;
const info = (status: BubbleContentInfo['status']): BubbleContentInfo => ({
  status,
  role: 'ai',
  key: 'k',
});

const meta: Meta<ReasoningBlockProps> = {
  title: 'AI Chat/ReasoningBlock',
  component: ReasoningBlock,
  argTypes: {
    block: { control: false },
    info: { control: false },
    typing: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<ReasoningBlockProps>;

/** 历史消息（success）：思考过程默认折叠，点击标题展开 */
export const Collapsed: Story = {
  args: { block, info: info('success') },
  play: async ({ canvas }) => {
    // 默认折叠：内容不在 DOM
    await expect(canvas.queryByText(/先拆解用户意图/)).toBeNull();
    // 点击「思考过程」标题展开
    await userEvent.click(canvas.getByText('思考过程'));
    await canvas.findByText(/先拆解用户意图/);
  },
};

/** 流式中（updating）：思考过程自动展开 */
export const Streaming: Story = {
  args: { block, info: info('updating') },
  play: async ({ canvas }) => {
    await canvas.findByText(/先拆解用户意图/);
  },
};
