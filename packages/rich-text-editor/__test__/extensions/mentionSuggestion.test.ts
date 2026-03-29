import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMentionSuggestion } from '../../src/extensions/mentionSuggestion';
import type { MentionConfig, MentionItem } from '../../src/types';

/**
 * 从 createMentionSuggestion 返回值中提取 items 函数
 * items 接收 { query: string } 返回 Promise<MentionItem[]>
 */
function getItemsFn(config?: MentionConfig) {
  const suggestion = createMentionSuggestion(config);
  return suggestion!.items as (args: {
    query: string;
  }) => Promise<MentionItem[]>;
}

describe('createMentionSuggestion - 基础配置', () => {
  it('默认触发字符为 @', () => {
    const suggestion = createMentionSuggestion();
    expect(suggestion!.char).toBe('@');
  });

  it('自定义触发字符', () => {
    const suggestion = createMentionSuggestion({ trigger: '#' });
    expect(suggestion!.char).toBe('#');
  });

  it('无 config 时 items 返回空数组', async () => {
    const items = getItemsFn();
    const result = await items({ query: 'test' });
    expect(result).toEqual([]);
  });

  it('无 queryItems 且无 server 时返回空数组', async () => {
    const items = getItemsFn({});
    const result = await items({ query: 'test' });
    expect(result).toEqual([]);
  });
});

describe('createMentionSuggestion - queryItems 模式', () => {
  it('同步 queryItems 正确返回', async () => {
    const mockItems: MentionItem[] = [
      { id: 1, label: '张三' },
      { id: 2, label: '李四' },
    ];
    const items = getItemsFn({
      queryItems: () => mockItems,
    });

    const result = await items({ query: '张' });
    expect(result).toEqual(mockItems);
  });

  it('queryItems 优先于 server', async () => {
    const mockItems: MentionItem[] = [{ id: 1, label: 'test' }];
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const items = getItemsFn({
      queryItems: () => mockItems,
      server: '/api/users',
    });

    const result = await items({ query: 'test' });
    expect(result).toEqual(mockItems);
    expect(mockFetch).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

describe('createMentionSuggestion - server 模式防抖', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('300ms 防抖：短时间内多次查询只发一次请求', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 1, label: 'result' }] }),
    });

    const items = getItemsFn({ server: '/api/users' });

    // 快速连续调用 3 次
    items({ query: 'a' });
    items({ query: 'ab' });
    const lastPromise = items({ query: 'abc' });

    // 前进到 300ms 触发最后一次防抖
    await vi.advanceTimersByTimeAsync(300);

    const result = await lastPromise;
    // 只应发出 1 次 fetch（最后一次 'abc'）
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [fetchUrl] = mockFetch.mock.calls[0]!;
    expect(fetchUrl).toContain('abc');
    expect(result).toEqual([{ id: 1, label: 'result' }]);
  });

  it('序列号防护：过期请求的结果不影响最新查询', async () => {
    // 第一次请求慢（200ms 延迟），第二次请求快
    let callCount = 0;
    mockFetch.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) => {
        callCount++;
        const currentCall = callCount;
        return new Promise((resolve, reject) => {
          const onAbort = () =>
            reject(new DOMException('Aborted', 'AbortError'));
          if (options.signal.aborted) return onAbort();
          options.signal.addEventListener('abort', onAbort, { once: true });

          // 第一次调用延迟更长
          const delay = currentCall === 1 ? 200 : 50;
          setTimeout(() => {
            resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  data: [{ id: currentCall, label: `result-${currentCall}` }],
                }),
            });
          }, delay);
        });
      },
    );

    const items = getItemsFn({ server: '/api/users' });

    // 第一次查询（结果会被第二次覆盖）
    void items({ query: 'first' });
    await vi.advanceTimersByTimeAsync(300); // 触发防抖

    // 第二次查询（取消前一次）
    const promise2 = items({ query: 'second' });
    await vi.advanceTimersByTimeAsync(300); // 触发防抖

    // 前进足够时间让请求完成
    await vi.advanceTimersByTimeAsync(300);

    const result2 = await promise2;
    // 第二次查询应返回正确结果
    expect(result2).toEqual([{ id: 2, label: 'result-2' }]);
  });
});

describe('createMentionSuggestion - server 模式错误处理', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('查询失败时 resolve 空数组并调用 onError', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const onError = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const items = getItemsFn({
      server: '/api/users',
      onError,
    });

    const promise = items({ query: 'test' });
    await vi.advanceTimersByTimeAsync(300);

    const result = await promise;
    expect(result).toEqual([]);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'server' }),
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('无 onError 回调时仅 console.error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const items = getItemsFn({ server: '/api/users' });

    const promise = items({ query: 'test' });
    await vi.advanceTimersByTimeAsync(300);

    const result = await promise;
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('createMentionSuggestion - cleanup', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('onExit 清理防抖 timer 和进行中的请求', async () => {
    mockFetch.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((resolve, reject) => {
          const onAbort = () =>
            reject(new DOMException('Aborted', 'AbortError'));
          if (options.signal.aborted) return onAbort();
          options.signal.addEventListener('abort', onAbort, { once: true });
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: () =>
                  Promise.resolve({ data: [{ id: 1, label: 'test' }] }),
              }),
            100,
          );
        }),
    );

    const suggestion = createMentionSuggestion({ server: '/api/users' });
    const itemsFn = suggestion!.items as (args: {
      query: string;
    }) => Promise<MentionItem[]>;

    // 发起查询但不等待防抖
    itemsFn({ query: 'test' });

    // 调用 onExit 清理
    const renderResult = (suggestion!.render as () => { onExit: () => void })();
    renderResult.onExit();

    // 前进超过防抖时间 → 不应发出请求（timer 已被清理）
    await vi.advanceTimersByTimeAsync(500);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('createMentionSuggestion - warning', () => {
  it('无 queryItems 且无 server 时输出 warning', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    createMentionSuggestion({ trigger: '@' });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('mention 已配置但未提供有效的查询方式'),
    );

    consoleSpy.mockRestore();
  });

  it('有 queryItems 时不输出 warning', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    createMentionSuggestion({ queryItems: () => [] });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('有 server 时不输出 warning', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    createMentionSuggestion({ server: '/api/users' });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
