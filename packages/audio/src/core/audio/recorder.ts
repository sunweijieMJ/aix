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
}

const DEFAULT_CONFIG: Required<RecorderConfig> = {
  sampleRate: 16000,
  channels: 1,
  maxDuration: 60,
  mimeType: '', // 自动检测
};

export class Recorder {
  private config: Required<RecorderConfig>;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;
  private events: RecorderEvents = {};

  constructor(config: RecorderConfig = {}, events: RecorderEvents = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = events;
  }

  /**
   * 请求麦克风权限并初始化
   */
  async init(): Promise<void> {
    try {
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
      this.startTime = Date.now();

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
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  /**
   * 暂停录音
   */
  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }

  /**
   * 恢复录音
   */
  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
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
    this.stop();
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────────

  private handleStop(): void {
    const duration = (Date.now() - this.startTime) / 1000;
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
