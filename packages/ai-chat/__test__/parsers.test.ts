import { describe, it, expect, vi } from 'vitest';
import type { SSEChunk } from '../src/composables/useXStream';
import {
  createParseChunk,
  flatParseChunk,
  openaiParseChunk,
  anthropicParseChunk,
} from '../src/utils/parsers';

/** 便捷构造 SSE 事件单元 */
const sse = (data: string, extra: Partial<SSEChunk> = {}): SSEChunk => ({ data, ...extra });

describe('parsers', () => {
  describe('flatParseChunk（库默认）', () => {
    it('解析 {delta} / {content}', () => {
      expect(flatParseChunk(sse('{"delta":"hi"}'))).toEqual({ delta: 'hi' });
      expect(flatParseChunk(sse('{"content":"x"}'))).toEqual({ delta: 'x' });
    });
    it('识别 [DONE] 结束信号', () => {
      expect(flatParseChunk(sse('[DONE]'))).toEqual({ done: true });
    });
    it('空 data 返回空对象；非 JSON 回退为整行文本', () => {
      expect(flatParseChunk(sse(''))).toEqual({});
      expect(flatParseChunk(sse('纯文本片段'))).toEqual({ delta: '纯文本片段' });
    });
  });

  describe('openaiParseChunk（OpenAI 兼容预设）', () => {
    it('读取 choices[0].delta.content 为 text 块增量', () => {
      const r = openaiParseChunk(sse('{"choices":[{"delta":{"content":"Hi"}}]}'));
      expect(r).toEqual({ delta: 'Hi', blockType: 'text' });
    });
    it('仅有 reasoning_content 时归入 reasoning 块', () => {
      const r = openaiParseChunk(sse('{"choices":[{"delta":{"reasoning_content":"想一下"}}]}'));
      expect(r).toEqual({ delta: '想一下', blockType: 'reasoning' });
    });
    it('content 与 reasoning_content 同时存在时优先 content（text）', () => {
      const r = openaiParseChunk(
        sse('{"choices":[{"delta":{"content":"答","reasoning_content":"思"}}]}'),
      );
      expect(r).toEqual({ delta: '答', blockType: 'text' });
    });
    it('结束帧（空 delta）与 [DONE]', () => {
      expect(openaiParseChunk(sse('{"choices":[{"delta":{},"finish_reason":"stop"}]}'))).toEqual({
        delta: '',
        blockType: 'text',
      });
      expect(openaiParseChunk(sse('[DONE]'))).toEqual({ done: true });
    });
  });

  describe('anthropicParseChunk（按 event 字段路由）', () => {
    it('content_block_delta 的 text_delta 归入 text 块', () => {
      const r = anthropicParseChunk(
        sse('{"delta":{"type":"text_delta","text":"Hi"}}', { event: 'content_block_delta' }),
      );
      expect(r).toEqual({ delta: 'Hi', blockType: 'text' });
    });
    it('thinking_delta 归入 reasoning 块', () => {
      const r = anthropicParseChunk(
        sse('{"delta":{"type":"thinking_delta","thinking":"嗯"}}', {
          event: 'content_block_delta',
        }),
      );
      expect(r).toEqual({ delta: '嗯', blockType: 'reasoning' });
    });
    it('message_stop 事件判定结束', () => {
      expect(anthropicParseChunk(sse('{}', { event: 'message_stop' }))).toEqual({ done: true });
    });
    it('其他事件（如 ping / message_start）不产出增量', () => {
      expect(anthropicParseChunk(sse('{}', { event: 'ping' }))).toEqual({});
    });
    it('content_block_delta 携带非法 JSON：跳过该事件并告警（不静默丢弃）', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(anthropicParseChunk(sse('not-json', { event: 'content_block_delta' }))).toEqual({});
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });
  });

  describe('createParseChunk 工厂', () => {
    it('可自定义 doneSignal 与 pickDelta', () => {
      const parse = createParseChunk({
        doneSignal: 'END',
        pickDelta: (j) => (j as { text?: string }).text,
      });
      expect(parse(sse('{"text":"yo"}'))).toEqual({ delta: 'yo' });
      expect(parse(sse('END'))).toEqual({ done: true });
      // 默认 [DONE] 不再是结束信号，作为普通 JSON/文本处理
      expect(parse(sse('[DONE]'))).toEqual({ delta: '[DONE]' });
    });
  });
});

describe('parseChunk — 工具分支', () => {
  it('anthropic content_block_start(tool_use) → 起始工具事件', () => {
    const r = anthropicParseChunk({
      event: 'content_block_start',
      data: JSON.stringify({
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_weather' },
      }),
    });
    expect(r).toMatchObject({ tool: { index: 1, toolCallId: 'toolu_1', toolName: 'get_weather' } });
  });

  it('anthropic input_json_delta → argsTextDelta', () => {
    const r = anthropicParseChunk({
      event: 'content_block_delta',
      data: JSON.stringify({
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"city":' },
      }),
    });
    expect(r).toMatchObject({ tool: { index: 1, argsTextDelta: '{"city":' } });
  });

  it('anthropic content_block_stop → argsDone', () => {
    const r = anthropicParseChunk({
      event: 'content_block_stop',
      data: JSON.stringify({ index: 1 }),
    });
    expect(r).toMatchObject({ tool: { index: 1, argsDone: true } });
  });

  it('openai delta.tool_calls 首片 → id+name+argsTextDelta', () => {
    const r = openaiParseChunk({
      data: JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, id: 'call_1', function: { name: 'f', arguments: '{"a"' } }],
            },
          },
        ],
      }),
    });
    expect(r).toMatchObject({
      tool: { index: 0, toolCallId: 'call_1', toolName: 'f', argsTextDelta: '{"a"' },
    });
  });

  it('openai 同帧多条并行 tool_calls → 逐条映射为工具事件数组（不丢弃 index 1+）', () => {
    const r = openaiParseChunk({
      data: JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_1', function: { name: 'f0', arguments: '{"a"' } },
                { index: 1, id: 'call_2', function: { name: 'f1', arguments: '{"b"' } },
              ],
            },
          },
        ],
      }),
    });
    expect(Array.isArray(r)).toBe(true);
    expect(r).toMatchObject([
      { tool: { index: 0, toolCallId: 'call_1', toolName: 'f0', argsTextDelta: '{"a"' } },
      { tool: { index: 1, toolCallId: 'call_2', toolName: 'f1', argsTextDelta: '{"b"' } },
    ]);
  });

  it('openai 多条 tool_calls 缺 index：回退数组下标作关联键', () => {
    const r = openaiParseChunk({
      data: JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                { id: 'call_1', function: { name: 'f0' } },
                { id: 'call_2', function: { name: 'f1' } },
              ],
            },
          },
        ],
      }),
    });
    expect(r).toMatchObject([{ tool: { index: 0 } }, { tool: { index: 1 } }]);
  });

  it('openai finish_reason=tool_calls → argsDone', () => {
    const r = openaiParseChunk({
      data: JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
    });
    expect(r).toMatchObject({ tool: { argsDone: true } });
  });
});
