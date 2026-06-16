/**
 * BEM 命名空间工具
 *
 * 统一生成 `.aix-` 前缀的 BEM class，避免各组件包手写模板字符串拼接，
 * 消除前缀硬编码漂移风险。
 */

/** 组件库统一前缀，全库 class 均以 `aix-` 开头 */
const PREFIX = 'aix';

/**
 * 创建某个 block 的 BEM class 生成器
 *
 * @param block 组件块名，如 'button'、'bubble'
 *
 * @example
 * ```ts
 * const ns = useNamespace('button');
 * ns.b();              // 'aix-button'
 * ns.b('icon');        // 'aix-button-icon'
 * ns.e('text');        // 'aix-button__text'
 * ns.m('primary');     // 'aix-button--primary'
 * ns.em('text', 'sm'); // 'aix-button__text--sm'
 * ns.is('active');     // 'is-active'
 * ns.is('active', false); // ''
 * ```
 */
export function useNamespace(block: string) {
  const b = (suffix?: string) => (suffix ? `${PREFIX}-${block}-${suffix}` : `${PREFIX}-${block}`);
  const e = (element: string) => `${b()}__${element}`;
  const m = (modifier: string) => `${b()}--${modifier}`;
  const em = (element: string, modifier: string) => `${e(element)}--${modifier}`;
  const is = (name: string, state = true) => (state ? `is-${name}` : '');
  return { b, e, m, em, is };
}

export type Namespace = ReturnType<typeof useNamespace>;
