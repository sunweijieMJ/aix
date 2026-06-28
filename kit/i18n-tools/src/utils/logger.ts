import chalk from 'chalk';

/**
 * 日志级别（数值越小越详细）
 */
export enum LogLevel {
  DEBUG,
  INFO,
  SUCCESS,
  WARN,
  ERROR,
}

/**
 * 日志记录器
 * 提供统一的日志输出格式和级别
 */
export class LoggerUtils {
  private static logLevel: LogLevel = LogLevel.INFO;

  /**
   * 记录信息日志
   * @param message - 日志消息
   */
  static info(message: string): void {
    if (LoggerUtils.logLevel <= LogLevel.INFO) {
      console.log(chalk.blue(`[INFO] ${message}`));
    }
  }

  /**
   * 记录警告日志
   * @param message - 日志消息
   */
  static warn(message: string): void {
    if (LoggerUtils.logLevel <= LogLevel.WARN) {
      console.warn(chalk.yellow(`[WARN] ${message}`));
    }
  }

  /**
   * 记录错误日志
   * @param message - 日志消息
   * @param error - 错误对象（仅取 name + message）
   *
   * Why 不直接透传整对象：OpenAI / Axios 等 SDK 抛出的 error 对象的 toString /
   * 序列化结果里可能含完整 URL（带 query token）、请求 headers（含 Authorization），
   * 调用方频繁写 `LoggerUtils.error('xxx 失败:', error)` 会扩散凭据泄露风险。
   * 这里强制只取安全字段，不输出 stack。
   */
  static error(message: string, error?: unknown): void {
    if (LoggerUtils.logLevel > LogLevel.ERROR) return;
    if (error === undefined || error === null) {
      console.error(chalk.red(`[ERROR] ${message}`));
      return;
    }
    const safe =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof error === 'string'
          ? error
          : `[non-Error: ${Object.prototype.toString.call(error)}]`;
    console.error(chalk.red(`[ERROR] ${message} ${safe}`));
  }

  /**
   * 记录成功日志
   * @param message - 日志消息
   */
  static success(message: string): void {
    if (LoggerUtils.logLevel <= LogLevel.SUCCESS) {
      console.log(chalk.green(`[SUCCESS] ${message}`));
    }
  }
}
