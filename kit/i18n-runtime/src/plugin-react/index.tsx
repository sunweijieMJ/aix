import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createEngine, type I18nRuntimeConfig, type I18nRuntimeEngine } from '../core/engine.js';

export interface I18nRuntimeProviderProps extends I18nRuntimeConfig {
  /** mount 完成后自动调用一次 setLanguage(initialLanguage)，不传则保持显示原文，由业务自行调用 */
  initialLanguage?: string;
  children: ReactNode;
}

// eslint-disable-next-line react-refresh/only-export-components
export const I18nRuntimeContext = createContext<I18nRuntimeEngine | undefined>(undefined);

export function I18nRuntimeProvider(props: I18nRuntimeProviderProps): ReactNode {
  const { children, initialLanguage, ...config } = props;
  const [engine] = useState(() => createEngine());

  useEffect(() => {
    engine.start(config);
    if (initialLanguage) {
      engine.setLanguage(initialLanguage).catch((err) => {
        console.error('[i18n-runtime] 初始语言设置失败:', err);
      });
    }
    return () => engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 配置只在挂载时生效一次，对齐 Vue 插件 install() 语义，不支持运行时热更新
  }, []);

  return <I18nRuntimeContext.Provider value={engine}>{children}</I18nRuntimeContext.Provider>;
}

/** 业务组件内获取 engine 实例，用于自行调用 setLanguage/on 等 API */
// eslint-disable-next-line react-refresh/only-export-components
export function useI18nRuntime(): I18nRuntimeEngine {
  const engine = useContext(I18nRuntimeContext);
  if (!engine) {
    throw new Error('[i18n-runtime] useI18nRuntime() 必须在 <I18nRuntimeProvider> 内部使用');
  }
  return engine;
}
