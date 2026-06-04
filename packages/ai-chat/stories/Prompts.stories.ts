import type { Meta, StoryObj } from '@storybook/vue3';
import { fn, expect, userEvent } from 'storybook/test';
import { Prompts } from '../src';
import type { PromptItem } from '../src';

const defaultItems: PromptItem[] = [
  { key: '1', label: '帮我写一段 Python 脚本' },
  { key: '2', label: '解释量子纠缠原理' },
  { key: '3', label: '给我一个前端面试题' },
  { key: '4', label: '分析这份代码的性能瓶颈' },
];

const meta: Meta<typeof Prompts> = {
  title: 'AI Chat/Prompts',
  component: Prompts,
  args: {
    items: defaultItems,
    onSelect: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof Prompts>;

/** 默认态：展示 4 个快捷提示按钮 */
export const Default: Story = {
  render: (args) => ({
    components: { Prompts },
    setup: () => ({ args }),
    template: `<Prompts v-bind="args" @select="args.onSelect" />`,
  }),
  play: async ({ canvas, args }) => {
    // 找到第一个提示按钮并点击
    const [first] = canvas.getAllByRole('button');
    if (!first) throw new Error('未渲染出任何提示按钮');
    await userEvent.click(first);
    // 断言 onSelect 被调用，且参数是第一个 item
    await expect(args.onSelect).toHaveBeenCalledWith(defaultItems[0]);
  },
};

/** 少量条目 */
export const FewItems: Story = {
  args: {
    items: [
      { key: 'a', label: '写一首诗' },
      { key: 'b', label: '翻译成英文' },
    ],
    onSelect: fn(),
  },
  render: (args) => ({
    components: { Prompts },
    setup: () => ({ args }),
    template: `<Prompts v-bind="args" @select="args.onSelect" />`,
  }),
};
