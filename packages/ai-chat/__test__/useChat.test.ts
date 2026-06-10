import { describe, it, expect, vi } from 'vitest';
import { nextTick, effectScope, toRaw } from 'vue';
import { useChat } from '../src/composables/useChat';
import type { UseChatRequestCtx } from '../src/composables/useChat';
import type { ChatMessage, ContentBlock } from '../src/types';
import {
  messageText,
  textMessage,
  createMessage,
  textBlock,
  sourcesBlock,
  attachmentBlock,
} from '../src/utils/helpers';
import { anthropicParseChunk } from '../src/utils/parsers';

// 按 SSE 规范用空行（\n\n）分隔事件
function sseStream(deltas: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const d of deltas) c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: d })}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  });
}

describe('useChat', () => {
  it('onSend 追加 user + ai 消息并按默认 SSE 解析累积', async () => {
    const request = vi.fn(async () => sseStream(['Hello', ' world']));
    const { messages, onSend, isLoading } = useChat({ request });
    await onSend('hi');
    await nextTick();
    expect(messages.value).toHaveLength(2);
    expect(messages.value[0].role).toBe('user');
    expect(messageText(messages.value[0])).toBe('hi');
    expect(messages.value[1].role).toBe('ai');
    expect(messageText(messages.value[1])).toBe('Hello world');
    expect(messages.value[1].status).toBe('success');
    expect(isLoading.value).toBe(false);
  });

  it('自定义 parseChunk 生效（line 模式：按行喂字符串）', async () => {
    const request = vi.fn(
      async () =>
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('A\nB\n'));
            c.close();
          },
        }),
    );
    const { messages, onSend } = useChat({
      request,
      streamMode: 'line',
      parseChunk: (raw) => ({ delta: raw }),
    });
    await onSend('go');
    expect(messageText(messages.value[1])).toBe('AB');
  });

  it('SSE event 字段全链路路由（Anthropic 风格：event + data 关联）', async () => {
    const enc = new TextEncoder();
    const request = vi.fn(
      async () =>
        new ReadableStream<Uint8Array>({
          start(c) {
            // 每个事件含 event 行 + data 行，靠 \n\n 分隔——单 \n 切行模型无法关联两者
            c.enqueue(
              enc.encode(
                'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"你"}}\n\n',
              ),
            );
            c.enqueue(
              enc.encode(
                'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"好"}}\n\n',
              ),
            );
            c.enqueue(enc.encode('event: message_stop\ndata: {}\n\n'));
            c.close();
          },
        }),
    );
    const { messages, onSend } = useChat({ request, parseChunk: anthropicParseChunk });
    await onSend('hi');
    await nextTick();
    expect(messageText(messages.value[1])).toBe('你好');
    expect(messages.value[1].status).toBe('success');
  });

  it('request 抛错时 ai 消息标记 error', async () => {
    const request = vi.fn(async () => {
      throw new Error('boom');
    });
    const { messages, onSend } = useChat({ request });
    await onSend('hi');
    expect(messages.value[1].status).toBe('error');
  });

  it('abort 时 ai 消息标记 abort 而非 error', async () => {
    const request = vi.fn(
      async ({ signal }: { signal: AbortSignal }) =>
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"delta":"x"}\n\n'));
            signal.addEventListener('abort', () =>
              c.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        }),
    );
    const { messages, onSend, abort } = useChat({ request });
    const p = onSend('hi');
    await new Promise((r) => setTimeout(r, 10)); // 等首个 chunk 被消费
    abort();
    await p;
    expect(messages.value[1].status).toBe('abort');
  });

  it('defaultMessages 初始化历史消息', () => {
    const request = vi.fn(async () => sseStream(['x']));
    const { messages } = useChat({ request, defaultMessages: [textMessage('user', '历史')] });
    expect(messages.value).toHaveLength(1);
    expect(messageText(messages.value[0])).toBe('历史');
  });

  it('setMessages 直接替换消息列表', () => {
    const request = vi.fn(async () => sseStream(['x']));
    const { messages, setMessages } = useChat({ request });
    setMessages([createMessage('user', [textBlock('hi')], { id: 'a', status: 'local' })]);
    expect(messages.value).toHaveLength(1);
    expect(messageText(messages.value[0])).toBe('hi');
  });

  it('onReload 重置目标 ai 消息并重新请求', async () => {
    let call = 0;
    const request = vi.fn(async () => sseStream([call++ === 0 ? 'first' : 'second']));
    const { messages, onSend, onReload } = useChat({ request });
    await onSend('hi');
    await nextTick();
    const aiId = messages.value[1].id;
    expect(messageText(messages.value[1])).toBe('first');
    await onReload(aiId);
    await nextTick();
    expect(messageText(messages.value[1])).toBe('second');
    expect(messages.value[1].status).toBe('success');
  });

  it('onReload 对不存在的 id 不请求也不抛错', async () => {
    const request = vi.fn(async () => sseStream(['x']));
    const { onReload } = useChat({ request });
    await onReload('not-exist');
    expect(request).not.toHaveBeenCalled();
  });

  it('isLoading 时 onSend 被并发保护拦截', async () => {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const request = vi.fn(async () => new ReadableStream<Uint8Array>({ start: (c) => (ctrl = c) }));
    const { messages, onSend, isLoading } = useChat({ request });
    const p = onSend('first');
    await nextTick();
    expect(isLoading.value).toBe(true);
    await onSend('second'); // 进行中，应被拦截
    expect(request).toHaveBeenCalledTimes(1);
    expect(messages.value).toHaveLength(2); // 仅 first 的 user + ai
    ctrl.close();
    await p;
  });

  it('isLoading 时 onReload 被并发保护拦截', async () => {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const request = vi.fn(async () => new ReadableStream<Uint8Array>({ start: (c) => (ctrl = c) }));
    const { messages, onSend, onReload, isLoading } = useChat({ request });
    const p = onSend('first'); // 首个请求挂起（流不结束）
    await nextTick();
    expect(isLoading.value).toBe(true);
    const aiId = messages.value[1].id;
    await onReload(aiId); // 进行中 reload，应被 isLoading 守卫拦截
    expect(request).toHaveBeenCalledTimes(1);
    ctrl.close();
    await p;
  });

  it('request 返回 Response 时读取其 body 流', async () => {
    const request = vi.fn(async () => new Response(sseStream(['R', 'esp'])));
    const { messages, onSend } = useChat({ request });
    await onSend('hi');
    expect(messageText(messages.value[1])).toBe('Resp');
  });

  it('Bug1：传给 request 的 history 不含刚 push 的空 AI 占位', async () => {
    let captured: ChatMessage[] = [];
    const request = vi.fn(async (ctx: UseChatRequestCtx) => {
      captured = ctx.messages;
      return sseStream(['ok']);
    });
    const { onSend } = useChat({ request });
    await onSend('hi');
    expect(captured).toHaveLength(1);
    expect(captured[0].role).toBe('user');
    expect(messageText(captured[0])).toBe('hi');
    // 不应包含 role:'ai' 的空占位
    expect(captured.some((m) => m.role === 'ai')).toBe(false);
  });

  it('Bug1：带 defaultMessages 历史时历史被正确带上且不含空 AI 占位', async () => {
    let captured: ChatMessage[] = [];
    const request = vi.fn(async (ctx: UseChatRequestCtx) => {
      captured = ctx.messages;
      return sseStream(['ok']);
    });
    const { onSend } = useChat({
      request,
      defaultMessages: [textMessage('user', '历史问'), textMessage('ai', '历史答')],
    });
    await onSend('追问');
    // 2 条历史 + 本次 user，共 3 条；不含空 AI 占位
    expect(captured).toHaveLength(3);
    expect(captured.map((m) => messageText(m))).toEqual(['历史问', '历史答', '追问']);
    expect(captured.some((m) => m.role === 'ai' && m.content.length === 0)).toBe(false);
  });

  it('onReload 对 user 消息守卫：不请求且不清空其内容', async () => {
    const request = vi.fn(async () => sseStream(['x']));
    const { messages, setMessages, onReload } = useChat({ request });
    setMessages([createMessage('user', [textBlock('别动我')], { id: 'u1', status: 'local' })]);
    await onReload('u1');
    expect(request).not.toHaveBeenCalled();
    expect(messageText(messages.value[0])).toBe('别动我');
  });

  it('生命周期：成功流结束时 onFinish 收到 success 的 ai 消息', async () => {
    const request = vi.fn(async () => sseStream(['done']));
    const onFinish = vi.fn();
    const onError = vi.fn();
    const onAbort = vi.fn();
    const { messages, onSend } = useChat({ request, onFinish, onError, onAbort });
    await onSend('hi');
    await nextTick();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toBe(messages.value[1]);
    expect(onFinish.mock.calls[0][0].status).toBe('success');
    expect(onError).not.toHaveBeenCalled();
    expect(onAbort).not.toHaveBeenCalled();
  });

  it('生命周期：request 抛错时 onError 被调用（status error）', async () => {
    const request = vi.fn(async () => {
      throw new Error('boom');
    });
    const onFinish = vi.fn();
    const onError = vi.fn();
    const onAbort = vi.fn();
    const { messages, onSend } = useChat({ request, onFinish, onError, onAbort });
    await onSend('hi');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe(messages.value[1]);
    expect(onError.mock.calls[0][0].status).toBe('error');
    expect(onFinish).not.toHaveBeenCalled();
    expect(onAbort).not.toHaveBeenCalled();
  });

  it('生命周期：abort 时 onAbort 被调用（status abort）而非 onError/onFinish', async () => {
    const request = vi.fn(
      async ({ signal }: { signal: AbortSignal }) =>
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"delta":"x"}\n\n'));
            signal.addEventListener('abort', () =>
              c.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        }),
    );
    const onFinish = vi.fn();
    const onError = vi.fn();
    const onAbort = vi.fn();
    const { messages, onSend, abort } = useChat({ request, onFinish, onError, onAbort });
    const p = onSend('hi');
    await new Promise((r) => setTimeout(r, 10));
    abort();
    await p;
    expect(messages.value[1].status).toBe('abort');
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(onAbort.mock.calls[0][0].status).toBe('abort');
    expect(onError).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('Bug2：scope.stop() 卸载时中止进行中的请求', async () => {
    let streamSignal: AbortSignal | null = null;
    const request = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      streamSignal = signal;
      return new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"delta":"x"}\n\n'));
          signal.addEventListener('abort', () =>
            c.error(new DOMException('Aborted', 'AbortError')),
          );
        },
      });
    });

    const scope = effectScope();
    let api!: ReturnType<typeof useChat>;
    scope.run(() => {
      api = useChat({ request });
    });
    const p = api.onSend('hi');
    await new Promise((r) => setTimeout(r, 10)); // 等首个 chunk 被消费
    scope.stop(); // 触发 onScopeDispose → controller.abort()
    await p;
    expect(streamSignal!.aborted).toBe(true);
    expect(api.messages.value[1].status).toBe('abort');
  });

  it('流式按 block 累积：reasoning 与 text 分段、sources 一次性，生成有序带 id 的 blocks', async () => {
    const request = vi.fn(
      async () =>
        new ReadableStream<Uint8Array>({
          start(c) {
            const enc = new TextEncoder();
            c.enqueue(enc.encode('R1\nR2\nT1\nT2\nS\n'));
            c.close();
          },
        }),
    );
    let phase: 'r' | 't' = 'r';
    const { messages, onSend } = useChat({
      request,
      streamMode: 'line',
      parseChunk: (raw) => {
        const line = raw.trim();
        if (line === 'S') return { block: sourcesBlock([{ title: 'src' }]) };
        if (line === 'T1') phase = 't';
        return { delta: line, blockType: phase === 'r' ? 'reasoning' : 'text' };
      },
    });
    await onSend('go');
    const blocks = messages.value[1].content;
    expect(blocks.map((b) => b.type)).toEqual(['reasoning', 'text', 'sources']);
    expect(blocks.every((b) => typeof b.id === 'string' && b.id)).toBe(true);
    expect((blocks[0] as Extract<ContentBlock, { type: 'reasoning' }>).text).toBe('R1R2');
    expect((blocks[1] as Extract<ContentBlock, { type: 'text' }>).text).toBe('T1T2');
  });

  it('abort 后同步立即 onSend 不被 isLoading 守卫丢弃，且旧请求收尾不污染新请求', async () => {
    let call = 0;
    const request = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      if (call++ === 0) {
        // 第一个请求：发出首个 chunk 后挂起，abort 时 error 结束
        return new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"delta":"x"}\n\n'));
            signal.addEventListener('abort', () =>
              c.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        });
      }
      return sseStream(['ok2']); // 第二个请求：立即完成
    });
    const { messages, onSend, abort, isLoading } = useChat({ request });
    const p1 = onSend('first');
    await new Promise((r) => setTimeout(r, 10)); // 等首个 chunk 被消费
    expect(isLoading.value).toBe(true);
    abort();
    expect(isLoading.value).toBe(false); // abort 同步复位，守卫不再拦截
    const p2 = onSend('second'); // 立即重发，不应被静默丢弃
    await p2;
    await p1.catch(() => {});
    await nextTick();
    expect(request).toHaveBeenCalledTimes(2); // 第二次请求真的发出
    expect(messages.value).toHaveLength(4); // first(user+ai) + second(user+ai)
    expect(messages.value[1].status).toBe('abort'); // 旧 ai 被中断
    expect(messageText(messages.value[3])).toBe('ok2'); // 新 ai 正常完成
    expect(messages.value[3].status).toBe('success');
    expect(isLoading.value).toBe(false); // 旧请求 finally 未回写污染新状态
  });

  it('request 抛错时 onError 透出原始 error，并写入 aiMsg.extra.error', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('boom');
    const request = vi.fn(async () => {
      throw boom;
    });
    const onError = vi.fn();
    const { messages, onSend } = useChat({ request, onError });
    await onSend('hi');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe(messages.value[1]); // 第一参数为 ai 消息
    expect(onError.mock.calls[0][1]).toBe(boom); // 第二参数为原始 error
    expect(messages.value[1].extra?.error).toBe(boom); // 写入 extra 便于排障
    expect(consoleErr).toHaveBeenCalled(); // 兜底 console.error
    consoleErr.mockRestore();
  });

  it('onEdit 改写用户消息、截断后续并重新生成', async () => {
    let call = 0;
    const request = vi.fn(async () => sseStream([call++ === 0 ? 'a1' : 'a2']));
    const { messages, onSend, onEdit } = useChat({ request });
    await onSend('q1');
    await nextTick();
    const userId = messages.value[0].id;
    await onEdit(userId, 'q1-edited');
    await nextTick();
    expect(messageText(messages.value[0])).toBe('q1-edited');
    expect(messages.value).toHaveLength(2);
    expect(messageText(messages.value[1])).toBe('a2');
    expect(messages.value[1].status).toBe('success');
  });

  it('onEdit 传给 request 的 history 含编辑后内容且不含后续/空 AI 占位', async () => {
    let captured: ChatMessage[] = [];
    let call = 0;
    const request = vi.fn(async (ctx: UseChatRequestCtx) => {
      captured = ctx.messages;
      return sseStream([call++ === 0 ? 'a1' : 'a2']);
    });
    const { messages, onSend, onEdit } = useChat({ request });
    await onSend('q1');
    await nextTick();
    await onEdit(messages.value[0].id, 'q1-edited');
    expect(captured).toHaveLength(1);
    expect(messageText(captured[0])).toBe('q1-edited');
    expect(captured.some((m) => m.role === 'ai')).toBe(false);
  });

  it('onEdit 截断被编辑消息之后的所有历史', async () => {
    let call = 0;
    const request = vi.fn(async () => sseStream([`a${call++}`]));
    const { messages, onSend, onEdit } = useChat({ request });
    await onSend('q1');
    await nextTick();
    await onSend('q2');
    await nextTick();
    expect(messages.value).toHaveLength(4);
    await onEdit(messages.value[0].id, 'q1-edited');
    await nextTick();
    expect(messages.value).toHaveLength(2);
    expect(messageText(messages.value[0])).toBe('q1-edited');
    expect(messages.value[1].role).toBe('ai');
  });

  it('onEdit 保留非文本块（附件不被静默丢弃），新文本块替换原文本块位置', async () => {
    let call = 0;
    const request = vi.fn(async () => sseStream([call++ === 0 ? 'a1' : 'a2']));
    const { messages, onSend, onEdit } = useChat({ request });
    await onSend([
      { id: 'b-att', type: 'attachment', items: [{ id: 'f1', name: 'doc.pdf', url: '/f/1' }] },
      { id: 'b-text', type: 'text', text: 'q1' },
    ]);
    await nextTick();
    await onEdit(messages.value[0].id, 'q1-edited');
    await nextTick();
    const content = messages.value[0].content;
    expect(content).toHaveLength(2);
    expect(content[0]).toMatchObject({ type: 'attachment' }); // 附件保留且位置不变
    expect(content[1]).toMatchObject({ type: 'text', text: 'q1-edited' });
    expect(messageText(messages.value[0])).toBe('q1-edited');
  });

  it('onEdit 纯文本消息行为不变：改写为单 text 块', async () => {
    let call = 0;
    const request = vi.fn(async () => sseStream([call++ === 0 ? 'a1' : 'a2']));
    const { messages, onSend, onEdit } = useChat({ request });
    await onSend('q1');
    await nextTick();
    await onEdit(messages.value[0].id, 'q1-edited');
    await nextTick();
    expect(messages.value[0].content).toHaveLength(1);
    expect(messages.value[0].content[0]).toMatchObject({ type: 'text', text: 'q1-edited' });
  });

  it('onEdit 对非 user 消息守卫：不改写不请求', async () => {
    const request = vi.fn(async () => sseStream(['x']));
    const { messages, onSend, onEdit } = useChat({ request });
    await onSend('q');
    await nextTick();
    const aiId = messages.value[1].id;
    const before = messageText(messages.value[1]);
    await onEdit(aiId, '篡改');
    expect(messageText(messages.value[1])).toBe(before);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('onEdit 对不存在 id 不请求不抛错', async () => {
    const request = vi.fn(async () => sseStream(['x']));
    const { onEdit } = useChat({ request });
    await onEdit('nope', 'x');
    expect(request).not.toHaveBeenCalled();
  });

  it('isLoading 时 onEdit 被并发守卫拦截', async () => {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const request = vi.fn(async () => new ReadableStream<Uint8Array>({ start: (c) => (ctrl = c) }));
    const { messages, onSend, onEdit } = useChat({ request });
    const p = onSend('first');
    await nextTick();
    await onEdit(messages.value[0].id, 'edited');
    expect(request).toHaveBeenCalledTimes(1);
    expect(messageText(messages.value[0])).toBe('first');
    ctrl.close();
    await p;
  });
});

describe('useChat.updateBlock', () => {
  it('按 messageId+blockId 就地合并 patch，触发响应式', () => {
    const chat = useChat({ request: async () => new ReadableStream() });
    chat.setMessages([
      {
        id: 'm1',
        role: 'ai',
        status: 'success',
        // 业务自定义交互块（不在内置联合内）：updateBlock 按 id 合并 patch，与块类型无关
        content: [
          { id: 'b1', type: 'custom-choice', selected: undefined } as unknown as ContentBlock,
        ],
      },
    ]);
    const hit = chat.updateBlock('m1', 'b1', { selected: 'o2' });
    const blk = chat.messages.value[0].content[0] as { selected?: string };
    expect(blk.selected).toBe('o2');
    // 命中目标块时返回 true，供上层决定是否对外透出
    expect(hit).toBe(true);
  });

  it('blockId 不存在时静默不抛错，且返回 false', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chat = useChat({ request: async () => new ReadableStream() });
    chat.setMessages([{ id: 'm1', role: 'ai', content: [{ id: 'b1', type: 'text', text: 'x' }] }]);
    expect(chat.updateBlock('m1', 'nope', { a: 1 })).toBe(false);
    expect(chat.updateBlock('nope', 'b1', { a: 1 })).toBe(false);
    warn.mockRestore();
  });

  it('updateBlock 未命中目标时开发期 console.warn 提示', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chat = useChat({ request: async () => new ReadableStream() });
    chat.setMessages([{ id: 'm1', role: 'ai', content: [{ id: 'b1', type: 'text', text: 'x' }] }]);
    chat.updateBlock('m1', 'nope', { a: 1 });
    // 断言有来自 ai-chat 的 warn，而非 Vue 自身的通用警告
    const aiChatWarnCalls = warn.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[ai-chat]'),
    );
    expect(aiChatWarnCalls.length).toBeGreaterThan(0);
    warn.mockRestore();
  });
});

describe('useChat.setFeedback', () => {
  it('写回 message.extra.feedback', () => {
    const chat = useChat({ request: async () => new ReadableStream() });
    chat.setMessages([{ id: 'm1', role: 'ai', content: [textBlock('hi')], status: 'success' }]);
    chat.setFeedback('m1', 'like');
    expect(chat.messages.value[0].extra?.feedback).toBe('like');
    chat.setFeedback('m1', null);
    expect(chat.messages.value[0].extra?.feedback).toBe(null);
  });

  it('保留 extra 其他字段', () => {
    const chat = useChat({ request: async () => new ReadableStream() });
    chat.setMessages([{ id: 'm1', role: 'ai', content: [textBlock('hi')], extra: { foo: 1 } }]);
    chat.setFeedback('m1', 'dislike');
    expect(chat.messages.value[0].extra).toEqual({ foo: 1, feedback: 'dislike' });
  });

  it('id 不存在时安全忽略', () => {
    const chat = useChat({ request: async () => new ReadableStream() });
    expect(() => chat.setFeedback('nope', 'like')).not.toThrow();
  });
});

describe('parser 渲染消息解耦', () => {
  it('不传 parser 时 parsedMessages 与 messages 同引用（零开销）', () => {
    const chat = useChat({ request: vi.fn(async () => sseStream(['x'])) });
    expect(chat.parsedMessages).toBe(chat.messages);
  });

  it('传 parser：parsedMessages 为映射结果，messages 保持原始（1→1）', async () => {
    // 渲染时给每条消息加角色前缀；保留消息 id，仅重塑展示内容
    const parser = (m: ChatMessage): ChatMessage => ({
      ...m,
      content: [textBlock(`[${m.role}] ${messageText(m)}`)],
    });
    const { messages, parsedMessages, onSend } = useChat({
      request: vi.fn(async () => sseStream(['Hi'])),
      parser,
    });
    await onSend('q');
    await nextTick();
    // 原始消息不被 parser 改写
    expect(messageText(messages.value[0])).toBe('q');
    // 渲染消息经 parser 转换，且 id 保留（可继续支撑 edit/reload 的 id 定位）
    expect(parsedMessages.value[0].id).toBe(messages.value[0].id);
    expect(messageText(parsedMessages.value[0])).toBe('[user] q');
    expect(messageText(parsedMessages.value[1])).toBe('[ai] Hi');
    expect(parsedMessages.value).toHaveLength(messages.value.length);
  });

  it('parser 返回单个但改写 id：id 被覆盖为父 id，回写仍可命中', async () => {
    // parser 改写 message-level id 不再破坏定位——useChat 接管 id，强制复用父 id
    const parser = (m: ChatMessage): ChatMessage => ({ ...m, id: `x-${m.id}` });
    const { messages, parsedMessages, onSend, setFeedback } = useChat({
      request: vi.fn(async () => sseStream(['Hi'])),
      parser,
    });
    await onSend('q');
    await nextTick();
    // 渲染气泡 id === 父消息 id（parser 改的 id 被忽略）
    expect(parsedMessages.value[1].id).toBe(messages.value[1].id);
    // 据渲染气泡 id 回写，命中 SSOT 父消息
    setFeedback(parsedMessages.value[1].id, 'like');
    expect(messages.value[1].extra?.feedback).toBe('like');
  });

  describe('1→N 拆分（一条消息拆多气泡）', () => {
    // 把 ai 消息拆成两个气泡（共享同一 SSOT 消息），user 保持单气泡
    const splitAi = (m: ChatMessage): ChatMessage | ChatMessage[] =>
      m.role === 'ai' ? [{ ...m }, { ...m }] : m;

    it('parser 返回数组 → 拆成多气泡，首个子气泡复用父 id、其余派生', async () => {
      const { messages, parsedMessages, onSend } = useChat({
        request: vi.fn(async () => sseStream(['Hi'])),
        parser: splitAi,
      });
      await onSend('q');
      await nextTick();
      // SSOT 仍是 2 条（user + ai）
      expect(messages.value).toHaveLength(2);
      // 渲染视图：user(1) + ai 拆 2 = 3 个气泡
      expect(parsedMessages.value).toHaveLength(3);
      const aiId = messages.value[1].id;
      expect(parsedMessages.value[0].id).toBe(messages.value[0].id);
      // O1：首个子气泡复用父 id（单→拆转换时不 remount、不闪烁），其余子气泡派生
      expect(parsedMessages.value[1].id).toBe(aiId);
      expect(parsedMessages.value[2].id).toBe(`${aiId}__1`);
    });

    it('拆分子气泡继承父消息 status', async () => {
      const { messages, parsedMessages, onSend } = useChat({
        request: vi.fn(async () => sseStream(['Hi'])),
        parser: splitAi,
      });
      await onSend('q');
      await nextTick();
      expect(messages.value[1].status).toBe('success');
      expect(parsedMessages.value[1].status).toBe('success');
      expect(parsedMessages.value[2].status).toBe('success');
    });

    it('updateBlock 用派生气泡 id → 解析回父消息命中 SSOT 块', async () => {
      const { messages, onSend, updateBlock } = useChat({
        request: vi.fn(async () => sseStream(['Hi'])),
        parser: splitAi,
      });
      await onSend('q');
      await nextTick();
      const aiId = messages.value[1].id;
      const blockId = messages.value[1].content[0].id;
      // 用派生气泡 id 回写
      const hit = updateBlock(`${aiId}__1`, blockId, { foo: 'bar' });
      expect(hit).toBe(true);
      // 命中 SSOT 父消息块
      expect((messages.value[1].content[0] as Record<string, unknown>).foo).toBe('bar');
    });

    it('onReload 用派生气泡 id → 对父消息重新发起请求', async () => {
      const request = vi.fn(async () => sseStream(['Hi']));
      const { messages, onReload, onSend } = useChat({ request, parser: splitAi });
      await onSend('q');
      await nextTick();
      const aiId = messages.value[1].id;
      expect(request).toHaveBeenCalledTimes(1);
      await onReload(`${aiId}__1`);
      await nextTick();
      // 解析回父消息并重新发起
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('setFeedback 用派生气泡 id → 写回父消息 extra', async () => {
      const { messages, onSend, setFeedback } = useChat({
        request: vi.fn(async () => sseStream(['Hi'])),
        parser: splitAi,
      });
      await onSend('q');
      await nextTick();
      const aiId = messages.value[1].id;
      setFeedback(`${aiId}__1`, 'dislike');
      expect(messages.value[1].extra?.feedback).toBe('dislike');
    });

    it('拆分子气泡带 extra.__sub 位置信息（供操作条去重）', async () => {
      const { messages, parsedMessages, onSend } = useChat({
        request: vi.fn(async () => sseStream(['Hi'])),
        parser: splitAi,
      });
      await onSend('q');
      await nextTick();
      void messages.value;
      expect(parsedMessages.value[1].extra?.__sub).toEqual({ index: 0, count: 2 });
      expect(parsedMessages.value[2].extra?.__sub).toEqual({ index: 1, count: 2 });
      // 非拆分（user，1→1）无 __sub 标记
      expect(parsedMessages.value[0].extra?.__sub).toBeUndefined();
    });
  });
});

it('parseChunk 返回携带 delta 的非法 blockType 时丢弃增量并告警一次', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const request = vi.fn(
    async () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('a\nb\n'));
          c.close();
        },
      }),
  );
  const { messages, onSend } = useChat({
    request,
    streamMode: 'line',
    // 违法：blockType 非 'text'|'reasoning' 却带 delta
    parseChunk: (raw) => ({ delta: raw, blockType: 'bogus' as never }),
  });
  await onSend('go');
  await nextTick();
  // 非法增量被丢弃，AI 消息无文本内容
  expect(messageText(messages.value[1])).toBe('');
  const badWarns = warn.mock.calls.filter(
    (args) => typeof args[0] === 'string' && args[0].includes('非法 blockType'),
  );
  // 两个非法 chunk 仅告警一次（请求内去重）
  expect(badWarns.length).toBe(1);
  warn.mockRestore();
});

describe('retryTimes 失败重试', () => {
  it('前两次抛错、第三次成功 → 重试后成功', async () => {
    let n = 0;
    const request = vi.fn(async () => {
      n += 1;
      if (n < 3) throw new Error('boom');
      return sseStream(['ok']);
    });
    const { messages, onSend } = useChat({ request, retryTimes: 2, retryInterval: 0 });
    await onSend('hi');
    await nextTick();
    expect(request).toHaveBeenCalledTimes(3);
    expect(messages.value[1].status).toBe('success');
    expect(messageText(messages.value[1])).toBe('ok');
  });

  it('重试耗尽仍失败 → status=error，onError 收到错误', async () => {
    const request = vi.fn(async () => {
      throw new Error('always');
    });
    const onError = vi.fn();
    const ce = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { messages, onSend } = useChat({ request, retryTimes: 1, retryInterval: 0, onError });
    await onSend('hi');
    await nextTick();
    expect(request).toHaveBeenCalledTimes(2); // 首次 + 1 次重试
    expect(messages.value[1].status).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);
    ce.mockRestore();
  });

  it('默认 retryTimes=0：失败不重试', async () => {
    const request = vi.fn(async () => {
      throw new Error('x');
    });
    const ce = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { messages, onSend } = useChat({ request });
    await onSend('hi');
    await nextTick();
    expect(request).toHaveBeenCalledTimes(1);
    expect(messages.value[1].status).toBe('error');
    ce.mockRestore();
  });

  it('等待重试间隔期间用户 abort → 判 abort 且不发起第二轮请求', async () => {
    // Bug 防回归（变异测试实锤）：重试等待结束后必须再查 ctrl.signal.aborted，
    // 否则等待期内用户点停止仍会 continue 重发第二轮（request 被调 2 次且状态非 abort）。
    vi.useFakeTimers();
    try {
      const onAbort = vi.fn();
      // 用 pull 分两次响应 read：首次吐部分增量（确保被真实消费），第二次断流。
      // 不能 start 里 enqueue 后立即 error——error 会清空未读队列，增量永远到不了消费方。
      let pulls = 0;
      const request = vi.fn(
        async () =>
          new ReadableStream<Uint8Array>({
            pull(c) {
              if (pulls++ === 0) c.enqueue(new TextEncoder().encode('data: {"delta":"部分"}\n\n'));
              else c.error(new Error('网络断开')); // 走「非 abort 错误 + 有重试额度」的等待路径
            },
          }),
      );
      const { messages, onSend, abort } = useChat({
        request,
        retryTimes: 1,
        retryInterval: 1000,
        onAbort,
      });
      const p = onSend('hi');
      await vi.advanceTimersByTimeAsync(0); // 首轮消费增量并断流，进入 1s 重试等待
      expect(request).toHaveBeenCalledTimes(1);
      abort(); // 等待期内用户中止
      await vi.advanceTimersByTimeAsync(1000); // 等待期满：应检测到 aborted，放弃第二轮
      await p;
      expect(messages.value[1].status).toBe('abort');
      expect(onAbort).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledTimes(1); // 不发起第二轮
    } finally {
      vi.useRealTimers();
    }
  });

  it('重试前清空首轮半截内容 → 最终文本为第二轮完整结果，不叠加', async () => {
    // Bug 防回归（变异测试实锤）：每次重试前必须清空 aiMsg.content 并复位 loading，
    // 否则首轮半截增量会与第二轮结果叠加成 '半截完整'。
    let call = 0;
    let pulls = 0;
    const request = vi.fn(async () => {
      if (call++ === 0) {
        // 首轮：用 pull 分两次响应 read——先吐半截文本（确保被真实消费进 content），
        // 第二次 read 才断流。不能 start 里 enqueue 后立即 error：error 会清空未读队列。
        return new ReadableStream<Uint8Array>({
          pull(c) {
            if (pulls++ === 0) c.enqueue(new TextEncoder().encode('data: {"delta":"半截"}\n\n'));
            else c.error(new Error('断流'));
          },
        });
      }
      return sseStream(['完整']); // 二轮：完整成功
    });
    const { messages, onSend } = useChat({ request, retryTimes: 1, retryInterval: 0 });
    await onSend('hi');
    await nextTick();
    expect(request).toHaveBeenCalledTimes(2);
    expect(messages.value[1].status).toBe('success');
    expect(messageText(messages.value[1])).toBe('完整'); // 而非 '半截完整' 叠加
  });
});

describe('useChat.onSend blocks 形态', () => {
  it('onSend 接受 ContentBlock[]：用户消息按原块入列', async () => {
    const request = vi.fn(async () => sseStream(['ok']));
    const { messages, onSend } = useChat({ request });
    const blocks = [attachmentBlock([{ id: 'a1', name: 'a.pdf' }]), textBlock('帮我总结')];
    await onSend(blocks);
    const user = messages.value[0]!;
    expect(user.role).toBe('user');
    // 无拷贝直接入列（响应式 mutate 合约）：messages 经 ref 包裹，user.content 是 reactive
    // 代理，故用 toRaw 还原其原始对象与传入数组比引用，锁定 useChat 未做 spread 拷贝。
    expect(toRaw(user.content)).toBe(blocks);
    expect(user.status).toBe('local');
  });

  it('onSend 接受 string：行为与现状一致（包单 text 块）', async () => {
    const request = vi.fn(async () => sseStream(['ok']));
    const { messages, onSend } = useChat({ request });
    await onSend('hi');
    const user = messages.value[0]!;
    expect(user.content).toHaveLength(1);
    expect(user.content[0]).toMatchObject({ type: 'text', text: 'hi' });
  });
});
