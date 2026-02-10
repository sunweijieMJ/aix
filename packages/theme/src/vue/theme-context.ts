/**
 * 主题上下文 - Vue Context API
 * 提供响应式主题管理能力
 *
 * 这是主题系统的状态所有者，负责：
 * - 响应式状态管理
 * - localStorage 持久化
 * - 系统主题跟随
 * - 预设管理
 */

import { type App, computed, type InjectionKey, reactive } from 'vue';
import {
  createThemeDOMRenderer,
  type ThemeDOMRenderer,
} from '../core/theme-dom-renderer';
import { generateThemeTokens } from '../core/define-theme';
import { validateThemeConfig } from '../utils/theme-validator';
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
  /** 检查预设是否存在 */
  hasPreset: (name: string) => boolean;
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
 * 内置预设主题
 */
const DEFAULT_PRESETS: readonly ThemePreset[] = [
  {
    name: 'default',
    displayName: '默认主题',
    token: {},
  },
  {
    name: 'tech',
    displayName: '科技蓝',
    token: {
      tokenBlue6: 'rgb(0 102 255)',
      colorPrimary: 'rgb(0 102 255)',
    },
  },
  {
    name: 'nature',
    displayName: '自然绿',
    token: {
      tokenGreen6: 'rgb(82 196 26)',
      colorPrimary: 'rgb(82 196 26)',
    },
  },
  {
    name: 'sunset',
    displayName: '日落橙',
    token: {
      tokenOrange6: 'rgb(250 140 22)',
      colorPrimary: 'rgb(250 140 22)',
    },
  },
  {
    name: 'purple',
    displayName: '优雅紫',
    token: {
      tokenPurple6: 'rgb(114 46 209)',
      colorPrimary: 'rgb(114 46 209)',
    },
  },
] as const;

/**
 * 默认过渡配置
 */
const DEFAULT_TRANSITION: Required<TransitionConfig> = {
  duration: 200,
  easing: 'ease-in-out',
  enabled: true,
};

/**
 * 内部使用的完整配置类型（所有属性都是必需的）
 */
interface InternalThemeConfig {
  token: PartialThemeTokens;
  algorithm: NonNullable<ThemeConfig['algorithm']>;
  transition: Required<TransitionConfig>;
}

/**
 * 根据主题模式和当前算法计算新算法
 * 保留 compact 状态
 */
function calculateAlgorithm(
  mode: ThemeMode,
  currentAlgorithm: ThemeConfig['algorithm'] = 'default',
): NonNullable<ThemeConfig['algorithm']> {
  const isCompact =
    currentAlgorithm === 'compact' || currentAlgorithm === 'dark-compact';

  if (mode === 'dark') {
    return isCompact ? 'dark-compact' : 'dark';
  }
  return isCompact ? 'compact' : 'default';
}

/**
 * 创建主题上下文
 *
 * @param options 配置选项
 * @returns { themeContext, install, dispose }
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

  // DOM 渲染器（无状态）
  const renderer: ThemeDOMRenderer = createThemeDOMRenderer();

  // 预设列表（实例级别）
  const presets = new Map<string, ThemePreset>();
  for (const preset of DEFAULT_PRESETS) {
    presets.set(preset.name, { ...preset, token: { ...preset.token } });
  }

  // ========== 唯一状态源 ==========
  const state = reactive<{
    mode: ThemeMode;
    config: InternalThemeConfig;
  }>({
    mode: initialMode,
    config: {
      token: initialConfig?.token || {},
      algorithm:
        initialConfig?.algorithm ||
        (initialMode === 'dark' ? 'dark' : 'default'),
      transition: {
        ...DEFAULT_TRANSITION,
        ...initialConfig?.transition,
      },
    },
  });

  // 缓存计算后的 tokens，避免重复计算
  const computedTokens = computed(() => generateThemeTokens(state.config));

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
   * 清除持久化存储
   */
  const clearStorage = () => {
    if (!persist || typeof window === 'undefined') return;

    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.warn('[ThemeContext] 清除主题失败:', e);
    }
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
   * 同步状态到 DOM
   */
  const syncToDOM = () => {
    renderer.setDataTheme(state.mode);
    renderer.applyTransition(state.config.transition);
    renderer.applyTokens(computedTokens.value);
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

    // 应用到 DOM
    renderer.setDataTheme(newMode);
    renderer.applyTokens(computedTokens.value);

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
  const applyTheme = (
    config: ThemeConfig,
    options?: { validate?: boolean },
  ) => {
    const { validate = true } = options || {};

    // 可选的配置验证
    if (validate) {
      const validationResult = validateThemeConfig(config);
      if (!validationResult.valid) {
        console.warn(
          '[ThemeContext] 主题配置验证失败:',
          validationResult.errors,
        );
      }
      if (validationResult.warnings.length > 0) {
        console.warn('[ThemeContext] 主题配置警告:', validationResult.warnings);
      }
    }

    // 同步 mode（dark 和 dark-compact 都算暗色模式）
    const algorithm = config.algorithm || 'default';
    const newMode =
      algorithm === 'dark' || algorithm === 'dark-compact' ? 'dark' : 'light';
    state.mode = newMode;

    // 更新配置（统一过渡配置存储）
    state.config = {
      token: config.token || {},
      algorithm,
      transition: {
        ...DEFAULT_TRANSITION,
        ...config.transition,
      },
    };

    // 应用到 DOM
    syncToDOM();

    // 持久化
    saveToStorage(newMode);

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

    renderer.applyTokens(computedTokens.value);
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

    renderer.applyTokens(computedTokens.value);
    dispatchChangeEvent();
  };

  /**
   * 应用预设主题
   * 注意：会完全替换当前的 token 配置，而非累积合并
   */
  const applyPreset = (name: string) => {
    const preset = presets.get(name);

    if (!preset) {
      console.warn(`[ThemeContext] Preset "${name}" not found`);
      return;
    }

    // 完全替换 token（不累积之前的配置）
    state.config = {
      ...state.config,
      token: { ...preset.token },
    };

    renderer.applyTokens(computedTokens.value);
    dispatchChangeEvent();
  };

  /**
   * 注册自定义预设
   */
  const registerPreset = (preset: ThemePreset) => {
    presets.set(preset.name, { ...preset, token: { ...preset.token } });
  };

  /**
   * 获取所有预设
   */
  const getPresets = (): ThemePreset[] => {
    return Array.from(presets.values());
  };

  /**
   * 检查预设是否存在
   */
  const hasPreset = (name: string): boolean => {
    return presets.has(name);
  };

  /**
   * 重置为默认主题
   */
  const reset = () => {
    // 重置 DOM
    renderer.reset();

    // 重置状态
    state.mode = 'light';
    state.config = {
      token: {},
      algorithm: 'default',
      transition: { ...DEFAULT_TRANSITION },
    };

    // 应用到 DOM
    syncToDOM();

    // 清除持久化
    clearStorage();

    // 触发事件
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

    renderer.applyTransition(state.config.transition);
    dispatchChangeEvent();
  };

  /**
   * 获取过渡配置
   */
  const getTransition = (): Required<TransitionConfig> => {
    return { ...state.config.transition };
  };

  /**
   * 获取所有当前 Token
   */
  const getTokens = (): ThemeTokens => {
    return computedTokens.value;
  };

  /**
   * 获取单个 Token 值
   */
  const getToken = <K extends keyof ThemeTokens>(key: K): ThemeTokens[K] => {
    return computedTokens.value[key];
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
    hasPreset,
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
        if (savedMode && savedMode !== state.mode) {
          // 仅当保存的模式与当前模式不同时才触发完整的状态变更
          setMode(savedMode);
        } else {
          // 初始化 DOM 状态，不触发事件和持久化（避免冗余操作）
          syncToDOM();
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
