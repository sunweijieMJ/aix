export class Logger {
  constructor(
    private readonly enabled: boolean,
    private readonly module: string,
  ) {}

  log(message: string, ...args: unknown[]): void {
    if (!this.enabled) return;
    console.log(`[SDK:${this.module}] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    // warn 不受 debug 控制，始终输出
    console.warn(`[SDK:${this.module}] ${message}`, ...args);
  }
}
