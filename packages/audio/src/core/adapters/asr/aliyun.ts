/**
 * AliyunASR - 阿里云 NLS 实时语音识别适配器
 *
 * 协议：阿里 NLS SpeechTranscriber（流式识别）
 * 文档：https://help.aliyun.com/document_detail/84428.html
 *
 * 支持两种鉴权方式：
 *   1. 直传 token —— auth: { mode: 'direct', token: '<业务层 getAliToken 获取>', appKey: 'xxx' }
 *   2. token 代理 —— auth: { mode: 'token-proxy', tokenEndpoint: '/api/asr/token' }
 *      连接前 POST tokenEndpoint，后端返回 { token, wsUrl?, appKey? }
 *
 * 使用方式：
 *   const asr = new AliyunASR({ provider: 'aliyun', auth: { ... } });
 *   await asr.connect(); // 解析鉴权并建立 WebSocket
 *   asr.start();        // 发送 StartTranscription，NLS 确认后开始推流
 *   asr.stop();         // 发送 StopTranscription，停止推流
 *
 * 音频来源：默认自行 getUserMedia；被编排层 attachAudioSource() 注入共享音源后
 * 改用注入的 PCM 帧，避免同一次录音重复占用麦克风
 */
import type { ASROptions, ASRResult } from '../../../types';
import {
  BaseASRAdapter,
  type ASRAudioSourceMode,
  type PCMAudioSource,
  type Unsubscribe,
} from './base';

/** 阿里 NLS 官方网关 */
const NLS_WS_URL = 'wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1';

/** 每个 ScriptProcessor 缓冲区大小（采样点），2048 约 128ms @16kHz */
const SCRIPT_PROCESSOR_BUFFER_SIZE = 2048;

export class AliyunASR extends BaseASRAdapter {
  /** 可自采麦克风，也接受编排层注入共享音源 */
  readonly audioSource: ASRAudioSourceMode = 'managed';

  private ws: WebSocket | null = null;

  private audioContext: AudioContext | null = null;
  /** @deprecated ScriptProcessorNode 已废弃，后续可升级为 AudioWorklet */
  private scriptProcessor: ScriptProcessorNode | null = null;
  private audioInput: MediaStreamAudioSourceNode | null = null;
  private mediaStream: MediaStream | null = null;
  /** 静音闸门，避免自采模式下麦克风被原样回放 */
  private muteGain: GainNode | null = null;

  private pcmSource: PCMAudioSource | null = null;
  private pcmUnsubscribe: Unsubscribe | null = null;

  private taskId = '';
  /** 解析后的鉴权信息，由 resolveAuth() 在 connect 时填充 */
  private resolvedAppKey = '';

  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelays = [1000, 2000, 4000, 8000, 16000];
  /**
   * 掉线前是否处于识别中，决定重连成功后要不要自动重发 StartTranscription。
   * 必须显式记录：重连途中状态会在 reconnecting/connecting/error 之间变化，
   * 靠 _state 推断会在第一次重连失败后丢失恢复意图。
   */
  private shouldResumeOnReconnect = false;
  /** 重连倒计时句柄：不持有就无法在 stop/destroy 时取消，销毁后仍会爬起来重连 */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * 是否允许自动重连：连接**成功建立过**才置位。
   * 首次 connect() 就失败属于调用方的事（如 useASR 会转而降级），
   * 适配器再自行重连只会和降级后的适配器抢资源。
   */
  private autoReconnect = false;
  /** 已销毁：拦住销毁前排队的异步重连 */
  private disposed = false;

  constructor(options: ASROptions) {
    super(options);
    const auth = options.auth;
    // token 直传与 token-proxy 二选一，两者都缺才是配置错误
    if (!auth?.token && !(auth?.mode === 'token-proxy' && auth.tokenEndpoint)) {
      throw new Error(
        'AliyunASR 需要 auth.token（直传）或 auth.mode="token-proxy" + auth.tokenEndpoint（代理换取）',
      );
    }
  }

  attachAudioSource(source: PCMAudioSource | null): void {
    this.detachPCM();
    this.pcmSource = source;
    if (source && this._state === 'recording') this.subscribePCM();
  }

  // ── 连接 ─────────────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this.setState('connecting');

    let wsUrl: string;
    try {
      wsUrl = await this.resolveWebSocketUrl();
    } catch (error) {
      this.setState('error');
      const err = error instanceof Error ? error : new Error('AliyunASR 鉴权失败');
      this.emitError(err);
      throw err;
    }

    return new Promise<void>((resolve, reject) => {
      this.closeSocket();
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        // 连接真正建立过，之后的异常掉线才值得自动重连
        this.autoReconnect = true;
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

    this.shouldResumeOnReconnect = true;
    this.taskId = crypto.randomUUID().replace(/-/g, '');
    const appkey = this.resolvedAppKey || (this.options.auth?.appKey ?? '');

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
          // 注入音源时以其实际采样率为准：AudioContext 可能不接受请求值，
          // 申报值与真实值不一致会导致识别结果错乱
          sample_rate: this.pcmSource?.sampleRate ?? this.options.sampleRate ?? 16000,
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
    this.shouldResumeOnReconnect = false;
    this.autoReconnect = false;
    this.clearReconnectTimer();
    this.cleanupAudio();

    if (this.ws?.readyState === WebSocket.OPEN && this.taskId) {
      const appkey = this.resolvedAppKey || (this.options.auth?.appKey ?? '');
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
    this.shouldResumeOnReconnect = false;
    this.autoReconnect = false;
    this.clearReconnectTimer();
    this.cleanupAudio();
    this.closeSocket();
    this.setState('idle');
  }

  destroy(): void {
    this.disposed = true;
    this.stop();
    this.closeSocket();
    this.pcmSource = null;
    this.clearCallbacks();
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
        this.startAudioFeed();
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
        this.emitError(new Error(msg?.payload?.message ?? '识别任务失败'));
        this.setState('error');
        break;
    }
  }

  // ── 内部：鉴权解析 ────────────────────────────────────────────────────────────

  /**
   * 解析最终 WebSocket URL
   * token-proxy 模式下向后端换取 token，后端可另行指定 wsUrl 与 appKey
   */
  private async resolveWebSocketUrl(): Promise<string> {
    const auth = this.options.auth;

    if (auth?.mode === 'token-proxy' && auth.tokenEndpoint) {
      const response = await fetch(auth.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: this.options.provider }),
      });
      if (!response.ok) {
        throw new Error(`获取 Token 失败: ${response.statusText}`);
      }
      const data: { token?: string; wsUrl?: string; appKey?: string } = await response.json();
      if (data.appKey) this.resolvedAppKey = data.appKey;
      if (data.wsUrl) return data.wsUrl;
      if (!data.token) throw new Error('Token 代理未返回 token 或 wsUrl');
      return `${NLS_WS_URL}?token=${data.token}`;
    }

    if (auth?.token) return `${NLS_WS_URL}?token=${auth.token}`;

    throw new Error('AliyunASR 缺少可用的鉴权配置');
  }

  // ── 内部：音频推流 ────────────────────────────────────────────────────────────

  /** 优先使用编排层注入的共享音源，没有才自己开麦克风 */
  private startAudioFeed(): void {
    if (this.pcmSource) {
      this.subscribePCM();
      return;
    }
    void this.startMicrophone();
  }

  private subscribePCM(): void {
    if (!this.pcmSource || this.pcmUnsubscribe) return;
    this.pcmUnsubscribe = this.pcmSource.onPCM((frame) => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame);
    });
  }

  private detachPCM(): void {
    this.pcmUnsubscribe?.();
    this.pcmUnsubscribe = null;
  }

  /** 手动推流入口（未注入共享音源时供外部使用） */
  sendAudio(audioData: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(audioData);
  }

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

      // 经 gain=0 的静音闸门接入 destination：ScriptProcessor 需要接到输出才持续触发，
      // 但直连 destination 会把麦克风原样回放造成啸叫
      this.muteGain = this.audioContext.createGain();
      this.muteGain.gain.value = 0;
      this.audioInput.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.muteGain);
      this.muteGain.connect(this.audioContext.destination);
    } catch (err) {
      this.emitError(err instanceof Error ? err : new Error('麦克风访问失败'));
      this.setState('error');
    }
  }

  private cleanupAudio(): void {
    this.detachPCM();
    this.scriptProcessor?.disconnect();
    this.muteGain?.disconnect();
    this.audioInput?.disconnect();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.scriptProcessor = null;
    this.muteGain = null;
    this.audioInput = null;
    this.mediaStream = null;
    this.audioContext = null;
  }

  /** 关闭 WebSocket 并摘掉事件处理器，防止重连时旧连接的回调继续触发 */
  private closeSocket(): void {
    if (!this.ws) return;
    this.ws.onopen = null;
    this.ws.onmessage = null;
    this.ws.onerror = null;
    this.ws.onclose = null;
    this.ws.close();
    this.ws = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleDisconnect(): void {
    if (this.disposed || !this.autoReconnect) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState('error');
      this.emitError(new Error('阿里 NLS 重连次数已达上限'));
      return;
    }

    // 旧任务已随连接失效，拆掉音频推流并作废 taskId
    // （shouldResumeOnReconnect 不在此清除，否则多次重连后会丢失恢复意图）
    this.cleanupAudio();
    this.taskId = '';

    this.setState('reconnecting');
    const delay = this.reconnectDelays[this.reconnectAttempts] ?? 1000;
    this.reconnectAttempts++;

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.disposed || !this.autoReconnect) return;
      this.connect()
        .then(() => {
          // 仅重连 WebSocket 而不重发 StartTranscription 会导致静默假死：
          // 连接是通的，但服务端没有识别任务，音频发过去石沉大海
          if (this.shouldResumeOnReconnect) this.start();
        })
        .catch((err) => this.emitError(err));
    }, delay);
  }
}
