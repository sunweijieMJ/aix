import { inject, type App, type InjectionKey, type Plugin } from 'vue';
import {
  createEngine,
  getActiveEngine,
  type I18nRuntimeConfig,
  type I18nRuntimeEngine,
} from '../core/engine.js';

export interface I18nRuntimePluginOptions extends I18nRuntimeConfig {
  /** install 完成后自动调用一次 setLanguage(initialLanguage)，不传则保持显示原文，由业务自行调用 */
  initialLanguage?: string;
}

export const I18N_RUNTIME_INJECTION_KEY: InjectionKey<I18nRuntimeEngine> = Symbol('i18n-runtime');

export function createI18nRuntimePlugin(options: I18nRuntimePluginOptions): Plugin {
  return {
    install(app: App) {
      const engine = createEngine();
      const { initialLanguage, ...config } = options;
      engine.start(config);
      // app.use(plugin) 被重复调用时 engine.start() 会被 guard 拦截，这个新建实例永远
      // 不会真正运行，必须 provide "当前真正在跑的那个 engine"，否则子组件 useI18nRuntime()
      // 拿到的会是一个从未 start 成功的空壳实例，调用 setLanguage 会一直报错。
      const activeEngine = getActiveEngine() ?? engine;

      if (initialLanguage) {
        const doSetLanguage = () =>
          activeEngine.setLanguage(initialLanguage).catch((err) => {
            console.error('[i18n-runtime] 初始语言设置失败:', err);
          });

        // 有 router 时等初始导航完成再设语言，否则 getCurrentPath 拿到的是 '/'
        if (config.router && 'isReady' in config.router) {
          (config.router as { isReady: () => Promise<void> }).isReady().then(doSetLanguage);
        } else {
          doSetLanguage();
        }
      }

      app.provide(I18N_RUNTIME_INJECTION_KEY, activeEngine);
    },
  };
}

/** 业务组件内获取 engine 实例，用于自行调用 setLanguage/on 等 API */
export function useI18nRuntime(): I18nRuntimeEngine {
  const engine = inject(I18N_RUNTIME_INJECTION_KEY);
  if (!engine) {
    throw new Error(
      '[i18n-runtime] useI18nRuntime() 必须在 app.use(createI18nRuntimePlugin(...)) 之后使用',
    );
  }
  return engine;
}
