/**
 * Vue Composition API - 主题管理
 * 推荐用法：返回响应式 Ref，支持解构后保持响应式
 */

import { computed, type Ref } from 'vue';
import { cssVar, type CSSVarRefs } from '../utils/css-var';
import type {
  PartialThemeTokens,
  ThemeConfig,
  ThemeMode,
  ThemePreset,
  ThemeTokens,
  TransitionConfig,
} from '../theme-types';
import { useThemeContext } from './use-theme-context';

/**
 * useTheme 返回值接口
 */
export interface UseThemeReturn {
  /** 当前主题模式（响应式 Ref） */
  mode: Ref<ThemeMode>;
  /** 当前主题配置（响应式 Ref） */
  config: Ref<ThemeConfig>;
  /**
   * CSS 变量引用映射
   * 提供类型安全的 CSS 变量名访问
   *
   * @example
   * ```ts
   * const { cssVar } = useTheme();
   * // 在样式中使用
   * const style = { color: cssVar.colorPrimary }; // => { color: "var(--colorPrimary)" }
   * ```
   */
  cssVar: CSSVarRefs;
  /** 设置主题模式 */
  setMode: (mode: ThemeMode) => void;
  /** 切换主题模式（亮色/暗色） */
  toggleMode: () => ThemeMode;
  /** 应用完整主题配置 */
  applyTheme: (config: ThemeConfig) => void;
  /** 设置单个 Token */
  setToken: (key: keyof PartialThemeTokens, value: string | number) => void;
  /** 批量设置 Token */
  setTokens: (tokens: PartialThemeTokens) => void;
  /** 获取单个 Token 值 */
  getToken: <K extends keyof ThemeTokens>(key: K) => ThemeTokens[K] | undefined;
  /** 获取所有当前 Token */
  getTokens: () => ThemeTokens;
  /** 应用预设主题 */
  applyPreset: (presetName: string) => void;
  /** 注册自定义预设 */
  registerPreset: (preset: ThemePreset) => void;
  /** 获取所有可用预设 */
  getPresets: () => ThemePreset[];
  /** 重置为默认主题 */
  reset: () => void;
  /** 设置过渡配置 */
  setTransition: (config: TransitionConfig) => void;
  /** 获取过渡配置 */
  getTransition: () => Required<TransitionConfig>;
}

/**
 * 主题管理 Hook（推荐）
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useTheme } from '@aix/theme';
 *
 * const { mode, toggleMode, getToken, cssVar } = useTheme();
 *
 * // 获取当前主题色值
 * const primaryColor = getToken('colorPrimary');
 *
 * // 使用 CSS 变量引用（用于动态样式）
 * const buttonStyle = {
 *   color: cssVar.colorPrimary,        // => "var(--colorPrimary)"
 *   background: cssVar.colorBgContainer, // => "var(--colorBgContainer)"
 * };
 * </script>
 *
 * <template>
 *   <button :style="buttonStyle" @click="toggleMode">
 *     当前: {{ mode }}
 *   </button>
 * </template>
 * ```
 */
export function useTheme(): UseThemeReturn {
  const context = useThemeContext();

  // 将 Context 属性包装为 computed，确保响应性
  const mode = computed(() => context.mode);
  const config = computed(() => context.config);

  return {
    mode,
    config,
    cssVar,
    setMode: context.setMode,
    toggleMode: context.toggleMode,
    applyTheme: context.applyTheme,
    setToken: context.setToken,
    setTokens: context.setTokens,
    getToken: context.getToken,
    getTokens: context.getTokens,
    applyPreset: context.applyPreset,
    registerPreset: context.registerPreset,
    getPresets: context.getPresets,
    reset: context.reset,
    setTransition: context.setTransition,
    getTransition: context.getTransition,
  };
}
