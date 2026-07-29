/**
 * ProxyTTS - 后端代理 TTS 适配器
 * 调用业务后端 REST 接口合成音频，支持 JSON（返回 audioUrl）和 ArrayBuffer 两种响应
 */
import type { TTSOptions, TTSProviderOptions } from '../../../types';
import { BaseTTSAdapter } from './base';

export class ProxyTTS extends BaseTTSAdapter {
  private audio: HTMLAudioElement | null = null;
  private readonly endpoint: string;

  /** 当前播放的 ObjectURL，stop/error/正常结束三条路径都要撤销 */
  private currentObjectUrl: string | null = null;
  /** 当前 speak() 的结算入口，保证只结算一次 */
  private settleSpeak: ((error?: Error) => void) | null = null;
  /** 播放代次：stop() 或新的 speak() 都会递增，用于作废请求途中的旧任务 */
  private generation = 0;

  constructor(options: TTSProviderOptions) {
    super();
    if (!options.endpoint) {
      throw new Error('ProxyTTS 需要 endpoint 配置（后端 TTS 接口地址）');
    }
    this.endpoint = options.endpoint;
  }

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    try {
      this.stop();
      const generation = ++this.generation;
      this.setState('loading');

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: options.voice,
          rate: options.rate,
          pitch: options.pitch,
          volume: options.volume,
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS 请求失败: ${response.statusText}`);
      }

      const contentType = response.headers.get('Content-Type') ?? '';
      let audioUrl: string;

      if (contentType.includes('application/json')) {
        const data = await response.json();
        audioUrl = data.audioUrl;
      } else {
        const blob = await response.blob();
        audioUrl = URL.createObjectURL(blob);
        this.currentObjectUrl = audioUrl;
      }

      // 请求期间被 stop() 或新的 speak() 取代：不再播放，直接结束本次调用
      if (generation !== this.generation) {
        this.revokeObjectUrl();
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(audioUrl);
        this.audio = audio;

        // 统一结算入口：正常结束、播放失败、被 stop() 打断都只会走一次
        this.settleSpeak = (error?: Error) => {
          this.settleSpeak = null;
          this.revokeObjectUrl();
          if (error) reject(error);
          else resolve();
        };

        audio.oncanplay = () => this.setState('playing');
        audio.onplay = () => this.setState('playing');

        audio.onended = () => {
          this.setState('idle');
          this.settleSpeak?.();
        };

        audio.onerror = () => {
          const error = new Error('音频播放失败');
          this.setState('error');
          this.emitError(error);
          this.settleSpeak?.(error);
        };

        audio.play().catch((err) => {
          // 自动播放被浏览器拦截等场景，同样要结算，否则 await 永久挂起
          this.settleSpeak?.(err instanceof Error ? err : new Error('音频播放失败'));
        });
      });
    } catch (error) {
      this.revokeObjectUrl();
      this.setState('error');
      const err = error instanceof Error ? error : new Error('TTS 播放失败');
      this.emitError(err);
      throw err;
    }
  }

  pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
      this.setState('paused');
    }
  }

  resume(): void {
    if (this.audio && this.audio.paused) {
      this.audio.play();
      this.setState('playing');
    }
  }

  stop(): void {
    // 作废进行中的请求：合成响应回来时若代次已变，不会再播放
    this.generation++;
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
      this.setState('idle');
    }
    // pause() 不会触发 onended/onerror，必须在此主动结算，
    // 否则上一次 speak() 的 await 永远挂起、ObjectURL 也永远泄漏。
    // 主动停止属正常结束，走 resolve 而非 reject
    this.settleSpeak?.();
  }

  destroy(): void {
    this.stop();
    this.revokeObjectUrl();
    this.clearCallbacks();
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────────

  private revokeObjectUrl(): void {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }
}
