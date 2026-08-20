import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  createEngine,
  getActiveEngine,
  type I18nRuntimeConfig,
  type I18nRuntimeEngine,
} from '../core/engine.js';

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
  // <I18nRuntimeProvider> 被重复挂载时 engine.start() 会被 guard 拦截，这个新建实例永远
  // 不会真正运行；初始值先用 engine 保证首次渲染不为空，start() 之后再校正成
  // "当前真正在跑的那个 engine"（可能是别的 Provider 实例），否则子组件 useI18nRuntime()
  // 拿到的会是一个从未 start 成功的空壳实例，调用 setLanguage 会一直报错。
  const [activeEngine, setActiveEngine] = useState<I18nRuntimeEngine>(engine);

  useEffect(() => {
    engine.start(config);
    const resolved = getActiveEngine() ?? engine;
    setActiveEngine(resolved);
    if (initialLanguage) {
      resolved.setLanguage(initialLanguage).catch((err) => {
        console.error('[i18n-runtime] 初始语言设置失败:', err);
      });
    }
    return () => engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 配置只在挂载时生效一次，对齐 Vue 插件 install() 语义，不支持运行时热更新
  }, []);

  return <I18nRuntimeContext.Provider value={activeEngine}>{children}</I18nRuntimeContext.Provider>;
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
