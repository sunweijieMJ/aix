import type { Meta, StoryObj } from '@storybook/vue3';
import { expect, userEvent, waitFor } from 'storybook/test';
import { ref } from 'vue';
import { Conversations, AiChat, useConversations } from '../src';
import type { ConversationItem } from '../src';

const meta: Meta<typeof Conversations> = {
  title: 'AI Chat/Conversations',
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

// ============ 集成：useConversations × Conversations × AiChat ============

/** 把一段文本按扁平 SSE 协议流式输出 */
function streamText(text: string, signal?: AbortSignal): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      let i = 0;
      const timer = setInterval(() => {
        if (signal?.aborted || i >= text.length) {
          if (i >= text.length) c.enqueue(enc.encode('data: [DONE]\n\n'));
          clearInterval(timer);
          try {
            c.close();
          } catch {
            /* ignore */
          }
          return;
        }
        c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: text.slice(i, i + 3) })}\n\n`));
        i += 3;
      }, 16);
    },
  });
}

/**
 * 完整会话历史：左侧 `Conversations` + 右侧 `AiChat`，由 `useConversations` 统一管理。
 * - 新建 / 切换 / 删除 / 重命名会话；
 * - 切换会话即切换 AiChat 的消息（`v-model:messages="activeMessages"`）；
 * - 切换时若有在途生成会自动中断（AiChat 内置守卫）。
 * 此示例为内存态（未接持久化）；接 localStorage 只需 `useConversations({ storage: localStorageConversationStorage('key') })`。
 */
export const WithChatHistory: StoryObj = {
  render: () => ({
    components: { Conversations, AiChat },
    setup: () => {
      const conv = useConversations({
        defaultConversations: [
          { id: 'first', label: '示例会话', timestamp: Date.now(), messages: [] },
        ],
      });
      const request = ({ signal }: { signal: AbortSignal }) =>
        Promise.resolve(
          streamText('这是该会话的流式回答。切到别的会话再切回来，消息会被保留。', signal),
        );
      return { conv, request };
    },
    template: `
      <div style="display:flex;height:540px;max-width:900px;margin:0 auto;border:1px solid var(--aix-colorBorderSecondary);border-radius:12px;overflow:hidden">
        <div style="width:240px;border-right:1px solid var(--aix-colorBorderSecondary)">
          <Conversations
            :items="conv.items.value"
            v-model:activeKey="conv.activeKey.value"
            @create="conv.create()"
            @delete="conv.remove"
            @rename="conv.rename"
          />
        </div>
        <div style="flex:1;min-width:0">
          <AiChat :request="request" v-model:messages="conv.activeMessages.value" placeholder="发消息试试，再新建/切换会话…" />
        </div>
      </div>
    `,
  }),
  play: async ({ canvas }) => {
    // 发一条消息，等待流式回答出现
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.type(textarea, '你好');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(canvas.getByText(/流式回答/)).toBeTruthy(), { timeout: 5000 });
    // 新建会话后回到空态（Welcome）
    await userEvent.click(canvas.getByRole('button', { name: '新建会话' }));
    await waitFor(() => expect(canvas.queryByText(/流式回答/)).toBeNull(), { timeout: 5000 });
  },
};
