import type { AccountInfo, ITrackerAdapter, TrackerInitOptions } from '../types.js';

/** window 上的 QDTracker 全局对象类型 */
interface QDTrackerSDK {
  init(config: Record<string, unknown>): QDTrackerInstance;
  use(plugin: unknown): void;
}

interface QDTrackerInstance {
  track(eventName: string, properties: Record<string, unknown>): void;
  setAccountInfo(account: AccountInfo): void;
  setCommonData(data: Record<string, unknown>): void;
  setAes(method: unknown): void;
}

declare global {
  interface Window {
    QDTracker: QDTrackerSDK;
    __qq_qidian_da_market_AES_method: unknown;
  }
}

/**
 * 企点 QDTracker SDK 适配器
 * 通过 CDN script 标签异步加载 SDK
 */
export class QDTrackerAdapter implements ITrackerAdapter {
  readonly name = 'qdtracker';
  private sdk: QDTrackerInstance | null = null;
  private ready = false;

  async init(options: TrackerInitOptions): Promise<void> {
    // 1. 动态加载 QDTracker.js
    await this.loadScript(options.sdkUrl);
    if (!window.QDTracker) {
      throw new Error('[kit-tracker] QDTracker SDK 加载后未找到 window.QDTracker');
    }

    // 2. 如需 AES 加密，额外加载 AES_SEC.js（需在 init 之前加载）
    if (options.qdOptions?.encrypt_mode === 'aes' && options.qdOptions.aesUrl) {
      await this.loadScript(options.qdOptions.aesUrl);
    }

    // 3. 如需点击全埋点，额外加载 autoTrack.js
    if (options.qdOptions?.heatmap && options.qdOptions.autoTrackUrl) {
      const autoTrack = await this.loadModule(options.qdOptions.autoTrackUrl);
      if (autoTrack) {
        window.QDTracker.use(autoTrack);
      }
    }

    // 4. 调用 QDTracker.init
    this.sdk = window.QDTracker.init({
      appkey: options.appkey,
      tid: options.tid ?? '',
      options: {
        url: options.url,
        encrypt_mode: options.qdOptions?.encrypt_mode ?? 'close',
        enable_compression: options.qdOptions?.enable_compression ?? false,
        track_interval: options.qdOptions?.track_interval ?? 0,
        batch_max_time: options.qdOptions?.batch_max_time ?? 1,
        preventAutoTrack: options.qdOptions?.preventAutoTrack ?? true,
        pagestay: options.qdOptions?.pagestay ?? false,
        heatmap: options.qdOptions?.heatmap,
      },
    });

    // 5. AES 加密需在 init 之后调用 setAes（仅在成功加载 AES 脚本后）
    if (options.qdOptions?.encrypt_mode === 'aes' && options.qdOptions.aesUrl) {
      this.sdk.setAes(window.__qq_qidian_da_market_AES_method);
    }

    this.ready = true;
  }

  track(eventName: string, properties: Record<string, unknown>): void {
    this.sdk?.track(eventName, properties);
  }

  identify(account: AccountInfo): void {
    this.sdk?.setAccountInfo(account);
  }

  setCommonData(data: Record<string, unknown>): void {
    this.sdk?.setCommonData(data);
  }

  isReady(): boolean {
    return this.ready;
  }

  destroy(): void {
    this.sdk = null;
    this.ready = false;
  }

  /** 动态注入 script 标签加载外部脚本 */
  private loadScript(url?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!url) return resolve();
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`[kit-tracker] 加载脚本失败: ${url}`));
      document.head.appendChild(script);
    });
  }

  /** 动态 import 模块 */
  private loadModule(url?: string): Promise<unknown> {
    if (!url) return Promise.resolve(undefined);
    return import(/* @vite-ignore */ url);
  }
}
