import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import AiChat from '../src/components/AiChat.vue';
import type { ChatMessage } from '../src/types';

// BubbleList 内部依赖 virtua 做虚拟滚动，jsdom 无真实布局测量；
// 与既有 AiChat.*.test.ts 同口径：直接渲染全部 data，绕开虚拟化。
vi.mock('virtua/vue', () => ({
  Virtualizer: {
    name: 'Virtualizer',
    props: ['data'],
    setup(props: { data: unknown[] }, { slots }: { slots: Record<string, (p: unknown) => unknown> }) {
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
    props: { request, defaultMessages: [aiMsg], ...extra },
    attachTo: document.body,
  });
  return { w, request };
};

describe('AiChat quote 接线', () => {
  it('pcQuoteAction 默认注入：AI 消息操作栏出现引用按钮；quote:false 时不注入', async () => {
    const { w } = mountChat();
    expect(w.find('button[aria-label="引用"]').exists()).toBe(true);
    const { w: w2 } = mountChat({ quote: false });
    expect(w2.find('button[aria-label="引用"]').exists()).toBe(false);
  });

  it('quote.pcQuoteAction=false 仅关操作栏注入，划词仍可用', () => {
    const { w } = mountChat({ quote: { pcQuoteAction: false } });
    expect(w.find('button[aria-label="引用"]').exists()).toBe(false);
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
          { id: 'qb', type: 'quote', quotes: [{ id: 'q', anchor: { source: { messageId: 'x' }, exact: '旧引文' } }] },
          { id: 'tb', type: 'text', text: '旧问题' },
        ],
      },
      aiMsg,
    ];
    const { w } = mountChat({ defaultMessages: history });
    expect(w.find('.aix-quote-block').text()).toContain('旧引文');
  });
});
