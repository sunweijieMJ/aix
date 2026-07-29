/**
 * WaveformAnalyser - 波形数据分析器
 * 从音频流中提取实时 RMS 能量，归一化为 0-1 波形数据点
 */

export interface WaveformAnalyserConfig {
  /** FFT 大小，默认 256 */
  fftSize?: number;
  /** 平滑时间常数（0-1），默认 0.8 */
  smoothingTimeConstant?: number;
  /** 最小分贝，默认 -90 */
  minDecibels?: number;
  /** 最大分贝，默认 -10 */
  maxDecibels?: number;
}

const DEFAULT_CONFIG: Required<WaveformAnalyserConfig> = {
  fftSize: 256,
  smoothingTimeConstant: 0.8,
  minDecibels: -90,
  maxDecibels: -10,
};

export class WaveformAnalyser {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationId: number | null = null;
  private config: Required<WaveformAnalyserConfig>;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  /** AudioContext 是否归本实例所有：外部注入的由注入方负责关闭 */
  private ownsContext = true;

  constructor(config: WaveformAnalyserConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 连接音频流
   * @param stream - 音频流
   * @param context - 可选的外部 AudioContext（由 AudioSourceHub 提供）。
   *   传入时复用该上下文，destroy() 不会将其关闭，避免同一次录音开多个 AudioContext。
   */
  connect(stream: MediaStream, context?: AudioContext): void {
    this.ownsContext = !context;
    this.audioContext = context ?? new AudioContext();
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();

    this.analyser.fftSize = this.config.fftSize;
    this.analyser.smoothingTimeConstant = this.config.smoothingTimeConstant;
    this.analyser.minDecibels = this.config.minDecibels;
    this.analyser.maxDecibels = this.config.maxDecibels;

    this.source.connect(this.analyser);
    this.dataArray = new Uint8Array(this.analyser.fftSize) as Uint8Array<ArrayBuffer>;
  }

  /**
   * 开始以 rAF 频率采集波形数据
   * @param callback - 每帧回调，接收归一化能量值（0-1）
   */
  start(callback: (data: number) => void): void {
    if (!this.analyser || !this.dataArray) {
      throw new Error('请先调用 connect() 连接音频流');
    }

    const tick = () => {
      if (!this.analyser || !this.dataArray) return;

      this.analyser.getByteTimeDomainData(this.dataArray);
      const rms = this.calculateRMS(this.dataArray);
      const normalized = Math.min(rms / 50, 1);

      callback(normalized);
      this.animationId = requestAnimationFrame(tick);
    };

    this.animationId = requestAnimationFrame(tick);
  }

  /**
   * 停止采集（不释放资源，可重新 start）
   */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * 获取当前频率数据
   */
  getFrequencyData(): Uint8Array {
    if (!this.analyser) throw new Error('Analyser 未初始化');
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  /**
   * 获取当前时域数据
   */
  getTimeDomainData(): Uint8Array {
    if (!this.analyser || !this.dataArray) throw new Error('Analyser 未初始化');
    this.analyser.getByteTimeDomainData(this.dataArray);
    return this.dataArray;
  }

  /**
   * 获取当前能量值（0-1）
   */
  getEnergy(): number {
    const data = this.getTimeDomainData();
    return Math.min(this.calculateRMS(data) / 50, 1);
  }

  /**
   * 销毁并释放所有音频资源
   */
  destroy(): void {
    this.stop();
    this.source?.disconnect();
    this.analyser?.disconnect();
    if (this.ownsContext) this.audioContext?.close();
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.dataArray = null;
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────────

  /** 计算 RMS 能量（0-100 范围） */
  private calculateRMS(data: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = ((data[i] ?? 128) - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / data.length) * 100;
  }
}
