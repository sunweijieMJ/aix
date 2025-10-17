import { reactive, computed, type App, type InjectionKey } from 'vue';
import type { Locale } from './types';

export interface LocaleContext {
  locale: Locale;
  setLocale: (locale: Locale) => void;
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
 * @returns 包含 localeContext 和 install 方法的对象
 *
 * @example
 * ```ts
 * import { createApp } from 'vue';
 * import { createLocale } from '@aix/hooks';
 * import App from './App.vue';
 *
 * const app = createApp(App);
 * const { install } = createLocale('zh-CN');
 * app.use({ install });
 * app.mount('#app');
 * ```
 */
export function createLocale(defaultLocale: Locale = 'zh-CN') {
  // 使用 reactive 包装状态，确保响应性
  const state = reactive({
    locale: defaultLocale,
  });

  /**
   * 保存语言设置到 localStorage
   */
  const saveToStorage = (locale: Locale) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('aix-locale', locale);
      } catch (e) {
        console.warn('[AIX Locale] Failed to save locale to localStorage:', e);
      }
    }
  };

  /**
   * 从 localStorage 恢复语言设置
   */
  const loadFromStorage = () => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('aix-locale') as Locale;
        if (saved && ['zh-CN', 'en-US'].includes(saved)) {
          state.locale = saved;
        }
      } catch (e) {
        console.warn(
          '[AIX Locale] Failed to load locale from localStorage:',
          e,
        );
      }
    }
  };

  /**
   * 设置当前语言
   */
  const setLocale = (newLocale: Locale) => {
    state.locale = newLocale;
    saveToStorage(newLocale);

    // 触发自定义事件，供外部监听
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aix-locale-change', {
          detail: { locale: newLocale },
        }),
      );
    }
  };

  // 使用 computed 确保响应性传递
  const localeRef = computed(() => state.locale);

  // 直接使用响应式状态，不需要 readonly 包装
  // getter 模式确保每次访问都能获取最新值
  const localeContext: LocaleContext = {
    get locale() {
      return localeRef.value;
    },
    setLocale,
  };

  return {
    localeContext,
    /**
     * Vue 插件安装函数
     */
    install(app: App) {
      // provide 给所有子组件
      app.provide(LOCALE_INJECTION_KEY, localeContext);

      // 添加全局属性，方便在模板中直接访问
      app.config.globalProperties.$locale = localeRef;
      app.config.globalProperties.$setLocale = setLocale;

      // 仅在客户端恢复语言设置
      if (typeof window !== 'undefined') {
        loadFromStorage();
      }
    },
  };
}
