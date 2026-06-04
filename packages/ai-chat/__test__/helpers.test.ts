import { describe, it, expect } from 'vitest';
import {
  genBlockId,
  textBlock,
  reasoningBlock,
  sourcesBlock,
  textMessage,
  createMessage,
  messageText,
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
});
