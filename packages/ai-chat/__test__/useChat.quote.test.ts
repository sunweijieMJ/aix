import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import { useChat } from '../src/composables/useChat';
import type { Quote } from '../src/types';
import { quoteBlock, textBlock } from '../src/utils/helpers';

const sse = (): ReadableStream<Uint8Array> => {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: 'ok' })}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  });
};

const q: Quote = { id: 'q1', anchor: { source: { messageId: 'ai-0' }, exact: '引文' } };

describe('useChat 与 quote 块（回归）', () => {
  it('onSend 接受含 quote 块的 ContentBlock[]，quote 块前置入 user 消息', async () => {
    const request = vi.fn(async () => sse());
    const { messages, onSend } = useChat({ request });
    await onSend([quoteBlock([q]), textBlock('追问')]);
    await nextTick();
    const user = messages.value[0]!;
    expect(user.content.map((b) => b.type)).toEqual(['quote', 'text']);
  });

  it('onEdit 只替换 text 块，quote 块原位保留（不丢引用）', async () => {
    const request = vi.fn(async () => sse());
    const { messages, onSend, onEdit, isLoading } = useChat({ request });
    await onSend([quoteBlock([q]), textBlock('原问题')]);
    await vi.waitFor(() => expect(isLoading.value).toBe(false));
    const userId = messages.value[0]!.id;
    const ok = await onEdit(userId, '改后的问题');
    expect(ok).toBe(true);
    await nextTick();
    const edited = messages.value[0]!;
    expect(edited.content.some((b) => b.type === 'quote')).toBe(true);
    expect(edited.content.find((b) => b.type === 'text')).toMatchObject({ text: '改后的问题' });
  });
});
