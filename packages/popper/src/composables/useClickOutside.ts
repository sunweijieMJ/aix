import {
  watch,
  onBeforeUnmount,
  toValue,
  type Ref,
  type MaybeRefOrGetter,
} from 'vue';

export interface UseClickOutsideOptions {
  /** 排除在"外部"检测之外的元素 */
  excludeRefs: Ref<(HTMLElement | null | undefined)[]>;
  /** 点击外部时的回调 */
  handler: () => void;
  /** 是否启用监听 */
  enabled?: MaybeRefOrGetter<boolean>;
}

/**
 * 点击外部检测
 *
 * 使用 pointerdown 事件（比 click 更快响应）
 */
export function useClickOutside(options: UseClickOutsideOptions): void {
  const { excludeRefs, handler, enabled = true } = options;

  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node;
    if (!target) return;

    const elements = excludeRefs.value;
    for (const el of elements) {
      // 虚拟元素（如 contextmenu 的虚拟定位对象）没有 contains 方法，需要跳过
      if (el && typeof el.contains === 'function' && el.contains(target)) {
        return;
      }
    }

    handler();
  }

  function addListener() {
    if (typeof document === 'undefined') return;
    document.addEventListener('pointerdown', onPointerDown, true);
  }

  function removeListener() {
    if (typeof document === 'undefined') return;
    document.removeEventListener('pointerdown', onPointerDown, true);
  }

  watch(
    () => toValue(enabled),
    (val) => {
      if (val) {
        addListener();
      } else {
        removeListener();
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(removeListener);
}
