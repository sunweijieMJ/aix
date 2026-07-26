import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import { useConversations } from '../src/composables/useConversations';
import type {
  ConversationStorage,
  UseConversationsReturn,
} from '../src/composables/useConversations';
import type { Conversation } from '../src/types';

// 虚拟列表 stub：jsdom 无真实布局测量，直接平铺渲染（与其余 AiChat.*.test.ts 同口径）
vi.mock('virtua/vue', () => ({
  Virtualizer: {
    name: 'Virtualizer',
    props: ['data', 'keepMounted'],
    setup(
      props: { data: unknown[] },
      { slots }: { slots: Record<string, (p: unknown) => unknown> },
    ) {
      return () => props.data.map((item, i) => slots.default?.({ item, index: i }));
    },
  },
}));

/** 永不产出数据的流：仅用于满足 request 签名，本用例不涉及流式 */
const idleRequest = () => Promise.resolve(new ReadableStream<Uint8Array>({ start() {} }));

const remoteConversations = (): Conversation[] => [
  {
    id: 'c1',
    label: '远端会话',
    messages: [{ id: 'm1', role: 'user', content: [{ id: 'b1', type: 'text', text: '远端历史' }] }],
  },
];

/** 异步 storage（模拟远端 HTTP），并记录每次落盘快照 */
const makeAsyncStorage = (delay = 10) => {
  const saved: Conversation[][] = [];
  const storage: ConversationStorage = {
    load: () =>
      new Promise<Conversation[]>((resolve) =>
        setTimeout(() => resolve(remoteConversations()), delay),
      ),
    save: (list) => {
      saved.push(JSON.parse(JSON.stringify(list)) as Conversation[]);
    },
  };
  return { saved, storage };
};

/**
 * 回归：AiChat 的 v-model:messages 桥接在 setup 期会把内部空 active path 镜像回写给父级
 * （messagesModel.value = messages.value）。当父级是 useConversations.activeMessages 时，
 * 这次「空 → 空」的无效写入曾被计为 localDirty，使异步 storage.load() 的结果被整体丢弃；
 * 且之后任意一次用户变更都会把空的默认会话写回 storage，覆盖已持久化的真实历史。
 *
 * 触发条件是 defaultConversations 含空 messages 的会话 + 异步 storage —— 恰好是
 * historyLoading prop 文档推荐的接法。
 */
describe('AiChat + useConversations 异步 storage 接线（回归：load 结果被镜像回写丢弃）', () => {
  const mountWith = (
    options: Parameters<typeof useConversations>[0],
    bind: 'messages' | 'tree' = 'messages',
  ) => {
    let api!: UseConversationsReturn;
    const Host = defineComponent({
      setup() {
        api = useConversations(options);
        return () =>
          bind === 'messages'
            ? h(AiChat, {
                request: idleRequest,
                messages: api.activeMessages.value,
                'onUpdate:messages': (v: Conversation['messages']) => {
                  api.activeMessages.value = v;
                },
              })
            : h(AiChat, {
                request: idleRequest,
                tree: api.activeTree.value,
                'onUpdate:tree': (v: NonNullable<Conversation['tree']>) => {
                  api.activeTree.value = v;
                },
              });
      },
    });
    const wrapper = mount(Host);
    return { wrapper, api: () => api };
  };

  const settle = async (ms = 40) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await flushPromises();
  };

  it('defaultConversations 含空会话时，storage.load 的远端历史仍然生效', async () => {
    const { storage } = makeAsyncStorage();
    const { api } = mountWith({
      defaultConversations: [{ id: 'c1', label: '新对话', messages: [] }],
      storage,
    });
    await settle();
    expect(api().active.value?.label).toBe('远端会话');
    expect(api().active.value?.messages).toHaveLength(1);
  });

  it('load 生效后的用户变更不会用空默认覆盖已持久化的远端历史', async () => {
    const { saved, storage } = makeAsyncStorage();
    const { api } = mountWith({
      defaultConversations: [{ id: 'c1', label: '新对话', messages: [] }],
      storage,
      saveDebounce: 5,
    });
    await settle();
    api().rename('c1', '用户改名'); // 一次普通用户操作即触发防抖落盘
    await settle();
    const last = saved.at(-1);
    expect(last?.[0]?.label).toBe('用户改名');
    // 关键：落盘内容必须保留远端历史，而不是被空的 defaultConversations 覆盖
    expect(last?.[0]?.messages).toHaveLength(1);
  });

  it('v-model:tree 通道同样不受影响（既有行为，防修复引入回归）', async () => {
    const { storage } = makeAsyncStorage();
    const { api } = mountWith(
      { defaultConversations: [{ id: 'c1', label: '新对话', messages: [] }], storage },
      'tree',
    );
    await settle();
    expect(api().active.value?.messages).toHaveLength(1);
  });

  it('不传 defaultConversations（推荐用法）同样正常（既有行为）', async () => {
    const { storage } = makeAsyncStorage();
    const { api } = mountWith({ storage });
    await settle();
    expect(api().active.value?.messages).toHaveLength(1);
  });

  it('load 期间用户已真实发消息时，load 的旧快照不得覆盖（既有守卫不被放宽）', async () => {
    const { storage } = makeAsyncStorage(30);
    const { api } = mountWith({
      defaultConversations: [{ id: 'c1', label: '新对话', messages: [] }],
      storage,
    });
    await flushPromises();
    // 用户在 load 未落地前就发了消息（真实的本地变更）
    api().activeMessages.value = [
      { id: 'local-1', role: 'user', content: [{ id: 'lb1', type: 'text', text: '本地输入' }] },
    ];
    await settle(60);
    expect(api().active.value?.messages).toHaveLength(1);
    expect(api().active.value?.messages[0]?.id).toBe('local-1');
  });
});
