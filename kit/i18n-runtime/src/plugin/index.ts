import { inject, type App, type InjectionKey, type Plugin } from 'vue';
import { createEngine, type I18nRuntimeConfig, type I18nRuntimeEngine } from '../core/engine.js';

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

      if (initialLanguage) {
        engine.setLanguage(initialLanguage).catch((err) => {
          console.error('[i18n-runtime] 初始语言设置失败:', err);
        });
      }

      app.provide(I18N_RUNTIME_INJECTION_KEY, engine);
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
