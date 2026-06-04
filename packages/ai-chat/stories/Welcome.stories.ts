import type { Meta, StoryObj } from '@storybook/vue3';
import { expect } from 'storybook/test';
import { Welcome, Prompts } from '../src';

const meta: Meta<typeof Welcome> = {
  title: 'AI Chat/Welcome',
  component: Welcome,
  args: {
    title: '你好，我是 AI 助手',
    description: '我可以帮你回答问题、写代码、分析数据，随时问我吧！',
  },
};
export default meta;
type Story = StoryObj<typeof Welcome>;

/** 默认态：显示 title + description */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('你好，我是 AI 助手')).toBeInTheDocument();
  },
};

/** 带图标：通过 icon prop 显示图标图片 */
export const WithIcon: Story = {
  args: {
    icon: 'https://api.dicebear.com/7.x/bottts/svg?seed=aix',
    title: '你好，我是 AI 助手',
    description: '有什么我可以帮你的吗？',
  },
};

/** WithExtra：在 extra slot 放置快捷 Prompts 按钮组 */
export const WithExtra: Story = {
  render: (args) => ({
    components: { Welcome, Prompts },
    setup: () => ({
      args,
      promptItems: [
        { key: '1', label: '帮我写一段 Python 代码' },
        { key: '2', label: '解释一下量子计算' },
        { key: '3', label: '总结这篇文章的要点' },
      ],
    }),
    template: `
      <Welcome v-bind="args">
        <template #extra>
          <Prompts :items="promptItems" />
        </template>
      </Welcome>
    `,
  }),
  args: {
    title: '你好，我是 AI 助手',
    description: '选择一个问题快速开始，或直接输入你的问题',
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: '帮我写一段 Python 代码' }),
    ).toBeInTheDocument();
  },
};
