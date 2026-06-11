import { Refresh } from '@aix/icons';
import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, fn } from 'storybook/test';
import { markRaw } from 'vue';
import { BubbleActions } from '../src';

const meta: Meta<typeof BubbleActions> = {
  title: 'AI Chat/BubbleActions',
  tags: ['autodocs'],
  component: BubbleActions,
  args: {
    content: '这是一段可被复制的 AI 回复文本。',
    items: ['copy', 'regenerate'],
    onCopy: fn(),
    onRegenerate: fn(),
    onFeedback: fn(),
  },
  argTypes: {
    content: { control: 'text' },
    items: { control: 'object' },
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

/** 仅复制：items 只含 copy，隐藏重新生成 */
export const CopyOnly: Story = {
  args: { items: ['copy'] },
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

/** Feedbackable：items 含 feedback 开启反馈按钮（赞同 / 反对），点击触发 feedback 事件 */
export const Feedbackable: Story = {
  args: { items: ['copy', 'regenerate', 'feedback'] },
  play: async ({ canvas, args }) => {
    const likeBtn = await canvas.findByRole('button', { name: '赞同' });
    await userEvent.click(likeBtn);
    await expect(args.onFeedback).toHaveBeenCalledTimes(1);
  },
};

/**
 * CustomItems：混合内置预设与自定义操作项。
 * items 包含内置 `copy`、`regenerate` 与自定义 `share`（带 Refresh 图标）；
 * play 断言共 3 个按钮，且第三个按钮 aria-label 为「分享」。
 */
export const CustomItems: Story = {
  args: {
    content: '可复制的内容',
    items: [
      'copy',
      'regenerate',
      {
        key: 'share',
        label: '分享',
        icon: markRaw(Refresh),
        onClick: () => console.log('share'),
      },
    ],
  },
  play: async ({ canvas }) => {
    const buttons = await canvas.findAllByRole('button');
    await expect(buttons).toHaveLength(3);
    // 第三个按钮为自定义「分享」
    const shareBtn = canvas.getByRole('button', { name: '分享' });
    await expect(shareBtn).toBeInTheDocument();
  },
};
