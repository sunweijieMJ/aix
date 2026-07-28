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

    // 返回条数少于请求条数时，缺失的条目整条省略，不能用原文顶替：原文是非空字符串，
    // 会通过 PackStore 的"可用译文"检查写进 L1/L2 永久缓存，该 hash 从此稳定命中、
    // 再也不会重新请求翻译，页面上这段文字就永久停留在原文。省略掉则视为未翻译，
    // 下次扫描自然重新入队重试——与 /translate 接口"缺失的 hash 视为未翻译"契约一致。
    return {
      translations: req.items.flatMap((item, index) => {
        const translation = translatedTexts[index];
        return typeof translation === 'string' ? [{ hash: item.hash, translation }] : [];
      }),
    };
  }
}
