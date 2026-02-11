import videojs from 'video.js';
import {
  ref,
  shallowRef,
  computed,
  watch,
  onBeforeUnmount,
  type Ref,
  type ComputedRef,
} from 'vue';
import { StreamProtocol, detectProtocol, DEFAULT_VIDEOJS_OPTIONS } from '../constants';
import type { VideoJsPlayer, VideoJsOptions } from '../types';
import { isMobileDevice } from '../utils';
import { useControls, type ControlsOptions } from './useControls';
import { useEvents, type EventCallbacks } from './useEvents';
import {
  usePlaybackController,
  type PlaybackController,
  type EngineType,
} from './usePlaybackController';
import { usePlayerState } from './usePlayerState';
import {
  useStreamAdapter,
  type StreamAdapterOptions,
} from './useStreamAdapter';

/**
 * 视频源类型
 */
export type VideoSourceType = 'video/mp4' | 'video/x-flv' | 'application/x-mpegURL' | 'application/dash+xml';

/**
 * useVideoPlayer 配置选项
 */
export interface VideoPlayerOptions {
  /** 是否自动播放 */
  autoplay?: boolean;
  /** 是否循环播放 */
  loop?: boolean;
  /** 是否静音 */
  muted?: boolean;
  /** 是否显示控制栏 */
  controls?: boolean;
  /** 是否响应式 */
  responsive?: boolean;
  /** 是否流式布局 */
  fluid?: boolean;
  /** 宽高比 */
  aspectRatio?: string;
  /** 封面图 */
  poster?: string;
  /** 预加载策略 */
  preload?: 'auto' | 'metadata' | 'none';
  /** 是否启用调试日志 */
  enableDebugLog?: boolean;
  /** 视频源类型（不指定时自动推断） */
  sourceType?: VideoSourceType;
  /** 是否使用自定义控制栏（隐藏默认控制栏） */
  customControls?: boolean;
  /** video.js 额外配置 */
  videojsOptions?: Partial<VideoJsOptions>;
  /** 流适配器配置 */
  streamOptions?: Omit<StreamAdapterOptions, 'onReady' | 'onError' | 'onFirstFrame'>;
  /** 回调 */
  onReady?: (player: VideoJsPlayer) => void;
  onError?: (error: Error) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onProgress?: (buffered: number) => void;
  onVolumeChange?: (volume: number, muted: boolean) => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  onCanPlay?: () => void;
  onLoadedData?: () => void;
  onFirstFrame?: () => void;
  /** 移动端自动播放被迫静音时触发 */
  onAutoplayMuted?: (reason: { reason: 'mobile-policy'; originalMuted: boolean }) => void;
}

/**
 * useVideoPlayer 返回类型
 */
export interface UseVideoPlayerReturn {
  /** Video.js 播放器实例 */
  player: Ref<VideoJsPlayer | null>;
  /** 播放器是否就绪 */
  isReady: Ref<boolean>;
  /** 当前引擎类型 */
  engineType: ComputedRef<EngineType>;
  /** 播放器状态 (响应式) */
  playerState: {
    isPlaying: Ref<boolean>;
    currentTime: Ref<number>;
    duration: Ref<number>;
    volume: Ref<number>;
    isMuted: Ref<boolean>;
    isFullscreen: Ref<boolean>;
    buffered: Ref<number>;
    isReconnecting: Ref<boolean>;
    autoPlayFailed: Ref<boolean>;
    isNativeFullscreen: Ref<boolean>;
  };
  /** 统一播放控制器 */
  controller: PlaybackController;
  /** 流适配器 reload */
  reloadStream: () => void;
  /** 强制重载播放器（保留状态） */
  forceReload: (shouldPlay?: boolean) => void;
  /** 销毁 */
  destroy: () => void;
}

// 健康检查常量
const HEALTH_CHECK_INTERVAL = 5000;
const STALL_THRESHOLD = 3;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_TIMEOUT = 30000;
const LOADED_METADATA_TIMEOUT = 5000;

/**
 * 统一视频播放器 composable
 *
 * 包装 Video.js + StreamAdapter，提供：
 * - 双引擎感知（Video.js / 原生 video）
 * - 健康检查 + 自动重连
 * - 强制重载
 * - 自动播放降级
 * - 初始化锁 + 竞态保护
 * - 生命周期安全
 */
export function useVideoPlayer(
  videoRef: Ref<HTMLVideoElement | null>,
  uri: Ref<string>,
  options: Ref<VideoPlayerOptions>,
): UseVideoPlayerReturn {
  const player = shallowRef<VideoJsPlayer | null>(null);
  const isReady = ref(false);
  const isInitialized = ref(false);

  // 生命周期保护
  let isDestroying = false;
  // 初始化锁
  let isInitializing = false;
  let pendingInitUri: string | null = null;
  // 健康检查
  let healthCheckTimer: number | null = null;
  let lastPlaybackTime = 0;
  let stallCount = 0;
  // 重连
  let reconnectAttempts = 0;
  let reconnectTimeoutTimer: number | null = null;
  // loadedmetadata 超时保护
  const loadMetadataTimeouts = new Set<number>();

  const LOG_PREFIX = '[VideoPlayer]';

  function log(message: string, ...args: unknown[]): void {
    if (options.value.enableDebugLog) {
      console.log(`${LOG_PREFIX} ${message}`, ...args);
    }
  }

  function logError(message: string, ...args: unknown[]): void {
    console.error(`${LOG_PREFIX} ${message}`, ...args);
  }

  // ==========================================
  // 引擎类型检测
  // ==========================================

  const detectedProtocol = computed(() =>
    options.value.streamOptions?.protocol || detectProtocol(uri.value),
  );

  const engineType = computed<EngineType>(() => {
    const protocol = detectedProtocol.value;
    // FLV, RTMP, WebRTC 使用原生 video 元素控制（由各自的 SDK 驱动）
    if (
      protocol === StreamProtocol.FLV ||
      protocol === StreamProtocol.RTMP ||
      protocol === StreamProtocol.WebRTC
    ) {
      return 'native';
    }
    // MP4, HLS, DASH, RTSP 等走 Video.js
    return 'videojs';
  });

  // ==========================================
  // 子 composable 桥接
  // ==========================================

  const controlsOptions = computed<ControlsOptions>(() => ({
    controls: options.value.customControls ? false : options.value.controls,
    autoPlay: options.value.autoplay,
    muted: options.value.muted,
    loop: options.value.loop,
    preload: options.value.preload,
  }));

  const eventCallbacks = computed<EventCallbacks>(() => ({
    onPlay: () => {
      if (!isDestroying) options.value.onPlay?.();
    },
    onPause: () => {
      if (!isDestroying) options.value.onPause?.();
    },
    onEnded: () => {
      if (!isDestroying) options.value.onEnded?.();
    },
    onTimeUpdate: (currentTime, duration) => {
      if (!isDestroying) options.value.onTimeUpdate?.(currentTime, duration);
    },
    onProgress: (buffered) => {
      if (!isDestroying) options.value.onProgress?.(buffered);
    },
    onVolumeChange: (volume, muted) => {
      if (!isDestroying) options.value.onVolumeChange?.(volume, muted);
    },
    onFullscreen: (isFs) => {
      if (!isDestroying) options.value.onFullscreenChange?.(isFs);
    },
    onCanPlay: () => {
      if (!isDestroying) options.value.onCanPlay?.();
    },
    onLoadedData: () => {
      if (!isDestroying) options.value.onLoadedData?.();
    },
    onError: (error) => {
      if (!isDestroying) options.value.onError?.(error);
    },
    onFirstFrame: () => {
      if (!isDestroying) options.value.onFirstFrame?.();
    },
  }));

  const streamAdapterOptions = computed<StreamAdapterOptions>(() => ({
    ...options.value.streamOptions,
    enableDebugLog: options.value.enableDebugLog,
    onError: (error: Error) => {
      if (!isDestroying) options.value.onError?.(error);
    },
    onReady: () => {
      // StreamAdapter ready（用于 native 格式或特殊协议的 ready 信号）
      if (!isDestroying && engineType.value === 'native') {
        isReady.value = true;
      }
    },
    onFirstFrame: () => {
      if (!isDestroying) options.value.onFirstFrame?.();
    },
  }));

  // 子 composable 实例
  useControls(videoRef, player, controlsOptions);
  useEvents(videoRef, player, eventCallbacks);
  const streamAdapter = useStreamAdapter(videoRef, uri, streamAdapterOptions);

  // 播放器状态
  const stateRefs = usePlayerState(videoRef);

  // 统一控制器
  const controller = usePlaybackController({
    player,
    videoRef,
    engineType,
  });

  // ==========================================
  // 自动播放降级
  // ==========================================

  function tryAutoplayWithFallback(): void {
    if (isDestroying) return;

    const vjsPlayer = player.value;
    if (!vjsPlayer) return;

    const shouldMute = options.value.muted ?? false;
    stateRefs.autoPlayFailed.value = false;

    vjsPlayer.muted(shouldMute);
    stateRefs.isMuted.value = shouldMute;

    vjsPlayer.play()?.then(() => {
      stateRefs.autoPlayFailed.value = false;
    }).catch(() => {
      if (!shouldMute) {
        log('有声自动播放失败，降级为静音播放');
        vjsPlayer.muted(true);
        stateRefs.isMuted.value = true;
        vjsPlayer.play()?.then(() => {
          stateRefs.autoPlayFailed.value = false;
        }).catch(() => {
          logError('静音自动播放也失败');
          stateRefs.autoPlayFailed.value = true;
        });
      } else {
        logError('静音自动播放失败');
        stateRefs.autoPlayFailed.value = true;
      }
    });
  }

  // ==========================================
  // 健康检查 + 自动重连
  // ==========================================

  function startHealthCheck(): void {
    stopHealthCheck();
    lastPlaybackTime = 0;
    stallCount = 0;

    healthCheckTimer = window.setInterval(() => {
      if (isDestroying || !stateRefs.isPlaying.value) return;

      const video = videoRef.value;
      if (!video) return;

      const currentPlaybackTime = video.currentTime || 0;

      if (
        stateRefs.isPlaying.value &&
        currentPlaybackTime === lastPlaybackTime &&
        currentPlaybackTime > 0
      ) {
        stallCount++;
        log(`检测到播放卡顿 (${stallCount}/${STALL_THRESHOLD})`);

        if (stallCount >= STALL_THRESHOLD) {
          log('播放持续卡顿，尝试重连');
          attemptReconnect();
        }
      } else {
        if (stallCount > 0) {
          log('播放恢复正常');
        }
        stallCount = 0;
        reconnectAttempts = 0;
      }

      lastPlaybackTime = currentPlaybackTime;
    }, HEALTH_CHECK_INTERVAL);
  }

  function stopHealthCheck(): void {
    if (healthCheckTimer !== null) {
      window.clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
    stallCount = 0;
  }

  function clearReconnectTimeout(): void {
    if (reconnectTimeoutTimer !== null) {
      window.clearTimeout(reconnectTimeoutTimer);
      reconnectTimeoutTimer = null;
    }
  }

  function attemptReconnect(): void {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logError(`已达到最大重连次数 (${MAX_RECONNECT_ATTEMPTS})，停止重连`);
      stateRefs.isReconnecting.value = false;
      clearReconnectTimeout();
      options.value.onError?.(new Error('播放持续卡顿，请手动刷新'));
      return;
    }

    reconnectAttempts++;
    stallCount = 0;
    stateRefs.isReconnecting.value = true;
    log(`开始第 ${reconnectAttempts} 次重连`);

    clearReconnectTimeout();
    reconnectTimeoutTimer = window.setTimeout(() => {
      if (stateRefs.isReconnecting.value) {
        logError('重连超时，重置状态');
        stateRefs.isReconnecting.value = false;
        options.value.onError?.(new Error('重连超时，请手动刷新'));
      }
    }, RECONNECT_TIMEOUT);

    forceReload(true);
  }

  // ==========================================
  // 强制重载
  // ==========================================

  function forceReload(shouldPlay: boolean = false): void {
    const src = uri.value;
    if (!src || isDestroying) return;

    log('强制重载', { src, shouldPlay, engine: engineType.value });

    if (engineType.value === 'native') {
      // Native 引擎（FLV 等）：通过 StreamAdapter 重载
      streamAdapter.reload();

      // 重载后恢复播放
      if (shouldPlay) {
        const video = videoRef.value;
        if (video) {
          // 延迟播放，等待 adapter 重新初始化
          setTimeout(() => {
            if (isDestroying) return;
            video.play()?.then(() => {
              stateRefs.autoPlayFailed.value = false;
              clearReconnectTimeout();
              stateRefs.isReconnecting.value = false;
            }).catch(() => {
              clearReconnectTimeout();
              stateRefs.isReconnecting.value = false;
            });
          }, 200);
        }
      } else {
        clearReconnectTimeout();
        stateRefs.isReconnecting.value = false;
      }
    } else if (player.value) {
      // Video.js 引擎：reset + 重设源
      const vjsPlayer = player.value;
      const wasMuted = vjsPlayer.muted();
      const wasPlaying = stateRefs.isPlaying.value || shouldPlay;

      stopHealthCheck();

      try {
        vjsPlayer.pause();
        vjsPlayer.reset();
      } catch {
        // 忽略错误
      }

      vjsPlayer.src({
        src,
        type: options.value.sourceType || undefined,
      });

      // loadedmetadata 超时保护
      let timeoutId: number | null = null;
      timeoutId = window.setTimeout(() => {
        if (isDestroying) return;
        if (timeoutId !== null) {
          loadMetadataTimeouts.delete(timeoutId);
          timeoutId = null;
        }
        vjsPlayer.off('loadedmetadata');
        if (!healthCheckTimer) {
          log('loadedmetadata 超时，强制恢复健康检查');
          startHealthCheck();
        }
        if (stateRefs.isReconnecting.value) {
          clearReconnectTimeout();
          stateRefs.isReconnecting.value = false;
        }
      }, LOADED_METADATA_TIMEOUT);
      loadMetadataTimeouts.add(timeoutId);

      vjsPlayer.one('loadedmetadata', () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          loadMetadataTimeouts.delete(timeoutId);
          timeoutId = null;
        }

        log('元数据加载完成，恢复播放状态');
        vjsPlayer.muted(wasMuted);
        startHealthCheck();

        if (wasPlaying) {
          vjsPlayer.play()?.then(() => {
            stateRefs.autoPlayFailed.value = false;
            clearReconnectTimeout();
            stateRefs.isReconnecting.value = false;
          }).catch(() => {
            // 降级静音播放
            vjsPlayer.muted(true);
            stateRefs.isMuted.value = true;
            vjsPlayer.play()?.then(() => {
              stateRefs.autoPlayFailed.value = false;
              clearReconnectTimeout();
              stateRefs.isReconnecting.value = false;
            }).catch(() => {
              clearReconnectTimeout();
              stateRefs.isReconnecting.value = false;
            });
          });
        } else {
          clearReconnectTimeout();
          stateRefs.isReconnecting.value = false;
        }
      });

      vjsPlayer.load();
    }
  }

  // ==========================================
  // Video.js 初始化
  // ==========================================

  function initPlayer(): void {
    const video = videoRef.value;
    if (!video || isInitialized.value || isDestroying) return;

    if (!document.body.contains(video)) return;

    // 仅在 videojs 引擎模式下初始化 Video.js
    // native 引擎（FLV 等）由 StreamAdapter 处理
    if (engineType.value === 'native') {
      log('当前为 native 引擎模式，跳过 Video.js 初始化');
      isInitialized.value = true;
      return;
    }

    if (isInitializing) {
      pendingInitUri = uri.value;
      return;
    }
    isInitializing = true;
    pendingInitUri = null;

    try {
      // 移动端自动播放降级通知
      let autoplayMuted = options.value.muted ?? false;
      if (isMobileDevice() && options.value.autoplay && !autoplayMuted) {
        log('移动端自动播放需要静音');
        autoplayMuted = true;
        options.value.onAutoplayMuted?.({
          reason: 'mobile-policy',
          originalMuted: options.value.muted ?? false,
        });
      }

      const playerOptions: VideoJsOptions = {
        ...DEFAULT_VIDEOJS_OPTIONS,
        autoplay: options.value.autoplay,
        controls: options.value.customControls ? false : options.value.controls,
        responsive: options.value.responsive,
        fluid: options.value.fluid,
        loop: options.value.loop,
        muted: autoplayMuted,
        preload: options.value.preload,
        aspectRatio: options.value.aspectRatio,
        poster: options.value.poster,
        ...options.value.videojsOptions,
      };

      const vjsPlayer = videojs(video, playerOptions);

      vjsPlayer.ready(() => {
        if (isDestroying) return;
        player.value = vjsPlayer;
        isReady.value = true;
        isInitialized.value = true;
        isInitializing = false;

        log('Video.js 初始化完成');
        options.value.onReady?.(vjsPlayer);

        // 启动健康检查
        startHealthCheck();

        // 自动播放降级处理
        if (options.value.autoplay) {
          tryAutoplayWithFallback();
        }

        // 处理等待中的初始化请求
        if (pendingInitUri && pendingInitUri !== uri.value) {
          const pending = pendingInitUri;
          pendingInitUri = null;
          log('处理等待中的 URI 变化', { pending });
        }
      });
    } catch (error) {
      isInitializing = false;
      const err = error instanceof Error ? error : new Error(String(error));
      logError('初始化失败:', err);
      options.value.onError?.(err);
    }
  }

  function destroyPlayer(): void {
    stopHealthCheck();
    clearReconnectTimeout();

    // 清理所有 loadedmetadata 超时
    loadMetadataTimeouts.forEach((id) => window.clearTimeout(id));
    loadMetadataTimeouts.clear();

    if (player.value) {
      try {
        player.value.dispose();
      } catch {
        // 忽略销毁错误
      }
      player.value = null;
    }

    isReady.value = false;
    isInitialized.value = false;
    isInitializing = false;
    pendingInitUri = null;
  }

  // ==========================================
  // 完整销毁
  // ==========================================

  function destroy(): void {
    isDestroying = true;
    streamAdapter.destroy();
    destroyPlayer();
    isDestroying = false;
  }

  // ==========================================
  // 生命周期
  // ==========================================

  // 监听 video 元素变化
  watch(videoRef, (video) => {
    if (video && !isInitialized.value && !isDestroying) {
      requestAnimationFrame(() => initPlayer());
    }
  });

  // 监听引擎类型变化（src 从 MP4 切到 FLV 等场景）
  watch(engineType, (newEngine, oldEngine) => {
    if (newEngine !== oldEngine && isInitialized.value && !isDestroying) {
      log(`引擎类型变化 ${oldEngine} → ${newEngine}，重新初始化`);
      destroyPlayer();
      requestAnimationFrame(() => initPlayer());
    }
  });

  onBeforeUnmount(destroy);

  return {
    player,
    isReady,
    engineType,
    playerState: stateRefs,
    controller,
    reloadStream: () => streamAdapter.reload(),
    forceReload,
    destroy,
  };
}
