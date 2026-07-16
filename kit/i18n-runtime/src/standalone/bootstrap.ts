import { createEngine, type I18nRuntimeConfig, type I18nRuntimeEngine } from '../core/engine.js';
import type { ProviderName } from '../types.js';
import type { StorageOption } from '../core/storage/index.js';

export function parseConfigFromDataset(
  dataset: DOMStringMap,
): I18nRuntimeConfig & { initialLanguage?: string } {
  const languages = (dataset.languages ?? '')
    .split(',')
    .map((lang) => lang.trim())
    .filter(Boolean);

  return {
    provider: (dataset.provider as ProviderName) ?? 'backend',
    fallbackProvider: dataset.fallbackProvider as ProviderName | undefined,
    apiBase: dataset.apiBase,
    libretranslateUrl: dataset.libretranslateUrl,
    languages,
    sourceLang: dataset.sourceLang,
    debounceMs: dataset.debounceMs ? Number(dataset.debounceMs) : undefined,
    maxBatchSize: dataset.maxBatchSize ? Number(dataset.maxBatchSize) : undefined,
    storage: dataset.storage as StorageOption | undefined,
    maxEntries: dataset.maxEntries ? Number(dataset.maxEntries) : undefined,
    initialLanguage: dataset.initialLanguage,
  };
}

/**
 * script 标签接入的启动入口。engine 实例挂到 window.I18nRuntime，
 * 供业务方在完全不改代码的前提下，自己在页面上放一个下拉框调用
 * `window.I18nRuntime.setLanguage('en')` 做语言切换。
 */
export function bootstrap(script: HTMLScriptElement): I18nRuntimeEngine {
  const { initialLanguage, ...config } = parseConfigFromDataset(script.dataset);

  const engine = createEngine();
  engine.start(config);
  (window as unknown as Record<string, unknown>).I18nRuntime = engine;

  if (initialLanguage) {
    engine.setLanguage(initialLanguage).catch((err) => {
      console.error('[i18n-runtime] 初始语言设置失败:', err);
    });
  }

  return engine;
}
