import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { useChat } from '../src/composables/useChat';
import type { ParsedChunk } from '../src/types';

const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick();
};
const stream = (lines: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(`data: ${l}\n\n`));
      c.close();
    },
  });
const parseChunk = (chunk: { data?: string }): ParsedChunk => {
  if (chunk.data === '[DONE]') return { done: true };
  try {
    return JSON.parse(chunk.data ?? '{}') as ParsedChunk;
  } catch {
    return {};
  }
};

describe('useChat — resume 续流', () => {
  it('resume 向同一 AI 消息续写，不新建节点，output 按 toolCallId 命中', async () => {
    const chat = useChat({
      request: ({ resume }) =>
        Promise.resolve(
          resume
            ? stream([
                JSON.stringify({ tool: { index: 0, toolCallId: 'c1', output: '已确认' } }),
                JSON.stringify({ delta: '完成' }),
                '[DONE]',
              ])
            : stream([
                JSON.stringify({
                  tool: { index: 0, toolCallId: 'c1', toolName: 'act', input: { x: 1 } },
                }),
                '[DONE]',
              ]),
        ),
      parseChunk,
    });
    await chat.onSend('做点事');
    await flush();
    const aiId = chat.messages.value[1]!.id;
    const before = chat.messages.value.length;
    expect(chat.messages.value[1]!.content.find((b) => b.type === 'tool_use')).toMatchObject({
      state: 'input-available',
    });

    const ok = await chat.resume(aiId, { approved: true });
    await flush();
    expect(ok).toBe(true);
    expect(chat.messages.value.length).toBe(before); // 无新节点
    const ai = chat.messages.value[1]!;
    expect(ai.content.find((b) => b.type === 'tool_use')).toMatchObject({
      state: 'output-available',
      output: '已确认',
    });
    expect(ai.content.some((b) => b.type === 'text' && b.text === '完成')).toBe(true);
  });

  it('isLoading 时 resume 被拒（并发守卫）', async () => {
    let release: () => void = () => {};
    const chat = useChat({
      request: () =>
        new Promise((r) => {
          release = () => r(stream(['[DONE]']));
        }),
      parseChunk,
    });
    const p = chat.onSend('x');
    await nextTick();
    const aiId = chat.messages.value[1]!.id;
    expect(await chat.resume(aiId, {})).toBe(false);
    release();
    await p;
    await flush();
  });

  it('非 ai 消息 / 不存在 id → resume 返回 false', async () => {
    const chat = useChat({ request: () => Promise.resolve(stream(['[DONE]'])), parseChunk });
    expect(await chat.resume('nope', {})).toBe(false);
  });
});
