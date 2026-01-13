import {
  ref,
  watch,
  onBeforeUnmount,
  type Ref,
  type WatchStopHandle,
} from 'vue';

/**
 * useRtsp 返回类型
 */
export interface UseRtspReturn {
  isLoading: Ref<boolean>;
  isReady: Ref<boolean>;
  convertedUrl: Ref<string>;
  init: () => Promise<void>;
  destroy: () => void;
  isSupported: () => boolean;
  getConvertedUrl: () => string;
}

/**
 * RTSP 配置选项
 *
 * 注意: RTSP 协议无法在浏览器中直接播放，需要通过以下方式转换:
 * 1. 服务端转码为 HLS/DASH/WebSocket
 * 2. 使用 WebSocket 代理 + flv.js
 * 3. 使用 WebRTC 网关
 */
export interface RtspOptions {
  /** 转换方式 */
  convertMode?: 'websocket' | 'hls' | 'webrtc';
  /** WebSocket 代理地址 (当 convertMode 为 websocket 时) */
  wsProxyUrl?: string;
  /** HLS 转换地址 (当 convertMode 为 hls 时) */
  hlsConvertUrl?: string;
  /** WebRTC 信令服务器地址 (当 convertMode 为 webrtc 时) */
  webrtcSignalUrl?: string;
  /** MediaSource MIME 类型 (WebSocket 模式) */
  mimeType?: string;
  /** 视频编解码器 (WebSocket 模式) */
  videoCodec?: string;
  /** 音频编解码器 (WebSocket 模式) */
  audioCodec?: string;
  /** 是否启用调试日志 */
  enableDebugLog?: boolean;
  /** 回调 */
  onReady?: () => void;
  onError?: (error: Error) => void;
}

const DEFAULT_OPTIONS: Required<
  Omit<
    RtspOptions,
    'wsProxyUrl' | 'hlsConvertUrl' | 'webrtcSignalUrl' | 'onReady' | 'onError'
  >
> = {
  convertMode: 'websocket',
  mimeType: 'video/mp4',
  videoCodec: 'avc1.42E01E',
  audioCodec: 'mp4a.40.2',
  enableDebugLog: false,
};

/**
 * RTSP 流媒体支持
 *
 * 浏览器不支持直接播放 RTSP，此 composable 提供转换方案
 */
export function useRtsp(
  videoRef: Ref<HTMLVideoElement | null>,
  uri: Ref<string>,
  options: Ref<RtspOptions>,
): UseRtspReturn {
  const isLoading = ref(false);
  const isReady = ref(false);
  const convertedUrl = ref<string>('');

  // WebSocket 连接
  let wsConnection: WebSocket | null = null;
  // MediaSource 用于 WebSocket 模式
  let mediaSource: MediaSource | null = null;
  let sourceBuffer: SourceBuffer | null = null;
  // 销毁标记
  let isDestroying = false;
  // watch 清理函数
  let stopWatch: WatchStopHandle | null = null;

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
      console.log(`[RTSP] ${message}`, ...args);
    }
  }

  /**
   * 通过 WebSocket 代理播放 RTSP
   */
  async function initWebSocketMode(): Promise<void> {
    const video = videoRef.value;
    const rtspUrl = uri.value;
    const wsProxyUrl = options.value.wsProxyUrl;

    if (!video || !rtspUrl || !wsProxyUrl) {
      options.value.onError?.(new Error('WebSocket 代理地址未配置'));
      return;
    }

    // 检查 MediaSource 支持
    if (!('MediaSource' in window)) {
      options.value.onError?.(new Error('浏览器不支持 MediaSource API'));
      return;
    }

    try {
      logDebug('初始化 WebSocket RTSP 代理', { rtspUrl, wsProxyUrl });

      mediaSource = new MediaSource();
      video.src = URL.createObjectURL(mediaSource);

      mediaSource.addEventListener('sourceopen', () => {
        if (!mediaSource) return;

        // 构建 MIME 类型字符串 (支持自定义编解码器)
        const mimeType = getOption('mimeType');
        const videoCodec = getOption('videoCodec');
        const audioCodec = getOption('audioCodec');
        const codecString = `${mimeType}; codecs="${videoCodec}, ${audioCodec}"`;

        logDebug('使用 codec:', codecString);
        sourceBuffer = mediaSource.addSourceBuffer(codecString);

        // 建立 WebSocket 连接
        const wsUrl = `${wsProxyUrl}?url=${encodeURIComponent(rtspUrl)}`;
        wsConnection = new WebSocket(wsUrl);
        wsConnection.binaryType = 'arraybuffer';

        wsConnection.onopen = () => {
          logDebug('WebSocket 连接已建立');
          isReady.value = true;
          isLoading.value = false;
          options.value.onReady?.();
        };

        wsConnection.onmessage = (event) => {
          if (
            sourceBuffer &&
            !sourceBuffer.updating &&
            mediaSource?.readyState === 'open'
          ) {
            try {
              sourceBuffer.appendBuffer(event.data);
            } catch {
              // 缓冲区满，等待
            }
          }
        };

        wsConnection.onerror = () => {
          options.value.onError?.(new Error('WebSocket 连接错误'));
        };

        wsConnection.onclose = () => {
          logDebug('WebSocket 连接已关闭');
        };
      });
    } catch (error) {
      options.value.onError?.(
        error instanceof Error
          ? error
          : new Error('初始化 RTSP WebSocket 代理失败'),
      );
    }
  }

  /**
   * 通过 HLS 转换播放 RTSP
   */
  async function initHlsMode(): Promise<void> {
    const rtspUrl = uri.value;
    const hlsConvertUrl = options.value.hlsConvertUrl;

    if (!rtspUrl || !hlsConvertUrl) {
      options.value.onError?.(new Error('HLS 转换地址未配置'));
      return;
    }

    // 构建 HLS 转换 URL
    convertedUrl.value = `${hlsConvertUrl}?url=${encodeURIComponent(rtspUrl)}`;
    logDebug('RTSP 转 HLS', { rtspUrl, hlsUrl: convertedUrl.value });

    // 返回转换后的 URL，由调用方使用 useHls 处理
    isReady.value = true;
    isLoading.value = false;
    options.value.onReady?.();
  }

  /**
   * 通过 WebRTC 网关播放 RTSP
   */
  async function initWebRtcMode(): Promise<void> {
    const rtspUrl = uri.value;
    const signalUrl = options.value.webrtcSignalUrl;

    if (!rtspUrl || !signalUrl) {
      options.value.onError?.(new Error('WebRTC 信令服务器地址未配置'));
      return;
    }

    // WebRTC 模式需要更复杂的信令实现
    // 这里提供基础框架，具体实现需要根据信令服务器协议调整
    logDebug('RTSP 转 WebRTC (需要信令服务器支持)', { rtspUrl, signalUrl });

    options.value.onError?.(new Error('WebRTC 模式需要配置信令服务器'));
  }

  /**
   * 初始化 RTSP 播放
   */
  async function init(): Promise<void> {
    const video = videoRef.value;
    const src = uri.value;

    if (!video || !src || isDestroying) return;

    destroy();
    isLoading.value = true;

    const mode = getOption('convertMode');

    switch (mode) {
      case 'websocket':
        await initWebSocketMode();
        break;
      case 'hls':
        await initHlsMode();
        break;
      case 'webrtc':
        await initWebRtcMode();
        break;
      default:
        options.value.onError?.(new Error(`不支持的转换模式: ${mode}`));
    }
  }

  /**
   * 销毁 RTSP 连接
   */
  function destroy(): void {
    isDestroying = true;

    // 停止 watch
    if (stopWatch) {
      stopWatch();
      stopWatch = null;
    }

    // 关闭 WebSocket
    if (wsConnection) {
      wsConnection.close();
      wsConnection = null;
    }

    // 清理 MediaSource
    if (mediaSource && mediaSource.readyState === 'open') {
      try {
        mediaSource.endOfStream();
      } catch {
        // 忽略
      }
    }
    mediaSource = null;
    sourceBuffer = null;

    // 清理 video src
    const video = videoRef.value;
    if (video && video.src.startsWith('blob:')) {
      URL.revokeObjectURL(video.src);
      video.src = '';
    }

    convertedUrl.value = '';
    isReady.value = false;
    isDestroying = false;
  }

  /**
   * 检查是否支持 RTSP (通过转换)
   */
  function isSupported(): boolean {
    // RTSP 需要转换，检查 MediaSource 支持
    return typeof window !== 'undefined' && 'MediaSource' in window;
  }

  /**
   * 获取转换后的 URL (用于 HLS 模式)
   */
  function getConvertedUrl(): string {
    return convertedUrl.value;
  }

  // 监听变化 (保存 stop 函数以便销毁时清理)
  stopWatch = watch([videoRef, uri], ([video, src]) => {
    if (video && src && !isDestroying) {
      init();
    }
  });

  onBeforeUnmount(destroy);

  return {
    isLoading,
    isReady,
    convertedUrl,
    init,
    destroy,
    isSupported,
    getConvertedUrl,
  };
}
