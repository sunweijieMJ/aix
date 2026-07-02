import { describe, it, expect } from 'vitest';
import type { ContentBlock, Quote, QuoteBlock, ActionKey } from '../src/types';
import { quoteBlock, genQuoteId } from '../src/utils/helpers';

describe('quote 类型与工厂', () => {
  it('quoteBlock 工厂产出带 id 的 quote 块', () => {
    const q: Quote = {
      id: genQuoteId(),
      anchor: { source: { messageId: 'm1' }, exact: 'hello' },
      intent: 'explain',
    };
    const blk = quoteBlock([q]);
    expect(blk.type).toBe('quote');
    expect(blk.id).toBeTruthy();
    expect((blk as QuoteBlock).quotes).toEqual([q]);
  });

  it('genQuoteId 单调唯一', () => {
    expect(genQuoteId()).not.toBe(genQuoteId());
  });

  it('quote 块可赋值给 ContentBlock（联合成员）且 ActionKey 含 quote', () => {
    const blk: ContentBlock = { id: 'b1', type: 'quote', quotes: [] };
    const key: ActionKey = 'quote';
    expect(blk.type).toBe('quote');
    expect(key).toBe('quote');
  });
});
