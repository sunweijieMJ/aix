import { describe, it, expect } from 'vitest';
import type { ChatMessage, ContentBlock } from '../src/types';
import { applyToolEvent, toArray, type ToolReduceCtx } from '../src/utils/toolBlocks';

const newMsg = (): ChatMessage => ({ id: 'ai1', role: 'ai', content: [], status: 'updating' });
const newCtx = (): ToolReduceCtx => {
  let n = 0;
  return { indexToBlockId: new Map(), genBlockId: () => `blk${(n += 1)}` };
};
const toolBlk = (m: ChatMessage) =>
  m.content.find((b) => b.type === 'tool_use') as Extract<ContentBlock, { type: 'tool_use' }>;

describe('applyToolEvent', () => {
  it('首事件建块（无 input → input-streaming）', () => {
    const m = newMsg();
    applyToolEvent(m, { index: 0, toolCallId: 'c1', toolName: 'search' }, newCtx());
    expect(m.content).toHaveLength(1);
    expect(toolBlk(m)).toMatchObject({
      type: 'tool_use',
      toolCallId: 'c1',
      toolName: 'search',
      state: 'input-streaming',
      argsText: '',
    });
  });

  it('整体 input 一次落 → input-available', () => {
    const m = newMsg();
    applyToolEvent(
      m,
      { index: 0, toolCallId: 'c1', toolName: 'search', input: { q: 'x' } },
      newCtx(),
    );
    expect(toolBlk(m)).toMatchObject({ state: 'input-available', input: { q: 'x' } });
  });

  it('分片累积 argsText，argsDone 后解析为 input', () => {
    const m = newMsg();
    const ctx = newCtx();
    applyToolEvent(m, { index: 0, toolCallId: 'c1', toolName: 's' }, ctx);
    applyToolEvent(m, { index: 0, argsTextDelta: '{"q":' }, ctx);
    applyToolEvent(m, { index: 0, argsTextDelta: '"北京"}' }, ctx);
    applyToolEvent(m, { index: 0, argsDone: true }, ctx);
    expect(toolBlk(m)).toMatchObject({
      state: 'input-available',
      input: { q: '北京' },
      argsText: '{"q":"北京"}',
    });
  });

  it('argsDone 时 JSON 未闭合 → 不落 input，保持 input-streaming', () => {
    const m = newMsg();
    const ctx = newCtx();
    applyToolEvent(m, { index: 0, toolCallId: 'c1', toolName: 's' }, ctx);
    applyToolEvent(m, { index: 0, argsTextDelta: '{"q":' }, ctx);
    applyToolEvent(m, { index: 0, argsDone: true }, ctx);
    expect(toolBlk(m)).toMatchObject({ state: 'input-streaming', input: undefined });
  });

  it('无参工具：argsDone 时 argsText 为空 → input={} 且转 input-available（不卡 input-streaming）', () => {
    const m = newMsg();
    const ctx = newCtx();
    applyToolEvent(m, { index: 0, toolCallId: 'c1', toolName: 'noop' }, ctx);
    applyToolEvent(m, { index: 0, argsDone: true }, ctx);
    expect(toolBlk(m)).toMatchObject({ state: 'input-available', input: {} });
  });

  it('output / errorText 落终态', () => {
    const m = newMsg();
    const ctx = newCtx();
    applyToolEvent(m, { index: 0, toolCallId: 'c1', toolName: 's', input: {} }, ctx);
    applyToolEvent(m, { index: 0, output: '晴 28 度' }, ctx);
    expect(toolBlk(m)).toMatchObject({ state: 'output-available', output: '晴 28 度' });

    const m2 = newMsg();
    const ctx2 = newCtx();
    applyToolEvent(m2, { index: 0, toolCallId: 'c2', toolName: 's', input: {} }, ctx2);
    applyToolEvent(m2, { index: 0, errorText: '超时' }, ctx2);
    expect(toolBlk(m2)).toMatchObject({ state: 'output-error', errorText: '超时' });
  });

  it('并行多工具按 index 隔离', () => {
    const m = newMsg();
    const ctx = newCtx();
    applyToolEvent(m, { index: 0, toolCallId: 'a', toolName: 'A' }, ctx);
    applyToolEvent(m, { index: 1, toolCallId: 'b', toolName: 'B' }, ctx);
    applyToolEvent(m, { index: 0, argsTextDelta: '{}' }, ctx);
    applyToolEvent(m, { index: 0, argsDone: true }, ctx);
    expect(m.content).toHaveLength(2);
    expect((m.content[0] as any).toolName).toBe('A');
    expect((m.content[1] as any).toolName).toBe('B');
  });

  it('跨请求：output 事件按 toolCallId 命中已有块，不产生重复块', () => {
    const m = newMsg();
    // 第一段请求建块
    applyToolEvent(m, { index: 0, toolCallId: 'c1', toolName: 's', input: {} }, newCtx());
    // 第二段请求（新 ctx / 新 index 映射），仅带 toolCallId + output
    applyToolEvent(m, { index: 0, toolCallId: 'c1', output: 'done' }, newCtx());
    expect(m.content).toHaveLength(1);
    expect(toolBlk(m)).toMatchObject({ state: 'output-available', output: 'done' });
  });

  it('未知 index 的纯 argsDone 事件被忽略，不建块', () => {
    const m = newMsg();
    applyToolEvent(m, { index: 5, argsDone: true }, newCtx());
    expect(m.content).toHaveLength(0);
  });

  it('toArray 归一', () => {
    expect(toArray(1)).toEqual([1]);
    expect(toArray([1, 2])).toEqual([1, 2]);
  });
});
