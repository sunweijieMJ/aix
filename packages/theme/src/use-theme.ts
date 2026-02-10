/**
 * Vue Composition API for Theme Management
 * 基于 ThemeContext 的响应式主题管理（推荐使用）
 */

import { computed, type Ref } from 'vue';
import type {
  PartialThemeTokens,
  ThemeConfig,
  ThemeMode,
  ThemePreset,
  TransitionConfig,
} from './theme-types';
import { useThemeContext } from './use-theme-context';

/**
 * useTheme 返回值接口
 */
export interface UseThemeReturn {
  /** 当前主题模式（响应式 Ref，可安全解构） */
  mode: Ref<ThemeMode>;
  /** 当前主题配置（响应式 Ref，可安全解构） */
  config: Ref<ThemeConfig>;
  /** 设置主题模式 */
  setMode: (mode: ThemeMode) => void;
  /** 切换主题模式（亮色/暗色） */
  toggleMode: () => ThemeMode;
  /** 应用完整主题配置 */
  applyTheme: (config: ThemeConfig) => void;
  /** 设置单个Token */
  setToken: (key: keyof PartialThemeTokens, value: string | number) => void;
  /** 批量设置Token */
  setTokens: (tokens: PartialThemeTokens) => void;
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
 * Vue Composition API - 主题管理（推荐）
 *
 * 返回响应式 Ref，支持解构后保持响应式。
 * 这是大多数场景下的推荐用法。
 *
 * 与 useThemeContext 的区别：
 * - useTheme: 返回 Ref<T>，解构后保持响应式 ✅
 * - useThemeContext: 返回 getter，解构后丢失响应式 ⚠️
 *
 * @returns 主题管理对象（mode/config 为响应式 Ref）
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useTheme } from '@aix/theme';
 *
 * // ✅ 可以安全解构，mode 仍然是响应式的
 * const { mode, toggleMode, applyPreset } = useTheme();
 *
 * // ✅ watch 可以正常工作
 * watch(mode, (newMode) => {
 *   console.log('主题变化:', newMode);
 * });
 * </script>
 *
 * <template>
 *   <div>
 *     <p>当前模式: {{ mode }}</p>
 *     <button @click="toggleMode">切换主题</button>
 *     <button @click="applyPreset('tech')">科技蓝</button>
 *   </div>
 * </template>
 * ```
 */
export function useTheme(): UseThemeReturn {
  // 获取 ThemeContext
  const context = useThemeContext();

  // 将 Context 属性包装为 computed，确保响应性
  const mode = computed(() => context.mode);
  const config = computed(() => context.config);

  return {
    mode,
    config,
    setMode: context.setMode,
    toggleMode: context.toggleMode,
    applyTheme: context.applyTheme,
    setToken: context.setToken,
    setTokens: context.setTokens,
    applyPreset: context.applyPreset,
    registerPreset: context.registerPreset,
    getPresets: context.getPresets,
    reset: context.reset,
    setTransition: context.setTransition,
    getTransition: context.getTransition,
  };
}
