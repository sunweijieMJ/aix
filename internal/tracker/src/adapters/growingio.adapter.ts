import type {
  AccountInfo,
  GrowingIOAdapterConfig,
  ITrackerAdapter,
  TrackerInitOptions,
} from '../types.js';

/** GrowingIO gdp 函数类型 */
type GdpFunction = (method: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    gdp?: GdpFunction;
  }
}

/**
 * GrowingIO SDK 适配器
 * 支持 CDN（sdkUrl）和 npm（sdk）两种加载方式
 */
export class GrowingIOAdapter implements ITrackerAdapter {
  readonly name = 'growingio';
  private gdp: GdpFunction | null = null;
  private ready = false;
  private config: GrowingIOAdapterConfig;

  constructor(config: GrowingIOAdapterConfig) {
    this.config = config;
  }

  async init(_options: TrackerInitOptions): Promise<void> {
    const { sdk, sdkUrl, accountId, dataSourceId, host, version } = this.config;

    // 1. 获取 SDK：npm 传入 > CDN 加载
    if (sdk) {
      this.gdp = sdk as GdpFunction;
    } else if (sdkUrl) {
      await this.loadScript(sdkUrl);
      if (!window.gdp) {
        throw new Error('[kit-tracker] GrowingIO SDK 加载后未找到 window.gdp');
      }
      this.gdp = window.gdp;
    } else {
      throw new Error(
        '[kit-tracker] GrowingIOAdapter 需要提供 sdk（npm 实例）或 sdkUrl（CDN 地址）',
      );
    }

    // 2. 初始化
    const initOptions: Record<string, unknown> = { host };
    if (version) initOptions.version = version;

    this.gdp('init', accountId, dataSourceId, initOptions);
    this.ready = true;
  }

  track(eventName: string, properties: Record<string, unknown>): void {
    this.gdp?.('track', eventName, properties);
  }

  identify(account: AccountInfo): void {
    if (account.uin) {
      this.gdp?.('setUserId', account.uin);
    }
  }

  setCommonData(data: Record<string, unknown>): void {
    this.gdp?.('setGeneralProps', data);
  }

  isReady(): boolean {
    return this.ready;
  }

  destroy(): void {
    this.gdp = null;
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
