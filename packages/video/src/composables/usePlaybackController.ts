import type { Ref } from 'vue';
import type { VideoJsPlayer } from '../types';
import { isIOS } from '../utils';

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
  togglePictureInPicture: () => Promise<void>;
  isPictureInPicture: () => boolean;
  getCurrentTime: () => number;
  getDuration: () => number;
}

export interface PlaybackControllerOptions {
  /** video.js 播放器实例 */
  player: Ref<VideoJsPlayer | null>;
}

/**
 * 统一播放控制器
 */
export function usePlaybackController(
  options: PlaybackControllerOptions,
): PlaybackController {
  const { player } = options;

  /**
   * iOS 全屏处理
   * 优先使用标准 Fullscreen API (iOS 15+)，降级到 webkit 前缀
   */
  function handleIOSFullscreen(video: HTMLVideoElement): void {
    // 优先使用标准 Fullscreen API
    if (document.fullscreenEnabled) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        video.requestFullscreen().catch(() => {
          // 标准 API 失败，降级到 webkit
          fallbackToWebkitFullscreen(video);
        });
      }
      return;
    }

    // 降级到 webkit 前缀 (iOS 14 及以下)
    fallbackToWebkitFullscreen(video);
  }

  /**
   * 降级到 webkit 全屏 API
   */
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

  /**
   * 标准全屏处理
   */
  function handleStandardFullscreen(vjsPlayer: VideoJsPlayer): void {
    if (vjsPlayer.isFullscreen()) {
      vjsPlayer.exitFullscreen();
    } else {
      vjsPlayer.requestFullscreen();
    }
  }

  return {
    async play() {
      if (player.value) {
        try {
          await player.value.play();
        } catch (error) {
          // 忽略 "play() was interrupted" 错误，这是预期行为
          if (error instanceof Error && error.name !== 'AbortError') {
            throw error;
          }
        }
      }
    },

    pause() {
      player.value?.pause();
    },

    seek(time: number) {
      player.value?.currentTime(time);
    },

    setVolume(volume: number) {
      const safeVolume = Math.max(0, Math.min(1, volume));
      player.value?.volume(safeVolume);
    },

    getVolume() {
      return player.value?.volume() ?? 1;
    },

    toggleMute() {
      if (player.value) {
        player.value.muted(!player.value.muted());
      }
    },

    isMuted() {
      return player.value?.muted() ?? false;
    },

    toggleFullscreen() {
      if (player.value) {
        // iOS 特殊处理
        if (isIOS()) {
          const video = player.value.el()?.querySelector('video');
          if (video) {
            handleIOSFullscreen(video);
          }
        } else {
          handleStandardFullscreen(player.value);
        }
      }
    },

    isFullscreen() {
      // iOS 检测：优先使用标准 API (iOS 15+)，降级到 webkit 前缀
      if (isIOS()) {
        const webkitDocument = document as WebkitDocument;
        return !!(
          document.fullscreenElement || webkitDocument.webkitFullscreenElement
        );
      }
      return player.value?.isFullscreen() ?? false;
    },

    getCurrentTime() {
      return player.value?.currentTime() ?? 0;
    },

    getDuration() {
      return player.value?.duration() ?? 0;
    },

    async togglePictureInPicture() {
      const video = player.value?.el()?.querySelector('video');
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
