/**
 * AliyunTTS - 阿里云 WebSocket 流式 TTS 适配器
 *
 * 协议（连接业务方自己的 WebSocket 代理，不直连阿里云）：
 *   上行 JSON  { type: 'start', userNid, assistantNid, ttsVoiceType, messageId, segmentId, message }
 *   上行 JSON  { type: 'stop' }
 *   下行 JSON  { type: 'connecting_success' }  → 握手完成
 *   下行 BIN   ArrayBuffer                      → 音频 chunk（decodeAudioData 可解码）
 *
 * 使用方式：
 *   const tts = new AliyunTTS({
 *     provider: 'aliyun',
 *     wsEndpoint: 'wss://your-backend/tts/ws',  // 业务后端地址，不在库中硬编码
 *     userNid: 'u1',
 *     assistantNid: 'a1',
 *   });
 *   await tts.speak('你好');
 */
import type { TTSOptions, TTSProviderOptions } from '../../../types';
import { BaseTTSAdapter } from './base';

// ── PCM 队列播放器（内部类）────────────────────────────────────────────────────

/**
 * PCMQueuePlayer - 音频 chunk 队列播放器
 * 将服务端推送的 ArrayBuffer 依次合并解码、流式播放
 */
class PCMQueuePlayer {
  private audioContext: AudioContext | null = null;
  private queue: ArrayBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;

  onFinished?: () => void;
  onError?: (err: Error) => void;

  connect(): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
  }

  push(buffer: ArrayBuffer): void {
    this.queue.push(buffer);
    if (!this.isPlaying) this.playNext();
  }

  stop(): void {
    try {
      this.currentSource?.stop();
    } catch {
      // source 已结束时 stop() 会抛异常，忽略
    }
    this.currentSource = null;
    this.isPlaying = false;
    this.queue = [];
  }

  destroy(): void {
    this.stop();
    this.audioContext?.close();
    this.audioContext = null;
  }

  private async playNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.onFinished?.();
      return;
    }

    this.isPlaying = true;

    // 合并当前队列所有 chunk，减少 decodeAudioData 调用次数
    const totalBytes = this.queue.reduce((sum, b) => sum + b.byteLength, 0);
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const buf of this.queue) {
      merged.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }
    this.queue = []; // 清空，新 chunk 会继续入队

    try {
      const ctx = this.audioContext!;
      if (ctx.state === 'suspended') await ctx.resume();

      const audioBuffer = await ctx.decodeAudioData(merged.buffer);
      this.currentSource = ctx.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      this.currentSource.connect(ctx.destination);
      this.currentSource.onended = () => {
        this.currentSource = null;
        this.isPlaying = false;
        this.playNext(); // 尝试播放下一批
      };
      this.currentSource.start();
    } catch (err) {
      this.isPlaying = false;
      this.onError?.(err instanceof Error ? err : new Error('音频解码失败'));
      this.playNext();
    }
  }
}

// ── AliyunTTS 适配器 ──────────────────────────────────────────────────────────

export class AliyunTTS extends BaseTTSAdapter {
  private ws: WebSocket | null = null;
  private player = new PCMQueuePlayer();
  private config: TTSProviderOptions;

  private isReady = false;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((err: Error) => void) | null = null;

  private speakResolve: (() => void) | null = null;
  private speakReject: ((err: Error) => void) | null = null;

  private hasReceivedAudio = false;
  private segmentId = 1;

  constructor(options: TTSProviderOptions) {
    super();
    if (!options.wsEndpoint) {
      throw new Error('AliyunTTS 需要 wsEndpoint 配置（业务后端 WebSocket 地址）');
    }
    this.config = options;
    this.player.onFinished = () => this.handlePlaybackFinished();
    this.player.onError = (err) => this.emitError(err);
  }

  async speak(text: string, _options?: TTSOptions): Promise<void> {
    if (this._state === 'playing' || this._state === 'loading') {
      this.stop();
    }

    this.setState('loading');

    try {
      await this.ensureConnected();
      this.player.connect();
      this.hasReceivedAudio = false;
      this.sendStartSynthesis(text);
      this.setState('playing');

      await new Promise<void>((resolve, reject) => {
        this.speakResolve = resolve;
        this.speakReject = reject;
      });
    } catch (err) {
      this.setState('error');
      const error = err instanceof Error ? err : new Error('TTS 播放失败');
      this.emitError(error);
      throw error;
    }
  }

  pause(): void {
    // Web Audio API 暂停单个 source 需要 suspend AudioContext
    this.setState('paused');
  }

  resume(): void {
    this.setState('playing');
  }

  stop(): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.isReady) {
      this.ws.send(JSON.stringify({ type: 'stop' }));
    }
    this.player.stop();
    this.hasReceivedAudio = false;

    const reject = this.speakReject;
    this.speakResolve = null;
    this.speakReject = null;
    reject?.(new Error('播放已停止'));

    if (this._state !== 'idle') this.setState('idle');
  }

  destroy(): void {
    this.stop();
    this.ws?.close();
    this.ws = null;
    this.player.destroy();
    this.stateCallbacks = [];
    this.errorCallbacks = [];
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────────

  private ensureConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.isReady) {
      return Promise.resolve();
    }
    this.ws?.close();
    this.isReady = false;

    return new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.openWebSocket();
    });
  }

  private openWebSocket(): void {
    this.ws = new WebSocket(this.config.wsEndpoint!);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onmessage = (event) => this.handleMessage(event);

    this.ws.onerror = () => {
      const err = new Error('TTS WebSocket 连接失败');
      this.readyReject?.(err);
      this.readyResolve = null;
      this.readyReject = null;
      this.emitError(err);
      this.setState('error');
    };

    this.ws.onclose = () => {
      this.isReady = false;
      if (this._state === 'playing' || this._state === 'loading') {
        this.setState('idle');
      }
    };
  }

  private handleMessage(event: MessageEvent): void {
    if (event.data instanceof ArrayBuffer) {
      this.hasReceivedAudio = true;
      this.player.push(event.data);
    } else {
      try {
        const msg = JSON.parse(event.data as string) as { type?: string; data?: ArrayBuffer };
        if (msg.type === 'connecting_success') {
          this.isReady = true;
          this.readyResolve?.();
          this.readyResolve = null;
          this.readyReject = null;
        } else if (msg.type === 'audio' && msg.data) {
          this.hasReceivedAudio = true;
          this.player.push(msg.data as unknown as ArrayBuffer);
        }
      } catch {
        console.error('[AliyunTTS] 解析消息失败:', event.data);
      }
    }
  }

  private sendStartSynthesis(text: string): void {
    this.ws!.send(
      JSON.stringify({
        type: 'start',
        userNid: this.config.userNid ?? '',
        assistantNid: this.config.assistantNid ?? '',
        ttsVoiceType: this.config.ttsVoiceType ?? this.config.defaultVoice ?? '',
        messageId: crypto.randomUUID().replace(/-/g, ''),
        segmentId: this.segmentId++,
        message: text,
      }),
    );
  }

  private handlePlaybackFinished(): void {
    if (!this.hasReceivedAudio) return; // 主动 stop 后的残余回调
    this.hasReceivedAudio = false;
    this.setState('idle');
    const resolve = this.speakResolve;
    this.speakResolve = null;
    this.speakReject = null;
    resolve?.();
  }
}
