import type { AccountInfo, ITrackerAdapter, TrackerInitOptions } from '../types.js';

/**
 * Console 调试适配器
 * 开发/测试环境使用，将上报内容输出到控制台
 * init() 同步完成，isReady() 立即返回 true
 */
export class ConsoleAdapter implements ITrackerAdapter {
  readonly name = 'console';
  private ready = false;

  init(_options: TrackerInitOptions): void {
    this.ready = true;
  }

  track(eventName: string, properties: Record<string, unknown>): void {
    try {
      console.groupCollapsed(
        `%c[ConsoleAdapter] ${eventName}`,
        'color: #1890ff; font-weight: bold',
      );
      console.log('时间:', new Date().toISOString());
      console.table(properties);
      console.groupEnd();
    } catch {
      console.log(`[ConsoleAdapter] ${eventName}`, properties);
    }
  }

  identify(account: AccountInfo): void {
    console.log('[ConsoleAdapter] identify', account);
  }

  setCommonData(data: Record<string, unknown>): void {
    console.log('[ConsoleAdapter] setCommonData', data);
  }

  isReady(): boolean {
    return this.ready;
  }

  destroy(): void {
    this.ready = false;
  }
}
