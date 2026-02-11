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
import {
  generateThemeTokens,
  generateAllComponentOverrides,
  darkAlgorithm,
  darkMixAlgorithm,
  normalizeAlgorithm,
} from '../core/define-theme';
import { defaultSeedTokens } from '../core/seed-derivation';
import { validateThemeConfig } from '../utils/theme-validator';
import { CSS_VAR_PREFIX } from '../utils/css-var';
import {
  isBrowser,
  safeGetLocalStorage,
  safeSetLocalStorage,
} from '../utils/ssr-utils';
import type {
  ComponentsConfig,
  ComponentThemeConfig,
  PartialThemeTokens,
  SeedTokens,
  ThemeAlgorithm,
  ThemeConfig,
  ThemeMode,
  ThemeTokens,
  TransitionConfig,
} from '../theme-types';

/**
 * 主题上下文接口
 */
export interface ThemeContext {
  /** CSS 变量前缀 */
  prefix: string;
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
  /** 重置为默认主题 */
  reset: () => void;
  /** 设置过渡配置 */
  setTransition: (config: TransitionConfig) => void;
  /** 获取过渡配置 */
  getTransition: () => Required<TransitionConfig>;
  /** 设置组件级主题覆写 */
  setComponentTheme: (name: string, config: ComponentThemeConfig) => void;
  /** 移除组件级主题覆写 */
  removeComponentTheme: (name: string) => void;
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
  /** CSS 变量前缀，默认 'aix'（生成 --aix-colorPrimary 等） */
  prefix?: string;
  /** CSS 选择器兼容模式，'where' 使用 :where() 包裹以降低特异性 */
  cssCompatibility?: 'normal' | 'where';
}

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
  seed: Partial<SeedTokens>;
  token: PartialThemeTokens;
  algorithm: ThemeAlgorithm[];
  transition: Required<TransitionConfig>;
  components: ComponentsConfig;
}

/**
 * 判断算法是否为暗色类算法
 */
function isDarkAlgorithm(algo: ThemeAlgorithm): boolean {
  return algo === darkAlgorithm || algo === darkMixAlgorithm;
}

/**
 * 检测算法数组中是否包含暗色算法
 */
function hasDarkAlgorithm(algos: ThemeAlgorithm[]): boolean {
  return algos.some(isDarkAlgorithm);
}

/**
 * 根据主题模式和当前算法计算新算法数组
 * setMode('dark') 在数组头部插入 darkAlgorithm（如果没有暗色算法）
 * setMode('light') 过滤掉暗色算法
 * 其他算法（compact、用户自定义）保持不变
 */
function calculateAlgorithmForMode(
  mode: ThemeMode,
  currentAlgorithms: ThemeAlgorithm[],
): ThemeAlgorithm[] {
  // 过滤掉暗色算法
  const withoutDark = currentAlgorithms.filter((a) => !isDarkAlgorithm(a));

  if (mode === 'dark') {
    return [darkAlgorithm, ...withoutDark];
  }
  return withoutDark;
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
    prefix: userPrefix,
    cssCompatibility = 'normal',
  } = options || {};

  // 解析实际前缀
  const resolvedPrefix = userPrefix || CSS_VAR_PREFIX;

  // DOM 渲染器（无状态）
  const renderer: ThemeDOMRenderer = createThemeDOMRenderer({
    prefix: resolvedPrefix,
    useWhere: cssCompatibility === 'where',
  });

  // ========== 唯一状态源 ==========
  const initialAlgos = normalizeAlgorithm(initialConfig?.algorithm);
  // 如果 initialMode 为 dark 且算法中没有暗色算法，自动添加 darkAlgorithm
  const resolvedInitialAlgos =
    initialMode === 'dark' && !initialAlgos.some(isDarkAlgorithm)
      ? [darkAlgorithm, ...initialAlgos]
      : initialAlgos;
  // 从算法推断初始 mode
  const resolvedInitialMode = hasDarkAlgorithm(resolvedInitialAlgos)
    ? 'dark'
    : initialMode;

  const state = reactive<{
    mode: ThemeMode;
    config: InternalThemeConfig;
  }>({
    mode: resolvedInitialMode,
    config: {
      seed: initialConfig?.seed || {},
      token: initialConfig?.token || {},
      algorithm: resolvedInitialAlgos,
      transition: {
        ...DEFAULT_TRANSITION,
        ...initialConfig?.transition,
      },
      components: initialConfig?.components || {},
    },
  });

  // 缓存计算后的 tokens，避免重复计算
  const computedTokens = computed(() => generateThemeTokens(state.config));

  // 缓存 CSS 基线 tokens，用于 diff 计算
  // 静态 CSS 只提供 light 和 dark 两套，compact 变化需要通过 JS 覆写注入
  const lightDefaults = generateThemeTokens({});
  const darkDefaults = generateThemeTokens({ algorithm: darkAlgorithm });

  /**
   * 获取当前模式对应的 CSS 基线 tokens
   * 与 CSS 基线做 diff，确保 compact 等算法变化能被检测并注入
   */
  const getDefaults = () => {
    return state.mode === 'dark' ? darkDefaults : lightDefaults;
  };

  /**
   * 计算当前 tokens 与默认值的差异，生成 CSS 变量覆写
   */
  const computeOverrides = (): Record<string, string> => {
    const defaults = getDefaults();
    const current = computedTokens.value;
    const overrides: Record<string, string> = {};

    for (const key of Object.keys(current) as Array<keyof typeof current>) {
      if (String(current[key]) !== String(defaults[key])) {
        const value = current[key];
        overrides[`--${resolvedPrefix}-${key}`] =
          typeof value === 'number' ? String(value) : value;
      }
    }

    return overrides;
  };

  /**
   * 持久化到 localStorage
   */
  const saveToStorage = (mode: ThemeMode) => {
    if (!persist) return;
    safeSetLocalStorage(storageKey, mode);
  };

  /**
   * 从 localStorage 恢复
   */
  const loadFromStorage = (): ThemeMode | null => {
    if (!persist) return null;
    const saved = safeGetLocalStorage(storageKey);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    return null;
  };

  /**
   * 清除持久化存储
   */
  const clearStorage = () => {
    if (!persist || !isBrowser()) return;

    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  };

  /**
   * 触发主题变化事件
   */
  const dispatchChangeEvent = () => {
    if (!isBrowser()) return;

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
    renderer.applyOverrides(state.mode, computeOverrides());

    // 组件级覆写
    if (Object.keys(state.config.components).length > 0) {
      const resolvedSeed = { ...defaultSeedTokens, ...state.config.seed };
      const componentOverrides = generateAllComponentOverrides(
        state.config.components,
        computedTokens.value,
        resolvedSeed,
        state.config.algorithm,
      );
      renderer.applyComponentOverrides(componentOverrides);
    } else {
      renderer.clearComponentOverrides();
    }
  };

  /**
   * 设置主题模式
   */
  const setMode = (newMode: ThemeMode) => {
    state.mode = newMode;

    // 计算新算法（保留 compact 等非 dark 算法）
    const newAlgorithm = calculateAlgorithmForMode(
      newMode,
      state.config.algorithm,
    );

    state.config = {
      ...state.config,
      algorithm: newAlgorithm,
    };

    // 应用到 DOM
    syncToDOM();

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
    // 配置验证
    const validationResult = validateThemeConfig(config);
    if (!validationResult.valid) {
      console.warn('[ThemeContext] 主题配置验证失败:', validationResult.errors);
    }
    if (validationResult.warnings.length > 0) {
      console.warn('[ThemeContext] 主题配置警告:', validationResult.warnings);
    }

    // 规范化算法并同步 mode
    const algos = normalizeAlgorithm(config.algorithm);
    const newMode = hasDarkAlgorithm(algos) ? 'dark' : 'light';
    state.mode = newMode;

    // 更新配置（统一过渡配置存储）
    state.config = {
      seed: config.seed || {},
      token: config.token || {},
      algorithm: algos,
      transition: {
        ...DEFAULT_TRANSITION,
        ...config.transition,
      },
      components: config.components || {},
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

    syncToDOM();
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

    syncToDOM();
    dispatchChangeEvent();
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
      seed: {},
      token: {},
      algorithm: [],
      transition: { ...DEFAULT_TRANSITION },
      components: {},
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
   * 设置组件级主题覆写
   */
  const setComponentTheme = (name: string, config: ComponentThemeConfig) => {
    state.config = {
      ...state.config,
      components: {
        ...state.config.components,
        [name]: config,
      },
    };
    syncToDOM();
    dispatchChangeEvent();
  };

  /**
   * 移除组件级主题覆写
   */
  const removeComponentTheme = (name: string) => {
    const { [name]: _, ...rest } = state.config.components;
    state.config = {
      ...state.config,
      components: rest,
    };
    syncToDOM();
    dispatchChangeEvent();
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
    prefix: resolvedPrefix,
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
    reset,
    setTransition,
    getTransition,
    setComponentTheme,
    removeComponentTheme,
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
      if (isBrowser()) {
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

          // 仅在没有用户持久化偏好时，才用系统偏好做初始同步
          if (!savedMode) {
            handler(mediaQuery);
          }

          // 监听后续变化
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
