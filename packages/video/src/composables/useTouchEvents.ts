import { ref, watch, onBeforeUnmount, type Ref } from 'vue';

/**
 * 触摸事件配置
 */
export interface TouchEventsOptions {
  /** 是否启用触摸事件 */
  enabled?: boolean;
  /** 是否启用调试日志 */
  enableDebugLog?: boolean;
  /** 单击播放/暂停回调 */
  onTap?: () => void;
  /** 双击全屏回调 */
  onDoubleTap?: () => void;
  /** 左滑回调 (快退) */
  onSwipeLeft?: () => void;
  /** 右滑回调 (快进) */
  onSwipeRight?: () => void;
}

/**
 * 触摸事件管理
 * 用于优化移动端交互体验
 */
export function useTouchEvents(
  containerRef: Ref<HTMLElement | null>,
  options: Ref<TouchEventsOptions>,
) {
  // 触摸状态
  const touchStartTime = ref(0);
  const touchStartX = ref(0);
  const touchStartY = ref(0);
  const lastTapTime = ref(0);
  let tapTimer: number | null = null; // 单击延迟定时器

  // 配置常量
  const TAP_DURATION = 300; // 单击最大时长 (ms)
  const TAP_DISTANCE = 10; // 单击最大移动距离 (px)
  const DOUBLE_TAP_INTERVAL = 200; // 双击最大间隔 (ms) - 优化: 从 300ms 降低到 200ms
  const SWIPE_MIN_DISTANCE = 50; // 滑动最小距离 (px)
  const SWIPE_MAX_DURATION = 500; // 滑动最大时长 (ms)

  /**
   * 触摸开始处理
   */
  function handleTouchStart(e: TouchEvent): void {
    if (!options.value.enabled) return;

    const touch = e.touches[0];
    if (!touch) return;

    touchStartTime.value = Date.now();
    touchStartX.value = touch.clientX;
    touchStartY.value = touch.clientY;
  }

  /**
   * 触摸结束处理
   */
  function handleTouchEnd(e: TouchEvent): void {
    if (!options.value.enabled) return;

    const touch = e.changedTouches[0];
    if (!touch) return;

    const touchEndTime = Date.now();
    const touchEndX = touch.clientX;
    const touchEndY = touch.clientY;

    const touchDuration = touchEndTime - touchStartTime.value;
    const touchDistanceX = touchEndX - touchStartX.value;
    const touchDistanceY = touchEndY - touchStartY.value;
    const touchDistance = Math.sqrt(touchDistanceX ** 2 + touchDistanceY ** 2);

    // 检测单击/双击
    if (touchDuration < TAP_DURATION && touchDistance < TAP_DISTANCE) {
      const now = Date.now();
      const timeSinceLastTap = now - lastTapTime.value;

      if (timeSinceLastTap < DOUBLE_TAP_INTERVAL) {
        // 双击 - 清除单击定时器
        if (tapTimer !== null) {
          clearTimeout(tapTimer);
          tapTimer = null;
        }
        options.value.onDoubleTap?.();
        lastTapTime.value = 0; // 重置，避免三击触发两次双击
      } else {
        // 单击 (延迟执行，等待可能的双击)
        lastTapTime.value = now;
        // 清除之前的定时器
        if (tapTimer !== null) {
          clearTimeout(tapTimer);
        }
        tapTimer = window.setTimeout(() => {
          if (lastTapTime.value === now) {
            options.value.onTap?.();
          }
          tapTimer = null;
        }, DOUBLE_TAP_INTERVAL);
      }
      return;
    }

    // 检测滑动
    if (
      touchDuration < SWIPE_MAX_DURATION &&
      Math.abs(touchDistanceX) > SWIPE_MIN_DISTANCE
    ) {
      // 水平滑动距离大于垂直滑动距离
      if (Math.abs(touchDistanceX) > Math.abs(touchDistanceY)) {
        if (touchDistanceX > 0) {
          // 右滑
          options.value.onSwipeRight?.();
        } else {
          // 左滑
          options.value.onSwipeLeft?.();
        }
      }
    }
  }

  /**
   * 绑定事件监听
   */
  function bindEvents(): void {
    const container = containerRef.value;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, {
      passive: true,
    });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
  }

  /**
   * 解绑事件监听
   */
  function unbindEvents(): void {
    const container = containerRef.value;
    if (!container) return;

    container.removeEventListener('touchstart', handleTouchStart);
    container.removeEventListener('touchend', handleTouchEnd);
  }

  // 监听容器变化
  watch(
    containerRef,
    (newContainer, oldContainer) => {
      if (oldContainer) {
        unbindEvents();
      }
      if (newContainer && options.value.enabled) {
        bindEvents();
      }
    },
    { immediate: true },
  );

  // 监听配置变化
  watch(
    () => options.value.enabled,
    (enabled) => {
      if (enabled && containerRef.value) {
        bindEvents();
      } else {
        unbindEvents();
      }
    },
  );

  onBeforeUnmount(() => {
    // 清理单击定时器，防止内存泄漏
    if (tapTimer !== null) {
      clearTimeout(tapTimer);
      tapTimer = null;
    }
    unbindEvents();
  });

  return {
    bindEvents,
    unbindEvents,
  };
}
