import type {
  TranslateBatchRequest,
  TranslateBatchResult,
  TranslateProvider,
} from '../../types.js';

export interface BackendProviderConfig {
  apiBase: string;
  /** 翻译接口路径，默认 '/translate' */
  translatePath?: string;
  /** 附加到翻译请求的自定义 headers（会与默认 Content-Type 合并，可覆盖） */
  headers?: Record<string, string>;
  /** 自定义翻译请求入参转换，返回值作为请求体；不传则使用默认格式 */
  transformRequest?: (req: TranslateBatchRequest) => unknown;
  /** 自定义翻译响应出参转换；不传则按默认 {code, data.translations} 格式解析 */
  transformResponse?: (raw: unknown) => TranslateBatchResult;
  /** 完全自定义翻译请求函数；设置后 translatePath/headers/transformRequest/transformResponse 对翻译均无效 */
  translateFetcher?: (req: TranslateBatchRequest) => Promise<TranslateBatchResult>;
}

interface DefaultBackendResponse {
  code: number;
  message?: string;
  data?: { translations: Array<{ hash: string; translation: string }> };
}

/** 对接后端 /translate 批量翻译接口，见设计文档「后端接口规范」一节 */
export class BackendProvider implements TranslateProvider {
  readonly name = 'backend';

  constructor(private readonly config: BackendProviderConfig) {}

  async translate(req: TranslateBatchRequest): Promise<TranslateBatchResult> {
    if (this.config.translateFetcher) {
      return this.config.translateFetcher(req);
    }

    const path = this.config.translatePath ?? '/translate';
    const body = this.config.transformRequest
      ? this.config.transformRequest(req)
      : {
          items: req.items,
          sourceLang: req.sourceLang,
          targetLang: req.targetLang,
          path: req.path,
          glossary: req.glossary,
        };

    const response = await fetch(`${this.config.apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.config.headers },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`[i18n-runtime] backend provider HTTP ${response.status}`);
    }

    const raw = await response.json();

    if (this.config.transformResponse) {
      return this.config.transformResponse(raw);
    }

    const defaultBody = raw as DefaultBackendResponse;
    if (defaultBody.code !== 0 || !defaultBody.data) {
      throw new Error(defaultBody.message ?? '[i18n-runtime] backend provider 返回异常');
    }
    return { translations: defaultBody.data.translations };
  }
}
