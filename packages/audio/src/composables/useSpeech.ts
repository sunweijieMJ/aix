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

/**
 * 流式 ASR 的预滚动缓冲时长（毫秒）
 * 建连 + 服务端确认要几百毫秒，这段时间说的话不缓存就整段丢失（首句丢字）
 */
const ASR_PREROLL_MS = 3000;

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
  /**
   * 录音会话代次
   *
   * stopRecording() 要等 MediaRecorder 的 onstop 回填结果（异步），这期间用户完全
   * 可能重新开始录音。没有代次保护时，迟到的收尾流程会把**新一轮**的麦克风与
   * AudioContext 一并释放，新录音变成"UI 显示录音中、实际已断麦"的假死状态
   */
  let sessionId = 0;

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
    const session = ++sessionId;
    /**
     * 本轮的音源必须另用局部变量持有：被新一轮取代后 `audioHub` 已指向对方的实例，
     * 只有这个引用还能销毁本轮自己的资源
     */
    let hub: AudioSourceHub | null = null;

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

      // 唯一一次 getUserMedia，下面三个消费者共用这一路流。
      // 只有需要编排层推流的适配器才开预滚动缓冲，BrowserASR 自采麦克风用不上
      hub = new AudioSourceHub({
        sampleRate,
        channels: 1,
        prerollMs: asr.needsAudioSource() ? ASR_PREROLL_MS : 0,
      });
      audioHub = hub;
      const stream = await hub.init();
      // 等权限期间已被新一轮取代。新一轮的 cleanupRecording() 在音轨到手之前就
      // destroy 过一次（那时无轨可停），这里必须再销毁一次，否则麦克风永久泄漏
      if (session !== sessionId) {
        hub.destroy();
        return;
      }

      recorder = new Recorder(
        {
          sampleRate,
          channels: 1,
          // 消费方配置的 mimeType / 声道等一并透传，此前只认 maxDuration
          ...config.recorder,
          maxDuration: config.recorder?.maxDuration ?? DEFAULT_MAX_DURATION,
        },
        {
          onStop: (result: RecordingResult) => {
            if (session !== sessionId) {
              // 本轮已被取代，结果丢弃前先撤销 URL，否则 Blob 一直被引用
              URL.revokeObjectURL(result.url);
              return;
            }
            recordingResult.value = { ...result, waveform: [...waveformSnapshot] };
          },
          onError: (err) => {
            if (session !== sessionId) return;
            asr.error.value = err;
            void stopRecording();
          },
          onMaxDuration: () => {
            // 录音器已自行停止，这里同步编排层状态
            if (session !== sessionId) return;
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

      // 识别链路失败不该连累录音本身：麦克风已就绪，音频照录，
      // 只把错误通过 asrError 暴露出去（此前会整轮丢弃，用户白录一段）
      try {
        await asr.connect();
        // 建连期间本轮可能已经结束（用户点停 / VAD 静音 / 达到 maxDuration）或被新一轮
        // 取代。此时再 attach + start，识别会在没有音源的情况下跑起来：state 卡在
        // recording、后端凭空多一个已开启的识别任务，socket 一断还会反复重连
        if (session !== sessionId || !isRecording.value) return;
        // 需要外部推流的适配器（ProxyASR / 注入模式的 AliyunASR）在此接上共享音源，
        // 连接期间缓存的预滚动音频会一并补发
        asr.attachAudioSource(audioHub);
        asr.startRecognition();
      } catch (err) {
        asr.error.value = err instanceof Error ? err : new Error('语音识别启动失败');
      }
    } catch (err) {
      // 本轮已被取代：错误与清理都归新一轮，这里只回收本轮自己的资源，
      // 否则 cleanupRecording() 会把新一轮的麦克风一并拆掉
      if (session !== sessionId) {
        hub?.destroy();
        return;
      }
      asr.error.value = err instanceof Error ? err : new Error('启动录音失败');
      cleanupRecording();
    }
  }

  // ── 停止录音 ─────────────────────────────────────────────────────────────────
  async function stopRecording(): Promise<RecordingResult | null> {
    if (!isRecording.value) return recordingResult.value;

    // 同步区间：新一轮录音只可能在下面的 await 之后插入，此处状态更新是安全的
    const session = sessionId;

    asr.stopRecognition();
    stopSilenceDetection();
    waveform.stopCapture();
    waveformSnapshot = waveform.fullSnapshot();
    clearDurationTimer();

    isRecording.value = false;
    recorder?.stop();

    // 必须等结果回填后再释放资源：Recorder.onstop 依赖 MediaRecorder 存活
    await waitForRecordingResult(session);

    // 释放麦克风。缺了这步音轨会一直活着（浏览器录音红点常亮），
    // 且下一次 startRecording 会再开一路流，逐次泄漏。
    // 传代次：本轮若已被新一轮取代，释放的就该是别人的资源，必须跳过
    releaseAudioResources(session);

    return recordingResult.value;
  }

  /** 等待本轮 onstop 回填结果；本轮被新一轮取代时立即返回，不再空等满 3 秒 */
  function waitForRecordingResult(session: number): Promise<void> {
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
        if (recordingResult.value || elapsed >= maxWait || session !== sessionId) {
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
  /**
   * 运行时切换供应商
   *
   * ASR 切换要重新建连，因此返回 Promise。失败不向外抛：调用点多是 UI 事件处理器，
   * 抛出只会变成 unhandledrejection；错误统一经 `asrError` 暴露
   */
  async function setProvider(
    type: 'asr' | 'tts',
    providerOptions: SpeechConfig['asr'] | SpeechConfig['tts'],
  ): Promise<void> {
    if (type === 'asr') {
      try {
        await asr.switchProvider({
          ...config.asr,
          ...(providerOptions as SpeechConfig['asr']),
        } as NonNullable<SpeechConfig['asr']>);
      } catch (err) {
        asr.error.value = err instanceof Error ? err : new Error('切换 ASR 供应商失败');
      }
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
   *
   * @param session - 发起释放时的会话代次。已被新一轮录音取代时直接跳过，
   *   否则迟到的收尾会拆掉新会话的麦克风。不传表示"无条件释放当前资源"
   */
  function releaseAudioResources(session?: number): void {
    if (session !== undefined && session !== sessionId) return;
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
