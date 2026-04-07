import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFormData,
  fetchMentionItems,
  fetchUpload,
  getByPath,
  isUploadError,
  normalizeUploadError,
  processFileUpload,
  resolveHeaders,
  resolveUploadFn,
} from '../../src/utils/upload';

// ========== getByPath ==========

describe('getByPath', () => {
  it('正常点分路径提取', () => {
    expect(getByPath({ data: { url: 'https://cdn.com/a.png' } }, 'data.url')).toBe(
      'https://cdn.com/a.png',
    );
  });

  it('深层路径提取', () => {
    expect(getByPath({ data: { result: { list: [1, 2] } } }, 'data.result.list')).toEqual([1, 2]);
  });

  it('单层路径', () => {
    expect(getByPath({ url: 'abc' }, 'url')).toBe('abc');
  });

  it('路径不存在返回 undefined', () => {
    expect(getByPath({ data: {} }, 'data.url')).toBeUndefined();
  });

  it('输入 null 不抛异常', () => {
    expect(getByPath(null, 'data.url')).toBeUndefined();
  });

  it('输入 undefined 不抛异常', () => {
    expect(getByPath(undefined, 'data.url')).toBeUndefined();
  });
});

// ========== resolveHeaders ==========

describe('resolveHeaders', () => {
  it('传入对象直接返回', () => {
    const headers = { Authorization: 'Bearer token' };
    expect(resolveHeaders(headers)).toEqual(headers);
  });

  it('传入函数调用后返回', () => {
    const fn = () => ({ Authorization: 'Bearer dynamic' });
    expect(resolveHeaders(fn)).toEqual({ Authorization: 'Bearer dynamic' });
  });

  it('不传返回空对象', () => {
    expect(resolveHeaders()).toEqual({});
    expect(resolveHeaders(undefined)).toEqual({});
  });
});

// ========== buildFormData ==========

describe('buildFormData', () => {
  it('基本文件字段', () => {
    const file = new File(['content'], 'test.png', { type: 'image/png' });
    const formData = buildFormData(file, 'file');
    expect(formData.get('file')).toBe(file);
  });

  it('自定义字段名', () => {
    const file = new File(['content'], 'test.png');
    const formData = buildFormData(file, 'image');
    expect(formData.get('image')).toBe(file);
    expect(formData.get('file')).toBeNull();
  });

  it('附加 data 为对象', () => {
    const file = new File(['content'], 'test.png');
    const formData = buildFormData(file, 'file', { folder: 'images' });
    expect(formData.get('folder')).toBe('images');
  });

  it('附加 data 为函数', () => {
    const file = new File(['content'], 'test.png', { type: 'image/png' });
    const dataFn = (f: File) => ({ type: f.type });
    const formData = buildFormData(file, 'file', dataFn);
    expect(formData.get('type')).toBe('image/png');
  });
});

// ========== resolveUploadFn ==========

describe('resolveUploadFn', () => {
  it('有 upload 回调返回该函数', () => {
    const upload = vi.fn().mockResolvedValue('url');
    const fn = resolveUploadFn({ upload });
    expect(fn).toBe(upload);
  });

  it('有 server 返回包装函数', () => {
    const fn = resolveUploadFn({ server: '/api/upload' });
    expect(fn).toBeTypeOf('function');
    expect(fn).not.toBeNull();
  });

  it('upload 优先于 server', () => {
    const upload = vi.fn().mockResolvedValue('url');
    const fn = resolveUploadFn({ upload, server: '/api/upload' });
    expect(fn).toBe(upload);
  });

  it('两者都无返回 null', () => {
    expect(resolveUploadFn({})).toBeNull();
  });

  it('config 为 undefined 返回 null', () => {
    expect(resolveUploadFn(undefined)).toBeNull();
  });
});

// ========== fetchUpload ==========

describe('fetchUpload', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('正常上传返回 URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { url: 'https://cdn.com/img.png' } }),
    });

    const url = await fetchUpload({
      server: '/api/upload',
      file: new File(['content'], 'test.png'),
    });

    expect(url).toBe('https://cdn.com/img.png');
    expect(mockFetch).toHaveBeenCalledOnce();

    // 验证 fetch 参数
    const [fetchUrl, fetchOptions] = mockFetch.mock.calls[0]!;
    expect(fetchUrl).toBe('/api/upload');
    expect(fetchOptions.method).toBe('POST');
    expect(fetchOptions.body).toBeInstanceOf(FormData);
  });

  it('自定义 responsePath 正确提取', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: { fileUrl: 'https://cdn.com/a.jpg' } }),
    });

    const url = await fetchUpload({
      server: '/api/upload',
      file: new File(['content'], 'test.png'),
      responsePath: 'result.fileUrl',
    });

    expect(url).toBe('https://cdn.com/a.jpg');
  });

  it('自定义 headers 正确传递', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { url: 'url' } }),
    });

    await fetchUpload({
      server: '/api/upload',
      file: new File([''], 'test.png'),
      headers: { Authorization: 'Bearer abc' },
    });

    const [, fetchOptions] = mockFetch.mock.calls[0]!;
    expect(fetchOptions.headers).toEqual({ Authorization: 'Bearer abc' });
  });

  it('withCredentials 正确传递', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { url: 'url' } }),
    });

    await fetchUpload({
      server: '/api/upload',
      file: new File([''], 'test.png'),
      withCredentials: true,
    });

    const [, fetchOptions] = mockFetch.mock.calls[0]!;
    expect(fetchOptions.credentials).toBe('include');
  });

  it('服务端 4xx/5xx 抛 server 错误', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(
      fetchUpload({
        server: '/api/upload',
        file: new File([''], 'test.png'),
      }),
    ).rejects.toMatchObject({
      type: 'server',
      message: expect.stringContaining('500'),
    });
  });

  it('responsePath 提取失败抛错', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ code: 0 }),
    });

    await expect(
      fetchUpload({
        server: '/api/upload',
        file: new File([''], 'test.png'),
        responsePath: 'data.url',
      }),
    ).rejects.toMatchObject({
      type: 'server',
      message: expect.stringContaining('data.url'),
    });
  });

  it('网络错误抛 network 错误', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      fetchUpload({
        server: '/api/upload',
        file: new File([''], 'test.png'),
      }),
    ).rejects.toMatchObject({
      type: 'network',
      message: 'Failed to fetch',
    });
  });
});

// ========== fetchMentionItems ==========

describe('fetchMentionItems', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('正常查询返回列表', async () => {
    const items = [
      { id: 1, label: '张三' },
      { id: 2, label: '李四' },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: items }),
    });

    const result = await fetchMentionItems({
      server: '/api/users/search',
      query: '张',
    });

    expect(result).toEqual(items);

    // 验证 URL 参数
    const [fetchUrl] = mockFetch.mock.calls[0]!;
    expect(fetchUrl).toContain('keyword=');
    expect(fetchUrl).toContain('%E5%BC%A0'); // '张' 的 URL 编码
  });

  it('自定义 queryParamName', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    await fetchMentionItems({
      server: '/api/users',
      query: 'test',
      queryParamName: 'q',
    });

    const [fetchUrl] = mockFetch.mock.calls[0]!;
    expect(fetchUrl).toContain('q=test');
  });

  it('transformResponse 映射正确', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { userId: 100, nickname: '王五' },
            { userId: 200, nickname: '赵六' },
          ],
        }),
    });

    const result = await fetchMentionItems({
      server: '/api/users',
      query: '',
      transformResponse: (items) =>
        (items as Array<{ userId: number; nickname: string }>).map((i) => ({
          id: i.userId,
          label: i.nickname,
        })),
    });

    expect(result).toEqual([
      { id: 100, label: '王五' },
      { id: 200, label: '赵六' },
    ]);
  });

  it('服务端错误抛异常', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
    });

    await expect(
      fetchMentionItems({
        server: '/api/users',
        query: 'test',
      }),
    ).rejects.toMatchObject({
      type: 'server',
      message: expect.stringContaining('403'),
    });
  });

  it('响应路径结果非数组时返回空数组', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    });

    const result = await fetchMentionItems({
      server: '/api/users',
      query: 'test',
    });

    expect(result).toEqual([]);
  });

  it('外部 signal 取消时静默返回空数组', async () => {
    // mock fetch 监听 signal，abort 时抛 AbortError
    mockFetch.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((resolve, reject) => {
          const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
          if (options.signal.aborted) return onAbort();
          options.signal.addEventListener('abort', onAbort, { once: true });
          // 模拟延迟响应（不会到达，因为会先 abort）
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: () => Promise.resolve({ data: [{ id: 1, label: 'test' }] }),
              }),
            100,
          );
        }),
    );

    const controller = new AbortController();
    const promise = fetchMentionItems({
      server: '/api/users',
      query: 'test',
      signal: controller.signal,
    });

    // 立即取消
    controller.abort();
    const result = await promise;
    expect(result).toEqual([]);
  });

  it('已 abort 的 signal 直接返回空数组', async () => {
    const controller = new AbortController();
    controller.abort();

    mockFetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    const result = await fetchMentionItems({
      server: '/api/users',
      query: 'test',
      signal: controller.signal,
    });

    expect(result).toEqual([]);
  });
});

// ========== fetchUpload 超时 ==========

describe('fetchUpload - timeout', () => {
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

  it('超时抛出 network 类型错误', async () => {
    // fetch 永不 resolve，模拟网络挂起
    mockFetch.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );

    const promise = fetchUpload({
      server: '/api/upload',
      file: new File(['content'], 'test.png'),
      timeout: 1000,
    });

    // 快进超时
    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toMatchObject({
      type: 'network',
      message: expect.stringContaining('1000'),
    });
  });
});

// ========== isUploadError / normalizeUploadError ==========

describe('isUploadError', () => {
  it('合法 UploadError 返回 true', () => {
    expect(isUploadError({ type: 'size', message: 'too big' })).toBe(true);
    expect(isUploadError({ type: 'network', message: 'timeout' })).toBe(true);
  });

  it('非法对象返回 false', () => {
    expect(isUploadError({ type: 'unknown', message: 'test' })).toBe(false);
    expect(isUploadError(new Error('test'))).toBe(false);
    expect(isUploadError(null)).toBe(false);
    expect(isUploadError('string')).toBe(false);
  });
});

describe('normalizeUploadError', () => {
  it('已是 UploadError 直接返回', () => {
    const error = { type: 'server' as const, message: 'fail' };
    expect(normalizeUploadError(error, 'fallback')).toBe(error);
  });

  it('原生 Error 提取 message', () => {
    const result = normalizeUploadError(new Error('网络错误'), 'fallback');
    expect(result.message).toBe('网络错误');
    expect(result.type).toBe('custom');
  });

  it('未知类型使用 fallback message', () => {
    const result = normalizeUploadError(42, 'fallback');
    expect(result.message).toBe('fallback');
  });
});

// ========== processFileUpload ==========

describe('processFileUpload', () => {
  const defaultMessages = {
    uploadTypeMismatch: '不支持的文件类型',
    uploadSizeExceeded: '文件大小超过限制',
    uploadFailed: '上传失败，请重试',
  };

  it('正常上传：调用 uploadFn + onInsert + onSuccess', async () => {
    const uploadFn = vi.fn().mockResolvedValue('https://cdn.com/a.png');
    const onInsert = vi.fn();
    const onSuccess = vi.fn();

    await processFileUpload(
      new File(['content'], 'test.png', { type: 'image/png' }),
      { onSuccess },
      uploadFn,
      onInsert,
      defaultMessages,
      5 * 1024 * 1024,
    );

    expect(uploadFn).toHaveBeenCalledOnce();
    expect(onInsert).toHaveBeenCalledWith('https://cdn.com/a.png');
    expect(onSuccess).toHaveBeenCalledWith('https://cdn.com/a.png', expect.any(File));
  });

  it('文件类型不匹配：调用 onError 并阻止上传', async () => {
    const uploadFn = vi.fn();
    const onInsert = vi.fn();
    const onError = vi.fn();

    await processFileUpload(
      new File(['content'], 'test.txt', { type: 'text/plain' }),
      { acceptedTypes: ['image/png', 'image/jpeg'], onError },
      uploadFn,
      onInsert,
      defaultMessages,
      5 * 1024 * 1024,
    );

    expect(uploadFn).not.toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      { type: 'type', message: '不支持的文件类型' },
      expect.any(File),
    );
  });

  it('文件大小超限：调用 onError 并阻止上传', async () => {
    const uploadFn = vi.fn();
    const onInsert = vi.fn();
    const onError = vi.fn();
    // 创建一个超过 1KB 限制的文件
    const bigContent = 'x'.repeat(2000);

    await processFileUpload(
      new File([bigContent], 'big.png', { type: 'image/png' }),
      { maxSize: 1024, onError },
      uploadFn,
      onInsert,
      defaultMessages,
      5 * 1024 * 1024,
    );

    expect(uploadFn).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      { type: 'size', message: '文件大小超过限制' },
      expect.any(File),
    );
  });

  it('未设置 maxSize 使用 defaultMaxSize', async () => {
    const uploadFn = vi.fn();
    const onInsert = vi.fn();
    const onError = vi.fn();
    const bigContent = 'x'.repeat(200);

    await processFileUpload(
      new File([bigContent], 'big.png', { type: 'image/png' }),
      { onError },
      uploadFn,
      onInsert,
      defaultMessages,
      100, // defaultMaxSize = 100 字节
    );

    expect(uploadFn).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'size' }),
      expect.any(File),
    );
  });

  it('beforeUpload 返回 false：阻止上传', async () => {
    const uploadFn = vi.fn();
    const onInsert = vi.fn();

    await processFileUpload(
      new File(['content'], 'test.png', { type: 'image/png' }),
      { beforeUpload: () => false },
      uploadFn,
      onInsert,
      defaultMessages,
      5 * 1024 * 1024,
    );

    expect(uploadFn).not.toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('beforeUpload 返回新 File：替换原文件', async () => {
    const newFile = new File(['compressed'], 'compressed.png', {
      type: 'image/png',
    });
    const uploadFn = vi.fn().mockResolvedValue('url');
    const onInsert = vi.fn();

    await processFileUpload(
      new File(['original'], 'test.png', { type: 'image/png' }),
      { beforeUpload: () => newFile },
      uploadFn,
      onInsert,
      defaultMessages,
      5 * 1024 * 1024,
    );

    expect(uploadFn).toHaveBeenCalledWith(newFile);
  });

  it('beforeUpload 返回 true：使用原文件', async () => {
    const originalFile = new File(['content'], 'test.png', {
      type: 'image/png',
    });
    const uploadFn = vi.fn().mockResolvedValue('url');
    const onInsert = vi.fn();

    await processFileUpload(
      originalFile,
      { beforeUpload: () => true },
      uploadFn,
      onInsert,
      defaultMessages,
      5 * 1024 * 1024,
    );

    expect(uploadFn).toHaveBeenCalledWith(originalFile);
  });

  it('上传失败：调用 onError 并 console.error', async () => {
    const uploadFn = vi.fn().mockRejectedValue(new Error('Network Error'));
    const onInsert = vi.fn();
    const onError = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await processFileUpload(
      new File(['content'], 'test.png', { type: 'image/png' }),
      { onError },
      uploadFn,
      onInsert,
      defaultMessages,
      5 * 1024 * 1024,
    );

    expect(onInsert).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'custom', message: 'Network Error' }),
      expect.any(File),
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('acceptedTypes 为空数组时不校验类型', async () => {
    const uploadFn = vi.fn().mockResolvedValue('url');
    const onInsert = vi.fn();

    await processFileUpload(
      new File(['content'], 'test.txt', { type: 'text/plain' }),
      { acceptedTypes: [] },
      uploadFn,
      onInsert,
      defaultMessages,
      5 * 1024 * 1024,
    );

    expect(uploadFn).toHaveBeenCalledOnce();
  });
});
