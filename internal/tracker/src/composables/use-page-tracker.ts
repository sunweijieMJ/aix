import { inject, onBeforeUnmount, onMounted } from 'vue';
import type { UsePageTrackerOptions } from '../types.js';
import { TRACKER_INJECTION_KEY } from '../types.js';

/**
 * 页面级埋点 Composable
 * onMounted 上报 $pageview，onBeforeUnmount 上报 $pageclose（携带停留时长）
 *
 * 注意：与 autoPageview Router Guard 互斥，二者只能启用一个
 */
export function usePageTracker(options: UsePageTrackerOptions): void {
  const { pageName, enterProperties, leaveProperties } = options;
  const tracker = inject(TRACKER_INJECTION_KEY);

  if (!tracker) {
    throw new Error(
      '[kit-tracker] usePageTracker() 必须在 createTrackerPlugin 安装后的组件中使用',
    );
  }

  let enterTime = 0;

  onMounted(() => {
    enterTime = Date.now();
    tracker.track('$pageview', {
      page_name: pageName,
      ...enterProperties,
    });
  });

  onBeforeUnmount(() => {
    const duration = Date.now() - enterTime;
    tracker.track('$pageclose', {
      page_name: pageName,
      dr: duration,
      ...leaveProperties,
    });
  });
}
