/**
 * AudioSourceHub - 单一麦克风音源中枢
 *
 * 一次录音只申请一次 getUserMedia、只开一个 AudioContext，
 * 同时供给三类消费者：
 *   1. MediaRecorder（Recorder）—— 取 MediaStream 录制文件
 *   2. 波形分析（WaveformAnalyser）—— 复用 AudioContext 挂 AnalyserNode
 *   3. 流式 ASR 适配器 —— 通过 onPCM 订阅 16-bit PCM 帧
 *
 * 没有它时，Recorder 和 AliyunASR 会各自 getUserMedia，
 * 波形分析再单开一个 AudioContext，同一次录音占用两路麦克风采集。
 */
import type { PCMAudioSource, Unsubscribe } from '../adapters/asr/base';
import { removeCallback } from '../adapters/asr/base';

export interface AudioSourceHubConfig {
  /** 采样率（Hz），默认 16000 */
  sampleRate?: number;
  /** 声道数，默认 1 */
  channels?: number;
}

/** 每个 ScriptProcessor 缓冲区大小（采样点），2048 约 128ms @16kHz */
const SCRIPT_PROCESSOR_BUFFER_SIZE = 2048;

export class AudioSourceHub implements PCMAudioSource {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  /** @deprecated ScriptProcessorNode 已废弃，后续可升级为 AudioWorklet */
  private processor: ScriptProcessorNode | null = null;
  /** 静音闸门：ScriptProcessor 必须接到 destination 才持续触发，但不能让麦克风回放 */
  private muteGain: GainNode | null = null;
  private pcmCallbacks: Array<(frame: ArrayBuffer) => void> = [];
  private readonly config: Required<AudioSourceHubConfig>;

  constructor(config: AudioSourceHubConfig = {}) {
    this.config = { sampleRate: 16000, channels: 1, ...config };
  }

  get sampleRate(): number {
    // AudioContext 实际采样率可能与请求值不同，以实际为准
    return this.context?.sampleRate ?? this.config.sampleRate;
  }

  /** 申请麦克风权限并建立音频图（幂等，重复调用复用同一路流） */
  async init(): Promise<MediaStream> {
    if (this.stream) return this.stream;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: this.config.sampleRate,
        channelCount: this.config.channels,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    // 若已有订阅者在 init() 之前登记，此时补建抽头，避免它们永远收不到音频
    if (this.pcmCallbacks.length > 0) this.ensureTap();
    return this.stream;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  /** 获取共享 AudioContext（首次访问时惰性创建） */
  getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: this.config.sampleRate });
    }
    return this.context;
  }

  /**
   * 订阅 16-bit PCM 帧，返回取消订阅函数
   * 首个订阅者触发 PCM 抽头创建，最后一个取消时自动拆除，不做无谓的音频处理
   */
  onPCM(callback: (frame: ArrayBuffer) => void): Unsubscribe {
    this.pcmCallbacks.push(callback);
    this.ensureTap();
    return () => {
      removeCallback(this.pcmCallbacks, callback);
      if (this.pcmCallbacks.length === 0) this.teardownTap();
    };
  }

  /** 释放所有资源：拆除抽头、关闭 AudioContext、停止麦克风音轨 */
  destroy(): void {
    this.teardownTap();
    this.pcmCallbacks = [];
    this.source?.disconnect();
    this.source = null;
    this.context?.close();
    this.context = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────────

  /** 建立 MediaStream → ScriptProcessor 的 PCM 抽头 */
  private ensureTap(): void {
    if (this.processor || !this.stream) return;

    const context = this.getContext();
    if (!this.source) {
      this.source = context.createMediaStreamSource(this.stream);
    }

    this.processor = context.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (this.pcmCallbacks.length === 0) return;
      const float32 = event.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-1, Math.min(1, float32[i] ?? 0)) * 0x7fff;
      }
      // 每个订阅者拿到独立副本，避免一方转移 ArrayBuffer 所有权后影响其他订阅者
      [...this.pcmCallbacks].forEach((cb) => cb(int16.buffer.slice(0)));
    };

    // 经 gain=0 的静音闸门接入 destination：既保证 onaudioprocess 持续触发，
    // 又避免麦克风原样回放造成啸叫
    this.muteGain = context.createGain();
    this.muteGain.gain.value = 0;

    this.source.connect(this.processor);
    this.processor.connect(this.muteGain);
    this.muteGain.connect(context.destination);
  }

  private teardownTap(): void {
    if (!this.processor) return;
    this.processor.onaudioprocess = null;
    this.processor.disconnect();
    this.processor = null;
    this.muteGain?.disconnect();
    this.muteGain = null;
  }
}
