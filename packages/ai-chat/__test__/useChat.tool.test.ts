import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { useChat } from '../src/composables/useChat';
import type { ParsedChunk } from '../src/types';

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

// 自定义 parseChunk：约定 data 为 {tool:{...}} 或 {done:true}
const parseChunk = (chunk: { data?: string }): ParsedChunk => {
  if (chunk.data === '[DONE]') return { done: true };
  try {
    return JSON.parse(chunk.data ?? '{}') as ParsedChunk;
  } catch {
    return {};
  }
};

describe('useChat — 工具流', () => {
  it('工具请求+结果装配成 tool_use 块', async () => {
    const chat = useChat({
      request: sse([
        JSON.stringify({
          tool: { index: 0, toolCallId: 'c1', toolName: 'search', input: { q: 'x' } },
        }),
        JSON.stringify({ tool: { index: 0, toolCallId: 'c1', output: 'ok' } }),
        '[DONE]',
      ]),
      parseChunk,
    });
    await chat.onSend('查一下');
    await flush();
    const ai = chat.messages.value[1]!;
    const blk = ai.content.find((b) => b.type === 'tool_use') as Extract<
      (typeof ai.content)[number],
      { type: 'tool_use' }
    >;
    expect(blk).toMatchObject({ toolName: 'search', state: 'output-available', output: 'ok' });
  });

  it('parseChunk 返回数组被逐一处理', async () => {
    const chat = useChat({
      request: sse([
        JSON.stringify([
          { delta: '答' },
          { tool: { index: 0, toolCallId: 'c1', toolName: 't', input: {} } },
        ]),
        '[DONE]',
      ]),
      parseChunk: (chunk: { data?: string }) => {
        if (chunk.data === '[DONE]') return { done: true };
        return JSON.parse(chunk.data ?? '{}') as ParsedChunk | ParsedChunk[];
      },
    });
    await chat.onSend('x');
    await flush();
    const ai = chat.messages.value[1]!;
    expect(ai.content.some((b) => b.type === 'text')).toBe(true);
    expect(ai.content.some((b) => b.type === 'tool_use')).toBe(true);
  });
});
