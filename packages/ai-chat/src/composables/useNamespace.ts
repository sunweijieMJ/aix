const PREFIX = 'aix';

/** 包内私有 BEM 工具，前缀固定 aix-，不对外导出 */
export function useNamespace(block: string) {
  const b = (suffix?: string) => (suffix ? `${PREFIX}-${block}-${suffix}` : `${PREFIX}-${block}`);
  const e = (element: string) => `${b()}__${element}`;
  const m = (modifier: string) => `${b()}--${modifier}`;
  const em = (element: string, modifier: string) => `${e(element)}--${modifier}`;
  const is = (name: string, state = true) => (state ? `is-${name}` : '');
  return { b, e, m, em, is };
}

export type Namespace = ReturnType<typeof useNamespace>;
