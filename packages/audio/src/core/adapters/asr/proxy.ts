/**
 * ProxyASR - 后端代理 ASR 适配器
 * 支持两种代理模式：
 *   token-proxy：后端签名返回 token + wsUrl，前端直连第三方 WebSocket
 *   ws-proxy：后端全链路透传，前端连接后端 WebSocket
 */
import type { ASROptions, ASRResult } from '../../../types';
import {
  BaseASRAdapter,
  type ASRAudioSourceMode,
  type PCMAudioSource,
  type Unsubscribe,
} from './base';

export class ProxyASR extends BaseASRAdapter {
  /** 自身不采集音频，必须由编排层注入音源或手动调用 sendAudio() */
  readonly audioSource: ASRAudioSourceMode = 'external';

  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelays = [1000, 2000, 4000, 8000, 16000];

  private pcmSource: PCMAudioSource | null = null;
  private pcmUnsubscribe: Unsubscribe | null = null;
  /**
   * 掉线前是否处于识别中，决定重连成功后要不要自动重发 start 帧。
   * 只重连而不重发 start，后端不会建立识别任务，音频推过去石沉大海。
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
    if (!options.auth) {
      throw new Error('ProxyASR 需要 auth 配置');
    }
  }

  attachAudioSource(source: PCMAudioSource | null): void {
    this.detachPCM();
    this.pcmSource = source;
    // 已在识别中则立即接上，否则等 start() 时再订阅
    if (source && this._state === 'recording') this.subscribePCM();
  }

  async connect(): Promise<void> {
    this.setState('connecting');
    try {
      const wsUrl = await this.resolveWebSocketUrl();
      await this.connectWebSocket(wsUrl);
      this.setState('ready');
    } catch (error) {
      this.setState('error');
      throw error instanceof Error ? error : new Error('ProxyASR 连接失败');
    }
  }

  disconnect(): void {
    this.shouldResumeOnReconnect = false;
    this.autoReconnect = false;
    this.clearReconnectTimer();
    this.detachPCM();
    this.closeSocket();
    this.setState('idle');
  }

  start(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接');
    }
    this.shouldResumeOnReconnect = true;
    this.ws.send(
      JSON.stringify({
        type: 'start',
        config: {
          sampleRate: this.pcmSource?.sampleRate ?? this.options.sampleRate ?? 16000,
          language: this.options.language || 'zh-CN',
        },
      }),
    );
    this.setState('recording');
    // 开始识别后才订阅音源，避免 start 帧之前就把音频发出去
    this.subscribePCM();
  }

  stop(): void {
    this.shouldResumeOnReconnect = false;
    this.autoReconnect = false;
    this.clearReconnectTimer();
    this.detachPCM();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'stop' }));
    }
    // 无论 ws 是否可用都要落到 stopped，否则 onclose 会误判为异常掉线而重连
    this.setState('stopped');
  }

  sendAudio(audioData: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  destroy(): void {
    this.disposed = true;
    this.disconnect();
    this.pcmSource = null;
    this.clearCallbacks();
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────────

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** 订阅共享音源，把 PCM 帧转发给后端 */
  private subscribePCM(): void {
    if (!this.pcmSource || this.pcmUnsubscribe) return;
    this.pcmUnsubscribe = this.pcmSource.onPCM((frame) => this.sendAudio(frame));
  }

  private detachPCM(): void {
    this.pcmUnsubscribe?.();
    this.pcmUnsubscribe = null;
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

  /** 根据 auth 模式解析最终 WebSocket URL */
  private async resolveWebSocketUrl(): Promise<string> {
    const { auth } = this.options;
    if (!auth) throw new Error('缺少 auth 配置');

    if (auth.mode === 'ws-proxy' && auth.wsEndpoint) {
      return auth.wsEndpoint;
    }

    if (auth.mode === 'token-proxy' && auth.tokenEndpoint) {
      const response = await fetch(auth.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: this.options.provider }),
      });
      if (!response.ok) {
        throw new Error(`获取 Token 失败: ${response.statusText}`);
      }
      const data: { wsUrl?: string } = await response.json();
      // 不校验会直接 new WebSocket(undefined)，连到一个 "undefined" 相对地址上
      if (!data.wsUrl) throw new Error('Token 代理未返回 wsUrl');
      return data.wsUrl;
    }

    throw new Error('无效的 auth 配置：需要 mode=ws-proxy 或 mode=token-proxy');
  }

  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 重连时先摘掉旧连接，否则旧 socket 与其 handler 会一直残留
      this.closeSocket();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        // 连接真正建立过，之后的异常掉线才值得自动重连
        this.autoReconnect = true;
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        this.emitError(new Error('WebSocket 错误'));
        reject(error);
      };

      this.ws.onclose = () => {
        this.handleDisconnect();
      };
    });
  }

  private handleMessage(data: string | ArrayBuffer): void {
    if (typeof data !== 'string') return;
    try {
      const message = JSON.parse(data);
      if (message.type === 'result') {
        this.emitResult({
          text: message.text,
          isFinal: message.isFinal ?? true,
          confidence: message.confidence,
          timestamp: Date.now(),
        } satisfies ASRResult);
      } else if (message.type === 'error') {
        this.emitError(new Error(message.message || '识别错误'));
      }
    } catch {
      console.error('[ProxyASR] 解析消息失败:', data);
    }
  }

  private handleDisconnect(): void {
    if (this.disposed || !this.autoReconnect) return;
    if (this._state === 'stopped' || this._state === 'idle') return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.setState('reconnecting');
      const delay = this.reconnectDelays[this.reconnectAttempts++];
      this.clearReconnectTimer();
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (this.disposed || !this.autoReconnect) return;
        this.connect()
          .then(() => {
            // 只重连而不重发 start 帧，后端不会建立识别任务 → 静默假死
            if (this.shouldResumeOnReconnect) this.start();
          })
          .catch((err) => this.emitError(err));
      }, delay);
    } else {
      this.setState('error');
      this.emitError(new Error('重连次数已达上限'));
    }
  }
}
