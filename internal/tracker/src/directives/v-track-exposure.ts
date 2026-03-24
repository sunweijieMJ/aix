import type { Directive, DirectiveBinding } from 'vue';
import type { TrackExposureBinding } from '../types.js';
import type { Tracker } from '../core/tracker.js';

/** 存储在元素上的清理函数和状态 */
const CLEANUP_KEY = Symbol('track-exposure-cleanup');
const FIRED_KEY = Symbol('track-exposure-fired');

interface TrackableElement extends HTMLElement {
  [CLEANUP_KEY]?: () => void;
  [FIRED_KEY]?: boolean;
}

/** 设置曝光检测 */
function setupExposure(
  el: TrackableElement,
  binding: DirectiveBinding<TrackExposureBinding>,
  tracker: Tracker,
): void {
  // 先清理旧绑定
  el[CLEANUP_KEY]?.();

  // once 模式下已触发过则跳过
  const { once = true } = binding.value;
  if (once && el[FIRED_KEY]) return;

  const {
    event,
    properties,
    threshold = 0.5,
    minVisibleTime = 300,
  } = binding.value;

  // IntersectionObserver 不可用时静默跳过
  if (typeof IntersectionObserver === 'undefined') return;

  let timer: ReturnType<typeof setTimeout> | null = null;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
          if (timer === null) {
            timer = setTimeout(() => {
              const props =
                typeof properties === 'function' ? properties() : properties;
              tracker.track(event, props);
              timer = null;
              if (once) {
                el[FIRED_KEY] = true;
                observer.disconnect();
              }
            }, minVisibleTime);
          }
        } else {
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
        }
      }
    },
    { threshold: [threshold] },
  );

  observer.observe(el);

  el[CLEANUP_KEY] = () => {
    if (timer !== null) clearTimeout(timer);
    observer.disconnect();
  };
}

/**
 * v-track-exposure 自定义指令
 * 基于 IntersectionObserver 的曝光埋点
 */
export function createTrackExposureDirective(
  tracker: Tracker,
): Directive<TrackableElement, TrackExposureBinding> {
  return {
    mounted(el, binding) {
      setupExposure(el, binding, tracker);
    },
    updated(el, binding) {
      setupExposure(el, binding, tracker);
    },
    beforeUnmount(el) {
      el[CLEANUP_KEY]?.();
      delete el[CLEANUP_KEY];
      delete el[FIRED_KEY];
    },
  };
}
