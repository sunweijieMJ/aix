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

  /**
   * 轮询等到条件成立，取代「睡固定毫秒赌余量」。
   *
   * 原先统一用 settle(40)：要在 40ms 里跨过 storage 的 10ms load 延迟 + 5ms 保存防抖，
   * 余量只有几十毫秒。本地单跑必绿，但 pre-commit 钩子 / CI 上 turbo 还在并发构建、
   * 118 个测试文件同时在跑，真实定时器迟到几十毫秒是常态，断言就会在数据尚未落地时执行——
   * 该文件在钩子里间歇性挂掉的正是这一条（「load 生效后的用户变更不会用空默认覆盖」）。
   * 改成等条件而非等时间后，用例与机器快慢彻底解耦，且快机器上反而更快返回。
   *
   * 上限从 2s 提到 15s：这个数字是「卡死了」的判据，不是「应该多快」的预算，
   * 条件一成立就立刻返回，调大它在正常路径上零成本。2s 仍然把两者混在一起——
   * `pnpm test` 并发 31 个任务时事件循环被抢占，墙钟照走而轮询跑不了几轮，
   * 实测就在这里抛过「waitFor 超时：条件始终未成立」。
   * 15s 留在本包 testTimeout（20s）之下，保证超时时报的是这条更具体的信息。
   */
  const waitFor = async (cond: () => boolean, timeout = 15_000) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      await flushPromises();
      if (cond()) return;
      if (Date.now() > deadline) throw new Error('waitFor 超时：条件始终未成立');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };

  it('defaultConversations 含空会话时，storage.load 的远端历史仍然生效', async () => {
    const { storage } = makeAsyncStorage();
    const { api } = mountWith({
      defaultConversations: [{ id: 'c1', label: '新对话', messages: [] }],
      storage,
    });
    await waitFor(() => api().active.value?.label === '远端会话');
    expect(api().active.value?.messages).toHaveLength(1);
  });

  it('load 生效后的用户变更不会用空默认覆盖已持久化的远端历史', async () => {
    const { saved, storage } = makeAsyncStorage();
    const { api } = mountWith({
      defaultConversations: [{ id: 'c1', label: '新对话', messages: [] }],
      storage,
      saveDebounce: 5,
    });
    await waitFor(() => api().active.value?.label === '远端会话');
    api().rename('c1', '用户改名'); // 一次普通用户操作即触发防抖落盘
    await waitFor(() => saved.at(-1)?.[0]?.label === '用户改名');
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
    await waitFor(() => api().active.value?.messages.length === 1);
    expect(api().active.value?.messages).toHaveLength(1);
  });

  it('不传 defaultConversations（推荐用法）同样正常（既有行为）', async () => {
    const { storage } = makeAsyncStorage();
    const { api } = mountWith({ storage });
    await waitFor(() => api().active.value?.messages.length === 1);
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
    // 等 load 真正落定（isLoading 翻 false）而非睡 60ms：既确保守卫已被检验过，也不受机器快慢影响
    await waitFor(() => api().isLoading.value === false);
    expect(api().active.value?.messages).toHaveLength(1);
    expect(api().active.value?.messages[0]?.id).toBe('local-1');
  });
});
