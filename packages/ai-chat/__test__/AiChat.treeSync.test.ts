import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { nextTick, defineComponent, h, ref } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import type { ExportedTree, ActionsItems, ContentBlock } from '../src/types';

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

/**
 * v-model:tree 的触发口径契约（见 AiChat 的 syncTree 注释）。
 *
 * 回归的是这个静默数据丢失：树只在**结构变化**时导出时，AI 占位节点入树那一刻就是最后一次
 * 结构变化——其后整段流式内容与 updating→success 都不改变树结构、不再 emit。于是
 * `@update:tree="v => api.save(JSON.stringify(v))"` 这类**在回调里快照**的宿主
 * （prop 文档「持久化通道」最自然的读法）会落库一条 content 为空、status 仍是 loading 的
 * AI 消息，下次加载还会被 reconcileStuckMessages 判为卡死改成 error。
 */

const enc = new TextEncoder();
const streamRequest = () =>
  Promise.resolve(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"delta":"Hello"}\n\n'));
        c.enqueue(enc.encode('data: {"delta":" world"}\n\n'));
        c.enqueue(enc.encode('data: [DONE]\n\n'));
        c.close();
      },
    }),
  );

/** 模拟「在回调里序列化落库」的宿主：只保留 emit 那一刻的 JSON 快照 */
function mountWithSnapshotHost(request: () => Promise<ReadableStream<Uint8Array>>) {
  const snapshots: ExportedTree[] = [];
  const treeRef = ref<ExportedTree | undefined>(undefined);
  const Host = defineComponent({
    setup() {
      return () =>
        h(AiChat, {
          request,
          tree: treeRef.value,
          'onUpdate:tree': (v: ExportedTree) => {
            snapshots.push(JSON.parse(JSON.stringify(v)) as ExportedTree);
            treeRef.value = v;
          },
        });
    },
  });
  return { wrapper: mount(Host), snapshots };
}

const settle = async () => {
  for (let i = 0; i < 30; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 20));
  for (let i = 0; i < 10; i++) await nextTick();
};

const lastAiOf = (tree: ExportedTree) =>
  [...tree.nodes].reverse().find((n) => n.message.role === 'ai')?.message;

describe('AiChat — v-model:tree 触发口径', () => {
  it('单轮问答结束后，快照式宿主拿到的最后一份树含完整内容与终态', async () => {
    const { wrapper, snapshots } = mountWithSnapshotHost(streamRequest);
    await nextTick();
    await (
      wrapper.findComponent(AiChat).vm as unknown as { onSend: (s: string) => Promise<void> }
    ).onSend('hi');
    await settle();

    const last = lastAiOf(snapshots[snapshots.length - 1]!)!;
    expect(last.status).toBe('success');
    expect(last.content).toHaveLength(1);
    expect((last.content[0] as { text: string }).text).toBe('Hello world');
  });

  it('流式逐 chunk 不触发导出：整轮 emit 次数保持在个位数（不随 token 数增长）', async () => {
    const { wrapper, snapshots } = mountWithSnapshotHost(streamRequest);
    await nextTick();
    await (
      wrapper.findComponent(AiChat).vm as unknown as { onSend: (s: string) => Promise<void> }
    ).onSend('hi');
    await settle();
    // 结构变化（user + ai 入树，同一 flush 合并为 1 次）+ 落终态 1 次
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    expect(snapshots.length).toBeLessThanOrEqual(4);
  });

  it('请求出错落 error 终态时同样导出一次', async () => {
    const { wrapper, snapshots } = mountWithSnapshotHost(() => Promise.reject(new Error('boom')));
    await nextTick();
    await (
      wrapper.findComponent(AiChat).vm as unknown as { onSend: (s: string) => Promise<void> }
    ).onSend('hi');
    await settle();

    expect(lastAiOf(snapshots[snapshots.length - 1]!)!.status).toBe('error');
  });

  // 交互块回写与赞踩都是「就地 mutate、树结构不变」，只按结构变化导出时它们全都不会落库。
  // 用与 AiChat.test.ts 同款的 Probe stub 走完整的 onBlockAction 链路。
  const Probe = defineComponent({
    props: {
      block: { type: Object, required: true },
      onBlockAction: {
        type: Function as unknown as () => (a: unknown) => void,
        default: undefined,
      },
    },
    setup(props) {
      return () =>
        h(
          'button',
          {
            class: 'probe',
            onClick: () =>
              (props.onBlockAction as ((a: unknown) => void) | undefined)?.({
                blockId: (props.block as { id: string }).id,
                type: 'select',
                patch: { selected: 'o2' },
              }),
          },
          String((props.block as { selected?: string }).selected ?? 'none'),
        );
    },
  });

  /** 已有一条 AI 消息的快照式宿主（不发请求，只验证非结构性 mutate 的导出） */
  function mountSeeded(actions?: ActionsItems) {
    const snapshots: ExportedTree[] = [];
    const treeRef = ref<ExportedTree | undefined>(undefined);
    const Host = defineComponent({
      setup() {
        return () =>
          h(AiChat, {
            request: async () => new ReadableStream<Uint8Array>(),
            blockRenderers: { probe: Probe },
            actions: actions ?? [],
            defaultMessages: [
              {
                id: 'm1',
                role: 'ai',
                status: 'success',
                // probe 是测试自造的块类型（不在 ContentBlockRegistry 内），故需断言
                content: [
                  { id: 'b1', type: 'probe', selected: undefined } as unknown as ContentBlock,
                ],
              },
            ],
            tree: treeRef.value,
            'onUpdate:tree': (v: ExportedTree) => {
              snapshots.push(JSON.parse(JSON.stringify(v)) as ExportedTree);
              treeRef.value = v;
            },
          });
      },
    });
    return { wrapper: mount(Host), snapshots };
  }

  /** 取块上的自定义字段（probe 块不在 ContentBlockRegistry 内，联合类型上没有该键） */
  const selectedOf = (tree: ExportedTree, blockId: string) =>
    (lastAiOf(tree)!.content.find((b) => b.id === blockId) as unknown as { selected?: string })
      .selected;

  it('交互块回写（block-action）不改变树结构，但仍导出一次', async () => {
    const { wrapper, snapshots } = mountSeeded();
    await nextTick();
    expect(snapshots).toHaveLength(0); // 无结构变化，此前不会有任何导出

    await wrapper.find('.probe').trigger('click');
    await settle();

    expect(snapshots.length).toBeGreaterThan(0);
    expect(selectedOf(snapshots[snapshots.length - 1]!, 'b1')).toBe('o2');
  });

  it('赞踩反馈写回同样导出一次', async () => {
    const { wrapper, snapshots } = mountSeeded(['feedback']);
    await nextTick();
    expect(snapshots).toHaveLength(0);

    await wrapper.find('.aix-bubble-actions__feedback').trigger('click'); // 首个为「赞」
    await settle();

    expect(snapshots.length).toBeGreaterThan(0);
    const msg = lastAiOf(snapshots[snapshots.length - 1]!)!;
    expect((msg.extra as { feedback: string }).feedback).toBe('like');
  });

  // 注意取的是 $.exposed 而非 vm：VTU 的 wrapper.vm 走 instance.proxy，<script setup> 的
  // setupState 会遮蔽同名的 defineExpose 项（拿到的是 useChat 的原始 updateBlock）；
  // 真实消费方经模板 ref 拿到的是 exposed 代理，即这里要断言的包装版。
  it('命令式 updateBlock（defineExpose）与 block-action 同口径导出', async () => {
    const { wrapper, snapshots } = mountSeeded();
    await nextTick();
    expect(snapshots).toHaveLength(0);

    const exposed = wrapper.findComponent(AiChat).vm.$.exposed as unknown as {
      updateBlock: (m: string, b: string, p: Record<string, unknown>) => boolean;
    };
    const ok = exposed.updateBlock('m1', 'b1', { selected: 'o9' });
    await settle();

    expect(ok).toBe(true); // 返回值语义保持不变（命中与否）
    expect(snapshots.length).toBeGreaterThan(0);
    expect(selectedOf(snapshots[snapshots.length - 1]!, 'b1')).toBe('o9');
  });

  it('命令式 updateBlock 未命中时不导出（与 block-action 的「仅命中才透出」一致）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { wrapper, snapshots } = mountSeeded();
    await nextTick();

    const exposed = wrapper.findComponent(AiChat).vm.$.exposed as unknown as {
      updateBlock: (m: string, b: string, p: Record<string, unknown>) => boolean;
    };
    expect(exposed.updateBlock('m1', 'nope', { selected: 'x' })).toBe(false);
    await settle();

    expect(snapshots).toHaveLength(0);
    warn.mockRestore();
  });

  it('未绑 v-model:tree 时整条通道空转（不导出）', async () => {
    const onUpdate = vi.fn();
    const wrapper = mount(AiChat, { props: { request: streamRequest } });
    await nextTick();
    await (wrapper.vm as unknown as { onSend: (s: string) => Promise<void> }).onSend('hi');
    await settle();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:tree')).toBeUndefined();
  });
});
