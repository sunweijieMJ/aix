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
/**
 * 视频播放器组件
 *
 * 基于 video.js 的 Vue 3 视频播放器，支持 HLS/RTMP/FLV 等多种视频格式
 */
import 'video.js/dist/video-js.css';
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useNetworkStatus } from './composables/useNetworkStatus';
import {
  useOrientationChange,
  type OrientationChangeOptions,
} from './composables/useOrientationChange';
import {
  useTouchEvents,
  type TouchEventsOptions,
} from './composables/useTouchEvents';
import {
  useVideoPlayer,
  type VideoPlayerOptions,
} from './composables/useVideoPlayer';
import type {
  ControlMethods,
  VideoPlayerProps,
  VideoPlayerEmits,
} from './types';

defineOptions({
  name: 'VideoPlayer',
});

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

const emit = defineEmits<VideoPlayerEmits>();

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
  onTimeUpdate: (currentTime, duration) =>
    emit('timeupdate', currentTime, duration),
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
    if (
      props.autoFullscreenOnLandscape &&
      !videoPlayer.controller.isFullscreen()
    ) {
      videoPlayer.controller.toggleFullscreen();
    }
  },
  onPortrait: () => {
    if (
      props.autoFullscreenOnLandscape &&
      videoPlayer.controller.isFullscreen()
    ) {
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
