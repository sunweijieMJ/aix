import * as Vue from 'vue';

// 模块级回退种子:仅在 Vue < 3.5(无原生 useId)时使用,保证 CSR 内唯一。
let seed = 0;

/**
 * 生成应用内唯一 id 的 hook,兼容 Vue 3.3+。
 *
 * - Vue 3.5+:透传原生 useId(),保留 SSR / hydration 一致性;
 * - Vue 3.3 / 3.4:回退自增计数器,仅保证 CSR 唯一(不保证 SSR 一致)。
 *
 * 必须在 setup / 组件初始化阶段同步调用(与原生 useId 约束一致)。
 *
 * @example
 * ```ts
 * const id = useId();
 * const popoverId = `aix-popover-${id}`;
 * ```
 */
export function useId(): string {
  // 不直接 `import { useId } from 'vue'`,否则在 vue<3.5 下会因缺少该导出导致打包失败。
  const native = (Vue as { useId?: () => string }).useId;
  return typeof native === 'function' ? native() : `aix-${(seed += 1)}`;
}
