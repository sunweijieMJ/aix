import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChat } from '../src/composables/useChat';
import { messageText } from '../src/utils/helpers';

/** 手动控制的 SSE 流：push 推增量、done 正常收尾、可保持停滞（不 close）模拟流卡死 */
function manualStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  const enc = new TextEncoder();
  return {
    stream,
    push: (d: string) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ delta: d })}\n`)),
    done: () => {
      ctrl.enqueue(enc.encode('data: [DONE]\n'));
      ctrl.close();
    },
  };
}

function completedStream(deltas: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const d of deltas) c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: d })}\n`));
      c.enqueue(enc.encode('data: [DONE]\n'));
      c.close();
    },
  });
}

describe('useChat streamTimeout（流静默超时）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('流停滞超过 streamTimeout：判为 error 且 err.name=StreamTimeoutError，已收内容保留', async () => {
    const s = manualStream();
    const onError = vi.fn();
    const { messages, onSend } = useChat({
      request: async () => s.stream,
      streamTimeout: 1000,
      onError,
    });
    const p = onSend('hi');
    await vi.advanceTimersByTimeAsync(0); // request resolve、开始读流
    s.push('部分内容');
    await vi.advanceTimersByTimeAsync(0); // 消费首个 chunk
    await vi.advanceTimersByTimeAsync(1000); // 停滞 1s → 看门狗触发
    await p;
    expect(messages.value[1]!.status).toBe('error');
    expect((onError.mock.calls[0]?.[1] as Error)?.name).toBe('StreamTimeoutError');
    expect(messageText(messages.value[1]!)).toBe('部分内容');
  });

  it('每收到 chunk 重置计时：间隔小于阈值的慢流不被误杀', async () => {
    const s = manualStream();
    const { messages, onSend } = useChat({ request: async () => s.stream, streamTimeout: 1000 });
    const p = onSend('hi');
    await vi.advanceTimersByTimeAsync(0);
    s.push('A');
    await vi.advanceTimersByTimeAsync(600); // 600ms < 1000ms
    s.push('B');
    await vi.advanceTimersByTimeAsync(600); // 距上个 chunk 又 600ms，仍未超时
    s.done();
    await p;
    expect(messages.value[1]!.status).toBe('success');
    expect(messageText(messages.value[1]!)).toBe('AB');
  });

  it('超时是可重试错误：吃 retryTimes 额度，二次成功', async () => {
    const stalled = manualStream();
    let calls = 0;
    const request = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? stalled.stream : completedStream(['重试成功']);
    });
    const { messages, onSend } = useChat({
      request,
      streamTimeout: 1000,
      retryTimes: 1,
      retryInterval: 500,
    });
    const p = onSend('hi');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000); // 首次尝试停滞超时
    await vi.advanceTimersByTimeAsync(500); // 重试间隔
    await vi.advanceTimersByTimeAsync(0); // 第二次请求完成
    await p;
    expect(request).toHaveBeenCalledTimes(2);
    expect(messages.value[1]!.status).toBe('success');
    expect(messageText(messages.value[1]!)).toBe('重试成功');
  });

  it('停滞期间用户 abort：判为 abort 而非超时 error', async () => {
    const s = manualStream();
    const onAbort = vi.fn();
    const { messages, onSend, abort } = useChat({
      request: async () => s.stream,
      streamTimeout: 1000,
      onAbort,
    });
    const p = onSend('hi');
    await vi.advanceTimersByTimeAsync(0);
    s.push('A');
    await vi.advanceTimersByTimeAsync(500);
    abort();
    await p;
    expect(messages.value[1]!.status).toBe('abort');
    expect(onAbort).toHaveBeenCalledTimes(1);
    // 之后看门狗即便到点也不应改写状态
    await vi.advanceTimersByTimeAsync(2000);
    expect(messages.value[1]!.status).toBe('abort');
  });

  it('未启用 streamTimeout（默认）：停滞不触发超时，行为不变', async () => {
    const s = manualStream();
    const { messages, onSend, abort } = useChat({ request: async () => s.stream });
    const p = onSend('hi');
    await vi.advanceTimersByTimeAsync(0);
    s.push('A');
    await vi.advanceTimersByTimeAsync(60_000); // 停滞 1 分钟也不超时
    expect(messages.value[1]!.status).toBe('updating');
    abort(); // 收尾，避免悬挂
    await p;
  });
});
