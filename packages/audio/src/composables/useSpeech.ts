/**
 * useSpeech - 统一入口 Composable（唯一协调者）
 * 单一 Recorder + 计时器 + 波形，通过 useASR/useTTS 获取识别/合成能力
 */
import { ref, computed, onUnmounted } from 'vue';
import { Recorder } from '../core/audio/recorder';
import type { SpeechConfig, RecordingResult, TTSOptions } from '../types';
import { useASR } from './useASR';
import { useTTS } from './useTTS';
import { useWaveform } from './useWaveform';

export function useSpeech(config: SpeechConfig = {}) {
  const asr = useASR(config.asr);
  const tts = useTTS(config.tts);
  const waveform = useWaveform();

  // ── 录音状态 ─────────────────────────────────────────────────────────────────
  const isRecording = ref(false);
  const duration = ref(0);
  const recordingResult = ref<RecordingResult | null>(null);

  let recorder: Recorder | null = null;
  let durationTimer: ReturnType<typeof setInterval> | null = null;
  let waveformSnapshot: number[] = [];

  // ── 计算属性 ─────────────────────────────────────────────────────────────────
  const formattedDuration = computed(() => {
    const m = Math.floor(duration.value / 60);
    const s = duration.value % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });

  // ── 开始录音 ─────────────────────────────────────────────────────────────────
  async function startRecording(): Promise<void> {
    if (isRecording.value) return;

    try {
      recordingResult.value = null;
      duration.value = 0;
      waveformSnapshot = [];
      asr.resetText();

      recorder = new Recorder(
        {
          sampleRate: config.asr?.sampleRate ?? 16000,
          channels: 1,
          maxDuration: 300,
        },
        {
          onStop: (result: RecordingResult) => {
            recordingResult.value = { ...result, waveform: [...waveformSnapshot] };
          },
          onError: (err) => {
            asr.error.value = err;
            stopRecording();
          },
        },
      );

      await recorder.init();

      const stream = recorder.getMediaStream();
      if (stream) waveform.startCapture(stream);

      recorder.start();
      isRecording.value = true;

      durationTimer = setInterval(() => {
        duration.value++;
      }, 1000);

      await asr.connect();
      asr.startRecognition();
    } catch (err) {
      asr.error.value = err instanceof Error ? err : new Error('启动录音失败');
      cleanupRecording();
    }
  }

  // ── 停止录音 ─────────────────────────────────────────────────────────────────
  async function stopRecording(): Promise<RecordingResult | null> {
    if (!isRecording.value) return recordingResult.value;

    asr.stopRecognition();
    waveform.stopCapture();
    waveformSnapshot = waveform.fullSnapshot();
    clearDurationTimer();

    isRecording.value = false;
    recorder?.stop();

    await waitForRecordingResult();
    return recordingResult.value;
  }

  function waitForRecordingResult(): Promise<void> {
    return new Promise((resolve) => {
      if (recordingResult.value) {
        resolve();
        return;
      }
      const maxWait = 3000;
      const interval = 50;
      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += interval;
        if (recordingResult.value || elapsed >= maxWait) {
          clearInterval(timer);
          resolve();
        }
      }, interval);
    });
  }

  // ── 暂停 / 恢复 ──────────────────────────────────────────────────────────────
  function pauseRecording(): void {
    recorder?.pause();
    clearDurationTimer();
  }

  function resumeRecording(): void {
    recorder?.resume();
    durationTimer = setInterval(() => {
      duration.value++;
    }, 1000);
  }

  // ── 重置 ─────────────────────────────────────────────────────────────────────
  async function resetRecording(): Promise<void> {
    await stopRecording();
    cleanupRecording();
    asr.resetText();
    waveform.reset();
    duration.value = 0;
    if (recordingResult.value?.url) URL.revokeObjectURL(recordingResult.value.url);
    recordingResult.value = null;
    waveformSnapshot = [];
  }

  // ── TTS ──────────────────────────────────────────────────────────────────────
  async function speak(text: string, options?: TTSOptions): Promise<void> {
    await tts.speak(text, options);
  }
  function pauseSpeaking(): void {
    tts.pause();
  }
  function resumeSpeaking(): void {
    tts.resume();
  }
  function stopSpeaking(): void {
    tts.stop();
  }

  // ── 供应商切换 ────────────────────────────────────────────────────────────────
  function setProvider(
    type: 'asr' | 'tts',
    providerOptions: SpeechConfig['asr'] | SpeechConfig['tts'],
  ): void {
    if (type === 'asr') {
      asr.switchProvider({
        ...config.asr,
        ...(providerOptions as SpeechConfig['asr']),
      } as NonNullable<SpeechConfig['asr']>);
    } else {
      tts.switchProvider({
        ...config.tts,
        ...(providerOptions as SpeechConfig['tts']),
      } as NonNullable<SpeechConfig['tts']>);
    }
  }

  // ── 内部工具 ──────────────────────────────────────────────────────────────────
  function clearDurationTimer(): void {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = null;
    }
  }

  function cleanupRecording(): void {
    clearDurationTimer();
    waveform.stopCapture();
    recorder?.destroy();
    recorder = null;
    isRecording.value = false;
  }

  onUnmounted(() => {
    cleanupRecording();
    stopSpeaking();
    if (recordingResult.value?.url) URL.revokeObjectURL(recordingResult.value.url);
  });

  return {
    // ASR
    state: asr.state,
    finalText: asr.finalText,
    interimText: asr.interimText,
    displayText: asr.displayText,
    asrError: asr.error,

    // TTS
    ttsState: tts.state,
    ttsError: tts.error,
    isSpeaking: computed(() => tts.isPlaying.value),

    // 录音
    isRecording,
    duration,
    formattedDuration,
    recordingResult,

    // 波形
    waveformData: waveform.points,
    waveformProgress: waveform.progress,
    setWaveformProgress: waveform.setProgress,
    loadWaveform: waveform.loadStatic,

    // 方法
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    speak,
    pauseSpeaking,
    resumeSpeaking,
    stopSpeaking,
    setProvider,
  };
}
