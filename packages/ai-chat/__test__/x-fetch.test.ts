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
    expect(err.name).toBe('AbortError');
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
