import { describe, it, expect } from 'vitest';
import type { ContentBlock, ToolUseState, ToolEventDelta, ParsedChunk } from '../src/types';

describe('tool_use 数据模型', () => {
  it('tool_use 块可构造且字段齐全', () => {
    const state: ToolUseState = 'input-available';
    const blk: ContentBlock = {
      id: 'b1',
      type: 'tool_use',
      toolCallId: 'call_1',
      toolName: 'get_weather',
      state,
      input: { city: '北京' },
      output: { temp: 28 },
    };
    expect(blk.type).toBe('tool_use');
    // 判别联合收窄
    if (blk.type === 'tool_use') expect(blk.toolName).toBe('get_weather');
  });

  it('ToolEventDelta 与 ParsedChunk.tool 可组合', () => {
    const ev: ToolEventDelta = {
      index: 0,
      toolCallId: 'call_1',
      toolName: 'x',
      argsTextDelta: '{"a"',
    };
    const chunk: ParsedChunk = { tool: ev };
    expect(chunk.tool?.index).toBe(0);
  });
});
