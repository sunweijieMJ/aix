import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SDKCore } from '../../src/core/sdk.js';
import { GuestChannel } from '../../src/cross-window/guest-channel.js';
import type { ResponseEnvelopeErr, ResponseEnvelopeOk } from '../../src/cross-window/types.js';

/**
 * 直接构造 GuestChannel + 注入 mock port 测试 request retry。
 * 不走完整握手流程：通过 protected `_bindPort` 强行绑定 mock port。
 * 这是 white-box 测试，可接受访问 protected 成员。
 */

interface MockPort {
  postMessage: ReturnType<typeof vi.fn>;
  onmessage: ((event: MessageEvent) => void) | null;
  close: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
}

function createMockPort(): MockPort {
  return {
    postMessage: vi.fn(),
    onmessage: null,
    close: vi.fn(),
    start: vi.fn(),
  };
}

/** 拿到 mock port 第 n 次 send 的 reqId（n 从 0 起） */
function reqIdAt(mockPort: MockPort, n: number): string {
  const call = mockPort.postMessage.mock.calls[n];
  if (!call) throw new Error(`postMessage 未发出第 ${n + 1} 次调用`);
  return (call[0] as { reqId: string }).reqId;
}

function installMockParent() {
  Object.defineProperty(window, 'parent', {
    value: { postMessage: vi.fn() },
    configurable: true,
    writable: true,
  });
}

function restoreParent() {
  Object.defineProperty(window, 'parent', {
    value: window,
    configurable: true,
    writable: true,
  });
}

function createBoundGuest(): { guest: GuestChannel; port: MockPort } {
  const core = new SDKCore({ appId: 'test-app', debug: false });
  const guest = new GuestChannel(core, { autoReady: false });
  const port = createMockPort();
  // protected 方法注入：white-box 测试
  (guest as unknown as { _bindPort: (p: unknown, r: boolean) => void })._bindPort(
    port as unknown as MessagePort,
    false,
  );
  return { guest, port };
}

describe('request retry', () => {
  beforeEach(() => {
    installMockParent();
  });
  afterEach(() => {
    restoreParent();
    vi.useRealTimers();
  });

  it('retryable=true 时 SDK 自动重发，新 reqId 不复用', async () => {
    const { guest, port } = createBoundGuest();
    const promise = guest.request({ type: 'test' }, { retry: 2, retryBackoff: 0 });
    await Promise.resolve();

    // 第 1 次 send
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const id1 = reqIdAt(port, 0);

    // 模拟 host reply retryable:true
    port.onmessage!.call(null, {
      data: {
        __res: true,
        reqId: id1,
        ok: false,
        error: 'TEMP_FAIL',
        retryable: true,
      } satisfies ResponseEnvelopeErr,
    } as MessageEvent);
    await Promise.resolve();

    // 第 2 次 send（reqId 不同）
    expect(port.postMessage).toHaveBeenCalledTimes(2);
    const id2 = reqIdAt(port, 1);
    expect(id2).not.toBe(id1);

    port.onmessage!.call(null, {
      data: {
        __res: true,
        reqId: id2,
        ok: true,
        payload: 'success',
      } satisfies ResponseEnvelopeOk<string>,
    } as MessageEvent);

    await expect(promise).resolves.toBe('success');
    expect(port.postMessage).toHaveBeenCalledTimes(2);
  });

  it('retry 次数耗尽后抛错（最后一次错误透传）', async () => {
    const { guest, port } = createBoundGuest();
    const promise = guest.request({ type: 'test' }, { retry: 1, retryBackoff: 0 });
    await Promise.resolve();

    port.onmessage!.call(null, {
      data: {
        __res: true,
        reqId: reqIdAt(port, 0),
        ok: false,
        error: 'fail1',
        retryable: true,
      },
    } as MessageEvent);
    await Promise.resolve();

    port.onmessage!.call(null, {
      data: {
        __res: true,
        reqId: reqIdAt(port, 1),
        ok: false,
        error: 'fail2',
        retryable: true,
      },
    } as MessageEvent);

    await expect(promise).rejects.toThrow(/fail2/);
    // retry=1 ⇒ 最多 2 次发送
    expect(port.postMessage).toHaveBeenCalledTimes(2);
  });

  it('retryable=false 时立即抛错，不重发', async () => {
    const { guest, port } = createBoundGuest();
    const promise = guest.request({ type: 'test' }, { retry: 3, retryBackoff: 0 });
    await Promise.resolve();

    port.onmessage!.call(null, {
      data: {
        __res: true,
        reqId: reqIdAt(port, 0),
        ok: false,
        error: 'NO_PERMISSION',
        retryable: false,
      },
    } as MessageEvent);

    await expect(promise).rejects.toThrow(/NO_PERMISSION/);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });

  it('响应未带 retryable 字段时不重试（兼容老 host）', async () => {
    const { guest, port } = createBoundGuest();
    const promise = guest.request({ type: 'test' }, { retry: 3, retryBackoff: 0 });
    await Promise.resolve();

    port.onmessage!.call(null, {
      data: {
        __res: true,
        reqId: reqIdAt(port, 0),
        ok: false,
        error: 'legacy',
      },
    } as MessageEvent);

    await expect(promise).rejects.toThrow(/legacy/);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });

  it('超时被视为可重试', async () => {
    vi.useFakeTimers();
    const { guest, port } = createBoundGuest();
    const promise = guest.request({ type: 'test' }, { timeout: 100, retry: 1, retryBackoff: 0 });
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(100); // 第 1 次超时
    await Promise.resolve();

    expect(port.postMessage).toHaveBeenCalledTimes(2); // 已重发

    // 第 2 次回应 ok
    port.onmessage!.call(null, {
      data: {
        __res: true,
        reqId: reqIdAt(port, 1),
        ok: true,
        payload: 'late-ok',
      },
    } as MessageEvent);

    await expect(promise).resolves.toBe('late-ok');
  });

  it('retry 默认为 0：失败立即抛错', async () => {
    const { guest, port } = createBoundGuest();
    const promise = guest.request({ type: 'test' }); // 不传 retry
    await Promise.resolve();

    port.onmessage!.call(null, {
      data: {
        __res: true,
        reqId: reqIdAt(port, 0),
        ok: false,
        error: 'fail',
        retryable: true, // 即使可重试，但 retry=0 不会用
      },
    } as MessageEvent);

    await expect(promise).rejects.toThrow(/fail/);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });

  it('retryBackoff 数字：每次重试间隔指定 ms', async () => {
    vi.useFakeTimers();
    const { guest, port } = createBoundGuest();
    const promise = guest.request({ type: 'test' }, { retry: 1, retryBackoff: 500 });
    await Promise.resolve();

    port.onmessage!.call(null, {
      data: {
        __res: true,
        reqId: reqIdAt(port, 0),
        ok: false,
        error: 'fail',
        retryable: true,
      },
    } as MessageEvent);
    await Promise.resolve();

    // 退避未到，未重发
    expect(port.postMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(port.postMessage).toHaveBeenCalledTimes(2);

    port.onmessage!.call(null, {
      data: { __res: true, reqId: reqIdAt(port, 1), ok: true, payload: 'ok' },
    } as MessageEvent);

    await expect(promise).resolves.toBe('ok');
  });

  it('retryBackoff 函数：按 attempt 动态计算', async () => {
    vi.useFakeTimers();
    const { guest, port } = createBoundGuest();
    const backoffFn = vi.fn((attempt: number) => attempt * 100);
    const promise = guest.request({ type: 'test' }, { retry: 2, retryBackoff: backoffFn });
    await Promise.resolve();

    // 第 1 次失败
    port.onmessage!.call(null, {
      data: {
        __res: true,
        reqId: reqIdAt(port, 0),
        ok: false,
        error: 'fail',
        retryable: true,
      },
    } as MessageEvent);
    await Promise.resolve();
    expect(backoffFn).toHaveBeenNthCalledWith(1, 1);

    await vi.advanceTimersByTimeAsync(100);
    expect(port.postMessage).toHaveBeenCalledTimes(2);

    // 第 2 次失败
    port.onmessage!.call(null, {
      data: {
        __res: true,
        reqId: reqIdAt(port, 1),
        ok: false,
        error: 'fail',
        retryable: true,
      },
    } as MessageEvent);
    await Promise.resolve();
    expect(backoffFn).toHaveBeenNthCalledWith(2, 2);

    await vi.advanceTimersByTimeAsync(200);
    expect(port.postMessage).toHaveBeenCalledTimes(3);

    port.onmessage!.call(null, {
      data: { __res: true, reqId: reqIdAt(port, 2), ok: true, payload: 'ok' },
    } as MessageEvent);

    await expect(promise).resolves.toBe('ok');
  });
});

describe('onRequest 返回 ok=false 触发 retryable 协议', () => {
  beforeEach(() => {
    installMockParent();
  });
  afterEach(() => {
    restoreParent();
  });

  it('handler 返回 { ok: false, retryable: true, code } 被翻译为可重试错误响应', async () => {
    const { guest, port } = createBoundGuest();
    const handler = vi.fn(() => ({
      ok: false as const,
      retryable: true,
      code: 'TEMP',
    }));
    guest.onRequest(handler);

    // 模拟对端发来 request
    port.onmessage!.call(null, {
      data: { __req: true, reqId: 'req-1', payload: { type: 'test' } },
    } as MessageEvent);

    await Promise.resolve();
    await Promise.resolve();

    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const reply = port.postMessage.mock.calls[0]![0] as ResponseEnvelopeErr;
    expect(reply.ok).toBe(false);
    expect(reply.error).toBe('TEMP');
    expect(reply.retryable).toBe(true);
  });

  it('handler 抛错时 retryable=false（异常不可重试）', async () => {
    const { guest, port } = createBoundGuest();
    guest.onRequest(() => {
      throw new Error('boom');
    });

    port.onmessage!.call(null, {
      data: { __req: true, reqId: 'req-2', payload: { type: 'test' } },
    } as MessageEvent);

    await Promise.resolve();
    await Promise.resolve();

    const reply = port.postMessage.mock.calls[0]![0] as ResponseEnvelopeErr;
    expect(reply.ok).toBe(false);
    expect(reply.retryable).toBe(false);
  });
});

describe('request retry — dispose during backoff', () => {
  beforeEach(() => {
    installMockParent();
  });
  afterEach(() => {
    restoreParent();
    vi.useRealTimers();
  });

  it('退避期间 dispose 应立即 reject，不再发后续 attempt', async () => {
    vi.useFakeTimers();
    const { guest, port } = createBoundGuest();
    const promise = guest.request({ type: 'test' }, { timeout: 1000, retry: 2, retryBackoff: 500 });
    // 立即附加 catch handler，避免后续 reject 时被识别为 unhandled rejection
    const rejection = promise.catch((e: Error) => e);
    await Promise.resolve();

    // 第 1 次失败可重试，进入 backoff 500ms 等待
    port.onmessage!.call(null, {
      data: {
        __res: true,
        reqId: reqIdAt(port, 0),
        ok: false,
        error: 'fail',
        retryable: true,
      },
    } as MessageEvent);
    await Promise.resolve();
    expect(port.postMessage).toHaveBeenCalledTimes(1);

    // 退避期间 dispose
    guest.dispose();

    // 推进时间，setTimeout 触发后 disposed 守卫应立即 reject
    await vi.advanceTimersByTimeAsync(500);

    const err = (await rejection) as Error;
    expect(err.message).toMatch(/channel disposed/);
    // 关键：未发出第 2 次 attempt
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });
});
