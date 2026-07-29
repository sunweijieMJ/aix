/**
 * useWaveform - 波形数据管理 Composable
 * 负责收集录音期间的实时波形数据，并支持静态波形回放
 */
import { ref, computed, onUnmounted } from 'vue';
import { WaveformAnalyser } from '../core/audio/waveformAnalyser';

export function useWaveform() {
  const points = ref<number[]>([]);
  const progress = ref(0);
  const isCapturing = ref(false);

  let analyser: WaveformAnalyser | null = null;
  let fullSamples: number[] = []; // 录音期间收集的全量采样（用于回放）
  const MAX_POINTS = 80; // 实时滚动窗口最多保留 80 个数据点

  const hasData = computed(() => points.value.length > 0);

  // ── 采集控制 ─────────────────────────────────────────────────────────────────

  /**
   * 开始采集波形
   * @param stream - 音频流
   * @param context - 可选的共享 AudioContext（由 AudioSourceHub 提供），避免重复创建
   */
  function startCapture(stream: MediaStream, context?: AudioContext): void {
    stopCapture();
    fullSamples = [];
    analyser = new WaveformAnalyser({ fftSize: 256, smoothingTimeConstant: 0.8 });
    analyser.connect(stream, context);
    isCapturing.value = true;

    // analyser 以 rAF 频率采样，但每 90ms 才更新一次 UI，80点 × 90ms ≈ 7.2s 滚动窗口
    let lastSampleTime = 0;
    const SAMPLE_INTERVAL_MS = 90;

    analyser.start((normalized) => {
      const now = performance.now();
      if (now - lastSampleTime < SAMPLE_INTERVAL_MS) return;
      lastSampleTime = now;
      points.value = [...points.value.slice(-(MAX_POINTS - 1)), normalized];
      fullSamples.push(normalized);
    });
  }

  function stopCapture(): void {
    if (analyser) {
      analyser.stop();
      analyser.destroy();
      analyser = null;
    }
    isCapturing.value = false;
  }

  // ── 播放进度 ─────────────────────────────────────────────────────────────────

  function setProgress(value: number): void {
    progress.value = Math.max(0, Math.min(1, value));
  }

  // ── 快照 ─────────────────────────────────────────────────────────────────────

  function snapshot(): number[] {
    return [...points.value];
  }

  /**
   * 获取完整录音的降采样快照
   * 将全量采样均匀降采样为 barCount 个点（取每段最大值，保留波形峰值特征）
   */
  function fullSnapshot(barCount = MAX_POINTS): number[] {
    if (fullSamples.length === 0) return [];
    if (fullSamples.length <= barCount) return [...fullSamples];

    const step = fullSamples.length / barCount;
    const result: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const start = Math.floor(i * step);
      const end = Math.floor((i + 1) * step);
      let max = 0;
      for (let j = start; j < end; j++) {
        const v = fullSamples[j] ?? 0;
        if (v > max) max = v;
      }
      result.push(max);
    }
    return result;
  }

  /**
   * 获取当前实时能量（0-1），未在采集中时返回 0
   * 供 VAD 静音检测使用
   */
  function getEnergy(): number {
    if (!analyser) return 0;
    try {
      return analyser.getEnergy();
    } catch {
      // analyser 已销毁或尚未连接
      return 0;
    }
  }

  /** 加载静态波形数据（播放已录内容时使用） */
  function loadStatic(data: number[]): void {
    points.value = [...data];
  }

  function reset(): void {
    stopCapture();
    points.value = [];
    progress.value = 0;
    fullSamples = [];
  }

  onUnmounted(() => stopCapture());

  return {
    points,
    progress,
    isCapturing,
    hasData,
    startCapture,
    stopCapture,
    setProgress,
    snapshot,
    fullSnapshot,
    loadStatic,
    getEnergy,
    reset,
  };
}
