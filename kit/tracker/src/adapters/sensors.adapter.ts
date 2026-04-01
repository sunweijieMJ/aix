import type {
  AccountInfo,
  ITrackerAdapter,
  SensorsAdapterConfig,
  TrackerInitOptions,
} from '../types.js';

/** 神策 SDK 实例类型 */
interface SensorsSDK {
  init(config: Record<string, unknown>): void;
  track(eventName: string, properties: Record<string, unknown>): void;
  login(userId: string): void;
  registerSuperProperties(properties: Record<string, unknown>): void;
  clearSuperProperties(): void;
}

declare global {
  interface Window {
    sensors?: SensorsSDK;
  }
}

/**
 * 神策数据 SDK 适配器
 * 支持 CDN（sdkUrl）和 npm（sdk）两种加载方式
 */
export class SensorsAdapter implements ITrackerAdapter {
  readonly name = 'sensors';
  private sdk: SensorsSDK | null = null;
  private ready = false;
  private config: SensorsAdapterConfig;

  constructor(config: SensorsAdapterConfig) {
    this.config = config;
  }

  async init(_options: TrackerInitOptions): Promise<void> {
    const { sdk, sdkUrl, serverUrl, showLog, sendType, isSinglePage, heatmap } =
      this.config;

    // 1. 获取 SDK 实例：npm 传入 > CDN 加载
    if (sdk) {
      this.sdk = sdk as SensorsSDK;
    } else if (sdkUrl) {
      await this.loadScript(sdkUrl);
      if (!window.sensors) {
        throw new Error('[kit-tracker] 神策 SDK 加载后未找到 window.sensors');
      }
      this.sdk = window.sensors;
    } else {
      throw new Error(
        '[kit-tracker] SensorsAdapter 需要提供 sdk（npm 实例）或 sdkUrl（CDN 地址）',
      );
    }

    // 2. 初始化
    const initConfig: Record<string, unknown> = {
      server_url: serverUrl,
      show_log: showLog ?? false,
      send_type: sendType ?? 'beacon',
      is_single_page: isSinglePage ?? false,
    };
    if (heatmap) initConfig.heatmap = heatmap;

    this.sdk.init(initConfig);

    this.ready = true;
  }

  track(eventName: string, properties: Record<string, unknown>): void {
    this.sdk?.track(eventName, properties);
  }

  identify(account: AccountInfo): void {
    if (account.uin) {
      this.sdk?.login(account.uin);
    }
  }

  setCommonData(data: Record<string, unknown>): void {
    this.sdk?.registerSuperProperties(data);
  }

  isReady(): boolean {
    return this.ready;
  }

  destroy(): void {
    this.sdk = null;
    this.ready = false;
  }

  private loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error(`[kit-tracker] 加载脚本失败: ${url}`));
      document.head.appendChild(script);
    });
  }
}
