import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, fn } from 'storybook/test';
import { ResultCard } from '../src';

const meta: Meta<typeof ResultCard> = {
  title: 'AI Chat/ResultCard',
  component: ResultCard,
  args: { title: '单项选择题', editable: true, onEdit: fn() },
  render: (args) => ({
    components: { ResultCard },
    setup: () => ({ args }),
    template: `
      <ResultCard v-bind="args" @edit="args.onEdit" style="width:408px">
        <p style="margin:0">题干：关于梵高《向日葵》下列说法正确是（ ）</p>
        <p style="margin:12px 0 0">标准答案： B</p>
        <template #actions>
          <button>＋ 插入视频</button>
          <button style="color:var(--aix-colorError)">🗑 删除</button>
        </template>
      </ResultCard>
    `,
  }),
};
export default meta;
type Story = StoryObj<typeof ResultCard>;

/** 带标题 + 编辑 + 操作的输出卡片 */
export const Default: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText('单项选择题')).toBeInTheDocument();
    await expect(canvas.getByText(/插入视频/)).toBeInTheDocument();
    // 点击编辑按钮触发 edit
    await userEvent.click(canvas.getByLabelText('编辑'));
    await expect(args.onEdit).toHaveBeenCalledTimes(1);
  },
};

/** 无标题/不可编辑：纯内容卡片 */
export const ContentOnly: Story = {
  args: { title: '', editable: false },
};
