<template>
  <div
    :class="[
      'aix-video-controls',
      'aix-video-controls--live',
      { 'aix-video-controls--hidden': !controlsVisible },
    ]"
    @mousemove="autoHide.onInteraction"
    @touchstart.passive="autoHide.onInteraction"
  >
    <div class="aix-video-controls__left">
      <!-- 播放/暂停 -->
      <button
        class="aix-video-controls__btn"
        :aria-label="playerState.isPlaying ? '暂停' : '播放'"
        @click="handleTogglePlay"
      >
        <Pause v-if="playerState.isPlaying" width="24" height="24" />
        <Play v-else width="24" height="24" />
      </button>

      <!-- 音量 -->
      <button
        class="aix-video-controls__btn"
        :aria-label="playerState.isMuted ? '取消静音' : '静音'"
        @click="handleToggleMute"
      >
        <VolumeMute v-if="playerState.isMuted" width="24" height="24" />
        <VolumeUp v-else width="24" height="24" />
      </button>

      <!-- 刷新 -->
      <button
        v-if="showRefresh"
        class="aix-video-controls__btn"
        aria-label="刷新"
        @click="handleRefresh"
      >
        <Refresh width="24" height="24" />
      </button>
    </div>

    <div class="aix-video-controls__center">
      <!-- LIVE 标识 -->
      <span v-if="showLiveBadge" class="aix-video-controls__live-badge">
        <span class="aix-video-controls__live-dot" />
        LIVE
      </span>
    </div>

    <div class="aix-video-controls__right">
      <!-- 全屏 -->
      <button
        class="aix-video-controls__btn"
        :aria-label="playerState.isFullscreen ? '退出全屏' : '全屏'"
        @click="handleToggleFullscreen"
      >
        <FullscreenExit
          v-if="playerState.isFullscreen"
          width="24"
          height="24"
        />
        <Fullscreen v-else width="24" height="24" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Play,
  Pause,
  VolumeUp,
  VolumeMute,
  Fullscreen,
  FullscreenExit,
  Refresh,
} from '@aix/icons';
import { computed } from 'vue';
import { useControlsAutoHide } from '../composables/useControlsAutoHide';
import type { PlayerState, ControlMethods } from '../types';

defineOptions({
  name: 'LiveControls',
});

interface Props {
  /** 播放器状态 */
  playerState: PlayerState;
  /** 控制方法 */
  controls: ControlMethods;
  /** 自动隐藏延迟(ms)，0 表示禁用 */
  autoHideDelay?: number;
  /** 是否显示 LIVE 标识 */
  showLiveBadge?: boolean;
  /** 是否显示刷新按钮 */
  showRefresh?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  autoHideDelay: 3000,
  showLiveBadge: true,
  showRefresh: true,
});

const autoHide = useControlsAutoHide({
  delay: computed(() => props.autoHideDelay),
  enabled: computed(() => props.autoHideDelay > 0),
});

const controlsVisible = computed(() => autoHide.visible.value);

function handleTogglePlay(): void {
  autoHide.onInteraction();
  if (props.playerState.isPlaying) {
    props.controls.pause();
  } else {
    props.controls.play();
  }
}

function handleToggleMute(): void {
  autoHide.onInteraction();
  props.controls.toggleMute();
}

function handleRefresh(): void {
  autoHide.onInteraction();
  props.controls.reload();
}

function handleToggleFullscreen(): void {
  autoHide.onInteraction();
  props.controls.toggleFullscreen();
}

defineExpose({
  /** 控制栏自动隐藏实例 */
  autoHide,
});
</script>

<style lang="scss">
.aix-video-controls {
  display: flex;
  position: absolute;
  z-index: 10;
  right: 0;
  bottom: 0;
  left: 0;
  align-items: center;
  justify-content: space-between;
  padding: 32px 12px 12px;
  transition: opacity 0.3s ease;
  background: linear-gradient(transparent, rgb(0 0 0 / 0.6));
  color: #fff;
  gap: 8px;

  &--hidden {
    opacity: 0;
    pointer-events: none;
  }

  &__left,
  &__right {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
  }

  &__center {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
  }

  &__btn {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    transition: opacity 0.2s;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #fff;
    cursor: pointer;

    &:hover {
      opacity: 0.8;
      background: rgb(255 255 255 / 0.1);
    }

    &:active {
      opacity: 0.6;
    }
  }

  &__live-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgb(255 255 255 / 0.15);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.5px;
    gap: 6px;
    user-select: none;
  }

  &__live-dot {
    display: block;
    width: 8px;
    height: 8px;
    animation: aix-live-pulse 1.5s ease-in-out infinite;
    border-radius: 50%;
    background: #f5222d;
  }
}

@keyframes aix-live-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.4;
  }
}
</style>
