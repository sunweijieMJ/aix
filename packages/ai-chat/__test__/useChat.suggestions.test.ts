import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import { useChat } from '../src/composables/useChat';
import type { SSEChunk } from '../src/composables/useXStream';
import type { ParsedChunk } from '../src/types';
import { normalizeSuggestions } from '../src/utils/helpers';

// 与 useChat.test.ts 的本地 sseStream 同构：按 SSE 规范用空行（\n\n）分隔事件，
// 每帧 data 为整段 JSON（而非仅 delta），供本文件按帧直接构造任意 ParsedChunk 形状。
function sseFrames(frames: unknown[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const f of frames) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
      c.close();
    },
  });
}

// parseChunk：直接把 SSE data 的 JSON 报文透传为 ParsedChunk，
// 使测试能逐帧精确指定 delta / suggestions / done 组合，不依赖库内置预设的字段映射。
const passthroughParseChunk = (chunk: SSEChunk): ParsedChunk =>
  chunk.data ? (JSON.parse(chunk.data) as ParsedChunk) : {};

describe('normalizeSuggestions', () => {
  it('字符串归一为 SuggestionItem，对象透传', () => {
    expect(normalizeSuggestions(['问A', { text: '问B', label: 'B' }])).toEqual([
      { text: '问A' },
      { text: '问B', label: 'B' },
    ]);
  });
});

describe('useChat suggestions 通道', () => {
  it('parseChunk 返回 suggestions：收到即写入该条 AI 消息', async () => {
    const request = vi.fn(async () =>
      sseFrames([{ delta: '你好' }, { suggestions: ['追问1', '追问2'], done: true }]),
    );
    const { messages, onSend } = useChat({ request, parseChunk: passthroughParseChunk });
    await onSend('hi');
    await nextTick();
    const aiMsg = messages.value[1]!;
    expect(aiMsg.suggestions).toEqual([{ text: '追问1' }, { text: '追问2' }]);
  });

  it('多次下发整体覆盖（后到覆盖先到）', async () => {
    const request = vi.fn(async () =>
      sseFrames([{ suggestions: ['旧'] }, { suggestions: ['新'], done: true }]),
    );
    const { messages, onSend } = useChat({ request, parseChunk: passthroughParseChunk });
    await onSend('hi');
    await nextTick();
    expect(messages.value[1]!.suggestions).toEqual([{ text: '新' }]);
  });

  it('exportTree 序列化包含 suggestions（持久化还原）', async () => {
    const request = vi.fn(async () =>
      sseFrames([{ delta: 'ok' }, { suggestions: ['追问A'], done: true }]),
    );
    const { onSend, exportTree } = useChat({ request, parseChunk: passthroughParseChunk });
    await onSend('hi');
    await nextTick();
    const tree = exportTree();
    const aiNode = tree.nodes.find((n) => n.message.role === 'ai');
    expect(aiNode?.message.suggestions).toEqual([{ text: '追问A' }]);
  });

  // 回归：重试回滚只 splice 了 content，失败半截流写入的 suggestions 残留，
  // 最终 success（isLoading 复位、展示抑制解除）后陈旧追问建议照常展示
  it('重试回滚：失败尝试写入的 suggestions 不残留到最终成功结果', async () => {
    let attempt = 0;
    const enc = new TextEncoder();
    const chat = useChat({
      request: async () => {
        attempt += 1;
        if (attempt === 1) {
          // 第一轮：先落 suggestions 再流错误（pull 保证增量先被消费）
          let sent = false;
          return new ReadableStream<Uint8Array>({
            pull(c) {
              if (!sent) {
                sent = true;
                c.enqueue(enc.encode(`data: ${JSON.stringify({ suggestions: ['陈旧追问'] })}\n\n`));
              } else {
                c.error(new Error('boom'));
              }
            },
          });
        }
        return sseFrames([{ delta: '成功' }, { done: true }]);
      },
      parseChunk: passthroughParseChunk,
      retryTimes: 1,
      retryInterval: 1,
    });
    await chat.onSend('q');
    // 等待重试间隔（真实 setTimeout）+ 第二轮流完成
    await new Promise((r) => setTimeout(r, 30));
    for (let i = 0; i < 12; i++) await nextTick();
    const ai = chat.messages.value[1]!;
    expect(attempt).toBe(2);
    expect(ai.status).toBe('success');
    expect(ai.suggestions).toBeUndefined();
  });
});
