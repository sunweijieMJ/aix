/**
 * 日志系统 - 适配自 mcp-server 的 Logger
 *
 * 支持日志级别过滤、颜色输出、子上下文日志
 */

import chalk from 'chalk';

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * 日志配置接口
 */
interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
}

/**
 * 日志管理器
 */
export class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      ...config,
    };
  }

  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: Error | unknown, data?: unknown): void {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, {
        ...(data && typeof data === 'object' ? data : {}),
        error: error.message,
        stack: error.stack,
      });
    } else {
      this.log(LogLevel.ERROR, message, {
        ...(data && typeof data === 'object' ? data : {}),
        error,
      });
    }
  }

  child(context: string): ContextLogger {
    return new ContextLogger(this, context);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  getLevel(): LogLevel {
    return this.config.level;
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (level < this.config.level) {
      return;
    }

    if (this.config.enableConsole) {
      this.logToConsole(level, message, data);
    }
  }

  private logToConsole(level: LogLevel, message: string, data?: unknown): void {
    const prefix = this.getLevelPrefix(level);
    const coloredMessage = this.colorize(level, `${prefix} ${message}`);

    console.error(coloredMessage);

    if (data) {
      console.error(data);
    }
  }

  private getLevelPrefix(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return '[DEBUG]';
      case LogLevel.INFO:
        return '[INFO]';
      case LogLevel.WARN:
        return '[WARN]';
      case LogLevel.ERROR:
        return '[ERROR]';
    }
  }

  private colorize(level: LogLevel, message: string): string {
    switch (level) {
      case LogLevel.DEBUG:
        return chalk.gray(message);
      case LogLevel.INFO:
        return chalk.blue(message);
      case LogLevel.WARN:
        return chalk.yellow(message);
      case LogLevel.ERROR:
        return chalk.red(message);
    }
  }
}

/**
 * 上下文日志器 - 自动为消息添加上下文前缀
 */
export class ContextLogger {
  constructor(
    private parent: Logger,
    private context: string,
  ) {}

  debug(message: string, data?: unknown): void {
    this.parent.debug(`[${this.context}] ${message}`, data);
  }

  info(message: string, data?: unknown): void {
    this.parent.info(`[${this.context}] ${message}`, data);
  }

  warn(message: string, data?: unknown): void {
    this.parent.warn(`[${this.context}] ${message}`, data);
  }

  error(message: string, error?: Error | unknown, data?: unknown): void {
    this.parent.error(`[${this.context}] ${message}`, error, data);
  }
}

/**
 * 默认日志器实例
 */
export const logger = new Logger();

/**
 * 将字符串日志级别转换为 LogLevel 枚举
 */
export function parseLogLevel(level: string): LogLevel {
  const map: Record<string, LogLevel> = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
  };
  return map[level] ?? LogLevel.INFO;
}
