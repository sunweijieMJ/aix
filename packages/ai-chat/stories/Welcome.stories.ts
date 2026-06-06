import type { Meta, StoryObj } from '@storybook/vue3';
import { fn, expect, userEvent } from 'storybook/test';
import { Welcome, Prompts } from '../src';
import type { PromptItem } from '../src';

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

// ──────────────────────────────────────────────
// Prompts stories（迁移自 Prompts.stories.ts）
// story 名加前缀 Prompts* 避免与 Welcome stories 撞名
// ──────────────────────────────────────────────

const defaultPromptItems: PromptItem[] = [
  { key: '1', label: '帮我写一段 Python 脚本' },
  { key: '2', label: '解释量子纠缠原理' },
  { key: '3', label: '给我一个前端面试题' },
  { key: '4', label: '分析这份代码的性能瓶颈' },
];

// Prompts 独立 story 类型（meta.component 为 Welcome，故 Prompts story 单独绑组件类型）
type PromptsStory = StoryObj<typeof Prompts>;

/** Prompts · 默认态：展示 4 个快捷提示按钮 */
export const PromptsDefault: PromptsStory = {
  args: {
    items: defaultPromptItems,
    onSelect: fn(),
  },
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
    await expect(args.onSelect).toHaveBeenCalledWith(defaultPromptItems[0]);
  },
};

/** Prompts · 少量条目 */
export const PromptsFewItems: PromptsStory = {
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
