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
import { Resampler } from './resampler';

export interface AudioSourceHubConfig {
  /** 采样率（Hz），默认 16000 */
  sampleRate?: number;
  /** 声道数，默认 1 */
  channels?: number;
  /**
   * 预滚动缓冲时长（毫秒），默认 0（关闭）
   *
   * 大于 0 时，init() 起就开始缓存最近这段时间的 PCM，首个订阅者接入时先补发缓存。
   * 流式 ASR 建连 + 下发"识别已开始"要几百毫秒，期间说的话本来会整段丢失（首句丢字）
   */
  prerollMs?: number;
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
  /** AudioContext 实际采样率 ≠ 目标采样率时的重采样器（惰性创建） */
  private resampler: Resampler | null = null;
  /** 预滚动缓存：init() 到首个订阅者接入之间的 PCM 帧 */
  private preroll: ArrayBuffer[] = [];
  /** 预滚动缓存已补发过，后续订阅者不再重放 */
  private prerollFlushed = false;
  /** 已销毁：拦住 init() 等权限期间被 destroy() 时迟到的音频流 */
  private disposed = false;

  constructor(config: AudioSourceHubConfig = {}) {
    this.config = { sampleRate: 16000, channels: 1, prerollMs: 0, ...config };
  }

  /**
   * 输出 PCM 的采样率
   *
   * 恒等于配置的目标采样率：浏览器不接受请求值时（Safari 常见）内部会重采样。
   * 这里若如实返回 AudioContext 的实际值，适配器就会向服务端申报 48000 —
   * 而阿里云 NLS 等只接受 8000/16000，识别直接失败
   */
  get sampleRate(): number {
    return this.config.sampleRate;
  }

  /**
   * 申请麦克风权限并建立音频图（幂等，重复调用复用同一路流）
   *
   * 等权限期间被 destroy() 时会 reject：那一刻还没有音轨可停，
   * 若不在流到手后补一次归还，音轨会永远活着（浏览器录音红点常亮）
   */
  async init(): Promise<MediaStream> {
    if (this.stream) return this.stream;
    this.disposed = false;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: this.config.sampleRate,
        channelCount: this.config.channels,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    if (this.disposed) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('AudioSourceHub 已在初始化期间被销毁');
    }

    this.stream = stream;
    // 已有订阅者在 init() 之前登记时补建抽头，避免它们永远收不到音频；
    // 开了预滚动则立即起抽头，从这一刻开始缓存
    if (this.pcmCallbacks.length > 0 || this.config.prerollMs > 0) this.ensureTap();
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
    this.flushPreroll(callback);
    return () => {
      removeCallback(this.pcmCallbacks, callback);
      // 开了预滚动时抽头要一直留着（它同时负责缓存），由 destroy() 统一拆除
      if (this.pcmCallbacks.length === 0 && this.config.prerollMs <= 0) this.teardownTap();
    };
  }

  /** 释放所有资源：拆除抽头、关闭 AudioContext、停止麦克风音轨 */
  destroy(): void {
    this.disposed = true;
    this.teardownTap();
    this.pcmCallbacks = [];
    this.preroll = [];
    this.prerollFlushed = false;
    this.resampler = null;
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
      const buffering = this.config.prerollMs > 0 && !this.prerollFlushed;
      if (this.pcmCallbacks.length === 0 && !buffering) return;

      const frame = this.toInt16Frame(event.inputBuffer.getChannelData(0), context.sampleRate);
      if (buffering) this.pushPreroll(frame);
      // 每个订阅者拿到独立副本，避免一方转移 ArrayBuffer 所有权后影响其他订阅者
      [...this.pcmCallbacks].forEach((cb) => cb(frame.slice(0)));
    };

    // 经 gain=0 的静音闸门接入 destination：既保证 onaudioprocess 持续触发，
    // 又避免麦克风原样回放造成啸叫
    this.muteGain = context.createGain();
    this.muteGain.gain.value = 0;

    this.source.connect(this.processor);
    this.processor.connect(this.muteGain);
    this.muteGain.connect(context.destination);
  }

  /**
   * Float32 采样 → 16-bit PCM 帧
   * 上下文采样率与目标不一致时先线性重采样，保证申报值与实际数据一致
   */
  private toInt16Frame(float32: Float32Array, contextSampleRate: number): ArrayBuffer {
    let samples = float32;
    if (contextSampleRate !== this.config.sampleRate) {
      if (!this.resampler) {
        this.resampler = new Resampler({
          sourceSampleRate: contextSampleRate,
          targetSampleRate: this.config.sampleRate,
          channels: this.config.channels,
        });
      }
      samples = this.resampler.resample(float32);
    }

    const int16 = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      int16[i] = Math.max(-1, Math.min(1, samples[i] ?? 0)) * 0x7fff;
    }
    return int16.buffer;
  }

  /** 追加到预滚动缓存，并按 prerollMs 丢弃过旧的帧 */
  private pushPreroll(frame: ArrayBuffer): void {
    this.preroll.push(frame);
    // 2 字节/采样点
    const maxBytes = Math.ceil((this.config.prerollMs / 1000) * this.config.sampleRate) * 2;
    let total = this.preroll.reduce((sum, f) => sum + f.byteLength, 0);
    while (this.preroll.length > 1 && total > maxBytes) {
      total -= this.preroll.shift()!.byteLength;
    }
  }

  /** 把缓存的音频补发给首个订阅者，之后停止缓存 */
  private flushPreroll(callback: (frame: ArrayBuffer) => void): void {
    if (this.config.prerollMs <= 0 || this.prerollFlushed) return;
    this.prerollFlushed = true;
    const buffered = this.preroll;
    this.preroll = [];
    buffered.forEach((frame) => callback(frame));
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
