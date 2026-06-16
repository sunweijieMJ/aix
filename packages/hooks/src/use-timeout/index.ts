import { ref, onScopeDispose, toValue, type Ref, type MaybeRefOrGetter } from 'vue';

export interface UseTimeoutFnOptions {
  /** 是否在调用 useTimeout 时立即启动计时，默认 false（手动 start） */
  immediate?: boolean;
}

export interface UseTimeoutReturn {
  /** 是否正在等待触发 */
  isPending: Readonly<Ref<boolean>>;
  /** 启动计时；若已在计时则先取消再重新计时（restart 语义），按调用时最新的 delay */
  start: () => void;
  /** 取消计时 */
  stop: () => void;
}

/**
 * 带自动清理的 setTimeout
 *
 * 把「setTimeout → 卸载时 clearTimeout」这套样板封装掉：
 * - delay 支持响应式（ref/getter）：每次 start 取当前 delay；
 * - start() 具备 restart 语义（先清旧定时器再启动），适合「活动即重置」的倒计时；
 * - 组件卸载 / effect scope 销毁时自动清理。
 *
 * @example
 * ```ts
 * const { start, stop, isPending } = useTimeout(() => (copied.value = false), 1500);
 * start(); // 1.5s 后回调；再次 start 会重新计时
 * ```
 */
export function useTimeout(
  callback: () => void,
  delay: MaybeRefOrGetter<number>,
  options: UseTimeoutFnOptions = {},
): UseTimeoutReturn {
  const { immediate = false } = options;
  const isPending = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const stop = () => {
    isPending.value = false;
    clear();
  };

  const start = () => {
    clear();
    isPending.value = true;
    timer = setTimeout(() => {
      isPending.value = false;
      timer = null;
      callback();
    }, toValue(delay));
  };

  if (immediate) start();

  // 第二参数 failSilently=true：在组件/effect scope 之外调用时不告警
  onScopeDispose(stop, true);

  return { isPending, start, stop };
}
