import { watch, onScopeDispose, toValue, type MaybeRefOrGetter } from 'vue';

/**
 * 带自动清理与环境守卫的 ResizeObserver
 *
 * 把「new ResizeObserver → observe → 卸载时 disconnect」以及「jsdom/SSR 无
 * ResizeObserver 时安全空转」这套样板封装掉：
 * - target 支持响应式（ref/getter）：变化时自动 disconnect 旧的、observe 新的；
 *   为 null/undefined 时不观测（可借此实现启用/停用）。
 * - 运行环境无 ResizeObserver（如 jsdom、SSR）时安全空转，不抛错。
 * - 组件卸载 / effect scope 销毁自动 disconnect，也可调用返回的 stop() 手动停止。
 *
 * @returns stop 手动停止观测并断开的函数
 *
 * @example
 * ```ts
 * const el = ref<HTMLElement | null>(null);
 * useResizeObserver(el, (entries) => {
 *   const { width, height } = entries[0].contentRect;
 *   // ...
 * });
 * ```
 */
export function useResizeObserver(
  target: MaybeRefOrGetter<HTMLElement | null | undefined>,
  callback: ResizeObserverCallback,
  options?: ResizeObserverOptions,
): () => void {
  let observer: ResizeObserver | null = null;

  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  const stopWatch = watch(
    () => toValue(target),
    (el) => {
      cleanup();
      // jsdom / SSR 等无 ResizeObserver 的环境安全空转
      if (!el || typeof ResizeObserver === 'undefined') return;
      observer = new ResizeObserver(callback);
      observer.observe(el, options);
    },
    { immediate: true, flush: 'post' },
  );

  const stop = () => {
    stopWatch();
    cleanup();
  };

  // 第二参数 failSilently=true：在组件/effect scope 之外调用时不告警（由调用方手动 stop）
  onScopeDispose(stop, true);

  return stop;
}
