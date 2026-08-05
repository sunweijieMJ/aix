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

/**
 * 列表项定制：`#item` 换整行、`#item-actions` 只换操作区、`#empty` 换空态。
 *
 * 三个插槽的作用域都带 `item` / `active` 与已绑定到该条的 `select` / `rename` / `remove`
 * 句柄——它们与内置按钮走同一条实现（含「重命名期间不切换选中」这类守卫），
 * 自定义 UI 不必自行复刻，也不会与内置行为分叉。
 *
 * `rename()` 进入的是**内置**内联重命名态（输入框接管该行）；不想用它的实现从不调用即可。
 */
export const ItemSlots: Story = {
  render: () => ({
    components: { Conversations },
    setup: () => {
      const activeKey = ref('a');
      const list = ref<ConversationItem[]>([
        { id: 'a', label: '梵高《向日葵》赏析', group: '今天', timestamp: Date.now() },
        { id: 'b', label: 'TypeScript 类型体操', group: '今天', timestamp: Date.now() - 3.6e6 },
        { id: 'c', label: '上周的方案讨论', group: '更早', timestamp: Date.now() - 6 * 864e5 },
      ]);
      const pinned = ref(new Set(['b']));
      const fmt = (ts?: number) =>
        ts ? new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
      const togglePin = (id: string) => {
        const next = new Set(pinned.value);
        if (!next.delete(id)) next.add(id);
        pinned.value = next;
      };
      const remove = (id: string) => {
        list.value = list.value.filter((c) => c.id !== id);
      };
      const rename = (id: string, label: string) => {
        const c = list.value.find((x) => x.id === id);
        if (c) c.label = label;
      };
      return { activeKey, list, pinned, fmt, togglePin, remove, rename };
    },
    template: `
      <div style="width:280px;height:420px;border:1px solid var(--aix-colorBorderSecondary);border-radius:12px;overflow:hidden">
        <Conversations
          :items="list"
          v-model:activeKey="activeKey"
          groupable
          @delete="remove"
          @rename="rename"
        >
          <!-- 整行自定义：置顶徽标 + 标题 + 时间戳 -->
          <template #item="{ item, active, select }">
            <button
              type="button"
              @click="select"
              :style="{
                display:'flex', alignItems:'center', gap:'6px', flex:1, minWidth:0, height:'100%',
                padding:0, border:'none', background:'transparent', cursor:'pointer', textAlign:'left',
                color: active ? 'var(--aix-colorPrimary)' : 'inherit',
              }"
            >
              <span v-if="pinned.has(item.id)" style="flex:none">📌</span>
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                {{ item.label }}
              </span>
              <span style="flex:none;font-size:var(--aix-fontSizeSM);color:var(--aix-colorTextTertiary)">
                {{ fmt(item.timestamp) }}
              </span>
            </button>
          </template>
        </Conversations>
      </div>
    `,
  }),
};

/** 只换操作区：保留内置标题按钮与省略行为，追加一个「置顶」动作 */
export const ItemActionsSlot: Story = {
  render: () => ({
    components: { Conversations },
    setup: () => {
      const activeKey = ref('a');
      const pinned = ref(new Set<string>());
      const togglePin = (id: string) => {
        const next = new Set(pinned.value);
        if (!next.delete(id)) next.add(id);
        pinned.value = next;
      };
      return { activeKey, demoItems, pinned, togglePin };
    },
    template: `
      <div style="width:280px;height:420px;border:1px solid var(--aix-colorBorderSecondary);border-radius:12px;overflow:hidden">
        <Conversations :items="demoItems" v-model:activeKey="activeKey" groupable>
          <template #item-actions="{ item, rename, remove }">
            <button type="button" class="aix-conversations__action" :title="pinned.has(item.id) ? '取消置顶' : '置顶'" @click.stop="togglePin(item.id)">
              {{ pinned.has(item.id) ? '📌' : '📍' }}
            </button>
            <button type="button" class="aix-conversations__action" title="重命名" @click.stop="rename">✎</button>
            <button type="button" class="aix-conversations__action" title="删除" @click.stop="remove">🗑</button>
          </template>
        </Conversations>
      </div>
    `,
  }),
};
