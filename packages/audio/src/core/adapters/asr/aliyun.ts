/**
 * AliyunASR - 阿里云 NLS 实时语音识别适配器
 *
 * 协议：阿里 NLS SpeechTranscriber（流式识别）
 * 文档：https://help.aliyun.com/document_detail/84428.html
 *
 * 使用方式：
 *   const asr = new AliyunASR({
 *     provider: 'aliyun',
 *     auth: { mode: 'direct', token: '<由业务层调用 getAliToken 获取>', appKey: 'xxx' },
 *   });
 *   await asr.connect(); // 建立 WebSocket，token 在连接 URL 中
 *   asr.start();        // 发送 StartTranscription，NLS 确认后自动打开麦克风推流
 *   asr.stop();         // 发送 StopTranscription，关闭麦克风
 *
 * 注意：token 由业务层传入 auth.token，适配器本身不依赖任何业务 API
 */
import type { ASROptions, ASRResult } from '../../../types';
import { BaseASRAdapter } from './base';

/** 阿里 NLS 官方网关 */
const NLS_WS_URL = 'wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1';

/** 每个 ScriptProcessor 缓冲区大小（采样点），2048 约 128ms @16kHz */
const SCRIPT_PROCESSOR_BUFFER_SIZE = 2048;

export class AliyunASR extends BaseASRAdapter {
  private ws: WebSocket | null = null;

  private audioContext: AudioContext | null = null;
  /** @deprecated ScriptProcessorNode 已废弃，后续可升级为 AudioWorklet */
  private scriptProcessor: ScriptProcessorNode | null = null;
  private audioInput: MediaStreamAudioSourceNode | null = null;
  private mediaStream: MediaStream | null = null;

  private taskId = '';
  private transcriptionStartedResolve: (() => void) | null = null;
  private transcriptionStartedReject: ((err: Error) => void) | null = null;

  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelays = [1000, 2000, 4000, 8000, 16000];

  constructor(options: ASROptions) {
    super(options);
    if (!options.auth?.token) {
      throw new Error('AliyunASR 需要 auth.token，请在调用前通过业务层 getAliToken 获取后传入');
    }
  }

  // ── 连接 ─────────────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this.setState('connecting');
    const token = this.options.auth!.token!;

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(`${NLS_WS_URL}?token=${token}`);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setState('ready');
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };

      this.ws.onerror = () => {
        const err = new Error('阿里 NLS WebSocket 连接失败');
        this.setState('error');
        this.emitError(err);
        reject(err);
      };

      this.ws.onclose = () => {
        if (this._state !== 'stopped' && this._state !== 'idle') {
          this.handleDisconnect();
        }
      };
    });
  }

  // ── 开始识别 ─────────────────────────────────────────────────────────────────

  start(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接，请先调用 connect()');
    }

    this.taskId = crypto.randomUUID().replace(/-/g, '');
    const appkey = this.options.auth?.appKey ?? '';

    // 发送 StartTranscription，等待 NLS 返回 TranscriptionStarted 后再打开麦克风
    this.ws.send(
      JSON.stringify({
        header: {
          appkey,
          namespace: 'SpeechTranscriber',
          name: 'StartTranscription',
          task_id: this.taskId,
          message_id: crypto.randomUUID().replace(/-/g, ''),
        },
        payload: {
          format: 'pcm',
          sample_rate: this.options.sampleRate ?? 16000,
          speech_noise_threshold: 1,
          enable_intermediate_result: this.options.enableInterimResults ?? true,
          enable_punctuation_prediction: true,
          enable_inverse_text_normalization: true,
        },
      }),
    );
  }

  // ── 停止识别 ─────────────────────────────────────────────────────────────────

  stop(): void {
    this.cleanupAudio();

    if (this.ws?.readyState === WebSocket.OPEN && this.taskId) {
      const appkey = this.options.auth?.appKey ?? '';
      this.ws.send(
        JSON.stringify({
          header: {
            appkey,
            namespace: 'SpeechTranscriber',
            name: 'StopTranscription',
            task_id: this.taskId,
            message_id: crypto.randomUUID().replace(/-/g, ''),
          },
        }),
      );
    }

    this.setState('stopped');
  }

  disconnect(): void {
    this.cleanupAudio();
    this.ws?.close();
    this.ws = null;
    this.setState('idle');
  }

  destroy(): void {
    this.stop();
    this.ws?.close();
    this.ws = null;
    this.resultCallbacks = [];
    this.errorCallbacks = [];
    this.stateCallbacks = [];
  }

  // ── 内部：处理 NLS 下行消息 ──────────────────────────────────────────────────

  private handleMessage(data: string): void {
    let msg: { header?: { name?: string }; payload?: { result?: string; message?: string } };
    try {
      msg = JSON.parse(data);
    } catch {
      console.error('[AliyunASR] 解析消息失败:', data);
      return;
    }

    const name = msg?.header?.name ?? '';
    const result = msg?.payload?.result ?? '';

    switch (name) {
      case 'TranscriptionStarted':
        this.setState('recording');
        this.transcriptionStartedResolve?.();
        this.transcriptionStartedResolve = null;
        this.transcriptionStartedReject = null;
        this.startMicrophone();
        break;

      case 'TranscriptionResultChanged':
        if (result) {
          this.emitResult({
            text: result,
            isFinal: false,
            timestamp: Date.now(),
          } satisfies ASRResult);
        }
        break;

      case 'SentenceEnd':
        if (result) {
          this.emitResult({
            text: result,
            isFinal: true,
            timestamp: Date.now(),
          } satisfies ASRResult);
        }
        break;

      case 'TranscriptionCompleted':
        this.setState('stopped');
        break;

      case 'TaskFailed':
        this.transcriptionStartedReject?.(new Error(msg?.payload?.message ?? '识别任务失败'));
        this.transcriptionStartedResolve = null;
        this.transcriptionStartedReject = null;
        this.emitError(new Error(msg?.payload?.message ?? '识别任务失败'));
        this.setState('error');
        break;
    }
  }

  // ── 内部：打开麦克风推流 PCM ──────────────────────────────────────────────────

  private async startMicrophone(): Promise<void> {
    try {
      const sampleRate = this.options.sampleRate ?? 16000;
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext({ sampleRate });
      this.audioInput = this.audioContext.createMediaStreamSource(this.mediaStream);

      // ScriptProcessorNode 已废弃，但兼容性最佳，后续可升级为 AudioWorklet
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        SCRIPT_PROCESSOR_BUFFER_SIZE,
        1,
        1,
      );
      this.scriptProcessor.onaudioprocess = (event) => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        const float32 = event.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-1, Math.min(1, float32[i] ?? 0)) * 0x7fff;
        }
        this.ws.send(int16.buffer);
      };

      this.audioInput.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
    } catch (err) {
      this.emitError(err instanceof Error ? err : new Error('麦克风访问失败'));
      this.setState('error');
    }
  }

  private cleanupAudio(): void {
    this.scriptProcessor?.disconnect();
    this.audioInput?.disconnect();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.scriptProcessor = null;
    this.audioInput = null;
    this.mediaStream = null;
    this.audioContext = null;
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.setState('reconnecting');
      const delay = this.reconnectDelays[this.reconnectAttempts] ?? 1000;
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect().catch((err) => this.emitError(err));
      }, delay);
    } else {
      this.setState('error');
      this.emitError(new Error('阿里 NLS 重连次数已达上限'));
    }
  }
}
