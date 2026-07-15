<template>
  <div class="aix-audio-player">
    <!-- 波形区域 -->
    <div v-if="showWaveform" class="aix-audio-player__waveform">
      <WaveformCanvas :data="waveformData" :progress="progress" :height="32" />
    </div>

    <!-- 控制栏 -->
    <div class="aix-audio-player__controls">
      <!-- 播放/暂停按钮 -->
      <button class="aix-audio-player__btn" :disabled="!audioUrl" @click="togglePlay">
        <!-- 播放图标（CSS 纯绘制，无图标依赖） -->
        <span
          :class="[
            'aix-audio-player__play-icon',
            { 'aix-audio-player__play-icon--pause': isPlaying },
          ]"
        />
      </button>

      <!-- 进度条 -->
      <div class="aix-audio-player__progress" @click="handleProgressClick">
        <div class="aix-audio-player__progress-bar" :style="{ width: `${progress * 100}%` }" />
      </div>

      <!-- 时间 -->
      <span class="aix-audio-player__time">
        {{ formattedCurrentTime }} / {{ formattedDuration }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AudioPlayer - 轻量音频播放器组件
 * 支持波形可视化和进度控制，样式通过 CSS Variables 完全暴露
 */
import { ref, computed, watch, onUnmounted } from 'vue';
import type { AudioPlayerProps, AudioPlayerEmits } from '../../types';
import WaveformCanvas from '../WaveformCanvas/index.vue';

defineOptions({ name: 'AixAudioPlayer' });

const props = withDefaults(defineProps<AudioPlayerProps>(), {
  waveform: () => [],
  showWaveform: true,
  autoplay: false,
});

const emit = defineEmits<AudioPlayerEmits>();

// ── 状态 ────────────────────────────────────────────────────────────────────
const isPlaying = ref(false);
const currentTime = ref(0);
const totalDuration = ref(0);
const progress = ref(0);

let audio: HTMLAudioElement | null = null;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let blobUrl = ''; // 记录由 Blob 创建的临时 URL，以便 unmount 时撤销

// ── 计算属性 ─────────────────────────────────────────────────────────────────
const audioUrl = computed(() => {
  if (!props.src) return '';
  if (typeof props.src === 'string') return props.src;
  // Blob → 创建临时 URL，旧的先撤销
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(props.src);
  return blobUrl;
});

const waveformData = computed(() => props.waveform ?? []);
const formattedCurrentTime = computed(() => formatTime(currentTime.value));
const formattedDuration = computed(() => formatTime(totalDuration.value));

// ── 监听 src 变化 ─────────────────────────────────────────────────────────────
watch(
  audioUrl,
  (url) => {
    destroyAudio();
    if (url) {
      initAudio(url);
      if (props.autoplay) play();
    }
  },
  { immediate: true },
);

// ── 音频控制 ─────────────────────────────────────────────────────────────────
function initAudio(url: string) {
  audio = new Audio(url);
  audio.onloadedmetadata = () => {
    totalDuration.value = audio!.duration;
  };
  audio.onended = () => {
    isPlaying.value = false;
    currentTime.value = 0;
    progress.value = 0;
    stopProgressTimer();
    emit('ended');
  };
}

function togglePlay() {
  isPlaying.value ? pause() : play();
}

function play() {
  if (!audio || !audioUrl.value) return;
  audio.play();
  isPlaying.value = true;
  startProgressTimer();
  emit('play');
}

function pause() {
  audio?.pause();
  isPlaying.value = false;
  stopProgressTimer();
  emit('pause');
}

function handleProgressClick(e: MouseEvent) {
  if (!audio || !totalDuration.value) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  audio.currentTime = ratio * totalDuration.value;
  progress.value = ratio;
}

function startProgressTimer() {
  stopProgressTimer();
  progressTimer = setInterval(() => {
    if (!audio) return;
    currentTime.value = audio.currentTime;
    progress.value = totalDuration.value ? audio.currentTime / totalDuration.value : 0;
    emit('timeupdate', audio.currentTime);
  }, 50);
}

function stopProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function destroyAudio() {
  pause();
  audio = null;
  currentTime.value = 0;
  progress.value = 0;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

onUnmounted(() => {
  destroyAudio();
  if (blobUrl) URL.revokeObjectURL(blobUrl);
});
</script>

<style lang="scss">
.aix-audio-player {
  display: flex;
  flex-direction: column;
  gap: 6px;

  &__waveform {
    width: 100%;
  }

  &__controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__btn {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    transition: opacity 0.2s;
    border: none;
    border-radius: 50%;
    background: var(--aix-audio-player-btn-bg, var(--aix-colorPrimary, #1677ff));
    cursor: pointer;

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    &:hover:not(:disabled) {
      opacity: 0.85;
    }
  }

  // 纯 CSS 绘制播放/暂停图标，无图标组件依赖
  &__play-icon {
    width: 0;
    height: 0;
    margin-left: 2px;
    border-width: 5px 0 5px 9px;
    border-style: solid;
    border-color: transparent transparent transparent #fff;

    &--pause {
      width: 8px;
      height: 10px;
      margin-left: 0;
      border: none;
      background: linear-gradient(to right, #fff 35%, transparent 35%, transparent 65%, #fff 65%);
    }
  }

  &__progress {
    position: relative;
    flex: 1;
    height: 4px;
    overflow: hidden;
    border-radius: 2px;
    background: var(--aix-audio-player-track-bg, var(--aix-colorFillTertiary, #f0f0f0));
    cursor: pointer;
  }

  &__progress-bar {
    height: 100%;
    transition: width 0.05s linear;
    border-radius: 2px;
    background: var(--aix-audio-player-progress-bg, var(--aix-colorPrimary, #1677ff));
  }

  &__time {
    flex-shrink: 0;
    color: var(--aix-audio-player-time-color, var(--aix-colorTextTertiary, #00000073));
    font-size: 11px;
    white-space: nowrap;
  }
}
</style>
