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

/**
 * 服务端"音频已发完"信号的兼容取值
 * 后端未发送任何结束信号时，PCMQueuePlayer 会退回到静默期兜底判定
 */
const END_OF_STREAM_TYPES = new Set([
  'end',
  'finish',
  'finished',
  'synthesis_complete',
  'complete',
]);

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

  /** 服务端是否已告知本次合成的音频发完 */
  private endOfStream = false;
  /** 空队列静默计时：无 end 信号的后端靠它兜底判完 */
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  /** 播放代次：stop() 后递增，用于丢弃旧 source 的残余 onended */
  private generation = 0;

  /**
   * 队列排空后等待多久判定播放结束（毫秒）
   * 服务端发送结束信号时不依赖此兜底；网络抖动导致的瞬时空队列不会被误判
   */
  private readonly drainTimeout = 1500;

  onFinished?: () => void;
  onError?: (err: Error) => void;

  connect(): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    this.endOfStream = false;
  }

  push(buffer: ArrayBuffer): void {
    this.clearDrainTimer(); // 新音频到达，撤销"可能已结束"的判定
    this.queue.push(buffer);
    if (!this.isPlaying) void this.playNext();
  }

  /** 服务端告知音频已发完：队列播完即真正结束 */
  markEndOfStream(): void {
    this.endOfStream = true;
    // 已经排空且没有在播，直接收尾
    if (!this.isPlaying && this.queue.length === 0) {
      this.clearDrainTimer();
      this.onFinished?.();
    }
  }

  /** 暂停播放（Web Audio 需挂起整个 AudioContext） */
  async suspend(): Promise<void> {
    if (this.audioContext?.state === 'running') await this.audioContext.suspend();
  }

  /** 恢复播放 */
  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
  }

  stop(): void {
    this.generation++;
    this.clearDrainTimer();
    try {
      this.currentSource?.stop();
    } catch {
      // source 已结束时 stop() 会抛异常，忽略
    }
    this.currentSource = null;
    this.isPlaying = false;
    this.endOfStream = false;
    this.queue = [];
  }

  destroy(): void {
    this.stop();
    this.audioContext?.close();
    this.audioContext = null;
  }

  private clearDrainTimer(): void {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
  }

  /**
   * 队列排空的处理：
   * 收到结束信号才立即判完；否则等待一个静默期，
   * 期间有新 chunk 到达就继续播（网络慢于播放属正常情况）
   */
  private handleQueueDrained(): void {
    this.isPlaying = false;

    if (this.endOfStream) {
      this.clearDrainTimer();
      this.onFinished?.();
      return;
    }

    this.clearDrainTimer();
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      if (this.queue.length === 0 && !this.isPlaying) this.onFinished?.();
    }, this.drainTimeout);
  }

  private async playNext(): Promise<void> {
    const generation = this.generation;

    if (this.queue.length === 0) {
      this.handleQueueDrained();
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
      // 解码期间被 stop() 打断，丢弃本批，避免停止后又响起来
      if (generation !== this.generation) return;

      const source = ctx.createBufferSource();
      this.currentSource = source;
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (generation !== this.generation) return; // stop() 后的残余回调
        this.currentSource = null;
        this.isPlaying = false;
        void this.playNext(); // 尝试播放下一批
      };
      source.start();
    } catch (err) {
      if (generation !== this.generation) return;
      this.isPlaying = false;
      this.onError?.(err instanceof Error ? err : new Error('音频解码失败'));
      void this.playNext();
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
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  private speakResolve: (() => void) | null = null;
  private speakReject: ((err: Error) => void) | null = null;

  private hasReceivedAudio = false;
  private segmentId = 1;

  /** 握手超时（毫秒）：服务端不回 connecting_success 时兜底，避免 speak() 永久挂起 */
  private readonly handshakeTimeout = 10_000;

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
    if (this._state !== 'playing') return;
    // Web Audio 无法暂停单个 source，需挂起整个 AudioContext
    void this.player.suspend();
    this.setState('paused');
  }

  resume(): void {
    if (this._state !== 'paused') return;
    void this.player.resume();
    this.setState('playing');
  }

  stop(): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.isReady) {
      this.ws.send(JSON.stringify({ type: 'stop' }));
    }
    this.player.stop();
    this.hasReceivedAudio = false;

    // 主动停止是正常结束，必须 resolve。若 reject，speak() 的 catch 会把状态
    // 打成 error 并派发一次假的 error 事件（连续 speak 时还会污染新一轮状态）
    this.settleSpeak();

    if (this._state !== 'idle') this.setState('idle');
  }

  destroy(): void {
    this.stop();
    this.clearReadyTimer();
    this.settleReady(new Error('TTS 适配器已销毁'));
    this.closeSocket();
    this.player.destroy();
    this.clearCallbacks();
  }

  // ── 内部：Promise 结算（全部走这两个入口，保证只结算一次）──────────────────────

  /** 结算 speak() 的 Promise。传 error 则 reject，否则 resolve */
  private settleSpeak(error?: Error): void {
    const resolve = this.speakResolve;
    const reject = this.speakReject;
    this.speakResolve = null;
    this.speakReject = null;
    if (error) reject?.(error);
    else resolve?.();
  }

  /** 结算握手 Promise。传 error 则 reject，否则 resolve */
  private settleReady(error?: Error): void {
    const resolve = this.readyResolve;
    const reject = this.readyReject;
    this.readyResolve = null;
    this.readyReject = null;
    this.clearReadyTimer();
    if (error) reject?.(error);
    else resolve?.();
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────────

  private ensureConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.isReady) {
      return Promise.resolve();
    }
    this.closeSocket();
    this.isReady = false;

    return new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      // 服务端不回 connecting_success 时的兜底，否则整个 speak() 永久 pending
      this.readyTimer = setTimeout(() => {
        this.settleReady(new Error('TTS 握手超时'));
      }, this.handshakeTimeout);
      this.openWebSocket();
    });
  }

  private openWebSocket(): void {
    this.ws = new WebSocket(this.config.wsEndpoint!);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onmessage = (event) => this.handleMessage(event);

    this.ws.onerror = () => {
      const err = new Error('TTS WebSocket 连接失败');
      this.settleReady(err);
      // speak() 已进入等待音频阶段时，连接错误同样要结算，否则挂死
      this.settleSpeak(err);
      this.emitError(err);
      this.setState('error');
    };

    this.ws.onclose = () => {
      this.isReady = false;
      this.settleReady(new Error('TTS 连接已关闭'));
      if (this._state === 'playing' || this._state === 'loading') {
        this.setState('idle');
        // 连接中断时把播放中的 speak() 结算掉，按正常结束处理
        this.settleSpeak();
      }
    };
  }

  /** 关闭 WebSocket 并摘掉事件处理器，防止旧连接的回调继续触发 */
  private closeSocket(): void {
    if (!this.ws) return;
    this.ws.onmessage = null;
    this.ws.onerror = null;
    this.ws.onclose = null;
    this.ws.close();
    this.ws = null;
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
          this.settleReady();
        } else if (msg.type === 'audio' && msg.data) {
          this.hasReceivedAudio = true;
          this.player.push(msg.data as unknown as ArrayBuffer);
        } else if (msg.type && END_OF_STREAM_TYPES.has(msg.type)) {
          // 服务端告知音频发完，队列播完即真正结束
          this.player.markEndOfStream();
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
        userNid: this.config.userNid ?? '', // 用户nid，开始播报时必填
        assistantNid: this.config.assistantNid ?? '', // 助手nid，开始播报时必填
        ttsVoiceType: this.config.ttsVoiceType ?? this.config.defaultVoice ?? '',
        messageId: crypto.randomUUID().replace(/-/g, ''), // 消息id
        segmentId: this.segmentId++, // 文本分段id
        message: text, // 播报文本，开始播报时必填
      }),
    );
  }

  private handlePlaybackFinished(): void {
    if (!this.hasReceivedAudio) return; // 主动 stop 后的残余回调
    this.hasReceivedAudio = false;
    this.setState('idle');
    this.settleSpeak();
  }
}
