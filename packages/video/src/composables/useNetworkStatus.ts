import { ref, onMounted, onBeforeUnmount } from 'vue';

/**
 * 网络连接类型
 */
export type NetworkEffectiveType = 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';

/**
 * Network Information API 类型定义
 * @see https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
 */
interface NetworkInformation extends EventTarget {
  /** 有效连接类型 */
  readonly effectiveType?: NetworkEffectiveType;
  /** 下行速度 (Mbps) */
  readonly downlink?: number;
  /** 往返时间 (ms) */
  readonly rtt?: number;
  /** 是否启用数据保护模式 */
  readonly saveData?: boolean;
  /** 连接类型 */
  readonly type?:
    | 'bluetooth'
    | 'cellular'
    | 'ethernet'
    | 'none'
    | 'wifi'
    | 'wimax'
    | 'other'
    | 'unknown';
}

/**
 * 扩展的 Navigator 接口
 */
interface NavigatorWithConnection extends Navigator {
  readonly connection?: NetworkInformation;
  readonly mozConnection?: NetworkInformation;
  readonly webkitConnection?: NetworkInformation;
}

/**
 * 网络状态信息
 */
export interface NetworkStatus {
  /** 是否在线 */
  isOnline: boolean;
  /** 有效连接类型 */
  effectiveType: NetworkEffectiveType;
  /** 下行速度 (Mbps) */
  downlink?: number;
  /** 往返时间 (ms) */
  rtt?: number;
}

/**
 * 网络状态监听配置
 */
export interface NetworkStatusOptions {
  /** 是否启用调试日志 */
  enableDebugLog?: boolean;
  /** 在线回调 */
  onOnline?: () => void;
  /** 离线回调 */
  onOffline?: () => void;
  /** 网络变慢回调 */
  onNetworkSlow?: (status: NetworkStatus) => void;
  /** 网络状态变化回调 */
  onNetworkChange?: (status: NetworkStatus) => void;
}

/**
 * 网络状态监听
 * 用于监听网络连接状态和质量变化
 */
export function useNetworkStatus(options: NetworkStatusOptions = {}) {
  const isOnline = ref(navigator.onLine);
  const effectiveType = ref<NetworkEffectiveType>('unknown');
  const downlink = ref<number | undefined>(undefined);
  const rtt = ref<number | undefined>(undefined);

  // 获取 Network Information API (类型安全)
  const nav = navigator as NavigatorWithConnection;
  const connection: NetworkInformation | undefined =
    nav.connection || nav.mozConnection || nav.webkitConnection;

  function logDebug(message: string, ...args: unknown[]): void {
    if (options.enableDebugLog) {
      console.log(`[NetworkStatus] ${message}`, ...args);
    }
  }

  /**
   * 更新网络状态信息
   */
  function updateNetworkInfo(): void {
    if (connection) {
      effectiveType.value = connection.effectiveType || 'unknown';
      downlink.value = connection.downlink;
      rtt.value = connection.rtt;

      logDebug('网络状态更新', {
        effectiveType: effectiveType.value,
        downlink: downlink.value,
        rtt: rtt.value,
      });
    }
  }

  /**
   * 在线事件处理
   */
  function handleOnline(): void {
    isOnline.value = true;
    logDebug('网络已连接');
    options.onOnline?.();
  }

  /**
   * 离线事件处理
   */
  function handleOffline(): void {
    isOnline.value = false;
    logDebug('网络已断开');
    options.onOffline?.();
  }

  /**
   * 网络状态变化处理
   */
  function handleConnectionChange(): void {
    updateNetworkInfo();

    const status: NetworkStatus = {
      isOnline: isOnline.value,
      effectiveType: effectiveType.value,
      downlink: downlink.value,
      rtt: rtt.value,
    };

    // 触发网络状态变化回调
    options.onNetworkChange?.(status);

    // 检测慢速网络
    if (effectiveType.value === 'slow-2g' || effectiveType.value === '2g') {
      logDebug('检测到慢速网络', status);
      options.onNetworkSlow?.(status);
    }
  }

  /**
   * 绑定事件监听
   */
  function bindEvents(): void {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (connection) {
      connection.addEventListener('change', handleConnectionChange);
    }
  }

  /**
   * 解绑事件监听
   */
  function unbindEvents(): void {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);

    if (connection) {
      connection.removeEventListener('change', handleConnectionChange);
    }
  }

  /**
   * 获取当前网络状态
   */
  function getNetworkStatus(): NetworkStatus {
    return {
      isOnline: isOnline.value,
      effectiveType: effectiveType.value,
      downlink: downlink.value,
      rtt: rtt.value,
    };
  }

  /**
   * 判断是否为慢速网络
   */
  function isSlowNetwork(): boolean {
    return effectiveType.value === 'slow-2g' || effectiveType.value === '2g';
  }

  onMounted(() => {
    // 初始化网络信息
    updateNetworkInfo();
    // 绑定事件
    bindEvents();
  });

  onBeforeUnmount(() => {
    unbindEvents();
  });

  return {
    isOnline,
    effectiveType,
    downlink,
    rtt,
    getNetworkStatus,
    isSlowNetwork,
  };
}
