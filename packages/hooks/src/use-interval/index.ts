import { ref, onScopeDispose, toValue, type Ref, type MaybeRefOrGetter } from 'vue';

export interface UseIntervalFnOptions {
  /** 是否在调用 useInterval 时立即启动，默认 false（手动 start） */
  immediate?: boolean;
}

export interface UseIntervalReturn {
  /** 是否正在周期执行 */
  isActive: Readonly<Ref<boolean>>;
  /** 启动；若已在运行则先停止再以最新 interval 重新启动 */
  start: () => void;
  /** 停止 */
  stop: () => void;
}

/**
 * 带自动清理的 setInterval
 *
 * 把「setInterval → 卸载时 clearInterval」这套样板封装掉：
 * - interval 支持响应式（ref/getter）：每次 start 取当前值；
 * - 组件卸载 / effect scope 销毁时自动清理。
 *
 * @example
 * ```ts
 * const { start, stop, isActive } = useInterval(() => tick(), 1000);
 * start();
 * ```
 */
export function useInterval(
  callback: () => void,
  interval: MaybeRefOrGetter<number>,
  options: UseIntervalFnOptions = {},
): UseIntervalReturn {
  const { immediate = false } = options;
  const isActive = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  const clear = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const stop = () => {
    isActive.value = false;
    clear();
  };

  const start = () => {
    clear();
    isActive.value = true;
    timer = setInterval(callback, toValue(interval));
  };

  if (immediate) start();

  // 第二参数 failSilently=true：在组件/effect scope 之外调用时不告警
  onScopeDispose(stop, true);

  return { isActive, start, stop };
}
