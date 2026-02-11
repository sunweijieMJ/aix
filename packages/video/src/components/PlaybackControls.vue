<template>
  <div
    :class="[
      'aix-video-controls',
      'aix-video-controls--playback',
      { 'aix-video-controls--hidden': !controlsVisible },
    ]"
    @mousemove="autoHide.onInteraction"
    @touchstart.passive="autoHide.onInteraction"
  >
    <!-- 进度条 -->
    <div
      ref="progressRef"
      :class="[
        'aix-video-controls__progress',
        { 'aix-video-controls__progress--dragging': isDragging },
      ]"
      @mousedown="onProgressMouseDown"
      @touchstart="onProgressTouchStart"
    >
      <!-- 缓冲进度 -->
      <div
        class="aix-video-controls__progress-buffered"
        :style="{ width: `${bufferedPercent}%` }"
      />
      <!-- 已播放进度 -->
      <div
        class="aix-video-controls__progress-played"
        :style="{ width: `${playedPercent}%` }"
      />
      <!-- 拖拽滑块 -->
      <div
        class="aix-video-controls__progress-thumb"
        :style="{ left: `${playedPercent}%` }"
      />
      <!-- 时间预览气泡（拖拽时） -->
      <div
        v-if="isDragging"
        class="aix-video-controls__progress-tooltip"
        :style="{ left: `${dragPercent}%` }"
      >
        {{ formatTime(dragTime) }}
      </div>
    </div>

    <!-- 按钮栏 -->
    <div class="aix-video-controls__bar">
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

        <!-- 时间显示 -->
        <span v-if="showTime" class="aix-video-controls__time">
          {{ formatTime(playerState.currentTime) }} /
          {{ formatTime(playerState.duration) }}
        </span>
      </div>

      <div class="aix-video-controls__right">
        <!-- 音量 -->
        <button
          class="aix-video-controls__btn"
          :aria-label="playerState.isMuted ? '取消静音' : '静音'"
          @click="handleToggleMute"
        >
          <VolumeMute v-if="playerState.isMuted" width="24" height="24" />
          <VolumeUp v-else width="24" height="24" />
        </button>

        <!-- 倍速 -->
        <div
          v-if="showPlaybackRate"
          ref="rateRef"
          class="aix-video-controls__rate"
        >
          <button
            :class="[
              'aix-video-controls__btn',
              'aix-video-controls__rate-btn',
              { 'aix-video-controls__rate-btn--active': currentRate !== 1 },
            ]"
            aria-label="倍速"
            @click="toggleRateMenu"
          >
            {{ currentRate }}x
          </button>
          <div v-if="rateMenuVisible" class="aix-video-controls__rate-menu">
            <button
              v-for="rate in playbackRates"
              :key="rate"
              :class="[
                'aix-video-controls__rate-item',
                {
                  'aix-video-controls__rate-item--active': rate === currentRate,
                },
              ]"
              @click="handleSetRate(rate)"
            >
              {{ rate }}x
            </button>
          </div>
        </div>

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
} from '@aix/icons';
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useControlsAutoHide } from '../composables/useControlsAutoHide';
import type { PlayerState, ControlMethods } from '../types';

defineOptions({
  name: 'PlaybackControls',
});

interface Props {
  /** 播放器状态 */
  playerState: PlayerState;
  /** 控制方法 */
  controls: ControlMethods;
  /** 自动隐藏延迟(ms)，0 表示禁用 */
  autoHideDelay?: number;
  /** 可用的倍速选项 */
  playbackRates?: number[];
  /** 是否显示倍速按钮 */
  showPlaybackRate?: boolean;
  /** 是否显示时间 */
  showTime?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  autoHideDelay: 3000,
  playbackRates: () => [0.5, 0.75, 1, 1.25, 1.5, 2],
  showPlaybackRate: true,
  showTime: true,
});

const autoHide = useControlsAutoHide({
  delay: computed(() => props.autoHideDelay),
  enabled: computed(() => props.autoHideDelay > 0),
});

const controlsVisible = computed(() => autoHide.visible.value);

// ========================
// 进度条
// ========================

const progressRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const dragPercent = ref(0);
const dragTime = ref(0);

const playedPercent = computed(() => {
  if (isDragging.value) return dragPercent.value;
  if (!props.playerState.duration) return 0;
  return (props.playerState.currentTime / props.playerState.duration) * 100;
});

const bufferedPercent = computed(() => {
  return props.playerState.buffered * 100;
});

function getPercentFromEvent(event: MouseEvent | Touch): number {
  const el = progressRef.value;
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const x = event.clientX - rect.left;
  return Math.max(0, Math.min(100, (x / rect.width) * 100));
}

function seekToPercent(percent: number): void {
  const time = (percent / 100) * props.playerState.duration;
  props.controls.seek(time);
}

// Mouse drag
function onProgressMouseDown(event: MouseEvent): void {
  event.preventDefault();
  autoHide.onInteraction();
  const percent = getPercentFromEvent(event);
  isDragging.value = true;
  dragPercent.value = percent;
  dragTime.value = (percent / 100) * props.playerState.duration;

  document.addEventListener('mousemove', onDocumentMouseMove);
  document.addEventListener('mouseup', onDocumentMouseUp);
}

function onDocumentMouseMove(event: MouseEvent): void {
  if (!isDragging.value) return;
  autoHide.onInteraction();
  const percent = getPercentFromEvent(event);
  dragPercent.value = percent;
  dragTime.value = (percent / 100) * props.playerState.duration;
}

function onDocumentMouseUp(): void {
  if (!isDragging.value) return;
  seekToPercent(dragPercent.value);
  isDragging.value = false;
  document.removeEventListener('mousemove', onDocumentMouseMove);
  document.removeEventListener('mouseup', onDocumentMouseUp);
}

// Touch drag — 阻止默认滚动
function onProgressTouchStart(event: TouchEvent): void {
  event.preventDefault();
  autoHide.onInteraction();
  const touch = event.touches[0];
  if (!touch) return;
  const percent = getPercentFromEvent(touch);
  isDragging.value = true;
  dragPercent.value = percent;
  dragTime.value = (percent / 100) * props.playerState.duration;

  document.addEventListener('touchmove', onDocumentTouchMove, {
    passive: false,
  });
  document.addEventListener('touchend', onDocumentTouchEnd);
  document.addEventListener('touchcancel', onDocumentTouchEnd);
}

function onDocumentTouchMove(event: TouchEvent): void {
  if (!isDragging.value) return;
  event.preventDefault();
  autoHide.onInteraction();
  const touch = event.touches[0];
  if (!touch) return;
  const percent = getPercentFromEvent(touch);
  dragPercent.value = percent;
  dragTime.value = (percent / 100) * props.playerState.duration;
}

function onDocumentTouchEnd(): void {
  if (!isDragging.value) return;
  seekToPercent(dragPercent.value);
  isDragging.value = false;
  document.removeEventListener('touchmove', onDocumentTouchMove);
  document.removeEventListener('touchend', onDocumentTouchEnd);
  document.removeEventListener('touchcancel', onDocumentTouchEnd);
}

// ========================
// 倍速选择器
// ========================

const rateRef = ref<HTMLElement | null>(null);
const currentRate = ref(1);
const rateMenuVisible = ref(false);

function toggleRateMenu(): void {
  autoHide.onInteraction();
  rateMenuVisible.value = !rateMenuVisible.value;
}

function handleSetRate(rate: number): void {
  autoHide.onInteraction();
  currentRate.value = rate;
  props.controls.setPlaybackRate(rate);
  rateMenuVisible.value = false;
}

// 点击外部关闭倍速菜单（仅在菜单打开时监听）
function onDocumentClickForRate(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (rateRef.value && !rateRef.value.contains(target)) {
    rateMenuVisible.value = false;
  }
}

watch(rateMenuVisible, (visible) => {
  if (visible) {
    document.addEventListener('click', onDocumentClickForRate, {
      capture: true,
    });
  } else {
    document.removeEventListener('click', onDocumentClickForRate, {
      capture: true,
    });
  }
});

// ========================
// 控制按钮
// ========================

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

function handleToggleFullscreen(): void {
  autoHide.onInteraction();
  props.controls.toggleFullscreen();
}

// ========================
// 时间格式化
// ========================

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ========================
// 清理
// ========================

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDocumentMouseMove);
  document.removeEventListener('mouseup', onDocumentMouseUp);
  document.removeEventListener('touchmove', onDocumentTouchMove);
  document.removeEventListener('touchend', onDocumentTouchEnd);
  document.removeEventListener('touchcancel', onDocumentTouchEnd);
  document.removeEventListener('click', onDocumentClickForRate, {
    capture: true,
  });
});

defineExpose({
  /** 控制栏自动隐藏实例 */
  autoHide,
});
</script>

<style lang="scss">
.aix-video-controls--playback {
  // 基础布局（独立于 LiveControls）
  display: flex;
  position: absolute;
  z-index: 10;
  right: 0;
  bottom: 0;
  left: 0;

  // playback 特有
  flex-direction: column;
  padding: 0;
  transition: opacity 0.3s ease;
  color: #fff;
  gap: 0;

  .aix-video-controls__left,
  .aix-video-controls__right {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
  }

  .aix-video-controls__btn {
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

  .aix-video-controls__progress {
    position: relative;
    width: 100%;
    height: 4px;
    transition: height 0.2s;
    background: rgb(255 255 255 / 0.2);
    cursor: pointer;
    touch-action: none;

    // 扩大触摸区域
    &::before {
      content: '';
      position: absolute;
      inset: -14px 0;
    }

    &:hover,
    &--dragging {
      height: 6px;

      .aix-video-controls__progress-thumb {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
      }
    }
  }

  .aix-video-controls__progress-buffered {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: rgb(255 255 255 / 0.35);
  }

  .aix-video-controls__progress-played {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: var(--aix-color-primary, #1890ff);
  }

  .aix-video-controls__progress-thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    transform: translate(-50%, -50%) scale(0);
    transition:
      opacity 0.2s,
      transform 0.2s;
    border-radius: 50%;
    opacity: 0;
    background: #fff;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
    pointer-events: none;
  }

  .aix-video-controls__progress-tooltip {
    position: absolute;
    bottom: 16px;
    padding: 2px 6px;
    transform: translateX(-50%);
    border-radius: 3px;
    background: rgb(0 0 0 / 0.75);
    color: #fff;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
  }

  .aix-video-controls__bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 4px 12px 8px;
    background: linear-gradient(transparent, rgb(0 0 0 / 0.4));
    gap: 8px;
  }

  .aix-video-controls__time {
    flex-shrink: 0;
    color: rgb(255 255 255 / 0.9);
    font-size: 12px;
    white-space: nowrap;
    user-select: none;
  }

  .aix-video-controls__rate {
    position: relative;
  }

  .aix-video-controls__rate-btn {
    width: auto;
    padding: 0 6px;
    font-size: 13px;
    font-weight: 500;

    &--active {
      color: var(--aix-color-primary, #1890ff);
    }
  }

  .aix-video-controls__rate-menu {
    display: flex;
    position: absolute;
    right: 0;
    bottom: 100%;
    flex-direction: column;
    margin-bottom: 4px;
    padding: 4px 0;
    border-radius: 6px;
    background: rgb(0 0 0 / 0.8);
    backdrop-filter: blur(8px);
  }

  .aix-video-controls__rate-item {
    padding: 6px 16px;
    border: none;
    background: transparent;
    color: rgb(255 255 255 / 0.8);
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;

    &:hover {
      background: rgb(255 255 255 / 0.1);
      color: #fff;
    }

    &--active {
      color: var(--aix-color-primary, #1890ff);
    }
  }
}
</style>
