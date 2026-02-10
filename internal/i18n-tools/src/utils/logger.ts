import chalk from 'chalk';

/**
 * 日志级别
 */
export enum LogLevel {
  INFO,
  WARN,
  ERROR,
  SUCCESS,
  DEBUG,
}

/**
 * 日志记录器
 * 提供统一的日志输出格式和级别
 */
export class LoggerUtils {
  private static logLevel: LogLevel = LogLevel.INFO;

  /**
   * 设置日志级别
   * @param level - 日志级别
   */
  static setLogLevel(level: LogLevel): void {
    LoggerUtils.logLevel = level;
  }

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
   * @param error - 错误对象
   */
  static error(message: string, error?: any): void {
    if (LoggerUtils.logLevel <= LogLevel.ERROR) {
      console.error(chalk.red(`[ERROR] ${message}`));
      if (error) {
        console.error(error);
      }
    }
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

  /**
   * 记录调试日志
   * @param message - 日志消息
   */
  static debug(message: string): void {
    if (LoggerUtils.logLevel <= LogLevel.DEBUG) {
      console.log(chalk.gray(`[DEBUG] ${message}`));
    }
  }
}
