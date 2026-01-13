<template>
  <div
    ref="containerRef"
    :class="['video-player', { 'video-player--transparent': transparent }]"
    :style="containerStyle"
  >
    <video
      ref="videoRef"
      class="video-js vjs-default-skin vjs-big-play-centered"
      data-vjs-player
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
// 直接导入 video.js 样式，避免 CDN 依赖
import 'video.js/dist/video-js.css';
import videojs from 'video.js';
import {
  ref,
  shallowRef,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
} from 'vue';
import { useControls, type ControlsOptions } from './composables/useControls';
import { useEvents, type EventCallbacks } from './composables/useEvents';
import {
  useNetworkStatus,
  type NetworkStatus,
} from './composables/useNetworkStatus';
import {
  useOrientationChange,
  type OrientationChangeOptions,
} from './composables/useOrientationChange';
import { usePlaybackController } from './composables/usePlaybackController';
import { usePlayerState } from './composables/usePlayerState';
import {
  useStreamAdapter,
  type StreamAdapterOptions,
} from './composables/useStreamAdapter';
import {
  useTouchEvents,
  type TouchEventsOptions,
} from './composables/useTouchEvents';
import { DEFAULT_VIDEOJS_OPTIONS } from './constants';
import type { VideoJsOptions, VideoJsPlayer, ControlMethods } from './types';
import { isMobileDevice } from './utils';

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

const player = shallowRef<VideoJsPlayer | null>(null);
const isReady = ref(false);
const isInitialized = ref(false);

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

const eventBridge = {
  onPlay: () => emit('play'),
  onPause: () => emit('pause'),
  onEnded: () => emit('ended'),
  onTimeUpdate: (currentTime: number, duration: number) =>
    emit('timeupdate', currentTime, duration),
  onError: (error: Error) => emit('error', error),
};

const controlsOptions = computed<ControlsOptions>(() => ({
  // 当使用自定义控制栏时，隐藏原生控制栏
  controls: props.customControls ? false : props.controls,
  autoPlay: props.autoplay,
  muted: props.muted,
  loop: props.loop,
  preload: props.preload,
}));

const eventCallbacks = computed<EventCallbacks>(() => ({
  ...eventBridge,
  onProgress: (buffered) => emit('progress', buffered),
  onVolumeChange: (volume, muted) => emit('volumechange', volume, muted),
  onFullscreen: (isFullscreen) => emit('fullscreenchange', isFullscreen),
  onCanPlay: () => emit('canplay'),
  onLoadedData: () => emit('loadeddata'),
}));

const streamAdapterOptions = computed<StreamAdapterOptions>(() => ({
  ...props.streamOptions,
  enableDebugLog: props.enableDebugLog,
  onError: eventBridge.onError,
}));

useControls(videoRef, player, controlsOptions);
useEvents(videoRef, player, eventCallbacks);
const streamAdapter = useStreamAdapter(videoRef, uri, streamAdapterOptions);

const controller = usePlaybackController({
  player,
});

// 播放器状态（用于自定义控制栏）
const playerStateRefs = usePlayerState(videoRef);

// 网络状态监听
useNetworkStatus({
  enableDebugLog: props.enableDebugLog,
  onOnline: () => {
    emit('networkOnline');
    // 网络恢复时尝试重新播放
    if (player.value && !player.value.paused()) {
      controller.play().catch(() => {});
    }
  },
  onOffline: () => {
    emit('networkOffline');
  },
  onNetworkSlow: (status) => {
    emit('networkSlow', status);
  },
  onNetworkChange: (status) => {
    emit('networkChange', status);
  },
});

// 触摸事件优化
const touchEventsOptions = computed<TouchEventsOptions>(() => ({
  enabled: props.enableTouchEvents,
  enableDebugLog: props.enableDebugLog,
  onTap: () => {
    // 单击播放/暂停
    if (playerStateRefs.isPlaying.value) {
      controller.pause();
    } else {
      controller.play();
    }
  },
  onDoubleTap: () => {
    // 双击全屏
    controller.toggleFullscreen();
  },
  onSwipeLeft: () => {
    // 左滑快退 10 秒
    const currentTime = controller.getCurrentTime();
    controller.seek(Math.max(0, currentTime - 10));
  },
  onSwipeRight: () => {
    // 右滑快进 10 秒
    const currentTime = controller.getCurrentTime();
    const duration = controller.getDuration();
    controller.seek(Math.min(duration, currentTime + 10));
  },
}));

useTouchEvents(containerRef, touchEventsOptions);

// 屏幕方向监听
const orientationOptions = computed<OrientationChangeOptions>(() => ({
  enabled: props.autoFullscreenOnLandscape,
  autoFullscreenOnLandscape: props.autoFullscreenOnLandscape,
  enableDebugLog: props.enableDebugLog,
  onLandscape: () => {
    // 横屏时自动全屏
    if (props.autoFullscreenOnLandscape && !controller.isFullscreen()) {
      controller.toggleFullscreen();
    }
  },
  onPortrait: () => {
    // 竖屏时退出全屏
    if (props.autoFullscreenOnLandscape && controller.isFullscreen()) {
      controller.toggleFullscreen();
    }
  },
}));

useOrientationChange(orientationOptions);

const playerState = computed(() => ({
  isReady: isReady.value,
  isPlaying: playerStateRefs.isPlaying.value,
  currentTime: playerStateRefs.currentTime.value,
  duration: playerStateRefs.duration.value,
  volume: playerStateRefs.volume.value,
  isMuted: playerStateRefs.isMuted.value,
  isFullscreen: playerStateRefs.isFullscreen.value,
  buffered: playerStateRefs.buffered.value,
}));

// 控制方法（用于自定义控制栏）
const controlMethods: ControlMethods = {
  play: controller.play,
  pause: controller.pause,
  seek: controller.seek,
  setVolume: controller.setVolume,
  getVolume: controller.getVolume,
  toggleMute: controller.toggleMute,
  toggleFullscreen: controller.toggleFullscreen,
  togglePictureInPicture: controller.togglePictureInPicture,
  reload: () => streamAdapter.reload(),
};

/**
 * 初始化 video.js 播放器
 */
function initPlayer(): void {
  const video = videoRef.value;
  if (!video || isInitialized.value) return;

  if (!document.body.contains(video)) {
    return;
  }

  try {
    // 移动端自动播放策略：自动修正 + 事件通知
    let autoplayMuted = props.muted;
    if (isMobileDevice() && props.autoplay && !props.muted) {
      console.warn(
        '[VideoPlayer] 移动端自动播放需要静音，已自动设置 muted: true',
        '详见: https://developer.chrome.com/blog/autoplay/',
      );
      autoplayMuted = true;
      emit('autoplayMuted', {
        reason: 'mobile-policy',
        originalMuted: props.muted,
      });
    }

    const playerOptions: VideoJsOptions = {
      ...DEFAULT_VIDEOJS_OPTIONS,
      autoplay: props.autoplay,
      controls: props.controls,
      responsive: props.responsive,
      fluid: props.fluid,
      loop: props.loop,
      muted: autoplayMuted,
      preload: props.preload,
      aspectRatio: props.aspectRatio,
      poster: props.poster,
      ...props.options,
    };

    const vjsPlayer = videojs(video, playerOptions);

    vjsPlayer.ready(() => {
      player.value = vjsPlayer;
      isReady.value = true;
      isInitialized.value = true;
      emit('ready', vjsPlayer);
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[VideoPlayer] 初始化失败:', err);
    emit('error', err);
  }
}

/**
 * 销毁播放器
 */
function destroyPlayer(): void {
  if (player.value) {
    try {
      player.value.dispose();
    } catch {
      // 忽略销毁错误
    }
    player.value = null;
    isReady.value = false;
    isInitialized.value = false;
  }
}

watch(videoRef, (video) => {
  if (video && !isInitialized.value) {
    requestAnimationFrame(() => {
      initPlayer();
    });
  }
});

onMounted(() => {
  if (videoRef.value) {
    initPlayer();
  }
});

onBeforeUnmount(() => {
  streamAdapter.destroy();
  destroyPlayer();
});

defineExpose({
  isReady,
  getPlayer: () => player.value,
  getVideo: () => videoRef.value,
  // 使用统一播放控制器
  play: controller.play,
  pause: controller.pause,
  seek: controller.seek,
  setVolume: controller.setVolume,
  getVolume: controller.getVolume,
  toggleMute: controller.toggleMute,
  toggleFullscreen: controller.toggleFullscreen,
  togglePictureInPicture: controller.togglePictureInPicture,
  getCurrentTime: controller.getCurrentTime,
  getDuration: controller.getDuration,
  reload: () => streamAdapter.reload(),
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
