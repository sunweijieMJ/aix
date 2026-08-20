import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import type { ExportedTree } from '../src/types';

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

const request = () =>
  Promise.resolve(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.close();
      },
    }),
  );

const flush = async () => {
  for (let i = 0; i < 14; i++) await nextTick();
};

/**
 * v-model:tree 的两处入口（setup 期初始导入、运行时外部替换）此前都直接读 .nodes.length，
 * 树数据损坏时会在渲染流程里抛穿。与 messageTree.importTree / useConversations 的
 * 脏数据归一保持同一口径。
 */
describe('AiChat — v-model:tree 收到损坏树数据', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('初始 tree 的 nodes 非数组时不抛错，按空会话挂载', async () => {
    const w = mount(AiChat, {
      props: {
        request,
        tree: { headId: 'x' } as unknown as ExportedTree,
        'onUpdate:tree': () => {},
      },
    });
    await flush();
    expect(w.vm.messages).toEqual([]);
    w.unmount();
  });

  it('运行时被替换成损坏树时不抛错，视图清空', async () => {
    const w = mount(AiChat, {
      props: {
        request,
        tree: {
          nodes: [
            {
              id: 'm1',
              parentId: '__root__',
              message: {
                id: 'm1',
                role: 'user',
                content: [{ id: 'b1', type: 'text', text: '你好' }],
              },
            },
          ],
          headId: 'm1',
        } as ExportedTree,
        'onUpdate:tree': () => {},
      },
    });
    await flush();
    expect(w.vm.messages).toHaveLength(1);

    await w.setProps({ tree: { nodes: null, headId: 'm1' } as unknown as ExportedTree });
    await flush();
    expect(w.vm.messages).toEqual([]);
    w.unmount();
  });
});
