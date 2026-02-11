<template>
  <div
    ref="containerRef"
    :class="['video-player', { 'video-player--transparent': transparent }]"
    :style="containerStyle"
  >
    <video
      ref="videoRef"
      class="video-js vjs-big-play-centered"
      playsinline
      webkit-playsinline
      x5-playsinline
      :crossorigin="crossOrigin ? 'anonymous' : undefined"
    />

    <!-- 自定义控制栏插槽 -->
    <slot
      v-if="customControls"
      name="controls"
      :player-state="playerState"
      :controls="controlMethods"
    />
  </div>
</template>

<script setup lang="ts">
import 'video.js/dist/video-js.css';
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
} from 'vue';
import {
  useNetworkStatus,
  type NetworkStatus,
} from './composables/useNetworkStatus';
import {
  useOrientationChange,
  type OrientationChangeOptions,
} from './composables/useOrientationChange';
import type { StreamAdapterOptions } from './composables/useStreamAdapter';
import {
  useTouchEvents,
  type TouchEventsOptions,
} from './composables/useTouchEvents';
import {
  useVideoPlayer,
  type VideoPlayerOptions,
  type VideoSourceType,
} from './composables/useVideoPlayer';
import type { VideoJsOptions, VideoJsPlayer, ControlMethods } from './types';

defineOptions({
  name: 'VideoPlayer',
});

/**
 * Props
 */
export interface VideoPlayerProps {
  /** 视频源地址 */
  src: string;
  /** 封面图 */
  poster?: string;
  /** 是否自动播放 */
  autoplay?: boolean;
  /** 是否循环播放 */
  loop?: boolean;
  /** 是否静音 */
  muted?: boolean;
  /** 是否显示控制栏 */
  controls?: boolean;
  /** 是否响应式 */
  responsive?: boolean;
  /** 是否流式布局 */
  fluid?: boolean;
  /** 宽度 */
  width?: number | string;
  /** 高度 */
  height?: number | string;
  /** 宽高比 */
  aspectRatio?: string;
  /** 预加载策略 */
  preload?: 'auto' | 'metadata' | 'none';
  /** 是否透明背景 */
  transparent?: boolean;
  /** 是否跨域 */
  crossOrigin?: boolean;
  /** 是否启用调试日志 */
  enableDebugLog?: boolean;
  /** video.js 额外配置 */
  options?: Partial<VideoJsOptions>;
  /** 流适配器配置 */
  streamOptions?: Omit<
    StreamAdapterOptions,
    'onReady' | 'onError' | 'onFirstFrame'
  >;
  /** 视频源类型（不指定时自动推断） */
  sourceType?: VideoSourceType;
  /** 是否使用自定义控制栏 */
  customControls?: boolean;
  /** 是否启用触摸事件优化 (移动端) */
  enableTouchEvents?: boolean;
  /** 横屏时是否自动全屏 */
  autoFullscreenOnLandscape?: boolean;
}

const props = withDefaults(defineProps<VideoPlayerProps>(), {
  autoplay: false,
  loop: false,
  muted: false,
  controls: true,
  responsive: true,
  fluid: true,
  preload: 'auto',
  transparent: false,
  crossOrigin: true,
  enableDebugLog: false,
  customControls: false,
  enableTouchEvents: true,
  autoFullscreenOnLandscape: false,
});

/**
 * Emits
 */
const emit = defineEmits<{
  ready: [player: VideoJsPlayer];
  play: [];
  pause: [];
  ended: [];
  timeupdate: [currentTime: number, duration: number];
  progress: [buffered: number];
  error: [error: Error];
  volumechange: [volume: number, muted: boolean];
  fullscreenchange: [isFullscreen: boolean];
  canplay: [];
  loadeddata: [];
  /** 移动端自动播放策略触发静音 */
  autoplayMuted: [reason: { reason: 'mobile-policy'; originalMuted: boolean }];
  /** 网络离线 */
  networkOffline: [];
  /** 网络恢复在线 */
  networkOnline: [];
  /** 网络变慢 */
  networkSlow: [status: NetworkStatus];
  /** 网络状态变化 */
  networkChange: [status: NetworkStatus];
}>();

const containerRef = ref<HTMLElement | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);

const uri = computed(() => props.src);

const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  if (props.width) {
    style.width =
      typeof props.width === 'number' ? `${props.width}px` : props.width;
  }
  if (props.height) {
    style.height =
      typeof props.height === 'number' ? `${props.height}px` : props.height;
  }
  return style;
});

// ==========================================
// 核心：useVideoPlayer 统一引擎管理
// ==========================================

const videoPlayerOptions = computed<VideoPlayerOptions>(() => ({
  autoplay: props.autoplay,
  loop: props.loop,
  muted: props.muted,
  controls: props.controls,
  responsive: props.responsive,
  fluid: props.fluid,
  aspectRatio: props.aspectRatio,
  poster: props.poster,
  preload: props.preload,
  enableDebugLog: props.enableDebugLog,
  sourceType: props.sourceType,
  customControls: props.customControls,
  videojsOptions: props.options,
  streamOptions: props.streamOptions,
  onReady: (player) => emit('ready', player),
  onPlay: () => emit('play'),
  onPause: () => emit('pause'),
  onEnded: () => emit('ended'),
  onTimeUpdate: (currentTime, duration) => emit('timeupdate', currentTime, duration),
  onProgress: (buffered) => emit('progress', buffered),
  onError: (error) => emit('error', error),
  onVolumeChange: (volume, muted) => emit('volumechange', volume, muted),
  onFullscreenChange: (isFullscreen) => emit('fullscreenchange', isFullscreen),
  onCanPlay: () => emit('canplay'),
  onLoadedData: () => emit('loadeddata'),
  onAutoplayMuted: (reason) => emit('autoplayMuted', reason),
}));

const videoPlayer = useVideoPlayer(videoRef, uri, videoPlayerOptions);

// 断网前播放状态保存
const wasPlayingBeforeOffline = ref(false);

// ==========================================
// 网络状态监听
// ==========================================

useNetworkStatus({
  enableDebugLog: props.enableDebugLog,
  onOnline: () => {
    emit('networkOnline');
    if (wasPlayingBeforeOffline.value) {
      videoPlayer.controller.play().catch(() => {});
      wasPlayingBeforeOffline.value = false;
    }
  },
  onOffline: () => {
    wasPlayingBeforeOffline.value = videoPlayer.playerState.isPlaying.value;
    emit('networkOffline');
  },
  onNetworkSlow: (status) => {
    emit('networkSlow', status);
  },
  onNetworkChange: (status) => {
    emit('networkChange', status);
  },
});

// ==========================================
// 触摸事件优化
// ==========================================

const touchEventsOptions = computed<TouchEventsOptions>(() => ({
  enabled: props.enableTouchEvents,
  enableDebugLog: props.enableDebugLog,
  onTap: () => {
    if (videoPlayer.playerState.isPlaying.value) {
      videoPlayer.controller.pause();
    } else {
      videoPlayer.controller.play();
    }
  },
  onDoubleTap: () => {
    videoPlayer.controller.toggleFullscreen();
  },
  onSwipeLeft: () => {
    const currentTime = videoPlayer.controller.getCurrentTime();
    videoPlayer.controller.seek(Math.max(0, currentTime - 10));
  },
  onSwipeRight: () => {
    const currentTime = videoPlayer.controller.getCurrentTime();
    const duration = videoPlayer.controller.getDuration();
    videoPlayer.controller.seek(Math.min(duration, currentTime + 10));
  },
}));

useTouchEvents(containerRef, touchEventsOptions);

// ==========================================
// 屏幕方向监听
// ==========================================

const orientationOptions = computed<OrientationChangeOptions>(() => ({
  enabled: props.autoFullscreenOnLandscape,
  autoFullscreenOnLandscape: props.autoFullscreenOnLandscape,
  enableDebugLog: props.enableDebugLog,
  onLandscape: () => {
    if (props.autoFullscreenOnLandscape && !videoPlayer.controller.isFullscreen()) {
      videoPlayer.controller.toggleFullscreen();
    }
  },
  onPortrait: () => {
    if (props.autoFullscreenOnLandscape && videoPlayer.controller.isFullscreen()) {
      videoPlayer.controller.toggleFullscreen();
    }
  },
}));

useOrientationChange(orientationOptions);

// ==========================================
// 对外暴露的状态和方法
// ==========================================

const playerState = computed(() => ({
  isReady: videoPlayer.isReady.value,
  isPlaying: videoPlayer.playerState.isPlaying.value,
  currentTime: videoPlayer.playerState.currentTime.value,
  duration: videoPlayer.playerState.duration.value,
  volume: videoPlayer.playerState.volume.value,
  isMuted: videoPlayer.playerState.isMuted.value,
  isFullscreen: videoPlayer.playerState.isFullscreen.value,
  buffered: videoPlayer.playerState.buffered.value,
  isReconnecting: videoPlayer.playerState.isReconnecting.value,
  autoPlayFailed: videoPlayer.playerState.autoPlayFailed.value,
  isNativeFullscreen: videoPlayer.playerState.isNativeFullscreen.value,
}));

const controlMethods: ControlMethods = {
  play: videoPlayer.controller.play,
  pause: videoPlayer.controller.pause,
  seek: videoPlayer.controller.seek,
  setVolume: videoPlayer.controller.setVolume,
  getVolume: videoPlayer.controller.getVolume,
  toggleMute: videoPlayer.controller.toggleMute,
  toggleFullscreen: videoPlayer.controller.toggleFullscreen,
  enterNativeFullscreen: videoPlayer.controller.enterNativeFullscreen,
  exitNativeFullscreen: videoPlayer.controller.exitNativeFullscreen,
  togglePictureInPicture: videoPlayer.controller.togglePictureInPicture,
  setPlaybackRate: videoPlayer.controller.setPlaybackRate,
  getPlaybackRate: videoPlayer.controller.getPlaybackRate,
  reload: () => videoPlayer.reloadStream(),
  forceReload: (shouldPlay?: boolean) => videoPlayer.forceReload(shouldPlay),
};

onMounted(() => {
  // Video.js 初始化在 useVideoPlayer 内部通过 watch(videoRef) 触发
});

onBeforeUnmount(() => {
  videoPlayer.destroy();
});

defineExpose({
  // 响应式状态
  isReady: videoPlayer.isReady,
  isPlaying: videoPlayer.playerState.isPlaying,
  isMuted: videoPlayer.playerState.isMuted,
  isReconnecting: videoPlayer.playerState.isReconnecting,
  autoPlayFailed: videoPlayer.playerState.autoPlayFailed,
  isNativeFullscreen: videoPlayer.playerState.isNativeFullscreen,
  // 实例访问
  getPlayer: () => videoPlayer.player.value,
  getVideo: () => videoRef.value,
  // 控制方法
  play: videoPlayer.controller.play,
  pause: videoPlayer.controller.pause,
  seek: videoPlayer.controller.seek,
  setVolume: videoPlayer.controller.setVolume,
  getVolume: videoPlayer.controller.getVolume,
  toggleMute: videoPlayer.controller.toggleMute,
  toggleFullscreen: videoPlayer.controller.toggleFullscreen,
  enterNativeFullscreen: videoPlayer.controller.enterNativeFullscreen,
  exitNativeFullscreen: videoPlayer.controller.exitNativeFullscreen,
  togglePictureInPicture: videoPlayer.controller.togglePictureInPicture,
  getCurrentTime: videoPlayer.controller.getCurrentTime,
  getDuration: videoPlayer.controller.getDuration,
  setPlaybackRate: videoPlayer.controller.setPlaybackRate,
  getPlaybackRate: videoPlayer.controller.getPlaybackRate,
  reload: () => videoPlayer.reloadStream(),
  forceReload: (shouldPlay?: boolean) => videoPlayer.forceReload(shouldPlay),
});
</script>

<style scoped lang="scss">
.video-player {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;

  :deep(.video-js) {
    width: 100%;
    height: 100%;
  }

  &--transparent {
    background: transparent;

    :deep(.video-js) {
      background: transparent;

      .vjs-tech {
        background: transparent;
      }

      .vjs-poster {
        background: transparent;
      }
    }
  }
}
</style>
