import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import { ROOT_ID } from '../src/composables/messageTree';
import type { ParsedChunk, ChatMessage, ExportedTree } from '../src/types';

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
  for (let i = 0; i < 12; i++) await nextTick();
};

describe('AiChat — 分支切换器贯通', () => {
  it('1→N 拆分 + 有分支：切换器仅在末子气泡渲染（防回归）', async () => {
    n = 0;
    // parser：把每条 AI 消息拆成 2 个子气泡（复用父 id + 派生 id）
    const parser = (m: ChatMessage): ChatMessage | ChatMessage[] =>
      m.role === 'ai' ? [{ ...m }, { ...m }] : m;
    const w = mount(AiChat, { props: { request, parseChunk, parser, actions: ['regenerate'] } });
    (w.vm as unknown as { onSend: (t: string) => Promise<void> }).onSend('问题');
    await flush();
    // 触发重新生成，产生第 2 个版本（此时 AI 消息有 branches）
    // 用户消息现在也默认挂载操作条，需用 aria-label 精确定位「重新生成」按钮，避免误点到用户消息的操作
    await w.find('[aria-label="重新生成"]').trigger('click');
    await flush();
    // 关键断言：整组 2 个子气泡中，只有末子气泡显示分支切换器（非末子气泡 branchMap 置 undefined）
    expect(w.findAll('.aix-bubble-actions__branch').length).toBe(1);
  });

  it('重新生成后末气泡出现 ‹ 1/2 ›，点击切回旧版本', async () => {
    n = 0;
    const w = mount(AiChat, { props: { request, parseChunk, actions: ['regenerate'] } });
    (w.vm as unknown as { onSend: (t: string) => Promise<void> }).onSend('问题');
    await flush();
    // 触发重新生成（用户消息现在也默认挂载操作条，需用 aria-label 精确定位，避免误点用户消息的操作）
    await w.find('[aria-label="重新生成"]').trigger('click');
    await flush();
    expect(w.find('.aix-bubble-actions__branch').exists()).toBe(true);
    expect(w.text()).toContain('2/2');
    // 切到上一个版本
    await w.find('.aix-bubble-actions__branch button').trigger('click');
    await flush();
    expect(w.text()).toContain('1/2');
    expect(w.text()).toContain('回复1');
  });

  /**
   * 分支导航此前只有内置切换器能走到：自定义 #footer / actions 接管操作条后，宿主
   * 没有任何命令式入口可以切分支。这里锁住新增的 expose 面。
   */
  it('命令式 switchBranch / getBranches 可用，且与内置切换器同一套状态', async () => {
    n = 0;
    const w = mount(AiChat, { props: { request, parseChunk, actions: ['regenerate'] } });
    const vm = w.vm as unknown as {
      onSend: (t: string) => Promise<void>;
      messages: ChatMessage[];
      switchBranch: (id: string, dir: -1 | 1) => boolean;
      getBranches: (id: string) => { index: number; count: number } | undefined;
    };
    await vm.onSend('问题');
    await flush();
    await w.find('[aria-label="重新生成"]').trigger('click');
    await flush();

    const aiId = vm.messages[vm.messages.length - 1]!.id;
    expect(vm.getBranches(aiId)).toEqual({ index: 1, count: 2 });

    // 命令式切回上一版本，UI 同步跟随（两条路径共用 useChat 的同一棵树）
    expect(vm.switchBranch(aiId, -1)).toBe(true);
    await flush();
    expect(w.text()).toContain('1/2');
    expect(w.text()).toContain('回复1');

    // 越界不循环，返回 false
    expect(vm.switchBranch(vm.messages[vm.messages.length - 1]!.id, -1)).toBe(false);
  });

  /**
   * 命令式 switchBranch **不得**自己再调一次 syncTree：它改的是树结构，契约① 的
   * watch([messages, branches]) 已经会导出一次。多补一次的后果不是报错而是重复 emit——
   * 宿主若在 @update:tree 里做序列化落库 / 埋点，同一次切换会被记两遍。
   * 与 setFeedback / updateBlock 恰好相反（那两个是就地 mutate、不改变树结构，必须显式补）。
   */
  it('命令式 switchBranch 只同步一次 v-model:tree（不与契约① 的结构 watch 重复导出）', async () => {
    n = 0;
    const w = mount(AiChat, {
      props: { request, parseChunk, actions: ['regenerate'], 'onUpdate:tree': () => {} },
    });
    const vm = w.vm as unknown as {
      onSend: (t: string) => Promise<void>;
      messages: ChatMessage[];
      switchBranch: (id: string, dir: -1 | 1) => boolean;
    };
    await vm.onSend('问题');
    await flush();
    await w.find('[aria-label="重新生成"]').trigger('click');
    await flush();

    const aiId = vm.messages[vm.messages.length - 1]!.id;
    const before = w.emitted('update:tree')!.length;

    expect(vm.switchBranch(aiId, -1)).toBe(true);
    await flush();

    expect(w.emitted('update:tree')!.length - before).toBe(1);
  });

  it('命令式 setFeedback 写回并同步 v-model:tree，但不回抛 feedback 事件（防埋点重复计数）', async () => {
    n = 0;
    const w = mount(AiChat, {
      props: { request, parseChunk, 'onUpdate:tree': (_v: ExportedTree) => {} },
    });
    const vm = w.vm as unknown as {
      onSend: (t: string) => Promise<void>;
      messages: ChatMessage[];
      setFeedback: (id: string, value: 'like' | 'dislike' | null) => void;
    };
    await vm.onSend('问题');
    await flush();

    const aiId = vm.messages[vm.messages.length - 1]!.id;
    const treeEmitsBefore = w.emitted('update:tree')!.length;

    vm.setFeedback(aiId, 'like');
    await flush();

    expect(vm.messages[vm.messages.length - 1]!.extra?.feedback).toBe('like');
    // 契约④：extra 写回不改变树结构，须显式 syncTree，否则宿主漏持久化
    expect(w.emitted('update:tree')!.length).toBeGreaterThan(treeEmitsBefore);
    // 调用方即宿主，不回声
    expect(w.emitted('feedback')).toBeUndefined();
  });
});

describe('AiChat — v-model:tree 空会话切换', () => {
  it('切到空树时清空内部树，不残留旧会话消息（防跨会话串台）', async () => {
    // 构造含 2 条消息的历史树（用户问题 + AI 回答）
    const msg1: ChatMessage = {
      id: 'hist-u1',
      role: 'user',
      status: 'success',
      content: [{ id: 'blk-u1', type: 'text', text: '用户问题' }],
    };
    const msg2: ChatMessage = {
      id: 'hist-a1',
      role: 'ai',
      status: 'success',
      content: [{ id: 'blk-a1', type: 'text', text: 'AI回答' }],
    };
    const nonEmptyTree: ExportedTree = {
      nodes: [
        { id: msg1.id, parentId: ROOT_ID, message: msg1 },
        { id: msg2.id, parentId: msg1.id, message: msg2 },
      ],
      headId: msg2.id,
    };

    // 挂载时传入非空 tree
    const w = mount(AiChat, {
      props: {
        request,
        parseChunk,
        tree: nonEmptyTree,
        'onUpdate:tree': (_v: ExportedTree) => {
          /* 不需要实际回写 */
        },
      },
    });
    await nextTick();

    // 断言：非空树已导入，messages 含 2 条历史消息
    const vm = w.vm as unknown as { messages: ChatMessage[] };
    expect(vm.messages.length).toBe(2);

    // 切到空会话（新建会话，空树）
    const emptyTree: ExportedTree = { nodes: [], headId: ROOT_ID };
    await w.setProps({ tree: emptyTree });
    await nextTick();

    // 关键断言：旧会话消息已清空，不残留（旧实现因 v.nodes.length===0 跳过 importTree 会失败）
    expect(vm.messages.length).toBe(0);
  });
});
