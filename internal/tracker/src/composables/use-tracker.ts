import { inject } from 'vue';
import type {
  AccountInfo,
  BaseEventProperties,
  CommonPropertyMap,
  EventName,
} from '../types.js';
import { TRACKER_INJECTION_KEY } from '../types.js';

/**
 * 核心 Composable：获取 Tracker 实例
 * 通过 inject 获取 Plugin 注入的 Tracker，返回常用方法
 */
export function useTracker<E extends string = string>() {
  const injected = inject(TRACKER_INJECTION_KEY);

  if (!injected) {
    throw new Error(
      '[aix-tracker] useTracker() 必须在 createTrackerPlugin 安装后的组件中使用',
    );
  }

  // 赋值给 non-nullable 变量，避免闭包中 TS 无法收窄
  const tracker = injected;

  /** 上报自定义事件 */
  function track(
    eventName: EventName<E>,
    properties?: BaseEventProperties,
  ): void {
    tracker.track(eventName, properties);
  }

  /** 设置用户身份 */
  function identify(account: AccountInfo): void {
    tracker.identify(account);
  }

  /** 更新公共属性 */
  function setCommonData(data: CommonPropertyMap): void {
    tracker.setCommonData(data);
  }

  return { track, identify, setCommonData, tracker };
}
