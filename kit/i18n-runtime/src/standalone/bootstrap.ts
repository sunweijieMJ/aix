import {
  createEngine,
  getActiveEngine,
  type I18nRuntimeConfig,
  type I18nRuntimeEngine,
} from '../core/engine.js';
import type { ProviderName } from '../types.js';
import type { StorageOption } from '../core/storage/index.js';

/**
 * 逗号分隔的 data-* 解析成字符串数组；未传（undefined）时返回 undefined 以走配置默认，
 * 传了但内容为空（如 data-glossary="" 或纯逗号）时也返回 undefined，避免下发无意义的空数组。
 */
function parseList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const list = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

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
    // data-extra-attrs / data-glossary 逗号分隔；未传则由 engine 走默认（不翻额外属性 / 无术语表）
    extraAttrs: parseList(dataset.extraAttrs),
    glossary: parseList(dataset.glossary),
    // data-scan-shadow-dom：未传保持默认 true，仅显式设为 "false" 时关闭 shadow DOM 扫描
    scanShadowDOM:
      dataset.scanShadowDom === undefined ? undefined : dataset.scanShadowDom !== 'false',
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
  // script 标签被重复引入时 engine.start() 会被 guard 拦截、这个新建实例永远不会真正运行，
  // 必须把 window.I18nRuntime 指向"当前真正在跑的那个 engine"，否则业务后续调用
  // window.I18nRuntime.setLanguage() 会一直拿到一个从未 start 成功的空壳实例而报错。
  const activeEngine = getActiveEngine() ?? engine;
  (window as unknown as Record<string, unknown>).I18nRuntime = activeEngine;

  if (initialLanguage) {
    activeEngine.setLanguage(initialLanguage).catch((err) => {
      console.error('[i18n-runtime] 初始语言设置失败:', err);
    });
  }

  return activeEngine;
}
