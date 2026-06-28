import chalk from 'chalk';

/**
 * 从任意抛出物安全提取 `{ name, message }`，不带出 stack / 整对象。
 *
 * OpenAI / Axios 等 SDK 抛出的错误对象在整体序列化时可能带出 URL token /
 * Authorization header，因此统一只保留 name + message。LoggerUtils.error（控制台）
 * 与 RunReport（落盘 FailureRecord）共用这一份策略，避免两处各写一遍导致漂移。
 */
export function extractSafeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  if (typeof error === 'string') {
    return { name: 'StringError', message: error };
  }
  return { name: 'NonError', message: Object.prototype.toString.call(error) };
}

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
    const { name, message: detail } = extractSafeError(error);
    console.error(chalk.red(`[ERROR] ${message} ${name}: ${detail}`));
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
