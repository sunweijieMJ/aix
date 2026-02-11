import {
  ref,
  onBeforeUnmount,
  watch,
  toValue,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';

export interface AutoHideOptions {
  /** 隐藏延迟（ms），默认 3000，0 表示禁用 */
  delay?: MaybeRefOrGetter<number>;
  /** 是否启用，默认 true */
  enabled?: MaybeRefOrGetter<boolean>;
}

export interface UseControlsAutoHideReturn {
  /** 控制栏是否可见 */
  visible: Ref<boolean>;
  /** 触发显示（重置计时器） */
  show: () => void;
  /** 手动隐藏 */
  hide: () => void;
  /** 切换显隐 */
  toggle: () => void;
  /** 交互时调用（重置计时器） */
  onInteraction: () => void;
}

/**
 * 控制栏自动隐藏 composable
 * 3 秒无操作后自动隐藏控制栏，交互时重置计时器
 */
export function useControlsAutoHide(
  options: AutoHideOptions = {},
): UseControlsAutoHideReturn {
  const visible = ref(true);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function startTimer(): void {
    clearTimer();
    const delay = toValue(options.delay) ?? 3000;
    const enabled = toValue(options.enabled) ?? true;
    if (!enabled || delay <= 0) return;

    timer = setTimeout(() => {
      visible.value = false;
      timer = null;
    }, delay);
  }

  function show(): void {
    visible.value = true;
    startTimer();
  }

  function hide(): void {
    clearTimer();
    visible.value = false;
  }

  function toggle(): void {
    if (visible.value) {
      hide();
    } else {
      show();
    }
  }

  function onInteraction(): void {
    if (visible.value) {
      startTimer();
    }
  }

  // 当 enabled 变化时重新计算
  watch(
    () => toValue(options.enabled),
    (enabled) => {
      if (enabled === false) {
        clearTimer();
        visible.value = true;
      } else {
        startTimer();
      }
    },
  );

  // 初始启动计时器
  startTimer();

  onBeforeUnmount(() => {
    clearTimer();
  });

  return {
    visible,
    show,
    hide,
    toggle,
    onInteraction,
  };
}
