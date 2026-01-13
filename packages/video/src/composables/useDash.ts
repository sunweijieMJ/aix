import type * as DashJS from 'dashjs';
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

type DashMediaPlayer = DashJS.MediaPlayerClass;

/**
 * useDash 返回类型
 */
export interface UseDashReturn {
  dashPlayer: ShallowRef<DashMediaPlayer | null>;
  isLoading: Ref<boolean>;
  isReady: Ref<boolean>;
  init: () => Promise<void>;
  destroy: () => void;
  isSupported: () => boolean;
}

/**
 * DASH 配置选项
 */
export interface DashOptions {
  /** 是否自动播放 */
  autoPlay?: boolean;
  /** 是否启用低延迟模式 */
  lowLatencyMode?: boolean;
  /** 自定义 DASH 配置 */
  dashConfig?: Record<string, unknown>;
  /** 回调 */
  onReady?: () => void;
  onError?: (error: Error) => void;
}

const DEFAULT_OPTIONS: Required<
  Omit<DashOptions, 'dashConfig' | 'onReady' | 'onError'>
> = {
  autoPlay: true,
  lowLatencyMode: false,
};

/**
 * DASH 流媒体支持
 */
export function useDash(
  videoRef: Ref<HTMLVideoElement | null>,
  uri: Ref<string>,
  options: Ref<DashOptions>,
): UseDashReturn {
  const dashPlayer = shallowRef<DashMediaPlayer | null>(null);
  const DashClass = shallowRef<typeof DashJS | null>(null);
  const isLoading = ref(false);
  const isReady = ref(false);
  // 销毁标记
  let isDestroying = false;
  // watch 清理函数
  let stopWatch: WatchStopHandle | null = null;

  // 使用工厂模式创建加载器 (与其他适配器风格一致)
  const dashLoader = sdkLoaders.dash();

  function getOption<K extends keyof typeof DEFAULT_OPTIONS>(
    key: K,
  ): (typeof DEFAULT_OPTIONS)[K] {
    const value = options.value[key];
    return value !== undefined
      ? (value as (typeof DEFAULT_OPTIONS)[K])
      : DEFAULT_OPTIONS[key];
  }

  /**
   * 初始化 DASH
   */
  async function init(): Promise<void> {
    const video = videoRef.value;
    const src = uri.value;

    if (!video || !src || isDestroying) return;

    // 销毁旧实例
    destroy();

    isLoading.value = true;

    // 加载 DASH SDK
    if (!DashClass.value) {
      const sdk = await dashLoader.load();
      if (!sdk) {
        options.value.onError?.(new Error('dashjs 加载失败'));
        isLoading.value = false;
        return;
      }
      DashClass.value = sdk;
    }

    const dashjs = DashClass.value;

    try {
      const player = dashjs.MediaPlayer().create();

      // 配置
      player.initialize(video, src, getOption('autoPlay'));

      // 低延迟模式
      if (getOption('lowLatencyMode')) {
        player.updateSettings({
          streaming: {
            delay: {
              liveDelay: 2,
            },
            liveCatchup: {
              maxDrift: 0.05,
              playbackRate: { min: 0.5, max: 1.5 },
              enabled: true,
            },
          },
        });
      }

      // 应用自定义配置
      if (options.value.dashConfig) {
        player.updateSettings(
          options.value.dashConfig as Record<string, unknown>,
        );
      }

      // 事件监听
      player.on('streamInitialized', () => {
        isReady.value = true;
        isLoading.value = false;
        options.value.onReady?.();
      });

      player.on('error', (e: DashJS.ErrorEvent) => {
        const errorObj = e.error;
        const errorMessage =
          typeof errorObj === 'object' && errorObj && 'message' in errorObj
            ? (errorObj as { message: string }).message
            : '未知错误';
        const error = new Error(`DASH 错误: ${errorMessage}`);
        options.value.onError?.(error);
      });

      dashPlayer.value = player;
    } catch (error) {
      isLoading.value = false;
      options.value.onError?.(
        error instanceof Error ? error : new Error('初始化 DASH 播放器失败'),
      );
    }
  }

  /**
   * 销毁 DASH 实例
   */
  function destroy(): void {
    isDestroying = true;

    // 停止 watch
    if (stopWatch) {
      stopWatch();
      stopWatch = null;
    }

    if (dashPlayer.value) {
      try {
        dashPlayer.value.reset();
        dashPlayer.value = null;
      } catch {
        // 忽略销毁错误
      }
    }
    isReady.value = false;
    isDestroying = false;
  }

  /**
   * 检查是否支持 DASH
   */
  function isSupported(): boolean {
    // MediaSource API 支持检测
    return typeof window !== 'undefined' && 'MediaSource' in window;
  }

  // 监听变化自动初始化 (保存 stop 函数以便销毁时清理)
  stopWatch = watch([videoRef, uri], ([video, src]) => {
    if (video && src && !isDestroying) {
      init();
    }
  });

  onBeforeUnmount(destroy);

  return {
    dashPlayer,
    isLoading,
    isReady,
    init,
    destroy,
    isSupported,
  };
}
