/**
 * Vue Composition API for Theme Management
 * 基于 ThemeContext 的响应式主题管理
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
  /** 当前主题模式（响应式） */
  mode: Ref<ThemeMode>;
  /** 当前主题配置（响应式） */
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
 * Vue Composition API - 主题管理
 * 基于 ThemeContext 的包装，提供响应式的 Ref 返回值
 *
 * 注意：此函数必须在提供了 ThemeContext 的组件树中使用
 * 确保在应用根部调用了 app.use(createTheme().install)
 *
 * @returns 主题管理对象（所有属性为响应式 Ref）
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useTheme } from '@aix/theme';
 *
 * const { mode, toggleMode, applyPreset } = useTheme();
 * </script>
 *
 * <template>
 *   <div>
 *     <p>Current mode: {{ mode }}</p>
 *     <button @click="toggleMode">Toggle Theme</button>
 *     <button @click="applyPreset('tech')">Tech Theme</button>
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
