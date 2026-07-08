import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { ref } from 'vue';
import { Conversations } from '../src';
import type { ConversationItem } from '../src';

const meta: Meta<typeof Conversations> = {
  title: 'AI Chat/组件/Conversations',
  tags: ['autodocs'],
  component: Conversations,
  parameters: {
    docs: {
      description: {
        component:
          '受控会话列表 UI：`items`（来自 useConversations.items）+ `v-model:activeKey` + 行内重命名 / 删除 / 新建。' +
          '本身不含存储逻辑——与 `useConversations`（会话状态 + 持久化）配合，经 AiChat 的 `v-model:messages` 切换当前会话消息。',
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof Conversations>;

const demoItems: ConversationItem[] = [
  { id: 'a', label: '梵高《向日葵》赏析', group: '今天' },
  { id: 'b', label: 'TypeScript 类型体操', group: '今天' },
  { id: 'c', label: '上周的方案讨论', group: '更早' },
];

/** 独立列表（受控）：分组 + 选中 + 行内重命名 / 删除 / 新建 */
export const List: Story = {
  render: () => ({
    components: { Conversations },
    setup: () => {
      const activeKey = ref('a');
      const items = ref([...demoItems]);
      return { activeKey, items };
    },
    template: `
      <div style="width:260px;height:420px;border:1px solid var(--aix-colorBorderSecondary);border-radius:12px;overflow:hidden">
        <Conversations
          :items="items"
          v-model:activeKey="activeKey"
          groupable
          @create="items.unshift({ id: 'n'+Date.now(), label: '新对话', group: '今天' })"
          @delete="(id) => { items = items.filter(i => i.id !== id) }"
          @rename="(id, label) => { const it = items.find(i => i.id === id); if (it) it.label = label }"
        />
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    await canvas.findByText('梵高《向日葵》赏析');
    await canvas.findByText('今天');
    await canvas.findByText('更早');
  },
};

/** 内置搜索：按 label 模糊匹配（大小写不敏感），与 groupable 可叠加使用 */
export const Searchable: Story = {
  render: () => ({
    components: { Conversations },
    setup: () => {
      const activeKey = ref('a');
      const items = ref([...demoItems]);
      return { activeKey, items };
    },
    template: `
      <div style="width:260px;height:420px;border:1px solid var(--aix-colorBorderSecondary);border-radius:12px;overflow:hidden">
        <Conversations
          :items="items"
          v-model:activeKey="activeKey"
          groupable
          searchable
          @create="items.unshift({ id: 'n'+Date.now(), label: '新对话', group: '今天' })"
          @delete="(id) => { items = items.filter(i => i.id !== id) }"
          @rename="(id, label) => { const it = items.find(i => i.id === id); if (it) it.label = label }"
        />
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    await canvas.findByText('梵高《向日葵》赏析');
    const input = await canvas.findByPlaceholderText('搜索会话');
    await userEvent.type(input, 'type');
    // 输入英文关键字后：仅命中「TypeScript 类型体操」，其余两项被过滤
    await waitFor(() => expect(canvas.queryByText('梵高《向日葵》赏析')).toBeNull());
    await canvas.findByText('TypeScript 类型体操');
    expect(canvas.queryByText('上周的方案讨论')).toBeNull();
    // 清空后恢复全部会话
    await userEvent.clear(input);
    await canvas.findByText('梵高《向日葵》赏析');
    await canvas.findByText('上周的方案讨论');
  },
};

/** 加载中：loading=true 时列表区域渲染骨架占位，忽略 items（会话列表从后端拉取中使用） */
export const Loading: Story = {
  render: () => ({
    components: { Conversations },
    template: `
      <div style="width:260px;height:420px;border:1px solid var(--aix-colorBorderSecondary);border-radius:12px;overflow:hidden">
        <Conversations :items="[]" loading />
      </div>
    `,
  }),
};
