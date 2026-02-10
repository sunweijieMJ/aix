/**
 * useThemeContext - 获取原始主题上下文对象
 *
 * 适用场景：
 * - 需要传递完整 context 给子组件
 * - 在非响应式上下文中使用（如事件处理器内部）
 *
 * 如果只需要响应式的 mode/config，推荐使用 useTheme()
 */

import { inject } from 'vue';
import { THEME_INJECTION_KEY, type ThemeContext } from './theme-context';

/**
 * 使用主题 Context（底层 API）
 *
 * 注意：mode 和 config 属性通过 getter 实现响应式，
 * 解构后会丢失响应式，请使用 useTheme() 获取 Ref 包装的版本。
 *
 * @throws {Error} 如果未找到 ThemeContext
 * @returns ThemeContext 对象
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useThemeContext } from '@aix/theme';
 *
 * // ⚠️ 注意：不要解构 mode/config，会丢失响应式
 * const themeContext = useThemeContext();
 *
 * // ✅ 正确用法：通过 context 访问
 * const handleClick = () => {
 *   console.log(themeContext.mode); // 始终是最新值
 * };
 * </script>
 *
 * <template>
 *   <div>
 *     <p>当前主题: {{ themeContext.mode }}</p>
 *     <button @click="themeContext.toggleMode()">切换主题</button>
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
