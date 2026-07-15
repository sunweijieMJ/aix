/**
 * ProxyASR - 后端代理 ASR 适配器
 * 支持两种代理模式：
 *   token-proxy：后端签名返回 token + wsUrl，前端直连第三方 WebSocket
 *   ws-proxy：后端全链路透传，前端连接后端 WebSocket
 */
import type { ASROptions, ASRResult } from '../../../types';
import { BaseASRAdapter } from './base';

export class ProxyASR extends BaseASRAdapter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelays = [1000, 2000, 4000, 8000, 16000];

  constructor(options: ASROptions) {
    super(options);
    if (!options.auth) {
      throw new Error('ProxyASR 需要 auth 配置');
    }
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
    this.ws?.close();
    this.ws = null;
    this.setState('idle');
  }

  start(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接');
    }
    this.ws.send(
      JSON.stringify({
        type: 'start',
        config: {
          sampleRate: this.options.sampleRate || 16000,
          language: this.options.language || 'zh-CN',
        },
      }),
    );
    this.setState('recording');
  }

  stop(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'stop' }));
      this.setState('stopped');
    }
  }

  sendAudio(audioData: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  destroy(): void {
    this.disconnect();
    this.resultCallbacks = [];
    this.errorCallbacks = [];
    this.stateCallbacks = [];
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────────

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
      const data = await response.json();
      return data.wsUrl;
    }

    throw new Error('无效的 auth 配置：需要 mode=ws-proxy 或 mode=token-proxy');
  }

  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
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
    if (this._state === 'stopped' || this._state === 'idle') return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.setState('reconnecting');
      const delay = this.reconnectDelays[this.reconnectAttempts++];
      setTimeout(() => {
        this.connect().catch((err) => this.emitError(err));
      }, delay);
    } else {
      this.setState('error');
      this.emitError(new Error('重连次数已达上限'));
    }
  }
}
