import { watch, type Ref } from 'vue';
import type { VideoJsPlayer } from '../types';

/**
 * 控制插件配置
 */
export interface ControlsOptions {
  /** 是否禁用控制配置 */
  disabled?: boolean;
  /** 是否显示控制栏 */
  controls?: boolean;
  /** 是否自动播放 */
  autoPlay?: boolean;
  /** 是否静音 */
  muted?: boolean;
  /** 是否循环播放 */
  loop?: boolean;
  /** 预加载模式 */
  preload?: 'auto' | 'metadata' | 'none';
  /** 播放速度 */
  playbackRate?: number;
  /** 音量 (0-1) */
  volume?: number;
  /** 是否启用原生控制 */
  nativeControls?: boolean;
}

const DEFAULT_OPTIONS: Required<ControlsOptions> = {
  disabled: false,
  controls: true,
  autoPlay: false,
  muted: false,
  loop: false,
  preload: 'auto',
  playbackRate: 1,
  volume: 1,
  nativeControls: false,
};

/**
 * 播放控制功能
 */
export function useControls(
  videoRef: Ref<HTMLVideoElement | null>,
  playerRef: Ref<VideoJsPlayer | null>,
  options: Ref<ControlsOptions>,
) {
  function getOption<K extends keyof ControlsOptions>(
    key: K,
  ): Required<ControlsOptions>[K] {
    const value = options.value[key];
    return value !== undefined
      ? (value as Required<ControlsOptions>[K])
      : DEFAULT_OPTIONS[key];
  }

  /**
   * 配置 video 元素属性
   */
  function configureVideoElement(): void {
    const video = videoRef.value;
    if (!video) return;

    // 如果禁用了控制配置，直接返回
    if (getOption('disabled')) return;

    try {
      video.controls = getOption('nativeControls');
      video.autoplay = getOption('autoPlay');
      video.muted = getOption('muted');
      video.loop = getOption('loop');
      video.preload = getOption('preload');

      // 安全设置音量
      if (video.parentElement) {
        try {
          video.volume = getOption('volume');
        } catch {
          // 忽略音量设置错误
        }
      }

      // 播放速率需要等视频加载后设置
      const setPlaybackRate = () => {
        try {
          if (video.readyState > 0) {
            video.playbackRate = getOption('playbackRate');
          }
        } catch {
          // 忽略播放速率设置错误
        }
      };

      if (video.readyState > 0) {
        setPlaybackRate();
      } else {
        video.addEventListener('loadedmetadata', setPlaybackRate, {
          once: true,
        });
      }
    } catch {
      // 忽略配置错误
    }
  }

  /**
   * 配置 video.js 播放器
   */
  function configurePlayer(): void {
    const player = playerRef.value;
    if (!player?.el_ || !document.body.contains(player.el_)) return;

    // 如果禁用了控制配置，直接返回
    if (getOption('disabled')) return;

    try {
      if (typeof player.controls === 'function') {
        player.controls(getOption('controls'));
      }
      if (typeof player.playbackRate === 'function') {
        player.playbackRate(getOption('playbackRate'));
      }
      if (typeof player.volume === 'function') {
        player.volume(getOption('volume'));
      }
      if (typeof player.muted === 'function') {
        player.muted(getOption('muted'));
      }
    } catch {
      // 忽略配置错误
    }
  }

  /**
   * 应用所有配置
   */
  function apply(): void {
    configureVideoElement();
    configurePlayer();
  }

  // 监听 video 变化
  watch(videoRef, (video) => {
    if (video) configureVideoElement();
  });

  // 监听 player 变化
  watch(playerRef, (player) => {
    if (player) configurePlayer();
  });

  // 监听配置变化 - 优化：监听具体字段而非深度监听整个对象
  watch(
    () => [
      options.value.disabled,
      options.value.controls,
      options.value.autoPlay,
      options.value.muted,
      options.value.loop,
      options.value.preload,
      options.value.playbackRate,
      options.value.volume,
      options.value.nativeControls,
    ],
    apply,
  );

  return {
    apply,
    configureVideoElement,
    configurePlayer,
  };
}
