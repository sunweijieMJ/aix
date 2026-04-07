import { inject, onBeforeUnmount, ref, watch } from 'vue';
import type { UseExposureOptions, UseExposureReturn } from '../types.js';
import { TRACKER_INJECTION_KEY } from '../types.js';

/**
 * 曝光检测 Composable
 * 基于 IntersectionObserver 检测元素是否进入视口并满足可见时长
 */
export function useExposure(options: UseExposureOptions): UseExposureReturn {
  const { event, properties, threshold = 0.5, once = true, minVisibleTime = 300 } = options;

  const injected = inject(TRACKER_INJECTION_KEY);

  if (!injected) {
    throw new Error('[kit-tracker] useExposure() 必须在 createTrackerPlugin 安装后的组件中使用');
  }

  const tracker = injected;
  const elementRef = ref<HTMLElement | null>(null);
  const isExposed = ref(false);

  let observer: IntersectionObserver | null = null;
  let visibleTimer: ReturnType<typeof setTimeout> | null = null;

  /** 清理定时器 */
  function clearTimer(): void {
    if (visibleTimer !== null) {
      clearTimeout(visibleTimer);
      visibleTimer = null;
    }
  }

  /** 触发曝光上报 */
  function triggerExposure(): void {
    const props = typeof properties === 'function' ? properties() : properties;
    tracker.track(event, props);
    isExposed.value = true;

    if (once) {
      disconnect();
    }
  }

  /** IntersectionObserver 回调 */
  function handleIntersection(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
        // 元素进入视口，启动计时
        if (visibleTimer === null) {
          visibleTimer = setTimeout(triggerExposure, minVisibleTime);
        }
      } else {
        // 元素离开视口，取消计时
        clearTimer();
      }
    }
  }

  /** 断开 Observer */
  function disconnect(): void {
    clearTimer();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  /** 连接 Observer 到目标元素 */
  function observe(el: HTMLElement): void {
    disconnect();

    // IntersectionObserver 不可用时静默跳过
    if (typeof IntersectionObserver === 'undefined') return;

    observer = new IntersectionObserver(handleIntersection, {
      threshold: [threshold],
    });
    observer.observe(el);
  }

  /** 重置曝光状态，允许再次触发 */
  function reset(): void {
    isExposed.value = false;
    clearTimer();
    if (elementRef.value) {
      observe(elementRef.value);
    }
  }

  // 监听 elementRef 变化，支持动态切换目标元素
  watch(elementRef, (el) => {
    if (el) {
      observe(el);
    } else {
      disconnect();
    }
  });

  onBeforeUnmount(() => {
    disconnect();
  });

  return { elementRef, isExposed, reset };
}
