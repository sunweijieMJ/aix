import type { ProviderName, RemotePack, TranslationCandidate } from '../types.js';
import { NodeRegistry } from './node-registry.js';
import { PackStore } from './pack-store.js';
import { resolveStorageAdapter, type StorageOption } from './storage/index.js';
import { createProvider, FallbackTranslator } from './translator/index.js';
import { Scanner, ensureOriginalAttrRecorded, markAttrTranslated } from './scanner.js';
import {
  createHistoryPatchWatcher,
  createRouterHookWatcher,
  type MinimalRouter,
  type RouteWatcher,
} from './route-watcher.js';

export interface I18nRuntimeConfig {
  provider: ProviderName;
  fallbackProvider?: ProviderName;
  apiBase?: string;
  libretranslateUrl?: string;
  languages: string[];
  sourceLang?: string;
  router?: MinimalRouter;
  debounceMs?: number;
  maxBatchSize?: number;
  storage?: StorageOption;
  maxEntries?: number;
  /** 除 placeholder/title/alt 之外，额外需要翻译的 HTML 属性名，如 ['data-placeholder'] */
  extraAttrs?: string[];
  /** 全局术语表，翻译时传给后端，防止品牌名/专有名词被翻译 */
  glossary?: string[];
  /** 获取当前路由路径的回调函数，返回值会随翻译请求和语言包请求传给后端；不传则路径为空 */
  getCurrentPath?: () => string;
  /** backend provider 的接口自定义配置（仅当 provider 为 'backend' 时生效） */
  backendOptions?: {
    /** 翻译接口路径，默认 '/translate' */
    translatePath?: string;
    /** 语言包接口路径，默认 '/pack' */
    packPath?: string;
    /** 附加到所有请求的自定义 headers */
    headers?: Record<string, string>;
    /** 自定义翻译请求入参转换 */
    transformRequest?: (req: import('../types.js').TranslateBatchRequest) => unknown;
    /** 自定义翻译响应出参转换 */
    transformResponse?: (raw: unknown) => import('../types.js').TranslateBatchResult;
    /** 完全自定义翻译请求函数（设置后 translatePath/headers/transform 对翻译均无效） */
    translateFetcher?: (
      req: import('../types.js').TranslateBatchRequest,
    ) => Promise<import('../types.js').TranslateBatchResult>;
    /** 完全自定义语言包请求函数（设置后 packPath/headers 对语言包请求无效） */
    packFetcher?: (lang: string) => Promise<RemotePack | null>;
    /** 自定义语言包响应解析；不传则按默认 {code, data} 格式解析 */
    transformPackResponse?: (raw: unknown) => RemotePack | null;
  };
}

export type I18nRuntimeEvent = 'node-translated';

export interface I18nRuntimeEngine {
  start(config: I18nRuntimeConfig): void;
  stop(): void;
  setLanguage(lang: string): Promise<void>;
  getLanguage(): string;
  on(event: I18nRuntimeEvent, cb: (node: Text) => void): () => void;
}

const GLOBAL_GUARD_KEY = '__I18N_RUNTIME_STARTED__';

/**
 * 重复启动场景下（如 CDN script 标签被误引入两次、app.use(plugin) 被误调用两次），
 * 拿到"当前真正处于运行状态的那个 engine"，而不是刚 new 出来但被 guard 拦截、
 * 永远没有 start 成功的空壳实例——三个接入层（standalone/plugin/plugin-react）
 * 用这个函数决定该把哪个 engine 暴露给业务代码。
 */
export function getActiveEngine(): I18nRuntimeEngine | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as Record<string, unknown>)[GLOBAL_GUARD_KEY] as
    | I18nRuntimeEngine
    | undefined;
}

function validateConfig(config: I18nRuntimeConfig): void {
  if (config.provider === 'backend' && !config.apiBase) {
    throw new Error('[i18n-runtime] provider 为 backend 时必须传 apiBase');
  }
  if (config.provider === 'libretranslate' && !config.libretranslateUrl) {
    throw new Error('[i18n-runtime] provider 为 libretranslate 时必须传 libretranslateUrl');
  }
  if (config.fallbackProvider === 'backend' && !config.apiBase) {
    throw new Error('[i18n-runtime] fallbackProvider 为 backend 时必须传 apiBase');
  }
  if (config.fallbackProvider === 'libretranslate' && !config.libretranslateUrl) {
    throw new Error('[i18n-runtime] fallbackProvider 为 libretranslate 时必须传 libretranslateUrl');
  }
  if (config.languages.length === 0) {
    throw new Error('[i18n-runtime] languages 不能为空数组');
  }
}

function createFetchRemotePack(
  apiBase: string | undefined,
  backendOptions?: I18nRuntimeConfig['backendOptions'],
) {
  return async (lang: string, path?: string): Promise<RemotePack | null> => {
    if (backendOptions?.packFetcher) {
      return backendOptions.packFetcher(lang);
    }
    if (!apiBase) return null;
    const packPath = backendOptions?.packPath ?? '/pack';
    const url = new URL(`${apiBase}${packPath}`, window.location.origin);
    url.searchParams.set('lang', lang);
    if (path) url.searchParams.set('path', path);

    const response = await fetch(url.toString(), {
      headers: backendOptions?.headers,
    });
    if (!response.ok) throw new Error(`[i18n-runtime] pack 拉取失败 HTTP ${response.status}`);
    const raw = await response.json();
    if (backendOptions?.transformPackResponse) {
      return backendOptions.transformPackResponse(raw);
    }
    const body = raw as { code: number; data?: RemotePack };
    if (body.code !== 0 || !body.data) throw new Error('[i18n-runtime] pack 拉取响应异常');
    return body.data;
  };
}

/** 每次调用返回一个独立的引擎实例；跨实例的重复启动保护走 window 全局标记（见 GLOBAL_GUARD_KEY） */
export function createEngine(): I18nRuntimeEngine {
  let config: I18nRuntimeConfig | undefined;
  let registry: NodeRegistry | undefined;
  let packStore: PackStore | undefined;
  let scanner: Scanner | undefined;
  let routeWatcher: RouteWatcher | undefined;
  let translator: FallbackTranslator | undefined;
  let currentLang = '';
  let started = false;
  let observing = false;
  const listeners = new Map<I18nRuntimeEvent, Set<(node: Text) => void>>();

  function emit(event: I18nRuntimeEvent, node: Text): void {
    listeners.get(event)?.forEach((cb) => cb(node));
  }

  function applyCandidate(
    candidate: TranslationCandidate,
    translation: string,
    lang: string,
  ): void {
    const restored = candidate.restore(translation);

    if (candidate.kind === 'text') {
      const node = candidate.node as Text;
      node.textContent = restored;
      registry!.record(node, {
        originalText: candidate.originalText,
        translatedText: restored,
        lang,
      });
      emit('node-translated', node);
      return;
    }

    const el = candidate.node as Element;
    const attrName = candidate.attrName!;
    ensureOriginalAttrRecorded(el, attrName, candidate.originalText);
    el.setAttribute(attrName, restored);
    markAttrTranslated(el, attrName, restored);
  }

  async function handleBatch(candidates: TranslationCandidate[]): Promise<void> {
    const lang = currentLang;
    const sourceLang = config!.sourceLang ?? 'zh';

    const missing = candidates.filter((c) => packStore!.get(lang, c.hash) === undefined);
    if (missing.length > 0) {
      // 按 hash 去重再发给 translator——多个候选（如两个内容相同的按钮）可能共享同一个 hash，
      // 不应该把同一段文本重复发给翻译服务；候选本身在 Scanner.enqueue 里已经不会被丢弃，
      // 这里只是避免请求体里出现重复条目，应用译文时仍会遍历全部 candidates 逐一写回。
      const uniqueMissing = new Map<string, string>();
      for (const c of missing) uniqueMissing.set(c.hash, c.normalizedText);

      try {
        const result = await translator!.translate({
          items: [...uniqueMissing].map(([hash, text]) => ({ hash, text })),
          sourceLang,
          targetLang: lang,
          path: config!.getCurrentPath?.(),
          glossary: config!.glossary,
        });
        const translations: Record<string, string> = {};
        for (const item of result.translations) translations[item.hash] = item.translation;
        await packStore!.setMany(lang, translations);
      } catch (err) {
        // 翻译失败不写入 packStore、不记录 registry，这批候选保持"未翻译"状态，
        // 下次扫描（路由切换/新的 mutation）会因为命中不到缓存而自然重新入队重试。
        // 注意：这里不能 return——本批次里可能还混有其它已经命中缓存的候选（比如内容
        // 与页面别处已翻译文本相同），它们不该被这次翻译失败连累，必须走到下面的循环正常写回。
        console.error('[i18n-runtime] 批量翻译失败，本批候选将在下次扫描时自动重试:', err);
      }
    }

    for (const candidate of candidates) {
      const translation = packStore!.get(lang, candidate.hash);
      if (translation !== undefined) applyCandidate(candidate, translation, lang);
    }
  }

  const engine: I18nRuntimeEngine = {
    start(userConfig: I18nRuntimeConfig) {
      if (typeof window !== 'undefined' && getActiveEngine()) {
        console.warn('[i18n-runtime] 已经启动过一次，本次 start() 调用被忽略');
        return;
      }
      validateConfig(userConfig);

      config = userConfig;
      currentLang = userConfig.sourceLang ?? 'zh';
      registry = new NodeRegistry();

      const storage = resolveStorageAdapter(userConfig.storage, userConfig.maxEntries);
      packStore = new PackStore({
        storage,
        fetchRemotePack: createFetchRemotePack(userConfig.apiBase, userConfig.backendOptions),
      });

      const primary = createProvider(userConfig.provider, userConfig, userConfig.backendOptions);
      const fallback = userConfig.fallbackProvider
        ? createProvider(userConfig.fallbackProvider, userConfig, userConfig.backendOptions)
        : undefined;
      translator = new FallbackTranslator(primary, fallback);

      scanner = new Scanner({
        registry,
        sourceLang: userConfig.sourceLang ?? 'zh',
        targetLang: currentLang,
        debounceMs: userConfig.debounceMs,
        maxBatchSize: userConfig.maxBatchSize,
        extraAttrs: userConfig.extraAttrs,
        onBatch: (candidates) => {
          void handleBatch(candidates);
        },
      });

      routeWatcher = userConfig.router
        ? createRouterHookWatcher(userConfig.router)
        : createHistoryPatchWatcher();

      started = true;
      if (typeof window !== 'undefined')
        (window as unknown as Record<string, unknown>)[GLOBAL_GUARD_KEY] = engine;
    },

    stop() {
      if (!started) return;
      scanner?.disconnect();
      routeWatcher?.stop();
      started = false;
      observing = false;
      // 只清自己占的全局标记——避免误把另一个正在运行的 engine（同页面被重复 start
      // 拦截后，业务复用的是那一个实例）的标记也清掉
      if (typeof window !== 'undefined' && getActiveEngine() === engine)
        (window as unknown as Record<string, unknown>)[GLOBAL_GUARD_KEY] = undefined;
    },

    async setLanguage(lang: string) {
      if (!started || !config || !scanner || !packStore || !routeWatcher) {
        throw new Error('[i18n-runtime] 必须先调用 start() 才能 setLanguage()');
      }
      if (!config.languages.includes(lang)) {
        throw new Error(
          `[i18n-runtime] 不支持的语言: ${lang}，可选值: ${config.languages.join(', ')}`,
        );
      }

      currentLang = lang;
      scanner.setTargetLang(lang);

      if (!observing) {
        scanner.observe(document.body);
        routeWatcher.start(() => {
          const path = config!.getCurrentPath?.();
          void packStore!.hydrate(currentLang, path);
          scanner!.scanFull(document.body);
        });
        observing = true;
      }

      const currentPath = config!.getCurrentPath?.();
      await packStore.hydrate(lang, currentPath);
      scanner.scanFull(document.body);
    },

    getLanguage() {
      return currentLang;
    },

    on(event, cb) {
      const set = listeners.get(event) ?? new Set<(node: Text) => void>();
      set.add(cb);
      listeners.set(event, set);
      return () => set.delete(cb);
    },
  };

  return engine;
}
