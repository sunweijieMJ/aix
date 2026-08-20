import { reactive, type App, type InjectionKey } from 'vue';
import { SUPPORTED_LOCALES, type Locale, type LocaleMessages } from './types';

export interface LocaleContext {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** 应用级文案覆盖：包名 → 语言 → 部分文案（reactive，运行时可变） */
  messages: LocaleMessages;
  /** 增量合入覆盖文案（按包、按语言浅合并），适合异步拉取文案后调用 */
  mergeMessages: (messages: LocaleMessages) => void;
}

export interface CreateLocaleOptions {
  /** 是否持久化语言设置到 localStorage，默认 false */
  persist?: boolean;
  /**
   * 应用级文案覆盖初值，按包名组织：
   * `{ 'ai-chat': { 'zh-CN': { sendButton: '发问' } } }`
   * 包名与文案 key 由各子包的模块增强提供类型校验（见 AixLocaleMessagesMap）。
   */
  messages?: LocaleMessages;
}

/** mergeMessages 内部使用的宽松视图：跳过 keyof AixLocaleMessagesMap 的映射类型索引限制 */
type LooseMessages = Record<string, Partial<Record<Locale, object>> | undefined>;

/**
 * Locale 注入 Key
 * 供外部使用，可用于手动 inject
 */
export const LOCALE_INJECTION_KEY: InjectionKey<LocaleContext> = Symbol('aix-locale');

/**
 * 创建全局语言上下文
 * 应在应用根部调用，通常在 main.ts 中
 *
 * @param defaultLocale 默认语言，默认为 'zh-CN'
 * @param options 配置选项
 * @returns 包含 localeContext 和 install 方法的对象
 *
 * @example
 * ```ts
 * import { createApp } from 'vue';
 * import { createLocale } from '@aix/hooks';
 * import App from './App.vue';
 *
 * const app = createApp(App);
 * const locale = createLocale('zh-CN', {
 *   messages: {
 *     'ai-chat': { 'zh-CN': { sendButton: '发问' } },
 *   },
 * });
 * app.use(locale);
 * app.mount('#app');
 * ```
 */
export function createLocale(defaultLocale: Locale = 'zh-CN', options: CreateLocaleOptions = {}) {
  const { persist = false } = options;
  // 逐包浅拷贝一层：mergeMessages 会原地写 messages（新增包键 / 替换语言切片），
  // 隔离调用方传入的对象，避免复用同一常量创建多个实例时相互污染
  const messages: LocaleMessages = Object.fromEntries(
    Object.entries((options.messages ?? {}) as Record<string, object | undefined>).map(
      ([name, byLocale]) => [name, { ...byLocale }],
    ),
  );

  const saveToStorage = (locale: Locale) => {
    if (!persist || typeof window === 'undefined') return;
    try {
      localStorage.setItem('aix-locale', locale);
    } catch (e) {
      console.warn('[AIX Locale] Failed to save locale to localStorage:', e);
    }
  };

  const loadFromStorage = () => {
    if (!persist || typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('aix-locale');
      if (saved && (SUPPORTED_LOCALES as readonly string[]).includes(saved)) {
        localeContext.locale = saved as Locale;
      }
    } catch (e) {
      console.warn('[AIX Locale] Failed to load locale from localStorage:', e);
    }
  };

  const localeContext = reactive<LocaleContext>({
    locale: defaultLocale,
    messages,
    // 用闭包引用 localeContext 而非 this，避免方法被解构调用时 this 丢失导致更新静默失效
    setLocale(newLocale: Locale) {
      localeContext.locale = newLocale;
      saveToStorage(newLocale);
    },
    mergeMessages(patch: LocaleMessages) {
      const target = localeContext.messages as LooseMessages;
      for (const [name, byLocale] of Object.entries(patch as LooseMessages)) {
        if (!byLocale) continue;
        const slice = (target[name] ??= {});
        for (const [loc, msgs] of Object.entries(byLocale)) {
          if (!msgs) continue;
          slice[loc as Locale] = { ...slice[loc as Locale], ...msgs };
        }
      }
    },
  });

  return {
    localeContext,
    install(app: App) {
      app.provide(LOCALE_INJECTION_KEY, localeContext);
      loadFromStorage();
    },
  };
}
