import type Hls from 'hls.js';
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

/**
 * useHls 返回类型
 */
export interface UseHlsReturn {
  hlsInstance: ShallowRef<Hls | null>;
  isLoading: Ref<boolean>;
  isReady: Ref<boolean>;
  init: () => Promise<void>;
  destroy: () => void;
  isSupported: () => boolean;
}

/**
 * HLS 配置选项
 */
export interface HlsOptions {
  /** 是否自动播放 */
  autoPlay?: boolean;
  /** 是否启用低延迟模式 */
  lowLatencyMode?: boolean;
  /** 网络错误最大重试次数 */
  maxNetworkRetries?: number;
  /** 媒体错误最大重试次数 */
  maxMediaRetries?: number;
  /** 自定义 HLS 配置 */
  hlsConfig?: Record<string, unknown>;
  /** 回调 */
  onReady?: () => void;
  onError?: (error: Error) => void;
}

const DEFAULT_OPTIONS: Required<
  Omit<HlsOptions, 'hlsConfig' | 'onReady' | 'onError'>
> = {
  autoPlay: true,
  lowLatencyMode: true,
  maxNetworkRetries: 3,
  maxMediaRetries: 3,
};

/**
 * HLS 流媒体支持
 */
export function useHls(
  videoRef: Ref<HTMLVideoElement | null>,
  uri: Ref<string>,
  options: Ref<HlsOptions>,
): UseHlsReturn {
  const hlsInstance = shallowRef<Hls | null>(null);
  const HlsClass = shallowRef<typeof Hls | null>(null);
  const isLoading = ref(false);
  const isReady = ref(false);
  // 销毁标记
  let isDestroying = false;
  // watch 清理函数
  let stopWatch: WatchStopHandle | null = null;
  // 错误重试计数器
  let networkRetryCount = 0;
  let mediaRetryCount = 0;

  const hlsLoader = sdkLoaders.hls();

  function getOption<K extends keyof typeof DEFAULT_OPTIONS>(
    key: K,
  ): (typeof DEFAULT_OPTIONS)[K] {
    const value = options.value[key];
    return value !== undefined
      ? (value as (typeof DEFAULT_OPTIONS)[K])
      : DEFAULT_OPTIONS[key];
  }

  /**
   * 初始化 HLS
   */
  async function init(): Promise<void> {
    const video = videoRef.value;
    const src = uri.value;

    if (!video || !src || isDestroying) return;

    // 销毁旧实例
    destroy();

    // 重置重试计数器
    networkRetryCount = 0;
    mediaRetryCount = 0;

    isLoading.value = true;

    // 加载 HLS SDK
    if (!HlsClass.value) {
      const sdk = await hlsLoader.load();
      if (!sdk) {
        options.value.onError?.(new Error('hls.js 加载失败'));
        isLoading.value = false;
        return;
      }
      HlsClass.value = sdk;
    }

    const Hls = HlsClass.value;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: getOption('lowLatencyMode'),
        ...options.value.hlsConfig,
      });

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(src);
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        isReady.value = true;
        isLoading.value = false;

        // 重置重试计数器（manifest 解析成功表示连接正常）
        networkRetryCount = 0;
        mediaRetryCount = 0;

        if (getOption('autoPlay')) {
          video.play().catch(() => {
            // 忽略自动播放失败
          });
        }
        options.value.onReady?.();
      });

      hls.on(
        Hls.Events.ERROR,
        (_event: string, data: { fatal: boolean; type: string }) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (networkRetryCount < getOption('maxNetworkRetries')) {
                  networkRetryCount++;
                  console.warn(
                    `[HLS] 网络错误，正在重试 (${networkRetryCount}/${getOption('maxNetworkRetries')})`,
                  );
                  hls.startLoad();
                } else {
                  options.value.onError?.(
                    new Error(
                      `HLS 网络错误: 已达到最大重试次数 (${getOption('maxNetworkRetries')})`,
                    ),
                  );
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                if (mediaRetryCount < getOption('maxMediaRetries')) {
                  mediaRetryCount++;
                  console.warn(
                    `[HLS] 媒体错误，正在恢复 (${mediaRetryCount}/${getOption('maxMediaRetries')})`,
                  );
                  hls.recoverMediaError();
                } else {
                  options.value.onError?.(
                    new Error(
                      `HLS 媒体错误: 已达到最大重试次数 (${getOption('maxMediaRetries')})`,
                    ),
                  );
                }
                break;
              default:
                options.value.onError?.(
                  new Error(`HLS 致命错误: ${data.type}`),
                );
                break;
            }
          }
        },
      );

      // 加载成功后重置重试计数器
      hls.on(Hls.Events.FRAG_LOADED, () => {
        networkRetryCount = 0;
        mediaRetryCount = 0;
      });

      hls.attachMedia(video);
      hlsInstance.value = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari 原生支持
      video.src = src;
      video.addEventListener(
        'loadedmetadata',
        () => {
          isReady.value = true;
          isLoading.value = false;
          options.value.onReady?.();
        },
        { once: true },
      );
      video.addEventListener(
        'error',
        () => {
          isLoading.value = false;
          options.value.onError?.(new Error('原生 HLS 播放错误'));
        },
        { once: true },
      );

      if (getOption('autoPlay')) {
        video.play().catch(() => {});
      }
    } else {
      isLoading.value = false;
      options.value.onError?.(new Error('该浏览器不支持 HLS'));
    }
  }

  /**
   * 销毁 HLS 实例
   */
  function destroy(): void {
    isDestroying = true;

    // 停止 watch
    if (stopWatch) {
      stopWatch();
      stopWatch = null;
    }

    if (hlsInstance.value) {
      hlsInstance.value.destroy();
      hlsInstance.value = null;
    }
    isReady.value = false;
    isDestroying = false;
  }

  /**
   * 检查是否支持 HLS
   */
  function isSupported(): boolean {
    if (HlsClass.value) {
      return HlsClass.value.isSupported();
    }
    // 检查原生支持
    const video = document.createElement('video');
    return Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
  }

  // 监听变化自动初始化 (保存 stop 函数以便销毁时清理)
  stopWatch = watch([videoRef, uri], ([video, src]) => {
    if (video && src && !isDestroying) {
      init();
    }
  });

  onBeforeUnmount(destroy);

  return {
    hlsInstance,
    isLoading,
    isReady,
    init,
    destroy,
    isSupported,
  };
}
