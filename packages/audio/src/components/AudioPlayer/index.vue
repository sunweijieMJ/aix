<template>
  <div class="aix-audio-player">
    <!-- 波形区域 -->
    <div v-if="showWaveform" class="aix-audio-player__waveform">
      <WaveformCanvas :data="waveformData" :progress="progress" :height="32" />
    </div>

    <!-- 控制栏 -->
    <div class="aix-audio-player__controls">
      <!-- 播放/暂停按钮 -->
      <button
        type="button"
        class="aix-audio-player__btn"
        :disabled="!audioUrl"
        :aria-label="isPlaying ? '暂停' : '播放'"
        :aria-pressed="isPlaying"
        @click="togglePlay"
      >
        <!-- 播放图标（CSS 纯绘制，无图标依赖） -->
        <span
          aria-hidden="true"
          :class="[
            'aix-audio-player__play-icon',
            { 'aix-audio-player__play-icon--pause': isPlaying },
          ]"
        />
      </button>

      <!-- 进度条：可聚焦、可键盘操作的 slider -->
      <div
        class="aix-audio-player__progress"
        role="slider"
        tabindex="0"
        aria-label="播放进度"
        :aria-valuemin="0"
        :aria-valuemax="Math.round(totalDuration) || 0"
        :aria-valuenow="Math.round(currentTime)"
        :aria-valuetext="`${formattedCurrentTime} / ${formattedDuration}`"
        :aria-disabled="!canSeek"
        @click="handleProgressClick"
        @keydown="handleProgressKeydown"
      >
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
import { formatDuration } from '@aix/hooks';
import { ref, computed, watch, onUnmounted } from 'vue';
import type { AudioPlayerProps, AudioPlayerEmits } from '../../types';
import WaveformCanvas from '../WaveformCanvas/index.vue';

/**
 * 时长未知时的占位。
 *
 * duration 在元数据加载完成前是 NaN，流式音频则可能一直是 Infinity；
 * 显示 `--:--` 而非 `00:00`，避免让用户误以为音频长度真的为零。
 */
const UNKNOWN_DURATION = '--:--';

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
const audioUrl = ref('');

/** 键盘调节进度的步进（秒） */
const SEEK_STEP = 5;

let audio: HTMLAudioElement | null = null;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let blobUrl = ''; // 记录由 Blob 创建的临时 URL，以便 unmount 时撤销

/** seek 到该时间点以强制浏览器回填缺失的 duration 元数据 */
const SEEK_TO_END_TIME = 1e101;

// ── 计算属性 ─────────────────────────────────────────────────────────────────
const waveformData = computed(() => props.waveform ?? []);
const formattedCurrentTime = computed(() =>
  formatDuration(currentTime.value, { fallback: UNKNOWN_DURATION }),
);
const formattedDuration = computed(() =>
  formatDuration(totalDuration.value, { fallback: UNKNOWN_DURATION }),
);
const canSeek = computed(() => Number.isFinite(totalDuration.value) && totalDuration.value > 0);

// ── 监听 src 变化 ─────────────────────────────────────────────────────────────
/**
 * ObjectURL 的创建/撤销是副作用，放在 watch 而非 computed 里
 * （computed 带副作用是 Vue 反模式：求值时机不可控、可能被缓存跳过）
 */
watch(
  () => props.src,
  (src) => {
    destroyAudio();
    revokeBlobUrl();

    if (!src) {
      audioUrl.value = '';
      return;
    }

    if (typeof src === 'string') {
      audioUrl.value = src;
    } else {
      blobUrl = URL.createObjectURL(src);
      audioUrl.value = blobUrl;
    }

    initAudio(audioUrl.value);
    if (props.autoplay) play();
  },
  { immediate: true },
);

function revokeBlobUrl() {
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = '';
  }
}

// ── 音频控制 ─────────────────────────────────────────────────────────────────
function initAudio(url: string) {
  audio = new Audio(url);
  audio.onloadedmetadata = () => {
    resolveDuration(audio!);
  };
  audio.onended = () => {
    isPlaying.value = false;
    currentTime.value = 0;
    progress.value = 0;
    stopProgressTimer();
    emit('ended');
  };
  audio.onerror = () => {
    // 加载失败时若不复位，组件会停在 isPlaying=true 且毫无反馈
    handlePlaybackFailure(new Error('音频加载失败'));
  };
}

/** 统一的播放失败处理：复位状态并向外抛出 error 事件 */
function handlePlaybackFailure(error: Error) {
  isPlaying.value = false;
  stopProgressTimer();
  emit('error', error);
}

function togglePlay() {
  isPlaying.value ? pause() : play();
}

function play() {
  if (!audio || !audioUrl.value) return;
  const target = audio;
  // 自动播放被拦截时 play() 返回的 Promise 会 reject，
  // 不处理会产生 unhandled rejection 且 isPlaying 错误地停在 true
  void Promise.resolve(target.play()).catch((err: unknown) => {
    if (audio !== target) return; // 已切换音源，忽略旧实例的失败
    handlePlaybackFailure(err instanceof Error ? err : new Error('音频播放失败'));
  });
  isPlaying.value = true;
  startProgressTimer();
  emit('play');
}

function pause() {
  // 未在播放时不应派发 pause：否则挂载和切换 src 都会凭空触发一次
  const wasPlaying = isPlaying.value;
  audio?.pause();
  isPlaying.value = false;
  stopProgressTimer();
  if (wasPlaying) emit('pause');
}

function handleProgressClick(e: MouseEvent) {
  if (!audio || !hasKnownDuration()) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  seekTo(ratio * totalDuration.value);
}

/** 键盘操作进度条：← → 步进，Home/End 跳到首尾，空格/回车播放暂停 */
function handleProgressKeydown(e: KeyboardEvent) {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    togglePlay();
    return;
  }

  if (!audio || !hasKnownDuration()) return;

  const seekMap: Record<string, number> = {
    ArrowLeft: currentTime.value - SEEK_STEP,
    ArrowRight: currentTime.value + SEEK_STEP,
    Home: 0,
    End: totalDuration.value,
  };

  const target = seekMap[e.key];
  if (target === undefined) return;

  e.preventDefault();
  seekTo(target);
}

function seekTo(seconds: number) {
  if (!audio || !hasKnownDuration()) return;
  const clamped = Math.max(0, Math.min(totalDuration.value, seconds));
  audio.currentTime = clamped;
  currentTime.value = clamped;
  progress.value = clamped / totalDuration.value;
}

function startProgressTimer() {
  stopProgressTimer();
  progressTimer = setInterval(() => {
    if (!audio) return;
    currentTime.value = audio.currentTime;
    progress.value = hasKnownDuration() ? audio.currentTime / totalDuration.value : 0;
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
  if (audio) {
    // 摘掉回调并断源，否则旧实例会继续缓冲、加载失败还会派发到已切换的 src 上
    audio.onloadedmetadata = null;
    audio.onended = null;
    audio.onerror = null;
    audio.ontimeupdate = null;
    audio.removeAttribute('src');
  }
  audio = null;
  currentTime.value = 0;
  progress.value = 0;
  // 不复位会短暂沿用上一条音频的时长：显示错误时间，且能按旧时长 seek
  totalDuration.value = 0;
}

/** 时长是否已知且可用于换算进度（排除 Infinity / NaN / 0） */
function hasKnownDuration(): boolean {
  return Number.isFinite(totalDuration.value) && totalDuration.value > 0;
}

/**
 * 解析音频真实时长
 *
 * MediaRecorder 产出的 webm/ogg 缺少 duration 元数据，Chrome 会把 audio.duration
 * 报成 Infinity（本库 useSpeech 录音结果正好走这条路）。此时 seek 到一个极大时间点
 * 可以强制浏览器扫描到流末尾并回填真实时长，再把播放头复位。
 */
function resolveDuration(el: HTMLAudioElement) {
  if (Number.isFinite(el.duration)) {
    totalDuration.value = el.duration;
    return;
  }

  const restore = () => {
    el.ontimeupdate = null;
    totalDuration.value = Number.isFinite(el.duration) ? el.duration : 0;
    el.currentTime = 0;
  };

  el.ontimeupdate = restore;
  try {
    el.currentTime = SEEK_TO_END_TIME;
  } catch {
    // 部分浏览器/来源不允许 seek，保持时长为 0 并显示占位符
    el.ontimeupdate = null;
  }
}

onUnmounted(() => {
  destroyAudio();
  revokeBlobUrl();
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
    border-color: transparent transparent transparent var(--aix-colorWhite, #fff);

    &--pause {
      width: 8px;
      height: 10px;
      margin-left: 0;
      border: none;
      background: linear-gradient(
        to right,
        var(--aix-colorWhite, #fff) 35%,
        transparent 35%,
        transparent 65%,
        var(--aix-colorWhite, #fff) 65%
      );
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

    &:focus-visible {
      outline: 2px solid var(--aix-audio-player-progress-bg, var(--aix-colorPrimary, #1677ff));
      outline-offset: 3px;
    }
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
