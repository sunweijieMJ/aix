import type { ComputedRef, Ref } from 'vue';
import type { VideoJsPlayer } from '../types';
import { isIOS } from '../utils';

/**
 * 引擎类型
 * - videojs: 通过 Video.js 控制（MP4, HLS, DASH）
 * - native: 直接操作原生 video 元素（FLV, RTMP, WebRTC）
 */
export type EngineType = 'videojs' | 'native';

/**
 * Webkit 全屏 API 类型声明
 */
interface WebkitHTMLVideoElement extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
}

interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => void;
}

/**
 * 播放控制器接口 - 统一播放控制 API
 */
export interface PlaybackController {
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  toggleMute: () => void;
  isMuted: () => boolean;
  toggleFullscreen: () => void;
  isFullscreen: () => boolean;
  enterNativeFullscreen: () => void;
  exitNativeFullscreen: () => void;
  togglePictureInPicture: () => Promise<void>;
  isPictureInPicture: () => boolean;
  getCurrentTime: () => number;
  getDuration: () => number;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
}

export interface PlaybackControllerOptions {
  /** video.js 播放器实例 */
  player: Ref<VideoJsPlayer | null>;
  /** 原生 video 元素引用（用于 native 引擎模式） */
  videoRef?: Ref<HTMLVideoElement | null>;
  /** 当前引擎类型 */
  engineType?: ComputedRef<EngineType>;
}

/**
 * 获取当前全屏元素（兼容所有浏览器前缀）
 */
function getFullscreenElement(): Element | null {
  return (
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement ||
    null
  );
}

/**
 * 获取实际的 video 元素
 */
function getVideoElement(
  player: VideoJsPlayer | null,
  videoRef: HTMLVideoElement | null,
  engine: EngineType,
): HTMLVideoElement | null {
  if (engine === 'native') {
    return videoRef;
  }
  if (player) {
    try {
      const tech = player.tech({ IWillNotUseThisInPlugins: true });
      return (tech?.el() as HTMLVideoElement) ?? null;
    } catch {
      return player.el()?.querySelector('video') ?? null;
    }
  }
  return null;
}

/**
 * 统一播放控制器
 * 支持 Video.js 引擎和原生 video 元素的双引擎分流
 */
export function usePlaybackController(
  options: PlaybackControllerOptions,
): PlaybackController {
  const { player, videoRef } = options;

  function getEngine(): EngineType {
    return options.engineType?.value ?? 'videojs';
  }

  function getVideo(): HTMLVideoElement | null {
    return getVideoElement(player.value, videoRef?.value ?? null, getEngine());
  }

  /**
   * iOS 全屏处理
   */
  function handleIOSFullscreen(video: HTMLVideoElement): void {
    if (document.fullscreenEnabled) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        video.requestFullscreen().catch(() => {
          fallbackToWebkitFullscreen(video);
        });
      }
      return;
    }
    fallbackToWebkitFullscreen(video);
  }

  function fallbackToWebkitFullscreen(video: HTMLVideoElement): void {
    const webkitVideo = video as WebkitHTMLVideoElement;
    const webkitDocument = document as WebkitDocument;
    if (webkitVideo.webkitEnterFullscreen) {
      if (webkitDocument.webkitFullscreenElement) {
        webkitDocument.webkitExitFullscreen?.();
      } else {
        webkitVideo.webkitEnterFullscreen();
      }
    }
  }

  function handleStandardFullscreen(vjsPlayer: VideoJsPlayer): void {
    if (vjsPlayer.isFullscreen()) {
      vjsPlayer.exitFullscreen();
    } else {
      vjsPlayer.requestFullscreen();
    }
  }

  return {
    async play() {
      const engine = getEngine();
      if (engine === 'native') {
        const video = videoRef?.value;
        if (video) {
          try {
            await video.play();
          } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
              throw error;
            }
          }
        }
      } else if (player.value) {
        try {
          await player.value.play();
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            throw error;
          }
        }
      }
    },

    pause() {
      const engine = getEngine();
      if (engine === 'native') {
        videoRef?.value?.pause();
      } else {
        player.value?.pause();
      }
    },

    seek(time: number) {
      const engine = getEngine();
      if (engine === 'native') {
        const video = videoRef?.value;
        if (video) {
          video.currentTime = time;
        }
      } else {
        player.value?.currentTime(time);
      }
    },

    setVolume(volume: number) {
      const safeVolume = Math.max(0, Math.min(1, volume));
      const engine = getEngine();
      if (engine === 'native') {
        const video = videoRef?.value;
        if (video) {
          video.volume = safeVolume;
        }
      } else {
        player.value?.volume(safeVolume);
      }
    },

    getVolume() {
      const engine = getEngine();
      if (engine === 'native') {
        return videoRef?.value?.volume ?? 1;
      }
      return player.value?.volume() ?? 1;
    },

    toggleMute() {
      const engine = getEngine();
      if (engine === 'native') {
        const video = videoRef?.value;
        if (video) {
          video.muted = !video.muted;
        }
      } else if (player.value) {
        player.value.muted(!player.value.muted());
      }
    },

    isMuted() {
      const engine = getEngine();
      if (engine === 'native') {
        return videoRef?.value?.muted ?? false;
      }
      return player.value?.muted() ?? false;
    },

    toggleFullscreen() {
      const engine = getEngine();
      if (engine === 'native') {
        const video = videoRef?.value;
        if (video) {
          if (isIOS()) {
            handleIOSFullscreen(video);
          } else if (getFullscreenElement()) {
            document.exitFullscreen?.();
          } else {
            video.requestFullscreen?.();
          }
        }
      } else if (player.value) {
        if (isIOS()) {
          const video = getVideo();
          if (video) {
            handleIOSFullscreen(video);
          }
        } else {
          handleStandardFullscreen(player.value);
        }
      }
    },

    isFullscreen() {
      if (isIOS()) {
        const webkitDocument = document as WebkitDocument;
        return !!(
          document.fullscreenElement || webkitDocument.webkitFullscreenElement
        );
      }
      const engine = getEngine();
      if (engine === 'native') {
        return !!getFullscreenElement();
      }
      return player.value?.isFullscreen() ?? false;
    },

    enterNativeFullscreen() {
      const video = getVideo();
      if (!video || !video.isConnected) {
        console.error('[PlaybackController] 无法获取有效的 video 元素');
        return;
      }

      // iOS 优先使用 webkitEnterFullscreen
      if (isIOS()) {
        const webkitVideo = video as WebkitHTMLVideoElement;
        if (webkitVideo.webkitEnterFullscreen) {
          try {
            webkitVideo.webkitEnterFullscreen();
            return;
          } catch {
            // 降级到标准 API
          }
        }
      }

      // 标准全屏 API（兼容各浏览器前缀）
      const requestFullscreen =
        video.requestFullscreen ||
        (video as any).webkitRequestFullscreen ||
        (video as any).mozRequestFullScreen ||
        (video as any).msRequestFullscreen;

      if (requestFullscreen) {
        const result = requestFullscreen.call(video);
        if (result && typeof result.then === 'function') {
          result.catch((err: Error) => {
            console.error('[PlaybackController] 进入原生全屏失败:', err);
          });
        }
      }
    },

    exitNativeFullscreen() {
      const video = getVideo();

      // iOS 优先使用 webkitExitFullscreen
      if (isIOS() && video) {
        const webkitVideo = video as WebkitHTMLVideoElement;
        if (webkitVideo.webkitExitFullscreen) {
          try {
            webkitVideo.webkitExitFullscreen();
            return;
          } catch {
            // 降级到标准 API
          }
        }
      }

      // 标准退出全屏
      const exitFullscreen =
        document.exitFullscreen ||
        (document as any).webkitExitFullscreen ||
        (document as any).mozCancelFullScreen ||
        (document as any).msExitFullscreen;

      if (exitFullscreen) {
        const result = exitFullscreen.call(document);
        if (result && typeof result.then === 'function') {
          result.catch((err: Error) => {
            console.error('[PlaybackController] 退出原生全屏失败:', err);
          });
        }
      }
    },

    getCurrentTime() {
      const engine = getEngine();
      if (engine === 'native') {
        return videoRef?.value?.currentTime ?? 0;
      }
      return player.value?.currentTime() ?? 0;
    },

    getDuration() {
      const engine = getEngine();
      if (engine === 'native') {
        return videoRef?.value?.duration ?? 0;
      }
      return player.value?.duration() ?? 0;
    },

    setPlaybackRate(rate: number) {
      const clampedRate = Math.max(0.25, Math.min(4, rate));
      const engine = getEngine();
      if (engine === 'native') {
        const video = videoRef?.value;
        if (video) {
          video.playbackRate = clampedRate;
        }
      } else {
        player.value?.playbackRate(clampedRate);
      }
    },

    getPlaybackRate() {
      const engine = getEngine();
      if (engine === 'native') {
        return videoRef?.value?.playbackRate ?? 1;
      }
      return player.value?.playbackRate() ?? 1;
    },

    async togglePictureInPicture() {
      const video = getVideo();
      if (!video) return;

      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if ((document as any).pictureInPictureEnabled) {
          await video.requestPictureInPicture();
        }
      } catch (error) {
        console.error('[PlaybackController] 画中画错误:', error);
      }
    },

    isPictureInPicture() {
      return !!document.pictureInPictureElement;
    },
  };
}
