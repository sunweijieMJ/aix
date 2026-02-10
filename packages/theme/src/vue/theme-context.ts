/**
 * 主题上下文 - Vue Context API
 * 提供响应式主题管理能力
 */

import { type App, computed, type InjectionKey, reactive } from 'vue';
import { calculateAlgorithm, themeController } from '../core/theme-controller';
import type {
  PartialThemeTokens,
  ThemeConfig,
  ThemeMode,
  ThemePreset,
  ThemeTokens,
  TransitionConfig,
} from '../theme-types';

/**
 * 主题上下文接口
 */
export interface ThemeContext {
  /** 当前主题模式 */
  mode: ThemeMode;
  /** 当前主题配置 */
  config: ThemeConfig;
  /** 设置主题模式 */
  setMode: (mode: ThemeMode) => void;
  /** 切换主题模式 */
  toggleMode: () => ThemeMode;
  /** 应用主题配置 */
  applyTheme: (config: ThemeConfig) => void;
  /** 设置单个 Token */
  setToken: (key: keyof PartialThemeTokens, value: string | number) => void;
  /** 批量设置 Token */
  setTokens: (tokens: PartialThemeTokens) => void;
  /** 获取单个 Token 值 */
  getToken: <K extends keyof ThemeTokens>(key: K) => ThemeTokens[K];
  /** 获取所有当前 Token */
  getTokens: () => ThemeTokens;
  /** 应用预设主题 */
  applyPreset: (name: string) => void;
  /** 注册自定义预设 */
  registerPreset: (preset: ThemePreset) => void;
  /** 获取所有预设 */
  getPresets: () => ThemePreset[];
  /** 重置为默认主题 */
  reset: () => void;
  /** 设置过渡配置 */
  setTransition: (config: TransitionConfig) => void;
  /** 获取过渡配置 */
  getTransition: () => Required<TransitionConfig>;
}

/**
 * 主题注入 Key
 */
export const THEME_INJECTION_KEY: InjectionKey<ThemeContext> =
  Symbol('aix-theme');

/**
 * 创建主题选项
 */
export interface CreateThemeOptions {
  /** 初始主题模式 */
  initialMode?: ThemeMode;
  /** 是否持久化到 localStorage */
  persist?: boolean;
  /** localStorage 存储键名 */
  storageKey?: string;
  /** 是否跟随系统主题 */
  watchSystem?: boolean;
  /** 初始主题配置 */
  initialConfig?: ThemeConfig;
}

/**
 * 创建主题上下文
 *
 * @param options 配置选项
 * @returns { themeContext, install }
 *
 * @example
 * ```ts
 * // main.ts
 * import { createApp } from 'vue';
 * import { createTheme } from '@aix/theme';
 * import '@aix/theme/vars';
 *
 * const app = createApp(App);
 *
 * const { install } = createTheme({
 *   initialMode: 'light',
 *   persist: true,
 *   watchSystem: false,
 * });
 *
 * app.use({ install });
 * app.mount('#app');
 * ```
 */
export function createTheme(options?: CreateThemeOptions) {
  const {
    initialMode = 'light',
    persist = true,
    storageKey = 'aix-theme-mode',
    watchSystem = false,
    initialConfig,
  } = options || {};

  // 响应式状态（核心）
  const state = reactive<{
    mode: ThemeMode;
    config: ThemeConfig;
  }>({
    mode: initialMode,
    config: initialConfig || {
      token: {},
      algorithm: initialMode === 'dark' ? 'dark' : 'default',
      components: {},
      transition: {
        duration: 200,
        easing: 'ease-in-out',
        enabled: true,
      },
    },
  });

  /**
   * 持久化到 localStorage
   */
  const saveToStorage = (mode: ThemeMode) => {
    if (!persist || typeof window === 'undefined') return;

    try {
      localStorage.setItem(storageKey, mode);
    } catch (e) {
      console.warn('[ThemeContext] 保存主题失败:', e);
    }
  };

  /**
   * 从 localStorage 恢复
   */
  const loadFromStorage = (): ThemeMode | null => {
    if (!persist || typeof window === 'undefined') return null;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch (e) {
      console.warn('[ThemeContext] 读取主题失败:', e);
    }
    return null;
  };

  /**
   * 触发主题变化事件
   */
  const dispatchChangeEvent = () => {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(
      new CustomEvent('aix-theme-change', {
        detail: {
          mode: state.mode,
          config: state.config,
        },
      }),
    );
  };

  /**
   * 设置主题模式
   */
  const setMode = (newMode: ThemeMode) => {
    state.mode = newMode;

    // 计算新算法（保留 compact 状态）
    const newAlgorithm = calculateAlgorithm(newMode, state.config.algorithm);

    state.config = {
      ...state.config,
      algorithm: newAlgorithm,
    };

    // 应用到 DOM（通过 ThemeController）
    themeController.setMode(newMode, false); // false = 不自动持久化

    // 持久化
    saveToStorage(newMode);

    // 触发事件
    dispatchChangeEvent();
  };

  /**
   * 切换主题模式
   */
  const toggleMode = (): ThemeMode => {
    const newMode = state.mode === 'light' ? 'dark' : 'light';
    setMode(newMode);
    return newMode;
  };

  /**
   * 应用主题配置
   */
  const applyTheme = (config: ThemeConfig) => {
    state.config = { ...config };

    // 同步 mode（dark 和 dark-compact 都算暗色模式）
    const algorithm = config.algorithm || 'default';
    if (algorithm === 'dark' || algorithm === 'dark-compact') {
      state.mode = 'dark';
    } else {
      state.mode = 'light';
    }

    // 应用到 DOM
    themeController.applyTheme(config);

    // 触发事件
    dispatchChangeEvent();
  };

  /**
   * 设置单个 Token
   */
  const setToken = (key: keyof PartialThemeTokens, value: string | number) => {
    state.config = {
      ...state.config,
      token: {
        ...state.config.token,
        [key]: value,
      },
    };

    themeController.setToken(key, value);
    dispatchChangeEvent();
  };

  /**
   * 批量设置 Token
   */
  const setTokens = (tokens: PartialThemeTokens) => {
    state.config = {
      ...state.config,
      token: {
        ...state.config.token,
        ...tokens,
      },
    };

    themeController.setTokens(tokens);
    dispatchChangeEvent();
  };

  /**
   * 应用预设主题
   */
  const applyPreset = (name: string) => {
    // 获取预设配置
    const presets = themeController.getPresets();
    const preset = presets.find((p) => p.name === name);

    if (!preset) {
      console.warn(`[ThemeContext] Preset "${name}" not found`);
      return;
    }

    // 应用预设到 DOM
    themeController.applyPreset(name);

    // 同步状态：mode 和 config.token
    state.mode = themeController.getMode();
    state.config = {
      ...state.config,
      token: {
        ...state.config.token,
        ...preset.token,
      },
    };

    dispatchChangeEvent();
  };

  /**
   * 注册自定义预设
   */
  const registerPreset = (preset: ThemePreset) => {
    themeController.registerPreset(preset);
  };

  /**
   * 获取所有预设
   */
  const getPresets = (): ThemePreset[] => {
    return themeController.getPresets();
  };

  /**
   * 重置为默认主题
   */
  const reset = () => {
    themeController.reset();

    // 重置状态
    state.mode = 'light';
    state.config = {
      token: {},
      algorithm: 'default',
      components: {},
      transition: {
        duration: 200,
        easing: 'ease-in-out',
        enabled: true,
      },
    };

    // 清除持久化
    if (persist && typeof window !== 'undefined') {
      try {
        localStorage.removeItem(storageKey);
      } catch (e) {
        console.warn('[ThemeContext] 清除主题失败:', e);
      }
    }

    dispatchChangeEvent();
  };

  /**
   * 设置过渡配置
   */
  const setTransition = (config: TransitionConfig) => {
    state.config = {
      ...state.config,
      transition: {
        ...state.config.transition,
        ...config,
      },
    };

    themeController.setTransition(config);
  };

  /**
   * 获取过渡配置
   */
  const getTransition = (): Required<TransitionConfig> => {
    return themeController.getTransition();
  };

  /**
   * 获取所有当前 Token
   */
  const getTokens = (): ThemeTokens => {
    return themeController.getTokens();
  };

  /**
   * 获取单个 Token 值
   */
  const getToken = <K extends keyof ThemeTokens>(key: K): ThemeTokens[K] => {
    return themeController.getToken(key);
  };

  // 使用 computed 确保响应性
  const modeRef = computed(() => state.mode);
  const configRef = computed(() => state.config);

  // 存储清理函数
  let cleanupFn: (() => void) | null = null;

  /**
   * Context 对象（使用 getter 确保最新值）
   */
  const themeContext: ThemeContext = {
    get mode() {
      return modeRef.value;
    },
    get config() {
      return configRef.value;
    },
    setMode,
    toggleMode,
    applyTheme,
    setToken,
    setTokens,
    getToken,
    getTokens,
    applyPreset,
    registerPreset,
    getPresets,
    reset,
    setTransition,
    getTransition,
  };

  return {
    themeContext,
    /**
     * Vue 插件安装函数
     */
    install(app: App) {
      // 1. Provide 主题 Context
      app.provide(THEME_INJECTION_KEY, themeContext);

      // 2. 添加全局属性（方便模板访问）
      app.config.globalProperties.$theme = themeContext;

      // 3. 仅在客户端恢复主题和监听系统主题
      if (typeof window !== 'undefined') {
        // 恢复主题
        const savedMode = loadFromStorage();
        if (savedMode) {
          setMode(savedMode);
        } else {
          // 初始化应用主题（即使没有保存的值）
          setMode(state.mode);
        }

        // 监听系统主题（如果启用）
        if (watchSystem) {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

          const handler = (e: MediaQueryListEvent | MediaQueryList) => {
            setMode(e.matches ? 'dark' : 'light');
          };

          // 初始同步
          handler(mediaQuery);

          // 监听变化
          mediaQuery.addEventListener('change', handler);

          // 保存清理函数
          cleanupFn = () => {
            mediaQuery.removeEventListener('change', handler);
          };
        }
      }
    },
    /**
     * 清理函数 - 移除事件监听器
     * 在应用卸载或不再需要主题系统时调用
     */
    dispose() {
      if (cleanupFn) {
        cleanupFn();
        cleanupFn = null;
      }
    },
  };
}
