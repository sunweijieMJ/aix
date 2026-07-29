/**
 * Recorder - 跨浏览器录音器
 * 封装 MediaRecorder，处理浏览器兼容性
 */
import type { RecorderConfig, RecordingResult } from '../../types';

export type RecorderState = 'inactive' | 'recording' | 'paused';

export interface RecorderEvents {
  onDataAvailable?: (chunk: Blob) => void;
  onStop?: (result: RecordingResult) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: RecorderState) => void;
  /** 达到 maxDuration 被自动停止时触发（在 onStop 之前） */
  onMaxDuration?: () => void;
}

const DEFAULT_CONFIG: Required<RecorderConfig> = {
  sampleRate: 16000,
  channels: 1,
  maxDuration: 60,
  mimeType: '', // 自动检测
};

/** 剔除值为 undefined 的键，避免展开时把默认值覆盖掉 */
function stripUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export class Recorder {
  private config: Required<RecorderConfig>;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private events: RecorderEvents = {};

  /** 本段（上次 start/resume 起）的开始时刻 */
  private segmentStart = 0;
  /** 此前各段累计的净录音时长（毫秒），不含暂停 */
  private accumulatedMs = 0;
  /** maxDuration 倒计时句柄 */
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  /** 音轨是否归本实例所有：外部注入的流由注入方负责释放 */
  private ownsStream = true;

  constructor(config: RecorderConfig = {}, events: RecorderEvents = {}) {
    // 显式传 undefined 应与不传等价，直接展开会把默认值覆盖成 undefined
    this.config = { ...DEFAULT_CONFIG, ...stripUndefined(config) };
    this.events = events;
  }

  /**
   * 初始化录音器
   * @param stream - 可选的外部 MediaStream（由 AudioSourceHub 提供）。
   *   传入时复用该流，不再重复申请麦克风权限，且 destroy() 不会停止其音轨。
   */
  async init(stream?: MediaStream): Promise<void> {
    if (stream) {
      this.mediaStream = stream;
      this.ownsStream = false;
      return;
    }

    try {
      this.ownsStream = true;
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('麦克风权限被拒绝');
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * 开始录音
   */
  start(): void {
    if (!this.mediaStream) {
      throw new Error('请先调用 init() 初始化录音器');
    }

    try {
      const mimeType = this.config.mimeType || this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.mediaStream, mimeType ? { mimeType } : {});

      this.chunks = [];
      this.accumulatedMs = 0;
      this.segmentStart = Date.now();

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data);
          this.events.onDataAvailable?.(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.handleStop();
      };

      this.mediaRecorder.onerror = (e) => {
        this.events.onError?.(new Error(`录音错误: ${e}`));
      };

      this.mediaRecorder.onstart = () => {
        this.events.onStateChange?.('recording');
      };

      this.mediaRecorder.onpause = () => {
        this.events.onStateChange?.('paused');
      };

      this.mediaRecorder.onresume = () => {
        this.events.onStateChange?.('recording');
      };

      this.mediaRecorder.start(100); // 每 100ms 收集一次数据
      this.scheduleMaxDuration();
    } catch (error) {
      const err = error instanceof Error ? error : new Error('启动录音失败');
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * 停止录音
   */
  stop(): void {
    this.clearMaxDurationTimer();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.settleSegment();
      this.mediaRecorder.stop();
    }
  }

  /**
   * 暂停录音（同时挂起 maxDuration 倒计时）
   */
  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.settleSegment();
      this.clearMaxDurationTimer();
      this.mediaRecorder.pause();
    }
  }

  /**
   * 恢复录音（按剩余时长续算 maxDuration）
   */
  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.segmentStart = Date.now();
      this.mediaRecorder.resume();
      this.scheduleMaxDuration();
    }
  }

  /**
   * 已录制的净时长（秒），不含暂停时段
   */
  getDuration(): number {
    return this.elapsedMs() / 1000;
  }

  /**
   * 获取当前状态
   */
  getState(): RecorderState {
    return this.mediaRecorder?.state || 'inactive';
  }

  /**
   * 获取 MediaStream（用于波形分析）
   */
  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  /**
   * 销毁录音器，释放麦克风资源
   */
  destroy(): void {
    this.clearMaxDurationTimer();
    this.stop();
    // 外部注入的流由注入方（AudioSourceHub）释放，此处不越权停止
    if (this.ownsStream) {
      this.mediaStream?.getTracks().forEach((track) => track.stop());
    }
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────────

  /** 结算当前录音段到累计时长，并停表 */
  private settleSegment(): void {
    if (this.segmentStart === 0) return;
    this.accumulatedMs += Date.now() - this.segmentStart;
    this.segmentStart = 0;
  }

  /** 当前净录音时长（毫秒），包含正在进行的段 */
  private elapsedMs(): number {
    const running = this.segmentStart === 0 ? 0 : Date.now() - this.segmentStart;
    return this.accumulatedMs + running;
  }

  /** 按剩余时长调度自动停止 */
  private scheduleMaxDuration(): void {
    this.clearMaxDurationTimer();
    const limitMs = this.config.maxDuration * 1000;
    if (!Number.isFinite(limitMs) || limitMs <= 0) return;

    const remaining = limitMs - this.elapsedMs();
    this.maxDurationTimer = setTimeout(
      () => {
        this.maxDurationTimer = null;
        this.events.onMaxDuration?.();
        this.stop();
      },
      Math.max(0, remaining),
    );
  }

  private clearMaxDurationTimer(): void {
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }

  private handleStop(): void {
    // 净时长：排除暂停时段，与 useSpeech 的计时口径一致
    this.settleSegment();
    const duration = this.accumulatedMs / 1000;
    const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
    const blob = new Blob(this.chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);

    const result: RecordingResult = {
      blob,
      url,
      duration,
      waveform: [], // 由外部波形分析器填充
      mimeType,
    };

    this.events.onStateChange?.('inactive');
    this.events.onStop?.(result);
  }

  /**
   * 按优先级检测浏览器支持的 MIME 类型
   * Chrome 优先 opus，iOS Safari 只支持 mp4
   */
  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav',
    ];
    return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  }
}
