import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import AiChat from '../src/components/AiChat.vue';
import { provideAiChatConfig } from '../src/composables/useAiChatConfig';
import type { ChatMessage, QuoteConfig } from '../src/types';

// BubbleList 内部依赖 virtua 做虚拟滚动，jsdom 无真实布局测量；
// 与既有 AiChat.*.test.ts 同口径：直接渲染全部 data，绕开虚拟化。
vi.mock('virtua/vue', () => ({
  Virtualizer: {
    name: 'Virtualizer',
    props: ['data', 'keepMounted'],
    setup(
      props: { data: unknown[] },
      { slots }: { slots: Record<string, (p: unknown) => unknown> },
    ) {
      return () => (props.data as unknown[]).map((item, i) => slots.default?.({ item, index: i }));
    },
  },
}));

const sse = (): ReadableStream<Uint8Array> => {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: 'ok' })}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  });
};

const aiMsg: ChatMessage = {
  id: 'ai-1',
  role: 'ai',
  status: 'success',
  content: [{ id: 'b1', type: 'text', text: '这是 AI 的回答内容' }],
};

const mountChat = (extra: Record<string, unknown> = {}) => {
  // 显式收一个 ctx 形参（虽未使用）：让 vi.fn 推断出的调用元组非空，
  // 使下方 request.mock.calls.at(-1)![0] 取值有合法类型可转换。
  const request = vi.fn(async (_ctx: unknown) => sse());
  const w = mount(AiChat, {
    props: { request, defaultMessages: [aiMsg], quote: true, ...extra },
    attachTo: document.body,
  });
  return { w, request };
};

const mountWithGlobalQuote = (globalQuote: QuoteConfig, quote?: boolean | QuoteConfig) => {
  const Host = defineComponent({
    setup() {
      provideAiChatConfig({ quote: globalQuote });
      return () =>
        h(AiChat, {
          request: async () => sse(),
          defaultMessages: [aiMsg],
          quote,
        });
    },
  });
  return mount(Host);
};

describe('AiChat quote 接线', () => {
  it('默认关闭，不向 AI 消息操作栏注入引用按钮', () => {
    const { w } = mountChat({ quote: undefined });
    expect(w.find('button[aria-label="引用"]').exists()).toBe(false);
  });

  it('quote=true 显式开启；quote:false 显式关闭', () => {
    expect(mountChat().w.find('button[aria-label="引用"]').exists()).toBe(true);
    expect(mountChat({ quote: false }).w.find('button[aria-label="引用"]').exists()).toBe(false);
  });

  it('组件 quote 布尔值覆盖全局 enable', () => {
    expect(
      mountWithGlobalQuote({ enable: false }, true).find('button[aria-label="引用"]').exists(),
    ).toBe(true);
    expect(
      mountWithGlobalQuote({ enable: true }, false).find('button[aria-label="引用"]').exists(),
    ).toBe(false);
  });

  it('全局 quote 对象未显式提供 enable 时视为开启', () => {
    expect(
      mountWithGlobalQuote({ actions: ['copy'] })
        .find('button[aria-label="引用"]')
        .exists(),
    ).toBe(true);
  });

  it('quote.pcQuoteAction=false 仅关操作栏注入，划词仍可用', () => {
    const { w } = mountChat({ quote: { pcQuoteAction: false } });
    expect(w.find('button[aria-label="引用"]').exists()).toBe(false);
  });

  it('quote 未开启时滚动消息区不清除浏览器原生选区（不干扰用户选中文本复制）', async () => {
    const removeAllRanges = vi.spyOn(Selection.prototype, 'removeAllRanges');
    const { w } = mountChat({ quote: undefined }); // 默认关闭划词引用
    await flushPromises();
    const scrollEl = w.find('.aix-bubble-list__scroll');
    expect(scrollEl.exists()).toBe(true);
    await scrollEl.trigger('scroll');
    expect(removeAllRanges).not.toHaveBeenCalled();
    removeAllRanges.mockRestore();
    w.unmount();
  });

  it('quote 开启时滚动仍清除划词选区（virtua 回收后锚点失效，滚动即清是设计意图）', async () => {
    const removeAllRanges = vi.spyOn(Selection.prototype, 'removeAllRanges');
    const { w } = mountChat(); // quote: true
    await flushPromises();
    await w.find('.aix-bubble-list__scroll').trigger('scroll');
    expect(removeAllRanges).toHaveBeenCalled();
    removeAllRanges.mockRestore();
    w.unmount();
  });

  it('点引用按钮 → Sender header 出现 chip（整条文本，intent 无）；点 × 移除', async () => {
    const { w } = mountChat();
    await w.find('button[aria-label="引用"]').trigger('click');
    const chip = w.find('.aix-quote-chip');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain('这是 AI 的回答内容');
    await w.find('.aix-quote-chip__remove').trigger('click');
    expect(w.find('.aix-quote-chip').exists()).toBe(false);
  });

  it('锚点去重：重复点同一条整条引用按钮 → 仍只有 1 个 chip（幂等，不堆叠）', async () => {
    const { w } = mountChat();
    await w.find('button[aria-label="引用"]').trigger('click');
    await w.find('button[aria-label="引用"]').trigger('click');
    expect(w.findAll('.aix-quote-chip')).toHaveLength(1);
  });

  it('带 chip 发送：user 消息 content = [quote 块, text 块]，chip 清空', async () => {
    const { w } = mountChat();
    await w.find('button[aria-label="引用"]').trigger('click');
    await w.find('textarea').setValue('请解释一下');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    const user = (w.vm as unknown as { messages: ChatMessage[] }).messages.find(
      (m) => m.role === 'user',
    )!;
    expect(user.content.map((b) => b.type)).toEqual(['quote', 'text']);
    expect(w.find('.aix-quote-chip').exists()).toBe(false);
  });

  it('请求期拍平：request 收到的 messages 中 quote 块已变 blockquote 文本，SSOT 不被污染', async () => {
    const { w, request } = mountChat();
    await w.find('button[aria-label="引用"]').trigger('click');
    await w.find('textarea').setValue('追问');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    const ctx = request.mock.calls.at(-1)![0] as { messages: ChatMessage[] };
    const sentUser = ctx.messages.find((m) => m.role === 'user')!;
    expect(sentUser.content[0]).toMatchObject({
      type: 'text',
      text: '> 这是 AI 的回答内容',
    });
    // SSOT 中仍是结构化 quote 块（纯函数保证）
    const ssotUser = (w.vm as unknown as { messages: ChatMessage[] }).messages.find(
      (m) => m.role === 'user',
    )!;
    expect(ssotUser.content[0]!.type).toBe('quote');
  });

  it('自定义 toPrompt 生效', async () => {
    const { w, request } = mountChat({
      quote: { toPrompt: (qs: { anchor: { exact: string } }[]) => `【引】${qs[0]!.anchor.exact}` },
    });
    await w.find('button[aria-label="引用"]').trigger('click');
    await w.find('textarea').setValue('x');
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    const ctx = request.mock.calls.at(-1)![0] as { messages: ChatMessage[] };
    const sentUser = ctx.messages.find((m) => m.role === 'user')!;
    expect(sentUser.content[0]).toMatchObject({ text: '【引】这是 AI 的回答内容' });
  });

  it('有 chip 无文字也能发送：user 消息仅含 quote 块，请求文本含指令/blockquote，chip 清空', async () => {
    const { w, request } = mountChat();
    await w.find('button[aria-label="引用"]').trigger('click');
    expect(w.find('.aix-quote-chip').exists()).toBe(true);
    // 不输入任何文字，直接回车提交（有 chip 时 Sender 应放行空文本提交）
    await w.find('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    const user = (w.vm as unknown as { messages: ChatMessage[] }).messages.find(
      (m) => m.role === 'user',
    )!;
    expect(user.content.map((b) => b.type)).toEqual(['quote']);
    const ctx = request.mock.calls.at(-1)![0] as { messages: ChatMessage[] };
    const sentUser = ctx.messages.find((m) => m.role === 'user')!;
    expect((sentUser.content[0] as { text: string }).text).toContain('这是 AI 的回答内容');
    expect(w.find('.aix-quote-chip').exists()).toBe(false);
  });

  it('chip 折叠：超过默认阈值(3)收起为「+N」，点击展开/收起', async () => {
    const aiMsgs: ChatMessage[] = Array.from({ length: 5 }, (_, i) => ({
      id: `ai-${i}`,
      role: 'ai',
      status: 'success',
      content: [{ id: `b-${i}`, type: 'text', text: `AI 回答内容 ${i}` }],
    }));
    const { w } = mountChat({ defaultMessages: aiMsgs });

    for (let i = 0; i < 5; i += 1) {
      await w.findAll('button[aria-label="引用"]')[i]!.trigger('click');
    }

    expect(w.findAll('.aix-quote-chip')).toHaveLength(3);
    const toggle = w.find('.aix-ai-chat__quote-chips-toggle');
    expect(toggle.exists()).toBe(true);
    expect(toggle.text()).toContain('+2');

    await toggle.trigger('click');
    expect(w.findAll('.aix-quote-chip')).toHaveLength(5);
    const collapse = w.find('.aix-ai-chat__quote-chips-toggle');
    expect(collapse.exists()).toBe(true);
    expect(collapse.text()).toBe('收起');

    await collapse.trigger('click');
    expect(w.findAll('.aix-quote-chip')).toHaveLength(3);
  });

  it('chip 折叠：maxVisibleChips=Infinity 时不折叠', async () => {
    const aiMsgs: ChatMessage[] = Array.from({ length: 5 }, (_, i) => ({
      id: `ai-${i}`,
      role: 'ai',
      status: 'success',
      content: [{ id: `b-${i}`, type: 'text', text: `AI 回答内容 ${i}` }],
    }));
    const { w } = mountChat({ defaultMessages: aiMsgs, quote: { maxVisibleChips: Infinity } });

    for (let i = 0; i < 5; i += 1) {
      await w.findAll('button[aria-label="引用"]')[i]!.trigger('click');
    }

    expect(w.findAll('.aix-quote-chip')).toHaveLength(5);
    expect(w.find('.aix-ai-chat__quote-chips-toggle').exists()).toBe(false);
  });

  it('历史 user 消息里的 quote 块经内置渲染器展示', async () => {
    const history: ChatMessage[] = [
      {
        id: 'u0',
        role: 'user',
        status: 'local',
        content: [
          {
            id: 'qb',
            type: 'quote',
            quotes: [{ id: 'q', anchor: { source: { messageId: 'x' }, exact: '旧引文' } }],
          },
          { id: 'tb', type: 'text', text: '旧问题' },
        ],
      },
      aiMsg,
    ];
    const { w } = mountChat({ defaultMessages: history, quote: false });
    expect(w.find('.aix-quote-block').text()).toContain('旧引文');
  });

  // 回归：defineExpose 的 onSend 是文档化公开 API（README「通过 defineExpose 暴露
  // messages / isLoading / onSend / ...」），但它无条件 emit('send') 并清空 pendingQuotes，
  // 而内部 useChat.onSend 有 isLoading 守卫会静默拒收 → 流式期间调用会：
  // ① 抛出一个消息根本没发出的 send 事件（业务据此埋点/持久化即失真）
  // ② 把用户攒好的引用 chip 清空且不可恢复。
  // Sender 内部路径（loading 期按 Enter）有 doSubmit 守卫，不受影响。
  it('流式进行中调用 exposed onSend：不抛 send 事件、不清空引用 chip', async () => {
    // 永不产出数据的流：把 isLoading 钉在 true
    const request = vi.fn(async () => new ReadableStream<Uint8Array>({ start() {} }));
    const w = mount(AiChat, {
      props: { request, defaultMessages: [aiMsg], quote: true },
      attachTo: document.body,
    });
    const vm = w.vm as unknown as { onSend: (t: string) => unknown; isLoading: boolean };

    void vm.onSend('第一条');
    await flushPromises();
    expect(vm.isLoading).toBe(true);
    const sendCountBefore = w.emitted('send')!.length;

    // 攒一个引用 chip（走与 PC 操作栏完全相同的出口）
    await w.find('button[aria-label="引用"]').trigger('click');
    expect(w.findAll('.aix-quote-chip')).toHaveLength(1);

    void vm.onSend('流式期间插队的第二条');
    await flushPromises();

    // 消息未新增（useChat 守卫拒收）→ 对外事件与待发引用都必须保持原样
    expect(w.emitted('send')!.length).toBe(sendCountBefore);
    expect(w.findAll('.aix-quote-chip')).toHaveLength(1);
  });

  it('非流式时 exposed onSend 照常工作（守卫不得误伤正常路径）', async () => {
    const { w } = mountChat();
    const vm = w.vm as unknown as { onSend: (t: string) => unknown; messages: ChatMessage[] };
    await w.find('button[aria-label="引用"]').trigger('click');
    expect(w.findAll('.aix-quote-chip')).toHaveLength(1);

    await vm.onSend('正常发送');
    await flushPromises();

    expect(w.emitted('send')).toHaveLength(1);
    const user = vm.messages.find((m) => m.role === 'user')!;
    expect(user.content.map((b) => b.type)).toEqual(['quote', 'text']);
    expect(w.findAll('.aix-quote-chip')).toHaveLength(0); // 发送成功才清空
  });
});
