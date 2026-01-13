import { onBeforeUnmount } from 'vue';

/**
 * 定时器配置选项
 */
export interface TimerWithVisibilityOptions {
  /** 定时器暂停时的回调 */
  onPause?: () => void;
  /** 定时器恢复时的回调 */
  onResume?: () => void;
  /** 是否可以启动的判断函数 (返回 false 则不启动) */
  canStart?: () => boolean;
}

/**
 * 带页面可见性优化的定时器
 * 当页面隐藏时自动暂停定时器，页面可见时恢复
 *
 * @param callback 定时器回调函数
 * @param interval 定时器间隔（毫秒）
 * @param options 配置选项
 * @returns 定时器控制方法
 */
export function useTimerWithVisibility(
  callback: () => void,
  interval: number,
  options: TimerWithVisibilityOptions = {},
) {
  let timer: number | null = null;
  let isDestroying = false;

  /**
   * 启动定时器
   */
  function start(): void {
    // 检查是否可以启动
    if (options.canStart && !options.canStart()) {
      return;
    }

    // 仅在页面可见且定时器未运行时启动
    if (!document.hidden && timer === null && !isDestroying) {
      timer = window.setInterval(callback, interval);
    }
  }

  /**
   * 停止定时器
   */
  function stop(): void {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  /**
   * 处理页面可见性变化
   */
  function handleVisibilityChange(): void {
    if (document.hidden) {
      // 页面不可见时暂停定时器
      stop();
      options.onPause?.();
    } else {
      // 页面可见时恢复定时器
      if (!isDestroying) {
        options.onResume?.();
        start();
      }
    }
  }

  /**
   * 销毁定时器和事件监听
   */
  function destroy(): void {
    isDestroying = true;
    stop();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  // 添加页面可见性变化监听
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // 组件卸载时自动清理
  onBeforeUnmount(destroy);

  return {
    /** 启动定时器 */
    start,
    /** 停止定时器 */
    stop,
    /** 销毁定时器 */
    destroy,
    /** 页面可见性变化处理器（用于手动管理） */
    handleVisibilityChange,
  };
}
