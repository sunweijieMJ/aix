import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendProvider } from '../../../src/core/translator/backend.js';

describe('BackendProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应 POST 到 apiBase/translate 并透传 hash/text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: { translations: [{ hash: 'h1', translation: 'hello' }] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new BackendProvider({ apiBase: '/api/i18n' });
    const result = await provider.translate({
      items: [{ hash: 'h1', text: '你好' }],
      sourceLang: 'zh',
      targetLang: 'en',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/i18n/translate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          items: [{ hash: 'h1', text: '你好' }],
          sourceLang: 'zh',
          targetLang: 'en',
        }),
      }),
    );
    expect(result.translations).toEqual([{ hash: 'h1', translation: 'hello' }]);
  });

  it('响应 code 非 0 时应抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 1, message: '服务异常' }),
      }),
    );

    const provider = new BackendProvider({ apiBase: '/api/i18n' });
    await expect(
      provider.translate({
        items: [{ hash: 'h1', text: '你好' }],
        sourceLang: 'zh',
        targetLang: 'en',
      }),
    ).rejects.toThrow('服务异常');
  });

  it('HTTP 非 2xx 时应抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));

    const provider = new BackendProvider({ apiBase: '/api/i18n' });
    await expect(
      provider.translate({
        items: [{ hash: 'h1', text: '你好' }],
        sourceLang: 'zh',
        targetLang: 'en',
      }),
    ).rejects.toThrow('502');
  });
});
