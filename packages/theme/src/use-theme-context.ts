/**
 * useThemeContext - 使用主题上下文的 Composition API
 */

import { inject } from 'vue';
import { THEME_INJECTION_KEY, type ThemeContext } from './theme-context';

/**
 * 使用主题 Context
 * 必须在提供了 ThemeContext 的组件树中使用
 *
 * @throws {Error} 如果未找到 ThemeContext
 * @returns ThemeContext 对象
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useThemeContext } from '@aix/theme';
 *
 * const { mode, setMode, toggleMode, applyPreset } = useThemeContext();
 * </script>
 *
 * <template>
 *   <div>
 *     <p>当前主题: {{ mode }}</p>
 *     <button @click="toggleMode">切换主题</button>
 *     <button @click="applyPreset('tech')">科技蓝</button>
 *   </div>
 * </template>
 * ```
 */
export function useThemeContext(): ThemeContext {
  const context = inject(THEME_INJECTION_KEY);

  if (!context) {
    throw new Error(
      '[useThemeContext] 必须在提供了 ThemeContext 的组件树中使用。\n' +
        '请在应用根组件中调用:\n\n' +
        "import { createTheme } from '@aix/theme';\n" +
        'const { install } = createTheme();\n' +
        'app.use({ install });',
    );
  }

  return context;
}

/**
 * 可选的主题 Context（不抛出错误）
 * 适用于库组件，可能在没有 Context 的环境中使用
 *
 * @returns ThemeContext 对象或 undefined
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useThemeContextOptional } from '@aix/theme';
 *
 * const themeContext = useThemeContextOptional();
 *
 * // 安全使用
 * if (themeContext) {
 *   const { mode, toggleMode } = themeContext;
 * }
 * </script>
 * ```
 */
export function useThemeContextOptional(): ThemeContext | undefined {
  return inject(THEME_INJECTION_KEY, undefined);
}
