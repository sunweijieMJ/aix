import { describe, it, expect } from 'vitest';
import { reconcileStreamingBlocks } from '../src/utils/streamingBlocks';

/** 测试用单调 id 生成器 */
const makeGenId = () => {
  let c = 0;
  return () => `b${c++}`;
};

describe('reconcileStreamingBlocks（按位置复用稳定 id）', () => {
  it('空 slices → 空数组', () => {
    expect(reconcileStreamingBlocks([], [], makeGenId())).toEqual([]);
  });

  it('为每个切片产出 { id, source }', () => {
    const blocks = reconcileStreamingBlocks([], ['A', 'B'], makeGenId());
    expect(blocks).toEqual([
      { id: 'b0', source: 'A' },
      { id: 'b1', source: 'B' },
    ]);
  });

  it('增长时 committed 前缀 id 跨帧稳定，末块由活跃转 committed 保留同一 id', () => {
    const genId = makeGenId();
    const f1 = reconcileStreamingBlocks([], ['A'], genId);
    const aId = f1[0]!.id;
    // 出现第二块：第一块保留 id（不重 mount），新末块分配新 id
    const f2 = reconcileStreamingBlocks(f1, ['A', 'B'], genId);
    expect(f2[0]!.id).toBe(aId);
    const bId = f2[1]!.id;
    expect(bId).not.toBe(aId);
    // 出现第三块：前两块 id 不变
    const f3 = reconcileStreamingBlocks(f2, ['A', 'B', 'C'], genId);
    expect(f3[0]!.id).toBe(aId);
    expect(f3[1]!.id).toBe(bId);
  });

  it('末块内容增长时 id 稳定（不重 mount）', () => {
    const genId = makeGenId();
    const f1 = reconcileStreamingBlocks([], ['He'], genId);
    const id = f1[0]!.id;
    const f2 = reconcileStreamingBlocks(f1, ['Hello'], genId);
    expect(f2[0]!.id).toBe(id);
    expect(f2[0]!.source).toBe('Hello');
  });

  it('setext 等回溯改写：单块时 id 稳定，新块出现后前缀 id 不变', () => {
    const genId = makeGenId();
    const f1 = reconcileStreamingBlocks([], ['text'], genId);
    const id = f1[0]!.id;
    const f2 = reconcileStreamingBlocks(f1, ['text\n==='], genId); // 仍单块（setext 标题）
    expect(f2[0]!.id).toBe(id);
    const f3 = reconcileStreamingBlocks(f2, ['text\n===', 'more'], genId);
    expect(f3[0]!.id).toBe(id);
  });
});
