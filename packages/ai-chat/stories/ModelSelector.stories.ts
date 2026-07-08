import type { Meta, StoryObj } from '@storybook/vue3';
import { userEvent } from 'storybook/test';
import { ref } from 'vue';
import { ModelSelector } from '../src';
import type { ModelOption } from '../src';

const options: ModelOption[] = [
  { value: 'Qwen3-Max' },
  { value: 'DeepSeek-V3' },
  { value: 'GPT-4o' },
];

const meta: Meta<typeof ModelSelector> = {
  title: 'AI Chat/组件/ModelSelector',
  tags: ['autodocs'],
  component: ModelSelector,
  args: { options, modelValue: 'Qwen3-Max' },
};
export default meta;
type Story = StoryObj<typeof ModelSelector>;

/** 默认态：点击展开下拉，列出全部模型选项 */
export const Default: Story = {
  render: (args) => ({
    components: { ModelSelector },
    setup: () => {
      const value = ref(args.modelValue);
      return { args, value };
    },
    template: `<ModelSelector v-bind="args" v-model="value" />`,
  }),
};

/** 加载态：options 来自接口尚未就绪时，展开菜单渲染骨架占位而非真实选项 */
export const Loading: Story = {
  args: { options: [], loading: true, placeholder: '选择模型' },
  render: (args) => ({
    components: { ModelSelector },
    setup: () => ({ args }),
    template: `<ModelSelector v-bind="args" />`,
  }),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button'));
  },
};
