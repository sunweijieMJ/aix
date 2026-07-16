import type {
  ProviderName,
  TranslateBatchRequest,
  TranslateBatchResult,
  TranslateProvider,
} from '../../types.js';
import { BackendProvider } from './backend.js';
import { LibreTranslateProvider } from './libretranslate.js';

export { BackendProvider } from './backend.js';
export { LibreTranslateProvider } from './libretranslate.js';

/** 两个字段都是可选的：调用方（engine）已经在更上层做过 fail-fast 校验，
 *  保证选中哪个 provider 对应的必填字段一定存在，这里按需读取即可 */
export interface ProviderConfig {
  apiBase?: string;
  libretranslateUrl?: string;
}

export function createProvider(name: ProviderName, config: ProviderConfig): TranslateProvider {
  if (name === 'backend') return new BackendProvider({ apiBase: config.apiBase! });
  return new LibreTranslateProvider({ libretranslateUrl: config.libretranslateUrl! });
}

/**
 * 主 provider 请求报错（网络错误/5xx/超时）时才降级调用一次 fallback，
 * 是纯错误兜底分支，不是常态并行调用——用哪个 provider 仍由前端配置显式决定。
 */
export class FallbackTranslator implements TranslateProvider {
  readonly name = 'fallback-translator';

  constructor(
    private readonly primary: TranslateProvider,
    private readonly fallback?: TranslateProvider,
  ) {}

  async translate(req: TranslateBatchRequest): Promise<TranslateBatchResult> {
    try {
      return await this.primary.translate(req);
    } catch (err) {
      if (!this.fallback) throw err;
      return this.fallback.translate(req);
    }
  }
}
