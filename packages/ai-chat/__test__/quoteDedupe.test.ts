import { describe, it, expect } from 'vitest';
import type { Quote } from '../src/types';
import { upsertQuote } from '../src/utils/quoteDedupe';

const anchor = (over: Partial<Quote['anchor']> = {}): Quote['anchor'] => ({
  source: { messageId: 'ai-1' },
  exact: '这是一段引用文本',
  start: 0,
  end: 8,
  ...over,
});

describe('upsertQuote（锚点去重 + 意图更新）', () => {
  it('新增：空列表插入一条', () => {
    const q: Quote = { id: 'q1', anchor: anchor() };
    expect(upsertQuote([], q)).toEqual([q]);
  });

  it('幂等：同锚点 + 同 intent 重复插入，列表不变（不新增/不换 id）', () => {
    const q1: Quote = { id: 'q1', anchor: anchor(), intent: 'explain' };
    const q2: Quote = { id: 'q2', anchor: anchor(), intent: 'explain' };
    const result = upsertQuote([q1], q2);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(q1); // 保留原 id/原对象，chip 不重挂
  });

  it('意图更新：同锚点、不同 intent → 就地更新 intent，保留原 id，不新增条目', () => {
    const q1: Quote = { id: 'q1', anchor: anchor(), intent: 'explain' };
    const q2: Quote = { id: 'q2', anchor: anchor(), intent: 'translate' };
    const result = upsertQuote([q1], q2);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'q1', anchor: anchor(), intent: 'translate' });
  });

  it('不同锚点（不同消息/不同文本/不同偏移）照常累积', () => {
    const q1: Quote = { id: 'q1', anchor: anchor() };
    const q2: Quote = { id: 'q2', anchor: anchor({ source: { messageId: 'ai-2' } }) };
    const q3: Quote = { id: 'q3', anchor: anchor({ exact: '另一段文本' }) };
    const q4: Quote = { id: 'q4', anchor: anchor({ start: 1, end: 9 }) };
    let list = upsertQuote([], q1);
    list = upsertQuote(list, q2);
    list = upsertQuote(list, q3);
    list = upsertQuote(list, q4);
    expect(list.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
  });
});
