import type { Meta, StoryObj } from '@storybook/vue3';
import { SenderSkeleton } from '../src';

/**
 * Sender 外壳骨架占位：业务在 Sender 依赖的外部数据（模型列表 / triggers 候选源等）
 * 未就绪时，用它替代真实 Sender 展示，就绪后切换回 `<Sender>`。无 props，纯静态展示。
 */
const meta: Meta<typeof SenderSkeleton> = {
  title: 'AI Chat/SenderSkeleton',
  tags: ['autodocs'],
  component: SenderSkeleton,
};
export default meta;
type Story = StoryObj<typeof SenderSkeleton>;

export const Default: Story = {
  render: () => ({
    components: { SenderSkeleton },
    template: `<div style="max-width:640px"><SenderSkeleton /></div>`,
  }),
};
