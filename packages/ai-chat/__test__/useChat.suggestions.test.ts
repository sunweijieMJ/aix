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
    const request = vi.fn(
      async () =>
        sseFrames([{ delta: '你好' }, { suggestions: ['追问1', '追问2'], done: true }]),
    );
    const { messages, onSend } = useChat({ request, parseChunk: passthroughParseChunk });
    await onSend('hi');
    await nextTick();
    const aiMsg = messages.value[1]!;
    expect(aiMsg.suggestions).toEqual([{ text: '追问1' }, { text: '追问2' }]);
  });

  it('多次下发整体覆盖（后到覆盖先到）', async () => {
    const request = vi.fn(
      async () => sseFrames([{ suggestions: ['旧'] }, { suggestions: ['新'], done: true }]),
    );
    const { messages, onSend } = useChat({ request, parseChunk: passthroughParseChunk });
    await onSend('hi');
    await nextTick();
    expect(messages.value[1]!.suggestions).toEqual([{ text: '新' }]);
  });

  it('exportTree 序列化包含 suggestions（持久化还原）', async () => {
    const request = vi.fn(
      async () => sseFrames([{ delta: 'ok' }, { suggestions: ['追问A'], done: true }]),
    );
    const { onSend, exportTree } = useChat({ request, parseChunk: passthroughParseChunk });
    await onSend('hi');
    await nextTick();
    const tree = exportTree();
    const aiNode = tree.nodes.find((n) => n.message.role === 'ai');
    expect(aiNode?.message.suggestions).toEqual([{ text: '追问A' }]);
  });
});
