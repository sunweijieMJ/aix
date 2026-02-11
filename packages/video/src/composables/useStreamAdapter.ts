import {
  ref,
  shallowRef,
  computed,
  watchEffect,
  onBeforeUnmount,
  type Ref,
  type ComputedRef,
} from 'vue';
import { StreamProtocol, detectProtocol, isNativeFormat } from '../constants';
import { useDash, type DashOptions, type UseDashReturn } from './useDash';
import { useFlv, type FlvOptions, type UseFlvReturn } from './useFlv';
import { useHls, type HlsOptions, type UseHlsReturn } from './useHls';
import { useRtsp, type RtspOptions, type UseRtspReturn } from './useRtsp';
import {
  useWebRTC,
  type WebRTCOptions,
  type UseWebRTCReturn,
} from './useWebRTC';

/**
 * 流适配器配置
 */
export interface StreamAdapterOptions {
  /** 强制指定流协议类型 */
  protocol?: StreamProtocol;
  /** 是否自动检测协议 */
  autoDetectProtocol?: boolean;
  /** 是否启用调试日志 */
  enableDebugLog?: boolean;
  /** 防抖延迟（毫秒），用于优化频繁切换，默认 50ms。直播场景建议设置为 0-20ms，点播场景可设置为 50-100ms */
  debounceDelay?: number;
  /** HLS 特定配置 */
  hlsOptions?: Omit<HlsOptions, 'onReady' | 'onError'>;
  /** FLV 特定配置 */
  flvOptions?: Omit<FlvOptions, 'onError' | 'onFirstFrame'>;
  /** DASH 特定配置 */
  dashOptions?: Omit<DashOptions, 'onReady' | 'onError'>;
  /** RTSP 特定配置 */
  rtspOptions?: Omit<RtspOptions, 'onReady' | 'onError'>;
  /** WebRTC 特定配置 */
  webrtcOptions?: Omit<WebRTCOptions, 'onReady' | 'onError'>;
  /** 回调 */
  onReady?: () => void;
  onError?: (error: Error) => void;
  onFirstFrame?: () => void;
}

const DEFAULT_OPTIONS = {
  autoDetectProtocol: true,
  enableDebugLog: false,
  debounceDelay: 50,
};

/**
 * useStreamAdapter 返回类型
 */
export interface UseStreamAdapterReturn {
  currentProtocol: Ref<StreamProtocol>;
  protocolType: ComputedRef<StreamProtocol>;
  needsSpecialHandler: ComputedRef<boolean>;
  isReady: Ref<boolean>;
  hls: UseHlsReturn;
  flv: UseFlvReturn;
  dash: UseDashReturn;
  rtsp: UseRtspReturn;
  webrtc: UseWebRTCReturn;
  destroy: () => void;
  reload: () => void;
}

/**
 * 适配器实例类型
 */
type AdapterInstance = ReturnType<
  | typeof useHls
  | typeof useFlv
  | typeof useDash
  | typeof useRtsp
  | typeof useWebRTC
>;

/**
 * 惰性适配器包装器
 * 仅在需要时才创建适配器实例
 */
interface LazyAdapter<T extends AdapterInstance> {
  /** 获取适配器实例 (惰性创建，首次调用时创建，总是返回有效实例) */
  get: () => T;
  /** 销毁适配器 */
  destroy: () => void;
  /** 是否已初始化 */
  isInitialized: () => boolean;
}

/**
 * 创建惰性适配器
 */
function createLazyAdapter<T extends AdapterInstance>(
  factory: () => T,
): LazyAdapter<T> {
  let instance: T | null = null;

  return {
    get() {
      if (!instance) {
        instance = factory();
      }
      return instance;
    },
    destroy() {
      if (instance) {
        instance.destroy();
        instance = null;
      }
    },
    isInitialized() {
      return instance !== null;
    },
  };
}

/**
 * 流协议自动适配 (按需实例化版本)
 *
 * 优化: 适配器仅在对应协议匹配时才创建，减少内存和响应式开销
 */
export function useStreamAdapter(
  videoRef: Ref<HTMLVideoElement | null>,
  uri: Ref<string>,
  options: Ref<StreamAdapterOptions>,
): UseStreamAdapterReturn {
  const currentProtocol = ref<StreamProtocol>(StreamProtocol.Unknown);
  const isReady = ref(false);
  // 记录当前已加载的 src，避免重复设置
  let currentLoadedSrc = '';
  // 使用 LRU 缓存多个 URL 的规范化结果，限制最大缓存数量
  const MAX_URL_CACHE_SIZE = 50;
  const urlCache = new Map<string, string>();

  function getOption<K extends keyof typeof DEFAULT_OPTIONS>(
    key: K,
  ): (typeof DEFAULT_OPTIONS)[K] {
    const value = options.value[key];
    return value !== undefined
      ? (value as (typeof DEFAULT_OPTIONS)[K])
      : DEFAULT_OPTIONS[key];
  }

  // 检测协议
  const protocolType = computed<StreamProtocol>(() => {
    if (options.value.protocol) {
      return options.value.protocol;
    }
    if (getOption('autoDetectProtocol')) {
      return detectProtocol(uri.value);
    }
    return StreamProtocol.Unknown;
  });

  // 是否需要特殊处理
  const needsSpecialHandler = computed(
    () => !isNativeFormat(protocolType.value),
  );

  // ==========================================
  // 惰性适配器配置 (仅在访问时才创建)
  // ==========================================

  // 用于触发适配器初始化的 URI (按协议过滤)
  const hlsUri = shallowRef('');
  const flvUri = shallowRef('');
  const dashUri = shallowRef('');
  const rtspUri = shallowRef('');
  const webrtcUri = shallowRef('');

  // HLS 配置
  const hlsOptions = computed<HlsOptions>(() => ({
    autoPlay: options.value.hlsOptions?.autoPlay ?? true,
    lowLatencyMode: options.value.hlsOptions?.lowLatencyMode ?? true,
    hlsConfig: options.value.hlsOptions?.hlsConfig,
    onReady: () => {
      isReady.value = true;
      options.value.onReady?.();
    },
    onError: options.value.onError,
  }));

  // FLV 配置
  const flvOptions = computed<FlvOptions>(() => ({
    isLive:
      protocolType.value === StreamProtocol.RTMP ||
      options.value.flvOptions?.isLive,
    hasVideo: options.value.flvOptions?.hasVideo ?? true,
    hasAudio: options.value.flvOptions?.hasAudio ?? true,
    diffCritical: options.value.flvOptions?.diffCritical,
    frameTraceOffset: options.value.flvOptions?.frameTraceOffset,
    maxReplayAttempts: options.value.flvOptions?.maxReplayAttempts,
    monitorInterval: options.value.flvOptions?.monitorInterval,
    timeUpdateInterval: options.value.flvOptions?.timeUpdateInterval,
    enableDebugLog: getOption('enableDebugLog'),
    flvConfig: options.value.flvOptions?.flvConfig,
    onError: options.value.onError,
    onFirstFrame: options.value.onFirstFrame,
    onTimeUpdate: options.value.flvOptions?.onTimeUpdate,
  }));

  // DASH 配置
  const dashOptions = computed<DashOptions>(() => ({
    autoPlay: options.value.dashOptions?.autoPlay ?? true,
    lowLatencyMode: options.value.dashOptions?.lowLatencyMode ?? false,
    dashConfig: options.value.dashOptions?.dashConfig,
    onReady: () => {
      isReady.value = true;
      options.value.onReady?.();
    },
    onError: options.value.onError,
  }));

  // RTSP 配置
  const rtspOptions = computed<RtspOptions>(() => ({
    convertMode: options.value.rtspOptions?.convertMode ?? 'websocket',
    wsProxyUrl: options.value.rtspOptions?.wsProxyUrl,
    hlsConvertUrl: options.value.rtspOptions?.hlsConvertUrl,
    webrtcSignalUrl: options.value.rtspOptions?.webrtcSignalUrl,
    mimeType: options.value.rtspOptions?.mimeType,
    videoCodec: options.value.rtspOptions?.videoCodec,
    audioCodec: options.value.rtspOptions?.audioCodec,
    enableDebugLog: getOption('enableDebugLog'),
    onReady: () => {
      isReady.value = true;
      options.value.onReady?.();
    },
    onError: options.value.onError,
  }));

  // WebRTC 配置
  const webrtcOptions = computed<WebRTCOptions>(() => ({
    signalServerUrl: options.value.webrtcOptions?.signalServerUrl,
    iceServers: options.value.webrtcOptions?.iceServers,
    enableAudio: options.value.webrtcOptions?.enableAudio ?? true,
    enableVideo: options.value.webrtcOptions?.enableVideo ?? true,
    enableDebugLog: getOption('enableDebugLog'),
    onReady: () => {
      isReady.value = true;
      options.value.onReady?.();
    },
    onError: options.value.onError,
  }));

  // ==========================================
  // 惰性适配器实例
  // ==========================================

  const lazyHls = createLazyAdapter(() => useHls(videoRef, hlsUri, hlsOptions));
  const lazyFlv = createLazyAdapter(() => useFlv(videoRef, flvUri, flvOptions));
  const lazyDash = createLazyAdapter(() =>
    useDash(videoRef, dashUri, dashOptions),
  );
  const lazyRtsp = createLazyAdapter(() =>
    useRtsp(videoRef, rtspUri, rtspOptions),
  );
  const lazyWebrtc = createLazyAdapter(() =>
    useWebRTC(videoRef, webrtcUri, webrtcOptions),
  );

  /**
   * 规范化 URL 用于比较 (使用 LRU 缓存)
   */
  function normalizeUrl(url: string): string {
    if (!url) return '';

    // 检查缓存
    if (urlCache.has(url)) {
      // LRU: 将访问的项移到最后
      const value = urlCache.get(url)!;
      urlCache.delete(url);
      urlCache.set(url, value);
      return value;
    }

    // 缓存已满，删除最旧的项（Map 的第一个键）
    if (urlCache.size >= MAX_URL_CACHE_SIZE) {
      const firstKey = urlCache.keys().next().value;
      if (firstKey !== undefined) {
        urlCache.delete(firstKey);
      }
    }

    // 规范化并缓存
    try {
      const normalized = new URL(url, window.location.origin).href;
      urlCache.set(url, normalized);
      return normalized;
    } catch {
      urlCache.set(url, url);
      return url;
    }
  }

  /**
   * 处理原生格式
   */
  function handleNativeFormat(): void {
    const video = videoRef.value;
    if (!video || !uri.value) return;

    // 规范化 URL 进行比较，避免相对/绝对路径差异导致的误判
    const normalizedUri = normalizeUrl(uri.value);
    const normalizedVideoSrc = normalizeUrl(video.src);

    // 避免重复设置相同的 src，防止中断正在进行的 play() 操作
    if (
      currentLoadedSrc === uri.value &&
      normalizedVideoSrc === normalizedUri
    ) {
      return;
    }

    // 临时阻止 pause 事件冒泡，避免触发不必要的副作用
    const tempPauseHandler = (e: Event) => {
      e.stopImmediatePropagation();
    };

    video.addEventListener('pause', tempPauseHandler, { capture: true });

    // 设置 src 前先暂停视频，避免 "play() was interrupted" 错误
    if (!video.paused) {
      video.pause();
    }

    currentLoadedSrc = uri.value;
    video.src = uri.value;
    video.load(); // 显式调用 load，确保加载完整

    // 移除临时事件处理器
    video.removeEventListener('pause', tempPauseHandler, { capture: true });

    video.addEventListener(
      'loadedmetadata',
      () => {
        isReady.value = true;
        options.value.onReady?.();
      },
      { once: true },
    );

    video.addEventListener(
      'error',
      () => {
        const error = video.error;
        options.value.onError?.(new Error(error?.message || '视频加载错误'));
      },
      { once: true },
    );
  }

  /**
   * 根据协议更新对应适配器的 URI
   * 仅设置匹配协议的 URI，其他清空
   */
  function updateAdapterUri(protocol: StreamProtocol, src: string): void {
    // 清空所有
    hlsUri.value = '';
    flvUri.value = '';
    dashUri.value = '';
    rtspUri.value = '';
    webrtcUri.value = '';

    // 设置匹配的协议
    switch (protocol) {
      case StreamProtocol.HLS:
        hlsUri.value = src;
        lazyHls.get(); // 触发惰性创建
        break;
      case StreamProtocol.FLV:
      case StreamProtocol.RTMP:
        flvUri.value = src;
        lazyFlv.get();
        break;
      case StreamProtocol.DASH:
        dashUri.value = src;
        lazyDash.get();
        break;
      case StreamProtocol.RTSP:
        rtspUri.value = src;
        lazyRtsp.get();
        break;
      case StreamProtocol.WebRTC:
        webrtcUri.value = src;
        lazyWebrtc.get();
        break;
    }
  }

  /**
   * 销毁所有已创建的适配器
   */
  function destroy(): void {
    // 清理防抖定时器
    if (updateTimer !== null) {
      clearTimeout(updateTimer);
      updateTimer = null;
    }

    // 停止 watchEffect
    if (stopWatchEffect) {
      stopWatchEffect();
    }

    lazyHls.destroy();
    lazyFlv.destroy();
    lazyDash.destroy();
    lazyRtsp.destroy();
    lazyWebrtc.destroy();

    // 清空 URI
    hlsUri.value = '';
    flvUri.value = '';
    dashUri.value = '';
    rtspUri.value = '';
    webrtcUri.value = '';

    // 清空 URL 缓存
    urlCache.clear();

    isReady.value = false;
    currentLoadedSrc = '';
  }

  /**
   * 重新加载
   */
  function reload(): void {
    destroy();
    // 手动触发初始化
    const protocol = protocolType.value;
    currentProtocol.value = protocol;
    isReady.value = false;

    if (!needsSpecialHandler.value && videoRef.value && uri.value) {
      handleNativeFormat();
    } else if (needsSpecialHandler.value && uri.value) {
      updateAdapterUri(protocol, uri.value);
    }
  }

  // 使用 watchEffect 并添加防抖，优化触发频率
  let updateTimer: number | null = null;

  const stopWatchEffect = watchEffect(() => {
    const video = videoRef.value;
    const src = uri.value;
    const protocol = protocolType.value;

    if (!video || !src) return;

    // 防抖处理，避免频繁触发
    if (updateTimer !== null) {
      clearTimeout(updateTimer);
    }

    const debounceDelay = getOption('debounceDelay');
    updateTimer = window.setTimeout(() => {
      currentProtocol.value = protocol;
      if (!needsSpecialHandler.value) {
        handleNativeFormat();
      } else {
        updateAdapterUri(protocol, src);
      }
      updateTimer = null;
    }, debounceDelay);
  });

  onBeforeUnmount(destroy);

  // 创建兼容的适配器访问接口
  // 提供与原 API 兼容的访问方式，同时支持惰性加载
  const adapterAccessors = {
    get hls() {
      return lazyHls.get();
    },
    get flv() {
      return lazyFlv.get();
    },
    get dash() {
      return lazyDash.get();
    },
    get rtsp() {
      return lazyRtsp.get();
    },
    get webrtc() {
      return lazyWebrtc.get();
    },
  };

  return {
    currentProtocol,
    protocolType,
    needsSpecialHandler,
    isReady,
    // 适配器访问 (惰性)
    ...adapterAccessors,
    // 方法
    destroy,
    reload,
  };
}
