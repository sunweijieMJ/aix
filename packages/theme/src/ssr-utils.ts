/**
 * SSR Compatibility Utilities
 * 服务端渲染兼容性工具函数
 */

/**
 * 检查是否在浏览器环境
 */
export const isBrowser = (): boolean => {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
};

/**
 * 检查是否支持 localStorage
 */
export const hasLocalStorage = (): boolean => {
  if (!isBrowser()) return false;

  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
};

/**
 * 检查是否支持 matchMedia
 */
export const hasMatchMedia = (): boolean => {
  return isBrowser() && typeof window.matchMedia === 'function';
};

/**
 * 安全地获取 localStorage 值
 */
export const safeGetLocalStorage = (key: string): string | null => {
  if (!hasLocalStorage()) return null;

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * 安全地设置 localStorage 值
 */
export const safeSetLocalStorage = (key: string, value: string): boolean => {
  if (!hasLocalStorage()) return false;

  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

/**
 * 获取系统主题偏好（支持SSR）
 */
export const getSystemThemePreference = (): 'light' | 'dark' | null => {
  if (!hasMatchMedia()) return null;

  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return null;
  }
};

/**
 * 安全地派发事件
 */
export const safeDispatchEvent = (event: Event): boolean => {
  if (!isBrowser()) return false;

  try {
    window.dispatchEvent(event);
    return true;
  } catch {
    return false;
  }
};

/**
 * 创建 SSR 安全的 DOM 引用
 */
export const getDocumentRoot = (): HTMLElement | null => {
  if (!isBrowser()) return null;
  return document.documentElement;
};

/**
 * SSR 初始化脚本生成器
 * 用于在 HTML 中注入主题初始化脚本，避免闪烁
 *
 * @param storageKey localStorage 的 key
 * @param defaultMode 默认主题模式
 * @returns HTML script 标签内容
 *
 * @example
 * ```html
 * <!DOCTYPE html>
 * <html>
 * <head>
 *   <script>
 *     ${generateSSRInitScript('aix-theme-mode', 'light')}
 *   </script>
 * </head>
 * ```
 */
export function generateSSRInitScript(
  storageKey: string = 'aix-theme-mode',
  defaultMode: 'light' | 'dark' = 'light',
): string {
  return `
(function() {
  try {
    var stored = localStorage.getItem('${storageKey}');
    var mode = stored === 'dark' || stored === 'light' ? stored : '${defaultMode}';
    document.documentElement.setAttribute('data-theme', mode);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', '${defaultMode}');
  }
})();
`.trim();
}

/**
 * 生成用于 SSR 的内联样式标签
 * 防止主题切换时的闪烁
 *
 * @param mode 主题模式
 * @returns style 标签内容
 */
export function generateSSRStyleTag(mode: 'light' | 'dark' = 'light'): string {
  return `<style id="aix-theme-ssr">:root{color-scheme:${mode}}</style>`;
}

/**
 * Nuxt 3 插件模板
 *
 * @example
 * ```ts
 * // plugins/theme.client.ts
 * import { themeController } from '@aix/theme';
 * import { getNuxtThemePlugin } from '@aix/theme/ssr-utils';
 *
 * export default getNuxtThemePlugin();
 * ```
 */
export function getNuxtThemePlugin() {
  return {
    name: 'aix-theme',
    setup() {
      // Nuxt 会自动在客户端执行
      // 主题控制器会自动恢复用户偏好
    },
  };
}

/**
 * Next.js App Router 兼容性辅助
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { generateSSRInitScript } from '@aix/theme/ssr-utils';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <head>
 *         <script dangerouslySetInnerHTML={{
 *           __html: generateSSRInitScript()
 *         }} />
 *       </head>
 *       <body>{children}</body>
 *     </html>
 *   );
 * }
 * ```
 */
export const NextAppRouterHelper = {
  generateInitScript: generateSSRInitScript,
  generateStyleTag: generateSSRStyleTag,
};
