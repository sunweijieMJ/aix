import { watch, onScopeDispose, toValue, type MaybeRefOrGetter } from 'vue';

/**
 * 带自动清理的事件监听
 *
 * 把「addEventListener → 卸载时 removeEventListener」这套样板封装掉：
 * - target 支持响应式（ref / getter / MaybeRefOrGetter）：target 变化时自动解绑旧的、绑定新的；
 *   target 为 null/undefined 时不绑定——可借此实现「启用/停用」（传一个在停用时返回 null 的 getter）。
 * - event 支持单个或多个事件名，共用同一 handler。
 * - 组件卸载 / effect scope 销毁时自动移除监听，也可调用返回的 stop() 手动停止。
 *
 * @returns stop 手动停止监听并解绑的函数
 *
 * @example
 * ```ts
 * // 绑定到 window，组件卸载自动清理
 * useEventListener(window, 'keydown', onKey);
 *
 * // 响应式 target：elRef 变化自动重绑
 * useEventListener(elRef, 'click', onClick);
 *
 * // 多事件共用 handler + capture
 * useEventListener(document, ['pointerdown', 'pointerup'], onPointer, true);
 *
 * // 启停：open 为 false 时 getter 返回 null，自动解绑
 * useEventListener(() => (open.value ? window : null), 'keydown', onEsc);
 * ```
 */
export function useEventListener<E extends keyof WindowEventMap>(
  target: MaybeRefOrGetter<Window | null | undefined>,
  event: E | E[],
  handler: (this: Window, ev: WindowEventMap[E]) => unknown,
  options?: boolean | AddEventListenerOptions,
): () => void;
export function useEventListener<E extends keyof DocumentEventMap>(
  target: MaybeRefOrGetter<Document | null | undefined>,
  event: E | E[],
  handler: (this: Document, ev: DocumentEventMap[E]) => unknown,
  options?: boolean | AddEventListenerOptions,
): () => void;
export function useEventListener<E extends keyof HTMLElementEventMap>(
  target: MaybeRefOrGetter<HTMLElement | null | undefined>,
  event: E | E[],
  handler: (this: HTMLElement, ev: HTMLElementEventMap[E]) => unknown,
  options?: boolean | AddEventListenerOptions,
): () => void;
export function useEventListener(
  target: MaybeRefOrGetter<EventTarget | null | undefined>,
  event: string | string[],
  handler: (ev: Event) => unknown,
  options?: boolean | AddEventListenerOptions,
): () => void;
export function useEventListener(
  target: MaybeRefOrGetter<EventTarget | null | undefined>,
  event: string | string[],
  handler: (ev: Event) => unknown,
  options?: boolean | AddEventListenerOptions,
): () => void {
  const events = Array.isArray(event) ? event : [event];
  let cleanups: Array<() => void> = [];

  const clean = () => {
    cleanups.forEach((fn) => fn());
    cleanups = [];
  };

  const stopWatch = watch(
    () => toValue(target),
    (el) => {
      clean();
      if (!el) return;
      for (const name of events) {
        el.addEventListener(name, handler, options);
        cleanups.push(() => el.removeEventListener(name, handler, options));
      }
    },
    { immediate: true },
  );

  const stop = () => {
    stopWatch();
    clean();
  };

  // 第二参数 failSilently=true：在组件/effect scope 之外调用时不告警（由调用方手动 stop）
  onScopeDispose(stop, true);

  return stop;
}
