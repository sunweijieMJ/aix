/**
 * 轻量日志工具。
 *
 * 级别策略：
 * - `log`：调试信息，受 `SDKOptions.debug` 开关控制，生产默认静默。
 * - `warn`：协议违约 / 编程错误 / 安全事件 / 环境故障，**始终输出**，
 *   因为这些信号对用户排查问题是必需的。
 */
export class Logger {
  /**
   * @param enabled 是否启用调试日志（通常等于 `SDKOptions.debug`）
   * @param module  模块标识，会拼在日志前缀里（例如 `iframe:host`）
   */
  constructor(
    private readonly enabled: boolean,
    private readonly module: string,
  ) {}

  /**
   * 输出调试日志。仅在 `enabled=true` 时生效，生产默认静默。
   * @param message 日志正文
   * @param args    额外附加参数，会原样透传给 `console.log`
   */
  log(message: string, ...args: unknown[]): void {
    if (!this.enabled) return;
    console.log(`[SDK:${this.module}] ${message}`, ...args);
  }

  /**
   * 输出警告日志。**不受 debug 开关影响，始终输出**，
   * 用于提示协议违约、编程错误、安全事件或环境故障——
   * 这些信息在生产环境同样需要用户感知，不应被静默。
   * @param message 警告正文
   * @param args    额外附加参数，会原样透传给 `console.warn`
   */
  warn(message: string, ...args: unknown[]): void {
    console.warn(`[SDK:${this.module}] ${message}`, ...args);
  }
}
