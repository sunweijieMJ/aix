/**
 * BrowserTTS - 浏览器原生 SpeechSynthesis API 适配器
 * 使用 Web Speech API TTS（兜底方案，无需后端）
 */
import type { TTSOptions } from '../../../types';
import { BaseTTSAdapter } from './base';

export class BrowserTTS extends BaseTTSAdapter {
  private utterance: SpeechSynthesisUtterance | null = null;
  private isSupported = false;

  constructor() {
    super();
    this.isSupported = 'speechSynthesis' in window;
  }

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (!this.isSupported) {
      throw new Error('浏览器不支持 SpeechSynthesis API');
    }

    return new Promise((resolve, reject) => {
      try {
        this.stop(); // 停止之前的播放

        this.utterance = new SpeechSynthesisUtterance(text);
        this.utterance.lang = 'zh-CN';
        this.utterance.rate = options.rate ?? 1;
        this.utterance.pitch = options.pitch ?? 1;
        this.utterance.volume = options.volume ?? 1;

        if (options.voice) {
          const voices = window.speechSynthesis.getVoices();
          const targetVoice = voices.find((v) => v.name === options.voice);
          if (targetVoice) this.utterance.voice = targetVoice;
        }

        this.utterance.onstart = () => {
          this.setState('playing');
        };

        this.utterance.onend = () => {
          this.setState('idle');
          resolve();
        };

        this.utterance.onerror = (event) => {
          // speechSynthesis.cancel() 触发的是 canceled/interrupted，属于主动终止，不报错
          if (event.error === 'canceled' || event.error === 'interrupted') {
            this.setState('idle');
            resolve();
            return;
          }
          this.setState('error');
          const error = new Error(`TTS 错误: ${event.error}`);
          this.emitError(error);
          reject(error);
        };

        this.setState('loading');
        window.speechSynthesis.speak(this.utterance);
      } catch (error) {
        this.setState('error');
        const err = error instanceof Error ? error : new Error('TTS 播放失败');
        this.emitError(err);
        reject(err);
      }
    });
  }

  pause(): void {
    if (this.isSupported && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      this.setState('paused');
    }
  }

  resume(): void {
    if (this.isSupported && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      this.setState('playing');
    }
  }

  stop(): void {
    if (this.isSupported) {
      window.speechSynthesis.cancel();
      this.setState('idle');
    }
  }

  destroy(): void {
    this.stop();
    this.stateCallbacks = [];
    this.errorCallbacks = [];
    this.utterance = null;
  }

  /**
   * 获取可用音色列表
   */
  static getVoices(): SpeechSynthesisVoice[] {
    return 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];
  }
}
