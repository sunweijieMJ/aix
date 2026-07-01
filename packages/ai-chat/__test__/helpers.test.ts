import { describe, it, expect } from 'vitest';
import type { ContentBlock } from '../src/types';
import {
  genBlockId,
  textBlock,
  reasoningBlock,
  sourcesBlock,
  textMessage,
  createMessage,
  messageText,
  attachmentBlock,
  toolFollowLen,
} from '../src/utils/helpers';

describe('helpers', () => {
  it('genBlockId 生成唯一 id', () => {
    expect(genBlockId()).not.toBe(genBlockId());
  });

  it('textBlock / reasoningBlock 带 id 与 type', () => {
    const t = textBlock('hi');
    expect(t).toMatchObject({ type: 'text', text: 'hi' });
    expect(typeof t.id).toBe('string');
    expect(reasoningBlock('think')).toMatchObject({ type: 'reasoning', text: 'think' });
  });

  it('sourcesBlock 承载 items', () => {
    const s = sourcesBlock([{ title: 'a' }]);
    expect(s).toMatchObject({ type: 'sources', items: [{ title: 'a' }] });
  });

  it('textMessage 构造单 text block 的消息', () => {
    const m = textMessage('user', 'hello');
    expect(m.role).toBe('user');
    expect(m.content).toHaveLength(1);
    expect(m.content[0]).toMatchObject({ type: 'text', text: 'hello' });
    expect(typeof m.id).toBe('string');
  });

  it('createMessage 接受任意 blocks 与可选字段', () => {
    const m = createMessage('ai', [textBlock('x')], { status: 'success' });
    expect(m).toMatchObject({ role: 'ai', status: 'success' });
    expect(m.content[0]).toMatchObject({ type: 'text', text: 'x' });
  });

  it('messageText 仅拼接 text block 文本（不含 reasoning/sources）', () => {
    const m = createMessage('ai', [
      reasoningBlock('思考'),
      textBlock('正文A'),
      textBlock('正文B'),
      sourcesBlock([{ title: 's' }]),
    ]);
    expect(messageText(m)).toBe('正文A正文B');
  });

  it('attachmentBlock 创建附件块（带稳定 id）', () => {
    const items = [
      { id: 'a1', name: 'report.pdf', url: '/f/a1', size: 102400, mime: 'application/pdf' },
    ];
    const b = attachmentBlock(items);
    expect(b.type).toBe('attachment');
    expect(b.items).toEqual(items);
    expect(b.items).toBe(items); // 无拷贝保留引用，锁定合约
    expect(b.id).toBeTruthy();
  });

  describe('toolFollowLen', () => {
    const toolBlock = (
      overrides: Partial<Extract<ContentBlock, { type: 'tool_use' }>> = {},
    ): Extract<ContentBlock, { type: 'tool_use' }> => ({
      id: genBlockId(),
      type: 'tool_use',
      toolCallId: 'c1',
      toolName: 'x',
      state: 'input-streaming',
      ...overrides,
    });

    it('无 tool_use 块时返回 0', () => {
      const blocks: ContentBlock[] = [textBlock('hi'), reasoningBlock('think')];
      expect(toolFollowLen(blocks)).toBe(0);
    });

    it('累加单个 tool_use 块的 argsText 长度', () => {
      const blocks: ContentBlock[] = [toolBlock({ argsText: '{"a":1' })];
      expect(toolFollowLen(blocks)).toBe(6);
    });

    it('output 存在时额外 +1', () => {
      const blocks: ContentBlock[] = [
        toolBlock({ state: 'output-available', argsText: '{"a":1}', output: 'ok' }),
      ];
      expect(toolFollowLen(blocks)).toBe(8); // argsText 长度 7 + output 存在 1
    });

    it('多个 tool_use 块的贡献累加', () => {
      const blocks: ContentBlock[] = [
        toolBlock({ argsText: 'abc' }), // 3
        toolBlock({ state: 'output-available', argsText: 'ab', output: 1 }), // 2 + 1
      ];
      expect(toolFollowLen(blocks)).toBe(6);
    });

    it('混合其他类型块时只统计 tool_use 块', () => {
      const blocks: ContentBlock[] = [
        textBlock('正文'),
        toolBlock({ argsText: 'abcd' }),
        sourcesBlock([{ title: 's' }]),
      ];
      expect(toolFollowLen(blocks)).toBe(4);
    });
  });
});
