/**
 * BrowserASR - 浏览器原生 Web Speech API 适配器
 * 兼容性最广（Chrome/Edge），但 Firefox/iOS Safari 不支持，作为兜底方案
 */
import type { ASROptions, ASRResult } from '../../../types';
import { BaseASRAdapter } from './base';

// Web Speech API 本地类型补充（lib.dom 未完整导出）
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onend: ((this: SpeechRecognition, ev: Event) => unknown) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export class BrowserASR extends BaseASRAdapter {
  private recognition: SpeechRecognition | null = null;
  private isSupported = false;

  constructor(options: ASROptions) {
    super(options);
    this.isSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  async connect(): Promise<void> {
    if (!this.isSupported) {
      throw new Error('浏览器不支持 Web Speech API');
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) throw new Error('SpeechRecognition API 不可用');

    this.recognition = new SpeechRecognitionAPI();
    this.recognition.continuous = true;
    this.recognition.interimResults = this.options.enableInterimResults ?? true;
    this.recognition.lang = this.options.language || 'zh-CN';
    this.recognition.maxAlternatives = 1;

    this.setupEventHandlers();
    this.setState('ready');
  }

  disconnect(): void {
    this.recognition?.stop();
    this.recognition = null;
    this.setState('idle');
  }

  start(): void {
    if (!this.recognition) throw new Error('请先调用 connect()');
    try {
      this.recognition.start();
      this.setState('recording');
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error('启动识别失败'));
    }
  }

  stop(): void {
    if (this.recognition) {
      this.recognition.stop();
      this.setState('stopped');
    }
  }

  destroy(): void {
    this.disconnect();
    this.resultCallbacks = [];
    this.errorCallbacks = [];
    this.stateCallbacks = [];
  }

  private setupEventHandlers(): void {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      this.setState('recording');
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const { results, resultIndex } = event;
      for (let i = resultIndex; i < results.length; i++) {
        const result = results[i];
        const alternative = result?.[0];
        if (!alternative) continue;
        this.emitResult({
          text: alternative.transcript,
          isFinal: result.isFinal,
          confidence: alternative.confidence,
          timestamp: Date.now(),
        } satisfies ASRResult);
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      this.setState('error');
      this.emitError(new Error(event.message || event.error || '识别错误'));
    };

    this.recognition.onend = () => {
      // continuous 模式下只有明确处于 recording 状态才自动重启，
      // stopped/error/idle 状态不重启，防止 stop() 后循环
      if (this._state === 'recording') {
        try {
          this.recognition?.start();
        } catch {
          this.setState('stopped');
        }
      }
    };
  }
}
