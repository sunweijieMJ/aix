import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, fn } from 'storybook/test';
import { BubbleActions } from '../src';

const meta: Meta<typeof BubbleActions> = {
  title: 'AI Chat/BubbleActions',
  component: BubbleActions,
  args: {
    content: '这是一段可被复制的 AI 回复文本。',
    reloadable: true,
    onCopy: fn(),
    onRegenerate: fn(),
    onFeedback: fn(),
  },
  argTypes: {
    content: { control: 'text' },
    reloadable: { control: 'boolean' },
    feedbackable: { control: 'boolean' },
  },
  render: (args) => ({
    components: { BubbleActions },
    setup: () => ({ args }),
    template: `<BubbleActions v-bind="args" @copy="args.onCopy" @regenerate="args.onRegenerate" @feedback="args.onFeedback" />`,
  }),
};
export default meta;
type Story = StoryObj<typeof BubbleActions>;

/** 默认：复制 + 重新生成两个操作 */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('button')).toHaveLength(2);
  },
};

/** 仅复制：reloadable=false 隐藏重新生成 */
export const CopyOnly: Story = {
  args: { reloadable: false },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('button')).toHaveLength(1);
  },
};

/** 点击重新生成触发 regenerate 事件 */
export const Regenerate: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: '重新生成' }));
    await expect(args.onRegenerate).toHaveBeenCalledTimes(1);
  },
};

/** Feedbackable：开启反馈按钮（赞同 / 反对），点击触发 feedback 事件 */
export const Feedbackable: Story = {
  args: { feedbackable: true },
  play: async ({ canvas, args }) => {
    const likeBtn = await canvas.findByRole('button', { name: '赞同' });
    await userEvent.click(likeBtn);
    await expect(args.onFeedback).toHaveBeenCalledTimes(1);
  },
};
