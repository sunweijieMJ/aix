/**
 * CSS 变量引用工具
 * 提供类型安全的 CSS 变量名访问
 */

import type { ThemeTokens } from '../theme-types';

/**
 * 默认 CSS 变量前缀
 */
export const CSS_VAR_PREFIX = 'aix';

/**
 * 带自定义前缀的 CSS 变量引用类型
 * 将 Token 键映射为 var(--prefix-tokenName) 格式
 */
export type CSSVarRefsWithPrefix<P extends string> = {
  readonly [K in keyof ThemeTokens]: `var(--${P}-${K})`;
};

/**
 * CSS 变量引用类型（默认 'aix' 前缀）
 */
export type CSSVarRefs = CSSVarRefsWithPrefix<typeof CSS_VAR_PREFIX>;

/**
 * 带自定义前缀的 CSS 变量名类型（不带 var() 包装）
 */
export type CSSVarNamesWithPrefix<P extends string> = {
  readonly [K in keyof ThemeTokens]: `--${P}-${K}`;
};

/**
 * CSS 变量名类型（默认 'aix' 前缀，不带 var() 包装）
 */
export type CSSVarNames = CSSVarNamesWithPrefix<typeof CSS_VAR_PREFIX>;

/**
 * 创建 CSS 变量代理的通用工厂函数
 * @internal 内部使用
 */
function createCSSVarProxy<T extends object>(
  formatter: (key: string) => string,
): T {
  return new Proxy({} as T, {
    get(_, key: string | symbol): string | undefined {
      // 忽略 Symbol 键（如 Symbol.toStringTag、Symbol.iterator 等）
      if (typeof key === 'symbol') {
        return undefined;
      }
      return formatter(key);
    },
  }) as T;
}

/**
 * 创建带自定义前缀的 CSS 变量引用
 *
 * @example
 * ```ts
 * const myVar = createCSSVarRefs('my-app');
 * myVar.colorPrimary // => "var(--my-app-colorPrimary)"
 * ```
 */
export function createCSSVarRefs<P extends string = typeof CSS_VAR_PREFIX>(
  prefix?: P,
): CSSVarRefsWithPrefix<P> {
  const p = prefix ?? (CSS_VAR_PREFIX as P);
  return createCSSVarProxy<CSSVarRefsWithPrefix<P>>(
    (key) => `var(--${p}-${key})`,
  );
}

/**
 * 创建带自定义前缀的 CSS 变量名
 *
 * @example
 * ```ts
 * const myVarName = createCSSVarNames('my-app');
 * myVarName.colorPrimary // => "--my-app-colorPrimary"
 * ```
 */
export function createCSSVarNames<P extends string = typeof CSS_VAR_PREFIX>(
  prefix?: P,
): CSSVarNamesWithPrefix<P> {
  const p = prefix ?? (CSS_VAR_PREFIX as P);
  return createCSSVarProxy<CSSVarNamesWithPrefix<P>>((key) => `--${p}-${key}`);
}

/**
 * 获取单个 Token 的 CSS 变量引用
 *
 * @example
 * ```ts
 * getCSSVar('colorPrimary') // => "var(--aix-colorPrimary)"
 * getCSSVar('fontSize', '14px') // => "var(--aix-fontSize, 14px)"
 * ```
 */
export function getCSSVar<K extends keyof ThemeTokens>(
  key: K,
  fallback?: string,
  prefix: string = CSS_VAR_PREFIX,
): string {
  return fallback
    ? `var(--${prefix}-${key}, ${fallback})`
    : `var(--${prefix}-${key})`;
}

/**
 * 获取单个 Token 的 CSS 变量名（不带 var() 包装）
 *
 * @example
 * ```ts
 * getCSSVarName('colorPrimary') // => "--aix-colorPrimary"
 * ```
 */
export function getCSSVarName<K extends keyof ThemeTokens>(
  key: K,
  prefix: string = CSS_VAR_PREFIX,
): string {
  return `--${prefix}-${key}`;
}

/**
 * 默认 CSS 变量引用（使用 'aix' 前缀）
 *
 * @example
 * ```ts
 * import { cssVar } from '@aix/theme';
 *
 * const styles = {
 *   color: cssVar.colorPrimary,        // => "var(--aix-colorPrimary)"
 *   background: cssVar.colorBgContainer, // => "var(--aix-colorBgContainer)"
 * };
 * ```
 */
export const cssVar: CSSVarRefs = createCSSVarRefs();

/**
 * 默认 CSS 变量名（使用 'aix' 前缀，不带 var() 包装）
 *
 * @example
 * ```ts
 * import { cssVarName } from '@aix/theme';
 *
 * element.style.setProperty(cssVarName.colorPrimary, '#ff0000');
 * // => setProperty('--aix-colorPrimary', '#ff0000')
 * ```
 */
export const cssVarName: CSSVarNames = createCSSVarNames();
