import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import { useConversations } from '../src/composables/useConversations';
import type { ParsedChunk, ExportedTree } from '../src/types';

// 虚拟列表 stub：直接平铺渲染每个 item 的默认插槽，便于断言气泡/操作条文本
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

let n = 0;
const request = () =>
  Promise.resolve(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ delta: `回复${(n += 1)}` })}\n\n`),
        );
        c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        c.close();
      },
    }),
  );
const parseChunk = (chunk: { data?: string }): ParsedChunk =>
  chunk.data === '[DONE]' ? { done: true } : (JSON.parse(chunk.data ?? '{}') as ParsedChunk);
const flush = async () => {
  for (let i = 0; i < 14; i++) await nextTick();
};

describe('AiChat × 分支持久化集成', () => {
  // 回归：仅绑 v-model:tree 时，切到「空会话」（空树）必须清空内部视图，
  // 否则上一会话消息残留、继续发送会污染旧树。（Bug：空树被 nodes.length 守卫挡掉）
  it('仅绑 v-model:tree：外部置空树（新建空会话）后视图清空', async () => {
    n = 0;
    const w = mount(AiChat, {
      props: {
        request,
        parseChunk,
        tree: undefined,
        'onUpdate:tree': (v: ExportedTree) => w.setProps({ tree: v }),
      },
    });
    (w.vm as unknown as { onSend: (t: string) => Promise<void> }).onSend('问题');
    await flush();
    expect(w.text()).toContain('回复1');

    // 模拟切到一个全新空会话：useConversations.activeTree 对空会话返回空树
    await w.setProps({ tree: { nodes: [], headId: '__root__' } as ExportedTree });
    await flush();
    expect(w.text()).not.toContain('回复1');
    expect(w.text()).not.toContain('问题');
  });

  // 回归：tree 置 undefined 与置空树同义，同样必须清空视图。
  // useConversations.activeTree 的 getter 在「没有激活会话」时返回 undefined——典型触发点是
  // remove() 删掉最后一个会话（activeKey 置空 → active 为 undefined）。此前 `if (!v) return`
  // 把 undefined 一并挡掉，已删会话的消息继续留在屏幕上；且 tree 绑定时 messages 反向导入
  // 已被禁用，没有第二条路兜底。
  it('仅绑 v-model:tree：外部置 undefined（删掉最后一个会话）后视图清空', async () => {
    n = 0;
    const w = mount(AiChat, {
      props: {
        request,
        parseChunk,
        tree: undefined,
        'onUpdate:tree': (v: ExportedTree) => w.setProps({ tree: v }),
      },
    });
    (w.vm as unknown as { onSend: (t: string) => Promise<void> }).onSend('问题');
    await flush();
    expect(w.text()).toContain('回复1');

    await w.setProps({ tree: undefined });
    await flush();
    expect(w.text()).not.toContain('回复1');
    expect(w.text()).not.toContain('问题');
  });

  // 分支持久化的支持接法是「仅绑 v-model:tree」（spec §8「二者择一」：v-model:messages 的
  // setMessages 会 importFlat 拍平树、破坏分支，故分支场景必须用 tree 通道）。
  // 回归：重新生成产生分支不应触发递归更新崩溃，分支应正常出现。
  it('useConversations 绑 v-model:tree：重新生成产生分支且不崩溃', async () => {
    n = 0;
    const errSpy = vi.fn();
    const Host = {
      components: { AiChat },
      setup() {
        const conv = useConversations({
          defaultConversations: [{ id: 'c1', label: 'A', messages: [] }],
        });
        return { conv, request, parseChunk };
      },
      template: `<AiChat :request="request" :parse-chunk="parseChunk" :actions="['regenerate']"
        v-model:tree="conv.activeTree.value" />`,
    };
    const w = mount(Host, {
      global: { config: { errorHandler: errSpy, warnHandler: errSpy } },
    });
    const chat = w.findComponent(AiChat);
    (chat.vm as unknown as { onSend: (t: string) => Promise<void> }).onSend('问题');
    await flush();
    expect(w.text()).toContain('回复1');

    // 重新生成 → 第 2 个版本分支
    await w.find('[aria-label="重新生成"]').trigger('click'); // 用户消息现在也默认挂载操作条，需精确定位
    await flush();

    expect(errSpy).not.toHaveBeenCalled(); // 无递归更新 / 错误
    expect(w.find('.aix-bubble-actions__branch').exists()).toBe(true);
    expect(w.text()).toContain('2/2');
    expect(w.text()).toContain('回复2');

    // 切回第 1 版本仍可用
    await w.find('.aix-bubble-actions__branch button').trigger('click');
    await flush();
    expect(w.text()).toContain('1/2');
    expect(w.text()).toContain('回复1');
  });

  // 端到端：useConversations 多会话切换（仅绑 v-model:tree），分支结构应随会话 tree 持久化并正确还原。
  it('useConversations 绑 tree：会话切换后分支结构经 tree 持久化并还原', async () => {
    n = 0;
    let convApi!: ReturnType<typeof useConversations>;
    const Host = {
      components: { AiChat },
      setup() {
        convApi = useConversations({
          defaultConversations: [{ id: 'c1', label: 'A', messages: [] }],
        });
        return { conv: convApi, request, parseChunk };
      },
      template: `<AiChat :request="request" :parse-chunk="parseChunk" :actions="['regenerate']"
        v-model:tree="conv.activeTree.value" />`,
    };
    const w = mount(Host);
    const chat = w.findComponent(AiChat);
    (chat.vm as unknown as { onSend: (t: string) => Promise<void> }).onSend('问题');
    await flush();
    // 在 c1 制造分支
    await w.find('[aria-label="重新生成"]').trigger('click'); // 用户消息现在也默认挂载操作条，需精确定位
    await flush();
    expect(w.text()).toContain('2/2');

    // 新建并切到 c2（空会话）→ 视图清空
    const c2 = convApi.create({ label: 'B' });
    await flush();
    expect(w.text()).not.toContain('回复');
    expect(w.find('.aix-bubble-actions__branch').exists()).toBe(false);

    // 切回 c1 → 分支结构还原（仍显示 2/2 且当前为第 2 版本）
    convApi.setActive('c1');
    await flush();
    expect(w.text()).toContain('2/2');
    expect(w.text()).toContain('回复2');

    // c1 的 tree 已持久化在会话上（含 user + 两个 ai 兄弟 = 3 节点）
    const c1Tree = convApi.conversations.value.find((c) => c.id === 'c1')!.tree!;
    expect(c1Tree.nodes.length).toBe(3);
    expect(c2).not.toBe('c1');
  });
});
