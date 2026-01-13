import type flvjs from 'flv.js';
import {
  ref,
  shallowRef,
  watch,
  onBeforeUnmount,
  type Ref,
  type ShallowRef,
  type WatchStopHandle,
} from 'vue';
import { sdkLoaders } from './useSdkLoader';
import { useTimerWithVisibility } from './useTimerWithVisibility';

type FlvPlayer = flvjs.Player;

/**
 * useFlv 返回类型
 */
export interface UseFlvReturn {
  flvPlayer: ShallowRef<FlvPlayer | null>;
  isLoading: Ref<boolean>;
  isReady: Ref<boolean>;
  init: () => Promise<void>;
  destroy: () => void;
  isSupported: () => boolean;
}
type FlvMediaDataSource = flvjs.MediaDataSource;
type FlvPlayerConfig = flvjs.Config;

/**
 * FLV 配置选项
 */
export interface FlvOptions {
  /** 是否为直播流 */
  isLive?: boolean;
  /** 是否有视频轨道 */
  hasVideo?: boolean;
  /** 是否有音频轨道 */
  hasAudio?: boolean;
  /** 追帧临界值(秒) */
  diffCritical?: number;
  /** 追帧偏移量(秒) */
  frameTraceOffset?: number;
  /** 最大重试次数 */
  maxReplayAttempts?: number;
  /** 监控定时器间隔(毫秒)，直播建议 1000，点播建议 3000 或更高 */
  monitorInterval?: number;
  /** 是否启用调试日志 */
  enableDebugLog?: boolean;
  /** 自定义 flv.js 配置 */
  flvConfig?: Record<string, unknown>;
  /** 回调 */
  onError?: (error: Error) => void;
  onFirstFrame?: () => void;
}

const DEFAULT_OPTIONS: Required<
  Omit<FlvOptions, 'flvConfig' | 'onError' | 'onFirstFrame'>
> = {
  isLive: true,
  hasVideo: true,
  hasAudio: true,
  diffCritical: 10,
  frameTraceOffset: 1.5,
  maxReplayAttempts: 100,
  monitorInterval: 1000,
  enableDebugLog: false,
};

/**
 * FLV 流媒体支持
 */
export function useFlv(
  videoRef: Ref<HTMLVideoElement | null>,
  uri: Ref<string>,
  options: Ref<FlvOptions>,
): UseFlvReturn {
  const flvPlayer = shallowRef<FlvPlayer | null>(null);
  const FlvClass = shallowRef<typeof flvjs | null>(null);
  const isLoading = ref(false);
  const isReady = ref(false);
  const isDestroying = ref(false);

  let firstFrameRendered = false;
  let attemptCount = 0;
  // watch 清理函数
  let stopWatch: WatchStopHandle | null = null;
  // 监控定时器控制器
  let monitoringTimer: ReturnType<typeof useTimerWithVisibility> | null = null;

  const flvLoader = sdkLoaders.flv();

  function getOption<K extends keyof typeof DEFAULT_OPTIONS>(
    key: K,
  ): (typeof DEFAULT_OPTIONS)[K] {
    const value = options.value[key];
    return value !== undefined
      ? (value as (typeof DEFAULT_OPTIONS)[K])
      : DEFAULT_OPTIONS[key];
  }

  function logDebug(message: string, ...args: unknown[]): void {
    if (getOption('enableDebugLog')) {
      console.log(`[FlvPlugin] ${message}`, ...args);
    }
  }

  /**
   * 创建播放器配置
   */
  function createPlayerConfig(): FlvMediaDataSource {
    return {
      type: 'flv',
      isLive: getOption('isLive'),
      hasVideo: getOption('hasVideo'),
      hasAudio: getOption('hasAudio'),
      url: uri.value,
    };
  }

  /**
   * 销毁播放器
   */
  function destroy(): void {
    isDestroying.value = true;

    // 停止 watch
    if (stopWatch) {
      stopWatch();
      stopWatch = null;
    }

    // 销毁监控定时器
    if (monitoringTimer) {
      monitoringTimer.destroy();
      monitoringTimer = null;
    }

    if (flvPlayer.value) {
      try {
        flvPlayer.value.pause();
        flvPlayer.value.unload();
        flvPlayer.value.detachMediaElement();
        flvPlayer.value.destroy();
        flvPlayer.value = null;
      } catch {
        // 忽略销毁错误
      }
    }

    isReady.value = false;
    isDestroying.value = false;
  }

  /**
   * 初始化播放器
   */
  async function init(): Promise<void> {
    const video = videoRef.value;
    const src = uri.value;

    if (!video || !src || isDestroying.value) return;

    destroy();
    isLoading.value = true;
    firstFrameRendered = false;
    attemptCount = 0;

    // 加载 SDK
    if (!FlvClass.value) {
      const sdk = await flvLoader.load();
      if (!sdk) {
        options.value.onError?.(new Error('flv.js 加载失败'));
        isLoading.value = false;
        return;
      }
      FlvClass.value = sdk;
    }

    const flvjs = FlvClass.value;

    if (!flvjs.isSupported()) {
      options.value.onError?.(new Error('浏览器不支持 flv.js'));
      isLoading.value = false;
      return;
    }

    try {
      logDebug('初始化 FLV 播放器', { uri: src });

      const playerConfig = createPlayerConfig();
      const player = flvjs.createPlayer(playerConfig, {
        enableWorker: true,
        ...options.value.flvConfig,
      } as FlvPlayerConfig);

      flvPlayer.value = player;

      player.on(
        flvjs.Events.ERROR,
        (errorType: string, errorDetail: string) => {
          if (isDestroying.value) return;
          options.value.onError?.(
            new Error(`FLV 错误: ${errorType} - ${errorDetail}`),
          );
        },
      );

      player.attachMediaElement(video);
      player.load();

      // flv.js 的 play() 可能返回 Promise，需要正确处理
      try {
        const playPromise = player.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            // 忽略 "play() was interrupted" 等错误
          });
        }
      } catch {
        // 忽略播放错误
      }

      isReady.value = true;
      isLoading.value = false;
      logDebug('FLV 播放器初始化成功');

      // 设置监控
      setupMonitoring();
    } catch (error) {
      isLoading.value = false;
      options.value.onError?.(
        error instanceof Error ? error : new Error('初始化 FLV 播放器失败'),
      );
    }
  }

  /**
   * 监控回调函数
   */
  function runMonitoringTick(): void {
    // 检查销毁标记，防止内存泄漏
    if (isDestroying.value || !flvPlayer.value) {
      monitoringTimer?.stop();
      return;
    }

    const player = flvPlayer.value;

    try {
      const stats = player.statisticsInfo;
      const currentDecodedFrames = stats?.decodedFrames || 0;

      // 首帧检测
      if (!firstFrameRendered && currentDecodedFrames > 0) {
        firstFrameRendered = true;
        logDebug('首帧渲染完成');
        options.value.onFirstFrame?.();
      }

      // 追帧逻辑
      if (
        getOption('isLive') &&
        player.buffered &&
        player.buffered.length > 0
      ) {
        const end = player.buffered.end(0);
        const current = player.currentTime;
        const diff = end - current;

        if (diff > getOption('diffCritical')) {
          logDebug(`追帧: 差距 ${diff.toFixed(2)} 秒`);
          player.currentTime = end - getOption('frameTraceOffset');
        }
      }

      // 解码监控
      if (stats && typeof stats.decodedFrames === 'number') {
        const droppedFrames = stats.droppedFrames ?? 0;
        const isStalled = droppedFrames > 0 && stats.decodedFrames === 0;

        if (!isStalled && currentDecodedFrames > 0) {
          attemptCount = 0;
        } else if (isStalled) {
          attemptCount += 1;

          if (attemptCount >= getOption('maxReplayAttempts')) {
            logDebug('解码停滞时间过长，重新加载视频');
            attemptCount = 0;

            if (!isDestroying.value) {
              destroy();
              setTimeout(() => {
                if (!isDestroying.value) {
                  init();
                }
              }, 500);
            }
          }
        }
      }
    } catch {
      // 忽略监控错误
    }
  }

  /**
   * 设置监控定时器 (使用 useTimerWithVisibility)
   */
  function setupMonitoring(): void {
    // 销毁旧的监控定时器
    if (monitoringTimer) {
      monitoringTimer.destroy();
    }

    // 创建新的监控定时器
    monitoringTimer = useTimerWithVisibility(
      runMonitoringTick,
      getOption('monitorInterval'),
      {
        canStart: () => !!flvPlayer.value && !isDestroying.value,
        onPause: () => logDebug('页面隐藏，暂停监控'),
        onResume: () => logDebug('页面可见，恢复监控'),
      },
    );

    // 启动定时器
    monitoringTimer.start();
  }

  /**
   * 检查是否支持 FLV
   */
  function isSupported(): boolean {
    if (FlvClass.value) {
      return FlvClass.value.isSupported();
    }
    return false;
  }

  // 监听变化 (保存 stop 函数以便销毁时清理)
  stopWatch = watch([videoRef, uri], ([video, src]) => {
    if (video && src && !isDestroying.value) {
      init();
    }
  });

  onBeforeUnmount(destroy);

  return {
    flvPlayer,
    isLoading,
    isReady,
    init,
    destroy,
    isSupported,
  };
}
