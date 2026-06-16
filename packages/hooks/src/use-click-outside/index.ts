import { toValue, type MaybeRefOrGetter } from 'vue';
import { useEventListener } from '../use-event-listener';

export interface UseClickOutsideOptions {
  /** 排除在"外部"检测之外的元素，支持 ref / computed / getter */
  excludeRefs: MaybeRefOrGetter<(HTMLElement | null | undefined)[]>;
  /** 点击外部时的回调 */
  handler: () => void;
  /** 是否启用监听，支持 ref / getter；默认 true */
  enabled?: MaybeRefOrGetter<boolean>;
}

/**
 * 点击外部检测
 *
 * 使用 pointerdown 事件（比 click 更快响应），在 capture 阶段监听 document。
 * 内部复用 useEventListener：
 * - enabled 为 false（或 SSR/无 document）时 target 返回 null，自动解绑；
 * - 组件卸载 / effect scope 销毁时自动清理，也可调用返回的 stop() 手动停止。
 *
 * @returns stop 手动停止监听并解绑的函数
 *
 * @example
 * ```ts
 * useClickOutside({
 *   excludeRefs: computed(() => [triggerRef.value, popupRef.value]),
 *   handler: () => (open.value = false),
 *   enabled: open,
 * });
 * ```
 */
export function useClickOutside(options: UseClickOutsideOptions): () => void {
  const { excludeRefs, handler, enabled = true } = options;

  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node | null;
    if (!target) return;

    const elements = toValue(excludeRefs);
    for (const el of elements) {
      // 虚拟元素（如 contextmenu 的虚拟定位对象）没有 contains 方法，需要跳过
      if (el && typeof el.contains === 'function' && el.contains(target)) {
        return;
      }
    }

    handler();
  }

  // enabled 为 false（或无 document）时返回 null，useEventListener 自动解绑/安全空转
  return useEventListener(
    () => (toValue(enabled) && typeof document !== 'undefined' ? document : null),
    'pointerdown',
    onPointerDown,
    true,
  );
}
