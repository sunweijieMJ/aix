import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibreTranslateProvider } from '../../../src/core/translator/libretranslate.js';

describe('LibreTranslateProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应按位置把译文数组重新关联回请求携带的 hash', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translatedText: ['hello', 'world'] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new LibreTranslateProvider({ libretranslateUrl: 'http://localhost:5000' });
    const result = await provider.translate({
      items: [
        { hash: 'h1', text: '你好' },
        { hash: 'h2', text: '世界' },
      ],
      sourceLang: 'zh',
      targetLang: 'en',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5000/translate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ q: ['你好', '世界'], source: 'zh', target: 'en', format: 'text' }),
      }),
    );
    expect(result.translations).toEqual([
      { hash: 'h1', translation: 'hello' },
      { hash: 'h2', translation: 'world' },
    ]);
  });

  it('返回条数少于请求条数时，缺失的条目应整条省略而不是用原文顶替', async () => {
    // 用原文顶替的话，原文会作为"有效译文"写进 L1/L2 永久缓存，该词条从此再也不会重试，
    // 页面上这段文字永久保持原文。契约是"缺失的 hash 视为未翻译，下次扫描自然重试"
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ translatedText: ['hello'] }) }),
    );

    const provider = new LibreTranslateProvider({ libretranslateUrl: 'http://localhost:5000' });
    const result = await provider.translate({
      items: [
        { hash: 'h1', text: '你好' },
        { hash: 'h2', text: '世界' },
      ],
      sourceLang: 'zh',
      targetLang: 'en',
    });

    expect(result.translations).toEqual([{ hash: 'h1', translation: 'hello' }]);
  });

  it('LibreTranslate 单文本场景（旧版返回字符串而非数组）也应正确解析', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ translatedText: 'hello' }) }),
    );

    const provider = new LibreTranslateProvider({ libretranslateUrl: 'http://localhost:5000' });
    const result = await provider.translate({
      items: [{ hash: 'h1', text: '你好' }],
      sourceLang: 'zh',
      targetLang: 'en',
    });

    expect(result.translations).toEqual([{ hash: 'h1', translation: 'hello' }]);
  });

  it('HTTP 非 2xx 时应抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const provider = new LibreTranslateProvider({ libretranslateUrl: 'http://localhost:5000' });
    await expect(
      provider.translate({
        items: [{ hash: 'h1', text: '你好' }],
        sourceLang: 'zh',
        targetLang: 'en',
      }),
    ).rejects.toThrow('500');
  });
});
