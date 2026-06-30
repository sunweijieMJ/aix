import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { useChat } from '../src/composables/useChat';
import type { ParsedChunk } from '../src/types';

// 立即结束的假流：每次 request 推一段文本即 done
const makeRequest = (reply: string) => () =>
  Promise.resolve(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ delta: reply })}\n\n`));
        c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        c.close();
      },
    }),
  );
const parseChunk = (chunk: { data?: string }): ParsedChunk => {
  if (chunk.data === '[DONE]') return { done: true };
  try {
    return JSON.parse(chunk.data ?? '{}') as ParsedChunk;
  } catch {
    return {};
  }
};
const flush = async () => {
  // 等流读完 + 状态落定
  for (let i = 0; i < 10; i++) await nextTick();
};

describe('useChat — 分支', () => {
  it('onReload 不覆盖旧回复，产生兄弟版本并出现 branches', async () => {
    let n = 0;
    const chat = useChat({
      request: () => makeRequest(`回复${(n += 1)}`)(),
      parseChunk,
    });
    await chat.onSend('问题');
    await flush();
    const aiId = chat.messages.value[1]!.id;
    expect(chat.messages.value[1]!.content[0]).toMatchObject({ text: '回复1' });

    await chat.onReload(aiId);
    await flush();
    // active path 仍是 [user, ai]，但 ai 现在是第 2 版本
    expect(chat.messages.value).toHaveLength(2);
    expect(chat.messages.value[1]!.content[0]).toMatchObject({ text: '回复2' });
    const newAiId = chat.messages.value[1]!.id;
    expect(chat.getBranches(newAiId)).toEqual({ index: 1, count: 2 });

    // 切回旧版本看到 回复1
    expect(chat.switchBranch(newAiId, -1)).toBe(true);
    await nextTick();
    expect(chat.messages.value[1]!.content[0]).toMatchObject({ text: '回复1' });
  });

  it('onEdit 把用户消息改写为兄弟分支并重发，旧分支保留', async () => {
    let n = 0;
    const chat = useChat({
      request: () => makeRequest(`答${(n += 1)}`)(),
      parseChunk,
    });
    await chat.onSend('原问题');
    await flush();
    const userId = chat.messages.value[0]!.id;

    const accepted = await chat.onEdit(userId, '改后问题');
    await flush();
    expect(accepted).toBe(true);
    expect(chat.messages.value[0]!.content[0]).toMatchObject({ text: '改后问题' });
    expect(chat.getBranches(chat.messages.value[0]!.id)).toEqual({ index: 1, count: 2 });

    // 切回旧用户分支 → 原问题与旧回复重现
    chat.switchBranch(chat.messages.value[0]!.id, -1);
    await nextTick();
    expect(chat.messages.value[0]!.content[0]).toMatchObject({ text: '原问题' });
  });
});
