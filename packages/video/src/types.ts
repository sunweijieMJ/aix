import videojs from 'video.js';
import type { Ref } from 'vue';
import type { NetworkStatus } from './composables/useNetworkStatus';

// 重新导出 composables 类型
export type { ControlsOptions } from './composables/useControls';
export type { EventCallbacks } from './composables/useEvents';
export type {
  PlaybackController,
  PlaybackControllerOptions,
  EngineType,
} from './composables/usePlaybackController';
export type { HlsOptions } from './composables/useHls';
export type { FlvOptions } from './composables/useFlv';
export type { StreamAdapterOptions } from './composables/useStreamAdapter';
export type { PlayerState } from './composables/usePlayerState';
export type {
  VideoSourceType,
  VideoPlayerOptions,
  UseVideoPlayerReturn,
} from './composables/useVideoPlayer';
export type { NetworkStatus } from './composables/useNetworkStatus';

/**
 * video.js Player 实例类型
 */
export type VideoJsPlayer = ReturnType<typeof videojs>;

/**
 * video.js 播放器配置选项
 */
export interface VideoJsOptions {
  autoplay?: boolean | string;
  controls?: boolean;
  width?: number;
  height?: number;
  loop?: boolean;
  muted?: boolean;
  preload?: 'auto' | 'metadata' | 'none';
  src?: string;
  poster?: string;
  aspectRatio?: string;
  fluid?: boolean;
  responsive?: boolean;
  playsinline?: boolean;
  techOrder?: string[];
  sources?: Array<{ src: string; type: string }>;
  language?: string;
  [key: string]: unknown;
}

/**
 * VideoPlayer Props
 */
export interface VideoPlayerProps {
  /** 视频源地址 */
  src: string;
  /** 封面图 */
  poster?: string;
  /**
   * 是否自动播放
   * @default false
   */
  autoplay?: boolean;
  /**
   * 是否循环播放
   * @default false
   */
  loop?: boolean;
  /**
   * 是否静音
   * @default false
   */
  muted?: boolean;
  /**
   * 是否显示控制栏
   * @default true
   */
  controls?: boolean;
  /**
   * 是否响应式
   * @default true
   */
  responsive?: boolean;
  /**
   * 是否流式布局
   * @default true
   */
  fluid?: boolean;
  /** 宽度 */
  width?: number | string;
  /** 高度 */
  height?: number | string;
  /** 宽高比（如 '16:9'） */
  aspectRatio?: string;
  /**
   * 预加载策略
   * @default 'auto'
   */
  preload?: 'auto' | 'metadata' | 'none';
  /**
   * 是否透明背景
   * @default false
   */
  transparent?: boolean;
  /**
   * 是否跨域
   * @default true
   */
  crossOrigin?: boolean;
  /**
   * 是否启用调试日志
   * @default false
   */
  enableDebugLog?: boolean;
  /** video.js 额外配置 */
  options?: Partial<VideoJsOptions>;
  /** 流适配器配置 */
  streamOptions?: Omit<
    import('./composables/useStreamAdapter').StreamAdapterOptions,
    'onReady' | 'onError' | 'onFirstFrame'
  >;
  /** 视频源类型（不指定时自动推断） */
  sourceType?: import('./composables/useVideoPlayer').VideoSourceType;
  /**
   * 是否使用自定义控制栏
   * @default false
   */
  customControls?: boolean;
  /**
   * 是否启用触摸事件优化（移动端）
   * @default true
   */
  enableTouchEvents?: boolean;
  /**
   * 横屏时是否自动全屏
   * @default false
   */
  autoFullscreenOnLandscape?: boolean;
}

/**
 * VideoPlayer Emits
 */
export interface VideoPlayerEmits {
  /** 播放器就绪，返回 video.js 播放器实例 */
  (e: 'ready', player: VideoJsPlayer): void;
  /** 开始播放 */
  (e: 'play'): void;
  /** 暂停播放 */
  (e: 'pause'): void;
  /** 播放结束 */
  (e: 'ended'): void;
  /** 播放时间更新，返回当前时间和总时长（秒） */
  (e: 'timeupdate', currentTime: number, duration: number): void;
  /** 缓冲进度更新，返回已缓冲的百分比（0-1） */
  (e: 'progress', buffered: number): void;
  /** 播放错误，返回错误信息 */
  (e: 'error', error: Error): void;
  /** 音量变化，返回音量值（0-1）和是否静音 */
  (e: 'volumechange', volume: number, muted: boolean): void;
  /** 全屏状态变化，返回是否全屏 */
  (e: 'fullscreenchange', isFullscreen: boolean): void;
  /** 可以播放（已加载足够数据） */
  (e: 'canplay'): void;
  /** 数据加载完成 */
  (e: 'loadeddata'): void;
  /** 移动端自动播放策略触发静音，返回原因信息 */
  (
    e: 'autoplayMuted',
    reason: { reason: 'mobile-policy'; originalMuted: boolean },
  ): void;
  /** 网络离线 */
  (e: 'networkOffline'): void;
  /** 网络恢复在线 */
  (e: 'networkOnline'): void;
  /** 网络变慢，返回网络状态信息 */
  (e: 'networkSlow', status: NetworkStatus): void;
  /** 网络状态变化，返回网络状态信息 */
  (e: 'networkChange', status: NetworkStatus): void;
}

/**
 * VideoPlayer 暴露的方法
 */
export interface VideoPlayerExpose {
  /** 播放器是否就绪 */
  isReady: Ref<boolean>;
  /** 是否正在播放 */
  isPlaying: Ref<boolean>;
  /** 是否静音 */
  isMuted: Ref<boolean>;
  /** 是否正在重连 */
  isReconnecting: Ref<boolean>;
  /** 自动播放是否失败 */
  autoPlayFailed: Ref<boolean>;
  /** 是否处于浏览器原生全屏 */
  isNativeFullscreen: Ref<boolean>;
  /** 获取 video.js 播放器实例 */
  getPlayer: () => VideoJsPlayer | null;
  /** 获取 video 元素 */
  getVideo: () => HTMLVideoElement | null;
  /** 播放 */
  play: () => Promise<void>;
  /** 暂停 */
  pause: () => void;
  /** 跳转到指定时间 (秒) */
  seek: (time: number) => void;
  /** 设置音量 (0-1) */
  setVolume: (volume: number) => void;
  /** 获取音量 (0-1) */
  getVolume: () => number;
  /** 切换静音 */
  toggleMute: () => void;
  /** 进入/退出全屏 */
  toggleFullscreen: () => void;
  /** 进入浏览器原生全屏 */
  enterNativeFullscreen: () => void;
  /** 退出浏览器原生全屏 */
  exitNativeFullscreen: () => void;
  /** 进入/退出画中画 */
  togglePictureInPicture: () => Promise<void>;
  /** 获取当前播放时间 (秒) */
  getCurrentTime: () => number;
  /** 获取视频时长 (秒) */
  getDuration: () => number;
  /** 设置播放速率 (0.25-4) */
  setPlaybackRate: (rate: number) => void;
  /** 获取播放速率 */
  getPlaybackRate: () => number;
  /** 重新加载视频 */
  reload: () => void;
  /** 强制重载播放器（保留状态，用于修复卡顿/黑屏） */
  forceReload: (shouldPlay?: boolean) => void;
}

/**
 * SDK 加载配置
 */
export interface SdkLoaderConfig {
  /** SDK 名称 */
  name: string;
  /** 全局变量名 */
  globalName?: string;
  /** CDN 地址 */
  cdnUrl?: string;
  /** ES 模块导入函数 */
  importFn?: () => Promise<unknown>;
  /** 是否必须加载成功 */
  required?: boolean;
  /** 加载前的钩子 (用于加载 CSS 等前置依赖) */
  beforeLoad?: () => Promise<void>;
}

// ========================
// 自定义控制栏相关类型定义
// ========================

/**
 * 控制方法接口
 * 暴露给自定义控制栏的播放器控制方法
 */
export interface ControlMethods {
  /** 播放 */
  play: () => Promise<void>;
  /** 暂停 */
  pause: () => void;
  /** 跳转到指定时间 (秒) */
  seek: (time: number) => void;
  /** 设置音量 (0-1) */
  setVolume: (volume: number) => void;
  /** 获取音量 (0-1) */
  getVolume: () => number;
  /** 切换静音 */
  toggleMute: () => void;
  /** 进入/退出全屏 */
  toggleFullscreen: () => void;
  /** 进入浏览器原生全屏 */
  enterNativeFullscreen: () => void;
  /** 退出浏览器原生全屏 */
  exitNativeFullscreen: () => void;
  /** 进入/退出画中画 */
  togglePictureInPicture: () => Promise<void>;
  /** 设置播放速率 (0.25-4) */
  setPlaybackRate: (rate: number) => void;
  /** 获取播放速率 */
  getPlaybackRate: () => number;
  /** 重新加载视频 */
  reload: () => void;
  /** 强制重载播放器 */
  forceReload: (shouldPlay?: boolean) => void;
}
