import { describe, expect, it, vi } from 'vitest';
import { createProvider, FallbackTranslator } from '../../../src/core/translator/index.js';
import type { TranslateBatchResult, TranslateProvider } from '../../../src/types.js';

function createStubProvider(
  name: string,
  impl: () => Promise<TranslateBatchResult>,
): TranslateProvider {
  return { name, translate: impl };
}

describe('createProvider', () => {
  it('provider 为 backend 时应返回 BackendProvider 实例', () => {
    const provider = createProvider('backend', { apiBase: '/api/i18n' });
    expect(provider.name).toBe('backend');
  });

  it('provider 为 libretranslate 时应返回 LibreTranslateProvider 实例', () => {
    const provider = createProvider('libretranslate', {
      libretranslateUrl: 'http://localhost:5000',
    });
    expect(provider.name).toBe('libretranslate');
  });
});

describe('FallbackTranslator', () => {
  it('主 provider 成功时不应调用 fallback', async () => {
    const primary = createStubProvider('primary', async () => ({
      translations: [{ hash: 'h1', translation: 'ok' }],
    }));
    const fallback = createStubProvider('fallback', vi.fn());

    const translator = new FallbackTranslator(primary, fallback);
    const result = await translator.translate({
      items: [{ hash: 'h1', text: '你好' }],
      sourceLang: 'zh',
      targetLang: 'en',
    });

    expect(result.translations).toEqual([{ hash: 'h1', translation: 'ok' }]);
    expect(fallback.translate).not.toHaveBeenCalled();
  });

  it('主 provider 失败且配置了 fallback 时应降级调用一次', async () => {
    const primary = createStubProvider('primary', async () => {
      throw new Error('主服务不可用');
    });
    const fallback = createStubProvider('fallback', async () => ({
      translations: [{ hash: 'h1', translation: 'fallback-ok' }],
    }));

    const translator = new FallbackTranslator(primary, fallback);
    const result = await translator.translate({
      items: [{ hash: 'h1', text: '你好' }],
      sourceLang: 'zh',
      targetLang: 'en',
    });

    expect(result.translations).toEqual([{ hash: 'h1', translation: 'fallback-ok' }]);
  });

  it('未配置 fallback 时主 provider 失败应直接抛错', async () => {
    const primary = createStubProvider('primary', async () => {
      throw new Error('主服务不可用');
    });

    const translator = new FallbackTranslator(primary);
    await expect(
      translator.translate({
        items: [{ hash: 'h1', text: '你好' }],
        sourceLang: 'zh',
        targetLang: 'en',
      }),
    ).rejects.toThrow('主服务不可用');
  });
});
