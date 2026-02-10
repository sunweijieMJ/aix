/**
 * CSS 变量引用工具
 * 提供类型安全的 CSS 变量名访问
 */

import type { ThemeTokens } from '../theme-types';

/**
 * CSS 变量引用类型
 * 将 Token 键映射为 var(--tokenName) 格式
 */
export type CSSVarRefs = {
  readonly [K in keyof ThemeTokens]: `var(--${K})`;
};

/**
 * CSS 变量名类型（不带 var() 包装）
 */
export type CSSVarNames = {
  readonly [K in keyof ThemeTokens]: `--${K}`;
};

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
 * 获取单个 Token 的 CSS 变量引用
 *
 * @example
 * ```ts
 * getCSSVar('colorPrimary') // => "var(--colorPrimary)"
 * getCSSVar('fontSize', '14px') // => "var(--fontSize, 14px)"
 * ```
 */
export function getCSSVar<K extends keyof ThemeTokens>(
  key: K,
  fallback?: string,
): string {
  return fallback ? `var(--${key}, ${fallback})` : `var(--${key})`;
}

/**
 * 获取单个 Token 的 CSS 变量名（不带 var() 包装）
 *
 * @example
 * ```ts
 * getCSSVarName('colorPrimary') // => "--colorPrimary"
 * ```
 */
export function getCSSVarName<K extends keyof ThemeTokens>(key: K): `--${K}` {
  return `--${key}`;
}

/**
 * 批量获取 CSS 变量引用
 * @internal 仅用于测试，不作为公共 API
 */
export function _getCSSVarsForTesting<K extends keyof ThemeTokens>(
  keys: readonly K[],
): Pick<CSSVarRefs, K> {
  const result = {} as Pick<CSSVarRefs, K>;
  for (const key of keys) {
    (result as Record<K, string>)[key] = `var(--${key})`;
  }
  return result;
}

/**
 * 默认导出的 CSS 变量引用
 * 可直接使用，无需调用函数
 *
 * @example
 * ```ts
 * import { cssVar } from '@aix/theme';
 *
 * const styles = {
 *   color: cssVar.colorPrimary,
 *   background: cssVar.colorBgContainer,
 * };
 * ```
 */
export const cssVar: CSSVarRefs = createCSSVarProxy<CSSVarRefs>(
  (key) => `var(--${key})`,
);

/**
 * CSS 变量名（不带 var() 包装）
 *
 * @example
 * ```ts
 * import { cssVarName } from '@aix/theme';
 *
 * element.style.setProperty(cssVarName.colorPrimary, '#ff0000');
 * ```
 */
export const cssVarName: CSSVarNames = createCSSVarProxy<CSSVarNames>(
  (key) => `--${key}`,
);
