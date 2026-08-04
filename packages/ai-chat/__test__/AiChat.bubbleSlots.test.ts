import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import Bubble from '../src/components/Bubble.vue';
import BubbleList from '../src/components/BubbleList.vue';
import type { BubbleContentInfo, ChatMessage } from '../src/types';
import { genBlockId } from '../src/utils/helpers';

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

const idleRequest = () =>
  Promise.resolve(new ReadableStream<Uint8Array>({ start: (c) => c.close() }));

const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  role: 'ai',
  status: 'success',
  content: [{ id: genBlockId(), type: 'text', text: '正文' }],
  ...over,
});

/**
 * 消息级 header 此前在 AiChat 下**完全不可达**：Bubble 有 header 插槽，但 AiChat 把 header
 * 用作顶部标题栏并列入保留插槽，既不自用于气泡也不进块插槽穿透。于是「发送者名 / 时间戳」
 * 这类几乎必然要用的东西无路可走。改由 bubble-header 贯通，并补上整条消息的作用域。
 */
describe('气泡消息级插槽 — bubble-header', () => {
  it('AiChat 的 bubble-header 落到气泡头部，且拿得到整条消息与 info', async () => {
    const w = mount(AiChat, {
      props: {
        request: idleRequest,
        defaultMessages: [msg({ id: 'u1', role: 'user', extra: { sender: '张三', ts: 1700 } })],
      },
      slots: {
        'bubble-header': (s: { item: ChatMessage; info: BubbleContentInfo }) =>
          h('span', { class: 'hdr' }, `${s.item.extra?.sender}|${s.item.extra?.ts}|${s.info.role}`),
      },
    });
    await flushPromises();
    expect(w.find('.aix-bubble__header .hdr').text()).toBe('张三|1700|user');
  });

  it('不提供时气泡头部整块不渲染（不留空 gap）', async () => {
    const w = mount(AiChat, { props: { request: idleRequest, defaultMessages: [msg()] } });
    await flushPromises();
    expect(w.find('.aix-bubble__header').exists()).toBe(false);
  });

  it('AiChat 顶部标题栏的 header 插槽不受影响，两者互不串台', async () => {
    const w = mount(AiChat, {
      props: { request: idleRequest, headerTitle: 'T', defaultMessages: [msg()] },
      slots: {
        header: () => h('span', { class: 'title-bar' }, '标题栏'),
        'bubble-header': () => h('span', { class: 'hdr' }, '气泡头'),
      },
    });
    await flushPromises();
    expect(w.find('.aix-ai-chat__header .title-bar').exists()).toBe(true);
    expect(w.find('.aix-bubble__header .hdr').exists()).toBe(true);
    // 标题栏里不应混入气泡头，反之亦然
    expect(w.find('.aix-ai-chat__header .hdr').exists()).toBe(false);
  });

  it('BubbleList 层直接用 header 插槽同样带 item', () => {
    const w = mount(BubbleList, {
      props: { items: [msg({ extra: { sender: '李四' } })] },
      slots: {
        header: (s: { item: ChatMessage }) => h('i', { class: 'h' }, String(s.item.extra?.sender)),
      },
    });
    expect(w.find('.aix-bubble__header .h').text()).toBe('李四');
  });
});

/**
 * 出错条此前是 content 插槽的**兄弟节点**，覆写 content 也盖不住，业务无法展示错误码
 * 或按错误类型分支。
 */
describe('气泡出错态 — error 插槽', () => {
  it('未提供时保持内置「出错了 + 重试」，重试仍触发 retry', async () => {
    const w = mount(Bubble, { props: { status: 'error', content: [] } });
    expect(w.find('.aix-bubble__error').exists()).toBe(true);
    await w.find('.aix-bubble__retry').trigger('click');
    expect(w.emitted('retry')).toHaveLength(1);
  });

  it('提供 error 插槽时完全替换内置错误条，retry 句柄可用', async () => {
    const w = mount(Bubble, {
      props: { status: 'error', content: [] },
      slots: {
        error: (s: { retry: () => void; info: BubbleContentInfo }) =>
          h('button', { class: 'my-err', onClick: s.retry }, `重试(${s.info.role})`),
      },
    });
    expect(w.find('.aix-bubble__error').exists()).toBe(false);
    expect(w.find('.my-err').text()).toBe('重试(ai)');
    await w.find('.my-err').trigger('click');
    expect(w.emitted('retry')).toHaveLength(1);
  });

  it('AiChat 的 error 插槽贯通，且能读到 extra.error 做错误码展示', async () => {
    const w = mount(AiChat, {
      props: {
        request: idleRequest,
        defaultMessages: [msg({ status: 'error', extra: { error: { code: 429 } } })],
      },
      slots: {
        error: (s: { item: ChatMessage; retry: () => void }) =>
          h('span', { class: 'e' }, String((s.item.extra?.error as { code: number }).code)),
      },
    });
    await flushPromises();
    expect(w.find('.e').text()).toBe('429');
    expect(w.find('.aix-bubble__error').exists()).toBe(false);
  });

  /**
   * 关键：不能用 <slot> 的原生 fallback 写法——业务按错误类型 v-if 只在部分情况渲染时，
   * 插槽产出全是 Comment，Vue 的 renderSlot 会判定「未提供插槽」而把内置错误条塞回来，
   * 于是「这种错误不显示提示」的意图被推翻（与 AiChat footer 踩过的是同一个坑）。
   */
  it('插槽渲染为空时不回落内置错误条（renderSlot fallback 陷阱）', () => {
    const w = mount(Bubble, {
      props: { status: 'error', content: [] },
      slots: { error: () => null },
    });
    expect(w.find('.aix-bubble__error').exists()).toBe(false);
    expect(w.find('.aix-bubble__retry').exists()).toBe(false);
  });

  it('非 error 状态不渲染错误插槽', () => {
    const w = mount(Bubble, {
      props: { status: 'success', content: [] },
      slots: { error: () => h('span', { class: 'e' }, 'x') },
    });
    expect(w.find('.e').exists()).toBe(false);
  });
});

describe('气泡头像插槽 — avatar 补作用域', () => {
  it('avatar 插槽经 AiChat 贯通并带整条消息（可按消息渲染不同头像组件）', async () => {
    const w = mount(AiChat, {
      props: {
        request: idleRequest,
        defaultMessages: [msg({ id: 'u9', role: 'user', extra: { name: '王五' } })],
      },
      slots: {
        avatar: (s: { item: ChatMessage; info: BubbleContentInfo }) =>
          h('b', { class: 'av' }, `${s.item.extra?.name}-${s.info.role}`),
      },
    });
    await flushPromises();
    expect(w.find('.aix-bubble__avatar .av').text()).toBe('王五-user');
  });
});

/**
 * 深度思考 UI 定制的贯通验证：reasoning-* 是「块插槽穿透」（<块类型>-<内部slot>）的一员，
 * 需经 AiChat → BubbleList → Bubble → ReasoningBlock → Thinking 五层原样落地。
 * 与 thought-chain-item-content 的差别在于作用域被 ReasoningBlock 增补过（elapsed / streaming），
 * 这条链路上任一层若把作用域吃掉或改写，自定义标题就拿不到耗时。
 */
describe('块插槽穿透 — reasoning-*（深度思考 UI）', () => {
  const reasoningMsg = (over: Partial<ChatMessage> = {}): ChatMessage =>
    msg({
      id: 'r-msg',
      content: [
        { id: 'rb', type: 'reasoning', text: '思考中的内容', startedAt: 1000, endedAt: 4000 },
      ],
      ...over,
    });

  it('reasoning-title 经 AiChat 五层落到 Thinking 标题，并带 elapsed', async () => {
    const w = mount(AiChat, {
      props: { request: idleRequest, defaultMessages: [reasoningMsg()] },
      slots: {
        'reasoning-title': ({ elapsed }: { elapsed: number | null }) =>
          h('b', { class: 'deep-title' }, `深度思考 ${elapsed}s`),
      },
    });
    await flushPromises();
    expect(w.find('.deep-title').text()).toBe('深度思考 3s');
    expect(w.text()).not.toContain('思考过程');
  });

  it('reasoning-body 经 AiChat 贯通，替换折叠区正文', async () => {
    const w = mount(AiChat, {
      props: {
        request: idleRequest,
        // 流式中且数据层未打 endedAt → 思考仍在进行 → 折叠面板自动展开，正文可见
        defaultMessages: [
          reasoningMsg({
            status: 'updating',
            content: [{ id: 'rb', type: 'reasoning', text: '思考中的内容', startedAt: 1000 }],
          }),
        ],
      },
      slots: {
        'reasoning-body': ({ text }: { text: string }) => h('pre', { class: 'deep-body' }, text),
      },
    });
    await flushPromises();
    expect(w.find('.deep-body').text()).toBe('思考中的内容');
  });

  it('不提供 reasoning-* 时内置思考 UI 完全不变（穿透无副作用）', async () => {
    const w = mount(AiChat, {
      props: { request: idleRequest, defaultMessages: [reasoningMsg()] },
    });
    await flushPromises();
    expect(w.find('.aix-thinking__header').text()).toContain('思考过程');
    expect(w.find('.aix-thinking__arrow').exists()).toBe(true);
  });
});
