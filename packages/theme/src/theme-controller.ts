/**
 * 主题控制器 - 纯 DOM 操作层
 * 负责应用主题到 DOM，不包含状态管理
 * 状态管理由 ThemeContext 负责
 */

import {
  defineTheme,
  generateThemeTokens,
  tokensToCSSVars,
} from './define-theme';
import { getDocumentRoot } from './ssr-utils';
import type {
  PartialThemeTokens,
  ThemeConfig,
  ThemeMode,
  ThemePreset,
  TransitionConfig,
} from './theme-types';
import { validateThemeConfig } from './theme-validator';

/**
 * 预设主题
 */
export const builtInPresets: Record<string, ThemePreset> = {
  default: {
    name: 'default',
    displayName: '默认主题',
    token: {},
  },
  tech: {
    name: 'tech',
    displayName: '科技蓝',
    token: {
      tokenBlue6: 'rgb(0 102 255)',
      colorPrimary: 'rgb(0 102 255)',
    },
  },
  nature: {
    name: 'nature',
    displayName: '自然绿',
    token: {
      tokenGreen6: 'rgb(82 196 26)',
      colorPrimary: 'rgb(82 196 26)',
    },
  },
  sunset: {
    name: 'sunset',
    displayName: '日落橙',
    token: {
      tokenOrange6: 'rgb(250 140 22)',
      colorPrimary: 'rgb(250 140 22)',
    },
  },
  purple: {
    name: 'purple',
    displayName: '优雅紫',
    token: {
      colorPrimary: 'rgb(114 46 209)',
    },
  },
};

/**
 * 默认过渡配置
 */
const DEFAULT_TRANSITION: Required<TransitionConfig> = {
  duration: 200,
  easing: 'ease-in-out',
  enabled: true,
};

/**
 * 主题控制器类（纯 DOM 操作层）
 */
export class ThemeController {
  private root: HTMLElement;
  private currentMode: ThemeMode = 'light';
  private currentConfig: ThemeConfig;
  private pendingUpdates: Record<string, string> = {};
  private rafId: number | null = null;
  private transitionConfig: Required<TransitionConfig> = DEFAULT_TRANSITION;

  constructor() {
    // SSR 安全的 DOM 引用
    const rootElement = getDocumentRoot();
    this.root = rootElement || ({} as HTMLElement);
    this.currentConfig = defineTheme();
  }

  /**
   * 获取当前主题模式
   */
  getMode(): ThemeMode {
    return this.currentMode;
  }

  /**
   * 设置主题模式
   * @param mode 主题模式
   * @param _persist 保留参数以兼容调用，但不再使用
   */
  setMode(mode: ThemeMode, _persist = true): void {
    this.currentMode = mode;

    // SSR 安全：仅在浏览器环境更新 DOM
    if (this.root && this.root.setAttribute) {
      this.root.setAttribute('data-theme', mode);
    }

    // 更新配置
    this.currentConfig = defineTheme({
      ...this.currentConfig,
      algorithm: mode === 'dark' ? 'dark' : 'default',
    });

    // 应用主题
    this.applyTheme(this.currentConfig);
  }

  /**
   * 切换主题模式
   */
  toggleMode(): ThemeMode {
    const newMode = this.currentMode === 'light' ? 'dark' : 'light';
    this.setMode(newMode);
    return newMode;
  }

  /**
   * 应用主题配置（使用批处理优化性能）
   */
  applyTheme(config: ThemeConfig, options?: { validate?: boolean }): void {
    const { validate = true } = options || {};

    // 可选的配置验证
    if (validate) {
      const validationResult = validateThemeConfig(config);
      if (!validationResult.valid) {
        console.warn(
          '[ThemeController] 主题配置验证失败:',
          validationResult.errors,
        );
        // 可以选择继续应用或中断
        // 这里选择继续应用，但会在控制台警告
      }
    }

    this.currentConfig = config;

    // 更新过渡配置
    if (config.transition) {
      this.transitionConfig = {
        ...DEFAULT_TRANSITION,
        ...config.transition,
      };
    }

    // 应用过渡样式
    this.applyTransition();

    // 生成完整Token
    const tokens = generateThemeTokens(config);

    // 转换为CSS变量
    const cssVars = tokensToCSSVars(tokens);

    // 使用批处理更新CSS变量
    this.batchUpdateCSSVars(cssVars);
  }

  /**
   * 应用过渡动画样式
   */
  private applyTransition(): void {
    if (!this.root || !this.root.style) {
      return;
    }

    if (this.transitionConfig.enabled) {
      const { duration, easing } = this.transitionConfig;
      // 为颜色和背景色添加过渡效果
      this.root.style.transition = `
        background-color ${duration}ms ${easing},
        color ${duration}ms ${easing},
        border-color ${duration}ms ${easing}
      `.trim();
    } else {
      this.root.style.transition = '';
    }
  }

  /**
   * 设置过渡配置
   */
  setTransition(config: TransitionConfig): void {
    this.transitionConfig = {
      ...this.transitionConfig,
      ...config,
    };
    this.applyTransition();
  }

  /**
   * 获取当前过渡配置
   */
  getTransition(): Required<TransitionConfig> {
    return { ...this.transitionConfig };
  }

  /**
   * 批量更新CSS变量（使用requestAnimationFrame优化）
   */
  private batchUpdateCSSVars(vars: Record<string, string>): void {
    // SSR 安全：仅在浏览器环境批处理
    if (!this.root || !this.root.style) {
      return;
    }

    // 将待更新的变量合并到待处理队列
    Object.assign(this.pendingUpdates, vars);

    // 如果已有待处理的动画帧，取消它
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    // 使用requestAnimationFrame批量应用更新
    this.rafId = requestAnimationFrame(() => {
      this.flushCSSUpdates();
      this.rafId = null;
    });
  }

  /**
   * 立即应用所有待处理的CSS变量更新
   */
  private flushCSSUpdates(): void {
    if (!this.root || !this.root.style) {
      return;
    }

    // 批量应用所有待处理的更新
    Object.entries(this.pendingUpdates).forEach(([key, value]) => {
      this.root.style.setProperty(key, value);
    });

    // 清空待处理队列
    this.pendingUpdates = {};
  }

  /**
   * 设置单个Token
   */
  setToken(key: keyof PartialThemeTokens, value: string | number): void {
    const newConfig = {
      ...this.currentConfig,
      token: {
        ...this.currentConfig.token,
        [key]: value,
      },
    };

    this.applyTheme(newConfig);
  }

  /**
   * 批量设置Token
   */
  setTokens(
    tokens: PartialThemeTokens,
    options?: { validate?: boolean },
  ): void {
    const newConfig = {
      ...this.currentConfig,
      token: {
        ...this.currentConfig.token,
        ...tokens,
      },
    };

    this.applyTheme(newConfig, options);
  }

  /**
   * 应用预设主题
   */
  applyPreset(presetName: string): void {
    const preset = builtInPresets[presetName];
    if (!preset) {
      console.warn(`[ThemeController] Preset "${presetName}" not found`);
      return;
    }

    this.setTokens(preset.token);
  }

  /**
   * 注册自定义预设
   */
  registerPreset(preset: ThemePreset): void {
    builtInPresets[preset.name] = preset;
  }

  /**
   * 获取所有预设
   */
  getPresets(): ThemePreset[] {
    return Object.values(builtInPresets);
  }

  /**
   * 立即同步应用CSS变量（不使用批处理）
   * 适用于需要立即生效的场景
   */
  applyThemeSync(config: ThemeConfig): void {
    this.currentConfig = config;

    // 取消待处理的批处理
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // 清空待处理队列
    this.pendingUpdates = {};

    // 生成完整Token
    const tokens = generateThemeTokens(config);

    // 转换为CSS变量
    const cssVars = tokensToCSSVars(tokens);

    // 立即同步应用
    if (this.root && this.root.style) {
      Object.entries(cssVars).forEach(([key, value]) => {
        this.root.style.setProperty(key, value);
      });
    }
  }

  /**
   * 重置为默认主题
   */
  reset(): void {
    // 取消待处理的动画帧
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.pendingUpdates = {};
    this.currentConfig = defineTheme();
    this.setMode('light');
  }
}

/**
 * 默认主题控制器实例（单例）
 * 注意：推荐使用 createTheme 和 useThemeContext 而不是直接使用此单例
 * 此单例仅供内部使用
 */
export const themeController = new ThemeController();
