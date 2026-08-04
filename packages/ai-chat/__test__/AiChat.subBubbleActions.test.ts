import { flushPromises, mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import AiChat from '../src/components/AiChat.vue';
import type { ChatMessage, ExportedTree } from '../src/types';
import { genBlockId } from '../src/utils/helpers';

vi.mock('virtua/vue', () => ({
  Virtualizer: {
    name: 'Virtualizer',
    props: ['data', 'keepMounted'],
    setup(props: any, { slots }: any) {
      return () => (props.data as unknown[]).map((item, i) => slots.default?.({ item, index: i }));
    },
  },
}));

const idleRequest = vi.fn(
  async () =>
    new ReadableStream<Uint8Array>({
      start(c) {
        c.close();
      },
    }),
);

/** 把含多个 text 块的消息按块拆成多个气泡（1→N），user / ai 一视同仁 */
const splitByBlock = (m: ChatMessage): ChatMessage | ChatMessage[] =>
  m.content.length > 1 ? m.content.map((b) => ({ ...m, content: [b] })) : m;

const twoBlockUser: ChatMessage = {
  id: 'u1',
  role: 'user',
  status: 'success',
  content: [
    { id: genBlockId(), type: 'text', text: '第一段' },
    { id: genBlockId(), type: 'text', text: '第二段' },
  ],
};

/**
 * Bug 防回归：1→N 的「仅末子气泡显示操作条」去重此前只写在 AI 分支里，user 分支先一步
 * return 掉了。于是被拆分的用户消息每个子气泡都挂编辑按钮，而 useChat.onEdit 会按
 * resolveParentId 解析回父消息、把父消息的全部 text 块塌成该子气泡那一段——用非首个子气泡
 * 编辑再保存会静默丢掉其余段落。去重须对所有角色一致（与 branchMap 同规则）。
 */
describe('AiChat — 1→N 拆分时的操作条去重', () => {
  it('被拆分的用户消息只有末子气泡挂操作条', async () => {
    const w = mount(AiChat, {
      props: { request: idleRequest, parser: splitByBlock, defaultMessages: [twoBlockUser] },
    });
    await flushPromises();

    const bubbles = w.findAll('.aix-bubble--end');
    expect(bubbles).toHaveLength(2); // 确认确实拆成了两个气泡
    expect(bubbles[0]!.findAll('.aix-bubble-actions__btn')).toHaveLength(0);
    expect(
      bubbles[1]!.findAll('.aix-bubble-actions__btn').map((b) => b.attributes('aria-label')),
    ).toEqual(['复制', '编辑']);
  });

  it('未拆分的用户消息操作条不受影响', async () => {
    const w = mount(AiChat, {
      props: {
        request: idleRequest,
        parser: splitByBlock,
        defaultMessages: [
          {
            id: 'u1',
            role: 'user',
            status: 'success',
            content: [{ id: 'b', type: 'text', text: '只有一段' }],
          },
        ],
      },
    });
    await flushPromises();

    expect(
      w
        .find('.aix-bubble--end')
        .findAll('.aix-bubble-actions__btn')
        .map((b) => b.attributes('aria-label')),
    ).toEqual(['复制', '编辑']);
  });
});

/**
 * treeMode 逃生口：isTreeBound 默认靠编译后 vnode props 探测，h()/JSX 手写或经高阶组件
 * $attrs 中转时可能失准。显式声明须优先于探测，且**未传时不得被 Vue 的 boolean casting
 * 转成 false**（那会把自动推断整个短路掉，绑了 v-model:tree 也不生效）。
 */
describe('AiChat — treeMode 显式声明', () => {
  it('未传 treeMode 时 v-model:tree 的自动推断仍生效', async () => {
    const w = mount(AiChat, {
      props: {
        request: idleRequest,
        tree: { nodes: [], headId: '__root__' } as ExportedTree,
        'onUpdate:tree': () => {},
      },
    });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    // 绑了 tree ⇒ 结构变化会导出回父
    expect(w.emitted('update:tree')).toBeTruthy();
  });

  it('treeMode=false 可显式关闭 tree 通道（即便绑了 v-model:tree）', async () => {
    const w = mount(AiChat, {
      props: {
        request: idleRequest,
        treeMode: false,
        tree: { nodes: [], headId: '__root__' } as ExportedTree,
        'onUpdate:tree': () => {},
      },
    });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(w.emitted('update:tree')).toBeUndefined();
  });

  it('treeMode=true 可在探测失准时显式开启', async () => {
    const w = mount(AiChat, { props: { request: idleRequest, treeMode: true } });
    await w.find('textarea').setValue('问题');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(w.emitted('update:tree')).toBeTruthy();
  });
});
