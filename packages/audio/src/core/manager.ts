/**
 * ProviderManager - ASR/TTS 供应商注册与切换管理器
 * 支持运行时动态切换供应商，不需要重新挂载组件
 */
import type { SpeechConfig, ASROptions, TTSProviderOptions } from '../types';
import { AliyunASR } from './adapters/asr/aliyun';
import type { ASRAdapter } from './adapters/asr/base';
import { BrowserASR } from './adapters/asr/browser';
import { ProxyASR } from './adapters/asr/proxy';
import { AliyunTTS } from './adapters/tts/aliyun';
import type { TTSAdapter } from './adapters/tts/base';
import { BrowserTTS } from './adapters/tts/browser';
import { ProxyTTS } from './adapters/tts/proxy';

export class ProviderManager {
  private asrAdapter: ASRAdapter | null = null;
  private ttsAdapter: TTSAdapter | null = null;
  private config: SpeechConfig;

  constructor(config: SpeechConfig = {}) {
    this.config = config;
  }

  // ── ASR ────────────────────────────────────────────────────────────────────

  createASR(options?: ASROptions): ASRAdapter {
    const asrOptions = options || this.config.asr;

    if (!asrOptions) return new BrowserASR({ provider: 'browser' });

    switch (asrOptions.provider) {
      case 'browser':
        return new BrowserASR(asrOptions);

      case 'aliyun':
        // token 必须由业务层提前通过 getAliToken 写入 auth.token
        return new AliyunASR(asrOptions);

      case 'proxy':
      case 'iflytek':
      case 'tencent':
        return new ProxyASR(asrOptions);

      default:
        console.warn(`未知的 ASR provider: ${asrOptions.provider}，降级到浏览器`);
        return new BrowserASR({ ...asrOptions, provider: 'browser' });
    }
  }

  setASR(adapter: ASRAdapter): void {
    this.asrAdapter?.destroy();
    this.asrAdapter = adapter;
  }

  getASR(): ASRAdapter {
    if (!this.asrAdapter) this.asrAdapter = this.createASR();
    return this.asrAdapter;
  }

  /** 获取已存在的适配器，不触发惰性创建（清理路径专用，避免误建实例或抛配置错误） */
  peekASR(): ASRAdapter | null {
    return this.asrAdapter;
  }

  switchASR(options: ASROptions): ASRAdapter {
    const adapter = this.createASR(options);
    this.setASR(adapter);
    return adapter;
  }

  // ── TTS ────────────────────────────────────────────────────────────────────

  createTTS(options?: TTSProviderOptions): TTSAdapter {
    const ttsOptions = options || this.config.tts;

    if (!ttsOptions) return new BrowserTTS();

    switch (ttsOptions.provider) {
      case 'browser':
        return new BrowserTTS();

      case 'aliyun':
        // wsEndpoint 由消费方注入，不在库中硬编码
        return new AliyunTTS(ttsOptions);

      case 'proxy':
      case 'iflytek':
        return new ProxyTTS(ttsOptions);

      default:
        console.warn(`未知的 TTS provider: ${ttsOptions.provider}，降级到浏览器`);
        return new BrowserTTS();
    }
  }

  setTTS(adapter: TTSAdapter): void {
    this.ttsAdapter?.destroy();
    this.ttsAdapter = adapter;
  }

  getTTS(): TTSAdapter {
    if (!this.ttsAdapter) this.ttsAdapter = this.createTTS();
    return this.ttsAdapter;
  }

  switchTTS(options: TTSProviderOptions): TTSAdapter {
    const adapter = this.createTTS(options);
    this.setTTS(adapter);
    return adapter;
  }

  // ── 配置 ────────────────────────────────────────────────────────────────────

  setConfig(patch: Partial<SpeechConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  destroy(): void {
    this.asrAdapter?.destroy();
    this.ttsAdapter?.destroy();
    this.asrAdapter = null;
    this.ttsAdapter = null;
  }
}
