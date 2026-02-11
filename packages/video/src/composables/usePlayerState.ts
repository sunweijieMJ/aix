import { ref, watch, onBeforeUnmount, type Ref } from 'vue';

/**
 * 播放器状态
 */
export interface PlayerState {
  /** 是否就绪 */
  isReady: boolean;
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 当前播放时间（秒） */
  currentTime: number;
  /** 视频总时长（秒） */
  duration: number;
  /** 音量 (0-1) */
  volume: number;
  /** 是否静音 */
  isMuted: boolean;
  /** 是否全屏 */
  isFullscreen: boolean;
  /** 缓冲进度 (0-1) */
  buffered: number;
  /** 是否正在重连 */
  isReconnecting: boolean;
  /** 自动播放是否失败 */
  autoPlayFailed: boolean;
  /** 是否处于浏览器原生全屏 */
  isNativeFullscreen: boolean;
}

/**
 * 全屏事件管理器（单例模式）
 * 避免每个播放器实例都在 document 上绑定事件
 */
const fullscreenManager = (() => {
  const listeners = new Set<() => void>();
  let isListening = false;

  function handleFullscreenChange() {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (error) {
        console.error('[FullscreenManager] 回调执行错误:', error);
      }
    });
  }

  return {
    subscribe(fn: () => void): () => void {
      listeners.add(fn);

      // 首次订阅时绑定全局事件
      if (!isListening) {
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener(
          'webkitfullscreenchange',
          handleFullscreenChange,
        );
        document.addEventListener(
          'mozfullscreenchange',
          handleFullscreenChange,
        );
        document.addEventListener('msfullscreenchange', handleFullscreenChange);
        isListening = true;
      }

      // 返回取消订阅函数
      return () => {
        listeners.delete(fn);

        // 最后一个订阅者取消时，移除全局事件
        if (listeners.size === 0 && isListening) {
          document.removeEventListener(
            'fullscreenchange',
            handleFullscreenChange,
          );
          document.removeEventListener(
            'webkitfullscreenchange',
            handleFullscreenChange,
          );
          document.removeEventListener(
            'mozfullscreenchange',
            handleFullscreenChange,
          );
          document.removeEventListener(
            'msfullscreenchange',
            handleFullscreenChange,
          );
          isListening = false;
        }
      };
    },
  };
})();

/**
 * 播放器状态管理
 * 用于统一管理播放器状态，供自定义控制栏使用
 */
export function usePlayerState(videoRef: Ref<HTMLVideoElement | null>) {
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(1);
  const isMuted = ref(false);
  const isFullscreen = ref(false);
  const buffered = ref(0);
  const isReconnecting = ref(false);
  const autoPlayFailed = ref(false);
  const isNativeFullscreen = ref(false);

  // 销毁标记，防止组件销毁后更新状态
  let isDestroying = false;

  // 缓冲进度节流相关
  let lastBufferedValue = 0; // 上次更新的缓冲进度值
  let bufferedUpdateTimer: number | null = null; // 节流定时器
  const BUFFERED_UPDATE_INTERVAL = 500; // 节流间隔 500ms
  const BUFFERED_CHANGE_THRESHOLD = 0.01; // 变化阈值 1%

  /**
   * 更新播放状态
   */
  function updatePlayingState(): void {
    if (isDestroying) return;
    const video = videoRef.value;
    if (!video) return;

    isPlaying.value = !video.paused && !video.ended;
  }

  /**
   * 更新时间信息
   */
  function updateTimeInfo(): void {
    if (isDestroying) return;
    const video = videoRef.value;
    if (!video) return;

    currentTime.value = video.currentTime;
    duration.value = video.duration || 0;
  }

  /**
   * 更新音量信息
   */
  function updateVolumeInfo(): void {
    if (isDestroying) return;
    const video = videoRef.value;
    if (!video) return;

    volume.value = video.volume;
    isMuted.value = video.muted;
  }

  /**
   * 更新缓冲进度（带节流和变化阈值优化）
   */
  function updateBuffered(): void {
    if (isDestroying) return;
    const video = videoRef.value;
    if (!video || !video.buffered.length) return;

    // 节流：如果定时器正在运行，跳过本次更新
    if (bufferedUpdateTimer !== null) return;

    try {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      const videoDuration = video.duration || 0;
      const newBufferedValue =
        videoDuration > 0 ? bufferedEnd / videoDuration : 0;

      // 变化阈值：仅在变化超过 1% 时更新
      const bufferedChange = Math.abs(newBufferedValue - lastBufferedValue);
      if (bufferedChange >= BUFFERED_CHANGE_THRESHOLD) {
        buffered.value = newBufferedValue;
        lastBufferedValue = newBufferedValue;

        // 设置节流定时器
        bufferedUpdateTimer = window.setTimeout(() => {
          bufferedUpdateTimer = null;
        }, BUFFERED_UPDATE_INTERVAL);
      }
    } catch {
      // 忽略缓冲进度获取错误
    }
  }

  /**
   * 更新全屏状态
   */
  function updateFullscreenState(): void {
    if (isDestroying) return;
    const fullscreenEl =
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement ||
      null;
    isFullscreen.value = !!fullscreenEl;
    isNativeFullscreen.value = !!fullscreenEl;
  }

  /**
   * iOS webkit 全屏开始
   */
  function handleWebkitBeginFullscreen(): void {
    if (isDestroying) return;
    isNativeFullscreen.value = true;
    isFullscreen.value = true;
  }

  /**
   * iOS webkit 全屏结束
   */
  function handleWebkitEndFullscreen(): void {
    if (isDestroying) return;
    isNativeFullscreen.value = false;
    isFullscreen.value = false;
  }

  // 全屏事件取消订阅函数
  let unsubscribeFullscreen: (() => void) | null = null;

  /**
   * 绑定事件监听
   */
  function bindEvents(): void {
    const video = videoRef.value;
    if (!video) return;

    video.addEventListener('play', updatePlayingState);
    video.addEventListener('pause', updatePlayingState);
    video.addEventListener('ended', updatePlayingState);
    video.addEventListener('timeupdate', updateTimeInfo);
    video.addEventListener('durationchange', updateTimeInfo);
    video.addEventListener('volumechange', updateVolumeInfo);
    video.addEventListener('progress', updateBuffered);

    // iOS webkit 全屏事件
    video.addEventListener(
      'webkitbeginfullscreen',
      handleWebkitBeginFullscreen,
    );
    video.addEventListener('webkitendfullscreen', handleWebkitEndFullscreen);

    // 使用全屏管理器单例订阅全屏事件
    unsubscribeFullscreen = fullscreenManager.subscribe(updateFullscreenState);
  }

  /**
   * 解绑事件监听
   */
  function unbindEvents(): void {
    const video = videoRef.value;
    if (!video) return;

    video.removeEventListener('play', updatePlayingState);
    video.removeEventListener('pause', updatePlayingState);
    video.removeEventListener('ended', updatePlayingState);
    video.removeEventListener('timeupdate', updateTimeInfo);
    video.removeEventListener('durationchange', updateTimeInfo);
    video.removeEventListener('volumechange', updateVolumeInfo);
    video.removeEventListener('progress', updateBuffered);

    // iOS webkit 全屏事件
    video.removeEventListener(
      'webkitbeginfullscreen',
      handleWebkitBeginFullscreen,
    );
    video.removeEventListener('webkitendfullscreen', handleWebkitEndFullscreen);

    // 清理缓冲进度节流定时器
    if (bufferedUpdateTimer !== null) {
      window.clearTimeout(bufferedUpdateTimer);
      bufferedUpdateTimer = null;
    }

    // 取消全屏事件订阅
    if (unsubscribeFullscreen) {
      unsubscribeFullscreen();
      unsubscribeFullscreen = null;
    }
  }

  // 监听 video 元素变化
  watch(
    videoRef,
    (newVideo, oldVideo) => {
      if (oldVideo) {
        unbindEvents();
      }
      if (newVideo) {
        bindEvents();
        // 初始化状态
        updatePlayingState();
        updateTimeInfo();
        updateVolumeInfo();
        updateBuffered();
        updateFullscreenState();
      }
    },
    { immediate: true },
  );

  // 组件卸载时清理
  onBeforeUnmount(() => {
    isDestroying = true;
    unbindEvents();
  });

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isFullscreen,
    buffered,
    isReconnecting,
    autoPlayFailed,
    isNativeFullscreen,
  };
}
