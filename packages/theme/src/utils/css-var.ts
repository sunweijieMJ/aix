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
 * 创建 CSS 变量引用代理
 * 使用 Proxy 实现按需生成，避免预生成所有变量
 *
 * @example
 * ```ts
 * const cssVar = createCSSVarRefs();
 * cssVar.colorPrimary // => "var(--colorPrimary)"
 * cssVar.fontSize     // => "var(--fontSize)"
 * ```
 */
export function createCSSVarRefs(): CSSVarRefs {
  return new Proxy({} as CSSVarRefs, {
    get(_, key: string | symbol): string | undefined {
      // 忽略 Symbol 键（如 Symbol.toStringTag、Symbol.iterator 等）
      if (typeof key === 'symbol') {
        return undefined;
      }
      return `var(--${key})`;
    },
  });
}

/**
 * 创建 CSS 变量名代理（不带 var() 包装）
 *
 * @example
 * ```ts
 * const varNames = createCSSVarNames();
 * varNames.colorPrimary // => "--colorPrimary"
 * ```
 */
export function createCSSVarNames(): CSSVarNames {
  return new Proxy({} as CSSVarNames, {
    get(_, key: string | symbol): string | undefined {
      // 忽略 Symbol 键
      if (typeof key === 'symbol') {
        return undefined;
      }
      return `--${key}`;
    },
  });
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
 *
 * @example
 * ```ts
 * getCSSVars(['colorPrimary', 'colorSuccess'])
 * // => { colorPrimary: "var(--colorPrimary)", colorSuccess: "var(--colorSuccess)" }
 * ```
 */
export function getCSSVars<K extends keyof ThemeTokens>(
  keys: readonly K[],
): Pick<CSSVarRefs, K> {
  const result = {} as Pick<CSSVarRefs, K>;
  for (const key of keys) {
    (result as Record<K, string>)[key] = `var(--${key})`;
  }
  return result;
}

/**
 * 预生成的 CSS 变量引用单例
 * 适用于不支持 Proxy 的环境或需要静态引用的场景
 */
let _cssVarInstance: CSSVarRefs | null = null;

/**
 * 获取 CSS 变量引用单例
 */
export function getCSSVarRefs(): CSSVarRefs {
  if (!_cssVarInstance) {
    _cssVarInstance = createCSSVarRefs();
  }
  return _cssVarInstance;
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
export const cssVar: CSSVarRefs = createCSSVarRefs();

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
export const cssVarName: CSSVarNames = createCSSVarNames();
