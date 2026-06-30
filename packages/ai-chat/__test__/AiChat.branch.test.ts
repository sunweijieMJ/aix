import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import { ROOT_ID } from '../src/composables/messageTree';
import type { ParsedChunk, ChatMessage, ExportedTree } from '../src/types';

vi.mock('virtua/vue', () => ({
  Virtualizer: {
    name: 'Virtualizer',
    props: ['data'],
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
    await w.find('.aix-bubble-actions [aria-label]').trigger('click');
    await flush();
    // 关键断言：整组 2 个子气泡中，只有末子气泡显示分支切换器（非末子气泡 branchMap 置 undefined）
    expect(w.findAll('.aix-bubble-actions__branch').length).toBe(1);
  });

  it('重新生成后末气泡出现 ‹ 1/2 ›，点击切回旧版本', async () => {
    n = 0;
    const w = mount(AiChat, { props: { request, parseChunk, actions: ['regenerate'] } });
    (w.vm as unknown as { onSend: (t: string) => Promise<void> }).onSend('问题');
    await flush();
    // 触发重新生成
    await w.find('.aix-bubble-actions [aria-label]').trigger('click'); // regenerate 按钮（首个 action）
    await flush();
    expect(w.find('.aix-bubble-actions__branch').exists()).toBe(true);
    expect(w.text()).toContain('2/2');
    // 切到上一个版本
    await w.find('.aix-bubble-actions__branch button').trigger('click');
    await flush();
    expect(w.text()).toContain('1/2');
    expect(w.text()).toContain('回复1');
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
