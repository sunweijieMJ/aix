/**
 * useSpeech - 统一入口 Composable（唯一协调者）
 * 单一 Recorder + 计时器 + 波形，通过 useASR/useTTS 获取识别/合成能力
 */
import { ref, computed, onUnmounted } from 'vue';
import { AudioSourceHub } from '../core/audio/audioSourceHub';
import { Recorder } from '../core/audio/recorder';
import { VAD } from '../core/audio/vad';
import type { SpeechConfig, RecordingResult, TTSOptions } from '../types';
import { useASR } from './useASR';
import { useTTS } from './useTTS';
import { useWaveform } from './useWaveform';

/** 未显式配置时的最大录音时长（秒） */
const DEFAULT_MAX_DURATION = 300;

export function useSpeech(config: SpeechConfig = {}) {
  const asr = useASR(config.asr, config.fallback?.asr);
  const tts = useTTS(config.tts, config.fallback?.tts);
  const waveform = useWaveform();

  // ── 录音状态 ─────────────────────────────────────────────────────────────────
  const isRecording = ref(false);
  const isPaused = ref(false);
  const duration = ref(0);
  const recordingResult = ref<RecordingResult | null>(null);
  /** 本轮是否因达到最大时长被自动停止 */
  const reachedMaxDuration = ref(false);
  /** 本轮是否因静音超时被自动停止 */
  const reachedSilenceTimeout = ref(false);
  /** VAD 判定的用户说话状态（仅在配置了 maxSilenceDuration 时有意义） */
  const isVoiceActive = ref(false);

  let recorder: Recorder | null = null;
  /** 单一麦克风音源：录音、波形、流式 ASR 共用同一路流与同一个 AudioContext */
  let audioHub: AudioSourceHub | null = null;
  let vad: VAD | null = null;
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

    // 上一轮可能残留未释放的 recorder / 音源，先彻底清理再开新一轮
    cleanupRecording();

    try {
      // 撤销上一轮录音的 ObjectURL，否则反复录音会持续泄漏 Blob 引用
      revokeRecordingUrl();
      recordingResult.value = null;
      duration.value = 0;
      isPaused.value = false;
      reachedMaxDuration.value = false;
      reachedSilenceTimeout.value = false;
      waveformSnapshot = [];
      asr.resetText();

      const sampleRate = config.asr?.sampleRate ?? 16000;

      // 唯一一次 getUserMedia，下面三个消费者共用这一路流
      audioHub = new AudioSourceHub({ sampleRate, channels: 1 });
      const stream = await audioHub.init();

      recorder = new Recorder(
        {
          sampleRate,
          channels: 1,
          maxDuration: config.recorder?.maxDuration ?? DEFAULT_MAX_DURATION,
        },
        {
          onStop: (result: RecordingResult) => {
            recordingResult.value = { ...result, waveform: [...waveformSnapshot] };
          },
          onError: (err) => {
            asr.error.value = err;
            stopRecording();
          },
          onMaxDuration: () => {
            // 录音器已自行停止，这里同步编排层状态
            reachedMaxDuration.value = true;
            void stopRecording();
          },
        },
      );

      await recorder.init(stream);
      waveform.startCapture(stream, audioHub.getContext());

      recorder.start();
      isRecording.value = true;

      startDurationTimer();

      startSilenceDetection();

      await asr.connect();
      // 需要外部推流的适配器（ProxyASR / 注入模式的 AliyunASR）在此接上共享音源，
      // BrowserASR 自采麦克风，attachAudioSource 对它是无操作
      asr.attachAudioSource(audioHub);
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
    stopSilenceDetection();
    waveform.stopCapture();
    waveformSnapshot = waveform.fullSnapshot();
    clearDurationTimer();

    isRecording.value = false;
    recorder?.stop();

    // 必须等结果回填后再释放资源：Recorder.onstop 依赖 MediaRecorder 存活
    await waitForRecordingResult();

    // 释放麦克风。缺了这步音轨会一直活着（浏览器录音红点常亮），
    // 且下一次 startRecording 会再开一路流，逐次泄漏
    releaseAudioResources();

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
    if (!isRecording.value || isPaused.value) return;
    recorder?.pause();
    clearDurationTimer();
    isPaused.value = true;
  }

  /** 重复调用不会叠加计时器（旧实现会让计时翻倍） */
  function resumeRecording(): void {
    if (!isRecording.value || !isPaused.value) return;
    recorder?.resume();
    startDurationTimer();
    isPaused.value = false;
  }

  // ── 重置 ─────────────────────────────────────────────────────────────────────
  async function resetRecording(): Promise<void> {
    await stopRecording();
    cleanupRecording();
    asr.resetText();
    waveform.reset();
    duration.value = 0;
    revokeRecordingUrl();
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
  /**
   * 启动静音检测
   * 仅在配置了 asr.maxSilenceDuration 时生效：持续静音达到该时长后自动停止录音
   */
  function startSilenceDetection(): void {
    stopSilenceDetection();
    const maxSilence = config.asr?.maxSilenceDuration;
    if (!maxSilence || maxSilence <= 0) return;

    vad = new VAD({
      ...config.vad,
      silenceDuration: maxSilence * 1000, // 配置以秒计，VAD 内部以毫秒计
    });
    vad.start(waveform.getEnergy, (event) => {
      isVoiceActive.value = !event.isSilent;
      if (event.isSilent) {
        reachedSilenceTimeout.value = true;
        void stopRecording();
      }
    });
  }

  function stopSilenceDetection(): void {
    vad?.stop();
    vad = null;
    isVoiceActive.value = false;
  }

  /** 撤销当前录音结果的临时 URL（幂等） */
  function revokeRecordingUrl(): void {
    if (recordingResult.value?.url) URL.revokeObjectURL(recordingResult.value.url);
  }

  /**
   * 计时统一以 Recorder 的净录音时长为准（排除暂停时段），
   * 避免 UI 计时与 RecordingResult.duration 两套口径对不上
   */
  function startDurationTimer(): void {
    clearDurationTimer();
    durationTimer = setInterval(() => {
      if (recorder) duration.value = Math.floor(recorder.getDuration());
    }, 200);
  }

  function clearDurationTimer(): void {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = null;
    }
  }

  /**
   * 释放音频采集链路：波形分析 → 录音器 → 共享音源
   * 顺序不能颠倒，音源 destroy() 会停掉音轨，先停消费者更干净
   */
  function releaseAudioResources(): void {
    stopSilenceDetection();
    waveform.stopCapture();
    asr.attachAudioSource(null);
    recorder?.destroy();
    recorder = null;
    audioHub?.destroy();
    audioHub = null;
  }

  function cleanupRecording(): void {
    clearDurationTimer();
    releaseAudioResources();
    isRecording.value = false;
    isPaused.value = false;
  }

  onUnmounted(() => {
    cleanupRecording();
    stopSpeaking();
    revokeRecordingUrl();
  });

  return {
    // ASR
    state: asr.state,
    finalText: asr.finalText,
    interimText: asr.interimText,
    displayText: asr.displayText,
    asrError: asr.error,
    asrDidFallback: asr.didFallback,

    // TTS
    ttsState: tts.state,
    ttsError: tts.error,
    ttsDidFallback: tts.didFallback,
    isSpeaking: computed(() => tts.isPlaying.value),

    // 录音
    isRecording,
    isPaused,
    duration,
    formattedDuration,
    recordingResult,
    reachedMaxDuration,
    reachedSilenceTimeout,
    isVoiceActive,

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
