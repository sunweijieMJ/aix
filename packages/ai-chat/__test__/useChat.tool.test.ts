import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { useChat } from '../src/composables/useChat';
import type { ChatMessage, ParsedChunk } from '../src/types';
import { openaiParseChunk } from '../src/utils/parsers';

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

// ============ 终态收尾：argsDone 给不全时按 argsText 补落 input ============
// parseChunk 是无跨事件状态的纯函数，给不出"这一帧该给哪些 index 发结束"；
// OpenAI 的 finish_reason 是 choice 级、不带 index，内置预设只能固定发 index:0。
// 于是并行工具调用时 index>=1 的块收不到 argsDone —— 由 useChat 在终态兜底收尾。
describe('useChat — 工具参数终态收尾', () => {
  const toolCall = (index: number, extra: Record<string, unknown>) =>
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index, ...extra }] } }] });

  const toolBlocks = (m: ChatMessage) =>
    m.content.filter((b) => b.type === 'tool_use') as Extract<
      ChatMessage['content'][number],
      { type: 'tool_use' }
    >[];

  it('并行工具调用：未收到 argsDone 的块也按 argsText 落 input（回归：此前永久卡在 input-streaming）', async () => {
    const chat = useChat({
      parseChunk: openaiParseChunk,
      request: sse([
        toolCall(0, { id: 'call_a', function: { name: 'get_weather', arguments: '' } }),
        toolCall(1, { id: 'call_b', function: { name: 'get_time', arguments: '' } }),
        toolCall(0, { function: { arguments: '{"city":"BJ"}' } }),
        toolCall(1, { function: { arguments: '{"tz":"CST"}' } }),
        // finish_reason 只能带出 index:0 的 argsDone
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
        '[DONE]',
      ]),
    });
    await chat.onSend('天气和时间');
    await flush();
    const blocks = toolBlocks(chat.messages.value[1]!);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.state)).toEqual(['input-available', 'input-available']);
    expect(blocks.map((b) => b.input)).toEqual([{ city: 'BJ' }, { tz: 'CST' }]);
  });

  it('argsText 为未闭合 JSON（坏流 / 真被截断）时保持 input-streaming，不伪造 input', async () => {
    const chat = useChat({
      parseChunk: openaiParseChunk,
      request: sse([
        toolCall(0, { id: 'call_a', function: { name: 'f', arguments: '{"a":' } }),
        '[DONE]',
      ]),
    });
    await chat.onSend('x');
    await flush();
    const [blk] = toolBlocks(chat.messages.value[1]!);
    expect(blk!.state).toBe('input-streaming');
    expect(blk!.input).toBeUndefined();
    expect(blk!.argsText).toBe('{"a":');
  });

  it('中断（abort）同样收尾：参数已完整时不因中断而丢失', async () => {
    // 与 useChat.test 的 abort 用例同款受控流：先出一帧带完整参数的工具事件，
    // 再由 abort 中断（此时流尚未 [DONE]，argsDone 永远不会到达）
    const chat = useChat({
      parseChunk: openaiParseChunk,
      request: async ({ signal }: { signal: AbortSignal }) =>
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(
              new TextEncoder().encode(
                `data: ${toolCall(0, { id: 'call_a', function: { name: 'f', arguments: '{"a":1}' } })}\n\n`,
              ),
            );
            signal.addEventListener('abort', () =>
              c.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        }),
    });
    const p = chat.onSend('x');
    await new Promise((r) => setTimeout(r, 10)); // 等首帧被消费
    chat.abort();
    await p;
    await flush();
    const ai = chat.messages.value[1]!;
    expect(ai.status).toBe('abort');
    const [blk] = toolBlocks(ai);
    expect(blk!.state).toBe('input-available');
    expect(blk!.input).toEqual({ a: 1 });
  });

  it('已由 argsDone 正常落定的块不被二次改写（幂等）', async () => {
    const chat = useChat({
      parseChunk,
      request: sse([
        JSON.stringify({
          tool: { index: 0, toolCallId: 'c1', toolName: 'search', input: { q: 'x' } },
        }),
        JSON.stringify({ tool: { index: 0, toolCallId: 'c1', output: 'ok' } }),
        '[DONE]',
      ]),
    });
    await chat.onSend('x');
    await flush();
    const [blk] = toolBlocks(chat.messages.value[1]!);
    // 已是 output-available，收尾不得把它拉回 input-available
    expect(blk!.state).toBe('output-available');
    expect(blk!.input).toEqual({ q: 'x' });
  });
});
