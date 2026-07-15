/**
 * ProxyTTS - 后端代理 TTS 适配器
 * 调用业务后端 REST 接口合成音频，支持 JSON（返回 audioUrl）和 ArrayBuffer 两种响应
 */
import type { TTSOptions, TTSProviderOptions } from '../../../types';
import { BaseTTSAdapter } from './base';

export class ProxyTTS extends BaseTTSAdapter {
  private audio: HTMLAudioElement | null = null;
  private readonly endpoint: string;

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
      let isObjectUrl = false;

      if (contentType.includes('application/json')) {
        const data = await response.json();
        audioUrl = data.audioUrl;
      } else {
        const blob = await response.blob();
        audioUrl = URL.createObjectURL(blob);
        isObjectUrl = true;
      }

      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(audioUrl);
        this.audio = audio;

        audio.oncanplay = () => this.setState('playing');
        audio.onplay = () => this.setState('playing');

        audio.onended = () => {
          this.setState('idle');
          if (isObjectUrl) URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.onerror = () => {
          const error = new Error('音频播放失败');
          this.setState('error');
          this.emitError(error);
          reject(error);
        };

        audio.play().catch((err) => {
          reject(err instanceof Error ? err : new Error('音频播放失败'));
        });
      });
    } catch (error) {
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
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
      this.setState('idle');
    }
  }

  destroy(): void {
    this.stop();
    this.stateCallbacks = [];
    this.errorCallbacks = [];
  }
}
