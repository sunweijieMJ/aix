import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { h, nextTick } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import Sender from '../src/components/Sender.vue';
import Thinking from '../src/components/Thinking.vue';
import { useChat } from '../src/composables/useChat';
import type { UseChatRequestCtx } from '../src/composables/useChat';
import type { ChatMessage } from '../src/types';

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

function sseStream(deltas: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const d of deltas) c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: d })}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  });
}

const idleRequest = () => new Promise<Response>(() => {});

// ==================== request ctx：messageId / setExtra ====================
describe('request ctx 的 messageId / setExtra', () => {
  it('messageId 指向本轮 AI 占位消息，setExtra 写入的是同一条', async () => {
    let seenId = '';
    const request = vi.fn(async (ctx: UseChatRequestCtx) => {
      seenId = ctx.messageId;
      ctx.setExtra({ chatNid: 'nid-1' });
      return sseStream(['ok']);
    });
    const { messages, onSend } = useChat({ request });
    await onSend('hi');
    await nextTick();
    const aiMsg = messages.value[1]!;
    expect(aiMsg.role).toBe('ai');
    expect(seenId).toBe(aiMsg.id);
    expect(aiMsg.extra?.chatNid).toBe('nid-1');
  });

  it('浅合并而非整体替换：多次调用累积，已有键被同名键覆盖', async () => {
    const request = vi.fn(async (ctx: UseChatRequestCtx) => {
      ctx.setExtra({ a: 1, b: 1 });
      ctx.setExtra({ b: 2, c: 3 });
      return sseStream(['ok']);
    });
    const { messages, onSend } = useChat({ request });
    await onSend('hi');
    await nextTick();
    expect(messages.value[1]!.extra).toMatchObject({ a: 1, b: 2, c: 3 });
  });

  it('写入的 extra 不被后续流式 / 终态覆盖（能活到 success）', async () => {
    const request = vi.fn(async (ctx: UseChatRequestCtx) => {
      ctx.setExtra({ chatNid: 'keep-me' });
      return sseStream(['a', 'b']);
    });
    const { messages, onSend } = useChat({ request });
    await onSend('hi');
    await nextTick();
    expect(messages.value[1]!.status).toBe('success');
    expect(messages.value[1]!.extra?.chatNid).toBe('keep-me');
  });

  /**
   * 归属守卫：业务在 await 之后才调 setExtra，而这条消息期间已被新一轮请求接管时，
   * 旧轮次的写入必须被丢弃——否则就是本 API 想根治的「串轮次」换了个地方复现。
   */
  it('请求已被接管后调用 setExtra 为空操作（不拿旧轮次元数据覆盖新轮次）', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let call = 0;
    const request = vi.fn(async (ctx: UseChatRequestCtx) => {
      call += 1;
      if (call === 1) {
        await gate; // 第一轮挂起，期间被第二轮接管
        ctx.setExtra({ round: 'stale' });
        return sseStream(['old']);
      }
      ctx.setExtra({ round: 'fresh' });
      return sseStream(['new']);
    });
    const { messages, onSend, onReload, abort } = useChat({ request });

    const first = onSend('hi');
    await nextTick();
    const aiId = messages.value[1]!.id;
    // 中断后对同一条消息重新生成 —— 新请求接管这条消息的归属
    abort();
    await nextTick();
    const second = onReload(aiId);
    await nextTick();
    release();
    await Promise.all([first, second]);
    await nextTick();

    const written = messages.value.map((m) => m.extra?.round).filter(Boolean);
    expect(written).not.toContain('stale');
  });
});

// ==================== sender-header 与内置引用 chips 共存 ====================
describe('sender-header 与内置引用 chips', () => {
  it('无引用时只渲染业务内容，不留空的 chips 容器', () => {
    const w = mount(AiChat, {
      props: { request: idleRequest },
      slots: { 'sender-header': () => h('span', { class: 'ctx' }) },
    });
    expect(w.find('.aix-sender__header .ctx').exists()).toBe(true);
    expect(w.find('.aix-ai-chat__quote-chips').exists()).toBe(false);
  });

  it('未提供 sender-header 且无引用时，Sender 顶部区整个不渲染（回归）', () => {
    const w = mount(AiChat, { props: { request: idleRequest } });
    expect(w.find('.aix-sender__header').exists()).toBe(false);
  });
});

// ==================== variant 与既有状态类的相互作用 ====================
describe('variant 不影响既有状态类', () => {
  it('plain 形态下 is-disabled 仍生效', () => {
    const w = mount(Sender, { props: { variant: 'plain', disabled: true } });
    expect(w.find('.aix-sender--plain.is-disabled').exists()).toBe(true);
    expect(w.find('textarea').attributes('disabled')).toBeDefined();
  });

  it('plain 形态下 is-has-toolbar 仍按工具项计算', () => {
    const w = mount(Sender, {
      props: {
        variant: 'plain',
        attachments: { upload: vi.fn(async () => ({ name: 'a', url: '/a' })) },
      },
    });
    expect(w.find('.aix-sender--plain.is-has-toolbar').exists()).toBe(true);
  });

  it('Thinking 换形态后 expanded 受控同步仍生效', async () => {
    const w = mount(Thinking, { props: { content: 'x', variant: 'plain', expanded: false } });
    expect(w.find('.aix-thinking__body').exists()).toBe(false);
    await w.setProps({ expanded: true });
    expect(w.find('.aix-thinking__body').exists()).toBe(true);
  });
});

// ==================== row-before 与虚拟列表 / 分支的相互作用 ====================
describe('row-before 的边界', () => {
  it('气泡仍带 data-aix-message-id（回链 / 滚动定位不受多根节点影响）', () => {
    const messages: ChatMessage[] = [{ id: 'u1', role: 'user', status: 'success', content: [] }];
    const w = mount(AiChat, {
      props: { request: idleRequest, messages },
      slots: { 'row-before': () => h('i', { class: 'ts' }) },
    });
    expect(w.find('[data-aix-message-id="u1"]').exists()).toBe(true);
  });

  it('插槽对每条消息各渲染一次，不会漏掉首条', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', status: 'success', content: [] },
      { id: 'a1', role: 'ai', status: 'success', content: [] },
      { id: 'u2', role: 'user', status: 'success', content: [] },
    ];
    const w = mount(AiChat, {
      props: { request: idleRequest, messages },
      slots: { 'row-before': () => h('i', { class: 'ts' }) },
    });
    expect(w.findAll('.ts')).toHaveLength(3);
  });
});

// ==================== errorText 的边界 ====================
describe('errorText 的边界', () => {
  it('返回空串等同未提供（回退 i18n），不会渲染空文案', () => {
    const messages: ChatMessage[] = [
      { id: 'a1', role: 'ai', status: 'error', content: [], extra: { error: new Error('x') } },
    ];
    const w = mount(AiChat, {
      props: { request: idleRequest, messages, errorText: () => '' },
    });
    expect(w.find('.aix-bubble__error-text').text()).toBe('出错了，请重试');
  });

  it('#error 插槽存在时完全接管，errorText 不再参与渲染', () => {
    const messages: ChatMessage[] = [
      { id: 'a1', role: 'ai', status: 'error', content: [], extra: { error: 'boom' } },
    ];
    const w = mount(AiChat, {
      props: { request: idleRequest, messages, errorText: () => '不该出现' },
      slots: { error: (sp: { error: unknown }) => h('em', { class: 'mine' }, String(sp.error)) },
    });
    expect(w.find('.mine').text()).toBe('boom');
    expect(w.find('.aix-bubble__error-text').exists()).toBe(false);
  });
});
