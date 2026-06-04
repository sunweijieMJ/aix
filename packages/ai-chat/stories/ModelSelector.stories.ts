import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, fn } from 'storybook/test';
import { ModelSelector } from '../src';

const meta: Meta<typeof ModelSelector> = {
  title: 'AI Chat/ModelSelector',
  component: ModelSelector,
  args: {
    options: [{ value: 'Qwen3-Max' }, { value: 'DeepSeek-V3' }, { value: 'GPT-4o' }],
    modelValue: 'Qwen3-Max',
    placement: 'bottom',
    'onUpdate:modelValue': fn(),
  },
  argTypes: {
    placement: { control: 'inline-radio', options: ['top', 'bottom'] },
  },
  render: (args) => ({
    components: { ModelSelector },
    setup: () => ({ args }),
    template: `<div style="padding:80px"><ModelSelector v-bind="args" @update:modelValue="args['onUpdate:modelValue']" /></div>`,
  }),
};
export default meta;
type Story = StoryObj<typeof ModelSelector>;

/** 默认：显示当前模型，点击展开选择 */
export const Default: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText('Qwen3-Max')).toBeInTheDocument();
    await userEvent.click(canvas.getByText('Qwen3-Max'));
    await userEvent.click(canvas.getByText('DeepSeek-V3'));
    await expect(args['onUpdate:modelValue']).toHaveBeenCalledWith('DeepSeek-V3');
  },
};

/** 向上弹出（用于位于面板底部输入框的场景） */
export const PlacementTop: Story = {
  args: { placement: 'top' },
};
