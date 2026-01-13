import videojs from 'video.js';
import type { Ref } from 'vue';

// 重新导出 composables 类型
export type { ControlsOptions } from './composables/useControls';
export type { EventCallbacks } from './composables/useEvents';
export type {
  PlaybackController,
  PlaybackControllerOptions,
} from './composables/usePlaybackController';
export type { HlsOptions } from './composables/useHls';
export type { FlvOptions } from './composables/useFlv';
export type { StreamAdapterOptions } from './composables/useStreamAdapter';
export type { PlayerState } from './composables/usePlayerState';

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
 * VideoPlayer 暴露的方法
 */
export interface VideoPlayerExpose {
  /** 播放器是否就绪 */
  isReady: Ref<boolean>;
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
  /** 进入/退出画中画 */
  togglePictureInPicture: () => Promise<void>;
  /** 获取当前播放时间 (秒) */
  getCurrentTime: () => number;
  /** 获取视频时长 (秒) */
  getDuration: () => number;
  /** 重新加载视频 */
  reload: () => void;
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
  /** 进入/退出画中画 */
  togglePictureInPicture: () => Promise<void>;
  /** 重新加载视频 */
  reload: () => void;
}
