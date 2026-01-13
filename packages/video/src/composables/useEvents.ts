import { watch, onBeforeUnmount, type Ref } from 'vue';
import type { VideoJsPlayer } from '../types';

/**
 * 事件回调接口
 */
export interface EventCallbacks {
  /** 是否禁用 video 元素事件绑定 */
  disabled?: boolean;
  onError?: (error: Error) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onProgress?: (buffered: number) => void;
  onVolumeChange?: (volume: number, muted: boolean) => void;
  onFullscreen?: (isFullscreen: boolean) => void;
  onFirstFrame?: () => void;
  onLoadedData?: () => void;
  onCanPlay?: () => void;
}

/**
 * 事件绑定功能
 */
export function useEvents(
  videoRef: Ref<HTMLVideoElement | null>,
  playerRef: Ref<VideoJsPlayer | null>,
  callbacks: Ref<EventCallbacks>,
) {
  const handlers = new Map<string, EventListener>();
  let playerEventsCleanup: (() => void) | null = null;

  /**
   * 绑定 video 元素事件
   */
  function bindVideoEvents(): void {
    const video = videoRef.value;
    const events = callbacks.value;
    if (!video) return;

    // 先清理
    unbindVideoEvents();

    // 如果禁用了 video 事件绑定，直接返回
    if (events.disabled) return;

    if (events.onLoadedData) {
      const handler = () => events.onLoadedData?.();
      video.addEventListener('loadeddata', handler);
      handlers.set('loadeddata', handler);
    }

    if (events.onCanPlay) {
      const handler = () => events.onCanPlay?.();
      video.addEventListener('canplay', handler);
      handlers.set('canplay', handler);
    }

    if (events.onPlay) {
      const handler = () => events.onPlay?.();
      video.addEventListener('play', handler);
      handlers.set('play', handler);
    }

    if (events.onPause) {
      const handler = () => events.onPause?.();
      video.addEventListener('pause', handler);
      handlers.set('pause', handler);
    }

    if (events.onEnded) {
      const handler = () => events.onEnded?.();
      video.addEventListener('ended', handler);
      handlers.set('ended', handler);
    }

    if (events.onTimeUpdate) {
      const handler = () => {
        events.onTimeUpdate?.(video.currentTime, video.duration || 0);
      };
      video.addEventListener('timeupdate', handler);
      handlers.set('timeupdate', handler);
    }

    if (events.onProgress) {
      const handler = () => {
        if (video.buffered.length > 0) {
          const buffered =
            video.buffered.end(video.buffered.length - 1) /
            (video.duration || 1);
          events.onProgress?.(buffered);
        }
      };
      video.addEventListener('progress', handler);
      handlers.set('progress', handler);
    }

    if (events.onError) {
      const handler = () => {
        const error = video.error;
        events.onError?.(new Error(error?.message || '视频加载错误'));
      };
      video.addEventListener('error', handler);
      handlers.set('error', handler);
    }

    if (events.onVolumeChange) {
      const handler = () => {
        events.onVolumeChange?.(video.volume, video.muted);
      };
      video.addEventListener('volumechange', handler);
      handlers.set('volumechange', handler);
    }

    // 首帧检测
    if (events.onFirstFrame) {
      const handler = () => {
        if (video.readyState >= 2) {
          events.onFirstFrame?.();
        }
      };
      video.addEventListener('timeupdate', handler, { once: true });
      handlers.set('firstframe', handler);
    }
  }

  /**
   * 解绑 video 元素事件
   */
  function unbindVideoEvents(): void {
    const video = videoRef.value;
    if (!video) return;

    handlers.forEach((handler, eventName) => {
      // firstframe 使用 { once: true }，会自动移除，无需手动清理
      if (eventName === 'firstframe') return;
      video.removeEventListener(eventName, handler);
    });
    handlers.clear();
  }

  /**
   * 绑定 video.js 播放器事件
   */
  function bindPlayerEvents(): void {
    const player = playerRef.value;
    const events = callbacks.value;
    if (!player) return;

    // 清理旧的
    playerEventsCleanup?.();

    const cleanupFns: Array<() => void> = [];

    if (events.onFullscreen) {
      const handler = () =>
        events.onFullscreen?.(player.isFullscreen() ?? false);
      player.on('fullscreenchange', handler);
      cleanupFns.push(() => player.off('fullscreenchange', handler));
    }

    playerEventsCleanup = () => {
      cleanupFns.forEach((fn) => fn());
      cleanupFns.length = 0;
    };
  }

  /**
   * 清理所有事件
   */
  function cleanup(): void {
    unbindVideoEvents();
    playerEventsCleanup?.();
    playerEventsCleanup = null;
  }

  // 监听 video 变化
  watch(videoRef, (video) => {
    if (video) {
      bindVideoEvents();
    } else {
      unbindVideoEvents();
    }
  });

  // 监听 player 变化
  watch(playerRef, (player) => {
    if (player) bindPlayerEvents();
  });

  // 监听 callbacks 变化 - 优化：监听具体回调函数而非整个对象
  watch(
    () => [
      callbacks.value.disabled,
      callbacks.value.onError,
      callbacks.value.onPlay,
      callbacks.value.onPause,
      callbacks.value.onEnded,
      callbacks.value.onTimeUpdate,
      callbacks.value.onProgress,
      callbacks.value.onVolumeChange,
      callbacks.value.onFullscreen,
      callbacks.value.onFirstFrame,
      callbacks.value.onLoadedData,
      callbacks.value.onCanPlay,
    ],
    () => {
      if (videoRef.value) {
        bindVideoEvents();
      }
      if (playerRef.value) {
        bindPlayerEvents();
      }
    },
  );

  // 组件卸载时清理
  onBeforeUnmount(cleanup);

  return {
    bindVideoEvents,
    unbindVideoEvents,
    bindPlayerEvents,
    cleanup,
  };
}
