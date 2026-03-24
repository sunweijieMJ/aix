/**
 * 调试日志输出
 * debug: true 时在控制台输出每次上报的详细信息
 */
export class TrackerLogger {
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  /** 输出事件上报日志 */
  logTrack(eventName: string, properties: Record<string, unknown>): void {
    if (!this.enabled) return;

    try {
      console.groupCollapsed(`[Track] ${eventName}`);
      console.log('时间:', new Date().toISOString());
      console.table(properties);
      console.groupEnd();
    } catch {
      // 降级处理（部分环境不支持 groupCollapsed/table）
      console.log(`[Track] ${eventName}`, properties);
    }
  }

  /** 输出 identify 日志 */
  logIdentify(account: Record<string, unknown>): void {
    if (!this.enabled) return;
    console.log('[Tracker] identify', account);
  }

  /** 输出通用信息 */
  log(message: string, ...args: unknown[]): void {
    if (!this.enabled) return;
    console.log(`[Tracker] ${message}`, ...args);
  }

  /** 输出警告 */
  warn(message: string, ...args: unknown[]): void {
    if (!this.enabled) return;
    console.warn(`[Tracker] ${message}`, ...args);
  }
}
