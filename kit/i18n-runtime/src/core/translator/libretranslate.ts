import type {
  TranslateBatchRequest,
  TranslateBatchResult,
  TranslateProvider,
} from '../../types.js';

export interface LibreTranslateProviderConfig {
  libretranslateUrl: string;
}

interface LibreTranslateResponse {
  translatedText: string | string[];
}

/**
 * 对接开源自托管 LibreTranslate 服务。LibreTranslate 不理解我们的 hash 方案，
 * 只按请求顺序返回译文数组，这里按位置把结果重新关联回请求携带的 hash（不做二次计算）。
 */
export class LibreTranslateProvider implements TranslateProvider {
  readonly name = 'libretranslate';

  constructor(private readonly config: LibreTranslateProviderConfig) {}

  async translate(req: TranslateBatchRequest): Promise<TranslateBatchResult> {
    const response = await fetch(`${this.config.libretranslateUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: req.items.map((item) => item.text),
        source: req.sourceLang,
        target: req.targetLang,
        format: 'text',
      }),
    });

    if (!response.ok) {
      throw new Error(`[i18n-runtime] libretranslate provider HTTP ${response.status}`);
    }

    const body = (await response.json()) as LibreTranslateResponse;
    const translatedTexts = Array.isArray(body.translatedText)
      ? body.translatedText
      : [body.translatedText];

    return {
      translations: req.items.map((item, index) => ({
        hash: item.hash,
        translation: translatedTexts[index] ?? item.text,
      })),
    };
  }
}
