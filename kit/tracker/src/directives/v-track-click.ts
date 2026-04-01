import type { Directive, DirectiveBinding } from 'vue';
import type { TrackClickBinding } from '../types.js';
import type { Tracker } from '../core/tracker.js';

/** 存储在元素上的清理函数和状态 */
const CLEANUP_KEY = Symbol('track-click-cleanup');
const FIRED_KEY = Symbol('track-click-fired');

interface TrackableElement extends HTMLElement {
  [CLEANUP_KEY]?: () => void;
  [FIRED_KEY]?: boolean;
}

/** 绑定点击事件 */
function bindClick(
  el: TrackableElement,
  binding: DirectiveBinding<TrackClickBinding>,
  tracker: Tracker,
): void {
  // 先清理旧绑定
  el[CLEANUP_KEY]?.();

  const { event, properties, once } = binding.value;

  const handler = () => {
    if (once && el[FIRED_KEY]) return;
    tracker.track(event, properties);
    if (once) el[FIRED_KEY] = true;
  };

  el.addEventListener('click', handler);
  el[CLEANUP_KEY] = () => el.removeEventListener('click', handler);
}

/**
 * v-track-click 自定义指令
 * 需要在 createTrackerPlugin 中注册，通过 app.provide 获取 tracker
 */
export function createTrackClickDirective(
  tracker: Tracker,
): Directive<TrackableElement, TrackClickBinding> {
  return {
    mounted(el, binding) {
      bindClick(el, binding, tracker);
    },
    updated(el, binding) {
      // 重新绑定以捕获最新 properties，但保留 fired 状态
      bindClick(el, binding, tracker);
    },
    beforeUnmount(el) {
      el[CLEANUP_KEY]?.();
      delete el[CLEANUP_KEY];
      delete el[FIRED_KEY];
    },
  };
}
