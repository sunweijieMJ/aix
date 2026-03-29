<template>
  <div class="video-controls">
    <!-- 播放/暂停按钮 -->
    <button
      class="control-btn"
      :aria-label="playerState.isPlaying ? '暂停' : '播放'"
      @click="togglePlay"
    >
      <span v-if="playerState.isPlaying">⏸</span>
      <span v-else>▶</span>
    </button>

    <!-- 进度条 -->
    <div class="progress-bar" @click="handleProgressClick">
      <div
        class="progress-buffered"
        :style="{ width: `${playerState.buffered * 100}%` }"
      />
      <div class="progress-played" :style="{ width: `${progress}%` }" />
      <div class="progress-handle" :style="{ left: `${progress}%` }" />
    </div>

    <!-- 时间显示 -->
    <div class="time-display">
      {{ formatTime(playerState.currentTime) }} /
      {{ formatTime(playerState.duration) }}
    </div>

    <!-- 音量控制 -->
    <button
      class="control-btn"
      :aria-label="playerState.isMuted ? '取消静音' : '静音'"
      @click="controls.toggleMute"
    >
      <span v-if="playerState.isMuted">🔇</span>
      <span v-else>🔊</span>
    </button>

    <!-- 全屏按钮 -->
    <button
      class="control-btn"
      :aria-label="playerState.isFullscreen ? '退出全屏' : '全屏'"
      @click="controls.toggleFullscreen"
    >
      <span v-if="playerState.isFullscreen">⊡</span>
      <span v-else>⛶</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PlayerState, ControlMethods } from '../types';

defineOptions({
  name: 'DefaultControls',
});

interface Props {
  /** 播放器状态 */
  playerState: PlayerState;
  /** 控制方法 */
  controls: ControlMethods;
}

const props = defineProps<Props>();

/**
 * 播放进度百分比
 */
const progress = computed(() => {
  if (!props.playerState.duration) return 0;
  return (props.playerState.currentTime / props.playerState.duration) * 100;
});

/**
 * 切换播放/暂停
 */
function togglePlay(): void {
  if (props.playerState.isPlaying) {
    props.controls.pause();
  } else {
    props.controls.play();
  }
}

/**
 * 处理进度条点击
 */
function handleProgressClick(event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const percent = (event.clientX - rect.left) / rect.width;
  const time = percent * props.playerState.duration;
  props.controls.seek(time);
}

/**
 * 格式化时间
 */
function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
</script>

<style scoped lang="scss">
// 视频叠加层使用固定透明度值（确保在任意视频内容上的对比度）
// 品牌色/功能色使用主题变量
.video-controls {
  display: flex;
  position: absolute;
  z-index: 10;
  right: 0;
  bottom: 0;
  left: 0;
  align-items: center;
  padding: 12px;
  transition: opacity 0.3s;
  background: linear-gradient(to top, rgb(0 0 0 / 0.7), transparent);
  color: white;
  gap: 12px;

  &:hover {
    opacity: 1;
  }
}

.control-btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  transition: opacity 0.2s;
  border: none;
  background: transparent;
  color: white;
  font-size: 16px;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }

  &:active {
    opacity: 0.6;
  }
}

.progress-bar {
  position: relative;
  flex: 1;
  height: 4px;
  transition: height 0.2s;
  border-radius: 2px;
  background: rgb(255 255 255 / 0.3);
  cursor: pointer;

  &:hover {
    height: 6px;

    .progress-handle {
      opacity: 1;
    }
  }
}

.progress-buffered {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  transition: width 0.2s;
  border-radius: 2px;
  background: rgb(255 255 255 / 0.5);
}

.progress-played {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  transition: width 0.1s;
  border-radius: 2px;
  background: var(--aix-colorPrimary, rgb(24 144 255));
}

.progress-handle {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%);
  transition: left 0.1s;
  border-radius: 50%;
  opacity: 0;
  background: white;
  box-shadow: 0 2px 4px rgb(0 0 0 / 0.3);
}

.time-display {
  flex-shrink: 0;
  min-width: 100px;
  font-size: 12px;
  text-align: center;
  white-space: nowrap;
  user-select: none;
}
</style>
