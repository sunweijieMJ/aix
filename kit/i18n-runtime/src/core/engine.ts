import type {
  ProviderName,
  RemotePack,
  ShouldTranslate,
  Terminology,
  TranslationCandidate,
} from '../types.js';
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
  /** 全局术语表，翻译时传给后端，防止品牌名/专有名词被翻译（保留原文，不指定译文） */
  glossary?: string[];
  /**
   * 固定译文术语表：原文 -> {lang: 固定译文}，用于品牌名/标题等需要人工指定译法、
   * 不依赖机翻的场景。与 glossary 不同，这里是"替换成指定译文"而不是"保留原文"。
   * 命中优先级高于机翻缓存和实时翻译，低于元素级 `data-i18n-fixed-{lang}` 属性
   * （更具体的声明应该赢）。按精确原文字符串匹配，不做数字占位符归一化，
   * 只适合不含变量的固定文案；命中的候选不出网、不落 packStore 缓存。
   */
  terminology?: Terminology;
  /** 获取当前路由路径的回调函数，返回值会随翻译请求和语言包请求传给后端；不传则路径为空 */
  getCurrentPath?: () => string;
  /** 是否扫描 open shadow root 内的文本，默认 true；设为 false 可关闭所有 shadow DOM 翻译 */
  scanShadowDOM?: boolean;
  /**
   * 按内容/DOM 位置决定某段文本是否参与翻译，返回 false 则该候选既不发给翻译服务、
   * 也不会被写回 DOM。用于个人信息脱敏等场景——运行时按设计会把页面上所有可见文本
   * 发送到翻译服务，`translate="no"` / `data-i18n-skip` 只能按区域静态排除，
   * 这个钩子补上按内容动态判断的能力。
   */
  shouldTranslate?: ShouldTranslate;
  /**
   * 候选进入"等待翻译"状态（已入队，即将发起或已发起网络请求）时，给它所在的元素加上这个
   * class；该候选结束等待（写回译文/请求失败/被 stop() 丢弃）时自动摘掉。用于业务自定义
   * loading 交互（骨架屏、透明度过渡、伪元素 spinner 等），业务只需写 CSS，不需要监听事件。
   *
   * 命中固定译文（terminology/data-i18n-fixed-*）、L1 缓存、或目标语言等于源语言的候选是
   * 同步完成，没有等待期，不会触发这个 class。
   *
   * 同一个元素上可能同时挂多个候选（如一段文本被拆成多个 Text 节点、或 placeholder/title
   * 同时在翻译），按引用计数管理：只有当挂在该元素上的候选全部结束等待，才会真正摘掉 class。
   */
  pendingClass?: string;
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
  /** 手动注册额外的根节点（用于 closed shadow root 或业务显式管理的 shadow root） */
  addRoot(root: Node): void;
  /**
   * 清空已缓存的语言包（L1 内存 + L2 持久化）。不传 lang 则清掉所有已缓存的语言。
   * 译文可能包含页面上的个人信息，用户登出时应调用一次。不会回滚页面上已写入的译文，
   * 需要恢复原文请先 `await setLanguage(sourceLang)`。
   */
  clearCache(lang?: string): Promise<void>;
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

const VALID_PROVIDERS: readonly ProviderName[] = ['backend', 'libretranslate'];

function validateConfig(config: I18nRuntimeConfig): void {
  // 必须先校验枚举值：createProvider 是 if/else 结构，认不出的 provider 会静默落到
  // libretranslate 分支、带着 undefined 的 url 去请求。standalone 尤其容易踩到
  // （data-provider="" 是空串而不是 undefined，绕得过 ?? 'backend' 默认值）
  if (!VALID_PROVIDERS.includes(config.provider)) {
    throw new Error(
      `[i18n-runtime] 不支持的 provider: ${String(config.provider)}，可选值: ${VALID_PROVIDERS.join(', ')}`,
    );
  }
  if (config.fallbackProvider !== undefined && !VALID_PROVIDERS.includes(config.fallbackProvider)) {
    throw new Error(
      `[i18n-runtime] 不支持的 fallbackProvider: ${String(config.fallbackProvider)}，可选值: ${VALID_PROVIDERS.join(', ')}`,
    );
  }
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
  // 语言包是「按语言的全量 hash -> translation 映射」，不按路由分片：L2 只按 lang 存储、
  // version 也只按 lang 比对。若请求上带 path、后端又真的按 path 返回子集，第二个页面的
  // 整包会因为 version 与第一个页面相同而被 hydrate 静默丢弃。path 只对 /translate 有意义
  // （后端据此按页面分组缓存翻译结果），对 /pack 是个陷阱，这里不下发。
  return async (lang: string): Promise<RemotePack | null> => {
    if (backendOptions?.packFetcher) {
      return backendOptions.packFetcher(lang);
    }
    if (!apiBase) return null;
    const packPath = backendOptions?.packPath ?? '/pack';
    const url = new URL(`${apiBase}${packPath}`, window.location.origin);
    url.searchParams.set('lang', lang);

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
  /**
   * 每次 start() 自增，用于识别"这批在途翻译属于哪一轮运行"。
   * 光判断 started 布尔值不够：stop() 后立刻 start()（React StrictMode 的 unmount/remount
   * 就是这个时序）它又变回 true，上一轮的在途批次会被当成运行中继续写回 DOM。
   */
  let runId = 0;
  const listeners = new Map<I18nRuntimeEvent, Set<(node: Text) => void>>();
  /** pendingClass 的引用计数：同一个元素上可能同时挂多个候选（拆分的多个文本节点、
   *  或 placeholder/title 同时在翻译），必须等全部结束等待才能真正摘掉 class */
  const pendingCounts = new WeakMap<Element, number>();

  function emit(event: I18nRuntimeEvent, node: Text): void {
    listeners.get(event)?.forEach((cb) => cb(node));
  }

  /** 文本候选记在其父元素上（Text 节点没有 classList），属性候选记在属性所在元素本身上 */
  function pendingElement(candidate: TranslationCandidate): Element | null {
    if (candidate.kind === 'attr') return candidate.node as Element;
    return (candidate.node as Text).parentElement;
  }

  function adjustPending(candidates: TranslationCandidate[], delta: 1 | -1): void {
    const className = config?.pendingClass;
    if (!className) return;
    for (const candidate of candidates) {
      const el = pendingElement(candidate);
      if (!el) continue;
      const next = (pendingCounts.get(el) ?? 0) + delta;
      if (next <= 0) {
        pendingCounts.delete(el);
        el.classList.remove(className);
      } else {
        pendingCounts.set(el, next);
        el.classList.add(className);
      }
    }
  }

  function applyCandidate(
    candidate: TranslationCandidate,
    translation: string,
    lang: string,
  ): void {
    const restored = candidate.restore(translation);

    if (candidate.kind === 'text') {
      const node = candidate.node as Text;
      // <option> 没有显式 value 属性时，表单提交值直接取自它的文本内容，改文本会连带
      // 改掉提交值。option 文本又是必须翻译的展示文案（下拉框），不能像 textarea 那样
      // 整体跳过，所以在写回前把浏览器此刻算出的 value（即原文）固化成显式属性：
      // 显示层照常显示译文，提交值保持原文不变。用 tagName 而不是 instanceof，
      // 避免跨 realm（iframe）时 instanceof 判定失效。
      const parent = node.parentElement;
      if (parent?.tagName === 'OPTION' && !parent.hasAttribute('value')) {
        parent.setAttribute('value', (parent as HTMLOptionElement).value);
      }
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
    const batchRunId = runId;
    const sourceLang = config!.sourceLang ?? 'zh';

    // 这批候选从这里开始进入"等待翻译"状态，直到函数退出（无论成功/失败/被下面的
    // runId 校验提前 return）都要摘掉，用 try/finally 保证不会有任何出口漏摘。
    adjustPending(candidates, 1);
    try {
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

      // 翻译是异步的，等待期间业务可能已经调用 stop()：那时 scanner 已 disconnect、
      // 尚未出队的候选也被丢弃，运行时对外的承诺是"不再改写 DOM"。已经出队的这批必须在
      // 这里一并止步，否则 stop() 之后页面仍会突然被改写。译文本身已写进 packStore，
      // 缓存不浪费，下次 start() 能直接命中。
      // runId 比对额外挡住"stop() 后又 start()"的情况：那时 started 已经回到 true，
      // 但这批候选属于上一轮运行（DOM 节点可能都已被卸载），不该由它来写。
      // lang 比对挡住"翻译在途时切了语言"：这批译文属于上一个语言，写回等于把页面
      // 刚显示好的新语言文案覆盖成旧语言。MutationObserver 事后能自愈回来，但用户会
      // 看见一次明显的语言闪烁。译文已进 packStore，下次切回这个语言直接命中缓存。
      if (!started || runId !== batchRunId || lang !== currentLang) return;

      for (const candidate of candidates) {
        const translation = packStore!.get(lang, candidate.hash);
        if (translation !== undefined) applyCandidate(candidate, translation, lang);
      }
    } finally {
      adjustPending(candidates, -1);
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
        scanShadowDOM: userConfig.scanShadowDOM,
        shouldTranslate: userConfig.shouldTranslate,
        terminology: userConfig.terminology,
        getCached: (hash) => packStore!.get(currentLang, hash),
        onCacheHit: (candidate, translation) => applyCandidate(candidate, translation, currentLang),
        onBatch: (candidates) => {
          void handleBatch(candidates);
        },
      });

      routeWatcher = userConfig.router
        ? createRouterHookWatcher(userConfig.router)
        : createHistoryPatchWatcher();

      started = true;
      runId += 1;
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
      // languages 是"目标语言列表"，业务通常不会把页面原文语言也列进去。但切回源语言
      // 是纯本地还原（原文都在 registry / data-i18n-orig-* 里），永远是合法操作——
      // 不在这里放行的话，语言下拉框里根本选不回原文。
      const sourceLang = config.sourceLang ?? 'zh';
      if (lang !== sourceLang && !config.languages.includes(lang)) {
        throw new Error(
          `[i18n-runtime] 不支持的语言: ${lang}，可选值: ${[...new Set([sourceLang, ...config.languages])].join(', ')}`,
        );
      }

      currentLang = lang;
      scanner.setTargetLang(lang);

      if (!observing) {
        scanner.observe(document.body);
        routeWatcher.start(() => {
          void packStore!.hydrate(currentLang);
          scanner!.scanFull(document.body);
        });
        observing = true;
      }

      await packStore.hydrate(lang);
      scanner.scanFull(document.body);
    },

    getLanguage() {
      return currentLang;
    },

    addRoot(root: Node) {
      if (!started || !scanner) return;
      scanner.addRoot(root);
    },

    async clearCache(lang?: string) {
      if (!packStore) return;
      // 不指定语言时，清掉 config.languages 和 L1 里出现过的所有语言（含源语言：
      // 切回源语言虽然不产生译文，但它可能因为 hydrate 在 L2 里留过一份空包）
      const targets = lang
        ? [lang]
        : [
            ...new Set([
              ...(config?.languages ?? []),
              config?.sourceLang ?? 'zh',
              ...packStore.cachedLanguages(),
            ]),
          ];
      await Promise.all(targets.map((target) => packStore!.clear(target)));
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
