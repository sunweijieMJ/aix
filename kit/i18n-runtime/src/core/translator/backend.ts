import type {
  TranslateBatchRequest,
  TranslateBatchResult,
  TranslateProvider,
} from '../../types.js';

export interface BackendProviderConfig {
  apiBase: string;
}

interface BackendResponse {
  code: number;
  message?: string;
  data?: { translations: Array<{ hash: string; translation: string }> };
}

/** 对接后端 /translate 批量翻译接口，见设计文档「后端接口规范」一节 */
export class BackendProvider implements TranslateProvider {
  readonly name = 'backend';

  constructor(private readonly config: BackendProviderConfig) {}

  async translate(req: TranslateBatchRequest): Promise<TranslateBatchResult> {
    const response = await fetch(`${this.config.apiBase}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: req.items,
        sourceLang: req.sourceLang,
        targetLang: req.targetLang,
      }),
    });

    if (!response.ok) {
      throw new Error(`[i18n-runtime] backend provider HTTP ${response.status}`);
    }

    const body = (await response.json()) as BackendResponse;
    if (body.code !== 0 || !body.data) {
      throw new Error(body.message ?? '[i18n-runtime] backend provider 返回异常');
    }

    return { translations: body.data.translations };
  }
}
