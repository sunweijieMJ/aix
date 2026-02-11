import { reactive, type App, type InjectionKey } from 'vue';
import { SUPPORTED_LOCALES, type Locale } from './types';

export interface LocaleContext {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export interface CreateLocaleOptions {
  /** 是否持久化语言设置到 localStorage，默认 false */
  persist?: boolean;
}

/**
 * Locale 注入 Key
 * 供外部使用，可用于手动 inject
 */
export const LOCALE_INJECTION_KEY: InjectionKey<LocaleContext> =
  Symbol('aix-locale');

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
 * const locale = createLocale('zh-CN');
 * app.use(locale);
 * app.mount('#app');
 * ```
 */
export function createLocale(
  defaultLocale: Locale = 'zh-CN',
  options: CreateLocaleOptions = {},
) {
  const { persist = false } = options;

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
    setLocale(newLocale: Locale) {
      this.locale = newLocale;
      saveToStorage(newLocale);
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
