import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { useChat } from '../src/composables/useChat';
import type { ChatMessage, ContentBlock, ParsedChunk } from '../src/types';

const sse = (lines: string[]) => () =>
  Promise.resolve(
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const l of lines) c.enqueue(new TextEncoder().encode(`data: ${l}\n\n`));
        c.close();
      },
    }),
  );
const flush = async () => {
  for (let i = 0; i < 10; i++) await nextTick();
};

const parseChunk = (chunk: { data?: string }): ParsedChunk => {
  if (chunk.data === '[DONE]') return { done: true };
  try {
    return JSON.parse(chunk.data ?? '{}') as ParsedChunk;
  } catch {
    return {};
  }
};

/** 构造一个下发 user_confirm 块的流事件 */
const confirmChunk = (id: string, formId: string) =>
  JSON.stringify({
    block: {
      id,
      type: 'user_confirm',
      formId,
      fields: [{ name: 'f', question: '选一个', type: 'radio', options: ['A', 'B'] }],
      state: 'awaiting',
    },
  });

const confirms = (m: ChatMessage) =>
  m.content.filter(
    (b): b is Extract<ContentBlock, { type: 'user_confirm' }> => b.type === 'user_confirm',
  );

describe('useChat — 确认卡顶替（supersedeConfirms）', () => {
  it('同一条消息内新确认卡落地 → 早期 awaiting 卡置 expired，末卡保持 awaiting', async () => {
    const chat = useChat({
      request: sse([confirmChunk('c1', 'f1'), confirmChunk('c2', 'f2'), '[DONE]']),
      parseChunk,
    });
    await chat.onSend('走一个');
    await flush();

    const list = confirms(chat.messages.value[1]!);
    expect(list.map((b) => b.state)).toEqual(['expired', 'awaiting']);
  });

  it('三张卡：只有最后一张保持可交互', async () => {
    const chat = useChat({
      request: sse([
        confirmChunk('c1', 'f1'),
        confirmChunk('c2', 'f2'),
        confirmChunk('c3', 'f3'),
        '[DONE]',
      ]),
      parseChunk,
    });
    await chat.onSend('走一个');
    await flush();

    expect(confirms(chat.messages.value[1]!).map((b) => b.state)).toEqual([
      'expired',
      'expired',
      'awaiting',
    ]);
  });

  it('非 awaiting 的早期卡不被改写（submitted 保留自身状态）', async () => {
    const chat = useChat({
      request: sse([
        JSON.stringify({
          block: {
            id: 'c1',
            type: 'user_confirm',
            formId: 'f1',
            fields: [{ name: 'f', question: 'q', type: 'text', answer: '已答' }],
            state: 'submitted',
          },
        }),
        confirmChunk('c2', 'f2'),
        '[DONE]',
      ]),
      parseChunk,
    });
    await chat.onSend('走一个');
    await flush();

    expect(confirms(chat.messages.value[1]!).map((b) => b.state)).toEqual([
      'submitted',
      'awaiting',
    ]);
  });

  it('单张卡不自我顶替', async () => {
    const chat = useChat({
      request: sse([confirmChunk('c1', 'f1'), '[DONE]']),
      parseChunk,
    });
    await chat.onSend('走一个');
    await flush();

    expect(confirms(chat.messages.value[1]!).map((b) => b.state)).toEqual(['awaiting']);
  });

  it('只管本条消息，不跨消息扫描历史卡', async () => {
    const chat = useChat({
      request: sse([confirmChunk('c1', 'f1'), '[DONE]']),
      parseChunk,
    });
    await chat.onSend('第一轮');
    await flush();
    const first = confirms(chat.messages.value[1]!)[0]!;

    const chat2 = chat;
    await chat2.onSend('第二轮');
    await flush();

    // 上一条消息的卡不受新消息内确认卡影响
    expect(first.state).toBe('awaiting');
    expect(confirms(chat.messages.value[3]!).map((b) => b.state)).toEqual(['awaiting']);
  });
});
