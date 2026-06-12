import { describe, it, expect, vi, afterEach } from 'vitest';
import { createXFetch } from '../src/utils/x-fetch';

afterEach(() => vi.unstubAllGlobals());

describe('createXFetch', () => {
  it('onRequest 改写 url / init（注入鉴权头）', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const xfetch = createXFetch({
      onRequest: (url, init) => [`${url}?v=1`, { ...init, headers: { Authorization: 'Bearer T' } }],
    });
    await xfetch('/api');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api?v=1',
      expect.objectContaining({ headers: { Authorization: 'Bearer T' } }),
    );
  });

  it('onResponse 可包装响应', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('raw')),
    );
    const xfetch = createXFetch({ onResponse: () => new Response('wrapped') });
    const res = await xfetch('/api');
    expect(await res.text()).toBe('wrapped');
  });

  it('超时触发后本次请求 signal 被 abort', async () => {
    vi.useFakeTimers();
    let captured: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            captured = init.signal ?? undefined;
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const xfetch = createXFetch({ timeout: 100 });
    const p = xfetch('/slow').catch((e) => e as Error);
    await vi.advanceTimersByTimeAsync(100);
    const err = await p;
    expect(captured?.aborted).toBe(true);
    // 用 in 操作符收窄 Error | Response 联合类型再取 name
    //（jsdom 的 DOMException 不继承 Error，不能用 instanceof Error 收窄）
    expect('name' in err ? err.name : '').toBe('AbortError');
    vi.useRealTimers();
  });

  it('无中间件时直接透传 fetch', async () => {
    const fetchMock = vi.fn(async () => new Response('plain'));
    vi.stubGlobal('fetch', fetchMock);
    const xfetch = createXFetch();
    const res = await xfetch('/x', { method: 'POST' });
    expect(fetchMock).toHaveBeenCalledWith('/x', { method: 'POST' });
    expect(await res.text()).toBe('plain');
  });
});

describe('中间件链与 onError', () => {
  const okResponse = () => new Response('ok', { status: 200 });

  it('onRequest 数组按序执行，前者输出为后者输入', async () => {
    const seen: string[] = [];
    // mock 声明出 init 形参，使 mock.calls 元组带上第二个元素，避免越界取参
    const fetchSpy = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      seen.push(String(url));
      return okResponse();
    });
    vi.stubGlobal('fetch', fetchSpy);
    const xfetch = createXFetch({
      onRequest: [
        (url, init) => [`${url}?a=1`, { ...init, headers: { 'X-A': '1' } }],
        (url, init) => [
          `${url}&b=2`,
          { ...init, headers: { ...(init.headers as Record<string, string>), 'X-B': '2' } },
        ],
      ],
    });
    await xfetch('/api');
    expect(seen[0]).toBe('/api?a=1&b=2');
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(init?.headers).toEqual({ 'X-A': '1', 'X-B': '2' });
  });

  it('onResponse 数组按序包装', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse()),
    );
    const order: string[] = [];
    const xfetch = createXFetch({
      onResponse: [
        (res) => {
          order.push('first');
          return res;
        },
        (res) => {
          order.push('second');
          return res;
        },
      ],
    });
    await xfetch('/api');
    expect(order).toEqual(['first', 'second']);
  });

  it('onError 返回 Error 时作为新错误抛出（错误映射）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    const xfetch = createXFetch({
      onError: (err) => new Error(`mapped: ${(err as Error).message}`),
    });
    await expect(xfetch('/api')).rejects.toThrow('mapped: network');
  });

  it('onError 返回 undefined 时原错误重抛（纯观测）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    const observed: unknown[] = [];
    const xfetch = createXFetch({
      onError: (err) => {
        observed.push(err);
        return undefined;
      },
    });
    await expect(xfetch('/api')).rejects.toThrow('network');
    expect(observed).toHaveLength(1);
  });

  it('onError 链：最后一个非 undefined 返回值生效', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('raw');
      }),
    );
    const xfetch = createXFetch({
      onError: [() => new Error('first'), () => undefined, () => new Error('last')],
    });
    await expect(xfetch('/api')).rejects.toThrow('last');
  });

  it('onResponse 抛错也走 onError 链', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse()),
    );
    const xfetch = createXFetch({
      onResponse: () => {
        throw new Error('bad status');
      },
      onError: (err) => new Error(`mapped: ${(err as Error).message}`),
    });
    await expect(xfetch('/api')).rejects.toThrow('mapped: bad status');
  });

  it('用户主动 abort 不触发 onError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    const onError = vi.fn();
    const xfetch = createXFetch({ onError, timeout: 5000 });
    const ctrl = new AbortController();
    const p = xfetch('/api', { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toThrow();
    expect(onError).not.toHaveBeenCalled();
  });

  it('超时 abort 属于真错误，触发 onError', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async (_url, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError')),
              );
            }),
        ),
      );
      const onError = vi.fn(() => new Error('timeout mapped'));
      const xfetch = createXFetch({ onError, timeout: 100 });
      const p = xfetch('/api');
      const assertion = expect(p).rejects.toThrow('timeout mapped');
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
      expect(onError).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('onRequest 注入新 signal 后，用户 abort 原始 signal 仍能中断请求', async () => {
    // mock 对齐真实 fetch：传入已 aborted 的 signal 立即 reject
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const sig = init?.signal;
            const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
            if (sig?.aborted) onAbort();
            else sig?.addEventListener('abort', onAbort);
          }),
      ),
    );
    const onError = vi.fn();
    // 中间件注入一个全新的、与用户原始 signal 无关的 signal
    const xfetch = createXFetch({
      onRequest: (url, init) => [url, { ...init, signal: new AbortController().signal }],
      onError,
      timeout: 5000,
    });
    const ctrl = new AbortController();
    const p = xfetch('/api', { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toThrow();
    expect(onError).not.toHaveBeenCalled();
  });

  it('单函数形态仍可用（等价长度 1 的链）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse()),
    );
    const xfetch = createXFetch({ onRequest: (url, init) => [`${url}?x=1`, init] });
    await xfetch('/api');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api?x=1');
  });
});
