import { ref, watch, onMounted, onBeforeUnmount, type Ref } from 'vue';

/**
 * 屏幕方向类型
 */
export type OrientationType =
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary';

/**
 * 屏幕方向监听配置
 */
export interface OrientationChangeOptions {
  /** 是否启用屏幕方向监听 */
  enabled?: boolean;
  /** 横屏时是否自动全屏 */
  autoFullscreenOnLandscape?: boolean;
  /** 是否启用调试日志 */
  enableDebugLog?: boolean;
  /** 方向变化回调 */
  onOrientationChange?: (orientation: OrientationType) => void;
  /** 横屏回调 */
  onLandscape?: () => void;
  /** 竖屏回调 */
  onPortrait?: () => void;
}

/**
 * 屏幕方向监听
 * 用于监听设备屏幕方向变化，支持横屏自动全屏
 */
export function useOrientationChange(options: Ref<OrientationChangeOptions>) {
  const orientation = ref<OrientationType>('portrait-primary');
  const isLandscape = ref(false);

  function logDebug(message: string, ...args: unknown[]): void {
    if (options.value.enableDebugLog) {
      console.log(`[OrientationChange] ${message}`, ...args);
    }
  }

  /**
   * 获取当前屏幕方向
   */
  function getCurrentOrientation(): OrientationType {
    if (screen.orientation?.type) {
      return screen.orientation.type as OrientationType;
    }
    // 降级方案：使用 window.orientation (已废弃但兼容性好)
    const angle = (window as any).orientation;
    if (angle === 90 || angle === -90) {
      return 'landscape-primary';
    }
    return 'portrait-primary';
  }

  /**
   * 更新方向状态
   */
  function updateOrientation(): void {
    const newOrientation = getCurrentOrientation();
    const wasLandscape = isLandscape.value;

    orientation.value = newOrientation;
    isLandscape.value = newOrientation.includes('landscape');

    logDebug('屏幕方向变化', {
      orientation: newOrientation,
      isLandscape: isLandscape.value,
    });

    // 触发回调
    options.value.onOrientationChange?.(newOrientation);

    // 横屏/竖屏回调
    if (isLandscape.value && !wasLandscape) {
      options.value.onLandscape?.();
    } else if (!isLandscape.value && wasLandscape) {
      options.value.onPortrait?.();
    }
  }

  /**
   * 绑定事件监听
   */
  function bindEvents(): void {
    if (!options.value.enabled) return;

    if (screen.orientation) {
      screen.orientation.addEventListener('change', updateOrientation);
      logDebug('使用 Screen Orientation API');
    } else {
      // 降级方案：使用 orientationchange 事件
      window.addEventListener('orientationchange', updateOrientation);
      logDebug('使用 orientationchange 事件 (降级方案)');
    }
  }

  /**
   * 解绑事件监听
   */
  function unbindEvents(): void {
    if (screen.orientation) {
      screen.orientation.removeEventListener('change', updateOrientation);
    } else {
      window.removeEventListener('orientationchange', updateOrientation);
    }
    logDebug('屏幕方向监听已解绑');
  }

  /**
   * 检查是否支持屏幕方向 API
   */
  function isSupported(): boolean {
    return !!(screen.orientation || 'orientation' in window);
  }

  // 监听配置变化
  watch(
    () => options.value.enabled,
    (enabled) => {
      if (enabled) {
        bindEvents();
        updateOrientation();
      } else {
        unbindEvents();
      }
    },
  );

  onMounted(() => {
    if (options.value.enabled) {
      updateOrientation();
      bindEvents();
    }
  });

  onBeforeUnmount(() => {
    unbindEvents();
  });

  return {
    orientation,
    isLandscape,
    isSupported,
  };
}
