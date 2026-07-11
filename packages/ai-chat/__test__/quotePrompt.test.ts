import { describe, it, expect } from 'vitest';
import type { ChatMessage, Quote } from '../src/types';
import { defaultQuoteToPrompt, flattenQuoteBlocks, getQuotes } from '../src/utils/quotePrompt';

const q = (exact: string, intent?: string): Quote => ({
  id: `q-${exact}`,
  anchor: { source: { messageId: 'm1' }, exact },
  intent,
});

describe('defaultQuoteToPrompt', () => {
  it('单条引用拼成 blockquote', () => {
    expect(defaultQuoteToPrompt([q('第一行\n第二行')])).toBe('> 第一行\n> 第二行');
  });
  it('多条引用以空行分隔', () => {
    expect(defaultQuoteToPrompt([q('A'), q('B')])).toBe('> A\n\n> B');
  });
  it('intent=explain 加对应指令前缀', () => {
    expect(defaultQuoteToPrompt([q('被解释的文本', 'explain')])).toBe(
      '请解释以下引用内容：\n> 被解释的文本',
    );
  });
  it('intent=ask 加对应指令前缀', () => {
    expect(defaultQuoteToPrompt([q('被追问的文本', 'ask')])).toBe(
      '请回答关于以下引用内容的问题：\n> 被追问的文本',
    );
  });
  it('intent=translate 加对应指令前缀', () => {
    expect(defaultQuoteToPrompt([q('被翻译的文本', 'translate')])).toBe(
      '请翻译以下引用内容：\n> 被翻译的文本',
    );
  });
  it('自定义 intent（非内置）维持纯 blockquote，不加前缀', () => {
    expect(defaultQuoteToPrompt([q('自定义意图', 'summarize')])).toBe('> 自定义意图');
  });
  it('无 intent 维持纯 blockquote', () => {
    expect(defaultQuoteToPrompt([q('无意图文本')])).toBe('> 无意图文本');
  });
  it('多条混合 intent：各自按规则拼装，空行分隔', () => {
    expect(defaultQuoteToPrompt([q('A', 'explain'), q('B')])).toBe(
      '请解释以下引用内容：\n> A\n\n> B',
    );
  });
  // 回归：划词产生的 exact 经 normalizeText 折叠（永不含 \n），代码块/多段落引用
  // 发给 LLM 会丢失换行与缩进——anchor.rawText 保存选区原文，拼装时优先使用
  it('anchor 含 rawText 时优先用原文拼装（保留换行）', () => {
    const quote: Quote = {
      id: 'q-raw',
      anchor: { source: { messageId: 'm1' }, exact: 'const a = 1; const b = 2;', rawText: 'const a = 1;\nconst b = 2;' },
    };
    expect(defaultQuoteToPrompt([quote])).toBe('> const a = 1;\n> const b = 2;');
  });
});

describe('flattenQuoteBlocks', () => {
  const msg: ChatMessage = {
    id: 'u1',
    role: 'user',
    content: [
      { id: 'b1', type: 'quote', quotes: [q('被引用文本')] },
      { id: 'b2', type: 'text', text: '用户追问' },
    ],
  };

  it('quote 块拍平为 text 块，其余原样', () => {
    const out = flattenQuoteBlocks([msg]);
    expect(out[0]!.content[0]).toEqual({ id: 'b1', type: 'text', text: '> 被引用文本' });
    expect(out[0]!.content[1]).toEqual(msg.content[1]);
  });

  it('纯函数：不 mutate 原消息/原 content（SSOT 保护）', () => {
    const before = JSON.parse(JSON.stringify(msg));
    const out = flattenQuoteBlocks([msg]);
    expect(msg).toEqual(before);
    expect(out[0]).not.toBe(msg);
    expect(out[0]!.content).not.toBe(msg.content);
  });

  it('无 quote 块的消息返回原引用（零开销直通）', () => {
    const plain: ChatMessage = { id: 'a1', role: 'ai', content: [{ id: 't', type: 'text', text: 'hi' }] };
    expect(flattenQuoteBlocks([plain])[0]).toBe(plain);
  });

  it('支持自定义 toPrompt', () => {
    const out = flattenQuoteBlocks([msg], (quotes) => `<quote>${quotes[0]!.anchor.exact}</quote>`);
    expect(out[0]!.content[0]).toMatchObject({ type: 'text', text: '<quote>被引用文本</quote>' });
  });
});

describe('getQuotes', () => {
  it('遍历 content 取出全部 Quote', () => {
    const msg2: ChatMessage = {
      id: 'u2',
      role: 'user',
      content: [
        { id: 'b1', type: 'quote', quotes: [q('A')] },
        { id: 'b2', type: 'text', text: 'x' },
        { id: 'b3', type: 'quote', quotes: [q('B')] },
      ],
    };
    expect(getQuotes(msg2).map((x) => x.anchor.exact)).toEqual(['A', 'B']);
  });
});
